/* ==========================================================================
   AgentChat — full-screen landing / auth gate (3D dynamic, black + clay).
   Self-contained: does not depend on app.js internals. Shows a sign in / sign
   up screen with an animated 3D particle field to new users, then reveals the
   main chat once they authenticate or choose to explore.
   Remove the <script src="landing.js"> line and the #landing-screen block in
   index.html to revert to the modal-only auth flow.
   ========================================================================== */
(function () {
  "use strict";

  var screen = document.getElementById("landing-screen");
  if (!screen) return;

  var ENTERED_KEY = "agentchat_entered";
  var TOKEN_KEY = "agentchat_session_token";

  // ----- tiny fetch helper mirroring app.js auth/back-end headers -----------
  function backendBase() {
    return (localStorage.getItem("agentchat_backend_url") || "").trim().replace(/\/+$/, "");
  }
  function authHeaders(extra) {
    var h = extra || {};
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) { h["Authorization"] = "Bearer " + token; h["X-User-Session"] = token; }
    var pw = localStorage.getItem("agentchat_access_password") || "";
    if (pw) h["X-Access-Password"] = pw;
    return h;
  }
  function api(url, options) {
    options = options || {};
    options.headers = authHeaders(options.headers || {});
    var base = backendBase();
    var full = (url.charAt(0) === "/" && base) ? base + url : url;
    return fetch(full, options);
  }

  // ----- gate: decide whether the landing should show -----------------------
  function hideLanding() {
    screen.classList.add("landing-hidden");
    // fully remove from tab order after the fade
    setTimeout(function () { screen.style.display = "none"; stopAnim(); }, 480);
  }
  function revealApp() {
    localStorage.setItem(ENTERED_KEY, "1");
    hideLanding();
  }

  // If they already have a session token or previously entered, skip the gate.
  var hasToken = !!localStorage.getItem(TOKEN_KEY);
  var entered = localStorage.getItem(ENTERED_KEY) === "1";
  if (hasToken || entered) { hideLanding(); }

  // ----- form: sign in / create account -------------------------------------
  var mode = "login";
  var tabs = document.getElementById("lp-tabs");
  var headline = document.getElementById("lp-headline");
  var sub = document.getElementById("lp-sub");
  var nameField = document.getElementById("lp-name-field");
  var submitBtn = document.getElementById("lp-submit");
  var alertBox = document.getElementById("lp-alert");
  var form = document.getElementById("lp-form");

  function setMode(m) {
    mode = m;
    if (tabs) {
      Array.prototype.forEach.call(tabs.querySelectorAll(".landing-tab"), function (t) {
        t.classList.toggle("active", t.getAttribute("data-mode") === m);
      });
    }
    if (m === "register") {
      headline.textContent = "Create your account";
      sub.textContent = "One account syncs your chats, keys and models everywhere.";
      nameField.classList.remove("hidden");
      submitBtn.textContent = "Create account";
    } else {
      headline.textContent = "Welcome back";
      sub.textContent = "Sign in to sync your chats, keys and models across every device.";
      nameField.classList.add("hidden");
      submitBtn.textContent = "Sign in";
    }
    hideAlert();
  }
  function showAlert(msg, ok) {
    alertBox.textContent = msg;
    alertBox.classList.remove("hidden");
    alertBox.classList.toggle("lp-alert-ok", !!ok);
  }
  function hideAlert() { alertBox.classList.add("hidden"); alertBox.classList.remove("lp-alert-ok"); }

  if (tabs) {
    tabs.addEventListener("click", function (e) {
      var btn = e.target.closest(".landing-tab");
      if (btn) setMode(btn.getAttribute("data-mode"));
    });
  }

  function onAuthSuccess(data) {
    if (data && data.token) localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ENTERED_KEY, "1");
    // Reload so app.js re-inits cleanly with the session (applies cloud profile).
    location.reload();
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideAlert();
      var email = (document.getElementById("lp-email").value || "").trim();
      var password = document.getElementById("lp-password").value || "";
      var name = (document.getElementById("lp-name").value || "").trim();
      if (!email || !password) { showAlert("Enter your email and password."); return; }

      submitBtn.disabled = true;
      var original = submitBtn.textContent;
      submitBtn.textContent = "Please wait…";

      var endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      var payload = { email: email, password: password };
      if (mode === "register" && name) payload.name = name;

      api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); })
        .then(function (data) {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
          if (data && data.success && data.token) {
            onAuthSuccess(data);
          } else {
            showAlert((data && data.error) || "Authentication failed.");
          }
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
          showAlert("Network error: " + err.message);
        });
    });
  }

  var guestBtn = document.getElementById("lp-guest");
  if (guestBtn) guestBtn.addEventListener("click", revealApp);

  // ----- Google sign-in -----------------------------------------------------
  var gsiHolder = document.getElementById("lp-gsi-holder");
  var googleBtn = document.getElementById("lp-google-btn");
  var googleNote = document.getElementById("lp-google-note");
  var _clientId = null;

  function getClientId() {
    if (_clientId !== null) return Promise.resolve(_clientId);
    return api("/api/health").then(function (r) { return r.json(); })
      .then(function (d) { _clientId = (d && d.google_client_id) || ""; return _clientId; })
      .catch(function () { _clientId = ""; return ""; });
  }

  function submitGoogle(credential) {
    api("/api/auth/social-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", credential: credential })
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success && data.token) onAuthSuccess(data);
        else showAlert((data && data.error) || "Google sign-in failed.");
      })
      .catch(function (err) { showAlert("Google error: " + err.message); });
  }

  function initGoogle() {
    getClientId().then(function (clientId) {
      if (!clientId) {
        // Not configured on the server — keep email sign-in, explain the button.
        if (googleBtn) googleBtn.classList.add("hidden");
        if (googleNote) {
          googleNote.textContent = "Google sign-in isn't set up on this server yet — use email, or set GOOGLE_CLIENT_ID.";
          googleNote.classList.remove("hidden");
        }
        return;
      }
      if (!(window.google && window.google.accounts && window.google.accounts.id)) {
        // GSI script not ready yet — retry briefly.
        setTimeout(initGoogle, 400);
        return;
      }
      try {
        window.google.accounts.id.initialize({ client_id: clientId, callback: function (resp) {
          if (resp && resp.credential) submitGoogle(resp.credential);
        }});
        if (gsiHolder) {
          gsiHolder.innerHTML = "";
          window.google.accounts.id.renderButton(gsiHolder, {
            theme: "filled_black", size: "large", width: 320, text: "continue_with", shape: "pill"
          });
          gsiHolder.classList.add("lp-gsi-ready");
          if (googleBtn) googleBtn.classList.add("hidden"); // use the official rendered button
        }
      } catch (err) {
        // Fall back to our styled button triggering the One Tap prompt.
        if (googleBtn) googleBtn.addEventListener("click", function () {
          try { window.google.accounts.id.prompt(); } catch (e) {}
        });
      }
    });
  }
  // Our custom button, before GSI renders, triggers the prompt.
  if (googleBtn) googleBtn.addEventListener("click", function () {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try { window.google.accounts.id.prompt(); return; } catch (e) {}
    }
  });
  if (!hasToken && !entered) initGoogle();

  // ----- 3D dynamic background (canvas particle field, clay + black) --------
  var canvas = document.getElementById("landing-canvas");
  var ctx = canvas ? canvas.getContext("2d") : null;
  var raf = null, W = 0, H = 0, points = [], t = 0;
  var mouseX = 0, mouseY = 0, tmx = 0, tmy = 0;

  function resize() {
    if (!canvas) return;
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function build() {
    points = [];
    var n = Math.min(220, Math.floor((W * H) / 9000));
    for (var i = 0; i < n; i++) {
      points.push({
        x: (Math.random() * 2 - 1),
        y: (Math.random() * 2 - 1),
        z: (Math.random() * 2 - 1),
        r: Math.random() * 1.6 + 0.4
      });
    }
  }
  function draw() {
    if (!ctx) return;
    t += 0.0016;
    tmx += (mouseX - tmx) * 0.05;
    tmy += (mouseY - tmy) * 0.05;
    ctx.clearRect(0, 0, W, H);

    var cx = W / 2, cy = H / 2;
    var focal = Math.min(W, H) * 0.9;
    var rotY = t + tmx * 0.6;
    var rotX = tmy * 0.5;
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    var spread = Math.min(W, H) * 0.42;

    var projected = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var x = p.x * spread, y = p.y * spread, z = p.z * spread;
      // rotate around Y then X
      var x1 = x * cosY - z * sinY;
      var z1 = x * sinY + z * cosY;
      var y1 = y * cosX - z1 * sinX;
      var z2 = y * sinX + z1 * cosX;
      var scale = focal / (focal + z2 + spread);
      projected.push({
        sx: cx + x1 * scale,
        sy: cy + y1 * scale,
        s: scale,
        r: p.r
      });
    }
    // connective lines (near pairs) — faint clay web
    for (var a = 0; a < projected.length; a++) {
      for (var b = a + 1; b < projected.length; b++) {
        var dx = projected[a].sx - projected[b].sx;
        var dy = projected[a].sy - projected[b].sy;
        var d2 = dx * dx + dy * dy;
        if (d2 < 9000) {
          var alpha = (1 - d2 / 9000) * 0.14 * ((projected[a].s + projected[b].s) / 2);
          ctx.strokeStyle = "rgba(217,119,87," + alpha.toFixed(3) + ")";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(projected[a].sx, projected[a].sy);
          ctx.lineTo(projected[b].sx, projected[b].sy);
          ctx.stroke();
        }
      }
    }
    // particles
    for (var k = 0; k < projected.length; k++) {
      var pr = projected[k];
      var rad = pr.r * pr.s * 1.6;
      var glow = 0.35 + pr.s * 0.5;
      ctx.beginPath();
      ctx.fillStyle = "rgba(224,135,95," + Math.min(0.9, glow).toFixed(3) + ")";
      ctx.arc(pr.sx, pr.sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }
  function startAnim() {
    if (!ctx) return;
    resize(); build(); if (!raf) raf = requestAnimationFrame(draw);
  }
  function stopAnim() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  window.addEventListener("resize", function () { resize(); build(); });
  window.addEventListener("mousemove", function (e) {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  });

  if (!hasToken && !entered) { setMode("login"); startAnim(); }
})();
