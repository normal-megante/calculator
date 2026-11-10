// =========================================================
// 単位の変換（画面なし・テストあり）
//
// 単位は「基準の単位（長さなら m）のいくつ分か」を、正確な分数で持つ。
//   変換： 打った数 × 元の単位の大きさ ÷ 見たい単位の大きさ
// 温度だけは足し引きもある（℃ ＝ (℉ − 32) × 5/9）ので、
//   基準（℃）＝ 数 × a ＋ b の a と b で持つ。
//
// 単位の項目：
//   sym  … 画面に出す名前（cm・坪 など）
//   read … 読み方（漢字の単位だけ）
//   f    … 基準の単位いくつ分か（'0.0254' や '400/121' のように書く。分数のまま正確に）
//          '180/π' のように π があるものだけは概数（approx: true。π は80桁で計算、50桁を出す）
//   def  … その大きさがどこから来たか（検算で見せる）
//   note … 注意書き（一覧の、その単位のすぐ下に出す）
//   dms  … 一覧のその単位の下に、度分秒（57°17′44.81″）も出す（角度の「度」）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';

// '0.0254' や '400/121' や '-160/9' → 正確な数（'180/π' だけは概数）
function q(text) {
  if (text.endsWith('/π')) return N.div(q(text.slice(0, -2)), N.pi());
  const neg = text.startsWith('-');
  const [a, b] = (neg ? text.slice(1) : text).split('/');
  const x = b === undefined ? N.parseDecimal(a) : N.div(N.parseDecimal(a), N.parseDecimal(b));
  return neg ? N.neg(x) : x;
}

