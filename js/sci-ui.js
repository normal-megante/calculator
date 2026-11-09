// =========================================================
// 関数電卓のキー（電卓の画面の「関数」）と、素因数分解の画面
//
//   ・「関数」ボタンで、ふつうのキーの上に関数のキー（5列×3行）を出す・しまう
//   ・逆：sin → sin⁻¹、cos → cos⁻¹、tan → tan⁻¹、log → 10ˣ、ln → eˣ（1回使うと元にもどる）
//   ・度/rad：三角関数の角度のモード、分数：答えを分数で出す（どちらも設定に保存）
//   ・素因数：いまの答え（整数）を素因数分解する（検算の画面を借りて出す）
//   ・右はしの「もっと」：2ページ目（log(底, 数)・ⁿ√・gcd・lcm・n!!・sf・H・n#・Γ・sinh など）。
//     どちらのページかは設定に保存（sciPage2）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as S from './sci.js';
import { $, toast } from './ui.js';
import { el, button, shake } from './form.js';

// 関数のキー → [ふつう, 逆] の部品
const FN_KEYS = {
  sin: ['sin(', 'asin('], cos: ['cos(', 'acos('], tan: ['tan(', 'atan('],
  log: ['log(', 'pow10'], ln: ['ln(', 'exp'],
};
const LABELS = {
  sin: ['sin', 'sin<sup>−1</sup>'], cos: ['cos', 'cos<sup>−1</sup>'], tan: ['tan', 'tan<sup>−1</sup>'],
  log: ['log', '10<sup>x</sup>'], ln: ['ln', 'e<sup>x</sup>'],
};

const MAX_FACTOR_DIGITS = 100;
const BUDGET = 200000;      // 素因数分解：ふつうに押したときの手間の上限（すぐ終わる）
const BIG_BUDGET = 4000000; // 「時間をかけてもう一度」（数秒かかることがある）
const SURE_PRIME = 3317044064679887385961981n; // これより小さい数は、素数かどうか必ず正しい

let h = null;
let inverse = false;

// 「,」で区切る関数は、はじめて押したときに打ち方を知らせる
const HOW_TO = {
  'log(': '底を変える log：log(底, 数) と打ちます（log(2, 8) ＝ 3）。数だけなら 10 が底',
  'root(': 'ⁿ√(n, 数) と打ちます（ⁿ√(3, 8) ＝ 2）',
  'gcd(': 'gcd(12, 18) のように「,」（区切り）で数を分けます。3つ以上も',
  'lcm(': 'lcm(4, 6) のように「,」（区切り）で数を分けます。3つ以上も',
};
const told = new Set();

// handlers：{ settings(), saveSetting(変える所), pressKey(部品, ボタン), currentValue(), rerender() }
export function initSci(handlers) {
  h = handlers;
  $('#sciPad').addEventListener('click', (event) => {
    const b = event.target.closest('[data-sci]');
    if (b) press(b.dataset.sci, b);
  });
  $('#btnSci').addEventListener('click', () => {
    h.saveSetting({ sci: !h.settings().sci });
    applySci();
    h.rerender();
  });
  applySci();
}

// 設定を画面に合わせる（角度のモードも sci.js に伝える）
export function applySci() {
  const s = h.settings();
  S.setAngle(s.angle === 'rad' ? 'rad' : 'deg');
  const open = Boolean(s.sci);
  $('#sciPad').hidden = !open;
  $('#calcView').classList.toggle('sci', open);
  $('#btnSci').setAttribute('aria-pressed', String(open));
  $('#btnAngle').innerHTML = `<small>角度</small>${S.getAngle() === 'deg' ? '度' : 'rad'}`;
  $('#btnFrac').setAttribute('aria-pressed', String(Boolean(s.frac)));
  const page2 = Boolean(s.sciPage2);
  $('#sciPage1').hidden = page2;
  $('#sciPage2').hidden = !page2;
  const pageKey = $('#btnSciPage');
  pageKey.textContent = page2 ? 'もどる' : 'もっと';
  pageKey.setAttribute('aria-pressed', String(page2));
  pageKey.setAttribute('aria-label', page2 ? '1ページ目の関数のキーにもどる' : 'ほかの関数のキー（2ページ目）を出す');
  showLabels();
}

