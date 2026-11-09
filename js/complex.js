// =========================================================
// 複素数の計算（画面とは切り離した計算だけ）
//
// ■ 数 z ＝ { re, im }（re ＋ im·i。re・im は num.js の数）
//   ＋ − × ÷ と整数乗は正確（分数のまま）。√ は「2乗した数」なら正確（√(3＋4i) ＝ 2＋i）
// ■ 式の部品 items
//   数字 '0'〜'9' '.'、'i'、'π'、演算子 '+' '−' '×' '÷' '^' '∠'、'(' ')'、
//   関数 '√(' 'abs(' 'arg(' 'conj(' 'Re(' 'Im(' 'e^(' 'ln('（「(」もかねる）、前の答え { ref: z, label }
// ■ 計算の順番（強い順）
//   ( ) と関数 → ^（右から）→ かけ算の省略（4i、2(1＋i)）→ マイナス → × ÷ → ∠ → ＋ −
//   かけ算の省略は × ÷ より先（1÷2i ＝ 1÷(2i)。画面に注意書きを出す）
//   r∠θ ＝ r(cos θ ＋ i sin θ)（長さ r、角度 θ。角度は「度」か「rad」）。2∠π/2 ＝ 2∠(π/2)
//   （∠ の形どうしをかけるときは ( ) で：(2∠30)(3∠60)）
// ■ √・ln・分数乗は「主値」（角度が −180° より大きく 180° までのもの）を出す
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';
import * as F from './format.js';

const { ZERO, ONE, CalcError } = N;
export const FN_TOKENS = ['√(', 'abs(', 'arg(', 'conj(', 'Re(', 'Im(', 'e^(', 'ln('];
export const BIN_OPS = ['+', '−', '×', '÷', '^', '∠'];
export const FN_NAME = {
  '√(': '√', 'abs(': 'abs', 'arg(': 'arg', 'conj(': 'conj', 'Re(': 'Re', 'Im(': 'Im', 'e^(': 'e^', 'ln(': 'ln',
};
const MAX_INT_POW = 100000n; // これより大きい整数乗は、極形式（e^(n·ln z)）で
const MAX_NUMBER = 20;       // 1つの数に打てる文字

export const cx = (re, im = ZERO) => ({ re, im });
export const C_ZERO = cx(ZERO);
export const C_ONE = cx(ONE);
export const C_I = cx(ZERO, ONE);

export const isDigit = (t) => typeof t === 'string' && t.length === 1 && t >= '0' && t <= '9';
export const isAns = (t) => typeof t === 'object' && t !== null && 'ref' in t;
export const isFn = (t) => FN_TOKENS.includes(t);
export const isBinOp = (t) => BIN_OPS.includes(t);
const isOpen = (t) => t === '(' || isFn(t);
const isValueEnd = (t) => isDigit(t) || t === '.' || t === 'i' || t === 'π' || t === ')' || isAns(t);

const fail = (message, kind = 'math') => new CalcError(message, kind);
const half = N.frac(1n, 2n);
const two = N.frac(2n);

// ---------------------------------------------------------
// 複素数の計算
// ---------------------------------------------------------
export const isReal = (z) => N.isZero(z.im);
export const isZero = (z) => N.isZero(z.re) && N.isZero(z.im);
const lg = (x) => (N.isZero(x) ? -Infinity : N.approxLog10(N.absNum(x)));

// 概数の計算で残った、とても小さい（もう片方より 60 桁以上小さい）部分は 0 に
function tidy(z) {
  const small = (x, y) => !x.q && !N.isZero(x) && !N.isZero(y) && lg(x) < lg(y) - 60;
  if (small(z.re, z.im)) return cx(ZERO, z.im);
  if (small(z.im, z.re)) return cx(z.re, ZERO);
  return z;
}

export const add = (a, b) => tidy(cx(N.add(a.re, b.re), N.add(a.im, b.im)));
export const sub = (a, b) => tidy(cx(N.sub(a.re, b.re), N.sub(a.im, b.im)));
export const neg = (a) => cx(N.neg(a.re), N.neg(a.im));
export const conj = (a) => cx(a.re, N.neg(a.im));
export const scale = (a, k) => cx(N.mul(a.re, k), N.mul(a.im, k));
// |z|²（a² ＋ b²）
export const norm = (a) => N.add(N.mul(a.re, a.re), N.mul(a.im, a.im));

