(() => {
'use strict';
const E = window.Engine;
const { W, B, BAR, OFF } = E;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rnd6 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 6) + 1; };

/* ------------------------------------------------------------------ geometry (board units, board = 160 x 100) */
const PW = 10.4, LEFT0 = 3, BARX = LEFT0 + 6 * PW, BARW = 10, RIGHT0 = BARX + BARW, RIGHT_END = RIGHT0 + 6 * PW;
const TRAY_X = 140, TRAY_W = 17, TH = 40, DIA = 9.4, OT = 2.8;
const colX = (c) => (c < 6 ? LEFT0 + c * PW : RIGHT0 + (c - 6) * PW);
const ptTop = (i) => i >= 12;
const ptCol = (i) => (i >= 12 ? i - 12 : 11 - i);

/* ------------------------------------------------------------------ settings & state */
const KEY_G = 'bgx.game.v1', KEY_S = 'bgx.settings.v1';
let S = { names: ['Player 1', 'Player 2'], matchTo: 3, limit: 0, sound: true, cube: true, autoDone: false, layout: 'auto' };
let G = null;
let U = 6;
let busy = false, paused = false, modalOpen = false, sel = null, endT = null;
const pieces = [];
const dice = [];

try { Object.assign(S, JSON.parse(localStorage.getItem(KEY_S) || '{}')); } catch (e) { /* ignore */ }
const saveS = () => { try { localStorage.setItem(KEY_S, JSON.stringify(S)); } catch (e) { /* ignore */ } };
const saveG = () => { try { localStorage.setItem(KEY_G, JSON.stringify(G)); } catch (e) { /* ignore */ } };

function makeStacks(s) {
  const st = { pts: Array.from({ length: 24 }, () => []), bar: [[], []], off: [[], []] };
  let w = 0, b = 15;
  for (let i = 0; i < 24; i++) {
    for (let k = 0; k < Math.abs(s.c[i]); k++) st.pts[i].push(s.c[i] > 0 ? w++ : b++);
  }
  return st;
}

function newGame(keepScores) {
  const s = E.initial();
  G = {
    s, st: makeStacks(s), turn: 0, phase: 'open', rem: [], dv: [0, 0], dUsed: [false, false], dCnt: 0, dCol: ['w', 'b'], diceOn: false,
    undo: [], cube: { v: 1, o: null }, scores: keepScores && G ? G.scores : [0, 0], clock: [0, 0], turnLeft: S.limit * 1000, result: null,
  };
}

function loadGame() {
  try {
    const g = JSON.parse(localStorage.getItem(KEY_G));
    if (g && g.s && g.st && g.st.pts && g.st.pts.length === 24) { G = g; return true; }
  } catch (e) { /* ignore */ }
  return false;
}

/* ------------------------------------------------------------------ audio (synthesised, no assets) */
const audio = (() => {
  let ctx = null, master = null, noise = null;
  function unlock() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  const ok = () => S.sound && ctx && ctx.state === 'running';
  function thock(freq, vol, dur, bright, when = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bright; f.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 0.3, 0.08);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(vol * 0.9, t); g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g2); g2.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function tone(freq, when, dur, vol = 0.18, type = 'triangle') {
    if (!ok()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    unlock,
    move: () => thock(190, 0.7, 0.13, 1700),
    hit: () => { thock(120, 0.9, 0.22, 900); thock(260, 0.6, 0.1, 2400, 0.06); },
    off: () => thock(330, 0.6, 0.09, 3000),
    rattle: () => { for (let i = 0; i < 16; i++) thock(380 + Math.random() * 600, 0.22, 0.04, 2200 + Math.random() * 2500, Math.random() * 0.75); },
    clack: () => { thock(260, 0.7, 0.07, 2800); },
    tick: () => tone(1400, 0, 0.05, 0.12, 'square'),
    click: () => thock(500, 0.3, 0.04, 3500),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.5, 0.2)),
    cube: () => { tone(440, 0, 0.12, 0.2); tone(660, 0.1, 0.2, 0.2); },
  };
})();

/* ------------------------------------------------------------------ build static board bits */
const board = $('#board');
function buildBoard() {
  const pts = $('#points'), labels = $('#labels');
  for (let i = 0; i < 24; i++) {
    const top = ptTop(i), col = ptCol(i);
    const p = el('div', `pt ${top ? 'top' : 'bot'} ${(col + (top ? 0 : 1)) % 2 ? 'b' : 'a'}`);
    p.style.left = `calc(var(--u) * ${colX(col)})`; p.style.top = `calc(var(--u) * ${top ? 3 : 57})`;
    pts.append(p);
    const l = el('div', 'lbl'); l.dataset.i = i;
    l.style.left = `calc(var(--u) * ${colX(col)})`;
    l.style.top = `calc(var(--u) * ${top ? 0.55 : 97.4})`;
    labels.append(l);
  }
  const pc = $('#pieces');
  for (let id = 0; id < 30; id++) {
    const c = el('div', `checker ${id < 15 ? 'w' : 'b'}`); pieces.push(c); pc.append(c);
  }
  // dice
  const dl = $('#dice');
  for (let i = 0; i < 2; i++) {
    const d = el('div', 'die'); d.style.display = 'none';
    d.innerHTML = '<i class="dshadow"></i>';
    const cube = el('div', 'cube');
    const pipMap = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    for (let n = 1; n <= 6; n++) {
      const f = el('div', `face f${n}`);
      for (let k = 1; k <= 9; k++) f.append(el('i', 'pip' + (pipMap[n].includes(k) ? '' : ' o')));
      cube.append(f);
    }
    d.append(cube); dl.append(d);
    dice.push({ el: d, cube, rz: 0 });
  }
  const badge = el('div'); badge.id = 'dbl'; dl.append(badge);
}
function renderLabels() {
  const p = G.turn;
  document.querySelectorAll('.lbl').forEach((l) => { const i = +l.dataset.i; l.textContent = p === W ? i + 1 : 24 - i; });
}

