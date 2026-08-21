/* ============================================================
   app.js — engine, views, input, lessons.
   Reads patterns.js and lessons.js; draws notation via notation.js.
   ============================================================ */
"use strict";

/* ---- config: the only block to touch when real audio lands -------- */
const CONFIG = {
  useSamples: false,
  samples: { hihat:"audio/hihat.wav", snare:"audio/snare.wav",
             kick:"audio/kick.wav", rim:"audio/rim.wav", click:"audio/click.wav" },
  useExamples: false,
  exampleUrl: P => "audio/examples/" + (P.ratio ? P.ratio[0] + "-" + P.ratio[1] : P.id) + ".wav"
};

/* Mirrors styles.css so the SVG views sit in the same palette. */
const C = {
  s1:"#101216", s2:"#15181d", s3:"#1b1f26",
  line:"#20242b", line2:"#2b313a", line3:"#3a424d",
  tx1:"#eef0f3", tx2:"#98a1ac", tx3:"#7b8794", tx4:"#707e8e",
  ok:"#4ade80"
};
const COL  = { R:"#ffa62b", L:"#2dd4bf", F:"#a78bfa" };
const HIT_RED = "#ff3b47";   // marker for what the student actually struck
/* Every surface on the kit. Order is the order they appear in Setup. */
const PIECES = ["hihat","ride","crash1","crash2","snare","rim","tom1","tom2","floor","kick"];
const KIT_LABEL = { hihat:"Hi-hat", ride:"Ride", crash1:"Crash 1", crash2:"Crash 2",
                    snare:"Snare", rim:"Cross-stick", tom1:"Rack tom 1", tom2:"Rack tom 2",
                    floor:"Floor tom", kick:"Kick", click:"Click" };
const HAND_KIT = ["hihat","ride","crash1","crash2","snare","rim","tom1","tom2","floor","kick"];
const FOOT_KIT = ["kick","click","hihat"];
const LIMB_LABEL = { R:"right hand", L:"left hand", F:"foot" };
const LIMB_KEY   = { R:"J", L:"F", F:"B" };
const STORE = "polytrainer.v1";
const BEATS = STORE + ".beats";
/* Default drum for a limb when the hit came from a key or an on-screen pad
   rather than a real trigger, which carries no drum of its own. */
const KEY_PIECE = { R:"hihat", L:"snare", F:"kick" };

const S = {
  group:"polyrhythm", navOpen:"polyrhythm",
  patternId:"poly-4-3-in4",
  polyIdx:1, polyInX:true,
  swap:false,
  sound:{ R:"hihat", L:"snare", F:"kick" },
  bpm:72, playing:false,
  mute:{ R:false, L:false, F:false, M:false },
  limbs:{ R:1, L:0, F:0 },
  trainer:false, countIn:true, haptics:false,
  latency:{ keyboard:0, midi:0 },
  show:{ kit:1, limbs:1, wheel:1, balls:1, grid:1, comp:1, notation:1 },
  lesson:{ setId:null, step:0, active:false, judged:false },
  progress:{}
};

/* ---- derived ------------------------------------------------------ */
function pat(){ return PATTERNS.byId[S.patternId] || PATTERNS.all[0]; }
function AP(){
  const P = pat();
  if (!S.swap || !P.swappable) return P;
  const t = P.tuplet ? Object.assign({}, P.tuplet, { voice: P.tuplet.voice === "L" ? "R" : "L" }) : null;
  return Object.assign({}, P, { voices:{ R:P.voices.L, L:P.voices.R, F:P.voices.F }, tuplet:t });
}
const countOf = v => (AP().voices[v] || []).length;
/* A limb's home surface in the current pattern: what it plays most of the
   time, falling back to whatever the student picked in Setup. */
function limbPiece(v){ const P = AP(); return (P.kit && P.kit[v]) || S.sound[v]; }
function limbExtras(v){
  const P = AP(); if (!P.marks || !P.marks[v]) return [];
  const home = limbPiece(v);
  return [...new Set(Object.values(P.marks[v]))].filter(p => p !== home);
}
const cycleMs = () => (S.playing ? cycleDur : pat().ticks * 60 / S.bpm) * 1000;
const lessonSet  = () => LESSONS.sets.find(s => s.id === S.lesson.setId);
const lessonStep = () => { const s = lessonSet(); return s ? s.steps[S.lesson.step] : null; };

/* ---- persistence -------------------------------------------------- */
function save(){
  try { localStorage.setItem(STORE, JSON.stringify({
    progress:S.progress, show:S.show, latency:S.latency, sound:S.sound,
    bpm:S.bpm, limbs:S.limbs, midiMap:MIDI.map })); } catch (e) {}
}
/* Recorded beats live apart from the rest of the settings so a corrupt
   preferences blob can never take someone's saved work with it. */
function saveBeats(){
  try {
    localStorage.setItem(BEATS, JSON.stringify(PATTERNS.custom.map(p => ({
      id:p.id, name:p.name, short:p.short, sig:p.sig, div:p.div, ticks:p.ticks,
      accents:p.accents, voices:p.voices, kit:p.kit, marks:p.marks,
      bars:p.bars, recordedAt:p.recordedAt
    }))));
  } catch (e) {}
}
function loadBeats(){
  try {
    const arr = JSON.parse(localStorage.getItem(BEATS) || "[]");
    if (Array.isArray(arr)) arr.forEach(o => { if (validBeat(o)) PATTERNS.addCustom(o); });
  } catch (e) {}
}
function validBeat(o){
  return o && typeof o.id === "string" && Array.isArray(o.sig) &&
    Number.isFinite(o.div) && Number.isFinite(o.ticks) && o.div > 0 && o.ticks > 0 &&
    o.voices && ["R","L","F"].every(v => !o.voices[v] || Array.isArray(o.voices[v]));
}

function load(){
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || "{}");
    // Validate on the way in. A stored value from an older build could
    // otherwise throw inside rebuild() and take the whole boot with it.
    if (d.progress && typeof d.progress === "object") S.progress = d.progress;
    if (d.show) Object.keys(S.show).forEach(k => { if (k in d.show) S.show[k] = d.show[k] ? 1 : 0; });
    if (d.latency) ["keyboard","midi"].forEach(k => {
      if (Number.isFinite(+d.latency[k])) S.latency[k] = +d.latency[k]; });
    if (d.sound) ["R","L","F"].forEach(v => { if (KIT_LABEL[d.sound[v]]) S.sound[v] = d.sound[v]; });
    if (d.limbs) ["R","L","F"].forEach(v => { if (v in d.limbs) S.limbs[v] = d.limbs[v] ? 1 : 0; });
    if (d.midiMap) PIECES.forEach(p => {
      if (Array.isArray(d.midiMap[p])) MIDI.map[p] = d.midiMap[p].filter(Number.isInteger); });
    if (Number.isFinite(+d.bpm)) S.bpm = Math.max(30, Math.min(220, Math.round(+d.bpm)));
  } catch (e) {}
}

/* ============================================================
   AUDIO
   ============================================================ */
let ctx = null, noiseBuf = null, master = null;
const buffers = {};

function initAudio(){
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = .85; master.connect(ctx.destination);
  const n = ctx.sampleRate * .4;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  if (CONFIG.useSamples) Object.keys(CONFIG.samples).forEach(name =>
    fetch(CONFIG.samples[name]).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(a => ctx.decodeAudioData(a)).then(b => { buffers[name] = b; }).catch(() => {}));
}
function env(t, peak, decay){
  const g = ctx.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + .002);
  g.gain.exponentialRampToValueAtTime(.0001, t + decay);
  return g;
}
function noiseSrc(t, dur){ const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t); s.stop(t+dur); return s; }
function crash(t, accent, hp, decay){
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  const g = env(t, accent ? .3 : .22, decay);
  noiseSrc(t, decay + .1).connect(f); f.connect(g); g.connect(master);
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = hp / 4;
  const og = env(t, .07, decay * .5); o.connect(og); og.connect(master);
  o.start(t); o.stop(t + decay * .6);
}
function tom(t, accent, f0, f1){
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + .2);
  const g = env(t, accent ? .62 : .48, .34);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + .4);
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f0 * 1.6;
  const g2 = env(t, .1, .08); noiseSrc(t, .12).connect(bp); bp.connect(g2); g2.connect(master);
}
const SYNTH = {
  hihat(t,a){ const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=7200;
    const g=env(t,a?.35:.22,.05); noiseSrc(t,.08).connect(f); f.connect(g); g.connect(master); },
  snare(t,a){ const f=ctx.createBiquadFilter(); f.type="bandpass"; f.frequency.value=1900; f.Q.value=.9;
    const g=env(t,a?.5:.36,.13); noiseSrc(t,.2).connect(f); f.connect(g); g.connect(master);
    const o=ctx.createOscillator(); o.type="triangle"; o.frequency.value=185;
    const og=env(t,.16,.06); o.connect(og); og.connect(master); o.start(t); o.stop(t+.09); },
  kick(t,a){ const o=ctx.createOscillator(); o.type="sine";
    o.frequency.setValueAtTime(135,t); o.frequency.exponentialRampToValueAtTime(44,t+.11);
    const g=env(t,a?.9:.7,.24); o.connect(g); g.connect(master); o.start(t); o.stop(t+.28); },
  rim(t,a){ const o=ctx.createOscillator(); o.type="square"; o.frequency.value=420;
    const g=env(t,a?.26:.19,.035); o.connect(g); g.connect(master); o.start(t); o.stop(t+.05);
    const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=3000;
    const g2=env(t,.18,.03); noiseSrc(t,.04).connect(f); f.connect(g2); g2.connect(master); },
  ride(t,a){ const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=5200;
    const g=env(t,a?.24:.16,.55); noiseSrc(t,.6).connect(f); f.connect(g); g.connect(master);
    const o=ctx.createOscillator(); o.type="triangle"; o.frequency.value=880;
    const og=env(t,.09,.18); o.connect(og); og.connect(master); o.start(t); o.stop(t+.2); },
  crash1(t,a){ crash(t,a,3400,1.5); },
  crash2(t,a){ crash(t,a,4300,1.25); },
  tom1(t,a){ tom(t,a,300,150); },
  tom2(t,a){ tom(t,a,220,110); },
  floor(t,a){ tom(t,a,150,72); },
  click(t,a){ const o=ctx.createOscillator(); o.type="square"; o.frequency.value=a?1560:1050;
    const g=env(t,a?.2:.12,.028); o.connect(g); g.connect(master); o.start(t); o.stop(t+.04); }
};
function hit(name, t, accent){
  // A note scheduled in the past would throw and take the scheduler down
  // with it, silently stopping playback. Nudge it to now instead.
  if (!(t >= ctx.currentTime)) t = ctx.currentTime;
  if (buffers[name]) {
    const s = ctx.createBufferSource(); s.buffer = buffers[name];
    const g = ctx.createGain(); g.gain.value = accent ? 1 : .72;
    s.connect(g); g.connect(master); s.start(t);
  } else SYNTH[name](t, accent);
}
function inputTime(stamp){
  if (!ctx) return 0;
  if (typeof stamp === "number" && ctx.getOutputTimestamp) {
    const o = ctx.getOutputTimestamp();
    if (o && o.contextTime > 0 && o.performanceTime > 0)
      return o.contextTime + (stamp - o.performanceTime) / 1000;
  }
  return ctx.currentTime;
}

