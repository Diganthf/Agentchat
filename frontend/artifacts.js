/* ==========================================================================
   AgentChat — Workspace panel (self-contained, additive)
   Built ON TOP of the original artifact preview panel (not a replacement):
   still watches assistant messages for HTML/SVG code blocks and offers a live
   right-side Preview / Code view in a sandboxed iframe (no same-origin, so
   previewed model output can't touch the app). NEW: a tiny view registry
   exposed as window.AgentWorkspace that the other additive modules
   (code-runner, mermaid-render, plan-panel, doc-export) plug extra tabs into
   — Output, Diagram, Process, Files.
   Loaded AFTER app.js. Remove the <script> tag to disable the whole workspace.
   ========================================================================== */
(function () {
  "use strict";
  try {
    // ---- Build the panel shell once ----
    var panel = document.createElement("div");
    panel.id = "artifact-panel";
    panel.className = "artifact-panel hidden";
    panel.innerHTML =
      '<div class="artifact-head">' +
        '<span class="artifact-title" id="artifact-title">Workspace</span>' +
        '<div class="artifact-toolbar">' +
          '<div class="artifact-tabs" id="artifact-tabs"></div>' +
          '<button class="artifact-icon-btn" id="artifact-copy" title="Copy code">Copy</button>' +
          '<button class="artifact-icon-btn" id="artifact-close" title="Close">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="artifact-body" id="artifact-body"></div>';
    document.body.appendChild(panel);

    var body = panel.querySelector("#artifact-body");
    var tabsWrap = panel.querySelector("#artifact-tabs");
    var titleEl = panel.querySelector("#artifact-title");
    var currentCode = "";
    var views = {}; // id -> { tab, pane, order }

    function open(id) {
      panel.classList.remove("hidden");
      document.body.classList.add("artifact-open");
      if (id) showView(id);
    }
    function close() {
      panel.classList.add("hidden");
      document.body.classList.remove("artifact-open");
    }
    function isOpen() { return !panel.classList.contains("hidden"); }

    function showView(id) {
      if (!views[id]) return;
      Object.keys(views).forEach(function (k) {
        views[k].pane.classList.toggle("hidden", k !== id);
        views[k].tab.classList.toggle("active", k === id);
      });
    }
    // Register a new tab + pane. Idempotent: returns the existing view if the id
    // is already registered, so modules can call it freely. order sorts the tabs.
    function addView(opts) {
      opts = opts || {};
      var id = opts.id;
      if (!id) return null;
      if (views[id]) {
        if (opts.label) views[id].tab.textContent = opts.label;
        return views[id];
      }
      var pane = document.createElement("div");
      pane.className = "artifact-view hidden";
      pane.setAttribute("data-view", id);
      body.appendChild(pane);

      var tab = document.createElement("button");
      tab.className = "artifact-tab";
      tab.setAttribute("data-view", id);
      tab.textContent = opts.label || id;
      tab.addEventListener("click", function () { showView(id); });

      views[id] = { tab: tab, pane: pane, order: opts.order == null ? 50 : opts.order };
      Object.keys(views)
        .sort(function (a, b) { return views[a].order - views[b].order; })
        .forEach(function (k) { tabsWrap.appendChild(views[k].tab); });
      return views[id];
    }

    function removeView(id) {
      if (!views[id]) return;
      views[id].tab.remove();
      views[id].pane.remove();
      delete views[id];
    }

    // ---- Default views: Preview (sandboxed iframe) + Code ----
    var previewView = addView({ id: "preview", label: "Preview", order: 10 });
    var frame = document.createElement("iframe");
    frame.id = "artifact-frame";
    frame.className = "artifact-frame";
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals");
    frame.setAttribute("referrerpolicy", "no-referrer");
    previewView.pane.classList.add("artifact-view-flush");
    previewView.pane.appendChild(frame);

    var codeView = addView({ id: "code", label: "Code", order: 20 });
    var codeEl = document.createElement("code");
    var codePre = document.createElement("pre");
    codePre.className = "artifact-code";
    codePre.appendChild(codeEl);
    codeView.pane.classList.add("artifact-view-flush");
    codeView.pane.appendChild(codePre);
    function setTitle(t) { titleEl.textContent = t || "Workspace"; }

    function openArtifact(code, title) {
      currentCode = code;
      setTitle(title || "Artifact");
      codeEl.textContent = code;
      frame.srcdoc = code;
      open("preview");
    }

    panel.querySelector("#artifact-close").addEventListener("click", close);
    panel.querySelector("#artifact-copy").addEventListener("click", function () {
      var b = this;
      try {
        navigator.clipboard.writeText(codeEl.textContent || currentCode || "");
        b.textContent = "Copied";
        setTimeout(function () { b.textContent = "Copy"; }, 1200);
      } catch (e) {}
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) close();
    });

    function langOf(pre) {
      var l = pre.getAttribute("data-lang");
      if (l) return l;
      var span = pre.querySelector(".code-header span");
      return span ? (span.textContent || "").trim().toLowerCase() : "";
    }

    // ---- Public API for the other additive workspace modules ----
    window.AgentWorkspace = {
      panel: panel,
      frame: frame,
      open: open,
      close: close,
      isOpen: isOpen,
      addView: addView,
      removeView: removeView,
      showView: showView,
      setTitle: setTitle,
      openArtifact: openArtifact,
      langOf: langOf,
      readCode: function (pre) { var c = pre.querySelector("code"); return c ? (c.textContent || "") : ""; },
      setCode: function (code) { currentCode = code; codeEl.textContent = code; }
    };
    // ---- Detect renderable HTML/SVG artifacts in assistant code blocks ----
    function looksLikeHtml(txt) {
      return /<!doctype html|<html[\s>]|<body[\s>]|<svg[\s>]|<div[\s\S]*<\/div>|<style[\s>]|<canvas[\s>]/i.test(txt);
    }
    function wrapIfFragment(code, lang) {
      if (lang === "svg" || /^<svg[\s>]/i.test(code.trim())) {
        return '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">' + code + "</body>";
      }
      if (/<!doctype html|<html[\s>]/i.test(code)) return code;
      return '<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui;padding:16px">' + code + "</body>";
    }

    function enhancePre(pre) {
      if (!pre || pre.dataset.artifactChecked) return;
      pre.dataset.artifactChecked = "1";
      var codeNode = pre.querySelector("code");
      if (!codeNode) return;
      if (!pre.closest(".assistant-bubble")) return;
      var lang = langOf(pre);
      var code = codeNode.textContent || "";
      var renderable = lang === "html" || lang === "svg" || (lang === "" && looksLikeHtml(code)) || (lang === "code" && looksLikeHtml(code));
      if (!renderable || code.trim().length < 12) return;

      var header = pre.querySelector(".code-header");
      var btn = document.createElement("button");
      btn.className = "artifact-open-btn";
      btn.textContent = "⧉ Preview";
      btn.title = "Open live preview";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        openArtifact(wrapIfFragment(code, lang), lang === "svg" ? "SVG artifact" : "HTML artifact");
      });
      if (header) header.appendChild(btn);
      else { pre.style.position = "relative"; btn.classList.add("floating"); pre.appendChild(btn); }
    }

    function scan(root) {
      if (!root) return;
      if (root.matches && root.matches("pre")) enhancePre(root);
      if (root.querySelectorAll) root.querySelectorAll("pre").forEach(enhancePre);
    }

    var list = document.getElementById("messages-list");
    if (list) {
      scan(list); // catch anything already present
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
          // streaming rewrites innerHTML of a bubble; re-scan the target
          if (m.type === "childList" && m.target && m.target.nodeType === 1) scan(m.target);
        });
      }).observe(list, { childList: true, subtree: true });
    }
  } catch (err) {
    console.log("[workspace] disabled:", err);
  }
})();
