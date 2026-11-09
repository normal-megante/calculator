// =========================================================
// 物理・電気の公式の画面
//
//   上：種類（電気・力と運動…）と、公式の一覧（横に並んだボタン）
//   まん中：公式・「求める」量・答え（＝ を押さなくても出る）・変形した式・注意書き
//   下：量の欄（2列。タップでえらぶ）と、えらんだ欄の単位、数字キー（± 次へ ＝）
//
// ＝ で履歴（種類「公式」）。計算そのものは phys.js
// =========================================================
import * as P from './phys.js';
import * as N from './num.js';
import * as F from './format.js';
import { $, toast } from './ui.js';
import { openDetail } from './detail.js';
import { typeKey, tidy, el, button, shake, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.phys';
const MAX_INT = 12;
const MAX_DEC = 10;

const st = {
  cat: P.CATS[0].key,
  pick: Object.fromEntries(P.CATS.map((c) => [c.key, P.formulasOf(c.key)[0].key])), // 種類ごとにえらんでいる公式
  per: {}, // 公式ごと：{ target（求める量）, active（えらんでいる欄）, vals: { key: { text, neg, unit } } }
  fresh: false,
};
let hooks = {};

const reject = (target) => shake(target, hooks.settings());

function blankPer(f) {
  return {
    target: f.vars[0].key,
    active: f.vars[1].key,
    vals: Object.fromEntries(f.vars.map((v) => [v.key, { text: v.preset, neg: false, unit: v.unit }])),
  };
}
const fkey = () => st.pick[st.cat];
function perOf(key) {
  const f = P.formulaByKey(key);
  st.per[key] ??= blankPer(f);
  return st.per[key];
}

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cat: st.cat, pick: st.pick, per: st.per }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

// 保存の形・履歴の形 → 公式の状態（おかしな所は、はじめの形にもどす）
function restorePer(f, s) {
  const p = blankPer(f);
  if (!s || typeof s !== 'object') return p;
  if (P.varOf(f, s.target)) p.target = s.target;
  for (const v of f.vars) {
    const o = s.vals?.[v.key];
    if (!o || typeof o !== 'object') continue;
    const val = p.vals[v.key];
    if (typeof o.text === 'string' && /^\d{0,12}(\.\d{0,10})?$/.test(o.text)) val.text = o.text;
    val.neg = !!o.neg;
    if (P.unitOf(v, o.unit)) val.unit = o.unit;
  }
  p.active = P.varOf(f, s.active) ? s.active : f.vars.find((v) => v.key !== p.target).key;
  return p;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (P.CATS.some((c) => c.key === s.cat)) st.cat = s.cat;
    for (const c of P.CATS) {
      const f = P.formulaByKey(s.pick?.[c.key]);
      if (f && f.cat === c.key) st.pick[c.key] = f.key;
    }
    for (const f of P.FORMULAS) {
      if (s.per?.[f.key]) st.per[f.key] = restorePer(f, s.per[f.key]);
    }
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// いまの答え
// ---------------------------------------------------------
const hasNumber = (val) => !!val.text && val.text !== '.';
const valText = (val) => `${val.neg ? '−' : ''}${F.groupNumberText(tidy(val.text))}`;

// { f, s, r }（r は phys.js の solve の答え。missing もある）か { f, s, error }
function current(key = fkey(), s = perOf(key)) {
  const f = P.formulaByKey(key);
  const given = {};
  for (const v of f.vars) {
    const val = s.vals[v.key];
    if (v.key === s.target || !hasNumber(val)) continue;
    const x = N.parseDecimal(tidy(val.text));
    given[v.key] = { x: val.neg ? N.neg(x) : x, unit: val.unit };
  }
  try {
    return { f, s, r: P.solve(f, s.target, given, s.vals[s.target].unit) };
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    return { f, s, error: error.message };
  }
}
const ready = (c) => c.r && !c.r.missing;

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showPhys() {
  render();
  scrollSelected();
}

function render() {
  const c = current();
  const { f, s } = c;
  for (const b of document.querySelectorAll('#phCats [data-cat]')) {
    b.setAttribute('aria-selected', String(b.dataset.cat === st.cat));
  }
  $('#phList').replaceChildren(...P.formulasOf(st.cat).map((g) => {
    const b = button('chip', g.name);
    b.dataset.f = g.key;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(g.key === f.key));
    return b;
  }));
  renderCard(c);
  renderEntry(c);
  fadeEdges($('#phCats'));
  fadeEdges($('#phList'));
  fadeEdges($('#phUnits'));
  save();
}