/* ============================================================
   CLOCK
   ============================================================ */
let startTime = 0, cycleDur = 0, nextCycle = 0, pendingBpm = null, timer = null;
let scheduled = [], barsPlayed = 0;

function scheduleCycle(n){
  const P = AP(), t0 = startTime + n * cycleDur;
  if (pendingBpm !== null) {
    S.bpm = pendingBpm; pendingBpm = null;
    cycleDur = P.ticks * 60 / S.bpm;
    startTime = t0 - n * cycleDur;
    ui.bpmVal.textContent = S.bpm; ui.bpm.value = S.bpm;
  }
  const box = cycleDur / P.div;
  const sets = { R:new Set(P.voices.R), L:new Set(P.voices.L), F:new Set(P.voices.F) };
  const ticks = new Set(PATTERNS.tickPositions(P));
  const accents = new Set(PATTERNS.accentPositions(P));
  for (let i = 0; i < P.div; i++) {
    const t = t0 + i * box;
    ["R","L","F"].forEach(v => {
      if (!sets[v].has(i)) return;
      const piece = PATTERNS.pieceAt(P, v, i, S.sound[v]);
      scheduled.push({ t, voice:v, piece });
      if (!S.mute[v]) hit(piece, t, i === 0);
    });
    if (!S.mute.M && ticks.has(i)) hit("click", t, accents.has(i));
  }
  if (S.trainer && n > 0 && n % 4 === 0) pendingBpm = Math.min(220, S.bpm + 2);
}
function scheduler(){
  if (!S.playing) return;
  while (startTime + nextCycle * cycleDur < ctx.currentTime + .25) scheduleCycle(nextCycle++);
  const cut = ctx.currentTime - 1.5;
  while (scheduled.length && scheduled[0].t < cut) scheduled.shift();
}
function play(){
  initAudio();
  const P = AP(), beat = 60 / S.bpm, lead = ctx.currentTime + .15;
  cycleDur = P.ticks * beat;
  if (S.countIn) {
    for (let i = 0; i < P.ticks; i++) hit("click", lead + i * beat, i === 0);
    startTime = lead + P.ticks * beat;
  } else startTime = lead;
  nextCycle = 0; scheduled = []; barsPlayed = 0;
  taps = []; drawScatter();          // each press of play is a fresh run
  S.lesson.judged = false;
  S.playing = true; idleDrawn = false; setPlayIcon(true);
  timer = setInterval(scheduler, 25); scheduler();
}
function stop(){
  S.playing = false; S.bpm = +ui.bpm.value; pendingBpm = null;
  clearInterval(timer); timer = null; scheduled = [];
  setPlayIcon(false); ui.barCount.textContent = "—"; save();
}
function setPlayIcon(playing){
  ui.playIcon.innerHTML = playing
    ? '<rect x="6.5" y="6" width="4" height="12" rx="1"/><rect x="13.5" y="6" width="4" height="12" rx="1"/>'
    : '<path d="M8 5.5v13l11-6.5z"/>';
  ui.play.setAttribute("aria-label", playing ? "Stop" : "Play");
}
function restartIfPlaying(){ if (S.playing) { stop(); play(); } }

/* ============================================================
   SVG HELPERS
   ============================================================ */
const NS = "http://www.w3.org/2000/svg";
function el(t, a){ const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }
function txt(x, y, s, a){
  const e = el("text", Object.assign({ x, y, fill:C.tx2, "font-size":13,
    "font-family":"inherit", "text-anchor":"middle" }, a || {}));
  e.textContent = s; return e;
}
function rgb(h){ return [1,3,5].map(i => parseInt(h.substr(i,2),16)); }
function rgba(h, a){ const [r,g,b] = rgb(h); return "rgba("+r+","+g+","+b+","+a+")"; }

/* ============================================================
   VIEWS
   ============================================================ */
let gridCells = {}, gridHead = null, wheelDots = {}, wheelHand = null;
let ballEls = {}, ringEls = {}, compDots = [], kitEls = [];

function buildGrid(){
  const P = AP(), svg = ui.grid; svg.textContent = "";
  const N = P.div, L = 108, gap = N > 20 ? 3 : N > 12 ? 4 : 5;
  const cw = (1000 - L - (N - 1) * gap) / N;
  const rowY = [22, 76, 130], rowH = 42;
  gridCells = { R:[], L:[], F:[] };
  const ticks = new Set(PATTERNS.tickPositions(P));
  const accents = new Set(PATTERNS.accentPositions(P));

  ["R","L","F"].forEach((v, k) => {
    const on = new Set(P.voices[v]);
    svg.appendChild(txt(L-13, rowY[k]+25, String(on.size),
      { fill:COL[v], "font-size":17, "font-weight":600, "text-anchor":"end" }));
    svg.appendChild(txt(L-13, rowY[k]+40, LIMB_LABEL[v].split(" ")[0],
      { fill:C.tx4, "font-size":9.5, "text-anchor":"end" }));
    for (let i = 0; i < N; i++) {
      const isOn = on.has(i);
      const r = el("rect", { x:L+i*(cw+gap), y:rowY[k], width:cw, height:rowH, rx:5,
        fill: isOn ? COL[v] : C.s3, stroke: isOn ? "none" : C.line2,
        "fill-opacity": isOn ? .55 : 1 });
      svg.appendChild(r); gridCells[v].push({ el:r, on:isOn });
    }
  });

  const onR = new Set(P.voices.R), onL = new Set(P.voices.L);
  svg.appendChild(txt(L-13, 191, "sticking", { fill:C.tx4, "font-size":9.5, "text-anchor":"end" }));
  for (let i = 0; i < N; i++) {
    if (!onR.has(i) && !onL.has(i)) continue;
    svg.appendChild(txt(L+i*(cw+gap)+cw/2, 191, onR.has(i) && onL.has(i) ? "RL" : onR.has(i) ? "R" : "L",
      { fill:C.tx1, "font-size":14, "font-weight":600 }));
  }
  svg.appendChild(txt(L-13, 221, "count", { fill:C.tx4, "font-size":9.5, "text-anchor":"end" }));
  let tickNo = 0;
  for (let i = 0; i < N; i++) {
    const isTick = ticks.has(i), isAcc = accents.has(i);
    if (isTick) tickNo++;
    if (N > 16 && !isTick) continue;
    svg.appendChild(txt(L+i*(cw+gap)+cw/2, 221, isTick ? String(tickNo) : "·",
      { fill: isAcc ? C.tx1 : isTick ? C.tx2 : C.tx4,
        "font-size": isAcc ? 13 : isTick ? 12 : 10, "font-weight": isAcc ? 600 : 400 }));
  }
  gridHead = el("rect", { x:L, y:18, width:cw, height:158, rx:6,
    fill:"none", stroke:C.tx1, "stroke-width":1.75 });
  svg.appendChild(gridHead);
  gridHead._L = L; gridHead._cw = cw; gridHead._gap = gap;
  svg.setAttribute("viewBox", "0 0 1000 236");

  ui.gridnote.textContent = N + " boxes";
  // A text equivalent of the exercise, for anyone who cannot see the boxes.
  ui.grid.setAttribute("role", "img");
  ui.grid.removeAttribute("aria-hidden");
  ui.grid.setAttribute("aria-label",
    P.name + ", " + P.sig[0] + "/" + P.sig[1] + ", " + N + " boxes. " +
    ["R","L","F"].filter(v => (P.voices[v] || []).length).map(v =>
      LIMB_LABEL[v] + " on " + P.voices[v].map(i => i + 1).join(", ") +
      " on the " + KIT_LABEL[limbPiece(v)].toLowerCase()).join(". ") + ".");
}

function buildWheel(){
  const P = AP(), svg = ui.wheel; svg.textContent = "";
  const cx = 160, cy = 116, radii = { R:94, L:66, F:38 };
  for (let i = 0; i < P.div; i++) {
    const a = -Math.PI/2 + i * 2*Math.PI/P.div;
    svg.appendChild(el("line", { x1:cx+24*Math.cos(a), y1:cy+24*Math.sin(a),
      x2:cx+106*Math.cos(a), y2:cy+106*Math.sin(a), stroke:C.line, "stroke-width":1 }));
  }
  ["R","L","F"].forEach(v => svg.appendChild(el("circle", { cx, cy, r:radii[v],
    fill:"none", stroke:C.line2, "stroke-width":1.25 })));
  wheelHand = el("line", { x1:cx, y1:cy, x2:cx, y2:cy-110, stroke:C.tx2,
    "stroke-width":2.5, "stroke-linecap":"round" });
  svg.appendChild(wheelHand); wheelHand._c = [cx, cy];
  wheelDots = { R:[], L:[], F:[] };
  ["R","L","F"].forEach(v => (P.voices[v] || []).forEach(pos => {
    const a = -Math.PI/2 + pos * 2*Math.PI/P.div;
    const d = el("circle", { cx:cx+radii[v]*Math.cos(a), cy:cy+radii[v]*Math.sin(a),
      r: v === "F" ? 5.5 : 7.5, fill:COL[v], opacity:.55 });
    svg.appendChild(d); wheelDots[v].push({ el:d, pos, r: v === "F" ? 5.5 : 7.5 });
  }));
  svg.setAttribute("viewBox", "0 0 320 236");
  ui.wheelnote.textContent = "outer right · inner foot";
}

function buildBalls(){
  const P = AP(), svg = ui.balls; svg.textContent = "";
  svg.appendChild(el("line", { x1:34, y1:124, x2:286, y2:124, stroke:C.line3, "stroke-width":2.5 }));
  ballEls = {}; ringEls = {};
  const xs = { R:96, L:160, F:224 };
  ["R","L","F"].forEach(v => {
    if (!(P.voices[v] || []).length) return;
    ringEls[v] = el("circle", { cx:xs[v], cy:124, r:5, fill:"none", stroke:COL[v], "stroke-width":2, opacity:0 });
    ballEls[v] = el("circle", { cx:xs[v], cy:108, r:15, fill:COL[v] });
    svg.appendChild(ringEls[v]); svg.appendChild(ballEls[v]);
    svg.appendChild(txt(xs[v], 145, String(countOf(v)), { fill:COL[v], "font-size":12, "font-weight":600 }));
  });
}

