// =========================================================
// 時間の計算と時給（画面とは切り離した計算だけ）
//
// ■ 時間の計算
//   式の部品 items：数字 '0'〜'9'、'.'、':'、単位 'd' 日・'h' 時間・'m' 分・'s' 秒、
//     演算子 '+' '−' '×' '÷'、'(' ')'、前の答え { ref: 数, dur: 時間か, label }
//   「1時間30分」は ['1','h','3','0','m']、「9:30」は ['9',':','3','0']（＝ 9時間30分）
//   時間（単位の付いた数）は「秒」の数で持つ。単位のない数は、ただの数（〇倍・〇回）。
//     時間 ± 時間 → 時間 / 時間 × 数 → 時間 / 時間 ÷ 数 → 時間 / 時間 ÷ 時間 → 数（〇回分）
//     時間 ± 数・時間 × 時間・数 ÷ 時間 はできない（お知らせを出す）
//   単位のあとの、単位のない数は1つ下の単位とみる（「1時間30」→ 1時間30分）
//
// ■ 時給
//   時給 × 働いた時間（始め〜終わり − 休憩、または時間をそのまま）× 日数
//   えらべば、深夜（22時〜翌5時）と残業（1日8時間をこえた分）を 25%増し（両方なら 50%増し）
//
// 数はぜんぶ num.js の正確な分数で計算するので、誤差は出ない。
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import { amountOf, toYen } from './shop.js';

export const UNIT_LABEL = { d: '日', h: '時間', m: '分', s: '秒' };
export const UNIT_SEC = { d: 86400n, h: 3600n, m: 60n, s: 1n };
const RANK = { d: 3, h: 2, m: 1, s: 0 };
const NEXT_UNIT = { d: 'h', h: 'm', m: 's' };
export const TIME_OPS = ['+', '−', '×', '÷'];
const MAX_NUMBER = 10; // 1つの数に打てる文字（数字と小数点）

export const isDigit = (t) => typeof t === 'string' && t.length === 1 && t >= '0' && t <= '9';
export const isUnit = (t) => typeof t === 'string' && Object.hasOwn(UNIT_SEC, t);
export const isAns = (t) => typeof t === 'object' && t !== null && 'ref' in t;
const isLitPart = (t) => isDigit(t) || t === '.' || t === ':' || isUnit(t);
const isNumPart = (t) => isDigit(t) || t === '.';

const fail = (message, kind = 'syntax') => new N.CalcError(message, kind);

function decimal(text) {
  if (text.split('.').length > 2) throw fail('小数点が2つあります');
  return N.parseDecimal(text);
}

// ---------------------------------------------------------
// 式を読む
// ---------------------------------------------------------

// 1つの数（数字・小数点・:・単位のかたまり）を読む
// 返す値：{ dur: 時間か, value: 秒（時間のとき）か ただの数, pieces: [{ num: '30', unit: 'm', implicit }], colon }
export function readLiteral(parts) {
  const text = parts.join('');
  if (parts.includes(':')) {
    if (parts.some(isUnit)) throw fail('「:」の形と 時間・分 などは、いっしょに使えません', 'math');
    if (parts.includes('.')) throw fail('「:」の形では、小数点は使えません', 'math');
    const list = text.split(':');
    if (list.length > 3) throw fail('「:」は2つまでです（時:分:秒）', 'math');
    const units = ['h', 'm', 's'];
    let sec = 0n;
    const pieces = list.map((p, i) => {
      const v = p ? BigInt(p) : 0n;
      if (i > 0 && v >= 60n) throw fail(`「:」の後ろの${i === 1 ? '分' : '秒'}は 59 までです`, 'math');
      sec += v * UNIT_SEC[units[i]];
      return { num: String(v), unit: units[i], implicit: false };
    });
    return { dur: true, value: N.frac(sec), pieces, colon: true };
  }
  if (!parts.some(isUnit)) return { dur: false, value: decimal(text), pieces: [], colon: false };
  let value = N.ZERO;
  let num = '';
  let lastUnit = null;
  const pieces = [];
  const addPiece = (unit, implicit) => {
    value = N.add(value, N.mul(decimal(num), N.frac(UNIT_SEC[unit])));
    pieces.push({ num, unit, implicit });
    lastUnit = unit;
    num = '';
  };
  for (const t of parts) {
    if (!isUnit(t)) { num += t; continue; }
    if (!num) throw fail('単位の前に数を打ってください');
    if (lastUnit && RANK[t] >= RANK[lastUnit]) throw fail('単位は 日→時間→分→秒 の順に、1回ずつ使えます', 'math');
    addPiece(t, false);
  }
  if (num) {
    const implicit = NEXT_UNIT[lastUnit];
    if (!implicit) throw fail('秒の後ろの数には、単位がありません', 'math');
    addPiece(implicit, true);
  }
  return { dur: true, value, pieces, colon: false };
}

