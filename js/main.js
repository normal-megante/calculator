// =========================================================
// 電卓のスタート地点：キー・表示・保存をつなぐ
//
// 状態
//   mode 'edit' … 式を打っている（＝を押さなくても、下に答えが出る）
//   mode 'done' … ＝ を押した直後（答えを大きく出す）
//     このあと 数字 → 新しい式、＋ − × ÷ など → 答えの続きから計算
//     ⌫ ◀ ▶ や式のタップ → さっきの式に戻って直せる
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import { evaluate, preview, isDigit, openParens } from './calc.js';
import { pressKey, insertRef } from './keys.js';
import {
  $, renderItems, span, caretFromPoint, serializeItems, deserializeItems,
  toast, loadSettings, saveSettings, buzz, setupDialogClose,
} from './ui.js';
import { initHistory, addHistory } from './history.js';
import { openDetail } from './detail.js';
import { setupInstall, installState, promptInstall } from './install.js';

const VERSION = 'ステップ1（2026-11-09）';
const STATE_KEY = 'calculator.state';

const state = {
  items: [],
  caret: 0,
  mode: 'edit',
  last: null,   // { items, value, notes } … 最後に ＝ を押した計算
  error: '',    // ＝ を押したけれど計算できなかったときのお知らせ
};
let settings = loadSettings();
let shownValue = null; // いま答えの欄に出している数（タップでくわしい表示）

// ---------------------------------------------------------
// 保存（アプリを閉じても、打っていた式が残るように）
// ---------------------------------------------------------
function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      items: serializeItems(state.items),
      caret: state.caret,
      mode: state.mode,
      last: state.last && { items: serializeItems(state.last.items), value: N.serialize(state.last.value) },
    }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
    if (!saved) return;
    state.items = deserializeItems(saved.items ?? []);
    state.caret = Math.min(Math.max(0, saved.caret ?? 0), state.items.length);
    if (saved.last) {
      const items = deserializeItems(saved.last.items);
      let notes = [];
      try { notes = evaluate(items).notes; } catch { notes = []; }
      state.last = { items, value: N.deserialize(saved.last.value), notes };
    }
    state.mode = saved.mode === 'done' && state.last ? 'done' : 'edit';
  } catch {
    // 読めなければ、まっさらから
  }
}

// ---------------------------------------------------------
// 表示
// ---------------------------------------------------------
const exprEl = $('#expr');
const resultEl = $('#result');
const notesEl = $('#notes');
const displayEl = $('#display');

// 答えを、欄に入る形・大きさで出す
function fitForms(forms, maxPx, minPx) {
  resultEl.classList.remove('error');
  for (const form of forms) {
    resultEl.innerHTML = form.html;
    for (let px = maxPx; px >= minPx; px -= 2) {
      resultEl.style.fontSize = `${px}px`;
      if (resultEl.scrollWidth <= resultEl.clientWidth + 1) return form;
    }
  }
  const last = forms[forms.length - 1];
  resultEl.innerHTML = last.html;
  resultEl.style.fontSize = `${minPx}px`;
  return last;
}

// 式の文字の大きさ：1行に入る大きさ（入らなければ小さめで折り返す）
function fitExpression(maxPx, minPx) {
  exprEl.style.whiteSpace = 'nowrap';
  let px = maxPx;
  for (; px > minPx; px -= 2) {
    exprEl.style.fontSize = `${px}px`;
    if (exprEl.scrollWidth <= exprEl.clientWidth + 1) break;
  }
  exprEl.style.fontSize = `${px}px`;
  exprEl.style.whiteSpace = '';
}

function noteLines(notes, rounded) {
  const lines = [];
  for (const note of notes.slice(0, 2)) {
    if (note.kind === 'percent') {
      const base = F.compact(note.base).text;
      const part = F.compact(note.part).text;
      const pct = F.compact(note.percent).text;
      lines.push(`％：${base} の ${pct}%（${part}）を${note.op === '+' ? '足しています' : '引いています'}`);
    }
  }
  if (rounded) lines.push('四捨五入して出しています（答えをタップで全部の桁）');
  return lines;
}

