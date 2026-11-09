// =========================================================
// 複素数の画面
//
//   i のキーで「3＋4i」のように打つと、＝ を押さなくても答えが出る（＝ で履歴に残る）
//   答えは a＋bi・極形式 r∠θ・r·e^(iθ) の形でも出し、複素平面の図に矢印でかく
//   「✓ 検算」：計算をくわしく分ける → 逆算 → 極形式（長さと角度）でも同じか
//
// 計算そのものは complex.js
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';
import * as C from './complex.js';
import { $, span, caretFromPoint, toast } from './ui.js';
import { el, button, shake, setupPad } from './form.js';

const STORE_KEY = 'calculator.complex';

const st = {
  angle: 'deg', // ∠ と arg の角度（'deg' / 'rad'）
  items: [],
  caret: 0,
  done: false,  // ＝ を押した直後
  last: null,   // { items, value, notes, steps } … 最後に ＝ を押した計算
  error: '',
};
let hooks = {};
let shown = null; // いま出している答え

const reject = (target) => shake(target, hooks.settings());
const angleName = () => S.ANGLE_NAME[st.angle];

const NOTE_TEXT = {
  implicitDiv: () => '÷ のすぐ後ろの 2i などは、1つの数として先に計算します（1÷2i ＝ 1÷(2i)）',
  principal: () => '√・ln・分数乗は、いくつかある答えのうち「主値」（角度が −180° より大きく 180° まで）を出します',
  negPow: () => '負の数の分数乗も主値です（(−8)^(1/3) ＝ 1 ＋ 1.73…i。電卓の −2 とはちがいます）',
  polar: () => 'r∠θ ＝ 長さ r・角度 θ の数（r(cos θ ＋ i sin θ)）。∠ の右の × ÷ は角度に入ります（2∠π/2）',
  angle: () => `角度は「${angleName()}」です（上で切りかえ）`,
  'abs(': () => 'abs ＝ |z|：原点からの長さ（√(a² ＋ b²)）',
  'arg(': () => 'arg：実軸の＋の向きから、左回りに測った角度',
  'conj(': () => 'conj ＝ 共役：i の部分の符号を反対にした数（実軸で折り返した点）',
};

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      angle: st.angle,
      items: C.serItems(st.items),
      caret: st.caret,
      done: st.done,
      last: st.last && { items: C.serItems(st.last.items) },
    }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    st.angle = s.angle === 'rad' ? 'rad' : 'deg';
    st.items = C.deserItems(s.items);
    st.caret = Math.min(Math.max(0, Number.isInteger(s.caret) ? s.caret : st.items.length), st.items.length);
    if (s.last) {
      const items = C.deserItems(s.last.items);
      if (items.length) st.last = { items, ...C.evaluate(items, { angle: st.angle }) };
    }
    st.done = !!s.done && !!st.last;
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showComplex() {
  render();
}

function render() {
  for (const b of document.querySelectorAll('#cxAngle [data-angle]')) {
    b.setAttribute('aria-checked', String(b.dataset.angle === st.angle));
  }
  renderDisplay();
  save();
}

function fit(elm, maxPx, minPx, wrap = false) {
  elm.style.whiteSpace = 'nowrap';
  let px = maxPx;
  for (; px > minPx; px -= 2) {
    elm.style.fontSize = `${px}px`;
    if (elm.scrollWidth <= elm.clientWidth + 1) break;
  }
  elm.style.fontSize = `${px}px`;
  if (wrap) elm.style.whiteSpace = '';
}

const TOKEN_TEXT = { 'e^(': 'e^(' };
function renderExpr(container, items, { caret = null, tail = null } = {}) {
  const frag = document.createDocumentFragment();
  items.forEach((t, i) => {
    if (caret === i) frag.append(span('caret', ''));
    const e = document.createElement('span');
    e.dataset.i = i;
    if (C.isAns(t)) {
      e.className = 'tk ref';
      e.textContent = t.label;
    } else if (['+', '−', '×', '÷', '∠'].includes(t)) {
      e.className = 'tk op';
      e.textContent = t;
    } else if (t === '^') {
      e.className = 'tk fn';
      e.textContent = '^';
    } else if (t === '(' || t === ')') {
      e.className = 'tk paren';
      e.textContent = t;
    } else if (C.isFn(t)) {
      e.className = t === '√(' ? 'tk fn' : 'tk func';
      e.textContent = TOKEN_TEXT[t] ?? t;
    } else if (t === 'i') {
      e.className = 'tk cx-i';
      e.textContent = 'i';
    } else {
      e.className = t === 'π' ? 'tk konst' : 'tk';
      e.textContent = t;
    }
    frag.append(e);
  });
  if (caret === items.length) frag.append(span('caret', ''));
  const open = C.openParens(items);
  if (caret !== null && open > 0) frag.append(span('ghost', ')'.repeat(open)));
  if (tail) frag.append(tail);
  container.replaceChildren(frag);
}

