use serde::Serialize;
use serde::Deserialize;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;
use std::fs;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod storage;
mod supervisor;
mod host;
mod config;
mod artifacts;
mod logs;
mod bootstrap;
mod instance_lock;

pub(crate) const PPT_PYTHON_PROBE: &str = r#"
import os, tempfile, zipfile
import pptx, xlsxwriter, skia_pathops, uharfbuzz, fitz, mammoth, markdownify, ebooklib, nbconvert, openpyxl, PIL, numpy, requests, bs4, curl_cffi, edge_tts, flask, google.genai
from pptx import Presentation
from pptx.util import Inches
presentation = Presentation()
presentation.slide_width = Inches(13.333333)
presentation.slide_height = Inches(7.5)
slide = presentation.slides.add_slide(presentation.slide_layouts[6])
shape = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(10), Inches(1.2))
run = shape.text_frame.paragraphs[0].add_run()
run.text = "AIMarketing 中文 PPT probe"
run.font.name = "Microsoft YaHei"
descriptor, output = tempfile.mkstemp(suffix=".pptx")
os.close(descriptor)
try:
    presentation.save(output)
    assert os.path.getsize(output) > 0
    with zipfile.ZipFile(output) as package:
        assert "ppt/slides/slide1.xml" in package.namelist()
finally:
    if os.path.exists(output): os.remove(output)
"#;

/// Resolve Windows command shims to the executable they dispatch before a
/// path is persisted or passed to a child process. `where.exe` commonly
/// returns both `opencode` and `opencode.cmd`; neither shim is safe to pass
/// directly to `CreateProcess`.
pub(crate) fn resolve_windows_command_shim(path: PathBuf) -> Vec<PathBuf> {
    let extension = path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase());
    if matches!(extension.as_deref(), Some("exe")) { return vec![path]; }
    let mut candidates = Vec::new();
    if let Some(parent) = path.parent() {
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            candidates.push(parent.join(format!("{stem}.exe")));
            if stem.eq_ignore_ascii_case("opencode") {
                candidates.push(parent.join("node_modules").join("opencode-ai").join("bin").join("opencode.exe"));
            }
        }
    }
    candidates.push(path.clone());
    candidates.sort_by_key(|candidate| if candidate.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("exe")) { 0 } else { 1 });
    candidates.dedup();
    candidates
}

#[derive(Debug, Serialize)]
pub struct Health {
    pub status: &'static str,
    pub version: &'static str,
}

#[tauri::command]
fn health() -> Health {
    Health { status: "ok", version: env!("CARGO_PKG_VERSION") }
}

