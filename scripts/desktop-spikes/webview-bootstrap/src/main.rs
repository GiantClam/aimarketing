use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

const WEBVIEW2_CLIENT_GUID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

#[derive(Debug)]
struct Options {
    simulate_missing: bool,
    non_interactive: bool,
    repair_script: Option<PathBuf>,
    sentinel: Option<PathBuf>,
}

fn parse_options() -> Result<Options, String> {
    let mut options = Options {
        simulate_missing: false,
        non_interactive: false,
        repair_script: None,
        sentinel: None,
    };
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--simulate-missing" => options.simulate_missing = true,
            "--non-interactive" => options.non_interactive = true,
            "--repair-script" => {
                options.repair_script = Some(PathBuf::from(
                    args.next().ok_or("--repair-script requires a path")?,
                ));
            }
            "--sentinel" => {
                options.sentinel = Some(PathBuf::from(
                    args.next().ok_or("--sentinel requires a path")?,
                ));
            }
            _ => return Err(format!("unknown argument: {arg}")),
        }
    }
    Ok(options)
}

fn registry_has_webview2() -> bool {
    [
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients",
        r"HKCU\Software\Microsoft\EdgeUpdate\Clients",
    ]
    .iter()
    .any(|root| {
        Command::new("reg.exe")
            .args([
                "query",
                &format!(r"{}\{}", root, WEBVIEW2_CLIENT_GUID),
                "/v",
                "pv",
            ])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    })
}

fn filesystem_has_webview2() -> bool {
    let root = Path::new(r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application");
    root.read_dir()
        .map(|entries| {
            entries.filter_map(Result::ok).any(|entry| {
                entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
                    && entry.file_name().to_string_lossy().contains('.')
            })
        })
        .unwrap_or(false)
}

fn webview2_available(options: &Options) -> bool {
    if options.simulate_missing {
        return options
            .sentinel
            .as_ref()
            .map(|path| path.is_file())
            .unwrap_or(false);
    }
    registry_has_webview2() || filesystem_has_webview2()
}

#[cfg(windows)]
fn show_native_status(message: &str, non_interactive: bool) {
    eprintln!("NATIVE_STATUS: {message}");
    if non_interactive {
        return;
    }
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    let body: Vec<u16> = OsStr::new(message).encode_wide().chain(Some(0)).collect();
    let title: Vec<u16> = OsStr::new("CoworkAny 环境修复")
        .encode_wide()
        .chain(Some(0))
        .collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            0x0000_0040,
        );
    }
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(
        hwnd: *mut std::ffi::c_void,
        text: *const u16,
        caption: *const u16,
        kind: u32,
    ) -> i32;
}

#[cfg(not(windows))]
fn show_native_status(message: &str, _non_interactive: bool) {
    eprintln!("NATIVE_STATUS: {message}");
}

fn run_repair(script: &Path, sentinel: Option<&Path>) -> Result<(), String> {
    let mut command = Command::new("powershell.exe");
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
    ]);
    command.arg(script);
    if let Some(path) = sentinel {
        command.arg("-Sentinel").arg(path);
    }
    let status = command
        .status()
        .map_err(|error| format!("cannot start repair script: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("repair script exited with {status}"))
    }
}

fn main() -> ExitCode {
    let options = match parse_options() {
        Ok(options) => options,
        Err(error) => {
            eprintln!("BOOTSTRAP_ERROR: {error}");
            return ExitCode::from(64);
        }
    };

    if !webview2_available(&options) {
        show_native_status(
            "WebView2 不可用，正在主界面创建前自动修复运行环境。",
            options.non_interactive,
        );
        let Some(script) = options.repair_script.as_deref() else {
            eprintln!("BOOTSTRAP_BLOCKED: WebView2 missing and no repair script supplied");
            return ExitCode::from(20);
        };
        if let Err(error) = run_repair(script, options.sentinel.as_deref()) {
            show_native_status(
                &format!("WebView2 修复失败，应用保持阻塞。\n{error}"),
                options.non_interactive,
            );
            return ExitCode::from(21);
        }
    }

    if !webview2_available(&options) {
        show_native_status(
            "WebView2 修复脚本已结束，但重新探测仍失败，应用保持阻塞。",
            options.non_interactive,
        );
        return ExitCode::from(22);
    }

    println!("WEBVIEW_READY: post-repair probe passed; WebView creation may proceed");
    ExitCode::SUCCESS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulated_probe_requires_sentinel() {
        let path = env::temp_dir().join("coworkany-webview-spike-missing");
        let _ = std::fs::remove_file(&path);
        let options = Options {
            simulate_missing: true,
            non_interactive: true,
            repair_script: None,
            sentinel: Some(path),
        };
        assert!(!webview2_available(&options));
    }
}
