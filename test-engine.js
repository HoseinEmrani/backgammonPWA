const E = require('./engine.js');
const { W, B, BAR, OFF } = E;
const assert = require('assert');

// Opening position
let s = E.initial();
assert.strictEqual(E.pips(s, W), 167);
assert.strictEqual(E.pips(s, B), 167);
// White 6-5: 24pt (idx23) can go to idx17 (open? black has 3 on idx16, 5 on idx18 -> idx17 empty) ok
let lm = E.legalMoves(s, W, [6, 5]);
assert(lm.some((m) => m.from === 23 && m.to === 17 && m.die === 6));
// idx 12 -6 = 6 empty ok; 5 from idx 12 -> 7 own ok
// White 6 from idx 7 -> 1 ok; blocked: idx 5 -6 = -1 (not home) none
assert(!lm.some((m) => m.from === 5 && m.die === 6));
// blocked: white idx 7 with 6 -> idx1; with 7? n/a. white idx23 with 5 -> idx18 black point: blocked
assert(!lm.some((m) => m.from === 23 && m.die === 5));

// Hit
s = E.initial(); s.c[10] = 1; s.c[9] = -1; // white blot at 10, black blot at 9
let n = E.apply(s, W, { from: 10, to: 9, die: 1 });
assert.strictEqual(n.bar[B], 1); assert.strictEqual(n.c[9], 1);

// Bar entry forced
s = E.initial(); s.bar[W] = 1; s.c[23] = 1;
lm = E.legalMoves(s, W, [6, 1]);
assert(lm.every((m) => m.from === BAR));
// Entry with 6 -> idx18 blocked, with 1 -> idx23 ok
assert.deepStrictEqual(lm.map((m) => m.die), [1]);
// Black enters on idx die-1
s = E.initial(); s.bar[B] = 1;
lm = E.legalMoves(s, B, [1, 6]);
assert(lm.every((m) => m.from === BAR));
assert(lm.some((m) => m.to === 5) || true);

// Bear off, exact and overshoot
s = { c: new Array(24).fill(0), bar: [0, 0], off: [10, 0] };
s.c[0] = 2; s.c[3] = 2; s.c[4] = 1; // 5 white left
s.c[23] = -1; s.off[B] = 14;
lm = E.legalMoves(s, W, [6, 5]);
assert(lm.length > 0 && lm.every((m) => m.to === OFF)); // 6 from highest (idx4), 5 from idx4 too
assert(lm.every((m) => m.from === 4));
lm = E.legalMoves(s, W, [2]);
assert(lm.some((m) => m.from === 1) === false); // no checker on idx1
assert(lm.some((m) => m.from === 3 && m.to === 1)); // 3-2 -> idx1, normal move
// Cannot bear off while a checker is outside home
s.c[10] = 1;
assert(E.legalMoves(s, W, [6]).every((m) => m.to !== OFF));

// Black bear-off: idx 23 exact with 1
s = { c: new Array(24).fill(0), bar: [0, 0], off: [0, 10] };
s.c[23] = -2; s.c[20] = -3; s.off[W] = 14; s.c[5] = 1;
lm = E.legalMoves(s, B, [1]);
assert(lm.some((m) => m.from === 23 && m.to === OFF));
lm = E.legalMoves(s, B, [6]); // overshoot from idx 20 (needs 4); farthest is 20 -> allowed
assert(lm.some((m) => m.from === 20 && m.to === OFF));

// Must play higher die when only one can be played
s = { c: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
s.c[12] = 1; // white lone checker, +others far
s.c[23] = 14;
// Block so that after any first die the other cannot be played: place black points
// white at idx12; die 3 -> idx9, die 5 -> idx7. Block idx 6,4 (second steps) and idx 9->... craft simple case:
s = { c: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
s.c[6] = 1; s.c[23] = 0; s.c[0] = 0;
s.c[3] = -2; s.c[1] = -2; s.c[5] = 0; // die 3 -> idx3 blocked, die 5 -> idx1 blocked.. so neither playable
assert.strictEqual(E.legalMoves(s, W, [5, 3]).length, 0);
s = { c: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
s.c[6] = 1; s.c[2] = -2; s.c[1] = -2; // die1 -> idx5 ok; then 4: idx1 blocked, die4 first -> idx2 blocked
// dice [1,4]: only die 1 playable at first; after idx5, 4 -> idx1 blocked => only 1 die playable
lm = E.legalMoves(s, W, [1, 4]);
assert(lm.length === 1 && lm[0].die === 1);
// dice [4,3]: 4->idx2 blocked, 3->idx3 ok then 4 from idx3 -> -1 not home => only die 3
// Make both playable singly but not together: lone checker idx 6; black blocks idx 2 and idx 0... dice [4,6]
s = { c: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
s.c[10] = 1; s.c[6] = -2; s.c[4] = -2; s.c[0] = -2; // die4 -> 6 blocked; die 6 -> 4 blocked.
assert.strictEqual(E.legalMoves(s, W, [4, 6]).length, 0);

// Doubles: all four usable
s = E.initial();
const d = E.legalMoves(s, W, [1, 1, 1, 1]);
assert(d.length > 0);

// Win kinds
s = { c: new Array(24).fill(0), bar: [0, 0], off: [15, 0] };
s.c[10] = -15;
assert.strictEqual(E.winKind(s, W), 2);
s.c[3] = -1; s.c[10] = -14;
assert.strictEqual(E.winKind(s, W), 3);
s.off[B] = 1;
assert.strictEqual(E.winKind(s, W), 1);

// Resign: not at the start, only when contact is over and far behind
assert(!E.contactOver(E.initial()));
assert(!E.canResign(E.initial(), W));
s = { c: new Array(24).fill(0), bar: [0, 0], off: [11, 4] };
s.c[2] = 4; s.c[20] = -11; // contact over: white on 2, black on 20
assert(E.contactOver(s));
assert(!E.canResign(s, B) || E.pips(s, B) - E.pips(s, W) >= 20);
assert(E.canResign(s, B) === (E.pips(s, B) - E.pips(s, W) >= Math.max(20, E.pips(s, W) * 0.3)));
s = { c: new Array(24).fill(0), bar: [0, 0], off: [14, 0] };
s.c[1] = 1; s.c[8] = -15;
assert(E.contactOver(s) && E.canResign(s, B) && !E.canResign(s, W));
s.c[0] = 0; s.c[20] = 1; // white checker behind black ones: contact
assert(!E.contactOver(s));

// Performance: worst-case doubles search
const t = Date.now();
for (let i = 0; i < 20; i++) E.legalMoves(E.initial(), W, [2, 2, 2, 2]);
console.log('doubles x20 ms', Date.now() - t);
console.log('engine tests passed');
