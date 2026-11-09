// =========================================================
// 物理・電気の公式（画面なし・テストあり）
//
//   公式は「どの量を求めるか」をえらべる（V ＝ I × R なら V・I・R のどれでも）
//   かけ算・割り算だけの公式（y ＝ k × x₁^e₁ × x₂^e₂ …、mono）は、式の変形を自動で作る
//   たし算がある公式（合成抵抗・等加速度運動、special）は、求める量ごとに式を書いておく
//   数は num.js の正確な分数（√ がいるときだけ概数）
//
// 単位：量の種類（QTY）ごとに単位の大きさを分数で持つ。公式ごとに「この単位で公式が成り立つ」
//   という単位（base）を決めておき、打った数はまず base の単位にしてから計算する
// =========================================================
import * as N from './num.js';
import { CalcError } from './num.js';
import { valueText } from './unit.js';

const q = (s) => {
  const [n, d = '1'] = String(s).split('/');
  return N.div(N.parseDecimal(n), N.parseDecimal(d));
};
const TWO = N.frac(2n);

// ---------------------------------------------------------
// 量の種類と単位（[画面の名前, 大きさ]。大きさは種類の中の基準の単位のいくつ分か）
//   pos … 0 より大きい量（マイナスになったら注意書き）
// ---------------------------------------------------------
const QTY = {
  volt: { units: [['V', '1'], ['mV', '1/1000'], ['kV', '1000']] },
  amp: { units: [['A', '1'], ['mA', '1/1000'], ['μA', '1/1000000']] },
  ohm: { pos: true, units: [['Ω', '1'], ['kΩ', '1000'], ['MΩ', '1000000']] },
  watt: { units: [['W', '1'], ['kW', '1000'], ['mW', '1/1000']] },
  joule: { units: [['J', '1'], ['kJ', '1000'], ['Wh', '3600'], ['kWh', '3600000'], ['cal', '4.184'], ['kcal', '4184']] },
  sec: { pos: true, units: [['秒', '1'], ['分', '60'], ['時間', '3600']] },
  coul: { units: [['C', '1'], ['mAh', '3.6'], ['Ah', '3600']] },
  meter: { units: [['m', '1'], ['cm', '1/100'], ['mm', '1/1000'], ['km', '1000']] },
  mps: { units: [['m/s', '1'], ['km/h', '5/18']] },
  mps2: { units: [['m/s²', '1']] },
  kg: { pos: true, units: [['kg', '1'], ['g', '1/1000'], ['t', '1000']] },
  newton: { units: [['N', '1'], ['kN', '1000']] },
  m2: { pos: true, units: [['m²', '1'], ['cm²', '1/10000'], ['mm²', '1/1000000']] },
  m3: { pos: true, units: [['m³', '1'], ['L', '1/1000'], ['cm³', '1/1000000'], ['mL', '1/1000000']] },
  pascal: { units: [['Pa', '1'], ['hPa', '100'], ['kPa', '1000'], ['MPa', '1000000'], ['気圧', '101325']] },
  dens: { pos: true, units: [['kg/m³', '1'], ['g/cm³', '1000']] },
  hz: { pos: true, units: [['Hz', '1'], ['kHz', '1000'], ['MHz', '1000000']] },
  dtemp: { units: [['K', '1'], ['℃', '1']] },
  spheat: { pos: true, units: [['J/(g·K)', '1000'], ['J/(kg·K)', '1']] },
  yen: { units: [['円', '1']] },
  price: { pos: true, units: [['円/kWh', '1']] },
  day: { pos: true, units: [['日', '1']] },
};
for (const k of Object.keys(QTY)) QTY[k].units = QTY[k].units.map(([sym, f]) => ({ sym, f: q(f) }));

export const CATS = [
  { key: 'elec', name: '電気' },
  { key: 'motion', name: '力と運動' },
  { key: 'energy', name: 'エネルギー' },
  { key: 'wave', name: '熱・波' },
];

const G_NOTE = 'g は地球の重力加速度（9.8 m/s²。くわしくは 9.80665）';