export function mul(a, b) {
  if (isReal(b)) return scale(a, b.re);
  if (isReal(a)) return scale(b, a.re);
  return tidy(cx(N.sub(N.mul(a.re, b.re), N.mul(a.im, b.im)), N.add(N.mul(a.re, b.im), N.mul(a.im, b.re))));
}

export function div(a, b) {
  if (isZero(b)) throw fail('0 では割れません');
  if (isReal(b)) return cx(N.div(a.re, b.re), N.div(a.im, b.re));
  // 上と下に、割る数の共役をかける：(a)(b̄) ÷ |b|²
  const d = norm(b);
  const t = mul(a, conj(b));
  return tidy(cx(N.div(t.re, d), N.div(t.im, d)));
}

// 長さ |z|
export function abs(z) {
  if (N.isZero(z.im)) return N.absNum(z.re);
  if (N.isZero(z.re)) return N.absNum(z.im);
  return N.sqrt(norm(z));
}

// 角度（回転の割合。1 ＝ 1回転。−1/2 より大きく 1/2 まで）。0 の角度は 0 とする
export function argTurn(z) {
  const { re, im } = z;
  if (N.isZero(im)) return N.sign(re) >= 0 ? ZERO : half;
  if (N.isZero(re)) return N.frac(BigInt(N.sign(im)), 4n);
  const t = N.div(S.atan(N.div(im, re), 'deg'), N.frac(360n));
  return N.sign(re) > 0 ? t : N.add(t, N.frac(BigInt(N.sign(im)), 2n));
}

export const argOf = (z, angle) => S.fromTurn(argTurn(z), angle);

// cos と sin（回転の割合で。30° ごと・45° ごとなどはちょうどの値）
export function cosSinTurn(t) {
  const deg = N.mul(t, N.frac(360n));
  return { cos: S.cos(deg, 'deg'), sin: S.sin(deg, 'deg') };
}

// 長さ r・角度 t（回転の割合）の数
export function fromPolar(r, t) {
  const { cos, sin } = cosSinTurn(t);
  return tidy(cx(N.mul(r, cos), N.mul(r, sin)));
}

export function sqrt(z) {
  if (N.isZero(z.im)) {
    return N.sign(z.re) >= 0 ? cx(N.sqrt(z.re)) : cx(ZERO, N.sqrt(N.neg(z.re)));
  }
  // √z ＝ x ＋ yi：大きいほうを √((|z| ± a)/2) で出して、もう片方は b ÷ 2(その数)（打ち消しで桁が落ちない）
  const r = abs(z);
  if (N.sign(z.re) >= 0) {
    const x = N.sqrt(N.div(N.add(r, z.re), two));
    return tidy(cx(x, N.div(z.im, N.mul(two, x))));
  }
  let y = N.sqrt(N.div(N.sub(r, z.re), two));
  if (N.sign(z.im) < 0) y = N.neg(y);
  return tidy(cx(N.div(z.im, N.mul(two, y)), y));
}

export function exp(z) {
  const m = N.exp(z.re);
  if (N.isZero(z.im)) return cx(m);
  return fromPolar(m, S.toTurn(z.im, 'rad'));
}

export function ln(z) {
  if (isZero(z)) throw fail('0 の ln はありません（限りなく小さくなります）');
  if (N.isZero(z.im) && N.sign(z.re) > 0) return cx(N.ln(z.re));
  const n2 = norm(z);
  const re = N.isZero(N.sub(n2, ONE)) ? ZERO : N.div(N.ln(n2), two);
  return cx(re, S.fromTurn(argTurn(z), 'rad'));
}

function powInt(a, n) {
  if (n === 0n) return C_ONE;
  if (isZero(a)) {
    if (n < 0n) throw fail('0 で割ることになるので、計算できません');
    return C_ZERO;
  }
  let e = n < 0n ? -n : n;
  let base = a;
  let r = C_ONE;
  for (;;) {
    if (e & 1n) r = mul(r, base);
    e >>= 1n;
    if (!e) break;
    base = mul(base, base);
  }
  return n < 0n ? div(C_ONE, r) : r;
}

export const isIntPow = (b) => isReal(b) && b.re.q && b.re.d === 1n && (b.re.n < 0n ? -b.re.n : b.re.n) <= MAX_INT_POW;

