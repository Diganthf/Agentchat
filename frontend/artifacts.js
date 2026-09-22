/* ==========================================================================
   AgentChat — Artifact preview panel (self-contained, additive)
   Watches assistant messages for HTML/SVG code blocks and offers a live
   right-side preview panel (Preview / Code toggle), Claude-artifact style.
   Loaded AFTER app.js. Uses a sandboxed iframe (no same-origin) so previewed
   model output can't touch the app. Remove the <script> tag to disable.
   ========================================================================== */
(function () {
  "use strict";
  try {
    // ---- Build the panel once ----
    var panel = document.createElement("div");
    panel.id = "artifact-panel";
    panel.className = "artifact-panel hidden";
    panel.innerHTML =
      '<div class="artifact-head">' +
        '<span class="artifact-title" id="artifact-title">Artifact</span>' +
        '<div class="artifact-toolbar">' +
          '<div class="artifact-tabs">' +
            '<button class="artifact-tab active" data-view="preview">Preview</button>' +
            '<button class="artifact-tab" data-view="code">Code</button>' +
          '</div>' +
          '<button class="artifact-icon-btn" id="artifact-copy" title="Copy code">Copy</button>' +
          '<button class="artifact-icon-btn" id="artifact-close" title="Close">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="artifact-body">' +
        '<iframe id="artifact-frame" class="artifact-frame" sandbox="allow-scripts allow-forms allow-modals" referrerpolicy="no-referrer"></iframe>' +
        '<pre class="artifact-code hidden" id="artifact-code"><code></code></pre>' +
      '</div>';
    document.body.appendChild(panel);

    var frame = panel.querySelector("#artifact-frame");
    var codeWrap = panel.querySelector("#artifact-code");
    var codeEl = codeWrap.querySelector("code");
    var titleEl = panel.querySelector("#artifact-title");
    var currentCode = "";

    function setView(view) {
      panel.querySelectorAll(".artifact-tab").forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("data-view") === view);
      });
      var preview = view === "preview";
      frame.classList.toggle("hidden", !preview);
      codeWrap.classList.toggle("hidden", preview);
    }

    function openArtifact(code, title) {
      currentCode = code;
      titleEl.textContent = title || "Artifact";
      codeEl.textContent = code;
      // Render in the sandboxed frame
      frame.srcdoc = code;
      document.body.classList.add("artifact-open");
      panel.classList.remove("hidden");
      setView("preview");
    }
    function closeArtifact() {
      panel.classList.add("hidden");
      document.body.classList.remove("artifact-open");
      frame.srcdoc = "";
    }

    panel.querySelector("#artifact-close").addEventListener("click", closeArtifact);
    panel.querySelectorAll(".artifact-tab").forEach(function (t) {
      t.addEventListener("click", function () { setView(t.getAttribute("data-view")); });
    });
    panel.querySelector("#artifact-copy").addEventListener("click", function () {
      try { navigator.clipboard.writeText(currentCode); this.textContent = "Copied"; var b = this; setTimeout(function(){ b.textContent = "Copy"; }, 1200); } catch (e) {}
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.classList.contains("hidden")) closeArtifact();
    });

    // ---- Detect renderable artifacts in assistant code blocks ----
    function looksLikeHtml(txt) {
      return /<!doctype html|<html[\s>]|<body[\s>]|<svg[\s>]|<div[\s\S]*<\/div>|<style[\s>]|<canvas[\s>]/i.test(txt);
    }
    function wrapIfFragment(code, lang) {
      if (lang === "svg" || /^<svg[\s>]/i.test(code.trim())) {
        return '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">' + code + "</body>";
      }
      if (/<!doctype html|<html[\s>]/i.test(code)) return code;
      // Fragment: wrap so it renders standalone
      return '<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui;padding:16px">' + code + "</body>";
    }

    function enhancePre(pre) {
      if (!pre || pre.dataset.artifactChecked) return;
      pre.dataset.artifactChecked = "1";
      var codeNode = pre.querySelector("code");
      if (!codeNode) return;
      // Only enhance blocks inside assistant messages
      if (!pre.closest(".assistant-bubble")) return;
      var header = pre.querySelector(".code-header");
      var langSpan = header ? header.querySelector("span") : null;
      var lang = langSpan ? (langSpan.textContent || "").trim().toLowerCase() : "";
      var code = codeNode.textContent || "";
      var renderable = lang === "html" || lang === "svg" || (lang === "" && looksLikeHtml(code)) || (lang === "code" && looksLikeHtml(code));
      if (!renderable || code.trim().length < 12) return;

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
    console.log("[artifacts] disabled:", err);
  }
})();
