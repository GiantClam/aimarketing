# Manual Autonomous Workflow Guide

## Quick Start

### 1. Start Development Server
```bash
cd /Users/beihuang/Documents/github/aimarketing
npm run dev
```
Website: http://localhost:3000

### 2. Run One Iteration (with visual)
```bash
npx ralph-tui run --prd prd.json --agent opencode --max-iterations 1
```

### 3. Open Browser
```bash
agent-browser open http://localhost:3000
# OR
open http://localhost:3000
```

## Recommended Workflow

1. Open a new terminal and start the dev server:
   ```bash
   cd /Users/beihuang/Documents/github/aimarketing
   npm run dev
   ```

2. In another terminal, run Ralph TUI iterations:
   ```bash
   cd /Users/beihuang/Documents/github/aimarketing
   npx ralph-tui run --prd prd.json --agent opencode --max-iterations 1
   ```

3. Keep your browser open at http://localhost:3000
   - The page will auto-refresh when code changes
   - Use Ctrl+Shift+R for hard refresh

## Commands Reference

```bash
# Run one iteration
npx ralph-tui run --prd prd.json --agent opencode --max-iterations 1

# Run with TUI (interactive, recommended)
npx ralph-tui run --prd prd.json --agent opencode

# Check status
npx ralph-tui status

# Resume previous session
npx ralph-tui resume

# View logs
npx ralph-tui logs
```

## Scripts Available

- `./autonomous-coordinator.sh` - Full automated loop with prompts
- `./start-visual.sh` - Start with browser preview
