// =========================================================
// 履歴の画面（＝ を押した計算の一覧）
//
//   ・名前と種類を付けられる（種類でしぼりこみ、名前・式・答えで検索）
//   ・1つずつ消せる（すぐなら「元に戻す」）
//   ・「答えを使う」：答えを全部の桁のまま、いまの式に入れる
//   ・「式を直す」：その式を電卓に戻して、途中を直せる
//   ・複素数の履歴（mode: 'complex'）は、式も答えも複素数の形で持つ（value ＝ 実部、im ＝ 虚部）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as DB from './db.js';
import { itemsToText } from './calc.js';
import * as C from './complex.js';
import { $, renderItems, serializeItems, deserializeItems, toast, span } from './ui.js';
import { openDetail } from './detail.js';

const PAGE = 60;           // 一度に出す数
const FILTER_ALL = '*';
const FILTER_NAMED = '★';

let entries = [];          // 保存されている履歴（新しい順）
let filter = FILTER_ALL;
let search = '';
let shown = PAGE;
let openId = null;         // 操作ボタンを出している履歴
let handlers = {};
let editing = null;        // 名前・種類を編集中の履歴
let pickedKind = '';

// 履歴1つ分を、画面で使える形に（式と答えを BigInt に戻す）
function expand(entry) {
  if (!entry.cache && entry.mode === 'complex') {
    const items = C.deserItems(entry.items);
    const z = C.cx(N.deserialize(entry.value), N.deserialize(entry.im));
    entry.cache = { items, value: z.re, z, text: C.exprText(items), valueText: C.rectText(z, 14) };
  }
  if (!entry.cache) {
    const items = deserializeItems(entry.items);
    const value = N.deserialize(entry.value);
    entry.cache = { items, value, text: itemsToText(items), valueText: F.compact(value).text };
  }
  return entry.cache;
}

function store(entry) {
  const { cache, ...plain } = entry;
  return DB.putHistory(plain);
}

export async function initHistory(h) {
  handlers = h;
  try {
    entries = await DB.getAllHistory();
  } catch {
    entries = [];
    toast('履歴を読み込めませんでした');
  }

  $('#btnHistory').addEventListener('click', openPanel);
  $('#btnHistoryClose').addEventListener('click', closePanel);
  $('#historySearch').addEventListener('input', (event) => {
    search = event.target.value.trim();
    shown = PAGE;
    render();
  });
  $('#historyKinds').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-kind]');
    if (!chip) return;
    filter = chip.dataset.kind;
    shown = PAGE;
    render();
  });
  $('#historyMore').addEventListener('click', () => {
    shown += PAGE;
    render();
  });
  $('#historyList').addEventListener('click', onListClick);
  $('#btnHistoryClean').addEventListener('click', cleanUp);
  setupNameDialog();

  // スマホの「戻る」で、履歴の画面を閉じる
  window.addEventListener('popstate', () => {
    if (!$('#historyPanel').hidden) hidePanel();
  });
}

// ＝ を押したとき（お買い物の「履歴に残す」では、種類も付けて）
//   angle … sin などがある式のときだけ、計算した角度のモード（'deg' / 'rad'）
export async function addHistory(items, value, { name = '', kind = '', angle = null } = {}) {
  const entry = {
    id: DB.newId(),
    time: Date.now(),
    items: serializeItems(items),
    value: N.serialize(value),
    name,
    kind,
  };
  if (angle) entry.angle = angle;
  entries.unshift(entry);
  try {
    await store(entry);
  } catch {
    toast('履歴を保存できませんでした');
  }
}

// 複素数の ＝
export async function addComplexHistory(items, z, { name = '', kind = '', angle = null } = {}) {
  const entry = {
    id: DB.newId(),
    time: Date.now(),
    mode: 'complex',
    items: C.serItems(items),
    value: N.serialize(z.re),
    im: N.serialize(z.im),
    name,
    kind,
  };
  if (angle) entry.angle = angle;
  entries.unshift(entry);
  try {
    await store(entry);
  } catch {
    toast('履歴を保存できませんでした');
  }
}

