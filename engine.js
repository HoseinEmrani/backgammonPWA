/* Backgammon rules engine (no DOM). Works in the browser (window.Engine) and Node (module.exports).
 *
 * Board: c[0..23], positive = White checkers, negative = Black checkers.
 * White (0) moves from index 23 down to 0 (home = 0..5), enters from the bar on index 24-die.
 * Black (1) moves from index 0 up to 23 (home = 18..23), enters from the bar on index die-1.
 */
(function (root) {
  'use strict';
  const W = 0, B = 1, BAR = -1, OFF = 99;

  function initial() {
    const c = new Array(24).fill(0);
    c[23] = 2; c[12] = 5; c[7] = 3; c[5] = 5;
    c[0] = -2; c[11] = -5; c[16] = -3; c[18] = -5;
    return { c, bar: [0, 0], off: [0, 0] };
  }

  const clone = (s) => ({ c: s.c.slice(), bar: s.bar.slice(), off: s.off.slice() });
  const own = (s, p, i) => (p === W ? s.c[i] : -s.c[i]);
  const open = (s, p, i) => own(s, 1 - p, i) < 2;

  function allHome(s, p) {
    if (s.bar[p] > 0) return false;
    if (p === W) { for (let i = 6; i < 24; i++) if (s.c[i] > 0) return false; }
    else { for (let i = 0; i < 18; i++) if (s.c[i] < 0) return false; }
    return true;
  }

  function singleMoves(s, p, d) {
    const out = [];
    if (s.bar[p] > 0) {
      const to = p === W ? 24 - d : d - 1;
      if (open(s, p, to)) out.push({ from: BAR, to, die: d });
      return out;
    }
    const dir = p === W ? -1 : 1;
    const home = allHome(s, p);
    for (let i = 0; i < 24; i++) {
      if (own(s, p, i) <= 0) continue;
      const t = i + dir * d;
      if (t >= 0 && t < 24) {
        if (open(s, p, t)) out.push({ from: i, to: t, die: d });
      } else if (home) {
        if (t === (p === W ? -1 : 24)) { out.push({ from: i, to: OFF, die: d }); continue; }
        let behind = false; // own checker further from home than i
        if (p === W) { for (let j = i + 1; j <= 5; j++) if (s.c[j] > 0) { behind = true; break; } }
        else { for (let j = 18; j < i; j++) if (s.c[j] < 0) { behind = true; break; } }
        if (!behind) out.push({ from: i, to: OFF, die: d });
      }
    }
    return out;
  }

  function apply(s, p, m) {
    const n = clone(s);
    const sg = p === W ? 1 : -1;
    if (m.from === BAR) n.bar[p]--; else n.c[m.from] -= sg;
    if (m.to === OFF) n.off[p]++;
    else {
      if (own(n, 1 - p, m.to) === 1) { n.c[m.to] = 0; n.bar[1 - p]++; }
      n.c[m.to] += sg;
    }
    return n;
  }

  function without(arr, k) { const r = arr.slice(); r.splice(k, 1); return r; }

  // Longest sequence of dice that can be played.
  function maxDepth(s, p, dice) {
    let best = 0;
    const seen = new Set();
    for (let k = 0; k < dice.length; k++) {
      const d = dice[k];
      if (seen.has(d)) continue;
      seen.add(d);
      const rest = without(dice, k);
      for (const m of singleMoves(s, p, d)) {
        const v = 1 + maxDepth(apply(s, p, m), p, rest);
        if (v > best) best = v;
        if (best === dice.length) return best;
      }
    }
    return best;
  }

  // All legal first moves, honouring "must use as many dice as possible"
  // and "if only one die can be played, play the larger".
  function legalMoves(s, p, dice) {
    if (!dice.length) return [];
    const max = maxDepth(s, p, dice);
    if (max === 0) return [];
    let out = [];
    const seen = new Set();
    for (let k = 0; k < dice.length; k++) {
      const d = dice[k];
      if (seen.has(d)) continue;
      seen.add(d);
      const rest = without(dice, k);
      for (const m of singleMoves(s, p, d)) {
        if (1 + maxDepth(apply(s, p, m), p, rest) === max) out.push(m);
      }
    }
    if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
      const hi = Math.max(dice[0], dice[1]);
      const hm = out.filter((m) => m.die === hi);
      if (hm.length) out = hm;
    }
    return out;
  }

  function pips(s, p) {
    let n = s.bar[p] * 25;
    for (let i = 0; i < 24; i++) {
      const k = own(s, p, i);
      if (k > 0) n += k * (p === W ? i + 1 : 24 - i);
    }
    return n;
  }

  // 1 = single, 2 = gammon, 3 = backgammon (only meaningful once winner has borne off all 15)
  function winKind(s, winner) {
    const l = 1 - winner;
    if (s.off[l] > 0) return 1;
    if (s.bar[l] > 0) return 3;
    const lo = winner === W ? 0 : 18, hi = winner === W ? 5 : 23;
    for (let i = lo; i <= hi; i++) if (own(s, l, i) > 0) return 3;
    return 2;
  }

  // True once the armies have passed each other: no hit is possible any more.
  function contactOver(s) {
    if (s.bar[W] || s.bar[B]) return false;
    let maxW = -1, minB = 24;
    for (let i = 0; i < 24; i++) {
      if (s.c[i] > 0) maxW = i;
      if (s.c[i] < 0 && i < minB) minB = i;
    }
    return maxW < minB;
  }

  // A player may resign when the game can no longer be won in practice: contact is over
  // (so luck is only about dice) and they trail in the race by more than RESIGN_LEAD pips
  // (and at least RESIGN_RATIO of the opponent's remaining pips).
  const RESIGN_LEAD = 20, RESIGN_RATIO = 0.3;
  function canResign(s, p) {
    if (!contactOver(s)) return false;
    const mine = pips(s, p), theirs = pips(s, 1 - p);
    return mine - theirs >= Math.max(RESIGN_LEAD, theirs * RESIGN_RATIO);
  }

  const api = { W, B, BAR, OFF, initial, clone, own, singleMoves, apply, legalMoves, pips, winKind, allHome, contactOver, canResign };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