// 公式の一覧
//   vars：[key, 画面の名前, 量の種類, 公式の単位, { sym, unit（はじめの単位）, preset（はじめの数）}]
//   mono：[左の量, 係数 k, [[右の量, 何乗か], …]]（y ＝ k × x₁^e₁ × …）
//   special：たし算がある公式（下の SPECIAL）
const RAW = [
  // 電気
  {
    key: 'ohm', cat: 'elec', name: 'オームの法則', show: 'V ＝ I × R',
    mono: ['V', '1', [['I', 1], ['R', 1]]],
    vars: [['V', '電圧', 'volt', 'V'], ['I', '電流', 'amp', 'A'], ['R', '抵抗', 'ohm', 'Ω']],
  },
  {
    key: 'power', cat: 'elec', name: '電力', show: 'P ＝ V × I',
    mono: ['P', '1', [['V', 1], ['I', 1]]],
    vars: [['P', '電力', 'watt', 'W'], ['V', '電圧', 'volt', 'V'], ['I', '電流', 'amp', 'A']],
  },
  {
    key: 'powerR', cat: 'elec', name: '電力（電流と抵抗）', show: 'P ＝ I² × R',
    mono: ['P', '1', [['I', 2], ['R', 1]]],
    vars: [['P', '電力', 'watt', 'W'], ['I', '電流', 'amp', 'A'], ['R', '抵抗', 'ohm', 'Ω']],
  },
  {
    key: 'powerV', cat: 'elec', name: '電力（電圧と抵抗）', show: 'P ＝ V² ÷ R',
    mono: ['P', '1', [['V', 2], ['R', -1]]],
    vars: [['P', '電力', 'watt', 'W'], ['V', '電圧', 'volt', 'V'], ['R', '抵抗', 'ohm', 'Ω']],
  },
  {
    key: 'energy', cat: 'elec', name: '電力量', show: 'W ＝ P × t',
    mono: ['W', '1', [['P', 1], ['t', 1]]],
    vars: [['W', '電力量', 'joule', 'J', { unit: 'Wh' }], ['P', '電力', 'watt', 'W'], ['t', '時間', 'sec', '秒', { unit: '時間' }]],
    note: '1 Wh ＝ 1W で 1時間、1 kWh ＝ 1000 Wh ＝ 3600000 J',
  },
  {
    key: 'bill', cat: 'elec', name: '電気代', show: '電気代 ＝ P × t × 日数 × 単価',
    mono: ['cost', '1', [['P', 1], ['t', 1], ['days', 1], ['price', 1]]],
    vars: [
      ['cost', '電気代', 'yen', '円', { sym: '電気代' }],
      ['P', '消費電力', 'watt', 'kW', { unit: 'W' }],
      ['t', '1日に使う時間', 'sec', '時間'],
      ['days', '日数', 'day', '日', { sym: '日数', preset: '30' }],
      ['price', '電気の単価', 'price', '円/kWh', { sym: '単価', preset: '31' }],
    ],
    note: '単価は電力会社やプランでちがいます（31円/kWh は目安）。消費電力は家電に書いてある W の数（いつも最大で動くわけではないので、実際はもっと安いことが多い）',
  },
  {
    key: 'charge', cat: 'elec', name: '電気量（電池）', show: 'Q ＝ I × t',
    mono: ['Q', '1', [['I', 1], ['t', 1]]],
    vars: [['Q', '電気量', 'coul', 'C', { unit: 'mAh' }], ['I', '電流', 'amp', 'A', { unit: 'mA' }], ['t', '時間', 'sec', '秒', { unit: '時間' }]],
    note: 'mAh は電池の容量でよく使う単位（1 mAh ＝ 3.6 C）。実際の電池は、書いてある容量より早く切れることが多い',
  },
  {
    key: 'series', cat: 'elec', name: '合成抵抗（直列）', show: 'R ＝ R₁ ＋ R₂', special: 'series',
    vars: [['R', '合成抵抗', 'ohm', 'Ω'], ['R1', '抵抗1', 'ohm', 'Ω', { sym: 'R₁' }], ['R2', '抵抗2', 'ohm', 'Ω', { sym: 'R₂' }]],
    note: '3つ以上は、2つずつ順に計算できます（答えを次の R₁ に）',
  },
  {
    key: 'parallel', cat: 'elec', name: '合成抵抗（並列）', show: '1/R ＝ 1/R₁ ＋ 1/R₂', special: 'parallel',
    vars: [['R', '合成抵抗', 'ohm', 'Ω'], ['R1', '抵抗1', 'ohm', 'Ω', { sym: 'R₁' }], ['R2', '抵抗2', 'ohm', 'Ω', { sym: 'R₂' }]],
    note: '並列の合成抵抗は、どちらの抵抗よりも小さくなります。3つ以上は、2つずつ順に計算できます',
  },
  // 力と運動
  {
    key: 'speed', cat: 'motion', name: '速さ', show: 'v ＝ x ÷ t',
    mono: ['v', '1', [['x', 1], ['t', -1]]],
    vars: [['v', '速さ', 'mps', 'm/s', { unit: 'km/h' }], ['x', '距離', 'meter', 'm', { unit: 'km' }], ['t', '時間', 'sec', '秒', { unit: '時間' }]],
  },
  {
    key: 'accel', cat: 'motion', name: '等加速度（速さ）', show: 'v ＝ v₀ ＋ a × t', special: 'accel',
    vars: [['v', '後の速さ', 'mps', 'm/s'], ['v0', 'はじめの速さ', 'mps', 'm/s', { sym: 'v₀' }], ['a', '加速度', 'mps2', 'm/s²'], ['t', '時間', 'sec', '秒']],
    note: '向きのある量です。逆向き（ブレーキで減るときの a など）はマイナスで入れます',
  },
  {
    key: 'accel2', cat: 'motion', name: '等加速度（距離）', show: 'v² − v₀² ＝ 2 × a × x', special: 'accel2',
    vars: [['v', '後の速さ', 'mps', 'm/s'], ['v0', 'はじめの速さ', 'mps', 'm/s', { sym: 'v₀' }], ['a', '加速度', 'mps2', 'm/s²'], ['x', '進んだ距離', 'meter', 'm']],
    note: '向きのある量です。ブレーキで止まるときは a をマイナスで入れます',
  },
  {
    key: 'newton', cat: 'motion', name: '運動方程式', show: 'F ＝ m × a',
    mono: ['F', '1', [['m', 1], ['a', 1]]],
    vars: [['F', '力', 'newton', 'N'], ['m', '質量', 'kg', 'kg'], ['a', '加速度', 'mps2', 'm/s²']],
  },
  {
    key: 'weight', cat: 'motion', name: '重さ（重力）', show: 'W ＝ m × g',
    mono: ['W', '1', [['m', 1], ['g', 1]]],
    vars: [['W', '重さ（重力）', 'newton', 'N'], ['m', '質量', 'kg', 'kg'], ['g', '重力加速度', 'mps2', 'm/s²', { preset: '9.8' }]],
    note: `${G_NOTE}。重さ（N）と質量（kg）はちがう量です`,
  },
  {
    key: 'pressure', cat: 'motion', name: '圧力', show: 'p ＝ F ÷ S',
    mono: ['p', '1', [['F', 1], ['S', -1]]],
    vars: [['p', '圧力', 'pascal', 'Pa'], ['F', '力', 'newton', 'N'], ['S', '面積', 'm2', 'm²']],
    note: '1気圧 ＝ 101325 Pa ＝ 1013.25 hPa',
  },
  {
    key: 'density', cat: 'motion', name: '密度', show: 'ρ ＝ m ÷ V',
    mono: ['rho', '1', [['m', 1], ['V', -1]]],
    vars: [['rho', '密度', 'dens', 'kg/m³', { sym: 'ρ', unit: 'g/cm³' }], ['m', '質量', 'kg', 'kg', { unit: 'g' }], ['V', '体積', 'm3', 'm³', { unit: 'cm³' }]],
    note: '水の密度は約 1 g/cm³（1 g/cm³ ＝ 1000 kg/m³）',
  },
  // エネルギー
  {
    key: 'work', cat: 'energy', name: '仕事', show: 'W ＝ F × x',
    mono: ['W', '1', [['F', 1], ['x', 1]]],
    vars: [['W', '仕事', 'joule', 'J'], ['F', '力', 'newton', 'N'], ['x', '動かした距離', 'meter', 'm']],
    note: '力の向きに動かした距離で計算します',
  },
  {
    key: 'workPower', cat: 'energy', name: '仕事率', show: 'P ＝ W ÷ t',
    mono: ['P', '1', [['W', 1], ['t', -1]]],
    vars: [['P', '仕事率', 'watt', 'W'], ['W', '仕事', 'joule', 'J'], ['t', '時間', 'sec', '秒']],
  },
  {
    key: 'kinetic', cat: 'energy', name: '運動エネルギー', show: 'K ＝ 1/2 × m × v²',
    mono: ['K', '1/2', [['m', 1], ['v', 2]]],
    vars: [['K', '運動エネルギー', 'joule', 'J'], ['m', '質量', 'kg', 'kg'], ['v', '速さ', 'mps', 'm/s']],
  },
  {
    key: 'potential', cat: 'energy', name: '位置エネルギー', show: 'U ＝ m × g × h',
    mono: ['U', '1', [['m', 1], ['g', 1], ['h', 1]]],
    vars: [['U', '位置エネルギー', 'joule', 'J'], ['m', '質量', 'kg', 'kg'], ['g', '重力加速度', 'mps2', 'm/s²', { preset: '9.8' }], ['h', '高さ', 'meter', 'm']],
    note: G_NOTE,
  },
  // 熱・波
  {
    key: 'heat', cat: 'wave', name: '熱量', show: 'Q ＝ m × c × ΔT',
    mono: ['Q', '1', [['m', 1], ['c', 1], ['dT', 1]]],
    vars: [
      ['Q', '熱量', 'joule', 'J'],
      ['m', '質量', 'kg', 'kg', { unit: 'g' }],
      ['c', '比熱', 'spheat', 'J/(kg·K)', { unit: 'J/(g·K)', preset: '4.2' }],
      ['dT', '温度の変化', 'dtemp', 'K', { sym: 'ΔT', unit: '℃' }],
    ],
    note: '比熱 4.2 J/(g·K) は水（ほかの物はちがう数）。温度の変化は ℃ でも K でも同じ数（後の温度 − はじめの温度）',
  },
  {
    key: 'wave', cat: 'wave', name: '波の速さ', show: 'v ＝ f × λ',
    mono: ['v', '1', [['f', 1], ['lam', 1]]],
    vars: [['v', '速さ', 'mps', 'm/s'], ['f', '振動数', 'hz', 'Hz'], ['lam', '波長', 'meter', 'm', { sym: 'λ' }]],
    note: '空気中の音の速さは約 340 m/s',
  },
  {
    key: 'period', cat: 'wave', name: '周期', show: 'T ＝ 1 ÷ f',
    mono: ['T', '1', [['f', -1]]],
    vars: [['T', '周期', 'sec', '秒'], ['f', '振動数', 'hz', 'Hz']],
    note: '周期は1回ゆれるのにかかる時間、振動数は1秒にゆれる回数',
  },
];

