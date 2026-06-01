#!/bin/bash

# Run OpenCode with Kimi2.5 free model
# No API key needed!

PROJECT_DIR="/Users/beihuang/Documents/github/aimarketing"
TASK="$1"

cd "$PROJECT_DIR"

echo "=============================================="
echo "  Running with Kimi2.5 Free Model"
echo "=============================================="
echo ""

if [ -z "$TASK" ]; then
  echo "Usage: ./run-kimi.sh \"Your task description\""
  echo ""
  echo "Example:"
  echo "  ./run-kimi.sh \"Create a content generation API for Xiaohongshu posts\""
  exit 1
fi

echo "Task: $TASK"
echo "..."

# Run OpenCode with Kimi2.5 free model
/Users/beihuang/.opencode/bin/opencode \
  --model opencode/kimi-k2.5-free \
  run "$TASK"
