/* ============================================================
   recorder.js — record a beat from a kit or controller.

   Loop recording with overdub: the metronome runs a loop of the chosen
   length, everything already captured plays back each pass, and new hits
   land on top. Hits are quantised to the chosen grid and become an
   ordinary pattern, so once saved a recorded beat is indistinguishable
   from a built-in one and every view, the scoring and the tempo trainer
   work on it unchanged.

   The engine (audio, clock, kit labels) is injected by app.js via init()
   so this file owns no state the rest of the app also owns.
   ============================================================ */
window.REC = (function () {
  const NS = "http://www.w3.org/2000/svg";
  let api = null, ui = {};

  /* Which limb a drum is assumed to belong to when first recorded. The
     student can reassign any of them before saving. */
  const HOME_LIMB = {
    kick:"F", snare:"L", rim:"L",
    hihat:"R", ride:"R", crash1:"R", crash2:"R", tom1:"R", tom2:"R", floor:"R"
  };
  const DEFAULT_PIECE = { R:"hihat", L:"snare", F:"kick" };

  const METERS = [
    { label:"4/4", sig:[4,4] }, { label:"3/4", sig:[3,4] },
    { label:"5/4", sig:[5,4] }, { label:"7/4", sig:[7,4] },
    { label:"6/8", sig:[6,8] }, { label:"7/8", sig:[7,8] }, { label:"5/8", sig:[5,8] }
  ];
  /* Subdivisions per click, labelled for the meter's denominator. */
  function resolutions(den) {
    return den === 8
      ? [{ sub:1, label:"Eighths" }, { sub:2, label:"Sixteenths" }, { sub:3, label:"Triplets" }]
      : [{ sub:2, label:"Eighths" }, { sub:4, label:"Sixteenths" },
         { sub:3, label:"Eighth triplets" }, { sub:6, label:"Sixteenth triplets" }];
  }

  const R = {
    open:false, recording:false,
    meterIdx:0, bars:1, sub:4, bpm:80, countIn:true,
    hits:{},                 // "limb|box" -> drum
    limbFor:{},              // drum -> limb, after any reassignment
    startTime:0, loopDur:0, nextPass:0, timer:null, pass:0
  };
  const meter = () => METERS[R.meterIdx];
  const beatsPerBar = () => meter().sig[0];
  const ticks = () => beatsPerBar() * R.bars;
  const div = () => ticks() * R.sub;
  const hitCount = () => Object.keys(R.hits).length;

  function el(t, a) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }

  /* ---- capture ----------------------------------------------------- */
  function limbOf(piece) { return R.limbFor[piece] || HOME_LIMB[piece] || "R"; }

  function quantise(t) {
    const box = Math.round((t - R.startTime) / R.loopDur * div());
    return ((box % div()) + div()) % div();
  }

  /* Called by app.js for every incoming hit while the recorder is open. */
  function onHit(piece, t) {
    if (!R.open) return false;
    // A MIDI message is not a user gesture, so the context may not exist yet
    // when someone taps a pad before pressing start.
    api.initAudio();
    const ctx = api.getCtx();
    // Always sound it: an MPC pad or a muted kit makes no noise of its own.
    if (ctx) api.hit(piece, ctx.currentTime, false);
    if (!R.recording || !ctx) return true;
    const limb = limbOf(piece);
    R.hits[limb + "|" + quantise(t)] = piece;
    draw(); syncFoot();
    return true;
  }

  /* ---- loop -------------------------------------------------------- */
  function schedule() {
    const ctx = api.getCtx(); if (!ctx) return;
    const perTick = R.loopDur / ticks(), barTicks = beatsPerBar();
    while (R.startTime + R.nextPass * R.loopDur < ctx.currentTime + .25) {
      const t0 = R.startTime + R.nextPass * R.loopDur;
      for (let i = 0; i < ticks(); i++) api.hit("click", t0 + i * perTick, i % barTicks === 0);
      // play back what is already down, so overdubbing has something to sit on
      Object.keys(R.hits).forEach(k => {
        const box = +k.split("|")[1];
        api.hit(R.hits[k], t0 + box / div() * R.loopDur, false);
      });
      R.nextPass++;
    }
  }

  function start() {
    api.initAudio();
    const ctx = api.getCtx(); if (!ctx) return;
    const beat = 60 / R.bpm;
    R.loopDur = ticks() * beat;
    const lead = ctx.currentTime + .25;
    const countBeats = R.countIn ? beatsPerBar() : 0;
    for (let i = 0; i < countBeats; i++) api.hit("click", lead + i * beat, i === 0);
    R.startTime = lead + countBeats * beat;
    R.nextPass = 0; R.recording = true;
    R.timer = setInterval(schedule, 25); schedule();
    syncFoot();
  }
  function stopLoop() {
    R.recording = false;
    clearInterval(R.timer); R.timer = null;
    syncFoot();
  }

  /* ---- grid preview ------------------------------------------------ */
  const LIMBS = ["R","L","F"];
  function draw() {
    const svg = ui.grid; if (!svg) return;
    svg.textContent = "";
    const N = div(), W = 1000, L = 96, gap = N > 24 ? 2 : N > 12 ? 3 : 5;
    const cw = (W - L - (N - 1) * gap) / N;
    const rowY = [16, 68, 120], rowH = 44;
    const perTick = N / ticks();

    LIMBS.forEach((v, k) => {
      svg.appendChild(text(L - 12, rowY[k] + 26, api.LIMB_LABEL[v].split(" ")[0],
        { fill:api.COL[v], "font-size":13, "font-weight":600, "text-anchor":"end" }));
      for (let i = 0; i < N; i++) {
        const piece = R.hits[v + "|" + i];
        const onTick = i % perTick === 0;
        const cell = el("rect", { x:L + i * (cw + gap), y:rowY[k], width:cw, height:rowH, rx:4,
          fill: piece ? api.COL[v] : (onTick ? "#20242b" : "#171a20"),
          stroke: piece ? "none" : "#262b33",
          "fill-opacity": piece ? .8 : 1, cursor:"pointer" });
        cell.addEventListener("click", () => toggle(v, i));
        svg.appendChild(cell);
        if (piece) svg.appendChild(text(L + i * (cw + gap) + cw / 2, rowY[k] + 28,
          api.KIT_LABEL[piece].slice(0, 2).toUpperCase(),
          { fill:"#0a0b0e", "font-size":10, "font-weight":700 }));
      }
    });
    for (let i = 0; i < ticks(); i++)
      svg.appendChild(text(L + i * perTick * (cw + gap) + cw / 2, 180,
        String(i % beatsPerBar() + 1),
        { fill: i % beatsPerBar() === 0 ? "#eef0f3" : "#7b8794", "font-size":12,
          "font-weight": i % beatsPerBar() === 0 ? 600 : 400 }));

    ui.head = el("rect", { x:L, y:12, width:cw, height:156, rx:5,
      fill:"none", stroke:"#ff3b47", "stroke-width":2, opacity:0 });
    svg.appendChild(ui.head);
    ui.head._L = L; ui.head._cw = cw; ui.head._gap = gap;
    svg.setAttribute("viewBox", "0 0 1000 196");
  }
  function text(x, y, s, a) {
    const e = el("text", Object.assign({ x, y, "font-family":"inherit", "text-anchor":"middle" }, a));
    e.textContent = s; return e;
  }
  function toggle(limb, box) {
    const key = limb + "|" + box;
    if (R.hits[key]) delete R.hits[key];
    else {
      // reuse whatever this limb plays most, so a corrected hit sounds right
      const counts = {};
      Object.keys(R.hits).forEach(k => {
        if (k.split("|")[0] !== limb) return;
        counts[R.hits[k]] = (counts[R.hits[k]] || 0) + 1;
      });
      const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      R.hits[key] = best || DEFAULT_PIECE[limb];
    }
    draw(); syncFoot();
  }

  function frame() {
    if (!R.open) return;
    requestAnimationFrame(frame);
    const ctx = api.getCtx();
    if (!ui.head) return;
    if (!R.recording || !ctx || ctx.currentTime < R.startTime) { ui.head.setAttribute("opacity", 0); return; }
    const phase = ((ctx.currentTime - R.startTime) / R.loopDur) % 1;
    const idx = Math.floor(phase * div());
    ui.head.setAttribute("x", ui.head._L + idx * (ui.head._cw + ui.head._gap));
    ui.head.setAttribute("opacity", .9);
    const pass = Math.floor((ctx.currentTime - R.startTime) / R.loopDur) + 1;
    if (pass !== R.pass) { R.pass = pass; ui.pass.textContent = "Pass " + pass; }
  }

  /* ---- drum → limb reassignment ------------------------------------ */
  function syncLimbRow() {
    const used = [...new Set(Object.values(R.hits))];
    ui.limbs.textContent = "";
    if (!used.length) { ui.limbs.innerHTML = '<span class="note" style="margin:0">Nothing recorded yet.</span>'; return; }
    used.forEach(piece => {
      const wrap = document.createElement("div");
      wrap.className = "reclimb";
      wrap.innerHTML = '<span class="recdrum">' + api.KIT_LABEL[piece] + "</span>";
      LIMBS.forEach(v => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip";
        b.setAttribute("aria-pressed", String(limbOf(piece) === v));
        b.style.borderColor = limbOf(piece) === v ? api.COL[v] : "";
        b.innerHTML = '<span class="swatch" style="background:' +
          (limbOf(piece) === v ? api.COL[v] : "") + '"></span>' + api.LIMB_LABEL[v];
        b.onclick = () => {
          R.limbFor[piece] = v;
          // move every hit on this drum to the new limb
          Object.keys(R.hits).forEach(k => {
            if (R.hits[k] !== piece) return;
            const box = k.split("|")[1];
            delete R.hits[k]; R.hits[v + "|" + box] = piece;
          });
          draw(); syncLimbRow(); syncFoot();
        };
        wrap.appendChild(b);
      });
      ui.limbs.appendChild(wrap);
    });
  }

  /* ---- build ------------------------------------------------------- */
  function build(name) {
    const voices = { R:[], L:[], F:[] }, marks = { R:{}, L:{}, F:{} };
    Object.keys(R.hits).forEach(k => {
      const [limb, box] = k.split("|");
      voices[limb].push(+box); marks[limb][+box] = R.hits[k];
    });
    LIMBS.forEach(v => voices[v].sort((a, b) => a - b));
    const home = {};
    LIMBS.forEach(v => {
      const counts = {};
      voices[v].forEach(p => { counts[marks[v][p]] = (counts[marks[v][p]] || 0) + 1; });
      home[v] = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || DEFAULT_PIECE[v];
      // a mark equal to the limb's home drum is redundant
      Object.keys(marks[v]).forEach(p => { if (marks[v][p] === home[v]) delete marks[v][p]; });
      if (!Object.keys(marks[v]).length) delete marks[v];
    });
    return {
      id: "user-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      name: name, short: meter().label,
      sig: [ticks(), meter().sig[1]], div: div(), ticks: ticks(),
      accents: R.bars > 1 ? Array(R.bars).fill(beatsPerBar()) : null,
      voices: voices, kit: home, marks: Object.keys(marks).length ? marks : null,
      bars: R.bars, recordedAt: new Date().toISOString().slice(0, 10)
    };
  }

  /* ---- panel ------------------------------------------------------- */
  function syncFoot() {
    ui.start.textContent = R.recording ? "Stop" : (hitCount() ? "Resume" : "Start recording");
    ui.start.classList.toggle("primary", !R.recording);
    ui.save.disabled = !hitCount();
    ui.clear.disabled = !hitCount();
    ui.count.textContent = hitCount() ? hitCount() + (hitCount() === 1 ? " hit" : " hits") : "";
    ui.hint.innerHTML = R.recording
      ? "Play along with the click. The loop keeps running, so you can add one limb at a time. Tap a box to fix a hit."
      : (hitCount()
        ? "Tap any box to add or remove a hit. Press resume to keep layering, or name it and save."
        : "Set the meter and tempo, press start, and play. You get a count-in first.");
    syncLimbRow();
  }
  function syncSetup() {
    ui.res.textContent = "";
    resolutions(meter().sig[1]).forEach(r => {
      const o = document.createElement("option");
      o.value = r.sub; o.textContent = r.label; o.selected = R.sub === r.sub;
      ui.res.appendChild(o);
    });
    if (!resolutions(meter().sig[1]).some(r => r.sub === R.sub)) {
      R.sub = resolutions(meter().sig[1])[0].sub; ui.res.value = R.sub;
    }
    ui.len.textContent = R.bars + (R.bars === 1 ? " bar" : " bars") + " · " +
      div() + " boxes · " + meter().label;
    [...ui.setup.querySelectorAll("[data-bars]")].forEach(b =>
      b.setAttribute("aria-pressed", String(+b.dataset.bars === R.bars)));
  }

  function open() {
    R.open = true; R.pass = 0;
    ui.modal.classList.add("open"); ui.scrim.classList.add("open");
    ui.modal.setAttribute("aria-hidden", "false"); ui.modal.removeAttribute("inert");
    syncSetup(); draw(); syncFoot();
    requestAnimationFrame(frame);
    ui.close.focus();
  }
  function close() {
    stopLoop();
    R.open = false;
    ui.modal.classList.remove("open"); ui.scrim.classList.remove("open");
    ui.modal.setAttribute("aria-hidden", "true"); ui.modal.setAttribute("inert", "");
    if (api.onClose) api.onClose();
  }
  function reset() {
    R.hits = {}; R.limbFor = {}; R.pass = 0;
    ui.name.value = "";
    draw(); syncFoot();
  }

  function init(injected) {
    api = injected;
    "recModal recScrim recClose recGrid recStart recClear recSave recCancel recName recHint recLimbs recPass recCount recMeter recRes recBpm recBpmVal recCountIn recLen recSetup"
      .split(" ").forEach(id => { ui[id.replace(/^rec/, "").replace(/^./, c => c.toLowerCase())] = document.getElementById(id); });
    ui.modal = document.getElementById("recModal");
    ui.scrim = document.getElementById("recScrim");
    ui.grid  = document.getElementById("recGrid");

    METERS.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i; o.textContent = m.label; ui.meter.appendChild(o);
    });
    ui.meter.onchange = e => { R.meterIdx = +e.target.value; syncSetup(); draw(); };
    ui.res.onchange = e => { R.sub = +e.target.value; syncSetup(); draw(); };
    ui.setup.addEventListener("click", e => {
      const b = e.target.closest("[data-bars]"); if (!b) return;
      R.bars = +b.dataset.bars; syncSetup(); draw();
    });
    ui.bpm.oninput = e => { R.bpm = +e.target.value; ui.bpmVal.textContent = R.bpm; };
    ui.countIn.onclick = () => {
      R.countIn = !R.countIn;
      ui.countIn.setAttribute("aria-pressed", String(R.countIn));
    };
    ui.start.onclick = () => { R.recording ? stopLoop() : start(); };
    ui.clear.onclick = reset;
    ui.cancel.onclick = close;
    ui.close.onclick = close;
    ui.scrim.addEventListener("click", () => { if (R.open) close(); });
    ui.save.onclick = () => {
      stopLoop();
      const name = (ui.name.value || "").trim() || "My beat " + new Date().toLocaleDateString();
      const p = build(name);
      close(); reset();
      api.onSaved(p);
    };
    ui.modal.setAttribute("inert", "");
    return API;
  }

  const API = { init, open, close, onHit, isOpen: () => R.open, isRecording: () => R.recording };
  return API;
})();