export const FORMULAS = RAW.map((f) => ({
  ...f,
  mono: f.mono && [f.mono[0], q(f.mono[1]), f.mono[2]],
  vars: f.vars.map(([key, name, qty, base, o = {}]) => ({
    key, name, qty, base, sym: o.sym ?? key, unit: o.unit ?? base, preset: o.preset ?? '', pos: !!QTY[qty].pos,
  })),
}));

export const formulaByKey = (key) => FORMULAS.find((f) => f.key === key) ?? null;
export const formulasOf = (cat) => FORMULAS.filter((f) => f.cat === cat);
export const varOf = (f, key) => f.vars.find((v) => v.key === key) ?? null;
export const unitsOf = (v) => QTY[v.qty].units;
export const unitOf = (v, sym) => unitsOf(v).find((u) => u.sym === sym) ?? null;
const symOf = (f, key) => varOf(f, key).sym;

// その単位の 1 は、公式の単位でいくつか
export function factor(v, sym) {
  return N.div(unitOf(v, sym).f, unitOf(v, v.base).f);
}

// ---------------------------------------------------------
// 数の書き方
// ---------------------------------------------------------
export const numText = (x) => valueText(x).text;
const paren = (x) => (N.sign(x) < 0 ? `(${numText(x)})` : numText(x)); // 式の中のマイナスの数はかっこに