#[tauri::command]
fn runtime_probe(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let data = data_dir(&app)?;
    let database = data.join("app.db");
    let migrations = storage::initialize(&database).is_ok() && storage::migrations_ready(&database).unwrap_or(false);
    let configured_node = configured_runtime_executable(&data, "nodePath");
    let private_node = data.join("runtime").join("node").join("node.exe");
    let configured_opencode = configured_runtime_executable(&data, "opencodePath");
    let private_opencode = data.join("runtime").join("opencode").join("opencode.exe");
    let node_path = configured_node.filter(|path| executable_works(path, &["--version"])).or_else(|| if private_node.exists() && executable_works(&private_node, &["--version"]) { Some(private_node) } else { system_executable("node").filter(|path| executable_works(path, &["--version"])) }).and_then(canonical_path);
    let opencode_path = configured_opencode.filter(|path| executable_works(path, &["--version"])).or_else(|| if private_opencode.exists() && executable_works(&private_opencode, &["--version"]) { Some(private_opencode) } else { system_executable("opencode").filter(|path| executable_works(path, &["--version"])) }).and_then(canonical_path);
    let node = node_path.is_some();
    let opencode = opencode_path.is_some();
    let configured_python = configured_runtime_executable(&data, "pythonPath");
    let private_python = data.join("runtime").join("python").join("python.exe");
    let resource_python = resource.join("dist-runtime").join("runtime").join("python").join("python.exe");
    let python_path = configured_python.filter(|path| python_capable(path)).or_else(|| [private_python, resource_python].into_iter().find(|path| python_capable(path))).or_else(system_python).and_then(canonical_path);
    let python = python_path.is_some();
    let development = std::env::current_dir().unwrap_or_default().join("apps").join("desktop").join("dist-runtime");
    let configured_host = configured_runtime_path(&data, "hostPath");
    let host_path = configured_host.filter(|path| path.is_file()).or_else(|| [resource.join("dist-runtime").join("host.mjs"), resource.join("_up_").join("dist-runtime").join("host.mjs"), development.join("host.mjs")].into_iter().find(|path| path.is_file())).and_then(canonical_path);
    let host = host_path.is_some();
    let configured_knowledge = configured_runtime_path(&data, "knowledgePath");
    let knowledge_path = configured_knowledge.filter(|path| path.is_file()).or_else(|| [resource.join("dist-runtime").join("knowledge.mjs"), resource.join("_up_").join("dist-runtime").join("knowledge.mjs"), development.join("knowledge.mjs")].into_iter().find(|path| path.is_file())).and_then(canonical_path);
    let knowledge = knowledge_path.is_some();
    let skill_roots = [resource.join("dist-runtime").join("skills"), resource.join("_up_").join("dist-runtime").join("skills"), development.join("skills")];
    let configured_skills = configured_runtime_path(&data, "skillsPath");
    let skill_path = configured_skills.filter(|path| path.join("ppt-master").join("SKILL.md").exists() && path.join("ppt-master.manifest.json").exists()).or_else(|| skill_roots.iter().find(|path| path.join("ppt-master").join("SKILL.md").exists() && path.join("ppt-master.manifest.json").exists()).cloned()).and_then(canonical_path);
    let skills = skill_path.is_some();
    let configured_fonts = configured_runtime_path(&data, "fontsPath");
    let fonts_path = configured_fonts.filter(|path| path.join("msyh.ttc").is_file()).or_else(|| [resource.join("dist-runtime").join("runtime").join("fonts"), resource.join("_up_").join("dist-runtime").join("runtime").join("fonts"), development.join("runtime").join("fonts")].into_iter().find(|path| path.join("msyh.ttc").is_file())).and_then(canonical_path);
    let fonts = fonts_path.is_some();
    let configured_lancedb = configured_runtime_path(&data, "lancedbPath");
    let lancedb_candidates = [data.join("runtime").join("lancedb"), resource.join("dist-runtime").join("runtime").join("lancedb")];
    let lancedb_path = configured_lancedb.filter(|path| path.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").exists()).or_else(|| lancedb_candidates.into_iter().find(|path| path.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").exists())).and_then(canonical_path);
    let lancedb = lancedb_path.is_some();
    let configured_embedding = configured_runtime_path(&data, "embeddingPath");
    let embedding_path = configured_embedding.filter(|path| path.is_file()).or_else(|| [resource.join("dist-runtime").join("runtime").join("embedding").join("local-hash-384-v1.json"), resource.join("_up_").join("dist-runtime").join("runtime").join("embedding").join("local-hash-384-v1.json"), data.join("runtime").join("embedding").join("local-hash-384-v1.json")].into_iter().find(|path| path.is_file())).and_then(canonical_path);
    let embedding = embedding_path.is_some();
    persist_runtime_paths(&data, &[
        ("nodePath", node_path.as_ref()), ("opencodePath", opencode_path.as_ref()), ("pythonPath", python_path.as_ref()),
        ("hostPath", host_path.as_ref()), ("knowledgePath", knowledge_path.as_ref()), ("skillsPath", skill_path.as_ref()), ("fontsPath", fonts_path.as_ref()),
        ("lancedbPath", lancedb_path.as_ref()), ("embeddingPath", embedding_path.as_ref()),
    ])?;
    Ok(serde_json::json!({ "ready": node && opencode && python && skills && fonts && migrations && host && knowledge && lancedb && embedding, "node": node, "opencode": opencode, "python": python, "skills": skills, "fonts": fonts, "migrations": migrations, "host": host, "knowledge": knowledge, "lancedb": lancedb, "embedding": embedding, "semanticRag": lancedb, "paths": { "node": node_path, "opencode": opencode_path, "python": python_path, "host": host_path, "knowledge": knowledge_path, "skills": skill_path, "fonts": fonts_path, "lancedb": lancedb_path, "embedding": embedding_path } }))
}

fn executable_works(path: &std::path::Path, args: &[&str]) -> bool {
    Command::new(path).args(args).output().map(|output| output.status.success()).unwrap_or(false)
}

fn canonical_path(path: PathBuf) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn configured_runtime_path(data: &std::path::Path, key: &str) -> Option<PathBuf> {
    let value = config::read(&data.join("config.json"), data).ok()?;
    let path = value.get("runtime")?.get(key)?.as_str().map(PathBuf::from)?;
    std::fs::canonicalize(path).ok()
}

fn configured_runtime_executable(data: &std::path::Path, key: &str) -> Option<PathBuf> {
    configured_runtime_path(data, key).and_then(|path| resolve_windows_command_shim(path).into_iter().find(|candidate| candidate.is_file()))
}

fn persist_runtime_paths(data: &std::path::Path, updates: &[(&str, Option<&PathBuf>)]) -> Result<(), String> {
    let path = data.join("config.json");
    let mut value = config::read(&path, data)?;
    let runtime = value.get_mut("runtime").and_then(serde_json::Value::as_object_mut).ok_or_else(|| "runtime_required".to_string())?;
    let mut changed = false;
    for (key, candidate) in updates {
        let Some(candidate) = candidate else { continue; };
        let canonical = candidate.to_string_lossy().into_owned();
        if runtime.get(*key).and_then(serde_json::Value::as_str) != Some(canonical.as_str()) {
            runtime.insert((*key).to_string(), serde_json::Value::String(canonical));
            changed = true;
        }
    }
    if changed { config::write(&path, &value)?; }
    Ok(())
}

fn python_capable(path: &std::path::Path) -> bool {
    Command::new(path).args(["-c", PPT_PYTHON_PROBE]).output().map(|output| output.status.success()).unwrap_or(false)
}

fn system_python() -> Option<PathBuf> {
    let output = Command::new("where.exe").arg("python").output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).flat_map(resolve_windows_command_shim).filter(|path| path.exists() && executable_works(path, &["--version"])).find_map(|path| std::fs::canonicalize(path).ok())
}

