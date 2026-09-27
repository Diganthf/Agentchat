/* ==========================================================================
   AgentChat — voice input (speech-to-text) for the composer
   Adds a mic button next to the attach button. Uses the browser's built-in
   Web Speech API (SpeechRecognition) — free, no API key, no server round-trip.
   Dictated text is inserted into #user-input.

   The button is ALWAYS shown. If dictation can't actually run — the browser has
   no SpeechRecognition (e.g. Firefox), the page is served over a non-secure
   origin, or the mic permission is blocked — clicking surfaces a short visible
   reason (a pill above the button) instead of silently doing nothing, which was
   the old behavior that made failures impossible to diagnose on a laptop.
   Additive + self-contained. Remove the <script> tag to disable.
   ========================================================================== */
(function () {
  "use strict";

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Secure context is required by SpeechRecognition/getUserMedia. https is fine;
  // so is localhost/127.0.0.1. A plain-http LAN origin (http://192.168.x.x) is
  // NOT — that's the common "works on my machine, not on the laptop" trap.
  function secureOK() {
    if (window.isSecureContext) return true;
    var h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  }

  function injectStyleOnce() {
    if (document.getElementById("voice-input-style")) return;
    var s = document.createElement("style");
    s.id = "voice-input-style";
    s.textContent =
      ".voice-input-hint{position:fixed;transform:translateY(-100%);z-index:9999;" +
      "max-width:280px;padding:8px 12px;border-radius:10px;font-size:12.5px;" +
      "line-height:1.35;background:#30302E;color:#F2F0EA;border:1px solid #3A3836;" +
      "box-shadow:0 6px 20px rgba(0,0,0,.28);opacity:0;pointer-events:none;" +
      "transition:opacity .18s ease;}" +
      ".voice-input-hint.show{opacity:1;}" +
      ".voice-input-hint.error{background:#4a2420;border-color:#7a3a30;color:#ffd9d2;}";
    document.head.appendChild(s);
  }

  function init() {
    var left = document.querySelector(".input-left-buttons");
    var input = document.getElementById("user-input");
    if (!left || !input || document.getElementById("voice-input-btn")) return;

    injectStyleOnce();

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

    // ---- Visible feedback pill (auto-dismiss), anchored above the mic ----
    var hintTimer = null;
    function showHint(msg, isError) {
      var pill = document.getElementById("voice-input-hint");
      if (!pill) {
        pill = document.createElement("div");
        pill.id = "voice-input-hint";
        pill.className = "voice-input-hint";
        document.body.appendChild(pill);
      }
      pill.textContent = msg;
      pill.classList.toggle("error", !!isError);
      var r = btn.getBoundingClientRect();
      pill.style.left = Math.round(r.left) + "px";
      pill.style.top = Math.round(r.top - 8) + "px";
      pill.classList.add("show");
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { pill.classList.remove("show"); }, 4500);
    }
    // PLACEHOLDER_REST

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

    function beginRecognition() {
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
          var err = ev && ev.error;
          console.log("[voice-input] error:", err);
          if (err === "aborted") { setListening(false); return; } // user-initiated stop
          var msg;
          if (err === "not-allowed" || err === "service-not-allowed")
            msg = "Microphone blocked. Allow mic access in your browser's site settings, then try again.";
          else if (err === "no-speech")
            msg = "Didn't catch that — no speech detected. Try again.";
          else if (err === "audio-capture")
            msg = "No microphone found. Check that one is connected and not in use.";
          else if (err === "network")
            msg = "Network error during dictation. Check your connection.";
          else
            msg = "Voice input error: " + (err || "unknown") + ".";
          showHint(msg, true);
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
        showHint("Couldn't start voice input: " + (e && e.message ? e.message : e), true);
        setListening(false);
      }
    }

    function start() {
      // Guard the two silent-failure modes up front with a visible reason.
      if (!SR) { showHint("Voice input isn't supported in this browser. Try Chrome or Edge.", true); return; }
      if (!secureOK()) { showHint("Voice input needs a secure (https) connection — it won't work over plain http.", true); return; }

      // Explicitly request the mic first so a denied/absent device yields a clear
      // message via the getUserMedia error names, instead of a bare SR onerror.
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          // Release the probe stream immediately; SpeechRecognition opens its own.
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          beginRecognition();
        }).catch(function (err) {
          var name = err && err.name;
          if (name === "NotAllowedError" || name === "SecurityError")
            showHint("Microphone blocked. Click the mic/lock icon in the address bar to allow access, then try again.", true);
          else if (name === "NotFoundError" || name === "DevicesNotFoundError")
            showHint("No microphone found. Check that one is connected.", true);
          else
            showHint("Couldn't access the microphone" + (name ? " (" + name + ")" : "") + ".", true);
          setListening(false);
        });
      } else {
        beginRecognition();
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
