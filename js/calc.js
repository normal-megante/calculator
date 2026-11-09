// =========================================================
// 式の読み取りと計算
//
// 式は「部品」の並び（配列）で持ちます。部品は
//   ・1文字の文字列 … '0'〜'9' '.' '+' '−' '×' '÷' '^' '(' ')' '%' '²' '√'
//   ・関数電卓の部品 … 'sin(' などの関数（「(」もかねる）、'π' 'e'、'!' '⁻¹'（後ろにつく）、
//                       'C' 'P'（nCr・nPr）
//   ・{ ref: 数, label: 表示名 } … 前の答えや履歴の答え（全部の桁を持ったまま式に入る）
//
// 計算のきまり（ふつうのスマホの電卓と同じ）
//   ・× ÷ を先に、＋ − をあとで計算する。( ) の中が先。
//   ・2(3+4) や 2√3 のように、かけ算の記号を省いてもかけ算になる。
//   ・累乗 ^ と ² は、− より先：−2² = −4。2^3^2 は 2^(3^2)。
//   ・√ は、すぐ後ろの数（累乗をふくむ）にかかる：√2^2 = √(2^2)。
//   ・% は「100で割る」。ただし ＋ − のすぐ後ろの % は「左の数の〇%」：
//       200 + 10% = 220（200 の 10% を足す）、200 − 10% = 180
//       200 × 10% = 20、200 ÷ 10% = 2000
//   ・関数：sin( などは閉じていなければ ＝ で閉じる。2sin(30) や 2π は かけ算。
//   ・nCr・nPr は × ÷ より先、累乗・! より後：2×5C2 = 20
//   ・sin cos tan は、そのときの角度のモード（度・rad）で計算する（evaluate の angle）
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';

const { CalcError } = N;
const HUNDRED = N.frac(100n);

// ASCII の記号も受け付ける（PC のキーボードや貼り付け用）
const ALIASES = { '-': '−', '*': '×', '/': '÷', 'x': '×', '＋': '+', 'ー': '−', '－': '−' };

export function normalizeChar(ch) {
  return ALIASES[ch] ?? ch;
}

export const BINARY_OPS = ['+', '−', '×', '÷', '^', 'C', 'P'];

// 関数の部品 → 名前
export const FN_TOKENS = {
  'sin(': 'sin', 'cos(': 'cos', 'tan(': 'tan',
  'asin(': 'asin', 'acos(': 'acos', 'atan(': 'atan',
  'log(': 'log', 'ln(': 'ln',
};
export const TRIG = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'];

export const isFnToken = (t) => typeof t === 'string' && Object.hasOwn(FN_TOKENS, t);
// 「(」として数えるもの
export const isOpen = (t) => t === '(' || isFnToken(t);
// 三角関数が入っている式か（角度のモードで答えが変わる）
export const usesAngle = (items) => items.some((t) => isFnToken(t) && TRIG.includes(FN_TOKENS[t]));

export function isDigit(t) {
  return typeof t === 'string' && t.length === 1 && t >= '0' && t <= '9';
}

export function isRef(t) {
  return typeof t === 'object' && t !== null && 'ref' in t;
}

// ---------------------------------------------------------
// 部品の並び → 記号（トークン）の並び
// ---------------------------------------------------------
export function lex(items) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    const t = items[i];
    if (isRef(t)) {
      out.push({ type: 'num', value: t.ref, at: i });
      i++;
      continue;
    }
    if (isFnToken(t)) {
      out.push({ type: 'fn', name: FN_TOKENS[t], value: t, at: i });
      i++;
      continue;
    }
    if (t === 'π' || t === 'e') {
      out.push({ type: 'num', value: t === 'π' ? S.PI : S.E, konst: true, at: i });
      i++;
      continue;
    }
    const ch = normalizeChar(t);
    if (isDigit(ch) || ch === '.') {
      const start = i;
      let text = '';
      while (i < items.length && typeof items[i] === 'string' && (isDigit(items[i]) || items[i] === '.')) {
        text += items[i++];
      }
      if (text.indexOf('.') !== text.lastIndexOf('.')) throw new CalcError('小数点が2つある数があります', 'syntax');
      if (text === '.') throw new CalcError('「.」だけの数があります', 'syntax');
      out.push({ type: 'num', value: N.parseDecimal(text), text, at: start });
      continue;
    }
    const type = {
      '+': 'op', '−': 'op', '×': 'op', '÷': 'op', '^': 'op', 'C': 'op', 'P': 'op',
      '(': 'lp', ')': 'rp', '%': 'pct', '²': 'sq', '√': 'sqrt', '!': 'fact', '⁻¹': 'inv',
    }[ch];
    if (!type) throw new CalcError(`使えない文字があります：${ch}`, 'syntax');
    out.push({ type, value: ch, at: i });
    i++;
  }
  return out;
}