fn system_executable(command: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(command).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).flat_map(resolve_windows_command_shim).filter(|path| path.exists() && executable_works(path, &["--version"])).find_map(|path| std::fs::canonicalize(path).ok())
}

#[derive(Debug, Deserialize, Default)]
struct RuntimeRepairOptions {
    #[serde(rename = "offlineZip")]
    offline_zip: Option<String>,
}

#[tauri::command]
fn repair_runtime(app: tauri::AppHandle, options: Option<RuntimeRepairOptions>) -> Result<serde_json::Value, String> {
    let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
    let manifest = [resource.join("runtime-manifest.json"), resource.join("dist-runtime").join("runtime").join("runtime-manifest.json"), resource.join("_up_").join("dist-runtime").join("runtime").join("runtime-manifest.json")]
        .into_iter().find(|path| path.exists()).ok_or_else(|| "runtime_manifest_missing".to_string())?;
    let script = [
        resource.join("dist-runtime").join("install-desktop-runtime.ps1"),
        resource.join("_up_").join("dist-runtime").join("install-desktop-runtime.ps1"),
        resource.join("install-desktop-runtime.ps1"),
        resource.join("_up_").join("install-desktop-runtime.ps1"),
    ]
        .into_iter().find(|path| path.exists()).ok_or_else(|| "runtime_installer_missing".to_string())?;
    // The installer stages `runtime/...` under its install root. Passing the
    // data root (rather than the runtime subdirectory) keeps the resulting
    // layout aligned with all probes and host path resolution.
    let install_root = data_dir(&app)?;
    let offline_zip = options.and_then(|value| value.offline_zip).map(PathBuf::from).map(|path| std::fs::canonicalize(path).map_err(|error| format!("offline_runtime_zip_unavailable: {error}"))).transpose()?;
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(script)
        .args(["-ManifestPath"])
        .arg(manifest)
        .args(["-InstallRoot"])
        .arg(&install_root);
    if let Some(zip) = offline_zip.as_ref() { command.args(["-OfflineZip"]).arg(zip); }
    let output = command.output().map_err(|error| format!("runtime_installer_spawn_failed: {error}"))?;
    if !output.status.success() { return Err(format!("runtime_install_failed: {}", String::from_utf8_lossy(&output.stderr).trim().chars().take(500).collect::<String>())); }
    Ok(serde_json::json!({ "status": "ok", "installRoot": install_root }))
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(storage::data_root(executable.parent().unwrap_or(executable.as_path()), configured_local_app_data(&app)))
}

fn configured_local_app_data(app: &tauri::AppHandle) -> Option<PathBuf> {
    #[cfg(windows)]
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        return Some(PathBuf::from(local_app_data).join("AIMarketing"));
    }
    app.path().app_local_data_dir().ok()
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> { Ok(data_dir(app)?.join("app.db")) }

fn project_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data = data_dir(app)?;
    let configured = config::read(&data.join("config.json"), &data)?.get("workspacePath").and_then(serde_json::Value::as_str).map(PathBuf::from);
    let root = configured.unwrap_or_else(|| data.join("projects"));
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let name = root.file_name().and_then(|value| value.to_str()).unwrap_or("AI Marketing");
    storage::upsert_project(&data.join("app.db"), &root.to_string_lossy(), name).map_err(|error| error.to_string())?;
    Ok(root)
}

const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;
const MAX_ATTACHMENT_CHUNK_BYTES: usize = 1024 * 1024;

fn safe_attachment_name(file_name: &str) -> String {
    let original = std::path::Path::new(&file_name).file_name().and_then(|value| value.to_str()).unwrap_or("attachment.bin");
    let safe_name: String = original.chars().map(|character| if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_' | ' ' | '(' | ')') { character } else { '_' }).collect();
    if safe_name.trim().is_empty() { "attachment.bin".to_string() } else { safe_name.trim().to_string() }
}

fn attachment_target(app: &tauri::AppHandle, relative_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = project_root(app)?;
    let relative = std::path::Path::new(relative_path);
    if relative.is_absolute() || relative.components().any(|component| matches!(component, std::path::Component::ParentDir)) || !relative_path.starts_with("attachments/") { return Err("attachment_path_escape".to_string()); }
    let target = root.join(relative_path.replace('/', "\\"));
    if !target.starts_with(&root) { return Err("attachment_path_escape".to_string()); }
    Ok((root, target))
}

fn attachment_partial_target(target: &PathBuf) -> PathBuf { target.with_file_name(format!("{}.part", target.file_name().and_then(|value| value.to_str()).unwrap_or("attachment.bin"))) }

#[tauri::command]
fn begin_local_attachment(app: tauri::AppHandle, file_name: String, byte_length: usize) -> Result<serde_json::Value, String> {
    if byte_length > MAX_ATTACHMENT_BYTES { return Err("attachment_too_large".to_string()); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_nanos()).unwrap_or(0);
    let relative_path = format!("attachments/{}-{}", stamp, safe_attachment_name(&file_name));
    let root = project_root(&app)?;
    let target = root.join(relative_path.replace('/', "\\"));
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    fs::File::create(attachment_partial_target(&target)).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "relativePath": relative_path, "byteLength": 0, "expectedByteLength": byte_length }))
}

