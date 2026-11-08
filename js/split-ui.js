// =========================================================
// 割り勘の画面
//
//   上：払う合計（タップして数字キーで打つ）と、集まるお金・余り
//   まん中：人の組（人数・倍率・足す/引く円・金額指定）と、一部の人だけで払う物
//   下：えらんだ組を直す欄と、数字キー（「人数」「次へ」で欄を動く）
//
// 計算そのものは split.js（正確な分数で計算するので、誤差は出ない）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as P from './split.js';
import { amountOf } from './shop.js';
import { $, toast } from './ui.js';
import { typeKey, el, button, shake, seg as segOf, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.split';
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const label = (i) => (i < CIRCLED.length ? CIRCLED[i] : `(${i + 1})`);
const num = F.amountText;
const yen = F.yenText;

// 欄ごとに打てる桁
const LIMITS = {
  total: { maxDecimals: 0 },
  count: { maxDecimals: 0, maxInt: 3 },
  mult: { maxDecimals: 2, maxInt: 3 },
  plus: { maxDecimals: 0, maxInt: 9 },
  amount: { maxDecimals: 0, maxInt: 9 },
  partAmount: { maxDecimals: 0 },
};

const HINTS = {
  total: '払う合計（レシートの金額）を打ちます',
  count: 'この組の人数。「次へ」で倍率・足す円に進みます',
  mult: '1.5 なら、ほかの人の1.5倍。0 なら、足す円と払う物の分だけ',
  plus: '1人あたり、ほかの人より〇円多く（引くなら少なく）',
  amount: 'この組の人は、1人この金額だけ（端数の調整はしません）',
  partAmount: 'このうち、えらんだ組の人だけで等分する金額（倍率・足す円は使いません）',
};

const blankGroup = (id) => ({ id, name: '', count: '', fixed: false, mult: '', plus: '', minus: false, amount: '' });

const st = {
  total: '',
  groups: [blankGroup(1)],
  parts: [],
  nextId: 2,
  sel: { type: 'group', id: 1 }, // えらんでいる組（type 'group'）か払う物（'part'）
  field: 'total',                 // 数字キーが入る欄
  fresh: false,                   // 欄をえらんだ直後（打つと入れかわる）
  opts: { ...P.DEFAULT_OPTS },    // 端数の決め方
};
let hooks = {};
let last = null; // いちばん新しい計算の結果

const reject = (target) => shake(target, hooks.settings());
const seg = (options, current, onPick, ariaLabel) => segOf(options, current, onPick, ariaLabel, hooks.settings());

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    const { total, groups, parts, nextId, sel, field, opts } = st;
    localStorage.setItem(STORE_KEY, JSON.stringify({ total, groups, parts, nextId, sel, field, opts }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    const digits = (v) => (typeof v === 'string' && v.length <= 16 && /^\d*\.?\d*$/.test(v) ? v : '');
    const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
    const ids = new Set();
    const okId = (id) => Number.isInteger(id) && id > 0 && !ids.has(id) && ids.add(id);
    const groups = (Array.isArray(s.groups) ? s.groups : []).filter((g) => okId(g?.id)).map((g) => ({
      id: g.id, name: text(g.name, 20), count: digits(g.count), fixed: !!g.fixed,
      mult: digits(g.mult), plus: digits(g.plus), minus: !!g.minus, amount: digits(g.amount),
    }));
    const groupIds = new Set(groups.map((g) => g.id));
    const parts = (Array.isArray(s.parts) ? s.parts : []).filter((p) => okId(p?.id)).map((p) => ({
      id: p.id, name: text(p.name, 20), amount: digits(p.amount),
      members: (Array.isArray(p.members) ? p.members : []).filter((id) => groupIds.has(id)),
    }));
    if (groups.length) st.groups = groups;
    st.parts = parts;
    st.total = digits(s.total);
    st.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, ...[...ids].map((id) => id + 1), 2);
    const sel = s.sel?.type === 'part' ? st.parts.find((p) => p.id === s.sel.id) : st.groups.find((g) => g.id === s.sel?.id);
    st.sel = sel ? { type: s.sel.type, id: sel.id } : { type: 'group', id: st.groups[0].id };
    if (LIMITS[s.field]) st.field = s.field;
    if (st.sel.type === 'part' && st.field !== 'total') st.field = 'partAmount';
    if (st.sel.type === 'group' && st.field === 'partAmount') st.field = 'count';
    st.opts = {
      unit: P.UNITS.includes(s.opts?.unit) ? s.opts.unit : P.DEFAULT_OPTS.unit,
      how: P.HOWS[s.opts?.how] ? s.opts.how : P.DEFAULT_OPTS.how,
      payer: Number.isInteger(s.opts?.payer) ? s.opts.payer : null,
    };
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// えらんでいるもの・欄
// ---------------------------------------------------------
const selGroup = () => (st.sel.type === 'group' ? st.groups.find((g) => g.id === st.sel.id) ?? null : null);
const selPart = () => (st.sel.type === 'part' ? st.parts.find((p) => p.id === st.sel.id) ?? null : null);

function fieldText(f) {
  if (f === 'total') return st.total;
  if (f === 'partAmount') return selPart()?.amount ?? '';
  return selGroup()?.[f] ?? '';
}

function setFieldText(f, text) {
  if (f === 'total') st.total = text;
  else if (f === 'partAmount') { const p = selPart(); if (p) p.amount = text; }
  else { const g = selGroup(); if (g) g[f] = text; }
}

// 欄をえらぶ（前の数が入っていれば、打つと入れかわる）
//   いまの欄をもう一度タップしたときだけ、続きから打つ（again = true なら、いつも入れかわる）
function choose(sel, field, again = false) {
  const changed = sel && (sel.type !== st.sel.type || sel.id !== st.sel.id);
  if (sel) st.sel = sel;
  if (changed) $('#splitName').value = (selGroup() ?? selPart())?.name ?? '';
  if (st.field === field && !changed && !again) st.fresh = false;
  else {
    st.field = field;
    st.fresh = !!fieldText(field);
  }
  render();
}

// 「次へ」で回る順番：合計 → 組ごとに 人数・倍率・足す円（金額指定なら 1人の額）→ 払う物 → 合計
function order() {
  const list = [{ sel: null, field: 'total' }];
  for (const g of st.groups) {
    const sel = { type: 'group', id: g.id };
    list.push({ sel, field: 'count' });
    if (g.fixed) list.push({ sel, field: 'amount' });
    else list.push({ sel, field: 'mult' }, { sel, field: 'plus' });
  }
  for (const p of st.parts) list.push({ sel: { type: 'part', id: p.id }, field: 'partAmount' });
  return list;
}

function goNext() {
  const list = order();
  const i = list.findIndex((x) => x.field === st.field
    && (x.field === 'total' || (x.sel.type === st.sel.type && x.sel.id === st.sel.id)));
  const next = list[(i + 1) % list.length];
  choose(next.sel, next.field);
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showSplit() {
  render();
}

function render() {
  last = P.splitOf({ total: st.total, groups: st.groups, parts: st.parts }, st.opts);
  renderTop();
  renderList();
  renderEdit();
  save();
}

function howText() {
  const { unit, how } = st.opts;
  if (how === 'payer') return `${F.groupInt(String(unit))}円単位・幹事が合わせる`;
  return `${F.groupInt(String(unit))}円単位で${how === 'up' ? '切り上げ' : '切り捨て'}`;
}

function renderTop() {
  setField(document.querySelector('[data-sfield="total"]'), {
    text: st.total, placeholder: '0', active: st.field === 'total', fresh: st.fresh,
  });
  $('#splitCount').textContent = N.isZero(last.people) ? '' : `${num(last.people)}人`;
  const out = $('#splitResult');
  out.replaceChildren();
  if (!last.ok) {
    out.className = 'split-result muted';
    out.textContent = last.error;
  } else {
    const d = last.diff;
    out.className = `split-result ${N.sign(d) < 0 ? 'ng' : 'ok'}`;
    out.textContent = last.how === 'payer'
      ? `集まるお金 ${yen(last.collected)}（ぴったり）`
      : `集まるお金 ${yen(last.collected)}（${P.diffText(d)}）`;
    if (last.warning) out.append(el('div', 'warn', last.warning));
  }
  const how = $('#splitHow');
  how.replaceChildren(`端数：${howText()} `, button('link', '変える', openMore));
}

function groupSub(g, row) {
  const parts = [`${g.count || '0'}人`];
  if (g.fixed) parts.push(`1人${F.groupNumberText(g.amount || '0')}円だけ`);
  else {
    if (g.mult && N.cmp(row.mult, N.ONE) !== 0) parts.push(`×${g.mult}`);
    if (g.plus && !N.isZero(row.plus)) parts.push(`${g.minus ? '−' : '＋'}${F.groupNumberText(g.plus)}円`);
  }
  for (const p of row.parts) parts.push(p.name);
  return parts.join('・');
}

function renderList() {
  const groupsEl = $('#splitGroups');
  groupsEl.replaceChildren(...st.groups.map((g, i) => {
    const row = last.rows[i];
    const li = el('li', 's-item');
    li.dataset.gid = g.id;
    if (st.sel.type === 'group' && st.sel.id === g.id) li.classList.add('editing');
    li.append(el('span', 's-no', label(i)));
    const main = el('div', 's-main');
    const name = el('div', g.name ? 's-name' : 's-name none', row.name);
    if (last.ok && last.payer?.row === row) name.append(el('span', 'badge', '幹事'));
    main.append(name, el('div', 's-sub', groupSub(g, row)));
    li.append(main);
    const amount = el('div', 's-amt');
    if (last.ok && !N.isZero(row.count)) {
      amount.append(el('b', '', `1人 ${yen(row.pay)}`));
      amount.append(el('small', '', last.payer?.row === row ? `幹事 ${yen(last.payer.pay)}` : `計 ${yen(row.subtotal)}`));
    }
    li.append(amount);
    return li;
  }));

  const partsEl = $('#splitParts');
  partsEl.replaceChildren(...st.parts.map((p, i) => {
    const info = last.parts?.[i];
    const li = el('li', 's-item part');
    li.dataset.pid = p.id;
    if (st.sel.type === 'part' && st.sel.id === p.id) li.classList.add('editing');
    li.append(el('span', 's-no', '◆'));
    const main = el('div', 's-main');
    main.append(el('div', p.name ? 's-name' : 's-name none', p.name || '払う物'));
    const who = st.groups.map((g, gi) => (p.members.includes(g.id) ? label(gi) : '')).join('');
    main.append(el('div', 's-sub', who ? `${who}の人で等分` : '払う人をえらんでください'));
    li.append(main);
    const amount = el('div', 's-amt');
    amount.append(el('b', '', yen(amountOf(p.amount))));
    if (info?.share) amount.append(el('small', '', `1人 ${yen(info.share)}`));
    li.append(amount);
    return li;
  }));
}

function renderEdit() {
  const g = selGroup();
  const p = selPart();
  const index = g ? st.groups.indexOf(g) : st.parts.indexOf(p);
  $('#splitEditState').textContent = g ? `${label(index)}の組` : '払う物';
  const name = $('#splitName');
  name.placeholder = g ? '名前（例：飲む人）' : '名前（例：お酒）';
  if (document.activeElement !== name) name.value = (g ?? p)?.name ?? '';
  $('#splitGroupFields').hidden = !g;
  $('#splitPartFields').hidden = !p;

  const f = (field) => document.querySelector(`#splitEdit [data-sfield="${field}"]`);
  const opt = (field, placeholder, extra = {}) => setField(f(field), {
    text: fieldText(field), placeholder, active: st.field === field, fresh: st.fresh, ...extra,
  });
  if (g) {
    opt('count', '0');
    f('mult').hidden = g.fixed;
    f('plus').hidden = g.fixed;
    f('amount').hidden = !g.fixed;
    opt('mult', '1');
    opt('plus', '0');
    f('plus').querySelector('.lbl').textContent = g.minus ? '引く' : '足す';
    opt('amount', '0');
  }
  if (p) opt('partAmount', '0');

  // 欄の下のえらぶボタン（数字キーが入る欄によって変わる）
  const opts = $('#splitOpts');
  opts.replaceChildren();
  if (st.field === 'total') {
    renderTotalTools(opts);
  } else if (g) {
    opts.append(seg([['ratio', '倍率・円'], ['fixed', '金額指定']], g.fixed ? 'fixed' : 'ratio', (v) => {
      g.fixed = v === 'fixed';
      // 金額指定にしたら、すぐ1人の額を打てるように
      if (g.fixed) st.field = 'amount';
      else if (st.field === 'amount') st.field = 'mult';
      st.fresh = !!fieldText(st.field);
      render();
    }, 'この組の払い方'));
    if (!g.fixed) {
      opts.append(seg([['plus', '足す'], ['minus', '引く']], g.minus ? 'minus' : 'plus', (v) => {
        g.minus = v === 'minus';
        render();
      }, '円を足すか引くか'));
    }
    if (st.opts.how === 'payer' && !g.fixed) {
      const on = last.payer?.row?.id === g.id;
      const b = button('chip', on ? '★ 幹事' : '幹事にする', () => {
        st.opts = { ...st.opts, payer: g.id };
        render();
      });
      b.setAttribute('aria-pressed', String(on));
      opts.append(b);
    }
  } else if (p) {
    const choices = st.groups.filter((x) => !x.fixed);
    if (!choices.length) opts.append(el('span', 'opts-text', '倍率で分ける組がありません'));
    for (const x of choices) {
      const i = st.groups.indexOf(x);
      const on = p.members.includes(x.id);
      const b = button('chip', `${label(i)}${x.name ? x.name : ''}`, () => {
        p.members = on ? p.members.filter((id) => id !== x.id) : [...p.members, x.id];
        render();
      });
      b.setAttribute('aria-pressed', String(on));
      opts.append(b);
    }
  }

  // ヒントと、えらんでいる組の1人あたり
  $('#splitHint').textContent = p && st.field !== 'total' && !p.members.length
    ? '払う人の組をえらんでください'
    : HINTS[st.field];
  const amount = $('#splitAmount');
  amount.textContent = '';
  if (last.ok && g) {
    const row = last.rows[index];
    if (!N.isZero(row.count)) {
      amount.textContent = last.payer?.row === row && N.cmp(row.count, N.ONE) === 0
        ? `幹事 ${yen(last.payer.pay)}`
        : `1人 ${yen(row.pay)}`;
    }
  }
}

// 合計の欄をえらんでいるとき：電卓の答え・お買い物の合計を使うボタン
function renderTotalTools(box) {
  const add = (text, value) => box.append(button('chip', text, () => useTotal(value)));
  const answer = hooks.calcAnswer();
  if (answer && N.sign(answer) > 0) add(`電卓の答え ${num(answer)}`, answer);
  const shop = hooks.shopTotal();
  if (shop && N.sign(shop) > 0) add(`お買い物の合計 ${yen(shop)}`, shop);
  if (!box.childElementCount) box.append(el('span', 'opts-text', '打ったら「人数」→ 人数を打つ'));
}

// ほかのモードの金額を、払う合計に入れる
function useTotal(value) {
  if (!value.q || value.d !== 1n || N.sign(value) <= 0) {
    toast('1円単位の金額ではないので使えません');
    return false;
  }
  const text = value.n.toString();
  if (text.length > 12) {
    toast('金額が大きすぎます');
    return false;
  }
  st.total = text;
  st.field = 'total';
  st.fresh = true;
  render();
  return true;
}

export function setSplitTotal(value) {
  return useTotal(value);
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function press(key, target) {
  if (key === 'next') return goNext();
  if (key === 'count') {
    const g = selGroup() ?? st.groups[0];
    if (st.field === 'count' && selGroup() === g) return reject(target);
    return choose({ type: 'group', id: g.id }, 'count');
  }
  const f = st.field;
  const next = typeKey(fieldText(f), key, { fresh: st.fresh, ...LIMITS[f] });
  if (next === null) return reject(target);
  setFieldText(f, next);
  st.fresh = false;
  render();
}

// ---------------------------------------------------------
// 組・払う物を足す、消す
// ---------------------------------------------------------
function addGroup() {
  const g = blankGroup(st.nextId++);
  st.groups.push(g);
  choose({ type: 'group', id: g.id }, 'count');
  document.querySelector(`#splitGroups [data-gid="${g.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function addPart() {
  const p = { id: st.nextId++, name: '', amount: '', members: [] };
  st.parts.push(p);
  choose({ type: 'part', id: p.id }, 'partAmount');
  document.querySelector(`#splitParts [data-pid="${p.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function snapshot() {
  return JSON.parse(JSON.stringify({ total: st.total, groups: st.groups, parts: st.parts, sel: st.sel, field: st.field, nextId: st.nextId }));
}

function restore(snap) {
  Object.assign(st, snap);
  st.nextId = Math.max(st.nextId, snap.nextId);
  st.fresh = false;
  $('#splitName').value = (selGroup() ?? selPart())?.name ?? '';
  render();
}

function deleteSelected() {
  const before = snapshot();
  const g = selGroup();
  const p = selPart();
  let message;
  if (g) {
    const i = st.groups.indexOf(g);
    if (st.groups.length === 1) {
      Object.assign(g, blankGroup(g.id));
      message = `${label(i)}の組の中身を消しました`;
    } else {
      st.groups.splice(i, 1);
      for (const part of st.parts) part.members = part.members.filter((id) => id !== g.id);
      st.sel = { type: 'group', id: st.groups[Math.min(i, st.groups.length - 1)].id };
      message = `${label(i)}${g.name ? `「${g.name}」` : 'の組'}を消しました`;
    }
    st.field = 'count';
  } else if (p) {
    st.parts.splice(st.parts.indexOf(p), 1);
    st.sel = { type: 'group', id: st.groups[0].id };
    st.field = 'count';
    message = `${p.name ? `「${p.name}」` : '払う物'}を消しました`;
  } else {
    return;
  }
  st.fresh = false;
  $('#splitName').value = (selGroup() ?? selPart())?.name ?? '';
  render();
  toast(message, { label: '元に戻す', run: () => restore(before) });
}

function clearAll() {
  const before = snapshot();
  st.total = '';
  st.groups = [blankGroup(st.nextId++)];
  st.parts = [];
  st.sel = { type: 'group', id: st.groups[0].id };
  st.field = 'total';
  st.fresh = false;
  $('#splitName').value = '';
  render();
  toast('割り勘を消しました', { label: '元に戻す', run: () => restore(before) });
}

// ---------------------------------------------------------
// 端数の決め方とコピー（⋯）
// ---------------------------------------------------------
function openMore() {
  const chips = (box, entries, key) => {
    box.replaceChildren(...entries.map(([value, text]) => {
      const b = button('chip', text, () => {
        st.opts = { ...st.opts, [key]: value };
        render();
        openMore(); // えらんだ印を付け直す
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(st.opts[key] === value));
      return b;
    }));
  };
  chips($('#splitUnitChips'), P.UNITS.map((u) => [u, `${F.groupInt(String(u))}円`]), 'unit');
  chips($('#splitHowChips'), Object.entries(P.HOWS), 'how');
  const dialog = $('#splitMoreDialog');
  if (!dialog.open) dialog.showModal();
}

async function copyResult() {
  if (!last.ok) {
    toast(last.error);
    return;
  }
  const text = P.summaryText(last);
  try {
    await navigator.clipboard.writeText(text);
    $('#splitMoreDialog').close();
    toast('結果をコピーしました');
  } catch {
    // コピーできないブラウザでは、文を出して自分でコピーしてもらう
    $('#splitMoreDialog').close();
    $('#checkTitle').textContent = '割り勘の結果';
    const area = el('textarea', 'copy-area');
    area.readOnly = true;
    area.value = text;
    area.rows = text.split('\n').length + 1;
    $('#checkBody').replaceChildren(
      el('p', 'hint', 'うまくコピーできませんでした。下の文を長押しして「すべて選択」→「コピー」してください。'),
      area,
    );
    $('#checkDialog').showModal();
    area.select();
  }
}

// ---------------------------------------------------------
// 検算（1倍あたり → 1人あたり（ちょうど）→ 逆算 → 端数）
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

function openSplitCheck() {
  const r = last;
  if (!r.ok) {
    toast(r.error);
    return;
  }
  $('#checkTitle').textContent = '割り勘の検算';
  const body = $('#checkBody');
  body.replaceChildren();
  const rows = r.rows.filter((x) => !N.isZero(x.count));

  // 1. 1倍あたり
  const base = el('div');
  const minus = [];
  if (!N.isZero(r.partsSum)) minus.push(`払う物 ${num(r.partsSum)}`);
  if (!N.isZero(r.fixedSum)) minus.push(`金額指定 ${num(r.fixedSum)}`);
  if (!N.isZero(r.plusSum)) minus.push(N.sign(r.plusSum) > 0 ? `足す円 ${num(r.plusSum)}` : `引く円 ${num(N.neg(r.plusSum))}`);
  if (minus.length) {
    const text = minus.map((m) => (m.startsWith('引く') ? ` ＋ ${m}` : ` − ${m}`)).join('');
    base.append(line(`合計 ${num(r.total)}${text} ＝ 残り ${num(r.rest)}`));
  }
  const ratio = rows.filter((x) => !x.fixed);
  if (ratio.length) {
    base.append(line(`倍率×人数：${ratio.map((x) => `${num(x.mult)}×${num(x.count)}`).join(' ＋ ')} ＝ ${num(r.weight)}`));
    base.append(line(`1倍あたり：${num(r.rest)} ÷ ${num(r.weight)} ＝ ${num(r.perWeight)}円`));
  }
  for (const p of r.parts) {
    if (p.share) base.append(line(`${p.name}：${num(p.amount)} ÷ ${num(p.count)}人 ＝ 1人 ${num(p.share)}円`));
  }
  body.append(section('1倍あたり', base));

  // 2. 1人あたり（ちょうど）
  const each = el('ol', 'steps');
  for (const x of rows) {
    const li = el('li', 'step');
    li.append(el('span', 'no', label(x.index)));
    const box = el('div');
    box.append(el('div', 'step-title', x.name));
    if (x.fixed) {
      box.append(line(`金額指定 ${yen(x.exact)}`));
    } else {
      let text = `${num(r.perWeight)} × ${num(x.mult)}`;
      if (!N.isZero(x.plus)) text += N.sign(x.plus) > 0 ? ` ＋ ${num(x.plus)}` : ` − ${num(N.neg(x.plus))}`;
      for (const p of x.parts) text += ` ＋ ${num(p.share)}（${p.name}）`;
      box.append(line(`${text} ＝ ${yen(x.exact)}`));
    }
    li.append(box);
    each.append(li);
  }
  body.append(section('1人あたり（ちょうど）', each));

  // 3. 逆算：ちょうどの額 × 人数 を足すと合計にもどるか
  const back = el('div');
  const exactOk = N.cmp(r.exactSum, r.total) === 0;
  back.append(checked(`${rows.map((x) => `${num(x.exact)}×${num(x.count)}`).join(' ＋ ')} ＝ ${num(r.exactSum)}（合計 ${num(r.total)}）`, exactOk));
  body.append(section('逆算（ちょうどの額で、合計にもどるか）', back));

  // 4. 端数
  const round = el('div');
  for (const x of rows) {
    const changed = N.cmp(x.exact, x.pay) !== 0;
    const head = `${label(x.index)} ${changed ? `${num(x.exact)} → ` : ''}${num(x.pay)}円`;
    if (r.payer?.row === x) {
      const others = N.sub(x.count, N.ONE);
      round.append(line(N.isZero(others)
        ? `${label(x.index)} 幹事：${yen(r.payer.pay)}`
        : `${head} × ${num(others)}人 ＋ 幹事 ${num(r.payer.pay)} ＝ ${num(x.subtotal)}`));
    } else {
      round.append(line(`${head} × ${num(x.count)}人 ＝ ${num(x.subtotal)}`));
    }
  }
  if (r.payer) {
    const others = N.sub(r.total, r.payer.pay);
    round.append(line(`幹事：合計 ${num(r.total)} − ほかの人 ${num(others)} ＝ ${yen(r.payer.pay)}`));
  }
  const collectedOk = N.cmp(r.collected, rows.reduce((a, x) => N.add(a, x.subtotal), N.ZERO)) === 0;
  round.append(checked(`集まるお金 ${rows.map((x) => num(x.subtotal)).join(' ＋ ')} ＝ ${yen(r.collected)}`, collectedOk));
  round.append(line(`${num(r.collected)} − ${num(r.total)} ＝ ${P.diffText(r.diff)}`));
  round.append(el('p', 'hint', `端数：${howText()}`));
  body.append(section('端数', round));

  const allOk = exactOk && collectedOk;
  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, allOk
    ? `✓ 1人あたり（ちょうど）× 人数 を足すと、合計 ${yen(r.total)} にもどります`
    : '✗ 合わない所があります'));

  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), calcAnswer(): 電卓の答え, shopTotal(): お買い物の合計 }
export function initSplit(h) {
  hooks = h;
  load();
  $('#splitName').value = (selGroup() ?? selPart())?.name ?? '';

  // 欄をタップ → 数字キーがそこに入る
  $('#splitView').addEventListener('click', (event) => {
    const field = event.target.closest('[data-sfield]');
    if (field) choose(null, field.dataset.sfield);
  });
  // 組・払う物をタップ → 下で直す
  $('#splitList').addEventListener('click', (event) => {
    const gli = event.target.closest('[data-gid]');
    if (gli) {
      const id = Number(gli.dataset.gid);
      choose({ type: 'group', id }, st.sel.type === 'group' && st.sel.id === id && st.field !== 'total' ? st.field : 'count', true);
      return;
    }
    const pli = event.target.closest('[data-pid]');
    if (pli) choose({ type: 'part', id: Number(pli.dataset.pid) }, 'partAmount', true);
  });

  const name = $('#splitName');
  name.addEventListener('input', () => {
    const thing = selGroup() ?? selPart();
    if (!thing) return;
    thing.name = name.value;
    render();
  });
  name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') name.blur();
  });
  name.addEventListener('blur', () => {
    const thing = selGroup() ?? selPart();
    if (thing && thing.name !== thing.name.trim()) {
      thing.name = thing.name.trim();
      name.value = thing.name;
      render();
    }
  });

  $('#splitDelete').addEventListener('click', deleteSelected);
  $('#btnAddGroup').addEventListener('click', addGroup);
  $('#btnAddPart').addEventListener('click', addPart);
  $('#btnSplitCheck').addEventListener('click', openSplitCheck);
  $('#btnSplitMore').addEventListener('click', openMore);
  $('#splitCopy').addEventListener('click', copyResult);
  $('#splitClear').addEventListener('click', () => {
    $('#splitMoreDialog').close();
    clearAll();
  });

  setupPad($('#splitKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', Enter: 'next', '.': '.' },
  });
}
