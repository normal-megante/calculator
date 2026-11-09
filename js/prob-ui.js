// =========================================================
// 確率の画面（ステップ16）
//
//   上：種類（場合の数・くり返し・ガチャ・くじ・条件付き・偏差値・分布）と計算のボタン
//   まん中：式・答え（＝ を押さなくても出る）・くわしい行・注意書き
//   下：欄（タップでえらぶ）と数字キー（欄によって / % や − 、 のキーになる）
//
// 履歴には残さない。計算そのものは prob.js
// =========================================================
import * as P from './prob.js';
import * as N from './num.js';
import * as F from './format.js';
import { $, toast } from './ui.js';
import { openDetail } from './detail.js';
import { el, button, shake, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.prob';
const MAX_INT = 15;
const MAX_DEC = 10;
const MAX_LIST = 100; // データの数は、これだけまで

const st = {
  cat: 'count',
  pick: Object.fromEntries(P.CATS.map((c) => [c.key, P.calcsOf(c.key)[0].key])),
  vals: Object.fromEntries(P.CALCS.map((c) => [c.key, Object.fromEntries(c.fields.map((f) => [f.key, f.init]))])),
  mode: Object.fromEntries(P.CALCS.filter((c) => c.modes).map((c) => [c.key, c.mode])),
  active: Object.fromEntries(P.CALCS.map((c) => [c.key, c.fields[0].key])),
  fresh: true,
};
let hooks = {};
const reject = (target) => shake(target, hooks.settings());
const calc = () => P.calcByKey(st.pick[st.cat]);
const fieldOf = (c, key) => c.fields.find((f) => f.key === key) ?? c.fields[0];

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cat: st.cat, pick: st.pick, vals: st.vals, mode: st.mode, active: st.active }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (P.CATS.some((c) => c.key === s.cat)) st.cat = s.cat;
    for (const cat of P.CATS) {
      const k = s.pick?.[cat.key];
      if (P.calcsOf(cat.key).some((c) => c.key === k)) st.pick[cat.key] = k;
    }
    for (const c of P.CALCS) {
      for (const f of c.fields) {
        const t = s.vals?.[c.key]?.[f.key];
        if (typeof t === 'string' && t.length <= 600 && validText(t, f.type)) st.vals[c.key][f.key] = t;
      }
      if (c.modes && c.modes.some(([m]) => m === s.mode?.[c.key])) st.mode[c.key] = s.mode[c.key];
      if (c.fields.some((f) => f.key === s.active?.[c.key])) st.active[c.key] = s.active[c.key];
    }
  } catch {
    // 読めなければ、はじめから
  }
}

const NUM = '\\d+(\\.\\d*)?';
const VALID = {
  int: /^\d*$/,
  num: new RegExp(`^−?(${NUM})?$`),
  prob: new RegExp(`^(${NUM}(\\/(${NUM})?)?%?)?$`),
  list: new RegExp(`^(−?${NUM},)*(−?(${NUM})?)?$`),
};
const validText = (t, type) => VALID[type].test(t);

// ---------------------------------------------------------
// 欄の文字（数字キーで変える）。打てなければ null
// ---------------------------------------------------------
function typeText(text, key, type, fresh) {
  if (key === 'back') return text ? text.slice(0, -1) : null;
  if (key === 'clear') return text ? '' : null;
  if (key === 'neg') {
    if (type === 'num') return text.startsWith('−') ? text.slice(1) : `−${text}`;
    if (type !== 'list') return null;
    if (fresh) text = '';
    const head = text.slice(0, text.lastIndexOf(',') + 1);
    const last = text.slice(head.length);
    return head + (last.startsWith('−') ? last.slice(1) : `−${last}`);
  }
  if (fresh && /^[0-9.]$/.test(key)) text = '';
  // いま打っている数（「1/6」の 6、「65,72」の 72 など）
  const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf(','));
  const head = text.slice(0, cut + 1);
  const last = text.slice(cut + 1);
  const sign = last.startsWith('−') ? '−' : '';
  const body = last.slice(sign.length);
  if (key === '/' || key === '%') {
    if (type !== 'prob' || !body || body.endsWith('.') || text.includes('%')) return null;
    if (key === '/' && text.includes('/')) return null;
    return text + key;
  }
  if (key === ',') {
    if (type !== 'list' || !body || body.endsWith('.')) return null;
    if (text.split(',').length >= MAX_LIST) return null;
    return `${text},`;
  }
  if (text.endsWith('%')) return null;
  let next;
  if (key === '.') {
    if (type === 'int' || body.includes('.')) return null;
    next = `${body || '0'}.`;
  } else if (/^[0-9]$/.test(key)) {
    next = body === '0' ? key : body + key;
  } else {
    return null;
  }
  const [int, dec = ''] = next.split('.');
  if (int.length > MAX_INT || dec.length > MAX_DEC) return null;
  return head + sign + next;
}