function renderCard(c) {
  const { f, s, r } = c;
  const tv = P.varOf(f, s.target);
  $('#phName').textContent = f.name;
  $('#phShow').textContent = f.show;
  $('#phTarget').replaceChildren(...f.vars.map((v) => {
    const b = button('', v.sym);
    b.dataset.target = v.key;
    b.title = v.name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v.key === s.target));
    b.setAttribute('aria-label', `${v.name}（${v.sym}）を求める`);
    return b;
  }));

  const ok = ready(c);
  $('#btnPhCheck').hidden = !ok;
  $('#btnPhToCalc').hidden = !ok;
  const ans = $('#phAnswer');
  ans.disabled = !ok;
  ans.classList.toggle('muted', !ok);
  const unit = s.vals[s.target].unit;
  if (ok) {
    const v = P.numText(r.answer);
    const html = F.compact(r.answer, 12).html + (v.endsWith('…') ? '…' : '');
    ans.innerHTML = `<span class="ph-sym">${escapeHtml(tv.sym)} ＝ </span>${html}<small class="u">${escapeHtml(r.unit)}</small>`;
    const length = tv.sym.length + v.length + r.unit.length;
    ans.classList.toggle('long', length > 14 && length <= 19);
    ans.classList.toggle('longer', length > 19);
  } else {
    ans.innerHTML = `<span class="ph-sym">${escapeHtml(tv.sym)} ＝ </span>？<small class="u">${escapeHtml(unit)}</small>`;
    ans.classList.remove('long', 'longer');
  }

  // 変形した式と、数を入れた式
  const sub = [el('div', '', P.formOf(f, s.target))];
  if (ok) {
    const converted = [
      ...f.vars.filter((v) => v.key !== s.target && s.vals[v.key].unit !== v.base),
      ...(r.ansConv ? [tv] : []),
    ];
    const bases = [...new Set(converted.map((v) => v.base))];
    sub.push(el('div', '', `＝ ${r.calc}${bases.length ? `（${bases.join('・')} にして計算）` : ''}`));
  }
  $('#phSub').replaceChildren(...sub);

  // 注意書き
  const notes = [];
  if (c.error) notes.push(['ng', c.error]);
  else if (r.missing) notes.push(['', `${r.missing.map((k) => P.varOf(f, k).name).join('・')}を入れると、${tv.name}が出ます`]);
  if (ok) {
    for (const k of r.warn) {
      const v = P.varOf(f, k);
      notes.push(['ng', k === s.target ? `${v.name}がマイナス（か 0）になりました。数を確かめてください` : `${v.name}は 0 より大きい数です`]);
    }
    if (r.plus) notes.push(['', `√ の答えなので、＋ のほうだけ出しています`]);
  }
  if (f.note) notes.push(['', f.note]);
  $('#phNotes').replaceChildren(...notes.map(([cls, text]) => el('p', cls, text)));
}

function renderEntry(c) {
  const { f, s, r } = c;
  const ok = ready(c);
  $('#phFields').replaceChildren(...f.vars.map((v) => {
    const isTarget = v.key === s.target;
    const b = button(`fld ph-fld${isTarget ? ' ph-ans' : ''}`);
    b.dataset.v = v.key;
    const label = v.sym === v.name ? v.name : `${v.sym} ${v.name}`; // 「日数 日数」と2回書かない
    b.append(el('small', '', isTarget ? `${label}（求める）` : label), el('span', 'v'), el('small', 'unit'));
    const val = s.vals[v.key];
    let shown = null;
    if (isTarget) shown = ok ? P.numText(r.answer) : '？';
    else if (val.neg) shown = `−${val.text ? F.groupNumberText(val.text) : ''}`;
    setField(b, {
      text: isTarget || val.neg ? 'x' : val.text,
      placeholder: '0',
      active: v.key === s.active,
      fresh: st.fresh && !isTarget,
      shown,
      unit: val.unit,
    });
    return b;
  }));

  const av = P.varOf(f, s.active);
  const aval = s.vals[s.active];
  $('#phUnits').replaceChildren(...P.unitsOf(av).map((u) => {
    const b = button('chip', u.sym);
    b.dataset.unit = u.sym;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(u.sym === aval.unit));
    return b;
  }));
  $('#phUnits').hidden = P.unitsOf(av).length < 2;
  $('#phHint').textContent = s.active === s.target
    ? `${av.name}（求める量）：単位をえらべます。数は ほかの欄に打ちます`
    : `${av.name}を打ちます${av.preset ? `（はじめは ${av.preset} ${av.unit}）` : ''}`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// 横にはみ出しているとき、はしをうすくする（横に動かせる印）
function fadeEdges(row) {
  row.classList.toggle('fade-l', row.scrollLeft > 2);
  row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
}

