use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
#[cfg(unix)]
use std::fs::File;
use std::io::Write;
use std::path::Path;

pub fn default_config(workspace_path: &Path) -> Value {
    json!({
        "schemaVersion": 1,
        "locale": "auto",
        "workspacePath": workspace_path.join("projects"),
        "provider": { "id": "local", "source": "local", "model": "ollama/qwen3:8b", "models": ["ollama/qwen3:8b"], "baseUrl": "http://127.0.0.1:11434/v1", "apiKey": "" },
        "runtime": { "source": "system" }
    })
}

pub fn read(path: &Path, workspace_path: &Path) -> Result<Value, String> {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|error| format!("invalid_config_json: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default_config(workspace_path)),
        Err(error) => Err(error.to_string()),
    }
}

pub fn write(path: &Path, value: &Value) -> Result<(), String> {
    validate(value)?;
    let parent = path.parent().ok_or_else(|| "config_parent_missing".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let backup = parent.join("config.backup.json");
    if path.exists() { let _ = fs::copy(path, &backup); }
    let tmp = parent.join("config.json.tmp");
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let mut file = OpenOptions::new().create(true).truncate(true).write(true).open(&tmp).map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    fs::rename(&tmp, path).map_err(|error| error.to_string())?;
    sync_parent(parent)
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> Result<(), String> {
    File::open(parent).map_err(|error| error.to_string())?.sync_all().map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> Result<(), String> { Ok(()) }

fn validate(value: &Value) -> Result<(), String> {
    if value.get("schemaVersion").and_then(Value::as_i64) != Some(1) { return Err("config_schema_version_unsupported".to_string()); }
    if value.get("workspacePath").and_then(Value::as_str).unwrap_or("").is_empty() { return Err("workspace_path_required".to_string()); }
    let provider = value.get("provider").and_then(Value::as_object).ok_or_else(|| "provider_required".to_string())?;
    if provider.get("model").and_then(Value::as_str).is_none() { return Err("provider_model_required".to_string()); }
    if value.get("runtime").and_then(Value::as_object).is_none() { return Err("runtime_required".to_string()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_round_trip_rejects_invalid_schema() {
        let root = std::env::temp_dir().join(format!("ai-marketing-config-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root); fs::create_dir_all(&root).unwrap();
        let path = root.join("config.json"); let value = default_config(&root);
        write(&path, &value).unwrap(); assert_eq!(read(&path, &root).unwrap()["schemaVersion"], 1);
        assert!(write(&path, &json!({"schemaVersion": 2})).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