// 部品の並び → 記号の並び
//   { type: 'lit', dur, value, at, end, pieces, ans } / { type: 'op', op } / { type: 'lp' } / { type: 'rp' }
export function lexTime(items) {
  const tokens = [];
  for (let i = 0; i < items.length;) {
    const t = items[i];
    if (isAns(t)) {
      tokens.push({ type: 'lit', dur: !!t.dur, value: t.ref, at: i, end: i + 1, pieces: [], ans: t });
      i++;
      continue;
    }
    if (isLitPart(t)) {
      let j = i;
      while (j < items.length && isLitPart(items[j])) j++;
      tokens.push({ type: 'lit', ...readLiteral(items.slice(i, j)), at: i, end: j });
      i = j;
      continue;
    }
    if (TIME_OPS.includes(t)) tokens.push({ type: 'op', op: t, at: i });
    else if (t === '(') tokens.push({ type: 'lp', at: i });
    else if (t === ')') tokens.push({ type: 'rp', at: i });
    else throw fail('読めない部品があります');
    i++;
  }
  return tokens;
}

function parseTime(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (...ops) => peek()?.type === 'op' && ops.includes(peek().op);
  function expr() {
    let node = term();
    while (isOp('+', '−')) {
      const op = tokens[pos++].op;
      node = { type: 'bin', op, a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    while (isOp('×', '÷')) {
      const op = tokens[pos++].op;
      node = { type: 'bin', op, a: node, b: unary() };
    }
    return node;
  }
  function unary() {
    if (isOp('−')) {
      pos++;
      return { type: 'neg', a: unary() };
    }
    return primary();
  }
  function primary() {
    const t = peek();
    if (!t) throw fail('式が途中です', 'incomplete');
    if (t.type === 'lit') {
      pos++;
      return { type: 'lit', tok: t };
    }
    if (t.type === 'lp') {
      pos++;
      const node = expr();
      if (peek()?.type !== 'rp') throw fail('( と ) の数が合いません');
      pos++;
      return node;
    }
    throw fail('式の形がちがいます');
  }
  const tree = expr();
  if (pos < tokens.length) throw fail('式の形がちがいます（数が続いているなど）');
  return tree;
}

// 2つの値の計算。値は { dur: 時間か, v: 数（時間なら秒）}
export function combine(op, a, b) {
  switch (op) {
    case '+':
    case '−':
      if (a.dur !== b.dur) throw fail('＋ − は時間どうしでします（数に「分」などを付けてください）', 'math');
      return { dur: a.dur, v: op === '+' ? N.add(a.v, b.v) : N.sub(a.v, b.v) };
    case '×':
      if (a.dur && b.dur) throw fail('時間 × 時間 はできません（片方を ただの数 にしてください）', 'math');
      return { dur: a.dur || b.dur, v: N.mul(a.v, b.v) };
    case '÷':
      if (!a.dur && b.dur) throw fail('数 ÷ 時間 はできません', 'math');
      return { dur: a.dur && !b.dur, v: N.div(a.v, b.v) };
    default:
      throw fail('読めない計算です');
  }
}

function evalNode(node, steps) {
  if (node.type === 'lit') return { dur: node.tok.dur, v: node.tok.value };
  if (node.type === 'neg') {
    const a = evalNode(node.a, steps);
    return { dur: a.dur, v: N.neg(a.v) };
  }
  const a = evalNode(node.a, steps);
  const b = evalNode(node.b, steps);
  const r = combine(node.op, a, b);
  steps.push({ op: node.op, a, b, r });
  return r;
}

export function openParens(items, upto = items.length) {
  let depth = 0;
  for (let i = 0; i < upto; i++) {
    if (items[i] === '(') depth++;
    else if (items[i] === ')') depth = Math.max(0, depth - 1);
  }
  return depth;
}

export function closeParens(items) {
  return [...items, ...Array(openParens(items)).fill(')')];
}

// 式を計算する（＝ を押したとき）。閉じていない ( は最後に閉じる。
// 返す値：{ value, dur, steps, literals }。計算できなければ CalcError を投げる
export function evaluateTime(items) {
  const tokens = lexTime(items);
  for (let k = openParens(items); k > 0; k--) tokens.push({ type: 'rp' });
  if (!tokens.length) throw fail('式がありません', 'incomplete');
  const steps = [];
  const r = evalNode(parseTime(tokens), steps);
  return { value: r.v, dur: r.dur, steps, literals: tokens.filter((t) => t.type === 'lit') };
}

// 打っている途中の答え（最後の演算子などは無視する）
//   { value, dur, single } … 答え（single は数を1つ打っただけ）
//   { error } … 計算そのものができない / null … 出すものがない
export function previewTime(items) {
  let tokens;
  try {
    tokens = lexTime(items);
  } catch (error) {
    if (error instanceof N.CalcError && error.kind === 'math') return { error: error.message };
    return null;
  }
  while (tokens.length && ['op', 'lp'].includes(tokens[tokens.length - 1].type)) tokens.pop();
  if (!tokens.length) return null;
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'lp') depth++;
    else if (t.type === 'rp') depth--;
  }
  for (; depth > 0; depth--) tokens.push({ type: 'rp' });
  try {
    const r = evalNode(parseTime(tokens), []);
    return { value: r.v, dur: r.dur, single: tokens.length === 1 };
  } catch (error) {
    if (error instanceof N.CalcError && error.kind === 'math') return { error: error.message };
    if (error instanceof N.CalcError) return null;
    throw error;
  }
}