/* ------------------------------------------------------------------ layout */
function place(id, x, y, w, h, z, off) {
  const e = pieces[id];
  e.style.width = w * U + 'px'; e.style.height = h * U + 'px';
  e.style.transform = `translate(${x * U}px,${y * U}px)`;
  e.style.zIndex = z; e.classList.toggle('off', !!off);
}
const stackStep = (n, room) => (n <= 4 ? DIA : (room - DIA) / (n - 1));
function layout() {
  G.st.pts.forEach((list, i) => {
    const n = list.length; if (!n) return;
    const top = ptTop(i), cx = colX(ptCol(i)) + PW / 2, step = stackStep(n, TH);
    list.forEach((id, k) => place(id, cx - DIA / 2, top ? 3 + k * step : 97 - DIA - k * step, DIA, DIA, 10 + k));
  });
  [W, B].forEach((p) => {
    const list = G.st.bar[p], n = list.length, step = stackStep(n, 41);
    list.forEach((id, k) => place(id, BARX + BARW / 2 - DIA / 2, p === W ? 52 + k * step : 48 - DIA - k * step, DIA, DIA, 10 + k));
    G.st.off[p].forEach((id, k) => place(id, TRAY_X + 1.5, p === W ? 95.8 - (k + 1) * OT : 4.2 + k * OT, TRAY_W - 3, OT - 0.25, 10 + k, true));
  });
}

function fit() {
  const st = $('#stage'), r = st.getBoundingClientRect(), pad = 10;
  const bw = Math.min(r.width - pad * 2, (r.height - pad * 2) * 1.6);
  U = Math.max(2, bw / 160);
  $('#app').style.setProperty('--u', U + 'px');
  layout(); positionDice(); showMarks();
}

/* ------------------------------------------------------------------ dice */
const FACE = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const TILT = [0, 0]; // dice settle flat, number facing up
const tf = (fx, fy) => `rotateX(${TILT[0]}deg) rotateY(${TILT[1]}deg) rotateX(${fx}deg) rotateY(${fy}deg)`;
const DICE_CX = RIGHT0 + 31.2;
function dicePos(i) { return { x: DICE_CX + (i ? 2 : -10) + dice[i].jx, y: 46 + dice[i].jy }; }
function positionDice() {
  dice.forEach((d, i) => {
    if (d.jx === undefined) { d.jx = 0; d.jy = 0; d.rj = 0; }
    d.rz = faceRz(i) + d.rj;
    const p = dicePos(i);
    d.el.style.left = p.x * U + 'px'; d.el.style.top = p.y * U + 'px';
    d.el.style.transform = `translate(0,0) scale(1) rotate(${d.rz}deg)`;
  });
  const b = $('#dbl'); b.style.left = (DICE_CX - 5) * U + 'px'; b.style.top = 62 * U + 'px';
}
function setDiceFaces() {
  dice.forEach((d, i) => {
    const v = G.dv[i]; if (!v) return;
    d.cube.style.transform = tf(...FACE[v]);
    d.el.className = `die ${G.dCol[i]}`;
  });
}
function refreshDiceUsed() {
  const doubles = G.dv[0] && G.dv[0] === G.dv[1];
  dice.forEach((d, i) => {
    d.el.style.display = G.diceOn ? 'block' : 'none';
    const used = doubles ? G.rem.length === 0 : G.dUsed[i];
    d.el.classList.toggle('used', !!used);
  });
  const b = $('#dbl');
  b.textContent = `× ${G.rem.length}`;
  b.style.opacity = G.diceOn && doubles && G.rem.length > 0 && G.phase === 'move' ? 1 : 0;
}
function animateDice() {
  dice.forEach((d, i) => {
    d.jx = (Math.random() - 0.5) * 4; d.jy = (Math.random() - 0.5) * 7; d.rj = Math.round((Math.random() - 0.5) * 22);
  });
  positionDice(); setDiceFaces();
  dice.forEach((d, i) => {
    const v = G.dv[i], [fx, fy] = FACE[v];
    const spin = () => (1 + Math.floor(Math.random() * 3)) * 360 * (Math.random() < 0.5 ? -1 : 1);
    d.cube.animate([{ transform: tf(fx + spin(), fy + spin()) }, { transform: tf(fx, fy) }], { duration: 950 + i * 140, easing: 'cubic-bezier(.15,.7,.25,1)' });
    const rz = d.rz, T = (x, y, s, r) => `translate(${x * U}px,${y * U}px) scale(${s}) rotate(${rz + r}deg)`;
    d.el.animate([
      { transform: T(34, -18 + i * 10, 1.6, 140), opacity: 0, offset: 0 },
      { transform: T(0, 0, 1, 12), opacity: 1, offset: 0.5 },
      { transform: T(-1.5, -4, 1.14, 0), offset: 0.66 },
      { transform: T(0, 0, 1, 0), offset: 0.82 },
      { transform: T(0.4, -0.8, 1.03, 0), offset: 0.92 },
      { transform: T(0, 0, 1, 0), offset: 1 },
    ], { duration: 1050 + i * 100, easing: 'ease-out' });
  });
}

