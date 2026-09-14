# AgentChat ⚡

A lightweight, local-first AI workbench designed with the **Material You Expressive (M3 Expressive)** design system. Built for developers and power users who demand direct gateway connectivity, multi-model flexibility, automatic reasoning compression, local document ingestion, and Model Context Protocol (MCP) tool execution without the bloat of Electron.

---

## ✨ Features & Capabilities

### 🎨 Authentic Material You Expressive UI
- **Organic Tonal Palette:** Built on warm terracotta (`#FF8A65`), sage celadon (`#97AFA0`), sunlight ochre (`#F5B942`), and stepped warm obsidian surfaces (`#141211` through `#2C2826`).
- **Tactile Geometric Shapes:** 28px active pill indicators on the navigation rail, asymmetrical message bubbles (`20px 20px 4px 20px` for user, `20px 20px 20px 4px` for assistant), and a floating 28px dock capsule.
- **Crafted Typography:** Styled with **Rubik** (primary UI) and **IBM Plex Mono** (code and telemetry) to avoid generic fonts like Inter, Geist, or Space Grotesk.
- **Surface Container Stepping:** Elevation is communicated through tonal surface color shifts rather than excessive blur or neon gradients.

### 🧠 Multi-Engine & Multi-Provider Support
- **Frontier Models:** Seamlessly switch between Multiple models of your choice.
- **Provider Agnostic:** Out-of-the-box support for **AgentRouter**, **Tabitoken**, **OpenRouter**, or any custom OpenAI/Anthropic-compatible endpoint.
- **Live Upstream Status & Quota Refill Telemetry:** Real-time probing with daily quota refill schedule board .

### ⚡ Context Auto-Compression (Saves ~75% Tokens)
- Long Chain-of-Thought (CoT) reasoning models generate thousands of `<think>` tokens.
- AgentChat automatically detects and strips previous turns' thinking tokens before forwarding prompt history to upstream providers.
- Preserves full conversational continuity while cutting prompt token consumption by **70–80%**.

### 🔒 Zero-Knowledge & Local-First Privacy
- **Local Storage:** All API keys and chat histories are stored strictly on your local machine (`config.json` and browser `localStorage`).
- **No Third-Party Telemetry:** Zero external telemetry, tracking, or cloud account requirements.
- **LAN Access Control:** Optional password protection (`X-Access-Password`) for self-hosted or LAN deployments.
- **Zero-Cloud Document Parsing:** PDFs and code files are processed locally via `pypdf` without third-party document processing APIs.

### 🛠️ Built-in Tools & Model Context Protocol (MCP)
- **Organic Web Search:** Real-time DuckDuckGo web search with live source citations.
- **Local Document Ingestion:** Drag-and-drop or file picker support for `.pdf`, `.txt`, `.md`, `.py`, `.js`, `.json`, `.csv`, `.png`, and `.webp`.
- **Extensible Stdio MCP:** Add, test, and run local Model Context Protocol servers (Filesystem, SQLite, Memory) directly from the sidebar.

---

## 🏗️ Architecture & Tech Stack

```
AgentChat/
├── frontend/
│   ├── index.html       # M3 Expressive semantic markup & workbench
│   ├── style.css        # Material You Expressive tokens & component styling
│   ├── app.js           # Client-side streaming, session management, MCP bindings
│   └── manifest.json    # PWA configuration
├── server.py            # Ultra-lightweight Python 3 standard library proxy & tool server
├── config.example.json  # Sanitized configuration template (safe to commit)
├── config.json          # Private local config & keys (ignored by git)
├── requirements.txt     # Minimal dependencies (pypdf)
├── run.bat              # One-click Windows launch script (Chrome App mode)
└── Dockerfile           # Containerized deployment support
```

- **Backend:** Pure Python 3 standard library (`http.server`, `urllib.request`). Zero heavy web frameworks (FastAPI/Django/Flask omitted to guarantee sub-second startup and minimal RAM usage).
- **Frontend:** Pure HTML5, CSS3, Vanilla JavaScript. Zero build steps, zero Webpack/Vite overhead.
- **Runtime:** Runs natively in any browser or in borderless **Chrome App Mode** (`chrome.exe --app=http://localhost:5050`).

---

## 🚀 Quick Start

### 1. Prerequisites
- **Python 3.9+** installed on your system.
- Optional: Google Chrome or Microsoft Edge (for desktop App mode).

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/AgentChat.git
cd AgentChat
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Provider API Keys
Copy the example config file and set your API key:
```bash
cp config.example.json config.json
```
Edit `config.json` with your provider API key (or configure it directly inside the app's **Settings** modal).

### 5. Launch AgentChat

#### On Windows (One-Click):
Double-click `run.bat` or run:
```bat
run.bat
```
This automatically verifies dependencies, starts the backend proxy, and opens AgentChat in borderless desktop App mode.

#### Cross-Platform (macOS / Linux / Windows):
```bash
python server.py
```
Open [http://localhost:5050](http://localhost:5050) in your web browser.

---

## 🛡️ Security & Privacy Guidelines

- **Never Commit `config.json`:** Your private API keys are stored in `config.json`. This file is strictly excluded in `.gitignore`.
- **Client-Side Key Override:** You can also provide temporary client-side API keys directly in the browser UI, which are stored solely in your browser's local storage and sent via header `X-Custom-Api-Key`.
- **Safe Sharing:** Only share or commit `config.example.json`.

---

## 📜 License

Distributed under the **MIT License**.