// ---------------------------------------------------------
// キーを押したときの式の変え方（keys.js の時間版）
// state = { items, caret }。押せないキーなら null
// ---------------------------------------------------------
function runAround(items, caret, test) {
  let start = caret;
  while (start > 0 && test(items[start - 1])) start--;
  let end = caret;
  while (end < items.length && test(items[end])) end++;
  return { start, end, list: items.slice(start, end) };
}

function insert(state, parts) {
  const items = [...state.items];
  items.splice(state.caret, 0, ...parts);
  return { items, caret: state.caret + parts.length };
}

function replaceBefore(state, n, parts) {
  const items = [...state.items];
  items.splice(state.caret - n, n, ...parts);
  return { items, caret: state.caret - n + parts.length };
}

// 単位が 日→時間→分→秒 の順に1回ずつか（caret のまわりの数）
function unitsInOrder(items, caret) {
  const units = runAround(items, caret, isLitPart).list.filter(isUnit);
  return units.every((u, i) => i === 0 || RANK[u] < RANK[units[i - 1]]);
}

const endsValue = (t) => isNumPart(t) || isUnit(t) || t === ')' || isAns(t);

export function pressTime(state, key) {
  const { items, caret } = state;
  const prev = items[caret - 1];
  const prev2 = items[caret - 2];
  const next = items[caret];

  if (isDigit(key)) {
    if (prev === ')' || isAns(prev) || isAns(next) || next === '(') return null;
    if (runAround(items, caret, isNumPart).list.length >= MAX_NUMBER) return null;
    // 「:」の後ろ（分・秒）は2桁まで
    const lit = runAround(items, caret, isLitPart);
    if (lit.list.includes(':')) {
      const piece = runAround(items, caret, isDigit);
      if (piece.start > lit.start && items[piece.start - 1] === ':' && piece.list.length >= 2) return null;
    }
    return insert(state, [key]);
  }

  switch (key) {
    case '.': {
      if (prev === ')' || isAns(prev) || isAns(next)) return null;
      if (runAround(items, caret, isLitPart).list.includes(':')) return null;
      const num = runAround(items, caret, isNumPart).list;
      if (num.includes('.') || num.length >= MAX_NUMBER) return null;
      return insert(state, isDigit(prev) ? ['.'] : ['0', '.']);
    }
    case ':': {
      if (!isDigit(prev)) return null;
      const lit = runAround(items, caret, isLitPart).list;
      if (lit.some(isUnit) || lit.includes('.')) return null;
      if (lit.filter((t) => t === ':').length >= 2) return null;
      return insert(state, [':']);
    }
    case 'd':
    case 'h':
    case 'm':
    case 's': {
      // 単位を押した直後に別の単位 → 置きかえ
      if (isUnit(prev) && isNumPart(prev2)) {
        const changed = replaceBefore(state, 1, [key]);
        return unitsInOrder(changed.items, changed.caret) ? changed : null;
      }
      if (!isNumPart(prev)) return null;
      if (runAround(items, caret, isLitPart).list.includes(':')) return null;
      const added = insert(state, [key]);
      return unitsInOrder(added.items, added.caret) ? added : null;
    }
    case '+':
    case '×':
    case '÷': {
      if (caret === 0 || prev === '(') return null;
      if (TIME_OPS.includes(prev)) {
        const n = prev === '−' && TIME_OPS.includes(prev2) ? 2 : 1;
        if (caret - n === 0 || items[caret - n - 1] === '(') return null;
        return replaceBefore(state, n, [key]);
      }
      return insert(state, [key]);
    }
    case '−':
      if (prev === '+' || prev === '−') return replaceBefore(state, 1, ['−']);
      return insert(state, ['−']);
    case '(':
      if (endsValue(prev)) return null; // 「2(…)」のような × の省略はしない
      return insert(state, ['(']);
    case ')':
      if (openParens(items, caret) === 0 || !endsValue(prev)) return null;
      return insert(state, [')']);
    case 'back':
      return caret > 0 ? replaceBefore(state, 1, []) : null;
    case 'left':
      return caret > 0 ? { items, caret: caret - 1 } : null;
    case 'right':
      return caret < items.length ? { items, caret: caret + 1 } : null;
    case 'clear':
      return items.length ? { items: [], caret: 0 } : null;
    default:
      return null;
  }
}