const RAW = [
  {
    key: 'len', name: '長さ', base: 'm', from: 'cm', to: 'in',
    hint: 'インチ・フィートなどは国際的に決まった長さです（1インチ ＝ 2.54cm ちょうど）',
    units: [
      { key: 'mm', sym: 'mm', f: '0.001' },
      { key: 'cm', sym: 'cm', f: '0.01' },
      { key: 'm', sym: 'm', f: '1' },
      { key: 'km', sym: 'km', f: '1000' },
      { key: 'in', sym: 'インチ', f: '0.0254', def: '2.54cm ちょうど（国際的なきまり）' },
      { key: 'ft', sym: 'フィート', f: '0.3048', def: '12インチ' },
      { key: 'yd', sym: 'ヤード', f: '0.9144', def: '3フィート' },
      { key: 'mi', sym: 'マイル', f: '1609.344', def: '1760ヤード' },
      { key: 'nmi', sym: '海里', read: 'かいり', f: '1852', def: '1852m ちょうど（国際的なきまり）', note: '海や空の道のりに使います' },
      { key: 'sun', sym: '寸', read: 'すん', f: '1/33', def: '1尺の10分の1' },
      { key: 'shaku', sym: '尺', read: 'しゃく', f: '10/33', def: '10/33 m（明治のきまり。約30.3cm）' },
      { key: 'ken', sym: '間', read: 'けん', f: '20/11', def: '6尺 ＝ 60/33 m（約1.82m）' },
    ],
  },
  {
    key: 'mass', name: '重さ', base: 'g', from: 'kg', to: 'lb',
    units: [
      { key: 'mg', sym: 'mg', f: '0.001' },
      { key: 'g', sym: 'g', f: '1' },
      { key: 'kg', sym: 'kg', f: '1000' },
      { key: 't', sym: 'トン', f: '1000000', def: '1000kg' },
      { key: 'oz', sym: 'オンス', f: '28.349523125', def: '16分の1ポンド', note: '金・銀の重さのオンス（トロイオンス 約31.1g）とはちがいます' },
      { key: 'lb', sym: 'ポンド', f: '453.59237', def: '0.45359237kg ちょうど（国際的なきまり）' },
      { key: 'monme', sym: '匁', read: 'もんめ', f: '3.75', def: '1貫の1000分の1', note: '真珠の重さにも使います' },
      { key: 'kin', sym: '斤', read: 'きん', f: '600', def: '160匁', note: '食パンの「1斤」は別のきまりです（340g 以上）' },
      { key: 'kan', sym: '貫', read: 'かん', f: '3750', def: '3.75kg（明治のきまり）' },
    ],
  },
  {
    key: 'area', name: '面積', base: 'm²', from: 'm2', to: 'tsubo',
    hint: '畳の大きさは地方や建物でちがいます（ここでは 1畳 ＝ 1.62m²）',
    units: [
      { key: 'cm2', sym: 'cm²', f: '0.0001' },
      { key: 'm2', sym: 'm²', f: '1' },
      { key: 'a', sym: 'アール', f: '100', def: '10m × 10m' },
      { key: 'ha', sym: 'ヘクタール', f: '10000', def: '100m × 100m' },
      { key: 'km2', sym: 'km²', f: '1000000' },
      { key: 'tsubo', sym: '坪', read: 'つぼ', f: '400/121', def: '1間 × 1間（20/11 m × 20/11 m）', note: '約3.31m²。だいたい2畳' },
      { key: 'jo', sym: '畳', read: 'じょう', f: '1.62', def: '不動産の広告のきまりの大きさ', note: '地方でちがいます（江戸間 約1.55m²・京間 約1.82m²）。ここでは広告のきまりの 1.62m²' },
      { key: 'tan', sym: '反', read: 'たん', f: '120000/121', def: '300坪', note: '田や畑の広さ' },
      { key: 'ft2', sym: '平方フィート', f: '0.09290304', def: '1フィート × 1フィート' },
      { key: 'ac', sym: 'エーカー', f: '4046.8564224', def: '43560平方フィート' },
    ],
  },
  {
    key: 'vol', name: '体積', base: 'mL', from: 'go', to: 'mL',
    hint: '小さじ・大さじ・カップ・合は、日本のものです',
    units: [
      { key: 'mL', sym: 'mL', f: '1', note: '1mL ＝ 1cc ＝ 1cm³' },
      { key: 'L', sym: 'L', f: '1000' },
      { key: 'm3', sym: 'm³', f: '1000000', def: '1000L' },
      { key: 'tsp', sym: '小さじ', f: '5', def: '5mL（日本の計量スプーン）' },
      { key: 'tbsp', sym: '大さじ', f: '15', def: '15mL（日本の計量スプーン）' },
      { key: 'cup', sym: 'カップ', f: '200', def: '200mL（日本の計量カップ）', note: '日本の1カップは 200mL（アメリカは 約237mL）' },
      { key: 'go', sym: '合', read: 'ごう', f: '240100/1331', def: '1升の10分の1', note: 'お米の1合（約180mL）。炊飯器のカップと同じ' },
      { key: 'sho', sym: '升', read: 'しょう', f: '2401000/1331', def: '2401/1331 L（明治のきまり。約1.804L）', note: '一升びんの1升' },
      { key: 'gal', sym: 'ガロン', f: '3785.411784', def: '231立方インチ（アメリカ）', note: 'アメリカのガロン（イギリスのガロンは 約4.546L）' },
      { key: 'floz', sym: '液量オンス', f: '29.5735295625', def: '128分の1ガロン（アメリカ）', note: 'アメリカの液量オンス' },
      { key: 'uscup', sym: 'カップ（米）', f: '236.5882365', def: '16分の1ガロン（アメリカ）', note: 'アメリカのレシピのカップ' },
    ],
  },
  {
    key: 'temp', name: '温度', base: '℃', from: 'c', to: 'f',
    hint: '温度は、かけ算だけでなく足し引きもある変換です（0℃ ＝ 32℉）',
    units: [
      { key: 'c', sym: '℃', a: '1', b: '0' },
      { key: 'f', sym: '℉', a: '5/9', b: '-160/9', def: '℃ ＝ (℉ − 32) × 5/9', note: 'アメリカで使う温度（カ氏）' },
      { key: 'k', sym: 'K', a: '1', b: '-273.15', def: '℃ ＝ K − 273.15', note: 'ケルビン。0K が絶対零度（−273.15℃）' },
    ],
  },
  {
    key: 'angle', name: '角度', base: '度', from: 'rad', to: 'deg',
    hint: '180度 ＝ π rad。「π rad」の行は π の何倍か（0.5 π rad ＝ π/2 rad ＝ 90度）',
    units: [
      { key: 'deg', sym: '度', f: '1', dms: true },
      { key: 'rad', sym: 'rad', read: 'ラジアン', f: '180/π', def: '半径と同じ長さの弧の角度（180/π 度）', note: 'π を使うので答えは概数です（上から50桁）。π の何倍かでちょうどの数がほしいときは「π rad」' },
      { key: 'pirad', sym: 'π rad', read: 'π の何倍', f: '180', def: 'π rad ＝ 180度（半回転）', note: '「π の何倍か」を打ちます（π/2 rad なら 0.5、π/4 rad なら 0.25）' },
      { key: 'turn', sym: '回転', f: '360', def: '1回転 ＝ 360度' },
      { key: 'grad', sym: 'グラード', f: '9/10', def: '直角を100に分けた角度（1回転 ＝ 400グラード）', note: '測量で使うことがあります（gon とも）' },
      { key: 'amin', sym: '分（′）', read: 'かくふん', f: '1/60', def: '1度の60分の1', note: '角度の「分」です（時間の分ではありません）' },
      { key: 'asec', sym: '秒（″）', read: 'かくびょう', f: '1/3600', def: '1分の60分の1（1度の3600分の1）' },
    ],
  },
  {
    key: 'speed', name: '速さ', base: 'm/s', from: 'kmh', to: 'ms',
    units: [
      { key: 'kmh', sym: 'km/h', read: '時速', f: '5/18', def: '1時間に 1km（1000m ÷ 3600秒）' },
      { key: 'ms', sym: 'm/s', read: '秒速', f: '1', def: '1秒に 1m' },
      { key: 'mmin', sym: 'm/分', read: '分速', f: '1/60', def: '1分に 1m' },
      { key: 'mph', sym: 'mph', read: 'マイル毎時', f: '0.44704', def: '1時間に 1マイル（1609.344m）' },
      { key: 'kn', sym: 'ノット', f: '463/900', def: '1時間に 1海里（1852m）', note: '船や飛行機の速さ' },
    ],
  },
  {
    key: 'data', name: 'データ', base: 'ビット', from: 'GB', to: 'GiB',
    hint: 'KB・MB・GB は 1000 ずつ。1024 ずつのもの（KiB・MiB・GiB）もあります',
    units: [
      { key: 'bit', sym: 'ビット', f: '1' },
      { key: 'B', sym: 'B', read: 'バイト', f: '8', def: '8ビット' },
      { key: 'KB', sym: 'KB', f: '8000', def: '1000B' },
      { key: 'MB', sym: 'MB', f: '8000000', def: '1000KB' },
      { key: 'GB', sym: 'GB', f: '8000000000', def: '1000MB' },
      { key: 'TB', sym: 'TB', f: '8000000000000', def: '1000GB' },
      { key: 'KiB', sym: 'KiB', f: '8192', def: '1024B' },
      { key: 'MiB', sym: 'MiB', f: '8388608', def: '1024KiB' },
      { key: 'GiB', sym: 'GiB', f: '8589934592', def: '1024MiB', note: 'Windows では、これを「GB」と表示します' },
      { key: 'TiB', sym: 'TiB', f: '8796093022208', def: '1024GiB' },
    ],
  },
  {
    key: 'energy', name: 'エネルギー', base: 'J', from: 'kcal', to: 'kJ',
    units: [
      { key: 'J', sym: 'J', read: 'ジュール', f: '1' },
      { key: 'kJ', sym: 'kJ', f: '1000' },
      { key: 'cal', sym: 'cal', read: 'カロリー', f: '4.184', def: '4.184J（日本の計量法のきまり）' },
      { key: 'kcal', sym: 'kcal', f: '4184', def: '1000cal', note: '食べ物のカロリー' },
      { key: 'Wh', sym: 'Wh', f: '3600', def: '1W を1時間（3600秒）' },
      { key: 'kWh', sym: 'kWh', f: '3600000', def: '1000Wh', note: '電気代の単位' },
    ],
  },
  {
    key: 'press', name: '圧力', base: 'Pa', from: 'hPa', to: 'atm',
    units: [
      { key: 'Pa', sym: 'Pa', read: 'パスカル', f: '1' },
      { key: 'hPa', sym: 'hPa', f: '100', note: '天気予報の気圧' },
      { key: 'kPa', sym: 'kPa', f: '1000' },
      { key: 'MPa', sym: 'MPa', f: '1000000' },
      { key: 'atm', sym: '気圧', f: '101325', def: '101325Pa ちょうど（標準の大気圧）' },
      { key: 'mmHg', sym: 'mmHg', f: '101325/760', def: '1気圧の760分の1', note: '血圧の単位' },
      { key: 'bar', sym: 'bar', read: 'バール', f: '100000' },
      { key: 'kgfcm2', sym: 'kgf/cm²', f: '98066.5', def: '1kg の重さ（9.80665N）が 1cm² にかかる', note: '昔のタイヤの空気圧など' },
      { key: 'psi', sym: 'psi', f: '4.4482216152605/0.00064516', def: '1ポンドの重さ（4.4482216152605N）が 1平方インチにかかる', note: 'アメリカのタイヤの空気圧など' },
    ],
  },
];