#[tauri::command]
fn append_local_attachment_chunk(app: tauri::AppHandle, relative_path: String, offset: usize, bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    if bytes.len() > MAX_ATTACHMENT_CHUNK_BYTES { return Err("attachment_chunk_too_large".to_string()); }
    let (_root, target) = attachment_target(&app, &relative_path)?;
    let partial = attachment_partial_target(&target);
    let current = fs::metadata(&partial).map_err(|error| format!("attachment_unavailable: {error}"))?.len() as usize;
    if current != offset { return Err("attachment_chunk_offset_mismatch".to_string()); }
    if current.saturating_add(bytes.len()) > MAX_ATTACHMENT_BYTES { return Err("attachment_too_large".to_string()); }
    let mut file = fs::OpenOptions::new().append(true).open(&partial).map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "relativePath": relative_path, "byteLength": current + bytes.len() }))
}

#[tauri::command]
fn finish_local_attachment(app: tauri::AppHandle, relative_path: String, expected_byte_length: usize) -> Result<serde_json::Value, String> {
    let (_root, target) = attachment_target(&app, &relative_path)?;
    let partial = attachment_partial_target(&target);
    let actual = fs::metadata(&partial).map_err(|error| format!("attachment_unavailable: {error}"))?.len() as usize;
    if actual != expected_byte_length { return Err("attachment_size_mismatch".to_string()); }
    fs::rename(&partial, &target).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "relativePath": relative_path, "byteLength": actual }))
}

#[tauri::command]
fn abort_local_attachment(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    let (_root, target) = attachment_target(&app, &relative_path)?;
    let partial = attachment_partial_target(&target);
    if partial.exists() { fs::remove_file(partial).map_err(|error| error.to_string())?; }
    if target.exists() { fs::remove_file(target).map_err(|error| error.to_string())?; }
    Ok(())
}

