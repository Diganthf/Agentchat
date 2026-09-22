/* ==========================================================================
   AgentChat — landing experience controller
   - Gates the app behind a scrollable landing page for new visitors.
   - Drives a WebGL (three.js) particle field with mouse + scroll interaction,
     degrading to a canvas-2D field on weak devices / reduced-motion / no WebGL.
   - Wires nav, smooth-scroll, reveal-on-scroll, card tilt, and the slide-in
     auth panel to the EXISTING endpoints (/api/auth/login|register|social-login).
   Self-contained: does not depend on app.js internals.
   ========================================================================== */
(function () {
  "use strict";

  var screenEl = document.getElementById("landing-screen");
  if (!screenEl) return;

  var TOKEN_KEY = "agentchat_session_token";
  var ENTERED_KEY = "agentchat_entered";
  var prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- consume OAuth redirect fragment (#auth_token=… / #auth_error=…) ----------
  // GitHub sign-in bounces the browser back to "/#auth_token=<session>". Capture
  // it into localStorage (same slot app.js reads), mark the visitor as entered,
  // then scrub the fragment so the token never lingers in the URL/history.
  var pendingAuthError = "";
  (function consumeAuthFragment() {
    var hash = window.location.hash || "";
    if (hash.indexOf("auth_token=") === -1 && hash.indexOf("auth_error=") === -1) return;
    var frag = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    var params = {};
    frag.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > -1) { try { params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {} }
    });
    if (params.auth_token) {
      localStorage.setItem(TOKEN_KEY, params.auth_token);
      localStorage.setItem(ENTERED_KEY, "1");
    }
    if (params.auth_error) pendingAuthError = params.auth_error;
    try {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (e) { window.location.hash = ""; }
  })();

  // ---------- tiny fetch helper (mirrors app.js auth/back-end headers) ----------
  function backendBase() {
    return (localStorage.getItem("agentchat_backend_url") || "").trim().replace(/\/+$/, "");
  }
  function api(url, options) {
    options = options || {};
    var h = options.headers || {};
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) { h["Authorization"] = "Bearer " + token; h["X-User-Session"] = token; }
    var pw = localStorage.getItem("agentchat_access_password") || "";
    if (pw) h["X-Access-Password"] = pw;
    options.headers = h;
    var base = backendBase();
    var full = (url.charAt(0) === "/" && base) ? base + url : url;
    return fetch(full, options);
  }

  // ---------- gate ----------
  var hasToken = !!localStorage.getItem(TOKEN_KEY);
  var entered = localStorage.getItem(ENTERED_KEY) === "1";

  function hideLanding() {
    screenEl.classList.add("landing-hidden");
    setTimeout(function () { screenEl.style.display = "none"; teardown(); }, 520);
  }
  function revealApp() { localStorage.setItem(ENTERED_KEY, "1"); hideLanding(); }
  function onAuthSuccess(data) {
    if (data && data.token) localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ENTERED_KEY, "1");
    location.reload(); // let app.js re-init cleanly with the session
  }

  var active = !(hasToken || entered);
  if (!active) { hideLanding(); }

  // =====================================================================
  //  NAV + SMOOTH SCROLL + MOBILE MENU
  // =====================================================================
  var nav = document.getElementById("lp-nav");
  var navLinks = document.getElementById("lp-nav-links");
  var navToggle = document.getElementById("lp-nav-toggle");

  function scrollToSel(sel) {
    var target = document.querySelector(sel);
    if (!target) return;
    var top = target.getBoundingClientRect().top + screenEl.scrollTop - 64;
    screenEl.scrollTo({ top: Math.max(0, top), behavior: prefersReduced ? "auto" : "smooth" });
  }
  document.querySelectorAll("#landing-screen [data-scroll]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      if (href && href.charAt(0) === "#") {
        e.preventDefault();
        scrollToSel(href);
        if (navLinks) navLinks.classList.remove("open");
      }
    });
  });
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () { navLinks.classList.toggle("open"); });
  }

  // =====================================================================
  //  AUTH PANEL
  // =====================================================================
  var authPanel = document.getElementById("lp-auth-panel");
  var authOverlay = document.getElementById("lp-auth-overlay");
  var authClose = document.getElementById("lp-auth-close");
  var tabs = document.getElementById("lp-tabs");
  var headline = document.getElementById("lp-headline");
  var sub = document.getElementById("lp-sub");
  var nameField = document.getElementById("lp-name-field");
  var submitBtn = document.getElementById("lp-submit");
  var alertBox = document.getElementById("lp-alert");
  var form = document.getElementById("lp-form");
  var mode = "login";
  var googleInited = false;

  function setMode(m) {
    mode = m;
    if (tabs) tabs.querySelectorAll(".landing-tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-mode") === m);
    });
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
  function showAlert(msg, ok) { alertBox.textContent = msg; alertBox.classList.remove("hidden"); alertBox.classList.toggle("lp-alert-ok", !!ok); }
  function hideAlert() { alertBox.classList.add("hidden"); alertBox.classList.remove("lp-alert-ok"); }

  function openAuth(m) {
    setMode(m || "login");
    if (authPanel) { authPanel.classList.add("open"); authPanel.setAttribute("aria-hidden", "false"); }
    if (authOverlay) authOverlay.classList.add("open");
    if (!googleInited) { googleInited = true; initGoogle(); }
    var emailEl = document.getElementById("lp-email");
    setTimeout(function () { if (emailEl) emailEl.focus(); }, 260);
  }
  function closeAuth() {
    if (authPanel) { authPanel.classList.remove("open"); authPanel.setAttribute("aria-hidden", "true"); }
    if (authOverlay) authOverlay.classList.remove("open");
  }

  if (tabs) tabs.addEventListener("click", function (e) {
    var b = e.target.closest(".landing-tab"); if (b) setMode(b.getAttribute("data-mode"));
  });
  if (authClose) authClose.addEventListener("click", closeAuth);
  if (authOverlay) authOverlay.addEventListener("click", closeAuth);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAuth(); });

  function bind(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener("click", fn); }
  bind("lp-nav-signin", function () { openAuth("login"); });
  bind("lp-nav-start", function () { openAuth("register"); });
  bind("lp-hero-start", function () { openAuth("register"); });
  bind("lp-final-start", function () { openAuth("register"); });
  bind("lp-hero-explore", function () { scrollToSel("#lp-about"); });
  bind("lp-scroll-cue", function () { scrollToSel("#lp-about"); });
  bind("lp-guest", revealApp);
  bind("lp-final-guest", revealApp);

  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault(); hideAlert();
    var email = (document.getElementById("lp-email").value || "").trim();
    var password = document.getElementById("lp-password").value || "";
    var name = (document.getElementById("lp-name").value || "").trim();
    if (!email || !password) { showAlert("Enter your email and password."); return; }
    submitBtn.disabled = true; var orig = submitBtn.textContent; submitBtn.textContent = "Please wait…";
    var endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    var payload = { email: email, password: password };
    if (mode === "register" && name) payload.name = name;
    api(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        submitBtn.disabled = false; submitBtn.textContent = orig;
        if (data && data.success && data.token) onAuthSuccess(data);
        else showAlert((data && data.error) || "Authentication failed.");
      })
      .catch(function (err) { submitBtn.disabled = false; submitBtn.textContent = orig; showAlert("Network error: " + err.message); });
  });

  // ---------- Google sign-in ----------
  var gsiHolder = document.getElementById("lp-gsi-holder");
  var googleBtn = document.getElementById("lp-google-btn");
  var googleNote = document.getElementById("lp-google-note");
  var _clientId = null;
  var _healthPromise = null;
  function getHealth() {
    if (_healthPromise) return _healthPromise;
    _healthPromise = api("/api/health").then(function (r) { return r.json(); }).catch(function () { return {}; });
    return _healthPromise;
  }
  function getClientId() {
    if (_clientId !== null) return Promise.resolve(_clientId);
    return getHealth().then(function (d) { _clientId = (d && d.google_client_id) || ""; return _clientId; });
  }
  function submitGoogle(credential) {
    api("/api/auth/social-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google", credential: credential }) })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data && data.success && data.token) onAuthSuccess(data); else showAlert((data && data.error) || "Google sign-in failed."); })
      .catch(function (err) { showAlert("Google error: " + err.message); });
  }
  function initGoogle() {
    getClientId().then(function (clientId) {
      if (!clientId) {
        if (googleBtn) googleBtn.classList.add("hidden");
        if (googleNote) { googleNote.textContent = "Google sign-in isn't set up on this server yet — use email, or set GOOGLE_CLIENT_ID."; googleNote.classList.remove("hidden"); }
        return;
      }
      if (!(window.google && window.google.accounts && window.google.accounts.id)) { setTimeout(initGoogle, 400); return; }
      try {
        window.google.accounts.id.initialize({ client_id: clientId, callback: function (resp) { if (resp && resp.credential) submitGoogle(resp.credential); } });
        if (gsiHolder) {
          gsiHolder.innerHTML = "";
          window.google.accounts.id.renderButton(gsiHolder, { theme: "filled_black", size: "large", width: 320, text: "continue_with", shape: "pill" });
          if (googleBtn) googleBtn.classList.add("hidden");
        }
      } catch (err) { /* keep our styled button as prompt trigger */ }
    });
  }
  if (googleBtn) googleBtn.addEventListener("click", function () {
    if (window.google && window.google.accounts && window.google.accounts.id) { try { window.google.accounts.id.prompt(); } catch (e) {} }
  });

  // ---------- GitHub sign-in ----------
  // Server-side authorization-code flow: the button is just a top-level
  // navigation to /api/auth/github/start, which 302s to GitHub. It stays hidden
  // unless the server reports github_enabled (client id + secret configured).
  var githubBtn = document.getElementById("lp-github-btn");
  if (githubBtn) {
    githubBtn.addEventListener("click", function () {
      window.location.href = (backendBase() || "") + "/api/auth/github/start";
    });
    getHealth().then(function (d) {
      if (d && d.github_enabled) githubBtn.classList.remove("hidden");
      else githubBtn.classList.add("hidden");
    });
  }

  // Surface an OAuth error carried back in the URL fragment (e.g. the user
  // denied access, or state didn't verify) once the panel machinery exists.
  if (pendingAuthError) {
    var _ghErrors = {
      github_denied: "GitHub sign-in was cancelled.",
      github_state_mismatch: "GitHub sign-in expired or could not be verified. Please try again.",
      github_no_email: "Your GitHub account has no verified email we can use.",
      github_not_configured: "GitHub sign-in isn't set up on this server.",
      github_no_code: "GitHub sign-in was interrupted. Please try again.",
      github_token: "Could not complete GitHub sign-in. Please try again.",
      github_failed: "Could not complete GitHub sign-in. Please try again."
    };
    openAuth("login");
    showAlert(_ghErrors[pendingAuthError] || "Sign-in could not be completed. Please try again.");
    pendingAuthError = "";
  }

  // =====================================================================
  //  SCROLL: nav opacity + reveal-on-scroll + drive background
  // =====================================================================
  var scrollProgress = 0; // 0 at hero top, grows as user scrolls
  function onScroll() {
    var st = screenEl.scrollTop;
    if (nav) nav.classList.toggle("scrolled", st > 40);
    var h = window.innerHeight || 800;
    scrollProgress = Math.min(1, st / (h * 1.1));
  }
  screenEl.addEventListener("scroll", onScroll, { passive: true });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { root: screenEl, threshold: 0.14 });
    document.querySelectorAll("#landing-screen .reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll("#landing-screen .reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // ---------- card / preview tilt on hover ----------
  if (!prefersReduced) {
    document.querySelectorAll("#landing-screen [data-tilt]").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(1000px) rotateX(" + (-py * 5).toFixed(2) + "deg) rotateY(" + (px * 6).toFixed(2) + "deg)";
      });
      card.addEventListener("mouseleave", function () { card.style.transform = ""; });
    });
  }

  // =====================================================================
  //  MOUSE (damped, shared by 3D + 2D)
  // =====================================================================
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  window.addEventListener("mousemove", function (e) {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // =====================================================================
  //  BACKGROUND — WebGL (three.js) with canvas-2D fallback
  // =====================================================================
  var canvas = document.getElementById("landing-canvas");
  var raf = null, renderer = null, running = false;
  var mode3d = false;

  function isWeak() {
    var hc = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 4;
    return hc <= 2 || mem <= 2 || window.innerWidth < 560;
  }

  function teardown() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (renderer) { try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {} renderer = null; }
  }

  // ---------------- three.js field ----------------
  function init3D() {
    var THREE = window.THREE;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 340);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);

    // soft circular sprite for glowing points
    var sc = document.createElement("canvas"); sc.width = sc.height = 64;
    var sctx = sc.getContext("2d");
    var g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,220,200,0.9)");
    g.addColorStop(1, "rgba(255,220,200,0)");
    sctx.fillStyle = g; sctx.fillRect(0, 0, 64, 64);
    var sprite = new THREE.CanvasTexture(sc);

    var COUNT = isWeak() ? 900 : (window.innerWidth < 1000 ? 1600 : 2600);
    var home = new Float32Array(COUNT * 3);
    var scatter = new Float32Array(COUNT * 3);
    var pos = new Float32Array(COUNT * 3);
    var col = new Float32Array(COUNT * 3);

    var clayA = [0.851, 0.467, 0.341];   // #d97757
    var clayB = [0.949, 0.788, 0.706];   // warm light
    var dim = [0.42, 0.38, 0.34];

    var R = 120;
    for (var i = 0; i < COUNT; i++) {
      // fibonacci-sphere shell with radial noise → coherent "core"
      var t = i / COUNT;
      var inc = Math.acos(1 - 2 * t);
      var az = Math.PI * (1 + Math.sqrt(5)) * i;
      var rr = R * (0.55 + 0.45 * Math.pow(Math.random(), 0.5));
      var hx = Math.sin(inc) * Math.cos(az) * rr;
      var hy = Math.cos(inc) * rr * 0.82;
      var hz = Math.sin(inc) * Math.sin(az) * rr;
      home[i * 3] = hx; home[i * 3 + 1] = hy; home[i * 3 + 2] = hz;
      // scatter target: large soft cloud
      scatter[i * 3] = (Math.random() * 2 - 1) * 520;
      scatter[i * 3 + 1] = (Math.random() * 2 - 1) * 320;
      scatter[i * 3 + 2] = (Math.random() * 2 - 1) * 520;
      pos[i * 3] = hx; pos[i * 3 + 1] = hy; pos[i * 3 + 2] = hz;
      // colour by depth/random for variety
      var pick = Math.random();
      var c = pick < 0.6 ? clayA : (pick < 0.9 ? clayB : dim);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: isWeak() ? 3.4 : 2.6, map: sprite, vertexColors: true,
      transparent: true, opacity: 0.92, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    var pointsObj = new THREE.Points(geo, mat);
    scene.add(pointsObj);

    var posAttr = geo.getAttribute("position");
    var clock = 0;

    function frame() {
      if (!running) return;
      clock += 0.006;
      tmx += (mx - tmx) * 0.045;
      tmy += (my - tmy) * 0.045;

      // morph: gentle breathing form<->fragment, pushed further by scroll
      var breathe = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(clock * 0.6));
      var m = Math.min(0.92, breathe + scrollProgress * 0.7);
      var arr = posAttr.array;
      for (var i = 0; i < COUNT; i++) {
        var j = i * 3;
        arr[j]     = home[j]     * (1 - m) + scatter[j]     * m;
        arr[j + 1] = home[j + 1] * (1 - m) + scatter[j + 1] * m;
        arr[j + 2] = home[j + 2] * (1 - m) + scatter[j + 2] * m;
      }
      posAttr.needsUpdate = true;

      pointsObj.rotation.y += 0.0016;
      pointsObj.rotation.x = tmy * 0.35;
      pointsObj.rotation.z = tmx * 0.12;

      // camera parallax + gentle push-back on scroll
      camera.position.x += (tmx * 60 - camera.position.x) * 0.05;
      camera.position.y += (-tmy * 40 - camera.position.y) * 0.05;
      camera.position.z = 340 + scrollProgress * 140;
      camera.lookAt(0, 0, 0);

      mat.opacity = 0.92 * (1 - scrollProgress * 0.55);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener("resize", function () {
      if (!renderer) return;
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    running = true; mode3d = true;
    raf = requestAnimationFrame(frame);
  }

  // ---------------- canvas-2D fallback field ----------------
  function init2D() {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var W, H, pts = [];
    function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
    resize();
    var N = isWeak() ? 70 : 150;
    for (var i = 0; i < N; i++) pts.push({ x: Math.random(), y: Math.random(), z: Math.random(), r: Math.random() * 1.6 + 0.4 });
    var t = 0;
    function frame() {
      if (!running) return;
      t += 0.0016; tmx += (mx - tmx) * 0.05; tmy += (my - tmy) * 0.05;
      ctx.clearRect(0, 0, W, H);
      var cx = W / 2 + tmx * 40, cy = H / 2 + tmy * 30;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var ang = t + p.z * 6.28;
        var rad = (60 + p.z * 220) * (1 + scrollProgress * 0.6);
        var x = cx + Math.cos(ang + p.x * 6.28) * rad;
        var y = cy + Math.sin(ang + p.y * 6.28) * rad * 0.6;
        var a = (0.5 - scrollProgress * 0.3) * (0.4 + p.z * 0.6);
        ctx.beginPath();
        ctx.fillStyle = "rgba(224,135,95," + Math.max(0, a).toFixed(3) + ")";
        ctx.arc(x, y, p.r * (1 + p.z), 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener("resize", resize);
    running = true; raf = requestAnimationFrame(frame);
  }

  function startBackground() {
    if (!canvas) return;
    if (prefersReduced) { return; } // static; CSS gradients still provide atmosphere
    try {
      if (window.THREE && !isWeak()) { init3D(); return; }
    } catch (e) { teardown(); }
    // weak device or three.js unavailable → light 2D field
    try { init2D(); } catch (e) {}
  }

  // three.min.js is deferred; it should be ready, but guard + brief retry.
  function boot() {
    if (!active) return;
    setMode("login");
    if (window.THREE || prefersReduced || isWeak()) { startBackground(); return; }
    var tries = 0;
    (function wait() {
      if (window.THREE || tries > 12) { startBackground(); return; }
      tries++; setTimeout(wait, 120);
    })();
  }
  boot();
})();
