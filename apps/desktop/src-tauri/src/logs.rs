use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, SystemTime};

const LOG_RETENTION: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const MAX_LOG_BYTES: u64 = 1024 * 1024 * 1024;

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
    maintain_with_limits(directory, SystemTime::now(), LOG_RETENTION, MAX_LOG_BYTES);
}

fn maintain_with_limits(directory: &Path, now: SystemTime, retention: Duration, max_bytes: u64) {
    let expiry = now.checked_sub(retention).unwrap_or(now);
    let mut files = fs::read_dir(directory).ok().into_iter().flatten().filter_map(Result::ok).filter_map(|entry| entry.metadata().ok().map(|metadata| (entry.path(), metadata))).collect::<Vec<_>>();
    for (path, metadata) in &files { if metadata.modified().ok().is_some_and(|time| time < expiry) { let _ = fs::remove_file(path); } }
    files.retain(|(path, _)| path.exists()); let mut total: u64 = files.iter().map(|(_, metadata)| metadata.len()).sum();
    files.sort_by_key(|(_, metadata)| metadata.modified().ok());
    for (path, metadata) in files { if total <= max_bytes { break; } total = total.saturating_sub(metadata.len()); let _ = fs::remove_file(path); }
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

    #[test]
    fn retention_removes_expired_and_oldest_oversized_run_logs() {
        let root = std::env::temp_dir().join(format!("ai-marketing-log-retention-{}", std::process::id()));
        let directory = root.join("logs").join("runs");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&directory).unwrap();
        let expired = directory.join("expired.jsonl");
        fs::write(&expired, "old").unwrap();
        std::thread::sleep(Duration::from_millis(1100));
        maintain_with_limits(&directory, SystemTime::now(), Duration::from_secs(1), u64::MAX);
        assert!(!expired.exists());

        let oldest = directory.join("oldest.jsonl");
        let newest = directory.join("newest.jsonl");
        fs::write(&oldest, "1234").unwrap();
        std::thread::sleep(Duration::from_millis(1100));
        fs::write(&newest, "5678").unwrap();
        maintain_with_limits(&directory, SystemTime::now(), Duration::from_secs(60), 4);
        assert!(!oldest.exists());
        assert!(newest.exists());
        let _ = fs::remove_dir_all(root);
    }
}
