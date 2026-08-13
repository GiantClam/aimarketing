from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SENSITIVE_VALUE = re.compile(
    r'(?i)((?:authorization\s*[:=]\s*(?:bearer|basic)|api[_-]?key\s*[:=]|access[_-]?token\s*[:=]|refresh[_-]?token\s*[:=]|password\s*[:=]|secret\s*[:=])\s*["\']?)[^\s,"\'}]+'
)
SECRET_PREFIX = re.compile(r'(?i)sk-[a-z0-9_-]{12,}')


def redact_sensitive(text: str) -> str:
    return SECRET_PREFIX.sub('<REDACTED>', SENSITIVE_VALUE.sub(r'\1<REDACTED>', text))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-log", type=Path, required=True)
    parser.add_argument("--redacted-log", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--run-summary", type=Path, required=True)
    parser.add_argument("--spike-root", required=True)
    parser.add_argument("--user-profile", required=True)
    args = parser.parse_args()

    text = args.raw_log.read_text(encoding="utf-8", errors="replace")
    for original, replacement in (
        (args.spike_root, "<SPIKE_ROOT>"),
        (args.spike_root.replace("\\", "\\\\"), "<SPIKE_ROOT>"),
        (args.spike_root.replace("\\", "/"), "<SPIKE_ROOT>"),
        (args.spike_root.replace("aimarketing", "aimeting").replace("\\", "\\\\"), "<SPIKE_ROOT>"),
        (args.user_profile, "<USERPROFILE>"),
        (args.user_profile.replace("\\", "\\\\"), "<USERPROFILE>"),
        (args.user_profile.replace("\\", "/"), "<USERPROFILE>"),
    ):
        text = text.replace(original, replacement)
    text = redact_sensitive(text)
    compact_events = []
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        compact = {key: event[key] for key in ("type", "timestamp") if key in event}
        if event.get("type") == "error":
            compact["error"] = event.get("error", {}).get("data", {}).get("message", "unknown")
        part = event.get("part", {})
        if event.get("type") == "text":
            compact["text"] = part.get("text", "")
        elif event.get("type") == "tool_use":
            state = part.get("state", {})
            tool_input = state.get("input", {})
            compact.update(
                {
                    "tool": part.get("tool"),
                    "status": state.get("status"),
                    "input": {
                        key: tool_input[key]
                        for key in ("command", "filePath", "description")
                        if key in tool_input
                    },
                }
            )
        elif event.get("type") == "step_finish":
            compact["reason"] = part.get("reason")
            compact["tokens"] = part.get("tokens", {}).get("total")
        if len(compact) > 2 or event.get("type") in {"step_start", "step_finish"}:
            compact_events.append(redact_sensitive(json.dumps(compact, ensure_ascii=False)))
    args.redacted_log.parent.mkdir(parents=True, exist_ok=True)
    args.redacted_log.write_text("\n".join(compact_events) + "\n", encoding="utf-8")
    run = json.loads(args.run_summary.read_text(encoding="utf-8"))
    required = {
        "run_id", "project_name", "started_utc", "finished_utc", "duration_ms",
        "exit_code", "timeout_seconds", "timed_out", "process_tree_terminated",
        "svg_count_at_finish", "pptx_count_at_finish", "gate_pass", "model",
        "opencode_version", "upstream_commit", "railway_worker_used",
    }
    missing = sorted(required.difference(run))
    if missing:
        raise ValueError(f"run summary is missing measured fields: {', '.join(missing)}")
    summary = {
        "schema_version": 1,
        "verdict": "pass" if run["gate_pass"] else "changes-required",
        "reason": "measured OpenCode + Skill run summary",
        **{key: run[key] for key in sorted(required)},
    }
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
