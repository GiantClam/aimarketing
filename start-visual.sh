#!/bin/bash

# Start Ralph TUI with browser preview side-by-side
# This opens the website immediately and keeps it updated

PROJECT_DIR="/Users/beihuang/Documents/github/aimarketing"
PRD_FILE="$PROJECT_DIR/prd.json"

echo "=============================================="
echo "  AI Marketing Platform - Visual Mode"
echo "=============================================="
echo ""
echo "This will:"
echo "1. Start Ralph TUI (shows progress in terminal)"
echo "2. Open website preview in browser"
echo ""
echo "The browser will auto-refresh as changes are made."
echo ""

# Open browser in background
agent-browser open http://localhost:3000 2>/dev/null || open http://localhost:3000 || echo "Please open http://localhost:3000 manually"

# Wait a moment
sleep 2

# Start Ralph TUI in normal mode (not headless)
cd "$PROJECT_DIR"
npx ralph-tui run \
    --prd "$PRD_FILE" \
    --agent opencode \
    --max-iterations 10
