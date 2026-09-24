# AgentChat — project guide for Claude Code

A single, fast web workspace for chatting with many AI models (Claude, Gemini,
DeepSeek, Qwen, Llama, GPT-OSS) through one interface, with automatic context
compression, a per-user encrypted key vault, and cross-device sync.
Personal, single-user tool. Deployed on Render; repo pushed to GitHub.

## Run / develop
- Start the server:  `python server.py`  (serves API + the `frontend/` static files on PORT, default 5050)
- No build step, no bundler. Edit files in `frontend/` and reload the browser.
- Syntax check before committing:
  - `python -m py_compile server.py`
  - `node --check frontend/app.js` (and `frontend/landing.js`)

## Architecture (keep it this way)
- **Backend:** `server.py` — ONE file, Python standard library only
  (`http.server` ThreadingHTTPServer, `urllib`, `sqlite3`). No Flask/FastAPI.
  The only third-party deps are in `requirements.txt` (pypdf, cryptography,
  curl_cffi, python-pptx, PyMuPDF, pg8000). Prefer stdlib; add a dependency only
  when there's no reasonable stdlib path.
- **Frontend:** `frontend/` — vanilla JS + CSS, no framework.
  - `app.js` — the chat application
  - `index.html` — markup for both the landing page and the app
  - `style.css` → base; `claude-theme.css` → dark reskin (loads last);
    `landing.css` → the landing/auth-panel experience (loads last);
    `workspace.css` → styles for the workspace panel tabs + Run buttons
  - `landing.js` — landing page: 3D particle field, scroll, and the auth panel
  - additive modules: `artifacts.js`, `thinking-toggle.js`, `ui-extras.js`
    (each loaded via its own `<script>`; remove the tag to disable)
  - workspace modules (all load AFTER `artifacts.js`, which exposes the
    `window.AgentWorkspace` tab registry, and self-disable if it's absent):
    `code-runner.js` (▶ Run js/html in a sandboxed iframe, python via a Pyodide
    Web Worker → Output tab), `mermaid-render.js` (```mermaid → Diagram tab),
    `plan-panel.js` (```plan → Process checklist tab), `doc-export.js` (code
    blocks → Files tab + per-message download bar)

## Data & auth
- **DB abstraction** in `server.py` behind `get_auth_db()`: uses **Postgres via
  pg8000** when `DATABASE_URL` is set (production — survives Render's ephemeral
  disk), else **SQLite** (`agentchat_users.db`) for local dev. Call sites use a
  sqlite3-style API (`conn.execute(sql, params).fetchone()`, `conn.commit()`,
  `with` blocks, `dict(row)`) that works against either backend.
- Passwords: PBKDF2 (`hash_password` / `verify_password`).
- Sessions: token in `Authorization: Bearer` / `X-User-Session` header OR the
  `agentchat_session` cookie (see `get_authenticated_user`).
- Social login: `upsert_oauth_user(email, name, avatar_url, provider)` creates or
  updates a user by verified email and is shared across providers.
  - **Google:** GSI token verified server-side (`verify_google_id_token`), needs
    `GOOGLE_CLIENT_ID` env.
  - **GitHub:** DONE — `/api/auth/github/start` and `/api/auth/github/callback`
    routes exist in `server.py`, the frontend button (`#lp-github-btn` /
    `#github-login-btn`) is wired in `landing.js`, and it self-hides unless
    `/api/health` reports `github_enabled`. Needs `GITHUB_CLIENT_ID` +
    `GITHUB_CLIENT_SECRET` env.

## Config & environment variables
- `load_config()` reads `config.json`, then `_apply_env_overrides()` overlays
  values from env so prod defaults survive disk resets. Provider API keys map via
  `PROVIDER_ENV_KEYS`.
- Key env vars: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `ACCESS_PASSWORD`, provider keys
  (`JUSTDOWORK_API_KEY`, `AGENTROUTER_API_KEY`, `GEMINI_API_KEY`, …),
  and `AGENTCHAT_ACTIVE_PROVIDER` / `AGENTCHAT_DEFAULT_MODEL` / etc.
- **Never commit secrets.** `config.json` may hold an encrypted key and is
  regenerated from `config.deploy.json` on deploy — don't stage it in commits.

## Deploy
- Render (Docker, `render.yaml`) on the free tier. Data persistence relies on an
  external Postgres (Neon) via `DATABASE_URL` because the free disk is ephemeral.
- Keep-alive: `.github/workflows/keep_alive.yml` pings `/api/health`; primary
  pinger should be an external monitor (UptimeRobot) every ~5 min.
- Push to `main` → Render auto-deploys. Watch logs for
  `[DB] Auth store ready (Postgres)`.

## Conventions
- Match the existing style; don't introduce frameworks or build tooling.
- Commit specific files, not `git add .` (avoid staging `config.json`,
  `server.log`, local DBs).
- Multimodal chat `content` can be a string OR an OpenAI-style array of
  `{type:text|image_url}` blocks; helpers `content_to_text`,
  `append_text_to_content`, `openai_content_to_anthropic` handle both. The
  JustDoWork provider hits Anthropic's `/v1/messages`, which needs image blocks
  converted to `{type:image, source:{base64,...}}`.