fn safe_media_component(value: &str, fallback: &str) -> String {
    let sanitized: String = value.chars().map(|character| if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') { character } else { '_' }).collect();
    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() { fallback.to_string() } else { trimmed.chars().take(96).collect() }
}

#[tauri::command]
fn allocate_media_temp(app: tauri::AppHandle, run_id: String, node_key: String) -> Result<serde_json::Value, String> {
    if run_id.trim().is_empty() || node_key.trim().is_empty() { return Err("media_temp_identity_required".to_string()); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_nanos()).unwrap_or(0);
    let relative_path = format!("artifacts/.tmp/{}/{}/{}", safe_media_component(&run_id, "run"), safe_media_component(&node_key, "node"), stamp);
    let root = project_root(&app)?;
    let target = root.join(relative_path.replace('/', "\\"));
    if !target.starts_with(&root) { return Err("media_temp_path_escape".to_string()); }
    fs::create_dir_all(&target).map_err(|error| format!("media_temp_create_failed: {error}"))?;
    Ok(serde_json::json!({ "relativePath": relative_path }))
}

#[tauri::command]
fn write_writer_draft(app: tauri::AppHandle, content: String) -> Result<artifacts::ArtifactMetadata, String> {
    if content.trim().is_empty() { return Err("writer_draft_empty".to_string()); }
    if content.len() > 10 * 1024 * 1024 { return Err("writer_draft_too_large".to_string()); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_nanos()).unwrap_or(0);
    let relative_path = format!("articles/ai-marketing-writer-{}.md", stamp);
    let root = project_root(&app)?;
    let target = root.join(relative_path.replace('/', "\\"));
    if !target.starts_with(&root) { return Err("writer_draft_path_escape".to_string()); }
    write_file_atomically(&target, content.as_bytes())?;
    let metadata = artifacts::inspect(&root, &relative_path, "text/markdown")?;
    storage::register_artifact(&database_path(&app)?, &format!("writer-draft-{}", stamp), None, &metadata).map_err(|error| error.to_string())?;
    Ok(metadata)
}

#[tauri::command]
fn inspect_artifact(app: tauri::AppHandle, relative_path: String, mime_type: String) -> Result<artifacts::ArtifactMetadata, String> {
    artifacts::inspect(&project_root(&app)?, &relative_path, &mime_type)
}

#[tauri::command]
fn register_artifact(app: tauri::AppHandle, artifact_id: String, project_id: Option<String>, relative_path: String, mime_type: String) -> Result<artifacts::ArtifactMetadata, String> {
    let metadata = artifacts::inspect(&project_root(&app)?, &relative_path, &mime_type)?;
    storage::register_artifact(&database_path(&app)?, &artifact_id, project_id.as_deref(), &metadata).map_err(|error| error.to_string())?;
    Ok(metadata)
}

#[tauri::command]
fn list_artifacts(app: tauri::AppHandle) -> Result<Vec<storage::ArtifactRow>, String> {
    let root = project_root(&app)?;
    let mut rows = storage::list_artifacts(&database_path(&app)?).map_err(|error| error.to_string())?;
    for row in &mut rows {
        row.available = artifacts::inspect(&root, &row.relative_path, &row.mime_type).is_ok();
    }
    Ok(rows)
}

#[tauri::command]
fn remove_artifact(app: tauri::AppHandle, artifact_id: String) -> Result<(), String> {
    storage::remove_artifact(&database_path(&app)?, &artifact_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn export_diagnostics(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let data = data_dir(&app)?;
    let diagnostics_root = data.join("diagnostics");
    fs::create_dir_all(&diagnostics_root).map_err(|error| error.to_string())?;
    let stamp = format!("{}-{}", chrono_like_timestamp(), std::process::id());
    let staging = diagnostics_root.join(format!("staging-{stamp}"));
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let mut config_value = config::read(&data.join("config.json"), &data)?;
    redact_diagnostic_value(&mut config_value);
    fs::write(staging.join("config.redacted.json"), serde_json::to_vec_pretty(&config_value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    fs::write(staging.join("metadata.json"), serde_json::to_vec_pretty(&serde_json::json!({ "version": env!("CARGO_PKG_VERSION"), "dataRoot": "[REDACTED]", "createdAt": stamp })).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let logs = data.join("logs");
    if logs.exists() { copy_directory(&logs, &staging.join("logs"))?; }
    let zip_path = diagnostics_root.join(format!("AI-Marketing-diagnostics-{stamp}.zip"));
    archive_diagnostics(&staging, &zip_path)?;
    let _ = fs::remove_dir_all(&staging);
    Ok(serde_json::json!({ "path": zip_path, "redacted": true }))
}

fn redact_diagnostic_value(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Array(items) => items.iter_mut().for_each(redact_diagnostic_value),
        serde_json::Value::Object(object) => {
            for (key, nested) in object.iter_mut() {
                let normalized = key.to_ascii_lowercase().replace(['-', '_'], "");
                if normalized == "apikey"
                    || normalized == "key"
                    || normalized.ends_with("key")
                    || normalized.contains("token")
                    || normalized.contains("secret")
                    || normalized.contains("password")
                    || normalized.contains("authorization")
                    || normalized.contains("credential")
                {
                    *nested = serde_json::Value::String("[REDACTED]".to_string());
                } else {
                    redact_diagnostic_value(nested);
                }
            }
        }
        _ => {}
    }
}

fn chrono_like_timestamp() -> String {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_secs().to_string()).unwrap_or_else(|_| "unknown".to_string())
}

fn write_file_atomically(target: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    if target.exists() { return Err("atomic_target_exists".to_string()); }
    let parent = target.parent().ok_or_else(|| "atomic_target_parent_missing".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_nanos()).unwrap_or(0);
    let temporary = target.with_extension(format!("{}.{}.tmp", target.extension().and_then(|value| value.to_str()).unwrap_or("artifact"), stamp));
    let result = (|| {
        let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
        file.write_all(bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        fs::rename(&temporary, target).map_err(|error| error.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

fn powershell_quote(value: &str) -> String { value.replace('\'', "''") }

fn archive_diagnostics(staging: &std::path::Path, zip_path: &std::path::Path) -> Result<(), String> {
    let source = powershell_quote(&staging.to_string_lossy());
    let destination = powershell_quote(&zip_path.to_string_lossy());
    let command = format!("Compress-Archive -Path '{}\\*' -DestinationPath '{}' -Force", source, destination);
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &command])
        .output()
        .map_err(|error| format!("diagnostics_archive_spawn_failed: {error}"))?;
    if !output.status.success() { return Err(format!("diagnostics_archive_failed: {}", String::from_utf8_lossy(&output.stderr).trim())); }
    Ok(())
}

fn copy_directory(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());
        if entry.file_type().map_err(|error| error.to_string())?.is_dir() { copy_directory(&entry.path(), &target)?; } else { fs::copy(entry.path(), target).map_err(|error| error.to_string())?; }
    }
    Ok(())
}

#[tauri::command]
fn open_workspace(app: tauri::AppHandle) -> Result<(), String> {
    let root = project_root(&app)?;
    Command::new("explorer.exe").arg(root).spawn().map(|_| ()).map_err(|error| format!("explorer_spawn_failed: {error}"))
}

#[tauri::command]
fn pick_directory(initial_path: Option<String>) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let initial = initial_path.unwrap_or_default();
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.ShowNewFolderButton = $true
$initial = [Environment]::GetEnvironmentVariable('AIMARKETING_PICK_INITIAL', 'Process')
if ($initial -and (Test-Path -LiteralPath $initial -PathType Container)) { $dialog.SelectedPath = $initial }
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }
"#;
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script])
            .env("AIMARKETING_PICK_INITIAL", initial)
            .creation_flags(0x08000000)
            .output()
            .map_err(|error| format!("directory_picker_spawn_failed: {error}"))?;
        if !output.status.success() { return Err(format!("directory_picker_failed:{}", output.status.code().unwrap_or(-1))); }
        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!selected.is_empty()).then_some(selected));
    }
    #[cfg(not(windows))]
    {
        let _ = initial_path;
        Ok(None)
    }
}

#[tauri::command]
fn open_artifact(app: tauri::AppHandle, relative_path: String, mime_type: String) -> Result<(), String> {
    let root = project_root(&app)?;
    let metadata = artifacts::inspect(&root, &relative_path, &mime_type)?;
    let target = root.join(metadata.relative_path.replace('/', "\\"));
    Command::new("explorer.exe").args(["/select,", &target.to_string_lossy()]).spawn().map(|_| ()).map_err(|error| format!("explorer_spawn_failed: {error}"))
}

