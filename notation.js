/* ============================================================
   notation.js — draws a bar of drum notation from a pattern.

   Two paths:
     · patterns carrying `tuplet` (the polyrhythms) get a whole-bar
       tuplet bracket, which is how a 3-over-4 is actually written
     · everything else goes through the general engraver: note values
       from onset spacing, dots, ties, rests, beaming by beat group,
       and per-beat tuplet brackets for triplet grids

   Hands share upward stems on the same staff, the foot takes downward
   stems, which is standard drum-set notation. Horizontal spacing is
   proportional to the subdivision grid so the staff lines up with the
   boxes drawn above it.
   ============================================================ */
window.NOTATION = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const L = 150, R = 960, TOP = 78, SP = 11;
  const STEM_UP = 34, TUP_Y = 20, PAD = 18, SPAN = R - L - PAD * 2;
  const Y = { hi: TOP - 12, sn: TOP + 1.5 * SP, kk: TOP + 3.5 * SP };

  /* Where each surface sits on the staff, in multiples of a space from the
     top line, and whether it takes an x notehead. Close to the common drum
     key: cymbals above, toms descending, snare in the middle, kick at the
     bottom. */
  const STAFF = {
    crash1:{ y:-1.0, x:1, ledger:1 }, crash2:{ y:-1.5, x:1, ledger:1 },
    hihat:{ y:-0.5, x:1 }, ride:{ y:0, x:1 },
    tom1:{ y:0.5 },        tom2:{ y:1.0 },
    snare:{ y:1.5 },       rim:{ y:1.5, x:1 },   floor:{ y:2.5 },
    kick:{ y:3.5 },        click:{ y:1.5 },
    hihatfoot:{ y:4.5, x:1, ledger:1 }        // pedal hi-hat sits below the staff
  };
  function placeOf(piece, limb){
    if (limb === "F" && piece === "hihat") return STAFF.hihatfoot;
    return STAFF[piece] || STAFF.snare;
  }
  function yOf(piece, limb){ return TOP + placeOf(piece, limb).y * SP; }
  /* Anything off the staff needs a line to be read against. */
  function ledger(svg, x, piece, limb){
    if (!placeOf(piece, limb).ledger) return;
    const y = yOf(piece, limb);
    svg.appendChild(el("line", { x1:x-13, y1:y, x2:x+13, y2:y,
      stroke:"#3a424d", "stroke-width":1 }));
  }

  /* Horizontal position of a subdivision box. Both renderers use this so the
     staff, the grid above it, and the scrolling playhead all agree. */
  function notePos(P, pos) { return L + PAD + SPAN * (pos / P.div); }

  function el(t, a) { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; }
  function txt(x, y, s, a) {
    const e = el("text", Object.assign({ x, y, fill: "#98a1ac", "font-size": 13,
      "font-family": "inherit", "text-anchor": "middle" }, a || {}));
    e.textContent = s; return e;
  }
  function pow2Below(n) { let v = 1; while (v * 2 <= n) v *= 2; return v; }
  function isPow2(n) { return n > 0 && (n & (n - 1)) === 0; }

  /* subdivision boxes per whole note */
  function spw(P) { return P.div * P.sig[1] / P.sig[0]; }

  /* Break the bar into beam groups, measured in boxes. Eighth-denominator
     meters beam by their accent grouping (7/8 as 2+2+3); quarter-denominator
     meters beam by the beat, which is what a reader expects in 5/4. */
  function groupsOf(P) {
    const out = [];
    if (P.accents && P.sig[1] === 8) {
      let t = 0;
      P.accents.forEach(g => { out.push({ a: t * P.tickDiv, b: (t + g) * P.tickDiv }); t += g; });
    } else {
      for (let i = 0; i < P.ticks; i++) out.push({ a: i * P.tickDiv, b: (i + 1) * P.tickDiv });
    }
    return out;
  }

  /* Decompose a written length (in box units) into note glyphs, tied. */
  function decompose(len, u) {
    const out = [];
    let rem = len, guard = 0;
    const vals = [];
    for (let k = 0; k <= 6; k++) vals.push(u / Math.pow(2, k));
    while (rem > 0.001 && guard++ < 6) {
      let placed = false;
      for (const v of vals) {
        if (v * 1.5 <= rem + 0.001) { out.push({ v, dot: 1 }); rem -= v * 1.5; placed = true; break; }
        if (v <= rem + 0.001)       { out.push({ v, dot: 0 }); rem -= v;       placed = true; break; }
      }
      if (!placed) break;
    }
    return out;
  }
  function beamsFor(v, u) {
    const n = Math.round(Math.log2(u / v)) - 2;
    return Math.max(0, Math.min(4, n));
  }

  /* Turn a voice's onsets into positioned events with durations in boxes.
     Drums do not sustain, so a note runs to the next hit but never past the
     end of its own beat — that is what makes rests appear where a reader
     expects them instead of one long tied note. */
  function events(P, onsets, durs) {
    const ev = [];
    onsets = (onsets || []).slice().sort((a, b) => a - b);
    onsets.forEach((pos, i) => {
      const next = (i + 1 < onsets.length ? onsets[i + 1] : P.div);
      const beatEnd = (Math.floor(pos / P.tickDiv) + 1) * P.tickDiv;
      const nat = Math.min(next, Math.max(beatEnd, pos + 1)) - pos;
      ev.push({ pos, dur: durs && durs[i] ? Math.min(durs[i], nat) : nat });
    });
    return ev;
  }

  /* Split a span at group boundaries when it cannot be written as one value. */
  function segment(P, pos, len, groups) {
    const segs = [];
    let p = pos, rem = len, guard = 0;
    while (rem > 0.001 && guard++ < 64) {
      const g = groups.find(gr => p >= gr.a && p < gr.b) || groups[groups.length - 1];
      if (g.b - p <= 0.001) { segs.push({ pos:p, len:rem, group:g, whole:false }); break; }
      const startsOnGroup = Math.abs(p - g.a) < 0.001;
      const toGroupEnd = g.b - p;
      let take;
      if (startsOnGroup && rem >= toGroupEnd) {
        // may span whole groups
        take = toGroupEnd;
        let gi = groups.indexOf(g) + 1;
        while (gi < groups.length && take + (groups[gi].b - groups[gi].a) <= rem + 0.001
               && isPow2(Math.round((take + (groups[gi].b - groups[gi].a)) / (g.b - g.a)))) {
          take += groups[gi].b - groups[gi].a; gi++;
        }
      } else {
        take = Math.min(rem, toGroupEnd);
      }
      segs.push({ pos: p, len: take, group: g,
                  whole: Math.abs(take - (g.b - g.a)) < 0.001 && startsOnGroup });
      p += take; rem -= take;
    }
    return segs;
  }

  /* Written length of `boxes` boxes, in whole-note-scale units.
     In a triplet beat three boxes are written as two eighths' worth of
     space, so one box reads as an eighth under a 3 bracket. A note that
     fills the whole beat is written plainly, with no bracket. */
  function written(P, boxes, seg) {
    const beat = spw(P) / P.sig[1];
    if (!P.beatTuplet || seg.whole) return boxes * beat / P.tickDiv;
    return boxes * beat / pow2Below(P.beatTuplet);
  }

  /* ---- glyph drawing ---------------------------------------------- */
  function notehead(svg, x, y, kind, col, hollow) {
    if (kind === "x") {
      svg.appendChild(el("line", { x1:x-6, y1:y-6, x2:x+6, y2:y+6, stroke:col, "stroke-width":2.6, "stroke-linecap":"round" }));
      svg.appendChild(el("line", { x1:x-6, y1:y+6, x2:x+6, y2:y-6, stroke:col, "stroke-width":2.6, "stroke-linecap":"round" }));
    } else {
      svg.appendChild(el("ellipse", { cx:x, cy:y, rx:7, ry:5.2,
        transform:"rotate(-20 " + x + " " + y + ")",
        fill: hollow ? "none" : col, stroke: col, "stroke-width": hollow ? 2.4 : 0 }));
    }
  }
  function dot(svg, x, y, col) { svg.appendChild(el("circle", { cx:x+13, cy:y-4, r:2.4, fill:col })); }
  function flag(svg, x, yTop, n, col, up) {
    for (let i = 0; i < n; i++) {
      const y = up ? yTop + i * 7 : yTop - i * 7;
      svg.appendChild(el("path", {
        d: "M" + x + " " + y + " q9 " + (up ? 5 : -5) + " 7 " + (up ? 15 : -15),
        fill:"none", stroke:col, "stroke-width":3, "stroke-linecap":"round" }));
    }
  }
  function tie(svg, x1, x2, y, col) {
    svg.appendChild(el("path", { d:"M" + (x1+8) + " " + (y+7) + " Q" + ((x1+x2)/2) + " " + (y+19) + " " + (x2-8) + " " + (y+7),
      fill:"none", stroke:col, "stroke-width":1.6, opacity:.85 }));
  }
  /* Rests for the stems-up voice sit in the upper half of the staff, rests
     for the stems-down voice in the lower half, so the two voices stay
     legible when both are resting at once. */
  function rest(svg, x, v, u, col, up, dotted) {
    const b = beamsFor(v, u), y = TOP + 2 * SP + (up ? -SP * 0.9 : SP * 1.1);
    if (dotted) svg.appendChild(el("circle", { cx:x+12, cy:y-3, r:2.2, fill:col }));
    if (v >= u)          { svg.appendChild(el("rect", { x:x-7, y:y-6, width:14, height:5, fill:col })); return; }
    if (v >= u/2)        { svg.appendChild(el("rect", { x:x-7, y:y-1, width:14, height:5, fill:col })); return; }
    if (b === 0) {
      svg.appendChild(el("path", { d:"M"+(x-4)+" "+(y-13)+" L"+(x+4)+" "+(y-4)+" L"+(x-3)+" "+(y+1)+
        " L"+(x+5)+" "+(y+12)+" Q"+(x-3)+" "+(y+5)+" "+(x+1)+" "+(y+3),
        fill:"none", stroke:col, "stroke-width":2.4, "stroke-linejoin":"round" }));
      return;
    }
    const top = y - 8 - (b - 1) * 3;
    svg.appendChild(el("line", { x1:x+4, y1:top, x2:x-3, y2:top+9+(b-1)*7, stroke:col, "stroke-width":2 }));
    for (let i = 0; i < b; i++) {
      svg.appendChild(el("circle", { cx:x-2, cy:top+i*7, r:2.6, fill:col }));
      svg.appendChild(el("path", { d:"M"+(x-2)+" "+(top+i*7)+" q5 1 7 5", fill:"none", stroke:col, "stroke-width":1.8 }));
    }
  }

  /* ---- general engraver ------------------------------------------- */
  function renderGeneral(svg, P, o) {
    const u = spw(P), groups = groupsOf(P);
    const X = pos => notePos(P, pos);

    // upper voice: hands merged, so a hi-hat and snare on the same box share a stem
    const hands = {};
    (P.voices[o.upper] || []).forEach(p => { hands[p] = (hands[p] || 0) | 1; });
    (P.voices[o.lower] || []).forEach(p => { hands[p] = (hands[p] || 0) | 2; });
    const handPos = Object.keys(hands).map(Number).sort((a, b) => a - b);

    drawVoice(handPos, P.durs && P.durs.hands, true, hands);
    drawVoice((P.voices.F || []).slice().sort((a, b) => a - b), P.durs && P.durs.F, false, null);

    function drawVoice(onsets, durs, up, handMap) {
      const ev = events(P, onsets, durs);
      const beamable = [];          // {x, beams, group, tuplet}
      let cursor = 0;

      ev.forEach(e => {
        if (e.pos > cursor + 0.001) drawRests(cursor, e.pos - cursor, up);
        const segs = segment(P, e.pos, e.dur, groups);
        let firstX = null, lastX = null, lastY = null, lastCol = null;
        segs.forEach((seg, si) => {
          const wl = written(P, seg.len, seg);
          const parts = decompose(wl, u);
          let inner = 0;
          parts.forEach(pt => {
            const x = X(seg.pos + inner * seg.len / Math.max(wl, 0.0001));
            const bm = beamsFor(pt.v, u);
            const hollowV = pt.v >= u / 2;
            if (up) {
              const cols = []; let lowY = TOP - 3 * SP;
              [[1, o.upper], [2, o.lower]].forEach(([bit, limb]) => {
                if (!(handMap[e.pos] & bit)) return;
                const pc = o.piece(limb, e.pos), pl = placeOf(pc, limb), py = yOf(pc, limb);
                ledger(svg, x, pc, limb);
                notehead(svg, x, py, pl.x ? "x" : "o", o.col[limb], hollowV);
                if (pt.dot) dot(svg, x, py, o.col[limb]);
                cols.push(o.col[limb]);
                if (py > lowY) lowY = py;
              });
              const stemCol = cols[0] || o.col[o.upper];
              if (pt.v < u) svg.appendChild(el("line", { x1:x+6.5, y1:lowY-1, x2:x+6.5, y2:STEM_UP, stroke:stemCol, "stroke-width":2 }));
              beamable.push({ x, bm, g: seg.group, col: stemCol, tup: P.beatTuplet && !seg.whole });
              lastX = x; lastY = lowY; lastCol = stemCol;
            } else {
              const pc = o.piece("F", e.pos), py = yOf(pc, "F");
              ledger(svg, x, pc, "F");
              notehead(svg, x, py, placeOf(pc, "F").x ? "x" : "o", o.col.F, hollowV);
              if (pt.v < u) svg.appendChild(el("line", { x1:x-6.5, y1:py+1, x2:x-6.5, y2:py+42, stroke:o.col.F, "stroke-width":2 }));
              if (pt.dot) dot(svg, x, py, o.col.F);
              if (bm > 0) flag(svg, x-6.5, py+42, bm, o.col.F, false);
              lastX = x; lastY = py; lastCol = o.col.F;
            }
            if (firstX !== null) tie(svg, firstX, x, lastY, lastCol);
            firstX = parts.length > 1 || segs.length > 1 ? x : null;
            inner += (pt.dot ? pt.v * 1.5 : pt.v);
          });
        });
        cursor = e.pos + e.dur;
      });
      if (cursor < P.div - 0.001) drawRests(cursor, P.div - cursor, up);
      if (up) drawBeams(beamable);
    }

    function drawRests(pos, len, up) {
      segment(P, pos, len, groups).forEach(seg => {
        const wl = written(P, seg.len, seg);
        let inner = 0;
        decompose(wl, u).forEach(pt => {
          rest(svg, X(seg.pos + inner * seg.len / Math.max(wl, 0.0001)), pt.v, u,
               up ? "#8a929b" : "#767e87", up, pt.dot);
          inner += (pt.dot ? pt.v * 1.5 : pt.v);
        });
      });
    }

    function drawBeams(list) {
      const byGroup = new Map();
      list.forEach(n => { const k = n.g.a; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(n); });
      byGroup.forEach(all => {
        // The tuplet bracket belongs to the whole beat, so it is decided
        // from every note in the group and drawn before any beaming choice.
        if (all.some(n => n.tup)) {
          const bx1 = all[0].x, bx2 = all[all.length - 1].x, bmid = (bx1 + bx2) / 2;
          const span = Math.max(26, bx2 - bx1);
          const x1b = bmid - span / 2, x2b = bmid + span / 2;
          svg.appendChild(el("path", { d:"M"+x1b+" "+(TUP_Y+7)+" L"+x1b+" "+TUP_Y+" L"+(bmid-13)+" "+TUP_Y,
            fill:"none", stroke:"#98a1ac", "stroke-width":1.4 }));
          svg.appendChild(el("path", { d:"M"+x2b+" "+(TUP_Y+7)+" L"+x2b+" "+TUP_Y+" L"+(bmid+13)+" "+TUP_Y,
            fill:"none", stroke:"#98a1ac", "stroke-width":1.4 }));
          svg.appendChild(txt(bmid, TUP_Y+5, String(P.beatTuplet),
            { fill:"#eef0f3", "font-size":14, "font-weight":600 }));
        }
        const notes = all.filter(n => n.bm > 0);
        if (notes.length < 2) {
          notes.forEach(n => flag(svg, n.x + 6.5, STEM_UP, n.bm, n.col, true));
          return;
        }
        const x1 = notes[0].x + 6.5, x2 = notes[notes.length - 1].x + 6.5;
        svg.appendChild(el("line", { x1, y1:STEM_UP, x2, y2:STEM_UP, stroke:notes[0].col, "stroke-width":5 }));
        for (let lvl = 2; lvl <= 4; lvl++) {
          let run = [];
          const flush = () => {
            if (run.length >= 2)
              svg.appendChild(el("line", { x1:run[0].x+6.5, y1:STEM_UP+(lvl-1)*6,
                x2:run[run.length-1].x+6.5, y2:STEM_UP+(lvl-1)*6, stroke:run[0].col, "stroke-width":4 }));
            else if (run.length === 1)
              svg.appendChild(el("line", { x1:run[0].x+6.5, y1:STEM_UP+(lvl-1)*6,
                x2:run[0].x+18, y2:STEM_UP+(lvl-1)*6, stroke:run[0].col, "stroke-width":4 }));
            run = [];
          };
          notes.forEach(n => { if (n.bm >= lvl) run.push(n); else flush(); });
          flush();
        }
      });
    }
  }

  /* ---- polyrhythm path -------------------------------------------- */
  function renderPoly(svg, P, o) {
    const info = tupletInfo(P.sig[0], P.tuplet.count);
    const otherKey = P.tuplet.voice;          // "L" in pattern space

    function draw(voiceKey, place) {
      const onsets = P.voices[voiceKey] || [];
      const home = o.piece(voiceKey, onsets[0] === undefined ? 0 : onsets[0]);
      const n = onsets.length, y = yOf(home, voiceKey), col = o.col[voiceKey], kind = placeOf(home, voiceKey).x ? "x" : "o";
      const isOther = voiceKey === otherKey;
      const tup = isOther && info.bracket, dotted = isOther && info.dotted, hollow = isOther && info.hollow;
      const down = place === "kk";
      const at = i => notePos(P, onsets[i]);
      for (let i = 0; i < n; i++) {
        const x = at(i);
        notehead(svg, x, y, kind, col, !!hollow);
        svg.appendChild(down
          ? el("line", { x1:x-6.5, y1:y+1, x2:x-6.5, y2:y+42, stroke:col, "stroke-width":2 })
          : el("line", { x1:x+6.5, y1:y-1, x2:x+6.5, y2:STEM_UP, stroke:col, "stroke-width":2 }));
        if (dotted) dot(svg, x, y, col);
      }
      if (dotted === "eighth") {
        svg.appendChild(el("line", { x1:at(0)+6.5, y1:STEM_UP, x2:at(n-1)+6.5, y2:STEM_UP, stroke:col, "stroke-width":5 }));
      }
      if (tup) {
        const x1 = at(0), x2 = at(n-1), mid = (x1+x2)/2;
        svg.appendChild(el("path", { d:"M"+x1+" "+(TUP_Y+7)+" L"+x1+" "+TUP_Y+" L"+(mid-16)+" "+TUP_Y, fill:"none", stroke:"#98a1ac", "stroke-width":1.5 }));
        svg.appendChild(el("path", { d:"M"+x2+" "+(TUP_Y+7)+" L"+x2+" "+TUP_Y+" L"+(mid+16)+" "+TUP_Y, fill:"none", stroke:"#98a1ac", "stroke-width":1.5 }));
        svg.appendChild(txt(mid, TUP_Y+5, info.bracket, { fill:"#eef0f3", "font-size":15, "font-weight":600 }));
      }
    }
    draw(o.upper, "hi"); draw(o.lower, "sn"); draw("F", "kk");
    return info;
  }

  function tupletInfo(P, Q) {
    if (P === 3 && Q === 2) return { bracket:null, dotted:"quarter", label:"dotted quarter notes" };
    if (P === 3 && Q === 4) return { bracket:null, dotted:"eighth",  label:"dotted eighth notes" };
    if (P === 4 && Q === 3) return { bracket:"3", hollow:true, label:"a half-note triplet" };
    if (P === 2 && Q === 3) return { bracket:"3", label:"a quarter-note triplet" };
    return { bracket: Q + ":" + P, label: Q + " in the space of " + P };
  }

  /* ---- entry ------------------------------------------------------- */
  function render(svg, P, o) {
    svg.textContent = "";
    for (let i = 0; i < 5; i++)
      svg.appendChild(el("line", { x1:L, y1:TOP+i*SP, x2:R, y2:TOP+i*SP, stroke:"#3a424d", "stroke-width":1 }));
    [L, R].forEach(x => svg.appendChild(el("line", { x1:x, y1:TOP, x2:x, y2:TOP+4*SP, stroke:"#98a1ac", "stroke-width":2 })));

    const ts = el("text", { x:L-34, y:TOP+16, fill:"#eef0f3", "font-size":29,
      "font-weight":600, "text-anchor":"middle", "font-family":"inherit" });
    ts.innerHTML = '<tspan x="'+(L-34)+'">'+P.sig[0]+'</tspan><tspan x="'+(L-34)+'" dy="26">'+P.sig[1]+'</tspan>';
    svg.appendChild(ts);

    [o.upper, o.lower, "F"].forEach(v => {
      if (!(P.voices[v] || []).length) return;
      svg.appendChild(txt(L-66, yOf(o.piece(v, P.voices[v][0]), v) + 4, o.name[v],
        { fill:"#454d57", "font-size":11, "text-anchor":"end" }));
    });

    // faint tick marks so the staff reads against the grid above it
    const gs = groupsOf(P);
    gs.forEach(g => { if (g.a === 0) return;
      const x = L + (R-L) * (g.a / P.div);
      svg.appendChild(el("line", { x1:x, y1:TOP-2, x2:x, y2:TOP+4*SP+2, stroke:"#242930", "stroke-width":1 })); });

    const info = P.tuplet ? renderPoly(svg, P, o) : (renderGeneral(svg, P, o), null);

    // Playhead, drawn last so it rides over the notes. app.js moves it.
    const ph = el("line", { x1:L+PAD, y1:TOP-46, x2:L+PAD, y2:TOP+4*SP+54,
      stroke:"#eef0f3", "stroke-width":2, opacity:.45 });
    svg.appendChild(ph);
    svg._ph = { el:ph, x0:L+PAD, x1:L+PAD+SPAN };
    return info;
  }

  return { render, tupletInfo, spw, groupsOf, notePos };
})();
