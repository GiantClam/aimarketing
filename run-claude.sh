#!/bin/bash

# Claude Code Task Runner with Visual Feedback
# Runs one task from prd.json and opens website for review

PROJECT_DIR="/Users/beihuang/Documents/github/aimarketing"
PRD_FILE="$PROJECT_DIR/prd.json"
TASK_NUM="${1:-1}"

echo "=============================================="
echo "  AI Marketing Platform - Task $TASK_NUM"
echo "=============================================="
echo ""

# Get task from prd.json
TASK_TITLE=$(cat "$PRD_FILE" | jq -r ".userStories[$((TASK_NUM-1))].title")
TASK_DESC=$(cat "$PRD_FILE" | jq -r ".userStories[$((TASK_NUM-1))].description")

echo "Task: $TASK_TITLE"
echo ""
echo "Description:"
echo "$TASK_DESC"
echo ""

# Prompt for Claude
PROMPT="Implement the following user story for an AI Marketing Platform:

Task $TASK_NUM: $TASK_TITLE

Requirements:
$TASK_DESC

Follow best practices:
- Use Next.js 15 with TypeScript
- Create proper API routes in app/api/
- Use React Server Components where appropriate
- Return a summary of files created and changes made

Project location: $PROJECT_DIR
PRD location: $PRD_FILE"

# Run Claude Code
cd "$PROJECT_DIR"
echo "Running Claude Code..."
echo ""

claude --print "$PROMPT" 2>&1

echo ""
echo "=============================================="
echo "  Task Complete"
echo "=============================================="
echo ""
echo "🌐 Open http://localhost:3000 to review changes"
echo "   (Run 'npm run dev' first if server not running)"
