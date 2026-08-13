use serde::Serialize;
use std::io::{self, BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct HostState { process: Mutex<Option<HostProcess>> }

struct HostProcess { child: Child, stdin: ChildStdin, job: Option<crate::supervisor::JobObject> }

#[derive(Clone, Debug, Serialize)]
struct HostEvent { raw: String }

const MAX_RUNTIME_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_RUNTIME_FRAME_BYTES: usize = MAX_RUNTIME_MESSAGE_BYTES + 32;

fn parse_response_frame(raw: &[u8]) -> Result<serde_json::Value, &'static str> {
    let separator = raw.iter().position(|byte| *byte == b':').ok_or("runtime_frame_invalid_prefix")?;
    let (declared, payload) = raw.split_at(separator);
    if declared.is_empty() || !declared.iter().all(u8::is_ascii_digit) { return Err("runtime_frame_invalid_prefix"); }
    let expected = std::str::from_utf8(declared).ok().and_then(|value| value.parse::<usize>().ok()).ok_or("runtime_frame_invalid_prefix")?;
    if expected > MAX_RUNTIME_MESSAGE_BYTES { return Err("runtime_message_too_large"); }
    let payload = &payload[1..];
    if payload.len() != expected { return Err("runtime_frame_length_mismatch"); }
    let payload = std::str::from_utf8(payload).map_err(|_| "runtime_frame_invalid_utf8")?;
    let value = serde_json::from_str::<serde_json::Value>(payload).map_err(|_| "runtime_frame_invalid_json")?;
    if value.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || value.get("requestId").and_then(serde_json::Value::as_str).is_none()
        || value.get("ok").and_then(serde_json::Value::as_bool).is_none() {
        return Err("runtime_frame_invalid_response");
    }
    Ok(value)
}

fn discard_until_newline(reader: &mut impl BufRead) -> io::Result<()> {
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() { return Ok(()); }
        if let Some(index) = available.iter().position(|byte| *byte == b'\n') {
            reader.consume(index + 1);
            return Ok(());
        }
        let length = available.len();
        reader.consume(length);
    }
}

fn read_bounded_line(reader: &mut impl BufRead) -> io::Result<Option<Vec<u8>>> {
    let mut line = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() { return if line.is_empty() { Ok(None) } else { Ok(Some(line)) }; }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let length = newline.map(|index| index + 1).unwrap_or(available.len());
        if line.len().saturating_add(length) > MAX_RUNTIME_FRAME_BYTES {
            reader.consume(length);
            if newline.is_none() { discard_until_newline(reader)?; }
            return Err(io::Error::new(io::ErrorKind::InvalidData, "runtime_frame_too_large"));
        }
        line.extend_from_slice(&available[..length]);
        reader.consume(length);
        if newline.is_some() {
            if line.last() == Some(&b'\n') { line.pop(); }
            if line.last() == Some(&b'\r') { line.pop(); }
            return Ok(Some(line));
        }
    }
}

fn host_script(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = configured_runtime_path(app, "hostPath").filter(|path| path.is_file()) { return Ok(path); }
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let packaged = resource.join("dist-runtime").join("host.mjs");
    if packaged.is_file() { return std::fs::canonicalize(packaged).map_err(|error| error.to_string()); }
    let up_packaged = resource.join("_up_").join("dist-runtime").join("host.mjs");
    if up_packaged.is_file() { return std::fs::canonicalize(up_packaged).map_err(|error| error.to_string()); }
    let flattened = resource.join("host.mjs");
    if flattened.is_file() { return std::fs::canonicalize(flattened).map_err(|error| error.to_string()); }
    let development = std::env::current_dir().map_err(|error| error.to_string())?.join("apps").join("desktop").join("dist-runtime").join("host.mjs");
    if development.is_file() { return std::fs::canonicalize(development).map_err(|error| error.to_string()); }
    Err(format!("workflow_host_bundle_missing: {}", packaged.display()))
}

fn node_executable(app: &AppHandle) -> Result<String, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    if let Some(path) = configured_runtime_path(app, "nodePath").filter(|path| path.is_file() && executable_works(path, &["--version"])) { return Ok(path.to_string_lossy().into_owned()); }
    let candidates = [
        data.join("runtime").join("node").join("node.exe"),
        resource.join("dist-runtime").join("runtime").join("node").join("node.exe"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("node").join("node.exe"),
        resource.join("runtime").join("node").join("node.exe"),
        resource.join("node.exe"),
    ];
    Ok(candidates.into_iter().find(|path| path.is_file() && executable_works(path, &["--version"])).and_then(|path| std::fs::canonicalize(path).ok()).or_else(|| system_executable("node")).map(|path| path.to_string_lossy().into_owned()).unwrap_or_else(|| "node".to_string()))
}