// 単位を省いた数の後ろに出す、うすい単位（位置 → 単位）
export function implicitUnits(items) {
  const out = new Map();
  for (let i = 0; i < items.length;) {
    if (!isLitPart(items[i])) { i++; continue; }
    let j = i;
    while (j < items.length && isLitPart(items[j])) j++;
    const parts = items.slice(i, j);
    const units = parts.filter(isUnit);
    if (units.length && !parts.includes(':') && isNumPart(parts[parts.length - 1])) {
      const u = NEXT_UNIT[units[units.length - 1]];
      if (u) out.set(j - 1, u);
    }
    i = j;
  }
  return out;
}

// ---------------------------------------------------------
// 時間を文字にする
// ---------------------------------------------------------

// 小数点の下 dec 桁までの文字（割り切れなければ四捨五入して rounded）
export function decimalText(x, dec = 4) {
  if (!x.q) {
    const f = F.compact(x, 10);
    return { text: f.text, rounded: f.rounded };
  }
  const neg = x.n < 0n;
  const scale = 10n ** BigInt(dec);
  const scaled = (neg ? -x.n : x.n) * scale;
  let q = scaled / x.d;
  const r = scaled % x.d;
  if (r * 2n >= x.d) q += 1n;
  const int = F.groupInt((q / scale).toString());
  const frac = dec ? (q % scale).toString().padStart(dec, '0').replace(/0+$/, '') : '';
  return { text: `${neg && q !== 0n ? '−' : ''}${int}${frac ? `.${frac}` : ''}`, rounded: r !== 0n };
}
const dt = (x, dec) => {
  const f = decimalText(x, dec);
  return f.rounded ? `${f.text}…` : f.text;
};

// 秒 → { neg, d, h, m, s }（d は days のときだけ。s は小数もある）
export function splitDuration(sec, { days = false } = {}) {
  const a = N.absNum(sec);
  if (!a.q) return null;
  const whole = a.n / a.d;
  const rest = N.sub(a, N.frac(whole));
  let t = whole;
  const out = { neg: N.sign(sec) < 0, d: 0n, h: 0n, m: 0n, s: N.ZERO };
  if (days) {
    out.d = t / 86400n;
    t %= 86400n;
  }
  out.h = t / 3600n;
  t %= 3600n;
  out.m = t / 60n;
  out.s = N.add(N.frac(t % 60n), rest);
  return out;
}

