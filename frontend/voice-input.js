/* ==========================================================================
   AgentChat — voice input (speech-to-text) for the composer
   Adds a mic button next to the attach button. Uses the browser's built-in
   Web Speech API (SpeechRecognition) — free, no API key, no server round-trip.
   Dictated text is inserted into #user-input. Feature-detected: if the browser
   has no SpeechRecognition (e.g. Firefox/Zen without it), the button is not
   added at all. Additive + self-contained. Remove the <script> tag to disable.
   ========================================================================== */
(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { console.log("[voice-input] SpeechRecognition not supported; skipping."); return; }

  function init() {
    var left = document.querySelector(".input-left-buttons");
    var input = document.getElementById("user-input");
    if (!left || !input || document.getElementById("voice-input-btn")) return;

    var btn = document.createElement("button");
    btn.id = "voice-input-btn";
    btn.type = "button";
    btn.className = "action-circle-btn voice-input-btn";
    btn.title = "Voice input (dictate your message)";
    btn.setAttribute("aria-label", "Start voice input");
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>' +
      '<line x1="12" y1="19" x2="12" y2="23"></line>' +
      '<line x1="8" y1="23" x2="16" y2="23"></line></svg>';
    // Place the mic right after the attach button.
    var attach = document.getElementById("attach-btn");
    if (attach && attach.nextSibling) left.insertBefore(btn, attach.nextSibling);
    else left.appendChild(btn);

    var rec = null;
    var listening = false;
    var baseText = "";        // text already in the box when dictation started
    var finalChunk = "";      // accumulated finalized transcript this session

    function setListening(on) {
      listening = on;
      btn.classList.toggle("listening", on);
      btn.title = on ? "Stop dictation" : "Voice input (dictate your message)";
    }

    function fireInput() {
      // Let app.js autoresize/other handlers react.
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function start() {
      try {
        rec = new SR();
        rec.lang = navigator.language || "en-US";
        rec.continuous = true;
        rec.interimResults = true;

        baseText = input.value ? input.value.replace(/\s*$/, "") + " " : "";
        finalChunk = "";

        rec.onresult = function (e) {
          var interim = "";
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalChunk += t;
            else interim += t;
          }
          input.value = (baseText + finalChunk + interim).trimStart();
          fireInput();
        };
        rec.onerror = function (ev) {
          console.log("[voice-input] error:", ev.error);
          // "not-allowed" = mic permission denied; "no-speech" = silence.
          setListening(false);
          try { rec.stop(); } catch (e) {}
        };
        rec.onend = function () {
          // Auto-restart if the engine stops mid-session while still listening.
          if (listening) { try { rec.start(); return; } catch (e) {} }
          setListening(false);
        };

        rec.start();
        setListening(true);
        input.focus();
      } catch (e) {
        console.log("[voice-input] start failed:", e);
        setListening(false);
      }
    }

    function stop() {
      setListening(false);
      if (rec) { try { rec.stop(); } catch (e) {} }
    }

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (listening) stop(); else start();
    });
    // Stop dictation if the user sends (Enter without Shift) so it doesn't linger.
    input.addEventListener("keydown", function (e) {
      if (listening && e.key === "Enter" && !e.shiftKey) stop();
    });
  }

  // Composer may be built during app.js init; wait briefly for it.
  var tries = 0;
  (function waitReady() {
    if (document.querySelector(".input-left-buttons") && document.getElementById("user-input")) init();
    else if (tries++ < 40) setTimeout(waitReady, 150);
  })();
})();