function buildComposite(){
  const P = AP(), svg = ui.comp; svg.textContent = "";
  const L = 118, R = 980, span = R - L;
  svg.appendChild(el("line", { x1:L, y1:40, x2:R, y2:40, stroke:C.line2, "stroke-width":1.5 }));
  const hits = PATTERNS.composite(P);
  compDots = [];
  const gaps = hits.map((h, i) => (i+1 < hits.length ? hits[i+1].pos : P.div) - h.pos);
  hits.forEach((h, k) => {
    const px = L + (h.pos / P.div) * span, both = h.hands === 3;
    const d = el("circle", { cx:px, cy:40, r: both ? 10 : 7.5,
      fill: both ? C.tx1 : (h.hands & 1 ? COL.R : COL.L), opacity:.45 });
    svg.appendChild(d); compDots.push({ el:d, pos:h.pos, r: both ? 10 : 7.5 });
    const m = P.mnemonic;
    svg.appendChild(txt(px, 72, m && m[k] ? m[k] : String(gaps[k]),
      { fill: m && m[k] ? C.tx2 : C.tx3, "font-size": m && m[k] ? 13 : 11.5 }));
  });
  svg.appendChild(txt(L-16, 72, P.mnemonic ? "say" : "gaps", { fill:C.tx4, "font-size":10, "text-anchor":"end" }));
  svg.appendChild(txt(L-16, 45, hits.length + " hits", { fill:C.tx2, "font-size":12, "text-anchor":"end", "font-weight":600 }));
  svg.setAttribute("viewBox", "0 0 1000 92");
}

/* Kit as the drummer sees it from the throne, one shape per real surface. */
const KIT_GEO = [
  { id:"crash1", cx:76,  cy:60,  rx:46, ry:12, cym:1, label:"crash 1" },
  { id:"crash2", cx:250, cy:44,  rx:44, ry:12, cym:1, label:"crash 2" },
  { id:"ride",   cx:390, cy:86,  rx:50, ry:13, cym:1, label:"ride" },
  { id:"hihat",  cx:46,  cy:158, rx:42, ry:12, cym:1, label:"hi-hat" },
  { id:"tom1",   cx:176, cy:104, rx:36, ry:23, label:"rack 1" },
  { id:"tom2",   cx:258, cy:102, rx:36, ry:23, label:"rack 2" },
  { id:"floor",  cx:374, cy:200, rx:46, ry:30, label:"floor" },
  { id:"kick",   cx:226, cy:172, rx:60, ry:42, label:"kick" },
  { id:"snare",  cx:126, cy:230, rx:46, ry:30, label:"snare" }
];
let pieceMap = {};

function buildKit(){
  const P = AP(), svg = ui.kit; svg.textContent = "";
  pieceMap = PATTERNS.pieceMap(P, S.sound);
  kitEls = [];
  KIT_GEO.forEach(k => {
    const use = pieceMap[k.id];
    const col = use ? COL[use.limb] : null;
    // Limb is carried by hue AND by outline pattern, so the kit still reads
    // for a colour-blind player: right solid, left dashed, foot dotted.
    const dash = use ? { R:"", L:"8 4", F:"2 3" }[use.limb] : "";
    const shape = el("ellipse", Object.assign({ cx:k.cx, cy:k.cy, rx:k.rx, ry:k.ry,
      fill: col || C.s3, "fill-opacity": col ? .12 : .7,
      stroke: col || C.line2, "stroke-width": col ? 2 : 1.25,
      "stroke-opacity": col ? .6 : 1 }, dash ? { "stroke-dasharray":dash } : {}));
    svg.appendChild(shape);
    if (!k.cym) svg.appendChild(el("ellipse", { cx:k.cx, cy:k.cy, rx:k.rx*.7, ry:k.ry*.64,
      fill:"none", stroke: col || C.line, "stroke-width":1, "stroke-opacity":.45 }));
    const who = use ? "  " + use.limbs.join("") : "";
    svg.appendChild(txt(k.cx, k.cy + k.ry + 15, k.label + who,
      { fill: col ? C.tx2 : C.tx4, "font-size":10.5 }));
    // Marker for what the STUDENT hit, kept separate from the illumination
    // that shows what the exercise wants. Every surface gets one, including
    // drums this exercise never uses, so the kit doubles as a pad-mapping
    // check: hit a pad, see which drum answers.
    const dotR = Math.max(4.5, Math.min(9, k.ry * .3));
    const ring = el("circle", { cx:k.cx, cy:k.cy, r:dotR + 2.5, fill:"none",
      stroke:"#12060a", "stroke-width":3, opacity:0 });
    const dot = el("circle", { cx:k.cx, cy:k.cy, r:dotR, fill:HIT_RED,
      stroke:"#ffffff", "stroke-width":1.8, opacity:0 });
    svg.appendChild(ring); svg.appendChild(dot);
    kitEls.push({ id:k.id, el:shape, base: col ? .12 : .7, active: !!col, col, dot, ring, dotR });
  });
  const used = Object.keys(pieceMap);
  ui.kitnote.innerHTML = used.length + (used.length === 1 ? " drum" : " drums") +
    ' in this one &nbsp;<span style="color:' + HIT_RED + '">&#9679;</span> you';
}
/* Record that the student struck a surface. The frame loop draws and fades
   the marker, so it never fights the pattern illumination underneath. */
const kitHit = {};
function pingKit(piece){ if (piece) { kitHit[piece] = performance.now(); idleDrawn = false; } }

function buildNotation(){
  const P = AP();
  const info = NOTATION.render(ui.staff, P, {
    upper:"R", lower:"L", col:COL,
    piece:(limb, pos) => PATTERNS.pieceAt(P, limb, pos, S.sound[limb]),
    name:{ R:KIT_LABEL[limbPiece("R")].toLowerCase(), L:KIT_LABEL[limbPiece("L")].toLowerCase(),
           F:KIT_LABEL[limbPiece("F")].toLowerCase() }
  });
  if (P.tuplet && info) {
    ui.notationNote.textContent = P.tuplet.count + " written as " + info.label;
  } else {
    ui.notationNote.textContent = P.beatTuplet
      ? "beats subdivided in " + P.beatTuplet
      : (P.accents ? "grouped " + P.accents.join(" + ") : "hands up, foot down");
  }
}

/* ============================================================
   ANIMATION
   ============================================================ */
let lastPhase = 0, lastTickIdx = -1, idleDrawn = false;
function voiceFire(phase, onsets, div, w){
  if (!onsets || !onsets.length) return 0;
  const p = phase * div;
  let best = Infinity;
  onsets.forEach(o => { let d = p - o; if (d < 0) d += div; if (d < best) best = d; });
  return best < w ? 1 - best / w : 0;
}
function ballY(phase, onsets, div){
  if (!onsets || !onsets.length) return 0;
  const p = phase * div;
  let prev = -Infinity, next = Infinity;
  onsets.forEach(o => { if (o <= p && o > prev) prev = o; });
  onsets.forEach(o => { if (o > p && o < next) next = o; });
  if (prev === -Infinity) prev = onsets[onsets.length-1] - div;
  if (next === Infinity)  next = onsets[0] + div;
  return Math.sin(Math.PI * (p - prev) / (next - prev));
}
function paintLimb(node, v, b){
  node.style.backgroundColor = b > .01 ? rgba(COL[v], .06 + b * .5) : "";
  node.style.borderColor = b > .05 ? rgba(COL[v], .3 + b * .7) : "";
  node.style.transform = CALM.matches ? "" : "scale(" + (1 + b * .028).toFixed(4) + ")";
}

function frame(){
  requestAnimationFrame(frame);
  // Nothing is moving when stopped with no marker fading, so skip the work
  // rather than repainting at display refresh on a phone for 40 minutes.
  if (document.hidden) return;
  if (!S.playing && !CAL.running && !Object.keys(kitHit).length && idleDrawn) return;
  idleDrawn = !S.playing && !CAL.running;
  const P = AP();

  if (CAL.running && ctx) {
    const k = CAL.times.findIndex(t => t > ctx.currentTime - .001);
    const prev = k === -1 ? CAL.times.length - 1 : k - 1;
    let b = 0;
    if (prev >= 0) { const s = ctx.currentTime - CAL.times[prev]; b = s < .18 ? 1 - s/.18 : 0; }
    ui.calTarget.style.backgroundColor = rgba(C.ok, .05 + b * .45);
    ui.calTarget.style.borderColor = b > .05 ? C.ok : "";
    ui.calTarget.style.transform = CALM.matches ? "" : "scale(" + (1 + b * .025).toFixed(4) + ")";
  }

  let phase = lastPhase, counting = false;
  if (S.playing && ctx) {
    if (ctx.currentTime < startTime) { counting = true; phase = 0; }
    else {
      const e = (ctx.currentTime - startTime) / cycleDur;
      phase = e % 1; barsPlayed = Math.floor(e);
      ui.barCount.textContent = barsPlayed;
      judgeLesson();
    }
    lastPhase = phase;
  }
  if (counting) ui.barCount.textContent = "·";
  const live = S.playing && !counting, w = P.tickDiv * .55;
  ui.phasebar.style.width = (phase * 100).toFixed(2) + "%";

  const fire = {};
  ["R","L","F"].forEach(v => { fire[v] = live ? voiceFire(phase, P.voices[v], P.div, w) : 0; });
  if (S.show.limbs) ["R","L","F"].forEach(v => paintLimb(ui["limb"+v], v, fire[v]));

  if (S.show.kit && kitEls.length) {
    const now = performance.now();
    kitEls.forEach(k => {
      const use = pieceMap[k.id];
      const b = use && live ? voiceFire(phase, use.onsets, P.div, w) : 0;
      k.el.setAttribute("fill-opacity", (k.base + b * .78).toFixed(3));
      k.el.setAttribute("stroke-opacity", (k.active ? .5 + b * .5 : 1).toFixed(3));
      k.el.setAttribute("stroke-width", k.active ? (1.75 + b * 1.75).toFixed(2) : 1.25);
      const t0 = kitHit[k.id];
      const h = t0 === undefined ? 0 : Math.max(0, Math.min(1, 1 - (now - t0) / 300));
      if (h !== k._h) {
        k._h = h;
        k.dot.setAttribute("opacity", h.toFixed(3));
        k.ring.setAttribute("opacity", (h * .8).toFixed(3));
        const r = k.dotR * (.8 + h * .35);
        k.dot.setAttribute("r", r.toFixed(2)); k.ring.setAttribute("r", (r + 2.5).toFixed(2));
        if (h === 0) delete kitHit[k.id];
      }
    });
  }

  if (S.show.notation && ui.staff._ph) {
    const ph = ui.staff._ph, x = ph.x0 + (ph.x1 - ph.x0) * phase;
    ph.el.setAttribute("x1", x); ph.el.setAttribute("x2", x);
    ph.el.setAttribute("opacity", live ? .45 : .14);
  }

  if (S.haptics && live && navigator.vibrate) {
    const ti = Math.floor(phase * P.ticks);
    if (ti !== lastTickIdx) { lastTickIdx = ti; navigator.vibrate(16); }
  }

  if (S.show.wheel && wheelHand) {
    const c = wheelHand._c;
    wheelHand.setAttribute("transform", "rotate("+phase*360+" "+c[0]+" "+c[1]+")");
    ["R","L","F"].forEach(v => wheelDots[v].forEach(d => {
      let s = phase * P.div - d.pos; if (s < 0) s += P.div;
      const b = live && s < w ? 1 - s/w : 0;
      d.el.setAttribute("r", d.r + b*6); d.el.setAttribute("opacity", .55 + b*.45);
    }));
  }
  if (S.show.balls) ["R","L","F"].forEach(v => {
    if (!ballEls[v]) return;
    ballEls[v].setAttribute("cy", 108 - 82 * ballY(phase, P.voices[v], P.div));
    const b = live ? fire[v] : 0;
    ringEls[v].setAttribute("r", 6 + b*20); ringEls[v].setAttribute("opacity", b*.7);
  });
  if (S.show.grid && gridHead) {
    const idx = Math.floor(phase * P.div);
    gridHead.setAttribute("x", gridHead._L + idx*(gridHead._cw + gridHead._gap));
    gridHead.setAttribute("opacity", live ? .85 : .2);
    ["R","L","F"].forEach(v => gridCells[v].forEach((c, i) => {
      if (c.on) c.el.setAttribute("fill-opacity", live && i === idx ? 1 : .55);
    }));
  }
  if (S.show.comp) compDots.forEach(c => {
    let s = phase * P.div - c.pos; if (s < 0) s += P.div;
    const b = live && s < 1.4 ? 1 - s/1.4 : 0;
    c.el.setAttribute("r", c.r + b*4); c.el.setAttribute("opacity", .45 + b*.55);
  });
}

