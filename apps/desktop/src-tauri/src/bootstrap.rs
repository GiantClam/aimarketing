use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

const WEBVIEW2_BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn webview_repair_progress_messages_for(chinese: bool) -> [&'static str; 3] {
    if chinese {
        [
            "正在检查 WebView2 运行时…",
            "正在下载 WebView2 修复程序…",
            "正在安装 WebView2 并重新探测…",
        ]
    } else {
        [
            "Checking the WebView2 runtime…",
            "Downloading the WebView2 repair package…",
            "Installing WebView2 and probing again…",
        ]
    }
}

fn runtime_repair_progress_messages_for(chinese: bool) -> [&'static str; 3] {
    if chinese {
        [
            "检查本地运行环境…",
            "正在安装或修复本地运行环境…",
            "正在重新探测本地运行环境…",
        ]
    } else {
        [
            "Checking the local runtime…",
            "Installing or repairing the local runtime…",
            "Probing the local runtime again…",
        ]
    }
}

struct StartupProgress {
    #[cfg(windows)]
    hwnd: windows_sys::Win32::Foundation::HWND,
}

impl StartupProgress {
    fn new(message: &str, chinese: bool) -> Self {
        #[cfg(windows)]
        {
            use std::ptr::{null, null_mut};
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                CreateWindowExW, ShowWindow, WS_CAPTION, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
                WS_OVERLAPPED, WS_SYSMENU, SW_SHOW,
            };

            let class = wide("STATIC");
            let title = wide(if chinese { "AI Marketing 环境修复" } else { "AI Marketing environment repair" });
            let hwnd = unsafe {
                CreateWindowExW(
                    WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                    class.as_ptr(),
                    title.as_ptr(),
                    WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
                    0,
                    0,
                    520,
                    140,
                    null_mut(),
                    null_mut(),
                    null_mut(),
                    null(),
                )
            };
            let progress = Self { hwnd };
            if !progress.hwnd.is_null() {
                unsafe { ShowWindow(progress.hwnd, SW_SHOW); }
            }
            progress.update(message);
            progress
        }
        #[cfg(not(windows))]
        {
            let _ = chinese;
            eprintln!("NATIVE_STATUS: {message}");
            Self {}
        }
    }

    fn update(&self, message: &str) {
        #[cfg(windows)]
        {
            if self.hwnd.is_null() { return; }
            let text = wide(message);
            use windows_sys::Win32::Graphics::Gdi::UpdateWindow;
            use windows_sys::Win32::UI::WindowsAndMessaging::SetWindowTextW;
            unsafe {
                SetWindowTextW(self.hwnd, text.as_ptr());
                UpdateWindow(self.hwnd);
            }
        }
        #[cfg(not(windows))]
        eprintln!("NATIVE_STATUS: {message}");
    }
}

impl Drop for StartupProgress {
    fn drop(&mut self) {
        #[cfg(windows)]
        if !self.hwnd.is_null() {
            use windows_sys::Win32::UI::WindowsAndMessaging::DestroyWindow;
            unsafe { DestroyWindow(self.hwnd); }
        }
    }
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(Some(0)).collect()
}

pub fn ensure_webview2() -> Result<(), String> {
    if webview2_installed() { return Ok(()); }
    let chinese = startup_is_chinese();
    let progress_messages = webview_repair_progress_messages_for(chinese);
    let progress = StartupProgress::new(progress_messages[0], chinese);
    let bootstrapper = bundled_bootstrapper().unwrap_or_else(|| std::env::temp_dir().join("AI-Marketing-WebView2Bootstrapper.exe"));
    if !bootstrapper.is_file() {
        progress.update(progress_messages[1]);
        download_bootstrapper(&bootstrapper)?;
    }
    progress.update(progress_messages[2]);
    install_bootstrapper(&bootstrapper)?;
    if webview2_installed() { return Ok(()); }
    Err("webview2_install_incomplete".to_string())
}

fn startup_is_chinese() -> bool {
    #[cfg(windows)]
    {
        let mut buffer = [0_u16; 85];
        let length = unsafe {
            windows_sys::Win32::Globalization::GetUserDefaultLocaleName(
                buffer.as_mut_ptr(),
                buffer.len() as i32,
            )
        };
        if length > 1 {
            return String::from_utf16_lossy(&buffer[..(length - 1) as usize])
                .to_ascii_lowercase()
                .starts_with("zh");
        }
        false
    }
    #[cfg(not(windows))]
    {
        std::env::var("LANG")
            .map(|value| value.to_ascii_lowercase().starts_with("zh"))
            .unwrap_or(false)
    }
}

