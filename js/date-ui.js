// =========================================================
// 日付の画面
//
//   「日数」：始め 〜 終わり の日数・〇週〇日・〇か月〇日・平日／土日／祝日の数
//   「〇日後」：日付から 〇日・週・か月・年 あと（前）の日付（土日祝をとばす もえらべる）
//   「年齢・和暦」：満年齢・数え年・和暦・干支・次の誕生日まで
//
// 日付の欄は、数字キーと「/」で打つ（「今日」キー、「和暦」キー、カレンダーからもえらべる）。
// 空の欄は「今日」（生年月日だけは空のまま）。計算そのものは date.js
// =========================================================
import * as D from './date.js';
import * as F from './format.js';
import { $, toast } from './ui.js';
import { typeKey, el, button, shake, seg as segOf, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.date';
const DATE_FIELDS = ['from', 'to', 'base', 'birth', 'at'];
const TAB_FIELDS = { count: ['from', 'to'], add: ['base', 'n'], age: ['birth', 'at'] };
const TAB_LABEL = { count: '日数', add: '〇日後・〇日前', age: '満年齢' };
const HINTS = {
  from: '空なら今日。「2026/11/9」のように「/」で区切ります',
  to: '空なら今日。「12/25」だけなら今年の 12/25',
  base: '空なら今日から数えます',
  n: '何日（週・か月・年）あと、または前か',
  birth: '「和暦」キーで、昭和60/5/3 のようにも打てます',
  at: '空なら、今日の時点の年齢',
};
const ERA_CYCLE = ['AD', 'R', 'H', 'S', 'T'];
const blankDate = () => ({ text: '', era: 'AD' });

const st = {
  tab: 'count',
  f: { from: blankDate(), to: blankDate(), base: blankDate(), birth: blankDate(), at: blankDate() },
  n: '',
  unit: 'd',
  dir: 1,
  biz: false,
  field: { count: 'to', add: 'n', age: 'birth' }, // タブごとに、数字キーが入る欄
  fresh: false,
};
let hooks = {};

const reject = (target) => shake(target, hooks.settings());
const seg = (options, current, onPick, ariaLabel) => segOf(options, current, onPick, ariaLabel, hooks.settings());
const cur = () => st.field[st.tab];
const todayZ = () => D.today();
const isDateField = (f) => DATE_FIELDS.includes(f);

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    const { tab, f, n, unit, dir, biz, field } = st;
    localStorage.setItem(STORE_KEY, JSON.stringify({ tab, f, n, unit, dir, biz, field }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (TAB_FIELDS[s.tab]) st.tab = s.tab;
    for (const k of DATE_FIELDS) {
      const v = s.f?.[k];
      if (v && typeof v.text === 'string' && /^[\d/]{0,10}$/.test(v.text)) {
        st.f[k] = { text: v.text, era: ERA_CYCLE.includes(v.era) ? v.era : 'AD' };
      }
    }
    if (typeof s.n === 'string' && /^\d{0,6}$/.test(s.n)) st.n = s.n;
    if (D.UNITS[s.unit]) st.unit = s.unit;
    st.dir = s.dir === -1 ? -1 : 1;
    st.biz = !!s.biz;
    for (const [tab, list] of Object.entries(TAB_FIELDS)) {
      if (list.includes(s.field?.[tab])) st.field[tab] = s.field[tab];
    }
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 欄の値
// ---------------------------------------------------------
// { z, isToday } / { z: null }（生年月日が空）/ { error }
function valueOf(key) {
  const t = st.f[key];
  if (!t.text) return key === 'birth' ? { z: null } : { z: todayZ(), isToday: true };
  return D.parseDate(t.text, t.era, todayZ());
}

const eraName = (era) => D.eraByKey(era)?.name ?? '';

function showField(key) {
  const b = document.querySelector(`[data-dfield="${key}"]`);
  const active = cur() === key;
  if (key === 'n') {
    setField(b, {
      text: st.n, placeholder: '0', active, fresh: st.fresh,
      unit: `${D.UNITS[st.unit]}${st.dir > 0 ? '後' : '前'}`,
    });
    return;
  }
  const t = st.f[key];
  const v = valueOf(key);
  let shown = null;
  let unit = '';
  if (!t.text) {
    shown = t.era !== 'AD' ? `${eraName(t.era)} 年/月/日` : null;
  } else if (active || v.z === undefined || v.z === null) {
    shown = t.era !== 'AD' ? `${eraName(t.era)}${t.text}` : t.text;
  } else {
    shown = D.dateText(v.z);
  }
  if (v.z !== undefined && v.z !== null && t.text) unit = `（${D.WEEK[D.weekday(v.z)]}）`;
  setField(b, {
    text: t.text, placeholder: key === 'birth' ? '----/--/--' : '今日', active, fresh: st.fresh, shown, unit,
  });
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showDate() {
  render();
}

function render() {
  for (const b of document.querySelectorAll('#dateTabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === st.tab));
  }
  const visible = TAB_FIELDS[st.tab];
  for (const b of document.querySelectorAll('[data-dfield]')) b.hidden = !visible.includes(b.dataset.dfield);
  for (const key of visible) showField(key);
  $('#dateLabel').textContent = TAB_LABEL[st.tab];
  const out = st.tab === 'count' ? countResult() : st.tab === 'add' ? addResult() : ageResult();
  renderCard(out);
  renderOpts();
  const v = isDateField(cur()) ? valueOf(cur()) : null;
  $('#dateHint').textContent = v?.error && st.f[cur()].text ? v.error : HINTS[cur()];
  $('#dateHint').classList.toggle('ng', !!(v?.error && st.f[cur()].text));
  save();
}

// out = { main, sub, count, rows: [text | { text, cls }], error, empty }
function renderCard(out) {
  const main = $('#dateMain');
  main.textContent = out.main ?? '';
  main.classList.toggle('muted', !!(out.error || out.empty));
  $('#dateSub').textContent = out.error ?? out.sub ?? '';
  $('#dateCount').textContent = out.count ?? '';
  $('#btnDateCheck').hidden = !out.ok;
  $('#dateRows').replaceChildren(...(out.rows ?? []).map((r) => {
    const li = el('li', `w-row${typeof r === 'object' && r.cls ? ` ${r.cls}` : ''}`);
    li.append(el('span', '', typeof r === 'object' ? r.text : r));
    if (typeof r === 'object' && r.right) li.append(el('b', '', r.right));
    return li;
  }));
}

const g = (n) => F.groupInt(String(n));
const firstError = (...vals) => vals.find((v) => v.error)?.error;
const dw = (v) => `${D.dateText(v.z)}（${D.WEEK[D.weekday(v.z)]}${v.isToday ? '・今日' : ''}）`;
const dayKind = (z) => {
  const name = D.holidayName(z);
  if (name) return `祝日（${name}）`;
  const w = D.weekday(z);
  return w === 0 ? '日曜' : w === 6 ? '土曜' : null;
};

function countResult() {
  const a = valueOf('from');
  const b = valueOf('to');
  const error = firstError(a, b);
  if (error) return { error, main: '—' };
  if (!st.f.from.text && !st.f.to.text) {
    return { empty: true, main: '0日', sub: '終わりの日を打つと、今日からの日数が出ます（例：12/25）' };
  }
  const n = b.z - a.z;
  const abs = Math.abs(n);
  const [p, q] = n >= 0 ? [a.z, b.z] : [b.z, a.z];
  const rows = [`${dw(a)} → ${dw(b)}`];
  if (abs >= 7) rows.push(abs % 7 ? `${g(Math.floor(abs / 7))}週と${abs % 7}日` : `${g(abs / 7)}週ちょうど`);
  const ymd = D.ymdBetween(p, q);
  if (ymd.months >= 1) rows.push(D.ymdText(ymd));
  const k = D.countKinds(p, q);
  rows.push({ text: `${F.groupInt(String(k.total))}日間のうち`, right: `平日 ${g(k.weekday)}・土日 ${g(k.weekend)}・祝日 ${g(k.holiday)}` });
  if (k.holidays.length && k.holidays.length <= 4) {
    rows.push({ text: `祝日：${k.holidays.map((h) => `${D.shortMD(h.z)} ${h.name}`).join('、')}`, cls: 'hol' });
  }
  if (k.partial) rows.push({ text: `祝日は ${D.HOLIDAY_FROM}〜${D.HOLIDAY_TO}年の分だけ数えています`, cls: 'muted' });
  const wa = D.wareki(a.z);
  const wb = D.wareki(b.z);
  if (wa && wb) rows.push({ text: `和暦：${wa} → ${wb}`, cls: 'muted' });
  return {
    ok: n !== 0,
    main: D.daysText(abs),
    sub: n > 0 ? `始めの日も数えると ${D.daysText(abs + 1)}間` : n < 0 ? `終わりが始めより前です（${D.daysText(abs)}前）` : '同じ日です',
    rows,
    n,
  };
}

function addResult() {
  const a = valueOf('base');
  if (a.error) return { error: a.error, main: '—' };
  if (!st.n || Number(st.n) === 0) {
    return { empty: true, main: D.dateWeek(a.z), sub: '「数」を打つと、〇日後（前）の日付が出ます' };
  }
  const n = Number(st.n);
  const biz = st.unit === 'd' && st.biz;
  const r = D.shiftDate(a.z, n, st.unit, st.dir, { biz });
  if (!r.ok) return { error: r.error, main: '—' };
  const word = `${F.groupInt(st.n)}${biz ? '営業日' : D.UNITS[st.unit]}${st.dir > 0 ? '後' : '前'}`;
  const rows = [`${dw(a)} の ${word}`];
  if (biz) rows.push(`土日・祝日の ${D.daysText(r.skipped)}をとばしています（祝日は ${D.HOLIDAY_FROM}〜${D.HOLIDAY_TO}年）`);
  if (r.clamped) {
    rows.push({ text: `${r.wanted.y}/${r.wanted.m}/${r.wanted.d} はないので、月末の ${D.dateText(r.z)} にしています`, cls: 'hol' });
  }
  if (st.unit !== 'd' || biz) rows.push(`日数にすると ${D.daysText(Math.abs(r.z - a.z))}${st.dir > 0 ? '後' : '前'}`);
  if (st.unit === 'd' && !biz && st.dir > 0) {
    rows.push(`始めの日を1日目と数えると、${F.groupInt(st.n)}日目は ${D.dateWeek(a.z + n - 1)}`);
  }
  const kind = dayKind(r.z);
  if (kind) rows.push({ text: `その日は${kind}です`, cls: 'hol' });
  return { ok: true, main: D.dateWeek(r.z), sub: D.wareki(r.z) ?? '', rows, r, a, n, biz };
}

function ageResult() {
  const b = valueOf('birth');
  const t = valueOf('at');
  const error = firstError(b, t);
  if (error) return { error, main: '—' };
  if (b.z === null) return { empty: true, main: '—', sub: '生年月日を打つと、年齢・和暦・干支が出ます' };
  const r = D.ageOf(b.z, t.z);
  if (!r.ok) return { error: r.error, main: '—' };
  const y = D.civilFromDays(b.z).y;
  const rows = [
    `生まれた日 ${D.dateWeek(b.z)}`,
    `和暦 ${D.wareki(b.z) ?? '（1872年までの日本は旧暦なので、出しません）'}`,
    `干支 ${D.etoText(y)}`,
  ];
  if (t.z === r.thisYear) rows.push({ text: `${t.isToday ? '今日' : 'この日'}が誕生日です（${r.age}歳）`, cls: 'hol' });
  if (r.next !== null) rows.push(`次の誕生日 ${D.dateWeek(r.next)} まで ${D.daysText(r.toNext)}（${r.age + 1}歳）`);
  rows.push(`生まれてから ${D.daysText(r.days)}（生まれた日を1日目と数えると ${F.groupInt(String(r.days + 1))}日目）`);
  if (r.leapBaby) rows.push({ text: '2月29日生まれは、うるう年でない年は 3月1日に1つ増えるとして計算しています', cls: 'muted' });
  return {
    ok: true,
    main: `${r.age}歳`,
    sub: `数え年 ${r.kazoe}歳`,
    count: t.isToday ? '今日の時点' : `${D.dateText(t.z)} の時点`,
    rows,
    r,
    b,
    t,
  };
}

// 欄の下のえらぶボタン
function renderOpts() {
  const box = $('#dateOpts');
  box.replaceChildren();
  if (st.tab === 'add') {
    box.append(seg(Object.entries(D.UNITS), st.unit, (v) => {
      st.unit = v;
      render();
    }, '単位'));
    box.append(seg([[1, '後'], [-1, '前']], st.dir, (v) => {
      st.dir = v;
      render();
    }, '後か前か'));
    if (st.unit === 'd') {
      const b = button('chip', '土日祝をとばす', () => {
        st.biz = !st.biz;
        render();
      });
      b.setAttribute('aria-pressed', String(st.biz));
      box.append(b);
    }
  }
  if (st.tab === 'count') {
    box.append(button('chip', '⇄ 入れかえ', () => {
      [st.f.from, st.f.to] = [st.f.to, st.f.from];
      st.fresh = false;
      render();
    }));
  }
  if (isDateField(cur())) box.append(button('chip', 'カレンダーでえらぶ', openPicker));
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function choose(field, again = false) {
  if (cur() === field && !again) st.fresh = false;
  else {
    st.field[st.tab] = field;
    st.fresh = field === 'n' ? !!st.n : !!st.f[field].text;
  }
  render();
}

function goNext() {
  const list = TAB_FIELDS[st.tab];
  choose(list[(list.indexOf(cur()) + 1) % list.length]);
}

// 「和暦」キー：日付が打ってあれば 西暦 ⇔ その日の元号、なければ 西暦→令和→平成→昭和→大正
function switchEra(fld, target) {
  const r = D.parseDate(fld.text, fld.era, todayZ());
  if (r.z !== undefined && r.z !== null) {
    if (fld.era === 'AD') {
      const e = D.eraOf(r.z);
      if (!e || e.key === 'M') {
        toast('明治より前は、和暦で打てません');
        return reject(target);
      }
      fld.era = e.key;
      fld.text = D.textInEra(r.z, e.key);
    } else {
      fld.era = 'AD';
      fld.text = D.dateText(r.z);
    }
  } else {
    fld.era = ERA_CYCLE[(ERA_CYCLE.indexOf(fld.era) + 1) % ERA_CYCLE.length];
    if (fld.era !== 'AD' && !/^\d{0,2}(\/|$)/.test(fld.text)) fld.text = ''; // 和暦の年は2桁まで
  }
  st.fresh = false;
  render();
}

function press(key, target) {
  if (key === 'next') return goNext();
  const f = cur();
  if (f === 'n') {
    if (['/', 'today', 'era'].includes(key)) return reject(target);
    const next = typeKey(st.n, key, { fresh: st.fresh, maxDecimals: 0, maxInt: 6 });
    if (next === null) return reject(target);
    st.n = next === '0' ? '' : next;
    st.fresh = false;
    return render();
  }
  const fld = st.f[f];
  if (key === 'today') {
    fld.text = D.dateText(todayZ());
    fld.era = 'AD';
    st.fresh = true;
    return render();
  }
  if (key === 'era') return switchEra(fld, target);
  if (key === 'clear' && !fld.text && fld.era !== 'AD') {
    fld.era = 'AD';
    return render();
  }
  const next = D.typeDate(fld.text, key, { fresh: st.fresh, era: fld.era });
  if (next === null) return reject(target);
  fld.text = next;
  st.fresh = false;
  render();
}

// カレンダー（スマホの日付えらび）
function openPicker() {
  const f = cur();
  if (!isDateField(f)) return;
  const picker = $('#datePicker');
  const v = valueOf(f);
  const z = v.z ?? todayZ();
  const { y, m, d } = D.civilFromDays(z);
  picker.value = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  picker.dataset.field = f;
  try {
    picker.showPicker();
  } catch {
    picker.focus();
    picker.click();
  }
}

function pickerChanged() {
  const picker = $('#datePicker');
  const f = picker.dataset.field;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(picker.value);
  if (!m || !isDateField(f)) return;
  st.f[f] = { text: `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`, era: 'AD' };
  st.field[st.tab] = f;
  st.fresh = true;
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

// 月ごと（年ごと）に分けて足す
function breakdownSection(p, q, expected, title) {
  const box = el('div');
  const rows = D.breakdown(p, q);
  for (const r of rows) box.append(line(`${r.label}：${D.daysText(r.days)}`));
  const sum = rows.reduce((t, r) => t + r.days, 0);
  const ok = sum === expected;
  box.append(checked(rows.length > 1 ? `${rows.map((r) => F.groupInt(String(r.days))).join(' ＋ ')} ＝ ${D.daysText(sum)}` : `${D.daysText(sum)}`, ok));
  box.append(el('p', 'hint', '始めの日の次の日から、終わりの日までを数えています（うるう年の2月は29日）。'));
  return { node: section(title, box), ok };
}

function openDateCheck() {
  const out = st.tab === 'count' ? countResult() : st.tab === 'add' ? addResult() : ageResult();
  if (!out.ok) return;
  $('#checkTitle').textContent = '日付の検算';
  const body = $('#checkBody');
  body.replaceChildren();
  let allOk = true;

  if (st.tab === 'count') {
    const a = valueOf('from').z;
    const b = valueOf('to').z;
    const [p, q] = out.n > 0 ? [a, b] : [b, a];
    const abs = Math.abs(out.n);
    const part = breakdownSection(p, q, abs, '1. 月ごとに数えて足す');
    body.append(part.node);
    allOk &&= part.ok;
    const rev = el('div');
    const back = q - abs;
    rev.append(checked(`${D.dateText(q)} − ${D.daysText(abs)} ＝ ${D.dateText(back)}`, back === p));
    const ymd = D.ymdBetween(p, q);
    if (ymd.months >= 1) {
      const z = D.addMonths(p, ymd.months).z + ymd.d;
      rev.append(checked(`${D.dateText(p)} ＋ ${D.ymdText(ymd)} ＝ ${D.dateText(z)}`, z === q));
      allOk &&= z === q;
    }
    allOk &&= back === p;
    body.append(section('2. 逆算', rev));
    const k = D.countKinds(p, q);
    const kinds = el('div');
    kinds.append(checked(`平日 ${g(k.weekday)} ＋ 土日 ${g(k.weekend)} ＋ 祝日 ${g(k.holiday)} ＝ ${D.daysText(k.weekday + k.weekend + k.holiday)}間`, k.weekday + k.weekend + k.holiday === abs + 1));
    allOk &&= k.weekday + k.weekend + k.holiday === abs + 1;
    for (const h of k.holidays) kinds.append(line(`${D.dateWeek(h.z)} ${h.name}`));
    kinds.append(el('p', 'hint', `始めの日と終わりの日もふくめた ${D.daysText(abs + 1)}間です。土日にある祝日は「土日」に入れています。${k.partial ? `祝日は ${D.HOLIDAY_FROM}〜${D.HOLIDAY_TO}年の分だけです。` : ''}`));
    body.append(section('3. 平日・土日・祝日', kinds));
  } else if (st.tab === 'add') {
    const { r, a, n, biz } = out;
    const [p, q] = st.dir > 0 ? [a.z, r.z] : [r.z, a.z];
    const days = q - p;
    if (st.unit === 'd' && biz) {
      const k = D.countKinds(p + 1, q);
      const box = el('div');
      box.append(checked(`${D.dateText(p + 1)}〜${D.dateText(q)} の平日（祝日をのぞく）は ${D.daysText(k.weekday)}`, k.weekday === n));
      allOk &&= k.weekday === n;
      box.append(line(`とばした日：土日 ${g(k.weekend)}日・祝日 ${g(k.holiday)}日`));
      for (const h of k.holidays) box.append(line(`${D.dateWeek(h.z)} ${h.name}`));
      body.append(section('1. 営業日を数える', box));
    } else {
      const expected = st.unit === 'd' ? n : st.unit === 'w' ? n * 7 : days;
      const part = breakdownSection(p, q, expected, `1. 月ごとに数えて足す${st.unit === 'w' ? `（${n}週 ＝ ${D.daysText(n * 7)}）` : ''}`);
      body.append(part.node);
      allOk &&= part.ok;
    }
    const rev = el('div');
    if (st.unit === 'm' || st.unit === 'y') {
      const ymd = D.ymdBetween(p, q);
      const months = st.unit === 'y' ? n * 12 : n;
      const ok = ymd.months === months && ymd.d === 0;
      rev.append(checked(`${D.dateText(p)} から ${D.dateText(q)} まで ＝ ${D.ymdText(ymd)}`, ok));
      if (r.clamped) rev.append(el('p', 'hint', '月末に合わせたので、ちょうど〇か月になる日です。'));
      allOk &&= ok;
    } else {
      const back = st.dir > 0 ? r.z - days : r.z + days;
      rev.append(checked(`${D.dateText(r.z)} ${st.dir > 0 ? '−' : '＋'} ${D.daysText(days)} ＝ ${D.dateText(back)}`, back === a.z));
      allOk &&= back === a.z;
    }
    body.append(section('2. 逆算', rev));
  } else {
    const { r, b, t } = out;
    const by = D.civilFromDays(b.z).y;
    const ty = D.civilFromDays(t.z).y;
    const box = el('div');
    box.append(line(`${ty} − ${by} ＝ ${ty - by}`));
    box.append(line(`${ty}年の誕生日 ${D.dateText(r.thisYear)} は ${r.passed ? 'もう来ている → そのまま' : 'まだ来ていない → 1 ひく'} → ${r.age}歳`));
    body.append(section('1. 満年齢の出し方', box));
    const lo = D.birthdayIn(b.z, by + r.age);
    const hi = D.birthdayIn(b.z, by + r.age + 1);
    const rev = el('div');
    const ok = lo <= t.z && t.z < hi;
    allOk &&= ok;
    rev.append(checked(`${r.age}歳の誕生日 ${D.dateText(lo)} ≦ ${D.dateText(t.z)} ＜ ${r.age + 1}歳の誕生日 ${D.dateText(hi)}`, ok));
    body.append(section('2. 逆算（その年齢の誕生日の間にあるか）', rev));
    const e = D.eraOf(b.z);
    if (e) {
      const wa = el('div');
      const n = by - e.offset;
      wa.append(line(`${by} − ${e.offset} ＝ ${e.name}${n === 1 ? '元' : n}年（${e.name}は ${D.dateText(e.key === 'M' ? D.daysFromCivil(1868, 1, 1) : e.from)} から）`));
      body.append(section('3. 和暦', wa));
    }
    if (r.next !== null) {
      const part = breakdownSection(t.z, r.next, r.toNext, '4. 次の誕生日まで（月ごとに足す）');
      body.append(part.node);
      allOk &&= part.ok;
    }
  }

  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, allOk ? '✓ 別の数え方でも、同じ答えになります' : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active() }
export function initDate(h) {
  hooks = h;
  load();
  $('#dateTabs').addEventListener('click', (event) => {
    const b = event.target.closest('[data-tab]');
    if (!b || b.dataset.tab === st.tab) return;
    st.tab = b.dataset.tab;
    st.fresh = false;
    render();
  });
  $('#dateEntry').addEventListener('click', (event) => {
    const f = event.target.closest('[data-dfield]');
    if (f) choose(f.dataset.dfield);
  });
  $('#btnDateCheck').addEventListener('click', openDateCheck);
  $('#datePicker').addEventListener('change', pickerChanged);
  setupPad($('#dateKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', Enter: 'next', '/': '/', '-': '/', t: 'today' },
  });
}
