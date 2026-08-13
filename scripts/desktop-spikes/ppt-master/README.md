# ppt-master Windows feasibility spike

This isolated spike exercises the upstream `hugohe3/ppt-master` Skill through a
real headless OpenCode session and a private Python virtual environment. It does
not call the application's Railway worker or modify production paths.

The run is intentionally split into independent layers:

1. `setup.ps1` resolves Python and OpenCode once, downloads the pinned upstream
   Skill, creates the private venv, installs upstream requirements, and prepares
   a private-font raster asset.
2. `invoke-opencode.ps1` runs OpenCode in the upstream repository. The checked-in
   prompt requires the Skill's Quick Generate route and absolute private-Python
   commands.
3. `inspect_pptx.py` opens the package with both `zipfile` and `python-pptx` and
   asserts 16:9 geometry, editable Chinese text, a picture, and declared font
   evidence.
4. `office_preview.ps1` opens the deck with desktop PowerPoint COM and exports
   every slide to PNG as an independent render/open check.

Run from PowerShell:

```powershell
./setup.ps1
./invoke-opencode.ps1 # hard 600-second deadline by default
./verify.ps1          # only after OpenCode produced a deck
```

Generated environments and the downloaded upstream repository are ignored.
Redacted evidence and the final smoke-test artifact are retained under
`evidence/` and `artifacts/`.

If OpenCode does not produce a deck, do not treat a deterministic local deck as
a substitute for the gate. `make_auxiliary_deck.py` exists only to isolate and
diagnose the remaining Python/PPTX/Office/font mechanics.
