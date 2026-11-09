// =========================================================
// n進法（2進・8進・10進・16進・3〜15進）の計算（画面とは切り離した計算だけ）
//
// ■ 式の部品 items
//   数の文字 { d: '0'〜'9' 'A'〜'F' か '.', b: 進法 }（1つの数の文字は、みんな同じ進法）
//     → 16進の FF と 2進の 1010 を、1つの式にまぜて計算できる
//   演算子 '+' '−' '×' '÷' 'mod'（あまり） 'and' 'or' 'xor' '<<' '>>'、前につく 'not'、'(' ')'
//   前の答え { ref: 数, label }
// ■ 計算の順番（強い順。プログラムの言葉の C や Python と同じ）
//   ( ) → NOT・マイナス → × ÷ mod → ＋ − → << >> → AND → XOR → OR
// ■ 数は num.js の正確な分数。÷ は小数まで出す（くり返す小数は、くり返しの所を見つける）
//   AND・OR・XOR・NOT・シフトは整数だけ。マイナスの数は「2の補数」（左にずっと 1 が続く）として計算する
//   （NOT x ＝ −x − 1、x >> n は ÷2ⁿ の切り捨て。Python と同じ）
// =========================================================
import * as N from './num.js';

export const DIGITS = '0123456789ABCDEF';
export const MAIN_BASES = [2, 8, 10, 16];
export const OTHER_BASES = [3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15];
export const BIN_OPS = ['+', '−', '×', '÷', 'mod', 'and', 'or', 'xor', '<<', '>>'];
const BIT_OPS = new Set(['and', 'or', 'xor', '<<', '>>', 'not']);
const PREC = { or: 1, xor: 2, and: 3, '<<': 4, '>>': 4, '+': 5, '−': 5, '×': 6, '÷': 6, mod: 6 };
// 画面での書き方
export const OP_TEXT = {
  '+': '+', '−': '−', '×': '×', '÷': '÷', mod: 'mod', and: 'AND', or: 'OR', xor: 'XOR', '<<': '<<', '>>': '>>', not: 'NOT',
};
export const MAX_LITERAL = 64; // 1つの数に打てる文字（2進の 64ビットまで）
export const MAX_SHIFT = 4096; // ずらせる桁
export const MAX_BITS = 10000; // 答えの整数の部分は、2進でこの桁数まで

export const isPart = (t) => typeof t === 'object' && t !== null && 'd' in t;
export const isAns = (t) => typeof t === 'object' && t !== null && 'ref' in t;
export const isBinOp = (t) => BIN_OPS.includes(t);
export const isDigitKey = (k) => typeof k === 'string' && k.length === 1 && DIGITS.includes(k);
export const digitOf = (ch) => (ch.length === 1 ? DIGITS.indexOf(ch) : -1);
const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const subText = (b) => String(b).replace(/\d/g, (c) => SUB[c]);

const fail = (message, kind = 'syntax') => new N.CalcError(message, kind);

// 割り算の答えを小さいほうの整数に（−7 ÷ 2 → −4）
function floorDiv(n, d) {
  const q = n / d;
  return n % d !== 0n && (n < 0n) !== (d < 0n) ? q - 1n : q;
}

// ---------------------------------------------------------
// 数の文字 ⇄ 数
// ---------------------------------------------------------

// 'FF.8'（16進）→ 正確な数
export function parseDigits(text, base) {
  const list = text.split('.');
  if (list.length > 2) throw fail('小数点が2つあります');
  const [ip, fp = ''] = list;
  const B = BigInt(base);
  let n = 0n;
  for (const ch of ip + fp) {
    const v = digitOf(ch);
    if (v < 0 || v >= base) throw fail(`「${ch}」は ${base}進法では使えません`, 'math');
    n = n * B + BigInt(v);
  }
  return N.frac(n, B ** BigInt(fp.length));
}

// 正確な数 → base 進法の数字
// 返す値：{ neg, int: '10A', frac: '8', rep: '3', cut }（値 ＝ int.frac のあとに rep がずっとくり返す）
//   rep … くり返す所（なければ ''）、cut … 小数が長すぎて とちゅうで切った
export function toBase(x, base, maxFrac = 64) {
  if (!x.q) throw fail('この数は n進法にできません', 'math');
  const neg = x.n < 0n;
  const n = neg ? -x.n : x.n;
  const B = BigInt(base);
  const int = (n / x.d).toString(base).toUpperCase();
  let r = n % x.d;
  const seen = new Map(); // あまり → 小数の何桁目で出たか
  let frac = '';
  while (r !== 0n && !seen.has(r) && frac.length < maxFrac) {
    seen.set(r, frac.length);
    r *= B;
    frac += DIGITS[Number(r / x.d)];
    r %= x.d;
  }
  if (r === 0n) return { neg, int, frac, rep: '', cut: false };
  if (seen.has(r)) {
    const s = seen.get(r);
    return { neg, int, frac: frac.slice(0, s), rep: frac.slice(s), cut: false };
  }
  return { neg, int, frac, rep: '', cut: true };
}