function divide(a, b, what) {
  if (N.isZero(b)) throw new CalcError(`${what}が 0 なので割れません`);
  return N.div(a, b);
}
function root(x) {
  if (N.sign(x) < 0) throw new CalcError('√ の中がマイナスになりました（この数の組み合わせでは答えがありません）');
  return N.sqrt(x);
}

// 2つの数がほぼ同じか（√ で概数になったとき。ちがいが大きさより 40 桁以上小さければ同じ）
export function near(a, b) {
  if (N.cmp(a, b) === 0) return true;
  const d = N.absNum(N.sub(a, b));
  if (N.isZero(d)) return true;
  const lg = (x) => (N.isZero(x) ? -Infinity : N.approxLog10(N.absNum(x)));
  return lg(d) < Math.max(lg(a), lg(b)) - 40;
}

// ---------------------------------------------------------
// かけ算・割り算だけの公式（mono）
// ---------------------------------------------------------

// 求める量 target の式：target^p ＝ c × (num のかけ算) ÷ (den のかけ算)
function monoParts(f, target) {
  const [lhs, k, rhs] = f.mono;
  const fac = (list, sign) => list.filter(([, e]) => Math.sign(e) === sign).map(([key, e]) => ({ key, pow: Math.abs(e) }));
  if (target === lhs) return { c: k, num: fac(rhs, 1), den: fac(rhs, -1), p: 1 };
  const ej = rhs.find(([key]) => key === target)[1];
  const others = rhs.filter(([key]) => key !== target);
  let num = [{ key: lhs, pow: 1 }, ...fac(others, -1)];
  let den = fac(others, 1);
  let c = N.div(N.ONE, k);
  if (ej < 0) {
    [num, den] = [den, num];
    c = k;
  }
  return { c, num, den, p: Math.abs(ej) };
}