// 欄に見せる文字（3桁ごとのカンマ。データの区切りは「、」）
function shownText(text, type) {
  if (!text) return null;
  if (type === 'list') {
    const t = text.split(',').map((p) => F.groupNumberText(p)).join('、');
    return t.length > 26 ? `…${t.slice(-25)}` : t;
  }
  return text.split(/([/%])/).map((p) => (/^−?[\d.]+$/.test(p) ? F.groupNumberText(p) : p)).join('');
}

// ---------------------------------------------------------
// 計算（同じ欄なら覚えておく）
// ---------------------------------------------------------
const cache = new Map();

function current() {
  const c = calc();
  const texts = st.vals[c.key];
  const mode = st.mode[c.key];
  const id = `${c.key}|${mode}|${c.fields.map((f) => texts[f.key]).join('|')}`;
  if (cache.has(id)) return cache.get(id);
  const s = P.solve(c.key, texts, mode);
  const res = { c, texts, mode, ...s };
  cache.set(id, res);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return res;
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showProb() {
  render();
  scrollSelected();
}

function render() {
  for (const b of document.querySelectorAll('#pbCats [data-cat]')) {
    b.setAttribute('aria-selected', String(b.dataset.cat === st.cat));
  }
  const c = calc();
  $('#pbList').replaceChildren(...P.calcsOf(st.cat).map((x) => {
    const b = button('chip', x.name);
    b.dataset.calc = x.key;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(x.key === c.key));
    return b;
  }));
  const res = current();
  renderCard(res);
  renderEntry(res);
  fadeEdges($('#pbCats'));
  fadeEdges($('#pbList'));
  save();
}

// 答えの書き方 { text, html }
function answerForms(r) {
  if (r.unit === 'prob') {
    const t = P.pctText(r.value);
    return { text: `${t.text}%`, html: `${t.html}<small class="u">%</small>` };
  }
  const t = P.numText(r.value);
  return r.unit ? { text: `${t.text} ${r.unit}`, html: `${t.html}<small class="u"> ${r.unit}</small>` } : t;
}

// 答えの下の行
function subLines(r) {
  const lines = [];
  if (r.unit === 'prob') {
    const fr = P.fracText(r.value);
    if (fr) lines.push(`分数で ${fr}`);
    const once = P.oneIn(r.value);
    if (once) lines.push(once);
    if (N.cmp(r.value, N.frac(99n, 100n)) >= 0 && N.cmp(r.value, N.ONE) < 0) lines.push(`100% まで あと ${P.pct(N.sub(N.ONE, r.value))}`);
  } else if (r.value.q && N.isInteger(r.value) && N.approxLog10(N.absNum(r.value)) >= 16) {
    lines.push(`${F.groupInt(String(F.integerDigits(r.value)))} 桁の数（タップで全部の桁）`);
  }
  return lines.concat(r.lines ?? []);
}

