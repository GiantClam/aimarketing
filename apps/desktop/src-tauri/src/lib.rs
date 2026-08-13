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
    let private_node = data.join("runtime").join("node").join("node.exe");
    let configured_opencode = configured_runtime_executable(&data, "opencodePath");
    let private_opencode = data.join("runtime").join("opencode").join("opencode.exe");
    let node_path = (if private_node.exists() && executable_works(&private_node, &["--version"]) { Some(private_node) } else { system_executable("node").filter(|path| executable_works(path, &["--version"])) }).and_then(canonical_path);
    let opencode_path = configured_opencode.filter(|path| executable_works(path, &["--version"])).or_else(|| if private_opencode.exists() && executable_works(&private_opencode, &["--version"]) { Some(private_opencode) } else { system_executable("opencode").filter(|path| executable_works(path, &["--version"])) }).and_then(canonical_path);
    let node = node_path.is_some();
    let opencode = opencode_path.is_some();
    let private_python = data.join("runtime").join("python").join("python.exe");
    let resource_python = resource.join("dist-runtime").join("runtime").join("python").join("python.exe");
    let python_path = [private_python, resource_python].into_iter().find(|path| python_capable(path)).or_else(system_python).and_then(canonical_path);
    let python = python_path.is_some();
    let development = std::env::current_dir().unwrap_or_default().join("apps").join("desktop").join("dist-runtime");
    let host_path = [resource.join("dist-runtime").join("host.mjs"), resource.join("_up_").join("dist-runtime").join("host.mjs"), development.join("host.mjs")].into_iter().find(|path| path.is_file()).and_then(canonical_path);
    let host = host_path.is_some();
    let skill_roots = [resource.join("dist-runtime").join("skills"), resource.join("_up_").join("dist-runtime").join("skills"), development.join("skills")];
    let skill_path = skill_roots.iter().find(|path| path.join("ppt-master").join("SKILL.md").exists() && path.join("ppt-master.manifest.json").exists()).cloned().and_then(canonical_path);
    let skills = skill_path.is_some();
    let fonts = [resource.join("dist-runtime").join("runtime").join("fonts").join("msyh.ttc"), resource.join("_up_").join("dist-runtime").join("runtime").join("fonts").join("msyh.ttc"), development.join("runtime").join("fonts").join("msyh.ttc")].iter().any(|path| path.is_file());
    let fonts_path = [resource.join("dist-runtime").join("runtime").join("fonts"), resource.join("_up_").join("dist-runtime").join("runtime").join("fonts"), development.join("runtime").join("fonts")].into_iter().find(|path| path.join("msyh.ttc").is_file()).and_then(canonical_path);
    let lancedb_candidates = [data.join("runtime").join("lancedb"), resource.join("dist-runtime").join("runtime").join("lancedb")];
    let lancedb_path = lancedb_candidates.into_iter().find(|path| path.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").exists()).and_then(canonical_path);
    let lancedb = lancedb_path.is_some();
    let embedding_path = [resource.join("dist-runtime").join("runtime").join("embedding").join("local-hash-384-v1.json"), resource.join("_up_").join("dist-runtime").join("runtime").join("embedding").join("local-hash-384-v1.json"), data.join("runtime").join("embedding").join("local-hash-384-v1.json")].into_iter().find(|path| path.is_file()).and_then(canonical_path);
    let embedding = embedding_path.is_some();
    Ok(serde_json::json!({ "ready": node && opencode && python && skills && fonts && migrations && host && lancedb && embedding, "node": node, "opencode": opencode, "python": python, "skills": skills, "fonts": fonts, "migrations": migrations, "host": host, "lancedb": lancedb, "embedding": embedding, "semanticRag": lancedb, "paths": { "node": node_path, "opencode": opencode_path, "python": python_path, "host": host_path, "skills": skill_path, "fonts": fonts_path, "lancedb": lancedb_path, "embedding": embedding_path } }))
}

fn executable_works(path: &std::path::Path, args: &[&str]) -> bool {
    Command::new(path).args(args).output().map(|output| output.status.success()).unwrap_or(false)
}

