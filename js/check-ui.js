// =========================================================
// 検算の画面
//
//   openCheck        … 「✓ 検算」：計算の順番と、1つずつの逆算。照合の入り口
//   openVerifyResult … 照合（もう一度打った）の結果
// =========================================================
import * as F from './format.js';
import { evaluate } from './calc.js';
import { reverseStep } from './check.js';
import { $, renderItems } from './ui.js';

const MAX_STEPS = 40;
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

function label(i) {
  return i < CIRCLED.length ? CIRCLED[i] : `(${i + 1})`;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 数を短く（前のステップの答えなら、その番号も付ける）
function numEl(value, fromStep = null) {
  const s = el('span', 'n');
  if (fromStep !== null) s.append(el('span', 'from', label(fromStep)));
  const f = F.compact(value, 12);
  const v = el('span');
  v.innerHTML = f.html;
  s.append(v);
  return s;
}

function line(...parts) {
  const p = el('div', 'calc-line');
  for (const part of parts) p.append(typeof part === 'string' ? document.createTextNode(part) : part);
  return p;
}

const OP_TEXT = { '+': ' + ', '−': ' − ', '×': ' × ', '÷': ' ÷ ' };

// 1つのステップの「式 = 答え」
function stepLine(s) {
  const a = numEl(s.a, s.aFrom);
  const r = numEl(s.result);
  switch (s.op) {
    case '+': case '−': case '×': case '÷':
      return line(a, OP_TEXT[s.op], numEl(s.b, s.bFrom), ' = ', r);
    case '^':
      return line(a, ' ^ ', numEl(s.b, s.bFrom), ' = ', r);
    case '²':
      return line(a, ' の2乗 = ', r);
    case '√':
      return line('√', a, ' = ', r);
    case '%':
      return line(a, '% = ', r);
    case 'neg':
      return line('−（', a, '）= ', r);
    case 'pct+': case 'pct−':
      return line(a, s.op === 'pct+' ? ' + ' : ' − ', a.cloneNode(true), ' の ', numEl(s.b, s.bFrom), '%（', numEl(s.part), '）= ', r);
    default:
      return line(r);
  }
}

// 逆算の行
function reverseLine(rev) {
  if (rev.none) return el('div', 'rev none', `逆算：${rev.none}`);
  const x = numEl(rev.x);
  const v = numEl(rev.value);
  let body;
  switch (rev.op) {
    case '+': case '−': case '×': case '÷':
      body = [x, OP_TEXT[rev.op], numEl(rev.y), ' = ', v]; break;
    case '√':
      body = ['√', x, ' = ', v]; break;
    case '²':
      body = [x, ' の2乗 = ', v]; break;
    case 'neg':
      body = ['−（', x, '）= ', v]; break;
    case 'root': {
      const k = F.compact(rev.y).text;
      body = k === '2' ? ['√', x, ' = ', v] : [x, ` の ${k} 乗根 = `, v];
      break;
    }
    default:
      body = [v];
  }
  const p = line('逆算：', ...body);
  p.classList.add('rev');
  p.append(el('span', rev.ok ? 'mark ok' : 'mark ng', rev.ok ? ' ✓' : ' ✗'));
  return p;
}

function section(title, ...children) {
  const sec = el('section', 'd-sec');
  sec.append(el('h3', '', title), ...children);
  return sec;
}

// 「✓ 検算」の画面
// onVerify：照合をはじめるとき呼ぶ
export function openCheck({ items, value, name = '', onVerify }) {
  const body = $('#checkBody');
  body.replaceChildren();
  $('#checkTitle').textContent = name ? `「${name}」の検算` : '検算';

  // 式と答え
  const expr = el('div', 'sheet-expr');
  renderItems(expr, items);
  const ans = el('span', '');
  ans.innerHTML = ` = ${F.compact(value, 14, 24).html}`;
  expr.append(ans);
  body.append(expr);

  // C：計算の順番と逆算
  let steps = [];
  try {
    steps = evaluate(items).steps;
  } catch {
    steps = [];
  }
  if (steps.length === 0) {
    body.append(section('逆算で確かめる', el('p', 'hint', '数が1つだけで、計算がないので、逆算するものはありません。')));
  } else {
    const list = el('ol', 'steps');
    let allOk = true;
    let anyApprox = false;
    let skipped = 0;
    steps.forEach((s, i) => {
      const rev = reverseStep(s);
      if (!rev.none && !rev.ok) allOk = false;
      if (rev.none) skipped++;
      if (rev.approx) anyApprox = true;
      if (i >= MAX_STEPS) return;
      const li = el('li', 'step');
      li.append(el('span', 'no', label(i)), stepLine(s), reverseLine(rev));
      list.append(li);
    });
    const summary = el('p', allOk ? 'summary ok' : 'summary ng',
      allOk
        ? `✓ ${steps.length - skipped === steps.length ? 'すべての' : '逆算できた'}計算で、元の数にもどりました`
        : '✗ 逆算で合わない所があります');
    const hints = [
      el('p', 'hint', '上から、計算した順番です（× ÷ や ( ) の中が先）。思ったとおりの順番になっているかも見てください。'),
    ];
    if (steps.length > MAX_STEPS) hints.push(el('p', 'hint', `計算が多いので、はじめの ${MAX_STEPS} 個を出しています。`));
    if (anyApprox) hints.push(el('p', 'hint', '√ などの割り切れない計算は、50桁より下の四捨五入のちがいを無視してくらべています。'));
    body.append(section('計算の順番と逆算', summary, list, ...hints));
  }

  // B：打ち直して照合
  const start = el('button', 'primary', '照合をはじめる');
  start.type = 'button';
  start.addEventListener('click', () => {
    $('#checkDialog').close();
    onVerify();
  });
  const row = el('div', 'd-row');
  row.append(start);
  body.append(section('もう一度打って照合する',
    el('p', 'd-text small', '同じ計算をもう一度打つと、1回目とちがう所を赤で知らせます。打ちまちがい（数字の打ちまちがい・打ちもれ）を見つけるのに使います。'),
    el('p', 'hint', 'コツ：1回目の式は見ないで、元の数字（レシートなど）を見ながら打ちます。'),
    row));

  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

// 照合の結果
export function openVerifyResult({ first, second, result, onEditFirst, onEditSecond, onRetry }) {
  const body = $('#checkBody');
  body.replaceChildren();
  $('#checkTitle').textContent = '照合の結果';

  const sameValue = first.value && second.value && F.fullDigits(first.value).plain === F.fullDigits(second.value).plain;
  let head;
  if (result.same) {
    head = el('p', 'verdict ok', '✓ 1回目と同じです');
  } else {
    head = el('p', 'verdict ng', '✗ 1回目とちがう所があります');
  }
  body.append(head);
  if (result.same) {
    body.append(el('p', 'd-text small', '2回とも同じ数・同じ順番で打てていました。打ちまちがいはなさそうです。'));
  } else {
    body.append(el('p', 'd-text small', sameValue
      ? '答えは同じですが、打った数や順番がちがいます（赤い所）。'
      : '赤い所が、もう1回のほうとちがいます（抜けている・多い・数字がちがう）。'));
  }

  for (const [title, data, marks] of [
    ['1回目', first, result.marksA],
    ['2回目（いま打った式）', second, result.marksB],
  ]) {
    const expr = el('div', 'vs-expr');
    renderItems(expr, data.items, { marks });
    const ans = el('div', 'vs-ans');
    ans.innerHTML = `= ${F.compact(data.value, 14, 24).html}`;
    body.append(section(title, expr, ans));
  }

  if (!result.same) {
    body.append(el('p', 'hint', 'どちらが正しいかは、元の数字（レシートなど）を見て確かめてください。'));
  }

  const row = el('div', 'd-row');
  const buttons = result.same
    ? [['閉じる', () => {}]]
    : [['1回目の式を直す', onEditFirst], ['2回目の式を直す', onEditSecond], ['もう一度照合する', onRetry]];
  for (const [text, run] of buttons) {
    const b = el('button', 'ghost', text);
    b.type = 'button';
    b.addEventListener('click', () => {
      $('#checkDialog').close();
      run();
    });
    row.append(b);
  }
  body.append(row);

  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
