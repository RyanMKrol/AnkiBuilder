// Client-side script string constants for the deck dashboard and static deck view.
// Each is a block of vanilla JS held in a template literal (no backticks, no ${}
// interpolation inside) that the server-side render helpers in deckViewChrome.js
// inline into a <script> tag. Moved here verbatim from deckViewChrome.js, which
// keeps the CSS and render helpers and re-exports these for existing importers.

// Vanilla-JS expand/collapse-all wiring (no <script> wrapper). Include on any page with
// <details class="lesson"> sections and #xall / #call buttons.
export const EXPAND_COLLAPSE_SCRIPT = `(function () {
  var all = function () { return document.querySelectorAll("details.lesson"); };
  var setAll = function (open) { all().forEach(function (d) { d.open = open; }); };
  var x = document.getElementById("xall"); if (x) x.addEventListener("click", function () { setAll(true); });
  var c = document.getElementById("call"); if (c) c.addEventListener("click", function () { setAll(false); });
})();`;

// Client wiring for the editor (only included when the dashboard is editable). Reads the deck
// type/id/done from #deckctx; per-row card id/unit from each <tr>'s data-* attributes. Vanilla JS, no
// template literals / ${} (it's embedded in a template literal). Handles: Replace (raw upload) and
// Shared client prelude — the tiny helpers every dashboard script leans on, defined ONCE as
// window.__ab. Each script used to carry its own copy of `jsonp` (five of them) and the
// rebuild-if-done helper (three), which is exactly how the copies drift apart. Loaded FIRST on any
// page that loads the scripts below; on the home page (no #deckctx) `base`/`maybeRebuild` are
// inert and only `jsonp` is used.
export const DASH_PRELUDE_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  var status = document.getElementById("rebuild-status");
  var base = ctx ? "/api/deck/" + encodeURIComponent(ctx.getAttribute("data-type")) + "/" + encodeURIComponent(ctx.getAttribute("data-id")) : null;
  var isDone = !!ctx && ctx.getAttribute("data-done") === "1";
  var jsonp = function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); };
  var setStatus = function (t) { if (status) status.textContent = t; };
  var rebuild = function () {
    setStatus("rebuilding\\u2026");
    return window.fetch(base + "/rebuild", { method: "POST" }).then(jsonp).then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "rebuild failed");
      setStatus("\\u2713 deck rebuilt (" + x.j.noteCount + " cards)");
    }).catch(function (e) { setStatus("rebuild failed: " + e.message); });
  };
  // Put a clip into one of a row's two audio cells. The selector matters: "td.au" alone matches
  // the Original column FIRST (it is rendered in front), so an unqualified query would swap the
  // wrong player and leave the In use column showing the previous take.
  var putAudio = function (tr, sel, url) {
    var cell = tr.querySelector(sel);
    if (!cell || !url) return;
    var a = cell.querySelector("audio");
    if (a) { a.src = url; return; }
    var na = document.createElement("audio"); na.controls = true; na.preload = "none"; na.src = url;
    var x = cell.querySelector(".x"); if (x) { x.replaceWith(na); } else { cell.insertBefore(na, cell.firstChild); }
  };
  // Write into a row's own message span — the non-blocking alternative to alert().
  var rowMsg = function (tr, text) {
    var m = tr && tr.querySelector(".msg");
    if (m) m.textContent = text || "";
  };
  window.__ab = {
    jsonp: jsonp,
    base: base,
    setStatus: setStatus,
    rebuild: rebuild,
    // After an edit: auto-rebuild the group, but only if this lesson is already part of it (done).
    maybeRebuild: function () { return isDone ? rebuild() : Promise.resolve(); },
    putAudio: putAudio,
    swapInUse: function (tr, url) { putAudio(tr, "td.au:not(.au-orig)", url); },
    rowMsg: rowMsg
  };
})();`;

// Generate (ElevenLabs variants in a modal → Use this). There is ONE package per group (the book/course
// merge, or a template's own deck) and rebuilds are FULLY AUTOMATIC — no manual button. After every
// successful edit the group auto-rebuilds, but ONLY when this lesson is already done (data-done="1"),
// so the on-disk .apkg stays current without pointless whole-book rebuilds while you're still finishing
// a fresh lesson (Mark done rebuilds it in). Auditioning is via the inline players; there is no download
// — the dashboard is local, the .apkg is already on disk.
export const DECK_EDIT_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp, put = A.putAudio, swap = A.swapInUse, maybeRebuild = A.maybeRebuild;
  var rowRef = function (el) {
    var tr = el.closest("tr");
    return { tr: tr, cid: tr.getAttribute("data-card-id"), unit: tr.getAttribute("data-unit"),
             msg: tr.querySelector(".msg") };
  };
  // Replace and Generate install a whole NEW recording, so everything the editor reads off the row is
  // now stale: the original it would cut from, any hand-trim range (the server clears it — it
  // described the PREVIOUS recording), and the cleanup chain. Refresh the lot, or the editor silently
  // goes on offering the old take.
  var refreshRow = function (tr, j) {
    swap(tr, j.mediaUrl);
    put(tr, "td.au.au-orig", j.originalUrl);
    if (j.originalUrl) tr.setAttribute("data-original-url", j.originalUrl);
    if (j.audioTrim) {
      tr.setAttribute("data-trim-start", String(j.audioTrim.start));
      tr.setAttribute("data-trim-end", String(j.audioTrim.end));
    } else {
      tr.removeAttribute("data-trim-start");
      tr.removeAttribute("data-trim-end");
    }
    if (j.audioFilter) tr.setAttribute("data-filter", j.audioFilter);
    else tr.removeAttribute("data-filter");
  };
  document.querySelectorAll("input.repl").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var f = inp.files[0]; if (!f) return;
      var r = rowRef(inp); var ext = (f.name.split(".").pop() || "mp3").toLowerCase();
      if (r.msg) r.msg.textContent = "uploading…";
      fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio?ext=" + encodeURIComponent(ext), { method: "POST", body: f })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "upload failed"); refreshRow(r.tr, x.j); if (r.msg) r.msg.textContent = "\\u2713 replaced"; return maybeRebuild(); })
        .catch(function (e) { if (r.msg) r.msg.textContent = e.message; });
      inp.value = "";
    });
  });
  var modal = document.getElementById("gen-modal");
  var closeModal = function () { modal.hidden = true; modal.querySelector(".vlist").innerHTML = ""; };
  var fetchVariants = function (r, path, labels) {
    var opts = { method: "POST" };
    if (labels && labels.length && path === "/generate") {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify({ labels: labels });
    }
    return fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + path, opts)
      .then(jsonp).then(function (x) {
        if (!x.ok) throw new Error(x.j.error || "generation failed");
        return x.j.variants;
      });
  };
  var variantRow = function (r, path, v) {
    var row = document.createElement("div"); row.className = "vrow";
    var lab = document.createElement("span"); lab.className = "vlabel"; lab.textContent = v.kanji ? v.label + " — " + v.kanji : v.label;
    var au = document.createElement("audio"); au.controls = true; au.preload = "none"; au.src = v.mediaUrl;
    var use = document.createElement("button"); use.textContent = "Use this";
    use.addEventListener("click", function () {
      fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio: v.audio, original: v.original || null }) })
        .then(jsonp).then(function (y) { if (!y.ok) throw new Error(y.j.error || "select failed"); refreshRow(r.tr, y.j); closeModal(); if (r.msg) r.msg.textContent = "\\u2713 generated"; return maybeRebuild(); })
        .catch(function (e) { closeModal(); A.rowMsg(r.tr, "select failed: " + e.message); });
    });
    // A fresh roll of THIS take alone — one credit — replacing only this row.
    var reroll = document.createElement("button"); reroll.textContent = "Re-roll";
    reroll.addEventListener("click", function () {
      reroll.disabled = true; reroll.textContent = "\\u2026";
      fetchVariants(r, path, [v.label]).then(function (variants) {
        var fresh = null;
        variants.forEach(function (nv) { if (nv.label === v.label) fresh = nv; });
        if (!fresh && variants.length === 1) fresh = variants[0];
        if (fresh) row.replaceWith(variantRow(r, path, fresh));
        else throw new Error("no matching take came back");
      }).catch(function (e) { reroll.disabled = false; reroll.textContent = "Re-roll"; lab.textContent = v.label + " — re-roll failed: " + e.message; });
    });
    row.appendChild(lab); row.appendChild(au); row.appendChild(use); row.appendChild(reroll);
    return row;
  };
  var openGen = function (btn, path) {
    var r = rowRef(btn); modal.hidden = false;
    var list = modal.querySelector(".vlist"); list.innerHTML = '<div class="spin">Generating variants via ElevenLabs\\u2026</div>';
    fetchVariants(r, path, null).then(function (variants) {
        list.innerHTML = "";
        variants.forEach(function (v) { list.appendChild(variantRow(r, path, v)); });
      })
      .catch(function (e) { list.innerHTML = '<div class="spin"></div>'; list.firstChild.textContent = e.message; });
  };
  // "Keep this clip for the current text." Records a human decision; installs no audio, spends no
  // credits, and the row's badge is only cleared once the server confirms the write. The button
  // removes itself afterwards, so the same card cannot be accepted twice by an impatient double
  // click and the row stops offering an action that no longer applies.
  document.querySelectorAll("button.keep-clip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var r = rowRef(btn);
      btn.disabled = true;
      if (r.msg) r.msg.textContent = "accepting\\u2026";
      fetch(base + "/unit/" + encodeURIComponent(r.unit) + "/card/" + encodeURIComponent(r.cid) + "/audio/accept-text", { method: "POST" })
        .then(jsonp).then(function (x) {
          if (!x.ok) throw new Error(x.j.error || "accept failed");
          var b = r.tr.querySelector(".badge-stale"); if (b) b.remove();
          btn.remove();
          if (r.msg) r.msg.textContent = "\\u2713 kept for current text";
        })
        .catch(function (e) { btn.disabled = false; if (r.msg) r.msg.textContent = e.message; });
    });
  });
  document.querySelectorAll("button.gen").forEach(function (btn) { btn.addEventListener("click", function () { openGen(btn, "/generate"); }); });
  document.querySelectorAll("button.gen-kanji").forEach(function (btn) { btn.addEventListener("click", function () { openGen(btn, "/generate-kanji"); }); });
  modal.querySelector(".close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  // Same affordance as the trim modal.
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
})();`;

