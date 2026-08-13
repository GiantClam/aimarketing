# Windows Rust LanceDB feasibility spike

This isolated spike proves that current Rust LanceDB can act as an embedded,
per-Vault vector store on Windows x64. It writes Chinese document paths and
chunks into directories containing Chinese characters and spaces, drops the
write connection, reopens the database, and verifies similarity ranking and
Vault isolation. No separate database service is started or contacted.

Run the complete probe from PowerShell:

```powershell
./run.ps1
```

The script first resolves a pinned, vendored `protoc` 31.1 binary (needed by the
Lance build scripts), runs all tests, creates a debug binary, executes the
probe, reads the executable's imported Windows DLL names with Visual Studio
`dumpbin`, and writes common-schema redacted JSON evidence under `evidence/`.
Absolute drive and user paths cause evidence generation to fail.

Run the Rust checks directly when iterating:

```powershell
$env:PROTOC = (& cargo run --locked --quiet --manifest-path protoc-bootstrap/Cargo.toml)
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked --all-targets
cargo run --locked -- --root "runtime/验证 路径 含空格"
```

The exclusive `.feasibility-spike.lock` file is deliberately held with Windows
share mode zero. It gives the desktop integration a deterministic and readable
failure when another process owns the same per-Vault store instead of surfacing
an opaque lower-level filesystem error.

Current evidence from one Windows version is not evidence for the other target
version. Copy this directory to clean Windows 10 22H2 and Windows 11 x64 VMs and
run `run.ps1` independently on both hosts before approving the OpenSpec gate.
