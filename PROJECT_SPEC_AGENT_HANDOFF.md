# AgentChat: Comprehensive Project Architecture & Agent Hand-off Specification

> **GitHub Repository**: [https://github.com/Diganthf/AgentChat.git](https://github.com/Diganthf/AgentChat.git)  
> **Live Production Web App**: [https://agentchat-1jpo.onrender.com](https://agentchat-1jpo.onrender.com)  
> **Git Clone Command**: `git clone https://github.com/Diganthf/AgentChat.git`  
> **Target Audience**: AI Coding Assistants & Full-Stack Developers Continuing Development  
> **Current Version**: 2.2.0 (Production Stable)

---

## 1. Executive Project Overview

**AgentChat** is an ultra-fast, privacy-first, zero-dependency AI agent workspace and model aggregator. It acts both as a desktop app (via lightweight local runner/shortcut) and a cloud-hosted web platform (deployed on Render/Docker).

### Core Differentiators
1. **Zero External Python Frameworks**: Built using standard library `http.server` + socket/threading/async streaming. No heavyweight Flask, FastAPI, or Django overhead. The server starts in **< 150 milliseconds**, making container cold-starts virtually instantaneous.
2. **Multi-Provider Protocol Translation Engine**: Bridges differences between OpenAI Chat Completions, Anthropic Messages (`/v1/messages`), Google Gemini API, Puter.ai, Groq LPUs, and custom proxies seamlessly.
3. **Multi-User Privacy Isolation**: Every visitor gets an isolated anonymous guest session with no cross-contamination. Dedicated SQLite-backed authentication (`/api/auth/*`) with PBKDF2 password hashing and cloud sync (`/api/sync/*`).
4. **Live Reasoning / CoT Streaming**: Automatically intercepts `<thought>`, `<thinking>`, and `reasoning_content` deltas from reasoning models (e.g., DeepSeek R1, Qwen 3.8, Claude Opus) and displays them in expandable accordions.
5. **Ultra-Lean Mode & Token Pruning**: Strip unnecessary overhead down to ~15 tokens, saving up to 75% prompt tokens while retaining system instructions.
6. **Built-in Developer Tools**:
   - Local Project Codebase Scanner & File Tree Viewer.
   - Custom Agent Skills builder (prompt augmentations).
   - MCP (Model Context Protocol) Server runner and allowlist.
   - Web Search & PDF/Document Attachment Analysis.
   - Client-side AES Zero-Knowledge API Key Vault.

---

## 2. Directory Layout & File Responsibilities

```
AgentChat/
├── server.py                     # [CORE BACKEND] ~130KB. Zero-dep HTTP server, proxy router, SSE streaming, SQLite Auth, Sync API
├── config.json                   # Local/default configuration file (providers, endpoints, default keys)
├── config.deploy.json            # Production deployment config template
├── config.example.json           # Sample template for new environments
├── requirements.txt              # Standard dependencies (pure Python fallback; requests/urllib)
├── Dockerfile                    # Containerization spec for Render/Zeabur/Fly.io
├── render.yaml                   # Infrastructure-as-code blueprint for Render
├── mcp_allowlist.json            # JSON registry of permissible local MCP command binaries
├── eval_compression.py           # Evaluation script measuring context compression efficacy
├── run.bat / launch.vbs          # Windows 1-click silent desktop launcher
├── frontend/
│   ├── index.html                # Single Page App markup (M3 Drawer, Topbar Scroll Track, Modals, Chat Viewport)
│   ├── style.css                 # 3,500+ lines of responsive CSS (CSS variables, Dark theme, 100dvh mobile bounds)
│   ├── app.js                    # 4,200+ lines of client logic (SSE stream parser, Markdown/KaTeX/Prism renderer, sync)
│   ├── manifest.json             # PWA Progressive Web App configuration
│   ├── favicon.ico / icon.png    # High-resolution application brand assets
└── PROJECT_SPEC_AGENT_HANDOFF.md # This architecture guide
```

---

## 3. Backend Architecture (`server.py`)

### A. HTTP Request Dispatcher
The server runs an instance of `ThreadingHTTPServer` bound to port `5050` (or `os.environ.get("PORT", 5050)`).
* `GET /`: Serves `frontend/index.html`.
* `GET /<path>`: Static asset handler (`style.css`, `app.js`, etc.) with correct MIME types and gzip/deflate compression.
* `POST /api/chat`: Primary chat streaming endpoint. Accepts OpenAI-compatible payload and returns `text/event-stream` SSE tokens.
* `GET /api/models`: Returns unified list of free, frontier, and custom models available across all active providers.
* `GET /api/model-status`: Probes active provider availability and returns latency health check.
* `POST /api/auth/register` & `POST /api/auth/login`: User creation, session generation, PBKDF2 hashing.
* `GET /api/auth/me`: Validates `Authorization: Bearer <token>` or `X-User-Session`.
* `GET /api/sync/pull` & `POST /api/sync/push`: Cross-device cloud sync for chats, keys, and preferences.
* `POST /api/project/scan`: Scans local directory trees, respects `.gitignore`, and generates project file maps.
* `POST /api/mcp/run`: Spawns and manages MCP server subprocesses according to `mcp_allowlist.json`.

### B. Smart Model Routing Protocol
When `/api/chat` receives a request:
1. `smart_route_model_provider(model_name, active_provider)` dynamically selects the best provider:
   - `claude-opus-4-8` or `claude-*` $\to$ **JustDoWork** (`api.justwoker.icu/v1/messages`).
   - `gemini-3.6-flash`, `gemini-2.5-pro` $\to$ **Google AI Studio** (`generativelanguage.googleapis.com/v1beta/openai`).
   - `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` $\to$ **Groq Cloud LPUs** (`api.groq.com/openai`).
   - `puter` models $\to$ **Puter.ai** (`api.puter.com/puterai/openai/v1`).
2. **Anthropic Message Converter**: If routing to JustDoWork, converts OpenAI `messages: [{"role": "system", ...}, {"role": "user", ...}]` into Anthropic's native `system: "..."` and `messages: [{"role": "user", "content": ...}]` format, while mapping streaming delta chunks back to standard OpenAI SSE tokens (`data: {"choices":[{"delta":{"content":"..."}}]}`).
3. **Gemini Deprecation Fallback**: If a client requests deprecated `gemini-2.0-flash` or `gemini-2.5-flash`, the router automatically rewrites the model parameter to `gemini-3.6-flash`.

---

## 4. Frontend Architecture (`frontend/`)

### A. Material Design 3 Responsive System
* **Desktop ($> 1180px$)**: Full sidebar with navigation rail (Chats, Models, Skills, Projects, MCP, Settings), fixed left drawer button, scrollable topbar track, and pinned user profile.
* **Medium Screen ($769px - 1180px$)**: Automatically hides redundant pills (`.effort-pill-wrapper`, `.token-badge`) since effort is managed directly in the AgentRouter bar below.
* **Mobile ($\le 768px$)**:
  - Bound to `100dvh` to eliminate mobile browser URL-bar jumping.
  - Sidebar transforms into a touch-friendly slide-over drawer with dark backdrop (`.sidebar-backdrop`).
  - Topbar contains a touch-scrollable track (`.topbar-scroll-track`) allowing swipe access to all model pills without clipping.
  - User profile chip collapses to a sleek circular avatar icon.

### B. SSE Stream Parser & Markdown Engine
* Reads chunked `ReadableStream` from `fetch("/api/chat")`.
* Handles both standard content deltas and thinking blocks (`<thought>...</thought>`).
* Code blocks feature copy buttons, syntax highlighting (Prism.js), and quick insert into chat.
* LaTeX math formulas rendered with KaTeX.

### C. Client Storage & Sync
* `localStorage` keys:
  - `agentchat_sessions`: Stored chat threads and messages.
  - `agentchat_session_token`: Authenticated user token.
  - `agentchat_active_model`: User's selected model.
  - `agentchat_client_key_<provider>`: User's custom BYOK keys.
  - `agentchat_lean_mode`: Ultra-lean mode boolean flag.

---

## 5. Environment Variables & Production Secrets

On production servers (e.g. Render Dashboard $\to$ Environment):
* `PORT`: Default `5050` (Render dynamically assigns this).
* `JUSTDOWORK_API_KEY`: API key for JustDoWork proxy (`api.justwoker.icu`).
* `AGENTROUTER_API_KEY`: Key for AgentRouter proxy (`agentrouter.org`).
* `GOOGLE_API_KEY`: Google AI Studio Gemini API key.
* `GROQ_API_KEY`: Groq Cloud developer key.
* `OPENROUTER_API_KEY`: OpenRouter gateway key.
* `AGENTCHAT_ACCESS_PASSWORD`: Optional deployment-wide master password. If left empty, site is publicly open without password prompt.

---

## 6. How to Run & Test Locally

```bash
# 1. Clone repository
git clone https://github.com/Diganthf/AgentChat.git
cd AgentChat

# 2. Run local server (zero pip dependencies required)
python server.py

# 3. Open in browser
http://127.0.0.1:5050
```

---

## 7. Recommended Next Features for Future Agents

1. **RAG / Local Embeddings for Projects**:
   - `server.py` already includes `/api/project/scan`. Integrating a lightweight BM25 or sqlite-vss vector index will allow users to query their codebases semantically.
2. **Native WebRTC Voice Interface**:
   - Add browser SpeechRecognition / Web Speech API in `app.js` with instant audio streaming.
3. **Artifacts Canvas / Live Sandbox**:
   - Render HTML/JS generated in assistant responses inside an isolated `<iframe>` sandbox tab alongside the chat.
4. **Google OAuth 2.0 Direct Callback**:
   - The UI includes the Google Identity Services button. Wiring a standard `/api/auth/google/callback` with client ID and secret will allow 1-click Google account sync.
