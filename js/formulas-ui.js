// =========================================================
// 公式集の画面（ステップ20）
//
//   上：種類（図形・立体・三平方…）と、さがす欄
//   下：公式の一覧。タップすると、その公式を電卓の上に出したまま計算できる（main.js の pinFormula）
//
// 公式のデータは formulas.js。計算はしない（見るだけ）
// =========================================================
import { FORMULA_CATS, searchFormulas } from './formulas.js';
import { $ } from './ui.js';
import { el, button } from './form.js';

const STORE_KEY = 'calculator.formula';
const st = { cat: FORMULA_CATS[0].key, query: '' };
let hooks = {};

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cat: st.cat }));
  } catch {
    // 保存できなくても困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (s && FORMULA_CATS.some((c) => c.key === s.cat)) st.cat = s.cat;
  } catch {
    // 読めなければ、はじめの種類
  }
}

export function showFormulas() {
  render();
  scrollSelected();
}

function render() {
  const searching = st.query !== '';
  for (const b of document.querySelectorAll('#fxCats [data-cat]')) {
    b.setAttribute('aria-selected', String(!searching && b.dataset.cat === st.cat));
  }
  const list = searching ? searchFormulas(st.query) : FORMULA_CATS.find((c) => c.key === st.cat).items;
  const pinned = hooks.pinned();
  $('#fxList').replaceChildren(...list.map((f) => card(f, { searching, pinned: f.name === pinned })));
  const empty = $('#fxEmpty');
  empty.hidden = list.length > 0;
  fadeEdges($('#fxCats'));
  save();
}

function card(f, { searching, pinned }) {
  const b = button(`fx-card${pinned ? ' pinned' : ''}`);
  b.dataset.fx = f.name;
  const head = el('div', 'fx-name', f.name);
  if (pinned) head.append(el('small', 'fx-tag', '電卓の上に出しています'));
  else if (searching) head.append(el('small', 'fx-cat', f.cat.name));
  const formula = el('div', 'fx-f');
  formula.innerHTML = f.f; // formulas.js の中で書いた HTML だけ
  b.append(head, formula, el('p', 'fx-v', f.v));
  if (f.n) b.append(el('p', 'fx-n', f.n));
  return b;
}

// 横にはみ出しているとき、はしをうすくする（横に動かせる印）
function fadeEdges(row) {
  row.classList.toggle('fade-l', row.scrollLeft > 2);
  row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
}

function scrollSelected() {
  const row = $('#fxCats');
  const b = row.querySelector('[aria-selected="true"]');
  if (b && row.clientWidth > 0) {
    const left = b.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + b.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = left - (row.clientWidth - b.offsetWidth) / 2;
    }
  }
  fadeEdges(row);
}

// h = { pinned() → 電卓の上に出している公式の名前, onPin(名前) }
export function initFormulas(h) {
  hooks = h;
  load();
  $('#fxCats').replaceChildren(...FORMULA_CATS.map((c) => {
    const b = button('', c.name);
    b.dataset.cat = c.key;
    b.setAttribute('role', 'tab');
    return b;
  }));
  $('#fxCats').addEventListener('click', (event) => {
    const b = event.target.closest('[data-cat]');
    if (!b) return;
    st.cat = b.dataset.cat;
    st.query = '';
    $('#fxSearch').value = '';
    render();
    scrollSelected();
    $('#fxList').scrollTop = 0;
  });
  $('#fxCats').addEventListener('scroll', () => fadeEdges($('#fxCats')), { passive: true });
  $('#fxSearch').addEventListener('input', (event) => {
    st.query = event.target.value.trim();
    render();
    $('#fxList').scrollTop = 0;
  });
  $('#fxList').addEventListener('click', (event) => {
    const b = event.target.closest('[data-fx]');
    if (b) hooks.onPin(b.dataset.fx);
  });
}
