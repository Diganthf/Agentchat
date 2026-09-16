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
import socket
import secrets
import random
import subprocess
import shlex
import sqlite3
import hashlib
import uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

try:
    import pypdf
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    FERNET_AVAILABLE = True
except ImportError:
    FERNET_AVAILABLE = False

try:
    from curl_cffi import requests as cffi_requests
    CURL_CFFI_AVAILABLE = True
except ImportError:
    CURL_CFFI_AVAILABLE = False

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")
PORT = int(os.environ.get("PORT", 5050))
HOST = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
DISABLE_LOCAL_TOOLS = os.environ.get("DISABLE_LOCAL_TOOLS", "").strip() in ("1", "true", "yes")

ACCESS_PASSWORD = os.environ.get("ACCESS_PASSWORD", "").strip()
ALLOW_UNPROTECTED_PUBLIC = os.environ.get("ALLOW_UNPROTECTED_PUBLIC", "").strip() in ("1", "true", "yes")

AUTO_GENERATED_TOKEN = None
if HOST == "0.0.0.0" and not ACCESS_PASSWORD and not ALLOW_UNPROTECTED_PUBLIC:
    AUTO_GENERATED_TOKEN = secrets.token_urlsafe(24)
    ACCESS_PASSWORD = AUTO_GENERATED_TOKEN
    sys.stdout.write("\n" + "="*70 + "\n")
    sys.stdout.write("🔒 [SECURITY SHIELD ACTIVATED - PUBLIC INTERFACE ENFORCEMENT]\n")
    sys.stdout.write(f"AgentChat is bound to public interface: {HOST}:{PORT}\n")
    sys.stdout.write(f"Mandatory Access Password generated: {AUTO_GENERATED_TOKEN}\n")
    sys.stdout.write("Pass via header 'X-Access-Password' or '?access_password=' query parameter.\n")
    sys.stdout.write("To configure custom password, define ACCESS_PASSWORD in environment.\n")
    sys.stdout.write("="*70 + "\n\n")
    sys.stdout.flush()

# --- Security: Fernet Encryption at Rest ---
def get_master_fernet():
    if not FERNET_AVAILABLE:
        return None
    salt = b"agentchat_vault_v3_salt"
    master_seed = os.environ.get("AGENTCHAT_MASTER_KEY", "").encode("utf-8")
    if not master_seed:
        hw_seed = f"{socket.gethostname()}-{os.environ.get('USERNAME', os.environ.get('USER', 'agentchat_sec'))}".encode("utf-8")
        master_seed = hw_seed
    try:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(master_seed))
        return Fernet(key)
    except Exception:
        return None

def encrypt_secret(val: str) -> str:
    if not val or not isinstance(val, str) or not val.strip():
        return ""
    val_clean = val.strip()
    if val_clean.startswith("enc::"):
        return val_clean
    fernet = get_master_fernet()
    if not fernet:
        return val_clean
    try:
        token = fernet.encrypt(val_clean.encode("utf-8")).decode("utf-8")
        return f"enc::{token}"
    except Exception:
        return val_clean