fn opencode_executable(app: &AppHandle) -> Result<Option<String>, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let configured = configured_runtime_path(app, "opencodePath");
    if let Some(path) = configured.filter(|path| path.is_file() && executable_works(path, &["--version"])) { return Ok(Some(path.to_string_lossy().into_owned())); }
    let candidates = [
        data.join("runtime").join("opencode").join("opencode.exe"),
        resource.join("dist-runtime").join("runtime").join("opencode").join("opencode.exe"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("opencode").join("opencode.exe"),
        resource.join("runtime").join("opencode").join("opencode.exe"),
    ];
    Ok(candidates.into_iter().find(|path| path.is_file() && executable_works(path, &["--version"])).and_then(|path| std::fs::canonicalize(path).ok()).or_else(|| system_executable("opencode")).map(|path| path.to_string_lossy().into_owned()))
}

fn system_executable(command: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(command).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).filter(|path| path.is_file()).find_map(|path| std::fs::canonicalize(path).ok())
}

fn executable_works(path: &std::path::Path, args: &[&str]) -> bool {
    Command::new(path).args(args).output().map(|output| output.status.success()).unwrap_or(false)
}

fn configured_runtime_path(app: &AppHandle, key: &str) -> Option<PathBuf> {
    let data = crate::data_dir(app).ok()?;
    let value = crate::config::read(&data.join("config.json"), &data).ok()?;
    let path = value.get("runtime")?.get(key)?.as_str().map(PathBuf::from)?;
    std::fs::canonicalize(path).ok()
}

fn python_executable(app: &AppHandle) -> Result<Option<String>, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let configured = configured_runtime_path(app, "pythonPath")
        .filter(|path| path.is_file() && python_capable(path));
    if let Some(path) = configured { return Ok(Some(path.to_string_lossy().into_owned())); }
    let candidates = [
        data.join("runtime").join("python").join("python.exe"),
        resource.join("dist-runtime").join("runtime").join("python").join("python.exe"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("python").join("python.exe"),
    ];
    if let Some(path) = candidates.into_iter().find(|path| path.is_file() && python_capable(path)).and_then(|path| std::fs::canonicalize(path).ok()) { return Ok(Some(path.to_string_lossy().into_owned())); }
    let system = system_executable("python").filter(|path| python_capable(path));
    Ok(system.map(|path| path.to_string_lossy().into_owned()))
}

fn python_capable(path: &std::path::Path) -> bool {
    Command::new(path).args(["-c", crate::PPT_PYTHON_PROBE]).output().map(|output| output.status.success()).unwrap_or(false)
}

fn lancedb_runtime_directory(app: &AppHandle) -> Result<Option<String>, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    if let Some(path) = configured_runtime_path(app, "lancedbPath").filter(|path| path.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").is_file()) { return Ok(Some(path.to_string_lossy().into_owned())); }
    let candidates = [
        data.join("runtime").join("lancedb"),
        resource.join("dist-runtime").join("runtime").join("lancedb"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("lancedb"),
    ];
    Ok(candidates.into_iter().find(|path| path.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").is_file()).and_then(|path| std::fs::canonicalize(path).ok()).map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn host_start(app: AppHandle, state: State<'_, HostState>) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|_| "host_state_poisoned".to_string())?;
    if let Some(process) = guard.as_mut() {
        if process.child.try_wait().map_err(|error| error.to_string())?.is_none() { return Ok(()); }
        *guard = None;
    }
    let script = host_script(&app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let skills = configured_runtime_path(&app, "skillsPath").filter(|path| path.is_dir()).or_else(|| [resource.join("dist-runtime").join("skills"), resource.join("_up_").join("dist-runtime").join("skills"), resource.join("skills")].into_iter().find(|path| path.exists()));
    let python = python_executable(&app)?;
    let mut child = Command::new(node_executable(&app)?)
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(if cfg!(windows) { 0x08000000 } else { 0 })
        .envs(skills.as_ref().map(|path| [("AIMARKETING_SKILLS_DIR", path.to_string_lossy().to_string())]).into_iter().flatten())
        .envs(opencode_executable(&app)?.map(|path| [("AIMARKETING_OPENCODE_PATH", path)]).into_iter().flatten())
        .envs(python.map(|path| [("AIMARKETING_PYTHON_PATH", path)]).into_iter().flatten())
        .envs(lancedb_runtime_directory(&app)?.map(|path| [("AIMARKETING_LANCEDB_DIR", path)]).into_iter().flatten())
        .spawn()
        .map_err(|error| format!("workflow_host_spawn_failed: {error}"))?;
    let stdout = child.stdout.take().ok_or_else(|| "workflow_host_stdout_missing".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "workflow_host_stderr_missing".to_string())?;
    let stdin = child.stdin.take().ok_or_else(|| "workflow_host_stdin_missing".to_string())?;
    let event_app = app.clone();
    let log_root = crate::data_dir(&app).map_err(|error| error.to_string())?;
    let stderr_log_root = log_root.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let line = match read_bounded_line(&mut reader) {
                Ok(Some(line)) => line,
                Ok(None) => break,
                Err(error) => {
                    let raw = serde_json::json!({ "type": "workflow_host_protocol_error", "code": error.to_string() }).to_string();
                    crate::logs::append(&log_root, "host", &raw);
                    let _ = event_app.emit("desktop://runtime-log", HostEvent { raw });
                    if error.kind() != io::ErrorKind::InvalidData { break; }
                    continue;
                }
            };
            let value = match parse_response_frame(&line) {
                Ok(value) => value,
                Err(code) => {
                    let raw = serde_json::json!({ "type": "workflow_host_protocol_error", "code": code }).to_string();
                    crate::logs::append(&log_root, "host", &raw);
                    let _ = event_app.emit("desktop://runtime-log", HostEvent { raw });
                    continue;
                }
            };
            let run_id = value.get("data").and_then(|data| data.get("event")).and_then(|event| event.get("runId")).and_then(serde_json::Value::as_str).unwrap_or("host");
            let raw = String::from_utf8(line).expect("validated UTF-8 RPC frame");
            crate::logs::append(&log_root, run_id, &raw);
            let _ = event_app.emit("desktop://runtime-response", HostEvent { raw });
        }
    });
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            crate::logs::append(&stderr_log_root, "stderr", &line);
            let _ = app.emit("desktop://runtime-log", HostEvent { raw: line });
        }
        let _ = app.emit("desktop://runtime-log", HostEvent { raw: "{\"type\":\"workflow_host_exit\"}".to_string() });
    });
    let job = match crate::supervisor::JobObject::new() {
        Ok(job) => {
            if let Err(error) = job.assign(&child) {
                let mut child = child;
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("workflow_host_job_assign_failed: {error}"));
            }
            Some(job)
        }
        Err(error) => {
            let mut child = child;
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("workflow_host_job_create_failed: {error}"));
        }
    };
    *guard = Some(HostProcess { child, stdin, job });
    Ok(())
}