// 分数を先に作っておく
export const CATS = RAW.map((c) => ({
  ...c,
  units: c.units.map((u) => (u.a !== undefined
    ? { ...u, a: q(u.a), b: q(u.b), affine: true }
    : { ...u, f: q(u.f), ...(u.f.includes('π') ? { ftext: u.f, approx: true } : {}) })),
}));

export const catByKey = (key) => CATS.find((c) => c.key === key) ?? null;
export const unitOf = (cat, key) => cat.units.find((u) => u.key === key) ?? null;
export const baseUnit = (cat) => cat.units.find((u) => u.sym === cat.base);

// 打った数 → 基準の単位
export function toBase(u, x) {
  return u.affine ? N.add(N.mul(x, u.a), u.b) : N.mul(x, u.f);
}

// 基準の単位 → その単位
export function fromBase(u, y) {
  return u.affine ? N.div(N.sub(y, u.b), u.a) : N.div(y, u.f);
}

const ABS_ZERO = q('-273.15');

// 1つの数を、その種類の全部の単位に
//   返す値：{ base, values: Map(単位の key → 数) } / { error }
export function convertAll(cat, fromKey, x) {
  const from = unitOf(cat, fromKey);
  const base = toBase(from, x);
  if (cat.key === 'temp' && N.cmp(base, ABS_ZERO) < 0) {
    return { error: '絶対零度（−273.15℃）より低い温度はありません' };
  }
  const values = new Map();
  for (const u of cat.units) values.set(u.key, u.key === fromKey ? x : fromBase(u, base));
  return { base, values };
}

