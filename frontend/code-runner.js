/* ==========================================================================
   AgentChat — Code runner (self-contained, additive)
   Adds a "▶ Run" button to runnable assistant code blocks (js / html / python)
   and an Output console tab in the workspace panel.
     • JS + HTML run in the workspace's sandboxed iframe (no same-origin), with
       console.log / errors captured back into the Output pane.
     • Python runs in a Web Worker via Pyodide, lazily loaded from CDN on first
       use (~10MB, shown as a loading state). The worker isolates Python from
       the page DOM and cookies.
   NOTHING runs on the server — this is purely client-side by design (a
   server-side "run this" endpoint would be a remote-code-execution hole).
   Loaded AFTER artifacts.js. Remove the <script> tag to disable running.
   ========================================================================== */
(function () {
  "use strict";
  try {
    function getWS() { return window.AgentWorkspace || null; }
    var activePre = null, activeBtn = null, curPyOut = null;

    function appendLine(el, kind, text) {
      if (!el) return;
      var line = document.createElement("span");
      line.className = "agc-out-line agc-out-" + (kind || "log");
      line.textContent = text;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    }

    function readCode(pre) {
      var W = getWS();
      if (W && W.readCode) return W.readCode(pre);
      var c = pre.querySelector("code");
      return c ? (c.textContent || "") : "";
    }

    // Returns { el, reveal }. Uses the shared workspace Output view when present,
    // otherwise falls back to an inline console box beneath the code block.
    function outputConsole(pre) {
      var W = getWS();
      if (W) {
        var v = W.addView({ id: "output", label: "Output", order: 15 });
        var el = v.pane.querySelector(".agc-output");
        if (!el) { el = document.createElement("pre"); el.className = "agc-output"; v.pane.appendChild(el); }
        el.innerHTML = "";
        return { el: el, reveal: function () { W.open("output"); } };
      }
      var box = pre.nextElementSibling && pre.nextElementSibling.classList && pre.nextElementSibling.classList.contains("agc-output-inline")
        ? pre.nextElementSibling : null;
      if (!box) { box = document.createElement("pre"); box.className = "agc-output agc-output-inline"; pre.after(box); }
      box.innerHTML = "";
      return { el: box, reveal: function () { box.scrollIntoView({ block: "nearest" }); } };
    }
    // ---- Languages we offer a Run button for ----
    var RUNNABLE = { js: 1, javascript: 1, html: 1, python: 1, py: 1 };

    // Console shim injected into the sandboxed iframe. It mirrors console.* and
    // errors back via postMessage. The frame is allow-scripts WITHOUT
    // allow-same-origin, so run code can't reach our cookies / DOM / storage.
    function consoleShim() {
      return '<script>(function(){' +
        'function s(k,a){parent.postMessage({__agcRun:1,k:k,t:' +
        'Array.prototype.map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")},"*");}' +
        'var c=window.console||{};["log","info","warn","error"].forEach(function(m){var o=c[m]?c[m].bind(c):function(){};c[m]=function(){s(m,arguments);o.apply(c,arguments);};});window.console=c;' +
        'window.onerror=function(m,src,l){s("error",[m+(l?" (line "+l+")":"")]);return false;};' +
        'window.addEventListener("unhandledrejection",function(e){s("error",["Unhandled rejection: "+((e.reason&&e.reason.message)||e.reason)]);});' +
        '})();<\/script>';
    }

    // Run JS or HTML inside the workspace iframe. kind = "js" | "html".
    function runInFrame(kind, code, out) {
      var W = getWS();
      if (!W || !W.frame) { appendLine(out.el, "error", "Workspace frame unavailable."); return; }
      var shim = consoleShim(), html;
      if (kind === "html") {
        if (/<head[\s>]/i.test(code)) html = code.replace(/<head([\s>])/i, "<head$1" + shim);
        else if (/<html[\s>]/i.test(code)) html = code.replace(/(<html[^>]*>)/i, "$1" + shim);
        else html = '<!doctype html><meta charset="utf-8">' + shim + code;
      } else {
        html = '<!doctype html><meta charset="utf-8">' + shim +
          '<script>try{\n' + code + '\n}catch(e){console.error((e&&e.message)||e);}<\/script>';
      }
      var handler = function (ev) {
        var d = ev.data;
        if (!d || !d.__agcRun) return;
        appendLine(out.el, d.k === "log" ? "log" : d.k, d.t);
      };
      window.addEventListener("message", handler);
      W.frame.srcdoc = html;
      if (kind === "html") { W.open("preview"); W.showView("preview"); appendLine(out.el, "status", "Rendered in Preview — console output below."); }
      setTimeout(function () { window.removeEventListener("message", handler); }, 30000);
    }
    // ---- Python via Pyodide in a Web Worker (lazy, fully client-side) ----
    var pyWorker = null, pyBooted = false;
    function pyWorkerSource() {
      return [
        'var ready;',
        'self.onmessage=async function(e){',
        '  if(!e.data||e.data.type!=="run")return;',
        '  try{',
        '    if(!ready){',
        '      importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js");',
        '      self.py=await loadPyodide();',
        '      self.py.setStdout({batched:function(s){self.postMessage({type:"out",kind:"log",text:s});}});',
        '      self.py.setStderr({batched:function(s){self.postMessage({type:"out",kind:"error",text:s});}});',
        '      ready=true; self.postMessage({type:"ready"});',
        '    }',
        '    var r=await self.py.runPythonAsync(e.data.code);',
        '    self.postMessage({type:"done",result:(r===undefined||r===null)?null:String(r)});',
        '  }catch(err){',
        '    self.postMessage({type:"out",kind:"error",text:String((err&&err.message)||err)});',
        '    self.postMessage({type:"done",result:null});',
        '  }',
        '};'
      ].join("\n");
    }
    function getPyWorker() {
      if (pyWorker) return pyWorker;
      var blob = new Blob([pyWorkerSource()], { type: "application/javascript" });
      pyWorker = new Worker(URL.createObjectURL(blob));
      return pyWorker;
    }
    function resetBtn(btn) { if (btn) { btn.disabled = false; btn.textContent = "▶ Run"; } }
    function runPython(code, out, btn) {
      var w;
      try { w = getPyWorker(); }
      catch (e) { appendLine(out.el, "error", "Web Worker unavailable: " + ((e && e.message) || e)); resetBtn(btn); return; }
      if (!pyBooted) appendLine(out.el, "status", "Loading Python runtime (Pyodide, first run only)…");
      var handler = function (ev) {
        var d = ev.data || {};
        if (d.type === "ready") { pyBooted = true; appendLine(out.el, "status", "Python ready — running…"); }
        else if (d.type === "out") appendLine(out.el, d.kind, d.text);
        else if (d.type === "done") {
          if (d.result != null && d.result !== "None") appendLine(out.el, "result", "⇒ " + d.result);
          w.removeEventListener("message", handler);
          resetBtn(btn);
        }
      };
      w.addEventListener("message", handler);
      w.postMessage({ type: "run", code: code });
    }
    // ---- Inject a ▶ Run button onto runnable assistant code blocks ----
    function injectRun(pre) {
      if (!pre || pre.dataset.agcRun) return;
      var codeNode = pre.querySelector("code");
      if (!codeNode || !pre.closest(".assistant-bubble")) return;
      var W = getWS();
      var lang = ((W && W.langOf ? W.langOf(pre) : (pre.getAttribute("data-lang") || "")) || "").toLowerCase();
      if (!RUNNABLE[lang]) return;
      pre.dataset.agcRun = "1";
      var norm = (lang === "javascript") ? "js" : (lang === "py" ? "python" : lang);
      var btn = document.createElement("button");
      btn.className = "artifact-run-btn";
      btn.textContent = "▶ Run";
      btn.title = "Run this " + norm + " client-side, sandboxed";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var code = readCode(pre);
        if (!code.trim()) return;
        var out = outputConsole(pre);
        if (norm !== "html") out.reveal();
        appendLine(out.el, "status", "Running " + norm + "…");
        if (norm === "python") { btn.disabled = true; btn.textContent = "Running…"; runPython(code, out, btn); }
        else runInFrame(norm, code, out);
      });
      var header = pre.querySelector(".code-header");
      if (header) header.appendChild(btn);
      else { pre.style.position = "relative"; btn.classList.add("floating"); pre.appendChild(btn); }
    }

    function scan(root) {
      if (!root) return;
      if (root.matches && root.matches("pre")) injectRun(root);
      if (root.querySelectorAll) root.querySelectorAll("pre").forEach(injectRun);
    }

    var list = document.getElementById("messages-list");
    if (list) {
      scan(list);
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
          if (m.type === "childList" && m.target && m.target.nodeType === 1) scan(m.target);
        });
      }).observe(list, { childList: true, subtree: true });
    }
  } catch (err) {
    console.log("[code-runner] disabled:", err);
  }
})();
