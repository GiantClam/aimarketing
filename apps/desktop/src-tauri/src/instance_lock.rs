use std::fs::{remove_file, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct InstanceLock {
    path: PathBuf,
    file: File,
}

impl InstanceLock {
    pub fn acquire(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("desktop_lock_directory_failed: {error}"))?;
        }
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                writeln!(file, "{}", std::process::id()).map_err(|error| format!("desktop_lock_write_failed: {error}"))?;
                Ok(Self { path, file })
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let owner = read_owner(&path);
                if owner.is_some_and(|pid| !process_alive(pid)) {
                    remove_file(&path).map_err(|remove_error| format!("desktop_instance_already_running: {} ({remove_error})", path.display()))?;
                    let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|retry_error| format!("desktop_instance_already_running: {} ({retry_error})", path.display()))?;
                    writeln!(file, "{}", std::process::id()).map_err(|write_error| format!("desktop_lock_write_failed: {write_error}"))?;
                    Ok(Self { path, file })
                } else {
                    Err(format!("desktop_instance_already_running: {}", path.display()))
                }
            }
            Err(error) => Err(format!("desktop_lock_open_failed: {error}")),
        }
    }

    pub fn release(&self) {
        let _ = self.file.sync_all();
        let _ = remove_file(&self.path);
    }
}

fn read_owner(path: &Path) -> Option<u32> {
    let mut content = String::new();
    File::open(path).ok()?.read_to_string(&mut content).ok()?;
    content.trim().parse().ok()
}

fn process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let filter = format!("PID eq {pid}");
        return Command::new("tasklist").args(["/FI", &filter, "/NH"]).output().map(|output| output.status.success() && String::from_utf8_lossy(&output.stdout).contains(&pid.to_string())).unwrap_or(true);
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_writer_can_hold_a_path() {
        let root = std::env::temp_dir().join(format!("ai-marketing-instance-lock-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let path = root.join("instance.lock");
        let first = InstanceLock::acquire(path.clone()).expect("first lock");
        assert!(InstanceLock::acquire(path.clone()).is_err());
        first.release();
        let second = InstanceLock::acquire(path.clone()).expect("released lock can be reused");
        second.release();
        let _ = std::fs::remove_dir_all(root);
    }
}