/* ------------------------------------------------------------------ toast / modal */
let toastT = null;
function toast(msg, ms = 1700) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('flip', tableOn() && G.turn === B); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function modal(build, face) {
  const sheet = $('#sheet'); sheet.innerHTML = ''; sheet.classList.toggle('flip', tableOn() && face === B); build(sheet);
  $('#overlay').classList.add('on'); modalOpen = true; renderHud();
}
function closeModal() { $('#overlay').classList.remove('on'); modalOpen = false; renderHud(); }
function btn(label, cls, fn) { const b = el('button', 'btn ' + (cls || ''), `<span>${label}</span>`); b.addEventListener('click', () => { audio.click(); fn(); }); return b; }
function seg(opts, cur, fn) {
  const w = el('div', 'seg');
  opts.forEach(([val, label]) => {
    const b = el('button', val === cur ? 'on' : '', label);
    b.addEventListener('click', () => { audio.click(); [...w.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); fn(val); });
    w.append(b);
  });
  return w;
}

/* ------------------------------------------------------------------ rendering of HUD / buttons */
const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtUp = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const cubeEnabled = () => S.cube && S.matchTo !== 1;
const nm = (p) => S.names[p] || (p === W ? 'White' : 'Black');
let lastCubeKey = '';

const tableOn = () => $('#app').classList.contains('table');
const faceRz = (i) => (tableOn() && G && G.dCol[i] === 'b' ? 180 : 0);
const GATED = ['undo', 'done', 'double', 'resign'];

function updateButtons() {
  const noMoves = G.phase === 'move' && G.rem.length > 0 && G.legal && G.legal.length === 0;
  const done = G.phase === 'move' && (G.rem.length === 0 || noMoves) && !busy;
  const st = {
    undo: { d: !(G.phase === 'move' && G.undo.length && !busy) },
    done: { d: !done, ready: done },
    double: { h: !cubeEnabled(), d: !canDouble() || busy || paused },
    resign: { h: !(G.phase === 'roll' && E.canResign(G.s, G.turn)), d: busy || paused },
    pause: { d: G.phase === 'over' },
    menu: {},
  };
  document.querySelectorAll('[data-act]').forEach((b) => {
    const act = b.dataset.act, f = st[act]; if (!f) return;
    let d = !!f.d, h = !!f.h;
    const side = b.closest('.side');
    if (side && GATED.includes(act) && +side.dataset.p !== G.turn) { d = true; if (act === 'resign') h = true; }
    b.hidden = h; b.disabled = d; b.classList.toggle('ready', !!f.ready && !d);
    if (act === 'pause') b.querySelector('span').textContent = paused ? 'Resume' : 'Pause';
  });
}