/// Run the runtime gate before Tauri creates the WebView. The React bootstrap
/// screen remains a diagnostic fallback, but it must not be the first place
/// that repairs a missing green-runtime component.
pub fn ensure_runtime_before_window() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| format!("runtime_exe_unavailable: {error}"))?;
    let executable_dir = executable.parent().ok_or_else(|| "runtime_exe_dir_unavailable".to_string())?;
    let resource_roots = [
        executable_dir.to_path_buf(),
        executable_dir.join("resources"),
        executable_dir.join("dist-runtime"),
        executable_dir.join("_up_").join("dist-runtime"),
        std::env::current_dir().unwrap_or_default().join("apps").join("desktop").join("dist-runtime"),
    ];
    let manifest = resource_roots.iter().flat_map(|root| [
        root.join("runtime-manifest.json"),
        root.join("runtime").join("runtime-manifest.json"),
        root.join("dist-runtime").join("runtime").join("runtime-manifest.json"),
    ]).find(|path| path.is_file()).ok_or_else(|| "runtime_manifest_missing".to_string())?;
    let script = resource_roots.iter().flat_map(|root| [
        root.join("install-desktop-runtime.ps1"),
        root.join("dist-runtime").join("install-desktop-runtime.ps1"),
    ]).find(|path| path.is_file()).ok_or_else(|| "runtime_installer_missing".to_string())?;
    let portable = executable_dir.join("portable.flag").is_file();
    let install_root = if portable {
        executable_dir.join("data")
    } else {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| executable_dir.join("data")).join("AIMarketing")
    };
    if runtime_ready(&resource_roots, &install_root) { return Ok(()); }
    let offline_zip = configured_offline_runtime_zip(&install_root);
    let chinese = startup_is_chinese();
    let progress_messages = runtime_repair_progress_messages_for(chinese);
    let progress = StartupProgress::new(progress_messages[0], chinese);
    progress.update(progress_messages[1]);
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .args(["-ManifestPath"])
        .arg(&manifest)
        .args(["-InstallRoot"])
        .arg(&install_root);
    if let Some(offline_zip) = offline_zip.as_ref() { command.args(["-OfflineZip"]).arg(offline_zip); }
    let status = command
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| format!("runtime_installer_spawn_failed: {error}"))?;
    if !status.success() { return Err(format!("runtime_install_failed:{}", status.code().unwrap_or(-1))); }
    progress.update(progress_messages[2]);
    if runtime_ready(&resource_roots, &install_root) { Ok(()) } else { Err("runtime_install_incomplete".to_string()) }
}