function setNotes(lines) {
  $('#cxNotes').replaceChildren(...lines.map((line) => el('p', '', line)));
}

function renderDisplay() {
  const exprEl = $('#cxExpr');
  const resultEl = $('#cxResult');
  const notes = [];
  let r = null; // 答えの計算（図に使う）
  $('#cxDisplay').classList.toggle('done', st.done);
  $('#cxActions').hidden = !st.done;
  shown = null;
  resultEl.classList.remove('error');
  resultEl.style.fontSize = '';
  resultEl.textContent = '';

  if (st.done) {
    renderExpr(exprEl, st.last.items, { tail: span('eq-sign', ' =') });
    fit(exprEl, 24, 16, true);
    r = st.last;
    $('#btnCxToCalc').hidden = !C.isReal(r.value);
  } else {
    if (st.items.length === 0) exprEl.replaceChildren(span('placeholder', '0'), span('caret', ''));
    else renderExpr(exprEl, st.items, { caret: st.caret });
    fit(exprEl, 40, 22, true);
    if (st.error) {
      resultEl.classList.add('error');
      resultEl.textContent = st.error;
    } else if (!st.items.length) {
      notes.push('「3＋4i」のように、i のキーで打ちます（i × i ＝ −1）');
    } else {
      const p = C.preview(st.items, { angle: st.angle });
      if (p?.error) {
        resultEl.classList.add('error');
        resultEl.textContent = p.error;
      } else if (p) r = p;
    }
    exprEl.querySelector('.caret')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (r) {
    shown = r.value;
    resultEl.textContent = C.rectText(r.value, 12);
    fit(resultEl, st.done ? 44 : 30, st.done ? 20 : 18);
    for (const n of r.notes.slice(0, 3)) notes.push(NOTE_TEXT[n.kind]());
  }
  setNotes(notes);
  renderPlane(r);
  renderRows();
}

// 答えのいろいろな形（タップでコピー）
function renderRows() {
  const box = $('#cxRows');
  const z = shown;
  if (!z) {
    box.replaceChildren();
    return;
  }
  const rows = [['a ＋ bi', C.rectText(z, 16)]];
  if (C.isZero(z)) {
    rows.push(['長さ |z|', '0'], ['角度 arg', '決まりません（0 の向きはない）']);
  } else {
    const t = C.argTurn(z);
    const r = C.abs(z);
    const absT = C.absText(z, 16);
    rows.push(
      ['極形式', C.polarText(z, st.angle, 12)],
      ['指数の形', C.expText(z, 12)],
      ['長さ |z|', absT.startsWith('√') ? `${absT} ＝ ${C.numText(r, 16)}` : absT],
      ['角度 arg', `${C.angleText(t, 'deg', 12)} ＝ ${C.angleText(t, 'rad', 12)} rad`],
    );
  }
  rows.push(['共役', C.rectText(C.conj(z), 16)]);
  box.replaceChildren(el('p', 'bs-head', 'いろいろな形（タップでコピー）'), ...rows.map(([name, value]) => {
    const row = button('bs-row cx-row', '', () => copyText(value.replace(/ ＝ .*$/, ''), name));
    row.append(el('span', 'bs-name', name), el('span', 'bs-val', value));
    return row;
  }));
}

async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what}をコピーしました`);
  } catch {
    toast(`コピーできませんでした：${text}`);
  }
}

// ---------------------------------------------------------
// 複素平面の図
// ---------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

// m 以下で、いちばん大きい 1・2・5 × 10ⁿ（目もりに使う）
function niceFloor(m) {
  const p = 10 ** Math.floor(Math.log10(m) + 1e-9);
  for (const f of [5, 2, 1]) if (f * p <= m * 1.0001) return f * p;
  return p;
}
const roundLabel = (x) => (Math.abs(x) >= 1e5 || Math.abs(x) < 1e-3 ? x.toExponential(0).replace('e+', 'e') : String(+x.toPrecision(3))).replace(/-/g, '−');

// 図に出す数：最後の計算の数と答え
function planeParts(r) {
  const s = r.steps.at(-1);
  if (!s || !C.near(s.r, r.value, 60)) return { points: [], op: null };
  if (['+', '−', '×', '÷'].includes(s.op)) return { points: [{ z: s.a, name: 'z₁' }, { z: s.b, name: 'z₂' }], op: s.op };
  if (s.op === '^' || C.isFn(s.op) || s.op === 'neg') return { points: [{ z: s.a, name: 'z' }], op: s.op, step: s };
  return { points: [], op: s.op };
}

const RULE = {
  '+': '＋ は矢印をつなぐ（z₁ の先から z₂ の矢印をのばす）',
  '−': '− は z₂ を反対向きにしてつなぐ',
  '×': '× は 長さをかけて、角度を足す',
  '÷': '÷ は 長さを割って、角度を引く',
  '√(': '√ は 長さを √ に、角度を半分に',
  'conj(': '共役は 実軸で折り返した点',
  neg: 'マイナスは 原点の反対側（180° まわす）',
  'e^(': 'e^(a＋bi) は 長さ eᵃ、角度 b（rad）',
};

function renderPlane(r) {
  const box = $('#cxPlane');
  if (!r) {
    box.replaceChildren();
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const { points, op, step } = planeParts(r);
  const all = [...points.map((p) => p.z), r.value];
  const nums = all.flatMap((z) => [N.toNumber(z.re), N.toNumber(z.im)]);
  if (nums.some((x) => !Number.isFinite(x))) {
    box.replaceChildren(el('p', 'hint', '数が大きすぎて、図にはかけません'));
    return;
  }
  const W = 340;
  const H = 226;
  const ox = W / 2;
  const oy = H / 2;
  // いちばん長い矢印（と答えの円）が、半径 86px に入る大きさ
  const lens = all.map((z) => Math.hypot(N.toNumber(z.re), N.toNumber(z.im)));
  if (lens.some((x) => !Number.isFinite(x))) {
    box.replaceChildren(el('p', 'hint', '数が大きすぎて、図にはかけません'));
    return;
  }
  const maxLen = Math.max(...lens) || 1;
  const k = 86 / maxLen;
  const R = niceFloor(maxLen); // 目もりの数
  const RPX = R * k;
  const X = (z) => ox + N.toNumber(z.re) * k;
  const Y = (z) => oy - N.toNumber(z.im) * k;
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cx-svg', role: 'img', 'aria-label': '複素平面（横が実軸、たてが虚軸）' });
  const defs = svg('defs');
  for (const id of ['cxArrAns', 'cxArrOp']) {
    const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.append(svg('path', { d: 'M0 0 L10 5 L0 10 z', class: id === 'cxArrAns' ? 'ans-fill' : 'op-fill' }));
    defs.append(m);
  }
  g.append(defs);
  // 軸と目もり
  g.append(
    svg('line', { x1: 6, y1: oy, x2: W - 6, y2: oy, class: 'axis' }),
    svg('line', { x1: ox, y1: 6, x2: ox, y2: H - 6, class: 'axis' }),
    // 軸の名前は、矢印の先とぶつかりにくい所（右はしの下・上はしの左）に
    svg('text', { x: W - 4, y: oy + 15, class: 'ax-name', 'text-anchor': 'end' }, '実軸 Re'),
    svg('text', { x: ox - 8, y: 10, class: 'ax-name', 'text-anchor': 'end' }, '虚軸 Im'),
  );
  for (const sgn of [1, -1]) {
    const v = roundLabel(sgn * R);
    g.append(
      svg('line', { x1: ox + sgn * RPX, y1: oy - 3, x2: ox + sgn * RPX, y2: oy + 3, class: 'axis' }),
      svg('line', { x1: ox - 3, y1: oy - sgn * RPX, x2: ox + 3, y2: oy - sgn * RPX, class: 'axis' }),
      svg('text', { x: ox + sgn * RPX, y: oy + 15, class: 'tick', 'text-anchor': 'middle' }, v),
      svg('text', { x: ox - 6, y: oy - sgn * RPX + 4, class: 'tick', 'text-anchor': 'end' }, `${v}i`),
    );
  }
  // 答えの長さの円
  const ans = r.value;
  const ansLen = Math.hypot(X(ans) - ox, Y(ans) - oy);
  if (ansLen > 4) g.append(svg('circle', { cx: ox, cy: oy, r: ansLen, class: 'len' }));
  // ＋ は矢印をつなぐ形（点線）
  if ((op === '+' || op === '−') && points.length === 2) {
    const b = op === '+' ? points[1].z : C.neg(points[1].z);
    g.append(svg('line', { x1: X(points[0].z), y1: Y(points[0].z), x2: X(ans), y2: Y(ans), class: 'helper' }));
    if (op === '−') g.append(svg('line', { x1: ox, y1: oy, x2: X(b), y2: Y(b), class: 'helper' }));
  }
  const arrow = (z, cls, name) => {
    const x = X(z);
    const y = Y(z);
    const len = Math.hypot(x - ox, y - oy);
    if (len < 4) g.append(svg('circle', { cx: x, cy: y, r: 3, class: `${cls}-fill` }));
    else g.append(svg('line', { x1: ox, y1: oy, x2: x, y2: y, class: cls, 'marker-end': `url(#${cls === 'ans' ? 'cxArrAns' : 'cxArrOp'})` }));
    const ux = len < 4 ? 0.7 : (x - ox) / len;
    const uy = len < 4 ? -0.7 : (y - oy) / len;
    g.append(svg('text', {
      x: x + ux * 12, y: y + uy * 12 + 4, class: `pt ${cls}`, 'text-anchor': ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle',
    }, name));
  };
  for (const p of points) arrow(p.z, 'op', p.name);
  // 答えの角度の弧
  if (!C.isZero(ans) && ansLen > 4) {
    const th = Math.atan2(N.toNumber(ans.im), N.toNumber(ans.re));
    const rr = Math.min(22, ansLen * 0.6);
    const ex = ox + rr * Math.cos(th);
    const ey = oy - rr * Math.sin(th);
    if (Math.abs(th) > 0.01) {
      g.append(svg('path', { d: `M ${ox + rr} ${oy} A ${rr} ${rr} 0 0 ${th > 0 ? 0 : 1} ${ex} ${ey}`, class: 'arc' }));
    }
  }
  arrow(ans, 'ans', '答え');

  // 図の下の説明
  const legend = el('div', 'cx-legend');
  const desc = (z) => `${C.rectText(z, 8)}${C.isZero(z) ? '' : `（${C.polarText(z, st.angle, 6)}）`}`;
  for (const p of points) legend.append(el('p', 'op', `${p.name} ＝ ${desc(p.z)}`));
  legend.append(el('p', 'ans', `答え ＝ ${desc(ans)}`));
  let rule = RULE[op];
  if (op === '^' && C.isReal(step.b)) {
    const x = step.b.re;
    // 1/3 のような短い分数は、分数のまま書く
    const k = x.q && x.d !== 1n && `${x.n}${x.d}`.length <= 8
      ? `${x.n < 0n ? '−' : ''}${x.n < 0n ? -x.n : x.n}/${x.d}`
      : C.numText(x, 6);
    rule = `${k}乗は 長さを ${k}乗、角度を ${k}倍${C.isIntPow(step.b) ? '' : '（主値）'}`;
  }
  if (rule) legend.append(el('p', 'hint', rule));
  box.replaceChildren(g, legend);
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function ansItem(z) {
  const text = C.rectText(z, 8);
  return { ref: z, label: text.length <= 18 ? text : '答え' };
}