function renderCard(res) {
  const { c, r } = res;
  $('#pbName').textContent = c.name;
  $('#pbShow').textContent = r?.formula ?? c.show;
  // ちょうど・以上・以下 など
  const modes = $('#pbMode');
  modes.hidden = !c.modes;
  modes.replaceChildren(...(c.modes ?? []).map(([key, text]) => {
    const b = button('', text);
    b.dataset.mode = key;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(key === P.modeOf(c, res.mode)));
    return b;
  }));
  const ok = !!r;
  $('#btnPbCheck').hidden = !ok;
  $('#btnPbToCalc').hidden = !ok;
  const ans = $('#pbAnswer');
  ans.disabled = !ok;
  ans.classList.toggle('muted', !ok);
  const label = ok ? r.label : '答え';
  if (ok) {
    const f = answerForms(r);
    ans.innerHTML = `<span class="pb-eq">${escapeHtml(label)} ＝ </span>${f.html}`;
    const length = label.length * 0.62 + f.text.length;
    ans.classList.toggle('long', length > 15 && length <= 21);
    ans.classList.toggle('longer', length > 21);
  } else {
    ans.innerHTML = `<span class="pb-eq">${escapeHtml(label)} ＝ </span>？`;
    ans.classList.remove('long', 'longer');
  }
  $('#pbSub').replaceChildren(...(ok ? subLines(r) : []).map((t) => el('div', '', t)));
  const notes = [];
  if (res.error) notes.push(['ng', res.error]);
  else if (res.missing) notes.push(['', `${res.missing.map((m) => `「${m}」`).join('')}を打つと、答えが出ます`]);
  notes.push(['', c.note], ['ex', c.ex]);
  $('#pbNotes').replaceChildren(...notes.map(([cls, text]) => el('p', cls, text)));
}

// 欄の種類ごとの、2つの切りかわるキー [data-k, 文字, 説明]
const SWITCH = {
  prob: [['/', '/', '分数の線（1/6 のように）'], ['%', '%', 'パーセント']],
  num: [['neg', '−', 'マイナス（もう一度でプラス）'], ['%', '%', '']],
  list: [['neg', '−', 'マイナス（もう一度でプラス）'], [',', '、', '区切り（次の数へ）']],
  int: [['/', '/', ''], ['%', '%', '']],
};

function renderEntry(res) {
  const { c } = res;
  const vals = st.vals[c.key];
  const active = fieldOf(c, st.active[c.key]);
  const fields = $('#pbFields');
  fields.style.setProperty('--cols', String(c.fields.length <= 3 ? c.fields.length : 2));
  fields.replaceChildren(...c.fields.map((f) => {
    const b = button('fld pb-fld');
    b.dataset.f = f.key;
    b.append(el('small', '', f.name), el('span', 'v'), el('small', 'unit'));
    const text = vals[f.key];
    setField(b, {
      text, placeholder: f.opt ? 'なし' : '0', active: f.key === active.key, fresh: st.fresh, shown: shownText(text, f.type), unit: '',
    });
    return b;
  }));
  $('#pbHint').textContent = active.hint;
  // 欄の種類で、キーを切りかえる
  const sw = SWITCH[active.type];
  [$('#pbKeyA'), $('#pbKeyB')].forEach((b, i) => {
    const [k, text, aria] = sw[i];
    b.dataset.k = k;
    b.textContent = text;
    b.classList.toggle('dim', !aria);
    if (aria) b.setAttribute('aria-label', aria);
    else b.removeAttribute('aria-label');
  });
  $('#pbKeys [data-k="."]').classList.toggle('dim', active.type === 'int');
}

// 横にはみ出しているとき、はしをうすくする（横に動かせる印）
function fadeEdges(row) {
  row.classList.toggle('fade-l', row.scrollLeft > 2);
  row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
}

