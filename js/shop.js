// =========================================================
// お買い物の計算（画面とは切り離した計算だけ）
//
// 品物 item = {
//   id, name,
//   price: '198'（打った文字のまま）, qty: '3'（空なら 1）,
//   rate: 10 | 8 | 0（消費税率 %）,
//   incl: false（値段が税抜） | true（値段が税込）,
//   disc: { type: 'none' | 'pct'（〇%引き） | 'yen'（1個あたり〇円引き）, value: '20' },
// }
//
// 計算のしかた opts = { mode, way }
//   mode … 1円未満の扱い 'floor' 切り捨て（多くのお店）・'round' 四捨五入・'ceil' 切り上げ
//   way  … 消費税の出し方
//     'group' 税率ごとにまとめて、1円未満を1回だけ丸める（いまのレシートのきまり。ふつうはこれ）
//     'each'  品物1つずつ消費税を出して丸め、それを足す（お店によってはこちら）
//   税抜で入れた品物：金額 × 税率 が消費税（外税）
//   税込で入れた品物：金額 × 税率 ÷ (100 + 税率) が、ふくまれている消費税（内税）
//
// 数はぜんぶ num.js の正確な分数で計算するので、誤差は出ない。
// =========================================================
import * as N from './num.js';

export const RATES = [10, 8, 0];
export const ROUNDINGS = { floor: '切り捨て', round: '四捨五入', ceil: '切り上げ' };
export const WAYS = { group: '税率ごとにまとめて', each: '品物1つずつ' };
export const DEFAULT_OPTS = { mode: 'floor', way: 'group' };

const HUNDRED = N.frac(100n);

// 打った文字 → 正確な数（空なら 0）
export function amountOf(text) {
  if (!text || text === '.') return N.ZERO;
  return N.parseDecimal(text);
}

// 数字キーで、欄の文字（値段・個数など）を1つ変える。打てないときは null
//   fresh … 欄をえらんだ直後（数字を打つと、前の文字と入れかわる）
//   maxDecimals … 小数点の下を何桁まで打てるか（0 なら小数点は打てない）
export const MAX_DIGITS = 12;
export function typeKey(text, key, { fresh = false, maxDecimals = 3 } = {}) {
  if (key === 'back') return text ? text.slice(0, -1) : null;
  if (key === 'clear') return text ? '' : null;
  if (fresh) text = '';
  let next;
  if (key === '.') {
    if (maxDecimals === 0 || text.includes('.')) return null;
    next = `${text || '0'}.`;
  } else if (key === '00') {
    if (!text || text === '0') return null; // 先頭に 00 は打てない
    next = `${text}00`;
  } else if (/^[0-9]$/.test(key)) {
    next = text === '0' ? key : text + key;
  } else {
    return null;
  }
  const [int, dec = ''] = next.split('.');
  if (int.length > MAX_DIGITS || dec.length > maxDecimals) return null;
  return next;
}

