/* ==========================================================================
   AgentChat — "Think" toggle (extended reasoning)
   Adds a Claude-style thinking switch to the composer. When ON it forces the
   maximum reasoning budget for the next messages (maps to the real
   reasoning_effort="max" / large max_tokens the backend already sends) so
   reasoning models produce and stream their full thought process.
   Additive + self-contained. Remove the <script> tag to disable.
   ========================================================================== */
(function () {
  "use strict";
  function init() {
    try {
      var left = document.querySelector(".input-left-buttons");
      if (!left || document.getElementById("think-toggle-btn")) return;

      var btn = document.createElement("button");
      btn.id = "think-toggle-btn";
      btn.className = "action-pill-btn think-toggle-btn";
      btn.title = "Extended thinking: force maximum reasoning effort";
      btn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z"></path>' +
        '<line x1="9" y1="21" x2="15" y2="21"></line></svg><span class="think-label">Think</span>';
      left.appendChild(btn);

      var prevEffort = null;

      function applyState(on) {
        btn.classList.toggle("active", on);
        localStorage.setItem("agentchat_thinking", on ? "1" : "0");
        if (typeof window.setReasoningEffort === "function") {
          if (on) {
            prevEffort = localStorage.getItem("agentchat_active_effort") || "medium";
            window.setReasoningEffort("max");
          } else {
            window.setReasoningEffort(prevEffort || "medium");
          }
        }
      }

      // Restore prior state
      var saved = localStorage.getItem("agentchat_thinking") === "1";
      if (saved) applyState(true);

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        applyState(!btn.classList.contains("active"));
      });
    } catch (err) {
      console.log("[think-toggle] disabled:", err);
    }
  }

  // setReasoningEffort is defined during app.js init; wait for it, then wire up.
  var tries = 0;
  (function waitReady() {
    if (document.querySelector(".input-left-buttons") && (typeof window.setReasoningEffort === "function" || tries > 40)) {
      init();
    } else if (tries++ < 40) {
      setTimeout(waitReady, 150);
    } else {
      init();
    }
  })();
})();
