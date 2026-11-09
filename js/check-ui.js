// =========================================================
// 検算の画面
//
//   openCheck        … 「✓ 検算」：計算の順番と、1つずつの逆算。照合の入り口
//   openVerifyResult … 照合（もう一度打った）の結果
// =========================================================
import * as F from './format.js';
import * as S from './sci.js';
import { evaluate, TRIG } from './calc.js';
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
  const v = el('span');
  if (value === S.PI || value === S.E) v.textContent = value === S.PI ? 'π' : 'e'; // 打った π・e はそのまま
  else v.innerHTML = F.compact(value, 12).html;
  s.append(v);
  return s;
}

// 角度（度のときは ° を付ける）
function angleEl(value, angle, fromStep = null) {
  const s = numEl(value, fromStep);
  if (angle === 'deg') s.append('°');
  return s;
}

const FN_TEXT = {
  sin: 'sin', cos: 'cos', tan: 'tan', asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', log: 'log', ln: 'ln',
  sf: 'sf', hf: 'H', gamma: 'Γ', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', abs: 'abs',
  asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹',
};

// 数の並び（gcd(12, 18) の中身）
function numList(list, froms = []) {
  const parts = [];
  list.forEach((v, i) => {
    if (i) parts.push(', ');
    parts.push(numEl(v, froms[i] ?? null));
  });
  return parts;
}

const shortText = (x) => F.compact(x).text;

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
    case 'sin': case 'cos': case 'tan':
      return line(`${s.op} `, angleEl(s.a, s.angle, s.aFrom), ' = ', r);
    case 'asin': case 'acos': case 'atan':
      return line(`${FN_TEXT[s.op]} `, a, ' = ', angleEl(s.result, s.angle));
    case 'log': case 'ln':
      return line(`${s.op} `, a, ' = ', r);
    case '!':
      return line(a, '! = ', r);
    case 'C': case 'P':
      return line(a, s.op, numEl(s.b, s.bFrom), ' = ', r);
    case '⁻¹':
      return line('1 ÷ ', a, ' = ', r);
    case 'logb':
      return line('log(', a, ', ', numEl(s.b, s.bFrom), ') = ', r);
    case 'nroot':
      return line('ⁿ√(', a, ', ', numEl(s.b, s.bFrom), ') = ', r);
    case 'gcd': case 'lcm':
      return line(`${s.op}(`, ...numList(s.list, s.froms), ') = ', r);
    case 'mod':
      return line(a, ' mod ', numEl(s.b, s.bFrom), ' = ', r);
    case '!!': case '#':
      return line(a, `${s.op} = `, r);
    case 'sf': case 'hf': case 'gamma': case 'sinh': case 'cosh': case 'tanh': case 'abs':
      return line(`${FN_TEXT[s.op]}(`, a, ') = ', r);
    default:
      return line(r);
  }
}

