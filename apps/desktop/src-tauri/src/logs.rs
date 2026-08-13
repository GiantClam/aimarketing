use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, SystemTime};

pub fn append(root: &Path, run_id: &str, line: &str) {
    let directory = root.join("logs").join("runs");
    if fs::create_dir_all(&directory).is_err() { return; }
    let safe_id = run_id.chars().filter(|character| character.is_ascii_alphanumeric() || *character == '-' || *character == '_').collect::<String>();
    let path = directory.join(format!("{}.jsonl", if safe_id.is_empty() { "unknown" } else { &safe_id }));
    let redacted = redact(line);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) { let _ = writeln!(file, "{redacted}"); }
    maintain(&directory);
}

fn redact(line: &str) -> String {
    let mut output = line.to_string();
    for key in ["apiKey", "api_key", "token", "authorization", "password"] {
        let pattern = format!(r#"("{key}"\s*:\s*")[^"]*"#);
        if let Ok(regex) = regex::Regex::new(&pattern) { output = regex.replace_all(&output, "$1[REDACTED]").to_string(); }
    }
    if let Ok(regex) = regex::Regex::new(r"(?i)(authorization\s*:\s*bearer\s+)[^\s,]+") { output = regex.replace_all(&output, "$1[REDACTED]").to_string(); }
    if let Ok(regex) = regex::Regex::new(r"(?i)(api[_-]?key\s*[=:]\s*)[^\s,;&]+") { output = regex.replace_all(&output, "$1[REDACTED]").to_string(); }
    output
}

fn maintain(directory: &Path) {
    let now = SystemTime::now(); let expiry = now.checked_sub(Duration::from_secs(30 * 24 * 60 * 60)).unwrap_or(now);
    let mut files = fs::read_dir(directory).ok().into_iter().flatten().filter_map(Result::ok).filter_map(|entry| entry.metadata().ok().map(|metadata| (entry.path(), metadata))).collect::<Vec<_>>();
    for (path, metadata) in &files { if metadata.modified().ok().is_some_and(|time| time < expiry) { let _ = fs::remove_file(path); } }
    files.retain(|(path, _)| path.exists()); let mut total: u64 = files.iter().map(|(_, metadata)| metadata.len()).sum();
    files.sort_by_key(|(_, metadata)| metadata.modified().ok());
    for (path, metadata) in files { if total <= 1024 * 1024 * 1024 { break; } total = total.saturating_sub(metadata.len()); let _ = fs::remove_file(path); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn raw_logs_are_redacted_and_scoped_to_run() {
        let root = std::env::temp_dir().join(format!("ai-marketing-logs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        append(&root, "run-1", r#"{"apiKey":"secret","event":"text"}"#);
        let path = root.join("logs").join("runs").join("run-1.jsonl");
        let content = fs::read_to_string(path).unwrap(); assert!(!content.contains("secret")); assert!(content.contains("[REDACTED]"));
        append(&root, "run-2", "Authorization: Bearer another-secret api_key=third-secret");
        let content = fs::read_to_string(root.join("logs").join("runs").join("run-2.jsonl")).unwrap(); assert!(!content.contains("another-secret")); assert!(!content.contains("third-secret"));
        let _ = fs::remove_dir_all(root);
    }
}
