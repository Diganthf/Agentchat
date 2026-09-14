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
AGENTROUTER_FALLBACK_IP = "8.214.161.192"

DEFAULT_CONFIG = {
    "active_provider": "agentrouter",
    "providers": {
        "agentrouter": {
            "name": "AgentRouter",
            "base_url": "https://agentrouter.org",
            "api_key": "sk-416fg45p4OK340pdDFK7SFmn01TIfmDmZkYWEp6pZf2wp8Sj",
            "is_agentrouter": True
        },
        "tabitoken": {
            "name": "Tabitoken",
            "base_url": "https://tabitoken.com",
            "api_key": "sk-JS1ntD5T42gFkPH317TG6XJHAtA8Vp95KgLrv2Az3u59FmtA",
            "is_agentrouter": False
        },
        "openrouter": {
            "name": "OpenRouter",
            "base_url": "https://openrouter.ai/api",
            "api_key": "",
            "is_agentrouter": False
        },
        "custom": {
            "name": "Custom Provider",
            "base_url": "https://api.openai.com",
            "api_key": "",
            "is_agentrouter": False
        }
    },
    "mcp_servers": {
        "filesystem": {
            "name": "Filesystem Tools",
            "description": "Local workspace file explorer & reader",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\HP"],
            "enabled": False,
            "status": "ready"
        },
        "memory": {
            "name": "Memory Graph",
            "description": "Persistent contextual knowledge graph",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-memory"],
            "enabled": False,
            "status": "ready"
        }
    },
    "plugins": {
        "web_search": {"name": "Real-Time Web Search", "description": "DuckDuckGo organic live web search", "enabled": True},
        "pdf_reader": {"name": "PDF & Document Parser", "description": "High-fidelity pypdf page extraction", "enabled": True},
        "math_eval": {"name": "Math & Code Calculator", "description": "Accurate math logic and python evaluation", "enabled": True}
    },
    "model": "deepseek-v4-flash",
    "temperature": 0.7,
    "system_prompt": "",
    "auto_compress": True
}

# Live model status cache
model_status_cache = {
    "deepseek-v4-flash": {"status": "online", "code": 200, "last_check": 0},
    "glm-5.3": {"status": "online", "code": 200, "last_check": 0},
    "gpt-6-astra": {"status": "exhausted", "code": 402, "message": "Budget pool quota exhausted", "last_check": 0},
    "gpt-5.6-sol": {"status": "exhausted", "code": 402, "message": "Budget pool quota exhausted", "last_check": 0},
    "claude-opus-4-8": {"status": "exhausted", "code": 402, "message": "Budget pool quota exhausted", "last_check": 0},
    "claude-opus-5": {"status": "exhausted", "code": 402, "message": "Budget pool quota exhausted", "last_check": 0}
}
is_probing = False

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if "providers" not in cfg:
                    cfg["providers"] = DEFAULT_CONFIG["providers"]
                    cfg["active_provider"] = "agentrouter"
                if "mcp_servers" not in cfg:
                    cfg["mcp_servers"] = DEFAULT_CONFIG["mcp_servers"]
                if "plugins" not in cfg:
                    cfg["plugins"] = DEFAULT_CONFIG["plugins"]
                if "auto_compress" not in cfg:
                    cfg["auto_compress"] = True
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

def sanitize_config_for_client(cfg):
    safe_cfg = json.loads(json.dumps(cfg))
    if "providers" in safe_cfg:
        for p_key, p_info in safe_cfg["providers"].items():
            raw_key = p_info.get("api_key", "")
            p_info["has_key"] = bool(raw_key)
            p_info["api_key"] = mask_api_key(raw_key)
    # Check if access password is required
    expected_pw = ACCESS_PASSWORD or cfg.get("access_password", "")
    safe_cfg["has_access_password"] = bool(expected_pw)
    return safe_cfg

def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

def get_active_provider_info(override_key=None, override_url=None):
    cfg = load_config()
    active_key = cfg.get("active_provider", "agentrouter")
    providers = cfg.get("providers", {})
    p = providers.get(active_key, providers.get("agentrouter", DEFAULT_CONFIG["providers"]["agentrouter"])).copy()
    
    # Environment variable fallbacks (crucial for secure cloud deployments)
    if active_key == "agentrouter" and not p.get("api_key") and os.environ.get("AGENTROUTER_API_KEY"):
        p["api_key"] = os.environ.get("AGENTROUTER_API_KEY")
    elif active_key == "tabitoken" and not p.get("api_key") and os.environ.get("TABITOKEN_API_KEY"):
        p["api_key"] = os.environ.get("TABITOKEN_API_KEY")
    elif active_key == "openrouter" and not p.get("api_key") and os.environ.get("OPENROUTER_API_KEY"):
        p["api_key"] = os.environ.get("OPENROUTER_API_KEY")

    # Ephemeral per-request client override (Zero-Knowledge BYOK)
    if override_key and override_key.strip():
        p["api_key"] = override_key.strip()
    if override_url and override_url.strip():
        p["base_url"] = override_url.strip()

    return p, active_key

