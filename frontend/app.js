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
    "claude-opus-5": "Claude Opus 5",
    "claude-opus-4-8": "Claude Opus 4.8",
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "glm-5.3": "GLM 5.3",
    "gpt-6-astra": "GPT-6 Astra",
    "gpt-5.6-sol": "GPT-5.6 Sol"
  };

  // Model Benchmark Database
  const MODEL_DATABASE = [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      provider: "DeepSeek",
      overall: 96,
      coding: 99,
      speed: 98,
      efficiency: 99,
      desc: "World-class reasoning with native Chain-of-Thought. Unmatched for coding and math.",
      tags: ["#1 Coding", "Fast CoT"]
    },
    {
      id: "claude-opus-5",
      name: "Claude Opus 5",
      provider: "Anthropic",
      overall: 99,
      coding: 97,
      speed: 70,
      efficiency: 72,
      desc: "Anthropic's flagship model. Extreme nuance, instruction adherence and system architecture.",
      tags: ["#1 Intelligence", "Nuance"]
    },
    {
      id: "gpt-6-astra",
      name: "GPT-6 Astra",
      provider: "OpenAI",
      overall: 98,
      coding: 97,
      speed: 78,
      efficiency: 75,
      desc: "Next-gen OpenAI model with broad multi-domain knowledge and rapid synthesis.",
      tags: ["Generalist", "Frontier"]
    },
    {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      provider: "Anthropic",
      overall: 97,
      coding: 98,
      speed: 74,
      efficiency: 76,
      desc: "High-precision architecture design, structured writing and refactoring.",
      tags: ["Elite Coder", "Refactor"]
    },
    {
      id: "glm-5.3",
      name: "GLM 5.3",
      provider: "Zhipu AI",
      overall: 95,
      coding: 94,
      speed: 92,
      efficiency: 94,
      desc: "Fast, versatile bilingual and multilingual reasoning powerhouse.",
      tags: ["High Throughput", "Versatile"]
    },
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      provider: "OpenAI",
      overall: 94,
      coding: 93,
      speed: 85,
      efficiency: 84,
      desc: "Balanced generalist model for daily automation and rapid problem solving.",
      tags: ["Productivity", "Fast"]
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

  // Navigation Rail Tabs
  const railTabChats = document.getElementById("rail-tab-chats");
  const railTabModels = document.getElementById("rail-tab-models");
  const railTabMcp = document.getElementById("rail-tab-mcp");
  const railTabSettings = document.getElementById("rail-tab-settings");

  // Secondary Panes
  const paneChats = document.getElementById("pane-chats");
  const paneModels = document.getElementById("pane-models");
  const paneMcp = document.getElementById("pane-mcp");
  const modelsMiniList = document.getElementById("models-mini-list");
  const mcpServersList = document.getElementById("mcp-servers-list");

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

  // Auth & Zero-Knowledge API Wrapper
  function getAuthHeaders(extra = {}) {
    const headers = { ...extra };
    const pw = localStorage.getItem("agentchat_access_password") || "";
    if (pw) headers["X-Access-Password"] = pw;
    const activeP = currentConfig.active_provider || "agentrouter";
    const clientKey = localStorage.getItem("agentchat_client_key_" + activeP);
    if (clientKey) headers["X-Custom-Api-Key"] = clientKey;
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

  // Initialize
  init();

  function init() {
    loadSessions();
    setupEventListeners();
    fetchConfig();
    fetchModels();
    fetchModelStatus();
    fetchMcp();
    // Poll status every 20 minutes (1,200,000 ms) instead of every 60 seconds
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
    railTabMcp.addEventListener("click", () => switchToRailTab("mcp"));
    railTabSettings.addEventListener("click", () => {
      syncSettingsModalWithConfig();
      settingsModal.classList.remove("hidden");
    });

    // Sidebar Toggle
    toggleSidebarBtn.addEventListener("click", () => {
      subSidebar.classList.toggle("collapsed");
    });

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

    // Probe button in sidebar
    const sideProbeBtn = document.getElementById("sidebar-probe-btn");
    if (sideProbeBtn) sideProbeBtn.addEventListener("click", triggerActiveProbe);
  }

  // Rail Tab Switching
  window.switchToRailTab = function(tabName) {
    currentRailTab = tabName;
    [railTabChats, railTabModels, railTabMcp].forEach(b => b.classList.remove("active"));
    [paneChats, paneModels, paneMcp].forEach(p => p.classList.add("hidden"));

    if (tabName === "chats") {
      railTabChats.classList.add("active");
      paneChats.classList.remove("hidden");
      renderSidebar();
    } else if (tabName === "models") {
      railTabModels.classList.add("active");
      paneModels.classList.remove("hidden");
      renderModelsMiniList("all");
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
  async function triggerActiveProbe() {
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
      const cleanName = MODEL_DISPLAY_NAMES[mid] || opt.textContent.replace(/^[🟢🔴⚪]\s*/, "").replace(/\s*\(.*\)$/, "").trim();

      if (st === "online") opt.textContent = `🟢 ${cleanName} (Online)`;
      else if (st === "exhausted") opt.textContent = `🔴 ${cleanName} (Quota Exhausted)`;
      else opt.textContent = `⚪ ${cleanName}`;
    });
    if (cur) modelSelect.value = cur;
  }

  function updateBannerStatus() {
    const banner = document.getElementById("live-status-banner");
    if (!banner) return;
    const deepseekOk = modelStatuses["deepseek-v4-flash"]?.status === "online";
    const glmOk = modelStatuses["glm-5.3"]?.status === "online";
    const claudeOk = modelStatuses["claude-opus-4-8"]?.status === "online" || modelStatuses["claude-opus-5"]?.status === "online";
    const gptOk = modelStatuses["gpt-6-astra"]?.status === "online";

    banner.innerHTML = `
      <span class="banner-title">📡 Live Availability:</span>
      <span class="pill ${deepseekOk ? 'pill-green' : 'pill-red'}">${deepseekOk ? '🟢 DeepSeek Online' : '🔴 DeepSeek Offline'}</span>
      <span class="pill ${glmOk ? 'pill-green' : 'pill-red'}">${glmOk ? '🟢 GLM 5.3 Online' : '🔴 GLM 5.3 Offline'}</span>
      <span class="pill ${claudeOk ? 'pill-green' : 'pill-red'}">${claudeOk ? '🟢 Claude Online!' : '🔴 Claude Quota Exhausted'}</span>
      <span class="pill ${gptOk ? 'pill-green' : 'pill-red'}">${gptOk ? '🟢 GPT-6 Online!' : '🔴 GPT-6 Quota Exhausted'}</span>
      <button id="banner-check-btn" class="banner-refresh-btn" onclick="triggerActiveProbe()">↻ Check Now</button>
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
  }

  function deleteChat(sessionId, event) {
    if (event) event.stopPropagation();
    sessions = sessions.filter(s => s.id !== sessionId);
    if (!sessions.length) createNewChat();
    else if (currentSessionId === sessionId) switchChat(sessions[0].id);
    else saveSessions();
  }

  function renderSidebar(searchQuery = "") {
    chatList.innerHTML = "";
    const filtered = sessions.filter(s => {
      if (!searchQuery) return true;
      return (s.title || "").toLowerCase().includes(searchQuery);
    });

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.style.padding = "14px";
      empty.style.fontSize = "12px";
      empty.style.color = "var(--text-muted)";
      empty.textContent = searchQuery ? "No matching conversations found." : "No conversations yet.";
      chatList.appendChild(empty);
      return;
    }

    filtered.forEach(session => {
      const item = document.createElement("div");
      item.className = `chat-item ${session.id === currentSessionId ? "active" : ""}`;
      item.onclick = () => switchChat(session.id);

      const title = document.createElement("span");
      title.className = "chat-item-title";
      title.textContent = session.title || "New Chat";

      const delBtn = document.createElement("button");
      delBtn.className = "chat-item-delete";
      delBtn.innerHTML = "&times;";
      delBtn.title = "Delete Conversation";
      delBtn.onclick = (e) => deleteChat(session.id, e);

      item.appendChild(title);
      item.appendChild(delBtn);
      chatList.appendChild(item);
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
    row.className = `message-row ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (reasoning) {
      const details = document.createElement("details");
      details.className = "reasoning-box";
      details.open = isStreaming;

      const summary = document.createElement("summary");
      summary.textContent = isStreaming ? "Thinking Process..." : "Thought Process";

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
      const selectedEffort = effortSelect.value || "medium";

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
          system_prompt: settingSystemPrompt.value.trim()
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("data: [DONE]")) break;
          if (trimmed.startsWith("event: error")) continue;

          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.error) {
                bubble.classList.add("error-bubble");
                textDiv.textContent = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
                assistantMsg.content = textDiv.textContent;
                break;
              }

              const delta = data.choices?.[0]?.delta || {};
              if (delta.reasoning_content) {
                assistantMsg.reasoning += delta.reasoning_content;
                if (!reasoningContainer) {
                  reasoningContainer = document.createElement("details");
                  reasoningContainer.className = "reasoning-box";
                  reasoningContainer.open = true;
                  const summary = document.createElement("summary");
                  summary.textContent = "Thinking Process...";
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
            } catch (err) {}
          }
        }
      }

      if (reasoningContainer) {
        const summary = reasoningContainer.querySelector("summary");
        if (summary) summary.textContent = "Thought Process";
      }

    } catch (err) {
      if (err.name !== "AbortError") {
        bubble.classList.add("error-bubble");
        textDiv.textContent = `Error: ${err.message}`;
        assistantMsg.content = textDiv.textContent;
      }
    } finally {
      setGeneratingState(false);
      saveSessions();
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

  // Provider Switching
  async function switchProvider(provKey) {
    currentConfig.active_provider = provKey;
    providerSelect.value = provKey;
    await saveConfig(false);
    fetchModels();
    triggerActiveProbe();
  }

  function populateProviderFields(provKey) {
    const prov = currentConfig.providers?.[provKey] || {};
    settingApiKey.value = prov.api_key || "";
    settingBaseUrl.value = prov.base_url || "";
  }

  function syncSettingsModalWithConfig() {
    const active = currentConfig.active_provider || "agentrouter";
    settingProviderChoice.value = active;
    populateProviderFields(active);
    settingAutoCompress.checked = currentConfig.auto_compress !== false;
    settingTemp.value = currentConfig.temperature || 0.7;
    tempDisplay.textContent = settingTemp.value;
    settingSystemPrompt.value = currentConfig.system_prompt || "";
  }

  async function fetchConfig() {
    try {
      const res = await apiFetch("/api/config");
      currentConfig = await res.json();
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

    currentConfig.providers[activeP].api_key = settingApiKey.value.trim();
    currentConfig.providers[activeP].base_url = settingBaseUrl.value.trim();
    currentConfig.active_provider = activeP;
    currentConfig.auto_compress = settingAutoCompress.checked;
    currentConfig.temperature = parseFloat(settingTemp.value) || 0.7;
    currentConfig.system_prompt = settingSystemPrompt.value.trim();
    currentConfig.model = modelSelect.value;

    try {
      await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentConfig)
      });
      if (closeModal) settingsModal.classList.add("hidden");
      providerSelect.value = activeP;
    } catch (e) {
      if (closeModal) alert("Failed to save settings: " + e.message);
    }
  }

  async function fetchModels() {
    try {
      const res = await apiFetch("/api/models");
      const data = await res.json();
      if (data.models && data.models.length) {
        const cur = modelSelect.value;
        modelSelect.innerHTML = "";
        data.models.forEach(m => {
          const opt = document.createElement("option");
          opt.value = m.id;
          const st = modelStatuses[m.id]?.status || m.status || "online";
          const displayName = MODEL_DISPLAY_NAMES[m.id] || m.name || m.id;
          if (st === "online") opt.textContent = `🟢 ${displayName} (Online)`;
          else if (st === "exhausted") opt.textContent = `🔴 ${displayName} (Quota Exhausted)`;
          else opt.textContent = `⚪ ${displayName}`;
          modelSelect.appendChild(opt);
        });
        if (cur && Array.from(modelSelect.options).some(o => o.value === cur)) {
          modelSelect.value = cur;
        } else {
          modelSelect.value = "claude-opus-5";
        }
      }
    } catch (e) {
      console.warn("Failed to fetch models:", e);
    }
  }

})();
