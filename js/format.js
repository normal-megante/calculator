// =========================================================
// 数を画面に出す形にする
//
//   ・ふだんの表示：画面の幅に入るように、四捨五入や「×10の〇乗」の形にする
//   ・くわしい表示：全部の桁、くり返す小数、分数、万・億・兆…の読み方
// =========================================================
import * as N from './num.js';

// 3桁ごとにカンマ
export function groupInt(intText) {
  return intText.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 「123.456」のような文字の、整数部分だけにカンマ
export function groupNumberText(text) {
  const [i, f] = text.split('.');
  return f === undefined ? groupInt(i) : `${groupInt(i)}.${f}`;
}

const MINUS = '−';

// roundSig の結果 → ふつうの書き方（123.45）
function fixedText(r) {
  const { digits, exp } = r;
  let body;
  if (exp <= 0) body = `0.${'0'.repeat(-exp)}${digits}`;
  else if (exp >= digits.length) body = digits + '0'.repeat(exp - digits.length);
  else body = `${digits.slice(0, exp)}.${digits.slice(exp)}`;
  return body;
}

// roundSig の結果 → 指数の書き方（1.2345 と 指数 7）
function sciParts(r) {
  const { digits, exp } = r;
  const mant = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return { mant, exp: exp - 1 };
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 表示用の1つの形 { text, html, rounded }
function fixedForm(r, rounded) {
  const sign = r.neg ? MINUS : '';
  const t = sign + groupNumberText(fixedText(r));
  return { text: t, html: escapeHtml(t), rounded };
}

function sciForm(r, rounded) {
  const sign = r.neg ? MINUS : '';
  const { mant, exp } = sciParts(r);
  const e = exp < 0 ? `${MINUS}${-exp}` : String(exp);
  return {
    text: `${sign}${mant}×10^${e}`,
    html: `${sign}${mant}<span class="x10">×10</span><sup>${e}</sup>`,
    rounded,
  };
}

// ふだんの表示の候補（よい順）。画面に入る最初のものを使う。
export function mainForms(x) {
  const forms = [];
  if (N.isInteger(x)) {
    const digits = N.roundSig(x, 30);
    if (digits.exact) forms.push(fixedForm(digits, false)); // 30桁までの整数はそのまま
  }
  for (const sig of [16, 12]) {
    const r = N.roundSig(x, sig);
    const rounded = !r.exact || !x.q;
    if (r.exp > -6 && r.exp <= 21) forms.push(fixedForm(r, rounded));
  }
  for (const sig of [12, 8, 5]) {
    const r = N.roundSig(x, sig);
    forms.push(sciForm(r, !r.exact || !x.q));
  }
  return forms;
}

// 短い表示（履歴など）。intMax 桁までの整数は、そのまま全部出す
export function compact(x, sig = 12, intMax = 16) {
  if (N.isInteger(x)) {
    const r = N.roundSig(x, intMax);
    if (r.exact) return fixedForm(r, false);
  }
  const r = N.roundSig(x, sig);
  const rounded = !r.exact || !x.q;
  if (r.exp > -6 && r.exp <= 16) return fixedForm(r, rounded);
  return sciForm(N.roundSig(x, Math.min(sig, 10)), rounded);
}

// 式の中に入れる「答え」の部品の名前（短く）
export function chipLabel(x) {
  const f = compact(x, 8);
  return f.rounded ? `${f.text}…` : f.text;
}

// ---------------------------------------------------------
// くわしい表示
// ---------------------------------------------------------

const MAX_FULL_DIGITS = 120000;  // 全部の桁を出すのは、これくらいの文字数まで
const MAX_FRAC_DIGITS = 200;     // くり返す小数は、小数点以下をこれだけ出す

// 全部の桁
// 返す値：{ kind, text, plain, note, repeat }
//   kind: 'integer' 整数 / 'finite' 割り切れる小数 / 'repeating' くり返す小数 / 'approx' 概数
export function fullDigits(x) {
  if (!x.q) {
    const r = N.roundSig(x, N.SHOW);
    const useFixed = r.exp > -20 && r.exp <= 60;
    const f = useFixed ? fixedForm(r, true) : sciForm(r, true);
    return { kind: 'approx', text: f.text, html: f.html, plain: plainOf(f.text) };
  }
  const neg = x.n < 0n;
  const n = neg ? -x.n : x.n;
  const sign = neg ? MINUS : '';
  const intPart = (n / x.d).toString();
  if (x.d === 1n) {
    const text = sign + groupInt(intPart);
    return { kind: 'integer', text, html: escapeHtml(text), plain: plainOf(text) };
  }
  const rest = n % x.d;
  // 分母から 2 と 5 を取りのぞく → 残りが 1 なら割り切れる小数
  let d2 = x.d;
  let twos = 0;
  let fives = 0;
  while (d2 % 2n === 0n) { d2 /= 2n; twos++; }
  while (d2 % 5n === 0n) { d2 /= 5n; fives++; }
  const pre = Math.max(twos, fives); // くり返しが始まるまでの桁数
  if (d2 === 1n) {
    const len = Math.min(pre, MAX_FULL_DIGITS);
    const fracDigits = ((rest * N.pow10(len)) / x.d).toString().padStart(len, '0');
    const cut = len < pre;
    const text = `${sign}${groupInt(intPart)}.${fracDigits}${cut ? '…' : ''}`;
    return {
      kind: 'finite',
      text,
      html: escapeHtml(text),
      plain: plainOf(text),
      note: cut ? `小数点以下が ${pre.toLocaleString()} 桁あるので、途中までを出しています` : '',
    };
  }
  // くり返す小数：くり返しの長さ（10 を何回かけると d2 で割って 1 余るか）
  let period = null;
  let r10 = 10n % d2;
  for (let k = 1; k <= 1000; k++) {
    if (r10 === 1n) { period = k; break; }
    r10 = (r10 * 10n) % d2;
  }
  const len = Math.max(MAX_FRAC_DIGITS, Math.min(pre + (period ?? 0) * 2, 2000));
  const fracDigits = ((rest * N.pow10(len)) / x.d).toString().padStart(len, '0');
  const text = `${sign}${groupInt(intPart)}.${fracDigits}…`;
  let repeat = null;
  if (period !== null && period <= 60) {
    repeat = { start: pre + 1, digits: fracDigits.slice(pre, pre + period) };
  }
  return { kind: 'repeating', text, html: escapeHtml(text), plain: plainOf(text), repeat, period };
}

function plainOf(text) {
  return text.replace(/,/g, '').replace(/…$/, '').replace(MINUS, '-').replace('×10^', 'e');
}

// 指数の形（50桁まで）
export function scientific(x) {
  const r = N.roundSig(x, N.SHOW);
  return sciForm(r, !r.exact || !x.q);
}

// 分数の形（整数・概数・大きすぎる分数は null）
export function fractionForm(x) {
  if (!x.q || x.d === 1n) return null;
  if (N.bitLen(x.n) + N.bitLen(x.d) > 3400) return { tooLong: true };
  const neg = x.n < 0n;
  const n = neg ? -x.n : x.n;
  const sign = neg ? MINUS : '';
  const text = `${sign}${groupInt(n.toString())}/${groupInt(x.d.toString())}`;
  let mixed = null;
  if (n > x.d) {
    mixed = `${sign}${groupInt((n / x.d).toString())}と${groupInt((n % x.d).toString())}/${groupInt(x.d.toString())}`;
  }
  return { text, mixed };
}

// 整数部分の桁数
export function integerDigits(x) {
  const a = N.absNum(x);
  if (a.q) {
    const ip = a.n / a.d;
    return ip === 0n ? 0 : ip.toString().length;
  }
  const r = N.roundSig(a, N.SHOW);
  return Math.max(0, r.exp);
}

// 万・億・兆…の読み方（整数部分）
const UNITS = ['', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極',
  '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];

export function japaneseReading(x) {
  const a = N.absNum(x);
  const digits = integerDigits(a);
  if (digits < 5) return null; // 1万より小さい
  if (digits > UNITS.length * 4) {
    return { text: '無量大数（10の68乗）よりも大きい数です', approx: false, over: true };
  }
  let intText;
  let approx = !a.q;
  if (a.q) {
    intText = (a.n / a.d).toString();
    if (a.d !== 1n) approx = false;
  } else {
    intText = fixedText(N.roundSig(a, N.SHOW)).split('.')[0];
  }
  const groups = [];
  for (let end = intText.length; end > 0; end -= 4) groups.unshift(intText.slice(Math.max(0, end - 4), end));
  const parts = [];
  groups.forEach((g, i) => {
    const v = Number(g);
    if (v !== 0) parts.push(`${v}${UNITS[groups.length - 1 - i]}`);
  });
  const sign = N.sign(x) < 0 ? 'マイナス ' : '';
  return { text: sign + parts.join(''), approx, fraction: a.q && a.d !== 1n };
}

// 金額などの短い表示（1,234 / 168.5 / 割り切れなければ 3,333.333333…）
export function amountText(x) {
  const f = compact(x, 10);
  return f.rounded ? `${f.text}…` : f.text;
}
export const yenText = (x) => `${amountText(x)}円`;