// えらんでいるボタンが見えるように
function scrollSelected() {
  for (const sel of ['#phCats [aria-selected="true"]', '#phList [aria-checked="true"]', '#phUnits [aria-checked="true"]']) {
    const b = document.querySelector(sel);
    const row = b?.parentElement;
    if (!b || !row || row.clientWidth === 0) continue;
    const left = b.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + b.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = left - (row.clientWidth - b.offsetWidth) / 2;
    }
    fadeEdges(row);
  }
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
// 次の欄（求める量はとばす）
function nextInput(f, s) {
  const list = f.vars.filter((v) => v.key !== s.target);
  const i = list.findIndex((v) => v.key === s.active);
  return list[(i + 1) % list.length].key;
}

function press(key, target) {
  const c = current();
  const { f, s } = c;
  if (key === '=') return equals(c, target);
  if (key === 'next') {
    s.active = nextInput(f, s);
    st.fresh = hasNumber(s.vals[s.active]);
    render();
    scrollSelected();
    return undefined;
  }
  if (s.active === s.target) {
    reject(target);
    toast(`${P.varOf(f, s.target).name}は求める量です。ほかの欄をえらんで打ちます`);
    return undefined;
  }
  const val = s.vals[s.active];
  if (key === 'neg') {
    val.neg = !val.neg;
    st.fresh = false;
    return render();
  }
  if (key === 'clear') {
    if (!val.text && !val.neg) return reject(target);
    val.text = '';
    val.neg = false;
    st.fresh = false;
    return render();
  }
  if (key === 'back' && !val.text && val.neg) {
    val.neg = false;
    return render();
  }
  const next = typeKey(val.text, key, { fresh: st.fresh, maxDecimals: MAX_DEC, maxInt: MAX_INT });
  if (next === null) return reject(target);
  if (st.fresh && key !== 'back') val.neg = false; // 新しい数を打ちはじめた
  val.text = next;
  st.fresh = false;
  return render();
}

// 打った数の一覧（履歴の式の名前）：「V＝100V・R＝50Ω」
function givenText(f, s) {
  return f.vars.filter((v) => v.key !== s.target).map((v) => `${v.sym}＝${valText(s.vals[v.key])}${s.vals[v.key].unit}`).join('・');
}

const snapshot = (key, s) => ({ f: key, target: s.target, active: s.active, vals: structuredClone(s.vals) });

function equals(c, target) {
  if (!ready(c)) {
    reject(target);
    if (c.r?.missing) toast(`${c.r.missing.map((k) => P.varOf(c.f, k).name).join('・')}を入れてください`);
    return;
  }
  const { f, s, r } = c;
  const tv = P.varOf(f, s.target);
  hooks.onSaveHistory([{ ref: r.answer, label: givenText(f, s) }], r.answer, {
    name: `${tv.name} ${tv.sym}（${r.unit}）`, kind: '公式', phys: snapshot(f.key, s),
  });
  toast('履歴に残しました（種類「公式」）');
}

// 求める量をかえる
function pickTarget(key) {
  const f = P.formulaByKey(fkey());
  const s = perOf(f.key);
  if (key === s.target) return;
  s.target = key;
  if (s.active === key) {
    s.active = (f.vars.find((v) => v.key !== key && !hasNumber(s.vals[v.key])) ?? f.vars.find((v) => v.key !== key)).key;
  }
  st.fresh = false;
  render();
}

// 履歴から：式を直す（その公式と数にもどす）・検算
export function editPhys(snap) {
  const f = P.formulaByKey(snap?.f);
  if (!f) return;
  st.cat = f.cat;
  st.pick[f.cat] = f.key;
  st.per[f.key] = restorePer(f, snap);
  st.fresh = false;
  save();
}

