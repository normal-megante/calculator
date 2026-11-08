// =========================================================
// 電卓のスタート地点：キー・表示・保存をつなぐ
//
// 状態
//   mode 'edit' … 式を打っている（＝を押さなくても、下に答えが出る）
//   mode 'done' … ＝ を押した直後（答えを大きく出す）
//     このあと 数字 → 新しい式、＋ − × ÷ など → 答えの続きから計算
//     ⌫ ◀ ▶ や式のタップ → さっきの式に戻って直せる
//   verify … 照合中なら、1回目の計算 { items, value }（いま打っている式とくらべる）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import { evaluate, preview, isDigit, closeParens } from './calc.js';
import { pressKey, insertRef } from './keys.js';
import {
  $, renderItems, span, caretFromPoint, serializeItems, deserializeItems,
  toast, loadSettings, saveSettings, buzz, setupDialogClose,
} from './ui.js';
import { initHistory, addHistory, closeHistory } from './history.js';
import { openDetail } from './detail.js';
import { liveCompare, fullCompare } from './check.js';
import { openCheck, openVerifyResult } from './check-ui.js';
import { setupInstall, installState, promptInstall } from './install.js';
import { initShop, showShop, currentShopTotal } from './shop-ui.js';
import { initSplit, showSplit, setSplitTotal } from './split-ui.js';
import { initTime, showTime } from './time-ui.js';

const VERSION = 'ステップ5（2026-11-09）';
const STATE_KEY = 'calculator.state';

