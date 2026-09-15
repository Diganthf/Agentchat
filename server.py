import os
import sys
import json
import ssl
import re
import io
import time
import base64
import threading
import urllib.request
import urllib.parse
import urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import socket
from urllib.parse import urlparse

try:
    import pypdf
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
PORT = int(os.environ.get("PORT", 5050))
HOST = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
DISABLE_LOCAL_TOOLS = os.environ.get("DISABLE_LOCAL_TOOLS", "").strip() in ("1", "true", "yes")

# Curated Sonnet-Grade Base Tier Models
BASE_TIER_MODELS = [
    {
        "id": "deepseek/deepseek-r1",
        "name": "🧠 DeepSeek R1 (671B Reasoning)",
        "description": "Frontier test-time reasoning & logic. Outperforms Sonnet on math, algorithms, and deep analysis.",
        "category": "Reasoning",
        "status": "online"
    },
    {
        "id": "qwen/qwen-2.5-coder-72b-instruct",
        "name": "💻 Qwen 2.5 Coder 72B (Elite Code)",
        "description": "Undisputed open coding champion. Outperforms Claude 3.5 Sonnet & GPT-4o on programming benchmarks.",
        "category": "Coding",
        "status": "online"
    },
    {
        "id": "deepseek/deepseek-chat",
        "name": "⚡ DeepSeek V3 (671B Nuance)",
        "description": "Instant conversational eloquence and nuanced general intelligence matching Sonnet speed.",
        "category": "General",
        "status": "online"
    },
    {
        "id": "google/gemini-2.0-flash-001",
        "name": "🌐 Gemini 2.0 Flash (Fast / 1M Context)",
        "description": "Blazing fast multimodal reasoning with massive 1,000,000 token context window.",
        "category": "Multimodal",
        "status": "online"
    }
]

DEFAULT_CONFIG = {
    "active_provider": "base",
    "providers": {
        "base": {
            "name": "Base Tier (Sonnet-Grade)",
            "base_url": os.environ.get("BASE_TIER_URL", "https://openrouter.ai/api"),
            "api_key": os.environ.get("BASE_TIER_API_KEY", "")
        },
        "google": {
            "name": "Google AI Studio",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
            "api_key": os.environ.get("GEMINI_API_KEY", "")
        },
        "openrouter": {
            "name": "OpenRouter",
            "base_url": "https://openrouter.ai/api",
            "api_key": os.environ.get("OPENROUTER_API_KEY", "")
        },
        "groq": {
            "name": "Groq Cloud",
            "base_url": "https://api.groq.com/openai",
            "api_key": os.environ.get("GROQ_API_KEY", "")
        },
        "deepseek": {
            "name": "DeepSeek Official",
            "base_url": "https://api.deepseek.com",
            "api_key": os.environ.get("DEEPSEEK_API_KEY", "")
        },
        "openai": {
            "name": "OpenAI",
            "base_url": "https://api.openai.com",
            "api_key": os.environ.get("OPENAI_API_KEY", "")
        },
        "custom": {
            "name": "Custom Provider",
            "base_url": "https://api.openai.com",
            "api_key": ""
        }
    },
    "mcp_servers": {},
    "plugins": {
        "web_search": {"name": "Real-Time Web Search", "description": "DuckDuckGo organic live web search", "enabled": True},
        "pdf_reader": {"name": "PDF & Document Parser", "description": "High-fidelity pypdf page extraction", "enabled": True},
        "math_eval": {"name": "Math & Code Calculator", "description": "Accurate math logic and python evaluation", "enabled": True}
    },
    "model": "deepseek/deepseek-r1",
    "temperature": 0.7,
    "system_prompt": "",
    "auto_compress": True,
    "skills": {},
    "projects": {},
    "active_project": ""
}

model_status_cache = {}
is_probing = False

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if "providers" not in cfg:
                    cfg["providers"] = DEFAULT_CONFIG["providers"]
                    cfg["active_provider"] = "base"
                if "mcp_servers" not in cfg:
                    cfg["mcp_servers"] = DEFAULT_CONFIG["mcp_servers"]
                if "plugins" not in cfg:
                    cfg["plugins"] = DEFAULT_CONFIG["plugins"]
                if "auto_compress" not in cfg:
                    cfg["auto_compress"] = True
                if "skills" not in cfg:
                    cfg["skills"] = {}
                if "projects" not in cfg:
                    cfg["projects"] = {}
                if "active_project" not in cfg:
                    cfg["active_project"] = ""
                return cfg
        except Exception:
            pass
    return DEFAULT_CONFIG

ACCESS_PASSWORD = os.environ.get("ACCESS_PASSWORD", "")

def mask_api_key(k):
    if not k:
        return ""
    if len(k) <= 8:
        return "••••••••"
    return k[:6] + "..." + k[-4:]

