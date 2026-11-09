// =========================================================
// n進法の画面
//
//   上で「打つ数の進法」（2進・8進・10進・16進・n進）をえらんで、数や式を打つと、
//   答えを 2進・8進・10進・16進（と n進）で同時に出す（＝ を押さなくても出る。＝ で履歴に残る）
//   「✓ 検算」：位ごとに10進へ → 10進で計算（ビットの表も）→ 割ったあまりで n進法へ → 逆算
//
// 計算そのものは base.js（正確な分数で計算するので、誤差は出ない）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as B from './base.js';
import { $, span, caretFromPoint, toast } from './ui.js';
import { el, button, shake, setupPad } from './form.js';

const STORE_KEY = 'calculator.base';
const FRAC_SHOW = 64;  // 小数は、この桁まで出す
const INT_SHOW = 120;  // 整数の部分がこれより長ければ、まん中を「…」に

const st = {
  base: 10,      // 打つ数の進法
  other: 3,      // 「n進」でえらんだ進法
  items: [],
  caret: 0,
  done: false,   // ＝ を押した直後
  last: null,    // { items, value, notes } … 最後に ＝ を押した計算
  error: '',
};
let hooks = {};
let shown = null; // いま答えに出している数

const reject = (target) => shake(target, hooks.settings());

const NOTE_TEXT = {
  order: '計算の順番：× ÷ mod → ＋ − → << >> → AND → XOR → OR（先にしたい所は ( ) で）',
  not: 'NOT x ＝ −x − 1（ビットを全部ひっくり返すと、左にずっと続く 0 も 1 になるので、マイナスの数になります）',
  shiftLost: '>> で右にはみ出たビットは捨てます（÷2ⁿ の小数を切り捨て）',
  div: '÷ は小数まで出します（整数の割り算のあまりは mod）',
  modSign: 'マイナスのある mod の答えは、割る数と同じ向きです（−7 mod 3 ＝ 2）',
};

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
const OK_STR = new Set([...B.BIN_OPS, 'not', '(', ')']);
const okBase = (b) => Number.isInteger(b) && b >= 2 && b <= 16;
const serItems = (items) => items.map((t) => (B.isAns(t) ? { ref: N.serialize(t.ref), label: t.label } : t));
function deserItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list) {
    if (typeof t === 'string' && OK_STR.has(t)) out.push(t);
    else if (t && typeof t === 'object' && typeof t.d === 'string' && okBase(t.b)
      && (t.d === '.' || (B.isDigitKey(t.d) && B.digitOf(t.d) < t.b))) out.push({ d: t.d, b: t.b });
    else if (t && typeof t === 'object' && t.ref) out.push({ ref: N.deserialize(t.ref), label: String(t.label ?? '').slice(0, 40) });
    else return []; // 読めない部品があれば、式は捨てる
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      base: st.base,
      other: st.other,
      items: serItems(st.items),
      caret: st.caret,
      done: st.done,
      last: st.last && { items: serItems(st.last.items), value: N.serialize(st.last.value) },
    }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (okBase(s.base)) st.base = s.base;
    if (B.OTHER_BASES.includes(s.other)) st.other = s.other;
    st.items = deserItems(s.items);
    st.caret = Math.min(Math.max(0, Number.isInteger(s.caret) ? s.caret : st.items.length), st.items.length);
    if (s.last) {
      const items = deserItems(s.last.items);
      if (items.length) {
        const r = B.evaluate(items);
        st.last = { items, value: r.value, notes: r.notes };
      }
    }
    st.done = !!s.done && !!st.last;
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
export function showBase() {
  render();
}

