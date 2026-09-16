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
    "claude-3-opus-20240229": "🎭 Claude 3 Opus (Anthropic Flagship)",
    "claude-3-opus": "🎭 Claude 3 Opus (Anthropic)",
    "claude-3-5-sonnet-20241022": "⚡ Claude 3.5 Sonnet (Anthropic)",
    "claude-3-5-sonnet": "⚡ Claude 3.5 Sonnet (Anthropic)",
    "claude-3-5-haiku-20241022": "🪶 Claude 3.5 Haiku (Anthropic)",
    "claude-3-5-haiku": "🪶 Claude 3.5 Haiku (Anthropic)",
    "deepseek/deepseek-r1": "🧠 DeepSeek R1 (671B Reasoning)",
    "qwen/qwen-2.5-coder-72b-instruct": "💻 Qwen 2.5 Coder 72B (Elite Code)",
    "deepseek/deepseek-chat": "⚡ DeepSeek V3 (671B Nuance)",
    "google/gemini-2.0-flash-001": "🌐 Gemini 2.0 Flash (Fast / 1M)",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini-2.0-flash-thinking-exp-01-21": "Gemini 2.0 Flash Thinking",
    "gemini-2.0-pro-exp-02-05": "Gemini 2.0 Pro",
    "openai/gpt-4o": "✨ GPT-4o (OpenAI Omni)",
    "gpt-4o": "✨ GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "openai/o1-preview": "🧩 OpenAI o1-preview",
    "openai/o3-mini": "🚀 OpenAI o3-mini"
  };

  const PROVIDER_DEFAULTS = {
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
      name: "Custom Stealth Proxy (AgentRouter, Anthropic, Proxies)",
      base_url: "https://agentrouter.org/"
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
  const settingTemp = document.getElementById("setting-temp");
  const tempDisplay = document.getElementById("temp-display");
  const settingSystemPrompt = document.getElementById("setting-system-prompt");
  const toggleKeyVisibility = document.getElementById("toggle-key-visibility");
  const settingSavedKeysSelect = document.getElementById("setting-saved-keys-select");
  const settingKeyAlias = document.getElementById("setting-key-alias");
  const saveKeyToVaultBtn = document.getElementById("save-key-to-vault-btn");
  const deleteCurrentKeyBtn = document.getElementById("delete-current-key-btn");

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

  // Account Modal Elements
  const accountModal = document.getElementById("account-modal");
  const closeAccountModalBtn = document.getElementById("close-account-modal-btn");
  const accountModalDoneBtn = document.getElementById("account-modal-done-btn");
  const accountLargeAvatar = document.getElementById("account-large-avatar");
  const accountDisplayNameHeader = document.getElementById("account-display-name-header");
  const accountProviderBadge = document.getElementById("account-provider-badge");
  const accountNameInput = document.getElementById("account-name-input");
  const saveAccountNameBtn = document.getElementById("save-account-name-btn");
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
    const activeP = currentConfig.active_provider || "base";
    const clientKey = localStorage.getItem("agentchat_client_key_" + activeP) || "";
    if (clientKey && !clientKey.includes("...") && !clientKey.includes("•••") && !clientKey.includes("••••")) {
      headers["X-Custom-Api-Key"] = clientKey;
    }
    const clientUrl = localStorage.getItem("agentchat_client_url_" + activeP) || "";
    if (clientUrl) headers["X-Custom-Base-Url"] = clientUrl;
    return headers;
  }

  async function apiFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers = getAuthHeaders(options.headers);
    let res = await fetch(url, options);
    if (res.status === 401) {
      try {
        const data = await res.clone().json();
        if (data.need_auth) {
          const entered = prompt("🔒 This AgentChat deployment is password-protected.\nPlease enter the Access Password:");
          if (entered) {
            localStorage.setItem("agentchat_access_password", entered.trim());
            options.headers["X-Access-Password"] = entered.trim();
            res = await fetch(url, options);
          }
        }
      } catch (e) {}
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
    railTabChats.addEventListener("click", () => switchToRailTab("chats"));
    railTabModels.addEventListener("click", () => switchToRailTab("models"));
    if (railTabSkills) railTabSkills.addEventListener("click", () => switchToRailTab("skills"));
    if (railTabProjects) railTabProjects.addEventListener("click", () => switchToRailTab("projects"));
    railTabMcp.addEventListener("click", () => switchToRailTab("mcp"));
    railTabSettings.addEventListener("click", () => {
      syncSettingsModalWithConfig();
      settingsModal.classList.remove("hidden");
    });

    // History Actions (Export / Clear)
    if (exportAllChatsBtn) exportAllChatsBtn.addEventListener("click", exportAllChatsJSON);
    const clearAllBtn = document.getElementById("clear-all-chats-btn");
    if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllChats);

    // Skills Modal Events
    if (openAddSkillBtn) openAddSkillBtn.addEventListener("click", () => createSkillModal.classList.remove("hidden"));
    if (closeSkillModalBtn) closeSkillModalBtn.addEventListener("click", () => createSkillModal.classList.add("hidden"));
    if (createSkillModal) {
      createSkillModal.addEventListener("click", (e) => {
        if (e.target === createSkillModal) createSkillModal.classList.add("hidden");
      });
    }
    if (saveSkillBtn) saveSkillBtn.addEventListener("click", saveCustomSkill);

    // Projects Modal Events
    if (openImportProjectBtn) openImportProjectBtn.addEventListener("click", () => {
      importProjectModal.classList.remove("hidden");
      if (projectScanStatus) projectScanStatus.textContent = "";
    });
    if (closeImportProjectBtn) closeImportProjectBtn.addEventListener("click", () => importProjectModal.classList.add("hidden"));
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
    if (closeFilePreviewBtn) closeFilePreviewBtn.addEventListener("click", () => filePreviewModal.classList.add("hidden"));
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
    toggleSidebarBtn.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        document.body.classList.toggle("sidebar-mobile-open");
      } else {
        subSidebar.classList.toggle("collapsed");
      }
    });

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => {
        document.body.classList.remove("sidebar-mobile-open");
      });
    }

    // Chat Search
    chatSearchInput.addEventListener("input", (e) => {
      renderSidebar(e.target.value.trim().toLowerCase());
    });

    // Input Handling - Instant Single-Tap Enter to Send
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

    // Global shortcut: pressing Enter when not inside another input or open modal automatically focuses the chat input
    window.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
        const active = document.activeElement;
        const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable);
        if (!isInput && !document.querySelector(".modal-overlay:not(.hidden)")) {
          e.preventDefault();
          userInput.focus();
        }
      }
    });

    sendBtn.addEventListener("click", sendMessage);
    stopBtn.addEventListener("click", stopGeneration);
    newChatBtn.addEventListener("click", createNewChat);

    // Web Search
    websearchToggleBtn.addEventListener("click", () => {
      webSearchEnabled = !webSearchEnabled;
      if (webSearchEnabled) {
        websearchToggleBtn.classList.add("active");
        websearchToggleBtn.querySelector("span").textContent = "Search: ON";
      } else {
        websearchToggleBtn.classList.remove("active");
        websearchToggleBtn.querySelector("span").textContent = "Search: OFF";
      }
      updateToolsIndicator();
    });

    // Attachments
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileSelect);

    // Provider Dropdown
    providerSelect.addEventListener("change", (e) => switchProvider(e.target.value));

    // MCP Modal
    openAddMcpBtn.addEventListener("click", () => addMcpModal.classList.remove("hidden"));
    closeMcpModalBtn.addEventListener("click", () => addMcpModal.classList.add("hidden"));
    addMcpModal.addEventListener("click", (e) => {
      if (e.target === addMcpModal) addMcpModal.classList.add("hidden");
    });

    testMcpBtn.addEventListener("click", testMcpConnection);
    saveMcpServerBtn.addEventListener("click", saveMcpServer);

    // Settings Modal
    closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) settingsModal.classList.add("hidden");
    });

    settingProviderChoice.addEventListener("change", (e) => populateProviderFields(e.target.value));

    settingTemp.addEventListener("input", (e) => {
      tempDisplay.textContent = e.target.value;
    });

    toggleKeyVisibility.addEventListener("click", () => {
      if (settingApiKey.type === "password") {
        settingApiKey.type = "text";
        toggleKeyVisibility.textContent = "Hide";
      } else {
        settingApiKey.type = "password";
        toggleKeyVisibility.textContent = "Show";
      }
    });

    saveSettingsBtn.addEventListener("click", saveConfig);

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
        localStorage.setItem("agentchat_active_model", modelSelect.value);
        if (currentUser) {
          syncUserProfileToCloud();
        }
      });
    }
  }

  // Rail Tab Switching
  window.switchToRailTab = function(tabName) {
    currentRailTab = tabName;
    [railTabChats, railTabModels, railTabSkills, railTabProjects, railTabMcp].filter(Boolean).forEach(b => b.classList.remove("active"));
    [paneChats, paneModels, paneSkills, paneProjects, paneMcp].filter(Boolean).forEach(p => p.classList.add("hidden"));

    if (tabName === "chats") {
      railTabChats.classList.add("active");
      paneChats.classList.remove("hidden");
      renderSidebar();
    } else if (tabName === "models") {
      railTabModels.classList.add("active");
      paneModels.classList.remove("hidden");
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
      railTabMcp.classList.add("active");
      paneMcp.classList.remove("hidden");
      renderMcpList();
    }

    if (subSidebar.classList.contains("collapsed")) {
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

  // File Attachments
  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      const ext = file.name.split(".").pop().toLowerCase();
      const isPdf = ext === "pdf";
      const isImg = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);

      if (isPdf) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(",")[1];
          try {
            const res = await apiFetch("/api/parse_file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: file.name, base64 })
            });
            const data = await res.json();
            if (data.success) {
              currentAttachments.push({ filename: file.name, text: data.text, isImage: false });
              renderAttachmentTray();
            }
          } catch (err) {
            alert("Error parsing PDF: " + err.message);
          }
        };
        reader.readAsDataURL(file);
      } else if (isImg) {
        const reader = new FileReader();
        reader.onload = () => {
          currentAttachments.push({
            filename: file.name,
            text: `[Image Attached: ${file.name}]`,
            isImage: true,
            dataUrl: reader.result
          });
          renderAttachmentTray();
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          currentAttachments.push({ filename: file.name, text: reader.result, isImage: false });
          renderAttachmentTray();
        };
        reader.readAsText(file);
      }
    }
    fileInput.value = "";
  }

  function renderAttachmentTray() {
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
        icon.textContent = att.filename.endsWith(".pdf") ? "📄" : "📝";
        chip.appendChild(icon);
      }
      const name = document.createElement("span");
      name.className = "attachment-chip-name";
      name.textContent = att.filename;
      chip.appendChild(name);

      const delBtn = document.createElement("button");
      delBtn.className = "attachment-chip-remove";
      delBtn.innerHTML = "&times;";
      delBtn.onclick = () => { currentAttachments.splice(idx, 1); renderAttachmentTray(); };
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

  function saveSessions() {
    localStorage.setItem("agentchat_sessions", JSON.stringify(sessions));
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
      md += `${m.content}\n\n---\n\n`;
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
      return (s.messages || []).some(m => (m.content || "").toLowerCase().includes(query));
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
          snippet.textContent = prefix + lastMsg.content.slice(0, 46).replace(/\n/g, " ") + (lastMsg.content.length > 46 ? "..." : "");
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
      appendMessageToDOM(msg.role, msg.content, msg.reasoning, false);
    });
    scrollToBottom();
  }

  function appendMessageToDOM(role, content, reasoning, isStreaming = false) {
    welcomeScreen.classList.add("hidden");
    const row = document.createElement("div");
    row.className = `message-row ${role} ${role}-row`;
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${role}-bubble`;

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
    bubble.appendChild(textDiv);

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
    const text = userInput.value.trim();
    if ((!text && !currentAttachments.length) || isGenerating) return;

    let session = getCurrentSession();
    if (!session) {
      createNewChat();
      session = getCurrentSession();
    }
    if (!session) return;

    let finalPrompt = text;
    if (currentAttachments.length) {
      const docsContext = currentAttachments
        .map(a => `[Attached ${a.isImage ? "Image" : "Document"}: ${a.filename}]\n${a.text}\n[End of ${a.filename}]`)
        .join("\n\n");
      finalPrompt = docsContext + (text ? "\n\n" + text : "");
    }

    session.messages.push({ role: "user", content: finalPrompt });
    if (session.messages.length === 1) {
      const displayTitle = text || currentAttachments[0]?.filename || "Document Analysis";
      session.title = displayTitle.slice(0, 28) + (displayTitle.length > 28 ? "..." : "");
    }
    saveSessions();

    appendMessageToDOM("user", finalPrompt);
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

    try {
      const selectedModel = modelSelect.value;
      let selectedEffort = effortSelect.value || "medium";
      // Auto-adapt for GLM models (GLM-5.3 only supports low, high, max; medium is rejected)
      if (selectedModel && selectedModel.toLowerCase().includes("glm") && selectedEffort === "medium") {
        selectedEffort = "high";
      }

      // Prune previous reasoning to save 75% tokens
      const historyToSend = session.messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: activeAbortController.signal,
        body: JSON.stringify({
          model: selectedModel,
          reasoning_effort: selectedEffort,
          web_search: webSearchEnabled,
          auto_compress: currentConfig.auto_compress !== false,
          messages: historyToSend,
          temperature: parseFloat(settingTemp.value) || 0.7,
          system_prompt: settingSystemPrompt.value.trim(),
          skills_context: getActiveSkillsContext(),
          project_context: getActiveProjectContext(),
          persona_directives: localStorage.getItem("agentchat_developer_persona") || ""
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

          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.error) {
                bubble.classList.add("error-bubble");
                let errMsg = typeof data.error === "string" ? data.error : (data.error.message || JSON.stringify(data.error));
                const errType = typeof data.error === "object" ? (data.error.type || "") : "";

                // Translate known upstream error patterns into friendly messages
                if (errMsg.includes("content-blocked") || errType.includes("content-blocked") || errMsg.includes("content_filter")) {
                  errMsg = `⚠️ Content was blocked by the upstream provider's safety filter for '${selectedModel}'. Try rephrasing your message or switching to a different model.`;
                } else if (errMsg.includes("始终思考") || errMsg.includes("不支持关闭思考") || errMsg.includes("请使用 low") || errMsg.includes("1210")) {
                  errMsg = `⚠️ Reasoning Model Notice: '${selectedModel}' is a compulsory reasoning model that requires effort level 'low', 'high', or 'max'. Setting effort to 'High' resolves this.`;
                } else if (errMsg.includes("exhausted") || errMsg.includes("budget pool") || errMsg.includes("Budget pool")) {
                  errMsg = `⚠️ Quota Notice: The budget/quota pool for '${selectedModel}' is currently exhausted on the upstream provider. Please try again later or switch your API key in Vault.`;
                  modelStatuses[selectedModel] = { status: "exhausted", code: 402, message: "Quota exhausted" };
                  updateModelDropdownOptions();
                }

                textDiv.innerHTML = `${errMsg}<br><br><button class="btn btn-tonal-tertiary btn-xs" onclick="syncSettingsModalWithConfig(); settingsModal.classList.remove('hidden');" style="cursor:pointer; margin-top:6px;">🔑 Switch API Key in Vault</button>`;
                assistantMsg.content = errMsg;
                try { reader.cancel().catch(() => {}); } catch (_) {}
                break streamLoop;
              }

              const delta = data.choices?.[0]?.delta || {};
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
        textDiv.innerHTML = `Error: ${err.message}<br><br><button class="btn btn-tonal-tertiary btn-xs" onclick="syncSettingsModalWithConfig(); settingsModal.classList.remove('hidden');" style="cursor:pointer; margin-top:6px;">🔑 Switch API Key in Vault</button>`;
        assistantMsg.content = `Error: ${err.message}`;
      }
    } finally {
      activeAbortController = null;
      setGeneratingState(false);
      saveSessions();
      userInput.focus();
    }
  }

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
    html = html.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const codeId = "code_" + Math.random().toString(36).substr(2, 9);
      return `<pre><div class="code-header"><span>${lang || "CODE"}</span><button class="code-copy-btn" onclick="copyCode('${codeId}')">Copy</button></div><code id="${codeId}">${code.trim()}</code></pre>`;
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
    if (profile.active_provider) {
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
    if (googleConnectModal) {
      googleConnectModal.classList.remove("hidden");
      initGoogleGsi();
      if (googleEmailInput) googleEmailInput.focus();
    }
  }

  function closeGoogleConnectModal() {
    if (googleConnectModal) googleConnectModal.classList.add("hidden");
  }

  function initGoogleGsi() {
    if (window.google && window.google.accounts && window.google.accounts.id && googleGsiButtonContainer) {
      try {
        googleGsiButtonContainer.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: "agentchat-identity-service",
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
  }

  async function handleGoogleGsiResponse(response) {
    if (!response || !response.credential) return;
    await submitSocialAuth({
      provider: "google",
      credential: response.credential
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

    if (currentUser) {
      if (accountDisplayNameHeader) accountDisplayNameHeader.textContent = currentUser.name || currentUser.email.split("@")[0];
      if (accountProviderBadge) {
        accountProviderBadge.textContent = currentUser.auth_provider ? (currentUser.auth_provider.toUpperCase() + " VERIFIED") : "VERIFIED USER";
        accountProviderBadge.style.display = "inline-block";
      }
      if (accountNameInput) accountNameInput.value = currentUser.name || "";
      if (accountEmailDisplay) accountEmailDisplay.textContent = currentUser.email || "";
      if (accountAvatarInput) accountAvatarInput.value = currentUser.avatar_url || "";
      if (accountJoinedMeta) {
        const d = currentUser.created_at ? new Date(currentUser.created_at * 1000) : new Date();
        accountJoinedMeta.textContent = `Member since ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
      }
      if (accountLargeAvatar) {
        if (currentUser.avatar_url && (currentUser.avatar_url.startsWith("http") || currentUser.avatar_url.startsWith("data:image"))) {
          accountLargeAvatar.innerHTML = `<img src="${currentUser.avatar_url}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
          accountLargeAvatar.textContent = (currentUser.name || currentUser.email || "U").charAt(0).toUpperCase();
        }
      }
    } else {
      if (accountDisplayNameHeader) accountDisplayNameHeader.textContent = "Guest User (Not Logged In)";
      if (accountProviderBadge) {
        accountProviderBadge.textContent = "LOCAL GUEST";
        accountProviderBadge.style.display = "inline-block";
      }
      if (accountNameInput) accountNameInput.value = "Guest";
      if (accountEmailDisplay) accountEmailDisplay.textContent = "Local Session (Keys stored in browser)";
      if (accountAvatarInput) accountAvatarInput.value = "";
      if (accountJoinedMeta) accountJoinedMeta.textContent = "Ephemeral Browser Session";
      if (accountLargeAvatar) accountLargeAvatar.textContent = "G";
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
    if (!currentUser) {
      alert("Sign in to save your profile to the cloud.");
      return;
    }

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

  // Provider Switching
  async function switchProvider(provKey) {
    currentConfig.active_provider = provKey;
    localStorage.setItem("agentchat_active_provider", provKey);
    providerSelect.value = provKey;
    if (settingProviderChoice) settingProviderChoice.value = provKey;
    populateProviderFields(provKey);
    await saveConfig(false);
    await fetchModels();
    updateBannerStatus();
    if (currentUser) {
      syncUserProfileToCloud();
    }
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
    settingBaseUrl.value = prov.base_url || defaultUrl;
    renderKeyVaultOptions(provKey);
  }

  function syncSettingsModalWithConfig() {
    const active = currentConfig.active_provider || "base";
    settingProviderChoice.value = active;
    populateProviderFields(active);
    settingAutoCompress.checked = currentConfig.auto_compress !== false;
    settingTemp.value = currentConfig.temperature || 0.7;
    tempDisplay.textContent = settingTemp.value;
    settingSystemPrompt.value = currentConfig.system_prompt || "";
    if (settingProtocolMode) {
      settingProtocolMode.value = currentConfig.protocol_mode || "stealth_auto";
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
        if (savedProvider && (savedProvider in PROVIDER_DEFAULTS || savedProvider === "custom")) {
          currentConfig.active_provider = savedProvider;
        }
        const savedModel = localStorage.getItem("agentchat_active_model");
        if (savedModel) {
          currentConfig.model = savedModel;
        }
      }

      // Restore client keys & URLs into currentConfig
      Object.keys(PROVIDER_DEFAULTS).forEach(pKey => {
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

      if (currentConfig.active_provider) {
        providerSelect.value = currentConfig.active_provider;
      }
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
    currentConfig.temperature = parseFloat(settingTemp.value) || 0.7;
    currentConfig.system_prompt = settingSystemPrompt.value.trim();
    currentConfig.model = modelSelect.value;
    if (settingProtocolMode) {
      currentConfig.protocol_mode = settingProtocolMode.value;
      localStorage.setItem("agentchat_protocol_mode", settingProtocolMode.value);
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
      providerSelect.value = activeP;
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

        allModels.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.id;
          const st = modelStatuses[m.id]?.status || m.status || "online";
          const displayName = MODEL_DISPLAY_NAMES[m.id] || m.name || m.id;
          if (st === "online") opt.textContent = `🟢 ${displayName}`;
          else if (st === "exhausted") opt.textContent = `🔴 ${displayName} (Quota Limit)`;
          else opt.textContent = `⚪ ${displayName}`;
          modelSelect.appendChild(opt);
        });

        const customPromptOpt = document.createElement("option");
        customPromptOpt.value = "__custom_entry__";
        customPromptOpt.textContent = "➕ Enter Custom Model ID...";
        modelSelect.appendChild(customPromptOpt);

        if (cur && Array.from(modelSelect.options).some(o => o.value === cur)) {
          modelSelect.value = cur;
        } else {
          modelSelect.value = allModels[0].id;
        }
        localStorage.setItem("agentchat_active_model", modelSelect.value);
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