// Client wiring for the manual trim editor (included when the audio review is editable). Opens a modal
// showing the card's ORIGINAL take as a waveform with draggable start/end handles; Apply cuts that
// range server-side and the result becomes the clip that ships.
//
// The waveform is computed here rather than server-side: the browser already has to fetch the mp3 to
// play it, and decodeAudioData gives the samples for free — no dependency, no extra round trip, no
// peaks file to keep in step with the audio. One clip is decoded per modal open, so a lesson with
// forty cards doesn't decode forty mp3s to render a page.
//
// Vanilla JS, no template literals / ${} (it's embedded in one). Reads deck ctx from #deckctx and each
// row's card id / unit / original URL / saved range from its data-* attributes.
export const AUDIO_TRIM_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  var modal = document.getElementById("trim-modal");
  if (!ctx || !modal) return;
  if (!window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp, maybeRebuild = A.maybeRebuild, swapInUse = A.swapInUse;
  var PAD = 0.08;        // matches the automatic trim's padSec
  var SPEECH = 0.01;     // amplitude ~= the automatic trim's -40dB noise floor
  var MIN_RANGE = 0.05;  // the server refuses anything shorter

  var wrap = modal.querySelector(".wfwrap");
  var canvas = modal.querySelector("canvas");
  var cutL = modal.querySelector(".wfcut.left");
  var cutR = modal.querySelector(".wfcut.right");
  var hStart = modal.querySelector(".wfhandle.start");
  var hEnd = modal.querySelector(".wfhandle.end");
  var playhead = modal.querySelector(".wfplay");
  var tStart = modal.querySelector(".t-start");
  var tEnd = modal.querySelector(".t-end");
  var tKept = modal.querySelector(".t-kept");
  var msg = modal.querySelector(".trim-msg");
  var revertBtn = modal.querySelector(".trim-revert");
  var audio = new Audio();
  var st = null;

  var fmt = function (n) { return n.toFixed(2) + "s"; };
  var say = function (t, err) { msg.textContent = t || ""; msg.classList.toggle("err", !!err); };

  var draw = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = wrap.clientWidth, h = wrap.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var data = st.samples, mid = h / 2, step = data.length / w;
    g.strokeStyle = "#7a3b36";
    g.lineWidth = 1;
    g.beginPath();
    for (var x = 0; x < w; x++) {
      var from = Math.floor(x * step), to = Math.min(data.length, Math.floor((x + 1) * step));
      var lo = 0, hi = 0;
      for (var i = from; i < to; i++) { var v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.moveTo(x + 0.5, mid - hi * mid * 0.92);
      g.lineTo(x + 0.5, mid - lo * mid * 0.92);
    }
    g.stroke();
    g.strokeStyle = "rgba(35,32,28,.18)";
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  };

  var paint = function () {
    var a = (st.start / st.duration) * 100, b = (st.end / st.duration) * 100;
    cutL.style.left = "0%"; cutL.style.width = a + "%";
    cutR.style.left = b + "%"; cutR.style.width = (100 - b) + "%";
    hStart.style.left = a + "%"; hEnd.style.left = b + "%";
    tStart.textContent = fmt(st.start);
    tEnd.textContent = fmt(st.end);
    tKept.textContent = fmt(st.end - st.start);
  };

  // Where speech starts and stops, by the same standard the automatic trim uses — but applied to BOTH
  // ends, which is the half it never does. A starting point to nudge, not a decision.
  var snap = function () {
    var d = st.samples, rate = st.rate, win = 256;
    var first = -1, last = -1;
    for (var i = 0; i + win <= d.length; i += win) {
      var sum = 0;
      for (var j = i; j < i + win; j++) sum += d[j] * d[j];
      if (Math.sqrt(sum / win) > SPEECH) { if (first < 0) first = i; last = i + win; }
    }
    if (first < 0) { say("no speech found \\u2014 leaving the selection as it is", true); return false; }
    st.start = Math.max(0, first / rate - PAD);
    st.end = Math.min(st.duration, last / rate + PAD);
    paint();
    say("");
    return true;
  };

  var stop = function () { audio.pause(); playhead.classList.remove("on"); };
  var tick = function () {
    if (audio.paused) { playhead.classList.remove("on"); return; }
    if (st.limit != null && audio.currentTime >= st.limit) { stop(); return; }
    playhead.classList.add("on");
    playhead.style.left = (audio.currentTime / st.duration) * 100 + "%";
    window.requestAnimationFrame(tick);
  };
  var play = function (from, to) {
    stop();
    st.limit = to;
    audio.currentTime = from;
    audio.play().then(function () { window.requestAnimationFrame(tick); }).catch(function (e) { say(e.message, true); });
  };

  var drag = function (handle, which) {
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("drag");
      var move = function (ev) {
        var box = wrap.getBoundingClientRect();
        var t = ((ev.clientX - box.left) / box.width) * st.duration;
        t = Math.max(0, Math.min(st.duration, t));
        if (which === "start") st.start = Math.min(t, st.end - MIN_RANGE);
        else st.end = Math.max(t, st.start + MIN_RANGE);
        st.start = Math.max(0, st.start);
        st.end = Math.min(st.duration, st.end);
        paint();
      };
      var up = function () {
        handle.classList.remove("drag");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        commit();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  };
  drag(hStart, "start");
  drag(hEnd, "end");

  var close = function () { stop(); modal.hidden = true; st = null; };

  var open = function (btn) {
    var tr = btn.closest("tr");
    var url = tr.getAttribute("data-original-url");
    if (!url) { window.alert("This card has no audio to trim."); return; }
    modal.hidden = false;
    say("loading\\u2026");
    revertBtn.hidden = tr.getAttribute("data-trim-start") == null;
    markFilter(tr.getAttribute("data-filter"));
    modal.querySelector(".clean-msg").textContent = "";
    st = { row: tr, cid: tr.getAttribute("data-card-id"), unit: tr.getAttribute("data-unit"), limit: null };
    audio.src = url;
    window.fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        var AC = window.AudioContext || window.webkitAudioContext;
        return new AC().decodeAudioData(buf);
      })
      .then(function (decoded) {
        if (!st) return;
        st.samples = decoded.getChannelData(0);
        st.rate = decoded.sampleRate;
        st.duration = decoded.duration;
        // Where the handles start. A hand cut is authoritative — reopening restores the exact range it
        // was made with, so a selection that came out a shade tight is nudged rather than re-found by
        // ear. Otherwise fall back to where the AUTOMATIC trim currently sits, which matters because
        // trimming happens by default: opening on the full original would misrepresent every card as
        // untrimmed, and dragging from there would silently undo the automatic cut.
        //
        // The automatic trim only ever removes from the END, never the start, so its range is exactly
        // [0, length of the clip in use] — derivable from the page with no stored value, which is what
        // makes this work for clips built before the editor existed.
        var s = parseFloat(tr.getAttribute("data-trim-start"));
        var e = parseFloat(tr.getAttribute("data-trim-end"));
        var settle = function (start, end) {
          if (!st) return;
          st.start = Math.max(0, start);
          st.end = Math.min(st.duration, end);
          if (st.end - st.start < MIN_RANGE) { st.start = 0; st.end = st.duration; }
          draw();
          paint();
          say("");
        };
        if (isFinite(s) && isFinite(e)) { settle(s, e); return; }
        var inUse = tr.querySelector("td.au:not(.au-orig) audio");
        if (!inUse || !inUse.getAttribute("src")) { settle(0, st.duration); return; }
        // Metadata only — the length is all we need, and decoding a second clip per open would be
        // wasted work.
        var probe = new Audio();
        probe.preload = "metadata";
        var done = false;
        var use = function (end) { if (!done) { done = true; settle(0, end); } };
        probe.addEventListener("loadedmetadata", function () {
          use(isFinite(probe.duration) && probe.duration > 0 ? probe.duration : st.duration);
        });
        // A clip that won't report its length must not leave the editor stuck with no handles.
        probe.addEventListener("error", function () { use(st.duration); });
        probe.src = inUse.getAttribute("src");
      })
      .catch(function (e) { say("could not read this clip: " + e.message, true); });
  };

  var postTo = function (t, path, body) {
    return window.fetch(base + "/unit/" + encodeURIComponent(t.unit) + "/card/" + encodeURIComponent(t.cid) + path,
      body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" })
      .then(jsonp);
  };
  var post = function (path, body) {
    return window.fetch(base + "/unit/" + encodeURIComponent(st.unit) + "/card/" + encodeURIComponent(st.cid) + path,
      body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "POST" })
      .then(jsonp);
  };

  // Applying is automatic: a drag lands the moment you let go, so the In use player is always what the
  // handles say. The cut is the only thing that could be lost by walking away, and doing it on release
  // (never on pointermove) keeps it to ONE ffmpeg cut per drag rather than one per pixel.
  //
  // Everything the request needs is captured up front, so closing the modal mid-flight cannot orphan
  // it — the row still updates when it lands. A FAILURE, though, would be written into a hidden modal
  // and never seen, so errors also go to the row's own message span.
  var inFlight = false, queued = null, lastSent = null;
  var rowSay = function (tr, text) {
    var m = tr.querySelector(".msg");
    if (m) m.textContent = text;
  };
  // The send path works ENTIRELY from its captured range, never from st — closing the modal
  // nulls st, and the old replay went back through commit(), so the final drag before a quick
  // close was silently dropped while the previous cut stayed applied.
  var sendRange = function (range) {
    if (inFlight) { queued = range; return; }        // land the latest position, not every one
    if (lastSent && lastSent.row === range.row &&
        lastSent.start === range.start && lastSent.end === range.end) return;
    inFlight = true;
    lastSent = range;
    say("applying\\u2026");
    postTo(range, "/audio/trim", { start: range.start, end: range.end }).then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "trim failed");
      swapInUse(range.row, x.j.mediaUrl);
      range.row.setAttribute("data-trim-start", String(range.start));
      range.row.setAttribute("data-trim-end", String(range.end));
      revertBtn.hidden = false;
      say("\\u2713 applied");
      rowSay(range.row, "");
      return maybeRebuild();
    }).catch(function (e) {
      lastSent = null;                                // let the same range be retried
      say(e.message, true);
      // Visible even if the modal was closed while this was in the air.
      rowSay(range.row, "trim failed: " + e.message);
    }).finally(function () {
      inFlight = false;
      if (queued) { var q = queued; queued = null; sendRange(q); }
    });
  };
  var commit = function () {
    if (!st) return;
    sendRange({ row: st.row, start: st.start, end: st.end, unit: st.unit, cid: st.cid });
  };

  revertBtn.addEventListener("click", function () {
    revertBtn.disabled = true;
    say("reverting\\u2026");
    var row = st.row;
    post("/audio/trim/revert").then(function (x) {
      if (!x.ok) throw new Error(x.j.error || "revert failed");
      if (x.j.mediaUrl) swapInUse(row, x.j.mediaUrl);
      row.removeAttribute("data-trim-start");
      row.removeAttribute("data-trim-end");
      close();
      return maybeRebuild();
    }).catch(function (e) { say(e.message, true); }).finally(function () { revertBtn.disabled = false; });
  });

  var markFilter = function (name) {
    modal.querySelectorAll(".clean-btn").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-filter") === (name || "standard"));
    });
  };
  modal.querySelectorAll(".clean-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var name = btn.getAttribute("data-filter");
      var cmsg = modal.querySelector(".clean-msg");
      var row = st.row;
      modal.querySelectorAll(".clean-btn").forEach(function (b) { b.disabled = true; });
      cmsg.textContent = "re-cleaning\u2026"; cmsg.classList.remove("err");
      post("/audio/clean", { filter: name }).then(function (x) {
        if (!x.ok) throw new Error(x.j.error || "clean failed");
        swapInUse(row, x.j.mediaUrl);
        row.setAttribute("data-filter", name);
        // Re-cleaning re-derives from the original, so a saved hand trim is re-cut under the new
        // chain rather than dropped — keep the row's stored range in step with what came back.
        if (x.j.audioTrim) {
          row.setAttribute("data-trim-start", String(x.j.audioTrim.start));
          row.setAttribute("data-trim-end", String(x.j.audioTrim.end));
        } else {
          row.removeAttribute("data-trim-start"); row.removeAttribute("data-trim-end");
        }
        markFilter(name);
        cmsg.textContent = "\u2713 " + name;
        return maybeRebuild();
      }).catch(function (e) { cmsg.textContent = e.message; cmsg.classList.add("err"); })
        .finally(function () { modal.querySelectorAll(".clean-btn").forEach(function (b) { b.disabled = false; }); });
    });
  });
  modal.querySelector(".trim-play-sel").addEventListener("click", function () { play(st.start, st.end); });
  modal.querySelector(".trim-play-all").addEventListener("click", function () { play(0, null); });
  modal.querySelector(".trim-snap").addEventListener("click", function () { if (snap()) commit(); });
  modal.querySelector(".trim-close").addEventListener("click", close);
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
  document.querySelectorAll("button.trim").forEach(function (btn) {
    btn.addEventListener("click", function () { open(btn); });
  });
})();`;

// Client wiring for the combined Corpus review (included when the first-review section is editable).
// Reads the deck type/id from #deckctx; per-row card id/unit from each <tr>'s data-* attributes.
// Vanilla JS, no ${}. Handles: the per-row Exclude toggle, inline editing of the target/pronunciation
// cells (contentEditable, saved on blur), and the per-section "Mark reviewed" button. All wired to
// the `corpus`-review rows (which carry the translated cards).
// The Approve control on the additions review. Approving a card clears its pending flag, so it
// starts shipping — which means the group package is now out of date, exactly as excluding a card
// from a done lesson is. `maybeRebuild` is the same auto-rebuild the exclude toggle uses.
//
// The row is updated in place rather than reloading: on a page holding a couple of hundred
// retrofitted cards, a reload after every approval would lose your scroll position every time.
export const APPROVE_ADDITION_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp;

  function approve(tr) {
    var cid = tr.getAttribute("data-card-id"), unit = tr.getAttribute("data-unit");
    return fetch(base + "/unit/" + encodeURIComponent(unit) + "/card/" + encodeURIComponent(cid) + "/addition/approve", { method: "POST" })
      .then(jsonp).then(function (x) {
        if (!x.ok) throw new Error(x.j.error || "failed");
        var cell = tr.querySelector("td.excl-cell");
        var btn = cell && cell.querySelector("button.approve-btn");
        if (btn) btn.outerHTML = '<span class="tick" title="Approved — this card ships">✓</span>';
        var badge = tr.querySelector(".badge-pending");
        if (badge) badge.remove();
        A.rowMsg(tr, "");
        return true;
      });
  }

  document.querySelectorAll("button.approve-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tr = btn.closest("tr");
      btn.disabled = true;
      approve(tr).then(A.maybeRebuild).catch(function (e) {
        btn.disabled = false;
        A.rowMsg(tr, e.message || "failed");
      });
    });
  });

  // Whole-section approve. Sequential rather than parallel: every one of these writes the same
  // cards.json, and firing them at once would have each request read the file before the previous
  // had written it, so all but the last approval would be lost.
  document.querySelectorAll("button.approve-unit").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sec = btn.closest("details");
      var rows = [].slice.call(sec.querySelectorAll("tr")).filter(function (tr) {
        return tr.querySelector("button.approve-btn");
      });
      if (!rows.length) return;
      btn.disabled = true;
      var msg = btn.nextElementSibling;
      var i = 0;
      function step() {
        if (i >= rows.length) {
          if (msg) msg.textContent = "✓ " + rows.length + " approved";
          btn.outerHTML = '<span class="done-badge">✓ all approved</span>';
          return A.maybeRebuild();
        }
        if (msg) msg.textContent = i + 1 + " of " + rows.length + "…";
        return approve(rows[i++]).then(step);
      }
      step().catch(function (e) {
        btn.disabled = false;
        if (msg) msg.textContent = e.message || "failed";
      });
    });
  });
})();
`;