function startEditing(items, caret = items.length) {
  st.done = false;
  st.items = items;
  st.caret = caret;
  st.error = '';
}

function press(key, target) {
  if (key === '=') return equals(target);
  if (st.done) {
    if (C.isDigit(key) || ['.', 'i', 'π', '('].includes(key) || C.isFn(key)) {
      startEditing([]); // 新しい式
    } else if (C.isBinOp(key)) {
      startEditing([ansItem(st.last.value)]); // 答えの続きから
    } else if (key === 'clear') {
      startEditing([]);
      return render();
    } else if (['back', 'left', 'right'].includes(key)) {
      startEditing([...st.last.items]); // さっきの式に戻って直す
      if (key === 'left') st.caret = Math.max(0, st.caret - 1);
      return render();
    } else {
      return reject(target);
    }
  }
  const next = C.pressComplex({ items: st.items, caret: st.caret }, key);
  if (!next) return reject(target);
  st.items = next.items;
  st.caret = next.caret;
  st.error = '';
  render();
}

const usesAngle = (items) => items.some((t) => t === '∠' || t === 'arg(');

function equals(target) {
  if (st.done) return;
  if (!st.items.length) return reject(target);
  try {
    const r = C.evaluate(st.items, { angle: st.angle });
    const items = C.closeParens(st.items);
    st.last = { items, ...r };
    st.done = true;
    st.error = '';
    hooks.onSaveHistory(items, r.value, { kind: '複素数', angle: usesAngle(items) ? st.angle : null });
    render();
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    st.error = error.kind === 'math' ? error.message : `式が途中か、形がちがいます：${error.message}`;
    reject(target);
    render();
  }
}