function render() {
  const isOther = !B.MAIN_BASES.includes(st.base);
  for (const b of document.querySelectorAll('#bsTabs [data-base]')) {
    const v = b.dataset.base;
    b.setAttribute('aria-selected', String(v === 'n' ? isOther : Number(v) === st.base));
  }
  $('#bsOther').hidden = !isOther;
  $('#bsOtherName').textContent = `${st.other}進`;
  $('#bsOtherDigits').textContent = `数字は 0〜${B.DIGITS[st.other - 1]}`;
  // その進法で使えない数字のキーは、うすく
  for (const k of document.querySelectorAll('#bsKeys [data-k]')) {
    if (B.isDigitKey(k.dataset.k)) k.classList.toggle('bs-off', B.digitOf(k.dataset.k) >= st.base);
  }
  renderDisplay();
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

// 式を container に出す（数は進法ごとに区切り、いまの進法とちがう数には小さく ₁₆ などを付ける）
function renderExpr(container, items, { caret = null, tail = null } = {}) {
  const frag = document.createDocumentFragment();
  let caretShown = false;
  const addCaret = () => {
    frag.append(span('caret', ''));
    caretShown = true;
  };
  for (let i = 0; i < items.length;) {
    const t = items[i];
    if (B.isPart(t)) {
      let end = i;
      while (end < items.length && B.isPart(items[end]) && items[end].b === t.b) end++;
      const text = items.slice(i, end).map((p) => p.d).join('');
      const point = text.includes('.') ? text.indexOf('.') : text.length;
      const g = B.groupSize(t.b);
      for (let p = i; p < end; p++) {
        const k = p - i;
        if (k > 0 && k < point && (point - k) % g === 0) frag.append(t.b === 10 ? span('sep', ',') : span('sep gap', ''));
        if (caret === p && !caretShown) addCaret();
        const e = span('tk', items[p].d);
        e.dataset.i = p;
        frag.append(e);
      }
      if (t.b !== st.base) frag.append(span('bsub', B.subText(t.b)));
      i = end;
      continue;
    }
    if (caret === i && !caretShown) addCaret();
    const e = document.createElement('span');
    e.dataset.i = i;
    if (B.isAns(t)) {
      e.className = 'tk ref';
      e.textContent = t.label;
    } else if (t === '(' || t === ')') {
      e.className = 'tk paren';
      e.textContent = t;
    } else {
      e.className = /^[a-z]/.test(t) ? 'tk op word' : 'tk op';
      e.textContent = B.OP_TEXT[t] ?? t;
    }
    frag.append(e);
    i++;
  }
  if (caret === items.length && !caretShown) addCaret();
  const open = B.openParens(items);
  if (caret !== null && open > 0) frag.append(span('ghost', ')'.repeat(open)));
  if (tail) frag.append(tail);
  container.replaceChildren(frag);
}

// toBase の結果 → HTML（区切りのすき間、くり返しの所に上の線、長すぎる整数は まん中を「…」）
function digitsHtml(t, base) {
  let int;
  if (t.int.length > INT_SHOW) int = `${t.int.slice(0, 40)}<span class="bs-cut">…</span>${t.int.slice(-20)}`;
  else int = B.groups(t.int, base).join(base === 10 ? ',' : '<span class="bs-gap"></span>');
  let html = (t.neg ? '−' : '') + int;
  if (t.frac || t.rep) html += `.${t.frac}${t.rep ? `<span class="bs-rep">${t.rep}</span>` : ''}`;
  if (t.cut) html += '…';
  return html;
}

// 進法の小さい字（10進は付けない）
const subHtml = (base) => (base === 10 ? '' : `<span class="bs-sub">${B.subText(base)}</span>`);

// 答えをいまの進法で、短い文字に（「答え」の部品・履歴の名前・電卓で使うときの名前）
function shortLabel(x, base = st.base) {
  const t = B.toBase(x, base, 16);
  const text = B.formText(t, base, '');
  if (t.cut || text.length > 18) return null;
  return text + (base === 10 ? '' : B.subText(base));
}

function setNotes(lines) {
  $('#bsNotes').replaceChildren(...lines.map((line) => el('p', '', line)));
}

function showAnswer(x, maxPx, minPx, notes, engineNotes) {
  shown = x;
  const resultEl = $('#bsResult');
  const t = B.toBase(x, st.base, FRAC_SHOW);
  resultEl.classList.remove('bs-wrap');
  resultEl.innerHTML = digitsHtml(t, st.base) + subHtml(st.base);
  fit(resultEl, maxPx, minPx);
  // 小さくしても入らなければ、折り返す
  resultEl.classList.toggle('bs-wrap', resultEl.scrollWidth > resultEl.clientWidth + 1);
  for (const n of engineNotes) notes.push(NOTE_TEXT[n.kind]);
  if (t.rep) notes.push('上に線のある数字は、ずっとくり返します');
  if (t.cut) notes.push(B.terminates(x, st.base) ? '小数が長いので、とちゅうまで出しています' : 'くり返しがとても長いので、とちゅうまで出しています');
  if (t.int.length > INT_SHOW) notes.push(`${t.int.length}桁あるので、まん中を「…」で省いています（下の表をタップでコピーすると全部）`);
}

function renderDisplay() {
  const exprEl = $('#bsExpr');
  const resultEl = $('#bsResult');
  const notes = [];
  $('#bsDisplay').classList.toggle('done', st.done);
  $('#bsActions').hidden = !st.done;
  shown = null;
  resultEl.classList.remove('error', 'bs-wrap');
  resultEl.style.fontSize = '';
  resultEl.textContent = '';

  if (st.done) {
    renderExpr(exprEl, st.last.items, { tail: span('eq-sign', ' =') });
    fit(exprEl, 24, 16, true);
    showAnswer(st.last.value, 44, 20, notes, st.last.notes);
  } else {
    if (st.items.length === 0) exprEl.replaceChildren(span('placeholder', '0'), span('caret', ''));
    else renderExpr(exprEl, st.items, { caret: st.caret });
    fit(exprEl, 40, 22, true);
    if (st.error) {
      resultEl.classList.add('error');
      resultEl.textContent = st.error;
    } else if (!st.items.length) {
      notes.push('上で「打つ数の進法」をえらんで、数や式を打ちます');
    } else {
      const p = B.preview(st.items);
      if (p?.error) {
        resultEl.classList.add('error');
        resultEl.textContent = p.error;
      } else if (p) {
        showAnswer(p.value, 30, 18, notes, p.notes);
      }
    }
    exprEl.querySelector('.caret')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  setNotes(notes);
  renderRows();
}

// 答えを 2進・8進・10進・16進（と n進）で並べる。タップでコピー
function renderRows() {
  const box = $('#bsRows');
  const x = shown;
  if (!x) {
    box.replaceChildren(el('p', 'bs-head', '数を打つと、ここに 2進・8進・10進・16進 で同時に出ます'));
    return;
  }
  const bases = B.MAIN_BASES.includes(st.base) ? B.MAIN_BASES : [...B.MAIN_BASES, st.base];
  const rows = bases.map((base) => {
    const t = B.toBase(x, base, FRAC_SHOW);
    const row = button(`bs-row${base === st.base ? ' from' : ''}`, '', () => copyText(B.formText(t, base, ''), `${base}進の答え`));
    const name = el('span', 'bs-name', `${base}進`);
    if (!t.frac && !t.rep && !t.cut) name.append(el('small', '', `${t.int.length}桁`));
    const val = el('span', 'bs-val');
    val.innerHTML = digitsHtml(t, base);
    row.append(name, val);
    return row;
  });
  // マイナスの整数は、コンピューターの中での形（2の補数）も
  if (N.isInteger(x) && N.sign(x) < 0) {
    const tc = B.twosComplement(x.n);
    const row = button('bs-row tc', '', () => copyText(tc.bits, `2の補数（${tc.width}ビット）`));
    const name = el('span', 'bs-name', '2の補数');
    name.append(el('small', '', `${tc.width}ビット`));
    const val = el('span', 'bs-val');
    val.innerHTML = tc.width <= 64
      ? `${B.groups(tc.bits, 2).join('<span class="bs-gap"></span>')}<small class="bs-hex">＝ ${B.groups(tc.hex, 16).join(' ')}${subHtml(16)}</small>`
      : `${B.groups(tc.hex, 16).join('<span class="bs-gap"></span>')}${subHtml(16)}`;
    const abs = F.groupInt((-x.n).toString());
    row.append(name, val, el('span', 'bs-note',
      `マイナスの数を、コンピューターの中のように ${tc.width}ビットで表した形（2^${tc.width} − ${abs}。いちばん左の 1 がマイナスのしるし）`));
    rows.push(row);
  }
  box.replaceChildren(el('p', 'bs-head', 'ほかの進法（タップでコピー）'), ...rows);
}

async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what}をコピーしました`);
  } catch {
    toast(`コピーできませんでした：${text.length > 40 ? `${text.slice(0, 40)}…` : text}`);
  }
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
const ansItem = (x) => ({ ref: x, label: shortLabel(x) ?? '答え' });

function startEditing(items, caret = items.length) {
  st.done = false;
  st.items = items;
  st.caret = caret;
  st.error = '';
}

function press(key, target) {
  if (key === '=') return equals(target);
  // その進法で使えない数字（2進の 2 など）
  if (B.isDigitKey(key) && B.digitOf(key) >= st.base) {
    reject(target);
    toast(`${key} は ${st.base}進法では使えません（数字は 0〜${B.DIGITS[st.base - 1]}）`);
    return;
  }
  if (st.done) {
    if (B.isDigitKey(key) || ['.', '(', 'not'].includes(key)) {
      startEditing([]); // 新しい式
    } else if (B.isBinOp(key)) {
      startEditing([ansItem(st.last.value)]); // 答えの続きから
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
  const next = B.pressBase({ items: st.items, caret: st.caret }, key, st.base);
  if (!next) return reject(target);
  if (next.error) {
    reject(target);
    toast(next.error);
    return;
  }
  st.items = next.items;
  st.caret = next.caret;
  st.error = '';
  render();
}

function equals(target) {
  if (st.done) return;
  if (!st.items.length) return reject(target);
  try {
    const r = B.evaluate(st.items);
    const items = B.closeParens(st.items);
    st.last = { items, value: r.value, notes: r.notes };
    st.done = true;
    st.error = '';
    saveHistory(items, r.value);
    render();
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    st.error = error.kind === 'math' ? error.message : `式が途中か、形がちがいます：${error.message}`;
    reject(target);
    render();
  }
}

// 履歴には電卓の式の形で残す（16進などの数は「答え」の部品）。AND など電卓にない計算は、式を名前にした1つの部品で
function saveHistory(items, value) {
  let calcItems = B.toCalcItems(items);
  if (!calcItems) {
    const text = B.exprText(items);
    calcItems = [{ ref: value, label: text.length <= 40 ? text : `${text.slice(0, 39)}…` }];
  }
  hooks.onSaveHistory(calcItems, value, { kind: 'n進法', name: st.base === 10 ? '' : (shortLabel(value) ?? '') });
}

function setBase(base) {
  st.base = base;
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
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circled = (i) => CIRCLED[i] ?? `(${i + 1})`;

// 10進の書き方（長すぎる数は、まん中を省く）
function dec(x) {
  const text = B.baseText(x, 10, { maxFrac: 30 });
  if (text.length <= 48) return text;
  const plain = text.replace(/,/g, '');
  return `${plain.slice(0, 20)}…${plain.slice(-10)}（${plain.replace(/[−.()…]/g, '').length}桁）`;
}
// 数（前のステップの答えなら ① を前に）
const valText = (x, from) => `${from === null || from === undefined ? '' : circled(from)}${dec(x)}`;
const pow = (base, p) => BigInt(base) ** BigInt(p);
const pow2Text = (k) => (k <= 64n ? F.groupInt((1n << k).toString()) : `2^${k}`);
// n進法の文字（長すぎれば まん中を省く）
function formShort(t, base) {
  const text = B.formText(t, base);
  return text.length <= 60 ? text : `${text.slice(0, 30)}…（${t.int.length}桁）`;
}
const placeText = (base, p) => (p >= 0 ? F.groupInt(pow(base, p).toString()) : `1/${F.groupInt(pow(base, -p).toString())}`);

// 位ごとの足し算：1011₂ → 1×8 ＋ 0×4 ＋ 1×2 ＋ 1×1
function expandText(text, base) {
  const all = B.places(text.replace(/^\./, '0.'));
  const list = all.length <= 8 ? all : all.filter((p) => p.v !== 0);
  if (!list.length) return '0';
  const term = (p) => `${p.v}×${placeText(base, p.p)}`;
  if (list.length > 8) return `${list.slice(0, 4).map(term).join(' ＋ ')} ＋ … ＋ ${list.slice(-2).map(term).join(' ＋ ')}`;
  return list.map(term).join(' ＋ ');
}

// ビットを縦にそろえた表（AND・OR・XOR・NOT）
function bitTable(rows) {
  const cols = B.bitColumns(rows.map((r) => r.v.n));
  if (cols.width > 64) return el('p', 'hint', 'ビットが多いので、表は 64ビットまでです');
  const table = el('table', 'bs-bits');
  rows.forEach((r, i) => {
    const tr = el('tr', r.sum ? 'sum' : '');
    tr.append(el('td', 'op', r.label), el('td', 'b', B.groups(cols.bits[i], 2).join(' ')), el('td', 'd', `（${dec(r.v)}）`));
    table.append(tr);
  });
  return table;
}

const BIT_RULE = {
  and: 'AND：上と下が どちらも 1 の所だけ 1',
  or: 'OR：上と下の どちらかが 1 なら 1',
  xor: 'XOR：上と下が ちがう所だけ 1',
  not: 'NOT：0 と 1 を全部ひっくり返す',
};

function stepView(s, i) {
  const box = el('div', 'bs-step');
  const no = `${circled(i)} `;
  const a = valText(s.a, s.aFrom);
  const b = s.b ? valText(s.b, s.bFrom) : '';
  const r = dec(s.r);
  const negNote = (vals) => (vals.some((v) => N.sign(v) < 0) ? '（マイナスの数は 2の補数で。左にずっと 1 が続きます）' : '');
  switch (s.op) {
    case 'neg':
      box.append(line(`${no}−(${a}) ＝ ${r}`));
      break;
    case 'not':
      box.append(line(`${no}NOT ${a} ＝ −${N.sign(s.a) < 0 ? `(${a})` : a} − 1 ＝ ${r}`));
      box.append(bitTable([{ label: '', v: s.a }, { label: 'NOT', v: s.r, sum: true }]));
      box.append(el('p', 'hint', BIT_RULE.not + negNote([s.a, s.r])));
      break;
    case 'and': case 'or': case 'xor':
      box.append(line(`${no}${a} ${B.OP_TEXT[s.op]} ${b} ＝ ${r}`));
      box.append(bitTable([{ label: '', v: s.a }, { label: B.OP_TEXT[s.op], v: s.b }, { label: '＝', v: s.r, sum: true }]));
      box.append(el('p', 'hint', BIT_RULE[s.op] + negNote([s.a, s.b, s.r])));
      break;
    case '<<': case '>>': {
      const k = s.b.n;
      const p = k <= 64n ? `（${pow2Text(k)}）` : '';
      box.append(line(s.op === '<<'
        ? `${no}${a} << ${b} ＝ ${dec(s.a)} × 2^${k}${p} ＝ ${r}`
        : `${no}${a} >> ${b} ＝ ${dec(s.a)} ÷ 2^${k}${p} の小数を切り捨て ＝ ${r}`));
      const binA = B.baseText(s.a, 2, { sep: '' });
      const binR = B.baseText(s.r, 2, { sep: '' });
      if (N.sign(s.a) >= 0 && binA.length + binR.length <= 60) {
        box.append(el('p', 'hint', `2進：${binA} → ${binR}（${s.op === '<<' ? `右に 0 を ${k}個 足す` : `右の ${k}桁を捨てる`}）`));
      } else if (s.op === '>>' && N.sign(s.a) < 0) {
        box.append(el('p', 'hint', 'マイナスの数は、小さいほうの整数に切り捨てます（−5 >> 1 ＝ −3）'));
      }
      break;
    }
    case 'mod': {
      const m = B.modParts(s.a, s.b);
      box.append(line(`${no}${a} mod ${b} ＝ ${r}（${dec(s.a)} ÷ ${dec(s.b)} ＝ ${dec(m.q)} あまり ${r}）`));
      break;
    }
    default:
      box.append(line(`${no}${a} ${s.op === '+' ? '＋' : s.op} ${b} ＝ ${r}`));
  }
  return box;
}

// 逆の計算で、もとの数にもどるか（もどせない計算は null）
function reverseLine(s, i) {
  const no = `${circled(i)} `;
  const same = (x) => N.cmp(x, s.a) === 0;
  const r = dec(s.r);
  const b = s.b ? dec(s.b) : '';
  switch (s.op) {
    case '+': { const x = N.sub(s.r, s.b); return checked(`${no}${r} − ${b} ＝ ${dec(x)}`, same(x)); }
    case '−': { const x = N.add(s.r, s.b); return checked(`${no}${r} ＋ ${b} ＝ ${dec(x)}`, same(x)); }
    case '×':
      if (N.isZero(s.b)) return el('div', 'rev', `${no}0 をかけているので、逆算はできません`);
      { const x = N.div(s.r, s.b); return checked(`${no}${r} ÷ ${b} ＝ ${dec(x)}`, same(x)); }
    case '÷': { const x = N.mul(s.r, s.b); return checked(`${no}${r} × ${b} ＝ ${dec(x)}`, same(x)); }
    case 'mod': {
      const { q } = B.modParts(s.a, s.b);
      const x = N.add(N.mul(q, s.b), s.r);
      return checked(`${no}${dec(q)} × ${b} ＋ ${r} ＝ ${dec(x)}`, same(x));
    }
    case 'xor': { const x = N.frac(s.r.n ^ s.b.n); return checked(`${no}${r} XOR ${b} ＝ ${dec(x)}`, same(x)); }
    case 'not': { const x = N.frac(-s.r.n - 1n); return checked(`${no}NOT ${r} ＝ ${dec(x)}`, same(x)); }
    case 'neg': { const x = N.neg(s.r); return checked(`${no}−(${r}) ＝ ${dec(x)}`, same(x)); }
    case '<<': { const x = N.frac(s.r.n >> s.b.n); return checked(`${no}${r} >> ${b} ＝ ${dec(x)}`, same(x)); }
    case '>>': {
      const back = s.r.n << s.b.n;
      const dropped = s.a.n - back;
      const x = N.frac(back + dropped);
      return checked(`${no}${r} × ${pow2Text(s.b.n)} ＋ ${dec(N.frac(dropped))}（捨てた分）＝ ${dec(x)}`, same(x));
    }
    default:
      return null; // AND・OR は答えからもどせない
  }
}

// 整数の部分を base で割っていく表（長ければ、まん中を省く）
function appendDivision(d, intPart, base, t) {
  const rows = B.divisionRows(intPart, base);
  const rowLine = (row) => line(`${F.groupInt(row.n.toString())} ÷ ${base} ＝ ${F.groupInt(row.q.toString())} あまり ${row.r}${row.r >= 10 ? `（${B.DIGITS[row.r]}）` : ''}`);
  if (rows.length > 14) {
    rows.slice(0, 6).forEach((row) => d.append(rowLine(row)));
    d.append(line(`…（全部で ${rows.length}回 割ります）`));
    rows.slice(-4).forEach((row) => d.append(rowLine(row)));
  } else rows.forEach((row) => d.append(rowLine(row)));
  d.append(line(`あまりを下から読むと ${t.int.length > INT_SHOW ? `${t.int.slice(0, 30)}…` : B.groups(t.int, base).join(' ')}`));
}

function openBaseCheck() {
  if (!st.done) return;
  let r;
  try {
    r = B.evaluate(st.last.items);
  } catch {
    return;
  }
  const x = r.value;
  $('#checkTitle').textContent = 'n進法の検算';
  const body = $('#checkBody');
  body.replaceChildren();
  let allOk = true;

  // 1. 数を10進になおす
  const lits = [];
  for (const t of r.literals) {
    if (!t.ans && t.base === 10) continue;
    if (!lits.some((u) => (u.ans ? u.ans === t.ans : u.text === t.text && u.base === t.base))) lits.push(t);
  }
  if (lits.length) {
    const box = el('div');
    for (const t of lits) {
      if (t.ans) box.append(line(`前の答え ${t.ans.label} ＝ ${dec(t.value)}`));
      else box.append(line(`${B.literalText(t)} ＝ ${expandText(t.text, t.base)} ＝ ${dec(t.value)}`));
    }
    const used = [...new Set(lits.filter((t) => !t.ans).map((t) => t.base))].sort((p, q) => p - q);
    for (const base of used) {
      box.append(el('p', 'hint', `${base}進の位は ${[0, 1, 2, 3].map((p) => F.groupInt(pow(base, p).toString())).join('・')}…（左へ1つ行くごとに ${base}倍）`));
    }
    if (lits.some((t) => !t.ans && /[A-F]/.test(t.text))) {
      box.append(el('p', 'hint', 'A＝10、B＝11、C＝12、D＝13、E＝14、F＝15'));
    }
    body.append(section('1. 数を10進になおす（数字 × 位の大きさ を足す）', box));
  }

  // 2. 10進で計算
  if (r.steps.length) {
    const box = el('div');
    r.steps.forEach((s, i) => box.append(stepView(s, i)));
    body.append(section(`${lits.length ? 2 : 1}. 10進で計算`, box));
  }

  // 3. 答えを n進法になおす（割ったあまりを下から読む）
  const targets = [...new Set([...(st.base === 10 ? [] : [st.base]), 2, 8, 16])];
  const conv = el('div');
  const abs = N.absNum(x);
  const intPart = abs.n / abs.d;
  const fracPart = N.sub(abs, N.frac(intPart));
  targets.forEach((base, k) => {
    const t = B.toBase(x, base, FRAC_SHOW);
    const d = el('details', 'bs-conv');
    if (k === 0) d.open = true;
    d.append(el('summary', '', `${base}進：${dec(x)} → ${formShort(t, base)}${B.subText(base)}`));
    if (t.neg) d.append(el('p', 'hint', `マイナスは −を付けたまま、${dec(abs)} をなおします`));
    if (intPart === 0n) {
      d.append(line('整数の部分は 0'));
    } else {
      appendDivision(d, intPart, base, t);
    }
    if (!N.isZero(fracPart)) {
      const fr = B.fracRows(fracPart, base, 12);
      d.append(el('p', 'hint', `小数の部分は、${base} をかけて 整数の部分を取り出す、をくり返します`));
      for (const row of fr.rows) {
        d.append(line(`${dec(row.f)} × ${base} ＝ ${dec(row.y)} → ${B.DIGITS[row.d]}`));
      }
      if (fr.repeatAt >= 0) d.append(line(`${dec(fr.rows[fr.repeatAt].f)} にもどったので、ここから くり返し`));
      if (fr.cut) d.append(line('…（長いので、とちゅうまで）'));
      d.append(line(`取り出した数を上から読むと .${t.frac}${t.rep ? `(${t.rep})` : ''}${t.cut ? '…' : ''}`));
    }
    conv.append(d);
  });
  if (targets.some((base) => B.toBase(x, base, FRAC_SHOW).rep)) {
    conv.prepend(el('p', 'hint', '( ) の中の数字は、ずっとくり返します（0.0(0011) ＝ 0.000110011…）'));
  }
  body.append(section(`${body.children.length + 1}. 答えを n進法になおす（割ったあまりを下から読む）`, conv));

  // 4. 逆算
  const rev = el('div');
  let bitOnly = false;
  r.steps.forEach((s, i) => {
    const row = reverseLine(s, i);
    if (row) {
      if (row.querySelector('.mark.ng')) allOk = false;
      rev.append(row);
    } else bitOnly = true;
  });
  if (bitOnly) rev.append(el('p', 'hint', 'AND・OR は、答えからもとの数にはもどせません（上のビットの表で確かめます）'));
  for (const base of targets) {
    const t = B.toBase(x, base, FRAC_SHOW);
    const text = B.formText(t, base);
    const back = B.parseBaseText(text, base);
    let ok;
    let how;
    if (t.cut) {
      ok = N.cmp(N.absNum(N.sub(back, x)), N.frac(1n, pow(base, t.frac.length))) < 0;
      how = `${dec(back)}（とちゅうまでなので、ほんの少しだけ小さい）`;
    } else if (t.rep) {
      ok = N.cmp(back, x) === 0;
      how = `${back.n}/${back.d}（くり返しの分も足す）＝ ${dec(back)}`;
    } else {
      ok = N.cmp(back, x) === 0;
      const digits = B.formText(t, base, '').replace('−', '');
      how = `${t.neg ? '−(' : ''}${expandText(digits, base)}${t.neg ? ')' : ''} ＝ ${dec(back)}`;
    }
    if (!ok) allOk = false;
    rev.append(checked(`${formShort(t, base)}${B.subText(base)} → ${how}`, ok));
  }
  body.append(section(`${body.children.length + 1}. 逆算（逆の計算と、10進にもどす）`, rev));

  body.prepend(el('p', `summary ${allOk ? 'ok' : 'ng'}`, allOk ? '✓ 逆の計算でも、10進にもどしても、もとの数になります' : '✗ 合わない所があります'));
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onSaveHistory(items, value, meta), onUseInCalc(value, label) }
export function initBase(h) {
  hooks = h;
  load();

  $('#bsTabs').addEventListener('click', (event) => {
    const b = event.target.closest('[data-base]');
    if (!b) return;
    setBase(b.dataset.base === 'n' ? st.other : Number(b.dataset.base));
  });
  $('#bsOther').addEventListener('click', (event) => {
    const b = event.target.closest('[data-step]');
    if (!b) return;
    const list = B.OTHER_BASES;
    const i = Math.min(list.length - 1, Math.max(0, list.indexOf(st.other) + Number(b.dataset.step)));
    if (list[i] === st.other) return reject(b);
    st.other = list[i];
    setBase(st.other);
  });

  // 式をタップ → そこにカーソル
  $('#bsExprWrap').addEventListener('click', (event) => {
    const exprEl = $('#bsExpr');
    if (st.done) {
      const items = [...st.last.items];
      startEditing(items, caretFromPoint(exprEl, event.clientX, event.clientY, items.length));
    } else {
      st.caret = caretFromPoint(exprEl, event.clientX, event.clientY, st.items.length);
    }
    render();
  });
  // 答えをタップ → コピー
  $('#bsResult').addEventListener('click', () => {
    if (shown) copyText(B.baseText(shown, st.base, { sep: '' }), `${st.base}進の答え`);
  });
  $('#btnBsCheck').addEventListener('click', openBaseCheck);
  $('#btnBsToCalc').addEventListener('click', () => {
    if (st.done) hooks.onUseInCalc(st.last.value, shortLabel(st.last.value) ?? undefined);
  });
  window.addEventListener('resize', () => { if (hooks.active()) render(); });

  const letters = Object.fromEntries([...'abcdefABCDEF'].map((c) => [c, c.toUpperCase()]));
  setupPad($('#bsKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: {
      ...letters,
      Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear', ArrowLeft: 'left', ArrowRight: 'right',
      '+': '+', '-': '−', '*': '×', '/': '÷', '%': 'mod', '&': 'and', '|': 'or', '^': 'xor', '~': 'not',
      '<': '<<', '>': '>>', '(': '(', ')': ')', '.': '.',
    },
  });
}