function renderHud() {
  const table = tableOn();
  document.querySelectorAll('.card').forEach((c) => {
    const p = +c.dataset.p;
    c.classList.toggle('active', G.phase !== 'over' && G.phase !== 'open' && G.turn === p);
    $('.name', c).textContent = nm(p);
    $('.score', c).textContent = `★ ${G.scores[p]}${S.matchTo ? ' / ' + S.matchTo : ''}`;
    $('.ppip', c).textContent = `${E.pips(G.s, p)} pips`;
  });
  renderClocks();
  // cube: centred (HUD, or the gap in the tray when two-sided) until someone owns it
  const key = `${cubeEnabled()}|${G.cube.v}|${G.cube.o}|${table}`;
  document.querySelectorAll('.cube3d').forEach((x) => x.remove());
  if (cubeEnabled()) {
    const c = el('div', 'cube3d' + (key !== lastCubeKey ? ' pop' : ''), String(G.cube.v === 1 ? 64 : G.cube.v));
    const slot = G.cube.o === null ? (table ? $('#cubeBoard') : $('#cubeSlotC'))
      : $(`${table ? '.side' : '#hud'} .card[data-p="${G.cube.o}"] .cubeSlot`);
    slot.append(c);
  }
  lastCubeKey = key;
  // status
  const p = G.turn;
  let st = '', sub = S.matchTo ? `Match to ${S.matchTo}` : 'Free play';
  if (G.phase === 'open') { st = 'Opening roll'; sub = 'High die moves first'; }
  else if (G.phase === 'roll') st = `${esc(nm(p))} to roll`;
  else if (G.phase === 'move') st = G.rem.length && G.legal && G.legal.length ? `${esc(nm(p))} to move` : (G.rem.length ? 'No legal moves' : 'Turn complete');
  else if (G.phase === 'over') st = 'Game over';
  document.querySelectorAll('#status, .sstatus').forEach((x) => { x.innerHTML = `${st}<small>${esc(sub)}</small>`; });
  // controls
  const canRoll = (G.phase === 'roll' || G.phase === 'open') && !busy && !paused && !modalOpen;
  const flipB = table && G.turn === B;
  const rb = $('#rollBtn');
  rb.hidden = !canRoll; rb.classList.toggle('flip', flipB && G.phase === 'roll');
  $('small', rb).textContent = G.phase === 'open' ? 'opening throw' : 'tap to throw';
  $('#board').classList.toggle('flipB', flipB);
  updateButtons();
  $('#soundBtn').classList.toggle('off', !S.sound);
  renderLabels();
}
function renderClocks() {
  document.querySelectorAll('.card').forEach((c) => {
    const p = +c.dataset.p, lcd = $('.lcd', c), fuse = $('.fuse i', c), total = $('.total', c);
    const active = G.phase !== 'over' && G.phase !== 'open' && G.turn === p;
    if (S.limit) {
      lcd.textContent = fmt(active ? G.turnLeft : S.limit * 1000);
      lcd.classList.toggle('low', active && G.turnLeft < 10000);
      fuse.style.transform = `scaleX(${active ? Math.max(0, G.turnLeft / (S.limit * 1000)) : 1})`;
      total.textContent = `total ${fmtUp(G.clock[p])}`;
    } else {
      lcd.textContent = fmtUp(G.clock[p]); lcd.classList.remove('low');
      fuse.style.transform = 'scaleX(0)'; total.textContent = 'thinking time';
    }
  });
}

/* two-sided table layout: a card + controls strip facing each player */
const touchy = () => (window.matchMedia && matchMedia('(pointer:coarse)').matches) || navigator.maxTouchPoints > 0;
const tableWanted = () => S.layout === 'table' || (S.layout === 'auto' && touchy());
function buildSides() {
  if ($('#side0')) return;
  [B, W].forEach((p) => {
    const s = el('section', 'side'); s.id = 'side' + p; s.dataset.p = p;
    const inner = el('div', 'sinner');
    const card = $('#card' + p).cloneNode(true); card.removeAttribute('id');
    const ctl = el('div', 'sctl');
    ['undo', 'resign', 'double', 'done', 'pause', 'menu'].forEach((a) => {
      const b = $(`#bar [data-act="${a}"]`).cloneNode(true); b.removeAttribute('id'); ctl.append(b);
    });
    inner.append(card, el('div', 'sstatus'), ctl); s.append(inner); $('#app').append(s);
  });
}
function applyMode() {
  const t = tableWanted();
  if (t) buildSides();
  $('#app').classList.toggle('table', t);
  lastCubeKey = ''; renderHud(); positionDice(); fit();
}

/* ------------------------------------------------------------------ selection / destination markers */
function refreshLegal() { G.legal = G.phase === 'move' ? E.legalMoves(G.s, G.turn, G.rem) : []; }
function destsFor(from) {
  const p = G.turn, res = new Map();
  (function rec(s, rem, pos, path) {
    for (const m of E.legalMoves(s, p, rem)) {
      if (m.from !== pos) continue;
      const np = path.concat([m]);
      if (!res.has(m.to) || res.get(m.to).length > np.length) res.set(m.to, np);
      if (m.to !== OFF) { const r2 = rem.slice(); r2.splice(r2.indexOf(m.die), 1); rec(E.apply(s, p, m), r2, m.to, np); }
    }
  })(G.s, G.rem, from, []);
  return res;
}
function setSel(from) {
  sel = from === null ? null : { from, dests: destsFor(from) };
  showMarks(); updateHints();
}
function showMarks() {
  const marks = $('#marks'); marks.innerHTML = '';
  if (!sel || G.phase !== 'move') return;
  const p = G.turn;
  for (const [to] of sel.dests) {
    if (to === OFF) {
      const m = el('div', 'mark off'); m.style.top = `calc(var(--u) * ${p === W ? 53 : 3})`; marks.append(m); continue;
    }
    const top = ptTop(to), col = ptCol(to), blot = E.own(G.s, 1 - p, to) === 1;
    const m = el('div', `mark pt ${top ? 'top' : 'bot'}`);
    m.style.left = `calc(var(--u) * ${colX(col)})`; m.style.top = `calc(var(--u) * ${top ? 3 : 57})`; marks.append(m);
    const k = blot ? 0 : G.st.pts[to].length, step = stackStep(k + 1, TH), cx = colX(col) + PW / 2;
    const r = el('div', 'mark ring');
    r.style.width = r.style.height = DIA * U + 'px';
    r.style.left = (cx - DIA / 2) * U + 'px'; r.style.top = (top ? 3 + k * step : 97 - DIA - k * step) * U + 'px';
    marks.append(r);
  }
}
function updateHints() {
  pieces.forEach((e) => e.classList.remove('can', 'sel'));
  if (G.phase !== 'move' || busy || !G.legal) return;
  const p = G.turn;
  for (const f of new Set(G.legal.map((m) => m.from))) {
    const list = f === BAR ? G.st.bar[p] : G.st.pts[f];
    pieces[list[list.length - 1]].classList.add(sel && sel.from === f ? 'sel' : 'can');
  }
}