export const REVIEW_EDIT_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var A = window.__ab;
  var base = A.base, jsonp = A.jsonp;
  // Excluding a card on an ALREADY-DONE lesson (from the audio review) must rebuild the group package so
  // the card leaves the .apkg immediately — same auto-rebuild rule as an audio edit. On a not-yet-done
  // lesson there's nothing to rebuild (Mark done folds the current, excluded-filtered state in).
  var rebuildIfDone = A.maybeRebuild;
  // Exclude toggle — a single icon button (⊘), wired on BOTH the Corpus review and the
  // audio review. aria-pressed carries the state; clicking flips it.
  document.querySelectorAll("button.excl-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tr = btn.closest("tr");
      var cid = tr.getAttribute("data-card-id"), unit = tr.getAttribute("data-unit");
      var next = btn.getAttribute("aria-pressed") !== "true";
      btn.disabled = true;
      fetch(base + "/unit/" + encodeURIComponent(unit) + "/card/" + encodeURIComponent(cid) + "/review/exclude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ excluded: next }) })
        .then(jsonp).then(function (x) {
          if (!x.ok) throw new Error(x.j.error || "failed");
          btn.setAttribute("aria-pressed", next ? "true" : "false");
          btn.classList.toggle("on", next);
          btn.title = next ? "Excluded — click to include" : "Exclude this card from the deck";
          tr.classList.toggle("excluded", next);
          A.rowMsg(tr, "");
          return rebuildIfDone();
        })
        .catch(function (e) { A.rowMsg(tr, e.message); })
        .finally(function () { btn.disabled = false; });
    });
  });
  document.querySelectorAll('tr[data-stage="corpus"] td[data-field]').forEach(function (cell) {
    cell.contentEditable = "true"; cell.spellcheck = false;
    var orig = cell.textContent;
    cell.addEventListener("focus", function () { orig = cell.textContent; });
    cell.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); cell.blur(); } });
    cell.addEventListener("blur", function () {
      var val = cell.textContent.trim();
      if (val === orig.trim()) { cell.textContent = val; return; }
      var tr = cell.closest("tr");
      var cid = tr.getAttribute("data-card-id"), unit = tr.getAttribute("data-unit");
      var body = {}; body[cell.getAttribute("data-field")] = val;
      fetch(base + "/unit/" + encodeURIComponent(unit) + "/card/" + encodeURIComponent(cid) + "/review/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "failed"); cell.textContent = val; orig = val; cell.classList.add("saved"); setTimeout(function () { cell.classList.remove("saved"); }, 800); })
        .catch(function (e) { cell.textContent = orig; A.rowMsg(tr, "edit failed: " + e.message); });
    });
  });
  document.querySelectorAll("button.mark-rev").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var unit = btn.getAttribute("data-unit");
      var msg = btn.parentNode.querySelector(".rev-msg");
      btn.disabled = true; if (msg) msg.textContent = "saving\\u2026";
      fetch(base + "/unit/" + encodeURIComponent(unit) + "/review/reviewed", { method: "POST" })
        .then(jsonp).then(function (x) { if (!x.ok) throw new Error(x.j.error || "failed"); if (msg) msg.textContent = "\\u2713 reviewed"; btn.disabled = false; })
        .catch(function (e) { if (msg) msg.textContent = e.message; btn.disabled = false; });
    });
  });
})();`;

// Client wiring for the lesson-level "Mark done" / "Unreview" buttons (the final sign-off in the
// audio review, and the corpus-gate rollback). Reads deck ctx from #deckctx; unit from data-unit.
// Reloads on success so the lesson moves between In review / Built. Vanilla JS, no ${}.
export const MARK_DONE_SCRIPT = `(function () {
  var ctx = document.getElementById("deckctx");
  if (!ctx || !window.__ab) return;
  var base = window.__ab.base, jsonp = window.__ab.jsonp;
  var wire = function (sel, path, okText) {
    document.querySelectorAll(sel).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var unit = btn.getAttribute("data-unit");
        var msg = btn.parentNode.querySelector(".done-msg");
        btn.disabled = true; if (msg) msg.textContent = "saving\\u2026";
        fetch(base + "/unit/" + encodeURIComponent(unit) + path, { method: "POST" })
          .then(jsonp).then(function (x) {
            if (!x.ok) throw new Error(x.j.error || "failed");
            if (x.j.rebuildError) {
              // The mark landed but the group .apkg did NOT rebuild — say so and stay on the page
              // (an auto-reload would wipe the message and the stale package would go unnoticed).
              if (msg) msg.textContent = okText + " — but deck rebuild FAILED: " + x.j.rebuildError;
              btn.disabled = false;
              return;
            }
            if (msg) msg.textContent = okText;
            setTimeout(function () { location.reload(); }, 500);
          })
          .catch(function (e) { if (msg) msg.textContent = e.message; btn.disabled = false; });
      });
    });
  };
  wire("button.mark-done", "/done", "\\u2713 done");
  // Sends a mis-clicked corpus sign-off back to the corpus gate (and drops the lesson's dedup
  // library entry server-side).
  wire("button.unreview", "/review/unreviewed", "sent back to corpus review");
})();`;

// Reveals the .topbar (the slim fixed bar with back link / title / Deliver) once the full <header>
// scrolls out of view, so navigation and Deliver stay reachable on a long card table. An
// IntersectionObserver on the header — no scroll listeners. Vanilla JS, no ${}.
export const STICKY_HEADER_SCRIPT = `(function () {
  var bar = document.querySelector(".topbar");
  var header = document.querySelector("header");
  if (!bar || !header || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(function (entries) {
    bar.classList.toggle("on", !entries[0].isIntersecting);
  }).observe(header);
})();`;

// The "Deliver to Anki" buttons (page header + topbar, on every page): previews the plan (dry run),
// asks to confirm, then delivers. Talks to POST /api/anki/deliver (?dry=1 for the preview).
// Class-wired because the button renders twice per page — every instance disables while a deliver
// is in flight, and every .deliver-status span shows the same message. Synchronous fetch → status
// text, matching the rest of the dashboard (no framework, no streaming).
export const DELIVER_SCRIPT = `(function () {
  var btns = Array.prototype.slice.call(document.querySelectorAll("button.deliver-anki"));
  if (!btns.length) return;
  function set(m) {
    document.querySelectorAll(".deliver-status").forEach(function (s) { s.textContent = m; });
  }
  function lock(on) { btns.forEach(function (b) { b.disabled = on; }); }
  async function post(dry) {
    var r = await fetch("/api/anki/deliver" + (dry ? "?dry=1" : ""), { method: "POST" });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || ("HTTP " + r.status));
    return j;
  }
  function summarize(rep) {
    var upd = 0, add = 0, amb = 0;
    rep.content.forEach(function (c) { upd += c.updated; add += c.added; amb += c.ambiguous.length; });
    var struct = rep.structure.map(function (s) {
      var ch = [];
      if (s.createModel) ch.push("created");
      if (s.addedFields.length) ch.push("+" + s.addedFields.join(","));
      if (s.templates) ch.push("templates");
      if (s.css) ch.push("css");
      return s.model + ": " + (ch.length ? ch.join(", ") : "current");
    }).join("; ");
    return upd + " fields updated, " + add + " cards added" + (amb ? (", " + amb + " ambiguous (skipped)") : "") + ". Note type — " + struct + ".";
  }
  btns.forEach(function (btn) {
    btn.addEventListener("click", async function () {
      lock(true);
      try {
        set("Previewing\\u2026");
        var plan = await post(true);
        if (!window.confirm("Deliver to Anki?\\n\\n" + summarize(plan) + "\\n\\nEvery managed deck is backed up (with scheduling) first. Proceed?")) {
          set("Cancelled."); lock(false); return;
        }
        set("Delivering\\u2026");
        var done = await post(false);
        var msg2 = "Delivered. " + summarize(done);
        if (done.syncedAfter === true) msg2 += " Synced with AnkiWeb.";
        else if (done.syncedAfter === false) msg2 += " Sync FAILED (" + (done.syncError || "") + ") \\u2014 sync manually.";
        if (done.schemaChanged) msg2 += " A field or card template was added: Anki will ask for one 'Upload to AnkiWeb' to finish the full sync.";
        set(msg2 + " Backup: " + done.backupDir);
      } catch (e) {
        set("Failed: " + e.message);
      }
      lock(false);
    });
  });
})();`;

// Clears a STALE build claim (the server refuses if the build is actually still live), so a
// crashed build never leaves a lesson wedged.
export const CLEAR_CLAIM_SCRIPT = `
document.querySelectorAll(".clear-claim").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const res = await fetch(location.pathname.replace(/\\/review\\//, "/api/deck/").replace(/\\/([^/]+)$/, "/unit/$1/claim/clear"), { method: "POST" });
    if (res.ok) location.reload();
    else { btn.disabled = false; btn.textContent = "Could not clear"; }
  });
});
`;
