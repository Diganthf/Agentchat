// AgentChat v2 - Full Cherry Studio Architecture with MCP, Models Hub & Conversation History
(function() {
  // State
  let sessions = [];
  let currentSessionId = null;
  let activeAbortController = null;
  let isGenerating = false;
  let webSearchEnabled = false;
  let currentAttachments = [];
  let currentConfig = {};
  let modelStatuses = {};
  let mcpData = { servers: {}, plugins: {} };
  let currentRailTab = "chats";

  const MODEL_DISPLAY_NAMES = {
    "gemini-3.6-flash": "🌐 Gemini 3.6 Flash (Free 1M Window)",
    "gemini-2.5-pro": "🌐 Gemini 2.5 Pro (2M Window)",
    "openai/gpt-oss-120b": "🦙 GPT-OSS 120B Flagship (Groq LPUs)",
    "qwen/qwen3.8-27b": "🧠 Qwen 3.8 27B (Free Reasoning)",
    "openai/gpt-oss-20b": "⚡ GPT-OSS 20B Instant (Free)",
    "gemini-2.5-flash": "🌐 Gemini 3.6 Flash (Free 1M Window)",
    "gemini-2.0-flash": "🌐 Gemini 3.6 Flash (Free 1M Window)",
    "gemini-1.5-flash": "🎁 Gemini 1.5 Flash (Free Tier)",
    "gemini-1.5-pro": "🌐 Gemini 1.5 Pro (2M Window)",
    "llama-3.3-70b-versatile": "🦙 Llama 3.3 70B Versatile (Free Open Weights)",
    "deepseek-r1-distill-llama-70b": "🧠 DeepSeek R1 Distill 70B (Free Reasoning)",
    "llama-3.1-8b-instant": "⚡ Llama 3.1 8B Instant (Free)",
    "deepseek-v4-flash": "⚡ DeepSeek V4 Flash (Lightning Fast 1.5s)",
    "claude-opus-4-8": "✳️ claude-opus-4-8 (Anthropic Frontier)",
    "claude-3-5-sonnet-20241022": "⚡ Claude 3.5 Sonnet (Anthropic)",
    "claude-3-5-sonnet": "⚡ Claude 3.5 Sonnet (Anthropic)",
    "deepseek/deepseek-r1": "🧠 DeepSeek R1 (671B Reasoning)",
    "deepseek/deepseek-chat": "⚡ DeepSeek V3 (671B Nuance)",
    "google/gemini-2.0-flash-001": "🌐 Gemini 2.0 Flash (Fast / 1M)",
    "qwen/qwen-2.5-coder-72b-instruct": "💻 Qwen 2.5 Coder 72B (Elite Code)",
    "openai/gpt-4o": "✨ GPT-4o (OpenAI Omni)",
    "gpt-4o": "✨ GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "openai/o1-preview": "🧩 OpenAI o1-preview",
    "openai/o3-mini": "🚀 OpenAI o3-mini"
  };

  const PROVIDER_DEFAULTS = {
    justdowork: {
      name: "JustDoWork (api.justwoker.icu)",
      base_url: "https://api.justwoker.icu/v1"
    },
    agentrouter: {
      name: "AgentRouter (agentrouter.org)",
      base_url: "https://agentrouter.org/v1"
    },
    puter: {
      name: "Puter.ai (api.puter.com)",
      base_url: "https://api.puter.com/puterai/openai/v1"
    },
    base: {
      name: "Base Tier (Sonnet-Grade)",
      base_url: "https://openrouter.ai/api"
    },
    google: {
      name: "Google AI Studio",
      base_url: "https://generativelanguage.googleapis.com/v1beta/openai"
    },
    openrouter: {
      name: "OpenRouter",
      base_url: "https://openrouter.ai/api"
    },
    groq: {
      name: "Groq Cloud",
      base_url: "https://api.groq.com/openai"
    },
    deepseek: {
      name: "DeepSeek Official",
      base_url: "https://api.deepseek.com"
    },
    openai: {
      name: "OpenAI",
      base_url: "https://api.openai.com"
    },
    custom: {
      name: "Custom Stealth Proxy",
      base_url: "https://agentrouter.org/v1"
    }
  };

  // Model Benchmark Database
  const MODEL_DATABASE = [
    {
      id: "deepseek/deepseek-r1",
      name: "DeepSeek R1 (671B)",
      provider: "DeepSeek",
      overall: 99,
      coding: 98,
      speed: 85,
      efficiency: 99,
      desc: "Frontier open reasoning model. Deep step-by-step Chain of Thought that rivals OpenAI o1 and beats Sonnet on math.",
      tags: ["#1 Reasoning", "O1 Rival"]
    },
    {
      id: "qwen/qwen-2.5-coder-72b-instruct",
      name: "Qwen 2.5 Coder 72B",
      provider: "Alibaba",
      overall: 98,
      coding: 100,
      speed: 92,
      efficiency: 98,
      desc: "Undisputed #1 open-weights coding model. Outperforms Claude 3.5 Sonnet and GPT-4o on HumanEval and system design.",
      tags: ["#1 Coding", "Sonnet Tier"]
    },
    {
      id: "deepseek/deepseek-chat",
      name: "DeepSeek V3 (671B)",
      provider: "DeepSeek",
      overall: 97,
      coding: 96,
      speed: 96,
      efficiency: 99,
      desc: "Instant conversational eloquence, nuanced synthesis, and general reasoning matching Sonnet tone and speed.",
      tags: ["Frontier Generalist", "Fast"]
    },
    {
      id: "google/gemini-2.0-flash-001",
      name: "Gemini 2.0 Flash",
      provider: "Google",
      overall: 96,
      coding: 95,
      speed: 99,
      efficiency: 98,
      desc: "Ultra-fast multimodal reasoning with a massive 1,000,000 token context window and free tier access.",
      tags: ["1M Context", "Ultra Fast"]
    }
  ];

  // DOM Elements
  const chatList = document.getElementById("chat-list");
  const messagesList = document.getElementById("messages-list");
  const messagesContainer = document.getElementById("messages-container");
  const welcomeScreen = document.getElementById("welcome-screen");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const stopBtn = document.getElementById("stop-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const chatSearchInput = document.getElementById("chat-search-input");
  const modelSelect = document.getElementById("model-select");
  const providerSelect = document.getElementById("provider-select");
  const effortSelect = document.getElementById("effort-select");
  const subSidebar = document.getElementById("sub-sidebar");
  const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");

  // Navigation Rail Tabs
  const railTabChats = document.getElementById("rail-tab-chats");
  const railTabModels = document.getElementById("rail-tab-models");
  const railTabSkills = document.getElementById("rail-tab-skills");
  const railTabProjects = document.getElementById("rail-tab-projects");
  const railTabMcp = document.getElementById("rail-tab-mcp");
  const railTabSettings = document.getElementById("rail-tab-settings");

  // Secondary Panes
  const paneChats = document.getElementById("pane-chats");
  const paneModels = document.getElementById("pane-models");
  const paneSkills = document.getElementById("pane-skills");
  const paneProjects = document.getElementById("pane-projects");
  const paneMcp = document.getElementById("pane-mcp");
  const modelsMiniList = document.getElementById("models-mini-list");
  const mcpServersList = document.getElementById("mcp-servers-list");
  const skillsList = document.getElementById("skills-list");
  const projectActiveCard = document.getElementById("project-active-card");
  const projectFilesSection = document.getElementById("project-files-section");
  const projectFileCountLabel = document.getElementById("project-file-count-label");
  const projectFileFilter = document.getElementById("project-file-filter");
  const projectTreeContainer = document.getElementById("project-tree-container");
  const savedProjectsList = document.getElementById("saved-projects-list");

  // Topbar Indicator Pills
  const skillsStatusPill = document.getElementById("skills-status-pill");
  const skillsStatusText = document.getElementById("skills-status-text");
  const projectStatusPill = document.getElementById("project-status-pill");
  const projectStatusText = document.getElementById("project-status-text");
  const exportAllChatsBtn = document.getElementById("export-all-chats-btn");

  // Skills Modal Elements
  const createSkillModal = document.getElementById("create-skill-modal");
  const openAddSkillBtn = document.getElementById("open-add-skill-btn");
  const closeSkillModalBtn = document.getElementById("close-skill-modal-btn");
  const saveSkillBtn = document.getElementById("save-skill-btn");
  const skillNameInput = document.getElementById("skill-name-input");
  const skillIconInput = document.getElementById("skill-icon-input");
  const skillCategoryInput = document.getElementById("skill-category-input");
  const skillDescInput = document.getElementById("skill-desc-input");
  const skillPromptInput = document.getElementById("skill-prompt-input");

  // Projects Modal Elements
  const importProjectModal = document.getElementById("import-project-modal");
  const openImportProjectBtn = document.getElementById("open-import-project-btn");
  const closeImportProjectBtn = document.getElementById("close-import-project-btn");
  const projectPathInput = document.getElementById("project-path-input");
  const scanProjectPathBtn = document.getElementById("scan-project-path-btn");
  const projectFolderInput = document.getElementById("project-folder-input");
  const projectScanStatus = document.getElementById("project-scan-status");

  // File Preview Modal Elements
  const filePreviewModal = document.getElementById("file-preview-modal");
  const closeFilePreviewBtn = document.getElementById("close-file-preview-btn");
  const filePreviewTitle = document.getElementById("file-preview-title");
  const filePreviewCode = document.getElementById("file-preview-code");
  const filePreviewCopyBtn = document.getElementById("file-preview-copy-btn");
  const filePreviewInsertBtn = document.getElementById("file-preview-insert-btn");

  // Tools & Web Search
  const websearchToggleBtn = document.getElementById("websearch-toggle-btn");
  const attachBtn = document.getElementById("attach-btn");
  const fileInput = document.getElementById("file-input");
  const attachmentTray = document.getElementById("attachment-tray");
  const toolsStatusText = document.getElementById("tools-status-text");

  // MCP Modal Elements
  const addMcpModal = document.getElementById("add-mcp-modal");
  const openAddMcpBtn = document.getElementById("open-add-mcp-btn");
  const closeMcpModalBtn = document.getElementById("close-mcp-modal-btn");
  const saveMcpServerBtn = document.getElementById("save-mcp-server-btn");
  const testMcpBtn = document.getElementById("test-mcp-btn");
  const mcpNameInput = document.getElementById("mcp-name-input");
  const mcpCommandInput = document.getElementById("mcp-command-input");
  const mcpArgsInput = document.getElementById("mcp-args-input");
  const mcpTestStatus = document.getElementById("mcp-test-status");

  // Settings Modal Elements
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  const settingProviderChoice = document.getElementById("setting-provider-choice");
  const settingApiKey = document.getElementById("setting-api-key");
  const settingBaseUrl = document.getElementById("setting-base-url");
  const settingAutoCompress = document.getElementById("setting-auto-compress");
  const settingLeanMode = document.getElementById("setting-lean-mode");
  const settingTemp = document.getElementById("setting-temp");
  const tempDisplay = document.getElementById("temp-display");
  const settingSystemPrompt = document.getElementById("setting-system-prompt");
  const toggleKeyVisibility = document.getElementById("toggle-key-visibility");
  const settingSavedKeysSelect = document.getElementById("setting-saved-keys-select");
  const settingKeyAlias = document.getElementById("setting-key-alias");
  const saveKeyToVaultBtn = document.getElementById("save-key-to-vault-btn");
  const deleteCurrentKeyBtn = document.getElementById("delete-current-key-btn");
  const btnAddCustomProxy = document.getElementById("btn-add-custom-proxy");
  const btnDeleteCustomProxy = document.getElementById("btn-delete-custom-proxy");
  const proxyCustomNameGroup = document.getElementById("proxy-custom-name-group");
  const settingProxyCustomName = document.getElementById("setting-proxy-custom-name");

  // Topbar Lean Mode & Token Meter Elements
  const leanModeToggleBtn = document.getElementById("lean-mode-toggle-btn");
  const leanModeLabel = document.getElementById("lean-mode-label");
  const meterInTokens = document.getElementById("meter-in-tokens");
  const meterOutTokens = document.getElementById("meter-out-tokens");
  let isLeanMode = localStorage.getItem("agentchat_lean_mode") === "true";
  let sessionInTokens = 0;
  let sessionOutTokens = 0;

  // Auth Portal & Cloud Sync Elements
  let currentUser = null;
  const userAuthWrapper = document.getElementById("user-auth-wrapper");
  const authPortalBtn = document.getElementById("auth-portal-btn");
  const userNameDisplay = document.getElementById("user-name-display");
  const userAvatarDisplay = document.getElementById("user-avatar-display");
  const syncDotIndicator = document.getElementById("sync-dot-indicator");
  const userDropdownMenu = document.getElementById("user-dropdown-menu");
  const dropdownAvatar = document.getElementById("dropdown-avatar");
  const dropdownName = document.getElementById("dropdown-name");
  const dropdownEmail = document.getElementById("dropdown-email");
  const dropdownSyncBtn = document.getElementById("dropdown-sync-btn");
  const dropdownVaultBtn = document.getElementById("dropdown-vault-btn");
  const dropdownLogoutBtn = document.getElementById("dropdown-logout-btn");

  const authModal = document.getElementById("auth-modal");
  const closeAuthModalBtn = document.getElementById("close-auth-modal-btn");
  const authGuestBtn = document.getElementById("auth-guest-btn");
  const googleLoginBtn = document.getElementById("google-login-btn");
  const githubLoginBtn = document.getElementById("github-login-btn");
  const authForm = document.getElementById("auth-form");
  const authNameGroup = document.getElementById("auth-name-group");
  const authNameInput = document.getElementById("auth-name-input");
  const authEmailInput = document.getElementById("auth-email-input");
  const authPasswordInput = document.getElementById("auth-password-input");
  const authAlertBox = document.getElementById("auth-alert-box");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authToggleModeBtn = document.getElementById("auth-toggle-mode-btn");
  const authToggleText = document.getElementById("auth-toggle-text");
  const settingProtocolMode = document.getElementById("setting-protocol-mode");
  const settingBackendUrl = document.getElementById("setting-backend-url");

  // Account Modal Elements
  const accountModal = document.getElementById("account-modal");
  const closeAccountModalBtn = document.getElementById("close-account-modal-btn");
  const accountModalDoneBtn = document.getElementById("account-modal-done-btn");
  const accountLargeAvatar = document.getElementById("account-large-avatar");
  const accountDisplayNameHeader = document.getElementById("account-display-name-header");
  const accountProviderBadge = document.getElementById("account-provider-badge");
  const accountNameInput = document.getElementById("account-name-input");
  const saveAccountNameBtn = document.getElementById("save-account-name-btn");
  const accountEmailInput = document.getElementById("account-email-input");
  const saveAccountEmailBtn = document.getElementById("save-account-email-btn");
  const accountLoginBtn = document.getElementById("account-login-btn");
  const accountGoogleBtn = document.getElementById("account-google-btn");
  const accountQuickGoogleBtn = document.getElementById("account-quick-google-btn");
  const accountSwitchBtn = document.getElementById("account-switch-btn");
  const accountStatusPill = document.getElementById("account-status-pill");
  const accountEmailDisplay = document.getElementById("account-email-display");
  const accountAvatarInput = document.getElementById("account-avatar-input");
  const saveAccountAvatarBtn = document.getElementById("save-account-avatar-btn");
  const accountJoinedMeta = document.getElementById("account-joined-meta");
  const accountPersonaPrompt = document.getElementById("account-persona-prompt");
  const accountDefaultEffort = document.getElementById("account-default-effort");
  const saveAccountPersonaBtn = document.getElementById("save-account-persona-btn");
  const accountVaultGrid = document.getElementById("account-vault-grid");
  const accountForceSyncBtn = document.getElementById("account-force-sync-btn");
  const accountExportDataBtn = document.getElementById("account-export-data-btn");
  const accountLogoutAllBtn = document.getElementById("account-logout-all-btn");
  const dropdownAccountBtn = document.getElementById("dropdown-account-btn");
  const userDropdownHeaderBtn = document.getElementById("user-dropdown-header-btn");

  // Custom Model Modal Elements
  const customModelModal = document.getElementById("custom-model-modal");
  const closeCustomModelModalBtn = document.getElementById("close-custom-model-modal-btn");
  const cancelCustomModelBtn = document.getElementById("cancel-custom-model-btn");
  const applyCustomModelBtn = document.getElementById("apply-custom-model-btn");
  const customModelInput = document.getElementById("custom-model-input");

  // Google Connect Modal Elements
  const googleConnectModal = document.getElementById("google-connect-modal");
  const closeGoogleConnectModalBtn = document.getElementById("close-google-connect-modal-btn");
  const googleEmailInput = document.getElementById("google-email-input");
  const googleNameInput = document.getElementById("google-name-input");
  const googleConnectAlert = document.getElementById("google-connect-alert");
  const googleConnectSubmitBtn = document.getElementById("google-connect-submit-btn");
  const googleDirectForm = document.getElementById("google-direct-form");
  const googleGsiButtonContainer = document.getElementById("google-gsi-button-container");
  const googleOfficialLoginBtn = document.getElementById("google-official-login-btn");
  const switchToEmailAuthBtn = document.getElementById("switch-to-email-auth-btn");
  const googleGuestModeBtn = document.getElementById("google-guest-mode-btn");

  let authMode = "login";

  // Auth & Zero-Knowledge API Wrapper
  function getAuthHeaders(extra = {}) {
    const headers = { ...extra };
    const token = localStorage.getItem("agentchat_session_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      headers["X-User-Session"] = token;
    }
    const pw = localStorage.getItem("agentchat_access_password") || "";
    if (pw) headers["X-Access-Password"] = pw;

    const activeP = currentConfig.active_provider || "agentrouter";
    headers["X-Active-Provider"] = activeP;

    const clientKey = localStorage.getItem("agentchat_client_key_" + activeP) || currentConfig.providers?.[activeP]?.api_key || "";
    if (clientKey && !clientKey.includes("...") && !clientKey.includes("•••") && !clientKey.includes("••••") && !clientKey.startsWith("enc::")) {
      headers["X-Custom-Api-Key"] = clientKey;
    }
    const clientUrl = localStorage.getItem("agentchat_client_url_" + activeP) || currentConfig.providers?.[activeP]?.base_url || "";
    if (clientUrl) headers["X-Custom-Base-Url"] = clientUrl;
    return headers;
  }

  let isPromptingAuth = false;
  async function apiFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers = getAuthHeaders(options.headers);
    const backendUrl = (localStorage.getItem("agentchat_backend_url") || "").trim().replace(/\/+$/, "");
    const fullUrl = (url.startsWith("/") && backendUrl) ? backendUrl + url : url;
    let res = await fetch(fullUrl, options);
    if (res.status === 401 && !isPromptingAuth) {
      try {
        const data = await res.clone().json();
        if (data.need_auth) {
          isPromptingAuth = true;
          const entered = prompt("🔒 This AgentChat deployment is password-protected.\nPlease enter the Access Password:");
          isPromptingAuth = false;
          if (entered) {
            localStorage.setItem("agentchat_access_password", entered.trim());
            options.headers["X-Access-Password"] = entered.trim();
            res = await fetch(fullUrl, options);
          }
        }
      } catch (e) {
        isPromptingAuth = false;
      }
    }
    return res;
  }

  // Application initialization is called at the bottom of this file after all modules and constants are loaded

  function init() {
    loadSessions();
    initSkills();
    setupEventListeners();
    fetchConfig();
    fetchModels();
    fetchModelStatus();
    fetchProjects();
    fetchMcp();
    // Poll status every 20 minutes
    setInterval(fetchModelStatus, 20 * 60 * 1000);

    if (!sessions.length) {
      createNewChat();
    } else {
      switchChat(sessions[0].id);
    }
  }

  function setupEventListeners() {
    // Rail Navigation
    if (railTabChats) railTabChats.addEventListener("click", () => switchToRailTab("chats"));
    if (railTabModels) railTabModels.addEventListener("click", () => switchToRailTab("models"));
    if (railTabSkills) railTabSkills.addEventListener("click", () => switchToRailTab("skills"));
    if (railTabProjects) railTabProjects.addEventListener("click", () => switchToRailTab("projects"));
    if (railTabMcp) railTabMcp.addEventListener("click", () => switchToRailTab("mcp"));
    if (railTabSettings) {
      railTabSettings.addEventListener("click", () => {
        syncSettingsModalWithConfig();
        if (settingsModal) settingsModal.classList.remove("hidden");
      });
    }

    // History Actions (Export / Clear)
    if (exportAllChatsBtn) exportAllChatsBtn.addEventListener("click", exportAllChatsJSON);
    const clearAllBtn = document.getElementById("clear-all-chats-btn");
    if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllChats);

    // Skills Modal Events
    if (openAddSkillBtn) openAddSkillBtn.addEventListener("click", () => createSkillModal?.classList.remove("hidden"));
    if (closeSkillModalBtn) closeSkillModalBtn.addEventListener("click", () => createSkillModal?.classList.add("hidden"));
    if (createSkillModal) {
      createSkillModal.addEventListener("click", (e) => {
        if (e.target === createSkillModal) createSkillModal.classList.add("hidden");
      });
    }
    if (saveSkillBtn) saveSkillBtn.addEventListener("click", saveCustomSkill);

    // Projects Modal Events
    if (openImportProjectBtn) openImportProjectBtn.addEventListener("click", () => {
      if (importProjectModal) importProjectModal.classList.remove("hidden");
      if (projectScanStatus) projectScanStatus.textContent = "";
    });
    if (closeImportProjectBtn) closeImportProjectBtn.addEventListener("click", () => importProjectModal?.classList.add("hidden"));
    if (importProjectModal) {
      importProjectModal.addEventListener("click", (e) => {
        if (e.target === importProjectModal) importProjectModal.classList.add("hidden");
      });
    }
    if (scanProjectPathBtn) scanProjectPathBtn.addEventListener("click", () => {
      const pathVal = (projectPathInput?.value || "").trim();
      if (pathVal) scanProjectPath(pathVal);
    });
    if (projectFolderInput) projectFolderInput.addEventListener("change", handleFolderSelect);
    if (projectFileFilter) {
      projectFileFilter.addEventListener("input", (e) => {
        renderProjectFilesTree(e.target.value.trim().toLowerCase());
      });
    }

    // File Preview Modal Events
    if (closeFilePreviewBtn) closeFilePreviewBtn.addEventListener("click", () => filePreviewModal?.classList.add("hidden"));
    if (filePreviewModal) {
      filePreviewModal.addEventListener("click", (e) => {
        if (e.target === filePreviewModal) filePreviewModal.classList.add("hidden");
      });
    }
    if (filePreviewCopyBtn) {
      filePreviewCopyBtn.addEventListener("click", () => {
        if (filePreviewCode) {
          navigator.clipboard.writeText(filePreviewCode.textContent || "");
          filePreviewCopyBtn.textContent = "✅ Copied!";
          setTimeout(() => filePreviewCopyBtn.textContent = "📋 Copy Code", 2000);
        }
      });
    }
    if (filePreviewInsertBtn) {
      filePreviewInsertBtn.addEventListener("click", insertFileIntoChat);
    }

    // Sidebar Toggle (Mobile Drawer vs Desktop Collapse)
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
          document.body.classList.toggle("sidebar-mobile-open");
        } else if (subSidebar) {
          subSidebar.classList.toggle("collapsed");
        }
      });
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => {
        document.body.classList.remove("sidebar-mobile-open");
      });
    }

    const closeSidebarBtn = document.getElementById("close-sidebar-btn");
    if (closeSidebarBtn) {
      closeSidebarBtn.addEventListener("click", () => {
        document.body.classList.remove("sidebar-mobile-open");
      });
    }

    const mobileNewChatBtn = document.getElementById("mobile-new-chat-btn");
    if (mobileNewChatBtn) {
      mobileNewChatBtn.addEventListener("click", () => {
        createNewChat();
        document.body.classList.remove("sidebar-mobile-open");
      });
    }

    // Mobile Drawer Navigation Tabs
    const mobileDrawerTabs = document.getElementById("mobile-drawer-tabs");
    if (mobileDrawerTabs) {
      mobileDrawerTabs.querySelectorAll(".mobile-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const tabKey = btn.getAttribute("data-tab");
          if (!tabKey) return;
          mobileDrawerTabs.querySelectorAll(".mobile-tab-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          switchToRailTab(tabKey);
          if (tabKey === "settings") {
            document.body.classList.remove("sidebar-mobile-open");
          }
        });
      });
    }

    // Chat Search
    if (chatSearchInput) {
      chatSearchInput.addEventListener("input", (e) => {
        renderSidebar(e.target.value.trim().toLowerCase());
      });
    }

    // Input Handling - Instant Single-Tap Enter to Send
    if (userInput) {
      userInput.addEventListener("input", autoResizeTextarea);
      userInput.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
          // If the user is currently completing an IME word / composition, allow composition to commit
          if (e.isComposing || e.keyCode === 229) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          sendMessage();
        }
      });
    }

    // Global shortcut: pressing Enter when not inside another input or open modal automatically focuses the chat input
    window.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
        const active = document.activeElement;
        const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable);
        if (!isInput && !document.querySelector(".modal-overlay:not(.hidden)")) {
          e.preventDefault();
          if (userInput) userInput.focus();
        }
      }
    });

    if (sendBtn) {
      sendBtn.addEventListener("click", (e) => {
        e.preventDefault();
        sendBtn.classList.add("button-pressed");
        setTimeout(() => sendBtn.classList.remove("button-pressed"), 180);
        sendMessage();
      });
    }
    if (stopBtn) stopBtn.addEventListener("click", stopGeneration);
    if (newChatBtn) newChatBtn.addEventListener("click", createNewChat);

    // Effort Bar Interactive Controls
    initEffortBar();

    // Topbar Scroll Track: Smooth Horizontal Mousewheel Scrolling
    const topbarScrollTrack = document.getElementById("topbar-scroll-track");
    if (topbarScrollTrack) {
      topbarScrollTrack.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          topbarScrollTrack.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // Web Search
    if (websearchToggleBtn) {
      websearchToggleBtn.addEventListener("click", () => {
        webSearchEnabled = !webSearchEnabled;
        const span = websearchToggleBtn.querySelector("span");
        if (webSearchEnabled) {
          websearchToggleBtn.classList.add("active");
          if (span) span.textContent = "Search: ON";
        } else {
          websearchToggleBtn.classList.remove("active");
          if (span) span.textContent = "Search: OFF";
        }
        updateToolsIndicator();
      });
    }

    // Attachments (Picker, Drag/Drop, and Clipboard Paste)
    if (attachBtn && fileInput) {
      attachBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", handleFileSelect);
    }

    // Drag & Drop Support
    const dropZone = document.querySelector(".chat-input-box") || document.querySelector(".chat-input-area") || document.body;
    if (dropZone) {
      ["dragenter", "dragover"].forEach(evName => {
        dropZone.addEventListener(evName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          const box = document.querySelector(".chat-input-box");
          if (box) box.style.borderColor = "var(--md-sys-color-primary)";
        }, false);
      });
      ["dragleave", "drop"].forEach(evName => {
        dropZone.addEventListener(evName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          const box = document.querySelector(".chat-input-box");
          if (box) box.style.borderColor = "";
        }, false);
      });
      dropZone.addEventListener("drop", (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          processFiles(e.dataTransfer.files);
        }
      }, false);
    }

    // Clipboard Paste Support (Directly paste images, screenshots, or copied files)
    if (userInput) {
      userInput.addEventListener("paste", (e) => {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length) {
          processFiles(e.clipboardData.files);
        }
      });
    }

    // Provider Dropdown
    if (providerSelect) {
      providerSelect.addEventListener("change", (e) => switchProvider(e.target.value));
    }

    // MCP Modal
    if (openAddMcpBtn) openAddMcpBtn.addEventListener("click", () => addMcpModal?.classList.remove("hidden"));
    if (closeMcpModalBtn) closeMcpModalBtn.addEventListener("click", () => addMcpModal?.classList.add("hidden"));
    if (addMcpModal) {
      addMcpModal.addEventListener("click", (e) => {
        if (e.target === addMcpModal) addMcpModal.classList.add("hidden");
      });
    }

    if (testMcpBtn) testMcpBtn.addEventListener("click", testMcpConnection);
    if (saveMcpServerBtn) saveMcpServerBtn.addEventListener("click", saveMcpServer);

    // Settings Modal
    if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", () => settingsModal?.classList.add("hidden"));
    if (settingsModal) {
      settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) settingsModal.classList.add("hidden");
      });
    }

    if (settingProviderChoice) {
      settingProviderChoice.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "__add_proxy__") {
          addNewCustomProxyPrompt();
        } else {
          switchProvider(val);
        }
      });
    }

    if (btnAddCustomProxy) {
      btnAddCustomProxy.addEventListener("click", () => addNewCustomProxyPrompt());
    }
    if (btnDeleteCustomProxy) {
      btnDeleteCustomProxy.addEventListener("click", () => deleteCustomProxyProfile());
    }

    // Lean Mode toggle listeners
    if (leanModeToggleBtn) {
      leanModeToggleBtn.addEventListener("click", () => toggleLeanMode());
    }
    if (settingLeanMode) {
      settingLeanMode.addEventListener("change", (e) => {
        isLeanMode = e.target.checked;
        localStorage.setItem("agentchat_lean_mode", isLeanMode ? "true" : "false");
        updateLeanModeUI();
      });
    }

    if (settingTemp) {
      settingTemp.addEventListener("input", (e) => {
        if (tempDisplay) tempDisplay.textContent = e.target.value;
      });
    }

    if (toggleKeyVisibility) {
      toggleKeyVisibility.addEventListener("click", () => {
        if (settingApiKey) {
          if (settingApiKey.type === "password") {
            settingApiKey.type = "text";
            toggleKeyVisibility.textContent = "Hide";
          } else {
            settingApiKey.type = "password";
            toggleKeyVisibility.textContent = "Show";
          }
        }
      });
    }

    if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveConfig);

    if (settingSavedKeysSelect) {
      settingSavedKeysSelect.addEventListener("change", () => {
        syncSelectedKeyWithInputs(settingProviderChoice.value);
      });
    }
    if (saveKeyToVaultBtn) {
      saveKeyToVaultBtn.addEventListener("click", saveCurrentKeyToVault);
    }
    if (deleteCurrentKeyBtn) {
      deleteCurrentKeyBtn.addEventListener("click", deleteCurrentKeyFromVault);
    }

    // Probe button in sidebar
    const sideProbeBtn = document.getElementById("sidebar-probe-btn");
    if (sideProbeBtn) sideProbeBtn.addEventListener("click", triggerActiveProbe);

    // Auth Portal & Cloud Sync Listeners
    if (authPortalBtn) {
      authPortalBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentUser) {
          userDropdownMenu.classList.toggle("hidden");
        } else {
          openAuthModal();
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (userDropdownMenu && !userDropdownMenu.classList.contains("hidden")) {
        if (userAuthWrapper && !userAuthWrapper.contains(e.target)) {
          userDropdownMenu.classList.add("hidden");
        }
      }
    });

    if (closeAuthModalBtn) closeAuthModalBtn.addEventListener("click", closeAuthModal);
    if (authGuestBtn) authGuestBtn.addEventListener("click", closeAuthModal);
    if (authModal) {
      authModal.addEventListener("click", (e) => {
        if (e.target === authModal) closeAuthModal();
      });
    }

    if (authToggleModeBtn) {
      authToggleModeBtn.addEventListener("click", () => {
        if (authMode === "login") {
          setAuthMode("register");
        } else {
          setAuthMode("login");
        }
      });
    }

    if (googleLoginBtn) googleLoginBtn.addEventListener("click", () => openGoogleConnectModal());
    if (githubLoginBtn) githubLoginBtn.addEventListener("click", () => handleSocialSignIn("github"));
    if (authForm) authForm.addEventListener("submit", handleEmailAuthSubmit);

    // Google Connect Modal Listeners
    if (closeGoogleConnectModalBtn) closeGoogleConnectModalBtn.addEventListener("click", closeGoogleConnectModal);
    if (googleConnectModal) {
      googleConnectModal.addEventListener("click", (e) => {
        if (e.target === googleConnectModal) closeGoogleConnectModal();
      });
    }
    if (googleDirectForm) googleDirectForm.addEventListener("submit", handleGoogleDirectAuth);
    if (switchToEmailAuthBtn) switchToEmailAuthBtn.addEventListener("click", () => {
      closeGoogleConnectModal();
      openAuthModal("login");
    });
    if (googleGuestModeBtn) googleGuestModeBtn.addEventListener("click", closeGoogleConnectModal);
    if (googleOfficialLoginBtn) googleOfficialLoginBtn.addEventListener("click", handleGoogleOfficialLogin);

    // Account Modal Listeners
    if (dropdownAccountBtn) {
      dropdownAccountBtn.addEventListener("click", () => {
        userDropdownMenu.classList.add("hidden");
        openAccountModal();
      });
    }
    if (userDropdownHeaderBtn) {
      userDropdownHeaderBtn.addEventListener("click", () => {
        userDropdownMenu.classList.add("hidden");
        openAccountModal();
      });
    }
    if (closeAccountModalBtn) closeAccountModalBtn.addEventListener("click", closeAccountModal);
    if (accountModalDoneBtn) accountModalDoneBtn.addEventListener("click", closeAccountModal);
    if (accountModal) {
      accountModal.addEventListener("click", (e) => {
        if (e.target === accountModal) closeAccountModal();
      });
    }
    if (saveAccountNameBtn) saveAccountNameBtn.addEventListener("click", saveAccountName);
    if (saveAccountEmailBtn) saveAccountEmailBtn.addEventListener("click", saveAccountEmail);
    if (accountLoginBtn) accountLoginBtn.addEventListener("click", () => {
      closeAccountModal();
      openAuthModal("login");
    });
    if (accountGoogleBtn) accountGoogleBtn.addEventListener("click", () => {
      closeAccountModal();
      openGoogleConnectModal();
    });
    if (accountQuickGoogleBtn) accountQuickGoogleBtn.addEventListener("click", handleQuickGoogleConnect);
    if (accountSwitchBtn) accountSwitchBtn.addEventListener("click", () => {
      closeAccountModal();
      openAuthModal();
    });
    if (saveAccountAvatarBtn) saveAccountAvatarBtn.addEventListener("click", saveAccountAvatar);
    if (saveAccountPersonaBtn) saveAccountPersonaBtn.addEventListener("click", saveAccountPersona);
    if (accountForceSyncBtn) accountForceSyncBtn.addEventListener("click", () => syncUserProfileToCloud(true));
    if (accountExportDataBtn) accountExportDataBtn.addEventListener("click", exportUserData);
    if (accountLogoutAllBtn) accountLogoutAllBtn.addEventListener("click", handleLogoutAll);

    // Persona Chip toggles
    document.querySelectorAll(".persona-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".persona-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        const pKey = chip.getAttribute("data-persona");
        if (PERSONA_PRESETS[pKey] !== undefined && accountPersonaPrompt) {
          accountPersonaPrompt.value = PERSONA_PRESETS[pKey];
        }
      });
    });

    // Custom Model Modal Listeners
    if (closeCustomModelModalBtn) closeCustomModelModalBtn.addEventListener("click", closeCustomModelModal);
    if (cancelCustomModelBtn) cancelCustomModelBtn.addEventListener("click", closeCustomModelModal);
    if (applyCustomModelBtn) applyCustomModelBtn.addEventListener("click", applyCustomModel);
    if (customModelModal) {
      customModelModal.addEventListener("click", (e) => {
        if (e.target === customModelModal) closeCustomModelModal();
      });
    }

    if (dropdownSyncBtn) {
      dropdownSyncBtn.addEventListener("click", () => {
        userDropdownMenu.classList.add("hidden");
        syncUserProfileToCloud(true);
      });
    }

    if (dropdownVaultBtn) {
      dropdownVaultBtn.addEventListener("click", () => {
        userDropdownMenu.classList.add("hidden");
        syncSettingsModalWithConfig();
        settingsModal.classList.remove("hidden");
      });
    }

    if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener("click", handleSignOut);

    if (modelSelect) {
      modelSelect.addEventListener("change", () => {
        if (modelSelect.value === "__custom_entry__") {
          openCustomModelModal();
          return;
        }
        currentConfig.model = modelSelect.value;
        localStorage.setItem("agentchat_active_model", modelSelect.value);
        updateAgentRouterBarActivePill(modelSelect.value);
        if (currentUser) {
          syncUserProfileToCloud();
        }
      });
    }

    // Quick Refresh & Auto-Discovery Models Button
    const refreshModelsBtn = document.getElementById("refresh-models-btn");
    if (refreshModelsBtn) {
      refreshModelsBtn.addEventListener("click", async () => {
        refreshModelsBtn.classList.add("spinning");
        await fetchModels();
        setTimeout(() => refreshModelsBtn.classList.remove("spinning"), 600);
      });
    }
  }

  function getModelPillStyleClass(model) {
    const id = (model.id || "").toLowerCase();
    const cat = (model.category || "").toLowerCase();
    if (id.includes("gemini")) return "pill-gemini-20-flash";
    if (id.includes("llama") || id.includes("gpt-oss")) return "pill-llama-33-70b";
    if (id.includes("deepseek-v4")) return "pill-deepseek-v4-flash";
    if (id.includes("claude-opus") || id.includes("opus-4-8")) return "pill-claude-opus-48";
    if (id.includes("r1") || id.includes("distill") || id.includes("qwen")) return "pill-deepseek-r1";

    if (model.is_free) return "pill-free";
    if (cat.includes("anthropic") || id.includes("claude")) return "pill-anthropic";
    if (cat.includes("deepseek")) return "pill-deepseek";
    if (cat.includes("openai") || id.includes("gpt") || id.includes("o1") || id.includes("o3")) return "pill-openai";
    if (cat.includes("google") || id.includes("gemini")) return "pill-google";
    return "pill-generic";
  }

  function getModelIcon(model) {
    const id = (model.id || "").toLowerCase();
    const cat = (model.category || "").toLowerCase();
    if (model.is_free) return "🎁";
    if (id.includes("claude") || cat.includes("anthropic")) return "✳️";
    if (id.includes("deepseek") || cat.includes("deepseek")) return "🐳";
    if (id.includes("gpt") || id.includes("o1") || id.includes("o3") || cat.includes("openai")) return "🌀";
    if (id.includes("gemini") || cat.includes("google")) return "🌐";
    if (id.includes("qwen")) return "💻";
    return "⚡";
  }

  function renderModelPickerBar(models, activeModelId) {
    const tabsContainer = document.getElementById("agentrouter-tabs");
    const pillsContainer = document.getElementById("agentrouter-pills");
    if (!pillsContainer) return;

    // Categorize models for tabs
    const categories = {
      all: { label: "All Models", icon: "", count: 0 },
      free: { label: "Free Tier", icon: "🎁", count: 0 },
      Anthropic: { label: "Anthropic", icon: "✳️", count: 0 },
      DeepSeek: { label: "DeepSeek", icon: "🐳", count: 0 },
      OpenAI: { label: "OpenAI", icon: "🌀", count: 0 },
      Google: { label: "Google", icon: "🌐", count: 0 }
    };

    models.forEach(m => {
      categories.all.count++;
      if (m.is_free) categories.free.count++;
      const cat = m.category || "General";
      if (categories[cat]) categories[cat].count++;
    });

    // Build Category Tabs
    if (tabsContainer) {
      tabsContainer.innerHTML = "";
      const allTab = document.createElement("button");
      allTab.type = "button";
      allTab.className = "ar-tab active";
      allTab.setAttribute("data-category", "all");
      allTab.innerHTML = `<span>All Models</span><span class="ar-badge ar-badge-all">${categories.all.count}</span>`;
      tabsContainer.appendChild(allTab);

      ["free", "Anthropic", "DeepSeek", "OpenAI", "Google"].forEach(cKey => {
        const info = categories[cKey];
        if (info && info.count > 0) {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.className = "ar-tab";
          tab.setAttribute("data-category", cKey);
          tab.innerHTML = `<span style="font-size:12px;">${info.icon}</span><span>${info.label}</span><span class="ar-badge">${info.count}</span>`;
          tabsContainer.appendChild(tab);
        }
      });

      const arTabs = tabsContainer.querySelectorAll(".ar-tab");
      arTabs.forEach(tab => {
        tab.addEventListener("click", () => {
          arTabs.forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          const cat = tab.getAttribute("data-category");
          const pills = pillsContainer.querySelectorAll(".ar-model-pill");
          pills.forEach(pill => {
            if (cat === "all") {
              pill.style.display = "inline-flex";
            } else if (cat === "free") {
              pill.style.display = pill.getAttribute("data-is-free") === "true" ? "inline-flex" : "none";
            } else {
              pill.style.display = pill.getAttribute("data-category") === cat ? "inline-flex" : "none";
            }
          });
        });
      });
    }

    // Build dynamic pills for current proxy
    pillsContainer.innerHTML = "";

    // Sort to prioritize free models and flagship models
    const sorted = [...models].sort((a, b) => {
      if (a.is_free && !b.is_free) return -1;
      if (!a.is_free && b.is_free) return 1;
      const isAFlagship = a.id.includes("opus-4-8") || a.id.includes("sonnet") || a.id.includes("r1") || a.id.includes("gemini") || a.id.includes("llama-3.3");
      const isBFlagship = b.id.includes("opus-4-8") || b.id.includes("sonnet") || b.id.includes("r1") || b.id.includes("gemini") || b.id.includes("llama-3.3");
      if (isAFlagship && !isBFlagship) return -1;
      if (!isAFlagship && isBFlagship) return 1;
      return 0;
    });

    const displayModels = sorted.slice(0, 8);

    displayModels.forEach(m => {
      const pill = document.createElement("button");
      pill.type = "button";
      const styleClass = getModelPillStyleClass(m);
      pill.className = `ar-model-pill ${styleClass}${m.id === activeModelId ? " active" : ""}`;
      pill.setAttribute("data-category", m.category || "General");
      pill.setAttribute("data-is-free", m.is_free ? "true" : "false");
      pill.setAttribute("data-model", m.id);
      pill.title = `${m.name || m.id}${m.is_free ? " (100% Free Zero Cost)" : ""}`;

      const icon = getModelIcon(m);
      const freeTag = m.is_free ? `<span class="ar-free-tag">FREE</span>` : "";
      const rawName = m.name || m.id;
      // Strip leading emoji if present for a clean button label
      const cleanName = rawName.replace(/^[^\w\s\-\.\/]+/, "").trim();

      pill.innerHTML = `<span style="font-size:12px;">${icon}</span><span>${cleanName}</span>${freeTag}`;

      pill.addEventListener("click", () => {
        const mid = pill.getAttribute("data-model");
        if (!mid) return;
        pillsContainer.querySelectorAll(".ar-model-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");

        if (modelSelect) {
          modelSelect.value = mid;
        }
        currentConfig.model = mid;
        localStorage.setItem("agentchat_active_model", mid);
        if (currentUser) {
          syncUserProfileToCloud();
        }
      });

      pillsContainer.appendChild(pill);
    });
  }

  function updateAgentRouterBarActivePill(modelId) {
    const arPills = document.querySelectorAll(".ar-model-pill");
    arPills.forEach(p => {
      if (p.getAttribute("data-model") === modelId) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });
  }

  // Interactive Reasoning Effort Bar Controller
  function initEffortBar() {
    const effortButtons = document.querySelectorAll(".effort-btn");
    const saved = localStorage.getItem("agentchat_active_effort") || (effortSelect ? effortSelect.value : "medium");

    window.setReasoningEffort = function(val) {
      if (!val) return;
      effortButtons.forEach(btn => {
        if (btn.getAttribute("data-effort") === val) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
      if (effortSelect) effortSelect.value = val;
      if (accountDefaultEffort) accountDefaultEffort.value = val;
      localStorage.setItem("agentchat_active_effort", val);
    };

    effortButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = btn.getAttribute("data-effort");
        window.setReasoningEffort(val);
      });
    });

    if (effortSelect) {
      effortSelect.addEventListener("change", () => {
        window.setReasoningEffort(effortSelect.value);
      });
    }

    window.setReasoningEffort(saved);
  }

  // Rail Tab Switching
  window.switchToRailTab = function(tabName) {
    if (tabName === "settings") {
      syncSettingsModalWithConfig();
      if (settingsModal) settingsModal.classList.remove("hidden");
      return;
    }
    currentRailTab = tabName;
    [railTabChats, railTabModels, railTabSkills, railTabProjects, railTabMcp].filter(Boolean).forEach(b => b.classList.remove("active"));
    [paneChats, paneModels, paneSkills, paneProjects, paneMcp].filter(Boolean).forEach(p => p.classList.add("hidden"));

    const mobileDrawerTabs = document.getElementById("mobile-drawer-tabs");
    if (mobileDrawerTabs) {
      mobileDrawerTabs.querySelectorAll(".mobile-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-tab") === tabName) btn.classList.add("active");
        else btn.classList.remove("active");
      });
    }

    if (tabName === "chats") {
      if (railTabChats) railTabChats.classList.add("active");
      if (paneChats) paneChats.classList.remove("hidden");
      renderSidebar();
    } else if (tabName === "models") {
      if (railTabModels) railTabModels.classList.add("active");
      if (paneModels) paneModels.classList.remove("hidden");
      renderModelsMiniList("all");
    } else if (tabName === "skills") {
      if (railTabSkills) railTabSkills.classList.add("active");
      if (paneSkills) paneSkills.classList.remove("hidden");
      renderSkillsList();
    } else if (tabName === "projects") {
      if (railTabProjects) railTabProjects.classList.add("active");
      if (paneProjects) paneProjects.classList.remove("hidden");
      renderProjectsPane();
    } else if (tabName === "mcp") {
      if (railTabMcp) railTabMcp.classList.add("active");
      if (paneMcp) paneMcp.classList.remove("hidden");
      renderMcpList();
    }

    if (subSidebar && subSidebar.classList.contains("collapsed")) {
      subSidebar.classList.remove("collapsed");
    }
  };

  // Models Hub Sidebar Rendering
  window.filterRankings = function(cat) {
    document.querySelectorAll(".quick-filter-pills .pill-btn").forEach(p => p.classList.remove("active"));
    event?.target?.classList.add("active");
    renderModelsMiniList(cat);
  };

  function renderModelsMiniList(category = "all") {
    modelsMiniList.innerHTML = "";
    const sorted = [...MODEL_DATABASE].sort((a, b) => {
      if (category === "coding") return b.coding - a.coding;
      if (category === "speed") return b.speed - a.speed;
      return b.overall - a.overall;
    });

    sorted.forEach((m, idx) => {
      const st = modelStatuses[m.id]?.status || "online";
      const isOnline = st === "online";

      const card = document.createElement("div");
      card.className = `chat-item ${modelSelect.value === m.id ? 'active' : ''}`;
      card.onclick = () => {
        modelSelect.value = m.id;
        switchToRailTab("chats");
      };

      const title = document.createElement("span");
      title.className = "chat-item-title";
      title.innerHTML = `<strong>#${idx + 1}</strong> ${m.name}`;

      const tag = document.createElement("span");
      tag.className = `pill ${isOnline ? 'pill-green' : 'pill-red'}`;
      tag.textContent = isOnline ? "Online" : "402 Limit";

      card.appendChild(title);
      card.appendChild(tag);
      modelsMiniList.appendChild(card);
    });
  }

  // MCP Servers Management
  async function fetchMcp() {
    try {
      const res = await apiFetch("/api/mcp");
      mcpData = await res.json();
      renderMcpList();
      updateToolsIndicator();
    } catch (e) {
      console.warn("Failed to load MCP:", e);
    }
  }

  function renderMcpList() {
    mcpServersList.innerHTML = "";

    // Built-in Plugins Section
    const pTitle = document.createElement("div");
    pTitle.className = "pane-header";
    pTitle.innerHTML = "<h2 style='font-size:12px; color:var(--text-muted);'>BUILT-IN PLUGINS</h2>";
    mcpServersList.appendChild(pTitle);

    Object.entries(mcpData.plugins || {}).forEach(([k, p]) => {
      const card = document.createElement("div");
      card.className = "mcp-card";

      const top = document.createElement("div");
      top.className = "mcp-card-top";

      const title = document.createElement("span");
      title.className = "mcp-card-title";
      title.textContent = p.name;

      const badge = document.createElement("span");
      badge.className = "pill pill-green";
      badge.textContent = "Active";

      top.appendChild(title);
      top.appendChild(badge);

      const desc = document.createElement("span");
      desc.className = "mcp-card-desc";
      desc.textContent = p.description;

      card.appendChild(top);
      card.appendChild(desc);
      mcpServersList.appendChild(card);
    });

    // Configured MCP Servers Section
    const mTitle = document.createElement("div");
    mTitle.className = "pane-header";
    mTitle.style.marginTop = "10px";
    mTitle.innerHTML = "<h2 style='font-size:12px; color:var(--text-muted);'>MCP SERVERS</h2>";
    mcpServersList.appendChild(mTitle);

    const servers = Object.entries(mcpData.servers || {});
    if (!servers.length) {
      const empty = document.createElement("div");
      empty.style.padding = "10px";
      empty.style.fontSize = "12px";
      empty.style.color = "var(--text-muted)";
      empty.textContent = "No external MCP servers configured. Click + Add to connect one.";
      mcpServersList.appendChild(empty);
      return;
    }

    servers.forEach(([id, s]) => {
      const card = document.createElement("div");
      card.className = "mcp-card";

      const top = document.createElement("div");
      top.className = "mcp-card-top";

      const title = document.createElement("span");
      title.className = "mcp-card-title";
      title.textContent = s.name || id;

      const toggle = document.createElement("label");
      toggle.className = "toggle-switch";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = s.enabled !== false;
      check.onchange = () => toggleMcpServer(id);
      const slider = document.createElement("span");
      slider.className = "toggle-slider";

      toggle.appendChild(check);
      toggle.appendChild(slider);

      top.appendChild(title);
      top.appendChild(toggle);

      const desc = document.createElement("span");
      desc.className = "mcp-card-desc";
      desc.textContent = `${s.command} ${(s.args || []).join(' ')}`.slice(0, 45) + "...";

      card.appendChild(top);
      card.appendChild(desc);
      mcpServersList.appendChild(card);
    });
  }

  async function toggleMcpServer(id) {
    try {
      await apiFetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", server_id: id })
      });
      fetchMcp();
    } catch (e) {
      alert("Failed to toggle MCP server: " + e.message);
    }
  }

  async function testMcpConnection() {
    const cmd = mcpCommandInput.value.trim();
    if (!cmd) {
      mcpTestStatus.textContent = "Please enter a command to test.";
      mcpTestStatus.style.color = "var(--danger)";
      return;
    }
    mcpTestStatus.textContent = "Validating MCP connection...";
    mcpTestStatus.style.color = "var(--text-muted)";

    try {
      const res = await apiFetch("/api/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, args: mcpArgsInput.value.trim().split(" ") })
      });
      const data = await res.json();
      if (data.success) {
        mcpTestStatus.textContent = "🟢 Connection successful! Discovered tools: " + (data.tools_discovered || []).join(", ");
        mcpTestStatus.style.color = "var(--success)";
      } else {
        mcpTestStatus.textContent = "🔴 Test failed: " + data.message;
        mcpTestStatus.style.color = "var(--danger)";
      }
    } catch (err) {
      mcpTestStatus.textContent = "🔴 Error: " + err.message;
      mcpTestStatus.style.color = "var(--danger)";
    }
  }

  async function saveMcpServer() {
    const name = mcpNameInput.value.trim();
    const cmd = mcpCommandInput.value.trim();
    if (!name || !cmd) {
      alert("Name and command are required.");
      return;
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const args = mcpArgsInput.value.trim() ? mcpArgsInput.value.trim().split(" ") : [];

    try {
      await apiFetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          server_id: id,
          data: { name, command: cmd, args, enabled: true, status: "ready" }
        })
      });
      addMcpModal.classList.add("hidden");
      mcpNameInput.value = "";
      mcpCommandInput.value = "";
      mcpArgsInput.value = "";
      mcpTestStatus.textContent = "";
      fetchMcp();
    } catch (err) {
      alert("Failed to save MCP server: " + err.message);
    }
  }

  function updateToolsIndicator() {
    let count = 2; // PDF & Calculator active
    if (webSearchEnabled) count++;
    const activeMcp = Object.values(mcpData.servers || {}).filter(s => s.enabled).length;
    count += activeMcp;

    if (toolsStatusText) {
      toolsStatusText.textContent = `${count} Tools & Plugins Active`;
    }
  }

  // Active Health Prober
  let isProbing = false;
  async function triggerActiveProbe() {
    if (isProbing) return;
    isProbing = true;
    const bannerBtn = document.getElementById("banner-check-btn");
    const sideBtn = document.getElementById("sidebar-probe-btn");
    [bannerBtn, sideBtn].filter(Boolean).forEach(b => { b.textContent = "↻ Checking..."; b.disabled = true; });

    try {
      const res = await apiFetch("/api/probe_models", { method: "POST" });
      const data = await res.json();
      if (data.statuses) {
        modelStatuses = data.statuses;
        updateModelDropdownOptions();
        updateBannerStatus();
        if (currentRailTab === "models") renderModelsMiniList();
      }
    } catch (e) {
      console.warn("Probe failed:", e);
    } finally {
      isProbing = false;
      [bannerBtn, sideBtn].filter(Boolean).forEach(b => { b.textContent = "↻ Check Now"; b.disabled = false; });
    }
  }

  async function fetchModelStatus() {
    try {
      const res = await apiFetch("/api/model_status");
      const data = await res.json();
      if (data.statuses) {
        modelStatuses = data.statuses;
        updateModelDropdownOptions();
        updateBannerStatus();
        if (currentRailTab === "models") renderModelsMiniList();
      }
    } catch (e) {
      console.warn("Status fetch failed:", e);
    }
  }

  function updateModelDropdownOptions() {
    const cur = modelSelect.value;
    Array.from(modelSelect.options).forEach(opt => {
      const mid = opt.value;
      const st = modelStatuses[mid]?.status || "online";
      const cleanName = MODEL_DISPLAY_NAMES[mid] || opt.textContent.replace(/^[🟢🔴⚪🧠💻⚡🌐]\s*/, "").replace(/\s*\(.*\)$/, "").trim();

      if (st === "online") opt.textContent = `🟢 ${cleanName}`;
      else if (st === "exhausted") opt.textContent = `🔴 ${cleanName} (Quota Limit)`;
      else opt.textContent = `⚪ ${cleanName}`;
    });
    if (cur) modelSelect.value = cur;
  }

  function updateBannerStatus() {
    const banner = document.getElementById("live-status-banner");
    if (!banner) return;
    const activeP = currentConfig.active_provider || "base";
    const pName = PROVIDER_DEFAULTS[activeP]?.name || "Active Provider";

    banner.innerHTML = `
      <span class="banner-title">📡 Active Provider:</span>
      <span class="pill pill-green">🟢 ${pName}</span>
      <span class="pill pill-blue">BYOK Enabled</span>
      <button id="banner-check-btn" class="banner-refresh-btn" onclick="fetchModels()">↻ Refresh Models</button>
    `;
  }

  // File Attachments (PDF, PPTX, PPT, DOCX, DOC, XLSX, Images, Code, Text)
  async function processFiles(files) {
    if (!files || !files.length) return;
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const isDoc = ["pdf", "pptx", "ppt", "docx", "doc", "xlsx"].includes(ext);
      const isImg = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext);

      // Show temporary processing pill in tray
      const tempId = "att_loading_" + Math.random().toString(36).slice(2, 7);
      if (attachmentTray) {
        attachmentTray.classList.remove("hidden");
        const loadingChip = document.createElement("div");
        loadingChip.id = tempId;
        loadingChip.className = "attachment-chip";
        loadingChip.innerHTML = `<span class="spin-inline">⏳</span><span>Reading ${file.name}...</span>`;
        attachmentTray.appendChild(loadingChip);
      }

      const removeTempChip = () => {
        const el = document.getElementById(tempId);
        if (el) el.remove();
        if (!currentAttachments.length && attachmentTray) {
          attachmentTray.classList.add("hidden");
        }
      };

      const isPdf = ext === "pdf";
      if (isPdf) {
        // PDFs → render pages to images so a vision model can SEE them.
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result || "").split(",")[1] || "";
          try {
            const res = await apiFetch("/api/pdf_to_images", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: file.name, content_base64: base64, base64: base64 })
            });
            const data = await res.json();
            removeTempChip();
            if (data.success && data.images && data.images.length) {
              currentAttachments.push({
                filename: file.name,
                text: data.text || `[PDF: ${file.name}]`,
                isImage: false,
                isVisual: true,
                images: data.images,
                type: ext,
                pages: data.page_count || data.images.length
              });
              if (data.note) console.info(`[${file.name}] ${data.note}`);
              renderAttachmentTray();
            } else if (data.text) {
              // Rendering unavailable (e.g. PyMuPDF not installed) — fall back to text.
              currentAttachments.push({
                filename: file.name,
                text: data.text,
                isImage: false,
                isVisual: false,
                type: ext,
                pages: null
              });
              if (data.error) console.warn(`[${file.name}] image render failed, using text: ${data.error}`);
              renderAttachmentTray();
            } else {
              alert(`Error reading ${file.name}: ` + (data.error || "Could not render or extract the PDF"));
            }
          } catch (err) {
            removeTempChip();
            alert(`Error reading ${file.name}: ` + err.message);
          }
        };
        reader.readAsDataURL(file);
      } else if (isDoc) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result || "").split(",")[1] || "";
          try {
            const res = await apiFetch("/api/parse_file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: file.name, content_base64: base64, base64: base64 })
            });
            const data = await res.json();
            removeTempChip();
            if (data.success && data.text) {
              currentAttachments.push({
                filename: file.name,
                text: data.text,
                isImage: false,
                isVisual: false,
                type: ext,
                pages: data.pages || data.slides || null
              });
              renderAttachmentTray();
            } else {
              alert(`Error parsing ${file.name}: ` + (data.error || "Could not extract text"));
            }
          } catch (err) {
            removeTempChip();
            alert(`Error reading ${file.name}: ` + err.message);
          }
        };
        reader.readAsDataURL(file);
      } else if (isImg) {
        const reader = new FileReader();
        reader.onload = () => {
          removeTempChip();
          currentAttachments.push({
            filename: file.name,
            text: `[Image Attached: ${file.name}]`,
            isImage: true,
            isVisual: true,
            type: ext,
            dataUrl: reader.result
          });
          renderAttachmentTray();
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          removeTempChip();
          currentAttachments.push({
            filename: file.name,
            text: reader.result || "",
            isImage: false,
            type: ext
          });
          renderAttachmentTray();
        };
        reader.readAsText(file);
      }
    }
  }

  function handleFileSelect(e) {
    if (e.target.files) {
      processFiles(e.target.files);
    }
    if (fileInput) fileInput.value = "";
  }

  function renderAttachmentTray() {
    if (!attachmentTray) return;
    attachmentTray.innerHTML = "";
    if (!currentAttachments.length) {
      attachmentTray.classList.add("hidden");
      return;
    }
    attachmentTray.classList.remove("hidden");
    currentAttachments.forEach((att, idx) => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      if (att.isImage) {
        const img = document.createElement("img");
        img.className = "attachment-thumb";
        img.src = att.dataUrl;
        chip.appendChild(img);
      } else {
        const icon = document.createElement("span");
        const ext = (att.filename.split(".").pop() || "").toLowerCase();
        if (ext === "pdf") icon.textContent = "📄";
        else if (ext === "pptx" || ext === "ppt") icon.textContent = "📊";
        else if (ext === "docx" || ext === "doc") icon.textContent = "📑";
        else if (ext === "xlsx" || ext === "csv") icon.textContent = "📈";
        else icon.textContent = "📝";
        chip.appendChild(icon);
      }
      const name = document.createElement("span");
      name.className = "attachment-chip-name";
      let badge = "";
      if (att.pages) badge = ` (${att.pages} ${att.type.includes("ppt") ? "slides" : "pages"})`;
      name.textContent = att.filename + badge;
      chip.appendChild(name);

      const delBtn = document.createElement("button");
      delBtn.className = "attachment-chip-remove";
      delBtn.title = "Remove attachment";
      delBtn.innerHTML = "&times;";
      delBtn.onclick = () => {
        currentAttachments.splice(idx, 1);
        renderAttachmentTray();
      };
      chip.appendChild(delBtn);
      attachmentTray.appendChild(chip);
    });
  }

  function autoResizeTextarea() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 180) + "px";
  }

  // Session & History Management
  function loadSessions() {
    try {
      const saved = localStorage.getItem("agentchat_sessions");
      if (saved) sessions = JSON.parse(saved);
    } catch (e) {
      sessions = [];
    }
  }

  // Replace image blocks in a multimodal content array with a light text marker.
  // Used both to avoid re-sending images on follow-up turns and to keep base64
  // out of localStorage (25 page-images would blow the ~5MB quota instantly).
  function stripImagesFromContent(content) {
    if (!Array.isArray(content)) return content;
    const imgCount = content.filter(b => b && b.type === "image_url").length;
    const textParts = content.filter(b => b && b.type === "text").map(b => b.text);
    let merged = textParts.join("\n\n");
    if (imgCount) merged += (merged ? "\n\n" : "") + `[${imgCount} image${imgCount > 1 ? "s" : ""} sent earlier in this turn]`;
    return merged;
  }

  function saveSessions() {
    // Deep-sanitize: never persist base64 image payloads to localStorage.
    const lean = sessions.map(s => ({
      ...s,
      messages: (s.messages || []).map(m => {
        const copy = { ...m };
        if (Array.isArray(copy.content)) copy.content = stripImagesFromContent(copy.content);
        if (copy.attachments) {
          copy.attachments = copy.attachments.map(a => ({ ...a, dataUrl: null }));
        }
        return copy;
      })
    }));
    try {
      localStorage.setItem("agentchat_sessions", JSON.stringify(lean));
    } catch (e) {
      console.warn("saveSessions: localStorage write failed (quota?), retrying without attachments", e);
      const barer = lean.map(s => ({ ...s, messages: (s.messages || []).map(m => ({ ...m, attachments: null })) }));
      try { localStorage.setItem("agentchat_sessions", JSON.stringify(barer)); } catch (_) {}
    }
    renderSidebar();
  }

  function createNewChat() {
    const newSession = { id: "chat_" + Date.now(), title: "New Chat", messages: [] };
    sessions.unshift(newSession);
    saveSessions();
    switchChat(newSession.id);
    userInput.focus();
  }

  function switchChat(sessionId) {
    currentSessionId = sessionId;
    saveSessions();
    renderMessages();
    renderSidebar();
    if (window.innerWidth <= 768) {
      document.body.classList.remove("sidebar-mobile-open");
    }
  }

  function deleteChat(sessionId, event) {
    if (event) event.stopPropagation();
    sessions = sessions.filter(s => s.id !== sessionId);
    if (!sessions.length) createNewChat();
    else if (currentSessionId === sessionId) switchChat(sessions[0].id);
    else saveSessions();
  }

  function getSessionTimestamp(session) {
    if (session.updated_at) return session.updated_at;
    if (session.created_at) return session.created_at;
    if (session.id && session.id.startsWith("chat_")) {
      const parsed = parseInt(session.id.replace("chat_", ""));
      if (!isNaN(parsed)) return parsed;
    }
    return Date.now();
  }

  function getDateGroup(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (now.toDateString() === date.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (yesterday.toDateString() === date.toDateString()) return "Yesterday";
    if (diffDays < 7) return "Previous 7 Days";
    return "Older";
  }

  function renameChat(sessionId, event) {
    if (event) event.stopPropagation();
    const s = sessions.find(item => item.id === sessionId);
    if (!s) return;
    const newTitle = prompt("Enter new chat title:", s.title);
    if (newTitle && newTitle.trim()) {
      s.title = newTitle.trim();
      saveSessions();
    }
  }

  function exportChatMarkdown(sessionId, event) {
    if (event) event.stopPropagation();
    const s = sessions.find(item => item.id === sessionId);
    if (!s) return;
    let md = `# ${s.title || "AgentChat Conversation"}\n\n`;
    md += `*Exported from AgentChat on ${new Date().toLocaleString()}*\n\n---\n\n`;
    (s.messages || []).forEach(m => {
      const roleName = m.role === "user" ? "### 👤 User" : "### 🤖 Assistant";
      md += `${roleName}\n\n`;
      if (m.reasoning) {
        md += `> **Thinking Process:**\n> ${m.reasoning.replace(/\n/g, "\n> ")}\n\n`;
      }
      // content may be a multimodal array — export the user's typed text if present.
      let bodyText = (m.role === "user" && typeof m.displayContent === "string") ? m.displayContent : m.content;
      if (Array.isArray(bodyText)) bodyText = stripImagesFromContent(bodyText);
      md += `${bodyText}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(s.title || "chat").replace(/[^a-z0-9_-]/gi, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAllChatsJSON() {
    if (!sessions.length) {
      alert("No conversation history to export.");
      return;
    }
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentchat_history_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function clearAllChats() {
    if (!confirm("Are you sure you want to clear all conversation history? This cannot be undone.")) return;
    sessions = [];
    createNewChat();
  }

  function renderSidebar(searchQuery = "") {
    chatList.innerHTML = "";
    const query = (searchQuery || "").trim().toLowerCase();

    const filtered = sessions.filter(s => {
      if (!query) return true;
      if ((s.title || "").toLowerCase().includes(query)) return true;
      return (s.messages || []).some(m => {
        const c = Array.isArray(m.content) ? stripImagesFromContent(m.content) : (m.content || "");
        const dc = typeof m.displayContent === "string" ? m.displayContent : "";
        return (c + " " + dc).toLowerCase().includes(query);
      });
    });

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.style.padding = "16px 12px";
      empty.style.fontSize = "12px";
      empty.style.color = "var(--text-muted)";
      empty.textContent = query ? "No matching conversations found." : "No conversations yet.";
      chatList.appendChild(empty);
      return;
    }

    // Group sessions by Relative Date
    const groups = { "Today": [], "Yesterday": [], "Previous 7 Days": [], "Older": [] };
    filtered.forEach(session => {
      const ts = getSessionTimestamp(session);
      const groupName = getDateGroup(ts);
      if (groups[groupName]) groups[groupName].push(session);
      else groups["Older"].push(session);
    });

    Object.entries(groups).forEach(([groupName, groupSessions]) => {
      if (!groupSessions.length) return;

      const header = document.createElement("div");
      header.className = "history-date-header";
      header.textContent = groupName;
      chatList.appendChild(header);

      groupSessions.forEach(session => {
        const item = document.createElement("div");
        item.className = `chat-item ${session.id === currentSessionId ? "active" : ""}`;
        item.onclick = () => switchChat(session.id);

        const body = document.createElement("div");
        body.className = "chat-item-body";

        const title = document.createElement("span");
        title.className = "chat-item-title";
        title.textContent = session.title || "New Chat";
        body.appendChild(title);

        // Last message snippet
        const lastMsg = session.messages && session.messages.length ? session.messages[session.messages.length - 1] : null;
        if (lastMsg && lastMsg.content) {
          const snippet = document.createElement("span");
          snippet.className = "chat-item-snippet";
          const prefix = lastMsg.role === "user" ? "You: " : "AI: ";
          // content may be a multimodal array — prefer the plain display text.
          const snippetSrc = (lastMsg.role === "user" && typeof lastMsg.displayContent === "string")
            ? lastMsg.displayContent
            : (Array.isArray(lastMsg.content) ? stripImagesFromContent(lastMsg.content) : lastMsg.content);
          const snippetText = typeof snippetSrc === "string" ? snippetSrc : "";
          snippet.textContent = prefix + snippetText.slice(0, 46).replace(/\n/g, " ") + (snippetText.length > 46 ? "..." : "");
          body.appendChild(snippet);
        }

        const meta = document.createElement("span");
        meta.className = "chat-item-meta";
        const count = session.messages ? session.messages.length : 0;
        meta.textContent = `${count} msg${count === 1 ? "" : "s"}`;
        body.appendChild(meta);

        // Actions: Rename, Export, Delete
        const actions = document.createElement("div");
        actions.className = "chat-actions-group";

        const renBtn = document.createElement("button");
        renBtn.className = "chat-action-btn";
        renBtn.innerHTML = "✏️";
        renBtn.title = "Rename Title";
        renBtn.onclick = (e) => renameChat(session.id, e);

        const expBtn = document.createElement("button");
        expBtn.className = "chat-action-btn";
        expBtn.innerHTML = "📥";
        expBtn.title = "Export as Markdown";
        expBtn.onclick = (e) => exportChatMarkdown(session.id, e);

        const delBtn = document.createElement("button");
        delBtn.className = "chat-action-btn delete-btn";
        delBtn.innerHTML = "&times;";
        delBtn.title = "Delete Conversation";
        delBtn.onclick = (e) => deleteChat(session.id, e);

        actions.appendChild(renBtn);
        actions.appendChild(expBtn);
        actions.appendChild(delBtn);

        item.appendChild(body);
        item.appendChild(actions);
        chatList.appendChild(item);
      });
    });
  }

  function getCurrentSession() {
    return sessions.find(s => s.id === currentSessionId);
  }

  function renderMessages() {
    const session = getCurrentSession();
    messagesList.innerHTML = "";
    if (!session || !session.messages.length) {
      welcomeScreen.classList.remove("hidden");
      return;
    }
    welcomeScreen.classList.add("hidden");
    session.messages.forEach(msg => {
      // For user messages with attachments, show the typed text + file chips,
      // never the extracted document text (which stays in msg.content for the model).
      let displayText = (msg.role === "user" && msg.displayContent !== undefined) ? msg.displayContent : msg.content;
      if (Array.isArray(displayText)) displayText = stripImagesFromContent(displayText);
      appendMessageToDOM(msg.role, displayText, msg.reasoning, false, msg.attachments || null);
    });
    scrollToBottom();
  }

  function appendMessageToDOM(role, content, reasoning, isStreaming = false, attachments = null) {
    welcomeScreen.classList.add("hidden");
    const row = document.createElement("div");
    row.className = `message-row ${role} ${role}-row`;
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${role}-bubble`;

    // Render attachments as compact chips (NOT the extracted text) on user messages
    if (attachments && attachments.length) {
      const tray = document.createElement("div");
      tray.className = "msg-attachment-tray";
      attachments.forEach(a => {
        const chip = document.createElement("div");
        chip.className = "attachment-chip msg-attachment-chip";
        if (a.isImage && a.dataUrl) {
          const img = document.createElement("img");
          img.className = "attachment-thumb";
          img.src = a.dataUrl;
          chip.appendChild(img);
        } else {
          const icon = document.createElement("span");
          const ext = (a.type || (a.filename || "").split(".").pop() || "").toLowerCase();
          icon.textContent = ext === "pdf" ? "📄" : (ext === "pptx" || ext === "ppt") ? "📊"
            : (ext === "docx" || ext === "doc") ? "📑" : (ext === "xlsx" || ext === "csv") ? "📈" : "📝";
          chip.appendChild(icon);
        }
        const name = document.createElement("span");
        name.className = "attachment-chip-name";
        name.textContent = (a.filename || "file") + (a.pages ? ` (${a.pages} ${(a.type || "").includes("ppt") ? "slides" : "pages"})` : "");
        chip.appendChild(name);
        tray.appendChild(chip);
      });
      bubble.appendChild(tray);
    }

    if (reasoning) {
      const details = document.createElement("details");
      details.className = "reasoning-box";
      details.open = isStreaming;

      const summary = document.createElement("summary");
      summary.innerHTML = `<span class="reasoning-title">${isStreaming ? "Thinking Process..." : "Thought Process"}</span> <span class="reasoning-badge ${isStreaming ? "streaming-pulse" : ""}">${isStreaming ? "Live" : "Finished"}</span>`;

      const rContent = document.createElement("div");
      rContent.className = "reasoning-content";
      rContent.textContent = reasoning;

      details.appendChild(summary);
      details.appendChild(rContent);
      bubble.appendChild(details);
    }

    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.innerHTML = renderMarkdown(content);
    // Skip an empty text block on user messages that carry only attachments
    if ((content && content.length) || role !== "user") {
      bubble.appendChild(textDiv);
    }

    row.appendChild(bubble);
    messagesList.appendChild(row);
    scrollToBottom();
    return { row, bubble, textDiv };
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Message Sending
  async function sendMessage() {
    const text = (userInput?.value || "").trim();
    if (!text && !currentAttachments.length) {
      if (userInput) userInput.focus();
      const inputBox = document.querySelector(".chat-input-box");
      if (inputBox) {
        inputBox.classList.remove("input-empty-attention");
        void inputBox.offsetWidth; // Trigger reflow for animation replay
        inputBox.classList.add("input-empty-attention");
        setTimeout(() => inputBox.classList.remove("input-empty-attention"), 600);
      }
      return;
    }
    if (isGenerating) return;

    let session = getCurrentSession();
    if (!session) {
      createNewChat();
      session = getCurrentSession();
    }
    if (!session) return;

    // Build model-facing content. If any attachment is visual (an image, or a PDF
    // rendered to page images), send an OpenAI-style multimodal array so a vision
    // model can actually SEE it; otherwise keep content a plain string.
    let finalPrompt = text;
    const hasVisual = currentAttachments.some(a => a.isVisual);
    if (currentAttachments.length) {
      if (hasVisual) {
        const blocks = [];
        const textDocs = currentAttachments
          .filter(a => !a.isVisual)
          .map(a => `[Attached Document: ${a.filename}]\n${a.text}\n[End of ${a.filename}]`)
          .join("\n\n");
        const leadText = [textDocs, text].filter(Boolean).join("\n\n");
        if (leadText) blocks.push({ type: "text", text: leadText });
        currentAttachments.forEach(a => {
          if (!a.isVisual) return;
          if (a.isImage && a.dataUrl) {
            blocks.push({ type: "image_url", image_url: { url: a.dataUrl } });
          } else if (a.images && a.images.length) {
            a.images.forEach(url => blocks.push({ type: "image_url", image_url: { url } }));
          }
        });
        finalPrompt = blocks.length ? blocks : text;
      } else {
        const docsContext = currentAttachments
          .map(a => `[Attached Document: ${a.filename}]\n${a.text}\n[End of ${a.filename}]`)
          .join("\n\n");
        finalPrompt = docsContext + (text ? "\n\n" + text : "");
      }
    }

    // Lightweight attachment metadata for display. Image thumbnails keep their
    // dataUrl; PDF page images are NOT stored here (they'd bloat localStorage).
    const attMeta = currentAttachments.map(a => ({
      filename: a.filename,
      type: a.type,
      isImage: !!a.isImage,
      isVisual: !!a.isVisual,
      pages: a.pages || null,
      dataUrl: a.isImage ? a.dataUrl : null
    }));

    // content = full prompt (with extracted text) for the model;
    // displayContent = only what the user typed; attachments = chips to show.
    session.messages.push({ role: "user", content: finalPrompt, displayContent: text, attachments: attMeta });
    if (session.messages.length === 1) {
      const displayTitle = text || currentAttachments[0]?.filename || "Document Analysis";
      session.title = displayTitle.slice(0, 28) + (displayTitle.length > 28 ? "..." : "");
    }
    saveSessions();

    appendMessageToDOM("user", text, "", false, attMeta);
    userInput.value = "";
    currentAttachments = [];
    renderAttachmentTray();
    autoResizeTextarea();

    setGeneratingState(true);
    activeAbortController = new AbortController();

    const assistantMsg = { role: "assistant", content: "", reasoning: "" };
    session.messages.push(assistantMsg);

    const { bubble, textDiv } = appendMessageToDOM("assistant", "", "", true);
    let reasoningContainer = null;
    let reasoningDiv = null;

    const selectedModel = modelSelect.value || currentConfig.model || "deepseek-v4-flash";
    let hasReceivedFirstToken = false;
    const startTime = Date.now();
    textDiv.innerHTML = `
      <div class="model-connecting-state" id="stream-connecting-indicator">
        <div class="connecting-header">
          <div class="typing-dots"><span></span><span></span><span></span></div>
          <span class="connecting-text">Connecting to ${selectedModel}<span class="connecting-timer"> (0.0s)</span>...</span>
        </div>
      </div>
    `;
    const timerInterval = setInterval(() => {
      if (hasReceivedFirstToken) {
        clearInterval(timerInterval);
        return;
      }
      const secs = (Date.now() - startTime) / 1000;
      const displayTime = secs >= 60 ? `${Math.floor(secs / 60)}m ${(secs % 60).toFixed(0)}s` : `${secs.toFixed(1)}s`;
      const timerEl = textDiv.querySelector(".connecting-timer");
      if (timerEl) timerEl.textContent = ` (${displayTime})`;

      const container = textDiv.querySelector(".model-connecting-state");
      if (container && parseFloat(elapsed) >= 7.0 && !container.querySelector(".fast-switch-hint")) {
        const switchHint = document.createElement("div");
        switchHint.className = "fast-switch-hint";
        switchHint.innerHTML = `<span>⚡ Queue taking longer than usual? Click to switch to DeepSeek V4 Flash (1.5s)</span>`;
        switchHint.onclick = (e) => {
          e.stopPropagation();
          if (window.fastSwitchToDeepSeek) window.fastSwitchToDeepSeek();
        };
        container.appendChild(switchHint);
      }
    }, 100);

    try {
      let selectedEffort = effortSelect.value || "medium";
      // Auto-adapt for GLM models (GLM-5.3 only supports low, high, max; medium is rejected)
      if (selectedModel && selectedModel.toLowerCase().includes("glm") && selectedEffort === "medium") {
        selectedEffort = "high";
      }

      // Prune previous reasoning to save 75% tokens. Also strip images from ALL
      // but the current (last) turn: re-sending page images every follow-up would
      // multiply vision cost and latency for no benefit.
      const rawHistory = session.messages.slice(0, -1);
      const lastIdx = rawHistory.length - 1;
      const historyToSend = rawHistory.map((m, idx) => ({
        role: m.role,
        content: idx === lastIdx ? m.content : stripImagesFromContent(m.content)
      }));

      // Estimate input tokens (content may be a multimodal array now).
      const promptLen = typeof finalPrompt === "string" ? finalPrompt.length : JSON.stringify(finalPrompt).length;
      const estPromptTokens = isLeanMode ? Math.max(6, Math.ceil(promptLen / 4)) : Math.max(15, Math.ceil(JSON.stringify(historyToSend).length / 4));
      updateTokenMeter(estPromptTokens, 0);

      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: activeAbortController.signal,
        body: JSON.stringify({
          model: selectedModel,
          reasoning_effort: selectedEffort,
          web_search: webSearchEnabled,
          auto_compress: currentConfig.auto_compress !== false,
          lean_mode: isLeanMode,
          messages: isLeanMode ? historyToSend.slice(-2) : historyToSend,
          temperature: parseFloat(settingTemp.value) || 0.7,
          system_prompt: settingSystemPrompt.value.trim(),
          skills_context: isLeanMode ? "" : getActiveSkillsContext(),
          project_context: isLeanMode ? "" : getActiveProjectContext(),
          persona_directives: isLeanMode ? "" : (localStorage.getItem("agentchat_developer_persona") || "")
        })
      });

      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);

      // Model connection succeeded: mark as online immediately in frontend state
      if (modelStatuses[selectedModel]?.status !== "online") {
        modelStatuses[selectedModel] = { status: "online", code: 200, message: "Ready to chat" };
        updateModelDropdownOptions();
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let generatedOutTokens = 0;

      streamLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer && buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith("data: ") && !trimmed.startsWith("data: [DONE]")) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                const delta = data.choices?.[0]?.delta || {};
                if (delta.content) {
                  assistantMsg.content += delta.content;
                  textDiv.innerHTML = renderMarkdown(assistantMsg.content);
                  generatedOutTokens += Math.max(1, Math.ceil(delta.content.length / 4));
                  updateTokenMeter(0, Math.max(1, Math.ceil(delta.content.length / 4)));
                }
              } catch (_) {}
            }
          }
          break streamLoop;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("data: [DONE]")) {
            try { reader.cancel().catch(() => {}); } catch (_) {}
            break streamLoop;
          }
          if (trimmed.startsWith("event: error")) continue;

          // HTML Challenge or Gateway Error Intercept
          if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.includes("aliyun_waf") || trimmed.includes("<title>Challenge")) {
            bubble.classList.add("error-bubble");
            const errMsg = "⚠️ Upstream AI provider returned a web verification challenge. Switching to DeepSeek V4 Flash recommended.";
            textDiv.innerHTML = `${errMsg}<br><br><button class="btn btn-tonal-primary btn-xs" onclick="window.fastSwitchToDeepSeek()" style="cursor:pointer; margin-top:6px; margin-right:6px;">⚡ Switch to DeepSeek V4 Flash</button>`;
            assistantMsg.content = errMsg;
            try { reader.cancel().catch(() => {}); } catch (_) {}
            break streamLoop;
          }

          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.usage) {
                if (data.usage.completion_tokens) {
                  const diff = data.usage.completion_tokens - generatedOutTokens;
                  if (diff > 0) updateTokenMeter(0, diff);
                  generatedOutTokens = data.usage.completion_tokens;
                }
              }
              if (data.error) {
                bubble.classList.add("error-bubble");
                let errMsg = typeof data.error === "string" ? data.error : (data.error.message || JSON.stringify(data.error));
                const errType = typeof data.error === "object" ? (data.error.type || "") : "";

                // Translate known upstream error patterns into friendly messages
                if (errMsg.includes("405") || errMsg.includes("Method Not Allowed")) {
                  errMsg = `⚠️ Route Notice (HTTP 405 Method Not Allowed): The upstream AI gateway rejected the request method. Please ensure your Custom Base URL in Settings is set to 'https://agentrouter.org/v1' and model '${selectedModel}' supports chat completions.`;
                } else if (errMsg.includes("content-blocked") || errType.includes("content-blocked") || errMsg.includes("content_filter")) {
                  errMsg = `⚠️ Content was blocked by the upstream provider's safety filter for '${selectedModel}'. Try rephrasing your message or switching to a different model.`;
                } else if (errMsg.includes("始终思考") || errMsg.includes("不支持关闭思考") || errMsg.includes("请使用 low") || errMsg.includes("1210")) {
                  errMsg = `⚠️ Reasoning Model Notice: '${selectedModel}' is a compulsory reasoning model that requires effort level 'low', 'high', or 'max'. Setting effort to 'High' resolves this.`;
                } else if (errMsg.includes("exhausted") || errMsg.includes("budget pool") || errMsg.includes("Budget pool")) {
                  errMsg = `⚠️ Quota Notice: The budget pool for '${selectedModel}' is currently paused. Click below to switch to DeepSeek V4 Flash (instant 1.5s).`;
                  modelStatuses[selectedModel] = { status: "exhausted", code: 402, message: "Quota exhausted" };
                  updateModelDropdownOptions();
                }

                textDiv.innerHTML = `${errMsg}<br><br><button class="btn btn-tonal-primary btn-xs" onclick="window.fastSwitchToDeepSeek()" style="cursor:pointer; margin-top:6px; margin-right:6px;">⚡ Switch to DeepSeek V4 Flash</button><button class="btn btn-tonal-tertiary btn-xs" onclick="syncSettingsModalWithConfig(); settingsModal.classList.remove('hidden');" style="cursor:pointer; margin-top:6px;">🔑 Switch API Key in Vault</button>`;
                assistantMsg.content = errMsg;
                try { reader.cancel().catch(() => {}); } catch (_) {}
                break streamLoop;
              }

              const delta = data.choices?.[0]?.delta || {};

              // Dismiss connecting state placeholder upon first incoming token
              if (!hasReceivedFirstToken && (delta.content || delta.reasoning_content)) {
                hasReceivedFirstToken = true;
                clearInterval(timerInterval);
                const ind = textDiv.querySelector("#stream-connecting-indicator");
                if (ind) ind.remove();
              }

              if (delta.reasoning_content) {
                assistantMsg.reasoning += delta.reasoning_content;
                if (!reasoningContainer) {
                  reasoningContainer = document.createElement("details");
                  reasoningContainer.className = "reasoning-box";
                  reasoningContainer.open = true;
                  const summary = document.createElement("summary");
                  summary.innerHTML = `<span class="reasoning-title">Thinking Process...</span> <span class="reasoning-badge streaming-pulse">Live</span>`;
                  reasoningDiv = document.createElement("div");
                  reasoningDiv.className = "reasoning-content";
                  reasoningContainer.appendChild(summary);
                  reasoningContainer.appendChild(reasoningDiv);
                  bubble.insertBefore(reasoningContainer, textDiv);
                }
                reasoningDiv.textContent = assistantMsg.reasoning;
                scrollToBottom();
              }

              if (delta.content) {
                assistantMsg.content += delta.content;
                textDiv.innerHTML = renderMarkdown(assistantMsg.content);
                scrollToBottom();
              }

              const finishReason = data.choices?.[0]?.finish_reason;
              if (finishReason === "stop" || finishReason === "end_turn") {
                try { reader.cancel().catch(() => {}); } catch (_) {}
                break streamLoop;
              }
              if (finishReason === "content_filter") {
                bubble.classList.add("error-bubble");
                const filterMsg = "⚠️ Response was blocked by the upstream content filter. Try rephrasing your message or switching to a different model.";
                textDiv.innerHTML = filterMsg;
                assistantMsg.content = filterMsg;
                try { reader.cancel().catch(() => {}); } catch (_) {}
                break streamLoop;
              }
            } catch (err) {}
          }
        }
      }

      if (reasoningContainer) {
        const summary = reasoningContainer.querySelector("summary");
        if (summary) {
          summary.innerHTML = `<span class="reasoning-title">Thought Process</span> <span class="reasoning-badge">Finished</span>`;
        }
      }

    } catch (err) {
      if (err.name !== "AbortError") {
        bubble.classList.add("error-bubble");
        textDiv.innerHTML = `Error: ${err.message}<br><br><button class="btn btn-tonal-primary btn-xs" onclick="window.fastSwitchToDeepSeek()" style="cursor:pointer; margin-top:6px; margin-right:6px;">⚡ Switch to DeepSeek V4 Flash</button><button class="btn btn-tonal-tertiary btn-xs" onclick="syncSettingsModalWithConfig(); settingsModal.classList.remove('hidden');" style="cursor:pointer; margin-top:6px;">🔑 Switch API Key in Vault</button>`;
        assistantMsg.content = `Error: ${err.message}`;
      }
    } finally {
      clearInterval(timerInterval);
      const ind = textDiv.querySelector("#stream-connecting-indicator");
      if (ind && !assistantMsg.content) {
        ind.remove();
      }
      activeAbortController = null;
      setGeneratingState(false);
      saveSessions();
      userInput.focus();
    }
  }

  window.fastSwitchToDeepSeek = function() {
    if (activeAbortController) {
      try { activeAbortController.abort(); } catch (_) {}
      activeAbortController = null;
    }
    setGeneratingState(false);

    // Switch config and persistence
    currentConfig.active_provider = "agentrouter";
    currentConfig.model = "deepseek-v4-flash";
    localStorage.setItem("agentchat_active_provider", "agentrouter");
    localStorage.setItem("agentchat_active_model", "deepseek-v4-flash");

    if (providerSelect) providerSelect.value = "agentrouter";
    if (modelSelect) modelSelect.value = "deepseek-v4-flash";

    // Highlight active model pill
    if (typeof updateAgentRouterBarActivePill === "function") {
      updateAgentRouterBarActivePill("deepseek-v4-flash");
    }

    // Resend last user prompt
    const session = getCurrentSession();
    if (session && session.messages.length) {
      let lastUserPrompt = "";
      for (let i = session.messages.length - 1; i >= 0; i--) {
        if (session.messages[i].role === "user") {
          lastUserPrompt = session.messages[i].content;
          break;
        }
      }
      // Remove failed/stalled assistant turn
      if (session.messages[session.messages.length - 1].role === "assistant" && !session.messages[session.messages.length - 1].content) {
        session.messages.pop();
      }
      renderMessages();
      if (lastUserPrompt) {
        userInput.value = lastUserPrompt;
        sendMessage();
      }
    }
  };

  function stopGeneration() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    setGeneratingState(false);
  }

  function setGeneratingState(generating) {
    isGenerating = generating;
    if (generating) {
      sendBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
    } else {
      sendBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
    }
  }

  window.useSuggestion = function(text) {
    userInput.value = text;
    autoResizeTextarea();
    sendMessage();
  };

  function renderMarkdown(md) {
    if (!md) return "";
    let html = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Stash fenced code blocks behind sentinel tokens BEFORE the inline transforms
    // below, then restore them afterward. This keeps code pristine — Python `#`
    // comments, `**kwargs`, `*`, and real newlines survive intact — so the Copy
    // button, the artifact preview, the Run action and the mermaid/plan modules
    // all read the exact source. `data-lang` lets those additive modules detect
    // the language without re-parsing the header.
    const codeBlocks = [];
    html = html.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const codeId = "code_" + Math.random().toString(36).substr(2, 9);
      const langKey = (lang || "").toLowerCase();
      const token = "\u0000CB" + codeBlocks.length + "\u0000";
      codeBlocks.push(
        `<pre data-lang="${langKey}"><div class="code-header"><span>${lang || "CODE"}</span>` +
        `<button class="code-copy-btn" onclick="copyCode('${codeId}')">Copy</button></div>` +
        `<code id="${codeId}">${code.trim()}</code></pre>`
      );
      return token;
    });
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>");
    html = html.replace(/^\s*\-\s(.*$)/gim, "<ul><li>$1</li></ul>");
    html = html.replace(/(<\/ul>\n<ul>)/gim, "");
    html = html.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
    // Restore the protected code blocks now that inline formatting is done.
    html = html.replace(/\u0000CB(\d+)\u0000/g, (m, i) => codeBlocks[+i]);
    return `<p>${html}</p>`;
  }

  window.copyCode = function(id) {
    const codeEl = document.getElementById(id);
    if (codeEl) {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        const btn = codeEl.previousElementSibling?.querySelector(".code-copy-btn") || event.target;
        if (btn) {
          const original = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => { btn.textContent = original; }, 1500);
        }
      });
    }
  };

  // =========================================================================
  // User Authentication & Cross-Device Cloud Profile Synchronization
  // =========================================================================
  function updateAuthUI(user, isSynced = true) {
    currentUser = user;
    if (user) {
      const initial = (user.name || user.email || "U").charAt(0).toUpperCase();
      userNameDisplay.textContent = user.name || user.email.split("@")[0];
      userAvatarDisplay.textContent = initial;
      userAvatarDisplay.style.background = "#238636";
      userAvatarDisplay.style.color = "#fff";
      syncDotIndicator.className = "sync-dot-indicator" + (isSynced ? "" : " syncing");
      syncDotIndicator.title = isSynced ? "☁️ Cloud Synced" : "Syncing...";

      dropdownAvatar.textContent = initial;
      dropdownName.textContent = user.name || user.email.split("@")[0];
      dropdownEmail.textContent = user.email;
    } else {
      userNameDisplay.textContent = "Sign In";
      userAvatarDisplay.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
      userAvatarDisplay.style.background = "";
      userAvatarDisplay.style.color = "";
      syncDotIndicator.className = "sync-dot-indicator offline";
      syncDotIndicator.title = "Not synced (Local Guest Mode)";

      dropdownAvatar.textContent = "?";
      dropdownName.textContent = "Guest User";
      dropdownEmail.textContent = "Not synced to cloud";
    }
  }

  async function checkAuthStatus() {
    const token = localStorage.getItem("agentchat_session_token");
    if (!token) {
      updateAuthUI(null);
      return;
    }
    try {
      const res = await apiFetch("/api/auth/me");
      const data = await res.json();
      if (data.authenticated && data.user) {
        updateAuthUI(data.user);
        if (data.profile) {
          applyCloudProfile(data.profile);
        }
      } else {
        localStorage.removeItem("agentchat_session_token");
        updateAuthUI(null);
      }
    } catch (e) {
      console.warn("Auth check error:", e);
      updateAuthUI(null);
    }
  }

  function applyCloudProfile(profile) {
    if (!profile) return;
    // A custom proxy the user set on THIS device is their explicit, most recent
    // choice — don't let a stale cloud profile clobber it back to the default
    // (this was the "it forgets my proxy / key and reverts to custom" bug).
    var localActive = localStorage.getItem("agentchat_active_provider") || "";
    var keepLocal = localActive.indexOf("custom_") === 0;
    if (profile.active_provider && !keepLocal) {
      currentConfig.active_provider = profile.active_provider;
      localStorage.setItem("agentchat_active_provider", profile.active_provider);
      if (providerSelect) providerSelect.value = profile.active_provider;
    }
    if (profile.active_model) {
      currentConfig.model = profile.active_model;
      localStorage.setItem("agentchat_active_model", profile.active_model);
      if (modelSelect) modelSelect.value = profile.active_model;
    }
    if (profile.custom_base_url) {
      if (!currentConfig.providers) currentConfig.providers = {};
      if (!currentConfig.providers.custom) currentConfig.providers.custom = {};
      currentConfig.providers.custom.base_url = profile.custom_base_url;
      localStorage.setItem("agentchat_client_url_custom", profile.custom_base_url);
    }
    if (profile.keys && typeof profile.keys === "object") {
      Object.entries(profile.keys).forEach(([pKey, keyVal]) => {
        if (keyVal && typeof keyVal === "string") {
          if (!currentConfig.providers) currentConfig.providers = {};
          if (!currentConfig.providers[pKey]) currentConfig.providers[pKey] = {};
          currentConfig.providers[pKey].api_key = keyVal;
          currentConfig.providers[pKey].has_key = true;
          localStorage.setItem("agentchat_client_key_" + pKey, keyVal);
        }
      });
    }
  }

  async function syncUserProfileToCloud(showToast = false) {
    if (!currentUser) return;
    try {
      syncDotIndicator.className = "sync-dot-indicator syncing";
      const activeP = currentConfig.active_provider || "custom";
      const activeM = modelSelect ? modelSelect.value : (currentConfig.model || "");
      const customUrl = localStorage.getItem("agentchat_client_url_custom") || currentConfig.providers?.custom?.base_url || "";
      
      const keys = {};
      Object.keys(PROVIDER_DEFAULTS).forEach(pKey => {
        const k = localStorage.getItem("agentchat_client_key_" + pKey) || currentConfig.providers?.[pKey]?.api_key || "";
        if (k && !isMaskedKey(k)) {
          keys[pKey] = k;
        }
      });

      const res = await apiFetch("/api/user/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active_provider: activeP,
          active_model: activeM,
          custom_base_url: customUrl,
          keys: keys,
          settings: {
            temperature: parseFloat(settingTemp?.value) || 0.7,
            auto_compress: currentConfig.auto_compress !== false
          }
        })
      });

      if (res.ok) {
        syncDotIndicator.className = "sync-dot-indicator";
        if (showToast) alert("✅ Cloud Sync Complete: Your keys, base URLs, and preferences are safely synced across all your devices!");
      } else {
        syncDotIndicator.className = "sync-dot-indicator offline";
      }
    } catch (e) {
      console.warn("Cloud sync failed:", e);
      syncDotIndicator.className = "sync-dot-indicator offline";
    }
  }

  function openAuthModal() {
    authAlertBox.classList.add("hidden");
    authAlertBox.textContent = "";
    authModal.classList.remove("hidden");
  }

  function closeAuthModal() {
    authModal.classList.add("hidden");
  }

  function setAuthMode(mode) {
    authMode = mode;
    authAlertBox.classList.add("hidden");
    if (mode === "register") {
      authModalTitle.textContent = "Create an AgentChat Account";
      authNameGroup.classList.remove("hidden");
      authSubmitBtn.textContent = "Create Account & Sync";
      authToggleText.textContent = "Already have an account?";
      authToggleModeBtn.textContent = "Sign In";
    } else {
      authModalTitle.textContent = "Sign In to AgentChat";
      authNameGroup.classList.add("hidden");
      authSubmitBtn.textContent = "Sign In";
      authToggleText.textContent = "Don't have an account?";
      authToggleModeBtn.textContent = "Create Account";
    }
  }

  function openGoogleConnectModal() {
    closeAuthModal();
    if (googleConnectAlert) {
      googleConnectAlert.classList.add("hidden");
      googleConnectAlert.textContent = "";
    }
    if (googleEmailInput && !googleEmailInput.value) {
      googleEmailInput.value = localStorage.getItem("agentchat_user_email") || "";
    }
    if (googleNameInput && !googleNameInput.value) {
      googleNameInput.value = localStorage.getItem("agentchat_user_name") || "";
    }
    if (googleConnectModal) {
      googleConnectModal.classList.remove("hidden");
      initGoogleGsi();
      if (googleEmailInput) googleEmailInput.focus();
    }
  }

  function closeGoogleConnectModal() {
    if (googleConnectModal) googleConnectModal.classList.add("hidden");
  }

  let _googleClientId = null;
  async function getGoogleClientId() {
    if (_googleClientId !== null) return _googleClientId;
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      _googleClientId = data.google_client_id || "";
    } catch (err) {
      _googleClientId = "";
    }
    return _googleClientId;
  }

  async function initGoogleGsi() {
    if (!(window.google && window.google.accounts && window.google.accounts.id && googleGsiButtonContainer)) return;
    // Fetch the REAL client id from the server. The old hardcoded placeholder
    // ("agentchat-identity-service") is not a valid Google client id, which is
    // why sign-in failed. If the server has none configured, hide the button.
    const clientId = await getGoogleClientId();
    if (!clientId) {
      googleGsiButtonContainer.style.display = "none";
      return;
    }
    try {
      googleGsiButtonContainer.style.display = "flex";
      googleGsiButtonContainer.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleGsiResponse
      });
      window.google.accounts.id.renderButton(
        googleGsiButtonContainer,
        { theme: "outline", size: "large", width: 280, text: "continue_with" }
      );
    } catch (err) {
      console.log("Google GSI render:", err);
    }
  }

  async function handleGoogleGsiResponse(response) {
    if (!response || !response.credential) return;
    await submitSocialAuth({
      provider: "google",
      credential: response.credential
    });
  }

  async function handleGoogleOfficialLogin() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            fallbackPromptGoogleAuth();
          }
        });
        return;
      } catch (err) {
        console.log("GSI prompt error:", err);
      }
    }
    fallbackPromptGoogleAuth();
  }

  async function fallbackPromptGoogleAuth() {
    const emailPrompt = prompt("Enter your Google account email to sign in and sync chats:");
    if (!emailPrompt || !emailPrompt.trim() || !emailPrompt.includes("@")) return;
    const namePrompt = prompt("Enter your display name (optional):") || emailPrompt.split("@")[0];
    await submitSocialAuth({
      provider: "google",
      email: emailPrompt.trim(),
      name: namePrompt.trim()
    });
  }

  async function handleGoogleDirectAuth(e) {
    if (e) e.preventDefault();
    const email = (googleEmailInput?.value || "").trim();
    const name = (googleNameInput?.value || "").trim();

    if (!email || !email.includes("@")) {
      if (googleConnectAlert) {
        googleConnectAlert.classList.remove("hidden", "success");
        googleConnectAlert.classList.add("error");
        googleConnectAlert.textContent = "Please enter a valid Google email address.";
      }
      return;
    }

    if (googleConnectSubmitBtn) {
      googleConnectSubmitBtn.disabled = true;
      googleConnectSubmitBtn.textContent = "Connecting Google Account...";
    }

    await submitSocialAuth({
      provider: "google",
      email: email,
      name: name || email.split("@")[0]
    });

    if (googleConnectSubmitBtn) {
      googleConnectSubmitBtn.disabled = false;
      googleConnectSubmitBtn.textContent = "Authenticate with Google";
    }
  }

  async function submitSocialAuth(payload) {
    try {
      const res = await apiFetch("/api/auth/social-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.token) {
        localStorage.setItem("agentchat_session_token", data.token);
        updateAuthUI(data.user);
        if (data.profile) {
          applyCloudProfile(data.profile);
        }
        closeGoogleConnectModal();
        closeAuthModal();
        await fetchModels();
        updateBannerStatus();
      } else {
        if (googleConnectAlert) {
          googleConnectAlert.classList.remove("hidden", "success");
          googleConnectAlert.classList.add("error");
          googleConnectAlert.textContent = data.error || "Authentication failed.";
        } else {
          alert(data.error || "Authentication failed.");
        }
      }
    } catch (e) {
      if (googleConnectAlert) {
        googleConnectAlert.classList.remove("hidden", "success");
        googleConnectAlert.classList.add("error");
        googleConnectAlert.textContent = "Connection error: " + e.message;
      } else {
        alert("Connection error: " + e.message);
      }
    }
  }

  async function handleSocialSignIn(provider) {
    if (provider === "google") {
      openGoogleConnectModal();
      return;
    }
    const emailPrompt = prompt(`Enter your ${provider.toUpperCase()} email address to authenticate:`);
    if (!emailPrompt || !emailPrompt.trim()) return;
    const namePrompt = prompt(`Enter your name or display handle:`) || emailPrompt.split("@")[0];
    await submitSocialAuth({
      provider: provider,
      email: emailPrompt.trim(),
      name: namePrompt.trim()
    });
  }

  const PERSONA_PRESETS = {
    architect: "Act as a pragmatic Senior Staff Software Architect. Focus on robust modular designs, clean abstractions, high reliability, and clear technical rationale.",
    security: "Act as a Principal Security Engineer and Penetration Tester. Analyze edge cases, input validation, authentication boundaries, TLS/WAF mechanisms, and defensive programming.",
    concise: "Provide direct, production-ready code with minimal conversational filler. Include only necessary explanations directly relevant to code usage.",
    deep: "Reason through problems with rigorous first-principles analysis. Break down complex architectural and algorithmic problems into clear, step-by-step logic before writing code.",
    custom: ""
  };

  function openAccountModal() {
    if (!accountModal) return;

    const activeEmail = currentUser?.email || localStorage.getItem("agentchat_user_email") || "";
    const activeName = currentUser?.name || localStorage.getItem("agentchat_user_name") || "";

    if (currentUser) {
      if (accountDisplayNameHeader) accountDisplayNameHeader.textContent = currentUser.name || activeName || "Signed-in User";
      if (accountProviderBadge) {
        const provLabel = (currentUser.auth_provider || "google").toUpperCase();
        accountProviderBadge.textContent = `${provLabel} VERIFIED`;
        accountProviderBadge.style.display = "inline-block";
      }
      if (accountNameInput) accountNameInput.value = currentUser.name || activeName || "";
      if (accountEmailInput) accountEmailInput.value = currentUser.email || activeEmail || "";
      if (accountStatusPill) { accountStatusPill.textContent = "Synced"; accountStatusPill.className = "pill pill-green"; }
      if (accountAvatarInput) accountAvatarInput.value = currentUser.avatar_url || "";
      if (accountJoinedMeta) {
        const d = currentUser.created_at ? new Date(currentUser.created_at * 1000) : new Date();
        accountJoinedMeta.textContent = `Member since ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
      }
      if (accountLargeAvatar) {
        if (currentUser.avatar_url && (currentUser.avatar_url.startsWith("http") || currentUser.avatar_url.startsWith("data:image"))) {
          accountLargeAvatar.innerHTML = `<img src="${currentUser.avatar_url}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
          accountLargeAvatar.textContent = (currentUser.name || activeName || "U").charAt(0).toUpperCase();
        }
      }
    } else {
      if (accountDisplayNameHeader) accountDisplayNameHeader.textContent = activeName || "Guest User";
      if (accountProviderBadge) {
        accountProviderBadge.textContent = "GUEST SESSION";
        accountProviderBadge.style.display = "inline-block";
      }
      if (accountNameInput) accountNameInput.value = activeName || "";
      if (accountEmailInput) accountEmailInput.value = activeEmail || "";
      if (accountStatusPill) { accountStatusPill.textContent = "Guest Mode"; accountStatusPill.className = "pill pill-blue"; }
      if (accountAvatarInput) accountAvatarInput.value = "";
      if (accountJoinedMeta) accountJoinedMeta.textContent = "Isolated local session";
      if (accountLargeAvatar) accountLargeAvatar.textContent = (activeName || "G").charAt(0).toUpperCase();
    }

    // Persona directives
    if (accountPersonaPrompt) {
      accountPersonaPrompt.value = localStorage.getItem("agentchat_developer_persona") || PERSONA_PRESETS.architect;
    }
    if (accountDefaultEffort) {
      accountDefaultEffort.value = localStorage.getItem("agentchat_default_effort") || "medium";
    }

    // Usage & Efficiency stats
    const statTotalChats = document.getElementById("stat-total-chats");
    const statActiveProv = document.getElementById("stat-active-provider");
    if (statTotalChats) {
      try {
        const savedSessions = JSON.parse(localStorage.getItem("agentchat_sessions") || "[]");
        statTotalChats.textContent = Array.isArray(savedSessions) ? (savedSessions.length || "1") : "1";
      } catch (_) {
        statTotalChats.textContent = "1";
      }
    }
    if (statActiveProv) {
      statActiveProv.textContent = (currentConfig.active_provider || "custom").toUpperCase();
    }

    renderAccountVaultGrid();
    accountModal.classList.remove("hidden");
  }

  function closeAccountModal() {
    if (accountModal) accountModal.classList.add("hidden");
  }

  function renderAccountVaultGrid() {
    if (!accountVaultGrid) return;
    accountVaultGrid.innerHTML = "";

    Object.entries(PROVIDER_DEFAULTS).forEach(([pKey, pDef]) => {
      const storedKey = localStorage.getItem("agentchat_client_key_" + pKey) || currentConfig.providers?.[pKey]?.api_key;
      const hasKey = !!(storedKey && storedKey.trim());
      const pUrl = localStorage.getItem("agentchat_client_url_" + pKey) || currentConfig.providers?.[pKey]?.base_url || pDef.base_url;

      const card = document.createElement("div");
      card.className = "vault-provider-item" + (hasKey ? " active" : "");
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-weight:600; font-size:12px; color:var(--md-sys-color-on-surface);">${pDef.name}</span>
          <span style="font-size:10.5px; padding:2px 6px; border-radius:10px; background:${hasKey ? 'rgba(35,134,54,0.18)' : 'rgba(255,255,255,0.06)'}; color:${hasKey ? '#3fb950' : 'var(--md-sys-color-outline)'};">
            ${hasKey ? '🔑 Stored & Synced' : '○ Not Set'}
          </span>
        </div>
        <div style="font-size:10.5px; color:var(--md-sys-color-outline); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${pUrl}">
          ${pUrl}
        </div>
      `;
      accountVaultGrid.appendChild(card);
    });
  }

  async function saveAccountName() {
    const newName = (accountNameInput?.value || "").trim();
    if (!newName) {
      alert("Please enter a valid display name.");
      return;
    }
    localStorage.setItem("agentchat_user_name", newName);

    if (currentUser) {
      try {
        const res = await apiFetch("/api/user/profile-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName })
        });
        const data = await res.json();
        if (data.success && data.user) {
          updateAuthUI(data.user);
          if (accountDisplayNameHeader) accountDisplayNameHeader.textContent = data.user.name;
          alert("✅ Display name updated successfully!");
        } else {
          alert(data.error || "Failed to update profile name.");
        }
      } catch (e) {
        alert("Profile update failed: " + e.message);
      }
    } else {
      if (accountDisplayNameHeader) accountDisplayNameHeader.textContent = newName;
      userNameDisplay.textContent = newName;
      alert(`✅ Display name set to ${newName}!`);
    }
  }

  async function saveAccountEmail() {
    const newEmail = (accountEmailInput?.value || "").trim().toLowerCase();
    const newName = (accountNameInput?.value || "").trim() || "Guest User";
    if (!newEmail || !newEmail.includes("@")) {
      alert("Please enter a valid email address (e.g. user@example.com).");
      return;
    }
    localStorage.setItem("agentchat_user_email", newEmail);
    if (newName) localStorage.setItem("agentchat_user_name", newName);

    if (currentUser) {
      try {
        const res = await apiFetch("/api/user/profile-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: newEmail, name: newName })
        });
        const data = await res.json();
        if (data.success && data.user) {
          updateAuthUI(data.user);
          alert(`✅ Connected email updated to ${newEmail}!`);
        } else {
          alert(data.error || "Account update: " + (data.error || ""));
        }
      } catch (e) {
        alert("Account update: " + e.message);
      }
    } else {
      closeAccountModal();
      openAuthModal("login");
    }
  }

  async function handleQuickGoogleConnect() {
    openGoogleConnectModal();
  }

  async function saveAccountAvatar() {
    const newAvatar = (accountAvatarInput?.value || "").trim();
    if (!newAvatar) {
      alert("Please enter an image URL.");
      return;
    }
    if (!currentUser) {
      alert("Sign in to save your avatar to the cloud.");
      return;
    }

    try {
      const res = await apiFetch("/api/user/profile-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: newAvatar })
      });
      const data = await res.json();
      if (data.success && data.user) {
        updateAuthUI(data.user);
        if (accountLargeAvatar) {
          accountLargeAvatar.innerHTML = `<img src="${data.user.avatar_url}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        alert("✅ Avatar updated successfully!");
      } else {
        alert(data.error || "Failed to update avatar.");
      }
    } catch (e) {
      alert("Avatar update failed: " + e.message);
    }
  }

  function saveAccountPersona() {
    const promptVal = (accountPersonaPrompt?.value || "").trim();
    const effortVal = accountDefaultEffort?.value || "medium";

    localStorage.setItem("agentchat_developer_persona", promptVal);
    localStorage.setItem("agentchat_default_effort", effortVal);
    if (effortSelect) effortSelect.value = effortVal;

    if (currentUser) {
      syncUserProfileToCloud();
    }
    alert("✅ AI Persona & Directives saved! They will now automatically guide all your chat conversations.");
  }

  async function handleLogoutAll() {
    if (!confirm("Are you sure you want to sign out of all active devices and sessions?")) return;
    try {
      await apiFetch("/api/auth/logout-all", { method: "POST" });
    } catch (_) {}
    localStorage.removeItem("agentchat_session_token");
    updateAuthUI(null);
    closeAccountModal();
    updateBannerStatus();
    alert("🚪 Signed out of all devices successfully.");
  }

  function exportUserData() {
    const backup = {
      version: "AgentChat-v2",
      exported_at: new Date().toISOString(),
      user: currentUser,
      config: currentConfig,
      persona: localStorage.getItem("agentchat_developer_persona") || "",
      default_effort: localStorage.getItem("agentchat_default_effort") || "medium",
      custom_models: getCustomModels(),
      vault: getKeyVault(),
      sessions: JSON.parse(localStorage.getItem("agentchat_sessions") || "[]")
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentchat_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getCustomModels() {
    try {
      return JSON.parse(localStorage.getItem("agentchat_custom_models") || "[]");
    } catch (_) {
      return [];
    }
  }

  function saveCustomModel(id) {
    if (!id) return;
    const list = getCustomModels();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem("agentchat_custom_models", JSON.stringify(list));
    }
  }

  function openCustomModelModal() {
    if (customModelModal) {
      if (customModelInput) customModelInput.value = "";
      customModelModal.classList.remove("hidden");
      if (customModelInput) customModelInput.focus();
    }
  }

  function closeCustomModelModal() {
    if (customModelModal) customModelModal.classList.add("hidden");
    const curSaved = localStorage.getItem("agentchat_active_model");
    if (curSaved && modelSelect) {
      modelSelect.value = curSaved;
    }
  }

  async function applyCustomModel() {
    const rawVal = customModelInput ? customModelInput.value.trim() : "";
    if (!rawVal) {
      alert("Please enter a model identifier.");
      return;
    }
    saveCustomModel(rawVal);
    MODEL_DISPLAY_NAMES[rawVal] = `⚡ ${rawVal}`;
    currentConfig.model = rawVal;
    localStorage.setItem("agentchat_active_model", rawVal);
    closeCustomModelModal();
    await fetchModels();
    modelSelect.value = rawVal;
    if (currentUser) syncUserProfileToCloud();
  }

  async function handleEmailAuthSubmit(e) {
    if (e) e.preventDefault();
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value.trim();
    const name = authNameInput.value.trim();

    if (!email || !password) {
      authAlertBox.classList.remove("hidden", "success");
      authAlertBox.classList.add("error");
      authAlertBox.textContent = "Please enter both email and password";
      return;
    }

    try {
      authSubmitBtn.disabled = true;
      authSubmitBtn.textContent = "Authenticating...";

      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = { email, password };
      if (authMode === "register" && name) payload.name = name;

      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = authMode === "register" ? "Create Account & Sync" : "Sign In";

      if (data.success && data.token) {
        localStorage.setItem("agentchat_session_token", data.token);
        updateAuthUI(data.user);
        if (data.profile) {
          applyCloudProfile(data.profile);
        }
        closeAuthModal();
        await fetchModels();
        updateBannerStatus();
      } else {
        authAlertBox.classList.remove("hidden", "success");
        authAlertBox.classList.add("error");
        authAlertBox.textContent = data.error || "Authentication failed";
      }
    } catch (e) {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = authMode === "register" ? "Create Account & Sync" : "Sign In";
      authAlertBox.classList.remove("hidden", "success");
      authAlertBox.classList.add("error");
      authAlertBox.textContent = "Network error: " + e.message;
    }
  }

  async function handleSignOut() {
    userDropdownMenu.classList.add("hidden");
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (_) {}
    localStorage.removeItem("agentchat_session_token");
    updateAuthUI(null);
    updateBannerStatus();
  }

  // ==================== MULTI-PROXY PROFILE & PROVIDER SWITCHER ====================
  function getCustomProxies() {
    try {
      const raw = localStorage.getItem("agentchat_custom_proxies");
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  function saveCustomProxies(list) {
    localStorage.setItem("agentchat_custom_proxies", JSON.stringify(list));
  }

  function updateProxyNameGroupVisibility(provKey) {
    const isCustom = provKey && provKey.startsWith("custom_");
    if (proxyCustomNameGroup) {
      if (isCustom) proxyCustomNameGroup.classList.remove("hidden");
      else proxyCustomNameGroup.classList.add("hidden");
    }
    if (btnDeleteCustomProxy) {
      if (isCustom) btnDeleteCustomProxy.classList.remove("hidden");
      else btnDeleteCustomProxy.classList.add("hidden");
    }
  }

  function populateProviderDropdowns() {
    const customProxies = getCustomProxies();
    const active = currentConfig.active_provider || "agentrouter";

    const freePresets = [
      { id: "puter", label: "🚀 Puter.ai (100% Free Claude Opus 5 & Frontier)" },
      { id: "google", label: "🌐 Google AI Studio (Free Gemini 2.0 Tier)" },
      { id: "groq", label: "⚡ Groq Cloud (Free Ultra-Fast Inference)" },
      { id: "openrouter", label: "🔀 OpenRouter (Free Tier Models)" }
    ];

    const premiumPresets = [
      { id: "justdowork", label: "💼 JustDoWork (api.justwoker.icu - Claude Opus 5)" },
      { id: "agentrouter", label: "🛡️ AgentRouter (agentrouter.org - Stealth Vault)" },
      { id: "deepseek", label: "🐳 DeepSeek Official (deepseek.com)" },
      { id: "openai", label: "✨ OpenAI Official (api.openai.com)" },
      { id: "custom", label: "⚙️ Custom Stealth Proxy" }
    ];

    [providerSelect, settingProviderChoice].forEach(selectEl => {
      if (!selectEl) return;
      const isHeaderSelect = (selectEl === providerSelect);
      selectEl.innerHTML = "";

      const optGroupFree = document.createElement("optgroup");
      optGroupFree.label = "🎁 Free Tier / Zero-Cost Gateways";
      freePresets.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        if (p.id === active) opt.selected = true;
        optGroupFree.appendChild(opt);
      });
      selectEl.appendChild(optGroupFree);

      const optGroupPremium = document.createElement("optgroup");
      optGroupPremium.label = "💼 Premium & Stealth Gateways";
      premiumPresets.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        if (p.id === active) opt.selected = true;
        optGroupPremium.appendChild(opt);
      });
      selectEl.appendChild(optGroupPremium);

      if (customProxies.length > 0) {
        const optGroupCustom = document.createElement("optgroup");
        optGroupCustom.label = "🔗 Custom User Proxies";
        customProxies.forEach(cp => {
          const opt = document.createElement("option");
          opt.value = cp.id;
          opt.textContent = `🔗 ${cp.name || cp.id}`;
          if (cp.id === active) opt.selected = true;
          optGroupCustom.appendChild(opt);
        });
        selectEl.appendChild(optGroupCustom);
      }

      if (isHeaderSelect) {
        const addOpt = document.createElement("option");
        addOpt.value = "__add_proxy__";
        addOpt.textContent = "➕ Add Custom Proxy...";
        selectEl.appendChild(addOpt);
      }
    });

    if (providerSelect) providerSelect.value = active;
    if (settingProviderChoice) settingProviderChoice.value = active;
    updateProxyNameGroupVisibility(active);
  }

  function addNewCustomProxyPrompt() {
    const name = prompt("Enter a label for your new Custom Proxy profile:\n(e.g., 'My Secondary Gateway', 'Ollama Local', 'Team Reverse Proxy')");
    if (!name || !name.trim()) {
      populateProviderDropdowns();
      return;
    }
    const customProxies = getCustomProxies();
    const newId = "custom_" + Date.now();
    const newProxy = {
      id: newId,
      name: name.trim(),
      base_url: "https://"
    };
    customProxies.push(newProxy);
    saveCustomProxies(customProxies);

    if (!currentConfig.providers) currentConfig.providers = {};
    currentConfig.providers[newId] = {
      name: name.trim(),
      base_url: "https://",
      api_key: "",
      has_key: false
    };

    switchProvider(newId);
    if (settingsModal) {
      syncSettingsModalWithConfig();
      settingsModal.classList.remove("hidden");
      if (settingBaseUrl) {
        settingBaseUrl.value = "";
        settingBaseUrl.focus();
      }
    }
  }

  function deleteCustomProxyProfile() {
    const active = currentConfig.active_provider || "";
    if (!active.startsWith("custom_")) return;
    const customProxies = getCustomProxies();
    const found = customProxies.find(cp => cp.id === active);
    const name = found ? found.name : active;
    if (!confirm(`Are you sure you want to delete custom proxy profile "${name}"?`)) return;

    const remaining = customProxies.filter(cp => cp.id !== active);
    saveCustomProxies(remaining);
    if (currentConfig.providers && currentConfig.providers[active]) {
      delete currentConfig.providers[active];
    }
    localStorage.removeItem("agentchat_client_key_" + active);
    localStorage.removeItem("agentchat_client_url_" + active);

    switchProvider("agentrouter");
  }

  // Provider Switching
  async function switchProvider(provKey) {
    if (provKey === "__add_proxy__") {
      addNewCustomProxyPrompt();
      return;
    }
    currentConfig.active_provider = provKey;
    localStorage.setItem("agentchat_active_provider", provKey);
    populateProviderDropdowns();
    populateProviderFields(provKey);

    // Provide immediate visual feedback that models are auto-discovering for the new proxy
    if (modelSelect) {
      modelSelect.innerHTML = `<option value="">⚡ Discovering models for ${provKey}...</option>`;
    }
    const pillsContainer = document.getElementById("agentrouter-pills");
    if (pillsContainer) {
      pillsContainer.innerHTML = `<span style="font-size:12px; color:var(--md-sys-color-outline); padding:4px 8px;">🔄 Connecting & auto-discovering models for ${provKey}...</span>`;
    }

    await saveConfig(false);
    await fetchModels();
    updateBannerStatus();
    if (currentUser) {
      syncUserProfileToCloud();
    }
  }

  // Lean Mode & Token Meter State
  function updateLeanModeUI() {
    if (leanModeLabel) {
      leanModeLabel.textContent = isLeanMode ? "Lean: ON" : "Lean: OFF";
    }
    if (leanModeToggleBtn) {
      if (isLeanMode) {
        leanModeToggleBtn.classList.add("active");
        leanModeToggleBtn.style.backgroundColor = "rgba(16, 185, 129, 0.15)";
        leanModeToggleBtn.style.borderColor = "#10b981";
        leanModeToggleBtn.style.color = "#10b981";
      } else {
        leanModeToggleBtn.classList.remove("active");
        leanModeToggleBtn.style.backgroundColor = "";
        leanModeToggleBtn.style.borderColor = "";
        leanModeToggleBtn.style.color = "";
      }
    }
    if (settingLeanMode) {
      settingLeanMode.checked = isLeanMode;
    }
  }

  function toggleLeanMode() {
    isLeanMode = !isLeanMode;
    localStorage.setItem("agentchat_lean_mode", isLeanMode ? "true" : "false");
    updateLeanModeUI();
  }

  function updateTokenMeter(deltaIn = 0, deltaOut = 0) {
    sessionInTokens += deltaIn;
    sessionOutTokens += deltaOut;
    if (meterInTokens) meterInTokens.textContent = sessionInTokens;
    if (meterOutTokens) meterOutTokens.textContent = sessionOutTokens;
  }

  // --- Client-Side Web Crypto API: AES-GCM Encrypted Vault ---
  let cachedCryptoKey = null;
  async function getOrCreateDeviceCryptoKey() {
    if (cachedCryptoKey) return cachedCryptoKey;
    if (!window.crypto || !window.crypto.subtle) return null;
    try {
      let rawSeed = localStorage.getItem("agentchat_vault_salt");
      if (!rawSeed) {
        const arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
        rawSeed = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("agentchat_vault_salt", rawSeed);
      }
      const enc = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode("agentchat_device_seed_" + rawSeed),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );
      cachedCryptoKey = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: enc.encode("agentchat_pbkdf2_salt_v3"),
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      return cachedCryptoKey;
    } catch (e) {
      console.warn("Web Crypto derivation error:", e);
      return null;
    }
  }

  async function encryptClientVault(plainObj) {
    const key = await getOrCreateDeviceCryptoKey();
    if (!key) return JSON.stringify(plainObj);
    try {
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const encodedData = enc.encode(JSON.stringify(plainObj));
      const cipherBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
      );
      const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join("");
      const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));
      return `enc_gcm::${ivHex}::${cipherB64}`;
    } catch (e) {
      return JSON.stringify(plainObj);
    }
  }

  async function decryptClientVault(storedVal) {
    if (!storedVal) return {};
    if (!storedVal.startsWith("enc_gcm::")) {
      try { return JSON.parse(storedVal); } catch (_) { return {}; }
    }
    const key = await getOrCreateDeviceCryptoKey();
    if (!key) return {};
    try {
      const parts = storedVal.split("::");
      const ivHex = parts[1];
      const cipherB64 = parts[2];
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
      const cipherBytes = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        cipherBytes
      );
      const dec = new TextDecoder();
      return JSON.parse(dec.decode(decrypted));
    } catch (e) {
      console.warn("Failed to decrypt local vault:", e);
      return {};
    }
  }

  let memoryVaultCache = null;
  function getKeyVault() {
    if (memoryVaultCache) return memoryVaultCache;
    try {
      const raw = localStorage.getItem("agentchat_key_vault");
      if (raw) {
        if (raw.startsWith("enc_gcm::")) {
          decryptClientVault(raw).then(dec => {
            memoryVaultCache = dec;
            const active = currentConfig.active_provider || "base";
            renderKeyVaultOptions(active);
          });
          return {};
        }
        return JSON.parse(raw);
      }
    } catch (e) {}
    return {};
  }

  function saveKeyVault(vault) {
    memoryVaultCache = vault;
    encryptClientVault(vault).then(enc => {
      localStorage.setItem("agentchat_key_vault", enc);
    });
  }

  function maskKey(key) {
    if (!key) return "";
    if (key.length <= 8) return "••••" + key.slice(-3);
    return key.slice(0, 6) + "•••" + key.slice(-4);
  }

  function renderKeyVaultOptions(provKey) {
    if (!settingSavedKeysSelect) return;
    const vault = getKeyVault();
    let keys = vault[provKey] || [];
    const activeKey = currentConfig.providers?.[provKey]?.api_key || "";

    // If vault is empty for this provider but config has an active key, initialize it automatically
    if (!keys.length && activeKey) {
      keys = [{ id: "key_default", alias: "Primary Key", key: activeKey }];
      vault[provKey] = keys;
      saveKeyVault(vault);
    }

    settingSavedKeysSelect.innerHTML = "";
    keys.forEach((k, idx) => {
      const opt = document.createElement("option");
      opt.value = k.id;
      const isSelected = (k.key === activeKey) || (!activeKey && idx === 0);
      opt.textContent = `🔑 ${k.alias || "Key " + (idx + 1)} (${maskKey(k.key)})${isSelected ? " [Active]" : ""}`;
      if (isSelected) opt.selected = true;
      settingSavedKeysSelect.appendChild(opt);
    });

    const addOpt = document.createElement("option");
    addOpt.value = "__add_new__";
    addOpt.textContent = "+ Add New API Key...";
    settingSavedKeysSelect.appendChild(addOpt);

    syncSelectedKeyWithInputs(provKey);
  }

  function syncSelectedKeyWithInputs(provKey) {
    if (!settingSavedKeysSelect) return;
    const selectedId = settingSavedKeysSelect.value;
    const vault = getKeyVault();
    const keys = vault[provKey] || [];

    if (selectedId === "__add_new__" || !keys.length) {
      settingApiKey.value = "";
      settingKeyAlias.value = "";
      settingApiKey.focus();
    } else {
      const found = keys.find(k => k.id === selectedId) || keys[0];
      if (found) {
        settingApiKey.value = found.key;
        settingKeyAlias.value = found.alias || "";
        if (!currentConfig.providers) currentConfig.providers = {};
        if (!currentConfig.providers[provKey]) currentConfig.providers[provKey] = {};
        currentConfig.providers[provKey].api_key = found.key;
      }
    }
  }

  function saveCurrentKeyToVault() {
    const provKey = settingProviderChoice.value;
    const keyVal = settingApiKey.value.trim();
    if (!keyVal) {
      alert("Please enter an API key to save.");
      return;
    }
    const vault = getKeyVault();
    if (!vault[provKey]) vault[provKey] = [];
    const keys = vault[provKey];

    const aliasVal = settingKeyAlias.value.trim() || `Key ${keys.length + 1}`;
    const existing = keys.find(k => k.key === keyVal);
    let targetId = "";

    if (existing) {
      existing.alias = aliasVal;
      targetId = existing.id;
    } else {
      targetId = "key_" + Date.now();
      keys.push({ id: targetId, alias: aliasVal, key: keyVal });
    }

    vault[provKey] = keys;
    saveKeyVault(vault);

    if (!currentConfig.providers) currentConfig.providers = {};
    if (!currentConfig.providers[provKey]) currentConfig.providers[provKey] = {};
    currentConfig.providers[provKey].api_key = keyVal;

    localStorage.setItem("agentchat_client_key_" + provKey, keyVal);

    renderKeyVaultOptions(provKey);
    settingSavedKeysSelect.value = targetId;
    fetchModels();
    alert(`Saved "${aliasVal}" to Key Vault! Models for this key are now active.`);
  }

  function deleteCurrentKeyFromVault() {
    const provKey = settingProviderChoice.value;
    const selectedId = settingSavedKeysSelect.value;
    if (selectedId === "__add_new__") return;

    const vault = getKeyVault();
    let keys = vault[provKey] || [];
    const keyToDelete = keys.find(k => k.id === selectedId);
    if (!keyToDelete) return;

    if (!confirm(`Are you sure you want to remove "${keyToDelete.alias}" from your vault?`)) return;

    keys = keys.filter(k => k.id !== selectedId);
    vault[provKey] = keys;
    saveKeyVault(vault);

    if (currentConfig.providers?.[provKey]?.api_key === keyToDelete.key) {
      currentConfig.providers[provKey].api_key = keys[0]?.key || "";
      localStorage.setItem("agentchat_client_key_" + provKey, keys[0]?.key || "");
    }

    renderKeyVaultOptions(provKey);
    fetchModels();
  }

  function populateProviderFields(provKey) {
    const prov = currentConfig.providers?.[provKey] || {};
    const defaultUrl = PROVIDER_DEFAULTS[provKey]?.base_url || "";
    const storedUrl = localStorage.getItem("agentchat_client_url_" + provKey) || "";
    settingBaseUrl.value = storedUrl || prov.base_url || defaultUrl;

    if (provKey && provKey.startsWith("custom_")) {
      const customProxies = getCustomProxies();
      const cp = customProxies.find(p => p.id === provKey);
      if (settingProxyCustomName && cp) {
        settingProxyCustomName.value = cp.name || "";
      }
    }
    updateProxyNameGroupVisibility(provKey);
    renderKeyVaultOptions(provKey);
  }

  function syncSettingsModalWithConfig() {
    populateProviderDropdowns();
    const active = currentConfig.active_provider || "agentrouter";
    if (settingProviderChoice) settingProviderChoice.value = active;
    populateProviderFields(active);
    settingAutoCompress.checked = currentConfig.auto_compress !== false;
    if (settingLeanMode) settingLeanMode.checked = isLeanMode;
    settingTemp.value = currentConfig.temperature || 0.7;
    tempDisplay.textContent = settingTemp.value;
    settingSystemPrompt.value = currentConfig.system_prompt || "";
    if (settingProtocolMode) {
      settingProtocolMode.value = currentConfig.protocol_mode || "stealth_auto";
    }
    if (settingBackendUrl) {
      settingBackendUrl.value = localStorage.getItem("agentchat_backend_url") || "";
    }
  }

  async function fetchConfig() {
    try {
      const res = await apiFetch("/api/config");
      currentConfig = await res.json();

      // Check cloud authentication & profile first
      await checkAuthStatus();

      // If user is not logged in, restore persistent settings from localStorage
      if (!currentUser) {
        const savedProvider = localStorage.getItem("agentchat_active_provider");
        if (savedProvider) {
          currentConfig.active_provider = savedProvider;
        }
        const savedModel = localStorage.getItem("agentchat_active_model");
        if (savedModel) {
          currentConfig.model = savedModel;
        }
      }

      // Restore custom proxies into currentConfig.providers
      const customProxies = getCustomProxies();
      customProxies.forEach(cp => {
        if (!currentConfig.providers) currentConfig.providers = {};
        if (!currentConfig.providers[cp.id]) {
          currentConfig.providers[cp.id] = {
            name: cp.name,
            base_url: cp.base_url,
            api_key: "",
            has_key: false
          };
        }
      });

      // Restore client keys & URLs into currentConfig
      const allProviderKeys = [...Object.keys(PROVIDER_DEFAULTS), ...customProxies.map(cp => cp.id)];
      allProviderKeys.forEach(pKey => {
        if (!currentConfig.providers) currentConfig.providers = {};
        if (!currentConfig.providers[pKey]) currentConfig.providers[pKey] = {};
        const storedKey = localStorage.getItem("agentchat_client_key_" + pKey);
        if (storedKey && (!currentConfig.providers[pKey].api_key || isMaskedKey(currentConfig.providers[pKey].api_key))) {
          currentConfig.providers[pKey].api_key = storedKey;
          currentConfig.providers[pKey].has_key = true;
        }
        const storedUrl = localStorage.getItem("agentchat_client_url_" + pKey);
        if (storedUrl) {
          currentConfig.providers[pKey].base_url = storedUrl;
        }
      });

      populateProviderDropdowns();
      updateLeanModeUI();

      if (currentConfig.model) modelSelect.value = currentConfig.model;
      syncSettingsModalWithConfig();
      fetchModels();
    } catch (e) {
      console.warn("Failed to fetch config:", e);
    }
  }

  async function saveConfig(closeModal = true) {
    const activeP = settingProviderChoice.value;
    if (!currentConfig.providers) currentConfig.providers = {};
    if (!currentConfig.providers[activeP]) currentConfig.providers[activeP] = {};

    const enteredKey = settingApiKey.value.trim();
    const enteredUrl = settingBaseUrl.value.trim() || PROVIDER_DEFAULTS[activeP]?.base_url || "";
    currentConfig.providers[activeP].api_key = enteredKey;
    currentConfig.providers[activeP].base_url = enteredUrl;
    currentConfig.active_provider = activeP;
    currentConfig.auto_compress = settingAutoCompress.checked;
    if (settingLeanMode) {
      isLeanMode = settingLeanMode.checked;
      localStorage.setItem("agentchat_lean_mode", isLeanMode ? "true" : "false");
      updateLeanModeUI();
    }
    currentConfig.lean_mode = isLeanMode;
    currentConfig.temperature = parseFloat(settingTemp.value) || 0.7;
    currentConfig.system_prompt = settingSystemPrompt.value.trim();
    currentConfig.model = modelSelect.value;
    if (settingProtocolMode) {
      currentConfig.protocol_mode = settingProtocolMode.value;
      localStorage.setItem("agentchat_protocol_mode", settingProtocolMode.value);
    }
    if (settingBackendUrl) {
      const bVal = settingBackendUrl.value.trim().replace(/\/+$/, "");
      if (bVal) {
        localStorage.setItem("agentchat_backend_url", bVal);
      } else {
        localStorage.removeItem("agentchat_backend_url");
      }
    }

    if (activeP.startsWith("custom_") && settingProxyCustomName && settingProxyCustomName.value.trim()) {
      const customProxies = getCustomProxies();
      const cp = customProxies.find(p => p.id === activeP);
      if (cp) {
        cp.name = settingProxyCustomName.value.trim();
        cp.base_url = enteredUrl;
        saveCustomProxies(customProxies);
      }
      currentConfig.providers[activeP].name = settingProxyCustomName.value.trim();
    }

    localStorage.setItem("agentchat_active_provider", activeP);
    localStorage.setItem("agentchat_active_model", modelSelect.value);
    localStorage.setItem("agentchat_client_key_" + activeP, enteredKey);
    localStorage.setItem("agentchat_client_url_" + activeP, enteredUrl);

    // Auto-save key to vault if not already present
    if (enteredKey) {
      const vault = getKeyVault();
      if (!vault[activeP]) vault[activeP] = [];
      const existing = vault[activeP].find(k => k.key === enteredKey);
      if (!existing) {
        vault[activeP].push({
          id: "key_" + Date.now(),
          alias: settingKeyAlias.value.trim() || `Key ${vault[activeP].length + 1}`,
          key: enteredKey
        });
        saveKeyVault(vault);
      }
    }

    try {
      await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentConfig)
      });
      if (closeModal) settingsModal.classList.add("hidden");
      populateProviderDropdowns();
      await fetchModels();
      if (currentUser) {
        syncUserProfileToCloud();
      }
    } catch (e) {
      if (closeModal) alert("Failed to save settings: " + e.message);
    }
  }

  async function fetchModels() {
    try {
      const res = await apiFetch("/api/models");
      const data = await res.json();
      if (data.models && data.models.length) {
        const cur = modelSelect.value || localStorage.getItem("agentchat_active_model") || currentConfig.model;
        modelSelect.innerHTML = "";

        const allModels = [...data.models];
        const customModels = getCustomModels();
        customModels.forEach(cmId => {
          if (!allModels.some(m => m.id === cmId)) {
            allModels.push({
              id: cmId,
              name: MODEL_DISPLAY_NAMES[cmId] || cmId,
              status: "online",
              custom: true
            });
          }
        });

        // Group models into Free, Flagship, Coding, and Available
        const freeModels = [];
        const flagshipModels = [];
        const codingModels = [];
        const otherModels = [];

        allModels.forEach(m => {
          const idLower = (m.id || "").toLowerCase();
          const nameLower = (m.name || "").toLowerCase();
          if (m.is_free) {
            freeModels.push(m);
          } else if (
            idLower.includes("opus") || idLower.includes("sonnet") ||
            idLower.includes("gpt-4o") || idLower.includes("deepseek-r1") ||
            nameLower.includes("flagship") || nameLower.includes("frontier")
          ) {
            flagshipModels.push(m);
          } else if (
            idLower.includes("code") || idLower.includes("coder") ||
            idLower.includes("o1") || idLower.includes("o3") ||
            idLower.includes("reasoning")
          ) {
            codingModels.push(m);
          } else {
            otherModels.push(m);
          }
        });

        const appendOption = (parent, m) => {
          const opt = document.createElement("option");
          opt.value = m.id;
          const st = modelStatuses[m.id]?.status || m.status || "online";
          const displayName = MODEL_DISPLAY_NAMES[m.id] || m.name || m.id;
          const freeBadge = m.is_free ? " 🎁 [Free]" : "";
          if (st === "online") opt.textContent = `🟢 ${displayName}${freeBadge}`;
          else if (st === "exhausted") opt.textContent = `🔴 ${displayName} (Quota Limit)`;
          else opt.textContent = `⚪ ${displayName}${freeBadge}`;
          parent.appendChild(opt);
        };

        if (freeModels.length > 0) {
          const grp = document.createElement("optgroup");
          grp.label = "🌟 Free Tier Models (Zero Cost)";
          freeModels.forEach(m => appendOption(grp, m));
          modelSelect.appendChild(grp);
        }

        if (flagshipModels.length > 0) {
          const grp = document.createElement("optgroup");
          grp.label = "⚡ Frontier & Flagship";
          flagshipModels.forEach(m => appendOption(grp, m));
          modelSelect.appendChild(grp);
        }

        if (codingModels.length > 0) {
          const grp = document.createElement("optgroup");
          grp.label = "💻 Coding & Deep Reasoning";
          codingModels.forEach(m => appendOption(grp, m));
          modelSelect.appendChild(grp);
        }

        if (otherModels.length > 0) {
          const grp = document.createElement("optgroup");
          grp.label = "🌐 Available Models";
          otherModels.forEach(m => appendOption(grp, m));
          modelSelect.appendChild(grp);
        }

        const customPromptOpt = document.createElement("option");
        customPromptOpt.value = "__custom_entry__";
        customPromptOpt.textContent = "➕ Enter Custom Model ID...";
        modelSelect.appendChild(customPromptOpt);

        if (cur && Array.from(modelSelect.options).some(o => o.value === cur)) {
          modelSelect.value = cur;
        } else {
          const preferred = flagshipModels[0] || freeModels[0] || allModels[0];
          modelSelect.value = preferred.id;
        }

        localStorage.setItem("agentchat_active_model", modelSelect.value);
        currentConfig.model = modelSelect.value;
        renderModelPickerBar(allModels, modelSelect.value);
        updateAgentRouterBarActivePill(modelSelect.value);
      }
    } catch (e) {
      console.warn("Failed to fetch models:", e);
    }
  }

  // ==================== AGENT SKILLS MANAGER ====================
  const DEFAULT_SKILLS = [
    {
      id: "code_architect",
      name: "Code Architect & Clean Coder",
      icon: "🏗️",
      category: "Engineering",
      desc: "Enforces modular architecture, typed signatures, error boundaries, and production-grade refactoring.",
      prompt: "You are acting as a Principal Software Architect. Prioritize maintainable, production-ready, typed, and clean code. Structure code logically, handle edge cases and failure modes explicitly, avoid monolithic functions, and document key architecture decisions succinctly.",
      enabled: true
    },
    {
      id: "deep_research",
      name: "Deep Research & Fact-Checker",
      icon: "🔍",
      category: "Research",
      desc: "Synthesizes multi-angle analysis, validates claims, cites verified facts, and compares trade-offs.",
      prompt: "You are acting as a Lead Technical Researcher. When analyzing topics or answering queries, provide rigorous, evidence-based reasoning. Contrast competing trade-offs, cite authoritative sources, organize findings in structured analytical tables, and explicitly note caveats.",
      enabled: false
    },
    {
      id: "security_auditor",
      name: "Security & Vulnerability Auditor",
      icon: "🛡️",
      category: "Security",
      desc: "Applies zero-trust principles: audits for OWASP Top 10, sanitizes memory/inputs, and checks for secret leaks.",
      prompt: "You are acting as a Senior Application Security Engineer. Scrutinize code, architecture, and inputs through a zero-trust threat modeling lens. Identify injection vulnerabilities, authentication oversights, hardcoded credentials, and memory safety risks. Provide concrete hardened remedies.",
      enabled: false
    },
    {
      id: "data_analyst",
      name: "Data Science & Visualizer",
      icon: "📊",
      category: "Analytics",
      desc: "Processes tabular datasets, computes statistics, checks formulas, and generates clean markdown tables.",
      prompt: "You are acting as a Senior Data Scientist. Focus on numerical precision, statistical validity, and intuitive data presentation. Parse datasets carefully, verify formulas step-by-step, and summarize patterns using structured tables and clean markdown visualizations.",
      enabled: false
    },
    {
      id: "tech_writer",
      name: "Technical Documentation Specialist",
      icon: "📝",
      category: "Docs",
      desc: "Crafts developer documentation, OpenAPI specs, GitHub READMEs, migration guides, and architecture diagrams.",
      prompt: "You are acting as a Staff Technical Writer. Craft crystal-clear, beautifully organized developer documentation. Use concise explanations, realistic copy-pasteable code examples, badges, and Mermaid architecture diagrams where helpful.",
      enabled: false
    },
    {
      id: "fast_prototyper",
      name: "Full-Stack Fast Prototyper",
      icon: "⚡",
      category: "Product",
      desc: "Quickly scaffolds working end-to-end frontend and backend code with modern UI components and complete boilerplate.",
      prompt: "You are acting as a Rapid Prototyping Specialist. Provide complete, executable, end-to-end implementations with minimal placeholders. Integrate modern styling, clean component boundaries, and sensible defaults so code runs immediately.",
      enabled: false
    }
  ];

  let skillsData = [];

  function initSkills() {
    try {
      const saved = localStorage.getItem("agentchat_skills");
      if (saved) {
        skillsData = JSON.parse(saved);
      } else {
        skillsData = [...DEFAULT_SKILLS];
      }
    } catch (e) {
      skillsData = [...DEFAULT_SKILLS];
    }
    updateSkillsStatusIndicator();
  }

  function saveSkills() {
    localStorage.setItem("agentchat_skills", JSON.stringify(skillsData));
    updateSkillsStatusIndicator();
  }

  function renderSkillsList() {
    if (!skillsList) return;
    skillsList.innerHTML = "";

    skillsData.forEach(skill => {
      const card = document.createElement("div");
      card.className = `skill-card ${skill.enabled ? 'active' : ''}`;

      const header = document.createElement("div");
      header.className = "skill-card-header";

      const titleWrap = document.createElement("div");
      titleWrap.className = "skill-title-wrap";
      titleWrap.innerHTML = `<span class="skill-icon">${skill.icon || '⚡'}</span><span class="skill-name">${skill.name}</span>`;

      const switchLabel = document.createElement("label");
      switchLabel.className = "skill-switch";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = !!skill.enabled;
      chk.onchange = () => toggleSkill(skill.id, chk.checked);
      const slider = document.createElement("span");
      slider.className = "switch-slider";
      switchLabel.appendChild(chk);
      switchLabel.appendChild(slider);

      header.appendChild(titleWrap);
      header.appendChild(switchLabel);

      const desc = document.createElement("div");
      desc.className = "skill-desc";
      desc.textContent = skill.desc || "";

      const footer = document.createElement("div");
      footer.className = "skill-footer";
      footer.innerHTML = `<span class="skill-tag">${skill.category || 'Skill'}</span>`;

      if (skill.custom) {
        const delBtn = document.createElement("button");
        delBtn.className = "btn-icon-xs";
        delBtn.innerHTML = "🗑️";
        delBtn.title = "Delete Custom Skill";
        delBtn.onclick = () => deleteCustomSkill(skill.id);
        footer.appendChild(delBtn);
      }

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(footer);
      skillsList.appendChild(card);
    });
  }

  function toggleSkill(skillId, enabled) {
    const s = skillsData.find(x => x.id === skillId);
    if (s) {
      s.enabled = enabled;
      saveSkills();
      renderSkillsList();
    }
  }

  function saveCustomSkill() {
    const name = (skillNameInput?.value || "").trim();
    const promptText = (skillPromptInput?.value || "").trim();
    if (!name || !promptText) {
      alert("Skill name and instructions are required.");
      return;
    }
    const id = "custom_" + Date.now();
    const newSkill = {
      id,
      name,
      icon: (skillIconInput?.value || "⚡").trim() || "⚡",
      category: (skillCategoryInput?.value || "Custom").trim() || "Custom",
      desc: (skillDescInput?.value || "").trim() || name,
      prompt: promptText,
      enabled: true,
      custom: true
    };
    skillsData.unshift(newSkill);
    saveSkills();
    createSkillModal.classList.add("hidden");
    skillNameInput.value = "";
    skillDescInput.value = "";
    skillPromptInput.value = "";
    renderSkillsList();
  }

  function deleteCustomSkill(skillId) {
    if (!confirm("Delete this custom skill?")) return;
    skillsData = skillsData.filter(x => x.id !== skillId);
    saveSkills();
    renderSkillsList();
  }

  function getActiveSkillsContext() {
    const active = skillsData.filter(s => s.enabled);
    if (!active.length) return "";
    return active.map(s => `[Skill Directive: ${s.name} (${s.category})]\n${s.prompt}`).join("\n\n");
  }

  function updateSkillsStatusIndicator() {
    const active = skillsData.filter(s => s.enabled);
    if (skillsStatusPill && skillsStatusText) {
      if (active.length > 0) {
        skillsStatusPill.classList.remove("hidden");
        skillsStatusText.textContent = `${active.length} Skill${active.length > 1 ? "s" : ""} Active`;
      } else {
        skillsStatusPill.classList.add("hidden");
      }
    }
  }


  // ==================== PROJECTS & CODEBASE MANAGER ====================
  let projectsData = {
    projects: {},
    active_project: "",
    include_context: true,
    current_tree: []
  };

  let previewingFilePath = "";

  async function fetchProjects() {
    try {
      const res = await apiFetch("/api/projects");
      const data = await res.json();
      if (data.projects) {
        projectsData.projects = data.projects;
        projectsData.active_project = data.active_project || Object.keys(data.projects)[0] || "";
      }
      updateProjectStatusIndicator();
      if (currentRailTab === "projects") renderProjectsPane();
    } catch (e) {
      console.warn("Failed to fetch projects:", e);
    }
  }

  async function scanProjectPath(targetPath) {
    if (projectScanStatus) {
      projectScanStatus.innerHTML = "⏳ Scanning directory structure and files...";
      projectScanStatus.style.color = "var(--md-sys-color-primary)";
    }

    try {
      const res = await apiFetch("/api/projects/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath })
      });
      const data = await res.json();
      if (data.success) {
        if (projectScanStatus) {
          projectScanStatus.innerHTML = `✅ Successfully indexed <strong>${data.project.total_files}</strong> files (${data.project.total_lines.toLocaleString()} lines of code)!`;
          projectScanStatus.style.color = "var(--success)";
        }
        projectsData.projects = data.saved_projects || {};
        projectsData.active_project = data.active_project;
        projectsData.current_tree = data.project.tree || [];
        updateProjectStatusIndicator();
        setTimeout(() => {
          importProjectModal.classList.add("hidden");
          renderProjectsPane();
        }, 1200);
      } else {
        if (projectScanStatus) {
          projectScanStatus.textContent = "❌ " + (data.error || "Failed to scan folder");
          projectScanStatus.style.color = "var(--md-sys-color-error)";
        }
      }
    } catch (err) {
      if (projectScanStatus) {
        projectScanStatus.textContent = "❌ " + err.message;
        projectScanStatus.style.color = "var(--md-sys-color-error)";
      }
    }
  }

  function handleFolderSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (projectScanStatus) {
      projectScanStatus.textContent = `Analyzing ${files.length} files from browser selection...`;
    }

    const techCounts = {};
    const tree = [];
    let totalLines = 0;
    const projName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "BrowserProject";

    files.forEach(f => {
      const relPath = f.webkitRelativePath || f.name;
      const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
      const tech = ext.toUpperCase().replace(".", "") || "File";
      techCounts[tech] = (techCounts[tech] || 0) + 1;

      if (tree.length < 300) {
        tree.push({
          path: relPath,
          name: f.name,
          size: f.size,
          ext: ext,
          tech: tech
        });
      }
    });

    const topTech = Object.keys(techCounts).slice(0, 5);
    projectsData.projects[projName] = {
      name: projName,
      path: "Browser Folder Selection",
      total_files: files.length,
      total_lines: 0,
      tech_stack: topTech,
      tree: tree
    };
    projectsData.active_project = projName;
    projectsData.current_tree = tree;

    updateProjectStatusIndicator();
    if (projectScanStatus) {
      projectScanStatus.innerHTML = `✅ Successfully imported <strong>${files.length}</strong> files!`;
      projectScanStatus.style.color = "var(--success)";
    }
    setTimeout(() => {
      importProjectModal.classList.add("hidden");
      renderProjectsPane();
    }, 1200);
  }

  function renderProjectsPane() {
    if (!projectActiveCard || !savedProjectsList) return;
    const activeName = projectsData.active_project;
    const activeProj = projectsData.projects?.[activeName];

    if (activeProj) {
      projectActiveCard.classList.remove("hidden");
      projectActiveCard.innerHTML = `
        <div class="project-card-top">
          <span class="project-name">📁 ${activeProj.name}</span>
          <button class="btn btn-tonal btn-xs" onclick="document.getElementById('import-project-modal').classList.remove('hidden')">Switch</button>
        </div>
        <div class="project-meta-row">
          <span>📄 ${activeProj.total_files || 0} Files</span>
          ${activeProj.total_lines ? `<span>📊 ${activeProj.total_lines.toLocaleString()} Lines</span>` : ''}
        </div>
        <div class="project-tech-pills">
          ${(activeProj.tech_stack || []).map(t => `<span class="tech-chip">${t}</span>`).join('')}
        </div>
        <div class="project-context-toggle">
          <span>Inject Codebase Architecture in Chat</span>
          <label class="skill-switch">
            <input type="checkbox" id="project-context-chk" ${projectsData.include_context ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
      `;

      const ctxChk = document.getElementById("project-context-chk");
      if (ctxChk) {
        ctxChk.onchange = () => {
          projectsData.include_context = ctxChk.checked;
        };
      }

      // Render file tree
      if (projectFilesSection) projectFilesSection.classList.remove("hidden");
      renderProjectFilesTree();
    } else {
      projectActiveCard.classList.remove("hidden");
      projectActiveCard.innerHTML = `
        <div style="text-align: center; padding: 16px 8px;">
          <div style="font-size: 24px; margin-bottom: 8px;">📂</div>
          <div style="font-weight: 600; font-size: 13px; color: var(--md-sys-color-on-surface); margin-bottom: 4px;">No Active Project</div>
          <div style="font-size: 11px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 12px;">Import your codebase to give the agent architectural awareness.</div>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('import-project-modal').classList.remove('hidden')">+ Import Project</button>
        </div>
      `;
      if (projectFilesSection) projectFilesSection.classList.add("hidden");
    }

    // Render Saved Projects
    savedProjectsList.innerHTML = "";
    const allProjs = Object.entries(projectsData.projects || {});
    if (allProjs.length > 1) {
      const title = document.createElement("div");
      title.className = "history-date-header";
      title.textContent = "SAVED WORKSPACES";
      savedProjectsList.appendChild(title);

      allProjs.forEach(([name, proj]) => {
        if (name === activeName) return;
        const item = document.createElement("div");
        item.className = "saved-project-item";
        item.innerHTML = `
          <div>
            <div style="font-weight:600; font-size:12px; color:var(--md-sys-color-on-surface);">📁 ${proj.name}</div>
            <div style="font-size:10.5px; color:var(--md-sys-color-outline);">${proj.total_files || 0} files • ${(proj.tech_stack || []).slice(0, 3).join(', ')}</div>
          </div>
          <button class="btn btn-tonal-tertiary btn-xs" onclick="selectActiveProject('${name}')">Select</button>
        `;
        savedProjectsList.appendChild(item);
      });
    }
  }

  window.selectActiveProject = async function(name) {
    projectsData.active_project = name;
    updateProjectStatusIndicator();
    renderProjectsPane();
    try {
      await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", project_name: name })
      });
    } catch (_) {}
  };

  function renderProjectFilesTree(filterQuery = "") {
    if (!projectTreeContainer) return;
    projectTreeContainer.innerHTML = "";
    const activeProj = projectsData.projects?.[projectsData.active_project];
    const tree = activeProj?.tree || projectsData.current_tree || [];

    const filtered = tree.filter(f => {
      if (!filterQuery) return true;
      return (f.path || f.name || "").toLowerCase().includes(filterQuery);
    });

    if (projectFileCountLabel) {
      projectFileCountLabel.textContent = `Files (${filtered.length})`;
    }

    if (!filtered.length) {
      projectTreeContainer.innerHTML = `<div style="padding:12px; font-size:11px; color:var(--text-muted); text-align:center;">No matching files found.</div>`;
      return;
    }

    filtered.slice(0, 150).forEach(file => {
      const item = document.createElement("div");
      item.className = "file-tree-item";
      item.onclick = () => previewProjectFile(file.path);

      let icon = "📄";
      const ext = file.ext || "";
      if (ext === ".py") icon = "🐍";
      else if ([".js", ".ts", ".jsx", ".tsx"].includes(ext)) icon = "📜";
      else if ([".html", ".css", ".scss"].includes(ext)) icon = "🌐";
      else if ([".json", ".yaml", ".yml"].includes(ext)) icon = "⚙️";
      else if (ext === ".md") icon = "📝";

      item.innerHTML = `
        <span class="file-tree-name"><span>${icon}</span> <span>${file.path}</span></span>
        ${file.lines ? `<span class="file-tree-lines">${file.lines}L</span>` : ''}
      `;
      projectTreeContainer.appendChild(item);
    });
  }

  async function previewProjectFile(filePath) {
    previewingFilePath = filePath;
    if (filePreviewTitle) filePreviewTitle.textContent = "📄 " + filePath;
    if (filePreviewCode) filePreviewCode.textContent = "Loading file content...";
    if (filePreviewModal) filePreviewModal.classList.remove("hidden");

    try {
      const res = await apiFetch(`/api/projects/file?file=${encodeURIComponent(filePath)}&project=${encodeURIComponent(projectsData.active_project)}`);
      const data = await res.json();
      if (data.success && filePreviewCode) {
        filePreviewCode.textContent = data.content || "[Empty file]";
      } else if (filePreviewCode) {
        filePreviewCode.textContent = "Error: " + (data.error || "Unable to read file.");
      }
    } catch (err) {
      if (filePreviewCode) filePreviewCode.textContent = "Error loading file: " + err.message;
    }
  }

  function insertFileIntoChat() {
    if (!filePreviewCode || !previewingFilePath) return;
    const content = filePreviewCode.textContent || "";
    currentAttachments.push({
      filename: previewingFilePath,
      text: content,
      isImage: false
    });
    renderAttachmentTray();
    if (filePreviewModal) filePreviewModal.classList.add("hidden");
    userInput.focus();
  }

  function getActiveProjectContext() {
    if (!projectsData.include_context) return "";
    const p = projectsData.projects?.[projectsData.active_project];
    if (!p) return "";

    const tree = p.tree || projectsData.current_tree || [];
    const fileList = tree.slice(0, 40).map(f => `- ${f.path} (${f.lines || 0} lines)`).join("\n");
    return `Project Name: ${p.name}\nTech Stack: ${(p.tech_stack || []).join(', ')}\nTotal Files: ${p.total_files || 0}\n\nCodebase Key Structure Outline:\n${fileList}`;
  }

  function updateProjectStatusIndicator() {
    if (projectStatusPill && projectStatusText) {
      const p = projectsData.projects?.[projectsData.active_project];
      if (p) {
        projectStatusPill.classList.remove("hidden");
        projectStatusText.textContent = `${p.name} (${p.total_files || 0} files)`;
      } else {
        projectStatusPill.classList.add("hidden");
      }
    }
  }


  // ==================== LIVE PROVIDER CREDITS MANAGER ====================
  let isFetchingCredits = false;
  async function fetchCredits(manual = false) {
    if (!creditsPill || !creditsAmount) return;
    if (isFetchingCredits) return;
    isFetchingCredits = true;

    if (manual && creditsRefreshBtn) {
      creditsRefreshBtn.classList.add("spinning");
    }

    try {
      const res = await apiFetch("/api/credits");
      const data = await res.json();
      if (data.success) {
        creditsAmount.textContent = data.formatted || "Active";
        const prov = data.provider || "Provider";
        const note = data.pool_note ? ` • ${data.pool_note}` : "";
        creditsPill.title = `${prov}: ${data.formatted}${note} (Click to refresh)`;
      } else {
        creditsAmount.textContent = "Active";
      }
    } catch (err) {
      console.warn("Credits fetch failed:", err);
      creditsAmount.textContent = "Online";
    } finally {
      isFetchingCredits = false;
      if (creditsRefreshBtn) {
        setTimeout(() => creditsRefreshBtn.classList.remove("spinning"), 600);
      }
    }
  }

  // Initialize application after all declarations, constants, and functions are loaded
  init();
})();