// 履歴から：答えを式に入れる・式を直す・検算
export function useComplexAnswer(z, label) {
  if (st.done) startEditing([]);
  const item = { ref: z, label: label && label.length <= 18 ? label : ansItem(z).label };
  startEditing([...st.items.slice(0, st.caret), item, ...st.items.slice(st.caret)], st.caret + 1);
  save();
}

export function editComplex(items, angle) {
  startEditing([...items]);
  if (angle && angle !== st.angle) {
    st.angle = angle;
    toast(`この式は角度「${S.ANGLE_NAME[angle]}」で計算していたので、角度を「${S.ANGLE_NAME[angle]}」にしました`);
  }
  save();
}

export function checkComplex(items, angle) {
  openCheck(items, angle ?? st.angle);
}

// ---------------------------------------------------------
// 検算
// ---------------------------------------------------------
function section(title, ...children) {
  const s = el('section', 'd-sec');
  s.append(el('h3', '', title), ...children);
  return s;
}
const line = (text) => el('div', 'calc-line', text);
const hint = (text) => el('p', 'hint', text);
function checked(text, ok) {
  const d = el('div', 'rev', `${text} `);
  d.append(el('span', `mark ${ok ? 'ok' : 'ng'}`, ok ? '✓' : '✗'));
  return d;
}
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circled = (i) => CIRCLED[i] ?? `(${i + 1})`;

