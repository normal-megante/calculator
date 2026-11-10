// =========================================================
// 式の読み取りと計算
//
// 式は「部品」の並び（配列）で持ちます。部品は
//   ・1文字の文字列 … '0'〜'9' '.' '+' '−' '×' '÷' '^' '(' ')' '%' '²' '√'
//   ・関数電卓の部品 … 'sin(' などの関数（「(」もかねる）、'π' 'e'、'!' '⁻¹'（後ろにつく）、
//                       'C' 'P'（nCr・nPr）
//                       ステップ14：'sinh(' 'gcd(' などの関数、','（log(2, 8) などの区切り）、
//                       'mod'（あまり。× ÷ と同じ順番）、'!!'（二重階乗）'#'（素数階乗）（後ろにつく）
//   ・{ ref: 数, label: 表示名 } … 前の答えや履歴の答え（全部の桁を持ったまま式に入る）
//   ・'x' 'k' … 変数（微分・積分・Σ・lim の式。compile で木にして evalTree で x の値を入れて計算）
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
//   ・「,」で数を区切る関数：log(底, 数)・ⁿ√(n, 数)・gcd(a, b, …)・lcm(a, b, …)
//   ・mod は × ÷ と同じ順番：2×7 mod 4 ＝ (2×7) mod 4 ＝ 2
// =========================================================
import * as N from './num.js';
import * as S from './sci.js';

const { CalcError } = N;
const HUNDRED = N.frac(100n);

// ASCII の記号も受け付ける（PC のキーボードや貼り付け用）
const ALIASES = { '-': '−', '*': '×', '/': '÷', '＋': '+', 'ー': '−', '－': '−' };

export function normalizeChar(ch) {
  return ALIASES[ch] ?? ch;
}

export const BINARY_OPS = ['+', '−', '×', '÷', '^', 'C', 'P', 'mod'];

// 関数の部品 → 名前
export const FN_TOKENS = {
  'sin(': 'sin', 'cos(': 'cos', 'tan(': 'tan',
  'asin(': 'asin', 'acos(': 'acos', 'atan(': 'atan',
  'log(': 'log', 'ln(': 'ln',
  'sinh(': 'sinh', 'cosh(': 'cosh', 'tanh(': 'tanh', 'abs(': 'abs', 'Γ(': 'gamma',
  'sf(': 'sf', 'hf(': 'hf', 'root(': 'root', 'gcd(': 'gcd', 'lcm(': 'lcm',
};
export const TRIG = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'];
const HYPERBOLIC = ['sinh', 'cosh', 'tanh'];