function showLabels() {
  $('#btnInv').setAttribute('aria-pressed', String(inverse));
  for (const [key, pair] of Object.entries(LABELS)) {
    $(`#sciPad [data-sci="${key}"]`).innerHTML = pair[inverse ? 1 : 0];
  }
}

function press(key, b) {
  const s = h.settings();
  switch (key) {
    case 'inv':
      inverse = !inverse;
      showLabels();
      return;
    case 'angle': {
      const angle = S.getAngle() === 'deg' ? 'rad' : 'deg';
      h.saveSetting({ angle });
      applySci();
      h.rerender();
      toast(angle === 'deg' ? '角度を「度」にしました（1回転 ＝ 360°）' : '角度を「rad（ラジアン）」にしました（1回転 ＝ 2π）');
      return;
    }
    case 'frac':
      h.saveSetting({ frac: !s.frac });
      applySci();
      h.rerender();
      toast(s.frac ? '答えを小数で出します' : '答えを分数で出します（割り切れない数だけ）');
      return;
    case 'factor':
      if (!openFactor(h.currentValue())) shake(b, s);
      return;
    case 'page':
      h.saveSetting({ sciPage2: !s.sciPage2 });
      applySci();
      return;
    default: {
      const pair = FN_KEYS[key];
      const token = pair ? pair[inverse ? 1 : 0] : key;
      if (inverse) {
        inverse = false;
        showLabels();
      }
      h.pressKey(token, b);
      if (HOW_TO[key] && !pair && !told.has(key)) {
        told.add(key);
        toast(HOW_TO[key]);
      }
    }
  }
}

// ---------------------------------------------------------
// 素因数分解の画面
// ---------------------------------------------------------
const group = (n) => F.groupInt(n.toString());

function powerText([p, e]) {
  return `${group(p)}${e > 1 ? S.supText(e) : ''}`;
}

// 素因数分解できる整数か（できなければ、お知らせを出して null）
function factorTarget(value) {
  if (!value) {
    toast('整数を打ってから（または ＝ のあとに）押してください');
    return null;
  }
  if (!value.q || value.d !== 1n || value.n < 2n) {
    toast('素因数分解できるのは、2 以上の整数だけです');
    return null;
  }
  if (value.n.toString().length > MAX_FACTOR_DIGITS) {
    toast(`素因数分解は ${MAX_FACTOR_DIGITS} 桁までの整数だけです`);
    return null;
  }
  return value.n;
}

export function openFactor(value) {
  const n = factorTarget(value);
  if (n === null) return false;
  showFactor(n, BUDGET);
  const dialog = $('#checkDialog');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  return true;
}

function section(title, ...children) {
  const sec = el('section', 'd-sec');
  sec.append(el('h3', '', title), ...children);
  return sec;
}