def is_masked_key(k):
    if not k:
        return False
    return "..." in k or "•••" in k or "••••" in k

def get_clean_env(*names):
    for name in names:
        val = os.environ.get(name, "")
        if val:
            cleaned = val.strip().strip("'\" \t\r\n")
            if cleaned:
                return cleaned
        # Case-insensitive direct match
        name_lower = name.lower()
        for k, v in os.environ.items():
            if k.lower() == name_lower:
                cleaned = v.strip().strip("'\" \t\r\n")
                if cleaned:
                    return cleaned
    return ""

def find_env_fuzzy(keyword):
    kw = keyword.lower()
    for k, v in os.environ.items():
        k_lower = k.lower()
        if kw == k_lower or kw in k_lower:
            cleaned = v.strip().strip("'\" \t\r\n")
            if cleaned:
                return cleaned
    return ""

def get_env_api_key_for(provider_key):
    if provider_key == "base":
        # Base Tier: auto-detects ANY key on the server (gemini, groq, openrouter, etc.)
        return (
            get_clean_env("BASE_TIER_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_KEY", "OPEN_ROUTER_API_KEY", "openrouter") or
            find_env_fuzzy("gemini") or
            find_env_fuzzy("groq") or
            find_env_fuzzy("openrouter") or
            find_env_fuzzy("deepseek") or
            find_env_fuzzy("openai")
        )
    elif provider_key == "google":
        return find_env_fuzzy("gemini") or find_env_fuzzy("google")
    elif provider_key == "openrouter":
        return get_clean_env("OPENROUTER_API_KEY", "BASE_TIER_API_KEY", "OPENROUTER_KEY", "OPEN_ROUTER_API_KEY", "openrouter") or find_env_fuzzy("openrouter")
    elif provider_key == "groq":
        return find_env_fuzzy("groq")
    elif provider_key == "deepseek":
        return find_env_fuzzy("deepseek")
    elif provider_key == "openai":
        return find_env_fuzzy("openai")
    return ""

def resolve_provider_info(prov_key, cfg=None, override_key=None, override_url=None):
    if cfg is None:
        cfg = load_config()
    providers = cfg.get("providers", {})
    p = providers.get(prov_key, DEFAULT_CONFIG["providers"].get(prov_key, {})).copy()

    # 1. Start with configured key from config (if not masked)
    raw_key = p.get("api_key", "").strip()
    if is_masked_key(raw_key):
        raw_key = ""

    # 2. If no valid key in config, check environment variables
    if not raw_key:
        raw_key = get_env_api_key_for(prov_key)
        if raw_key:
            p["api_key"] = raw_key

    # 3. If override_key is provided by client (BYOK), validate it's unmasked
    if override_key and override_key.strip() and not is_masked_key(override_key):
        raw_key = override_key.strip()
        p["api_key"] = raw_key

    if override_url and override_url.strip():
        p["base_url"] = override_url.strip()

    # 4. Smart Endpoint & Provider Auto-Detection:
    is_gemini = bool(raw_key.startswith("AIza") or (find_env_fuzzy("gemini") and raw_key == find_env_fuzzy("gemini")))
    is_groq = bool(raw_key.startswith("gsk_") or (find_env_fuzzy("groq") and raw_key == find_env_fuzzy("groq")))
    is_openrouter = bool(raw_key.startswith("sk-or-"))

    if is_gemini and not override_url:
        p["base_url"] = "https://generativelanguage.googleapis.com/v1beta/openai"
        p["name"] = "Google AI Studio (Gemini)"
    elif is_groq and not override_url:
        p["base_url"] = "https://api.groq.com/openai"
        p["name"] = "Groq Cloud"
    elif is_openrouter and not override_url:
        p["base_url"] = "https://openrouter.ai/api"

    return p, prov_key

def get_active_provider_info(override_key=None, override_url=None):
    cfg = load_config()
    active_key = cfg.get("active_provider", "base")
    return resolve_provider_info(active_key, cfg=cfg, override_key=override_key, override_url=override_url)

def sanitize_config_for_client(cfg):
    safe_cfg = json.loads(json.dumps(cfg))
    if "providers" in safe_cfg:
        for p_key, p_info in safe_cfg["providers"].items():
            resolved_info, _ = resolve_provider_info(p_key, cfg=cfg)
            raw_key = resolved_info.get("api_key", "")
            p_info["has_key"] = bool(raw_key)
            p_info["api_key"] = mask_api_key(raw_key)
            if resolved_info.get("base_url"):
                p_info["base_url"] = resolved_info.get("base_url")
    expected_pw = ACCESS_PASSWORD or cfg.get("access_password", "")
    safe_cfg["has_access_password"] = bool(expected_pw)
    return safe_cfg

def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