const sq = (x, pow) => (pow === 2 ? N.mul(x, x) : x);
const powSym = (s, pow) => (pow === 2 ? `${s}²` : s);

// 係数・かけ算・割り算を文字に：「2 × K ÷ m」「U ÷ (m × g)」
function joinExpr(c, num, den) {
  const n = [...(c.n !== 1n ? [String(c.n)] : []), ...num];
  const d = [...(c.d !== 1n ? [String(c.d)] : []), ...den];
  let s = n.length ? n.join(' × ') : '1';
  if (d.length) s += ` ÷ ${d.length > 1 ? `(${d.join(' × ')})` : d[0]}`;
  return s;
}

function monoSolve(f, target, X) {
  const parts = monoParts(f, target);
  const sym = symOf(f, target);
  const symExpr = joinExpr(parts.c, parts.num.map((t) => powSym(symOf(f, t.key), t.pow)), parts.den.map((t) => powSym(symOf(f, t.key), t.pow)));
  const numExpr = joinExpr(parts.c, parts.num.map((t) => powSym(paren(X[t.key]), t.pow)), parts.den.map((t) => powSym(paren(X[t.key]), t.pow)));
  let v = parts.c;
  for (const t of parts.num) v = N.mul(v, sq(X[t.key], t.pow));
  for (const t of parts.den) v = divide(v, sq(X[t.key], t.pow), varOf(f, t.key).name);
  if (parts.p === 2) {
    return { value: root(v), form: [`${sym}² ＝ ${symExpr}`, `${sym} ＝ √(${symExpr})`], calc: `√(${numExpr})`, plus: true };
  }
  return { value: v, form: [`${sym} ＝ ${symExpr}`], calc: numExpr, plus: false };
}

// 答えを元の公式に入れる：左と右
function monoSides(f, X) {
  const [lhs, k, rhs] = f.mono;
  const num = rhs.filter(([, e]) => e > 0);
  const den = rhs.filter(([, e]) => e < 0);
  let right = k;
  for (const [key, e] of num) right = N.mul(right, sq(X[key], e));
  for (const [key, e] of den) right = N.div(right, sq(X[key], -e));
  const text = (show) => {
    const head = k.n !== 1n || k.d !== 1n ? [`${k.n}/${k.d}`.replace(/\/1$/, '')] : [];
    const n = [...head, ...num.map(([key, e]) => powSym(show(key), e))];
    const d = den.map(([key, e]) => powSym(show(key), -e));
    let s = n.length ? n.join(' × ') : '1';
    if (d.length) s += ` ÷ ${d.length > 1 ? `(${d.join(' × ')})` : d[0]}`;
    return s;
  };
  return {
    left: X[lhs],
    leftText: `${symOf(f, lhs)} ＝ ${numText(X[lhs])}`,
    right,
    rightText: `${text((key) => symOf(f, key))} ＝ ${text((key) => paren(X[key]))}`,
  };
}

