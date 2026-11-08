// =========================================================
// 入力欄とキーの部品（お買い物・割り勘など、画面の数字キーで打つモードで使う）
//
//   typeKey  … 数字キーを押したときの、欄の文字の変え方（画面なし・テストあり）
//   setField … 入力欄（ボタンの形 .fld）の見た目
//   seg      … 1つだけえらべるボタンの組
//   setupPad … 4列のキー（⌫ は長押しで続けて消す・PC のキーボードでも打てる）
// =========================================================
import * as F from './format.js';
import { $, buzz } from './ui.js';

// ---------------------------------------------------------
// 欄の文字（画面なし）
// ---------------------------------------------------------
export const MAX_DIGITS = 12;

// 数字キーで、欄の文字（値段・人数など）を1つ変える。打てないときは null
//   fresh … 欄をえらんだ直後（数字を打つと、前の文字と入れかわる）
//   maxDecimals … 小数点の下を何桁まで打てるか（0 なら小数点は打てない）
//   maxInt … 整数の部分を何桁まで打てるか
export function typeKey(text, key, { fresh = false, maxDecimals = 3, maxInt = MAX_DIGITS } = {}) {
  if (key === 'back') return text ? text.slice(0, -1) : null;
  if (key === 'clear') return text ? '' : null;
  if (fresh) text = '';
  let next;
  if (key === '.') {
    if (maxDecimals === 0 || text.includes('.')) return null;
    next = `${text || '0'}.`;
  } else if (key === '00') {
    if (!text || text === '0') return null; // 先頭に 00 は打てない
    next = `${text}00`;
  } else if (/^[0-9]$/.test(key)) {
    next = text === '0' ? key : text + key;
  } else {
    return null;
  }
  const [int, dec = ''] = next.split('.');
  if (int.length > maxInt || dec.length > maxDecimals) return null;
  return next;
}

// 打ちかけの文字を、しまう形に（「12.」→「12」）
export function tidy(text) {
  if (!text) return '';
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

// ---------------------------------------------------------
// 画面の部品
// ---------------------------------------------------------
export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(className, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// 押せないとき：ボタンを揺らして、短く2回震える
export function shake(target, settings) {
  buzz(settings, [12, 40, 12]);
  if (!target) return;
  target.classList.remove('nope');
  void target.offsetWidth; // アニメーションをやり直す
  target.classList.add('nope');
}

// えらぶボタンの組（1つだけえらべる）。options は [[値, 文字], …]
export function seg(options, current, onPick, ariaLabel, settings = null) {
  const g = el('div', 'seg');
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', ariaLabel);
  for (const [value, text] of options) {
    const b = button('', text, () => {
      if (settings) buzz(settings);
      onPick(value);
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(value === current));
    g.append(b);
  }
  return g;
}

// 入力欄（ボタンの形 .fld）の見た目
//   text … 打った文字（空なら placeholder を薄く出す）
//   active … 数字キーがここに入る / fresh … 打つと入れかわる（色を付ける）
//   unit … 後ろの小さい字（.unit）を変えるとき
export function setField(fieldButton, { text, placeholder, active, fresh = false, shown = null, unit = null }) {
  const v = fieldButton.querySelector('.v');
  v.textContent = shown ?? (text ? F.groupNumberText(text) : placeholder);
  v.classList.toggle('blank', !text);
  // 長い数は、欄に入るように小さく
  const length = v.textContent.length;
  const wide = fieldButton.classList.contains('big') ? 4 : 0;
  v.classList.toggle('long', length > 9 + wide && length <= 13 + wide);
  v.classList.toggle('longer', length > 13 + wide);
  if (unit !== null) fieldButton.querySelector('.unit').textContent = unit;
  fieldButton.classList.toggle('active', active);
  fieldButton.classList.toggle('fresh', active && fresh && !!text);
  fieldButton.setAttribute('aria-pressed', String(active));
}

// 4列のキー（data-k）をつなぐ
//   press(key, button) … キーが押されたとき
//   settings() … 振動の設定 / active() … このモードの画面が出ているか
//   keymap … PC のキー → data-k（数字はそのまま）
export function setupPad(keys, { press, settings, active, keymap }) {
  let timer = null;
  let repeated = false;
  const stop = () => clearTimeout(timer);
  keys.addEventListener('pointerdown', (event) => {
    const b = event.target.closest('[data-k]');
    repeated = false;
    if (!b || b.dataset.k !== 'back') return;
    stop();
    timer = setTimeout(function tick() {
      repeated = true;
      press('back', null);
      timer = setTimeout(tick, 70);
    }, 450);
  });
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
  keys.addEventListener('contextmenu', (event) => event.preventDefault());
  keys.addEventListener('click', (event) => {
    const b = event.target.closest('[data-k]');
    if (!b) return;
    if (repeated) {
      repeated = false;
      return;
    }
    buzz(settings());
    press(b.dataset.k, b);
  });

  document.addEventListener('keydown', (event) => {
    if (!active()) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]') || !$('#historyPanel').hidden) return;
    if (event.target.closest?.('input, textarea')) return;
    const key = /^[0-9]$/.test(event.key) ? event.key : keymap[event.key];
    if (!key) return;
    event.preventDefault();
    press(key, keys.querySelector(`[data-k="${CSS.escape(key)}"]`));
  });
}