/* ============================================================
   CALIBRATION
   ============================================================ */
const CAL = { running:false, times:[], taps:[], src:"keyboard" };
function startCal(){
  initAudio();
  if (S.playing) stop();
  CAL.running = true; CAL.taps = []; CAL.times = []; CAL.src = "keyboard";
  const beat = .5, lead = ctx.currentTime + .7, n = 16;
  for (let i = 0; i < n; i++) { const t = lead + i*beat; CAL.times.push(t); hit("click", t, i % 4 === 0); }
  ui.calStart.textContent = "Listening…"; ui.calStart.disabled = true;
  ui.calTarget.textContent = "Play on every click"; ui.calResult.textContent = "";
  setTimeout(finishCal, (lead + n*beat - ctx.currentTime + .35) * 1000);
}
function calTap(t, src){
  CAL.src = src;
  let best = null;
  for (const ct of CAL.times) { const d = t - ct; if (best === null || Math.abs(d) < Math.abs(best)) best = d; }
  if (best !== null && Math.abs(best) < .25) CAL.taps.push(best * 1000);
}
function finishCal(){
  CAL.running = false;
  ui.calStart.textContent = "Calibrate"; ui.calStart.disabled = false;
  ui.calTarget.style.backgroundColor = ""; ui.calTarget.style.borderColor = ""; ui.calTarget.style.transform = "";
  const v = CAL.taps.slice(2).sort((a, b) => a - b);
  if (v.length < 5) {
    ui.calTarget.textContent = "Press calibrate, then play along with the click for a few bars";
    ui.calResult.innerHTML = "<b style='color:var(--warn)'>Only " + v.length + " hits landed.</b> Run it again and hit every click.";
    return;
  }
  const med = v[Math.floor(v.length/2)];
  S.latency[CAL.src] = med; save();
  ui.calTarget.textContent = "Calibrated";
  ui.calResult.innerHTML = "<b style='color:var(--ok)'>" + CAL.src + " offset set to " + med.toFixed(0) +
    " ms</b> from " + v.length + " hits, and subtracted before your playing is plotted.";
}

/* ============================================================
   MIDI
   ============================================================ */
/* General MIDI percussion defaults, per surface. Most kits ship with these. */
const GM = {
  hihat:[42,44,46,22,26], ride:[51,59,53], crash1:[49,55], crash2:[57,52],
  snare:[38,40], rim:[37],    tom1:[48,50], tom2:[45,47], floor:[41,43], kick:[35,36]
};
const MIDI = { access:null, map:{}, learn:null, on:false };
PIECES.forEach(p => { MIDI.map[p] = (GM[p] || []).slice(); });

async function enableMidi(){
  if (!navigator.requestMIDIAccess) {
    ui.midiStatus.innerHTML = "<b style='color:var(--warn)'>This browser has no Web MIDI.</b> " +
      "Chrome, Edge and Firefox support it. Safari's support is newer and less reliable."; return;
  }
  if (!window.isSecureContext) {
    ui.midiStatus.innerHTML = "<b style='color:var(--warn)'>MIDI needs a secure page.</b> " +
      "It works once published over https, but not when the file is opened straight from disk."; return;
  }
  try { MIDI.access = await navigator.requestMIDIAccess({ sysex:false }); }
  catch (e) {
    ui.midiStatus.innerHTML = "<b style='color:var(--bad)'>Permission denied.</b> Allow MIDI for this page and try again."; return;
  }
  MIDI.on = true;
  MIDI.access.onstatechange = bindInputs; bindInputs();
  ui.midiMap.style.display = ""; ui.midiEnable.textContent = "Reconnect";
  ui.midiEnable.classList.add("on"); buildMidiRows();
}
function bindInputs(){
  if (!MIDI.access) return;
  const names = [];
  MIDI.access.inputs.forEach(i => { i.onmidimessage = onMidi; names.push(i.name); });
  ui.midiPill.textContent = names.length ? names.length + " device" + (names.length>1?"s":"") : "no device";
  ui.midiStatus.innerHTML = names.length
    ? "Connected to <b>" + names.join(", ") + "</b>. Hit a pad to check it lights up below, then calibrate."
    : "<b style='color:var(--warn)'>No MIDI device found.</b> Plug the kit in over USB, power it on, then reconnect.";
}
function onMidi(e){
  const [status, note, vel] = e.data;
  if ((status & 0xf0) !== 0x90 || !vel) return;
  if (MIDI.learn) {
    PIECES.forEach(p => { MIDI.map[p] = MIDI.map[p].filter(n => n !== note); });
    MIDI.map[MIDI.learn] = [note];
    MIDI.learn = null; buildMidiRows(); return;
  }
  for (const p of PIECES) if (MIDI.map[p].indexOf(note) !== -1) {
    flashDot(p);
    if (REC.isOpen()) { REC.onHit(p, inputTime(e.timeStamp)); return; }
    strike({ piece:p }, inputTime(e.timeStamp), "midi");
    ui.midiNote.innerHTML = "Last hit: <b>" + KIT_LABEL[p] + "</b>, note " + note + ".";
    return;
  }
  ui.midiNote.innerHTML = "<b style='color:var(--warn)'>Note " + note + " is not mapped.</b> " +
    "Press <b>Learn</b> next to the drum you just hit, then hit it again.";
}
function flashDot(p){
  const d = ui["dot_" + p]; if (!d) return;
  d.style.background = C.ok;
  clearTimeout(d._t); d._t = setTimeout(() => { d.style.background = ""; }, 160);
}
/* Which limb currently plays a given surface, for colouring and grading. */
function limbForPiece(piece){ return pieceMap[piece] ? pieceMap[piece].limb : null; }

function buildMidiRows(){
  ui.midiMap.textContent = "";
  PIECES.filter(p => p !== "rim").forEach(p => {
    const row = document.createElement("div");
    row.className = "maprow";
    const inUse = !!pieceMap[p];
    row.innerHTML =
      '<span class="dot" id="dot_' + p + '"></span>' +
      '<span class="who">' + KIT_LABEL[p] + (inUse ? ' <b style="color:var(--ok)">·</b>' : "") + "</span>" +
      '<span class="notes" id="notes_' + p + '"></span>' +
      '<button class="btn sm" data-learn="' + p + '">Learn</button>';
    ui.midiMap.appendChild(row);
    ui["dot_" + p] = row.querySelector(".dot");
    ui["notes_" + p] = row.querySelector(".notes");
  });
  PIECES.filter(p => p !== "rim").forEach(p => {
    ui["notes_" + p].textContent = MIDI.learn === p ? "hit that pad now…" : MIDI.map[p].join(", ") || "unmapped";
    ui["notes_" + p].style.color = MIDI.learn === p ? C.ok : "";
  });
  if (!MIDI.learn) ui.midiNote.innerHTML =
    "Defaults follow the General MIDI drum map, so most kits work untouched. " +
    "A green dot marks the drums this exercise uses. Press <b>Learn</b> and hit a pad to remap it.";
  updatePads(); drawScatter(); save();
}
function updateMidiUI(){ buildMidiRows(); }

/* ============================================================
   TIMING SCORE
   ============================================================ */
let taps = [];

/* Smooth falloff instead of a step ladder, so one hit drifting across a
   threshold cannot jolt the number. Calibrated to the same leniency as
   before: a quarter of a note-spacing off still scores about 0.87. */
function weightFor(rel){ return 1 / (1 + Math.pow(rel / .62, 2.4)); }

/* Hits expected in one bar from the limbs being graded. Scoring a bar as
   (sum of weights / expected) folds coverage and accuracy into one number,
   so dropping notes costs you the same as playing them badly. */
function expectedPerBar(){
  return ["R","L","F"].filter(v => S.limbs[v]).reduce((a, v) => a + countOf(v), 0);
}
function mean(a){ return a.reduce((x, y) => x + y, 0) / a.length; }

function restPad(v){
  const p = ui["pad"+v]; if (!p) return;
  const on = !!S.limbs[v];
  p.style.background = ""; p.style.color = "";
  p.style.borderColor = on ? rgba(COL[v], .55) : "";
  p.style.opacity = on ? 1 : .42;
}
function flashPad(v){
  const p = ui["pad"+v]; if (!p) return;
  p.style.background = COL[v]; p.style.borderColor = COL[v];
  p.style.color = "#0a0b0e"; p.style.opacity = 1;
  clearTimeout(p._t); p._t = setTimeout(() => restPad(v), 130);
}

/* sel is either {limb} from the keyboard or {piece} from a real pad.
   A pad hit is matched against onsets on that surface, so hitting the ride
   when the exercise wants the hi-hat does not score. */
/* Which surface a limb is on right now, so a key or on-screen pad marks
   the drum the pattern actually has that hand playing at this moment. */
function nearestPiece(limb){
  if (!limb || !ctx || !scheduled.length) return null;
  let best = null, bd = Infinity;
  for (const n of scheduled) {
    if (n.voice !== limb) continue;
    const d = Math.abs(ctx.currentTime - n.t);
    if (d < bd) { bd = d; best = n.piece; }
  }
  return best;
}

/* Nearest scheduled note on a surface, so a pad hit is credited to the hand
   that actually plays it at this moment — in an alternating tom fill both
   hands share every drum, and pieceMap alone would call them all right. */