// 「2時間15分」（大きい単位から小さい単位まで、間の 0 も出す）。days なら「1日2時間15分」
export function durText(sec, { days = false } = {}) {
  const p = splitDuration(sec, { days });
  if (!p) return `${F.amountText(sec)}秒`;
  const list = [
    [p.d, '日'], [p.h, '時間'], [p.m, '分'],
  ].map(([v, u]) => ({ zero: v === 0n, text: `${F.groupInt(v.toString())}${u}` }));
  list.push({ zero: N.isZero(p.s), text: `${dt(p.s, 3)}秒` });
  const first = list.findIndex((x) => !x.zero);
  if (first < 0) return '0分';
  let last = list.length - 1;
  while (list[last].zero) last--;
  return (p.neg ? '−' : '') + list.slice(first, last + 1).map((x) => x.text).join('');
}

// 「2:15」「2:15:30」（時:分:秒）
export function clockText(sec) {
  const p = splitDuration(sec);
  if (!p) return '';
  const two = (v) => v.toString().padStart(2, '0');
  let text = `${F.groupInt(p.h.toString())}:${two(p.m)}`;
  if (!N.isZero(p.s)) {
    const s = decimalText(p.s, 3);
    text += `:${s.text.split('.')[0].padStart(2, '0')}${s.text.includes('.') ? `.${s.text.split('.')[1]}` : ''}${s.rounded ? '…' : ''}`;
  }
  return (p.neg ? '−' : '') + text;
}

export const hoursText = (sec) => `${dt(N.div(sec, N.frac(3600n)), 4)}時間`;
export const minutesText = (sec) => `${dt(N.div(sec, N.frac(60n)), 3)}分`;
export const secondsText = (sec) => `${dt(sec, 3)}秒`;
export const scalarText = (x) => dt(x, 6);

// 時間を「時間の数」に（2時間15分 → 2.25）。電卓で使うとき
export const toHours = (sec) => N.div(sec, N.frac(3600n));

// ---------------------------------------------------------
// 電卓の式にする（履歴に残す・電卓で使う）
//   時間は「時間の数」の部品（名前は 1時間30分 など）、ただの数は数字のまま
// ---------------------------------------------------------
export function literalText(tok) {
  if (tok.ans) return tok.ans.label;
  if (tok.colon) return clockText(tok.value);
  return tok.pieces.map((p) => `${F.groupNumberText(p.num)}${UNIT_LABEL[p.unit]}`).join('');
}

export function toCalcItems(items) {
  const out = [];
  for (const t of lexTime(closeParens(items))) {
    if (t.type === 'lit') {
      if (t.dur) out.push({ ref: toHours(t.value), label: literalText(t) });
      else if (t.ans) out.push({ ref: t.value, label: t.ans.label });
      else out.push(...items.slice(t.at, t.end));
    } else if (t.type === 'op') out.push(t.op);
    else out.push(t.type === 'lp' ? '(' : ')');
  }
  return out;
}

// ---------------------------------------------------------
// 時給
// ---------------------------------------------------------
export const HOW = { clock: '時刻で', hours: '時間で' };
export const DEFAULT_WAGE_OPTS = { night: false, over: false, mode: 'round' };
const NIGHT_FROM = 22 * 60;
const NIGHT_TO = 29 * 60; // 次の日の 5:00
const DAY = 24 * 60;
const LEGAL = 8 * 60;     // 1日8時間
const RATE = { day: N.ONE, night: N.frac(5n, 4n), over: N.frac(5n, 4n), both: N.frac(3n, 2n) };
export const ROW_LABEL = { day: 'ふつう', night: '深夜', over: '残業', both: '深夜の残業' };