#[tauri::command]
pub fn host_send(state: State<'_, HostState>, message: serde_json::Value) -> Result<(), String> {
    let body = serde_json::to_string(&message).map_err(|error| error.to_string())?;
    let bytes = body.as_bytes().len();
    if bytes > MAX_RUNTIME_MESSAGE_BYTES { return Err("runtime_message_too_large".to_string()); }
    let mut guard = state.process.lock().map_err(|_| "host_state_poisoned".to_string())?;
    let process = guard.as_mut().ok_or_else(|| "workflow_host_not_running".to_string())?;
    if let Err(error) = write!(process.stdin, "{bytes}:{body}\n").and_then(|_| process.stdin.flush()) {
        let _ = process.child.kill(); *guard = None; return Err(format!("workflow_host_write_failed: {error}"));
    }
    Ok(())
}

#[tauri::command]
pub fn host_stop(state: State<'_, HostState>) -> Result<(), String> {
    stop_state(state.inner())
}

pub fn stop_state(state: &HostState) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|_| "host_state_poisoned".to_string())?;
    if let Some(mut process) = guard.take() { if let Some(job) = process.job.as_ref() { let _ = job.terminate(); } let _ = process.child.kill(); let _ = process.child.wait(); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stdout_frames_require_a_bounded_utf8_json_payload() {
        let payload = br#"{"version":1,"requestId":"request","ok":true}"#;
        let valid = format!("{}:{}", payload.len(), std::str::from_utf8(payload).unwrap());
        assert_eq!(parse_response_frame(valid.as_bytes()).unwrap()["requestId"], "request");
        assert_eq!(parse_response_frame(br#"42:{"version":1}"#).unwrap_err(), "runtime_frame_length_mismatch");
        assert_eq!(parse_response_frame(b"not-a-frame").unwrap_err(), "runtime_frame_invalid_prefix");
        assert_eq!(parse_response_frame(br#"2:{]"#).unwrap_err(), "runtime_frame_invalid_json");
        assert_eq!(parse_response_frame(br#"2:{}"#).unwrap_err(), "runtime_frame_invalid_response");
        assert_eq!(parse_response_frame(b"8388609:{}").unwrap_err(), "runtime_message_too_large");
    }

    #[test]
    fn stdout_reader_discards_an_oversized_line_before_parsing_the_next_frame() {
        let mut source = vec![b'x'; MAX_RUNTIME_FRAME_BYTES + 1];
        source.push(b'\n');
        source.extend_from_slice(b"2:[]\n");
        let mut reader = BufReader::new(std::io::Cursor::new(source));

        let error = read_bounded_line(&mut reader).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert_eq!(read_bounded_line(&mut reader).unwrap().unwrap(), b"2:[]");
    }
}