/* ------------------------------------------------------------------ playing moves */
const ownerOf = (id) => (id < 15 ? W : B);
function snap() { return JSON.stringify({ s: G.s, st: G.st, rem: G.rem, dUsed: G.dUsed }); }
function doMove(m) {
  const p = G.turn;
  G.undo.push(snap());
  const id = m.from === BAR ? G.st.bar[p].pop() : G.st.pts[m.from].pop();
  let hit = false;
  if (m.to === OFF) G.st.off[p].push(id);
  else {
    const t = G.st.pts[m.to];
    if (t.length === 1 && ownerOf(t[0]) !== p) { const hid = t.pop(); G.st.bar[1 - p].push(hid); hit = true; flash(hid); }
    t.push(id);
  }
  G.s = E.apply(G.s, p, m);
  G.rem.splice(G.rem.indexOf(m.die), 1);
  if (G.dv[0] !== G.dv[1]) { const k = G.dv.findIndex((v, i) => v === m.die && !G.dUsed[i]); if (k >= 0) G.dUsed[k] = true; }
  layout();
  hit ? audio.hit() : m.to === OFF ? audio.off() : audio.move();
  if (navigator.vibrate) navigator.vibrate(hit ? 25 : 8);
  return hit;
}
function flash(id) { const e = pieces[id]; e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }

async function runPath(path) {
  busy = true; setSel(null); renderHud();
  for (let i = 0; i < path.length; i++) { doMove(path[i]); renderHud(); if (i < path.length - 1) await sleep(300); }
  busy = false;
  await afterMove();
}

async function afterMove() {
  const p = G.turn;
  refreshLegal(); refreshDiceUsed();
  if (G.s.off[p] === 15) { finishGame(p, E.winKind(G.s, p)); return; }
  sel = null; showMarks();
  if (G.rem.length && !G.legal.length) await noMoves();
  else if (!G.rem.length && S.autoDone) { clearTimeout(endT); endT = setTimeout(endTurn, 1000); }
  updateHints(); renderHud(); saveG();
}
async function noMoves() {
  toast(`${nm(G.turn)} has no legal moves`, 1800);
  G.dUsed = [true, true]; refreshDiceUsed();
  clearTimeout(endT); endT = setTimeout(endTurn, 1900);
  renderHud();
}
function undo() {
  if (busy || G.phase !== 'move' || !G.undo.length) return;
  clearTimeout(endT);
  const o = JSON.parse(G.undo.pop());
  G.s = o.s; G.st = o.st; G.rem = o.rem; G.dUsed = o.dUsed;
  audio.click(); sel = null; layout(); refreshLegal(); refreshDiceUsed(); showMarks(); updateHints(); renderHud(); saveG();
}
function endTurn() {
  clearTimeout(endT);
  if (G.phase !== 'move') return;
  G.turn = 1 - G.turn; G.phase = 'roll'; G.rem = []; G.undo = []; G.diceOn = false; G.legal = [];
  G.turnLeft = S.limit * 1000; sel = null;
  showMarks(); refreshDiceUsed(); updateHints(); renderHud(); saveG();
}

/* ------------------------------------------------------------------ rolling */
async function doRoll() {
  if (busy || paused || modalOpen || (G.phase !== 'roll' && G.phase !== 'open')) return;
  busy = true; renderHud(); audio.rattle();
  const a = rnd6(), b = rnd6();
  G.dv = [a, b]; G.dUsed = [false, false]; G.diceOn = true;
  if (G.phase === 'open') G.dCol = ['w', 'b']; else G.dCol = G.turn === W ? ['w', 'w'] : ['b', 'b'];
  refreshDiceUsed(); animateDice();
  setTimeout(() => audio.clack(), 520); setTimeout(() => audio.clack(), 880);
  await sleep(1250);
  if (G.phase === 'open') {
    if (a === b) { toast('Tie — throw again', 1500); busy = false; renderHud(); return; }
    G.turn = a > b ? W : B; G.phase = 'move'; G.rem = [a, b]; G.turnLeft = S.limit * 1000;
    toast(`${nm(G.turn)} starts  (${a} – ${b})`, 2100);
  } else {
    G.phase = 'move'; G.rem = a === b ? [a, a, a, a] : [a, b];
    if (a === b) toast(`Double ${a}s!`, 1500);
  }
  G.undo = [];
  busy = false;
  refreshLegal(); refreshDiceUsed();
  if (!G.legal.length) await noMoves();
  updateHints(); renderHud(); saveG();
}