// 時刻の文字 → { min: 0:00 からの分 } か { error }（空なら { min: null }）
//   '9' → 9:00、'930' → 9:30、'1730' → 17:30、'9:30' → 9:30、'26:00' → 次の日の 2:00
export function clockMinutes(text) {
  if (!text) return { min: null };
  let h;
  let m;
  if (text.includes(':')) {
    const [a, b = ''] = text.split(':');
    if (!/^\d{1,2}$/.test(a) || !/^\d{0,2}$/.test(b)) return { error: '時刻の形がちがいます' };
    h = Number(a);
    m = b ? Number(b) : 0;
  } else {
    if (!/^\d{1,4}$/.test(text)) return { error: '時刻の形がちがいます' };
    h = Number(text.length <= 2 ? text : text.slice(0, -2));
    m = text.length <= 2 ? 0 : Number(text.slice(-2));
  }
  if (m >= 60) return { error: '分は 59 までです（9:30 なら「930」か「9:30」）' };
  if (h > 47) return { error: '時は 47 までです' };
  return { min: h * 60 + m };
}

// 分 → 「9:30」（24時をこえたら「翌2:00」）
export function clockLabel(min, { next = true } = {}) {
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, '0');
  if (next && h >= 24) return `翌${h - 24}:${m}`;
  return `${h}:${m}`;
}

// 働いた時間の文字 → 分（'7:30' → 450、'7.5' → 450、'7' → 420）。打ちかけ・おかしいときは { error }
export function hoursMinutes(text) {
  if (!text) return { min: null };
  if (text.includes(':')) {
    const [a, b = ''] = text.split(':');
    if (!/^\d{0,3}$/.test(a) || !/^\d{0,2}$/.test(b)) return { error: '時間の形がちがいます' };
    const m = b ? Number(b) : 0;
    if (m >= 60) return { error: '分は 59 までです（7時間30分 なら「7:30」か「7.5」）' };
    return { min: N.frac(BigInt((Number(a || 0) * 60) + m)) };
  }
  return { min: N.mul(decimal(text), N.frac(60n)) };
}

// [a, b) の中の深夜（22時〜翌5時）の分
export function nightMinutes(a, b) {
  let total = 0;
  for (let k = -1; k <= 2; k++) {
    const from = Math.max(a, NIGHT_FROM + DAY * k);
    const to = Math.min(b, NIGHT_TO + DAY * k);
    if (to > from) total += to - from;
  }
  return total;
}

// 時給の計算
//   input = { wage, how: 'clock' | 'hours', start, end, rest, hours, days }（どれも打った文字）
//   opts = { night, over, mode }（mode は 1円未満の端数：shop.js の 'floor' 'round' 'ceil'）
// 返す値：{
//   ok, error, wage, how, start, end（分。夜勤なら 24時をこえる）, overnight, span, rest,
//   worked: 働いた分, rows: [{ key, label, min, rate, amount }], perDay, days, exact, pay,
//   weighted: 割増を時間に直した合計（時間）, restFromNight: 深夜から引いた休憩（分）,
// }
export function wageOf(input, opts = {}) {
  const o = { ...DEFAULT_WAGE_OPTS, ...opts };
  const result = { ok: false, how: input.how === 'hours' ? 'hours' : 'clock', opts: o, rows: [], restFromNight: 0 };
  const bad = (error) => Object.assign(result, { error });
  const W = amountOf(input.wage ?? '');
  result.wage = W;
  result.days = input.days ? amountOf(input.days) : N.ONE;

  let parts; // 分ごとの区分 { day, night, over, both }（分の数）
  if (result.how === 'clock') {
    const s = clockMinutes(input.start);
    const e = clockMinutes(input.end);
    if (s.error || e.error) return bad(s.error ?? e.error);
    if (s.min === null || e.min === null) return bad('始めと終わりの時刻を打ってください');
    let end = e.min;
    if (end === s.min) return bad('始めと終わりが同じ時刻です');
    result.overnight = end < s.min;
    if (result.overnight) end += DAY;
    const span = end - s.min;
    const rest = input.rest ? Number(input.rest) : 0;
    if (!Number.isFinite(rest) || rest < 0) return bad('休憩の形がちがいます');
    if (rest >= span) return bad('休憩が、始めから終わりまでの時間より長くなっています');
    Object.assign(result, { start: s.min, end, span, rest });
    const worked = span - rest;
    const ot = o.over ? Math.max(0, worked - LEGAL) : 0;
    // 残業は最後の ot 分。休憩は、残業より前の、深夜でない時間にとったとみる
    const headEnd = end - ot;
    const nightHead = o.night ? nightMinutes(s.min, headEnd) : 0;
    const nightTail = o.night ? nightMinutes(headEnd, end) : 0;
    const dayHead = headEnd - s.min - nightHead;
    const fromDay = Math.min(rest, dayHead);
    result.restFromNight = rest - fromDay;
    parts = {
      day: dayHead - fromDay,
      night: nightHead - result.restFromNight,
      over: ot - nightTail,
      both: nightTail,
    };
    for (const k of Object.keys(parts)) parts[k] = N.frac(BigInt(parts[k]));
  } else {
    const h = hoursMinutes(input.hours);
    if (h.error) return bad(h.error);
    if (h.min === null || N.isZero(h.min)) return bad('働いた時間を打ってください');
    const legal = N.frac(BigInt(LEGAL));
    const ot = o.over && N.cmp(h.min, legal) > 0 ? N.sub(h.min, legal) : N.ZERO;
    parts = { day: N.sub(h.min, ot), night: N.ZERO, over: ot, both: N.ZERO };
  }

  result.worked = Object.values(parts).reduce((a, b) => N.add(a, b), N.ZERO);
  const per60 = (min) => N.div(min, N.frac(60n));
  result.rows = Object.entries(parts)
    .filter(([, min]) => N.sign(min) > 0)
    .map(([key, min]) => ({
      key, label: ROW_LABEL[key], min, rate: RATE[key],
      amount: N.mul(N.mul(W, RATE[key]), per60(min)),
    }));
  result.weighted = result.rows.reduce((a, r) => N.add(a, N.mul(r.rate, per60(r.min))), N.ZERO);

  if (N.isZero(W)) return bad('時給を打ってください');
  if (N.isZero(result.days)) return bad('日数を打ってください（空なら 1日）');
  result.perDay = result.rows.reduce((a, r) => N.add(a, r.amount), N.ZERO);
  result.exact = N.mul(result.perDay, result.days);
  result.pay = toYen(result.exact, o.mode);
  result.ok = true;
  return result;
}

