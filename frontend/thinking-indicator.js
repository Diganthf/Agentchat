/* ==========================================================================
   AgentChat — Claude-style thinking indicator
   A small, reusable "the assistant is working" affordance shown while a reply
   is being composed. Replaces the old "Connecting to <model> (0.0s)…" technical
   placeholder. NO provider / token / network terminology ever reaches the UI —
   this is purely a calm, minimal working cue with a breathing sparkle, rotating
   phrases, and a compact expandable plain-English summary.

     window.ThinkingIndicator.create(mountEl, opts?) -> instance
       instance.start()           begin pulse + rotating phrases
       instance.stop()            fade out + remove (transition into the answer)
       instance.destroy()         immediate removal, clear timers
       instance.setSummary(text)  replace the expandable plain-English summary

   Additive + self-contained (vanilla JS, no deps). Themed via the same CSS
   tokens as claude-theme.css. Remove the <script> tag to disable — app.js
   falls back to a static "Thinking…" line.
   ========================================================================== */
(function () {
  "use strict";

  // Human, playful, provider-agnostic. Index 0 is always the calm default.
  var PHRASES = [
    "Thinking…", "Tinkering…", "Adjusting…", "Working through it…",
    "Connecting the dots…", "Putting the pieces together…",
    "Figuring this out…", "Considering the details…",
    "Sorting through it…", "Shaping a response…",
    "Almost there…", "Bamboozling…"
  ];

  // Concise, user-facing summary — NEVER hidden chain-of-thought. Describes only
  // the observable task, in plain English.
  var DEFAULT_SUMMARY =
    "I'm breaking your message into a few parts and checking the relevant " +
    "details before putting together a response.";

  var SPARK_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 0c.5 5.6 3.4 8.5 9 9-5.6.5-8.5 3.4-9 9' +
    '-.5-5.6-3.4-8.5-9-9 5.6-.5 8.5-3.4 9-9z"/></svg>';

  var CARET_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>';
  var uid = 0;
  var reduced = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function create(mountEl, opts) {
    opts = opts || {};
    var id = "agc-think-" + (++uid);
    var phrases = opts.phrases || PHRASES;

    var root = document.createElement("div");
    root.className = "agc-thinking";
    root.setAttribute("data-agc-thinking", "");

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "agc-thinking-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", id);
    // Stable label for screen readers; the visible phrase rotates only for
    // sighted users (aria-hidden) so SR output isn't spammed on every swap.
    toggle.setAttribute("aria-label",
      "Assistant is thinking. Activate to see what it's working on.");
    toggle.innerHTML =
      '<span class="agc-thinking-spark" aria-hidden="true">' + SPARK_SVG + "</span>" +
      '<span class="agc-thinking-phrase" aria-hidden="true">' + phrases[0] + "</span>" +
      '<span class="agc-thinking-caret" aria-hidden="true">' + CARET_SVG + "</span>";

    var panel = document.createElement("div");
    panel.className = "agc-thinking-panel";
    panel.id = id;
    panel.setAttribute("role", "region");
    var inner = document.createElement("div");
    inner.className = "agc-thinking-panel-inner";
    var summary = document.createElement("p");
    summary.className = "agc-thinking-summary";
    summary.textContent = opts.summary || DEFAULT_SUMMARY;
    inner.appendChild(summary);
    panel.appendChild(inner);

    root.appendChild(toggle);
    root.appendChild(panel);

    var phraseEl = toggle.querySelector(".agc-thinking-phrase");
    var rotTimer = null, swapTimer = null, surgeTimer = null, leaveTimer = null;
    var idx = 0, running = false, dismissed = false;
    function clearTimers() {
      [rotTimer, swapTimer, surgeTimer, leaveTimer].forEach(function (t) {
        if (t) { clearTimeout(t); clearInterval(t); }
      });
      rotTimer = swapTimer = surgeTimer = leaveTimer = null;
    }

    // Crossfade to a new phrase; briefly surge the sparkle in sync so the whole
    // thing reads as one intentional motion, not "icon + random text".
    function rotate() {
      var next = idx;
      while (next === idx && phrases.length > 1) {
        next = Math.floor(Math.random() * phrases.length);
      }
      idx = next;
      phraseEl.classList.add("is-fading");
      root.classList.add("is-surge");
      swapTimer = setTimeout(function () {
        phraseEl.textContent = phrases[idx];
        phraseEl.classList.remove("is-fading");
      }, reduced.matches ? 0 : 200);
      surgeTimer = setTimeout(function () {
        root.classList.remove("is-surge");
      }, 520);
    }

    function start() {
      if (running || dismissed) return;
      running = true;
      root.classList.add("is-active");
      // The sparkle breathes via CSS (never restarts on phrase change). Only the
      // phrase rotation is JS-timed, and it's disabled under reduced-motion.
      if (!reduced.matches) rotTimer = setInterval(rotate, 2200);
    }

    function remove() {
      clearTimers();
      document.removeEventListener("click", onDocClick, true);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    // Transition the indicator away (used the moment real answer content or an
    // error arrives). Never leaves a pulsing loader lingering above the reply.
    function stop() {
      if (dismissed) return;
      dismissed = true; running = false;
      clearTimers();
      if (reduced.matches) { remove(); return; }
      root.classList.add("is-leaving");
      leaveTimer = setTimeout(remove, 280);
    }

    function destroy() { dismissed = true; running = false; remove(); }

    function setSummary(text) {
      if (text && String(text).trim()) summary.textContent = String(text).trim();
    }

    // Compact inline disclosure — no modal, no global overlay. Outside-click
    // dismiss is attached only while open, so there's no per-message listener leak.
    function onDocClick(e) { if (!root.contains(e.target)) collapse(); }
    function expand() {
      root.classList.add("is-expanded");
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onDocClick, true);
    }
    function collapse() {
      root.classList.remove("is-expanded");
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocClick, true);
    }
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      if (root.classList.contains("is-expanded")) collapse(); else expand();
    });

    if (mountEl) mountEl.appendChild(root);

    return {
      el: root, start: start, stop: stop, destroy: destroy,
      setSummary: setSummary, isRunning: function () { return running; }
    };
  }

  window.ThinkingIndicator = { create: create };
})();