function nearestOnPiece(piece){
  if (!piece || !ctx || !scheduled.length) return null;
  let best = null, bd = Infinity;
  for (const n of scheduled) {
    if (n.piece !== piece) continue;
    const d = Math.abs(ctx.currentTime - n.t);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function strike(sel, t, source){
  const near = sel.piece ? nearestOnPiece(sel.piece) : null;
  const limb = sel.limb || (near && near.voice) || limbForPiece(sel.piece);
  // Mark the kit before any guard runs. The marker has to appear while
  // stopped, mid-calibration, and on limbs that are not being graded —
  // checking which pad maps to which drum is exactly what you do first.
  pingKit(sel.piece || nearestPiece(sel.limb) || (sel.limb && limbPiece(sel.limb)));
  if (limb) flashPad(limb);
  if (CAL.running) { calTap(t, source); return; }
  if (!S.playing || !ctx || ctx.currentTime < startTime) return;
  if (!limb || !S.limbs[limb]) return;
  const n = countOf(limb);
  if (!n) return;
  const at = t - S.latency[source] / 1000;
  const win = (cycleDur / n) * .5;
  let best = null;
  for (const s of scheduled) {
    if (sel.piece ? s.piece !== sel.piece : s.voice !== sel.limb) continue;
    const d = at - s.t;
    if (best === null || Math.abs(d) < Math.abs(best)) best = d;
  }
  if (best === null || Math.abs(best) > win) return;
  taps.push({ d:best*1000, voice:limb, ref:(cycleMs()/n)*.25,
              bar: Math.max(0, Math.floor((at - startTime) / cycleDur)) });
  if (taps.length > 600) taps.shift();
  drawScatter();
}

/* One pass over the run: systematic offset, spread, and a score for each
   bar. The headline number averages COMPLETED bars only, so it moves once
   a measure instead of lurching on every hit. */
function analyse(){
  if (!taps.length) return null;
  const ds = taps.map(t => t.d);
  const drift = mean(ds);
  const devs = ds.map(d => d - drift);
  const sd = Math.sqrt(mean(devs.map(d => d * d)));

  const byBar = new Map();
  taps.forEach((t, i) => {
    if (!byBar.has(t.bar)) byBar.set(t.bar, []);
    byBar.get(t.bar).push(weightFor(Math.abs(devs[i]) / t.ref));
  });
  const exp = Math.max(1, expectedPerBar());
  const bars = [...byBar.keys()].sort((a, b) => a - b).map(b => ({
    bar: b, n: byBar.get(b).length,
    score: Math.min(1, byBar.get(b).reduce((a, c) => a + c, 0) / exp)
  }));

  const current = S.playing ? barsPlayed : -1;
  const done = bars.filter(b => b.bar !== current);
  const recent = done.slice(-8);
  const live = recent.length ? Math.round(mean(recent.map(b => b.score)) * 100) : null;
  const grade = live === null ? null
    : live >= 92 ? ["Locked in", C.ok] : live >= 78 ? ["Solid", C.ok]
    : live >= 58 ? ["Getting there", "#fbbf24"] : ["Keep at it", C.tx2];
  return { drift, sd, bars, live, grade, done: done.length, ref: taps[taps.length-1].ref };
}

/* Lesson grade over a fixed run: a trimmed mean of the per-bar scores.
   The weakest bar or two are set aside as flukes, so a fumbled entry or one
   lost bar cannot sink an otherwise clean run. Trimming by score rather
   than by position means a good opening bar still counts, and a sustained
   collapse still shows up because only the flukes get removed. Bars with no
   hits at all count as zero, so you cannot pass by playing half of it. */
function gradeRun(bars, total){
  const map = new Map(bars.map(b => [b.bar, b]));
  const full = [];
  for (let i = 0; i < total; i++) full.push(map.get(i) || { bar:i, n:0, score:0 });
  const drop = full.length >= 3 ? Math.max(1, Math.floor(full.length * .15)) : 0;
  const kept = full.slice().sort((a, b) => b.score - a.score).slice(0, full.length - drop);
  return {
    score: kept.length ? Math.round(mean(kept.map(b => b.score)) * 100) : 0,
    kept: kept.length, total, dropped: drop
  };
}
function drawBarTrack(res){
  const svg = ui.barTrack; svg.textContent = "";
  const W = 280, H = 30, n = 16;
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  const list = res ? res.bars.slice(-n) : [];
  const cur = S.playing ? barsPlayed : -1;
  for (let i = 0; i < n; i++) {
    const x = i * (W / n), w = W / n - 3;
    svg.appendChild(el("rect", { x, y:0, width:w, height:H, rx:3, fill:C.s3 }));
  }
  list.forEach((b, i) => {
    const slot = n - list.length + i;
    if (slot < 0) return;
    const x = slot * (W / n), w = W / n - 3, h = Math.max(3, b.score * H);
    const live = b.bar === cur;
    svg.appendChild(el("rect", { x, y:H-h, width:w, height:h, rx:3,
      fill: b.score >= .78 ? C.ok : b.score >= .58 ? "#fbbf24" : "#f87171",
      opacity: live ? .38 : .9 }));
  });
}

function drawScatter(){
  const svg = ui.scatter; svg.textContent = "";
  const W = 280, L = 8, R = W-8, mid = W/2, y = 40;
  svg.setAttribute("viewBox", "0 0 " + W + " 74");
  const res = analyse();
  drawBarTrack(res);
  const ref = res ? res.ref : (cycleMs() / Math.max(1, countOf("R"))) * .25;
  const sc = (R-L)/2 / (ref*.9);
  [[.48,"#2dd4bf",.08],[.28,"#2dd4bf",.1],[.14,C.ok,.16]].forEach(([f,c,o]) =>
    svg.appendChild(el("rect", { x:mid-ref*f*sc, y:y-20, width:ref*f*2*sc, height:40, rx:5, fill:c, opacity:o })));
  svg.appendChild(el("line", { x1:L, y1:y, x2:R, y2:y, stroke:C.line2, "stroke-width":1.5 }));
  svg.appendChild(el("line", { x1:mid, y1:y-22, x2:mid, y2:y+22, stroke:C.tx1, "stroke-width":1.5 }));
  svg.appendChild(txt(L, y+34, "early", { fill:C.tx4, "font-size":9.5, "text-anchor":"start" }));
  svg.appendChild(txt(mid, y+34, "in the pocket", { fill:C.tx3, "font-size":9.5 }));
  svg.appendChild(txt(R, y+34, "late", { fill:C.tx4, "font-size":9.5, "text-anchor":"end" }));
  if (res) {
    const recent = taps.slice(-60);
    recent.forEach((t, i) => svg.appendChild(el("circle", {
      cx:Math.max(L+2, Math.min(R-2, mid + (t.d - res.drift)*sc)), cy:y + (i%3-1)*7,
      r:3.4, fill:COL[t.voice], opacity:.38 + (i+1)/recent.length*.6 })));
    ui.stSpread.textContent = "±" + res.sd.toFixed(0) + " ms";
    ui.stDrift.textContent = Math.abs(res.drift) < 6 ? "dead on"
      : Math.abs(res.drift).toFixed(0) + " ms " + (res.drift > 0 ? "late" : "early");
  } else {
    ui.stSpread.textContent = ui.stDrift.textContent = "—";
  }

  if (res && res.live !== null) {
    ui.stScore.textContent = res.live; ui.stScore.style.color = res.grade[1];
    ui.stGrade.textContent = res.grade[0]; ui.stGrade.style.color = res.grade[1];
    ui.scoreNote.innerHTML = "Averaged over the last " + Math.min(8, res.done) +
      (res.done === 1 ? " bar" : " bars") + ", so it settles rather than jumping on every hit. " +
      "A steady " + Math.abs(res.drift).toFixed(0) + " ms offset is measured and removed first.";
  } else if (res) {
    ui.stScore.textContent = "·"; ui.stScore.style.color = "";
    ui.stGrade.textContent = "Listening…"; ui.stGrade.style.color = "";
    ui.scoreNote.textContent = "The score appears once you finish a full bar.";
  } else {
    ui.stScore.textContent = "—"; ui.stScore.style.color = "";
    ui.stGrade.textContent = "Play along to begin"; ui.stGrade.style.color = "";
    ui.scoreNote.innerHTML = inputHint();
  }
}
function inputHint(){
  const on = ["R","L","F"].filter(v => S.limbs[v]);
  if (!on.length) return "Turn on at least one limb below to be graded.";
  const parts = on.map(v => "<b>" + LIMB_LABEL[v] + "</b> on the " + KIT_LABEL[limbPiece(v)].toLowerCase());
  return MIDI.on
    ? "Press play, then play along on your kit: " + parts.join(", ") + "."
    : "Press play, then play along using " + on.map(v => "<b>" + LIMB_KEY[v] + "</b>").join(", ") +
      " — " + parts.join(", ") + ". Connect a kit in Setup to play it for real.";
}

/* ============================================================
   LESSONS
   ============================================================ */
function stepKey(){ return S.lesson.setId + ":" + S.lesson.step; }
function startLesson(id){
  S.lesson.setId = id; S.lesson.step = 0; S.lesson.active = true;
  ui.lessonResult.textContent = "";
  // Rebase the clock too: without this the new step inherits the old bar
  // count and cycle length, so it grades and fails before a note is played.
  loadStep(); restartIfPlaying(); closeDrawer(); closeSidebar();
}
function loadStep(){
  const st = lessonStep(); if (!st) return;
  S.patternId = st.pattern; S.bpm = st.bpm;
  ui.bpm.value = st.bpm; ui.bpmVal.textContent = st.bpm;
  const P = pat();
  S.group = P.group; S.navOpen = P.group;
  if (P.group === "polyrhythm") {
    S.polyIdx = PATTERNS.POLY_DEFS.findIndex(d => d.x === P.ratio[0] && d.y === P.ratio[1]);
    S.polyInX = P.pulseIsX;
  }
  if (st.limbs) { S.limbs = { R:0, L:0, F:0 }; st.limbs.forEach(v => { S.limbs[v] = 1; }); }
  const set = lessonSet();
  if (set && set.reading) setShow({ kit:1, limbs:1, wheel:0, balls:0, grid:0, comp:0, notation:1 });
  taps = []; S.lesson.judged = false;
  rebuild();
}
/* A lesson step runs for a fixed number of bars, then stops itself and
   grades the whole run at once. */
function judgeLesson(){
  const st = lessonStep();
  if (!S.lesson.active || !st || S.lesson.judged) return;
  if (barsPlayed < st.bars) return;
  S.lesson.judged = true;
  const res = analyse();
  stop();
  if (!res) {
    ui.lessonResult.innerHTML = "<b style='color:var(--warn)'>No hits landed.</b> " +
      "Play along on your kit, or with " + ["R","L","F"].filter(v => S.limbs[v])
        .map(v => LIMB_KEY[v]).join(" and ") + ".";
    renderLesson(); return;
  }
  const g = gradeRun(res.bars, st.bars);
  const passed = g.score >= st.minScore;
  if (passed && (!S.progress[stepKey()] || S.progress[stepKey()].score < g.score))
    S.progress[stepKey()] = { score:g.score, bpm:S.bpm, at:new Date().toISOString().slice(0,10) };
  save();
  const setAside = g.dropped === 0 ? ""
    : g.dropped === 1 ? "Your weakest bar was set aside."
    : "Your weakest " + g.dropped + " bars were set aside.";
  ui.lessonResult.innerHTML = passed
    ? "<b style='color:var(--ok)'>Passed with " + g.score + ".</b> Target was " + st.minScore +
      ". Scored across " + g.kept + " of " + g.total + " bars. " + setAside
    : "<b style='color:var(--warn)'>" + g.score + " of " + st.minScore + " needed.</b> " +
      setAside + " Run it again, or drop the tempo a few clicks.";
  renderLesson(); buildLessonNav();
}
function renderLesson(){
  const set = lessonSet();
  if (!set || !S.lesson.active) { ui.lessonPanel.style.display = "none"; ui.footStat.textContent = "Free practice"; return; }
  ui.lessonPanel.style.display = "";
  const st = lessonStep();
  ui.lessonTitle.textContent = set.title;
  ui.lessonStep.innerHTML = "Step " + (S.lesson.step+1) + " of " + set.steps.length + " · <b>" +
    (PATTERNS.byId[st.pattern] || {}).name + "</b> at " + st.bpm + " bpm · " + st.bars +
    " bars · pass at " + st.minScore;
  ui.lessonNote.textContent = st.note || "";
  ui.lessonDots.textContent = "";
  set.steps.forEach((s, i) => {
    const d = document.createElement("button");
    d.type = "button";
    d.className = "lstep" + (i === S.lesson.step ? " cur" : "") + (S.progress[set.id+":"+i] ? " done" : "");
    const nm = (PATTERNS.byId[s.pattern] || {}).name || "";
    d.title = nm;
    d.setAttribute("aria-label", "Step " + (i+1) + ", " + nm +
      (S.progress[set.id+":"+i] ? ", passed" : "") + (i === S.lesson.step ? ", current" : ""));
    d.onclick = () => { S.lesson.step = i; ui.lessonResult.textContent = ""; loadStep(); restartIfPlaying(); };
    ui.lessonDots.appendChild(d);
  });
  const done = set.steps.filter((s, i) => S.progress[set.id+":"+i]).length;
  ui.lessonProgress.textContent = done + " / " + set.steps.length;
  ui.lessonNext.disabled = S.lesson.step >= set.steps.length - 1;
  ui.footStat.textContent = set.title + " · step " + (S.lesson.step+1);
}

/* ============================================================
   UI
   ============================================================ */
const ui = {};
("sidebar menuBtn navLibrary navLessons footStat patName patSig patSub feel swap setupBtn " +
 "viewRow stage rail kit kitnote wheel wheelnote balls grid gridnote comp staff notationNote " +
 "panelKit panelLimbs panelWheel panelBalls panelGrid panelComp panelNotation " +
 "limbR limbL limbF limbRnum limbLnum limbFnum limbRsnd limbLsnd limbFsnd " +
 "scatter barTrack stScore stGrade stSpread stDrift resetTaps scoreNote padR padL padF limbRow limbCount " +
 "lessonPanel lessonTitle lessonProgress lessonStep lessonDots lessonNote lessonResult lessonNext lessonExit " +
 "play playIcon bpm bpmVal bpmUp bpmDown mR mL mF mM barCount phasebar " +
 "topactions mobileCtl thumbBar padWrap padHome tour tourRing tourPath tourCard tourTitle tourBody tourStep tourSkip tourBack tourNext guideBtn coach coachRing coachPath coachTip coachText coachHide scrim drawer drawerClose soundR soundL soundF midiEnable midiStatus midiMap midiPill midiNote " +
 "calTarget calStart calClear calResult " +
 "trainer countin haptics exPlay exNote beatRecord beatExport beatImport beatFile beatNote").split(/\s+/).forEach(id => ui[id] = document.getElementById(id));

/* ---- navigation ---- */
function buildNav(){
  ui.navLibrary.textContent = "";
  PATTERNS.groups.forEach(g => {
    const open = S.navOpen === g.key;
    const head = document.createElement("button");
    head.className = "navgroup"; head.type = "button";
    head.setAttribute("aria-expanded", String(open));
    head.innerHTML = '<span class="gdot"></span>' + g.label +
      '<span class="chev">&#9654;</span>';
    head.onclick = () => { S.navOpen = open ? null : g.key; buildNav(); };

    const list = document.createElement("div");
    list.className = "navlist" + (open ? " open" : "");
    if (g.key === "polyrhythm") {
      PATTERNS.POLY_DEFS.forEach((d, i) => {
        const b = document.createElement("button");
        b.className = "navitem"; b.type = "button";
        b.setAttribute("aria-current", String(S.group === "polyrhythm" && S.polyIdx === i));
        b.innerHTML = d.x + " against " + d.y + '<span class="sig">' + d.x + ":" + d.y + "</span>";
        b.onclick = () => { S.group = "polyrhythm"; S.polyIdx = i; S.polyInX = true;
          exitLessonIfBrowsing(); setPoly(); closeSidebar(); };
        list.appendChild(b);
      });
    } else {
      PATTERNS[g.key].forEach(p => {
        const b = document.createElement("button");
        b.className = "navitem"; b.type = "button";
        b.setAttribute("aria-current", String(S.patternId === p.id));
        b.innerHTML = p.name + '<span class="sig">' + p.sig[0] + "/" + p.sig[1] + "</span>";
        b.onclick = () => { S.group = g.key; S.patternId = p.id;
          exitLessonIfBrowsing(); rebuild(); restartIfPlaying(); closeSidebar(); };
        if (p.custom) {
          const x = document.createElement("button");
          x.className = "navdel"; x.type = "button";
          x.setAttribute("aria-label", "Delete " + p.name);
          x.textContent = "\u00d7";
          x.onclick = ev => {
            ev.stopPropagation();
            if (!confirm("Delete \u201c" + p.name + "\u201d? This cannot be undone.")) return;
            const wasOn = S.patternId === p.id;
            PATTERNS.removeCustom(p.id); saveBeats();
            if (wasOn) { S.group = "straight"; S.patternId = PATTERNS.straight[0].id; }
            rebuild(); restartIfPlaying();
          };
          b.appendChild(x);
        }
        list.appendChild(b);
      });
      if (g.key === "custom") {
        const rec = document.createElement("button");
        rec.className = "navitem navrec"; rec.type = "button";
        rec.innerHTML = '<span class="recdot"></span>' +
          (PATTERNS.custom.length ? "Record another" : "Record a beat");
        rec.onclick = () => { openRecorder(); closeSidebar(); };
        list.appendChild(rec);
      }
    }
    ui.navLibrary.appendChild(head);
    ui.navLibrary.appendChild(list);
  });
}
function exitLessonIfBrowsing(){ S.lesson.active = false; S.lesson.setId = null; }
function buildLessonNav(){
  ui.navLessons.textContent = "";
  LESSONS.sets.forEach(set => {
    const done = set.steps.filter((s, i) => S.progress[set.id + ":" + i]).length;
    const b = document.createElement("button");
    b.className = "navitem"; b.type = "button";
    b.setAttribute("aria-current", String(S.lesson.active && S.lesson.setId === set.id));
    b.innerHTML = set.title + '<span class="prog' + (done === set.steps.length ? " done" : "") + '">' +
      done + "/" + set.steps.length + "</span>";
    b.onclick = () => startLesson(set.id);
    ui.navLessons.appendChild(b);
  });
}
function setPoly(){
  const d = PATTERNS.POLY_DEFS[S.polyIdx];
  S.patternId = "poly-" + d.x + "-" + d.y + "-in" + (S.polyInX ? d.x : d.y);
  rebuild(); restartIfPlaying();
}

/* ---- topbar ---- */
function buildTopbar(){
  const P = pat();
  ui.patName.textContent = P.name;
  ui.patSig.textContent = P.sig[0] + "/" + P.sig[1];
  ui.patSub.textContent = P.bars > 1
    ? P.bars + " bars of " + (P.sig[0] / P.bars) + "/" + P.sig[1] + " · " + P.div + " boxes"
    : P.div + " boxes" + (P.accents ? " · " + P.accents.join("+") : "") +
      (P.ratio ? " · counted in " + P.sig[0] : "");
  ui.swap.style.display = P.swappable ? "" : "none";
  ui.swap.setAttribute("aria-pressed", String(S.swap));

  ui.feel.textContent = "";
  if (P.group === "polyrhythm") {
    const d = PATTERNS.POLY_DEFS[S.polyIdx];
    [[true, d.x], [false, d.y]].forEach(([inX, n]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", String(S.polyInX === inX));
      b.innerHTML = "Count in " + n + "<small>" + n + "/4</small>";
      b.onclick = () => { S.polyInX = inX; setPoly(); };
      ui.feel.appendChild(b);
    });
    ui.feel.style.display = "";
  } else ui.feel.style.display = "none";
}

/* ---- panels ---- */
const PANELS = { kit:"panelKit", limbs:"panelLimbs", wheel:"panelWheel", balls:"panelBalls",
                 grid:"panelGrid", comp:"panelComp", notation:"panelNotation" };
function setShow(next){
  Object.assign(S.show, next);
  Object.keys(PANELS).forEach(k => { ui[PANELS[k]].style.display = S.show[k] ? "" : "none"; });
  [...ui.viewRow.querySelectorAll("[data-view]")].forEach(b =>
    b.setAttribute("aria-pressed", String(!!S.show[b.dataset.view])));
  save();
}

/* ---- kit selects, chips, pads ---- */
function buildSounds(){
  [["soundR","R",HAND_KIT],["soundL","L",HAND_KIT],["soundF","F",FOOT_KIT]].forEach(([id, v, list]) => {
    ui[id].textContent = "";
    list.forEach(k => {
      const o = document.createElement("option");
      o.value = k; o.textContent = KIT_LABEL[k];
      o.selected = S.sound[v] === k;
      ui[id].appendChild(o);
    });
    ui[id].onchange = e => { S.sound[v] = e.target.value; buildKit(); buildNotation();
      updateLabels(); updatePads(); updateLimbRow(); save(); };
  });
}
function chip(node, on, color, label){
  node.setAttribute("aria-pressed", String(on));
  node.classList.toggle("off", !on);
  const sw = node.querySelector(".swatch"), lb = node.querySelector(".label");
  if (sw) sw.style.background = on && color ? color : "";
  if (lb && label !== undefined) lb.textContent = label;
  if (color) node.style.borderColor = on ? rgba(color, .45) : "";
}
function updateLabels(){
  ["R","L","F"].forEach(v => {
    const extras = limbExtras(v);
    ui["limb"+v+"num"].textContent = countOf(v);
    ui["limb"+v+"num"].style.color = COL[v];
    ui["limb"+v+"snd"].textContent = KIT_LABEL[limbPiece(v)].toLowerCase() +
      (extras.length ? " +" + extras.length : "");
    chip(ui["m"+v], !S.mute[v], COL[v], KIT_LABEL[limbPiece(v)]);
  });
  chip(ui.mM, !S.mute.M, C.tx2, "Click");
  chip(ui.trainer, S.trainer, C.ok);
  chip(ui.countin, S.countIn, C.ok);
  chip(ui.haptics, S.haptics, C.ok);
  const P = pat();
  if (CONFIG.useExamples && P.ratio) {
    ui.exPlay.disabled = false; ui.exNote.textContent = "Ernesto playing " + P.name + ".";
  } else {
    ui.exPlay.disabled = true;
    ui.exNote.innerHTML = P.ratio
      ? "Waiting on the recording. Drop it at <code>" + CONFIG.exampleUrl(P) + "</code> and set <code>useExamples: true</code>."
      : "Performance clips are set up for the polyrhythms so far.";
  }
}
function updatePads(){
  ["R","L","F"].forEach(v => {
    const p = ui["pad"+v]; if (!p) return;
    const home = limbPiece(v), extras = limbExtras(v);
    const label = KIT_LABEL[home] + (extras.length ? " +" + extras.length : "");
    p.innerHTML = MIDI.on
      ? "<b>" + label + "</b><em>" + LIMB_LABEL[v] + "</em><i>" +
        (extras.length ? "also " + extras.map(x => KIT_LABEL[x].toLowerCase()).join(", ") : "hit the pad") + "</i>"
      : "<b>" + LIMB_KEY[v] + "</b><em>" + LIMB_LABEL[v] + "</em><i>" + label.toLowerCase() + "</i>";
    restPad(v);
  });
}
function updateLimbRow(){
  [...ui.limbRow.querySelectorAll("[data-limb]")].forEach(b => {
    const v = b.dataset.limb;
    chip(b, !!S.limbs[v], COL[v], LIMB_LABEL[v] + " · " + KIT_LABEL[limbPiece(v)].toLowerCase());
  });
  const n = ["R","L","F"].filter(v => S.limbs[v]).length;
  ui.limbCount.textContent = n === 0 ? "none graded" : n + (n === 1 ? " limb" : " limbs");
}

function rebuild(){
  idleDrawn = false;
  buildNav(); buildLessonNav(); buildTopbar(); buildSounds();
  if (MIDI.on) setTimeout(buildMidiRows, 0);
  buildGrid(); buildKit(); buildWheel(); buildBalls(); buildComposite(); buildNotation();
  updateLabels(); updatePads(); updateLimbRow(); drawScatter(); renderLesson();
}

/* ---- beat recorder ---- */
function openRecorder(){
  if (S.playing) stop();                 // one loop at a time
  initAudio();                           // opening is a gesture; prime audio here
  closeDrawer();
  REC.open();
}
REC.init({
  getCtx: () => ctx,
  initAudio, hit,
  COL, KIT_LABEL, LIMB_LABEL,
  onSaved(p){
    PATTERNS.addCustom(p); saveBeats();
    S.group = "custom"; S.navOpen = "custom"; S.patternId = p.id;
    exitLessonIfBrowsing();
    // A recorded beat is just a pattern now, so everything else follows.
    rebuild();
    ui.stage.scrollTop = 0;
  },
  onClose(){ updateCoach(); }
});

/* ---- drawer + sidebar ---- */
function openDrawer(){ ui.drawer.classList.add("open"); ui.scrim.classList.add("open");
  ui.drawer.setAttribute("aria-hidden","false"); ui.drawer.removeAttribute("inert");
  ui.drawerClose.focus(); }
function closeDrawer(){ ui.drawer.classList.remove("open"); ui.scrim.classList.remove("open");
  ui.drawer.setAttribute("aria-hidden","true"); ui.drawer.setAttribute("inert",""); }
function closeSidebar(){ ui.sidebar.classList.remove("open"); syncSidebarInert(); }
/* Off-canvas panels must leave the tab order, or keyboard users land on
   controls they cannot see. */
function syncSidebarInert(){
  const off = NARROW.matches && !ui.sidebar.classList.contains("open");
  if (off) ui.sidebar.setAttribute("inert", ""); else ui.sidebar.removeAttribute("inert");
}

/* ---- wiring ---- */
ui.play.onclick = () => { S.playing ? stop() : play(); };
ui.bpm.oninput = e => { const v = +e.target.value; ui.bpmVal.textContent = v;
  if (S.playing) pendingBpm = v; else S.bpm = v; };
function nudgeBpm(d){ ui.bpm.value = Math.max(30, Math.min(220, +ui.bpm.value + d));
  ui.bpm.dispatchEvent(new Event("input")); }
ui.bpmUp.onclick = () => nudgeBpm(1);
ui.bpmDown.onclick = () => nudgeBpm(-1);
ui.swap.onclick = () => { S.swap = !S.swap; rebuild(); };
["R","L","F"].forEach(v => ui["m"+v].onclick = () => { S.mute[v] = !S.mute[v]; updateLabels(); });
ui.mM.onclick = () => { S.mute.M = !S.mute.M; updateLabels(); };
ui.trainer.onclick = () => { S.trainer = !S.trainer; updateLabels(); };
ui.countin.onclick = () => { S.countIn = !S.countIn; updateLabels(); };
ui.haptics.onclick = () => { S.haptics = !S.haptics; updateLabels();
  if (S.haptics && navigator.vibrate) navigator.vibrate(20); };
ui.resetTaps.onclick = () => { taps = []; drawScatter(); };
ui.calStart.onclick = startCal;
ui.calClear.onclick = () => { S.latency.keyboard = 0; S.latency.midi = 0; save();
  ui.calResult.textContent = "Offsets cleared."; };
ui.midiEnable.onclick = enableMidi;
ui.midiMap.onclick = e => {
  const b = e.target.closest("[data-learn]"); if (!b) return;
  MIDI.learn = b.dataset.learn; buildMidiRows();
  ui.midiNote.innerHTML = "Now hit the pad you want for <b>" + KIT_LABEL[MIDI.learn] + "</b>.";
};
ui.viewRow.onclick = e => {
  const b = e.target.closest("[data-view]");
  if (b) { const k = b.dataset.view; setShow({ [k]: S.show[k] ? 0 : 1 }); return; }
  const p = e.target.closest("[data-preset]");
  if (!p) return;
  setShow(p.dataset.preset === "reading"
    ? { kit:1, limbs:1, wheel:0, balls:0, grid:0, comp:0, notation:1 }
    : { kit:1, limbs:1, wheel:1, balls:1, grid:1, comp:1, notation:1 });
};
["R","L","F"].forEach(v => ui["pad"+v].onpointerdown = e => {
  e.preventDefault(); initAudio();
  if (REC.isOpen()) { REC.onHit(KEY_PIECE[v], inputTime(e.timeStamp)); return; }
  strike({limb:v}, inputTime(e.timeStamp), "keyboard"); });

/* Drumming on a touchscreen means tapping the same spot faster than the
   double-tap threshold, which iOS reads as "zoom in". touch-action in the
   stylesheet handles most browsers, but some WebKit builds ignore it, so
   refuse the gesture outright: swallowing touchend stops the second tap
   from ever pairing with the first. Pinch-to-zoom is untouched. */
["padR","padL","padF","thumbBar"].forEach(id => {
  const n = ui[id]; if (!n) return;
  n.addEventListener("touchend", e => e.preventDefault(), { passive:false });
});
document.addEventListener("dblclick", e => {
  if (e.target.closest(".pad, .thumbBar, .transport, .chip, .vt, .playbtn")) e.preventDefault();
}, { passive:false });

ui.limbRow.onclick = e => {
  const b = e.target.closest("[data-limb]"); if (!b) return;
  const v = b.dataset.limb;
  S.limbs[v] = S.limbs[v] ? 0 : 1;
  taps = taps.filter(t => S.limbs[t.voice]);
  updateLimbRow(); updatePads(); drawScatter(); save();
};
ui.lessonNext.onclick = () => {
  const set = lessonSet(); if (!set) return;
  S.lesson.step = Math.min(set.steps.length - 1, S.lesson.step + 1);
  ui.lessonResult.textContent = ""; loadStep(); restartIfPlaying();
};
ui.lessonExit.onclick = () => { exitLessonIfBrowsing(); rebuild(); };
ui.beatRecord.onclick = openRecorder;
ui.beatExport.onclick = () => {
  const data = JSON.stringify({ kind:"rhythm-trainer-beats", version:1,
    beats:PATTERNS.custom.map(p => ({ id:p.id, name:p.name, short:p.short, sig:p.sig,
      div:p.div, ticks:p.ticks, accents:p.accents, voices:p.voices, kit:p.kit,
      marks:p.marks, bars:p.bars, recordedAt:p.recordedAt })) }, null, 1);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type:"application/json" }));
  a.download = "my-beats.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