const state = {
  items: [],
  caret: 0,
  mode: 'edit',
  last: null,   // { items, value, notes } … 最後に ＝ を押した計算
  error: '',    // ＝ を押したけれど計算できなかったときのお知らせ
  verify: null, // 照合中なら 1回目の計算 { items, value }
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
      verify: state.verify && { items: serializeItems(state.verify.items), value: N.serialize(state.verify.value) },
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
    if (saved.verify) {
      state.verify = { items: deserializeItems(saved.verify.items), value: N.deserialize(saved.verify.value) };
      state.mode = 'edit';
    }
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

// lines の1つ1つは、文字か { text, cls }（色を付けるとき）
function setNotes(lines) {
  notesEl.replaceChildren(...lines.map((line) => {
    const p = document.createElement('p');
    if (typeof line === 'string') p.textContent = line;
    else { p.textContent = line.text; p.className = line.cls; }
    return p;
  }));
}

function render() {
  const done = state.mode === 'done';
  displayEl.classList.toggle('done', done);
  $('#verifyBar').hidden = !state.verify;
  $('#btnCheck').hidden = !done;
  shownValue = null;

  if (done) {
    const eq = span('eq-sign', ' =');
    renderItems(exprEl, state.last.items, { tail: eq });
    fitExpression(24, 16);
    const form = fitForms(F.mainForms(state.last.value), 52, 22);
    shownValue = state.last.value;
    setNotes(noteLines(state.last.notes, form.rounded));
  } else {
    // 照合中：ここまで1回目と同じか
    let verifyLine = null;
    let marks = null;
    if (state.verify && state.items.length > 0) {
      const live = liveCompare(state.verify.items, state.items);
      if (live.ok) {
        verifyLine = { text: live.complete ? '✓ 1回目と同じです（＝ で確かめる）' : '✓ ここまで1回目と同じです', cls: 'ok' };
      } else {
        verifyLine = { text: '✗ 赤い所が1回目とちがいます', cls: 'ng' };
        marks = live.marks;
      }
    }
    if (state.items.length === 0) {
      renderItems(exprEl, [], { tail: null });
      exprEl.prepend(span('placeholder', '0'));
      exprEl.append(span('caret', ''));
    } else {
      renderItems(exprEl, state.items, { caret: state.caret, ghostParens: true, marks });
    }
    fitExpression(44, 26);
    const withVerify = (lines) => (verifyLine ? [verifyLine, ...lines] : lines);
    if (state.error) {
      resultEl.classList.add('error');
      resultEl.style.fontSize = '';
      resultEl.textContent = state.error;
      setNotes(withVerify([]));
    } else {
      const p = preview(state.items);
      if (p?.value) {
        const form = fitForms(F.mainForms(p.value), 30, 18);
        shownValue = p.value;
        setNotes(withVerify(noteLines(p.notes, form.rounded)));
      } else if (p?.error) {
        resultEl.classList.remove('error');
        resultEl.style.fontSize = '18px';
        resultEl.textContent = p.error;
        setNotes(withVerify([]));
      } else {
        resultEl.classList.remove('error');
        resultEl.textContent = '';
        setNotes(withVerify([]));
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
    const items = closeParens(state.items);
    const first = state.verify;
    state.last = { items, value, notes };
    state.mode = 'done';
    state.error = '';
    state.verify = null;
    if (first) {
      // 照合：1回目とくらべて結果を出す（1回目と同じなら、履歴には増やさない）
      const result = fullCompare(first.items, items);
      if (!result.same) addHistory(items, value);
      render();
      openVerifyResult({
        first,
        second: { items, value },
        result,
        onEditFirst: () => { startEditing([...first.items]); render(); },
        onEditSecond: () => { startEditing([...items]); render(); },
        onRetry: () => startVerify(first),
      });
      return;
    }
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
// モード（電卓・お買い物）の切りかえ
// ---------------------------------------------------------
const VIEWS = { calc: '#calcView', shop: '#shopView', split: '#splitView', time: '#timeView' };
const currentMode = () => (VIEWS[settings.mode] ? settings.mode : 'calc');

function setMode(mode) {
  if (mode !== currentMode()) {
    settings = { ...settings, mode };
    saveSettings(settings);
  }
  applyMode();
}

function applyMode() {
  const mode = currentMode();
  for (const [name, selector] of Object.entries(VIEWS)) $(selector).hidden = name !== mode;
  for (const b of document.querySelectorAll('#modes [data-mode]')) {
    const on = b.dataset.mode === mode;
    b.setAttribute('aria-selected', String(on));
    // モードが多くて横にはみ出すときは、えらんだモードが見えるように
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  fadeModes();
  if (mode === 'calc') render();
  else if (mode === 'shop') showShop();
  else if (mode === 'split') showSplit();
  else showTime();
}

// ---------------------------------------------------------
// 検算
// ---------------------------------------------------------

// 照合をはじめる：式を空にして、もう一度打ってもらう
function startVerify(first) {
  closeHistory();
  setMode('calc');
  state.verify = { items: [...first.items], value: first.value };
  startEditing([]);
  render();
  toast('同じ計算を、もう一度打ってください');
}

function stopVerify() {
  state.verify = null;
  render();
}

function showCheck(items, value, name = '') {
  openCheck({ items, value, name, onVerify: () => startVerify({ items, value }) });
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
    if (currentMode() !== 'calc') return;
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
  // ✓ 検算（＝ のあと）
  $('#btnCheck').addEventListener('click', () => {
    if (state.mode === 'done') showCheck(state.last.items, state.last.value);
  });
  $('#btnVerifyStop').addEventListener('click', stopVerify);
  // 画面の大きさが変わったら、文字の大きさを合わせ直す
  window.addEventListener('resize', () => {
    if (currentMode() === 'calc') render();
    fadeModes();
  });
  // 上の「電卓｜お買い物｜…」
  $('#modes').addEventListener('click', (event) => {
    const b = event.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });
  $('#modes').addEventListener('scroll', fadeModes, { passive: true });
}

// 上のモードが横にはみ出しているとき、はしをうすくして「横に動かせる」とわかるように
function fadeModes() {
  const modes = $('#modes');
  modes.classList.toggle('fade-l', modes.scrollLeft > 2);
  modes.classList.toggle('fade-r', modes.scrollLeft + modes.clientWidth < modes.scrollWidth - 2);
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

// 数を「答え」の部品にして、電卓の式のカーソルのところに入れる（電卓の画面に切りかえる）
function useInCalc(value, label) {
  if (state.mode === 'done') startEditing([]);
  const next = insertRef(state, answerRef(value, label));
  startEditing(next.items, next.caret);
  setMode('calc');
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
      useInCalc(value, label);
    },
    // 履歴の「式を直す」（照合中ならやめる）
    onEditExpression(items) {
      state.verify = null;
      startEditing([...items]);
      setMode('calc');
    },
    // 履歴の「検算」
    onCheck(items, value, name) {
      showCheck(items, value, name);
    },
  });
  initShop({
    settings: () => settings,
    active: () => currentMode() === 'shop',
    // お買い物の「電卓で使う」：合計を電卓の式に入れる
    onUseTotal(value) {
      useInCalc(value);
      toast('合計を電卓の式に入れました');
    },
    // お買い物の「履歴に残す」
    onSaveHistory(items, value, meta) {
      addHistory(items, value, meta);
    },
    // お買い物の「割り勘する」：合計を割り勘の「払う合計」に入れる
    onSplit(value) {
      if (setSplitTotal(value)) {
        setMode('split');
        toast('お買い物の合計を、割り勘の「払う合計」に入れました');
      }
    },
  });
  initSplit({
    settings: () => settings,
    active: () => currentMode() === 'split',
    calcAnswer: () => state.last?.value ?? null,
    shopTotal: currentShopTotal,
  });
  initTime({
    settings: () => settings,
    active: () => currentMode() === 'time',
    // 時間の ＝・時給の「履歴に残す」
    onSaveHistory(items, value, meta) {
      addHistory(items, value, meta);
    },
    // 時間の答え・給料を電卓の式に入れる
    onUseInCalc(value, label) {
      useInCalc(value, label);
    },
  });
  applyMode();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