export function convert(cat, fromKey, toKey, x) {
  return fromBase(unitOf(cat, toKey), toBase(unitOf(cat, fromKey), x));
}

// ---------------------------------------------------------
// 表示の形
// ---------------------------------------------------------
// 数 → { text, html, rounded }（四捨五入したら後ろに「…」）
export function valueText(x, sig = 12) {
  const f = F.compact(x, sig);
  return f.rounded ? { ...f, text: `${f.text}…`, html: `${f.html}…` } : f;
}

// 割り切れる小数なら、その小数の文字（{ text: '2.54', neg }）。割り切れない・長すぎるなら null
//   欄に打ち直せる形にするときに使う（整数 maxInt 桁・小数 maxDecimals 桁まで）
export function plainDecimal(x, { maxInt = 12, maxDecimals = 8 } = {}) {
  if (!x.q) return null;
  // 分母が 2 と 5 だけでできていれば、割り切れる小数
  let d = x.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const k = Math.max(twos, fives); // 小数点の下の桁数
  if (k > maxDecimals) return null;
  const neg = x.n < 0n;
  const s = (((neg ? -x.n : x.n) * N.pow10(k)) / x.d).toString().padStart(k + 1, '0');
  const int = s.slice(0, s.length - k);
  const dec = s.slice(s.length - k);
  if (int.length > maxInt) return null;
  return { text: dec ? `${int}.${dec}` : int, neg };
}

// 単位の大きさを式の中に書く形（割り切れる小数ならそのまま「0.0254」、割り切れなければ分数「400/121」）
export function factorText(x) {
  const p = plainDecimal(x, { maxInt: 30, maxDecimals: 30 });
  return p ? F.groupNumberText(p.text) : F.fractionForm(x).text;
}

// 単位の大きさの書き方（rad の「180/π」のように、書いたままのものはそのまま）
export const factorLabel = (u) => u.ftext ?? factorText(u.f);

// 同じ数か（概数がまざっていたら、上から50桁で比べる）
export function sameValue(a, b) {
  if (N.cmp(a, b) === 0) return true;
  if (a.q && b.q) return false;
  const ra = N.roundSig(a, N.SHOW);
  const rb = N.roundSig(b, N.SHOW);
  return ra.neg === rb.neg && ra.digits === rb.digits && ra.exp === rb.exp;
}

// 度 → 度分秒（57°17′44.81″）。秒は小数第2位まで（四捨五入したら「約」）。10億度より大きければ null
const HUNDREDTH_SEC = 360000n; // 1度 ＝ 0.01秒 の 360000 個分
export function dmsText(deg) {
  const neg = N.sign(deg) < 0;
  const a = N.absNum(deg);
  if (N.cmp(a, N.frac(1000000000n)) >= 0) return null;
  const h = N.mul(a, N.frac(HUNDREDTH_SEC));
  let n;
  let exact;
  if (h.q) {
    n = (2n * h.n + h.d) / (2n * h.d); // 四捨五入
    exact = h.n % h.d === 0n;
  } else {
    const e = BigInt(h.e);
    if (e >= 0n) {
      n = h.m * 10n ** e;
      exact = true;
    } else if (e < -200n) {
      n = 0n;
      exact = h.m === 0n;
    } else {
      const den = 10n ** -e;
      n = (2n * h.m + den) / (2n * den);
      exact = false;
    }
  }
  const d = n / HUNDREDTH_SEC;
  const rest = n % HUNDREDTH_SEC;
  const m = (rest / 6000n).toString().padStart(2, '0');
  const s100 = rest % 6000n;
  const sec = (s100 / 100n).toString().padStart(2, '0');
  const dec = (s100 % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  const sign = neg && n > 0n ? '−' : '';
  return `${exact ? '' : '約 '}${sign}${F.groupInt(d.toString())}°${m}′${sec}${dec ? `.${dec}` : ''}″`;
}
