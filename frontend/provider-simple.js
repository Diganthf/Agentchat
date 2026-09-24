/* ==========================================================================
   AgentChat — simplified provider UI (single "Custom Proxy" + free models)
   - Hides the long proxy dropdown from the top bar.
   - Adds ONE "Custom Proxy" button + a label showing the active proxy's name
     (top-left, where the proxy pill was).
   - The button opens a small modal (name / base URL / API key). On save it
     writes the SAME localStorage keys app.js already uses, sets the proxy as the
     default, and reloads so app.js restores it — so it persists across restarts.
   Additive + self-contained. Remove the <script> tag to revert to the old list.
   ========================================================================== */
(function () {
  "use strict";

  var ACTIVE = "agentchat_active_provider";
  var PROXIES = "agentchat_custom_proxies";
  var NAMEKEY = "agentchat_active_proxy_name";

  function getProxies() { try { return JSON.parse(localStorage.getItem(PROXIES) || "[]"); } catch (e) { return []; } }
  function presetName(id) {
    var m = { justdowork: "JustDoWork", agentrouter: "AgentRouter", puter: "Puter.ai",
      google: "Google AI", groq: "Groq", openrouter: "OpenRouter", deepseek: "DeepSeek",
      openai: "OpenAI", custom: "Custom Proxy", base: "Free models" };
    return m[id] || "Free models";
  }
  function activeName() {
    var active = localStorage.getItem(ACTIVE) || "";
    if (active.indexOf("custom_") === 0) {
      var p = getProxies().find(function (x) { return x.id === active; });
      return (p && p.name) || localStorage.getItem(NAMEKEY) || "Custom Proxy";
    }
    return presetName(active);
  }

  function buildModal() {
    if (document.getElementById("cproxy-modal")) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="modal-overlay hidden" id="cproxy-modal">' +
      '  <div class="modal-card" style="max-width:440px">' +
      '    <div class="modal-header"><h3>Custom Proxy</h3><button class="close-btn" id="cproxy-close">&times;</button></div>' +
      '    <div class="modal-body">' +
      '      <div class="form-group"><label for="cproxy-name">Proxy name</label><input id="cproxy-name" placeholder="e.g. My Gateway" /></div>' +
      '      <div class="form-group"><label for="cproxy-url">Base URL</label><input id="cproxy-url" placeholder="https://api.example.com/v1" /></div>' +
      '      <div class="form-group"><label for="cproxy-key">API key</label><input id="cproxy-key" type="password" placeholder="sk-..." /></div>' +
      '      <small class="hint">Saved on this device and set as your default — it\'ll be selected automatically next time, even after you close the browser.</small>' +
      '    </div>' +
      '    <div class="modal-footer"><button class="btn btn-primary" id="cproxy-save">Save &amp; use</button></div>' +
      '  </div>';
    document.body.appendChild(wrap.firstElementChild);

    var modal = document.getElementById("cproxy-modal");
    function close() { modal.classList.add("hidden"); }
    document.getElementById("cproxy-close").addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.getElementById("cproxy-save").addEventListener("click", function () {
      var name = (document.getElementById("cproxy-name").value || "").trim();
      var url = (document.getElementById("cproxy-url").value || "").trim().replace(/\/+$/, "");
      var key = (document.getElementById("cproxy-key").value || "").trim();
      if (!name || !url) { alert("Please enter at least a name and a base URL."); return; }

      var active = localStorage.getItem(ACTIVE) || "";
      var id = active.indexOf("custom_") === 0 ? active : ("custom_" + Date.now());
      var proxies = getProxies();
      var existing = proxies.find(function (x) { return x.id === id; });
      if (existing) { existing.name = name; existing.base_url = url; }
      else proxies.push({ id: id, name: name, base_url: url });

      localStorage.setItem(PROXIES, JSON.stringify(proxies));
      localStorage.setItem(ACTIVE, id);
      localStorage.setItem(NAMEKEY, name);
      localStorage.setItem("agentchat_client_url_" + id, url);
      if (key) localStorage.setItem("agentchat_client_key_" + id, key);
      close();
      location.reload(); // app.js restores active provider + key from localStorage on load
    });
  }

  function openModal() {
    buildModal();
    var active = localStorage.getItem(ACTIVE) || "";
    var p = active.indexOf("custom_") === 0 ? getProxies().find(function (x) { return x.id === active; }) : null;
    document.getElementById("cproxy-name").value = p ? (p.name || "") : "";
    document.getElementById("cproxy-url").value = p ? (p.base_url || "") : "";
    document.getElementById("cproxy-key").value = localStorage.getItem("agentchat_client_key_" + active) || "";
    document.getElementById("cproxy-modal").classList.remove("hidden");
    setTimeout(function () { document.getElementById("cproxy-name").focus(); }, 60);
  }

  function init() {
    var track = document.querySelector(".topbar-scroll-track");
    var pill = document.querySelector(".provider-pill-wrapper");
    if (!track || document.getElementById("cproxy-btn")) return;
    if (pill) pill.style.display = "none"; // hide the long proxy list

    var label = document.createElement("span");
    label.id = "cproxy-label";
    label.className = "cproxy-label";
    label.textContent = activeName();

    var btn = document.createElement("button");
    btn.id = "cproxy-btn";
    btn.type = "button";
    btn.className = "pill-btn cproxy-btn";
    btn.title = "Set a custom proxy (name, base URL, API key)";
    btn.innerHTML = '<span style="font-size:13px;">🔗</span><span>Custom Proxy</span>';
    btn.addEventListener("click", openModal);

    track.insertBefore(btn, track.firstChild);
    track.insertBefore(label, track.firstChild);

    // Reflect the active custom proxy name on the landing/home hero too.
    var active = localStorage.getItem(ACTIVE) || "";
    if (active.indexOf("custom_") === 0) {
      var eyebrow = document.querySelector("#landing-screen .lp-eyebrow");
      if (eyebrow) eyebrow.textContent = "Connected to " + activeName();
    }
  }

  var tries = 0;
  (function wait() {
    if (document.querySelector(".topbar-scroll-track")) init();
    else if (tries++ < 40) setTimeout(wait, 150);
  })();
})();