#[tauri::command]
fn open_artifact_default(app: tauri::AppHandle, relative_path: String, mime_type: String) -> Result<(), String> {
    let root = project_root(&app)?;
    let metadata = artifacts::inspect(&root, &relative_path, &mime_type)?;
    let target = root.join(metadata.relative_path.replace('/', "\\"));
    Command::new("cmd.exe").args(["/C", "start", "", &target.to_string_lossy()]).spawn().map(|_| ()).map_err(|error| format!("default_program_spawn_failed: {error}"))
}

#[tauri::command]
fn open_vault_file(app: tauri::AppHandle, relative_path: String) -> Result<(), String> {
    let data = data_dir(&app)?;
    let vault = config::read(&data.join("config.json"), &data)?
        .get("obsidianVaultPath")
        .and_then(serde_json::Value::as_str)
        .map(PathBuf::from)
        .ok_or_else(|| "obsidian_vault_not_configured".to_string())?;
    let root = std::fs::canonicalize(&vault).map_err(|error| format!("obsidian_vault_unavailable: {error}"))?;
    let requested = root.join(relative_path.replace('/', "\\"));
    let target = std::fs::canonicalize(&requested).map_err(|error| format!("obsidian_file_unavailable: {error}"))?;
    if target != root && !target.starts_with(&root) { return Err("obsidian_path_escape".to_string()); }
    Command::new("explorer.exe").args(["/select,", &target.to_string_lossy()]).spawn().map(|_| ()).map_err(|error| format!("explorer_spawn_failed: {error}"))
}

#[tauri::command]
fn read_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let data = data_dir(&app)?;
    config::read(&data.join("config.json"), &data)
}

#[tauri::command]
fn write_config(app: tauri::AppHandle, value: serde_json::Value) -> Result<(), String> {
    let data = data_dir(&app)?;
    config::write(&data.join("config.json"), &value)?;
    if let (Some(vault), Some(index)) = (value.get("obsidianVaultPath").and_then(serde_json::Value::as_str), value.get("obsidianIndexPath").and_then(serde_json::Value::as_str)) {
        storage::upsert_vault_mapping(&data.join("app.db"), vault, index, value.get("embeddingModel").and_then(serde_json::Value::as_str).unwrap_or("local-hash-384-v1"), value.get("embeddingDimension").and_then(serde_json::Value::as_i64).unwrap_or(384)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn runtime_paths(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable_dir = executable.parent().unwrap_or(executable.as_path());
    let portable = executable_dir.join("portable.flag").exists();
    let data = storage::data_root(executable_dir, configured_local_app_data(&app));
    Ok(serde_json::json!({
        "mode": if portable { "portable" } else { "normal" },
        "data": data,
    }))
}

#[tauri::command]
fn initialize_local_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let data = data_dir(&app)?;
    let database = data.join("app.db");
    storage::initialize(&database).map_err(|error| error.to_string())?;
    let interrupted = storage::recover_interrupted(&database).map_err(|error| error.to_string())?;
    let healthy = storage::integrity(&database).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "database": database, "integrity": healthy, "interruptedRuns": interrupted }))
}

#[derive(Debug, Deserialize)]
struct ConversationInput { id: String, title: String, project_id: Option<String> }

