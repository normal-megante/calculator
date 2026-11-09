// =========================================================
// 巨大数の画面（ステップ15）
//
//   上：種類（テトレーション・スーパー対数・矢印表記・アッカーマン・有名な数）
//   まん中：式・答え（＝ を押さなくても出る）・大きさの目安・注意書き
//   下：欄（タップでえらぶ）と数字キー（^ ↑↑ で 10^100 や 3↑↑3 のようにも打てる）
//
// 履歴には残さない。計算そのものは big.js
// =========================================================
import * as B from './big.js';
import * as N from './num.js';
import * as F from './format.js';
import * as S from './sci.js';
import { $, toast } from './ui.js';
import { openDetail } from './detail.js';
import { el, button, shake, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.big';
const MAX_INT = 15;
const MAX_DEC = 10;
const MAX_OPS = 5; // 1つの欄の ^ と ↑↑ は、これだけまで

// 種類と欄。chain：^ ↑↑ を打てる / int：整数だけ（小数点なし）
const KINDS = [
  {
    key: 'tet', name: 'テトレーション', label: 'テトレーション a↑↑n',
    fields: [
      { key: 'a', name: '底 a', init: '2', hint: '底 a：つむ数（0 より大きい数）' },
      { key: 'n', name: '高さ n', init: '5', chain: true, hint: '高さ n：何段つむか。10^100 や 3↑↑3 のようにも打てます' },
    ],
  },
  {
    key: 'slog', name: 'スーパー対数', label: 'スーパー対数 slogₐx',
    fields: [
      { key: 'a', name: '底 a', init: '10', hint: '底 a：つむ数（1 より大きい数）' },
      { key: 'x', name: '数 x', init: '10^10^100', chain: true, hint: '数 x：10^10^100 や 3↑↑5 のようにも打てます' },
    ],
  },
  {
    key: 'arrow', name: '矢印表記', label: '矢印表記 a↑…↑b',
    fields: [
      { key: 'a', name: 'a', init: '3', hint: 'a：くり返す数' },
      { key: 'k', name: '↑ の数', init: '3', int: true, maxInt: 3, hint: `↑ の数：1 で累乗、2 でテトレーション（${B.MAX_ARROWS} まで）` },
      { key: 'b', name: 'b', init: '3', chain: true, hint: 'b：くり返す回数。↑ が3個以上なら整数だけ' },
    ],
  },
  {
    key: 'ack', name: 'アッカーマン', label: 'アッカーマン関数 A(m, n)',
    fields: [
      { key: 'm', name: 'm', init: '4', int: true, maxInt: 3, hint: `m：0 以上の整数（${B.MAX_ACK_M} まで）` },
      { key: 'n', name: 'n', init: '2', chain: true, hint: 'n：0 以上の整数。10^100 のようにも打てます' },
    ],
  },
  { key: 'famous', name: '有名な数', label: '有名な巨大数', fields: [] },
];
const kindOf = (key) => KINDS.find((k) => k.key === key) ?? KINDS[0];
const fieldOf = (kind, key) => kind.fields.find((f) => f.key === key);

const st = {
  kind: 'tet',
  vals: Object.fromEntries(KINDS.map((k) => [k.key, Object.fromEntries(k.fields.map((f) => [f.key, f.init]))])),
  active: Object.fromEntries(KINDS.filter((k) => k.fields.length).map((k) => [k.key, k.fields[k.fields.length - 1].key])),
  fresh: true,
};
let hooks = {};
const reject = (target) => shake(target, hooks.settings());

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ kind: st.kind, vals: st.vals, active: st.active }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (KINDS.some((k) => k.key === s.kind)) st.kind = s.kind;
    for (const k of KINDS) {
      for (const f of k.fields) {
        const t = s.vals?.[k.key]?.[f.key];
        if (typeof t === 'string' && t.length <= 80 && validText(t, f)) st.vals[k.key][f.key] = t;
      }
      if (fieldOf(k, s.active?.[k.key])) st.active[k.key] = s.active[k.key];
    }
  } catch {
    // 読めなければ、はじめから
  }
}

function validText(t, f) {
  const num = f.int ? '\\d*' : '\\d*(\\.\\d*)?';
  const re = f.chain ? new RegExp(`^${num}((\\^|↑↑)${num})*$`) : new RegExp(`^${num}$`);
  return re.test(t);
}

// ---------------------------------------------------------
// 欄の文字（数字キーで変える）
// ---------------------------------------------------------
const OPS = /(\^|↑↑)/;
// 打てなければ null
function typeChain(text, key, f, fresh) {
  if (key === 'back') {
    if (!text) return null;
    return text.endsWith('↑↑') ? text.slice(0, -2) : text.slice(0, -1);
  }
  if (key === 'clear') return text ? '' : null;
  if (key === '^' || key === 'up2') {
    if (!f.chain) return null;
    const last = text.split(OPS).pop();
    if (!last || last === '.' || text.split(OPS).length >= 2 * MAX_OPS + 1) return null;
    return `${last.endsWith('.') ? text.slice(0, -1) : text}${key === '^' ? '^' : '↑↑'}`;
  }
  if (fresh) text = '';
  const parts = text.split(OPS);
  const last = parts.pop();
  let next;
  if (key === '.') {
    if (f.int || last.includes('.')) return null;
    next = `${last || '0'}.`;
  } else if (/^[0-9]$/.test(key)) {
    next = last === '0' ? key : last + key;
  } else {
    return null;
  }
  const [int, dec = ''] = next.split('.');
  if (int.length > (f.maxInt ?? MAX_INT) || dec.length > MAX_DEC) return null;
  return parts.join('') + next;
}