export function checkPhys(snap) {
  const f = P.formulaByKey(snap?.f);
  if (f) openPhysCheck(f.key, restorePer(f, snap));
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
// 「1/R ＝ 1 ÷ 20」に「＝ 0.05」を足す（もう数だけなら足さない）
const withValue = (text, x) => (text.endsWith(` ${P.numText(x)}`) ? text : `${text} ＝ ${P.numText(x)}`);

function openPhysCheck(key, s) {
  const c = current(key, s);
  if (!ready(c)) return;
  const { f, r } = c;
  const tv = P.varOf(f, s.target);
  $('#checkTitle').textContent = '公式の検算';
  const body = $('#checkBody');
  body.replaceChildren();

  // 1. 公式を変形する
  const form = el('div');
  form.append(line(f.show));
  if (r.form.length === 1 && r.form[0] === f.show) {
    form.append(hint(`${tv.sym} が左にあるので、そのまま使います`));
  } else {
    for (const text of r.form) form.append(line(`→ ${text}`));
    form.append(hint(`${tv.sym}（${tv.name}）が「${tv.sym} ＝ …」の形になるように、両方に同じ計算をして動かします`));
  }
  body.append(section(`1. ${tv.name}を求める形にする`, form));

  // 2. 単位をそろえる
  if (r.conv.length) {
    const box = el('div');
    for (const text of r.conv) box.append(line(text));
    const bases = [...new Set(f.vars.filter((v) => v.key !== s.target).map((v) => v.base))];
    box.append(hint(`この公式は ${bases.join('・')} の単位で計算します。分数のまま変えるので、誤差は出ません`));
    body.append(section(`${body.children.length + 1}. 単位をそろえる`, box));
  }

  // 3. 数を入れて計算する
  const calc = el('div');
  calc.append(line(`${tv.sym} ＝ ${r.calc}`), line(`＝ ${P.numText(r.value)} ${tv.base}`));
  if (r.ansConv) calc.append(line(`→ ${r.ansConv}`));
  if (r.plus) calc.append(hint('√ の答えは ＋ と − の2つありますが、＋ のほうを出しています'));
  body.append(section(`${body.children.length + 1}. 数を入れて計算する`, calc));

  // 4. 逆算：答えを元の公式に入れる
  const v = P.verify(f, r.X);
  const rev = el('div');
  rev.append(line(`左：${withValue(v.leftText, v.left)}`), line(`右：${withValue(v.rightText, v.right)}`));
  rev.append(checked('左と右が同じ', v.ok));
  if (!r.value.q) rev.append(hint('ちょうどの数にならない（√ など）ので、上から 40 桁くらいまで同じなら ✓ にしています'));
  body.append(section(`${body.children.length + 1}. 逆算（答えを元の公式 ${f.show} に入れる）`, rev));

  body.prepend(el('p', `summary ${v.ok ? 'ok' : 'ng'}`, v.ok ? '✓ 答えを元の公式に入れると、左と右が同じになります' : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onSaveHistory(items, value, meta), onUseInCalc(value, label) }
export function initPhys(h) {
  hooks = h;
  load();
  $('#phCats').replaceChildren(...P.CATS.map((c) => {
    const b = button('', c.name);
    b.dataset.cat = c.key;
    b.setAttribute('role', 'tab');
    return b;
  }));
  $('#phCats').addEventListener('click', (event) => {
    const b = event.target.closest('[data-cat]');
    if (!b || b.dataset.cat === st.cat) return;
    st.cat = b.dataset.cat;
    st.fresh = false;
    render();
    scrollSelected();
  });
  $('#phList').addEventListener('click', (event) => {
    const b = event.target.closest('[data-f]');
    if (!b || b.dataset.f === fkey()) return;
    st.pick[st.cat] = b.dataset.f;
    st.fresh = false;
    render();
    scrollSelected();
  });
  $('#phTarget').addEventListener('click', (event) => {
    const b = event.target.closest('[data-target]');
    if (b) pickTarget(b.dataset.target);
  });
  $('#phFields').addEventListener('click', (event) => {
    const b = event.target.closest('[data-v]');
    if (!b) return;
    const s = perOf(fkey());
    s.active = b.dataset.v;
    st.fresh = s.active !== s.target && hasNumber(s.vals[s.active]);
    render();
    scrollSelected();
  });
  $('#phUnits').addEventListener('click', (event) => {
    const b = event.target.closest('[data-unit]');
    if (!b) return;
    const s = perOf(fkey());
    s.vals[s.active].unit = b.dataset.unit;
    render();
  });
  for (const row of [$('#phCats'), $('#phList'), $('#phUnits')]) {
    row.addEventListener('scroll', () => fadeEdges(row), { passive: true });
  }
  window.addEventListener('resize', () => {
    if (hooks.active()) render();
  });
  $('#phAnswer').addEventListener('click', () => {
    const c = current();
    if (!ready(c)) return;
    const tv = P.varOf(c.f, c.s.target);
    openDetail(c.r.answer, { name: `${tv.name} ${tv.sym}（${c.r.unit}）` });
  });
  $('#btnPhCheck').addEventListener('click', () => openPhysCheck(fkey(), perOf(fkey())));
  $('#btnPhToCalc').addEventListener('click', () => {
    const c = current();
    if (ready(c)) hooks.onUseInCalc(c.r.answer, `${F.chipLabel(c.r.answer)}${c.r.unit}`);
  });
  setupPad($('#phKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', '.': '.', '-': 'neg', Enter: '=', '=': '=', ArrowDown: 'next' },
  });
}