fn runtime_ready(resource_roots: &[PathBuf], install_root: &Path) -> bool {
    let node = configured_runtime_path(install_root, "nodePath")
        .into_iter()
        .flat_map(crate::resolve_windows_command_shim)
        .chain([install_root.join("runtime").join("node").join("node.exe"), install_root.join("node").join("node.exe")])
        .find(|path| path.is_file() && executable_works(path, &["--version"]))
        .or_else(|| system_executable("node"))
        .is_some();
    let opencode = configured_runtime_path(install_root, "opencodePath")
        .into_iter()
        .flat_map(crate::resolve_windows_command_shim)
        .chain([install_root.join("runtime").join("opencode").join("opencode.exe"), install_root.join("opencode").join("opencode.exe")])
        .find(|path| path.is_file() && executable_works(path, &["--version"]))
        .or_else(|| system_executable("opencode"))
        .is_some();
    let python = configured_runtime_path(install_root, "pythonPath")
        .into_iter()
        .chain([install_root.join("runtime").join("python").join("python.exe"), install_root.join("python").join("python.exe")])
        .find(|path| path.is_file() && python_works(path))
        .or_else(|| system_executable("python").filter(|path| python_works(path)))
        .is_some();
    let host = configured_runtime_path(install_root, "hostPath").is_some_and(|path| path.is_file())
        || resource_roots.iter().any(|root| root.join("host.mjs").is_file() || root.join("dist-runtime").join("host.mjs").is_file());
    let knowledge = configured_runtime_path(install_root, "knowledgePath").is_some_and(|path| path.is_file())
        || resource_roots.iter().any(|root| root.join("knowledge.mjs").is_file() || root.join("dist-runtime").join("knowledge.mjs").is_file());
    let skills = configured_runtime_path(install_root, "skillsPath").is_some_and(|path| path.join("ppt-master").join("SKILL.md").is_file() && path.join("ppt-master.manifest.json").is_file())
        || resource_roots.iter().any(|root| {
            let path = if root.join("skills").join("ppt-master").join("SKILL.md").is_file() { root.join("skills") } else { root.join("dist-runtime").join("skills") };
            path.join("ppt-master").join("SKILL.md").is_file() && path.join("ppt-master.manifest.json").is_file()
        });
    let fonts = configured_runtime_path(install_root, "fontsPath").is_some_and(|path| font_asset_works(&path.join("msyh.ttc")))
        || resource_roots.iter().any(|root| font_asset_works(&root.join("fonts").join("msyh.ttc")) || font_asset_works(&root.join("runtime").join("fonts").join("msyh.ttc")) || font_asset_works(&root.join("dist-runtime").join("runtime").join("fonts").join("msyh.ttc")));
    let lancedb = configured_runtime_path(install_root, "lancedbPath").is_some_and(|path| lancedb_ready(&path))
        || [install_root.join("runtime").join("lancedb"), install_root.join("lancedb")].into_iter().any(|path| lancedb_ready(&path))
        || resource_roots.iter().any(|root| lancedb_ready(&root.join("lancedb")) || lancedb_ready(&root.join("runtime").join("lancedb")));
    let embedding = configured_runtime_path(install_root, "embeddingPath").is_some_and(|path| path.is_file())
        || [install_root.join("runtime").join("embedding").join("local-hash-384-v1.json"), install_root.join("embedding").join("local-hash-384-v1.json")].into_iter().any(|path| path.is_file())
        || resource_roots.iter().any(|root| root.join("embedding").join("local-hash-384-v1.json").is_file() || root.join("runtime").join("embedding").join("local-hash-384-v1.json").is_file());
    let database = install_root.join("app.db");
    let migrations = crate::storage::initialize(&database).is_ok() && crate::storage::migrations_ready(&database).unwrap_or(false);
    node && opencode && python && host && knowledge && skills && fonts && lancedb && embedding && migrations
}

fn configured_runtime_path(install_root: &Path, key: &str) -> Option<PathBuf> {
    let value = crate::config::read(&install_root.join("config.json"), install_root).ok()?;
    let configured = value.get("runtime")?.get(key)?.as_str()?;
    std::fs::canonicalize(configured).ok()
}

fn configured_offline_runtime_zip(install_root: &Path) -> Option<PathBuf> {
    let value = crate::config::read(&install_root.join("config.json"), install_root).ok()?;
    let configured = value.get("offlineRuntimeZipPath")?.as_str()?;
    let path = std::fs::canonicalize(configured).ok()?;
    path.is_file().then_some(path)
}

fn lancedb_ready(root: &Path) -> bool {
    root.join("node_modules").join("@lancedb").join("lancedb").join("dist").join("index.js").is_file()
}

pub(crate) fn font_asset_works(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else { return false; };
    if !metadata.is_file() || metadata.len() < 12 { return false; }
    let Ok(mut file) = std::fs::File::open(path) else { return false; };
    let mut header = [0_u8; 12];
    if file.read_exact(&mut header).is_err() { return false; }
    match &header[..4] {
        b"ttcf" => u32::from_be_bytes(header[8..12].try_into().unwrap_or_default()) > 0,
        b"OTTO" | [0, 1, 0, 0] => u16::from_be_bytes(header[4..6].try_into().unwrap_or_default()) > 0,
        _ => false,
    }
}

fn executable_works(path: &Path, args: &[&str]) -> bool {
    Command::new(path).args(args).creation_flags(CREATE_NO_WINDOW).output().map(|output| output.status.success()).unwrap_or(false)
}

fn python_works(path: &Path) -> bool {
    Command::new(path).args(["-c", crate::PPT_PYTHON_PROBE]).creation_flags(CREATE_NO_WINDOW).output().map(|output| output.status.success()).unwrap_or(false)
}