// その進法で、小数が終わる（割り切れる）数か
export function terminates(x, base) {
  let d = x.d;
  const B = BigInt(base);
  for (let g = gcd(d, B); g > 1n; g = gcd(d, B)) d /= g;
  return d === 1n;
}
function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

// 何桁ごとに区切るか（2進・16進は4桁、ほかは3桁）
export const groupSize = (base) => (base === 2 || base === 16 ? 4 : 3);

// 整数の部分の数字を、下から区切る
export function groups(int, base) {
  const g = groupSize(base);
  const out = [];
  for (let end = int.length; end > 0; end -= g) out.unshift(int.slice(Math.max(0, end - g), end));
  return out;
}

// toBase の結果 → 文字（くり返しは ( ) でかこむ：0.0(0011)）
//   sep … 区切りの文字（null なら 10進は「,」、ほかは空白。'' なら区切らない）
export function formText(t, base, sep = null) {
  const s = sep ?? (base === 10 ? ',' : ' ');
  const int = s === '' ? t.int : groups(t.int, base).join(s);
  let text = (t.neg ? '−' : '') + int;
  if (t.frac || t.rep) text += `.${t.frac}${t.rep ? `(${t.rep})` : ''}`;
  if (t.cut) text += '…';
  return text;
}

export const baseText = (x, base, { maxFrac = 64, sep = null } = {}) => formText(toBase(x, base, maxFrac), base, sep);

// formText の文字 → 数（くり返しの ( ) も読む。「…」で終わるときは、そこまでの数）
export function parseBaseText(text, base) {
  const m = /^(−?)([0-9A-F]+)(?:\.([0-9A-F]*)(?:\(([0-9A-F]+)\))?)?…?$/.exec(text.replace(/[ ,]/g, ''));
  if (!m) throw fail('読めない数です');
  const [, sign, int, frac = '', rep = ''] = m;
  let v = parseDigits(frac ? `${int}.${frac}` : int, base);
  if (rep) {
    // くり返しの分：0.000(rep) ＝ rep ÷ (base^くり返しの桁 − 1) ÷ base^frac の桁
    const B = BigInt(base);
    v = N.add(v, N.frac(parseDigits(rep, base).n, (B ** BigInt(rep.length) - 1n) * B ** BigInt(frac.length)));
  }
  return sign ? N.neg(v) : v;
}

// ---------------------------------------------------------
// 検算に使う形
// ---------------------------------------------------------

// 位ごとの数：'1A.8'（16進）→ [{ ch: '1', v: 1, p: 1 }, { ch: 'A', v: 10, p: 0 }, { ch: '8', v: 8, p: -1 }]
//   p … 位（base の p 乗の位。小数はマイナス）
export function places(text) {
  const [ip, fp = ''] = text.split('.');
  return [
    ...[...ip].map((ch, i) => ({ ch, v: digitOf(ch), p: ip.length - 1 - i })),
    ...[...fp].map((ch, i) => ({ ch, v: digitOf(ch), p: -(i + 1) })),
  ];
}

// 整数 n（0 以上）を base で割っていく（あまりを下から読むと base 進法）
export function divisionRows(n, base) {
  const B = BigInt(base);
  const rows = [];
  do {
    rows.push({ n, q: n / B, r: Number(n % B) });
    n /= B;
  } while (n > 0n);
  return rows;
}

// 小数の部分 f（0 以上 1 未満の正確な数）に base をかけていく（整数の部分を上から読むと base 進法）
//   返す値：{ rows: [{ f, y, d }], repeatAt: くり返しが始まる行（なければ -1）, cut: とちゅうでやめた }
export function fracRows(f, base, max = 12) {
  const B = N.frac(BigInt(base));
  const rows = [];
  const seen = [];
  const seenAt = (g) => seen.findIndex((h) => N.cmp(h, g) === 0);
  while (!N.isZero(f) && rows.length < max) {
    const i = seenAt(f);
    if (i >= 0) return { rows, repeatAt: i, cut: false };
    seen.push(f);
    const y = N.mul(f, B);
    const d = y.n / y.d;
    rows.push({ f, y, d: Number(d) });
    f = N.sub(y, N.frac(d));
  }
  if (N.isZero(f)) return { rows, repeatAt: -1, cut: false };
  const i = seenAt(f);
  return { rows, repeatAt: i, cut: i < 0 };
}