// ---------------------------------------------------------
// 記号の並び → 計算の木（どの順に計算するか）
// ---------------------------------------------------------
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
  }

  peek() {
    return this.tokens[this.i];
  }

  parse() {
    if (this.tokens.length === 0) throw new CalcError('式が空です', 'incomplete');
    const node = this.sum();
    const rest = this.peek();
    if (rest) {
      if (rest.type === 'rp') throw new CalcError('「)」が多すぎます', 'syntax');
      throw new CalcError('式の形が正しくありません', 'syntax');
    }
    return node;
  }

  // ＋ −
  sum() {
    let a = this.term();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '+' || t.value === '−')) {
        this.i++;
        a = { t: 'add', op: t.value, a, b: this.term() };
      } else {
        return a;
      }
    }
  }

  // × ÷（記号を省いたかけ算も）
  term() {
    let a = this.perm();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '×' || t.value === '÷')) {
        this.i++;
        a = { t: 'mul', op: t.value, a, b: this.perm() };
      } else if (t && (t.type === 'num' || t.type === 'lp' || t.type === 'sqrt' || t.type === 'fn')) {
        a = { t: 'mul', op: '·', a, b: this.power() };
      } else {
        return a;
      }
    }
  }

  // nCr・nPr
  perm() {
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === 'C' || t.value === 'P')) {
        this.i++;
        a = { t: 'perm', op: t.value, a, b: this.unary() };
      } else {
        return a;
      }
    }
  }

  // 頭の − ＋
  unary() {
    const t = this.peek();
    if (t?.type === 'op' && (t.value === '−' || t.value === '+')) {
      this.i++;
      const a = this.unary();
      return t.value === '−' ? { t: 'neg', a } : a;
    }
    return this.power();
  }

  // 累乗（右から）
  power() {
    const base = this.postfix();
    const t = this.peek();
    if (t?.type === 'op' && t.value === '^') {
      this.i++;
      return { t: 'pow', a: base, b: this.unary() };
    }
    return base;
  }

  // 後ろにつく % ² ! ⁻¹
  postfix() {
    let a = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'pct') { this.i++; a = { t: 'pct', a }; }
      else if (t?.type === 'sq') { this.i++; a = { t: 'sq', a }; }
      else if (t?.type === 'fact') { this.i++; a = { t: 'fact', a }; }
      else if (t?.type === 'inv') { this.i++; a = { t: 'inv', a }; }
      else return a;
    }
  }

  primary() {
    const t = this.tokens[this.i++];
    if (!t) throw new CalcError('式が途中で終わっています', 'incomplete');
    switch (t.type) {
      case 'num':
        return { t: 'num', v: t.value };
      case 'lp': {
        if (this.peek()?.type === 'rp') throw new CalcError('( ) の中が空です', 'syntax');
        const a = this.sum();
        const close = this.tokens[this.i++];
        if (!close) throw new CalcError('「)」が足りません', 'incomplete');
        if (close.type !== 'rp') throw new CalcError('式の形が正しくありません', 'syntax');
        return { t: 'group', a };
      }
      case 'sqrt':
        return { t: 'sqrt', a: this.unary() };
      case 'fn': {
        if (this.peek()?.type === 'rp') throw new CalcError(`${t.value}) の中が空です`, 'syntax');
        const a = this.sum();
        const close = this.tokens[this.i++];
        if (!close) throw new CalcError('「)」が足りません', 'incomplete');
        if (close.type !== 'rp') throw new CalcError('式の形が正しくありません', 'syntax');
        return { t: 'fn', name: t.name, a };
      }
      case 'op':
        throw new CalcError(`「${t.value}」の前に数がありません`, 'syntax');
      case 'rp':
        throw new CalcError('「)」の前に数がありません', 'syntax');
      default:
        throw new CalcError(`「${t.value}」の前に数がありません`, 'syntax');
    }
  }
}

