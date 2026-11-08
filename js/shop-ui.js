// =========================================================
// お買い物モードの画面
//
//   合計を出す … 品物を1つずつ足して、税込の合計・消費税・予算の残りを出す
//                並んだ品物をタップすると、下の入力欄に戻して直せる
//   税込・税抜 … 値段1つの税込・税抜を、10% と 8% の両方で出す
//
// 値段などは、画面の中の数字キーで打つ（スマホのキーボードは出さない。品名だけは文字で入れる）
// 計算そのものは shop.js（正確な分数で計算するので、誤差は出ない）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as S from './shop.js';
import { $, toast } from './ui.js';
import { typeKey, tidy, el, button, shake, seg as segOf, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.shop';
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const RATE_LABEL = { 10: '10%', 8: '8%', 0: '税なし' };
const DECIMALS = { price: 2, qty: 3, disc: 2, budget: 0 }; // 小数点の下を何桁まで打てるか
const HUNDRED = N.frac(100n);

const label = (i) => (i < CIRCLED.length ? CIRCLED[i] : `(${i + 1})`);

const blankDraft = (rate = 10, incl = false) => ({
  name: '', price: '', qty: '', rate, incl, disc: { type: 'none', value: '' },
});

// 画面の状態（アプリを閉じても残るように、変わるたびに保存する）
const st = {
  tab: 'list',        // 'list' 合計を出す / 'quick' 税込・税抜
  items: [],          // 足した品物
  nextId: 1,
  budget: '',         // 予算（打った文字のまま）
  draft: blankDraft(), // いま入力欄で打っている品物
  editing: null,      // 直している品物の id（新しい品物なら null）
  pending: null,      // 直しはじめる前に打っていた、新しい品物
  field: 'price',     // 数字キーが入る欄 'price' 'qty' 'disc' 'budget'
  fresh: false,       // 欄をえらんだ直後（数字を打つと入れかわる）
  opts: { ...S.DEFAULT_OPTS }, // 1円未満の扱い・消費税の出し方
  quick: { price: '', incl: false, disc: '', field: 'price', fresh: false },
};
let hooks = {};
let flashId = null;

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    const { tab, items, nextId, budget, draft, editing, pending, field, opts, quick } = st;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      tab, items, nextId, budget, draft, editing, pending, field, opts,
      quick: { price: quick.price, incl: quick.incl, disc: quick.disc, field: quick.field },
    }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    const num = (v) => (typeof v === 'string' && v.length <= 20 && /^\d*\.?\d*$/.test(v) ? v : '');
    const fix = (x) => ({
      id: Number.isInteger(x?.id) ? x.id : 0,
      name: typeof x?.name === 'string' ? x.name.slice(0, 30) : '',
      price: num(x?.price),
      qty: num(x?.qty),
      rate: S.RATES.includes(x?.rate) ? x.rate : 10,
      incl: !!x?.incl,
      disc: ['pct', 'yen'].includes(x?.disc?.type) ? { type: x.disc.type, value: num(x.disc.value) } : { type: 'none', value: '' },
    });
    if (Array.isArray(s.items)) st.items = s.items.map(fix).filter((x) => x.price);
    // id が重ならないように
    let next = 1;
    for (const x of st.items) if (x.id > 0) next = Math.max(next, x.id + 1);
    const seen = new Set();
    for (const x of st.items) {
      if (!(x.id > 0) || seen.has(x.id)) x.id = next++;
      seen.add(x.id);
    }
    st.nextId = Math.max(next, Number.isInteger(s.nextId) ? s.nextId : 1);
    st.tab = s.tab === 'quick' ? 'quick' : 'list';
    st.budget = num(s.budget);
    if (s.draft) st.draft = fix(s.draft);
    st.editing = st.items.some((x) => x.id === s.editing) ? s.editing : null;
    st.pending = st.editing !== null && s.pending ? fix(s.pending) : null;
    if (['price', 'qty', 'disc', 'budget'].includes(s.field)) st.field = s.field;
    st.opts = {
      mode: S.ROUNDINGS[s.opts?.mode] ? s.opts.mode : 'floor',
      way: S.WAYS[s.opts?.way] ? s.opts.way : 'group',
    };
    if (s.quick) {
      st.quick = {
        price: num(s.quick.price), incl: !!s.quick.incl, disc: num(s.quick.disc),
        field: s.quick.field === 'disc' ? 'disc' : 'price', fresh: false,
      };
    }
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 小さな道具（部品は form.js）
// ---------------------------------------------------------
const num = F.amountText;
const yen = F.yenText;

