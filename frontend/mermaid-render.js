/* ==========================================================================
   AgentChat — Mermaid renderer (self-contained, additive)
   Turns ```mermaid code blocks in assistant replies into rendered diagrams and
   collects them into a "Diagram" tab in the workspace. Mermaid is lazily loaded
   from CDN on first use. securityLevel:"strict" keeps model-authored diagram
   text from running scripts or click handlers.
   Loaded AFTER artifacts.js (needs window.AgentWorkspace). Remove the <script>
   tag to disable. Scanning is debounced so half-streamed diagrams aren't
   rendered mid-flight.
   ========================================================================== */
(function () {
  "use strict";
  try {
    var W = window.AgentWorkspace || null;
    var loadP = null, ready = false, seq = 0, gallery = null, seen = {};

    function langOf(pre) {
      return ((W && W.langOf ? W.langOf(pre) : (pre.getAttribute("data-lang") || "")) || "").toLowerCase();
    }

    function loadMermaid() {
      if (ready) return Promise.resolve();
      if (loadP) return loadP;
      loadP = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
        s.onload = function () {
          try { window.mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" }); } catch (e) {}
          ready = true; res();
        };
        s.onerror = function () { rej(new Error("could not load mermaid from CDN")); };
        document.head.appendChild(s);
      });
      return loadP;
    }

    function galleryPane() {
      if (!W) return null;
      if (!gallery) gallery = W.addView({ id: "diagram", label: "Diagram", order: 30 }).pane;
      return gallery;
    }

    function addToGallery(svg, src) {
      if (seen[src]) return;                 // dedupe across re-scans / streaming
      seen[src] = 1;
      var pane = galleryPane(); if (!pane) return;
      var item = document.createElement("div");
      item.className = "agc-diagram-item";
      item.innerHTML = "<h4>Diagram " + seq + "</h4>";
      var holder = document.createElement("div");
      holder.className = "agc-mermaid";
      holder.innerHTML = svg;
      item.appendChild(holder);
      pane.appendChild(item);
    }
    function addTools(wrap, pre) {
      var tools = document.createElement("div");
      tools.className = "agc-mermaid-tools";
      var src = document.createElement("button");
      src.className = "agc-mini-btn"; src.textContent = "Source";
      src.addEventListener("click", function () {
        var hidden = pre.style.display === "none";
        pre.style.display = hidden ? "" : "none";
        src.textContent = hidden ? "Hide source" : "Source";
      });
      tools.appendChild(src);
      if (W) {
        var open = document.createElement("button");
        open.className = "agc-mini-btn"; open.textContent = "⧉ Workspace";
        open.addEventListener("click", function () { W.open("diagram"); });
        tools.appendChild(open);
      }
      wrap.parentNode.insertBefore(tools, wrap);
    }

    function render(pre) {
      if (!pre || pre.dataset.agcMermaid) return;
      if (!pre.closest(".assistant-bubble")) return;
      if (langOf(pre) !== "mermaid") return;
      var codeNode = pre.querySelector("code");
      var code = codeNode ? (codeNode.textContent || "") : "";
      if (code.trim().length < 5) return;
      pre.dataset.agcMermaid = "1";
      var wrap = document.createElement("div");
      wrap.className = "agc-mermaid";
      wrap.innerHTML = '<div class="agc-loading"><span class="agc-spinner"></span>Rendering diagram…</div>';
      pre.style.display = "none";
      pre.after(wrap);
      loadMermaid().then(function () {
        return window.mermaid.render("agcmmd" + (++seq), code.trim());
      }).then(function (out) {
        var svg = (out && out.svg) || out;
        wrap.innerHTML = svg;
        addTools(wrap, pre);
        addToGallery(svg, code);
      }).catch(function (err) {
        wrap.innerHTML = '<div class="agc-mermaid-err">Mermaid error: ' + ((err && err.message) || err) + '</div>';
        pre.style.display = "";
      });
    }
    function scan(root) {
      if (!root) return;
      if (root.matches && root.matches("pre")) render(root);
      if (root.querySelectorAll) root.querySelectorAll("pre").forEach(render);
    }
    var pending = null;
    var list = document.getElementById("messages-list");
    if (list) {
      scan(list);
      new MutationObserver(function () {
        clearTimeout(pending);
        pending = setTimeout(function () { scan(list); }, 500);
      }).observe(list, { childList: true, subtree: true });
    }
  } catch (e) { console.log("[mermaid] disabled:", e); }
})();