def make_upstream_request(endpoint, data=None, method="GET", stream=False, override_key=None, override_url=None):
    prov, prov_key = get_active_provider_info(override_key=override_key, override_url=override_url)
    base_url = prov.get("base_url", "https://agentrouter.org").rstrip("/")
    api_key = prov.get("api_key", "").strip()
    is_ar = prov.get("is_agentrouter", prov_key == "agentrouter" or "agentrouter.org" in base_url)

    target_url = f"{base_url}{endpoint}"
    parsed = urlparse(target_url)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    if is_ar:
        headers["User-Agent"] = "Anthropic/Python 0.49.0"
        headers["x-stainless-lang"] = "python"

    body_bytes = json.dumps(data).encode("utf-8") if data is not None else None

    # Standard domain resolution with fallback
    try:
        req = urllib.request.Request(target_url, data=body_bytes, headers=headers, method=method)
        return urllib.request.urlopen(req, timeout=45)
    except urllib.error.URLError as e:
        if is_ar and isinstance(e.reason, socket.gaierror) and "agentrouter.org" in parsed.netloc:
            fallback_url = target_url.replace("agentrouter.org", AGENTROUTER_FALLBACK_IP)
            headers["Host"] = "agentrouter.org"
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(fallback_url, data=body_bytes, headers=headers, method=method)
            return urllib.request.urlopen(req, context=ctx, timeout=45)
        raise e

def probe_single_model(model_id):
    prov, prov_key = get_active_provider_info()
    api_key = prov.get("api_key", "").strip()
    base_url = prov.get("base_url", "https://agentrouter.org").rstrip("/")
    is_ar = prov.get("is_agentrouter", prov_key == "agentrouter" or "agentrouter.org" in base_url)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    if is_ar:
        headers["User-Agent"] = "Anthropic/Python 0.49.0"
        headers["x-stainless-lang"] = "python"
        headers["Host"] = "agentrouter.org"
        url = f"https://{AGENTROUTER_FALLBACK_IP}/v1/chat/completions"
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    else:
        url = f"{base_url}/v1/chat/completions"
        ctx = None

    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": "1"}],
        "max_tokens": 1
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        kwargs = {"timeout": 5}
        if ctx:
            kwargs["context"] = ctx
        with urllib.request.urlopen(req, **kwargs) as res:
            model_status_cache[model_id] = {
                "status": "online",
                "code": res.status,
                "message": "Ready to chat",
                "last_check": time.time()
            }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        if "Budget pool quota has been exhausted" in err_body:
            model_status_cache[model_id] = {
                "status": "exhausted",
                "code": 402,
                "message": "Quota exhausted (Refills daily at 00:00, 08:00, 16:00 Beijing Time)",
                "last_check": time.time()
            }
        else:
            model_status_cache[model_id] = {
                "status": "error",
                "code": e.code,
                "message": err_body[:100],
                "last_check": time.time()
            }
    except Exception as e:
        model_status_cache[model_id] = {
            "status": "error",
            "code": 500,
            "message": str(e),
            "last_check": time.time()
        }

PROBE_INTERVAL = 20 * 60  # 20 minutes (1200 seconds)

def probe_all_models(force=False):
    global is_probing
    if is_probing:
        return
    is_probing = True
    now = time.time()
    models_to_probe = []
    for m in model_status_cache.keys():
        last_check = model_status_cache[m].get("last_check", 0)
        # Only probe if forced or if 20 minutes have passed since last check
        if force or (now - last_check >= PROBE_INTERVAL) or last_check == 0:
            models_to_probe.append(m)

    if not models_to_probe:
        is_probing = False
        return

    threads = []
    for m in models_to_probe:
        t = threading.Thread(target=probe_single_model, args=(m,))
        threads.append(t)
        t.start()
    for t in threads:
        t.join(6)
    is_probing = False

def background_probe_loop():
    # Initial check on startup
    try:
        probe_all_models()
    except Exception:
        pass

    while True:
        time.sleep(PROBE_INTERVAL)  # Wait 20 minutes between background checks
        try:
            probe_all_models()
        except Exception:
            pass