fn system_executable(command: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe").arg(command).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    if !output.status.success() { return None; }
    String::from_utf8_lossy(&output.stdout).lines().map(str::trim).filter(|line| !line.is_empty()).map(PathBuf::from).flat_map(crate::resolve_windows_command_shim).find(|path| path.is_file() && executable_works(path, &["--version"]))
}

pub fn show_startup_error(error: &str) {
    #[cfg(windows)]
    {
        use std::iter::once;
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let (title_text, message_text) = startup_error_messages_for(startup_is_chinese(), error);
        let title: Vec<u16> = title_text.encode_utf16().chain(once(0)).collect();
        let message: Vec<u16> = message_text.encode_utf16().chain(once(0)).collect();
        unsafe { MessageBoxW(std::ptr::null_mut(), message.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR); }
    }
}

fn startup_error_messages_for(chinese: bool, error: &str) -> (String, String) {
    if chinese {
        ("AI Marketing 启动失败".to_string(), format!("无法准备 Windows 本地运行环境。\\n\\n{error}\\n请检查网络或运行时安装包后重新启动。"))
    } else {
        ("AI Marketing startup failed".to_string(), format!("Unable to prepare the Windows local runtime.\\n\\n{error}\\nCheck the network or runtime installer and restart the app."))
    }
}

fn bundled_bootstrapper() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let executable_dir = executable.parent()?;
    [
        executable_dir.join("WebView2Bootstrapper.exe"),
        executable_dir.join("_up_").join("WebView2Bootstrapper.exe"),
        executable_dir.join("dist-runtime").join("WebView2Bootstrapper.exe"),
    ].into_iter().find(|path| path.is_file())
}

fn download_bootstrapper(destination: &Path) -> Result<(), String> {
    let destination = destination.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile '{}'",
        WEBVIEW2_BOOTSTRAPPER_URL, destination,
    );
    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| format!("webview2_download_spawn_failed: {error}"))?;
    if !status.success() { return Err(format!("webview2_download_failed:{}", status.code().unwrap_or(-1))); }
    Ok(())
}

fn install_bootstrapper(bootstrapper: &Path) -> Result<(), String> {
    let status = Command::new(bootstrapper)
        .args(["/silent", "/install"])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| format!("webview2_install_spawn_failed: {error}"))?;
    if !status.success() { return Err(format!("webview2_install_failed:{}", status.code().unwrap_or(-1))); }
    Ok(())
}