// マイナスの整数 n → 2の補数（8・16・32・64ビット。もっと大きければ 64ビットずつ）
export function twosComplement(n) {
  const need = N.bitLen(-n - 1n) + 1; // いちばん左の 1（マイナスのしるし）も入れた桁
  const width = [8, 16, 32, 64].find((w) => need <= w) ?? Math.ceil(need / 64) * 64;
  const u = (1n << BigInt(width)) + n;
  return { width, u, bits: u.toString(2).padStart(width, '0'), hex: u.toString(16).toUpperCase().padStart(width / 4, '0') };
}

// AND・OR・XOR・NOT を、ビットを縦にそろえて見せる形（マイナスの数は 2の補数で、そろえた幅で切る）
export function bitColumns(values) {
  const neg = values.some((x) => x < 0n);
  const len = (x) => (x < 0n ? N.bitLen(-x - 1n) + 1 : Math.max(1, N.bitLen(x) + (neg ? 1 : 0)));
  let width = Math.max(...values.map(len));
  if (neg) width = Math.ceil(width / 4) * 4;
  const bits = (x) => (x < 0n ? (1n << BigInt(width)) + x : x).toString(2).padStart(width, '0');
  return { width, neg, bits: values.map(bits) };
}

// mod の答えとその商：a ＝ q × b ＋ r（r は b と同じ向き）
export function modParts(a, b) {
  const q = floorDiv(a.n * b.d, a.d * b.n);
  return { q: N.frac(q), r: N.sub(a, N.mul(b, N.frac(q))) };
}

// ---------------------------------------------------------
// 式を読んで計算する
// ---------------------------------------------------------

// 部品 → かたまり（数・演算子・( )）
export function lex(items) {
  const out = [];
  for (let i = 0; i < items.length;) {
    const t = items[i];
    if (isPart(t)) {
      let end = i;
      let text = '';
      while (end < items.length && isPart(items[end]) && items[end].b === t.b) text += items[end++].d;
      out.push({ type: 'num', text, base: t.b, value: parseDigits(text, t.b), at: i, end });
      i = end;
      continue;
    }
    if (isAns(t)) out.push({ type: 'num', ans: t, value: t.ref, at: i, end: i + 1 });
    else if (isBinOp(t)) out.push({ type: 'op', op: t, at: i });
    else if (t === 'not') out.push({ type: 'not', at: i });
    else if (t === '(') out.push({ type: 'lp', at: i });
    else if (t === ')') out.push({ type: 'rp', at: i });
    else throw fail('読めない部品があります');
    i++;
  }
  return out;
}

function needInt(x, what) {
  if (!x.q || x.d !== 1n) throw fail(`${what}は、整数だけで使えます（小数があります）`, 'math');
  return x.n;
}

// 大きすぎる数は止める（2進の桁が多すぎると、表示も検算もできないので）
function sized(x) {
  if (!x.q || N.bitLen(x.d) > MAX_BITS || N.bitLen(x.n) - N.bitLen(x.d) > MAX_BITS) {
    throw fail('数が大きすぎます（2進で1万桁まで）', 'math');
  }
  return x;
}

function apply(op, a, b) {
  switch (op) {
    case '+': return N.add(a, b);
    case '−': return N.sub(a, b);
    case '×': return N.mul(a, b);
    case '÷':
      if (N.isZero(b)) throw fail('0 では割れません', 'math');
      return N.div(a, b);
    case 'mod':
      if (N.isZero(b)) throw fail('0 で割ったあまりは出せません', 'math');
      return modParts(a, b).r;
    case 'and': return N.frac(needInt(a, 'AND ') & needInt(b, 'AND '));
    case 'or': return N.frac(needInt(a, 'OR ') | needInt(b, 'OR '));
    case 'xor': return N.frac(needInt(a, 'XOR ') ^ needInt(b, 'XOR '));
    default: { // '<<' '>>'
      const x = needInt(a, 'シフト（<< >>）');
      const k = needInt(b, 'シフト（<< >>）');
      if (k < 0n || k > BigInt(MAX_SHIFT)) throw fail(`ずらす数は 0〜${MAX_SHIFT} の整数にしてください`, 'math');
      return N.frac(op === '<<' ? x << k : x >> k);
    }
  }
}