const T = (z) => C.rectText(z, 10);
const n = (x) => C.numText(x, 10);
// かっこで囲んだ数（3 ＋ 4i → (3 ＋ 4i)、−2 → (−2)）
const P = (z) => {
  const t = T(z);
  return /[ −]/.test(t) || t.includes('…') ? `(${t})` : t;
};
const V = (z, from) => `${from === null || from === undefined ? '' : circled(from)}${P(z)}`;
// 符号つきで並べる：[3, −8] → 3 − 8
function signed(list) {
  return list.map(([x, suffix = ''], i) => {
    const neg = N.sign(x) < 0;
    const num = n(N.absNum(x));
    const body = suffix && num === '1' ? suffix : `${num}${suffix}`; // 1i は i と書く
    if (i === 0) return `${neg ? '−' : ''}${body}`;
    return ` ${neg ? '−' : '+'} ${body}`;
  }).join('');
}
const sq = (x) => (N.sign(x) < 0 ? `(${n(x)})²` : `${n(x)}²`);
const angT = (t, angle) => C.angleText(t, angle, 8);
// マイナスの角度は ( ) でかこむ（足し算・引き算の右に書くとき）
const angP = (t, angle) => {
  const text = angT(t, angle);
  return text.startsWith('−') ? `(${text})` : text;
};
// 確かめの計算で出た数 x：めざす数 target とほぼ同じなら、target の書き方で（11… − 2…i ではなく 11 − 2i）
const TT = (x, target) => T(C.near(x, target) ? target : x);