def decrypt_secret(val: str) -> str:
    if not val or not isinstance(val, str) or not val.strip():
        return ""
    val_clean = val.strip()
    if not val_clean.startswith("enc::"):
        return val_clean
    fernet = get_master_fernet()
    if not fernet:
        return val_clean
    try:
        cipher = val_clean[5:]
        return fernet.decrypt(cipher.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""

# --- User Authentication & Cross-Device Profile Database (SQLite) ---
AUTH_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agentchat_users.db")

def get_auth_db():
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_auth_db():
    with get_auth_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                avatar_url TEXT DEFAULT '',
                auth_provider TEXT DEFAULT 'email',
                password_hash TEXT,
                salt TEXT,
                created_at REAL,
                last_login REAL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at REAL,
                expires_at REAL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                active_provider TEXT DEFAULT 'custom',
                active_model TEXT DEFAULT '',
                custom_base_url TEXT DEFAULT '',
                encrypted_keys_json TEXT DEFAULT '{}',
                settings_json TEXT DEFAULT '{}',
                updated_at REAL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.commit()

init_auth_db()

def hash_password(password: str, salt: str = None):
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return key.hex(), salt

def verify_password(password: str, salt: str, password_hash: str) -> bool:
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return secrets.compare_digest(key.hex(), password_hash)

def create_user_session(user_id: str, duration_days: int = 30) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    expires_at = now + (duration_days * 86400)
    with get_auth_db() as conn:
        conn.execute(
            "INSERT INTO sessions (session_token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now, expires_at)
        )
        conn.commit()
    return token

def get_user_from_session(token: str):
    if not token:
        return None
    now = time.time()
    try:
        with get_auth_db() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.email, u.name, u.avatar_url, u.auth_provider, s.expires_at
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.session_token = ? AND s.expires_at > ?
                """,
                (token, now)
            ).fetchone()
            if row:
                return dict(row)
    except Exception:
        pass
    return None

def invalidate_user_session(token: str):
    if not token:
        return
    try:
        with get_auth_db() as conn:
            conn.execute("DELETE FROM sessions WHERE session_token = ?", (token,))
            conn.commit()
    except Exception:
        pass

def get_user_profile(user_id: str):
    try:
        with get_auth_db() as conn:
            row = conn.execute(
                "SELECT * FROM user_profiles WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            if row:
                d = dict(row)
                try:
                    d["keys"] = json.loads(d.get("encrypted_keys_json") or "{}")
                except Exception:
                    d["keys"] = {}
                try:
                    d["settings"] = json.loads(d.get("settings_json") or "{}")
                except Exception:
                    d["settings"] = {}
                return d
    except Exception:
        pass
    return {
        "user_id": user_id,
        "active_provider": "custom",
        "active_model": "",
        "custom_base_url": "",
        "keys": {},
        "settings": {}
    }

def save_user_profile(user_id: str, active_provider: str, active_model: str, custom_base_url: str, keys_dict: dict, settings_dict: dict):
    now = time.time()
    keys_json = json.dumps(keys_dict or {})
    settings_json = json.dumps(settings_dict or {})
    with get_auth_db() as conn:
        conn.execute(
            """
            INSERT INTO user_profiles (user_id, active_provider, active_model, custom_base_url, encrypted_keys_json, settings_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                active_provider=excluded.active_provider,
                active_model=excluded.active_model,
                custom_base_url=excluded.custom_base_url,
                encrypted_keys_json=excluded.encrypted_keys_json,
                settings_json=excluded.settings_json,
                updated_at=excluded.updated_at
            """,
            (user_id, active_provider, active_model, custom_base_url, keys_json, settings_json, now)
        )
        conn.commit()

# --- Security: Multi-Tier DoH Resolver ---
class DoHResolver:
    def __init__(self):
        self.cache = {}
        self.lock = threading.Lock()
        self.providers = [
            ("Cloudflare", "https://cloudflare-dns.com/dns-query?name={}&type=A"),
            ("Google", "https://dns.google/resolve?name={}&type=A")
        ]

    def resolve(self, hostname: str) -> str:
        if not hostname or hostname in ("localhost", "127.0.0.1", "0.0.0.0") or re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname):
            return hostname

        now = time.time()
        with self.lock:
            if hostname in self.cache:
                ip, exp, src = self.cache[hostname]
                if now < exp:
                    return ip

        # Tier 1: Cloudflare & Google DoH
        for name, url_template in self.providers:
            try:
                target_url = url_template.format(urllib.parse.quote(hostname))
                if CURL_CFFI_AVAILABLE:
                    resp = cffi_requests.get(target_url, headers={"Accept": "application/dns-json"}, timeout=3, impersonate="chrome124")
                    data = resp.json()
                else:
                    req = urllib.request.Request(target_url, headers={"Accept": "application/dns-json", "User-Agent": "AgentChat-DoH/3.0"})
                    with urllib.request.urlopen(req, timeout=3) as r:
                        data = json.loads(r.read().decode("utf-8"))

                answers = data.get("Answer", [])
                for ans in answers:
                    if ans.get("type") == 1:
                        ip = ans.get("data", "").strip()
                        if ip and re.match(r"^\d{1,3}(\.\d{1,3}){3}$", ip):
                            ttl = max(60, min(ans.get("TTL", 300), 3600))
                            with self.lock:
                                self.cache[hostname] = (ip, now + ttl, name)
                            sys.stdout.write(f"🌐 [DoH Resolver: {name}] Resolved {hostname} -> {ip}\n")
                            sys.stdout.flush()
                            return ip
            except Exception:
                continue

        # Tier 2: System DNS Fallback
        try:
            ip = socket.gethostbyname(hostname)
            with self.lock:
                self.cache[hostname] = (ip, now + 300, "System DNS")
            return ip
        except Exception:
            return hostname

doh_resolver = DoHResolver()

# --- Security: MCP Sandboxing & Allowlist ---
MCP_ALLOWLIST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_allowlist.json")

def load_mcp_allowlist():
    if os.path.exists(MCP_ALLOWLIST_PATH):
        try:
            with open(MCP_ALLOWLIST_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "allowlist": ["python", "python3", "node", "npx"],
        "enforce_allowlist": True,
        "blocked_patterns": ["&&", ";", "||", "|", "`", "$(", ">", "<", "rm -rf", "del /s", "format", "mkfs"],
        "max_execution_seconds": 15,
        "max_memory_mb": 512
    }

def validate_and_sandbox_command(cmd_str, extra_args=None):
    if not cmd_str or not cmd_str.strip():
        raise ValueError("Empty command cannot be executed")

    cfg = load_mcp_allowlist()
    blocked = cfg.get("blocked_patterns", [])
    for bp in blocked:
        if bp in cmd_str:
            raise PermissionError(f"Security Shield: Command contains forbidden metacharacter '{bp}'")

    parsed_parts = shlex.split(cmd_str, posix=(os.name != 'nt'))
    if not parsed_parts:
        raise ValueError("Invalid command syntax")

    binary_name = os.path.basename(parsed_parts[0]).lower()
    if binary_name.endswith(".exe"):
        binary_name = binary_name[:-4]

    if cfg.get("enforce_allowlist", True):
        allowed = [a.lower() for a in cfg.get("allowlist", [])]
        if binary_name not in allowed:
            raise PermissionError(
                f"Security Deny: Binary '{binary_name}' is not in mcp_allowlist.json (Deny-by-default policy)."
            )

    full_cmd = list(parsed_parts)
    if extra_args and isinstance(extra_args, list):
        for a in extra_args:
            for bp in blocked:
                if bp in str(a):
                    raise PermissionError(f"Security Shield: Argument contains forbidden token '{bp}'")
            full_cmd.append(str(a))

    return full_cmd, cfg.get("max_execution_seconds", 15)

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

# AgentRouter Exact Models Catalog (matches agentrouter.org dashboard)
AGENTROUTER_MODELS = [
    {
        "id": "claude-opus-4-8",
        "name": "claude-opus-4-8",
        "display_name": "✳️ claude-opus-4-8",
        "category": "Anthropic",
        "provider": "anthropic",
        "description": "Anthropic Claude Opus 4-8 on AgentRouter",
        "status": "online"
    },
    {
        "id": "claude-opus-5",
        "name": "claude-opus-5",
        "display_name": "✳️ claude-opus-5",
        "category": "Anthropic",
        "provider": "anthropic",
        "description": "Anthropic Claude Opus 5 flagship on AgentRouter",
        "status": "online"
    },
    {
        "id": "deepseek-v4-flash",
        "name": "deepseek-v4-flash",
        "display_name": "🐳 deepseek-v4-flash",
        "category": "DeepSeek",
        "provider": "deepseek",
        "description": "DeepSeek V4 Flash next-generation reasoning on AgentRouter",
        "status": "online"
    },
    {
        "id": "gpt-5.6-sol",
        "name": "gpt-5.6-sol",
        "display_name": "🌀 gpt-5.6-sol",
        "category": "OpenAI",
        "provider": "openai",
        "description": "OpenAI GPT-5.6 Sol frontier model on AgentRouter",
        "status": "online"
    },
    {
        "id": "gpt-6-astra",
        "name": "gpt-6-astra",
        "display_name": "⚛️ gpt-6-astra",
        "category": "OpenAI",
        "provider": "openai",
        "description": "OpenAI GPT-6 Astra next-generation frontier on AgentRouter",
        "status": "online"
    }
]

# Comprehensive Frontier Models Catalog for Custom Provider & Reverse Proxies (AgentRouter, OpenRouter, Anthropic)
CUSTOM_FRONTIER_MODELS = AGENTROUTER_MODELS + [
    {
        "id": "claude-3-opus-20240229",
        "name": "🎭 Claude 3 Opus (Anthropic Flagship)",
        "description": "Anthropic's powerhouse for deep comprehension, synthesis, coding, and long-form analysis.",
        "category": "Frontier",
        "status": "online"
    },
    {
        "id": "claude-3-5-sonnet-20241022",
        "name": "⚡ Claude 3.5 Sonnet (Anthropic)",
        "description": "Frontier code generation, reasoning, and multimodal understanding.",
        "category": "Frontier",
        "status": "online"
    },
    {
        "id": "claude-3-5-haiku-20241022",
        "name": "🪶 Claude 3.5 Haiku (Fast & Precise)",
        "description": "Blazing fast response speed with impressive coding and comprehension ability.",
        "category": "Speed",
        "status": "online"
    },
    {
        "id": "deepseek/deepseek-r1",
        "name": "🧠 DeepSeek R1 (671B Reasoning)",
        "description": "Frontier test-time reasoning & logic. Outperforms Sonnet on math, algorithms, and deep analysis.",
        "category": "Reasoning",
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
        "id": "qwen/qwen-2.5-coder-72b-instruct",
        "name": "💻 Qwen 2.5 Coder 72B (Elite Code)",
        "description": "Undisputed open coding champion. Outperforms Claude 3.5 Sonnet & GPT-4o on programming benchmarks.",
        "category": "Coding",
        "status": "online"
    },
    {
        "id": "openai/gpt-4o",
        "name": "✨ GPT-4o (OpenAI Omni)",
        "description": "High-intelligence flagship multimodal model for complex analysis.",
        "category": "Frontier",
        "status": "online"
    },
    {
        "id": "openai/o1-preview",
        "name": "🧩 OpenAI o1-preview (Deep Reasoning)",
        "description": "Trained with reinforcement learning to perform complex multi-step reasoning before responding.",
        "category": "Reasoning",
        "status": "online"
    },
    {
        "id": "openai/o3-mini",
        "name": "🚀 OpenAI o3-mini (High-Speed Logic)",
        "description": "Next-generation fast STEM and coding reasoning model.",
        "category": "Reasoning",
        "status": "online"
    },
    {
        "id": "google/gemini-2.0-flash-001",
        "name": "🌐 Gemini 2.0 Flash (Fast / 1M)",
        "description": "Blazing fast multimodal reasoning with massive 1,000,000 token context window.",
        "category": "Multimodal",
        "status": "online"
    },
    {
        "id": "google/gemini-2.0-pro-exp-02-05",
        "name": "🔮 Gemini 2.0 Pro Experimental",
        "description": "Google's best model for complex reasoning and coding tasks.",
        "category": "Frontier",
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
            "name": "AgentRouter / Custom Stealth Proxy",
            "base_url": "https://agentrouter.org/v1",
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
                else:
                    # In-memory decryption of secrets stored encrypted at rest
                    for p_info in cfg["providers"].values():
                        if "api_key" in p_info and p_info["api_key"]:
                            p_info["api_key"] = decrypt_secret(p_info["api_key"])
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
    encrypted_cfg = json.loads(json.dumps(cfg))
    if "providers" in encrypted_cfg:
        for p_info in encrypted_cfg["providers"].values():
            if "api_key" in p_info and p_info["api_key"]:
                if not is_masked_key(p_info["api_key"]):
                    p_info["api_key"] = encrypt_secret(p_info["api_key"])
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(encrypted_cfg, f, indent=2)

BROWSER_PROFILES = ["chrome124", "chrome120", "safari17_0"]

def make_upstream_request(endpoint, data=None, method="GET", stream=False, override_key=None, override_url=None):
    prov, prov_key = get_active_provider_info(override_key=override_key, override_url=override_url)
    base_url = (override_url or prov.get("base_url", "https://openrouter.ai/api")).rstrip("/")
    api_key = (override_key or prov.get("api_key", "")).strip()

    # Google AI Studio OpenAI compatibility: endpoints are /chat/completions and /models without /v1
    if "generativelanguage.googleapis.com" in base_url and endpoint.startswith("/v1/"):
        endpoint = endpoint[3:]
    elif base_url.endswith("/v1") and endpoint.startswith("/v1/"):
        endpoint = endpoint[3:]

    target_url = f"{base_url}{endpoint}"
    parsed = urlparse(target_url)

    # Multi-Tier DoH DNS Resolution (Cloudflare -> Google -> System fallback)
    resolved_ip = doh_resolver.resolve(parsed.hostname)

    # Realistic Chromium header sequencing to avoid bot heuristics
    headers = {
        "Host": parsed.netloc,
        "Connection": "keep-alive",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/event-stream, */*",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Anthropic native or reverse proxy compatibility
    if api_key.startswith("sk-ant-") or "anthropic" in base_url.lower():
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"

    # AgentRouter / Claude Code authorized client fingerprint (bypasses "unauthorized client detected" WAF gate)
    if "agentrouter" in base_url.lower() or prov_key == "custom":
        headers["User-Agent"] = "claude-cli/0.2.29 (external, sdk-cli)"
        headers["anthropic-version"] = "2023-06-01"
        headers["anthropic-beta"] = "claude-code-20250219,interleaved-thinking-2024-11-20"
        headers["anthropic-dangerous-direct-browser-access"] = "true"
        headers["x-app"] = "cli"
        headers["x-stainless-lang"] = "js"
        headers["x-stainless-package-version"] = "0.33.0"
        headers["x-stainless-os"] = "Windows"
        headers["x-stainless-arch"] = "x64"
        headers["x-stainless-runtime"] = "node"
        headers["x-stainless-runtime-version"] = "v20.11.0"
        if not headers.get("x-api-key"):
            headers["x-api-key"] = api_key

    if CURL_CFFI_AVAILABLE:
        impersonate_choice = random.choice(BROWSER_PROFILES)
        session = cffi_requests.Session(impersonate=impersonate_choice)
        if method == "POST":
            return session.post(target_url, json=data, headers=headers, stream=stream, timeout=60)
        else:
            return session.get(target_url, headers=headers, stream=stream, timeout=60)
    else:
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
        req_origin = self.headers.get("Origin", "")
        if req_origin:
            self.send_header("Access-Control-Allow-Origin", req_origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Access-Password, X-Custom-Api-Key, X-Custom-Base-Url, X-User-Session")
        super().end_headers()

    def get_authenticated_user(self):
        auth_header = self.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
        if not token:
            token = self.headers.get("X-User-Session", "").strip()
        if not token:
            cookie_header = self.headers.get("Cookie", "")
            if "agentchat_session=" in cookie_header:
                for c in cookie_header.split(";"):
                    parts = c.strip().split("=")
                    if len(parts) == 2 and parts[0] == "agentchat_session":
                        token = parts[1]
                        break
        if token:
            return get_user_from_session(token)
        return None

    def check_auth(self):
        parsed = urlparse(self.path)
        # Auth endpoints are publicly reachable to allow sign-in / registration
        if parsed.path.startswith("/api/auth/"):
            return True

        # Valid user session grants access
        if self.get_authenticated_user() is not None:
            return True

        expected_pw = ACCESS_PASSWORD or load_config().get("access_password", "")
        if not expected_pw:
            return True
        provided = self.headers.get("X-Access-Password", "")
        if not provided:
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

        if path == "/api/auth/me":
            self.handle_auth_me()
        elif path == "/api/user/sync":
            self.handle_user_sync_get()
        elif path == "/api/config":
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

        if path == "/api/auth/register":
            self.handle_auth_register()
        elif path == "/api/auth/login":
            self.handle_auth_login()
        elif path == "/api/auth/social-login":
            self.handle_auth_social_login()
        elif path == "/api/auth/logout":
            self.handle_auth_logout()
        elif path == "/api/auth/logout-all":
            self.handle_auth_logout_all()
        elif path == "/api/user/profile-update":
            self.handle_user_profile_update()
        elif path == "/api/user/sync":
            self.handle_user_sync_post()
        elif path == "/api/config":
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

    def handle_auth_register(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            email = data.get("email", "").strip().lower()
            password = data.get("password", "").strip()
            name = data.get("name", "").strip() or email.split("@")[0] or "User"

            if not email or "@" not in email:
                self.send_json({"success": False, "error": "Valid email address is required"}, status=400)
                return
            if len(password) < 6:
                self.send_json({"success": False, "error": "Password must be at least 6 characters"}, status=400)
                return

            with get_auth_db() as conn:
                existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
                if existing:
                    self.send_json({"success": False, "error": "An account with this email already exists. Please sign in."}, status=400)
                    return

                user_id = "usr_" + str(uuid.uuid4()).replace("-", "")[:16]
                p_hash, salt = hash_password(password)
                now = time.time()
                conn.execute(
                    """
                    INSERT INTO users (id, email, name, avatar_url, auth_provider, password_hash, salt, created_at, last_login)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, email, name, "", "email", p_hash, salt, now, now)
                )
                conn.commit()

            session_token = create_user_session(user_id, duration_days=30)
            user_data = {"id": user_id, "email": email, "name": name, "avatar_url": "", "auth_provider": "email"}
            profile = get_user_profile(user_id)

            self.send_response(200)
            self.send_header("Set-Cookie", f"agentchat_session={session_token}; Path=/; Max-Age=2592000; SameSite=Lax")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "token": session_token, "user": user_data, "profile": profile}).encode("utf-8"))
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

    def handle_auth_login(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            email = data.get("email", "").strip().lower()
            password = data.get("password", "").strip()

            if not email or not password:
                self.send_json({"success": False, "error": "Email and password are required"}, status=400)
                return

            with get_auth_db() as conn:
                row = conn.execute(
                    "SELECT id, email, name, avatar_url, auth_provider, password_hash, salt FROM users WHERE email = ?",
                    (email,)
                ).fetchone()
                if not row:
                    self.send_json({"success": False, "error": "Invalid email or password"}, status=401)
                    return

                u = dict(row)
                if not verify_password(password, u["salt"], u["password_hash"]):
                    self.send_json({"success": False, "error": "Invalid email or password"}, status=401)
                    return

                conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (time.time(), u["id"]))
                conn.commit()

            session_token = create_user_session(u["id"], duration_days=30)
            user_data = {"id": u["id"], "email": u["email"], "name": u["name"], "avatar_url": u["avatar_url"], "auth_provider": u["auth_provider"]}
            profile = get_user_profile(u["id"])

            self.send_response(200)
            self.send_header("Set-Cookie", f"agentchat_session={session_token}; Path=/; Max-Age=2592000; SameSite=Lax")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "token": session_token, "user": user_data, "profile": profile}).encode("utf-8"))
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

    def handle_auth_social_login(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            provider = data.get("provider", "google").lower()
            credential = data.get("credential", "").strip()
            email = data.get("email", "").strip().lower()
            name = data.get("name", "").strip()
            avatar_url = data.get("avatar_url", "").strip()

            # If Google GSI credential JWT was sent, decode payload
            if credential:
                try:
                    parts = credential.split(".")
                    if len(parts) >= 2:
                        payload_b64 = parts[1]
                        payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
                        claims = json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8"))
                        if claims.get("email"):
                            email = claims["email"].strip().lower()
                        if claims.get("name"):
                            name = claims["name"].strip()
                        if claims.get("picture"):
                            avatar_url = claims["picture"].strip()
                except Exception as ex:
                    print("Google credential decode error:", ex)

            if not email:
                self.send_json({"success": False, "error": f"A valid {provider.capitalize()} account email is required to authenticate."}, status=400)
                return

            if not name:
                name = email.split("@")[0]

            with get_auth_db() as conn:
                row = conn.execute("SELECT id, email, name, avatar_url, auth_provider, created_at FROM users WHERE email = ?", (email,)).fetchone()
                if row:
                    user_id = row["id"]
                    conn.execute(
                        "UPDATE users SET last_login = ?, name = COALESCE(NULLIF(?, ''), name), avatar_url = COALESCE(NULLIF(?, ''), avatar_url), auth_provider = ? WHERE id = ?",
                        (time.time(), name, avatar_url, provider, user_id)
                    )
                    conn.commit()
                    user_data = dict(conn.execute("SELECT id, email, name, avatar_url, auth_provider, created_at FROM users WHERE id = ?", (user_id,)).fetchone())
                else:
                    user_id = "usr_" + str(uuid.uuid4()).replace("-", "")[:16]
                    now = time.time()
                    conn.execute(
                        """
                        INSERT INTO users (id, email, name, avatar_url, auth_provider, created_at, last_login)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (user_id, email, name, avatar_url, provider, now, now)
                    )
                    conn.commit()
                    user_data = {"id": user_id, "email": email, "name": name, "avatar_url": avatar_url, "auth_provider": provider, "created_at": now}

            session_token = create_user_session(user_id, duration_days=30)
            profile = get_user_profile(user_id)

            self.send_response(200)
            self.send_header("Set-Cookie", f"agentchat_session={session_token}; Path=/; Max-Age=2592000; SameSite=Lax")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "token": session_token, "user": user_data, "profile": profile}).encode("utf-8"))
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

    def handle_auth_me(self):
        user = self.get_authenticated_user()
        if not user:
            self.send_json({"authenticated": False, "user": None, "profile": None})
            return
        profile = get_user_profile(user["id"])
        self.send_json({"authenticated": True, "user": user, "profile": profile})

    def handle_auth_logout(self):
        auth_header = self.headers.get("Authorization", "")
        token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else self.headers.get("X-User-Session", "").strip()
        if token:
            invalidate_user_session(token)
        self.send_response(200)
        self.send_header("Set-Cookie", "agentchat_session=; Path=/; Max-Age=0; SameSite=Lax")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"success": True, "message": "Logged out"}).encode("utf-8"))

    def handle_auth_logout_all(self):
        user = self.get_authenticated_user()
        if not user:
            self.send_json({"success": False, "error": "Authentication required"}, status=401)
            return
        with get_auth_db() as conn:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
            conn.commit()
        self.send_response(200)
        self.send_header("Set-Cookie", "agentchat_session=; Path=/; Max-Age=0; SameSite=Lax")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"success": True, "message": "Signed out of all devices"}).encode("utf-8"))

    def handle_user_profile_update(self):
        user = self.get_authenticated_user()
        if not user:
            self.send_json({"success": False, "error": "Authentication required"}, status=401)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            new_name = data.get("name", "").strip()
            new_avatar = data.get("avatar_url", "").strip()
            with get_auth_db() as conn:
                if new_name or new_avatar:
                    conn.execute("UPDATE users SET name = COALESCE(NULLIF(?, ''), name), avatar_url = COALESCE(NULLIF(?, ''), avatar_url) WHERE id = ?", (new_name, new_avatar, user["id"]))
                    conn.commit()
                updated_user = dict(conn.execute("SELECT id, email, name, avatar_url, auth_provider, created_at, last_login FROM users WHERE id = ?", (user["id"],)).fetchone())
            self.send_json({"success": True, "user": updated_user})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

    def handle_user_sync_post(self):
        user = self.get_authenticated_user()
        if not user:
            self.send_json({"success": False, "error": "Authentication required to sync profile"}, status=401)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            active_provider = data.get("active_provider", "custom")
            active_model = data.get("active_model", "")
            custom_base_url = data.get("custom_base_url", "")
            keys_dict = data.get("keys", {})
            settings_dict = data.get("settings", {})

            save_user_profile(user["id"], active_provider, active_model, custom_base_url, keys_dict, settings_dict)
            updated = get_user_profile(user["id"])
            self.send_json({"success": True, "profile": updated})
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=500)

    def handle_user_sync_get(self):
        user = self.get_authenticated_user()
        if not user:
            self.send_json({"success": False, "error": "Authentication required to retrieve synced profile"}, status=401)
            return
        profile = get_user_profile(user["id"])
        self.send_json({"success": True, "profile": profile})

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
            command = data.get("command", "").strip()
            args = data.get("args", [])
            if not command:
                self.send_json({"success": False, "error": "Command is required for testing"}, status=400)
                return

            validated_cmd, timeout_sec = validate_and_sandbox_command(command, args)

            def set_limits():
                if os.name != 'nt':
                    try:
                        import resource
                        resource.setrlimit(resource.RLIMIT_CPU, (timeout_sec, timeout_sec))
                        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
                    except Exception:
                        pass

            res = subprocess.run(
                validated_cmd,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                shell=False,
                preexec_fn=set_limits if os.name != 'nt' else None
            )

            self.send_json({
                "success": True,
                "sandboxed": True,
                "command": validated_cmd[0],
                "exit_code": res.returncode,
                "stdout": res.stdout[:500] if res.stdout else "",
                "stderr": res.stderr[:500] if res.stderr else "",
                "message": f"MCP sandboxed execution test succeeded for '{validated_cmd[0]}'."
            })
        except PermissionError as pe:
            self.send_json({"success": False, "error": str(pe), "sandboxed_rejection": True}, status=403)
        except subprocess.TimeoutExpired:
            self.send_json({"success": False, "error": "Execution timed out (15s limit reached)"}, status=408)
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

        elif "agentrouter.org" in base_url or prov_key == "custom":
            try:
                res = make_upstream_request("/dashboard/billing/usage", method="GET")
                data = json.loads(res.read().decode("utf-8"))
                usage = data.get("total_usage", 0.0)
                usage_usd = float(usage) / 100.0 if float(usage) > 50 else float(usage)
                self.send_json({
                    "success": True,
                    "provider": "Custom Endpoint",
                    "formatted": f"${usage_usd:.2f} Used",
                    "usage": usage_usd,
                    "mode": "metered"
                })
                return
            except Exception:
                self.send_json({
                    "success": True,
                    "provider": "Custom Endpoint",
                    "formatted": "Active",
                    "mode": "active"
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

        user = self.get_authenticated_user()
        if user:
            profile = get_user_profile(user["id"])
            user_prov = profile.get("active_provider", "custom")
            if not override_key:
                override_key = profile.get("keys", {}).get(user_prov, "")
            if not override_url and profile.get("custom_base_url"):
                override_url = profile.get("custom_base_url")

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
                if hasattr(res, 'json'):
                    raw = res.json()
                elif hasattr(res, 'read'):
                    raw = json.loads(res.read().decode("utf-8"))
                else:
                    raw = json.loads(getattr(res, 'text', '{}'))
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

                # Ensure AGENTROUTER_MODELS are at the top for custom / AgentRouter provider
                if prov_key == "custom" or "agentrouter" in active_url.lower():
                    existing_ids = {m["id"].lower() for m in discovered_models}
                    for arm in reversed(AGENTROUTER_MODELS):
                        if arm["id"].lower() in existing_ids:
                            discovered_models = [m for m in discovered_models if m["id"].lower() != arm["id"].lower()]
                        discovered_models.insert(0, arm)
                else:
                    existing_ids = {m["id"].lower() for m in discovered_models}
                    for fm in CUSTOM_FRONTIER_MODELS:
                        if fm["id"].lower() not in existing_ids:
                            discovered_models.append(fm)
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
                # If provider query fails (e.g. AgentRouter requires auth for /v1/models), return curated AgentRouter catalog
                fallback_models = AGENTROUTER_MODELS if (prov_key == "custom" or "agentrouter" in active_url.lower()) else CUSTOM_FRONTIER_MODELS
                self.send_json({
                    "success": True,
                    "provider": prov_key,
                    "models": fallback_models,
                    "source": "agentrouter_catalog" if (prov_key == "custom" or "agentrouter" in active_url.lower()) else "custom_frontier",
                    "note": f"Catalog active ({str(e)})"
                })
                return

        # If Custom Provider is selected, return the exact AgentRouter catalog
        if prov_key == "custom" or "agentrouter" in active_url.lower():
            self.send_json({
                "success": True,
                "provider": "custom",
                "models": AGENTROUTER_MODELS,
                "source": "agentrouter_exact"
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

        user = self.get_authenticated_user()
        if user:
            profile = get_user_profile(user["id"])
            user_prov = profile.get("active_provider", "custom")
            if not override_key:
                override_key = profile.get("keys", {}).get(user_prov, "")
            if not override_url and profile.get("custom_base_url"):
                override_url = profile.get("custom_base_url")

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
        persona_directives = req_data.get("persona_directives", "").strip()

        combined_sys = []
        if system_prompt and system_prompt.strip():
            combined_sys.append(system_prompt.strip())
        if persona_directives:
            combined_sys.append(f"### [AI Developer Persona & Engineering Directives]:\n{persona_directives}")
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
            if model in ("google/gemini-2.0-flash-001", "gemini-2.0-flash-001", "gemini-2.0-flash", "gemini-2.5-flash") or "/" in model or not model.startswith("gemini"):
                model = "gemini-3.6-flash"
        elif "api.groq.com" in active_base_url or api_key.startswith("gsk_"):
            if "deepseek-r1" in model or "reasoning" in model.lower():
                model = "deepseek-r1-distill-llama-70b"
            elif "/" in model:
                model = "llama-3.3-70b-versatile"

        # Model Architecture Analysis for Reasoning & Parameter Adaptation
        model_lower = model.lower()
        active_base_url_lower = active_base_url.lower()
        is_glm = "glm" in model_lower or "bigmodel" in active_base_url_lower or "zhipu" in active_base_url_lower
        is_o_series = any(model_lower.startswith(prefix) or f"/{prefix}" in model_lower for prefix in ["o1", "o3", "o-1", "o-3"])
        is_claude = "claude" in model_lower or "anthropic" in model_lower

        payload = {
            "model": model,
            "messages": final_messages,
            "stream": stream,
        }

        # Temperature handling (o-series models reject custom temperature or only allow 1.0)
        if not is_o_series:
            payload["temperature"] = temperature

        # Reasoning effort and token budget adaptation
        if is_glm:
            # GLM models (GLM-5, GLM-5.3, etc.) strictly require 'low', 'high', or 'max'
            # Sending 'medium' or omitting thinking triggers error 1210: "该模型始终思考，不支持关闭思考；请使用 low、high 或 max"
            glm_effort_map = {
                "low": "low",
                "medium": "high",  # Auto-map medium to high for GLM compatibility
                "high": "high",
                "extra": "high",
                "ultra": "max",
                "max": "max"
            }
            payload["thinking"] = {"type": "enabled"}
            payload["reasoning_effort"] = glm_effort_map.get(effort.lower(), "high")
            payload["max_tokens"] = effort_config["max_tokens"]
        elif is_o_series:
            # OpenAI o1/o3 reasoning models support 'low', 'medium', 'high' (no max) and use max_completion_tokens
            o_effort_map = {
                "low": "low",
                "medium": "medium",
                "high": "high",
                "extra": "high",
                "ultra": "high",
                "max": "high"
            }
            payload["reasoning_effort"] = o_effort_map.get(effort.lower(), "medium")
            payload["max_completion_tokens"] = effort_config["max_tokens"]
        elif is_claude:
            # Anthropic Claude models (Opus, Sonnet, Haiku) reject reasoning_effort and thinking parameters
            payload["max_tokens"] = effort_config["max_tokens"]
        else:
            payload["max_tokens"] = effort_config["max_tokens"]
            payload["reasoning_effort"] = effort_config["reasoning_effort"]

        # Self-Healing Request Dispatch with Dynamic Parameter Recovery
        max_attempts = 3
        upstream_res = None
        for attempt in range(max_attempts):
            try:
                upstream_res = make_upstream_request(
                    "/v1/chat/completions",
                    data=payload,
                    method="POST",
                    stream=True,
                    override_key=override_key,
                    override_url=override_url
                )
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                if attempt < max_attempts - 1:
                    # Auto-heal: GLM thinking requirement (1210 / 始终思考)
                    if any(kw in err_body for kw in ["始终思考", "不支持关闭思考", "请使用 low", "1210"]):
                        payload["thinking"] = {"type": "enabled"}
                        payload["reasoning_effort"] = "high"
                        continue
                    # Auto-heal: Unrecognized reasoning_effort
                    if "reasoning_effort" in err_body and any(w in err_body.lower() for w in ["unrecognized", "unexpected", "extra fields", "unknown", "invalid"]):
                        payload.pop("reasoning_effort", None)
                        payload.pop("thinking", None)
                        continue
                    # Auto-heal: max_completion_tokens vs max_tokens
                    if "max_completion_tokens" in err_body.lower() or "max_tokens is not supported" in err_body.lower():
                        if "max_tokens" in payload:
                            payload["max_completion_tokens"] = payload.pop("max_tokens")
                            continue
                    # Auto-heal: Temperature not supported
                    if "temperature" in err_body.lower() and any(w in err_body.lower() for w in ["unsupported", "not supported", "only default", "1.0", "cannot"]):
                        payload.pop("temperature", None)
                        continue

                # Final attempt error reporting
                friendly_msg = err_body
                try:
                    err_json = json.loads(err_body)
                    msg_val = err_json.get("error", {}).get("message", "")
                    if "Budget pool quota has been exhausted" in msg_val or "budget pool" in msg_val.lower():
                        friendly_msg = f"AgentRouter Notice: Budget pool quota is currently exhausted for '{model}'. Try switching to 'deepseek-v4-flash' or adjust budget pools in your AgentRouter dashboard."
                    elif "unauthorized client" in msg_val.lower():
                        friendly_msg = "AgentRouter Client Notice: Unauthorized client detected. AgentChat uses Claude Code headers to bypass this."
                    elif "始终思考" in msg_val or "1210" in str(err_json):
                        friendly_msg = f"Reasoning Parameter Notice: Model '{model}' requires reasoning effort 'low', 'high', or 'max'. Setting effort to High resolves this."
                    elif msg_val:
                        friendly_msg = msg_val
                except Exception:
                    pass

                err_event = f"event: error\ndata: {json.dumps({'error': friendly_msg, 'code': e.code})}\n\n"
                self.wfile.write(err_event.encode("utf-8"))
                self.wfile.flush()
                return
            except Exception as e:
                err_event = f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                self.wfile.write(err_event.encode("utf-8"))
                self.wfile.flush()
                return

            # Check status code for curl_cffi / response object
            status_code = getattr(upstream_res, 'status_code', getattr(upstream_res, 'code', 200))
            if status_code >= 400:
                err_body = getattr(upstream_res, 'text', '')
                if not err_body and hasattr(upstream_res, 'read'):
                    err_body = upstream_res.read().decode("utf-8", errors="replace")

                if attempt < max_attempts - 1:
                    # Auto-heal: GLM thinking requirement (1210 / 始终思考)
                    if any(kw in err_body for kw in ["始终思考", "不支持关闭思考", "请使用 low", "1210"]):
                        payload["thinking"] = {"type": "enabled"}
                        payload["reasoning_effort"] = "high"
                        continue
                    # Auto-heal: Unrecognized reasoning_effort
                    if "reasoning_effort" in err_body and any(w in err_body.lower() for w in ["unrecognized", "unexpected", "extra fields", "unknown", "invalid"]):
                        payload.pop("reasoning_effort", None)
                        payload.pop("thinking", None)
                        continue
                    # Auto-heal: max_completion_tokens vs max_tokens
                    if "max_completion_tokens" in err_body.lower() or "max_tokens is not supported" in err_body.lower():
                        if "max_tokens" in payload:
                            payload["max_completion_tokens"] = payload.pop("max_tokens")
                            continue
                    # Auto-heal: Temperature not supported
                    if "temperature" in err_body.lower() and any(w in err_body.lower() for w in ["unsupported", "not supported", "only default", "1.0", "cannot"]):
                        payload.pop("temperature", None)
                        continue

                # Final attempt error reporting
                friendly_err = err_body
                try:
                    parsed_err = json.loads(err_body)
                    msg_val = parsed_err.get("error", {}).get("message", "")
                    if "Budget pool quota has been exhausted" in msg_val or "budget pool" in msg_val.lower():
                        friendly_err = f"AgentRouter Notice: Budget pool quota is currently exhausted for '{model}'. Try switching to 'deepseek-v4-flash' or adjust budget pools in your AgentRouter dashboard."
                    elif "unauthorized client" in msg_val.lower():
                        friendly_err = "AgentRouter Client Notice: Unauthorized client detected. AgentChat uses Claude Code headers to bypass this."
                    elif "始终思考" in msg_val or "1210" in str(parsed_err):
                        friendly_err = f"Reasoning Parameter Notice: Model '{model}' requires reasoning effort 'low', 'high', or 'max'. Setting effort to High resolves this."
                    elif msg_val:
                        friendly_err = msg_val
                except Exception:
                    pass

                err_event = f"event: error\ndata: {json.dumps({'error': friendly_err or f'HTTP {status_code}', 'code': status_code})}\n\n"
                self.wfile.write(err_event.encode("utf-8"))
                self.wfile.flush()
                return

            # Request succeeded: break retry loop to stream response
            break

        if upstream_res is None:
            return

        if hasattr(upstream_res, 'iter_lines'):
            for line in upstream_res.iter_lines():
                if line:
                    self.wfile.write(line + b"\n\n")
                    self.wfile.flush()
        else:
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