function setNotes(lines) {
  notesEl.replaceChildren(...lines.map((line) => span('', line)).map((s) => {
    const p = document.createElement('p');
    p.append(s);
    return p;
  }));
}

function render() {
  const done = state.mode === 'done';
  displayEl.classList.toggle('done', done);
  shownValue = null;

  if (done) {
    const eq = span('eq-sign', ' =');
    renderItems(exprEl, state.last.items, { tail: eq });
    fitExpression(24, 16);
    const form = fitForms(F.mainForms(state.last.value), 52, 22);
    shownValue = state.last.value;
    setNotes(noteLines(state.last.notes, form.rounded));
  } else {
    if (state.items.length === 0) {
      renderItems(exprEl, [], { tail: null });
      exprEl.prepend(span('placeholder', '0'));
      exprEl.append(span('caret', ''));
    } else {
      renderItems(exprEl, state.items, { caret: state.caret, ghostParens: true });
    }
    fitExpression(44, 26);
    if (state.error) {
      resultEl.classList.add('error');
      resultEl.style.fontSize = '';
      resultEl.textContent = state.error;
      setNotes([]);
    } else {
      const p = preview(state.items);
      if (p?.value) {
        const form = fitForms(F.mainForms(p.value), 30, 18);
        shownValue = p.value;
        setNotes(noteLines(p.notes, form.rounded));
      } else if (p?.error) {
        resultEl.classList.remove('error');
        resultEl.style.fontSize = '18px';
        resultEl.textContent = p.error;
        setNotes([]);
      } else {
        resultEl.classList.remove('error');
        resultEl.textContent = '';
        setNotes([]);
      }
    }
    // カーソルが見えるようにスクロール
    exprEl.querySelector('.caret')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  saveState();
}

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function answerRef(value, label) {
  return { ref: value, label: label ?? F.chipLabel(value) };
}

function reject(button) {
  buzz(settings, [12, 40, 12]);
  if (!button) return;
  button.classList.remove('nope');
  void button.offsetWidth; // アニメーションをやり直す
  button.classList.add('nope');
}

// 続きの式に切りかえる
function startEditing(items, caret = items.length) {
  state.mode = 'edit';
  state.items = items;
  state.caret = caret;
  state.error = '';
}

function handleKey(key, button) {
  if (key === '=') return equals(button);

  if (state.mode === 'done') {
    const last = state.last;
    if (isDigit(key) || ['00', '.', '(', '√'].includes(key)) {
      startEditing([]); // 新しい式
    } else if (['+', '−', '×', '÷', '^', '%', '²', ')'].includes(key)) {
      startEditing([answerRef(last.value)]); // 答えの続きから
    } else if (key === 'ans') {
      startEditing([answerRef(last.value)]);
      render();
      return;
    } else if (key === 'clear') {
      startEditing([]);
      render();
      return;
    } else if (key === 'back' || key === 'left' || key === 'right') {
      startEditing([...last.items]); // さっきの式に戻って直す
      if (key === 'left') state.caret = Math.max(0, state.caret - 1);
      render();
      return;
    }
  }

  if (key === 'ans') {
    if (!state.last) {
      reject(button);
      toast('まだ答えがありません（＝ を押すと使えます）');
      return;
    }
    const next = insertRef(state, answerRef(state.last.value));
    state.items = next.items;
    state.caret = next.caret;
    state.error = '';
    render();
    return;
  }

  const next = pressKey(state, key);
  if (!next) {
    reject(button);
    return;
  }
  state.items = next.items;
  state.caret = next.caret;
  state.error = '';
  render();
}

function equals(button) {
  if (state.mode === 'done') return;
  if (state.items.length === 0) {
    reject(button);
    return;
  }
  try {
    const { value, notes } = evaluate(state.items);
    // 閉じていなかった ( は閉じた形で残す
    const items = [...state.items, ...Array(openParens(state.items)).fill(')')];
    state.last = { items, value, notes };
    state.mode = 'done';
    state.error = '';
    addHistory(items, value);
    render();
  } catch (error) {
    if (!(error instanceof N.CalcError)) throw error;
    state.error = error.kind === 'math' ? error.message : `式が途中か、形がちがいます：${error.message}`;
    reject(button);
    render();
  }
}

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
function setupKeypad() {
  const keypad = $('#keypad');
  let repeatTimer = null;
  let repeated = false;
  const stopRepeat = () => clearTimeout(repeatTimer);

  // ⌫ ◀ ▶ は、長押しで続けて動く
  keypad.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    repeated = false;
    const key = button.dataset.key;
    if (key !== 'back' && key !== 'left' && key !== 'right') return;
    stopRepeat();
    repeatTimer = setTimeout(function tick() {
      repeated = true;
      handleKey(key, null);
      repeatTimer = setTimeout(tick, 70);
    }, 450);
  });
  window.addEventListener('pointerup', stopRepeat);
  window.addEventListener('pointercancel', stopRepeat);
  keypad.addEventListener('contextmenu', (event) => event.preventDefault());

  keypad.addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    if (repeated) { repeated = false; return; }
    buzz(settings);
    handleKey(button.dataset.key, button);
  });

  // PC のキーボードでも打てるように
  const KEYMAP = {
    Enter: '=', '=': '=', Backspace: 'back', Escape: 'clear', Delete: 'clear',
    ArrowLeft: 'left', ArrowRight: 'right', '*': '×', '/': '÷', '-': '−', '+': '+',
    '^': '^', '(': '(', ')': ')', '%': '%', '.': '.',
  };
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]') || !$('#historyPanel').hidden) return;
    if (event.target.closest?.('input, textarea')) return;
    const key = /^[0-9]$/.test(event.key) ? event.key : KEYMAP[event.key];
    if (!key) return;
    event.preventDefault();
    handleKey(key, keypad.querySelector(`[data-key="${CSS.escape(key)}"]`));
  });
}