// 欄の文字を見やすく（3桁ごとのカンマ）
function chainShown(text) {
  return text.split(OPS).map((p) => (OPS.test(p) || !p ? p : F.groupNumberText(p))).join('');
}

// ---------------------------------------------------------
// 計算（同じ欄なら覚えておく）
// ---------------------------------------------------------
const cache = new Map();

function parseField(f, text) {
  if (!text) return null;
  if (f.chain) return B.parseChain(text); // 「10^」のような打ちかけは null
  return B.num(N.parseDecimal(text.endsWith('.') ? text.slice(0, -1) : text));
}

// { kind, ok, value, info, input, missing, error }
function current(kindKey = st.kind) {
  const kind = kindOf(kindKey);
  const vals = st.vals[kind.key];
  const id = `${kind.key}|${kind.fields.map((f) => vals[f.key]).join('|')}`;
  if (cache.has(id)) return cache.get(id);
  const res = compute(kind, vals);
  cache.set(id, res);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return res;
}

function compute(kind, vals) {
  const res = { kind, ok: false };
  if (kind.key === 'famous') return res;
  try {
    const input = {};
    const missing = [];
    for (const f of kind.fields) {
      input[f.key] = parseField(f, vals[f.key]);
      if (!input[f.key]) missing.push(f.name);
    }
    res.input = input;
    if (missing.length) return { ...res, missing };
    const plain = (key, what) => {
      if (input[key].t !== 'num') throw new N.CalcError(`${what}は、^ や ↑↑ を使わない ふつうの数で打ってください`);
      return input[key].v;
    };
    if (kind.key === 'tet') res.info = B.tetrateInfo(plain('a', '底 a'), input.n);
    else if (kind.key === 'slog') res.info = B.slogInfo(plain('a', '底 a'), input.x);
    else if (kind.key === 'arrow') res.info = B.arrowInfo(plain('a', 'a'), Number(N.toNumber(plain('k', '↑ の数'))), input.b);
    else res.info = B.ackermann(input.m, input.n);
    res.value = res.info.value;
    res.ok = true;
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    res.error = error.message;
  }
  return res;
}

// ---------------------------------------------------------
// 書き方
// ---------------------------------------------------------
// ふつうの数（四捨五入したら「…」）
function nt(x, sig = 12) {
  if (!x.q && N.approxLog10(N.absNum(x)) < 15) {
    // 概数でも、上から 65 桁くらいまで整数と同じなら、その整数で（log₂ でもどした 65,536 など）
    const k = N.frac(S.floorInt(N.add(x, N.frac(1n, 2n))));
    if (N.cmp(x, k) === 0) x = k;
  }
  if (N.approxLog10(N.absNum(x)) >= 16) {
    // 17桁以上は 1×10^100 の形（10^100 のような 0 の多い整数も、全部の桁を書かない）
    const r = N.roundSig(x, sig);
    const mant = (r.neg ? '−' : '') + (r.digits.length > 1 ? `${r.digits[0]}.${r.digits.slice(1)}` : r.digits);
    const dots = !r.exact || !x.q ? '…' : '';
    return { text: `${mant}×10^${r.exp - 1}${dots}`, html: `${mant}<span class="x10">×10</span><sup>${r.exp - 1}</sup>${dots}` };
  }
  const f = F.compact(x, sig);
  return { text: f.text + (f.rounded ? '…' : ''), html: f.html + (f.rounded ? '…' : '') };
}
const countText = (k) => F.groupInt(String(k));
const arrows = (k) => (k <= 4 ? '↑'.repeat(k) : `↑${S.supText(k)}`);
// log₁₀・log₂ など（1桁・2桁の整数の底は小さい字で）
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const logName = (at) => (/^\d{1,2}$/.test(at) ? `log${[...at].map((d) => SUB[d]).join('')}` : `log_${at}`);
// 高さなどを ( ) でかこむ（ただの数ならかこまない）
const paren = (t) => (/^[\d,.]+$/.test(t) ? t : `(${t})`);