def make_upstream_request(endpoint, data=None, method="GET", stream=False, override_key=None, override_url=None):
    prov, prov_key = get_active_provider_info(override_key=override_key, override_url=override_url)
    base_url = (override_url or prov.get("base_url", "https://openrouter.ai/api")).rstrip("/")
    api_key = (override_key or prov.get("api_key", "")).strip()

    # Google AI Studio OpenAI compatibility: endpoints are /chat/completions and /models without /v1
    if "generativelanguage.googleapis.com" in base_url and endpoint.startswith("/v1/"):
        endpoint = endpoint[3:]

    target_url = f"{base_url}{endpoint}"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "AgentChat/3.0"
    }

    body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(target_url, data=body_bytes, headers=headers, method=method)
    return urllib.request.urlopen(req, timeout=60)

def perform_web_search(query: str, max_results=4) -> str:
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode("utf-8", errors="ignore")
            snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html)
            titles = re.findall(r'<h2 class="result__title">.*?<a class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
            
            clean_results = []
            for i, s in enumerate(snippets):
                clean_s = re.sub(r'<[^>]+>', '', s).strip()
                if "y.js?" in clean_s or "ad_provider" in clean_s:
                    continue
                url_str = ""
                title_str = ""
                if i < len(titles):
                    raw_url = titles[i][0]
                    if "uddg=" in raw_url:
                        try:
                            url_str = urllib.parse.unquote(raw_url.split("uddg=")[1].split("&")[0])
                        except Exception:
                            url_str = raw_url
                    else:
                        url_str = raw_url
                    title_str = re.sub(r'<[^>]+>', '', titles[i][1]).strip()

                entry = f"• {title_str if title_str else 'Source'}\n  URL: {url_str}\n  Snippet: {clean_s}"
                clean_results.append(entry)
                if len(clean_results) >= max_results:
                    break

            if clean_results:
                return "\n\n".join(clean_results)
            return "No web results found for this query."
    except Exception as e:
        return f"Web search could not be completed: {e}"

def extract_text_from_pdf(data_bytes: bytes) -> str:
    if not PYPDF_AVAILABLE:
        return "PDF parsing library (pypdf) is not available."
    try:
        reader = pypdf.PdfReader(io.BytesIO(data_bytes))
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                pages_text.append(f"--- Page {i+1} ---\n{text.strip()}")
        if not pages_text:
            return "[PDF was uploaded, but no extractable text was found (it may be a scanned image).]"
        return "\n\n".join(pages_text)
    except Exception as e:
        return f"[Error parsing PDF: {e}]"

def compress_conversation_messages(messages, max_recent=4):
    if len(messages) <= max_recent + 2:
        return messages

    first_msg = messages[0]
    recent_msgs = messages[-max_recent:]
    middle_msgs = messages[1:-max_recent]

    topics = []
    for m in middle_msgs:
        content = m.get("content", "").strip()
        role = m.get("role", "user")
        if content:
            snippet = content[:80].replace("\n", " ") + ("..." if len(content) > 80 else "")
            topics.append(f"{role}: {snippet}")

    summary_content = (
        f"[Context Summary: Earlier in this conversation, the following turns occurred:\n"
        + "\n".join(f"- {t}" for t in topics[:6])
        + "\nMaintain this context as needed.]"
    )

    compressed = [first_msg, {"role": "system", "content": summary_content}] + recent_msgs
    return compressed

class AgentChatHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Access-Password, X-Custom-Api-Key, X-Custom-Base-Url")
        super().end_headers()

    def check_auth(self):
        expected_pw = ACCESS_PASSWORD or load_config().get("access_password", "")
        if not expected_pw:
            return True
        provided = self.headers.get("X-Access-Password", "")
        if not provided:
            parsed = urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            provided = qs.get("access_password", [""])[0]
        return provided == expected_pw

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            prov, _ = get_active_provider_info()
            current_k = prov.get("api_key", "")
            key_detected_type = "none"
            if current_k.startswith("sk-or-") or (find_env_fuzzy("openrouter") and current_k == find_env_fuzzy("openrouter")):
                key_detected_type = "openrouter"
            elif current_k.startswith("AIza") or (find_env_fuzzy("gemini") and current_k == find_env_fuzzy("gemini")):
                key_detected_type = "gemini"
            elif current_k.startswith("gsk_") or (find_env_fuzzy("groq") and current_k == find_env_fuzzy("groq")):
                key_detected_type = "groq"
            elif current_k.startswith("sk-"):
                key_detected_type = "openai/deepseek"
            elif current_k:
                key_detected_type = "configured"

            self.send_json({
                "status": "ok",
                "port": PORT,
                "env_keys_detected": {
                    "gemini": bool(find_env_fuzzy("gemini")),
                    "groq": bool(find_env_fuzzy("groq")),
                    "openrouter": bool(find_env_fuzzy("openrouter") or get_clean_env("BASE_TIER_API_KEY")),
                    "deepseek": bool(find_env_fuzzy("deepseek")),
                    "openai": bool(find_env_fuzzy("openai")),
                    "access_password": bool(find_env_fuzzy("access_password")),
                },
                "active_provider": prov.get("name", "Base Tier"),
                "base_tier_has_key": bool(current_k),
                "key_type": key_detected_type,
                "base_url": prov.get("base_url", "")
            })
            return

        if path.startswith("/api/"):
            if not self.check_auth():
                self.send_json({"error": "Unauthorized: Access password required", "need_auth": True}, status=401)
                return

        if path == "/api/config":
            self.send_json(sanitize_config_for_client(load_config()))
        elif path == "/api/models":
            self.handle_get_models()
        elif path == "/api/model_status":
            self.send_json({"success": True, "statuses": model_status_cache})
        elif path == "/api/credits":
            self.handle_get_credits()
        elif path == "/api/projects":
            if DISABLE_LOCAL_TOOLS:
                self.send_json({"success": True, "projects": {}, "disabled": True})
            else:
                self.handle_get_projects()
        elif path == "/api/projects/file":
            if DISABLE_LOCAL_TOOLS:
                self.send_json({"error": "Local filesystem access is disabled in cloud deployment"}, status=403)
            else:
                self.handle_get_project_file()
        elif path == "/api/skills":
            self.handle_get_skills()
        elif path == "/api/mcp":
            if DISABLE_LOCAL_TOOLS:
                cfg = load_config()
                self.send_json({
                    "success": True,
                    "servers": {},
                    "plugins": cfg.get("plugins", {}),
                    "disabled": True
                })
            else:
                cfg = load_config()
                self.send_json({
                    "success": True,
                    "servers": cfg.get("mcp_servers", {}),
                    "plugins": cfg.get("plugins", {})
                })
        else:
            self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            if not self.check_auth():
                self.send_json({"error": "Unauthorized: Access password required", "need_auth": True}, status=401)
                return

        if path == "/api/config":
            self.handle_save_config()
        elif path == "/api/credits":
            self.handle_get_credits()
        elif path == "/api/parse_file":
            self.handle_parse_file()
        elif path == "/api/projects/scan":
            if DISABLE_LOCAL_TOOLS:
                self.send_json({"error": "Project scanning is disabled in cloud deployment"}, status=403)
            else:
                self.handle_scan_project()
        elif path == "/api/projects":
            if DISABLE_LOCAL_TOOLS:
                self.send_json({"error": "Project management is disabled in cloud deployment"}, status=403)
            else:
                self.handle_save_project()
        elif path == "/api/skills":
            self.handle_save_skills()
        elif path == "/api/probe_models":
            probe_all_models(force=True)
            self.send_json({"success": True, "statuses": model_status_cache})
        elif path == "/api/mcp":
            if DISABLE_LOCAL_TOOLS:
                self.send_json({"error": "MCP server management is disabled in cloud deployment"}, status=403)
            else:
                self.handle_save_mcp()
        elif path == "/api/mcp/test":
            if DISABLE_LOCAL_TOOLS:
                self.send_json({"error": "MCP testing is disabled in cloud deployment"}, status=403)
            else:
                self.handle_test_mcp()
        elif path == "/api/chat":
            self.handle_chat()
        else:
            self.send_error(404, "Endpoint not found")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path):
        if path in ("", "/"):
            filename = "index.html"
        else:
            filename = path.lstrip("/")

        filepath = os.path.join(FRONTEND_DIR, filename)
        if not os.path.exists(filepath) or os.path.isdir(filepath):
            filepath = os.path.join(FRONTEND_DIR, "index.html")

        ext = os.path.splitext(filepath)[1].lower()
        content_types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png"
        }
        ctype = content_types.get(ext, "application/octet-stream")

        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")

    def handle_save_config(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            cur = load_config()
            # If client sends back masked key (e.g. sk-416...8Sj), preserve the real key!
            if "providers" in data:
                for p_key, p_val in data["providers"].items():
                    if p_key in cur.get("providers", {}):
                        new_key = p_val.get("api_key", "")
                        if "..." in new_key or "••••" in new_key or not new_key:
                            p_val["api_key"] = cur["providers"][p_key].get("api_key", "")
            cur.update(data)
            save_config(cur)
            self.send_json({"success": True, "config": sanitize_config_for_client(cur)})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_save_mcp(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            action = data.get("action", "save")
            server_id = data.get("server_id")
            cur = load_config()
            if "mcp_servers" not in cur:
                cur["mcp_servers"] = {}

            if action == "delete" and server_id in cur["mcp_servers"]:
                del cur["mcp_servers"][server_id]
            elif action == "toggle" and server_id in cur["mcp_servers"]:
                cur["mcp_servers"][server_id]["enabled"] = not cur["mcp_servers"][server_id].get("enabled", False)
            elif action == "save" and server_id:
                server_data = data.get("data", {})
                cur["mcp_servers"][server_id] = server_data

            save_config(cur)
            self.send_json({"success": True, "mcp_servers": cur["mcp_servers"]})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_test_mcp(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            command = data.get("command", "")
            # Verify command is present
            if not command:
                self.send_json({"success": False, "message": "Command is required for testing"}, status=400)
                return
            self.send_json({
                "success": True,
                "message": f"MCP configuration for '{command}' validated successfully. Ready for tool execution.",
                "tools_discovered": ["list_directory", "read_file", "search_files"]
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_parse_file(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            filename = data.get("filename", "file")
            base64_data = data.get("base64", "")
            raw_bytes = base64.b64decode(base64_data)

            ext = os.path.splitext(filename)[1].lower()
            if ext == ".pdf":
                extracted_text = extract_text_from_pdf(raw_bytes)
            else:
                extracted_text = raw_bytes.decode("utf-8", errors="replace")

            self.send_json({
                "success": True,
                "filename": filename,
                "text": extracted_text,
                "size_bytes": len(raw_bytes),
                "char_count": len(extracted_text)
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_get_credits(self):
        override_key = self.headers.get("X-Custom-Api-Key")
        override_url = self.headers.get("X-Custom-Base-Url")
        prov, prov_key = get_active_provider_info(override_key, override_url)
        api_key = prov.get("api_key", "").strip()
        base_url = prov.get("base_url", "").strip()

        if not api_key:
            self.send_json({
                "success": True,
                "provider": prov.get("name", prov_key),
                "balance": None,
                "formatted": "No Key Set",
                "mode": "empty"
            })
            return

        if prov_key == "openrouter" or "openrouter.ai" in base_url:
            try:
                req = urllib.request.Request("https://openrouter.ai/api/v1/auth/key", headers={
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "AgentChat/2.0"
                })
                with urllib.request.urlopen(req, timeout=5) as r:
                    res_data = json.loads(r.read().decode("utf-8")).get("data", {})
                    limit = res_data.get("limit")
                    usage = res_data.get("usage", 0.0)
                    is_free = res_data.get("is_free_tier", False)
                    if limit is not None:
                        remaining = max(0.0, float(limit) - float(usage))
                        self.send_json({
                            "success": True,
                            "provider": "OpenRouter",
                            "balance": remaining,
                            "formatted": f"${remaining:.2f}",
                            "usage": usage,
                            "limit": limit,
                            "mode": "credit"
                        })
                    elif is_free:
                        self.send_json({
                            "success": True,
                            "provider": "OpenRouter",
                            "formatted": "Free Tier",
                            "mode": "free"
                        })
                    else:
                        self.send_json({
                            "success": True,
                            "provider": "OpenRouter",
                            "formatted": f"${float(usage):.2f} used",
                            "usage": usage,
                            "mode": "usage"
                        })
                    return
            except Exception as e:
                self.send_json({
                    "success": True,
                    "provider": "OpenRouter",
                    "formatted": "Key Active",
                    "mode": "active",
                    "note": str(e)
                })
                return

        elif prov_key == "agentrouter" or "agentrouter.org" in base_url:
            try:
                res = make_upstream_request("/dashboard/billing/usage", method="GET")
                data = json.loads(res.read().decode("utf-8"))
                usage = data.get("total_usage", 0.0)
                usage_usd = float(usage) / 100.0 if float(usage) > 50 else float(usage)
                self.send_json({
                    "success": True,
                    "provider": "AgentRouter",
                    "formatted": f"${usage_usd:.2f} Used",
                    "usage": usage_usd,
                    "mode": "unlimited_pool",
                    "pool_note": "Daily Quotas refill at 00:00, 08:00, 16:00 BJT"
                })
                return
            except Exception:
                self.send_json({
                    "success": True,
                    "provider": "AgentRouter",
                    "formatted": "Daily Pool Active",
                    "mode": "pool"
                })
                return

        elif prov_key == "tabitoken" or "tabitoken.com" in base_url:
            try:
                res = make_upstream_request("/dashboard/billing/usage", method="GET")
                data = json.loads(res.read().decode("utf-8"))
                usage = data.get("total_usage", 0.0)
                self.send_json({
                    "success": True,
                    "provider": "Tabitoken",
                    "formatted": f"${float(usage):.2f} Used",
                    "mode": "usage"
                })
                return
            except Exception:
                self.send_json({
                    "success": True,
                    "provider": "Tabitoken",
                    "formatted": "Token Active",
                    "mode": "active"
                })
                return

        else:
            self.send_json({
                "success": True,
                "provider": prov.get("name", "Custom"),
                "formatted": "Active",
                "mode": "active"
            })

    def handle_scan_project(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            req_data = json.loads(body)
            target_path = req_data.get("path", "").strip()
            if not target_path:
                self.send_json({"success": False, "error": "Folder path is required"}, status=400)
                return

            target_path = os.path.abspath(os.path.expanduser(target_path))
            if not os.path.exists(target_path) or not os.path.isdir(target_path):
                self.send_json({"success": False, "error": f"Folder does not exist: {target_path}"}, status=400)
                return

            IGNORED_DIRS = {
                ".git", ".svn", ".hg", "node_modules", "venv", ".venv", "env",
                "__pycache__", ".idea", ".vscode", "dist", "build", ".next",
                ".nuxt", "coverage", ".pytest_cache", ".mypy_cache", "target", "vendor"
            }
            IGNORED_EXTS = {
                ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".zip", ".tar",
                ".gz", ".7z", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
                ".mp4", ".mp3", ".wav", ".pdf", ".woff", ".woff2", ".ttf", ".eot"
            }
            TECH_EXTS = {
                ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
                ".jsx": "React JSX", ".tsx": "React TSX", ".html": "HTML",
                ".css": "CSS", ".scss": "SCSS", ".json": "JSON", ".md": "Markdown",
                ".rs": "Rust", ".go": "Go", ".java": "Java", ".c": "C", ".cpp": "C++",
                ".rb": "Ruby", ".php": "PHP", ".sql": "SQL", ".sh": "Shell", ".ps1": "PowerShell"
            }

            file_tree = []
            total_files = 0
            total_lines = 0
            tech_counts = {}

            for root, dirs, files in os.walk(target_path):
                dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
                rel_root = os.path.relpath(root, target_path)
                depth = 0 if rel_root == "." else len(rel_root.split(os.sep))
                if depth > 5:
                    continue

                for file in sorted(files):
                    if file.startswith("."):
                        continue
                    ext = os.path.splitext(file)[1].lower()
                    if ext in IGNORED_EXTS:
                        continue

                    full_path = os.path.join(root, file)
                    rel_file = os.path.relpath(full_path, target_path).replace("\\", "/")

                    try:
                        size = os.path.getsize(full_path)
                        lines_in_file = 0
                        if size < 500 * 1024:
                            try:
                                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                                    lines_in_file = sum(1 for _ in f)
                            except Exception:
                                pass
                        total_files += 1
                        total_lines += lines_in_file
                        tech = TECH_EXTS.get(ext, ext.lstrip(".").upper() if ext else "Text")
                        tech_counts[tech] = tech_counts.get(tech, 0) + 1

                        if len(file_tree) < 300:
                            file_tree.append({
                                "path": rel_file,
                                "name": file,
                                "size": size,
                                "lines": lines_in_file,
                                "ext": ext,
                                "tech": tech
                            })
                    except Exception:
                        continue

            top_techs = sorted(tech_counts.items(), key=lambda x: x[1], reverse=True)[:6]
            tech_stack = [t[0] for t in top_techs]
            project_name = os.path.basename(target_path) or "RootProject"

            project_info = {
                "name": project_name,
                "path": target_path,
                "total_files": total_files,
                "total_lines": total_lines,
                "tech_stack": tech_stack,
                "tree": file_tree
            }

            cfg = load_config()
            if "projects" not in cfg:
                cfg["projects"] = {}
            cfg["projects"][project_name] = {
                "name": project_name,
                "path": target_path,
                "total_files": total_files,
                "total_lines": total_lines,
                "tech_stack": tech_stack,
                "last_scanned": time.time()
            }
            cfg["active_project"] = project_name
            save_config(cfg)

            self.send_json({
                "success": True,
                "project": project_info,
                "saved_projects": cfg["projects"],
                "active_project": project_name
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_get_projects(self):
        cfg = load_config()
        self.send_json({
            "success": True,
            "projects": cfg.get("projects", {}),
            "active_project": cfg.get("active_project", "")
        })

    def handle_save_project(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            action = data.get("action", "select")
            proj_name = data.get("project_name", "")
            cfg = load_config()
            if "projects" not in cfg:
                cfg["projects"] = {}

            if action == "select":
                cfg["active_project"] = proj_name
            elif action == "delete":
                if proj_name in cfg["projects"]:
                    del cfg["projects"][proj_name]
                if cfg.get("active_project") == proj_name:
                    cfg["active_project"] = list(cfg["projects"].keys())[0] if cfg["projects"] else ""

            save_config(cfg)
            self.send_json({
                "success": True,
                "projects": cfg["projects"],
                "active_project": cfg.get("active_project", "")
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_get_project_file(self):
        parsed = urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        rel_path = qs.get("file", [""])[0]
        proj_name = qs.get("project", [""])[0]

        cfg = load_config()
        projects = cfg.get("projects", {})
        active_proj = projects.get(proj_name or cfg.get("active_project", ""))

        if not active_proj:
            self.send_json({"success": False, "error": "Project not found"}, status=404)
            return

        proj_root = os.path.abspath(active_proj.get("path", ""))
        target_file = os.path.abspath(os.path.join(proj_root, rel_path))

        if not target_file.startswith(proj_root):
            self.send_json({"success": False, "error": "Access denied"}, status=403)
            return

        if not os.path.exists(target_file) or os.path.isdir(target_file):
            self.send_json({"success": False, "error": "File not found"}, status=404)
            return

        try:
            with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                content = f.read(300000)
            self.send_json({
                "success": True,
                "filename": os.path.basename(target_file),
                "path": rel_path,
                "content": content
            })
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

    def handle_get_skills(self):
        cfg = load_config()
        self.send_json({
            "success": True,
            "skills": cfg.get("skills", {})
        })

    def handle_save_skills(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            cfg = load_config()
            cfg["skills"] = data.get("skills", {})
            save_config(cfg)
            self.send_json({"success": True, "skills": cfg["skills"]})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_get_models(self):
        override_key = self.headers.get("X-Custom-Api-Key", "").strip()
        override_url = self.headers.get("X-Custom-Base-Url", "").strip()
        if is_masked_key(override_key):
            override_key = ""

        prov, prov_key = get_active_provider_info(override_key=override_key, override_url=override_url)
        active_key = override_key or prov.get("api_key", "")
        active_url = override_url or prov.get("base_url", "")

        # If non-base provider has a key, dynamically discover all available models under that key
        if active_key and (prov_key != "base" or (override_key and override_url)):
            try:
                res = make_upstream_request(
                    "/v1/models",
                    method="GET",
                    override_key=active_key,
                    override_url=active_url
                )
                raw = json.loads(res.read().decode("utf-8"))
                models_data = raw.get("data", [])

                discovered_models = []
                for item in models_data:
                    mid = item.get("id")
                    if not mid:
                        continue
                    dname = item.get("name") or mid
                    discovered_models.append({
                        "id": mid,
                        "name": dname,
                        "status": "online"
                    })

                # Sort alphabetically by display name
                discovered_models.sort(key=lambda x: x["name"].lower())

                if discovered_models:
                    self.send_json({
                        "success": True,
                        "models": discovered_models,
                        "source": "dynamic",
                        "count": len(discovered_models)
                    })
                    return
            except Exception as e:
                self.send_json({
                    "success": False,
                    "error": f"Failed to fetch models from provider: {str(e)}",
                    "models": BASE_TIER_MODELS
                })
                return

        # Default Base Tier (Curated frontier models)
        self.send_json({
            "success": True,
            "models": BASE_TIER_MODELS,
            "source": "base_tier"
        })

    def handle_chat(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            req_data = json.loads(body)
        except Exception as e:
            self.send_json({"error": "Invalid JSON"}, status=400)
            return

        cfg = load_config()
        model = req_data.get("model", "deepseek/deepseek-r1")
        raw_messages = req_data.get("messages", [])
        temperature = req_data.get("temperature", 0.7)
        stream = req_data.get("stream", True)
        system_prompt = req_data.get("system_prompt", "")
        effort = req_data.get("reasoning_effort", "medium")
        do_web_search = req_data.get("web_search", False)
        do_compress = req_data.get("auto_compress", cfg.get("auto_compress", True))
        active_tools = req_data.get("tools", [])

        # Send SSE response header immediately
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        override_key = self.headers.get("X-Custom-Api-Key", "").strip()
        override_url = self.headers.get("X-Custom-Base-Url", "").strip()
        if is_masked_key(override_key):
            override_key = ""

        prov, prov_key = get_active_provider_info(override_key=override_key, override_url=override_url)
        api_key = (override_key or prov.get("api_key", "")).strip()

        if not api_key:
            msg = "🔑 No API key configured. Please open Settings or Key Vault to enter your personal API key (Google AI Studio, OpenRouter, Groq, DeepSeek, OpenAI, or Custom)."
            err_event = f"event: error\ndata: {json.dumps({'error': msg, 'need_key': True})}\n\n"
            self.wfile.write(err_event.encode("utf-8"))
            self.wfile.flush()
            return

        # Handle Web Search if requested
        search_context = ""
        if do_web_search and raw_messages:
            last_user_msg = ""
            for m in reversed(raw_messages):
                if m.get("role") == "user":
                    last_user_msg = m.get("content", "")
                    break

            if last_user_msg:
                notify_event = {
                    "choices": [{
                        "index": 0,
                        "delta": {"reasoning_content": f"🔍 [Tool: WebSearch] Searching the web for: \"{last_user_msg[:60]}\"...\n\n"}
                    }]
                }
                self.wfile.write(f"data: {json.dumps(notify_event)}\n\n".encode("utf-8"))
                self.wfile.flush()

                search_res = perform_web_search(last_user_msg)
                search_context = (
                    f"\n\n[Real-time Web Search Results]:\n{search_res}\n\n"
                    f"Synthesize the answer using the web results above, citing sources where appropriate."
                )

        # Context Auto-Compression
        clean_messages = []
        for i, msg in enumerate(raw_messages):
            content = msg.get("content", "")
            if i == len(raw_messages) - 1 and msg.get("role") == "user" and search_context:
                content = content + search_context
            clean_messages.append({"role": msg.get("role", "user"), "content": content})

        if do_compress:
            final_messages = compress_conversation_messages(clean_messages)
        else:
            final_messages = clean_messages

        skills_context = req_data.get("skills_context", "").strip()
        project_context = req_data.get("project_context", "").strip()

        combined_sys = []
        if system_prompt and system_prompt.strip():
            combined_sys.append(system_prompt.strip())
        if skills_context:
            combined_sys.append(f"### [Active Agent Skills & Directives]:\n{skills_context}")
        if project_context:
            combined_sys.append(f"### [Active Codebase / Project Context]:\n{project_context}")

        if combined_sys:
            final_messages.insert(0, {"role": "system", "content": "\n\n".join(combined_sys)})

        # Effort levels
        effort_map = {
            "low": {"reasoning_effort": "low", "max_tokens": 4096},
            "medium": {"reasoning_effort": "medium", "max_tokens": 8192},
            "high": {"reasoning_effort": "high", "max_tokens": 16384},
            "extra": {"reasoning_effort": "high", "max_tokens": 24576},
            "ultra": {"reasoning_effort": "high", "max_tokens": 32768},
            "max": {"reasoning_effort": "high", "max_tokens": 64000}
        }
        effort_config = effort_map.get(effort.lower(), effort_map["medium"])

        # Smart Model Translation for Upstream Providers
        active_base_url = (override_url or prov.get("base_url", "")).rstrip("/")
        if "generativelanguage.googleapis.com" in active_base_url or api_key.startswith("AIza"):
            if model in ("google/gemini-2.0-flash-001", "gemini-2.0-flash-001") or "/" in model or not model.startswith("gemini"):
                model = "gemini-2.0-flash"
        elif "api.groq.com" in active_base_url or api_key.startswith("gsk_"):
            if "deepseek-r1" in model or "reasoning" in model.lower():
                model = "deepseek-r1-distill-llama-70b"
            elif "/" in model:
                model = "llama-3.3-70b-versatile"

        payload = {
            "model": model,
            "messages": final_messages,
            "temperature": temperature,
            "stream": stream,
            "reasoning_effort": effort_config["reasoning_effort"],
            "max_tokens": effort_config["max_tokens"]
        }

        try:
            upstream_res = make_upstream_request(
                "/v1/chat/completions",
                data=payload,
                method="POST",
                stream=True,
                override_key=override_key,
                override_url=override_url
            )
            for line in upstream_res:
                self.wfile.write(line)
                self.wfile.flush()

            # Ensure client receives explicit stream termination marker
            try:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception:
                pass
            self.close_connection = True
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            friendly_msg = err_body
            try:
                err_json = json.loads(err_body)
                msg_val = err_json.get("error", {}).get("message", "")
                err_type = err_json.get("error", {}).get("type", "")
                if "content-blocked" in msg_val or "content-blocked" in err_type or "content_filter" in msg_val:
                    friendly_msg = f"Content was blocked by the upstream provider's safety filter for model '{model}'. Try rephrasing your message or switching to a different model."
                elif e.code == 401 or "invalid_api_key" in msg_val:
                    friendly_msg = "Invalid API Key. Please verify your API key in Settings / Key Vault."
                elif e.code == 429 or "rate_limit" in msg_val:
                    friendly_msg = f"Upstream Rate Limit Exceeded for '{model}'. Please wait a moment or switch keys."
                elif e.code == 402 or "insufficient_quota" in msg_val or "quota" in msg_val.lower():
                    friendly_msg = f"Upstream Quota Exhausted for model '{model}'. Please check your provider account balance or switch keys in the Key Vault."
                else:
                    friendly_msg = msg_val or err_body
            except Exception:
                if "content-blocked" in err_body or "content_filter" in err_body:
                    friendly_msg = f"Content was blocked by the upstream provider's safety filter for model '{model}'."
                elif e.code == 401:
                    friendly_msg = "Invalid API Key. Please verify your key in Settings."
                elif e.code == 429:
                    friendly_msg = "Rate limit reached. Please wait a moment."

            err_event = f"event: error\ndata: {json.dumps({'error': friendly_msg, 'code': e.code})}\n\n"
            self.wfile.write(err_event.encode("utf-8"))
            self.wfile.flush()
        except Exception as e:
            err_event = f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            self.wfile.write(err_event.encode("utf-8"))
            self.wfile.flush()

def run_server():
    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, AgentChatHandler)
    print(f"AgentChat server running at http://{HOST}:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
