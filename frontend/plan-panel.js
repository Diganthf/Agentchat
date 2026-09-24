/* ==========================================================================
   AgentChat — Plan / process panel (self-contained, additive)
   Parses ```plan code blocks (markdown checklists: "- [ ] task" / "- [x] done"
   or plain bullet / numbered lists) into a live checklist with a progress bar
   in the workspace "Process" tab, and replaces the raw block in the message
   with a compact clickable pill. Text is set via textContent, so model output
   can't inject HTML.
   Loaded AFTER artifacts.js (needs window.AgentWorkspace). Remove the <script>
   tag to disable.
   ========================================================================== */
(function () {
  "use strict";
  try {
    var W = window.AgentWorkspace || null;
    var planPane = null;

    function langOf(pre) {
      return ((W && W.langOf ? W.langOf(pre) : (pre.getAttribute("data-lang") || "")) || "").toLowerCase();
    }

    function parse(txt) {
      var items = [];
      txt.split(/\r?\n/).forEach(function (line) {
        var m = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/);
        if (m) { items.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() }); return; }
        var b = line.match(/^\s*[-*]\s+(.+)$/);
        if (b) { items.push({ done: false, text: b[1].trim() }); return; }
        var n = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (n) items.push({ done: false, text: n[1].trim() });
      });
      return items;
    }

    function pane() {
      if (!W) return null;
      if (!planPane) planPane = W.addView({ id: "process", label: "Process", order: 40 }).pane;
      return planPane;
    }

    function renderChecklist(items) {
      var p = pane(); if (!p) return;
      var done = items.filter(function (i) { return i.done; }).length;
      var pct = items.length ? Math.round(done / items.length * 100) : 0;
      var html = '<div class="agc-plan">' +
        '<div class="agc-plan-head"><span>Plan</span>' +
        '<span class="agc-plan-progress">' + done + '/' + items.length + ' done</span></div>' +
        '<div class="agc-plan-bar"><i style="width:' + pct + '%"></i></div>';
      items.forEach(function (it) {
        html += '<div class="agc-plan-item' + (it.done ? ' done' : '') + '">' +
          '<span class="agc-plan-box">' + (it.done ? '✓' : '') + '</span>' +
          '<span class="agc-plan-text"></span></div>';
      });
      p.innerHTML = html + '</div>';
      var texts = p.querySelectorAll(".agc-plan-text");
      items.forEach(function (it, i) { if (texts[i]) texts[i].textContent = it.text; });
    }
    function enhance(pre) {
      if (!pre || pre.dataset.agcPlan) return;
      if (!pre.closest(".assistant-bubble")) return;
      if (langOf(pre) !== "plan") return;
      var codeNode = pre.querySelector("code");
      var items = parse(codeNode ? (codeNode.textContent || "") : "");
      if (!items.length) return;
      pre.dataset.agcPlan = "1";
      var done = items.filter(function (i) { return i.done; }).length;
      var pill = document.createElement("span");
      pill.className = "agc-plan-pill";
      pill.innerHTML = '📋 Plan <b>' + done + '/' + items.length + '</b> done · view';
      pill.addEventListener("click", function () { renderChecklist(items); if (W) W.open("process"); });
      pre.style.display = "none";
      pre.after(pill);
      renderChecklist(items);
    }
    function scan(root) {
      if (!root) return;
      if (root.matches && root.matches("pre")) enhance(root);
      if (root.querySelectorAll) root.querySelectorAll("pre").forEach(enhance);
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
  } catch (e) { console.log("[plan] disabled:", e); }
})();