// 巨大数 → { text, html, note, width }
//   note：「10^ が 〇 回」など / width：画面での横はばの目安（文字の数。右上の小さい字は少なめに数える）
export function bigForms(b, sig = 10) {
  if (b.t === 'num') {
    const f = nt(b.v, sig);
    return { ...f, note: '', width: f.text.length };
  }
  if (b.t === 'tower') {
    const { tens, top } = B.towerParts(b);
    const t = nt(top, sig);
    const width = 2 * Math.min(tens, 3) + Math.ceil(t.text.length * 0.6);
    if (tens <= 3) {
      return {
        text: `${'10^'.repeat(tens)}${t.text}`,
        html: `${'10<sup>'.repeat(tens)}${t.html}${'</sup>'.repeat(tens)}`,
        note: '',
        width,
      };
    }
    return {
      text: `10^10^…^10^${t.text}`,
      html: `10<sup>10<sup>⋰<sup>${t.html}</sup></sup></sup>`,
      note: `10^ が ${countText(tens)} 回`,
      width,
    };
  }
  const s = nt(b.s, N.approxLog10(N.absNum(b.s)) > 6 ? 16 : sig); // 7,625,597,484,987 のような高さは、桁を多めに
  const inner =b.s.q && N.isInteger(b.s) && N.sign(b.s) >= 0 && N.approxLog10(b.s) < 16 ? s : { text: `(${s.text})`, html: `(${s.html})` };
  if (b.k <= 3) {
    const text = `${'10↑↑'.repeat(b.k)}${inner.text}`;
    return { text, html: `${'10↑↑'.repeat(b.k)}${inner.html}`, note: '', width: text.length };
  }
  const text = `10↑↑10↑↑…10↑↑${inner.text}`;
  return { text, html: `10↑↑10↑↑…10↑↑${inner.html}`, note: `10↑↑ が ${countText(b.k)} 回`, width: text.length };
}

// 大きさの目安の行（文字の配列）
function sizeLines(b) {
  const lines = [];
  if (b.t === 'num') {
    const x = b.v;
    if (N.cmp(x, N.frac(10n ** 16n)) >= 0) lines.push(`${countText(F.integerDigits(x))} 桁`);
  } else if (b.t === 'tower' && b.h === 1) {
    lines.push(`＝ 10^(${nt(b.x).text})`);
    const digits = N.cmp(b.x, N.frac(10n ** 15n)) < 0 ? countText(S.floorInt(b.x) + 1n) : `約 ${nt(b.x, 6).text}`;
    lines.push(`${digits} 桁（0 を書くだけでも、紙に入りきらない）`);
  } else if (b.t === 'tower') {
    lines.push(`桁数は ${bigForms({ t: 'tower', h: b.h - 1, x: b.x }, 6).text} 桁くらい`);
  } else if (b.k === 1) {
    lines.push(`10 を 約 ${nt(b.s, 6).text} 段つんだ塔`);
  }
  // 10↑↑ いくつか（巨大数どうしをくらべる目安）
  const big = b.t !== 'num' || N.cmp(b.v, N.frac(10n)) > 0;
  if (big && !(b.t === 'nest')) {
    const s = B.slog10(b);
    if (s.t === 'num' && N.cmp(s.v, N.frac(100n)) < 0) lines.push(`≒ 10↑↑${nt(s.v, 6).text}（10 を ${nt(s.v, 3).text} 段つんだくらい）`);
    else if (s.t === 'num') lines.push(`≒ 10↑↑${nt(s.v, 16).text}`);
  }
  return lines;
}

// 入力の書き方
function inputText(res, key) {
  const v = res.input?.[key];
  if (!v) return '？';
  const t = bigForms(v, 8).text;
  return v.t === 'num' ? t : `(${t})`;
}

// 式の行：2↑↑5 ＝ 2^2^2^2^2 など
function showLine(res) {
  const { kind, info } = res;
  const vals = st.vals[kind.key];
  const v = (key) => (vals[key] ? chainShown(vals[key]) : '？');
  if (kind.key === 'tet') {
    const head = `${v('a')}↑↑${v('n')}`;
    if (!res.ok || info.count === null || info.huge) return head;
    const c = info.count;
    const a = v('a');
    const top = N.cmp(info.start, N.ONE) === 0 ? '' : `^${nt(info.start, 6).text}`;
    if (c.q && c.n <= 5n) {
      if (c.n === 0n) return `${head} ＝ ${top ? nt(info.start, 6).text : '1'}`;
      return `${head} ＝ ${Array(Number(c.n)).fill(a).join('^')}${top}`;
    }
    return `${head} ＝ ${a}^${a}^…^${a}${top}（${a} が ${nt(c).text} 個）`;
  }
  if (kind.key === 'slog') {
    const a = v('a');
    const sub = /^\d+$/.test(a) && a.length <= 3 ? [...a].map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join('') : `(${a})`;
    return `slog${sub}(${v('x')})：${a} を何段つむと ${v('x')} になるか`;
  }
  if (kind.key === 'arrow') {
    const k = Number(vals.k) || 0;
    const a = v('a');
    const head = `${a}${k ? arrows(k) : '↑…↑'}${v('b')}`;
    if (k === 1) return `${head} ＝ ${a}^${v('b')}`;
    if (k === 2) return `${head}（${a} を ${v('b')} 段つむ）`;
    const b = /^\d+$/.test(vals.b) ? Number(vals.b) : null;
    if (k >= 3 && b !== null && b >= 2 && b <= 4) {
      const lower = arrows(k - 1);
      let t = a;
      for (let i = 1; i < b; i++) t = i === 1 ? `${a}${lower}${a}` : `${a}${lower}(${t})`;
      return `${head} ＝ ${t}`;
    }
    if (k >= 3) return `${head} ＝ ${a}${arrows(k - 1)}(${a}${arrows(k - 1)}(…${a}))（${a} が ${v('b')} 個）`;
    return head;
  }
  // アッカーマン
  const m = Number(vals.m);
  const n = v('n');
  const head = `A(${vals.m || '？'}, ${n})`;
  if (!vals.m || !res.input?.n) return head;
  if (m === 0) return `${head} ＝ ${n} ＋ 1`;
  if (m === 1) return `${head} ＝ ${n} ＋ 2`;
  if (m === 2) return `${head} ＝ 2 × ${n} ＋ 3`;
  const n3 = res.input.n.t === 'num' ? nt(N.add(res.input.n.v, N.frac(3n))).text : `(${n} ＋ 3)`;
  if (m === 3) return `${head} ＝ 2^${n3} − 3`;
  return `${head} ＝ 2${arrows(m - 2)}${n3} − 3`;
}