/* ------------------------------------------------------------------ doubling cube */
function canDouble() {
  return G.phase === 'roll' && cubeEnabled() && (G.cube.o === null || G.cube.o === G.turn) && G.cube.v < 64;
}
function offerDouble() {
  if (!canDouble() || busy) return;
  audio.cube();
  const p = G.turn, o = 1 - p, nv = G.cube.v * 2;
  modal((sh) => {
    sh.append(el('h2', '', `${esc(nm(p))} doubles to ${nv}`));
    sh.append(el('p', '', `${esc(nm(o))}, do you accept the double?<br><span class="fine">Pass and ${esc(nm(p))} wins ${G.cube.v} point${G.cube.v > 1 ? 's' : ''}.</span>`));
    const a = el('div', 'actions');
    a.append(btn('Take', 'primary', () => { G.cube = { v: nv, o }; closeModal(); toast(`${nm(o)} takes the cube at ${nv}`); saveG(); }));
    a.append(btn('Pass', 'danger', () => { closeModal(); finishGame(p, 'pass'); }));
    a.append(btn('Cancel', '', closeModal));
    sh.append(a);
  }, o);
}

function offerResign() {
  if (G.phase !== 'roll' || busy || !E.canResign(G.s, G.turn)) return;
  const p = G.turn, o = 1 - p, pts = G.cube.v;
  modal((sh) => {
    sh.append(el('h2', '', `${esc(nm(p))} resigns?`));
    sh.append(el('p', '', `The race is lost: no more contact and ${E.pips(G.s, p)} pips against ${E.pips(G.s, o)}.<br>${esc(nm(o))} wins <b>${pts} point${pts > 1 ? 's' : ''}</b>.`));
    const a = el('div', 'actions');
    a.append(btn('Resign', 'danger', () => { closeModal(); finishGame(o, 'resign'); }));
    a.append(btn('Play on', 'primary', closeModal));
    sh.append(a);
  }, p);
}

/* ------------------------------------------------------------------ analytics (GoatCounter, cookie-free, optional)
 * Set `goatcounter` to your site code (https://CODE.goatcounter.com) to switch it on. Leave '' to disable.
 * Events are queued in localStorage while offline and sent once the device is back online. */
const ANALYTICS = { goatcounter: 'backgammonpwa' };
const KEY_Q = 'bgx.events.v1';
function track(path, title, isEvent = true) {
  if (!ANALYTICS.goatcounter) return;
  try {
    const q = JSON.parse(localStorage.getItem(KEY_Q) || '[]');
    q.push({ p: path, t: title || '', e: isEvent, ts: Date.now() });
    localStorage.setItem(KEY_Q, JSON.stringify(q.slice(-200)));
  } catch (e) { /* ignore */ }
  flushEvents();
}
let flushing = false;
async function flushEvents() {
  if (flushing || !ANALYTICS.goatcounter || !navigator.onLine) return;
  flushing = true;
  try {
    let q = JSON.parse(localStorage.getItem(KEY_Q) || '[]');
    while (q.length && navigator.onLine) {
      const ev = q[0];
      const u = new URL(`https://${ANALYTICS.goatcounter}.goatcounter.com/count`);
      u.searchParams.set('p', ev.p); u.searchParams.set('t', ev.t);
      if (ev.e) u.searchParams.set('e', 'true');
      u.searchParams.set('s', `${screen.width},${screen.height},${devicePixelRatio || 1}`);
      u.searchParams.set('rnd', Math.random().toString(36).slice(2));
      await fetch(u, { mode: 'no-cors', keepalive: true });
      q = JSON.parse(localStorage.getItem(KEY_Q) || '[]'); q.shift();
      localStorage.setItem(KEY_Q, JSON.stringify(q));
    }
  } catch (e) { /* offline or blocked: keep the queue */ }
  flushing = false;
}
window.addEventListener('online', flushEvents);
function trackGameEnd(kind, pts, matchWon) {
  const mins = Math.round((G.clock[0] + G.clock[1]) / 60000);
  const bucket = mins < 5 ? '0-5' : mins < 10 ? '5-10' : mins < 20 ? '10-20' : mins < 30 ? '20-30' : '30+';
  const how = kind === 'pass' ? 'double-passed' : kind === 'resign' ? 'resigned' : kind === 3 ? 'backgammon' : kind === 2 ? 'gammon' : 'single';
  track(`game-finished/${how}`, `Game finished: ${how}`);
  track(`game-length/${bucket}-min`, `Game length ${bucket} min`);
  track(`game-cube/${G.cube.v}`, `Cube at ${G.cube.v}`);
  if (matchWon) track('match-finished', 'Match finished');
}

