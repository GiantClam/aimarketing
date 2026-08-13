use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
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

fn host_script(app: &AppHandle) -> Result<PathBuf, String> {
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let packaged = resource.join("dist-runtime").join("host.mjs");
    if packaged.exists() { return Ok(packaged); }
    let up_packaged = resource.join("_up_").join("dist-runtime").join("host.mjs");
    if up_packaged.exists() { return Ok(up_packaged); }
    let flattened = resource.join("host.mjs");
    if flattened.exists() { return Ok(flattened); }
    let development = std::env::current_dir().map_err(|error| error.to_string())?.join("apps").join("desktop").join("dist-runtime").join("host.mjs");
    if development.exists() { return Ok(development); }
    Err(format!("workflow_host_bundle_missing: {}", packaged.display()))
}

fn node_executable(app: &AppHandle) -> Result<String, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let candidates = [
        data.join("runtime").join("node").join("node.exe"),
        resource.join("dist-runtime").join("runtime").join("node").join("node.exe"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("node").join("node.exe"),
        resource.join("runtime").join("node").join("node.exe"),
        resource.join("node.exe"),
    ];
    Ok(candidates.into_iter().find(|path| path.exists()).or_else(|| system_executable("node")).map(|path| path.to_string_lossy().into_owned()).unwrap_or_else(|| "node".to_string()))
}

fn opencode_executable(app: &AppHandle) -> Result<Option<String>, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let configured = crate::config::read(&data.join("config.json"), &data).ok()
        .and_then(|value| value.get("runtime").and_then(|runtime| runtime.get("opencodePath")).and_then(|path| path.as_str()).map(PathBuf::from))
        .filter(|path| path.is_file());
    if let Some(path) = configured { return Ok(Some(path.to_string_lossy().into_owned())); }
    let candidates = [
        data.join("runtime").join("opencode").join("opencode.exe"),
        resource.join("dist-runtime").join("runtime").join("opencode").join("opencode.exe"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("opencode").join("opencode.exe"),
        resource.join("runtime").join("opencode").join("opencode.exe"),
    ];
    Ok(candidates.into_iter().find(|path| path.exists()).or_else(|| system_executable("opencode")).map(|path| path.to_string_lossy().into_owned()))
}

fn system_executable(command: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(command).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).find(|path| path.exists())
}

fn python_executable(app: &AppHandle) -> Result<Option<String>, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let configured = crate::config::read(&data.join("config.json"), &data).ok()
        .and_then(|value| value.get("runtime").and_then(|runtime| runtime.get("pythonPath")).and_then(|path| path.as_str()).map(PathBuf::from))
        .filter(|path| path.is_file() && python_capable(path));
    if let Some(path) = configured { return Ok(Some(path.to_string_lossy().into_owned())); }
    let candidates = [
        data.join("runtime").join("python").join("python.exe"),
        resource.join("dist-runtime").join("runtime").join("python").join("python.exe"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("python").join("python.exe"),
    ];
    if let Some(path) = candidates.into_iter().find(|path| path.exists() && python_capable(path)) { return Ok(Some(path.to_string_lossy().into_owned())); }
    let system = system_executable("python").filter(|path| python_capable(path));
    Ok(system.map(|path| path.to_string_lossy().into_owned()))
}

fn python_capable(path: &std::path::Path) -> bool {
    Command::new(path).args(["-c", "import pptx, xlsxwriter, skia_pathops, uharfbuzz, fitz, mammoth, markdownify, ebooklib, nbconvert, openpyxl, PIL, numpy, requests, bs4, curl_cffi, edge_tts, flask, google.genai"]).output().map(|output| output.status.success()).unwrap_or(false)
}

fn lancedb_runtime_directory(app: &AppHandle) -> Result<Option<String>, String> {
    let data = crate::data_dir(app)?;
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let candidates = [
        data.join("runtime").join("lancedb"),
        resource.join("dist-runtime").join("runtime").join("lancedb"),
        resource.join("_up_").join("dist-runtime").join("runtime").join("lancedb"),
    ];
    Ok(candidates.into_iter().find(|path| path.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").exists()).map(|path| path.to_string_lossy().into_owned()))
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
    let skills = [resource.join("dist-runtime").join("skills"), resource.join("_up_").join("dist-runtime").join("skills"), resource.join("skills")].into_iter().find(|path| path.exists());
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
        for line in BufReader::new(stdout).lines().flatten() {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(line.split_once(':').map(|(_, body)| body).unwrap_or(&line)) {
                let run_id = value.get("data").and_then(|data| data.get("event")).and_then(|event| event.get("runId")).and_then(serde_json::Value::as_str).unwrap_or("host");
                crate::logs::append(&log_root, run_id, &line);
            }
            let _ = event_app.emit("desktop://runtime-response", HostEvent { raw: line });
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
    if bytes > 8 * 1024 * 1024 { return Err("runtime_message_too_large".to_string()); }
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