// 注意書き：[[クラス, 文], …]
function notesOf(res) {
  const notes = [];
  const { kind, info } = res;
  if (res.error) notes.push(['ng', res.error]);
  else if (res.missing) notes.push(['', `${res.missing.map((m) => `「${m}」`).join('')}を打つと、答えが出ます（^ や ↑↑ で終わっていたら、続きを）`]);
  if (kind.key === 'tet') {
    notes.push(['', 'a を n 段つんだ累乗の塔。上から計算します（3↑↑3 ＝ 3^(3^3) ＝ 3^27）']);
    if (res.ok && !info.huge && info.count !== null && N.cmp(info.start, N.ONE) !== 0) {
      notes.push(['', `整数でない高さは「線形近似」（いちばん上を 1＋小数の部分 にする）で決めています。ほかの決め方もあります`]);
    }
    if (res.ok && info.conv?.kind === 'fixed') notes.push(['', `この底では、高くつんでも ${nt(info.value.v, 8).text} に近づくだけで、大きくなりません（√2↑↑∞ ＝ 2 など。底が 1.444…（e^(1/e)）以下のとき）`]);
    if (res.ok && info.conv?.kind === 'cycle') notes.push(['', 'この底（0.0659…（e^(−e)）より小さい）では、2つの数を行ったり来たりします。高さが偶数か奇数かで答えが変わります']);
    if (res.ok && info.jump) notes.push(['', `${info.jump.at}段目からは、1段つむごとに「10^」が1段ふえるだけ（上の数字は変わらない）なので、段の数を数えて出しています`]);
  } else if (kind.key === 'slog') {
    notes.push(['', '「a を何段つむと x になるか」（テトレーションの逆）。log_a を何回とると 1 以下になるかで数えます。整数でない答えは線形近似']);
  } else if (kind.key === 'arrow') {
    notes.push(['', '↑ が1個 ＝ 累乗（a を b 回かける）、2個 ＝ テトレーション（a を b 段つむ）、3個 ＝ ↑↑ を b 回くり返す…と、↑ が1つふえるごとに1段上のくり返しになります']);
    if (res.ok && info.jump) notes.push(['', `${info.jump.at + 1} 回目からは「10↑↑」が1つずつふえるだけなので、回数を数えて出しています`]);
  } else if (kind.key === 'ack') {
    notes.push(['', 'A(0, n) ＝ n＋1、A(m, 0) ＝ A(m−1, 1)、A(m, n) ＝ A(m−1, A(m, n−1)) で決まる関数。計算すると 2↑…↑(n＋3) − 3（↑ が m−2 個）になります']);
    if (res.ok && res.info.core && !res.info.minus) notes.push(['', '答えが大きすぎて、− 3 は見えません（上の桁は変わらない）']);
  }
  if (res.ok && res.value.t !== 'num') notes.push(['', '塔のいちばん上の数は、上から10桁で四捨五入しています']);
  return notes;
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showBig() {
  render();
  scrollSelected();
}

function render() {
  const kind = kindOf(st.kind);
  for (const b of document.querySelectorAll('#bnKinds [data-kind]')) {
    b.setAttribute('aria-selected', String(b.dataset.kind === kind.key));
  }
  const famous = kind.key === 'famous';
  $('#bnCard').hidden = famous;
  $('#bnFamous').hidden = !famous;
  $('#bnEntry').hidden = famous;
  $('#bnKeys').hidden = famous;
  $('#bigView').classList.toggle('famous', famous);
  if (famous) renderFamous();
  else {
    const res = current();
    renderCard(res);
    renderEntry(res);
  }
  fadeEdges($('#bnKinds'));
  save();
}

function renderCard(res) {
  const { kind } = res;
  $('#bnName').textContent = kind.label;
  $('#bnShow').textContent = showLine(res);
  const ok = res.ok;
  $('#btnBnCheck').hidden = !ok;
  $('#btnBnToCalc').hidden = !(ok && res.value.t === 'num');
  const ans = $('#bnAnswer');
  ans.disabled = !(ok && res.value.t === 'num');
  ans.classList.toggle('muted', !ok);
  if (ok) {
    const f = bigForms(res.value);
    ans.innerHTML = `<span class="bn-eq">＝ </span>${f.html}${f.note ? `<small class="bn-count">（${f.note}）</small>` : ''}`;
    const length = f.width;
    ans.classList.toggle('long', length > 13 && length <= 19);
    ans.classList.toggle('longer', length > 19);
  } else {
    ans.innerHTML = '<span class="bn-eq">＝ </span>？';
    ans.classList.remove('long', 'longer');
  }
  $('#bnSub').replaceChildren(...(ok ? sizeLines(res.value) : []).map((t) => el('div', '', t)));
  $('#bnNotes').replaceChildren(...notesOf(res).map(([cls, text]) => el('p', cls, text)));
}

function renderEntry(res) {
  const { kind } = res;
  const vals = st.vals[kind.key];
  const active = st.active[kind.key];
  const fields = $('#bnFields');
  fields.style.setProperty('--cols', String(kind.fields.length));
  fields.replaceChildren(...kind.fields.map((f) => {
    const b = button('fld bn-fld');
    b.dataset.f = f.key;
    b.append(el('small', '', f.name), el('span', 'v'), el('small', 'unit'));
    const text = vals[f.key];
    setField(b, {
      text, placeholder: '0', active: f.key === active, fresh: st.fresh, shown: text ? chainShown(text) : null, unit: '',
    });
    return b;
  }));
  const af = fieldOf(kind, active);
  $('#bnHint').textContent = af.hint;
  // ^ ↑↑ は、打てる欄だけ
  for (const k of ['^', 'up2']) $(`#bnKeys [data-k="${k}"]`).classList.toggle('dim', !af.chain);
  $('#bnKeys [data-k="."]').classList.toggle('dim', !!af.int);
}

// 有名な数の一覧
let famousCache = null;
function renderFamous() {
  famousCache ??= B.famous();
  $('#bnFamous').replaceChildren(...famousCache.map((f) => {
    const li = el('li', 'bn-fm');
    li.append(el('div', 'bn-fm-name', f.name), el('div', 'bn-fm-def', f.def));
    if (f.value) {
      const v = el('div', 'bn-fm-val');
      const forms = bigForms(f.value, 8);
      v.innerHTML = `＝ ${forms.html}${forms.note ? `<small class="bn-count">（${forms.note}）</small>` : ''}`;
      li.append(v);
      for (const t of sizeLines(f.value).filter((x) => x.startsWith('≒'))) li.append(el('div', 'bn-fm-size', t));
    }
    if (f.note) li.append(el('div', `bn-fm-note${f.value ? '' : ' ng'}`, f.note));
    return li;
  }));
}

// 横にはみ出しているとき、はしをうすくする（横に動かせる印）
function fadeEdges(row) {
  row.classList.toggle('fade-l', row.scrollLeft > 2);
  row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
}

function scrollSelected() {
  const b = document.querySelector('#bnKinds [aria-selected="true"]');
  const row = b?.parentElement;
  if (!b || !row || row.clientWidth === 0) return;
  const left = b.offsetLeft - row.offsetLeft;
  if (left < row.scrollLeft || left + b.offsetWidth > row.scrollLeft + row.clientWidth) {
    row.scrollLeft = left - (row.clientWidth - b.offsetWidth) / 2;
  }
  fadeEdges(row);
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function press(key, target) {
  const kind = kindOf(st.kind);
  if (!kind.fields.length) return reject(target);
  if (key === 'next') {
    const i = kind.fields.findIndex((f) => f.key === st.active[kind.key]);
    st.active[kind.key] = kind.fields[(i + 1) % kind.fields.length].key;
    st.fresh = true;
    return render();
  }
  const f = fieldOf(kind, st.active[kind.key]);
  const vals = st.vals[kind.key];
  const next = typeChain(vals[f.key], key, f, st.fresh);
  if (next === null) {
    reject(target);
    if ((key === '^' || key === 'up2') && !f.chain) toast(`「${f.name}」には ^ や ↑↑ は使えません`);
    return undefined;
  }
  vals[f.key] = next;
  st.fresh = false;
  return render();
}

// ---------------------------------------------------------
// 検算
// ---------------------------------------------------------
function section(title, ...children) {
  const s = el('section', 'd-sec');
  s.append(el('h3', '', title), ...children);
  return s;
}
const line = (text) => el('div', 'calc-line', text);
const hint = (text) => el('p', 'hint', text);
function checked(text, ok) {
  const d = el('div', 'rev', `${text} `);
  d.append(el('span', `mark ${ok ? 'ok' : 'ng'}`, ok ? '✓' : '✗'));
  return d;
}
const bt = (b) => {
  const f = bigForms(b, 10);
  return f.note ? `${f.text}（${f.note}）` : f.text;
};
// 2つの巨大数が同じか（概数は上から 30 桁）
const same = (x, y) => B.closeBig(x, y, 30);
const tryDo = (fn) => {
  try {
    return fn();
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    return { error: error.message };
  }
};

function openBigCheck() {
  const res = current();
  if (!res.ok) return;
  const body = $('#checkBody');
  body.replaceChildren();
  let ok = true;
  const add = (title, children, good = true) => {
    body.append(section(`${body.children.length + 1}. ${title}`, ...children));
    if (!good) ok = false;
  };
  const a = res.input.a?.v;
  if (res.kind.key === 'tet') {
    $('#checkTitle').textContent = 'テトレーションの検算';
    tetChecks(a, res.input.n, res.info, add);
  } else if (res.kind.key === 'slog') {
    $('#checkTitle').textContent = 'スーパー対数の検算';
    slogChecks(a, res.input.x, res.info, add);
  } else if (res.kind.key === 'arrow') {
    $('#checkTitle').textContent = '矢印表記の検算';
    arrowChecks(a, Number(st.vals.arrow.k), res.input.b, res.info, add);
  } else {
    $('#checkTitle').textContent = 'アッカーマン関数の検算';
    ackChecks(res.input.m, res.input.n, res.info, add);
  }
  body.prepend(el('p', `summary ${ok ? 'ok' : 'ng'}`, ok ? '✓ 逆にたどると、打った数にもどります' : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// テトレーション（矢印 ↑↑ でも使う）
function tetChecks(a, n, info, add) {
  let good = true;
  const at = nt(a, 8).text;
  if (!info.huge && !info.steps.length) {
    add('決まり', [line(`${at}↑↑(−1) ＝ 0`), hint(`${at}↑↑0 ＝ ${at}^(${at}↑↑(−1)) ＝ ${at}^0 ＝ 1 になるように、こう決めています`)]);
    return true;
  }
  if (info.huge) {
    add('高さが巨大数のとき', [
      line(`${at}↑↑(${bt(n)})`),
      line(`≒ 10↑↑(${bt(n)}) ＝ ${bt(info.value)}`),
      hint('高さがこれほど大きいと、底が 10 でも a でも、ちがいは見えないほど小さい（上の数字は変わらない）ので、10↑↑ を1つ足した形になります'),
    ]);
  } else {
    // 1. 上から1段ずつ
    const box = el('div');
    const f = N.sub(info.start, N.ONE);
    info.steps.forEach((v, j) => {
      const h = N.add(N.frac(BigInt(j)), f);
      const name = `${at}↑↑${nt(h, 6).text}`;
      box.append(line(j === 0 ? `${name} ＝ ${bt(v)}（はじめ）` : `${name} ＝ ${at}^(前の数) ＝ ${bt(v)}`));
    });
    const shown = info.steps.length;
    if (info.jump) {
      box.append(line(`…あと ${nt(info.jump.rest).text} 回 ${at}^ をする`));
      box.append(hint(`10^10^x に ${at}^ をすると 10^10^(x ＋ とても小さい数) になり、上の数字は変わりません。だから 1回ごとに「10^」が1段ふえるだけです`));
      box.append(line(`→ ${bt(info.value)}`));
    } else if (info.conv) {
      box.append(hint(info.conv.kind === 'fixed'
        ? `${at}^(この数) が また同じ数になったので、ここから先は何段つんでも変わりません`
        : '2つの数を行ったり来たりしはじめたので、残りの回数が偶数か奇数かで決まります'));
      box.append(line(`→ ${bt(info.value)}`));
    } else if (info.count && N.cmp(info.count, N.frac(BigInt(shown - 1))) > 0) {
      box.append(line(`…（同じように、ぜんぶで ${nt(info.count).text} 回）→ ${bt(info.value)}`));
    }
    if (N.cmp(info.start, N.ONE) !== 0) box.append(hint(`高さ ${bt(n)} の小数の部分から、いちばん上を ${nt(info.start, 8).text}（1 ＋ 小数の部分）にしています（線形近似）`));
    add('上から1段ずつ計算する', [box]);
  }

  // 2. 逆算
  const e1e = N.exp(N.div(N.ONE, S.E));
  if (info.conv?.kind === 'fixed') {
    const back = tryDo(() => B.powBig(a, info.value));
    const ok = !back.error && same(back, info.value);
    add('たしかめ：答えにもう1段つむ', [line(`${at}^${bt(info.value)} ＝ ${back.error ?? bt(back)}`), checked('答えと同じ（もう変わらない）', ok)], ok);
    good = ok;
  } else if (info.conv?.kind === 'cycle') {
    const back = tryDo(() => B.powBig(a, B.powBig(a, info.value)));
    const ok = !back.error && same(back, info.value);
    add('たしかめ：答えに2段つむ', [line(`${at}^${at}^${bt(info.value)} ＝ ${back.error ?? bt(back)}`), checked('答えにもどる（2つの数のくり返し）', ok)], ok);
    good = ok;
  } else if (N.cmp(a, e1e) > 0) {
    const r = tryDo(() => B.slogInfo(a, info.value));
    if (r.error) {
      add('逆算：スーパー対数', [line(r.error)], false);
      return false;
    }
    const box = el('div');
    box.append(line(`答えに ${logName(at)} を、1 以下になるまでくり返します`));
    const list = r.steps.slice(0, 8);
    list.forEach((v, i) => box.append(line(`${i === 0 ? '答え' : `${i}回`}：${bt(v)}`)));
    if (r.skip.length) box.append(hint(`10^ が3段以上の塔は、log を1回とるごとに「10^」が1段へるだけなので、まとめて数えています（${r.skip.map((s) => `${countText(s.n)} 回`).join('・')}）`));
    if (r.steps.length > list.length) box.append(line('…'));
    const ok = same(r.value, n);
    box.append(line(`slog ＝ ${bt(r.value)}`), checked(`高さ ${bt(n)} にもどる`, ok));
    add('逆算：何段つんだか数える（スーパー対数）', [box], ok);
    good = ok;
  } else if (info.count && N.cmp(info.count, N.ONE) >= 0) {
    // 底が小さいとき：最後の1段だけもどす
    const lower = tryDo(() => B.tetrate(a, B.num(N.sub(n.v, N.ONE))));
    const back = lower.error ? lower : tryDo(() => B.logBig(a, info.value));
    const ok = !back.error && !lower.error && same(back, lower);
    add('逆算：最後の1段をもどす', [
      line(`${logName(at)}(答え) ＝ ${back.error ?? bt(back)}`),
      line(`${at}↑↑(${bt(n)} − 1) ＝ ${lower.error ?? bt(lower)}`),
      checked('1段低い塔と同じ', ok),
    ], ok);
    good = ok;
  }
  return good;
}

function slogChecks(a, x, info, add) {
  const at = nt(a, 8).text;
  const box = el('div');
  box.append(line(`x ＝ ${bt(x)}`));
  let i = 0;
  for (const v of info.steps.slice(1, 12)) {
    i++;
    box.append(line(`${logName(at)} を ${i}回 → ${bt(v)}`));
  }
  if (info.steps.length > 12) box.append(line('…'));
  if (info.skip.length) box.append(hint(`10^ が3段以上の塔は、log を1回とるごとに「10^」が1段へるだけなので、まとめて数えています（${info.skip.map((s) => `${countText(s.n)} 回`).join('・')}）`));
  if (info.huge) box.append(hint('とても大きい数なので、「10↑↑ いくつ」から数えています'));
  else box.append(line(`${countText(info.count)} 回で 1 以下になったので、答え ＝ ${countText(info.count)} ＋ (さいごの数 − 1) ＝ ${bt(info.value)}`));
  add('log を何回とると 1 以下になるか', [box]);
  const back = tryDo(() => B.tetrate(a, info.value));
  const ok = !back.error && same(back, x);
  add('逆算：答えの段だけつむ', [line(`${at}↑↑${paren(bt(info.value))} ＝ ${back.error ?? bt(back)}`), checked('x にもどる', ok)], ok);
}

function arrowChecks(a, k, b, info, add) {
  const at = nt(a, 8).text;
  if (k === 2) return tetChecks(a, b, info.tet, add);
  if (k === 1) {
    add('計算', [line(`${at}^${bt(b)} ＝ ${bt(info.value)}`)]);
    if (N.cmp(a, N.ONE) === 0) return add('たしかめ', [hint('1 は何乗しても 1 です')]);
    const back = tryDo(() => B.logBig(a, info.value));
    const ok = !back.error && same(back, b);
    return add('逆算：log をとる', [line(`${logName(at)}(答え) ＝ ${back.error ?? bt(back)}`), checked(`b ＝ ${bt(b)} にもどる`, ok)], ok);
  }
  const up = arrows(k);
  const low = arrows(k - 1);
  // 1. 定義どおりに1つずつ
  const box = el('div');
  info.steps.forEach((v, i) => {
    box.append(line(i === 0 ? `${at}${up}1 ＝ ${at}` : `${at}${up}${i + 1} ＝ ${at}${low}(前の数) ＝ ${bt(v)}`));
  });
  if (info.jump) {
    box.append(line(`…あと ${countText(info.jump.rest)} 回`));
    box.append(hint(`巨大な数に ${at}↑↑ をすると、10↑↑ を1つ足した形になる（上の数字は変わらない）ので、1回ごとに「10↑↑」が1つふえるだけです`));
    box.append(line(`→ ${bt(info.value)}`));
  }
  if (b.t === 'num' && N.isZero(b.v)) box.append(hint(`b ＝ 0 のときは 1 と決まっています`));
  add(`定義どおり：${at}${up}b ＝ ${at}${low}(${at}${up}(b−1))`, [box]);
  if (N.cmp(a, N.ONE) === 0 || (b.t === 'num' && N.isZero(b.v))) return undefined;
  // 2. 逆算
  const r = tryDo(() => B.hyperLogInfo(a, k, info.value));
  if (r.error) return add('逆算', [line(r.error)], false);
  const rows = el('div');
  rows.append(line(`答え：${bt(info.value)}`));
  r.rows.slice(1, 10).forEach(({ v, times }) => {
    rows.append(line(`${k === 3 ? 'slog' : `${low}の逆`}${times > 1n ? `を ${countText(times)} 回` : ''} → ${bt(v)}`));
  });
  if (r.rows.length > 10) rows.append(line('…'));
  const ok = same(r.value, b) && r.last && r.last.t === 'num' && B.sameDigits(r.last.v, a, 30);
  rows.append(line(`${at} にもどるまでの回数 ＋ 1 ＝ ${bt(r.value)}`), checked(`b ＝ ${bt(b)}`, ok));
  if (k === 3) rows.append(hint(`slog（スーパー対数）は ${at}↑↑ の逆。1回とるごとに ${at}${up}b の b が1つへります`));
  return add(`逆算：${low} の逆を何回とると ${at} にもどるか`, [rows], ok);
}

function ackChecks(mx, nx, info, add) {
  const m = Number(S.floorInt(mx.v));
  const nText = bt(nx);
  const box = el('div');
  if (m <= 2) {
    box.append(line(`A(${m}, n) ＝ ${['n ＋ 1', 'n ＋ 2', '2n ＋ 3'][m]} ＝ ${bt(info.value)}`));
  } else {
    box.append(line(`A(${m}, ${nText}) ＋ 3 ＝ 2${m === 3 ? '^' : arrows(m - 2)}(${nText} ＋ 3) ＝ ${bt(info.core)}`));
    box.append(line(info.minus ? `A ＝ ${bt(info.core)} − 3 ＝ ${bt(info.value)}` : 'A ＝ 上の数 − 3（大きすぎて − 3 は見えない）'));
    box.append(hint(`A(m, n) ＋ 3 ＝ 2${'↑…↑'}(n ＋ 3)（↑ が m−2 個）になることが、定義から順に たしかめられます`));
  }
  add('答えの形', [box]);

  // 2. 定義どおり（小さいときだけ）
  if (nx.t === 'num' && N.approxLog10(N.absNum(nx.v)) < 7) {
    const n = Number(S.floorInt(nx.v));
    const r = m <= 5 ? B.ackermannByDefinition(m, n) : null;
    if (r) {
      const ok = info.value.t === 'num' && N.cmp(info.value.v, N.frac(BigInt(r.value))) === 0;
      add('定義どおりに計算する', [
        line(`A(0, n) ＝ n＋1、A(m, 0) ＝ A(m−1, 1)、A(m, n) ＝ A(m−1, A(m, n−1)) を ${countText(r.calls)} 回 使うと ${countText(r.value)}`),
        checked('同じ答え', ok),
      ], ok);
    } else {
      add('定義どおりに計算する', [hint('定義どおりに計算すると、300万回より多く くり返すので省略します（A(4, 1) でも 28億回以上）')]);
    }
  }

  // 3. 逆算：n にもどす
  const plus3 = info.core ?? null;
  let back;
  if (m === 0) back = B.num(N.sub(info.value.v, N.ONE));
  else if (m === 1) back = B.num(N.sub(info.value.v, N.frac(2n)));
  else if (m === 2) back = B.num(N.div(N.sub(info.value.v, N.frac(3n)), N.frac(2n)));
  else {
    const r = tryDo(() => (m === 3 ? { value: B.logBig(N.frac(2n), plus3) } : B.hyperLogInfo(N.frac(2n), m - 2, plus3)));
    back = r.error ? r : (r.value.t === 'num' ? B.num(N.sub(r.value.v, N.frac(3n))) : r.value);
  }
  const ok = !back.error && same(back, nx);
  const how = m === 0 ? '答え − 1' : m === 1 ? '答え − 2' : m === 2 ? '(答え − 3) ÷ 2' : m === 3 ? 'log₂(答え ＋ 3) − 3' : `2${arrows(m - 2)} の逆(答え ＋ 3) − 3`;
  add('逆算：n にもどす', [line(`${how} ＝ ${back.error ?? bt(back)}`), checked(`n ＝ ${nText}`, ok)], ok);
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onUseInCalc(value, label) }
export function initBig(h) {
  hooks = h;
  load();
  $('#bnKinds').replaceChildren(...KINDS.map((k) => {
    const b = button('', k.name);
    b.dataset.kind = k.key;
    b.setAttribute('role', 'tab');
    return b;
  }));
  $('#bnKinds').addEventListener('click', (event) => {
    const b = event.target.closest('[data-kind]');
    if (!b || b.dataset.kind === st.kind) return;
    st.kind = b.dataset.kind;
    st.fresh = true;
    render();
    scrollSelected();
  });
  $('#bnKinds').addEventListener('scroll', () => fadeEdges($('#bnKinds')), { passive: true });
  $('#bnFields').addEventListener('click', (event) => {
    const b = event.target.closest('[data-f]');
    if (!b) return;
    st.active[st.kind] = b.dataset.f;
    st.fresh = true;
    render();
  });
  window.addEventListener('resize', () => {
    if (hooks.active()) render();
  });
  $('#bnAnswer').addEventListener('click', () => {
    const res = current();
    if (res.ok && res.value.t === 'num') openDetail(res.value.v, { name: res.kind.name });
  });
  $('#btnBnCheck').addEventListener('click', openBigCheck);
  $('#btnBnToCalc').addEventListener('click', () => {
    const res = current();
    if (res.ok && res.value.t === 'num') hooks.onUseInCalc(res.value.v, F.chipLabel(res.value.v));
  });
  setupPad($('#bnKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', '.': '.', '^': '^', Enter: 'next', ArrowDown: 'next', Tab: 'next' },
  });
}