function setupDisplay() {
  // 式をタップ → そこにカーソル
  $('#exprWrap').addEventListener('click', (event) => {
    if (state.mode === 'done') {
      const items = [...state.last.items];
      // いまの表示（さっきの式）の上でタップした位置を使う
      const caret = caretFromPoint(exprEl, event.clientX, event.clientY, items.length);
      startEditing(items, caret);
    } else {
      state.caret = caretFromPoint(exprEl, event.clientX, event.clientY, state.items.length);
    }
    render();
  });
  // 答えをタップ → くわしい表示
  resultEl.addEventListener('click', () => {
    if (shownValue) openDetail(shownValue);
  });
  // 画面の大きさが変わったら、文字の大きさを合わせ直す
  window.addEventListener('resize', () => render());
}

function setupMenu() {
  const menu = $('#menu');
  const button = $('#btnMenu');
  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    $('#btnInstall').hidden = installState() === 'app';
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target)) close();
  });

  const vibrate = $('#setVibrate');
  vibrate.checked = settings.vibrate;
  vibrate.addEventListener('change', () => {
    settings = { ...settings, vibrate: vibrate.checked };
    saveSettings(settings);
    buzz(settings, 20);
  });

  $('#btnInstall').addEventListener('click', async () => {
    close();
    const s = installState();
    if (s === 'ready') {
      if (await promptInstall()) toast('ホーム画面に追加しました');
    } else if (s === 'installed') {
      toast('ホーム画面に追加ずみです');
    } else {
      toast('Chrome の右上「︙」→「ホーム画面に追加」から追加できます');
    }
  });

  $('#btnAbout').addEventListener('click', () => {
    close();
    $('#aboutVersion').textContent = `版：${VERSION}`;
    $('#aboutDialog').showModal();
  });

  for (const dialog of document.querySelectorAll('dialog')) {
    if (dialog.id !== 'nameDialog') setupDialogClose(dialog);
  }
}

function start() {
  loadState();
  setupInstall();
  setupKeypad();
  setupDisplay();
  setupMenu();
  initHistory({
    // 履歴の「答えを使う」：答えを全部の桁のまま、いまの式のカーソルのところに入れる
    onUseAnswer(value, label) {
      if (state.mode === 'done') startEditing([]);
      const next = insertRef(state, answerRef(value, label));
      startEditing(next.items, next.caret);
      render();
    },
    // 履歴の「式を直す」
    onEditExpression(items) {
      startEditing([...items]);
      render();
    },
  });
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
