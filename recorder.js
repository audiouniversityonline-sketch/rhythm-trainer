/* ============================================================
   recorder.js — record a beat from a kit, a controller, or the screen.

   Flow: press record, hear a count-in, play for as long as you like, stop
   whenever. Nothing has to land on an exact beat, because the take is then
   TRIMMED to the bars you actually want. After trimming you can loop the
   selection, overdub more limbs onto it, and nudge individual hits.

   All nine surfaces are recordable, and the on-screen palette means a
   student with no kit can still build a beat with every drum.

   The engine (audio, clock, kit labels) is injected by app.js via init()
   so this file owns no state the rest of the app also owns.
   ============================================================ */
window.REC = (function () {
  const NS = "http://www.w3.org/2000/svg";
  let api = null, ui = {};

  /* Every surface, in kit order, with the limb it is assumed to belong to.
     The student can reassign any of them before saving. */
  const PALETTE = [
    { id:"hihat",  key:"1" }, { id:"snare",  key:"2" }, { id:"kick",   key:"3" },
    { id:"tom1",   key:"4" }, { id:"tom2",   key:"5" }, { id:"floor",  key:"6" },
    { id:"crash1", key:"7" }, { id:"crash2", key:"8" }, { id:"ride",   key:"9" }
  ];
  const HOME_LIMB = {
    kick:"F", snare:"L", rim:"L",
    hihat:"R", ride:"R", crash1:"R", crash2:"R", tom1:"R", tom2:"R", floor:"R"
  };
  const DEFAULT_PIECE = { R:"hihat", L:"snare", F:"kick" };
  const LOOKAHEAD = 0.25;   // seconds of audio committed at a time
  const MAX_TAKE = 12;      // bars before the take stops itself
  const MAX_TRIM = 4;       // bars a saved pattern may span

  const METERS = [
    { label:"4/4", sig:[4,4] }, { label:"3/4", sig:[3,4] },
    { label:"5/4", sig:[5,4] }, { label:"7/4", sig:[7,4] },
    { label:"6/8", sig:[6,8] }, { label:"7/8", sig:[7,8] }, { label:"5/8", sig:[5,8] }
  ];
  function resolutions(den) {
    return den === 8
      ? [{ sub:1, label:"Eighths" }, { sub:2, label:"Sixteenths" }, { sub:3, label:"Triplets" }]
      : [{ sub:2, label:"Eighths" }, { sub:4, label:"Sixteenths" },
         { sub:3, label:"Eighth triplets" }, { sub:6, label:"Sixteenth triplets" }];
  }

  const R = {
    open:false, mode:"idle",        // idle | record | overdub | preview
    meterIdx:0, sub:4, bpm:80, countIn:true,
    raw:[],                          // {t, piece} of the linear take
    over:{},                         // manual edits, "limb|box" -> piece or null
    limbFor:{},
    rows:{},                         // drums given a track with no hits yet
    startTime:0, nextBeat:0, loopBox:0, timer:null, endTimer:null,
    takeBars:0, trimFrom:0, trimBars:1, loopPass:0
  };
  const meter        = () => METERS[R.meterIdx];
  const beatsPerBar  = () => meter().sig[0];
  const beatDur      = () => 60 / R.bpm;
  const barDur       = () => beatsPerBar() * beatDur();
  const boxesPerBar  = () => beatsPerBar() * R.sub;
  const totalBoxes   = () => boxesPerBar() * R.trimBars;
  const trimStart    = () => R.startTime + R.trimFrom * barDur();
  const loopDur      = () => R.trimBars * barDur();
  const running      = () => R.mode === "record" || R.mode === "overdub" || R.mode === "preview";

  function el(t, a) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }
  function limbOf(piece) { return R.limbFor[piece] || HOME_LIMB[piece] || "R"; }

  /* ---- the take, folded into the trimmed window -------------------- */
  /* Keyed by DRUM, not by limb. A kit sends nine independent surfaces and
     each gets its own track, so a crash and a hi-hat landing together no
     longer overwrite one another and the grid can show every drum played.
     Limbs are worked out later, when the pattern is built. */
  function derive() {
    const out = {}, total = totalBoxes();
    R.raw.forEach(h => {
      const box = Math.round((h.t - trimStart()) / barDur() * boxesPerBar());
      if (box < 0 || box >= total) return;         // outside the trim
      out[h.piece + "|" + box] = true;
    });
    Object.keys(R.over).forEach(k => {
      if (R.over[k] === null) delete out[k]; else out[k] = true;
    });
    return out;
  }
  /* Every drum with a track: anything played, plus anything the student
     opened a row for from the palette. */
  function usedDrums() {
    const set = {};
    Object.keys(derive()).forEach(k => { set[k.split("|")[0]] = 1; });
    Object.keys(R.rows).forEach(d => { set[d] = 1; });
    return PALETTE.map(d => d.id).filter(d => set[d]);
  }
  function hitsPerBar() {
    const per = [];
    for (let b = 0; b < Math.max(R.takeBars, 1); b++) per.push(0);
    R.raw.forEach(h => {
      const b = Math.floor((h.t - R.startTime) / barDur());
      if (b >= 0 && b < per.length) per[b]++;
    });
    return per;
  }

  /* ---- capture ----------------------------------------------------- */
  function onHit(piece, t) {
    if (!R.open) return false;
    api.initAudio();
    const ctx = api.getCtx();
    if (ctx) api.hit(piece, ctx.currentTime, false);
    flashPalette(piece);
    if (!ctx) return true;

    if (R.mode === "record") {
      R.raw.push({ t: t, piece: piece });
      R.takeBars = Math.max(R.takeBars, Math.floor((t - R.startTime) / barDur()) + 1);
      ui.bar.textContent = "Bar " + Math.max(1, Math.floor((t - R.startTime) / barDur()) + 1);
    } else if (R.mode === "overdub") {
      // fold onto the trimmed loop, wherever in the loop we are
      let box = Math.round((t - trimStart()) / barDur() * boxesPerBar());
      box = ((box % totalBoxes()) + totalBoxes()) % totalBoxes();
      R.over[piece + "|" + box] = true;
    } else { R.rows[piece] = 1; drawGrid(); syncAll(); return true; }
    drawGrid(); syncAll();
    return true;
  }

  /* ---- transport --------------------------------------------------- */
  function stopClock() {
    clearInterval(R.timer); R.timer = null;
    clearTimeout(R.endTimer); R.endTimer = null;
    if (api.silence) api.silence();
  }

  function schedTake() {
    const ctx = api.getCtx(); if (!ctx) return;
    const beat = beatDur(), cap = MAX_TAKE * beatsPerBar();
    while (R.nextBeat < cap && R.startTime + R.nextBeat * beat < ctx.currentTime + LOOKAHEAD) {
      api.hit("click", R.startTime + R.nextBeat * beat, R.nextBeat % beatsPerBar() === 0);
      R.nextBeat++;
    }
  }
  /* Box by box, like the main scheduler, so stopping or editing takes
     effect at once rather than after the rest of the loop has played. */
  function schedLoop() {
    const ctx = api.getCtx(); if (!ctx) return;
    const hits = derive(), N = totalBoxes(), boxDur = loopDur() / N;
    const perTick = R.sub, horizon = ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (guard++ < 512) {
      const t = trimStart() + R.loopPass * loopDur() + R.loopBox * boxDur;
      if (t >= horizon) break;
      const i = R.loopBox;
      if (i % perTick === 0) api.hit("click", t, i % boxesPerBar() === 0);
      Object.keys(hits).forEach(k => {
        const [piece, box] = k.split("|");
        if (+box === i) api.hit(piece, t, false);
      });
      R.loopBox++;
      if (R.loopBox >= N) { R.loopBox = 0; R.loopPass++; }
    }
  }

  function startTake() {
    api.initAudio();
    const ctx = api.getCtx(); if (!ctx) return;
    R.raw = []; R.over = {}; R.takeBars = 0; R.trimFrom = 0; R.trimBars = 1;
    const lead = ctx.currentTime + .25;
    const count = R.countIn ? beatsPerBar() : 0;
    for (let i = 0; i < count; i++) api.hit("click", lead + i * beatDur(), i === 0);
    R.startTime = lead + count * beatDur();
    R.nextBeat = 0; R.mode = "record";
    R.timer = setInterval(schedTake, 25); schedTake();
    // The take stops itself rather than running forever if they walk away.
    R.endTimer = setTimeout(finishTake, (R.startTime - ctx.currentTime + MAX_TAKE * barDur() + .2) * 1000);
    ui.bar.textContent = "Counting in";
    syncAll(); drawGrid();
  }

  /* Stopping is deliberately forgiving: the take is trimmed afterwards, so
     nobody has to release on the beat. */
  function finishTake() {
    stopClock(); R.mode = "idle";
    ui.bar.textContent = "";
    const per = hitsPerBar();
    let first = per.findIndex(n => n > 0);
    let last = per.length - 1; while (last > 0 && !per[last]) last--;
    if (first < 0) { first = 0; last = 0; }
    R.trimFrom = first;
    R.trimBars = Math.max(1, Math.min(MAX_TRIM, last - first + 1));
    R.takeBars = Math.max(R.takeBars, last + 1);
    syncAll(); drawGrid();
  }

  function startLoop(mode) {
    api.initAudio();
    const ctx = api.getCtx(); if (!ctx) return;
    R.mode = mode;
    ui.bar.textContent = "";
    // rebase so the loop starts now rather than in the take's past
    R.startTime = ctx.currentTime + .25 - R.trimFrom * barDur();
    R.loopPass = 0; R.loopBox = 0;
    R.timer = setInterval(schedLoop, 25); schedLoop();
    syncAll();
  }
  function stopLoop() { stopClock(); R.mode = "idle"; syncAll(); }

  /* ---- drum palette ------------------------------------------------ */
  function buildPalette() {
    ui.palette.textContent = "";
    PALETTE.forEach(d => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "recpad"; b.dataset.piece = d.id;
      b.innerHTML = '<b>' + api.KIT_LABEL[d.id] + "</b><i>" + d.key + "</i>";
      b.style.borderColor = api.COL[limbOf(d.id)];
      b.onpointerdown = ev => {
        ev.preventDefault();
        const ctx = api.getCtx();
        onHit(d.id, ctx ? ctx.currentTime : 0);
      };
      ui.palette.appendChild(b);
    });
  }
  function flashPalette(piece) {
    const b = ui.palette && ui.palette.querySelector('[data-piece="' + piece + '"]');
    if (!b) return;
    b.style.background = api.COL[limbOf(piece)];
    b.style.color = "#0a0b0e";
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.style.background = ""; b.style.color = ""; }, 130);
  }

  /* ---- trim strip -------------------------------------------------- */
  function buildTrim() {
    const per = hitsPerBar(), max = Math.max(1, ...per);
    ui.trim.textContent = "";
    per.forEach((n, i) => {
      const b = document.createElement("button");
      b.type = "button";
      const inSel = i >= R.trimFrom && i < R.trimFrom + R.trimBars;
      b.className = "trimbar" + (inSel ? " sel" : "") + (n ? "" : " empty");
      b.setAttribute("aria-label", "Bar " + (i + 1) + ", " + n + " hits");
      b.innerHTML = '<span class="lvl" style="height:' + Math.round(14 + n / max * 26) + 'px"></span>' +
        "<em>" + (i + 1) + "</em>";
      b.onclick = () => {
        R.trimFrom = i;
        R.trimBars = Math.max(1, Math.min(R.trimBars, Math.max(1, per.length - i), MAX_TRIM));
        R.over = {};
        syncAll(); drawGrid();
      };
      ui.trim.appendChild(b);
    });
    ui.from.textContent = R.trimFrom + 1;
    ui.bars.textContent = R.trimBars;
  }
  function setBars(n) {
    const per = hitsPerBar();
    R.trimBars = Math.max(1, Math.min(MAX_TRIM, n, Math.max(1, per.length - R.trimFrom)));
    R.over = {}; syncAll(); drawGrid();
  }
  function setFrom(n) {
    const per = hitsPerBar();
    R.trimFrom = Math.max(0, Math.min(n, per.length - 1));
    R.trimBars = Math.max(1, Math.min(R.trimBars, per.length - R.trimFrom, MAX_TRIM));
    R.over = {}; syncAll(); drawGrid();
  }

  /* ---- grid preview ------------------------------------------------ */
  const LIMBS = ["R","L","F"];
  /* One row per drum, in kit order, with a colour tab showing which limb
     is set to play it. */
  function drawGrid() {
    const svg = ui.grid; if (!svg) return;
    svg.textContent = "";
    const hits = derive(), drums = usedDrums(), N = totalBoxes();
    const W = 1000, L = 128, gap = N > 48 ? 1 : N > 24 ? 2 : N > 12 ? 3 : 5;
    const cw = (W - L - (N - 1) * gap) / N;
    const rowH = 30, pitch = 34, top = 12;

    if (!drums.length) {
      svg.appendChild(text(W / 2, 60, "Nothing recorded yet",
        { fill:"#7b8794", "font-size":13 }));
      svg.setAttribute("viewBox", "0 0 1000 110");
      return;
    }

    drums.forEach((d, k) => {
      const y = top + k * pitch, col = api.COL[limbOf(d)];
      svg.appendChild(el("rect", { x:0, y:y, width:4, height:rowH, rx:2, fill:col }));
      svg.appendChild(text(L - 12, y + rowH / 2 + 4, api.KIT_LABEL[d],
        { fill:"#eef0f3", "font-size":12, "text-anchor":"end" }));
      for (let i = 0; i < N; i++) {
        const on = hits[d + "|" + i];
        const onBeat = i % R.sub === 0, onBar = i % boxesPerBar() === 0;
        const cell = el("rect", { x:L + i * (cw + gap), y:y, width:cw, height:rowH, rx:3,
          fill: on ? col : (onBar ? "#252a33" : onBeat ? "#20242b" : "#171a20"),
          stroke: on ? "none" : "#262b33",
          "fill-opacity": on ? .85 : 1, cursor:"pointer" });
        cell.addEventListener("click", () => toggle(d, i));
        svg.appendChild(cell);
      }
    });

    const countY = top + drums.length * pitch + 14;
    for (let i = 0; i < beatsPerBar() * R.trimBars; i++) {
      const box = i * R.sub, first = i % beatsPerBar() === 0;
      svg.appendChild(text(L + box * (cw + gap) + cw / 2, countY,
        String(i % beatsPerBar() + 1),
        { fill: first ? "#eef0f3" : "#7b8794", "font-size":12, "font-weight": first ? 600 : 400 }));
    }
    ui.head = el("rect", { x:L, y:top - 4, width:cw, height:drums.length * pitch, rx:4,
      fill:"none", stroke:"#ff3b47", "stroke-width":2, opacity:0 });
    svg.appendChild(ui.head);
    ui.head._L = L; ui.head._cw = cw; ui.head._gap = gap;
    svg.setAttribute("viewBox", "0 0 1000 " + (countY + 16));
  }
  function text(x, y, s, a) {
    const e = el("text", Object.assign({ x, y, "font-family":"inherit", "text-anchor":"middle" }, a));
    e.textContent = s; return e;
  }
  function toggle(piece, box) {
    const key = piece + "|" + box;
    R.over[key] = derive()[key] ? null : true;
    drawGrid(); syncAll();
  }

  function frame() {
    if (!R.open) return;
    requestAnimationFrame(frame);
    const ctx = api.getCtx();
    if (!ui.head || !ctx) return;
    if (R.mode === "record") {
      if (ctx.currentTime < R.startTime) { ui.bar.textContent = "Counting in"; return; }
      ui.bar.textContent = "Bar " + (Math.floor((ctx.currentTime - R.startTime) / barDur()) + 1);
      ui.head.setAttribute("opacity", 0);
      return;
    }
    if (R.mode !== "overdub" && R.mode !== "preview") { ui.head.setAttribute("opacity", 0); return; }
    const phase = (((ctx.currentTime - trimStart()) / loopDur()) % 1 + 1) % 1;
    const idx = Math.floor(phase * totalBoxes());
    ui.head.setAttribute("x", ui.head._L + idx * (ui.head._cw + ui.head._gap));
    ui.head.setAttribute("opacity", .9);
  }

  /* ---- drum to limb ------------------------------------------------ */
  function buildLimbRows() {
    const drums = usedDrums();
    ui.limbs.textContent = "";
    if (!drums.length) {
      ui.limbs.innerHTML = '<span class="note" style="margin:0">Nothing in the selection yet.</span>';
      return;
    }
    drums.forEach(piece => {
      const wrap = document.createElement("div");
      wrap.className = "reclimb";
      wrap.innerHTML = '<span class="recdrum">' + api.KIT_LABEL[piece] + "</span>";
      LIMBS.forEach(v => {
        const on = limbOf(piece) === v;
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip";
        b.setAttribute("aria-pressed", String(on));
        b.style.borderColor = on ? api.COL[v] : "";
        b.innerHTML = '<span class="swatch" style="background:' + (on ? api.COL[v] : "") + '"></span>' +
          api.LIMB_LABEL[v];
        b.onclick = () => { R.limbFor[piece] = v; buildPalette(); drawGrid(); syncAll(); };
        wrap.appendChild(b);
      });
      const x = document.createElement("button");
      x.type = "button"; x.className = "btn ghost sm";
      x.textContent = "Remove"; x.style.marginLeft = "auto";
      x.onclick = () => {
        Object.keys(R.over).forEach(k => { if (k.split("|")[0] === piece) delete R.over[k]; });
        Object.keys(derive()).forEach(k => { if (k.split("|")[0] === piece) R.over[k] = null; });
        delete R.rows[piece];
        drawGrid(); syncAll();
      };
      wrap.appendChild(x);
      ui.limbs.appendChild(wrap);
    });
    const { dropped } = assign();
    const bad = [...new Set(dropped)];
    ui.warn.innerHTML = bad.length
      ? "<b style='color:var(--warn)'>" + bad.join(" and ") + "</b> " +
        (bad.length === 1 ? "lands" : "land") + " on a beat where both hands and the " +
        "foot are already busy, so " + (bad.length === 1 ? "it cannot" : "they cannot") +
        " be played as written. Move a drum to another limb, or remove that hit."
      : "";
  }

  /* ---- build ------------------------------------------------------- */
  /* Turn drum tracks into the limb-based pattern the rest of the app uses.
     One hand cannot strike two drums at once, so when two drums assigned to
     the same limb land on the same box, the second is moved to a free hand.
     Anything that genuinely cannot be played is reported rather than
     silently dropped. */
  function assign() {
    const hits = derive();
    const byBox = {};
    Object.keys(hits).forEach(k => {
      const [p, b] = k.split("|");
      (byBox[b] = byBox[b] || []).push(p);
    });
    const voices = { R:[], L:[], F:[] }, marks = { R:{}, L:{}, F:{} }, dropped = [];
    Object.keys(byBox).map(Number).sort((a, b) => a - b).forEach(box => {
      const taken = {};
      // feet first: they never contend with the hands
      const order = byBox[box].slice().sort((a, b) =>
        (limbOf(a) === "F" ? 0 : 1) - (limbOf(b) === "F" ? 0 : 1));
      order.forEach(p => {
        let v = limbOf(p);
        if (taken[v]) v = ["R","L","F"].find(x => !taken[x] && x !== "F") || null;
        if (!v) { dropped.push(api.KIT_LABEL[p]); return; }
        taken[v] = 1; voices[v].push(box); marks[v][box] = p;
      });
    });
    return { voices, marks, dropped };
  }

  function build(name) {
    const { voices, marks } = assign();
    LIMBS.forEach(v => voices[v].sort((a, b) => a - b));
    const home = {};
    LIMBS.forEach(v => {
      const counts = {};
      voices[v].forEach(p => { counts[marks[v][p]] = (counts[marks[v][p]] || 0) + 1; });
      home[v] = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || DEFAULT_PIECE[v];
      Object.keys(marks[v]).forEach(p => { if (marks[v][p] === home[v]) delete marks[v][p]; });
      if (!Object.keys(marks[v]).length) delete marks[v];
    });
    return {
      id: "user-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      name: name, short: meter().label,
      sig: [beatsPerBar() * R.trimBars, meter().sig[1]],
      div: totalBoxes(), ticks: beatsPerBar() * R.trimBars,
      accents: R.trimBars > 1 ? Array(R.trimBars).fill(beatsPerBar()) : null,
      voices: voices, kit: home, marks: Object.keys(marks).length ? marks : null,
      bars: R.trimBars, recordedAt: new Date().toISOString().slice(0, 10)
    };
  }

  /* ---- panel state -------------------------------------------------- */
  function syncAll() {
    const has = R.raw.length > 0 || Object.keys(R.over).length > 0;
    const n = Object.keys(derive()).length;
    const tracks = usedDrums().length;

    ui.record.textContent = R.mode === "record" ? "Stop" : (has ? "Record again" : "Record");
    ui.record.classList.toggle("primary", R.mode !== "record");
    ui.record.classList.toggle("rec", R.mode === "record");

    ui.overdub.disabled = !has || R.mode === "record";
    ui.overdub.textContent = R.mode === "overdub" ? "Stop overdub" : "Overdub";
    ui.overdub.classList.toggle("on", R.mode === "overdub");
    ui.preview.disabled = !has || R.mode === "record";
    ui.preview.textContent = R.mode === "preview" ? "Stop" : "Play loop";
    ui.preview.classList.toggle("on", R.mode === "preview");
    ui.clear.disabled = !has || R.mode === "record";
    ui.save.disabled = !n;

    ui.trimWrap.style.display = (has && R.mode !== "record") ? "" : "none";
    ui.count.textContent = n ? n + (n === 1 ? " hit" : " hits") +
      (tracks ? " on " + tracks + (tracks === 1 ? " drum" : " drums") : "") : "";
    if (has && R.mode !== "record") buildTrim();

    ui.hint.innerHTML =
      R.mode === "record"
        ? "Play for as long as you like — you do not have to stop on a beat. Trim it afterwards."
      : R.mode === "overdub"
        ? "The selection is looping. Add another limb; tap a box to remove a hit."
      : R.mode === "preview"
        ? "Looping the selection you have chosen."
      : has
        ? "Pick the bars you want, then tap any box to fix a hit. Tap a drum above to open a track for it. <b>Overdub</b> loops the selection so you can add more."
        : "Press record, wait for the count-in, and play. Use your kit, a controller, or the pads above.";

    ui.len.textContent = R.trimBars + (R.trimBars === 1 ? " bar" : " bars") + " · " +
      totalBoxes() + " boxes · " + meter().label;
    buildLimbRows();
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
    syncAll(); drawGrid();
  }

  function open() {
    R.open = true;
    ui.modal.classList.add("open"); ui.scrim.classList.add("open");
    ui.modal.setAttribute("aria-hidden", "false"); ui.modal.removeAttribute("inert");
    buildPalette(); syncSetup(); drawGrid(); syncAll();
    requestAnimationFrame(frame);
    ui.close.focus();
  }
  function close() {
    stopClock(); R.mode = "idle"; R.open = false;
    ui.modal.classList.remove("open"); ui.scrim.classList.remove("open");
    ui.modal.setAttribute("aria-hidden", "true"); ui.modal.setAttribute("inert", "");
    if (api.onClose) api.onClose();
  }
  function reset() {
    stopClock(); R.mode = "idle";
    R.raw = []; R.over = {}; R.limbFor = {}; R.rows = {};
    R.takeBars = 0; R.trimFrom = 0; R.trimBars = 1;
    ui.name.value = ""; ui.bar.textContent = "";
    buildPalette(); drawGrid(); syncAll();
  }

  function init(injected) {
    api = injected;
    const id = s => document.getElementById(s);
    ui = {
      modal:id("recModal"), scrim:id("recScrim"), close:id("recClose"), grid:id("recGrid"),
      record:id("recRecord"), overdub:id("recOverdub"), preview:id("recPreview"),
      clear:id("recClear"), save:id("recSave"), cancel:id("recCancel"), name:id("recName"),
      hint:id("recHint"), limbs:id("recLimbs"), warn:id("recWarn"), bar:id("recBar"), count:id("recCount"),
      meter:id("recMeter"), res:id("recRes"), bpm:id("recBpm"), bpmVal:id("recBpmVal"),
      countIn:id("recCountIn"), len:id("recLen"), palette:id("recPalette"),
      trimWrap:id("recTrimWrap"), trim:id("recTrim"),
      from:id("recFrom"), bars:id("recBars")
    };
    METERS.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = i; o.textContent = m.label; ui.meter.appendChild(o);
    });
    ui.meter.onchange = e => { R.meterIdx = +e.target.value; R.over = {}; syncSetup(); };
    ui.res.onchange = e => { R.sub = +e.target.value; R.over = {}; syncSetup(); };
    ui.bpm.oninput = e => { R.bpm = +e.target.value; ui.bpmVal.textContent = R.bpm; };
    ui.countIn.onclick = () => {
      R.countIn = !R.countIn;
      ui.countIn.setAttribute("aria-pressed", String(R.countIn));
    };
    ui.record.onclick = () => { R.mode === "record" ? finishTake() : startTake(); };
    ui.overdub.onclick = () => { R.mode === "overdub" ? stopLoop() : startLoop("overdub"); };
    ui.preview.onclick = () => { R.mode === "preview" ? stopLoop() : startLoop("preview"); };
    ui.clear.onclick = reset;
    ui.cancel.onclick = close;
    ui.close.onclick = close;
    ui.scrim.addEventListener("click", () => { if (R.open) close(); });
    id("recTrimWrap").addEventListener("click", e => {
      const b = e.target.closest("[data-nudge]"); if (!b) return;
      const [what, dir] = b.dataset.nudge.split(":");
      if (what === "from") setFrom(R.trimFrom + (+dir));
      else setBars(R.trimBars + (+dir));
    });
    ui.save.onclick = () => {
      stopClock(); R.mode = "idle";
      const name = (ui.name.value || "").trim() || "My beat " + new Date().toLocaleDateString();
      const p = build(name);
      close(); reset();
      api.onSaved(p);
    };
    // number keys fire the palette, so a beat can be built with no hardware
    document.addEventListener("keydown", e => {
      if (!R.open || e.repeat) return;
      if (e.target.closest("input,select,textarea")) return;
      const d = PALETTE.find(x => x.key === e.key);
      if (!d) return;
      e.preventDefault();
      const ctx = api.getCtx();
      onHit(d.id, ctx ? ctx.currentTime : 0);
    });
    ui.modal.setAttribute("inert", "");
    return API;
  }

  const API = { init, open, close, onHit, isOpen: () => R.open, isRecording: () => running() };
  return API;
})();
