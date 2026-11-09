// =========================================================
// 画面の小道具（式の表示・お知らせ・振動など、いくつかの画面で使うもの）
// =========================================================
import * as N from './num.js';
import { isDigit, isRef, openParens, isFnToken } from './calc.js';

export const $ = (selector) => document.querySelector(selector);

// 部品の見た目の種類
function classOf(t) {
  if (['+', '−', '×', '÷', '^', 'C', 'P'].includes(t)) return 'tk op';
  if (t === '(' || t === ')') return 'tk paren';
  if (['√', '%', '²', '!', '⁻¹'].includes(t)) return 'tk fn';
  if (isFnToken(t)) return 'tk func';
  if (t === 'π' || t === 'e') return 'tk konst';
  return 'tk';
}

// 部品の画面での書き方（asin( は sin⁻¹( と書く）
const SHOW_AS = { 'asin(': 'sin⁻¹(', 'acos(': 'cos⁻¹(', 'atan(': 'tan⁻¹(' };
export const tokenText = (t) => SHOW_AS[t] ?? t;

// 式（部品の並び）を container の中に表示する。
// caret が数なら、その位置にカーソルを出す。数字には3桁ごとにカンマを入れる。
// （カンマは見た目だけで、式の部品には入らない）
// marks に入っている位置の部品は赤くする（照合でちがった所）。
export function renderItems(container, items, { caret = null, ghostParens = false, tail = null, marks = null } = {}) {
  const frag = document.createDocumentFragment();
  const sepBefore = new Set();
  for (let i = 0; i < items.length;) {
    if (isDigit(items[i]) || items[i] === '.') {
      let end = i;
      while (end < items.length && (isDigit(items[end]) || items[end] === '.')) end++;
      let point = i;
      while (point < end && items[point] !== '.') point++;
      for (let p = i + 1; p < point; p++) if ((point - p) % 3 === 0) sepBefore.add(p);
      i = end;
    } else {
      i++;
    }
  }
  items.forEach((t, i) => {
    if (sepBefore.has(i)) frag.append(span('sep', ','));
    if (caret === i) frag.append(span('caret', ''));
    const el = document.createElement('span');
    el.dataset.i = i;
    if (isRef(t)) {
      el.className = 'tk ref';
      el.textContent = t.label;
    } else {
      el.className = classOf(t);
      el.textContent = tokenText(t);
    }
    if (marks?.has(i)) el.classList.add('bad');
    frag.append(el);
  });
  if (caret === items.length) frag.append(span('caret', ''));
  if (ghostParens) {
    const open = openParens(items);
    if (open > 0) frag.append(span('ghost', ')'.repeat(open)));
  }
  if (tail) frag.append(tail);
  container.replaceChildren(frag);
}

export function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

// タップした場所 → カーソルの位置（いちばん近い部品の左か右）
export function caretFromPoint(container, x, y, length) {
  const parts = container.querySelectorAll('[data-i]');
  if (parts.length === 0) return length;
  let best = null;
  let bestScore = Infinity;
  for (const el of parts) {
    const r = el.getBoundingClientRect();
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const score = dy * 1000 + dx;
    if (score < bestScore) { bestScore = score; best = { el, r }; }
  }
  const i = Number(best.el.dataset.i);
  return x > (best.r.left + best.r.right) / 2 ? i + 1 : i;
}

// ---------------------------------------------------------
// 式の保存用の形（BigInt を文字に）
// ---------------------------------------------------------
export function serializeItems(items) {
  return items.map((t) => (isRef(t) ? { ref: N.serialize(t.ref), label: t.label } : t));
}

export function deserializeItems(list) {
  return list.map((t) => (typeof t === 'object' ? { ref: N.deserialize(t.ref), label: t.label } : t));
}

// ---------------------------------------------------------
// お知らせ（下に少しだけ出る）
// ---------------------------------------------------------
let toastTimer = null;
export function toast(message, action = null) {
  const el = $('#toast');
  el.replaceChildren(span('', message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      el.hidden = true;
      action.run();
    });
    el.append(button);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2200);
}

// ---------------------------------------------------------
// 設定（このスマホのブラウザに保存）
// ---------------------------------------------------------
const SETTINGS_KEY = 'calculator.settings';
const DEFAULT_SETTINGS = { vibrate: true };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、いまの操作には困らない
  }
}

// 軽く震える（対応しているスマホだけ）
export function buzz(settings, pattern = 8) {
  // まだ一度も画面にさわっていないと、ブラウザが止めるので呼ばない
  if (settings.vibrate && navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) {
    try { navigator.vibrate(pattern); } catch { /* 震えなくても困らない */ }
  }
}

// ダイアログの ✕ や「やめる」で閉じる
export function setupDialogClose(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
    // 外側（暗いところ）をタップしても閉じる
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right
        && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) dialog.close();
    }
  });
}