export function pow(a, b) {
  if (isIntPow(b)) return powInt(a, b.re.n);
  if (isZero(a)) {
    if (N.sign(b.re) > 0) return C_ZERO;
    throw fail('0 の、この累乗は計算できません');
  }
  if (isReal(b) && b.re.q && b.re.n === 1n && b.re.d === 2n) return sqrt(a);
  // 正の数の実数乗は、電卓と同じ（正確になるものは正確に）
  if (isReal(a) && isReal(b) && N.sign(a.re) > 0) return cx(N.pow(a.re, b.re));
  // 実数乗：長さを b 乗、角度を b 倍（主値）。長さは |a|² から出す
  //   (−8)^(1/3) ＝ 2(cos 60° ＋ i sin 60°) ＝ 1 ＋ √3 i（ちょうど）
  if (isReal(b)) return fromPolar(N.pow(norm(a), N.div(b.re, two)), N.mul(argTurn(a), b.re));
  return exp(mul(b, ln(a)));
}

// 2つの数がほぼ同じか（ちがいが、大きさより 40 桁以上小さい）。検算で使う
export function near(a, b, digits = 40) {
  const d = sub(a, b);
  if (isZero(d)) return true;
  const mag = (z) => Math.max(lg(z.re), lg(z.im));
  return mag(d) < Math.max(0, mag(a), mag(b)) - digits;
}

// ---------------------------------------------------------
// 式を読んで計算する
// ---------------------------------------------------------

// 部品 → かたまり
export function lex(items) {
  const out = [];
  for (let i = 0; i < items.length;) {
    const t = items[i];
    if (isDigit(t) || t === '.') {
      let end = i;
      let text = '';
      while (end < items.length && (isDigit(items[end]) || items[end] === '.')) text += items[end++];
      if (text.split('.').length > 2) throw fail('小数点が2つあります', 'syntax');
      out.push({ type: 'num', value: cx(N.parseDecimal(text)), kind: 'real', text, at: i });
      i = end;
      continue;
    }
    if (t === 'i') out.push({ type: 'num', value: C_I, kind: 'imag', text: 'i', at: i });
    else if (t === 'π') out.push({ type: 'num', value: cx(S.PI), kind: 'real', text: 'π', at: i });
    else if (isAns(t)) out.push({ type: 'num', value: t.ref, kind: 'ans', text: t.label, at: i });
    else if (isBinOp(t)) out.push({ type: 'op', op: t, at: i });
    else if (isFn(t)) out.push({ type: 'fn', fn: t, at: i });
    else if (t === '(') out.push({ type: 'lp', at: i });
    else if (t === ')') out.push({ type: 'rp', at: i });
    else throw fail('読めない部品があります', 'syntax');
    i++;
  }
  return out;
}

const startsValue = (t) => t && (t.type === 'num' || t.type === 'lp' || t.type === 'fn');

// 関数を計算する
function applyFn(fn, a, angle) {
  switch (fn) {
    case '√(': return sqrt(a);
    case 'abs(': return cx(abs(a));
    case 'arg(':
      if (isZero(a)) throw fail('0 の角度（arg）は決まりません');
      return cx(argOf(a, angle));
    case 'conj(': return conj(a);
    case 'Re(': return cx(a.re);
    case 'Im(': return cx(a.im);
    case 'e^(': return exp(a);
    default: return ln(a);
  }
}