function stepView(s, i, angle) {
  const box = el('div', 'bs-step');
  const no = `${circled(i)} `;
  const A = V(s.a, s.aFrom);
  const B = s.b ? V(s.b, s.bFrom) : '';
  const R = T(s.r);
  const { a, b } = s;
  switch (s.op) {
    case '+': case '−': {
      const f = s.op === '+' ? (x, y) => N.add(x, y) : (x, y) => N.sub(x, y);
      box.append(line(`${no}${A} ${s.op === '+' ? '＋' : '−'} ${B}`));
      box.append(line(`＝ (${signed([[a.re], [s.op === '+' ? b.re : N.neg(b.re)]])}) ＋ (${signed([[a.im], [s.op === '+' ? b.im : N.neg(b.im)]])})i`));
      box.append(line(`＝ ${T(C.cx(f(a.re, b.re), f(a.im, b.im)))}`));
      box.append(hint('実部（i のない所）どうし、虚部（i の数）どうしを計算します'));
      break;
    }
    case '×':
      if (C.isReal(a) || C.isReal(b)) {
        box.append(line(`${no}${A} × ${B} ＝ ${R}`));
        box.append(hint('ふつうの数をかけるときは、実部にも虚部にもかけます'));
      } else {
        box.append(line(`${no}${A}${B}`));
        box.append(line(`＝ ${signed([[N.mul(a.re, b.re)], [N.mul(a.re, b.im), 'i'], [N.mul(a.im, b.re), 'i'], [N.mul(a.im, b.im), 'i²']])}`));
        box.append(line(`＝ (${signed([[N.mul(a.re, b.re)], [N.neg(N.mul(a.im, b.im))]])}) ＋ (${signed([[N.mul(a.re, b.im)], [N.mul(a.im, b.re)]])})i`));
        box.append(line(`＝ ${R}`));
        box.append(hint('かっこを分けてかけ、i² ＝ −1 にします'));
      }
      break;
    case '÷':
      if (C.isReal(b)) {
        box.append(line(`${no}${A} ÷ ${B} ＝ ${R}`));
        box.append(hint('実部と虚部を、それぞれ割ります'));
      } else {
        const cb = C.conj(b);
        const top = C.mul(a, cb);
        const d = C.norm(b);
        box.append(line(`${no}${A} ÷ ${B}`));
        box.append(hint(`上と下に、割る数の共役 ${P(cb)} をかけると、下が i のない数になります`));
        box.append(line(`下：${P(b)}${P(cb)} ＝ ${sq(b.re)} ＋ ${sq(b.im)} ＝ ${n(d)}`));
        box.append(line(`上：${P(a)}${P(cb)} ＝ ${T(top)}`));
        box.append(line(`＝ ${P(top)} ÷ ${n(d)} ＝ ${R}`));
      }
      break;
    case '^':
      if (C.isIntPow(b)) {
        box.append(line(`${no}${A}^${n(b.re)} ＝ ${R}`));
        if (!C.isZero(a)) box.append(hint(`極形式で：長さ ${C.absText(a, 8)} を ${n(b.re)}乗、角度 ${angT(C.argTurn(a), angle)} を ${n(b.re)}倍（下の 3. で確かめます）`));
      } else {
        box.append(line(`${no}${A}^${P(b)} ＝ e^(${P(b)} × ln ${P(a)})`));
        if (!C.isZero(a)) box.append(line(`ln ${P(a)} ＝ ${T(C.ln(a))}`));
        box.append(line(`＝ ${R}`));
      }
      break;
    case '∠': {
      const t = S.toTurn(b.re, angle);
      const { cos, sin } = C.cosSinTurn(t);
      const th = angle === 'deg' ? `${n(b.re)}°` : n(b.re);
      box.append(line(`${no}${n(a.re)}∠${th} ＝ ${n(a.re)}(cos ${th} ＋ i sin ${th})`));
      box.append(line(`cos ${th} ＝ ${n(cos)}、sin ${th} ＝ ${n(sin)}`));
      box.append(line(`＝ ${R}`));
      break;
    }
    case '√(':
      box.append(line(`${no}√${P(a)} ＝ ${R}`));
      if (!C.isZero(a)) {
        box.append(hint(`極形式で：長さ ${C.absText(a, 8)} の √、角度 ${angT(C.argTurn(a), angle)} の半分（主値）`));
      }
      break;
    case 'abs(':
      box.append(line(`${no}|${T(a)}| ＝ √(${sq(a.re)} ＋ ${sq(a.im)}) ＝ √${n(C.norm(a))} ＝ ${R}`));
      box.append(hint('原点から、その点までの長さ（三平方の定理）'));
      break;
    case 'arg(': {
      const q = N.isZero(a.re) || N.isZero(a.im) ? '軸の上' : `第${N.sign(a.re) > 0 ? (N.sign(a.im) > 0 ? 1 : 4) : (N.sign(a.im) > 0 ? 2 : 3)}象限`;
      box.append(line(`${no}arg ${P(a)} ＝ ${R}${angle === 'deg' ? '°' : ''}`));
      if (!N.isZero(a.re)) box.append(line(`tan θ ＝ ${n(a.im)} ÷ ${N.sign(a.re) < 0 ? `(${n(a.re)})` : n(a.re)} ＝ ${n(N.div(a.im, a.re))}（点は ${q}）`));
      else box.append(line(`点は虚軸の上（${N.sign(a.im) > 0 ? '上' : '下'}向き）`));
      break;
    }
    case 'conj(':
      box.append(line(`${no}${P(a)} の共役 ＝ ${R}`));
      box.append(hint('i の部分の符号を反対にします'));
      break;
    case 'Re(':
      box.append(line(`${no}${P(a)} の実部（i のない所）＝ ${R}`));
      break;
    case 'Im(':
      box.append(line(`${no}${P(a)} の虚部（i の数）＝ ${R}`));
      break;
    case 'e^(':
      box.append(line(`${no}e^${P(a)} ＝ e^${n(a.re)} × (cos ${n(a.im)} ＋ i sin ${n(a.im)})`));
      box.append(line(`＝ ${R}`));
      box.append(hint('オイラーの公式：e^(iθ) ＝ cos θ ＋ i sin θ（θ は rad）'));
      break;
    case 'ln(':
      box.append(line(`${no}ln ${P(a)} ＝ ln|z| ＋ i × arg z（arg は rad）`));
      box.append(line(`＝ ${n(s.r.re)} ＋ ${n(s.r.im)}i ＝ ${R}`));
      break;
    default: // neg
      box.append(line(`${no}−1 × ${A} ＝ ${R}`));
  }
  return box;
}

