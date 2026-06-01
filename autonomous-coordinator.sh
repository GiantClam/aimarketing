#!/bin/bash

# Autonomous Workflow Coordinator with Visual Feedback
# Opens website after each iteration for user review

set -e

PROJECT_DIR="/Users/beihuang/Documents/github/aimarketing"
RALPH_CONFIG="$PROJECT_DIR/.ralph-tui/config.toml"
PRD_FILE="$PROJECT_DIR/prd.json"
MAX_ITERATIONS=10

echo "=============================================="
echo "  AI Marketing Platform - Autonomous Coordinator"
echo "=============================================="
echo ""

# Check prerequisites
if [ ! -f "$PRD_FILE" ]; then
    echo "PRD file not found: $PRD_FILE"
    exit 1
fi

if [ ! -f "$RALPH_CONFIG" ]; then
    echo "Ralph config not found: $RALPH_CONFIG"
    exit 1
fi

echo "Project: AI Marketing Platform"
echo "PRD: $PRD_FILE"
echo "Max Iterations: $MAX_ITERATIONS"
echo ""

# Start development servers if not running
echo "Starting development servers..."
cd "$PROJECT_DIR"

# Check if frontend is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   Starting frontend (Next.js)..."
    npm run dev > /dev/null 2>&1 &
    FRONTEND_PID=$!
    echo "   Frontend PID: $FRONTEND_PID"
else
    echo "   Frontend already running at localhost:3000"
fi

# Wait for frontend to be ready
echo "   Waiting for frontend..."
for i in {1..30}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "   Frontend is ready!"
        break
    fi
    sleep 1
done

echo ""
echo "=============================================="
echo "  Starting Autonomous Iterations"
echo "=============================================="
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo "========================================"
    echo "  Iteration $i of $MAX_ITERATIONS"
    echo "========================================"
    echo ""

    # Run one iteration with Ralph TUI (headless, structured output)
    echo "Running iteration $i..."
    npx ralph-tui run \
        --prd "$PRD_FILE" \
        --agent opencode \
        --no-tui \
        --max-iterations 1 \
        --headless 2>&1 | tee "/tmp/ralph-iteration-$i.log"

    echo ""
    echo "Opening website for review..."
    echo ""

    # Open website in browser
    agent-browser open http://localhost:3000 2>/dev/null || echo "(Browser opened)"

    # Take a screenshot
    SCREENSHOT_DIR="$PROJECT_DIR/screenshots"
    mkdir -p "$SCREENSHOT_DIR"
    
    echo ""
    echo "========================================"
    echo "  Iteration $i Complete - Review Required"
    echo "========================================"
    echo ""
    echo "Website is now open at: http://localhost:3000"
    echo ""
    echo "Options:"
    echo "  [c] Continue to next iteration"
    echo "  [s] Skip remaining iterations (finish)"
    echo "  [q] Quit"
    echo ""
    read -p "Your choice (c/s/q): " choice

    case "$choice" in
        c|C)
            echo "Continuing to iteration $((i+1))..."
            ;;
        s|S)
            echo "Skipping remaining iterations..."
            break
            ;;
        q|Q)
            echo "Quitting..."
            exit 0
            ;;
        *)
            echo "Invalid choice, continuing..."
            ;;
    esac
done

echo ""
echo "=============================================="
echo "  Autonomous Workflow Complete"
echo "=============================================="
echo ""
echo "Logs: /tmp/ralph-*.log"
echo "Website: http://localhost:3000"
echo ""
