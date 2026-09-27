/* ==========================================================================
   AgentChat — Claude-style thinking experience
   A calm, provider-agnostic "the assistant is working" affordance:
     • an Anthropic/Claude-style terracotta STARBURST (12 tapered rays) that
       gently breathes while the model works — never a spinner or Gemini sparkle
     • rotating, expressive status phrases (crossfaded; the icon surges in sync)
     • an accessible, inline-collapsible "Thought process" panel that streams a
       user-facing reasoning summary live (muted, indented, vertical rule,
       bottom fade) with a floating scroll-to-latest control

     window.ThinkingIndicator.create(mountEl, opts?) -> instance
       instance.start()             begin the breathing pulse + phrase rotation
       instance.stop()              transition away (into the answer)
       instance.destroy()           immediate removal, clear timers
       instance.setSummary(text)    replace the static plain-English summary
       instance.pushThought(text)   stream a user-facing reasoning summary into
                                    the "Thought process" panel (auto-expands)
     window.ThinkingIndicator.starburst(size) -> string   (static SVG markup,
       reused by the finished-message "Thought process" box for a cohesive mark)

   NEVER renders raw chain-of-thought, system prompts, tokens, or provider /
   network wording. Additive + self-contained (vanilla JS, no deps). Themed via
   the same CSS tokens as claude-theme.css; paired with thinking-indicator.css.
   Remove the <script> tag to disable — app.js falls back to a static line.
   ========================================================================== */
