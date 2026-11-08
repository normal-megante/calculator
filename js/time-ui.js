// =========================================================
// 時間の画面
//
//   「時間の計算」：数を打って「時間」「分」などを押すと、60進法のまま答えが出る
//       （＝ を押さなくても答えが出る。式をタップすると、そこから直せる）
//   「時給」：時給と、始め・終わり・休憩（または働いた時間）から給料を出す
//
// 計算そのものは time.js（正確な分数で計算するので、誤差は出ない）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as T from './time.js';
import { ROUNDINGS } from './shop.js';
import { $, span, caretFromPoint, toast } from './ui.js';
import { typeKey, el, button, shake, seg as segOf, setField, setupPad } from './form.js';

const STORE_KEY = 'calculator.time';
const num = F.amountText;
const yen = F.yenText;

// 時給の欄
const CLOCK_FIELDS = ['start', 'end'];
const LIMITS = {
  wage: { maxDecimals: 2, maxInt: 6 },
  days: { maxDecimals: 0, maxInt: 3 },
  rest: { maxDecimals: 0, maxInt: 3 },
};
const HINTS = {
  wage: '1時間あたりの金額',
  days: '同じ働き方をした日数（空なら 1日）',
  start: '「9」で 9:00、「930」で 9:30（「:」でもOK）',
  end: '始めより前の時刻なら、次の日（夜勤）として計算',
  rest: '休憩の分（深夜でない時間にとったとして引きます）',
  hours: '「7:30」で 7時間30分（「7.5」でも同じ）',
};
const blankWage = () => ({ wage: '', days: '', how: 'clock', start: '', end: '', rest: '', hours: '' });

const st = {
  tab: 'calc',                  // 'calc' 時間の計算 / 'wage' 時給
  items: [],                    // 時間の式（time.js の部品）
  caret: 0,
  done: false,                  // ＝ を押した直後
  last: null,                   // { items, value, dur } … 最後に ＝ を押した計算
  error: '',
  w: blankWage(),               // 時給の欄（打った文字）
  field: 'wage',                // 数字キーが入る時給の欄
  fresh: false,
  opts: { ...T.DEFAULT_WAGE_OPTS },
};
let hooks = {};
let wage = null; // 時給の計算結果

const reject = (target) => shake(target, hooks.settings());
const seg = (options, current, onPick, ariaLabel) => segOf(options, current, onPick, ariaLabel, hooks.settings());

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
const OK_PARTS = new Set([...'0123456789.:dhms+−×÷()']);
const serItems = (items) => items.map((t) => (T.isAns(t) ? { ref: N.serialize(t.ref), dur: !!t.dur, label: t.label } : t));
function deserItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list) {
    if (typeof t === 'string' && OK_PARTS.has(t)) out.push(t);
    else if (t && typeof t === 'object' && t.ref) {
      out.push({ ref: N.deserialize(t.ref), dur: !!t.dur, label: String(t.label ?? '').slice(0, 30) });
    } else return []; // 読めない部品があれば、式は捨てる
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      tab: st.tab,
      items: serItems(st.items),
      caret: st.caret,
      done: st.done,
      last: st.last && { items: serItems(st.last.items), value: N.serialize(st.last.value), dur: st.last.dur },
      w: st.w,
      field: st.field,
      opts: st.opts,
    }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    st.tab = s.tab === 'wage' ? 'wage' : 'calc';
    st.items = deserItems(s.items);
    st.caret = Math.min(Math.max(0, Number.isInteger(s.caret) ? s.caret : st.items.length), st.items.length);
    if (s.last) {
      const items = deserItems(s.last.items);
      if (items.length) st.last = { items, value: N.deserialize(s.last.value), dur: !!s.last.dur };
    }
    st.done = !!s.done && !!st.last;
    const text = (v) => (typeof v === 'string' && v.length <= 12 && /^[\d.:]*$/.test(v) ? v : '');
    const w = s.w ?? {};
    st.w = {
      wage: text(w.wage), days: text(w.days), how: w.how === 'hours' ? 'hours' : 'clock',
      start: text(w.start), end: text(w.end), rest: text(w.rest), hours: text(w.hours),
    };
    if (['wage', 'days', 'start', 'end', 'rest', 'hours'].includes(s.field)) st.field = s.field;
    st.opts = {
      night: !!s.opts?.night,
      over: !!s.opts?.over,
      mode: ROUNDINGS[s.opts?.mode] ? s.opts.mode : T.DEFAULT_WAGE_OPTS.mode,
    };
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 表示（共通）
// ---------------------------------------------------------
export function showTime() {
  render();
}