// 式を計算する
// 返す値：{ value, steps, notes, points }
//   steps … 計算した順番 [{ op, a, b, r, aFrom, bFrom, implicit }]（関数とマイナスは b なし。op は '√(' など）
//   notes … 注意書きの種類 [{ kind, … }]
export function evaluate(items, { angle = 'deg' } = {}) {
  const tokens = lex(items);
  if (!tokens.length) throw fail('式がありません', 'incomplete');
  const steps = [];
  const noteSet = new Map();
  const note = (kind, extra = {}) => { if (!noteSet.has(kind)) noteSet.set(kind, { kind, ...extra }); };
  let pos = 0;
  const peekOp = (...ops) => tokens[pos]?.type === 'op' && ops.includes(tokens[pos].op);
  const push = (step) => {
    steps.push(step);
    return { v: step.r, from: steps.length - 1, kind: 'calc' };
  };
  const isLit = (x) => x.kind === 'real' || x.kind === 'imag';

  function binary(op, a, b, implicit = false) {
    // 3 ＋ 4i や 4i・2π のような「1つの数を書いているだけ」の所は、計算の順番に入れない
    if (implicit && isLit(a) && isLit(b) && !(a.kind === 'imag' && b.kind === 'imag')) {
      return { v: mul(a.v, b.v), from: null, kind: a.kind === 'imag' || b.kind === 'imag' ? 'imag' : 'real' };
    }
    if ((op === '+' || op === '−') && isLit(a) && isLit(b) && a.kind !== b.kind) {
      return { v: op === '+' ? add(a.v, b.v) : sub(a.v, b.v), from: null, kind: 'complex' };
    }
    let r;
    switch (op) {
      case '+': r = add(a.v, b.v); break;
      case '−': r = sub(a.v, b.v); break;
      case '×': r = mul(a.v, b.v); break;
      case '÷': r = div(a.v, b.v); break;
      case '^':
        if (!isIntPow(b.v) && !(isReal(a.v) && N.sign(a.v.re) > 0 && isReal(b.v))) {
          note('principal');
          if (isReal(a.v) && N.sign(a.v.re) < 0 && isReal(b.v)) note('negPow');
        }
        r = pow(a.v, b.v);
        break;
      default: // '∠'
        if (!isReal(a.v) || !isReal(b.v)) throw fail('∠ の長さと角度は、ふつうの数（実数）で打ってください');
        note('polar');
        r = fromPolar(a.v.re, S.toTurn(b.v.re, angle));
    }
    return push({ op, a: a.v, b: b.v, r, aFrom: a.from, bFrom: b.from, implicit });
  }

  function primary() {
    const t = tokens[pos];
    if (!t) throw fail('式が途中です', 'incomplete');
    if (t.type === 'num') {
      pos++;
      return { v: t.value, from: null, kind: t.kind };
    }
    if (t.type === 'lp' || t.type === 'fn') {
      pos++;
      const a = expr();
      if (pos < tokens.length) {
        if (tokens[pos].type !== 'rp') throw fail('形がちがいます', 'syntax');
        pos++;
      }
      if (t.type === 'lp') return { v: a.v, from: a.from, kind: a.kind };
      if (t.fn === '√(' && !(isReal(a.v) && N.sign(a.v.re) >= 0)) note('principal');
      if (t.fn === 'ln(' && !(isReal(a.v) && N.sign(a.v.re) > 0)) note('principal');
      if (['abs(', 'arg(', 'conj('].includes(t.fn)) note(t.fn);
      if (t.fn === 'arg(') note('angle');
      return push({ op: t.fn, a: a.v, aFrom: a.from, r: applyFn(t.fn, a.v, angle) });
    }
    if (t.type === 'rp') throw fail('( ) の中に数がありません', 'syntax');
    throw fail('演算子が続いています', 'syntax');
  }

  // 累乗の右側（マイナスもよい。右から計算）
  function exponent() {
    if (peekOp('−')) {
      pos++;
      const a = exponent();
      return a.from === null ? { ...a, v: neg(a.v) } : push({ op: 'neg', a: a.v, aFrom: a.from, r: neg(a.v) });
    }
    return power();
  }

  function power() {
    const base = primary();
    if (!peekOp('^')) return base;
    pos++;
    return binary('^', base, exponent());
  }

  // かけ算の省略（4i、2(1＋i)、(1＋i)(1−i)）
  function implicit() {
    let left = power();
    let count = 1;
    while (startsValue(tokens[pos])) {
      left = binary('×', left, power(), true);
      count++;
    }
    return { ...left, juxt: count > 1 };
  }

  function unary() {
    if (peekOp('−')) {
      pos++;
      const a = unary();
      if (a.from === null) return { ...a, v: neg(a.v) }; // −3 は、ただのマイナスの数
      return push({ op: 'neg', a: a.v, aFrom: a.from, r: neg(a.v) });
    }
    return implicit();
  }

  function term() {
    let left = unary();
    while (peekOp('×', '÷')) {
      const op = tokens[pos++].op;
      const right = unary();
      if (op === '÷' && right.juxt) note('implicitDiv');
      left = binary(op, left, right);
    }
    return left;
  }

  // r∠θ（θ の側の × ÷ も角度に入る：2∠π/2 ＝ 2∠(π/2)）
  function polar() {
    const left = term();
    if (!peekOp('∠')) return left;
    pos++;
    return binary('∠', left, term());
  }

  function expr() {
    let left = polar();
    while (peekOp('+', '−')) {
      const op = tokens[pos++].op;
      left = binary(op, left, polar());
    }
    return left;
  }

  const result = expr();
  if (pos < tokens.length) {
    throw fail(tokens[pos].type === 'rp' ? '( がないのに ) があります' : '形がちがいます', 'syntax');
  }
  if (noteSet.has('polar') || noteSet.has('arg(')) note('angle');
  return { value: result.v, steps, notes: [...noteSet.values()] };
}