export function parse(tokens) {
  return new Parser(tokens).parse();
}

// ---------------------------------------------------------
// 計算の木 → 答え
//
// 計算した順番に、1つずつの計算（ステップ）を ctx.steps に記録する（検算で使う）。
//   { op, a, b, result, aFrom, bFrom }
//   op    : '+' '−' '×' '÷' '^' '²' '√' '%' 'neg' 'pct+' 'pct−'
//           関数電卓：'sin' 'cos' 'tan' 'asin' 'acos' 'atan'（angle も記録）'log' 'ln' '!' '⁻¹' 'C' 'P'
//   aFrom : a が前のステップの答えなら、そのステップの番号（数をそのまま打ったなら null）
// ---------------------------------------------------------
function record(ctx, node, step) {
  ctx.steps.push(step);
  node.step = ctx.steps.length - 1;
  return step.result;
}

const from = (node) => node.step ?? null;

function evaluateNode(node, ctx) {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'group': {
      const v = evaluateNode(node.a, ctx);
      node.step = node.a.step;
      return v;
    }
    case 'add': {
      const a = evaluateNode(node.a, ctx);
      if (node.b.t === 'pct') {
        // 200 + 10% → 200 の 10% を足す
        const percent = evaluateNode(node.b.a, ctx);
        const part = N.mul(a, N.div(percent, HUNDRED));
        ctx.notes.push({ kind: 'percent', op: node.op, base: a, percent, part });
        const result = node.op === '+' ? N.add(a, part) : N.sub(a, part);
        return record(ctx, node, {
          op: node.op === '+' ? 'pct+' : 'pct−', a, b: percent, part, result,
          aFrom: from(node.a), bFrom: from(node.b.a),
        });
      }
      const b = evaluateNode(node.b, ctx);
      const result = node.op === '+' ? N.add(a, b) : N.sub(a, b);
      return record(ctx, node, { op: node.op, a, b, result, aFrom: from(node.a), bFrom: from(node.b) });
    }
    case 'mul': {
      const a = evaluateNode(node.a, ctx);
      const b = evaluateNode(node.b, ctx);
      const result = node.op === '÷' ? N.div(a, b) : N.mul(a, b);
      const op = node.op === '÷' ? '÷' : '×';
      return record(ctx, node, { op, a, b, result, aFrom: from(node.a), bFrom: from(node.b) });
    }
    case 'neg': {
      const a = evaluateNode(node.a, ctx);
      // 「−5」のように数にマイナスを付けただけなら、計算とは数えない
      if (node.a.t === 'num') return N.neg(a);
      return record(ctx, node, { op: 'neg', a, result: N.neg(a), aFrom: from(node.a) });
    }
    case 'pow': {
      const a = evaluateNode(node.a, ctx);
      const b = evaluateNode(node.b, ctx);
      return record(ctx, node, { op: '^', a, b, result: N.pow(a, b), aFrom: from(node.a), bFrom: from(node.b) });
    }
    case 'sq': {
      const a = evaluateNode(node.a, ctx);
      return record(ctx, node, { op: '²', a, result: N.pow(a, N.frac(2n)), aFrom: from(node.a) });
    }
    case 'pct': {
      const a = evaluateNode(node.a, ctx);
      return record(ctx, node, { op: '%', a, result: N.div(a, HUNDRED), aFrom: from(node.a) });
    }
    case 'sqrt': {
      const a = evaluateNode(node.a, ctx);
      return record(ctx, node, { op: '√', a, result: N.sqrt(a), aFrom: from(node.a) });
    }
    case 'fn': {
      const a = evaluateNode(node.a, ctx);
      const step = { op: node.name, a, aFrom: from(node.a) };
      if (TRIG.includes(node.name)) {
        step.angle = ctx.angle;
        if (!ctx.notes.some((n) => n.kind === 'angle')) ctx.notes.push({ kind: 'angle', angle: ctx.angle });
      }
      step.result = applyFn(node.name, a, ctx.angle);
      return record(ctx, node, step);
    }
    case 'fact': {
      const a = evaluateNode(node.a, ctx);
      return record(ctx, node, { op: '!', a, result: S.factorial(a), aFrom: from(node.a) });
    }
    case 'inv': {
      const a = evaluateNode(node.a, ctx);
      return record(ctx, node, { op: '⁻¹', a, result: S.reciprocal(a), aFrom: from(node.a) });
    }
    case 'perm': {
      const a = evaluateNode(node.a, ctx);
      const b = evaluateNode(node.b, ctx);
      const result = node.op === 'C' ? S.nCr(a, b) : S.nPr(a, b);
      return record(ctx, node, { op: node.op, a, b, result, aFrom: from(node.a), bFrom: from(node.b) });
    }
    default:
      throw new Error(`知らない計算: ${node.t}`);
  }
}