function render() {
  for (const b of document.querySelectorAll('#timeTabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === st.tab));
  }
  $('#timeCalcPane').hidden = st.tab !== 'calc';
  $('#wagePane').hidden = st.tab !== 'wage';
  if (st.tab === 'calc') renderCalc();
  else renderWage();
  save();
}

// 文字が欄に入る大きさにする
function fit(elm, maxPx, minPx, wrap = false) {
  elm.style.whiteSpace = 'nowrap';
  let px = maxPx;
  for (; px > minPx; px -= 2) {
    elm.style.fontSize = `${px}px`;
    if (elm.scrollWidth <= elm.clientWidth + 1) break;
  }
  elm.style.fontSize = `${px}px`;
  if (wrap) elm.style.whiteSpace = '';
}

// ---------------------------------------------------------
// 時間の計算：表示
// ---------------------------------------------------------

// 時間の式を container に出す（単位は小さく、省いた単位はうすく）
function renderExpr(container, items, { caret = null, tail = null } = {}) {
  const frag = document.createDocumentFragment();
  const sepBefore = new Set();
  for (let i = 0; i < items.length;) {
    if (!T.isDigit(items[i])) { i++; continue; }
    let end = i;
    while (end < items.length && T.isDigit(items[end])) end++;
    if (items[i - 1] !== '.') {
      for (let p = i + 1; p < end; p++) if ((end - p) % 3 === 0) sepBefore.add(p);
    }
    i = end;
  }
  const ghosts = T.implicitUnits(items);
  let caretShown = false;
  const addCaret = () => {
    frag.append(span('caret', ''));
    caretShown = true;
  };
  items.forEach((t, i) => {
    if (sepBefore.has(i)) frag.append(span('sep', ','));
    if (caret === i && !caretShown) addCaret();
    const e = document.createElement('span');
    e.dataset.i = i;
    if (T.isAns(t)) { e.className = 'tk ref'; e.textContent = t.label; }
    else if (T.isUnit(t)) { e.className = 'tk unit'; e.textContent = T.UNIT_LABEL[t]; }
    else if (T.TIME_OPS.includes(t)) { e.className = 'tk op'; e.textContent = t; }
    else if (t === '(' || t === ')') { e.className = 'tk paren'; e.textContent = t; }
    else { e.className = 'tk'; e.textContent = t; }
    frag.append(e);
    if (ghosts.has(i)) {
      if (caret === i + 1 && !caretShown) addCaret(); // カーソルは、うすい単位の前に
      frag.append(span('ghost unit', T.UNIT_LABEL[ghosts.get(i)]));
    }
  });
  if (caret === items.length && !caretShown) addCaret();
  const open = T.openParens(items);
  if (caret !== null && open > 0) frag.append(span('ghost', ')'.repeat(open)));
  if (tail) frag.append(tail);
  container.replaceChildren(frag);
}

// 答えの欄と、その下の形（2:15 ・ 2.25時間 ・ 135分）
function showValue(value, dur, maxPx, minPx, notes) {
  const resultEl = $('#timeResult');
  resultEl.classList.remove('error');
  if (dur) {
    resultEl.textContent = T.durText(value);
    $('#timeForms').textContent = [T.clockText(value), T.hoursText(value), T.minutesText(value)].join(' ・ ');
    if (N.cmp(N.absNum(value), N.frac(86400n)) >= 0) notes.push(`＝ ${T.durText(value, { days: true })}`);
  } else {
    resultEl.textContent = T.scalarText(value);
    $('#timeForms').textContent = '時間 ÷ 時間 は「何回分（何倍）」の数になります';
  }
  fit(resultEl, maxPx, minPx);
}

function setNotes(lines) {
  $('#timeNotes').replaceChildren(...lines.map((line) => el('p', '', line)));
}

function renderCalc() {
  const exprEl = $('#timeExpr');
  const resultEl = $('#timeResult');
  const notes = [];
  $('#timeDisplay').classList.toggle('done', st.done);
  $('#timeActions').hidden = !st.done;
  $('#timeForms').textContent = '';

  if (st.done) {
    renderExpr(exprEl, st.last.items, { tail: span('eq-sign', ' =') });
    fit(exprEl, 24, 16, true);
    showValue(st.last.value, st.last.dur, 44, 22, notes);
    $('#btnTimeToWage').hidden = !(st.last.dur && N.sign(st.last.value) > 0);
    $('#btnTimeToCalc').textContent = st.last.dur ? `電卓で使う（${T.hoursText(st.last.value)}）` : '電卓で使う';
  } else {
    if (st.items.length === 0) exprEl.replaceChildren(span('placeholder', '0'), span('caret', ''));
    else renderExpr(exprEl, st.items, { caret: st.caret });
    fit(exprEl, 40, 24, true);
    resultEl.style.fontSize = '';
    resultEl.classList.remove('error');
    resultEl.textContent = '';
    if (st.error) {
      resultEl.classList.add('error');
      resultEl.textContent = st.error;
    } else if (!st.items.length) {
      notes.push('数を打って「時間」「分」を押します（例：1時間30分 ＋ 45分）', '「:」で 9:30 のようにも打てます');
    } else {
      const p = T.previewTime(st.items);
      if (p?.error) {
        resultEl.classList.add('error');
        resultEl.textContent = p.error;
      } else if (p && (p.dur || !p.single)) {
        showValue(p.value, p.dur, 30, 18, notes);
      } else if (p?.single) {
        notes.push('数のあとに「時間」「分」などを押すと、時間になります');
      }
    }
    exprEl.querySelector('.caret')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  setNotes(notes);
}

// ---------------------------------------------------------
// 時間の計算：キー
// ---------------------------------------------------------
const ansItem = (last) => ({
  ref: last.value,
  dur: last.dur,
  label: last.dur ? T.durText(last.value) : T.scalarText(last.value),
});

function startEditing(items, caret = items.length) {
  st.done = false;
  st.items = items;
  st.caret = caret;
  st.error = '';
}

function pressCalc(key, target) {
  if (key === '=') return equals(target);
  if (st.done) {
    if (T.isDigit(key) || ['.', ':', '('].includes(key)) {
      startEditing([]); // 新しい式
    } else if (T.TIME_OPS.includes(key)) {
      startEditing([ansItem(st.last)]); // 答えの続きから
    } else if (key === 'clear') {
      startEditing([]);
      return render();
    } else if (['back', 'left', 'right'].includes(key)) {
      startEditing([...st.last.items]); // さっきの式に戻って直す
      if (key === 'left') st.caret = Math.max(0, st.caret - 1);
      return render();
    } else {
      return reject(target);
    }
  }
  const next = T.pressTime({ items: st.items, caret: st.caret }, key);
  if (!next) return reject(target);
  st.items = next.items;
  st.caret = next.caret;
  st.error = '';
  render();
}

function equals(target) {
  if (st.done) return;
  if (!st.items.length) return reject(target);
  try {
    const r = T.evaluateTime(st.items);
    if (!r.dur && !r.steps.length && !r.literals[0]?.ans) {
      st.error = '数のあとに「時間」「分」などを押してください';
      reject(target);
      return render();
    }
    const items = T.closeParens(st.items);
    st.last = { items, value: r.value, dur: r.dur };
    st.done = true;
    st.error = '';
    // 履歴には「時間の数」の式で残す（2時間15分 → 2.25）。名前は 2時間15分
    hooks.onSaveHistory(T.toCalcItems(items), r.dur ? T.toHours(r.value) : r.value, {
      kind: '時間',
      name: r.dur ? T.durText(r.value) : '',
    });
    render();
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    st.error = error.kind === 'math' ? error.message : `式が途中か、形がちがいます：${error.message}`;
    reject(target);
    render();
  }
}

// 答えを電卓で使う（時間なら「時間の数」で）
function useAnswerInCalc() {
  if (!st.done) return;
  const { value, dur } = st.last;
  hooks.onUseInCalc(dur ? T.toHours(value) : value, dur ? T.durText(value) : undefined);
  toast(dur ? `${T.durText(value)} を「${T.hoursText(value)}」として電卓の式に入れました` : '答えを電卓の式に入れました');
}

// 答えを時給の「働いた時間」に入れる
function useAnswerInWage() {
  if (!st.done || !st.last.dur) return;
  const p = T.splitDuration(st.last.value);
  if (!p || !N.isZero(p.s)) {
    toast('秒のある時間は、時給では使えません');
    return;
  }
  if (p.h > 999n) {
    toast('時間が長すぎます');
    return;
  }
  st.w.how = 'hours';
  st.w.hours = `${p.h}:${String(p.m).padStart(2, '0')}`;
  st.tab = 'wage';
  st.field = 'wage';
  st.fresh = !!st.w.wage;
  render();
  toast(`働いた時間に ${T.durText(st.last.value)} を入れました`);
}

// ---------------------------------------------------------
// 時間の計算：検算（単位をそろえる → 計算 → 60進法にもどす → 逆算）
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
const isWholeMinutes = (sec) => sec.q && (sec.n % 60n === 0n) && sec.d === 1n;
const valText = (x) => (x.dur ? T.durText(x.v) : T.scalarText(x.v));
const opText = (op) => (op === '+' ? '＋' : op);

function openTimeCheck() {
  if (!st.done) return;
  let r;
  try {
    r = T.evaluateTime(st.last.items);
  } catch {
    return;
  }
  const durLits = r.literals.filter((t) => t.dur);
  const durValues = [...durLits.map((t) => t.value), ...r.steps.flatMap((s) => [s.a, s.b, s.r].filter((x) => x.dur).map((x) => x.v))];
  if (r.dur) durValues.push(r.value);
  const base = durValues.every(isWholeMinutes) ? 60n : 1n;
  const unitName = base === 60n ? '分' : '秒';
  const inBase = (sec) => (base === 60n ? T.minutesText(sec) : T.secondsText(sec));
  const baseVal = (x) => (x.dur ? inBase(x.v) : T.scalarText(x.v));

  $('#checkTitle').textContent = '時間の検算';
  const body = $('#checkBody');
  body.replaceChildren();

  // 1. 単位をそろえる
  const conv = el('div');
  for (const t of durLits) {
    if (t.ans) {
      conv.append(line(`前の答え ${t.ans.label} ＝ ${inBase(t.value)}`));
      continue;
    }
    const terms = t.pieces.map((p) => {
      const n = F.groupNumberText(p.num);
      const u = T.UNIT_SEC[p.unit];
      if (u === base) return n;
      return u > base ? `${n}×${F.groupInt((u / base).toString())}` : `${n}÷${F.groupInt((base / u).toString())}`;
    });
    const name = T.literalText(t);
    if (terms.length === 1 && T.UNIT_SEC[t.pieces[0].unit] === base) conv.append(line(`${name}（そのまま）`));
    else conv.append(line(`${name} ＝ ${terms.join(' ＋ ')} ＝ ${inBase(t.value)}`));
  }
  const factors = base === 60n ? '1時間 ＝ 60分、1日 ＝ 1,440分' : '1分 ＝ 60秒、1時間 ＝ 3,600秒';
  conv.append(el('p', 'hint', `${factors} で、全部を「${unitName}」にそろえます。`));
  body.append(section(`1. 単位をそろえる（${unitName}になおす）`, conv));

  // 2. 計算
  if (r.steps.length) {
    const calc = el('div');
    for (const s of r.steps) calc.append(line(`${baseVal(s.a)} ${opText(s.op)} ${baseVal(s.b)} ＝ ${baseVal(s.r)}`));
    body.append(section(`2. ${unitName}のまま計算`, calc));
  }

  // 3. 60進法にもどす
  if (r.dur) {
    const back = el('div');
    const p = T.splitDuration(r.value);
    const sign = p?.neg ? '−' : '';
    if (p && base === 60n) {
      const total = N.absNum(N.div(r.value, N.frac(60n)));
      if (N.cmp(total, N.frac(60n)) >= 0) {
        back.append(line(`${sign}${num(total)}分 ÷ 60 ＝ ${num(N.frac(p.h))} あまり ${num(N.frac(p.m))} → ${T.durText(r.value)}`));
      } else back.append(line(`${T.durText(r.value)}（60分より短いので、そのまま）`));
    } else if (p) {
      const totalSec = N.absNum(r.value);
      const mins = p.h * 60n + p.m;
      back.append(line(`${sign}${num(totalSec)}秒 ÷ 60 ＝ ${num(N.frac(mins))} あまり ${T.decimalText(p.s, 3).text}秒`));
      if (mins >= 60n) back.append(line(`${num(N.frac(mins))}分 ÷ 60 ＝ ${num(N.frac(p.h))} あまり ${num(N.frac(p.m))}分`));
      back.append(line(`→ ${T.durText(r.value)}`));
    }
    back.append(line(`＝ ${T.clockText(r.value)}（時:分）＝ ${T.hoursText(r.value)}`));
    body.append(section('3. 60進法にもどす', back));
  }

  // 4. 逆算
  let allOk = true;
  if (r.steps.length) {
    const rev = el('div');
    const UNDO = { '+': '−', '−': '+', '×': '÷', '÷': '×' };
    for (const s of r.steps) {
      if (s.op === '×' && N.isZero(s.b.v)) {
        rev.append(line(`0 をかけているので、逆算はできません（${valText(s.a)} × 0）`));
        continue;
      }
      let back;
      try {
        back = T.combine(UNDO[s.op], s.r, s.b);
      } catch {
        continue;
      }
      const ok = back.dur === s.a.dur && N.cmp(back.v, s.a.v) === 0;
      if (!ok) allOk = false;
      rev.append(checked(`${valText(s.r)} ${opText(UNDO[s.op])} ${valText(s.b)} ＝ ${valText(back)}`, ok));
    }
    body.append(section('4. 逆算（逆の計算で、もとの数にもどるか）', rev));
  }

  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, !r.steps.length
    ? `✓ ${T.durText(r.value)} ＝ ${inBase(r.value)}`
    : allOk ? '✓ 逆の計算で、もとの数にもどります' : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// 時給：表示
// ---------------------------------------------------------
const wageFields = () => (st.w.how === 'clock' ? ['wage', 'start', 'end', 'rest', 'days'] : ['wage', 'hours', 'days']);

// 欄に出す文字（時刻は、打っていないときは 9:30 の形に）
function fieldShown(f) {
  const text = st.w[f];
  if (!text) return null;
  if (CLOCK_FIELDS.includes(f) && st.field !== f) {
    const c = T.clockMinutes(text);
    if (c.min !== null && c.min !== undefined) return T.clockLabel(c.min, { next: true });
  }
  if (CLOCK_FIELDS.includes(f) || f === 'hours') return text;
  return null; // ふつうの数（カンマ付き）
}

function renderWage() {
  wage = T.wageOf(st.w, st.opts);
  const r = wage;

  // 上：給料
  const total = $('#wageTotal');
  total.textContent = r.ok ? yen(r.pay) : '0円';
  total.classList.toggle('muted', !r.ok);
  $('#wageCount').textContent = r.ok && N.cmp(r.days, N.ONE) !== 0 ? `${num(r.days)}日分` : '';
  if (r.ok) {
    const worked = N.mul(r.worked, N.frac(60n));
    const d = T.durText(worked);
    const h = T.hoursText(worked);
    $('#wageSub').textContent = `働いた時間 ${d}${d === h ? '' : `（${h}）`}`;
  } else {
    $('#wageSub').textContent = r.error;
  }
  renderWageRows(r);

  // 欄
  $('#wageClockFields').hidden = st.w.how !== 'clock';
  $('#wageHoursFields').hidden = st.w.how !== 'hours';
  if (!wageFields().includes(st.field)) st.field = 'wage';
  const placeholders = { wage: '0', days: '1', start: '--:--', end: '--:--', rest: '0', hours: '0:00' };
  for (const f of ['wage', 'days', 'start', 'end', 'rest', 'hours']) {
    setField(document.querySelector(`[data-wfield="${f}"]`), {
      text: st.w[f], placeholder: placeholders[f], active: st.field === f, fresh: st.fresh, shown: fieldShown(f),
    });
  }

  // 欄の下のえらぶボタン
  const opts = $('#wageOpts');
  opts.replaceChildren(seg(Object.entries(T.HOW), st.w.how, (v) => {
    st.w.how = v;
    st.field = v === 'clock' ? 'start' : 'hours';
    st.fresh = !!st.w[st.field];
    render();
  }, '働いた時間の打ち方'));
  const chip = (key, text) => {
    const b = button('chip', text, () => {
      st.opts = { ...st.opts, [key]: !st.opts[key] };
      render();
    });
    b.setAttribute('aria-pressed', String(!!st.opts[key]));
    opts.append(b);
  };
  if (st.w.how === 'clock') chip('night', '深夜 25%増');
  chip('over', '残業 25%増');

  // ヒントと、働いた時間
  const c = CLOCK_FIELDS.includes(st.field) ? T.clockMinutes(st.w[st.field]) : null;
  $('#wageHint').textContent = c?.error ?? HINTS[st.field];
  $('#wageAmount').textContent = r.worked && N.sign(r.worked) > 0 ? T.durText(N.mul(r.worked, N.frac(60n))) : '';
}

function wRow(label, amount, className = 'w-row') {
  const li = el('li', className);
  li.append(el('span', '', label));
  if (amount) li.append(el('b', '', amount));
  return li;
}

function renderWageRows(r) {
  const list = $('#wageRows');
  list.replaceChildren();
  if (r.how === 'clock' && r.span) {
    const restText = r.rest ? ` − 休憩 ${r.rest}分` : '';
    list.append(wRow(`${T.clockLabel(r.start, { next: false })}〜${T.clockLabel(r.end)}${restText}`, T.durText(N.frac(BigInt((r.span - r.rest) * 60)))));
  }
  if (!r.rows.length || N.isZero(r.wage ?? N.ZERO)) {
    if (!r.ok) list.append(wRow('時給と、働いた時間を打つと、ここに内訳が出ます', '', 'w-row muted'));
    return;
  }
  for (const row of r.rows) {
    const rate = N.cmp(row.rate, N.ONE) === 0 ? '' : `（${num(N.mul(row.rate, N.frac(100n)))}%）`;
    list.append(wRow(`${row.label} ${T.durText(N.mul(row.min, N.frac(60n)))} × ${yen(N.mul(r.wage, row.rate))}${rate}`, yen(row.amount)));
  }
  if (!r.ok) return;
  if (N.cmp(r.days, N.ONE) !== 0) list.append(wRow(`1日 ${yen(r.perDay)} × ${num(r.days)}日`, yen(r.exact)));
  if (N.cmp(r.exact, r.pay) !== 0) list.append(wRow(`1円未満を${ROUNDINGS[st.opts.mode]}`, yen(r.pay)));
  if (r.restFromNight > 0) {
    list.append(wRow(`休憩のうち ${r.restFromNight}分は、深夜の時間から引いています`, '', 'w-row muted'));
  }
  if (r.overnight) list.append(wRow('終わりが始めより前なので、次の日の時刻として計算しています', '', 'w-row muted'));
}

// ---------------------------------------------------------
// 時給：キー
// ---------------------------------------------------------
function chooseField(f, again = false) {
  if (st.field === f && !again) st.fresh = false;
  else {
    st.field = f;
    st.fresh = !!st.w[f];
  }
  render();
}

function goNext() {
  const list = wageFields();
  chooseField(list[(list.indexOf(st.field) + 1) % list.length]);
}

function pressWage(key, target) {
  if (key === 'next') return goNext();
  const f = st.field;
  let next;
  if (CLOCK_FIELDS.includes(f)) next = T.typeClock(st.w[f], key, { fresh: st.fresh });
  else if (f === 'hours') next = T.typeClock(st.w[f], key, { fresh: st.fresh, maxHead: 3, decimals: true });
  else next = key === ':' ? null : typeKey(st.w[f], key, { fresh: st.fresh, ...LIMITS[f] });
  if (next === null) return reject(target);
  st.w[f] = next;
  st.fresh = false;
  render();
}

// ---------------------------------------------------------
// 時給：使い道・端数（⋯）と検算
// ---------------------------------------------------------
function openWageMore() {
  const r = wage;
  $('#wageMorePay').textContent = r?.ok ? `給料 ${yen(r.pay)} を` : '給料を';
  const box = $('#wageModeChips');
  box.replaceChildren(...Object.entries(ROUNDINGS).map(([value, text]) => {
    const b = button('chip', text, () => {
      st.opts = { ...st.opts, mode: value };
      render();
      openWageMore(); // えらんだ印を付け直す
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(st.opts.mode === value));
    return b;
  }));
  const dialog = $('#wageMoreDialog');
  if (!dialog.open) dialog.showModal();
}

function wageToCalc() {
  if (!wage?.ok) return toast(wage?.error ?? '時給を打ってください');
  $('#wageMoreDialog').close();
  hooks.onUseInCalc(wage.pay, '給料');
  toast('給料を電卓の式に入れました');
}

function wageToHistory() {
  if (!wage?.ok) return toast(wage.error);
  const rounded = N.cmp(wage.exact, wage.pay) !== 0;
  hooks.onSaveHistory(T.wageCalcItems(wage), wage.exact, {
    kind: '時給',
    name: rounded ? `給料 ${yen(wage.pay)}（1円未満を${ROUNDINGS[st.opts.mode]}）` : '',
  });
  $('#wageMoreDialog').close();
  toast('履歴に残しました');
}

function clearWage() {
  const before = JSON.parse(JSON.stringify(st.w));
  st.w = { ...blankWage(), how: st.w.how };
  st.field = 'wage';
  st.fresh = false;
  $('#wageMoreDialog').close();
  render();
  toast('時給の欄を消しました', {
    label: '元に戻す',
    run: () => {
      st.w = before;
      render();
    },
  });
}

function openWageCheck() {
  const r = wage;
  if (!r?.ok) {
    toast(r?.error ?? '時給を打ってください');
    return;
  }
  $('#checkTitle').textContent = '時給の検算';
  const body = $('#checkBody');
  body.replaceChildren();
  const sec = (min) => N.mul(min, N.frac(60n));
  const hoursNum = (min) => N.div(min, N.frac(60n));
  let allOk = true;

  // 1. 働いた時間
  const time = el('div');
  if (r.how === 'clock') {
    const endText = r.overnight || r.end >= 1440
      ? `${T.clockLabel(r.end)}（${T.clockLabel(r.end, { next: false })}）`
      : T.clockLabel(r.end);
    time.append(line(`終わり ${endText} − 始め ${T.clockLabel(r.start, { next: false })} ＝ ${T.durText(N.frac(BigInt(r.span * 60)))}`));
    if (r.rest) time.append(line(`− 休憩 ${r.rest}分 ＝ ${T.durText(sec(r.worked))}`));
  } else {
    time.append(line(`働いた時間 ${st.w.hours} ＝ ${T.durText(sec(r.worked))}`));
  }
  const p = T.splitDuration(sec(r.worked));
  if (p && !N.isZero(N.frac(p.m))) {
    time.append(line(`${T.durText(sec(r.worked))} ＝ ${num(N.frac(p.h))} ＋ ${num(N.frac(p.m))}÷60 ＝ ${T.hoursText(sec(r.worked))}`));
  }
  body.append(section('1. 働いた時間（60進法 → 時間の数）', time));

  // 2. 給料
  const pay = el('div');
  for (const row of r.rows) {
    const rate = N.cmp(row.rate, N.ONE) === 0 ? '' : ` × ${num(row.rate)}`;
    pay.append(line(`${row.label}：${num(r.wage)}${rate} × ${num(hoursNum(row.min))}時間 ＝ ${yen(row.amount)}`));
  }
  if (r.rows.length > 1) pay.append(line(`1日：${r.rows.map((x) => num(x.amount)).join(' ＋ ')} ＝ ${yen(r.perDay)}`));
  if (N.cmp(r.days, N.ONE) !== 0) pay.append(line(`${num(r.perDay)} × ${num(r.days)}日 ＝ ${yen(r.exact)}`));
  if (N.cmp(r.exact, r.pay) !== 0) pay.append(line(`1円未満を${ROUNDINGS[st.opts.mode]} → ${yen(r.pay)}`));
  body.append(section('2. 給料', pay));

  // 3. 逆算
  const rev = el('div');
  const back = N.div(N.div(r.exact, r.days), r.weighted);
  const wageOk = N.cmp(back, r.wage) === 0;
  allOk &&= wageOk;
  const weightedText = r.rows.length > 1 || N.cmp(r.rows[0].rate, N.ONE) !== 0
    ? `割増を入れた時間 ${r.rows.map((x) => (N.cmp(x.rate, N.ONE) === 0 ? num(hoursNum(x.min)) : `${num(x.rate)}×${num(hoursNum(x.min))}`)).join(' ＋ ')} ＝ ${num(r.weighted)}`
    : `${num(r.weighted)}時間`;
  if (N.cmp(r.days, N.ONE) !== 0) {
    rev.append(checked(`${num(r.exact)} ÷ ${num(r.days)}日 ＝ ${yen(N.div(r.exact, r.days))}`, N.cmp(N.div(r.exact, r.days), r.perDay) === 0));
  }
  rev.append(checked(`${num(r.perDay)} ÷ ${num(r.weighted)} ＝ ${yen(back)}（時給）`, wageOk));
  rev.append(el('p', 'hint', weightedText));
  if (r.how === 'clock') {
    // 始め ＋ 働いた時間 ＋ 休憩 ＝ 終わり（60進法のたし算で、終わりの時刻にもどるか）
    const end = N.add(N.frac(BigInt(r.start + r.rest)), r.worked);
    const ok = N.cmp(end, N.frac(BigInt(r.end))) === 0;
    allOk &&= ok;
    const endText = end.d === 1n ? T.clockLabel(Number(end.n)) : `${num(end)}分`;
    rev.append(checked(`始め ${T.clockLabel(r.start, { next: false })} ＋ ${T.durText(sec(r.worked))}${r.rest ? ` ＋ 休憩 ${r.rest}分` : ''} ＝ ${endText}（終わり）`, ok));
  }
  body.append(section('3. 逆算（給料 ÷ 時間 で時給にもどるか）', rev));

  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, allOk
    ? `✓ 給料 ÷ 時間 で、時給 ${yen(r.wage)} にもどります`
    : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onSaveHistory(items, value, meta), onUseInCalc(value, label) }
export function initTime(h) {
  hooks = h;
  load();

  $('#timeTabs').addEventListener('click', (event) => {
    const b = event.target.closest('[data-tab]');
    if (!b || b.dataset.tab === st.tab) return;
    st.tab = b.dataset.tab;
    render();
  });

  // 時間の計算
  $('#timeExprWrap').addEventListener('click', (event) => {
    const exprEl = $('#timeExpr');
    if (st.done) {
      const items = [...st.last.items];
      startEditing(items, caretFromPoint(exprEl, event.clientX, event.clientY, items.length));
    } else {
      st.caret = caretFromPoint(exprEl, event.clientX, event.clientY, st.items.length);
    }
    render();
  });
  $('#btnTimeCheck').addEventListener('click', openTimeCheck);
  $('#btnTimeToCalc').addEventListener('click', useAnswerInCalc);
  $('#btnTimeToWage').addEventListener('click', useAnswerInWage);
  setupPad($('#timeKeys'), {
    press: pressCalc,
    settings: hooks.settings,
    active: () => hooks.active() && st.tab === 'calc',
    keymap: {
      Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear',
      ArrowLeft: 'left', ArrowRight: 'right', '*': '×', '/': '÷', '-': '−', '+': '+',
      '(': '(', ')': ')', '.': '.', ':': ':', d: 'd', h: 'h', m: 'm', s: 's',
    },
  });
  window.addEventListener('resize', () => {
    if (hooks.active() && st.tab === 'calc') renderCalc();
  });

  // 時給
  $('#wageEntry').addEventListener('click', (event) => {
    const f = event.target.closest('[data-wfield]');
    if (f) chooseField(f.dataset.wfield);
  });
  $('#btnWageCheck').addEventListener('click', openWageCheck);
  $('#btnWageMore').addEventListener('click', openWageMore);
  $('#wageToCalc').addEventListener('click', wageToCalc);
  $('#wageToHistory').addEventListener('click', wageToHistory);
  $('#wageClear').addEventListener('click', clearWage);
  setupPad($('#wageKeys'), {
    press: pressWage,
    settings: hooks.settings,
    active: () => hooks.active() && st.tab === 'wage',
    keymap: { Backspace: 'back', Escape: 'clear', Delete: 'clear', Enter: 'next', '.': '.', ':': ':' },
  });
}