// ＝ を押す前の答え（最後の演算子・( ・関数は、打っている途中とみて外す）
export function preview(items, opts) {
  let list = items;
  while (list.length && (isBinOp(list.at(-1)) || isOpen(list.at(-1)))) list = list.slice(0, -1);
  if (!list.length) return null;
  try {
    const r = evaluate(list, opts);
    return { value: r.value, notes: r.notes, steps: r.steps };
  } catch (error) {
    if (!(error instanceof CalcError)) throw error;
    return error.kind === 'math' ? { error: error.message } : null;
  }
}

export function openParens(items) {
  let n = 0;
  for (const t of items) {
    if (isOpen(t)) n++;
    else if (t === ')' && n > 0) n--;
  }
  return n;
}

export function closeParens(items) {
  const n = openParens(items);
  return n ? [...items, ...Array(n).fill(')')] : items;
}

// ---------------------------------------------------------
// キーを押したときの式の変え方（押せないときは null）
// ---------------------------------------------------------
export function pressComplex({ items, caret }, key) {
  const prev = items[caret - 1];
  const insert = (...parts) => ({ items: [...items.slice(0, caret), ...parts, ...items.slice(caret)], caret: caret + parts.length });

  if (key === 'back') return caret > 0 ? { items: [...items.slice(0, caret - 1), ...items.slice(caret)], caret: caret - 1 } : null;
  if (key === 'left') return caret > 0 ? { items, caret: caret - 1 } : null;
  if (key === 'right') return caret < items.length ? { items, caret: caret + 1 } : null;
  if (key === 'clear') return items.length ? { items: [], caret: 0 } : null;

  if (isDigit(key) || key === '.') {
    if (prev === 'i' || prev === 'π' || prev === ')' || isAns(prev)) return null;
    let s = caret;
    while (s > 0 && (isDigit(items[s - 1]) || items[s - 1] === '.')) s--;
    let e = caret;
    while (e < items.length && (isDigit(items[e]) || items[e] === '.')) e++;
    const num = items.slice(s, e);
    if (num.length >= MAX_NUMBER) return null;
    if (key === '.') {
      if (num.includes('.')) return null;
      return caret === s ? insert('0', '.') : insert('.');
    }
    // 先頭の 0 は、次の数字で置きかえ
    if (num.length === 1 && num[0] === '0' && caret === e) {
      return key === '0' ? null : { items: [...items.slice(0, s), key, ...items.slice(e)], caret: s + 1 };
    }
    return insert(key);
  }
  if (key === 'i' || key === 'π' || key === '(' || isFn(key)) return prev === '.' ? null : insert(key);
  if (key === ')') return isValueEnd(prev) && openParens(items.slice(0, caret)) > 0 ? insert(')') : null;
  if (isBinOp(key)) {
    if (caret === 0 || isOpen(prev)) return key === '−' ? insert('−') : null; // マイナスの数
    if (isBinOp(prev)) {
      const before = items[caret - 2];
      if (caret < 2 || isBinOp(before) || isOpen(before)) return null; // 「× −」のあと
      if (key === '−' && prev !== '−' && prev !== '+') return insert('−'); // 2 × −3、2^−1
      return { items: [...items.slice(0, caret - 1), key, ...items.slice(caret)], caret };
    }
    return insert(key);
  }
  return null;
}

// ---------------------------------------------------------
// 文字にする
// ---------------------------------------------------------

// 概数でも、上から 60 桁が「短い数」（20 桁まで）と同じなら、その数として書く（1.99999…9 → 2）
//   表示だけに使う（計算の数は変えない）
function shortExact(x) {
  if (x.q || N.isZero(x)) return x;
  const a = N.toApprox(x, 60);
  if ((a.m < 0n ? -a.m : a.m).toString().length > 20) return x;
  return a.e >= 0n ? N.frac(a.m * 10n ** a.e) : N.frac(a.m, 10n ** -a.e);
}