// ---------------------------------------------------------
// たし算がある公式（special）：求める量ごとの式
//   calc(X, t) → [値, 数を入れた式の文字]（t は数の文字。マイナスはかっこつき）
// ---------------------------------------------------------
const SPECIAL = {
  series: {
    solve: {
      R: { form: ['R ＝ R₁ ＋ R₂'], calc: (X, t) => [N.add(X.R1, X.R2), `${t.R1} ＋ ${t.R2}`] },
      R1: { form: ['R₁ ＝ R − R₂'], calc: (X, t) => [N.sub(X.R, X.R2), `${t.R} − ${t.R2}`] },
      R2: { form: ['R₂ ＝ R − R₁'], calc: (X, t) => [N.sub(X.R, X.R1), `${t.R} − ${t.R1}`] },
    },
    sides: (X, t) => ({ left: X.R, leftText: `R ＝ ${t.R}`, right: N.add(X.R1, X.R2), rightText: `R₁ ＋ R₂ ＝ ${t.R1} ＋ ${t.R2}` }),
  },
  parallel: {
    solve: {
      R: {
        form: ['1/R ＝ 1/R₁ ＋ 1/R₂', 'R ＝ R₁ × R₂ ÷ (R₁ ＋ R₂)'],
        calc: (X, t) => [divide(N.mul(X.R1, X.R2), N.add(X.R1, X.R2), 'R₁ ＋ R₂ '), `${t.R1} × ${t.R2} ÷ (${t.R1} ＋ ${t.R2})`],
      },
      R1: {
        form: ['1/R₁ ＝ 1/R − 1/R₂', 'R₁ ＝ R × R₂ ÷ (R₂ − R)'],
        calc: (X, t) => [divide(N.mul(X.R, X.R2), N.sub(X.R2, X.R), 'R₂ − R '), `${t.R} × ${t.R2} ÷ (${t.R2} − ${t.R})`],
      },
      R2: {
        form: ['1/R₂ ＝ 1/R − 1/R₁', 'R₂ ＝ R × R₁ ÷ (R₁ − R)'],
        calc: (X, t) => [divide(N.mul(X.R, X.R1), N.sub(X.R1, X.R), 'R₁ − R '), `${t.R} × ${t.R1} ÷ (${t.R1} − ${t.R})`],
      },
    },
    sides: (X, t) => ({
      left: divide(N.ONE, X.R, 'R '),
      leftText: `1/R ＝ 1 ÷ ${t.R}`,
      right: N.add(divide(N.ONE, X.R1, 'R₁ '), divide(N.ONE, X.R2, 'R₂ ')),
      rightText: `1/R₁ ＋ 1/R₂ ＝ 1 ÷ ${t.R1} ＋ 1 ÷ ${t.R2}`,
    }),
  },
  accel: {
    solve: {
      v: { form: ['v ＝ v₀ ＋ a × t'], calc: (X, t) => [N.add(X.v0, N.mul(X.a, X.t)), `${t.v0} ＋ ${t.a} × ${t.t}`] },
      v0: { form: ['v₀ ＝ v − a × t'], calc: (X, t) => [N.sub(X.v, N.mul(X.a, X.t)), `${t.v} − ${t.a} × ${t.t}`] },
      a: { form: ['a ＝ (v − v₀) ÷ t'], calc: (X, t) => [divide(N.sub(X.v, X.v0), X.t, '時間'), `(${t.v} − ${t.v0}) ÷ ${t.t}`] },
      t: { form: ['t ＝ (v − v₀) ÷ a'], calc: (X, t) => [divide(N.sub(X.v, X.v0), X.a, '加速度'), `(${t.v} − ${t.v0}) ÷ ${t.a}`] },
    },
    sides: (X, t) => ({ left: X.v, leftText: `v ＝ ${t.v}`, right: N.add(X.v0, N.mul(X.a, X.t)), rightText: `v₀ ＋ a × t ＝ ${t.v0} ＋ ${t.a} × ${t.t}` }),
  },
  accel2: {
    solve: {
      v: {
        form: ['v² ＝ v₀² ＋ 2 × a × x', 'v ＝ √(v₀² ＋ 2 × a × x)'], plus: true,
        calc: (X, t) => [root(N.add(N.mul(X.v0, X.v0), N.mul(TWO, N.mul(X.a, X.x)))), `√(${t.v0}² ＋ 2 × ${t.a} × ${t.x})`],
      },
      v0: {
        form: ['v₀² ＝ v² − 2 × a × x', 'v₀ ＝ √(v² − 2 × a × x)'], plus: true,
        calc: (X, t) => [root(N.sub(N.mul(X.v, X.v), N.mul(TWO, N.mul(X.a, X.x)))), `√(${t.v}² − 2 × ${t.a} × ${t.x})`],
      },
      a: {
        form: ['a ＝ (v² − v₀²) ÷ (2 × x)'],
        calc: (X, t) => [divide(N.sub(N.mul(X.v, X.v), N.mul(X.v0, X.v0)), N.mul(TWO, X.x), '距離'), `(${t.v}² − ${t.v0}²) ÷ (2 × ${t.x})`],
      },
      x: {
        form: ['x ＝ (v² − v₀²) ÷ (2 × a)'],
        calc: (X, t) => [divide(N.sub(N.mul(X.v, X.v), N.mul(X.v0, X.v0)), N.mul(TWO, X.a), '加速度'), `(${t.v}² − ${t.v0}²) ÷ (2 × ${t.a})`],
      },
    },
    sides: (X, t) => ({
      left: N.sub(N.mul(X.v, X.v), N.mul(X.v0, X.v0)),
      leftText: `v² − v₀² ＝ ${t.v}² − ${t.v0}²`,
      right: N.mul(TWO, N.mul(X.a, X.x)),
      rightText: `2 × a × x ＝ 2 × ${t.a} × ${t.x}`,
    }),
  },
};

