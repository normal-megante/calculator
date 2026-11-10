// =========================================================
// 単位変換の画面
//
//   上：種類（長さ・重さ・面積…）
//   まん中：答え（見たい単位）と、その種類の全部の単位の一覧（タップで「見たい単位」に）
//   下：打つ数の欄と、その単位（横に並んだボタン）、数字キー（± と ⇄ 入れかえ）
//
// 欄が空のときは「1」で計算する（1坪 は何 m² か、がすぐ見える）。計算そのものは unit.js
// =========================================================
import * as U from './unit.js';
import * as N from './num.js';
import * as F from './format.js';
import { $ } from './ui.js';
import { openDetail } from './detail.js';
import { typeKey, el, button, shake, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.unit';
const MAX_INT = 12;
const MAX_DEC = 8;

const blank = (c) => ({ from: c.from, to: c.to, text: '', neg: false, carry: null });
const st = {
  cat: U.CATS[0].key,
  per: Object.fromEntries(U.CATS.map((c) => [c.key, blank(c)])), // 種類ごとの、単位と打った数
  fresh: false,
};
let hooks = {};

const reject = (target) => shake(target, hooks.settings());
const cat = () => U.catByKey(st.cat);
const per = () => st.per[st.cat];

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cat: st.cat, per: st.per }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (U.catByKey(s.cat)) st.cat = s.cat;
    for (const c of U.CATS) {
      const p = s.per?.[c.key];
      if (!p || typeof p !== 'object') continue;
      const v = st.per[c.key];
      if (U.unitOf(c, p.from)) v.from = p.from;
      if (U.unitOf(c, p.to) && p.to !== v.from) v.to = p.to;
      if (v.from === v.to) v.to = c.units.find((u) => u.key !== v.from).key;
      if (typeof p.text === 'string' && /^\d{0,12}(\.\d{0,8})?$/.test(p.text)) v.text = p.text;
      v.neg = !!p.neg;
      if (p.carry && typeof p.carry === 'object') {
        try {
          const x = N.deserialize(p.carry);
          if (x.q && x.d <= 0n) throw new Error('分母が 0 以下');
          v.carry = N.serialize(x);
          v.text = '';
          v.neg = false;
        } catch {
          v.carry = null;
        }
      }
    }
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 打った数
// ---------------------------------------------------------
const isBlank = (p) => !p.carry && !p.text;

function inputValue(p) {
  if (p.carry) return N.deserialize(p.carry);
  const x = p.text ? N.parseDecimal(p.text.endsWith('.') ? p.text.slice(0, -1) : p.text) : N.ONE;
  return p.neg ? N.neg(x) : x;
}

// 打った数の文字（「−12.5」）
function inputText(p) {
  if (p.carry) return U.valueText(N.deserialize(p.carry)).text;
  return `${p.neg ? '−' : ''}${p.text ? F.groupNumberText(p.text) : '1'}`;
}

// いまの答え：{ x, from, to, all, answer } / { error }
function current() {
  const c = cat();
  const p = per();
  const x = inputValue(p);
  const all = U.convertAll(c, p.from, x);
  const from = U.unitOf(c, p.from);
  const to = U.unitOf(c, p.to);
  if (all.error) return { error: all.error, c, p, x, from, to };
  return { c, p, x, from, to, all, answer: all.values.get(p.to) };
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showUnit() {
  render();
  scrollSelected();
}

function render() {
  const r = current();
  const { c, p, from, to } = r;
  for (const b of document.querySelectorAll('#unitCats [data-cat]')) {
    b.setAttribute('aria-selected', String(b.dataset.cat === st.cat));
  }
  renderCard(r);
  renderRows(r);

  // 打つ数の欄
  const shown = p.carry ? inputText(p) : p.text ? `${p.neg ? '−' : ''}${F.groupNumberText(p.text)}` : p.neg ? '−' : null;
  setField($('#unitField'), {
    text: isBlank(p) && !p.neg ? '' : 'x', placeholder: '1', active: true, fresh: st.fresh, shown, unit: from.sym,
  });

  // 打つ数の単位
  $('#unitFrom').replaceChildren(...c.units.map((u) => {
    const b = button('chip', u.sym);
    b.dataset.from = u.key;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(u.key === p.from));
    return b;
  }));

  // 注意書き：打った単位 → 見たい単位 → 種類全体
  const hint = $('#unitHint');
  hint.textContent = r.error ?? (isBlank(p) ? '空のときは 1 で計算しています' : from.note ? `${from.sym}：${from.note}` : to.note ? `${to.sym}：${to.note}` : c.hint ?? '');
  hint.classList.toggle('ng', !!r.error);
  fadeEdges($('#unitCats'));
  fadeEdges($('#unitFrom'));
  save();
}

