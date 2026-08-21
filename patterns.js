/* ============================================================
   patterns.js — the rhythm library.

   A pattern describes ONE BAR.

     sig      [4,4]   notated time signature
     div      16      how many equal boxes the bar is cut into
     ticks    4       how many metronome clicks per bar (bpm counts these)
     accents  [2,2,3] optional grouping of ticks, for odd time
     voices   {R:[],L:[],F:[]}  onset positions, as indices into div
     tuplet   set only for polyrhythms — see notation.js
     mnemonic spoken syllables, one per composite hit

   Everything else in the app is derived from this. To add a rhythm,
   copy an entry and change the numbers. Onsets are box indices, so in
   4/4 with div 16, box 0 is beat 1 and box 4 is beat 2.
   ============================================================ */
window.PATTERNS = (function () {

  function isPow2(n) { return n > 0 && (n & (n - 1)) === 0; }

  function mk(o) {
    o.tickDiv = o.div / o.ticks;
    o.accents = o.accents || null;
    o.voices  = Object.assign({ R: [], L: [], F: [] }, o.voices);
    o.kit     = o.kit || null;      // default drum per limb
    o.marks   = o.marks || null;    // per-onset drum, keyed by box index
    o.tuplet  = o.tuplet || null;
    o.mnemonic = o.mnemonic || null;
    // A non-power-of-two tick means the beat is subdivided into triplets
    // (or quintuplets), which notation.js brackets per beat.
    o.beatTuplet = (!o.tuplet && !isPow2(o.tickDiv) && o.tickDiv > 1) ? o.tickDiv : null;
    o.swappable = o.group === "polyrhythm";
    return o;
  }

  function every(n, div) { const a = []; for (let i = 0; i < div; i += n) a.push(i); return a; }

  /* ---- polyrhythms ------------------------------------------------ */
  function poly(x, y, pulseIsX, mnemonic) {
    const div = x * y;
    const P = pulseIsX ? x : y, Q = pulseIsX ? y : x;
    const xs = every(y, div), ys = every(x, div);
    const pulseOnsets = pulseIsX ? xs : ys, otherOnsets = pulseIsX ? ys : xs;
    return mk({
      id: "poly-" + x + "-" + y + "-in" + P,
      name: x + " against " + y,
      short: x + ":" + y,
      group: "polyrhythm",
      ratio: [x, y], pulseIsX,
      sig: [P, 4], div, ticks: P,
      voices: { R: pulseOnsets, L: otherOnsets, F: pulseOnsets },
      tuplet: { voice: "L", count: Q, over: P },
      mnemonic: mnemonic
    });
  }

  const POLY_DEFS = [
    { x: 3, y: 2, tag: "start", m: ["not", "dif", "fi", "cult"] },
    { x: 4, y: 3, tag: "",      m: ["pass", "the", "god", "damn", "but", "ter"] },
    { x: 5, y: 4, tag: "",      m: null },
    { x: 5, y: 3, tag: "",      m: null },
    { x: 7, y: 4, tag: "hard",  m: null }
  ];

  const polyrhythms = [];
  POLY_DEFS.forEach(d => {
    polyrhythms.push(poly(d.x, d.y, true,  d.m));
    polyrhythms.push(poly(d.x, d.y, false, d.m));
  });

  /* ---- straight time ---------------------------------------------- */
  const straight = [
    mk({ id:"str-44-quarters", name:"Quarter notes", short:"4/4", group:"straight",
         sig:[4,4], div:4, ticks:4,
         voices:{ R:[0,1,2,3], F:[0] } }),

    mk({ id:"str-44-eighths", name:"Eighth notes", short:"4/4", group:"straight",
         sig:[4,4], div:8, ticks:4,
         voices:{ R:[0,1,2,3,4,5,6,7], F:[0,4] } }),

    mk({ id:"str-44-sixteenths", name:"Sixteenth notes", short:"4/4", group:"straight",
         sig:[4,4], div:16, ticks:4,
         voices:{ R:[0,2,4,6,8,10,12,14], L:[1,3,5,7,9,11,13,15], F:[0,8] } }),

    mk({ id:"str-44-rock", name:"Basic rock beat", short:"4/4", group:"straight",
         sig:[4,4], div:8, ticks:4,
         voices:{ R:[0,1,2,3,4,5,6,7], L:[2,6], F:[0,4] } }),

    mk({ id:"str-44-triplets", name:"Eighth-note triplets", short:"4/4", group:"straight",
         sig:[4,4], div:12, ticks:4,
         voices:{ R:[0,1,2,3,4,5,6,7,8,9,10,11], F:[0,6] } }),

    mk({ id:"str-44-shuffle", name:"Shuffle", short:"4/4", group:"straight",
         sig:[4,4], div:12, ticks:4,
         voices:{ R:[0,2,3,5,6,8,9,11], L:[3,9], F:[0,6] } }),

    mk({ id:"str-34-waltz", name:"Waltz", short:"3/4", group:"straight",
         sig:[3,4], div:6, ticks:3,
         voices:{ R:[0,1,2,3,4,5], L:[2,4], F:[0] } }),

    mk({ id:"str-68", name:"Six eight", short:"6/8", group:"straight",
         sig:[6,8], div:6, ticks:6, accents:[3,3],
         voices:{ R:[0,1,2,3,4,5], L:[3], F:[0] } })
  ];

  /* ---- odd time ---------------------------------------------------- */
  const odd = [
    mk({ id:"odd-54-32", name:"Five four, 3+2", short:"5/4", group:"odd",
         sig:[5,4], div:10, ticks:5, accents:[3,2],
         voices:{ R:[0,1,2,3,4,5,6,7,8,9], L:[6], F:[0,6] } }),

    mk({ id:"odd-54-23", name:"Five four, 2+3", short:"5/4", group:"odd",
         sig:[5,4], div:10, ticks:5, accents:[2,3],
         voices:{ R:[0,1,2,3,4,5,6,7,8,9], L:[4], F:[0,4] } }),

    mk({ id:"odd-78-223", name:"Seven eight, 2+2+3", short:"7/8", group:"odd",
         sig:[7,8], div:7, ticks:7, accents:[2,2,3],
         voices:{ R:[0,1,2,3,4,5,6], L:[2,4], F:[0,4] } }),

    mk({ id:"odd-58-32", name:"Five eight, 3+2", short:"5/8", group:"odd",
         sig:[5,8], div:5, ticks:5, accents:[3,2],
         voices:{ R:[0,1,2,3,4], L:[3], F:[0] } }),

    mk({ id:"odd-74", name:"Seven four", short:"7/4", group:"odd",
         sig:[7,4], div:14, ticks:7,
         voices:{ R:[0,1,2,3,4,5,6,7,8,9,10,11,12,13], L:[2,6,10], F:[0,8] } })
  ];

  /* ---- reading exercises ------------------------------------------- */
  /* Sparse rhythms with rests, for sight-reading rather than groove. */
  const reading = [
    mk({ id:"rd-1", name:"Quarters and rests", short:"4/4", group:"reading",
         sig:[4,4], div:8, ticks:4,
         voices:{ R:[0,4,6], F:[0] } }),

    mk({ id:"rd-2", name:"Eighths on the and", short:"4/4", group:"reading",
         sig:[4,4], div:8, ticks:4,
         voices:{ R:[0,3,4,7], F:[0] } }),

    mk({ id:"rd-3", name:"Off-beat push", short:"4/4", group:"reading",
         sig:[4,4], div:8, ticks:4,
         voices:{ R:[0,3,6], F:[0] } }),

    mk({ id:"rd-4", name:"Sixteenth mix", short:"4/4", group:"reading",
         sig:[4,4], div:16, ticks:4,
         voices:{ R:[0,4,6,7,8,12,14], F:[0,8] } }),

    mk({ id:"rd-5", name:"Syncopated", short:"4/4", group:"reading",
         sig:[4,4], div:16, ticks:4,
         voices:{ R:[0,3,6,10,14], F:[0,8] } }),

    mk({ id:"rd-6", name:"Triplet reading", short:"4/4", group:"reading",
         sig:[4,4], div:12, ticks:4,
         voices:{ R:[0,2,3,5,6,9,11], F:[0,6] } })
  ];

  /* ---- around the kit ---------------------------------------------- */
  /* These use the whole kit. `kit` sets each limb's home drum and `marks`
     moves a single hit somewhere else, which is how a real limb behaves:
     the right hand rides the hi-hat all bar and reaches for a crash on one. */
  const kit = [
    mk({ id:"kit-crash-one", name:"Crash on one", short:"4/4", group:"kit",
         sig:[4,4], div:8, ticks:4,
         kit:{ R:"hihat", L:"snare", F:"kick" },
         marks:{ R:{ 0:"crash1" } },
         voices:{ R:[0,1,2,3,4,5,6,7], L:[2,6], F:[0,4] } }),

    mk({ id:"kit-ride", name:"Ride groove", short:"4/4", group:"kit",
         sig:[4,4], div:8, ticks:4,
         kit:{ R:"ride", L:"snare", F:"kick" },
         voices:{ R:[0,1,2,3,4,5,6,7], L:[2,6], F:[0,4] } }),

    mk({ id:"kit-two-crashes", name:"Both crashes", short:"4/4", group:"kit",
         sig:[4,4], div:4, ticks:4,
         kit:{ R:"crash1", F:"kick" },
         marks:{ R:{ 2:"crash2" } },
         voices:{ R:[0,2], F:[0,1,2,3] } }),

    mk({ id:"kit-around-toms", name:"Around the toms", short:"4/4", group:"kit",
         sig:[4,4], div:4, ticks:4,
         kit:{ R:"snare", F:"kick" },
         marks:{ R:{ 1:"tom1", 2:"tom2", 3:"floor" } },
         voices:{ R:[0,1,2,3], F:[0] } }),

    mk({ id:"kit-tom-fill", name:"Tom fill", short:"4/4", group:"kit",
         sig:[4,4], div:8, ticks:4,
         kit:{ R:"snare", F:"kick" },
         marks:{ R:{ 2:"tom1", 3:"tom1", 4:"tom2", 5:"tom2", 6:"floor", 7:"floor" } },
         voices:{ R:[0,2,4,6], L:[1,3,5,7], F:[0] },
         marksL:true }),

    mk({ id:"kit-groove-fill", name:"Groove into a fill", short:"4/4", group:"kit",
         sig:[4,4], div:16, ticks:4,
         kit:{ R:"hihat", L:"snare", F:"kick" },
         marks:{ R:{ 0:"crash1", 8:"snare", 10:"tom1", 12:"tom2", 14:"floor" } },
         voices:{ R:[0,2,4,6,8,10,12,14], L:[4], F:[0,6] } }),

    mk({ id:"kit-full", name:"Full kit workout", short:"4/4", group:"kit",
         sig:[4,4], div:8, ticks:4,
         kit:{ R:"ride", L:"snare", F:"kick" },
         marks:{ R:{ 0:"crash1", 4:"crash2" }, L:{ 1:"tom1", 5:"floor" } },
         voices:{ R:[0,1,2,3,4,5,6,7], L:[1,2,5,6], F:[0,3,4,7] } })
  ];

  /* Fill for the tom-fill exercise: the left hand mirrors the right. */
  (function () {
    const p = kit.find(x => x.id === "kit-tom-fill");
    p.marks.L = { 1:"snare", 3:"tom1", 5:"tom2", 7:"floor" };
    delete p.marksL;
  })();

  const all = polyrhythms.concat(straight, odd, reading, kit);
  const byId = {};
  all.forEach(p => { byId[p.id] = p; });

  /* Composite hit list — every position where at least one hand plays. */
  function composite(p) {
    const set = {};
    (p.voices.R || []).forEach(i => { set[i] = (set[i] || 0) | 1; });
    (p.voices.L || []).forEach(i => { set[i] = (set[i] || 0) | 2; });
    return Object.keys(set).map(Number).sort((a, b) => a - b)
      .map(i => ({ pos: i, hands: set[i] }));
  }

  /* Where the metronome clicks, as box indices. */
  function tickPositions(p) {
    const out = [];
    for (let i = 0; i < p.ticks; i++) out.push(i * p.tickDiv);
    return out;
  }

  /* Start of each accent group, as box indices. */
  function accentPositions(p) {
    if (!p.accents) return [0];
    const out = []; let t = 0;
    p.accents.forEach(g => { out.push(t * p.tickDiv); t += g; });
    return out;
  }

  /* Which drum a limb hits at a given box. Falls back to whatever the
     student has assigned in Setup when the pattern does not say. */
  function pieceAt(P, limb, pos, fallback) {
    if (P.marks && P.marks[limb] && P.marks[limb][pos]) return P.marks[limb][pos];
    if (P.kit && P.kit[limb]) return P.kit[limb];
    return fallback;
  }
  /* Every drum this pattern touches, with the onsets and limb for each. */
  function pieceMap(P, fallback) {
    const out = {};
    ["R","L","F"].forEach(v => (P.voices[v] || []).forEach(pos => {
      const d = pieceAt(P, v, pos, fallback[v]);
      if (!out[d]) out[d] = { onsets: [], limb: v, limbs: [] };
      if (out[d].limbs.indexOf(v) === -1) out[d].limbs.push(v);
      out[d].onsets.push(pos);
    }));
    return out;
  }

  /* ---- beats the student records themselves ------------------------ */
  /* A recorded beat is an ordinary pattern with `custom:true`. Once it is
     registered here every view, the scoring and the tempo trainer treat it
     exactly like a built-in one — nothing downstream knows the difference. */
  const custom = [];
  function addCustom(o) {
    const p = mk(o);
    p.custom = true; p.group = "custom";
    const at = custom.findIndex(x => x.id === p.id);
    if (at >= 0) { custom[at] = p; all[all.indexOf(byId[p.id])] = p; }
    else { custom.push(p); all.push(p); }
    byId[p.id] = p;
    return p;
  }
  function removeCustom(id) {
    const p = byId[id]; if (!p || !p.custom) return false;
    custom.splice(custom.indexOf(p), 1);
    all.splice(all.indexOf(p), 1);
    delete byId[id];
    return true;
  }

  return {
    all, byId, polyrhythms, straight, odd, reading, kit, custom,
    POLY_DEFS, composite, tickPositions, accentPositions, pieceAt, pieceMap,
    addCustom, removeCustom,
    groups: [
      { key:"custom",     label:"My beats" },
      { key:"polyrhythm", label:"Polyrhythms" },
      { key:"straight",   label:"Straight time" },
      { key:"odd",        label:"Odd time" },
      { key:"kit",        label:"Around the kit" },
      { key:"reading",    label:"Reading" }
    ]
  };
})();
