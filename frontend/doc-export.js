/* ==========================================================================
   AgentChat — Doc / file export (self-contained, additive)
   Collects code blocks from assistant replies into a workspace "Files" tab and
   adds a per-message download bar, so any snippet can be saved with a sensible
   extension. Purely client-side (Blob + object URL); nothing is uploaded.
   Files are derived fresh from the DOM on each (debounced) scan, so streaming
   rewrites never produce duplicates.
   Loaded AFTER artifacts.js (needs window.AgentWorkspace). Remove the <script>
   tag to disable.
   ========================================================================== */
(function () {
  "use strict";
  try {
    var W = window.AgentWorkspace || null;
    var filesPane = null, allFiles = [];

    var EXT = { js: "js", javascript: "js", ts: "ts", typescript: "ts", python: "py",
      py: "py", html: "html", css: "css", json: "json", md: "md", markdown: "md",
      bash: "sh", sh: "sh", sql: "sql", java: "java", c: "c", cpp: "cpp", go: "go",
      rust: "rs", rs: "rs", yaml: "yml", yml: "yml", xml: "xml", svg: "svg", plan: "txt" };

    function langOf(pre) {
      return ((W && W.langOf ? W.langOf(pre) : (pre.getAttribute("data-lang") || "")) || "").toLowerCase();
    }

    function download(name, text) {
      var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    function filesView() {
      if (!W) return null;
      if (!filesPane) { filesPane = W.addView({ id: "files", label: "Files", order: 60 }).pane; }
      return filesPane;
    }

    function refreshFiles() {
      var p = filesView(); if (!p) return;
      if (!allFiles.length) { p.innerHTML = '<div class="agc-files-empty">No downloadable files yet. Code blocks in replies show up here.</div>'; return; }
      p.innerHTML = "";
      var bar = document.createElement("div"); bar.className = "agc-export-bar";
      allFiles.forEach(function (f) {
        var b = document.createElement("button");
        b.className = "agc-dl-btn"; b.textContent = "⬇ " + f.name;
        b.addEventListener("click", function () { download(f.name, f.text); });
        bar.appendChild(b);
      });
      p.appendChild(bar);
    }
    function collect() {
      allFiles = [];
      var pres = document.querySelectorAll("#messages-list .assistant-bubble pre");
      Array.prototype.forEach.call(pres, function (pre) {
        var codeNode = pre.querySelector("code");
        var code = codeNode ? (codeNode.textContent || "") : "";
        if (code.trim().length < 20) return;
        var name = "snippet-" + (allFiles.length + 1) + "." + (EXT[langOf(pre)] || "txt");
        allFiles.push({ name: name, text: code });
      });
    }
    function buildBars() {
      var bubbles = document.querySelectorAll("#messages-list .assistant-bubble");
      Array.prototype.forEach.call(bubbles, function (bubble) {
        var existing = bubble.querySelector(".agc-export-bar");
        if (existing) existing.remove();
        var files = [];
        Array.prototype.forEach.call(bubble.querySelectorAll("pre"), function (pre) {
          var codeNode = pre.querySelector("code");
          var code = codeNode ? (codeNode.textContent || "") : "";
          if (code.trim().length < 20) return;
          files.push({ ext: EXT[langOf(pre)] || "txt", text: code });
        });
        if (!files.length) return;
        var bar = document.createElement("div"); bar.className = "agc-export-bar";
        files.forEach(function (f, i) {
          var nm = "snippet" + (files.length > 1 ? "-" + (i + 1) : "") + "." + f.ext;
          var b = document.createElement("button");
          b.className = "agc-dl-btn"; b.textContent = "⬇ " + nm;
          b.addEventListener("click", function () { download(nm, f.text); });
          bar.appendChild(b);
        });
        if (W) {
          var open = document.createElement("button");
          open.className = "agc-dl-btn"; open.textContent = "⧉ Files";
          open.addEventListener("click", function () { W.open("files"); });
          bar.appendChild(open);
        }
        bubble.appendChild(bar);
      });
    }
    var pending = null, mo = null;
    var list = document.getElementById("messages-list");
    function run() {
      if (mo) mo.disconnect();
      collect(); refreshFiles(); buildBars();
      if (mo && list) mo.observe(list, { childList: true, subtree: true });
    }
    if (list) {
      mo = new MutationObserver(function () { clearTimeout(pending); pending = setTimeout(run, 500); });
      mo.observe(list, { childList: true, subtree: true });
      run();
    }
  } catch (e) { console.log("[export] disabled:", e); }
})();
