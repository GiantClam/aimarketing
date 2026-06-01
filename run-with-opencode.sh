#!/bin/bash

# Direct OpenCode workflow - no Ralph TUI
# This script runs OpenCode directly with tasks

PROJECT_DIR="/Users/beihuang/Documents/github/aimarketing"
TASK="$1"

cd "$PROJECT_DIR"

echo "=============================================="
echo "  OpenCode Task Runner"
echo "=============================================="
echo ""
echo "Task: $TASK"
echo ""

# Run OpenCode with the task
/Users/beihuang/.opencode/bin/opencode run "$TASK"