// 丸める前と後（同じなら1つだけ）
function rounded(raw, amount) {
  return N.cmp(raw, amount) === 0 ? num(amount) : `${num(raw)} → ${num(amount)}`;
}

const reject = (target) => shake(target, hooks.settings());
const seg = (options, current, onPick, ariaLabel) => segOf(options, current, onPick, ariaLabel, hooks.settings());

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showShop() {
  render();
}

function render() {
  const listTab = st.tab === 'list';
  for (const b of document.querySelectorAll('#shopTabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === st.tab));
  }
  $('#listPane').hidden = !listTab;
  $('#quickPane').hidden = listTab;
  $('#entry').hidden = !listTab;
  $('#shopKeys').classList.toggle('quick', !listTab);
  if (listTab) renderList();
  else renderQuick();
  save();
}

function countText(t) {
  const n = `${t.count}点`;
  return N.cmp(t.pieces, N.frac(BigInt(t.count))) === 0 ? n : `${n}・${num(t.pieces)}個`;
}

function detailText(item) {
  const parts = [`${F.groupNumberText(item.price)}円${item.qty && item.qty !== '1' ? ` × ${F.groupNumberText(item.qty)}` : ''}`];
  parts.push(RATE_LABEL[item.rate]);
  if (item.disc.type === 'pct') parts.push(`${item.disc.value}%引き`);
  if (item.disc.type === 'yen') parts.push(`1個${item.disc.value}円引き`);
  return parts.join('・');
}

function renderList() {
  const t = S.totalsOf(st.items, st.opts);

  // 合計
  $('#sumTotal').textContent = yen(t.total);
  $('#sumCount').textContent = st.items.length ? countText(t) : '';
  const taxBox = $('#sumTax');
  taxBox.replaceChildren();
  if (st.items.length) {
    let text = `うち消費税 ${yen(t.tax)}`;
    const taxed = t.groups.filter((g) => g.rate > 0);
    if (taxed.length > 1) text += `（${taxed.map((g) => `${g.rate}%：${yen(g.tax)}`).join('・')}）`;
    taxBox.append(el('div', '', text));
  }
  const how = el('div', 'sum-how', `消費税は${S.WAYS[st.opts.way]}計算・1円未満は${S.ROUNDINGS[st.opts.mode]} `);
  how.append(button('link', '変える', openMore));
  taxBox.append(how);

  // 予算
  setField($('#budgetField'), { text: st.budget, placeholder: '—', active: st.field === 'budget', fresh: st.fresh });
  const left = $('#sumLeft');
  const budget = S.amountOf(st.budget);
  if (N.isZero(budget)) {
    left.textContent = '予算を入れると、残りが出ます';
    left.className = 'sum-left';
  } else {
    const rest = N.sub(budget, t.total);
    const over = N.sign(rest) < 0;
    left.textContent = over ? `${yen(N.neg(rest))} オーバー` : `残り ${yen(rest)}`;
    left.className = `sum-left ${over ? 'ng' : 'ok'}`;
  }

  // 品物の一覧
  const list = $('#shopItems');
  list.replaceChildren(...st.items.map((item, i) => itemRow(item, i, t.lines[i])));
  $('#shopEmpty').hidden = st.items.length > 0;
  flashId = null;

  renderEntry();
}

function itemRow(item, i, line) {
  const li = el('li', 's-item');
  li.dataset.id = item.id;
  if (item.id === st.editing) li.classList.add('editing');
  if (item.id === flashId) li.classList.add('flash');
  li.append(el('span', 's-no', label(i)));
  const main = el('div', 's-main');
  main.append(el('div', item.name ? 's-name' : 's-name none', item.name || '品物'));
  main.append(el('div', 's-sub', detailText(item)));
  li.append(main);
  const amount = el('div', 's-amt');
  amount.append(el('b', '', yen(line.amount)));
  if (item.rate) amount.append(el('small', '', item.incl ? '税込' : '税抜'));
  li.append(amount);
  if (item.id === st.editing) {
    const del = button('s-del', '消す');
    del.dataset.del = item.id;
    li.append(del);
  }
  return li;
}

function entryHint() {
  const d = st.draft;
  const mode = S.ROUNDINGS[st.opts.mode];
  if (st.field === 'budget') return '予算を打って「決定」。残りの金額が上に出ます';
  if (st.field === 'disc') {
    if (d.disc.type === 'yen') return '1個あたり〇円引き（個数の分だけ引きます）';
    if (d.disc.type === 'pct') return `〇%引き（1円未満は${mode}）`;
    return '割引の種類をえらんでから、数を打ちます';
  }
  if (st.field === 'qty') return '個数のかわりに、量（L・kg など）も打てます';
  if (d.rate === 8) return '8%：食べ物・飲み物（お酒・外食は10%）';
  if (d.rate === 0) return '消費税がかからない物（切手など）';
  return d.incl ? '税込の値段：そのまま足します' : '税抜の値段：消費税はあとで足します';
}

function renderEntry() {
  const d = st.draft;
  const index = st.items.findIndex((x) => x.id === st.editing);
  const editing = index >= 0;
  $('#entryState').textContent = editing ? `${label(index)}を直す` : '新しい品物';
  $('#entry').classList.toggle('editing', editing);
  $('#entryCancel').hidden = !editing;

  const f = (name) => document.querySelector(`#entry [data-field="${name}"]`);
  setField(f('price'), { text: d.price, placeholder: '0', active: st.field === 'price', fresh: st.fresh });
  setField(f('qty'), { text: d.qty, placeholder: '1', active: st.field === 'qty', fresh: st.fresh });
  const discUnit = { pct: '%引き', yen: '円引き', none: '' }[d.disc.type];
  setField(f('disc'), {
    text: d.disc.value,
    placeholder: d.disc.type === 'none' ? 'なし' : '0',
    active: st.field === 'disc',
    fresh: st.fresh,
    unit: discUnit,
  });

  // 欄の下のえらぶボタン（数字キーが入る欄によって変わる）
  const opts = $('#entryOpts');
  opts.replaceChildren();
  if (st.field === 'budget') {
    opts.append(el('span', 'opts-text', '予算を打っています'));
  } else if (st.field === 'disc') {
    opts.append(seg([['pct', '%引き'], ['yen', '円引き'], ['none', '割引なし']], d.disc.type, (type) => {
      d.disc = { type, value: type === 'none' ? '' : d.disc.value };
      st.fresh = !!d.disc.value;
      render();
    }, '割引の種類'));
  } else {
    opts.append(seg(S.RATES.map((r) => [String(r), RATE_LABEL[r]]), String(d.rate), (v) => {
      d.rate = Number(v);
      render();
    }, '消費税率'));
    opts.append(seg([['0', '税抜'], ['1', '税込']], d.incl ? '1' : '0', (v) => {
      d.incl = v === '1';
      render();
    }, '打つ値段は'));
  }

  $('#entryHint').textContent = entryHint();
  const amount = $('#entryAmount');
  amount.textContent = '';
  if (st.field !== 'budget' && !N.isZero(S.amountOf(d.price))) {
    const line = S.lineOf(d, st.opts.mode);
    amount.textContent = N.isZero(line.discount) ? `＝ ${yen(line.amount)}` : `＝ ${yen(line.amount)}（${yen(line.discount)}引き）`;
  }
  $('#shopAdd').textContent = st.field === 'budget' ? '決定' : editing ? '直す' : '追加';
}

// ---------------------------------------------------------
// 税込・税抜のかんたん計算
// ---------------------------------------------------------
function renderQuick() {
  const q = st.quick;
  const f = (name) => document.querySelector(`#quickPane [data-qfield="${name}"]`);
  setField(f('price'), { text: q.price, placeholder: '0', active: q.field === 'price', fresh: q.fresh });
  setField(f('disc'), { text: q.disc, placeholder: '0', active: q.field === 'disc', fresh: q.fresh });
  for (const b of document.querySelectorAll('#qIncl [data-incl]')) {
    b.setAttribute('aria-checked', String((b.dataset.incl === '1') === q.incl));
  }
  $('#qDisc').hidden = q.field !== 'disc';
  for (const b of document.querySelectorAll('#qDisc [data-disc]')) {
    b.setAttribute('aria-pressed', String(b.dataset.disc === q.disc));
  }

  const box = $('#qResult');
  const note = $('#qNote');
  box.replaceChildren();
  note.replaceChildren();
  const price = S.amountOf(q.price);
  if (N.isZero(price)) {
    box.append(el('p', 'q-empty', '値段を打つと、10% と 8% の両方で出します'));
    return;
  }
  const mode = st.opts.mode;
  const modeText = S.ROUNDINGS[mode];
  let base = price;
  const hasDisc = !N.isZero(S.amountOf(q.disc));
  if (hasDisc) {
    base = S.discounted(price, price, N.ONE, { type: 'pct', value: q.disc }, mode).amount;
    box.append(el('p', 'q-after', `${tidy(q.disc)}%引き：${yen(price)} → ${yen(base)}（${q.incl ? '税込' : '税抜'}）`));
  }
  const res = { 10: S.taxOf(base, 10, q.incl, mode), 8: S.taxOf(base, 8, q.incl, mode) };
  const rows = q.incl ? [['税抜', 'body'], ['消費税（ふくまれる）', 'tax']] : [['税込', 'total'], ['消費税', 'tax']];
  const table = el('table', 'q-table');
  const head = el('tr');
  head.append(el('th'));
  const th10 = el('th', '', '10%');
  const th8 = el('th', '', '8%');
  th8.append(el('small', '', '食べ物など'));
  head.append(th10, th8);
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const [name, key] of rows) {
    const tr = el('tr', key === 'tax' ? 'sub' : 'main');
    tr.append(el('th', '', name));
    for (const rate of [10, 8]) tr.append(el('td', '', yen(res[rate][key])));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  box.append(table);

  // 注意書き（すぐそばに）
  if (q.incl) {
    note.append(el('p', '', `ちょうど割ると 10%：${num(res[10].exact)}円、8%：${num(res[8].exact)}円。`));
    note.append(el('p', '', `ここでは消費税の1円未満を${modeText}にして、税抜 ＝ 税込 − 消費税 で出しています（お店によっては1円ずれることがあります）。`));
  } else {
    note.append(el('p', '', `消費税の1円未満は${modeText}にしています。`));
  }
  if (hasDisc) note.append(el('p', '', `割引のあとの1円未満も${modeText}です。`));
  const change = el('p');
  change.append(button('link', '1円未満の扱いを変える', openMore));
  note.append(change);
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function press(key, target) {
  if (st.tab === 'quick') return pressQuick(key, target);
  if (key === 'add') return add(target);
  if (key === 'qty') {
    if (st.field === 'qty') return reject(target);
    return selectField('qty');
  }
  const d = st.draft;
  const f = st.field;
  const current = f === 'budget' ? st.budget : f === 'disc' ? d.disc.value : d[f];
  const next = typeKey(current, key, { fresh: st.fresh, maxDecimals: DECIMALS[f] });
  if (next === null) return reject(target);
  if (f === 'disc') {
    if (d.disc.type === 'none') d.disc = { type: 'pct', value: '' }; // 数を打ったら「%引き」に
    if (d.disc.type === 'pct' && next && N.cmp(S.amountOf(next), HUNDRED) > 0) {
      reject(target);
      toast('割引は100%までです');
      return;
    }
    d.disc.value = next;
  } else if (f === 'budget') {
    st.budget = next;
  } else {
    d[f] = next;
  }
  st.fresh = false;
  render();
}

function pressQuick(key, target) {
  const q = st.quick;
  if (key === 'add' || key === 'qty') return;
  const current = q.field === 'disc' ? q.disc : q.price;
  const next = typeKey(current, key, { fresh: q.fresh, maxDecimals: 2 });
  if (next === null) return reject(target);
  if (q.field === 'disc') {
    if (next && N.cmp(S.amountOf(next), HUNDRED) > 0) {
      reject(target);
      toast('割引は100%までです');
      return;
    }
    q.disc = next;
  } else {
    q.price = next;
  }
  q.fresh = false;
  render();
}

function selectField(name) {
  if (st.field !== name) {
    st.field = name;
    const d = st.draft;
    const text = name === 'budget' ? st.budget : name === 'disc' ? d.disc.value : d[name];
    st.fresh = !!text; // 前の数が入っていれば、打つと入れかわる
  } else {
    st.fresh = false;
  }
  render();
}

// 「追加」（直しているときは「直す」、予算のときは「決定」）
function add(target) {
  if (st.field === 'budget') {
    st.field = 'price';
    st.fresh = false;
    render();
    return;
  }
  const d = st.draft;
  if (N.isZero(S.amountOf(d.price))) {
    reject(target);
    toast('値段を打ってから「追加」を押してください');
    return;
  }
  const qty = tidy(d.qty);
  if (qty && N.isZero(S.amountOf(qty))) {
    reject(target);
    toast('個数が 0 です');
    return;
  }
  const discValue = tidy(d.disc.value);
  const item = {
    id: 0,
    name: d.name.trim(),
    price: tidy(d.price),
    qty: qty === '1' ? '' : qty,
    rate: d.rate,
    incl: d.incl,
    disc: d.disc.type !== 'none' && discValue && !N.isZero(S.amountOf(discValue))
      ? { type: d.disc.type, value: discValue }
      : { type: 'none', value: '' },
  };
  if (st.editing !== null) {
    item.id = st.editing;
    const i = st.items.findIndex((x) => x.id === st.editing);
    if (i >= 0) st.items[i] = item;
    else st.items.push(item);
    st.editing = null;
    st.draft = st.pending ?? blankDraft(d.rate, d.incl);
    st.pending = null;
  } else {
    item.id = st.nextId++;
    st.items.push(item);
    st.draft = blankDraft(d.rate, d.incl); // 税率・税抜／税込は、次の品物にも引きつぐ
  }
  st.field = 'price';
  st.fresh = false;
  $('#entryName').value = st.draft.name;
  flashId = item.id;
  render();
  document.querySelector(`#shopItems [data-id="${item.id}"]`)?.scrollIntoView({ block: 'nearest' });
}

function startEdit(id) {
  const item = st.items.find((x) => x.id === id);
  if (!item) return;
  if (st.editing === null) st.pending = st.draft;
  st.editing = id;
  st.draft = { ...item, disc: { ...item.disc } };
  st.field = 'price';
  st.fresh = true;
  $('#entryName').value = st.draft.name;
  render();
}

function cancelEdit() {
  if (st.editing === null) return;
  st.editing = null;
  st.draft = st.pending ?? blankDraft(st.draft.rate, st.draft.incl);
  st.pending = null;
  st.field = 'price';
  st.fresh = false;
  $('#entryName').value = st.draft.name;
  render();
}

function deleteItem(id) {
  const i = st.items.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [removed] = st.items.splice(i, 1);
  if (st.editing === id) cancelEdit();
  else render();
  toast(`${label(i)}${removed.name ? `「${removed.name}」` : ''}を消しました`, {
    label: '元に戻す',
    run: () => {
      st.items.splice(Math.min(i, st.items.length), 0, removed);
      render();
    },
  });
}

function clearAll() {
  if (!st.items.length) {
    toast('品物はありません');
    return;
  }
  const before = st.items;
  st.items = [];
  if (st.editing !== null) cancelEdit();
  else render();
  toast(`品物を${before.length}つ消しました`, {
    label: '元に戻す',
    run: () => {
      st.items = [...before, ...st.items];
      render();
    },
  });
}

// ---------------------------------------------------------
// 合計の使い道と、計算のしかた（⋯）
// ---------------------------------------------------------
function openMore() {
  const dialog = $('#shopMoreDialog');
  const t = S.totalsOf(st.items, st.opts);
  $('#shopMoreTotal').textContent = st.items.length ? `合計 ${yen(t.total)} を` : '合計（まだ品物がありません）';
  const chips = (box, table, key) => {
    box.replaceChildren(...Object.entries(table).map(([value, text]) => {
      const b = button('chip', text, () => {
        st.opts = { ...st.opts, [key]: value };
        render();
        openMore(); // えらんだ印を付け直す
        toast(`${key === 'mode' ? '1円未満' : '消費税'}を「${text}」で計算します`);
      });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(st.opts[key] === value));
      return b;
    }));
  };
  chips($('#shopModeChips'), S.ROUNDINGS, 'mode');
  chips($('#shopWayChips'), S.WAYS, 'way');
  if (!dialog.open) dialog.showModal();
}

// いまの合計（品物がなければ null）。割り勘の画面で使う
export function currentShopTotal() {
  return st.items.length ? S.totalsOf(st.items, st.opts).total : null;
}

function splitTotal() {
  if (!st.items.length) {
    toast('まだ品物がありません');
    return;
  }
  $('#shopMoreDialog').close();
  hooks.onSplit(S.totalsOf(st.items, st.opts).total);
}

function useTotal() {
  if (!st.items.length) {
    toast('まだ品物がありません');
    return;
  }
  $('#shopMoreDialog').close();
  hooks.onUseTotal(S.totalsOf(st.items, st.opts).total);
}

// 合計を履歴に残す（式は「品物の金額 ＋ … ＋ 消費税」の足し算）
function saveToHistory() {
  if (!st.items.length) {
    toast('まだ品物がありません');
    return;
  }
  const t = S.totalsOf(st.items, st.opts);
  const items = [];
  S.sumTerms(t).forEach((x, i) => {
    if (i) items.push('+');
    items.push(...x.n.toString());
  });
  hooks.onSaveHistory(items, t.total, { kind: '買い物' });
  $('#shopMoreDialog').close();
  toast('履歴に残しました（種類：買い物）');
}

// ---------------------------------------------------------
// 検算（品物ごと → 消費税 → 合計の足し算と逆算 → レシートとくらべる）
// ---------------------------------------------------------
function section(title, ...children) {
  const s = el('section', 'd-sec');
  s.append(el('h3', '', title), ...children);
  return s;
}

function calcLine(text, cls = '') {
  return el('div', `calc-line ${cls}`.trim(), text);
}

function openShopCheck() {
  if (!st.items.length) {
    toast('品物を足すと、検算できます');
    return;
  }
  const t = S.totalsOf(st.items, st.opts);
  const modeText = S.ROUNDINGS[st.opts.mode];
  $('#checkTitle').textContent = 'お買い物の検算';
  const body = $('#checkBody');
  body.replaceChildren();

  // 1. 品物ごと
  const steps = el('ol', 'steps');
  let allOk = true;
  t.lines.forEach((line, i) => {
    const item = st.items[i];
    const li = el('li', 'step');
    li.append(el('span', 'no', label(i)));
    const box = el('div');
    box.append(el('div', 'step-title', `${item.name || '品物'}（${RATE_LABEL[item.rate]}${item.rate ? `・${item.incl ? '税込' : '税抜'}` : ''}）`));
    const one = N.cmp(line.qty, N.ONE) === 0;
    box.append(calcLine(one ? `${num(line.price)}円` : `${num(line.price)} × ${num(line.qty)} ＝ ${num(line.base)}円`));
    if (item.disc.type === 'pct') {
      const keep = N.sub(HUNDRED, S.amountOf(item.disc.value));
      box.append(calcLine(`${item.disc.value}%引き：${num(line.base)} × ${num(keep)}% ＝ ${rounded(line.raw, line.amount)}円`));
    } else if (item.disc.type === 'yen') {
      box.append(calcLine(`1個${item.disc.value}円引き：(${num(line.price)} − ${item.disc.value}) × ${num(line.qty)} ＝ ${rounded(line.raw, line.amount)}円`));
    }
    if (N.cmp(line.raw, line.amount) !== 0) box.append(el('div', 'rev', `1円未満は${modeText}`));
    if (!one && !N.isZero(line.qty)) {
      const back = N.div(line.base, line.qty);
      const ok = N.cmp(back, line.price) === 0;
      allOk &&= ok;
      const rev = el('div', 'rev', `逆算 ${num(line.base)} ÷ ${num(line.qty)} ＝ ${num(back)} `);
      rev.append(el('span', `mark ${ok ? 'ok' : 'ng'}`, ok ? '✓' : '✗'));
      box.append(rev);
    }
    li.append(box);
    steps.append(li);
  });
  body.append(section('品物ごと', steps));

  // 2. 消費税
  const taxBox = el('div');
  if (t.way === 'group') {
    for (const g of t.groups) {
      if (g.rate === 0) {
        taxBox.append(calcLine(`税なし：${yen(N.add(g.ex, g.inc))}（消費税はかかりません）`));
        continue;
      }
      if (!N.isZero(g.ex)) taxBox.append(calcLine(`${g.rate}%・税抜の分：${num(g.ex)} × ${g.rate}% ＝ ${rounded(g.exTaxRaw, g.exTax)}円`));
      if (!N.isZero(g.inc)) taxBox.append(calcLine(`${g.rate}%・税込の分：${num(g.inc)} × ${g.rate}/${100 + g.rate} ＝ ${rounded(g.incTaxRaw, g.incTax)}円（値段にふくまれている）`));
    }
  } else {
    t.lines.forEach((line, i) => {
      if (!line.rate) return;
      const how = line.incl ? `${line.rate}/${100 + line.rate}` : `${line.rate}%`;
      taxBox.append(calcLine(`${label(i)} ${num(line.amount)} × ${how} ＝ ${rounded(line.taxRaw, line.tax)}円${line.incl ? '（ふくまれている）' : ''}`));
    });
  }
  taxBox.append(el('p', 'hint', `消費税は${S.WAYS[t.way]}出して、1円未満は${modeText}にしています。`));
  body.append(section('消費税', taxBox));

  // 3. 合計（足し算と、その逆算）
  const terms = S.sumTerms(t);
  let rest = t.total;
  for (const x of terms) rest = N.sub(rest, x);
  const ok = N.isZero(rest);
  allOk &&= ok;
  const totalBox = el('div');
  totalBox.append(calcLine(`${terms.map(num).join(' ＋ ')} ＝ ${yen(t.total)}`));
  const rev = el('div', 'rev', `逆算 ${num(t.total)} − ${terms.map(num).join(' − ')} ＝ ${num(rest)} `);
  rev.append(el('span', `mark ${ok ? 'ok' : 'ng'}`, ok ? '✓' : '✗'));
  totalBox.append(rev);
  totalBox.append(el('p', 'hint', '品物の金額（税込で入れた分は、そのまま）に、税抜で入れた分の消費税を足しています。'));
  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, allOk
    ? `✓ 合計 ${yen(t.total)}（${countText(t)}・うち消費税 ${yen(t.tax)}）`
    : '✗ 合わない所があります'));
  body.append(section('合計', totalBox));

  // 4. レシートとくらべる（照合）
  const receipt = el('div');
  receipt.append(el('p', 'hint', 'レシートの合計を打つと、この計算と同じかを見ます。ちがうときは、お店の計算のしかた（1円未満の扱い・消費税の出し方）を探します。'));
  const row = el('div', 'd-row');
  const input = el('input', 'receipt-input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.placeholder = 'レシートの合計（円）';
  input.autocomplete = 'off';
  input.enterKeyHint = 'done';
  const out = el('div', 'receipt-out');
  const compare = () => showReceipt(input.value, out);
  row.append(input, button('primary', 'くらべる', compare));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') compare();
  });
  receipt.append(row, out);
  body.append(section('レシートとくらべる', receipt));

  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
  body.scrollTop = 0;
}