// 打ちかけの文字を、品物に入れる形に（「12.」→「12」、「0.50」→「0.5」は数としては同じなのでそのまま）
export function tidy(text) {
  if (!text) return '';
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

// 1円未満を丸めて、整数（円）にする
export function toYen(x, mode = 'floor') {
  const { d } = x;
  let { n } = x;
  if (d === 1n) return x;
  const neg = n < 0n;
  if (neg) n = -n;
  let q = n / d;
  const r = n % d;
  let up;
  if (mode === 'ceil') up = !neg;
  else if (mode === 'floor') up = neg;
  else up = 2n * r >= d; // 四捨五入（ちょうど 0.5 は大きいほうへ）
  if (up) q += 1n;
  return N.frac(neg ? -q : q);
}

// 金額にふくまれる／かかる消費税（丸める前）
export function taxRaw(amount, rate, incl) {
  if (!rate) return N.ZERO;
  const r = N.frac(BigInt(rate));
  return incl ? N.div(N.mul(amount, r), N.add(HUNDRED, r)) : N.div(N.mul(amount, r), HUNDRED);
}

// 割引のあとの値段（1円未満は丸める。0円より下にはしない）
// 返す値：{ raw: 丸める前, amount: 円 }
export function discounted(base, price, qty, disc, mode = 'floor') {
  let raw = base;
  if (disc?.type === 'pct' && disc.value) {
    raw = N.mul(base, N.div(N.sub(HUNDRED, amountOf(disc.value)), HUNDRED));
  } else if (disc?.type === 'yen' && disc.value) {
    raw = N.mul(N.sub(price, amountOf(disc.value)), qty);
  }
  if (N.sign(raw) < 0) raw = N.ZERO; // 値引きしすぎ
  return { raw, amount: toYen(raw, mode) };
}

// 品物1つ分
// 返す値：{ price, qty, base: 値段×個数, raw: 割引のあと（丸める前）, amount: 円, discount: 引いた額 }
export function lineOf(item, mode = 'floor') {
  const price = amountOf(item.price);
  const qty = item.qty ? amountOf(item.qty) : N.ONE;
  const base = N.mul(price, qty);
  const { raw, amount } = discounted(base, price, qty, item.disc, mode);
  return { price, qty, base, raw, amount, discount: N.sub(base, amount) };
}

// 合計
// 返す値：{
//   lines: [品物ごと { ...lineOf, rate, incl, taxRaw, tax }],
//   groups: [税率ごと { rate, ex: 税抜で入れた分の合計, exTaxRaw, exTax, inc: 税込で入れた分の合計, incTaxRaw, incTax, tax, total }],
//   total: 税込の合計, tax: 消費税, body: 税抜の合計, count: 品物の数, pieces: 個数の合計,
// }
// （way が 'each' のときは exTaxRaw・incTaxRaw は null。1つずつの tax を足している）
export function totalsOf(items, opts = {}) {
  const { mode, way } = { ...DEFAULT_OPTS, ...opts };
  const groups = new Map();
  const lines = [];
  let pieces = N.ZERO;
  for (const item of items) {
    const rate = item.rate ?? 10;
    const incl = !!item.incl;
    if (!groups.has(rate)) {
      groups.set(rate, { rate, ex: N.ZERO, inc: N.ZERO, exTax: N.ZERO, incTax: N.ZERO, exTaxRaw: null, incTaxRaw: null, count: 0 });
    }
    const g = groups.get(rate);
    const line = lineOf(item, mode);
    const raw = taxRaw(line.amount, rate, incl);
    const one = { ...line, rate, incl, taxRaw: raw, tax: toYen(raw, mode) };
    lines.push(one);
    if (incl) g.inc = N.add(g.inc, line.amount);
    else g.ex = N.add(g.ex, line.amount);
    if (way === 'each') {
      if (incl) g.incTax = N.add(g.incTax, one.tax);
      else g.exTax = N.add(g.exTax, one.tax);
    }
    g.count++;
    pieces = N.add(pieces, line.qty);
  }
  let total = N.ZERO;
  let tax = N.ZERO;
  const list = [...groups.values()].sort((a, b) => b.rate - a.rate);
  for (const g of list) {
    if (way !== 'each') {
      g.exTaxRaw = taxRaw(g.ex, g.rate, false);
      g.exTax = toYen(g.exTaxRaw, mode);
      g.incTaxRaw = taxRaw(g.inc, g.rate, true);
      g.incTax = toYen(g.incTaxRaw, mode);
    }
    g.tax = N.add(g.exTax, g.incTax);
    g.total = N.add(N.add(g.ex, g.exTax), g.inc);
    total = N.add(total, g.total);
    tax = N.add(tax, g.tax);
  }
  return { lines, groups: list, total, tax, body: N.sub(total, tax), count: items.length, pieces, mode, way };
}

// 合計を出す足し算の「項」（品物の金額を順に、そのあと税抜の分にかかる消費税）
// これを全部足すと、ちょうど合計になる
export function sumTerms(totals) {
  const terms = totals.lines.map((line) => line.amount);
  for (const g of totals.groups) if (!N.isZero(g.exTax)) terms.push(g.exTax);
  return terms;
}

// レシートとくらべる：6通りの計算のしかた（丸め方 × 消費税の出し方）で合計を出し、同じになるものを探す
// 返す値：[{ mode, way, total, same }]（いまの計算のしかたが先頭）
export function compareReceipt(items, receipt, opts = {}) {
  const now = { ...DEFAULT_OPTS, ...opts };
  const all = [];
  for (const way of Object.keys(WAYS)) {
    for (const mode of Object.keys(ROUNDINGS)) {
      const total = totalsOf(items, { mode, way }).total;
      all.push({ mode, way, total, same: N.cmp(total, receipt) === 0, current: mode === now.mode && way === now.way });
    }
  }
  return all.sort((a, b) => Number(b.current) - Number(a.current));
}

// 税込・税抜のかんたん計算：値段1つと税率から
// 返す値：{ body: 税抜, tax: 消費税, total: 税込, exact: 税込から戻した「ちょうどの税抜」（税込で入れたときだけ） }
export function taxOf(price, rate, incl, mode = 'floor') {
  const raw = taxRaw(price, rate, incl);
  const tax = toYen(raw, mode);
  if (!incl) return { body: price, tax, taxRaw: raw, total: N.add(price, tax) };
  return {
    body: N.sub(price, tax),
    tax,
    taxRaw: raw,
    total: price,
    exact: N.div(N.mul(price, HUNDRED), N.frac(BigInt(100 + rate))),
  };
}