// 「,」で区切って入れる数の個数 [少なくとも, 多くても]（ほかの関数は 1 個だけ）
const ARITY = { log: [1, 2], root: [2, 2], gcd: [2, Infinity], lcm: [2, Infinity] };
const ARITY_HINT = {
  log: 'log は log(数) か、底を変えるときは log(底, 数) です（例：log(2, 8) ＝ 3）',
  root: 'ⁿ√ は ⁿ√(n, 数) のように、n と数を「,」で区切って打ちます（例：ⁿ√(3, 8) ＝ 2）',
  gcd: 'gcd は gcd(12, 18) のように、2つ以上の数を「,」で区切って打ちます',
  lcm: 'lcm は lcm(4, 6) のように、2つ以上の数を「,」で区切って打ちます',
};
const FN_SHOW = { root: 'ⁿ√', hf: 'H', gamma: 'Γ', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹' };
const COMMA_ONLY_IN = '「,」は log( ⁿ√( gcd( lcm( の中で、数を区切るときだけ使えます';

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

// 変数（微分・積分・lim は x、Σ は k）
export const isVar = (t) => t === 'x' || t === 'k';
export const usesVar = (items) => items.some(isVar);

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
    if (isVar(t)) {
      out.push({ type: 'var', value: t, at: i });
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
      '+': 'op', '−': 'op', '×': 'op', '÷': 'op', '^': 'op', 'C': 'op', 'P': 'op', 'mod': 'op',
      '(': 'lp', ')': 'rp', '%': 'pct', '²': 'sq', '√': 'sqrt', '!': 'fact', '⁻¹': 'inv',
      '!!': 'dfact', '#': 'prim', ',': 'comma',
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
      if (rest.type === 'comma') throw new CalcError(COMMA_ONLY_IN, 'syntax');
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

  // × ÷ mod（記号を省いたかけ算も）
  term() {
    let a = this.perm();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '×' || t.value === '÷')) {
        this.i++;
        a = { t: 'mul', op: t.value, a, b: this.perm() };
      } else if (t?.type === 'op' && t.value === 'mod') {
        this.i++;
        a = { t: 'mod', a, b: this.perm() };
      } else if (t && (t.type === 'num' || t.type === 'lp' || t.type === 'sqrt' || t.type === 'fn' || t.type === 'var')) {
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

  // 後ろにつく % ² ! ⁻¹ !! #
  postfix() {
    let a = this.primary();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'pct') { this.i++; a = { t: 'pct', a }; }
      else if (t?.type === 'sq') { this.i++; a = { t: 'sq', a }; }
      else if (t?.type === 'fact') { this.i++; a = { t: 'fact', a }; }
      else if (t?.type === 'inv') { this.i++; a = { t: 'inv', a }; }
      else if (t?.type === 'dfact') { this.i++; a = { t: 'dfact', a }; }
      else if (t?.type === 'prim') { this.i++; a = { t: 'prim', a }; }
      else return a;
    }
  }

  primary() {
    const t = this.tokens[this.i++];
    if (!t) throw new CalcError('式が途中で終わっています', 'incomplete');
    switch (t.type) {
      case 'num':
        return { t: 'num', v: t.value };
      case 'var':
        return { t: 'var', name: t.value };
      case 'lp': {
        if (this.peek()?.type === 'rp') throw new CalcError('( ) の中が空です', 'syntax');
        const a = this.sum();
        const close = this.tokens[this.i++];
        if (!close) throw new CalcError('「)」が足りません', 'incomplete');
        if (close.type === 'comma') throw new CalcError(COMMA_ONLY_IN, 'syntax');
        if (close.type !== 'rp') throw new CalcError('式の形が正しくありません', 'syntax');
        return { t: 'group', a };
      }
      case 'sqrt':
        return { t: 'sqrt', a: this.unary() };
      case 'fn': {
        const show = FN_SHOW[t.name] ?? t.name;
        if (this.peek()?.type === 'rp') throw new CalcError(`${show}( ) の中が空です`, 'syntax');
        // 「,」で区切った数（log(2, 8) など）
        const args = [this.sum()];
        while (this.peek()?.type === 'comma') {
          this.i++;
          const next = this.peek();
          if (!next || next.type === 'rp' || next.type === 'comma') throw new CalcError('「,」のあとに数がありません', 'incomplete');
          args.push(this.sum());
        }
        const close = this.tokens[this.i++];
        if (!close) throw new CalcError('「)」が足りません', 'incomplete');
        if (close.type !== 'rp') throw new CalcError('式の形が正しくありません', 'syntax');
        const [min, max] = ARITY[t.name] ?? [1, 1];
        if (args.length < min || args.length > max) {
          throw new CalcError(ARITY_HINT[t.name] ?? `${show}( の中には、数を1つだけ入れます（「,」は使えません）`, 'syntax');
        }
        return { t: 'fn', name: t.name, a: args[0], args };
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
//           ステップ14：'logb'（a ＝ 底, b ＝ 数）'nroot'（a ＝ n, b ＝ 数）'gcd' 'lcm'（list ＝ 数の並び）
//                       'mod'（q ＝ 商）'!!' '#' 'sf' 'hf' 'gamma' 'sinh' 'cosh' 'tanh' 'abs'
//   aFrom : a が前のステップの答えなら、そのステップの番号（数をそのまま打ったなら null）
// ---------------------------------------------------------
function record(ctx, node, step) {
  ctx.steps.push(step);
  node.step = ctx.steps.length - 1;
  return step.result;
}

const from = (node) => node.step ?? null;

// 関数の注意書き（同じものは1回だけ。画面の文は main.js）
function fnNote(ctx, name) {
  if (!ctx.notes.some((n) => n.kind === 'fn' && n.name === name)) ctx.notes.push({ kind: 'fn', name });
}

// 「,」で区切った数の関数
function evaluateMulti(node, ctx) {
  const list = node.args.map((arg) => evaluateNode(arg, ctx));
  const froms = node.args.map(from);
  const step = { a: list[0], b: list[1], aFrom: froms[0], bFrom: froms[1] };
  switch (node.name) {
    case 'log':
      fnNote(ctx, 'logb');
      return record(ctx, node, { op: 'logb', ...step, result: S.logb(list[0], list[1]) });
    case 'root':
      fnNote(ctx, 'nroot');
      return record(ctx, node, { op: 'nroot', ...step, result: S.root(list[0], list[1]) });
    case 'gcd':
    case 'lcm':
      fnNote(ctx, node.name);
      return record(ctx, node, {
        op: node.name, ...step, list, froms, result: node.name === 'gcd' ? S.gcdOf(list) : S.lcmOf(list),
      });
    default:
      throw new Error(`知らない関数: ${node.name}`);
  }
}

function evaluateNode(node, ctx) {
  switch (node.t) {
    case 'num':
      return node.v;
    case 'var':
      if (!ctx.x) throw new CalcError(`${node.name} は、ここでは使えません`, 'syntax');
      return ctx.x;
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
      if (node.args?.length > 1) return evaluateMulti(node, ctx);
      const a = evaluateNode(node.a, ctx);
      const step = { op: node.name, a, aFrom: from(node.a) };
      if (TRIG.includes(node.name)) {
        step.angle = ctx.angle;
        if (!ctx.notes.some((n) => n.kind === 'angle')) ctx.notes.push({ kind: 'angle', angle: ctx.angle });
      }
      if (HYPERBOLIC.includes(node.name)) fnNote(ctx, 'hyp');
      else if (['sf', 'hf', 'gamma'].includes(node.name)) fnNote(ctx, node.name);
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
    case 'dfact': {
      const a = evaluateNode(node.a, ctx);
      fnNote(ctx, 'dfact');
      return record(ctx, node, { op: '!!', a, result: S.doubleFactorial(a), aFrom: from(node.a) });
    }
    case 'prim': {
      const a = evaluateNode(node.a, ctx);
      fnNote(ctx, 'prim');
      return record(ctx, node, { op: '#', a, result: S.primorial(a), aFrom: from(node.a) });
    }
    case 'mod': {
      const a = evaluateNode(node.a, ctx);
      const b = evaluateNode(node.b, ctx);
      const { q, r } = S.mod(a, b);
      fnNote(ctx, 'mod');
      return record(ctx, node, { op: 'mod', a, b, q, result: r, aFrom: from(node.a), bFrom: from(node.b) });
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
    case 'sinh': return S.sinh(a);
    case 'cosh': return S.cosh(a);
    case 'tanh': return S.tanh(a);
    case 'abs': return S.abs(a);
    case 'gamma': return S.gamma(a);
    case 'sf': return S.superfactorial(a);
    case 'hf': return S.hyperfactorial(a);
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

// 変数の入った式を、計算の木にしておく（x の値を変えて何度も計算するとき。閉じていない ( は閉じる）
export function compile(items) {
  const tokens = lex(items);
  for (let k = openParens(items); k > 0; k--) tokens.push({ type: 'rp', value: ')', at: items.length });
  return parse(tokens);
}

// 計算の木を、x に値を入れて計算する（ステップや注意書きは残さない）
export function evalTree(tree, { x = null, angle = S.getAngle() } = {}) {
  return evaluateNode(tree, { notes: [], steps: [], angle, x });
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
  // 「log(2,」のように「,」で終わっているときは、まだ答えを出さない（log 2 とまちがえないように）
  if (tokens.length && tokens[tokens.length - 1].type === 'comma') return null;
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

// 式を文字にする（履歴の検索用）
export function itemsToText(items) {
  return items.map((t) => (isRef(t) ? `〔${t.label}〕` : t)).join('');
}

// 小数点が2つ以上ある数（1.2.3）の部品の位置。電卓では打てるが、直すまで答えは出さない（ステップ18）
export function doubleDotMarks(items) {
  const marks = new Set();
  for (let i = 0; i < items.length;) {
    if (!isDigit(items[i]) && items[i] !== '.') {
      i++;
      continue;
    }
    let end = i;
    let dots = 0;
    for (; end < items.length && (isDigit(items[end]) || items[end] === '.'); end++) {
      if (items[end] === '.') dots++;
    }
    if (dots > 1) for (let k = i; k < end; k++) marks.add(k);
    i = end;
  }
  return marks;
}

// ---------------------------------------------------------
// 式のコピー・貼り付け（ステップ18）
// ---------------------------------------------------------

// 部品の画面での書き方（asin( は sin⁻¹( と書く）
const SHOW_AS = { 'asin(': 'sin⁻¹(', 'acos(': 'cos⁻¹(', 'atan(': 'tan⁻¹(', 'root(': 'ⁿ√(', 'hf(': 'H(' };
export const tokenText = (t) => SHOW_AS[t] ?? t;

// 式 → コピーする文字（12×(3+4) のように。貼り付けると同じ式にもどる）
//   refText(数) … 答えの部品を、数の書き方にする（format.js の pasteText）
export function itemsToCopyText(items, refText) {
  const touches = (t) => t !== undefined && (isDigit(t) || t === '.' || isRef(t) || t === 'π' || t === 'e');
  return items.map((t, i) => {
    if (isRef(t)) {
      const text = refText(t.ref);
      // まわりとくっつくと別の数になるときや、− ÷ などがあるときは ( ) でかこむ
      const wrap = items.length > 1 && (/[−÷×^]/.test(text) || touches(items[i - 1]) || touches(items[i + 1]));
      return wrap ? `(${text})` : text;
    }
    if (t === ',') return ', ';
    if (t === 'mod') return ' mod ';
    return tokenText(t);
  }).join('');
}

// 貼り付けで読む言葉（長いものから。大文字・小文字は区別しない）
const PASTE_WORDS = [
  ['sin⁻¹(', ['asin(']], ['cos⁻¹(', ['acos(']], ['tan⁻¹(', ['atan(']],
  ['arcsin(', ['asin(']], ['arccos(', ['acos(']], ['arctan(', ['atan(']],
  ['asin(', ['asin(']], ['acos(', ['acos(']], ['atan(', ['atan(']],
  ['sinh(', ['sinh(']], ['cosh(', ['cosh(']], ['tanh(', ['tanh(']],
  ['sin(', ['sin(']], ['cos(', ['cos(']], ['tan(', ['tan(']],
  ['log(', ['log(']], ['ln(', ['ln(']], ['abs(', ['abs(']], ['gamma(', ['Γ(']], ['γ(', ['Γ(']],
  ['sf(', ['sf(']], ['hf(', ['hf(']], ['root(', ['root(']], ['ⁿ√(', ['root(']],
  ['gcd(', ['gcd(']], ['lcm(', ['lcm(']], ['exp(', ['e', '^', '(']],
  ['mod', ['mod']], ['pi', ['π']], ['**', ['^']], ['!!', ['!!']], ['⁻¹', ['⁻¹']],
];
// 1文字ずつ読む記号
const PASTE_CHARS = {
  '.': '.', '+': '+', '−': '−', '-': '−', 'ー': '−', '‐': '−', '–': '−', '—': '−', '―': '−',
  '×': '×', '*': '×', '✕': '×', '✖': '×', 'x': '×', 'X': '×', '·': '×', '⋅': '×',
  '÷': '÷', '/': '÷', '∕': '÷', '^': '^', '(': '(', ')': ')', '%': '%', '√': '√',
  'π': 'π', 'e': 'e', 'C': 'C', 'P': 'P', '!': '!', '#': '#', '²': '²', ',': ',', '、': ',',
};
const SUPER_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const COMMA_FNS = ['log(', 'root(', 'gcd(', 'lcm('];

// 全角の英数字・記号 → 半角
function halfWidth(text) {
  return text.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// 貼り付けた文字 → 式の部品の並び。読めなければ CalcError（何が読めないか）を投げる
//   ・空白・3桁ごとのカンマ（1,234）・「…」は飛ばす
//   ・「=」があれば、その左の式（左がなければ右）
//   ・* / - や全角の数字、sin⁻¹( ⁿ√( H( などの画面の書き方、1.5E3（＝1.5×10^3）も読む
export function textToItems(text) {
  let s = halfWidth(String(text)).replace(/[\s\u00A0\u3000]+/g, '').replace(/…/g, '');
  if (s.includes('=')) {
    const sides = s.split('=');
    s = sides[0] || sides[1] || '';
  }
  if (s.length > 200000) throw new CalcError('長すぎて貼り付けられません', 'syntax');
  const lower = s.toLowerCase();
  const items = [];
  const opens = []; // 開いている ( や関数（「,」が区切りか、3桁ごとのカンマかを決める）
  const push = (...parts) => {
    for (const p of parts) {
      items.push(p);
      if (isOpen(p)) opens.push(p);
      else if (p === ')') opens.pop();
    }
  };
  let i = 0;
  scan: while (i < s.length) {
    for (const [word, parts] of PASTE_WORDS) {
      if (lower.startsWith(word, i)) {
        push(...parts);
        i += word.length;
        continue scan;
      }
    }
    const ch = s[i];
    if (ch === 'H' && s[i + 1] === '(') {
      push('hf(');
      i += 2;
      continue;
    }
    const fn = /^(?:(?:arc)?(?:sin|cos|tan)h?|log|ln|abs|gamma|sf|hf|root|gcd|lcm|exp)/.exec(lower.slice(i, i + 8));
    if (fn) throw new CalcError(`「${s.slice(i, i + fn[0].length)}」の後ろには ( をつけてください（例：sin(30)）`, 'syntax');
    if (isDigit(ch)) {
      push(ch);
      i++;
      continue;
    }
    if (ch === ',' || ch === '、') {
      // 3桁ごとのカンマ（1,234）は飛ばす。log( などの中で数を区切る「,」はそのまま
      const thousands = isDigit(items[items.length - 1]) && /^.\d{3}(?!\d)/.test(s.slice(i, i + 5))
        && !COMMA_FNS.includes(opens[opens.length - 1]);
      if (!thousands) push(',');
      i++;
      continue;
    }
    // 1.5E3 ＝ 1.5×10^3
    if (ch === 'E') {
      const m = /^E([+\-−]?)(\d+)/.exec(s.slice(i));
      const prev = items[items.length - 1];
      if (m && (isDigit(prev) || prev === '.')) {
        const digits = [...m[2]];
        push('×', '1', '0', '^', ...(m[1] === '-' || m[1] === '−' ? ['(', '−', ...digits, ')'] : digits));
        i += m[0].length;
        continue;
      }
    }
    // 右上の小さい数字：² はそのまま、ほかは ^（10³ ＝ 10^3、2⁻² ＝ 2^(−2)）
    if (SUPER_DIGITS.includes(ch) || (ch === '⁻' && SUPER_DIGITS.includes(s[i + 1] ?? ''))) {
      const minus = ch === '⁻';
      let j = minus ? i + 1 : i;
      let digits = '';
      while (j < s.length && SUPER_DIGITS.includes(s[j])) digits += SUPER_DIGITS.indexOf(s[j++]);
      if (!minus && digits === '2') push('²');
      else push('^', ...(minus ? ['(', '−', ...digits, ')'] : [...digits]));
      i = j;
      continue;
    }
    if (PASTE_CHARS[ch]) {
      push(PASTE_CHARS[ch]);
      i++;
      continue;
    }
    if (ch === '〔' || ch === '[') throw new CalcError('〔 〕の「答え」の部品は貼り付けられません（数で書いてください）', 'syntax');
    throw new CalcError(`読めない文字があります：「${String.fromCodePoint(s.codePointAt(i))}」`, 'syntax');
  }
  if (items.length === 0) throw new CalcError('貼り付ける式がありません', 'syntax');
  return items;
}