function showReceipt(text, out) {
  out.replaceChildren();
  const clean = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、円\s¥￥]/g, '');
  if (!/^\d{1,15}$/.test(clean)) {
    out.append(el('p', 'summary ng', '数字だけで打ってください'));
    return;
  }
  const receipt = N.frac(BigInt(clean));
  const results = S.compareReceipt(st.items, receipt, st.opts);
  const now = results[0];
  if (now.same) {
    out.append(el('p', 'summary ok', `✓ レシートと同じです（${yen(receipt)}）`));
    return;
  }
  const diff = N.sub(receipt, now.total);
  out.append(el('p', 'summary ng', `✗ レシートのほうが ${yen(N.absNum(diff))} ${N.sign(diff) > 0 ? '多い' : '少ない'}です（この計算は ${yen(now.total)}）`));
  const matches = results.filter((r) => r.same);
  if (!matches.length) {
    out.append(el('p', 'hint', 'どの計算のしかたでも合いません。品物の打ちまちがい・抜け、割引、レジ袋などを確かめてください。'));
    return;
  }
  out.append(el('p', 'hint', 'お店の計算のしかたが、ちがうのかもしれません。次のようにすると、レシートと同じになります。'));
  for (const m of matches.slice(0, 3)) {
    const r = el('div', 'd-row');
    r.append(el('span', '', `消費税は${S.WAYS[m.way]}・1円未満は${S.ROUNDINGS[m.mode]}`));
    r.append(button('ghost', 'この計算にする', () => {
      st.opts = { mode: m.mode, way: m.way };
      render();
      openShopCheck();
      toast('計算のしかたを変えました（⋯ からもどせます）');
    }));
    out.append(r);
  }
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(): 設定, active(): お買い物の画面か, onUseTotal(value), onSaveHistory(items, value, meta) }
export function initShop(h) {
  hooks = h;
  load();
  $('#entryName').value = st.draft.name;

  $('#shopTabs').addEventListener('click', (event) => {
    const b = event.target.closest('[data-tab]');
    if (!b) return;
    st.tab = b.dataset.tab;
    render();
  });

  // 欄をタップ → 数字キーがそこに入る
  $('#shopView').addEventListener('click', (event) => {
    const field = event.target.closest('[data-field]');
    if (field) {
      selectField(field.dataset.field);
      return;
    }
    const qfield = event.target.closest('[data-qfield]');
    if (qfield) {
      const q = st.quick;
      q.fresh = q.field !== qfield.dataset.qfield && !!(qfield.dataset.qfield === 'disc' ? q.disc : q.price);
      q.field = qfield.dataset.qfield;
      render();
    }
  });

  $('#qIncl').addEventListener('click', (event) => {
    const b = event.target.closest('[data-incl]');
    if (!b) return;
    st.quick.incl = b.dataset.incl === '1';
    render();
  });
  $('#qDisc').addEventListener('click', (event) => {
    const b = event.target.closest('[data-disc]');
    if (!b) return;
    st.quick.disc = b.dataset.disc;
    st.quick.fresh = true;
    render();
  });

  // 品名（ここだけはスマホのキーボードで打つ）
  const name = $('#entryName');
  name.addEventListener('input', () => {
    st.draft.name = name.value;
    save();
  });
  name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') name.blur();
  });
  $('#entryCancel').addEventListener('click', cancelEdit);

  // 品物をタップ → 直す（もう一度タップでやめる）。「消す」で消す
  $('#shopItems').addEventListener('click', (event) => {
    const del = event.target.closest('[data-del]');
    if (del) {
      deleteItem(Number(del.dataset.del));
      return;
    }
    const li = event.target.closest('[data-id]');
    if (!li) return;
    const id = Number(li.dataset.id);
    if (st.editing === id) cancelEdit();
    else startEdit(id);
  });

  // キー（⌫ は長押しで続けて消す。PC のキーボードでも打てる）
  setupPad($('#shopKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', Enter: 'add', '.': '.', '*': 'qty', x: 'qty' },
  });

  $('#btnShopCheck').addEventListener('click', openShopCheck);
  $('#btnShopMore').addEventListener('click', openMore);
  $('#shopToCalc').addEventListener('click', useTotal);
  $('#shopToSplit').addEventListener('click', splitTotal);
  $('#shopToHistory').addEventListener('click', saveToHistory);
  $('#shopClear').addEventListener('click', () => {
    $('#shopMoreDialog').close();
    clearAll();
  });
}