// 逆の計算で、もとの数にもどるか（もどせない計算は null）
function reverseLine(s, i) {
  const no = `${circled(i)} `;
  const R = P(s.r);
  const ok = (x) => C.near(x, s.a);
  const show = (text, x) => checked(`${no}${text} ＝ ${TT(x, s.a)}`, ok(x));
  switch (s.op) {
    case '+': return show(`${R} − ${P(s.b)}`, C.sub(s.r, s.b));
    case '−': return show(`${R} ＋ ${P(s.b)}`, C.add(s.r, s.b));
    case '×':
      if (C.isZero(s.b)) return el('div', 'rev', `${no}0 をかけているので、逆算はできません`);
      return show(`${R} ÷ ${P(s.b)}`, C.div(s.r, s.b));
    case '÷': return show(`${R} × ${P(s.b)}`, C.mul(s.r, s.b));
    case '√(': return show(`${R}²`, C.mul(s.r, s.r));
    case 'conj(': return show(`${R} の共役`, C.conj(s.r));
    case 'ln(': return show(`e^${R}`, C.exp(s.r));
    case 'neg': return show(`−${R}`, C.neg(s.r));
    case 'abs(': {
      const x = C.mul(s.a, C.conj(s.a));
      return checked(`${no}${n(s.r.re)}² ＝ ${n(N.mul(s.r.re, s.r.re))}、${P(s.a)} × ${P(C.conj(s.a))} ＝ ${T(x)}`, C.near(x, C.mul(s.r, s.r)));
    }
    default:
      return null;
  }
}

// 極形式（長さと角度）でも同じ答えになるか
function polarLine(s, i, angle) {
  const no = `${circled(i)} `;
  const ra = C.abs(s.a);
  const ta = C.argTurn(s.a);
  const lenA = C.absText(s.a, 8);
  let r;
  let t;
  let text;
  // 長さは、2乗（正確な数）から √ の形で書く（5 × √5 ＝ 5√5）
  if ((s.op === '×' || s.op === '÷') && !C.isZero(s.a) && !C.isZero(s.b)) {
    const rb = C.abs(s.b);
    const tb = C.argTurn(s.b);
    const mul = s.op === '×';
    r = mul ? N.mul(ra, rb) : N.div(ra, rb);
    t = mul ? N.add(ta, tb) : N.sub(ta, tb);
    const r2 = mul ? N.mul(C.norm(s.a), C.norm(s.b)) : N.div(C.norm(s.a), C.norm(s.b));
    text = `長さ ${lenA} ${s.op} ${C.absText(s.b, 8)} ＝ ${C.sqrtText(r2, 8)}、角度 ${angT(ta, angle)} ${mul ? '＋' : '−'} ${angP(tb, angle)} ＝ ${angT(t, angle)}`;
  } else if (s.op === '^' && C.isIntPow(s.b) && !C.isZero(s.a) && N.cmp(N.absNum(s.b.re), N.frac(1000n)) <= 0) {
    const k = s.b.re;
    r = N.pow(ra, k);
    t = N.mul(ta, k);
    const kt = N.sign(k) < 0 ? `(${n(k)})` : n(k);
    text = `長さ ${/[√…]/.test(lenA) ? `(${lenA})` : lenA}^${kt} ＝ ${C.sqrtText(N.pow(C.norm(s.a), k), 8)}、角度 ${angT(ta, angle)} × ${kt} ＝ ${angT(t, angle)}`;
  } else if (s.op === '√(' && !C.isZero(s.a)) {
    r = N.sqrt(ra);
    t = N.div(ta, N.frac(2n));
    text = `長さ ${lenA} の √ ＝ ${C.sqrtText(ra, 8)}、角度 ${angT(ta, angle)} ÷ 2 ＝ ${angT(t, angle)}`;
  } else {
    return null;
  }
  const z = C.fromPolar(r, t);
  return checked(`${no}${text} → ${TT(z, s.r)}`, C.near(z, s.r));
}