ui.beatImport.onclick = () => ui.beatFile.click();
ui.beatFile.onchange = e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let n = 0;
    try {
      const d = JSON.parse(r.result);
      const list = Array.isArray(d) ? d : (d && d.beats) || [];
      list.forEach(o => { if (validBeat(o)) { PATTERNS.addCustom(o); n++; } });
    } catch (err) { n = -1; }
    ui.beatNote.innerHTML = n > 0
      ? "<b style='color:var(--ok)'>Imported " + n + (n === 1 ? " beat." : " beats.") + "</b>"
      : n === 0 ? "<b style='color:var(--warn)'>Nothing importable in that file.</b>"
      : "<b style='color:var(--bad)'>That file could not be read.</b>";
    if (n > 0) { saveBeats(); S.navOpen = "custom"; rebuild(); }
  };
  r.readAsText(f); e.target.value = "";
};

ui.setupBtn.onclick = openDrawer;
ui.drawerClose.onclick = closeDrawer;
ui.scrim.onclick = () => { closeDrawer(); closeSidebar(); };
ui.menuBtn.onclick = () => { ui.sidebar.classList.toggle("open"); ui.scrim.classList.toggle("open"); syncSidebarInert(); };

let exAudio = null;
ui.exPlay.onclick = () => {
  if (!exAudio) exAudio = new Audio();
  const src = CONFIG.exampleUrl(pat());
  if (exAudio.src.indexOf(src) === -1) exAudio.src = src;
  if (exAudio.paused) { exAudio.play(); ui.exPlay.textContent = "Stop example"; }
  else { exAudio.pause(); exAudio.currentTime = 0; ui.exPlay.textContent = "Play example"; }
  exAudio.onended = () => { ui.exPlay.textContent = "Play example"; };
};

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeDrawer(); closeSidebar(); endTour(); return; }
  if (e.repeat) return;
  // Never steal a key from something the user has focused: Space must still
  // press the focused button, and the arrows must still move a slider.
  if (e.target.closest("input,select,textarea,button,a,[contenteditable]")) return;
  const k = e.key.toLowerCase();
  if (S.keyTriggers === false && "fjb".includes(k)) return;
  if (e.code === "Space") { e.preventDefault(); if (REC.isOpen()) return; S.playing ? stop() : play(); }
  else if (k === "f") { e.preventDefault();
    if (REC.isOpen()) REC.onHit(KEY_PIECE.L, inputTime(e.timeStamp));
    else strike({limb:"L"}, inputTime(e.timeStamp), "keyboard"); }
  else if (k === "j") { e.preventDefault();
    if (REC.isOpen()) REC.onHit(KEY_PIECE.R, inputTime(e.timeStamp));
    else strike({limb:"R"}, inputTime(e.timeStamp), "keyboard"); }
  else if (k === "b") { e.preventDefault();
    if (REC.isOpen()) REC.onHit(KEY_PIECE.F, inputTime(e.timeStamp));
    else strike({limb:"F"}, inputTime(e.timeStamp), "keyboard"); }
  else if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); nudgeBpm(e.shiftKey ? 5 : 1); }
  else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); nudgeBpm(e.shiftKey ? -5 : -1); }
});