function openPanel() {
  openId = null;
  shown = PAGE;
  render();
  $('#historyPanel').hidden = false;
  $('#historyBody').scrollTop = 0;
  history.pushState({ panel: 'history' }, '');
}

function hidePanel() {
  $('#historyPanel').hidden = true;
}

function closePanel() {
  if ($('#historyPanel').hidden) return;
  if (history.state?.panel === 'history') history.back(); // popstate で閉じる
  else hidePanel();
}

export { closePanel as closeHistory };

// 種類の一覧（最近使った順）
function kinds() {
  const seen = new Map();
  for (const e of entries) if (e.kind && !seen.has(e.kind)) seen.set(e.kind, e.time);
  return [...seen.keys()];
}

function matches(entry) {
  if (filter === FILTER_NAMED && !entry.name) return false;
  if (filter !== FILTER_ALL && filter !== FILTER_NAMED && entry.kind !== filter) return false;
  if (!search) return true;
  const c = expand(entry);
  const hay = `${entry.name} ${entry.kind} ${c.text} ${c.valueText} ${c.valueText.replace(/,/g, '')}`.toLowerCase();
  return search.toLowerCase().split(/\s+/).every((word) => hay.includes(word));
}

function render() {
  // 種類のチップ
  const kindList = kinds();
  if (filter !== FILTER_ALL && filter !== FILTER_NAMED && !kindList.includes(filter)) filter = FILTER_ALL;
  const chips = [[FILTER_ALL, 'すべて'], [FILTER_NAMED, '★ 名前つき'], ...kindList.map((k) => [k, k])];
  $('#historyKinds').replaceChildren(...chips.map(([key, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.kind = key;
    b.textContent = label;
    b.setAttribute('aria-pressed', String(filter === key));
    return b;
  }));

  const list = entries.filter(matches);
  const ol = $('#historyList');
  ol.replaceChildren(...list.slice(0, shown).map(itemEl));
  $('#historyMore').hidden = list.length <= shown;
  const empty = $('#historyEmpty');
  empty.hidden = list.length > 0;
  empty.textContent = entries.length === 0
    ? 'まだ履歴はありません。＝ を押すと、ここに残ります。'
    : '見つかりませんでした。';
}

function timeText(time) {
  const d = new Date(time);
  const now = new Date();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `今日 ${hm}`;
  const y = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}/`;
  return `${y}${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function itemEl(entry) {
  const c = expand(entry);
  const li = document.createElement('li');
  li.className = 'h-item';
  li.dataset.id = entry.id;

  const head = document.createElement('div');
  head.className = 'h-head';
  if (entry.name) head.append(span('h-name', entry.name));
  if (entry.kind) head.append(span('h-kind', entry.kind));
  if (entry.angle) head.append(span('h-angle', entry.angle === 'rad' ? '角度 rad' : '角度 度'));
  head.append(span('h-time', timeText(entry.time)));

  const expr = document.createElement('div');
  expr.className = 'h-expr';
  renderItems(expr, c.items);

  const value = document.createElement('div');
  value.className = 'h-value';
  if (c.z) {
    value.textContent = `= ${c.valueText}`;
  } else {
    const f = F.compact(c.value, 14, 24);
    value.innerHTML = `= ${f.html}`;
  }

  const actions = document.createElement('div');
  actions.className = 'h-actions';
  actions.hidden = openId !== entry.id;
  for (const [act, label, cls] of [
    ['use', '答えを使う'],
    ['edit', '式を直す'],
    ['check', '✓ 検算'],
    ['name', '名前・種類'],
    ['detail', '全部の桁'],
    ['delete', '消す', 'danger'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.act = act;
    b.textContent = label;
    if (cls) b.className = cls;
    if (act === 'detail' && c.z) continue; // 複素数は「全部の桁」なし
    actions.append(b);
  }
  li.append(head, expr, value, actions);
  return li;
}

function onListClick(event) {
  const li = event.target.closest('.h-item');
  if (!li) return;
  const entry = entries.find((e) => e.id === li.dataset.id);
  if (!entry) return;
  const act = event.target.closest('[data-act]')?.dataset.act;
  const c = expand(entry);
  // 複素数の履歴は、複素数の画面で
  if (c.z && ['use', 'edit', 'check'].includes(act)) {
    if (act === 'use') handlers.onUseComplex(c.z, entry.name || c.valueText);
    else if (act === 'edit') handlers.onEditComplex(c.items, entry.angle);
    else handlers.onCheckComplex(c.items, entry.angle);
    if (act !== 'check') closePanel();
    return;
  }
  switch (act) {
    case 'use':
      handlers.onUseAnswer(c.value, entry.name || F.chipLabel(c.value));
      closePanel();
      return;
    case 'edit':
      handlers.onEditExpression(c.items, entry.angle);
      closePanel();
      return;
    case 'check':
      // 検算の画面は履歴の上に出る（照合をはじめたら、履歴の画面は閉じる：closeHistory）
      handlers.onCheck(c.items, c.value, entry.name, entry.angle);
      return;
    case 'name':
      openNameDialog(entry);
      return;
    case 'detail':
      openDetail(c.value, { name: entry.name });
      return;
    case 'delete':
      removeEntry(entry);
      return;
    default:
      // 履歴をタップ → 操作ボタンを出す／しまう
      openId = openId === entry.id ? null : entry.id;
      for (const el of $('#historyList').querySelectorAll('.h-item')) {
        el.querySelector('.h-actions').hidden = el.dataset.id !== openId;
      }
  }
}

async function removeEntry(entry) {
  entries = entries.filter((e) => e !== entry);
  render();
  try {
    await DB.deleteHistory(entry.id);
  } catch {
    toast('消せませんでした');
    return;
  }
  toast('履歴を1つ消しました', {
    label: '元に戻す',
    run: async () => {
      entries.push(entry);
      entries.sort((a, b) => b.time - a.time);
      await store(entry);
      render();
    },
  });
}

async function cleanUp() {
  const targets = entries.filter((e) => !e.name && !e.kind);
  if (targets.length === 0) {
    toast('名前も種類もない履歴はありません');
    return;
  }
  // eslint-disable-next-line no-alert
  if (!confirm(`名前も種類もない履歴 ${targets.length} 件を消します。\n元に戻せません。よろしいですか？`)) return;
  entries = entries.filter((e) => e.name || e.kind);
  render();
  try {
    await DB.deleteManyHistory(targets.map((e) => e.id));
    toast(`${targets.length} 件消しました`);
  } catch {
    toast('消せませんでした');
  }
}

// ---------------------------------------------------------
// 名前・種類
// ---------------------------------------------------------
function setupNameDialog() {
  const dialog = $('#nameDialog');
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
    const chip = event.target.closest('[data-pick]');
    if (chip) {
      pickedKind = chip.dataset.pick;
      $('#kindInput').value = '';
      renderKindChips();
    }
  });
  $('#kindInput').addEventListener('input', (event) => {
    if (event.target.value.trim()) {
      pickedKind = '';
      renderKindChips();
    }
  });
  $('#nameForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editing) return;
    editing.name = $('#nameInput').value.trim();
    editing.kind = $('#kindInput').value.trim() || pickedKind;
    const entry = editing;
    editing = null;
    dialog.close();
    render();
    try {
      await store(entry);
      toast('保存しました');
    } catch {
      toast('保存できませんでした');
    }
  });
}

function renderKindChips() {
  const list = ['', ...kinds()];
  const typed = $('#kindInput').value.trim();
  $('#kindChips').replaceChildren(...list.map((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.pick = k;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(!typed && pickedKind === k));
    b.textContent = k || 'なし';
    return b;
  }));
}

function openNameDialog(entry) {
  editing = entry;
  pickedKind = entry.kind;
  $('#nameInput').value = entry.name;
  $('#kindInput').value = '';
  const c = expand(entry);
  const expr = $('#nameExpr');
  renderItems(expr, c.items);
  expr.append(span('', ` = ${c.valueText}`));
  renderKindChips();
  $('#nameDialog').showModal();
}
