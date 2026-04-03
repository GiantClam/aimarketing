# AI Marketing Platform

AI Marketing 鏄竴涓互 Next.js 涓烘牳蹇冪殑浼佷笟绾?AI 钀ラ攢宸ヤ綔鍙帮紝褰撳墠涓昏兘鍔涘寘鎷細

- 澶氬钩鍙板浘鏂囧啓浣?- 涓撳椤鹃棶瀵硅瘽
- 瑙嗛鐢熸垚鍓嶇宸ヤ綔鍙?
## 鎶€鏈爤

- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
- Backend in this repo: Next.js Route Handlers / Node.js
- Database: PostgreSQL / Neon
- Writer models: OpenRouter + Gemini image generation
- Video agent: external service via `AGENT_URL`

## 褰撳墠鏋舵瀯

鏈粨搴撲笉鍐嶅唴缃?`saleagent` Git submodule銆?
瑙嗛鐢熸垚鑳藉姏浠嶇劧淇濈暀锛屼絾閲囩敤澶栭儴鏈嶅姟妯″紡锛?
- 鍓嶇鍜屼唬鐞嗘帴鍙ｅ湪鏈粨搴撲腑
- 鐪熸鐨勮棰?agent 鏈嶅姟鍗曠嫭閮ㄧ讲
- 鏈粨搴撻€氳繃 `AGENT_URL` 鎴?`NEXT_PUBLIC_AGENT_URL` 璁块棶璇ユ湇鍔?
## 蹇€熷紑濮?
### 1. 瀹夎渚濊禆

```bash
pnpm install
```

### 2. 閰嶇疆鐜鍙橀噺

鍦ㄩ」鐩牴鐩綍閰嶇疆 `.env` 鎴?`.env.local`銆?
鍏抽敭鍙橀噺锛?
```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 澶栭儴瑙嗛 agent 鏈嶅姟
AGENT_URL=http://localhost:8000
NEXT_PUBLIC_AGENT_URL=http://localhost:8000

# writer
OPENROUTER_API_KEY=...
SERPER_API_KEY=...
SERPER_API_BASE=https://google.serper.dev
SERPER_SCRAPE_API_BASE=https://scrape.serper.dev
GOOGLE_AI_API_KEY=...
```

### 3. 鍚姩鍓嶇

```bash
pnpm dev
```

璁块棶 `http://localhost:3000`銆?
## 鏈湴瑙嗛寮€鍙?
濡傛灉浣犻渶瑕佹湰鍦拌皟璇曡棰戠敓鎴愬姛鑳斤紝璇峰崟鐙噯澶?video agent 鏈嶅姟锛岃€屼笉鏄緷璧栨湰浠撳簱瀛愭ā鍧椼€?
鎺ㄨ崘鏂瑰紡锛?
1. 鍗曠嫭鍏嬮殕骞惰繍琛?`saleagent` 浠撳簱
2. 鍦ㄦ湰浠撳簱涓妸 `AGENT_URL` / `NEXT_PUBLIC_AGENT_URL` 鎸囧悜閭ｄ釜鏈嶅姟

## 椤圭洰缁撴瀯

```text
aimarketing/
鈹溾攢 app/
鈹? 鈹溾攢 api/
鈹? 鈹? 鈹溾攢 crewai/         # 瑙嗛 agent 浠ｇ悊鎺ュ彛
鈹? 鈹? 鈹斺攢 writer/         # 鍐欎綔宸ヤ綔鍙板悗绔?鈹? 鈹斺攢 dashboard/
鈹溾攢 components/
鈹溾攢 lib/
鈹? 鈹溾攢 saleagent-client.ts
鈹? 鈹斺攢 writer/
鈹溾攢 scripts/
```

## 鏂囨。

- [INTEGRATION.md](/d:/github/aimarketing/INTEGRATION.md)
- [VIDEO_GENERATION_WORKFLOW.md](/d:/github/aimarketing/VIDEO_GENERATION_WORKFLOW.md)
- [SORA2_SETUP.md](/d:/github/aimarketing/SORA2_SETUP.md)
- [SUPABASE_RLS_FIX.md](/d:/github/aimarketing/SUPABASE_RLS_FIX.md)

## Writer Memory + Soul

Writer personalization uses `userId + agentType` as the hard scope key.

- Same `agentType`: memory is shared across sessions.
- Different `agentType`: memory is strictly isolated.

### Feature flags

Add these environment variables if you want to enable memory in non-default environments:

```bash
WRITER_MEMORY_ENABLED=false
WRITER_SOUL_ENABLED=false
WRITER_MEMORY_EXTRACT_ENABLED=false
WRITER_MEMORY_MAX_ITEMS_PER_USER_AGENT=200
WRITER_MEMORY_RETRIEVAL_TIMEOUT_MS=80
WRITER_MEMORY_EXTRACT_TIMEOUT_MS=2000
WRITER_MEMORY_MAX_CONTENT_CHARS=1500
```

### Database migration

```bash
node scripts/run-writer-memory-migration.js
```

Or run the full pipeline:

```bash
node scripts/run-all-db-migrations.js
```

### API endpoints

- `GET/POST /api/writer/memory/items`
- `GET/PATCH/DELETE /api/writer/memory/items/:memoryId`
- `GET/PATCH /api/writer/memory/profile`