function scrollSelected() {
  for (const sel of ['#pbCats [aria-selected="true"]', '#pbList [aria-checked="true"]']) {
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

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function press(key, target) {
  const c = calc();
  if (key === 'next') {
    const i = c.fields.findIndex((f) => f.key === fieldOf(c, st.active[c.key]).key);
    st.active[c.key] = c.fields[(i + 1) % c.fields.length].key;
    st.fresh = true;
    return render();
  }
  const f = fieldOf(c, st.active[c.key]);
  const vals = st.vals[c.key];
  const next = typeText(vals[f.key] ?? '', key, f.type, st.fresh);
  if (next === null) {
    reject(target);
    if ((key === '/' || key === '%') && f.type !== 'prob') toast(`「${f.name}」は ${f.type === 'int' ? '整数' : 'ふつうの数'}だけです`);
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
function rowEl([kind, text, good]) {
  if (kind === 'hint') return el('p', 'hint', text);
  if (kind === 'line') return el('div', 'calc-line', text);
  const d = el('div', 'rev', `${text} `);
  d.append(el('span', `mark ${good ? 'ok' : 'ng'}`, good ? '✓' : '✗'));
  return d;
}

function openProbCheck() {
  const res = current();
  if (!res.r) return;
  const chk = P.check(res.c.key, res.texts, res.mode);
  if (!chk) return;
  const body = $('#checkBody');
  body.replaceChildren(...chk.sections.map((s, i) => section(`${i + 1}. ${s.title}`, ...s.rows.map(rowEl))));
  const hasOk = chk.sections.some((s) => s.rows.some((row) => row[0] === 'ok'));
  body.prepend(el('p', `summary ${chk.ok ? 'ok' : 'ng'}`,
    !chk.ok ? '✗ 合わない所があります' : hasOk ? '✓ ちがう計算でも、同じ答えになりました' : '答えの理由を見せます'));
  $('#checkTitle').textContent = `${res.c.name}${/[\w%ʳ]$/.test(res.c.name) ? ' ' : ''}の検算`;
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onUseInCalc(value, label) }
export function initProb(h) {
  hooks = h;
  load();
  $('#pbCats').replaceChildren(...P.CATS.map((c) => {
    const b = button('', c.name);
    b.dataset.cat = c.key;
    b.setAttribute('role', 'tab');
    return b;
  }));
  $('#pbCats').addEventListener('click', (event) => {
    const b = event.target.closest('[data-cat]');
    if (!b || b.dataset.cat === st.cat) return;
    st.cat = b.dataset.cat;
    st.fresh = true;
    render();
    scrollSelected();
  });
  $('#pbList').addEventListener('click', (event) => {
    const b = event.target.closest('[data-calc]');
    if (!b || b.dataset.calc === st.pick[st.cat]) return;
    st.pick[st.cat] = b.dataset.calc;
    st.fresh = true;
    render();
    scrollSelected();
  });
  $('#pbMode').addEventListener('click', (event) => {
    const b = event.target.closest('[data-mode]');
    if (!b) return;
    st.mode[calc().key] = b.dataset.mode;
    render();
  });
  $('#pbFields').addEventListener('click', (event) => {
    const b = event.target.closest('[data-f]');
    if (!b) return;
    st.active[calc().key] = b.dataset.f;
    st.fresh = true;
    render();
  });
  for (const row of [$('#pbCats'), $('#pbList')]) {
    row.addEventListener('scroll', () => fadeEdges(row), { passive: true });
  }
  window.addEventListener('resize', () => {
    if (hooks.active()) render();
  });
  $('#pbAnswer').addEventListener('click', () => {
    const res = current();
    if (res.r) openDetail(res.r.value, { name: `${res.c.name}：${res.r.label}${res.r.unit === 'prob' ? '（確率。0.5 が 50%）' : res.r.unit ? `（${res.r.unit}）` : ''}` });
  });
  $('#btnPbCheck').addEventListener('click', openProbCheck);
  $('#btnPbToCalc').addEventListener('click', () => {
    const res = current();
    if (res.r) hooks.onUseInCalc(res.r.value, F.chipLabel(res.r.value));
  });
  setupPad($('#pbKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: {
      Backspace: 'back', Escape: 'clear', Delete: 'clear', '.': '.', '/': '/', '%': '%', ',': ',', '-': 'neg', Enter: 'next', ArrowDown: 'next', Tab: 'next',
    },
  });
}
