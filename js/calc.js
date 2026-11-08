// =========================================================
// 式の読み取りと計算
//
// 式は「部品」の並び（配列）で持ちます。部品は
//   ・1文字の文字列 … '0'〜'9' '.' '+' '−' '×' '÷' '^' '(' ')' '%' '²' '√'
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
// =========================================================
import * as N from './num.js';

const { CalcError } = N;
const HUNDRED = N.frac(100n);

// ASCII の記号も受け付ける（PC のキーボードや貼り付け用）
const ALIASES = { '-': '−', '*': '×', '/': '÷', 'x': '×', '＋': '+', 'ー': '−', '－': '−' };

export function normalizeChar(ch) {
  return ALIASES[ch] ?? ch;
}

export const BINARY_OPS = ['+', '−', '×', '÷', '^'];

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
      '+': 'op', '−': 'op', '×': 'op', '÷': 'op', '^': 'op',
      '(': 'lp', ')': 'rp', '%': 'pct', '²': 'sq', '√': 'sqrt',
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
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '×' || t.value === '÷')) {
        this.i++;
        a = { t: 'mul', op: t.value, a, b: this.unary() };
      } else if (t && (t.type === 'num' || t.type === 'lp' || t.type === 'sqrt')) {
        a = { t: 'mul', op: '·', a, b: this.power() };
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

  // 後ろにつく % ²
  postfix() {
    let a = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'pct') { this.i++; a = { t: 'pct', a }; }
      else if (t?.type === 'sq') { this.i++; a = { t: 'sq', a }; }
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
// ---------------------------------------------------------
function evaluateNode(node, ctx) {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'group':
      return evaluateNode(node.a, ctx);
    case 'add': {
      const a = evaluateNode(node.a, ctx);
      if (node.b.t === 'pct') {
        // 200 + 10% → 200 の 10% を足す
        const percent = evaluateNode(node.b.a, ctx);
        const part = N.mul(a, N.div(percent, HUNDRED));
        ctx.notes.push({ kind: 'percent', op: node.op, base: a, percent, part });
        return node.op === '+' ? N.add(a, part) : N.sub(a, part);
      }
      const b = evaluateNode(node.b, ctx);
      return node.op === '+' ? N.add(a, b) : N.sub(a, b);
    }
    case 'mul': {
      const a = evaluateNode(node.a, ctx);
      const b = evaluateNode(node.b, ctx);
      return node.op === '÷' ? N.div(a, b) : N.mul(a, b);
    }
    case 'neg':
      return N.neg(evaluateNode(node.a, ctx));
    case 'pow':
      return N.pow(evaluateNode(node.a, ctx), evaluateNode(node.b, ctx));
    case 'sq':
      return N.pow(evaluateNode(node.a, ctx), N.frac(2n));
    case 'pct':
      return N.div(evaluateNode(node.a, ctx), HUNDRED);
    case 'sqrt':
      return N.sqrt(evaluateNode(node.a, ctx));
    default:
      throw new Error(`知らない計算: ${node.t}`);
  }
}

// 閉じていない ( の数
export function openParens(items, upto = items.length) {
  let depth = 0;
  for (let i = 0; i < upto; i++) {
    if (items[i] === '(') depth++;
    else if (items[i] === ')') depth = Math.max(0, depth - 1);
  }
  return depth;
}

// 式を計算する（＝を押したとき）。閉じていない ( は最後に閉じる。
// 返す値：{ value, notes }。計算できなければ CalcError を投げる。
export function evaluate(items) {
  const tokens = lex(items);
  for (let k = openParens(items); k > 0; k--) tokens.push({ type: 'rp', value: ')', at: items.length });
  const tree = parse(tokens);
  const ctx = { notes: [] };
  const value = evaluateNode(tree, ctx);
  return { value, notes: ctx.notes };
}

// 打っている途中の式の答え（＝を押さなくても出す答え）
// 最後の演算子などは無視して計算してみる。
// 返す値：{ value, notes } … 答えが出た
//         { error }        … 0 で割ったなど、計算そのものができない
//         null             … 出すものがない（数を1つ打っただけ・式が途中で読めない）
export function preview(items) {
  let tokens;
  try {
    tokens = lex(items);
  } catch {
    return null;
  }
  while (tokens.length && ['op', 'lp', 'sqrt'].includes(tokens[tokens.length - 1].type)) tokens.pop();
  if (tokens.length === 0) return null;
  // 数を1つ打っただけなら、答えを出すまでもない（前の答えなどの部品1つは出す）
  if (tokens.length === 1 && tokens[0].type === 'num' && !isRef(items[tokens[0].at])) return null;
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'lp') depth++;
    else if (t.type === 'rp') depth--;
  }
  for (; depth > 0; depth--) tokens.push({ type: 'rp', value: ')' });
  try {
    const tree = parse(tokens);
    const ctx = { notes: [] };
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