/* ============================================================
   GUIDED TOUR
   A first-run walkthrough that puts a green frame around the thing being
   described and draws an arrow to it. Replayable from the Guide button.
   ============================================================ */
const TOUR = [
  { sel:"#navLibrary", side:"right", title:"Everything you can play",
    body:"Rhythms live here, grouped by kind. <b>Around the kit</b> has the crash, ride and tom exercises. Click a group to open it, then pick a rhythm.",
    before(){ S.navOpen = "kit"; buildNav(); } },
  { sel:".ptitle", side:"bottom", title:"What you're playing right now",
    body:"The name, the time signature, and how the bar is cut up. Nothing here needs setting — it follows whatever you picked." },
  { sel:"#panelKit", side:"bottom", title:"Your kit, from the throne",
    body:"This is the view you'd have sitting down. Each drum lights up the moment it is struck, in the colour of the limb playing it — <b>amber right hand, teal left, violet foot</b>.",
    before(){ setShow({ kit:1 }); ui.stage.scrollTop = 0; } },
  { sel:"#play", side:"top", title:"Press play to hear it",
    body:"You get a count-in first. Watch the kit and the numbers move together before you try to join in." },
  { sel:"#limbRow", side:"left", title:"Start with one limb",
    body:"Three limbs at once is a lot. Turn on just the <b>right hand</b> to begin — the rest keeps playing for you, it simply isn't graded yet. Add a limb when the first feels easy." },
  { sel:".pads", side:"left", title:"How you play along",
    body:"Without a kit, use the <b>F</b>, <b>J</b> and <b>B</b> keys. These light up every time you hit them, so you can always see you're getting through." },
  { sel:"#setupBtn", side:"bottom", title:"Bring your own kit",
    body:"Open <b>Setup</b> to connect an electronic kit over USB. Every surface — both crashes, ride, hi-hat, snare, both rack toms, floor tom and kick — has its own <b>Learn</b> button. Press Learn, hit the pad, done." },
  { sel:"#stScore", side:"left", title:"Your timing, one bar at a time",
    body:"Scored on how evenly you space your hits, not how close you are to the click. It averages over measures so it settles instead of jumping, and the strip beneath shows each bar." },
  { sel:"#navLessons", side:"right", title:"Then follow a lesson",
    body:"A lesson runs a set number of bars, stops itself, and grades the whole run — setting aside your weakest bar, so one fumble doesn't sink it. Progress is saved in this browser." }
];
let tourAt = -1;