function showFactor(n, budget) {
  const { factors, rest } = S.factorize(n, { budget });
  const body = $('#checkBody');
  body.replaceChildren();
  $('#checkTitle').textContent = '素因数分解';

  const prime = rest.length === 0 && factors.length === 1 && factors[0][1] === 1;
  const parts = [...factors.map(powerText), ...rest.map((r) => `（${group(r)}）`)];
  const main = el('p', 'fz-main', `${group(n)} ＝ ${parts.join(' × ')}`);
  if (!prime) body.append(main);

  if (prime) {
    body.append(el('p', 'verdict ok', `${group(n)} は素数です`));
    body.append(el('p', 'd-text small', `1 と ${group(n)} のほかに、割り切れる数がありません。`));
  } else if (rest.length) {
    body.append(el('p', 'verdict ng', 'まだ分けられていない数があります'));
    body.append(el('p', 'hint', 'かっこの中の数は素数ではありませんが、大きい素数どうしのかけ算なので、分けるのにとても時間がかかります。'));
    if (budget < BIG_BUDGET) {
      const again = button('ghost', '時間をかけてもう一度', () => {
        again.disabled = true;
        again.textContent = '計算しています…';
        // 「計算しています」を画面に出してから計算する
        setTimeout(() => showFactor(n, BIG_BUDGET), 30);
      });
      const row = el('div', 'd-row');
      row.append(again, el('span', 'hint', '10秒くらいかかることがあります（そのあいだ画面は止まります）'));
      body.append(row);
    } else {
      body.append(el('p', 'hint', 'この電卓では、これ以上は分けられませんでした。'));
    }
  }

  // 検算：かけ算すると元の数／どれも素数
  const product = [...factors.map(([p, e]) => p ** BigInt(e)), ...rest].reduce((a, b) => a * b, 1n);
  const ok = product === n;
  const checks = [];
  if (!prime && factors.length > 0) {
    const expanded = factors.length <= 8 && factors.every(([p, e]) => e === 1 || (p ** BigInt(e)).toString().length <= 12)
      ? ` ＝ ${[...factors.map(([p, e]) => group(p ** BigInt(e))), ...rest.map(group)].join(' × ')}`
      : '';
    const showExpanded = expanded && factors.some(([, e]) => e > 1);
    const line = el('p', 'calc-line', `${parts.join(' × ')}${showExpanded ? expanded : ''} ＝ ${group(product)}`);
    line.append(el('span', ok ? 'mark-ok' : 'mark-ng', ok ? ' ✓' : ' ✗'));
    checks.push(el('p', 'd-text small', 'かけ算すると、元の数にもどります。'), line);
  }
  const primes = factors.map(([p]) => p);
  if (prime && n < 10n ** 12n) {
    const root = N.isqrt(n);
    checks.push(el('p', 'd-text small', `√${group(n)} ≒ ${group(root)} までの数で割ってみて、どれも割り切れません ✓`));
  } else if (primes.length) {
    const names = primes.length <= 10 ? primes.map(group).join('・') : `${primes.length} 個の数`;
    checks.push(el('p', 'd-text small', `${names} は、どれも素数です ✓`));
  }
  if (primes.some((p) => p >= SURE_PRIME)) {
    checks.push(el('p', 'hint', '25桁より大きい数が素数かどうかは、まずまちがえない方法（ミラー・ラビン法）で確かめています。'));
  }
  if (rest.length) {
    checks.push(el('p', 'd-text small', 'かっこの中の数は、素数ではないことを確かめています（ミラー・ラビン法）。'));
  }
  body.append(section('✓ 検算', ...checks));

  // 約数（全部分けられたときだけ）
  if (rest.length === 0) {
    const count = factors.reduce((a, [, e]) => a * BigInt(e + 1), 1n);
    const kids = [el('p', 'd-text', `約数（割り切れる数）は ${group(count)} 個`)];
    if (count <= 60n) kids.push(el('p', 'fz-divisors', divisors(factors).map(group).join(', ')));
    kids.push(el('p', 'hint', '約数の数 ＝ （指数＋1）をかけたもの'
      + `：${factors.map(([, e]) => `(${e}+1)`).join(' × ')} ＝ ${group(count)}`));
    body.append(section('約数', ...kids));
  }
}

function divisors(factors) {
  let list = [1n];
  for (const [p, e] of factors) {
    const next = [];
    for (const d of list) {
      let x = d;
      for (let i = 0; i <= e; i++) {
        next.push(x);
        x *= p;
      }
    }
    list = next;
  }
  return list.sort((a, b) => (a < b ? -1 : 1));
}