// 式を計算する
// 返す値：{ value, steps, literals, notes }
//   steps … 計算した順番 [{ op, a, b, r, aFrom, bFrom }]（aFrom は前のステップの番号。NOT・マイナスは b なし）
//   literals … 式の中の数（{ text, base, value } か { ans, value }）
//   notes … 注意書きの種類 [{ kind }]
export function evaluate(items) {
  const tokens = lex(items);
  if (!tokens.length) throw fail('式がありません', 'incomplete');
  const steps = [];
  const used = new Set();
  let pos = 0;
  const push = (step) => {
    steps.push(step);
    return { v: step.r, from: steps.length - 1 };
  };

  function primary() {
    const t = tokens[pos];
    if (!t) throw fail('式が途中です', 'incomplete');
    if (t.type === 'num') {
      pos++;
      return { v: t.value, from: null };
    }
    if (t.type === 'lp') {
      pos++;
      const v = binary(1);
      if (pos < tokens.length) {
        if (tokens[pos].type !== 'rp') throw fail('数と数の間に、演算子がありません');
        pos++;
      }
      return v; // 閉じていない ( は、おしまいで閉じる
    }
    if (t.type === 'rp') throw fail('( ) の中に数がありません');
    throw fail('演算子が続いています');
  }

  function unary() {
    const t = tokens[pos];
    if (t?.type === 'op' && t.op === '−') {
      pos++;
      const a = unary();
      if (a.from === null) return { v: N.neg(a.v), from: null }; // −5 は、ただのマイナスの数
      used.add('neg');
      return push({ op: 'neg', a: a.v, aFrom: a.from, r: N.neg(a.v) });
    }
    if (t?.type === 'not') {
      pos++;
      const a = unary();
      const x = needInt(a.v, 'NOT ');
      used.add('not');
      return push({ op: 'not', a: a.v, aFrom: a.from, r: sized(N.frac(-x - 1n)) });
    }
    return primary();
  }

  function binary(minPrec) {
    let left = unary();
    while (pos < tokens.length && tokens[pos].type === 'op' && PREC[tokens[pos].op] >= minPrec) {
      const op = tokens[pos++].op;
      const right = binary(PREC[op] + 1);
      used.add(op);
      const r = sized(apply(op, left.v, right.v));
      left = push({ op, a: left.v, b: right.v, aFrom: left.from, bFrom: right.from, r });
    }
    return left;
  }

  const result = binary(1);
  if (pos < tokens.length) {
    throw fail(tokens[pos].type === 'rp' ? '( がないのに ) があります' : '数と数の間に、演算子がありません');
  }
  const value = sized(result.v);

  const notes = [];
  const levels = new Set([...used].filter((op) => PREC[op]).map((op) => PREC[op]));
  if ([...used].some((op) => BIT_OPS.has(op)) && levels.size >= 2) notes.push({ kind: 'order' });
  if (used.has('not')) notes.push({ kind: 'not' });
  if (steps.some((s) => s.op === '>>' && (s.a.n & ((1n << s.b.n) - 1n)) !== 0n)) notes.push({ kind: 'shiftLost' });
  if (steps.some((s) => s.op === '÷' && !N.isInteger(s.r))) notes.push({ kind: 'div' });
  if (steps.some((s) => s.op === 'mod' && (N.sign(s.a) < 0 || N.sign(s.b) < 0))) notes.push({ kind: 'modSign' });

  return { value, steps, literals: tokens.filter((t) => t.type === 'num'), notes };
}

// ＝ を押す前の答え：最後の演算子・( ・NOT は打っている途中とみて外して計算してみる
//   返す値：{ value, notes } / { error }（計算できない）/ null（まだ答えがない）
export function preview(items) {
  let list = items;
  while (list.length && (isBinOp(list.at(-1)) || list.at(-1) === '(' || list.at(-1) === 'not')) list = list.slice(0, -1);
  if (!list.length) return null;
  try {
    const r = evaluate(list);
    return { value: r.value, notes: r.notes };
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    return error.kind === 'math' ? { error: error.message } : null;
  }
}

export function openParens(items) {
  let n = 0;
  for (const t of items) {
    if (t === '(') n++;
    else if (t === ')' && n > 0) n--;
  }
  return n;
}

export function closeParens(items) {
  const n = openParens(items);
  return n ? [...items, ...Array(n).fill(')')] : items;
}

// ---------------------------------------------------------
// キーを押したときの式の変え方
// ---------------------------------------------------------
const valueEnd = (t) => isPart(t) || isAns(t) || t === ')';