function renderCard(r) {
  const { c, p, from, to } = r;
  $('#unitLabel').textContent = c.name;
  $('#unitCount').textContent = `${from.sym} → ${to.sym}`;
  const main = $('#unitMain');
  $('#btnUnitCheck').hidden = !!r.error;
  $('#btnUnitToCalc').hidden = !!r.error;
  if (r.error) {
    main.textContent = '—';
    main.classList.add('muted');
    main.classList.remove('long', 'longer');
    main.disabled = true;
    $('#unitSub').textContent = '';
    return;
  }
  const v = U.valueText(r.answer);
  main.innerHTML = `${v.html}<small class="u">${escapeHtml(to.sym)}</small>`;
  const length = v.text.length + to.sym.length;
  main.classList.toggle('long', length > 13 && length <= 17);
  main.classList.toggle('longer', length > 17);
  main.classList.toggle('muted', isBlank(p));
  main.disabled = false;
  // 見たい単位の 1 は、打った単位でいくつか
  const one = U.convert(c, to.key, from.key, N.ONE);
  $('#unitSub').textContent = to.affine
    ? `${inputText(p)} ${from.sym} は ${v.text} ${to.sym}`
    : `${inputText(p)} ${from.sym} ＝ ${v.text} ${to.sym}（1${to.sym} ＝ ${U.valueText(one).text} ${from.sym}）`;
}