// 給料を電卓の式に（履歴に残す）：時給 ×（ふつうの時間 ＋ 1.25 × 深夜の時間 …）× 日数
export function wageCalcItems(r) {
  const digits = (x) => [...F.amountText(x).replace(/,/g, '')];
  const ref = (min, label) => ({ ref: N.div(min, N.frac(60n)), label });
  const items = [...digits(r.wage), '×'];
  if (r.rows.length === 1 && N.cmp(r.rows[0].rate, N.ONE) === 0) {
    items.push(ref(r.rows[0].min, durText(N.mul(r.rows[0].min, N.frac(60n)))));
  } else {
    items.push('(');
    r.rows.forEach((row, i) => {
      if (i > 0) items.push('+');
      if (N.cmp(row.rate, N.ONE) !== 0) items.push(...digits(row.rate), '×');
      items.push(ref(row.min, `${row.label} ${durText(N.mul(row.min, N.frac(60n)))}`));
    });
    items.push(')');
  }
  if (N.cmp(r.days, N.ONE) !== 0) items.push('×', ...digits(r.days));
  return items;
}

// 時刻・時間の欄の打ち方（form.js の typeKey の時刻版）。打てないときは null
//   時刻（maxHead 2）：「930」「1730」（4桁まで）か「9:30」（: の前後は2桁まで）
//   時間（maxHead 3, decimals）：「7:30」か「7.5」（小数点の下は2桁まで）
export function typeClock(text, key, { fresh = false, maxHead = 2, decimals = false } = {}) {
  if (key === 'back') return text ? text.slice(0, -1) : null;
  if (key === 'clear') return text ? '' : null;
  if (fresh) text = '';
  const o = { maxHead, decimals };
  if (key === '00') {
    const once = typeClock(text, '0', o);
    return once === null ? null : typeClock(once, '0', o);
  }
  if (key === ':') {
    if (!/^\d+$/.test(text) || text.length > maxHead) return null;
    return `${text}:`;
  }
  if (key === '.') {
    if (!decimals || /[:.]/.test(text)) return null;
    return `${text || '0'}.`;
  }
  if (!/^[0-9]$/.test(key)) return null;
  const next = text + key;
  const mark = next.includes(':') ? ':' : next.includes('.') ? '.' : null;
  if (mark) return next.split(mark)[1].length > 2 ? null : next;
  return next.length > (decimals ? maxHead : maxHead + 2) ? null : next;
}