// ふつうの数を短く（四捨五入したら …）
export function numText(x, sig = 10) {
  const f = F.compact(shortExact(x), sig);
  return f.text + (f.rounded ? '…' : '');
}

// a ＋ bi の形
export function rectText(z, sig = 10) {
  const { re, im } = z;
  if (N.isZero(im)) return numText(re, sig);
  const a = N.absNum(im);
  let coef = im.q && N.cmp(a, ONE) === 0 ? '' : numText(a, sig);
  if (coef.includes('×')) coef = `(${coef})`;
  if (N.isZero(re)) return `${N.sign(im) < 0 ? '−' : ''}${coef}i`;
  return `${numText(re, sig)} ${N.sign(im) < 0 ? '−' : '+'} ${coef}i`;
}

// 角度 t（回転の割合）の文字：度なら 45°、rad なら π/4（ちょうどでなければ 0.785…）
export function angleText(t, angle, sig = 10) {
  if (angle === 'deg') return `${numText(N.mul(t, N.frac(360n)), sig)}°`;
  if (!t.q) return numText(S.fromTurn(t, 'rad'), sig);
  return piText(N.mul(t, two));
}

// k·π の書き方（k は正確な数）：π、−π/2、3π/4
function piText(k, unit = 'π') {
  if (N.isZero(k)) return '0';
  const n = k.n < 0n ? -k.n : k.n;
  return `${k.n < 0n ? '−' : ''}${n === 1n ? '' : n}${unit}${k.d === 1n ? '' : `/${k.d}`}`;
}

// 整数 n の √ を「a√b」に（√125 ＝ 5√5）。大きい数は √n のまま
function rootText(n) {
  let out = 1n;
  let rest = n;
  if (n < 100000000n) {
    for (let p = 2n; p * p <= rest; p++) {
      while (rest % (p * p) === 0n) {
        rest /= p * p;
        out *= p;
      }
    }
  }
  return `${out === 1n ? '' : out}√${rest}`;
}

// √x の書き方（x は 0 以上）：ちょうどでなければ √2・5√5 のように（x が短い正確な数のとき）
export function sqrtText(x, sig = 10) {
  x = shortExact(x);
  const r = N.sqrt(x);
  if (r.q) return numText(r, sig);
  if (x.q) {
    if (x.d === 1n && x.n < 100000000n) return rootText(x.n);
    const t = numText(x, sig);
    if (!t.includes('…') && t.length <= 10) return `√${t}`;
  }
  return numText(r, sig);
}

// 長さ |z| の書き方
export function absText(z, sig = 10) {
  const r = abs(z);
  if (r.q) return numText(r, sig);
  return sqrtText(norm(z), sig);
}

// 極形式 r∠θ
export function polarText(z, angle, sig = 10) {
  if (isZero(z)) return '0';
  return `${absText(z, sig)}∠${angleText(argTurn(z), angle, sig)}`;
}

// 指数の形 r·e^(iθ)（θ は rad）
export function expText(z, sig = 10) {
  if (isZero(z)) return '0';
  const t = argTurn(z);
  const r = absText(z, sig);
  const head = r === '1' ? '' : r;
  if (N.isZero(t)) return r;
  const th = t.q ? piText(N.mul(t, two), 'iπ') : `${numText(S.fromTurn(t, 'rad'), sig)}i`;
  return `${head}e^(${th})`;
}

// 式を1行の文字に（履歴の検索・名前）
export function exprText(items) {
  return items.map((t) => (isAns(t) ? t.label : t)).join('');
}

// ---------------------------------------------------------
// 保存の形（BigInt を文字に）
// ---------------------------------------------------------
export const serZ = (z) => ({ re: N.serialize(z.re), im: N.serialize(z.im) });
export const deserZ = (o) => cx(N.deserialize(o.re), N.deserialize(o.im));
const OK_STR = new Set(['.', 'i', 'π', '(', ')', ...BIN_OPS, ...FN_TOKENS]);
export const serItems = (items) => items.map((t) => (isAns(t) ? { ref: serZ(t.ref), label: t.label } : t));
export function deserItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list) {
    if (typeof t === 'string' && (isDigit(t) || OK_STR.has(t))) out.push(t);
    else if (t && typeof t === 'object' && t.ref) out.push({ ref: deserZ(t.ref), label: String(t.label ?? '').slice(0, 40) });
    else return []; // 読めない部品があれば、式は捨てる
  }
  return out;
}