function renderRows(r) {
  const { c, p } = r;
  $('#unitRows').replaceChildren(...c.units.map((u) => {
    const b = button(`u-row${u.key === p.from ? ' from' : ''}${u.key === p.to ? ' to' : ''}`);
    b.dataset.unit = u.key;
    const name = el('span', 'u-sym', u.sym);
    if (u.read) name.append(el('small', '', u.read));
    if (u.key === p.from) name.append(el('small', 'u-tag', '打った数'));
    if (u.key === p.to) name.append(el('small', 'u-tag to', '答え'));
    const val = el('b', 'u-val');
    if (r.error) val.textContent = u.key === p.from ? inputText(p) : '—';
    else val.innerHTML = U.valueText(r.all.values.get(u.key)).html;
    b.append(name, val);
    // 角度の「度」は、度分秒も
    if (u.dms && !r.error) {
      const dms = U.dmsText(r.all.values.get(u.key));
      if (dms) b.append(el('small', 'u-note', `度分秒：${dms}`));
    }
    if (u.note) b.append(el('small', 'u-note', u.note));
    b.setAttribute('aria-pressed', String(u.key === p.to));
    return b;
  }));
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// 横にはみ出しているとき、はしをうすくする（横に動かせる印）
function fadeEdges(row) {
  row.classList.toggle('fade-l', row.scrollLeft > 2);
  row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
}

// えらんでいる種類と単位のボタンが見えるように
function scrollSelected() {
  for (const sel of ['#unitCats [aria-selected="true"]', '#unitFrom [aria-checked="true"]']) {
    const b = document.querySelector(sel);
    const row = b?.parentElement;
    if (!b || !row || row.clientWidth === 0) continue;
    const left = b.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + b.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = left - (row.clientWidth - b.offsetWidth) / 2;
    }
    fadeEdges(row);
  }
  // 一覧の「答え」の行が見えるように
  const rows = $('#unitRows');
  const to = rows.querySelector('.u-row.to');
  if (!to || rows.clientHeight === 0) return;
  const top = to.offsetTop - rows.offsetTop;
  if (top < rows.scrollTop || top + to.offsetHeight > rows.scrollTop + rows.clientHeight) {
    rows.scrollTop = top - (rows.clientHeight - to.offsetHeight) / 2;
  }
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function press(key, target) {
  const p = per();
  if (key === 'swap') return swap(target);
  if (key === 'neg') {
    if (p.carry) p.carry = N.serialize(N.neg(N.deserialize(p.carry)));
    else p.neg = !p.neg;
    st.fresh = false;
    return render();
  }
  if (key === 'clear') {
    if (isBlank(p) && !p.neg) return reject(target);
    Object.assign(p, { text: '', neg: false, carry: null });
    st.fresh = false;
    return render();
  }
  if (key === 'back' && (p.carry || (!p.text && p.neg))) {
    Object.assign(p, { text: '', neg: false, carry: null });
    st.fresh = false;
    return render();
  }
  const fresh = st.fresh || !!p.carry;
  const next = typeKey(p.carry ? '' : p.text, key, { fresh, maxDecimals: MAX_DEC, maxInt: MAX_INT });
  if (next === null) return reject(target);
  if (fresh && key !== 'back') {
    p.neg = false; // 新しい数を打ちはじめた
    p.carry = null;
  }
  p.text = next;
  st.fresh = false;
  render();
}

// ⇄：打つ単位と見たい単位を入れかえる（答えを、打った数にする）
function swap(target) {
  const r = current();
  if (r.error) return reject(target);
  const p = r.p;
  if (!isBlank(p)) {
    const plain = U.plainDecimal(r.answer, { maxInt: MAX_INT, maxDecimals: MAX_DEC });
    if (plain) Object.assign(p, { text: plain.text, neg: plain.neg, carry: null });
    else Object.assign(p, { text: '', neg: false, carry: N.serialize(r.answer) });
  }
  [p.from, p.to] = [p.to, p.from];
  st.fresh = !isBlank(p);
  render();
  scrollSelected();
}

function pickFrom(key) {
  const p = per();
  if (key === p.from) return;
  if (key === p.to) p.to = p.from;
  p.from = key;
  render();
}

function pickTo(key) {
  const p = per();
  if (key === p.from || key === p.to) return;
  p.to = key;
  render();
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
function checked(text, ok) {
  const d = el('div', 'rev', `${text} `);
  d.append(el('span', `mark ${ok ? 'ok' : 'ng'}`, ok ? '✓' : '✗'));
  return d;
}
const t = (x) => U.valueText(x).text;
const minus = (x) => (N.sign(x) < 0 ? `(${t(x)})` : t(x)); // 式の中のマイナスの数はかっこに

// 温度の式（℃ が基準）
const TEMP_TO_BASE = {
  f: (x, y) => `(${minus(x)} − 32) × 5/9 ＝ ${t(y)} ℃`,
  k: (x, y) => `${minus(x)} − 273.15 ＝ ${t(y)} ℃`,
};
const TEMP_FROM_BASE = {
  f: (y, z) => `${minus(y)} × 9/5 ＋ 32 ＝ ${t(z)} ℉`,
  k: (y, z) => `${minus(y)} ＋ 273.15 ＝ ${t(z)} K`,
};

function toBaseLine(u, x, y, base) {
  if (u.affine) return TEMP_TO_BASE[u.key](x, y);
  return `${minus(x)} ${u.sym} × ${U.factorLabel(u)} ＝ ${t(y)} ${base.sym}`;
}
function fromBaseLine(u, y, z, base) {
  if (u.affine) return TEMP_FROM_BASE[u.key](y, z);
  return `${minus(y)} ${base.sym} ÷ ${U.factorLabel(u)} ＝ ${t(z)} ${u.sym}`;
}

// 「400/121 m²（約3.30578512397 m²）」・「0.0254 m」・「180/π 度（約57.2957795131 度）」
function factorWithUnit(u, sym) {
  const x = u.f;
  if (u.ftext) return `${u.ftext} ${sym}（約${t(x).replace(/…$/, '')} ${sym}）`;
  const p = U.plainDecimal(x, { maxInt: 30, maxDecimals: 30 });
  if (p) return `${F.groupNumberText(p.text)} ${sym}`;
  return `${F.fractionForm(x).text} ${sym}（約${t(x).replace(/…$/, '')} ${sym}）`;
}

// 四捨五入して見せている数（sig 桁）を、正確な数に
function shownValue(x, sig = 12) {
  const r = N.roundSig(x, sig);
  const m = BigInt(r.digits) * (r.neg ? -1n : 1n);
  const e = r.exp - r.digits.length;
  return e >= 0 ? N.frac(m * N.pow10(e)) : N.frac(m, N.pow10(-e));
}

function openUnitCheck() {
  const r = current();
  if (r.error) return;
  const { c, x, from, to, answer } = r;
  const base = U.baseUnit(c);
  const y = r.all.base;
  $('#checkTitle').textContent = '単位の検算';
  const body = $('#checkBody');
  body.replaceChildren();

  // 1. 基準の単位にする → 2. 見たい単位にする
  const go = el('div');
  if (from.key === base.key) go.append(line(`${from.sym} が基準の単位なので、そのまま ${t(x)} ${base.sym}`));
  else go.append(line(toBaseLine(from, x, y, base)));
  if (to.key !== base.key) go.append(line(fromBaseLine(to, y, answer, base)));
  const approx = from.approx || to.approx;
  go.append(el('p', 'hint', approx
    ? `${c.name}は ${base.sym} を基準にして、いったん ${base.sym} にしてから変換しています。rad は π（80桁で計算した概数）を使うので、答えは概数です（上から50桁を出しています）。`
    : `${c.name}は ${base.sym} を基準にして、いったん ${base.sym} にしてから変換しています。分数のまま計算するので、途中で誤差は出ません。`));
  const path = [from, base, to].filter((u, i, list) => i === 0 || u.key !== list[i - 1].key).map((u) => u.sym);
  body.append(section(`1. ${path.join(' → ')}`, go));

  // 2. 逆算
  const rev = el('div');
  const back = U.convert(c, to.key, from.key, answer);
  const ok = U.sameValue(back, x); // 概数（rad）は上から50桁で比べる
  const backText = approx && ok ? `${t(x)} ${from.sym}（上から50桁まで同じ）` : `${t(back)} ${from.sym}`;
  rev.append(checked(`${t(answer)} ${to.sym} を ${from.sym} にもどすと ${backText}`, ok));
  const v = U.valueText(answer);
  if (v.rounded) {
    const s = shownValue(answer);
    const sBack = U.convert(c, to.key, from.key, s);
    rev.append(el('p', 'hint', `答えの ${v.text} は、四捨五入して12桁で見せています。四捨五入した数 ${t(s)} でもどすと ${U.valueText(sBack, 20).text} ${from.sym} になり、少しずれます（答えをタップすると全部の桁）。`));
  }
  body.append(section('2. 逆算（もとの単位にもどす）', rev));

  // 3. 単位の大きさ（どこから来た数か）
  const defs = el('div');
  for (const u of [from, to]) {
    if (u.key === base.key) continue;
    if (u.affine) defs.append(line(`${u.sym}：${u.def}`));
    else if (u.def) defs.append(line(`1 ${u.sym} ＝ ${u.def}`), line(`　 ＝ ${factorWithUnit(u, base.sym)}`));
    else defs.append(line(`1 ${u.sym} ＝ ${factorWithUnit(u, base.sym)}`));
    if (u.note) defs.append(el('p', 'hint', `${u.sym}：${u.note}`));
  }
  if (defs.childElementCount) body.append(section('3. 単位の大きさ', defs));

  const same = approx ? '✓ もとの単位にもどすと、打った数と同じです（概数なので上から50桁で比べています）' : '✓ もとの単位にもどすと、打った数とぴったり同じです';
  body.prepend(el('p', `summary ${ok ? 'ok' : 'ng'}`, ok ? same : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onUseInCalc(value, label) }
export function initUnit(h) {
  hooks = h;
  load();
  $('#unitCats').replaceChildren(...U.CATS.map((c) => {
    const b = button('', c.name);
    b.dataset.cat = c.key;
    b.setAttribute('role', 'tab');
    return b;
  }));
  $('#unitCats').addEventListener('click', (event) => {
    const b = event.target.closest('[data-cat]');
    if (!b || b.dataset.cat === st.cat) return;
    st.cat = b.dataset.cat;
    st.fresh = false;
    render();
    scrollSelected();
  });
  $('#unitFrom').addEventListener('click', (event) => {
    const b = event.target.closest('[data-from]');
    if (b) pickFrom(b.dataset.from);
  });
  $('#unitRows').addEventListener('click', (event) => {
    const b = event.target.closest('[data-unit]');
    if (b) pickTo(b.dataset.unit);
  });
  for (const row of [$('#unitCats'), $('#unitFrom')]) {
    row.addEventListener('scroll', () => fadeEdges(row), { passive: true });
  }
  window.addEventListener('resize', () => {
    if (hooks.active()) render();
  });
  $('#unitField').addEventListener('click', () => {
    st.fresh = false;
    render();
  });
  $('#unitMain').addEventListener('click', () => {
    const r = current();
    if (r.error) return;
    openDetail(r.answer, { name: `${inputText(r.p)}${r.from.sym} → ${r.to.sym}` });
  });
  $('#btnUnitCheck').addEventListener('click', openUnitCheck);
  $('#btnUnitToCalc').addEventListener('click', () => {
    const r = current();
    if (r.error) return;
    hooks.onUseInCalc(r.answer, `${F.chipLabel(r.answer)}${r.to.sym}`);
  });
  setupPad($('#unitKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', '.': '.', '-': 'neg', Enter: 'swap' },
  });
}