#[tauri::command]
fn create_conversation(app: tauri::AppHandle, input: ConversationInput) -> Result<storage::ConversationRow, String> {
    let path = database_path(&app)?;
    storage::create_conversation(&path, &input.id, &input.title, input.project_id.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_conversation_session(app: tauri::AppHandle, conversation_id: String, session_id: String) -> Result<(), String> {
    storage::set_session_id(&database_path(&app)?, &conversation_id, &session_id).map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
struct MessageInput { id: String, conversation_id: String, role: String, content: String }

#[tauri::command]
fn append_message(app: tauri::AppHandle, input: MessageInput) -> Result<(), String> {
    storage::append_message(&database_path(&app)?, &input.id, &input.conversation_id, &input.role, &input.content).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_run(app: tauri::AppHandle, run_id: String, conversation_id: Option<String>, model: Option<String>) -> Result<(), String> {
    storage::create_run(&database_path(&app)?, &run_id, conversation_id.as_deref(), model.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn append_run_event(app: tauri::AppHandle, run_id: String, sequence: i64, event_type: String, payload_json: String) -> Result<(), String> {
    storage::append_run_event(&database_path(&app)?, &run_id, sequence, &event_type, &payload_json).map_err(|error| error.to_string())
}

#[tauri::command]
fn finish_run(app: tauri::AppHandle, run_id: String, status: String) -> Result<(), String> {
    storage::finish_run(&database_path(&app)?, &run_id, &status).map_err(|error| error.to_string())
}

#[tauri::command]
fn record_usage(app: tauri::AppHandle, run_id: String, provider: Option<String>, model: String, input_tokens: Option<i64>, output_tokens: Option<i64>, provider_cost: Option<f64>, estimated_cost: Option<f64>, idempotency_key: Option<String>) -> Result<(), String> {
    storage::record_usage(&database_path(&app)?, &run_id, provider.as_deref(), &model, input_tokens, output_tokens, provider_cost, estimated_cost, idempotency_key.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn record_run_node(app: tauri::AppHandle, run_id: String, node_key: String, status: String, output_json: Option<String>) -> Result<(), String> {
    storage::record_run_node(&database_path(&app)?, &run_id, &node_key, &status, output_json.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn record_run_checkpoint(app: tauri::AppHandle, run_id: String, checkpoint_key: String, sequence: i64, output_json: String) -> Result<(), String> {
    storage::record_run_checkpoint(&database_path(&app)?, &run_id, &checkpoint_key, sequence, &output_json).map_err(|error| error.to_string())
}

#[tauri::command]
fn record_run_attempt(app: tauri::AppHandle, idempotency_key: String, run_id: String, node_key: String, provider: Option<String>, provider_task_id: Option<String>, status: String, payload_json: Option<String>) -> Result<(), String> {
    storage::record_run_attempt(&database_path(&app)?, &idempotency_key, &run_id, &node_key, provider.as_deref(), provider_task_id.as_deref(), &status, payload_json.as_deref()).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_conversations(app: tauri::AppHandle) -> Result<Vec<storage::ConversationRow>, String> {
    storage::list_conversations(&database_path(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_messages(app: tauri::AppHandle, conversation_id: String) -> Result<Vec<storage::MessageRow>, String> {
    storage::list_messages(&database_path(&app)?, &conversation_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_runs(app: tauri::AppHandle) -> Result<Vec<storage::RunRow>, String> {
    storage::list_runs(&database_path(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn inspect_run(app: tauri::AppHandle, run_id: String) -> Result<storage::RunDetail, String> {
    storage::inspect_run(&database_path(&app)?, &run_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_recoverable_attempts(app: tauri::AppHandle) -> Result<Vec<storage::RunAttemptRow>, String> {
    storage::list_recoverable_attempts(&database_path(&app)?).map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
struct WorkflowInput { id: String, name: String, project_id: Option<String>, definition_json: String }

#[tauri::command]
fn save_workflow(app: tauri::AppHandle, input: WorkflowInput) -> Result<storage::WorkflowRow, String> {
    if serde_json::from_str::<serde_json::Value>(&input.definition_json).is_err() { return Err("workflow_definition_invalid_json".to_string()); }
    storage::save_workflow(&database_path(&app)?, &input.id, &input.name, input.project_id.as_deref(), &input.definition_json).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_workflows(app: tauri::AppHandle) -> Result<Vec<storage::WorkflowRow>, String> {
    storage::list_workflows(&database_path(&app)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn usage_summary(app: tauri::AppHandle) -> Result<storage::UsageSummary, String> {
    storage::usage_summary(&database_path(&app)?).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let lock_path = match lock_path() {
        Ok(path) => path,
        Err(error) => { eprintln!("AI Marketing cannot resolve instance lock path: {error}"); bootstrap::show_startup_error(&error); return; }
    };
    let instance_lock = match instance_lock::InstanceLock::acquire(lock_path) {
        Ok(lock) => lock,
        Err(error) => { eprintln!("AI Marketing cannot acquire instance lock: {error}"); bootstrap::show_startup_error(&error); return; }
    };
    if let Err(error) = bootstrap::ensure_webview2() {
        eprintln!("AI Marketing cannot start without WebView2: {error}");
        bootstrap::show_startup_error(&error);
        instance_lock.release();
        return;
    }
    if let Err(error) = bootstrap::ensure_runtime_before_window() {
        eprintln!("AI Marketing cannot start without the local runtime: {error}");
        bootstrap::show_startup_error(&error);
        instance_lock.release();
        return;
    }
    let builder = tauri::Builder::default()
        .manage(instance_lock)
        .manage(host::HostState::default())
        .invoke_handler(tauri::generate_handler![health, runtime_probe, repair_runtime, runtime_paths, initialize_local_state, read_config, write_config, begin_local_attachment, append_local_attachment_chunk, finish_local_attachment, abort_local_attachment, allocate_media_temp, write_writer_draft, inspect_artifact, register_artifact, list_artifacts, remove_artifact, export_diagnostics, open_workspace, pick_directory, open_artifact, open_artifact_default, open_vault_file, create_conversation, set_conversation_session, append_message, create_run, append_run_event, finish_run, record_usage, record_run_node, record_run_checkpoint, record_run_attempt, list_conversations, list_messages, list_runs, inspect_run, list_recoverable_attempts, save_workflow, list_workflows, usage_summary, host::host_start, host::host_send, host::host_stop]);
    let app = builder.build(tauri::generate_context!()).expect("error while building AI Marketing");
    app.run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(state) = app.try_state::<host::HostState>() { let _ = host::stop_state(state.inner()); }
                if let Some(lock) = app.try_state::<instance_lock::InstanceLock>() { lock.release(); }
            }
        });
}

fn lock_path() -> Result<std::path::PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let executable_dir = executable.parent().unwrap_or(executable.as_path());
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(|value| std::path::PathBuf::from(value).join("AIMarketing"));
    Ok(storage::data_root(executable_dir, local_app_data).join("instance.lock"))
}

#[cfg(test)]
mod tests {
    use super::{archive_diagnostics, config, configured_runtime_executable, persist_runtime_paths, powershell_quote, redact_diagnostic_value, resolve_windows_command_shim, safe_media_component, write_file_atomically};
    use std::fs;

    #[test]
    fn media_temp_components_are_workspace_safe_and_bounded() {
        assert_eq!(safe_media_component("run:with\\separators", "run"), "run_with_separators");
        assert_eq!(safe_media_component("../", "node"), "node");
        assert!(safe_media_component(&"x".repeat(200), "node").len() <= 96);
    }

    #[test]
    fn runtime_probe_persists_canonical_paths_and_reuses_them() {
        let root = std::env::temp_dir().join(format!("ai-marketing-runtime-paths-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let config_path = root.join("config.json");
        config::write(&config_path, &config::default_config(&root)).unwrap();
        let node = root.join("runtime-node.exe");
        fs::write(&node, b"fixture").unwrap();
        let canonical = fs::canonicalize(&node).unwrap();

        persist_runtime_paths(&root, &[("nodePath", Some(&canonical))]).unwrap();

        let saved = config::read(&config_path, &root).unwrap();
        let canonical_text = canonical.to_string_lossy().into_owned();
        assert_eq!(saved["runtime"]["nodePath"].as_str(), Some(canonical_text.as_str()));
        assert_eq!(configured_runtime_executable(&root, "nodePath"), Some(canonical));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn windows_command_shims_resolve_to_real_opencode_executable() {
        let root = std::env::temp_dir().join(format!("ai-marketing-command-shim-{}", std::process::id()));
        let bin = root.join("node_modules").join("opencode-ai").join("bin");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&bin).unwrap();
        let executable = bin.join("opencode.exe");
        fs::write(&executable, b"fixture").unwrap();
        let candidates = resolve_windows_command_shim(root.join("opencode.cmd"));
        assert!(candidates.iter().any(|candidate| candidate == &executable));
        assert_eq!(candidates.iter().find(|candidate| candidate.is_file()), Some(&executable));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn startup_gates_run_before_tauri_builder() {
        let source = include_str!("lib.rs");
        let webview_gate = source.find("bootstrap::ensure_webview2()").expect("webview gate missing");
        let runtime_gate = source.find("bootstrap::ensure_runtime_before_window()").expect("runtime gate missing");
        let builder = source.find("let builder = tauri::Builder::default()").expect("tauri builder missing");
        assert!(webview_gate < builder, "WebView2 must be ready before Tauri creates the window");
        assert!(runtime_gate < builder, "green runtime must be ready before Tauri creates the window");
        assert!(source[webview_gate..builder].contains("instance_lock.release()"));
        assert!(source[runtime_gate..builder].contains("instance_lock.release()"));
    }

    #[test]
    fn diagnostic_redaction_recurses_without_touching_non_secret_config() {
        let mut value = serde_json::json!({
            "provider": { "apiKey": "provider-secret", "model": "gpt-5.4" },
            "nested": { "access_token": "token-secret", "privateKey": "key-secret", "authorization": "Bearer secret", "label": "中文" },
            "items": [{ "password": "password-secret", "value": 7 }]
        });

        redact_diagnostic_value(&mut value);

        assert_eq!(value["provider"]["apiKey"], "[REDACTED]");
        assert_eq!(value["nested"]["access_token"], "[REDACTED]");
        assert_eq!(value["nested"]["privateKey"], "[REDACTED]");
        assert_eq!(value["nested"]["authorization"], "[REDACTED]");
        assert_eq!(value["nested"]["label"], "中文");
        assert_eq!(value["items"][0]["password"], "[REDACTED]");
        assert_eq!(value["items"][0]["value"], 7);
    }

    #[test]
    fn writer_artifacts_use_atomic_utf8_file_activation() {
        let root = std::env::temp_dir().join(format!("ai-marketing-atomic-writer-{}", std::process::id()));
        let target = root.join("articles").join("draft.md");
        let _ = fs::remove_dir_all(&root);
        write_file_atomically(&target, "中文 draft".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "中文 draft");
        assert_eq!(write_file_atomically(&target, b"second"), Err("atomic_target_exists".to_string()));
        let files = fs::read_dir(root.join("articles")).unwrap().map(|entry| entry.unwrap().file_name()).collect::<Vec<_>>();
        assert_eq!(files, vec![std::ffi::OsString::from("draft.md")]);
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn diagnostic_archive_contains_only_redacted_config() {
        let root = std::env::temp_dir().join(format!("ai-marketing-diagnostics-{}", std::process::id()));
        let staging = root.join("staging");
        let archive = root.join("diagnostics.zip");
        let extracted = root.join("extracted");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&staging).unwrap();
        let mut value = serde_json::json!({ "provider": { "apiKey": "archive-secret" }, "label": "中文" });
        redact_diagnostic_value(&mut value);
        fs::write(staging.join("config.redacted.json"), serde_json::to_vec(&value).unwrap()).unwrap();

        archive_diagnostics(&staging, &archive).unwrap();
        let command = format!(
            "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
            powershell_quote(&archive.to_string_lossy()),
            powershell_quote(&extracted.to_string_lossy())
        );
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", &command])
            .output()
            .unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let archived = fs::read_to_string(extracted.join("config.redacted.json")).unwrap();
        assert!(!archived.contains("archive-secret"));
        assert!(archived.contains("[REDACTED]"));
        assert!(archived.contains("中文"));
        let _ = fs::remove_dir_all(root);
    }
}