function applyFn(name, a, angle) {
  switch (name) {
    case 'sin': return S.sin(a, angle);
    case 'cos': return S.cos(a, angle);
    case 'tan': return S.tan(a, angle);
    case 'asin': return S.asin(a, angle);
    case 'acos': return S.acos(a, angle);
    case 'atan': return S.atan(a, angle);
    case 'log': return S.log10(a);
    case 'ln': return S.ln(a);
    default: throw new Error(`知らない関数: ${name}`);
  }
}

// 閉じていない ( の数（sin( なども ( として数える）
export function openParens(items, upto = items.length) {
  let depth = 0;
  for (let i = 0; i < upto; i++) {
    if (isOpen(items[i])) depth++;
    else if (items[i] === ')') depth = Math.max(0, depth - 1);
  }
  return depth;
}

// 式を計算する（＝を押したとき）。閉じていない ( は最後に閉じる。
//   angle … 三角関数の角度のモード（'deg' / 'rad'。ないときは、いまのモード）
// 返す値：{ value, notes, steps }。計算できなければ CalcError を投げる。
export function evaluate(items, { angle = S.getAngle() } = {}) {
  const tokens = lex(items);
  for (let k = openParens(items); k > 0; k--) tokens.push({ type: 'rp', value: ')', at: items.length });
  const tree = parse(tokens);
  const ctx = { notes: [], steps: [], angle };
  const value = evaluateNode(tree, ctx);
  return { value, notes: ctx.notes, steps: ctx.steps };
}

// 閉じていない ( を閉じた式（＝ のあと、履歴に残す形）
export function closeParens(items) {
  return [...items, ...Array(openParens(items)).fill(')')];
}

// 打っている途中の式の答え（＝を押さなくても出す答え）
// 最後の演算子などは無視して計算してみる。
// 返す値：{ value, notes } … 答えが出た
//         { error }        … 0 で割ったなど、計算そのものができない
//         null             … 出すものがない（数を1つ打っただけ・式が途中で読めない）
export function preview(items, { angle = S.getAngle() } = {}) {
  let tokens;
  try {
    tokens = lex(items);
  } catch {
    return null;
  }
  while (tokens.length && ['op', 'lp', 'sqrt', 'fn'].includes(tokens[tokens.length - 1].type)) tokens.pop();
  if (tokens.length === 0) return null;
  // 数を1つ打っただけなら、答えを出すまでもない（前の答えなどの部品1つ・π・e は出す）
  if (tokens.length === 1 && tokens[0].type === 'num' && !tokens[0].konst && !isRef(items[tokens[0].at])) return null;
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'lp' || t.type === 'fn') depth++;
    else if (t.type === 'rp') depth--;
  }
  for (; depth > 0; depth--) tokens.push({ type: 'rp', value: ')' });
  try {
    const tree = parse(tokens);
    const ctx = { notes: [], steps: [], angle };
    return { value: evaluateNode(tree, ctx), notes: ctx.notes };
  } catch (error) {
    if (error instanceof CalcError && error.kind === 'math') return { error: error.message };
    if (error instanceof CalcError) return null;
    throw error;
  }
}

// 式を文字にする（履歴の検索・コピー用）
export function itemsToText(items) {
  return items.map((t) => (isRef(t) ? `〔${t.label}〕` : t)).join('');
}