(function () {
  "use strict";

  // Human, playful, provider-agnostic. Index 0 is always the calm default.
  // Purely expressive — never a claim of real progress.
  var PHRASES = [
    "Thinking…", "Creating…", "Tinkering…", "Adjusting…", "Working through it…",
    "Connecting the dots…", "Putting the pieces together…", "Figuring this out…",
    "Considering the details…", "Sorting through it…", "Shaping a response…",
    "Almost there…"
  ];

  // Concise, user-facing summary — NEVER hidden chain-of-thought. Shown only
  // when the backend provides no live reasoning stream of its own.
  var DEFAULT_SUMMARY =
    "I'm breaking your message into a few parts and checking the relevant " +
    "details before putting together a response.";

  // --- Anthropic/Claude-style starburst ----------------------------------
  // ~12 tapered radial rays, solid fill, no circle / outline / diamond. Built
  // as a 24-point star polygon with subtle per-tip irregularity so it reads as
  // an organic sunburst rather than a mechanical gear. fill=currentColor, so
  // the terracotta comes from CSS (--agc-burst) and stays correct in any theme.
  function starburstD(cx, cy, rays, rOuter, rInner) {
    var n = rays * 2, d = "", i, ang, r, k;
    for (i = 0; i < n; i++) {
      ang = (Math.PI * i) / rays - Math.PI / 2;   // step = π/rays; first tip up
      if (i % 2 === 0) {
        k = i / 2;                                 // outer-tip index
        r = rOuter - ((k % 2) ? 0.85 : 0) - ((k % 3 === 0) ? 0.55 : 0);
      } else {
        r = rInner;                                // inner valley between rays
      }
      d += (i ? "L" : "M") + (cx + r * Math.cos(ang)).toFixed(2) + " " +
           (cy + r * Math.sin(ang)).toFixed(2) + " ";
    }
    return d + "Z";
  }
  function starburst(size) {
    size = size || 15;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" aria-hidden="true" focusable="false" class="agc-burst-svg">' +
      '<path fill="currentColor" d="' + starburstD(12, 12, 12, 10.6, 3.5) + '"/></svg>';
  }
  var CARET_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>';
  var JUMP_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
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
    // Stable label for screen readers ("Thought process"); the visible phrase
    // rotates only for sighted users (aria-hidden) so SR output isn't spammed.
    toggle.setAttribute("aria-label", "Thought process. Activate to expand.");
    toggle.innerHTML =
      '<span class="agc-thinking-spark" aria-hidden="true">' + starburst(15) + "</span>" +
      '<span class="agc-thinking-phrase" aria-hidden="true">' + phrases[0] + "</span>" +
      '<span class="agc-thinking-caret" aria-hidden="true">' + CARET_SVG + "</span>";

    var panel = document.createElement("div");
    panel.className = "agc-thinking-panel";
    panel.id = id;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Thought process");
    var inner = document.createElement("div");
    inner.className = "agc-thinking-panel-inner";

    // Static, safe plain-English summary (shown only when there's no live
    // reasoning stream). Never raw chain-of-thought.
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

    // Live "Thought process" stream — built lazily on the first pushThought().
    var thought = null, thoughtScroll = null, thoughtText = null, jumpBtn = null;
    var stuckToBottom = true, openedOnce = false;

    function clearTimers() {
      [rotTimer, swapTimer, surgeTimer, leaveTimer].forEach(function (t) {
        if (t) { clearTimeout(t); clearInterval(t); }
      });
      rotTimer = swapTimer = surgeTimer = leaveTimer = null;
    }

    // Crossfade to a new phrase; briefly surge the sparkle in sync so the whole
    // thing reads as one motion. The breathing loop is NEVER restarted (it runs
    // on the inner svg; the surge is a separate transform on the wrapper).
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
      surgeTimer = setTimeout(function () { root.classList.remove("is-surge"); }, 520);
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
      if (thoughtScroll) thoughtScroll.removeEventListener("scroll", onThoughtScroll);
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    // Transition the indicator away (the moment real answer content or an error
    // arrives). Never leaves a pulsing loader lingering above the reply.
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

    // --- live "Thought process" stream -------------------------------------
    // Built lazily so non-reasoning models never pay for the extra DOM.
    function buildThoughtUI() {
      if (thought) return;
      thought = document.createElement("div");
      thought.className = "agc-thought";

      var head = document.createElement("div");
      head.className = "agc-thought-head";
      head.textContent = "Thought process";

      thoughtScroll = document.createElement("div");
      thoughtScroll.className = "agc-thought-scroll";
      thoughtText = document.createElement("div");
      thoughtText.className = "agc-thought-text";
      thoughtScroll.appendChild(thoughtText);

      var fade = document.createElement("div");
      fade.className = "agc-thought-fade";
      fade.setAttribute("aria-hidden", "true");

      jumpBtn = document.createElement("button");
      jumpBtn.type = "button";
      jumpBtn.className = "agc-thought-jump";
      jumpBtn.setAttribute("aria-label", "Scroll to latest thought");
      jumpBtn.innerHTML = JUMP_SVG;
      jumpBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        stuckToBottom = true; scrollThoughtToBottom(); updateJump();
      });

      thought.appendChild(head);
      thought.appendChild(thoughtScroll);
      thought.appendChild(fade);
      thought.appendChild(jumpBtn);
      inner.appendChild(thought);
      root.classList.add("has-thought");            // hides the static summary
      thoughtScroll.addEventListener("scroll", onThoughtScroll);
    }
    function scrollThoughtToBottom() {
      if (thoughtScroll) thoughtScroll.scrollTop = thoughtScroll.scrollHeight;
    }
    function nearBottom() {
      if (!thoughtScroll) return true;
      return thoughtScroll.scrollHeight - thoughtScroll.scrollTop
        - thoughtScroll.clientHeight < 24;
    }
    function updateJump() {
      if (!jumpBtn) return;
      if (stuckToBottom || nearBottom()) jumpBtn.classList.remove("is-visible");
      else jumpBtn.classList.add("is-visible");
    }
    function onThoughtScroll() { stuckToBottom = nearBottom(); updateJump(); }

    // Stream a user-facing reasoning summary into the panel. Keeps the indicator
    // alive (the model is still working) and auto-expands the first time so the
    // live thought is visible. Autoscrolls unless the user scrolled up.
    function pushThought(text) {
      if (dismissed || text == null) return;
      buildThoughtUI();
      thoughtText.textContent = String(text);
      if (!openedOnce) { openedOnce = true; expand(); }
      if (stuckToBottom) scrollThoughtToBottom();
      updateJump();
    }

    // Compact inline disclosure — no modal. Outside-click dismiss is attached
    // only while open, so there's no per-message listener leak.
    function onDocClick(e) { if (!root.contains(e.target)) collapse(); }
    function expand() {
      root.classList.add("is-expanded");
      toggle.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onDocClick, true);
      if (stuckToBottom) scrollThoughtToBottom();
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
      setSummary: setSummary, pushThought: pushThought,
      isRunning: function () { return running; }
    };
  }

  window.ThinkingIndicator = { create: create, starburst: starburst };
})();