fn webview2_installed() -> bool {
    #[cfg(windows)]
    {
        let registry_keys = [
            r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            r"HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ];
        if registry_keys.iter().any(|key| {
            Command::new("reg.exe")
                .args(["query", key, "/v", "pv"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map(|output| output.status.success() && String::from_utf8_lossy(&output.stdout).contains("pv"))
                .unwrap_or(false)
        }) { return true; }
        let roots = [
            std::env::var_os("PROGRAMFILES(X86)").map(PathBuf::from),
            std::env::var_os("PROGRAMFILES").map(PathBuf::from),
            std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
        ];
        return roots.into_iter().flatten().any(|root| root.join("Microsoft/EdgeWebView/Application").is_dir());
    }
    #[cfg(not(windows))]
    { true }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrapper_url_is_official_webview2_endpoint() {
        assert!(WEBVIEW2_BOOTSTRAPPER_URL.starts_with("https://go.microsoft.com/"));
    }

    #[test]
    fn powershell_path_escaping_doubles_single_quotes() {
        assert_eq!("C:\\Users\\O''Brien\\setup.exe", "C:\\Users\\O'Brien\\setup.exe".replace('\'', "''"));
    }

    #[test]
    fn runtime_gate_is_explicitly_pre_window() {
        let source = include_str!("bootstrap.rs");
        assert!(source.contains("ensure_runtime_before_window"));
        assert!(source.contains("runtime_install_incomplete"));
    }

    #[test]
    fn healthy_runtime_returns_before_spawning_the_installer() {
        let source = include_str!("bootstrap.rs");
        let ready_check = source.find("if runtime_ready(&resource_roots, &install_root) { return Ok(()); }").unwrap();
        let installer_spawn = source.find("Command::new(\"powershell.exe\")").unwrap();
        assert!(ready_check < installer_spawn, "healthy runtime must bypass repair before PowerShell is spawned");
    }

    #[test]
    fn pre_window_python_gate_uses_the_shared_ppt_probe() {
        let source = include_str!("bootstrap.rs");
        assert!(source.contains("crate::PPT_PYTHON_PROBE"));
    }

    #[test]
    fn pre_window_gate_includes_sqlite_migrations() {
        let source = include_str!("bootstrap.rs");
        assert!(source.contains("migrations_ready"));
    }

    #[test]
    fn pre_window_gate_reuses_a_configured_offline_runtime_zip() {
        let root = std::env::temp_dir().join(format!("ai-marketing-bootstrap-offline-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let zip = root.join("runtime bundle.zip");
        std::fs::write(&zip, b"fixture").unwrap();
        let mut value = crate::config::default_config(&root);
        value["offlineRuntimeZipPath"] = serde_json::Value::String(zip.to_string_lossy().into_owned());
        crate::config::write(&root.join("config.json"), &value).unwrap();

        assert_eq!(configured_offline_runtime_zip(&root), Some(std::fs::canonicalize(zip).unwrap()));
        let source = include_str!("bootstrap.rs");
        assert!(source.contains("-OfflineZip"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn pre_window_gate_reuses_a_persisted_runtime_path() {
        let root = std::env::temp_dir().join(format!("ai-marketing-bootstrap-path-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let fixture = root.join("node.exe");
        std::fs::write(&fixture, b"fixture").unwrap();
        let canonical = std::fs::canonicalize(&fixture).unwrap();
        let mut value = crate::config::default_config(&root);
        value["runtime"]["nodePath"] = serde_json::Value::String(canonical.to_string_lossy().into_owned());
        crate::config::write(&root.join("config.json"), &value).unwrap();

        assert_eq!(configured_runtime_path(&root, "nodePath"), Some(canonical));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn font_probe_rejects_corrupt_files_and_accepts_valid_font_headers() {
        let root = std::env::temp_dir().join(format!("ai-marketing-font-probe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let font = root.join("msyh.ttc");
        std::fs::write(&font, b"corrupt-font").unwrap();
        assert!(!font_asset_works(&font));
        let mut valid = [0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0, 0, 0, 0, 1];
        std::fs::write(&font, valid).unwrap();
        assert!(font_asset_works(&font));
        valid[0] = b'x';
        std::fs::write(&font, valid).unwrap();
        assert!(!font_asset_works(&font));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn webview_repair_progress_has_visible_ordered_stages() {
        assert_eq!(
            webview_repair_progress_messages_for(true),
            [
                "正在检查 WebView2 运行时…",
                "正在下载 WebView2 修复程序…",
                "正在安装 WebView2 并重新探测…",
            ]
        );
        assert_eq!(
            webview_repair_progress_messages_for(false),
            [
                "Checking the WebView2 runtime…",
                "Downloading the WebView2 repair package…",
                "Installing WebView2 and probing again…",
            ]
        );
    }

    #[test]
    fn runtime_repair_progress_has_visible_ordered_stages() {
        assert_eq!(
            runtime_repair_progress_messages_for(true),
            [
                "检查本地运行环境…",
                "正在安装或修复本地运行环境…",
                "正在重新探测本地运行环境…",
            ]
        );
        assert_eq!(
            runtime_repair_progress_messages_for(false),
            [
                "Checking the local runtime…",
                "Installing or repairing the local runtime…",
                "Probing the local runtime again…",
            ]
        );
    }

    #[test]
    fn startup_errors_follow_the_selected_locale() {
        assert_eq!(startup_error_messages_for(true, "runtime_install_incomplete"), (
            "AI Marketing 启动失败".to_string(),
            "无法准备 Windows 本地运行环境。\\n\\nruntime_install_incomplete\\n请检查网络或运行时安装包后重新启动。".to_string(),
        ));
        assert_eq!(startup_error_messages_for(false, "runtime_install_incomplete"), (
            "AI Marketing startup failed".to_string(),
            "Unable to prepare the Windows local runtime.\\n\\nruntime_install_incomplete\\nCheck the network or runtime installer and restart the app.".to_string(),
        ));
    }
}