function openCheck(items, angle) {
  let r;
  try {
    r = C.evaluate(items, { angle });
  } catch {
    return;
  }
  const z = r.value;
  $('#checkTitle').textContent = '複素数の検算';
  const body = $('#checkBody');
  body.replaceChildren();
  let allOk = true;
  const tally = (row) => {
    if (row?.querySelector('.mark.ng')) allOk = false;
    return row;
  };

  // 1. 計算の順番
  if (r.steps.length) {
    const box = el('div');
    r.steps.forEach((s, i) => box.append(stepView(s, i, angle)));
    body.append(section('1. 計算を分けると', box));
  } else {
    body.append(section('1. 計算', line(`数を書いているだけなので、計算はありません（${T(z)}）`)));
  }

  // 2. 逆算
  const rev = el('div');
  r.steps.forEach((s, i) => {
    const row = reverseLine(s, i);
    if (row) rev.append(tally(row));
  });
  if (rev.children.length) body.append(section('2. 逆算（逆の計算で、もとの数にもどるか）', rev));

  // 3. 極形式で
  const pol = el('div');
  r.steps.forEach((s, i) => {
    const row = polarLine(s, i, angle);
    if (row) pol.append(tally(row));
  });
  if (pol.children.length) {
    pol.append(hint('× は長さをかけて角度を足す、÷ は長さを割って角度を引く（360° ちがう角度は同じ向き）'));
    body.append(section(`${body.children.length + 1}. 極形式（長さと角度）でも計算する`, pol));
  }

  // 4. 答えの形
  const forms = el('div');
  forms.append(line(`a ＋ bi：${T(z)}`));
  if (!C.isZero(z)) {
    const back = C.fromPolar(C.abs(z), C.argTurn(z));
    forms.append(line(`極形式：${C.polarText(z, angle, 10)}`), line(`指数の形：${C.expText(z, 10)}`));
    forms.append(tally(checked(`極形式から：長さ × cos θ ＋ 長さ × sin θ i ＝ ${TT(back, z)}`, C.near(back, z))));
  }
  body.append(section(`${body.children.length + 1}. 答えの形`, forms));

  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, allOk ? '✓ 逆の計算でも、極形式でも、同じ答えになります' : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onSaveHistory(items, z, meta), onUseInCalc(value, label) }
export function initComplex(h) {
  hooks = h;
  load();

  $('#cxAngle').addEventListener('click', (event) => {
    const b = event.target.closest('[data-angle]');
    if (!b || b.dataset.angle === st.angle) return;
    st.angle = b.dataset.angle;
    // ＝ のあとなら、新しい角度で計算し直す
    if (st.done) {
      try {
        st.last = { items: st.last.items, ...C.evaluate(st.last.items, { angle: st.angle }) };
      } catch {
        startEditing([...st.last.items]);
      }
    }
    render();
  });
  $('#cxExprWrap').addEventListener('click', (event) => {
    const exprEl = $('#cxExpr');
    if (st.done) {
      const items = [...st.last.items];
      startEditing(items, caretFromPoint(exprEl, event.clientX, event.clientY, items.length));
    } else {
      st.caret = caretFromPoint(exprEl, event.clientX, event.clientY, st.items.length);
    }
    render();
  });
  $('#cxResult').addEventListener('click', () => {
    if (shown) copyText(C.rectText(shown, 16), '答え');
  });
  $('#btnCxCheck').addEventListener('click', () => {
    if (st.done) openCheck(st.last.items, st.angle);
  });
  $('#btnCxToCalc').addEventListener('click', () => {
    if (st.done && C.isReal(st.last.value)) hooks.onUseInCalc(st.last.value.re);
  });
  window.addEventListener('resize', () => { if (hooks.active()) render(); });

  setupPad($('#cxKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: {
      Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear', ArrowLeft: 'left', ArrowRight: 'right',
      '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '(': '(', ')': ')', '.': '.', i: 'i', j: 'i', p: 'π', '@': '∠',
    },
  });
}