fn canonical_path(path: PathBuf) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn configured_runtime_executable(data: &std::path::Path, key: &str) -> Option<PathBuf> {
    let value = config::read(&data.join("config.json"), data).ok()?;
    value.get("runtime")?.get(key)?.as_str().map(PathBuf::from).filter(|path| path.is_file()).and_then(|path| std::fs::canonicalize(path).ok())
}

fn python_capable(path: &std::path::Path) -> bool {
    Command::new(path).args(["-c", PPT_PYTHON_PROBE]).output().map(|output| output.status.success()).unwrap_or(false)
}

fn system_python() -> Option<PathBuf> {
    let output = Command::new("where.exe").arg("python").output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).filter(|path| path.exists()).find_map(|path| std::fs::canonicalize(path).ok())
}

fn system_executable(command: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(command).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).filter(|path| path.exists()).find_map(|path| std::fs::canonicalize(path).ok())
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

#[tauri::command]
fn write_writer_draft(app: tauri::AppHandle, content: String) -> Result<artifacts::ArtifactMetadata, String> {
    if content.trim().is_empty() { return Err("writer_draft_empty".to_string()); }
    if content.len() > 10 * 1024 * 1024 { return Err("writer_draft_too_large".to_string()); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_nanos()).unwrap_or(0);
    let relative_path = format!("articles/ai-marketing-writer-{}.md", stamp);
    let root = project_root(&app)?;
    let target = root.join(relative_path.replace('/', "\\"));
    if !target.starts_with(&root) { return Err("writer_draft_path_escape".to_string()); }
    if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    fs::write(&target, content.as_bytes()).map_err(|error| error.to_string())?;
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
    if let Some(provider) = config_value.get_mut("provider").and_then(serde_json::Value::as_object_mut) {
        if provider.contains_key("apiKey") { provider.insert("apiKey".to_string(), serde_json::Value::String("[REDACTED]".to_string())); }
    }
    fs::write(staging.join("config.redacted.json"), serde_json::to_vec_pretty(&config_value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    fs::write(staging.join("metadata.json"), serde_json::to_vec_pretty(&serde_json::json!({ "version": env!("CARGO_PKG_VERSION"), "dataRoot": "[REDACTED]", "createdAt": stamp })).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let logs = data.join("logs");
    if logs.exists() { copy_directory(&logs, &staging.join("logs"))?; }
    let zip_path = diagnostics_root.join(format!("AI-Marketing-diagnostics-{stamp}.zip"));
    let source = powershell_quote(&staging.to_string_lossy());
    let destination = powershell_quote(&zip_path.to_string_lossy());
    let command = format!("Compress-Archive -LiteralPath '{}\\*' -DestinationPath '{}' -Force", source, destination);
    let output = Command::new("powershell.exe").args(["-NoProfile", "-Command", &command]).output().map_err(|error| format!("diagnostics_archive_spawn_failed: {error}"))?;
    let _ = fs::remove_dir_all(&staging);
    if !output.status.success() { return Err(format!("diagnostics_archive_failed: {}", String::from_utf8_lossy(&output.stderr).trim())); }
    Ok(serde_json::json!({ "path": zip_path, "redacted": true }))
}

fn chrono_like_timestamp() -> String {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|duration| duration.as_secs().to_string()).unwrap_or_else(|_| "unknown".to_string())
}

fn powershell_quote(value: &str) -> String { value.replace('\'', "''") }

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
        .invoke_handler(tauri::generate_handler![health, runtime_probe, repair_runtime, runtime_paths, initialize_local_state, read_config, write_config, begin_local_attachment, append_local_attachment_chunk, finish_local_attachment, abort_local_attachment, write_writer_draft, inspect_artifact, register_artifact, list_artifacts, remove_artifact, export_diagnostics, open_workspace, pick_directory, open_artifact, open_artifact_default, open_vault_file, create_conversation, set_conversation_session, append_message, create_run, append_run_event, finish_run, record_usage, record_run_node, record_run_attempt, list_conversations, list_messages, list_runs, list_recoverable_attempts, save_workflow, list_workflows, usage_summary, host::host_start, host::host_send, host::host_stop]);
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