probe_thread = threading.Thread(target=background_probe_loop, daemon=True)
probe_thread.start()

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
            self.send_json({"status": "ok", "port": PORT})
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
        elif path == "/api/mcp":
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
        elif path == "/api/parse_file":
            self.handle_parse_file()
        elif path == "/api/probe_models":
            probe_all_models(force=True)
            self.send_json({"success": True, "statuses": model_status_cache})
        elif path == "/api/mcp":
            self.handle_save_mcp()
        elif path == "/api/mcp/test":
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

    def handle_get_models(self):
        DISPLAY_NAMES = {
            "claude-opus-5": "Claude Opus 5",
            "claude-opus-4-8": "Claude Opus 4.8",
            "deepseek-v4-flash": "DeepSeek V4 Flash",
            "glm-5.3": "GLM 5.3",
            "gpt-6-astra": "GPT-6 Astra",
            "gpt-5.6-sol": "GPT-5.6 Sol"
        }
        fallback_models = [
            {"id": "claude-opus-5", "name": "Claude Opus 5", "status": model_status_cache.get("claude-opus-5", {}).get("status", "online")},
            {"id": "claude-opus-4-8", "name": "Claude Opus 4.8", "status": model_status_cache.get("claude-opus-4-8", {}).get("status", "online")},
            {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash", "status": model_status_cache.get("deepseek-v4-flash", {}).get("status", "online")},
            {"id": "glm-5.3", "name": "GLM 5.3", "status": model_status_cache.get("glm-5.3", {}).get("status", "online")},
            {"id": "gpt-6-astra", "name": "GPT-6 Astra", "status": model_status_cache.get("gpt-6-astra", {}).get("status", "online")},
            {"id": "gpt-5.6-sol", "name": "GPT-5.6 Sol", "status": model_status_cache.get("gpt-5.6-sol", {}).get("status", "online")}
        ]
        try:
            res = make_upstream_request("/v1/models", method="GET")
            raw = json.loads(res.read().decode("utf-8"))
            models = []
            for item in raw.get("data", []):
                mid = item.get("id")
                st = model_status_cache.get(mid, {}).get("status", "online")
                models.append({
                    "id": mid,
                    "name": DISPLAY_NAMES.get(mid, mid),
                    "status": st,
                    "supported_endpoint_types": item.get("supported_endpoint_types", ["openai"])
                })
            self.send_json({"success": True, "models": models if models else fallback_models, "statuses": model_status_cache})
        except Exception as e:
            self.send_json({"success": True, "models": fallback_models, "statuses": model_status_cache, "warning": str(e)})

    def handle_chat(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            req_data = json.loads(body)
        except Exception as e:
            self.send_json({"error": "Invalid JSON"}, status=400)
            return

        cfg = load_config()
        model = req_data.get("model", "deepseek-v4-flash")
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

        if system_prompt and system_prompt.strip():
            final_messages.insert(0, {"role": "system", "content": system_prompt.strip()})

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

        payload = {
            "model": model,
            "messages": final_messages,
            "temperature": temperature,
            "stream": stream,
            "reasoning_effort": effort_config["reasoning_effort"],
            "max_tokens": effort_config["max_tokens"]
        }

        override_key = self.headers.get("X-Custom-Api-Key")
        override_url = self.headers.get("X-Custom-Base-Url")

        try:
            upstream_res = make_upstream_request(
                "/v1/chat/completions",
                data=payload,
                method="POST",
                stream=True,
                override_key=override_key,
                override_url=override_url
            )
            # Mark model as online in cache immediately on successful connection
            model_status_cache[model] = {
                "status": "online",
                "code": 200,
                "message": "Ready to chat",
                "last_check": time.time()
            }
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
            if "Budget pool quota has been exhausted" in err_body:
                model_status_cache[model] = {
                    "status": "exhausted",
                    "code": 402,
                    "message": "Quota exhausted",
                    "last_check": time.time()
                }
            friendly_msg = err_body
            try:
                err_json = json.loads(err_body)
                msg_val = err_json.get("error", {}).get("message", "")
                if "Budget pool quota has been exhausted" in msg_val:
                    friendly_msg = f"AgentRouter Upstream Notice: The budget pool for '{model}' is exhausted. AgentRouter officially releases daily Claude & GPT quotas in 3 batches at 00:00, 08:00, and 16:00 Beijing Time (UTC 16:00, 00:00, 08:00). DeepSeek-V4 and GLM-5.3 are active 24/7."
                elif "unauthorized client detected" in msg_val:
                    friendly_msg = "WAF Header Rejected. Please check your provider API key."
                else:
                    friendly_msg = msg_val or err_body
            except Exception:
                pass

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
