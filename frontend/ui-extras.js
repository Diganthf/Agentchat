/* ==========================================================================
   AgentChat — UI extras (additive, self-contained)
   1) Hover tooltip pills (converts title="" into styled pills)
   2) A "Copy" button at the end of every assistant response
   Loaded after app.js. Remove the <script> tag to disable.
   ========================================================================== */
(function () {
  "use strict";
  try {
    /* ---------- 1. Tooltip pills ---------- */
    var tip = document.createElement("div");
    tip.className = "agc-tooltip";
    tip.style.opacity = "0";
    document.body.appendChild(tip);

    function showTip(el) {
      var text = el.getAttribute("data-tip");
      if (!text) return;
      tip.textContent = text;
      var r = el.getBoundingClientRect();
      tip.style.opacity = "1";
      var top = r.top - tip.offsetHeight - 8;
      var below = top < 4;
      tip.style.top = (below ? r.bottom + 8 : top) + "px";
      var left = r.left + r.width / 2 - tip.offsetWidth / 2;
      left = Math.max(6, Math.min(left, window.innerWidth - tip.offsetWidth - 6));
      tip.style.left = left + "px";
    }
    function hideTip() { tip.style.opacity = "0"; }

    // Move title -> data-tip so we control the styling (and kill the native box)
    function claimTitles(root) {
      var nodes = (root.querySelectorAll ? root.querySelectorAll("[title]") : []);
      nodes.forEach(function (n) {
        var t = n.getAttribute("title");
        if (t && !n.getAttribute("data-tip")) { n.setAttribute("data-tip", t); n.removeAttribute("title"); }
      });
    }
    claimTitles(document);

    document.addEventListener("mouseover", function (e) {
      var el = e.target.closest && e.target.closest("[data-tip]");
      if (el) showTip(el);
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest && e.target.closest("[data-tip]")) hideTip();
    });
    document.addEventListener("click", hideTip);

    /* ---------- 2. Copy button on assistant responses ---------- */
    function addCopy(bubble) {
      if (!bubble || bubble.dataset.copyAdded) return;
      var textDiv = bubble.querySelector(".message-text");
      if (!textDiv) return;
      // Skip while it's still just the connecting/typing placeholder
      if (bubble.querySelector(".model-connecting-state")) return;
      if ((textDiv.textContent || "").trim().length < 1) return;
      bubble.dataset.copyAdded = "1";

      var group = document.createElement("div");
      group.className = "chat-actions-group msg-copy-group";
      var btn = document.createElement("button");
      btn.className = "chat-action-btn";
      btn.setAttribute("data-tip", "Copy response");
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      btn.addEventListener("click", function () {
        var text = bubble.querySelector(".message-text");
        try {
          navigator.clipboard.writeText(text ? text.innerText : "");
          btn.classList.add("copied");
          btn.setAttribute("data-tip", "Copied");
          setTimeout(function () { btn.classList.remove("copied"); btn.setAttribute("data-tip", "Copy response"); }, 1400);
        } catch (e) {}
      });
      group.appendChild(btn);
      bubble.appendChild(group);
    }

    function scanBubbles(root) {
      if (!root) return;
      if (root.matches && root.matches(".assistant-bubble")) addCopy(root);
      if (root.querySelectorAll) root.querySelectorAll(".assistant-bubble").forEach(addCopy);
    }

    var list = document.getElementById("messages-list");
    if (list) {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { scanBubbles(n); claimTitles(n); } });
        });
        // Re-check finished assistant bubbles (streaming replaces their content)
        list.querySelectorAll(".assistant-bubble:not([data-copy-added])").forEach(function (b) {
          if (!b.querySelector(".model-connecting-state") && (b.querySelector(".message-text") || {}).textContent) addCopy(b);
        });
      }).observe(list, { childList: true, subtree: true });
    }
  } catch (err) {
    console.log("[ui-extras] disabled:", err);
  }
})();
