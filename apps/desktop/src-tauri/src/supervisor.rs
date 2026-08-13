#[cfg(windows)]
#[allow(dead_code)]
mod platform {
    use std::io;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_BASIC_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use std::mem::size_of;

    pub struct JobObject(HANDLE);

    // A Windows kernel job handle is safe to move behind the HostState mutex;
    // all operations remain serialized by that mutex and the handle is closed
    // exactly once by Drop.
    unsafe impl Send for JobObject {}
    unsafe impl Sync for JobObject {}

    impl JobObject {
        pub fn new() -> io::Result<Self> {
            let handle = unsafe { CreateJobObjectW(null(), null()) };
            if handle == null_mut() { return Err(io::Error::last_os_error()); }
            // The Tauri process owns the only job handle. If it crashes or is
            // terminated, Windows closes this handle and kills the complete
            // workflow-host/OpenCode descendant tree automatically.
            let limits = JOBOBJECT_BASIC_LIMIT_INFORMATION {
                PerProcessUserTimeLimit: 0,
                PerJobUserTimeLimit: 0,
                LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                MinimumWorkingSetSize: 0,
                MaximumWorkingSetSize: 0,
                ActiveProcessLimit: 0,
                Affinity: 0,
                PriorityClass: 0,
                SchedulingClass: 0,
            };
            let configured = unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectBasicLimitInformation,
                    &limits as *const _ as *const _,
                    size_of::<JOBOBJECT_BASIC_LIMIT_INFORMATION>() as u32,
                )
            };
            if configured == 0 {
                unsafe { CloseHandle(handle); }
                return Err(io::Error::last_os_error());
            }
            Ok(Self(handle))
        }

        pub fn assign(&self, child: &Child) -> io::Result<()> {
            let process = child.as_raw_handle() as HANDLE;
            if unsafe { AssignProcessToJobObject(self.0, process) } == 0 { return Err(io::Error::last_os_error()); }
            Ok(())
        }

        pub fn terminate(&self) -> io::Result<()> {
            if unsafe { TerminateJobObject(self.0, 1) } == 0 { return Err(io::Error::last_os_error()); }
            Ok(())
        }
    }

    impl Drop for JobObject {
        fn drop(&mut self) { unsafe { CloseHandle(self.0); } }
    }
}

#[cfg(not(windows))]
mod platform {
    use std::io;
    use std::process::Child;
    pub struct JobObject;
    impl JobObject { pub fn new() -> io::Result<Self> { Ok(Self) } pub fn assign(&self, _child: &Child) -> io::Result<()> { Ok(()) } pub fn terminate(&self) -> io::Result<()> { Ok(()) } }
}

#[allow(unused_imports)]
pub use platform::JobObject;