// ---------------------------------------------------------
// 解く
// ---------------------------------------------------------

// 求める量 target と、ほかの量の打った数 given（{ key: { x: 数, unit: 単位の名前 } }）から答えを出す
//   ansUnit … 答えの単位（なければ公式の単位）
//   返す形：{ missing: [key…] }（まだ入っていない量）か
//     { value（公式の単位）, answer（答えの単位）, X（公式の単位の数、答えも入れて）,
//       form（変形した式）, calc（数を入れた式）, conv（単位をそろえた行）, ansConv, plus, warn }
//   計算できないときは CalcError
export function solve(f, target, given, ansUnit = null) {
  const tv = varOf(f, target);
  const missing = f.vars.filter((v) => v.key !== target && !given[v.key]).map((v) => v.key);
  if (missing.length) return { missing };
  const X = {};
  const conv = [];
  for (const v of f.vars) {
    if (v.key === target) continue;
    const { x, unit } = given[v.key];
    X[v.key] = N.mul(x, factor(v, unit));
    if (unit !== v.base) conv.push(`${numText(x)} ${unit} ＝ ${numText(X[v.key])} ${v.base}`);
  }
  let r;
  if (f.mono) {
    r = monoSolve(f, target, X);
  } else {
    const s = SPECIAL[f.special].solve[target];
    const t = Object.fromEntries(Object.entries(X).map(([k, x]) => [k, paren(x)]));
    const [value, calc] = s.calc(X, t);
    r = { value, form: s.form, calc, plus: !!s.plus };
  }
  X[target] = r.value;
  const unit = ansUnit && unitOf(tv, ansUnit) ? ansUnit : tv.unit;
  const answer = N.div(r.value, factor(tv, unit));
  const ansConv = unit !== tv.base ? `${numText(r.value)} ${tv.base} ＝ ${numText(answer)} ${unit}` : null;
  // 0 より大きいはずの量がマイナス・0 になったら注意書き
  const warn = f.vars.filter((v) => v.pos && N.sign(X[v.key]) <= 0).map((v) => v.key);
  return { value: r.value, answer, unit, X, form: r.form, calc: r.calc, conv, ansConv, plus: r.plus, warn };
}

// 検算：答えも入れた数 X で、元の公式の左と右が同じになるか
export function verify(f, X) {
  let s;
  if (f.mono) {
    s = monoSides(f, X);
  } else {
    const t = Object.fromEntries(Object.entries(X).map(([k, x]) => [k, paren(x)]));
    s = SPECIAL[f.special].sides(X, t);
  }
  return { ...s, ok: near(s.left, s.right) };
}

// 求める量の式（画面の小さい字）：「I ＝ V ÷ R」
export function formOf(f, target) {
  if (f.mono) {
    const parts = monoParts(f, target);
    const sym = symOf(f, target);
    const e = joinExpr(parts.c, parts.num.map((t) => powSym(symOf(f, t.key), t.pow)), parts.den.map((t) => powSym(symOf(f, t.key), t.pow)));
    return parts.p === 2 ? `${sym} ＝ √(${e})` : `${sym} ＝ ${e}`;
  }
  return SPECIAL[f.special].solve[target].form.at(-1);
}