function place(target, side, card, ring, path){
  const r = target.getBoundingClientRect(), pad = 8;
  const vw = innerWidth, vh = innerHeight;
  // On a phone there is no room beside anything, so flip to whichever of
  // above/below has space. Keeps the card off the thing it points at.
  if (NARROW.matches) side = (r.top + r.height/2) > vh * 0.52 ? "top" : "bottom";
  ring.style.left = (r.left - pad) + "px"; ring.style.top = (r.top - pad) + "px";
  ring.style.width = (r.width + pad*2) + "px"; ring.style.height = (r.height + pad*2) + "px";

  const cw = card.offsetWidth || 308, ch = card.offsetHeight || 150, gap = 44;
  let x, y;
  if (side === "right")       { x = r.right + gap;      y = r.top + r.height/2 - ch/2; }
  else if (side === "left")   { x = r.left - cw - gap;  y = r.top + r.height/2 - ch/2; }
  else if (side === "top")    { x = r.left + r.width/2 - cw/2; y = r.top - ch - gap; }
  else                        { x = r.left + r.width/2 - cw/2; y = r.bottom + gap; }
  x = Math.max(14, Math.min(vw - cw - 14, x));
  y = Math.max(14, Math.min(vh - ch - 14, y));
  // Never sit on top of the fixed pad bar — it is what the student taps.
  if (NARROW.matches && ui.thumbBar.offsetParent && target !== ui.thumbBar) {
    const tb = ui.thumbBar.getBoundingClientRect();
    if (y + ch > tb.top - 8 && r.top < tb.top) y = Math.max(14, tb.top - ch - 12);
  }
  card.style.left = x + "px"; card.style.top = y + "px";

  // Arrow from the card's edge to the ring's edge. Both ends are found by
  // walking out from each box centre toward the other, so the line never
  // starts inside the card or ends inside the highlight.
  const edge = (bx, by, bw, bh, tx, ty) => {
    const dx = tx - bx, dy = ty - by;
    if (!dx && !dy) return [bx, by];
    const s = Math.min(dx ? (bw/2)/Math.abs(dx) : Infinity, dy ? (bh/2)/Math.abs(dy) : Infinity);
    return [bx + dx*s, by + dy*s];
  };
  const ccx = x + cw/2, ccy = y + ch/2;
  const rcx = r.left + r.width/2, rcy = r.top + r.height/2;
  let [sx, sy] = edge(ccx, ccy, cw, ch, rcx, rcy);
  let [ex, ey] = edge(rcx, rcy, r.width + pad*2, r.height + pad*2, ccx, ccy);
  const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1;
  sx += dx/len * 7; sy += dy/len * 7;
  ex -= dx/len * 11; ey -= dy/len * 11;
  const bend = Math.min(20, len * .22);
  const mx = (sx+ex)/2 + dy/len * bend, my = (sy+ey)/2 - dx/len * bend;
  path.setAttribute("d", len < 16 ? "" : "M"+sx+" "+sy+" Q"+mx+" "+my+" "+ex+" "+ey);
}

function showTour(i){
  const step = TOUR[i]; if (!step) return endTour();
  tourAt = i;
  if (step.before) step.before();
  const t = document.querySelector(step.sel);
  if (!t) return showTour(i + 1);
  // On a phone the library and lessons live behind the menu, so open the
  // drawer for those steps and shut it again for the rest — otherwise the
  // arrow points at something that is not on screen.
  if (NARROW.matches) ui.sidebar.classList.toggle("open", !!t.closest(".sidebar"));
  t.scrollIntoView({ block:"nearest", behavior:"smooth" });
  ui.tourTitle.textContent = step.title;
  ui.tourBody.innerHTML = step.body;
  ui.tourStep.textContent = (i+1) + " of " + TOUR.length;
  ui.tourBack.style.visibility = i === 0 ? "hidden" : "";
  ui.tourNext.textContent = i === TOUR.length - 1 ? "Finish" : "Next";
  ui.tour.classList.add("on"); ui.tour.setAttribute("aria-hidden","false"); ui.tour.removeAttribute("inert");
  const put = () => place(t, step.side, ui.tourCard, ui.tourRing, ui.tourPath);
  requestAnimationFrame(put);
  // Re-measure once the sidebar slide and any scroll have settled.
  clearTimeout(showTour._t); showTour._t = setTimeout(put, 320);
}
function endTour(){
  tourAt = -1;
  ui.tour.classList.remove("on"); ui.tour.setAttribute("aria-hidden","true");
  ui.tour.setAttribute("inert",""); clearTimeout(showTour._t);
  closeSidebar();
  try { localStorage.setItem(STORE + ".seen", "1"); } catch (e) {}
  updateCoach();
}
ui.tourNext.onclick = () => showTour(tourAt + 1);
ui.tourBack.onclick = () => showTour(tourAt - 1);
ui.tourSkip.onclick = endTour;
ui.guideBtn.onclick = () => showTour(0);
addEventListener("resize", () => { if (tourAt >= 0) showTour(tourAt); else updateCoach(); });

/* ============================================================
   CONTEXTUAL NUDGE
   One green marker on whatever the student should do next, based on
   what they have and have not done yet.
   ============================================================ */
let coachOff = false, coachKey = "";
function nextAction(){
  if (coachOff || tourAt >= 0) return null;
  const on = ["R","L","F"].filter(v => S.limbs[v]);
  if (!on.length) return { sel:"#limbRow", side:"left", text:"Turn on a limb so your playing gets graded." };
  if (!S.playing) return { sel:"#play", side:"top",
    text: S.lesson.active ? "Press play — this step runs " + lessonStep().bars + " bars, then grades itself."
                          : "Press play to hear it." };
  if (S.playing && !taps.length) return { sel:".pads", side:"left",
    text: MIDI.on ? "Play along on your kit. Your hits light these up."
                  : "Play along with <b>" + on.map(v => LIMB_KEY[v]).join(", ") + "</b>, or connect a kit in Setup." };
  return null;
}
function hideCoach(){ ui.coach.classList.remove("on"); ui.coach.setAttribute("aria-hidden","true"); }
function updateCoach(){
  const a = nextAction();
  if (!a) { hideCoach(); return; }
  const t = document.querySelector(a.sel);
  if (!t || !t.offsetParent) { hideCoach(); return; }
  const key = a.sel + a.text;
  ui.coachText.innerHTML = a.text;
  ui.coach.classList.add("on"); ui.coach.setAttribute("aria-hidden","false");
  place(t, a.side, ui.coachTip, ui.coachRing, ui.coachPath);
  coachKey = key;
}
ui.coachHide.onclick = () => { coachOff = true; hideCoach(); };
setInterval(updateCoach, 700);

/* ============================================================
   RESPONSIVE LAYOUT
   On a phone there is no keyboard and no Web MIDI on iOS, so the tap pads
   are the only way in — they get moved into a fixed bar in the thumb zone.
   The count switch and swap move out of the cramped top bar into the stage.
   ============================================================ */
const NARROW = matchMedia("(max-width: 860px)");
const CALM = matchMedia("(prefers-reduced-motion: reduce)");
function applyLayout(){
  if (NARROW.matches) {
    if (ui.feel.parentNode !== ui.mobileCtl) ui.mobileCtl.appendChild(ui.feel);
    if (ui.swap.parentNode !== ui.mobileCtl) ui.mobileCtl.appendChild(ui.swap);
    if (ui.padWrap.parentNode !== ui.thumbBar) ui.thumbBar.appendChild(ui.padWrap);
  } else {
    // Order matters: swap has to be back in place before feel can be
    // inserted relative to it, or insertBefore throws and the pads are
    // left stranded inside the hidden mobile bar.
    if (ui.swap.parentNode !== ui.topactions) ui.topactions.insertBefore(ui.swap, ui.guideBtn);
    if (ui.feel.parentNode !== ui.topactions) ui.topactions.insertBefore(ui.feel, ui.swap);
    if (ui.padWrap.parentNode !== ui.padHome) ui.padHome.insertBefore(ui.padWrap, ui.padHome.firstChild);
  }
  ui.mobileCtl.style.display = NARROW.matches ? "" : "none";
}
NARROW.addEventListener("change", () => { applyLayout(); syncSidebarInert();
  if (tourAt >= 0) showTour(tourAt); else updateCoach(); });

/* ---- boot ---- */
load(); loadBeats();
ui.bpm.value = S.bpm; ui.bpmVal.textContent = S.bpm;
setPlayIcon(false);
ui.drawer.setAttribute("inert",""); ui.tour.setAttribute("inert","");
applyLayout(); syncSidebarInert();
requestAnimationFrame(frame);        // start first: a throw below must not kill it
rebuild(); setShow({});
let seen = false; try { seen = !!localStorage.getItem(STORE + ".seen"); } catch (e) {}
if (!seen) setTimeout(() => showTour(0), 600); else updateCoach();