// 階乗の短い書き方（5!）
const factText = (x) => `${F.compact(x).text}!`;

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
    case 'asin': case 'acos': case 'atan':
      body = [`${FN_TEXT[rev.op]} `, x, ' = ', angleEl(rev.value, rev.angle)];
      break;
    case 'sin': case 'cos': case 'tan':
      body = [`${rev.op} `, angleEl(rev.x, rev.angle), ' = ', v];
      break;
    case 'pow10':
      body = ['10 ^ ', x, ' = ', v]; break;
    case 'exp':
      body = ['e ^ ', x, ' = ', v]; break;
    case 'fact':
      body = [x, ' ÷ ', numEl(rev.y), ' = ', v, rev.ok ? ` ＝ ${factText(rev.k)}` : ` ≠ ${factText(rev.k)}`];
      break;
    case 'C': {
      const npr = `${F.compact(rev.n).text}P${F.compact(rev.r).text}`;
      body = [x, ` × ${factText(rev.r)} = `, v, rev.ok ? ` ＝ ${npr}` : ` ≠ ${npr}`];
      break;
    }
    case 'P':
      body = [x, ` × ${factText(rev.rest)} = `, v, rev.ok ? ` ＝ ${factText(rev.n)}` : ` ≠ ${factText(rev.n)}`];
      break;
    case 'P÷': {
      const npr = `${F.compact(rev.n1).text}P${F.compact(rev.r1).text}`;
      body = [x, ' ÷ ', numEl(rev.n), ' = ', v, rev.ok ? ` ＝ ${npr}` : ` ≠ ${npr}`];
      break;
    }
    // ---- ステップ14 ----
    case 'logb':
      body = [numEl(rev.base), ' ^ ', x, ' = ', v]; break;
    case 'nroot':
      body = [x, ' ^ ', numEl(rev.n), ' = ', v]; break;
    case 'gcd': case 'lcm': {
      body = [];
      rev.list.forEach((n, i) => {
        if (i) body.push('、');
        if (rev.op === 'gcd') body.push(numEl(n), ' ÷ ', numEl(rev.x), ' = ', numEl(rev.quotients[i]));
        else body.push(numEl(rev.x), ' ÷ ', numEl(n), ' = ', numEl(rev.quotients[i]));
      });
      break;
    }
    case 'mod':
      body = [numEl(rev.y), ' × ', numEl(rev.q), ' + ', x, ' = ', v]; break;
    case 'dfact': {
      const k = `${shortText(rev.k)}!!`;
      body = [x, ' ÷ ', numEl(rev.y), ' = ', v, rev.ok ? ` ＝ ${k}` : ` ≠ ${k}`];
      break;
    }
    case 'prim': {
      const k = `${shortText(rev.k)}#`;
      body = [x, ' ÷ ', numEl(rev.p), ' = ', v, rev.ok ? ` ＝ ${k}` : ` ≠ ${k}`];
      break;
    }
    case 'sf': {
      const k = `sf(${shortText(rev.k)})`;
      body = [x, ` ÷ ${factText(rev.n)} = `, v, rev.ok ? ` ＝ ${k}` : ` ≠ ${k}`];
      break;
    }
    case 'hf': {
      const n = shortText(rev.n);
      const k = `H(${shortText(rev.k)})`;
      body = [x, ` ÷ ${n}${S.supText(S.intOf(rev.n))} = `, v, rev.ok ? ` ＝ ${k}` : ` ≠ ${k}`];
      break;
    }
    case 'gamma':
      body = ['Γ(', numEl(rev.a1), ') ÷ ', numEl(rev.a), ' = ', v]; break;
    case 'asinh': case 'acosh': case 'atanh':
      body = [`${FN_TEXT[rev.op]} `, x, ' = ', v]; break;
    case 'abs':
      body = ['±', x, ' のうち ', v]; break;
    default:
      body = [v];
  }
  const p = line('逆算：', ...body);
  p.classList.add('rev');
  p.append(el('span', rev.ok ? 'mark ok' : 'mark ng', rev.ok ? ' ✓' : ' ✗'));
  // ステップ14の関数の、ひとこと
  const note = (text) => p.append(el('span', 'rev-note', text));
  if (rev.op === 'gcd' || rev.op === 'lcm') {
    const qs = rev.quotients.map(shortText).join('・');
    note(rev.ok
      ? `（${qs} は 1 のほかに、みんなを割り切る数がない）`
      : `（${qs} に割り切れない数があるか、まだみんなを割り切る数がある）`);
  }
  if (rev.op === 'prim') note(`（${shortText(rev.p)} は ${shortText(rev.n)} 以下でいちばん大きい素数）`);
  if (rev.op === 'gamma') note('（Γ(x＋1) ＝ x × Γ(x) を使っています）');
  if (rev.minus) note(`（cosh は −x でも同じ値なので、cosh⁻¹ は 0 以上の ${shortText(rev.expect)} を出します）`);
  if (rev.digits && rev.digits < 60) note(`（答えが 1 に近いので、上から ${rev.digits} 桁でくらべています）`);
  // sin⁻¹ などは決まった範囲の角度を出すので、もとの角度とちがうことがある
  if (rev.ok && rev.same === false) {
    const deg = rev.angle === 'deg' ? '°' : '';
    p.append(el('span', 'rev-note',
      `（${F.compact(rev.expect, 12).text}${deg} と ${F.compact(rev.value, 12).text}${deg} は ${rev.fn} が同じ値）`));
  }
  return p;
}

function section(title, ...children) {
  const sec = el('section', 'd-sec');
  sec.append(el('h3', '', title), ...children);
  return sec;
}

// 「✓ 検算」の画面
// onVerify：照合をはじめるとき呼ぶ。angle：三角関数の角度のモード（＝ を押したときのもの）
export function openCheck({ items, value, name = '', angle = S.getAngle(), onVerify }) {
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
    steps = evaluate(items, { angle }).steps;
  } catch {
    steps = [];
  }
  const trig = steps.some((s) => TRIG.includes(s.op));
  if (trig) body.append(el('p', 'hint', `角度は「${S.ANGLE_NAME[angle]}」で計算しています。`));
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
    if (trig) {
      const range = angle === 'deg'
        ? 'sin⁻¹ と tan⁻¹ は −90°〜90°、cos⁻¹ は 0°〜180°'
        : 'sin⁻¹ と tan⁻¹ は −π/2〜π/2、cos⁻¹ は 0〜π';
      hints.push(el('p', 'hint', `${range} の角度を出します。もとの角度とちがうときは、sin などの値が同じになる角度かで確かめています。`));
    }
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