/* ------------------------------------------------------------------ game end */
function finishGame(w, kind) {
  clearTimeout(endT);
  const pts = (typeof kind === 'number' ? kind : 1) * G.cube.v;
  G.scores[w] += pts; G.phase = 'over'; G.rem = []; sel = null; showMarks(); updateHints();
  G.result = { w, pts, kind };
  const matchWon = S.matchTo && G.scores[w] >= S.matchTo;
  trackGameEnd(kind, pts, matchWon);
  audio.win(); saveG(); renderHud();
  const how = kind === 'pass' ? 'Opponent passed the double' : kind === 'resign' ? 'Opponent resigned' : kind === 3 ? 'Backgammon!' : kind === 2 ? 'Gammon!' : 'Single game';
  setTimeout(() => modal((sh) => {
    sh.append(el('div', 'big', matchWon ? '🏆' : '🎉'));
    sh.append(el('h2', '', matchWon ? `${esc(nm(w))} wins the match!` : `${esc(nm(w))} wins the game`));
    sh.append(el('p', '', `${how} · <b>${pts} point${pts > 1 ? 's' : ''}</b><br>${esc(nm(0))} ${G.scores[0]} — ${G.scores[1]} ${esc(nm(1))}${S.matchTo ? ` &nbsp;(to ${S.matchTo})` : ''}`));
    const a = el('div', 'actions');
    if (matchWon) a.append(btn('New match', 'primary', () => { closeModal(); startMatch(); }));
    else a.append(btn('Next game', 'primary', () => { closeModal(); startNext(); }));
    a.append(btn('Close', '', closeModal));
    sh.append(a);
  }), kind === 'pass' ? 200 : 700);
}
function resetView() { sel = null; busy = false; clearTimeout(endT); G.diceOn = false; layout(); refreshDiceUsed(); showMarks(); updateHints(); renderHud(); saveG(); }
function startNext() { newGame(true); G.legal = []; resetView(); }
function startMatch() { newGame(false); G.legal = []; resetView(); }

/* ------------------------------------------------------------------ pointer input */
function toUnits(e) { const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) / U, y: (e.clientY - r.top) / U }; }
function hitTest(x, y) {
  if (x >= TRAY_X - 1.5 && x <= 160) return { t: 'off' };
  if (x >= BARX && x < RIGHT0) return { t: 'bar' };
  let col;
  if (x >= LEFT0 && x < BARX) col = Math.floor((x - LEFT0) / PW);
  else if (x >= RIGHT0 && x < RIGHT_END) col = 6 + Math.floor((x - RIGHT0) / PW);
  else return null;
  return { t: 'pt', idx: y < 50 ? col + 12 : 11 - col };
}
const destKey = (h) => (!h ? null : h.t === 'off' ? OFF : h.t === 'pt' ? h.idx : null);
let drag = null;
board.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (e.target.closest('button') || e.target.closest('#pause')) return;
  if (G.phase !== 'move' || busy || paused || modalOpen) return;
  const pt = toUnits(e), hit = hitTest(pt.x, pt.y);
  const key = destKey(hit);
  if (sel && key !== null && sel.dests.has(key)) { runPath(sel.dests.get(key)); return; }
  const from = !hit ? null : hit.t === 'bar' ? BAR : hit.t === 'pt' ? hit.idx : null;
  if (from !== null && G.legal.some((m) => m.from === from)) {
    const wasSel = sel && sel.from === from;
    setSel(from);
    const list = from === BAR ? G.st.bar[G.turn] : G.st.pts[from];
    drag = { id: list[list.length - 1], from, sx: e.clientX, sy: e.clientY, moved: false, wasSel };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  } else setSel(null);
});
board.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) { drag.moved = true; pieces[drag.id].classList.add('drag'); }
  if (drag.moved) {
    const pt = toUnits(e);
    pieces[drag.id].style.transform = `translate(${(pt.x - DIA / 2) * U}px,${(pt.y - DIA / 2 - 4) * U}px) scale(1.18)`;
  }
});
function endDrag(e, cancel) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved) {
    pieces[d.id].classList.remove('drag');
    const hit = cancel ? null : hitTest(...Object.values(toUnits(e))), key = destKey(hit);
    if (sel && key !== null && sel.dests.has(key)) runPath(sel.dests.get(key)); else layout();
  } else if (d.wasSel) setSel(null);
}
board.addEventListener('pointerup', (e) => endDrag(e, false));
board.addEventListener('pointercancel', (e) => endDrag(e, true));
['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.sheet')) e.preventDefault(); }, { passive: false });

/* ------------------------------------------------------------------ buttons */
$('#rollBtn').addEventListener('click', () => { audio.unlock(); doRoll(); });
$('#soundBtn').addEventListener('click', () => { audio.unlock(); S.sound = !S.sound; saveS(); audio.click(); renderHud(); });
$('#pause').addEventListener('click', () => setPaused(false));
const ACT = {
  undo,
  done: () => { audio.click(); endTurn(); },
  double: () => { audio.unlock(); offerDouble(); },
  resign: () => { audio.unlock(); audio.click(); offerResign(); },
  pause: () => setPaused(!paused),
  menu: () => { audio.unlock(); openMenu(); },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && ACT[b.dataset.act]) ACT[b.dataset.act]();
});
function setPaused(v) {
  if (G.phase === 'over' && v) return;
  paused = v; $('#pause').classList.toggle('on', v); audio.click(); renderHud();
}