// 返す値：{ items, caret }（変えた式）/ { error }（お知らせを出す）/ null（押せない）
export function pressBase({ items, caret }, key, base) {
  const prev = items[caret - 1];
  const next = items[caret];
  const insert = (...parts) => ({ items: [...items.slice(0, caret), ...parts, ...items.slice(caret)], caret: caret + parts.length });

  if (key === 'back') return caret > 0 ? { items: [...items.slice(0, caret - 1), ...items.slice(caret)], caret: caret - 1 } : null;
  if (key === 'left') return caret > 0 ? { items, caret: caret - 1 } : null;
  if (key === 'right') return caret < items.length ? { items, caret: caret + 1 } : null;
  if (key === 'clear') return items.length ? { items: [], caret: 0 } : null;

  if (isDigitKey(key) || key === '.') {
    if (key !== '.' && digitOf(key) >= base) {
      return { error: `${key} は ${base}進法では使えません（${base}進法の数字は 0〜${DIGITS[base - 1]}）` };
    }
    const other = [prev, next].find((t) => isPart(t) && t.b !== base);
    if (other) return { error: `ここは ${other.b}進の数です（上で「${other.b}進」をえらぶと直せます）` };
    if (isAns(prev) || prev === ')' || isAns(next) || next === '(' || next === 'not') return null;
    let s = caret;
    while (s > 0 && isPart(items[s - 1])) s--;
    let e = caret;
    while (e < items.length && isPart(items[e])) e++;
    const lit = items.slice(s, e);
    if (key === '.') {
      if (lit.some((t) => t.d === '.')) return null;
      const parts = caret === s ? [{ d: '0', b: base }, { d: '.', b: base }] : [{ d: '.', b: base }];
      return lit.length + parts.length > MAX_LITERAL ? null : insert(...parts);
    }
    if (lit.length >= MAX_LITERAL) return { error: `1つの数は ${MAX_LITERAL}桁までです` };
    // 先頭の 0 は、次の数字で置きかえ（0 → 5）
    if (lit.length === 1 && lit[0].d === '0' && caret === e) {
      if (key === '0') return null;
      return { items: [...items.slice(0, s), { d: key, b: base }, ...items.slice(e)], caret: s + 1 };
    }
    return insert({ d: key, b: base });
  }

  if (isBinOp(key)) {
    if (caret === 0 || prev === '(' || prev === 'not') return key === '−' ? insert('−') : null; // マイナスの数
    if (isBinOp(prev)) {
      const before = items[caret - 2];
      if (caret < 2 || isBinOp(before) || before === '(' || before === 'not') return null; // 「× −」のあと
      if (key === '−' && prev !== '−') return insert('−'); // 5 × −3
      return { items: [...items.slice(0, caret - 1), key, ...items.slice(caret)], caret }; // 演算子の置きかえ
    }
    return insert(key);
  }
  if (key === 'not' || key === '(') return valueEnd(prev) ? null : insert(key);
  if (key === ')') return valueEnd(prev) && openParens(items.slice(0, caret)) > 0 ? insert(')') : null;
  return null;
}

// ---------------------------------------------------------
// 履歴・電卓へ
// ---------------------------------------------------------

// 数の書き方：FF₁₆（10進は そのまま）
export const literalText = (t) => (t.ans ? t.ans.label : `${t.text}${t.base === 10 ? '' : subText(t.base)}`);

// 式を1行の文字に：「1100₂ AND 1010₂」
export function exprText(items) {
  const out = [];
  let prev = null;
  for (const t of lex(closeParens(items))) {
    if (t.type === 'num') out.push(literalText(t));
    else if (t.type === 'op') {
      const unary = t.op === '−' && (prev === null || prev.type === 'op' || prev.type === 'lp' || prev.type === 'not');
      out.push(unary ? '−' : ` ${OP_TEXT[t.op]} `);
    } else if (t.type === 'not') out.push('NOT ');
    else out.push(t.type === 'lp' ? '(' : ')');
    prev = t;
  }
  return out.join('').replace(/ {2,}/g, ' ').trim();
}

// 電卓の式の部品に（16進などの数は「答え」の部品、名前は FF₁₆）。電卓にない計算（AND・mod など）があれば null
export function toCalcItems(items) {
  const out = [];
  for (const t of lex(closeParens(items))) {
    if (t.type === 'num') {
      if (t.ans) out.push({ ref: t.ans.ref, label: t.ans.label });
      else if (t.base === 10) out.push(...t.text);
      else {
        const label = literalText(t);
        out.push({ ref: t.value, label: label.length <= 24 ? label : `${t.text.slice(0, 10)}…${subText(t.base)}` });
      }
    } else if (t.type === 'op') {
      if (!['+', '−', '×', '÷'].includes(t.op)) return null;
      out.push(t.op);
    } else if (t.type === 'not') return null;
    else out.push(t.type === 'lp' ? '(' : ')');
  }
  return out;
}