function openMenu() {
  modal((sh) => {
    sh.append(el('h2', '', 'Game Settings'));
    const names = [W, B].map((p) => {
      const row = el('div', 'row', `<label>${p === W ? 'White' : 'Black'} player</label>`);
      const inp = el('input'); inp.type = 'text'; inp.maxLength = 14; inp.value = S.names[p]; inp.autocapitalize = 'words';
      inp.addEventListener('input', () => { S.names[p] = inp.value.trim() || (p === W ? 'White' : 'Black'); saveS(); renderHud(); });
      row.append(inp); sh.append(row); return inp;
    });
    const row = (label, ctl) => { const r = el('div', 'row', `<label>${label}</label>`); r.append(ctl); sh.append(r); };
    row('Match length', seg([[1, '1'], [3, '3'], [5, '5'], [7, '7'], [9, '9'], [0, '∞']], S.matchTo, (v) => { S.matchTo = v; saveS(); renderHud(); }));
    row('Turn timer', seg([[0, 'Off'], [30, '30s'], [60, '60s'], [90, '90s'], [180, '3m']], S.limit, (v) => { S.limit = v; saveS(); G.turnLeft = v * 1000; renderHud(); }));
    row('Doubling cube', seg([[true, 'On'], [false, 'Off']], S.cube, (v) => { S.cube = v; saveS(); renderHud(); }));
    row('Auto end turn', seg([[false, 'Off'], [true, 'On']], S.autoDone, (v) => { S.autoDone = v; saveS(); }));
    row('Layout', seg([['auto', 'Auto'], ['table', 'Two-sided'], ['single', 'Single']], S.layout, (v) => { S.layout = v; saveS(); applyMode(); }));
    row('Sound', seg([[true, 'On'], [false, 'Off']], S.sound, (v) => { S.sound = v; saveS(); audio.unlock(); audio.click(); renderHud(); }));
    sh.append(el('p', 'fine', 'Tap a checker, then tap a glowing point — or drag it. Tap a far point to play both dice at once.'));
    const a = el('div', 'actions');
    a.append(btn('Resume', 'primary', closeModal));
    a.append(btn('New game', '', () => confirmBox('Start a new game?', 'This game will be abandoned. Match score is kept.', startNext)));
    a.append(btn('New match', 'danger', () => confirmBox('Start a new match?', 'Scores will be reset to 0 — 0.', startMatch)));
    sh.append(a);
  });
}
function confirmBox(title, text, yes) {
  modal((sh) => {
    sh.append(el('h2', '', title)); sh.append(el('p', '', text));
    const a = el('div', 'actions');
    a.append(btn('Yes', 'danger', () => { closeModal(); yes(); }));
    a.append(btn('Cancel', 'primary', openMenu));
    sh.append(a);
  });
}

/* ------------------------------------------------------------------ clock */
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = Math.min(1000, now - lastTick); lastTick = now;
  if (paused || modalOpen || !G || G.phase === 'over' || G.phase === 'open' || document.hidden) return;
  G.clock[G.turn] += dt;
  if (S.limit) {
    const prev = G.turnLeft; G.turnLeft -= dt;
    if (G.turnLeft <= 0) { G.turnLeft = 0; timeUp(); }
    else if (G.turnLeft < 10000 && Math.floor(prev / 1000) !== Math.floor(G.turnLeft / 1000)) audio.tick();
  }
  renderClocks();
}, 250);
setInterval(() => { if (G) saveG(); }, 5000);
function timeUp() {
  if (busy) { G.turnLeft = 1; return; }
  toast(`Time's up for ${nm(G.turn)}`, 2000);
  if (G.phase === 'roll') { G.phase = 'move'; G.rem = []; G.undo = []; }
  if (G.phase === 'move') endTurn();
}

/* ------------------------------------------------------------------ boot */
async function keepAwake() {
  try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => { lastTick = performance.now(); if (!document.hidden) keepAwake(); });

buildBoard();
if (!loadGame()) newGame(false);
if (G.phase === 'move') { refreshLegal(); }
else G.legal = [];
busy = false;
board.classList.add('boot');
requestAnimationFrame(() => requestAnimationFrame(() => board.classList.remove('boot')));
new ResizeObserver(fit).observe($('#stage'));
window.addEventListener('orientationchange', () => setTimeout(fit, 150));
fit();
setDiceFaces(); refreshDiceUsed(); updateHints(); applyMode();
keepAwake();
track(location.pathname, document.title, false);
track(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'launch/installed' : 'launch/browser', 'Launch');
track(tableOn() ? 'layout/two-sided' : 'layout/single', 'Layout');
flushEvents();
if (G.phase === 'move' && G.rem.length && !G.legal.length) endT = setTimeout(endTurn, 1200);
if (G.phase === 'over' && G.result) { /* show final board; Menu → New game */ }

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__bg = { get G() { return G; }, E };
})();
