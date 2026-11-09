// =========================================================
// 微分・積分・Σ・lim の画面（ステップ9）
//
//   上：微分｜積分｜Σ｜lim
//   まん中：答え（タップでくわしい表示）、式（f'(x) ＝ … など）、注意書き
//   下：f(x) の欄と、x の値・下端・上端などの欄、キー（5列×7行）
//
// 打つたびに少し待ってから計算する（＝ はない）。計算は calculus-worker.js（別の働き手）で
// するので、時間がかかっても画面は固まらない。計算そのものは calculus.js。
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import * as S from './sci.js';
import { usesAngle, closeParens, isVar } from './calc.js';
import { pressKey } from './keys.js';
import { $, renderItems, span, caretFromPoint, toast, tokenText } from './ui.js';
import { el, button, shake, seg as segOf, setupPad } from './form.js';
import { openDetail } from './detail.js';
import { pDeriv, pIsZero } from './calculus.js';

const STORE_KEY = 'calculator.calculus';
const WAIT = 250;        // 打ち終わってから計算するまで（ミリ秒）
const BUSY_AFTER = 200;  // これより長くかかったら「計算しています…」を出す
const TIMEOUT = 30000;   // これより長くかかったらやめる

// 種類ごとの欄
const KINDS = {
  diff: {
    name: '微分', v: 'x', fields: ['f', 'a'],
    labels: { f: 'f(x) ＝', a: 'x ＝' },
    blank: { f: ['x', '²'], a: ['3'] },
    hints: {
      f: 'x の式（例：x³ − 2x、sin(x)、e^x）',
      a: 'どの x での傾き（微分係数）を出すか',
    },
  },
  int: {
    name: '積分', v: 'x', fields: ['f', 'lo', 'hi'],
    labels: { f: 'f(x) ＝', lo: '下端', hi: '上端' },
    blank: { f: ['x', '²'], lo: ['0'], hi: ['1'] },
    hints: {
      f: 'x の式（例：x²、sin(x)、1÷(1＋x²)）',
      lo: 'x のはじめ（∞ キーで ∞、もう一度で −∞）',
      hi: 'x の終わり（∞ キーで ∞、もう一度で −∞）',
    },
  },
  sum: {
    name: 'Σ', v: 'k', fields: ['f', 'lo', 'hi'],
    labels: { f: 'f(k) ＝', lo: 'k ＝', hi: 'まで' },
    blank: { f: ['k'], lo: ['1'], hi: ['1', '0', '0'] },
    hints: {
      f: 'k の式（k キーで k。例：k²、1÷k²、(1÷2)^k）',
      lo: 'k のはじめ（整数）',
      hi: 'k の終わり（整数。∞ キーで ∞）',
    },
  },
  lim: {
    name: 'lim', v: 'x', fields: ['f', 'at'],
    labels: { f: 'f(x) ＝', at: 'x →' },
    blank: { f: ['sin(', 'x', ')', '÷', 'x'], at: ['0'] },
    hints: {
      f: 'x の式（例：sin(x)÷x、(1＋1÷x)^x）',
      at: 'x を近づける先（∞ キーで ∞、もう一度で −∞）',
    },
  },
};
const PLACEHOLDER = { f: '式', a: '数', lo: '数', hi: '数', at: '数' };
const SIDES = [['both', '両側'], ['right', '右から'], ['left', '左から']];
const FN_KEY = { sin: 'sin(', cos: 'cos(', tan: 'tan(', ln: 'ln(', log: 'log(' };
// 微積分で使える部品（ステップ14で増やした関数は、微積分では使わない）
const CALCULUS_FNS = ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'log(', 'ln('];
const OK_PARTS = new Set([...'0123456789.+−×÷^()√²!πexk∞', ...CALCULUS_FNS]);

const newPer = (kind) => ({ ...structuredClone(KINDS[kind].blank), field: 'f', side: 'both' });
const st = {
  kind: 'diff',
  per: Object.fromEntries(Object.keys(KINDS).map((k) => [k, newPer(k)])),
  angle: 'rad',  // 微積分は rad がふつう（電卓の角度とは別に持つ）
  caret: null,   // えらんでいる欄のカーソル（null なら最後）
  fresh: false,  // 欄をえらんだ直後（打つと入れかわる）
};
let hooks = {};
let shown = null;      // いま出している答え { key, req, res }
let shownValue = null; // そのうち、電卓で使える数（lim の ∞ などは null）

const kind = () => KINDS[st.kind];
const per = () => st.per[st.kind];
const reject = (target, message) => {
  shake(target, hooks.settings());
  if (message) toast(message);
};

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ kind: st.kind, per: st.per, angle: st.angle }));
  } catch {
    // 保存できなくても、いまの計算には困らない
  }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!s || typeof s !== 'object') return;
    if (KINDS[s.kind]) st.kind = s.kind;
    st.angle = s.angle === 'deg' ? 'deg' : 'rad';
    for (const [k, def] of Object.entries(KINDS)) {
      const p = s.per?.[k];
      if (!p || typeof p !== 'object') continue;
      for (const f of def.fields) {
        const items = p[f];
        if (Array.isArray(items) && items.length <= 200 && items.every((t) => OK_PARTS.has(t))) st.per[k][f] = items;
      }
      if (def.fields.includes(p.field)) st.per[k].field = p.field;
      if (SIDES.some(([v]) => v === p.side)) st.per[k].side = p.side;
    }
  } catch {
    // 読めなければ、はじめから
  }
}

// ---------------------------------------------------------
// 計算（別の働き手で）
// ---------------------------------------------------------
let worker = null;
let workerFailed = false;
let inflight = null; // { id, resolve, timer }
let seq = 0;

function finish(res) {
  const job = inflight;
  inflight = null;
  clearTimeout(job.timer);
  job.resolve(res);
}

function makeWorker() {
  const w = new Worker(new URL('./calculus-worker.js', import.meta.url), { type: 'module' });
  w.addEventListener('message', (event) => {
    if (inflight && event.data.id === inflight.id) finish(event.data.res);
  });
  w.addEventListener('error', (event) => {
    // 働き手が使えない（古いブラウザなど）：この画面の中で計算する
    event.preventDefault();
    w.terminate();
    if (worker === w) worker = null;
    workerFailed = true;
    if (inflight) runHere(inflight.id, inflight.req);
  });
  return w;
}

async function runHere(id, req) {
  const { runJob } = await import('./calculus-job.js');
  await new Promise((resolve) => setTimeout(resolve, 30)); // 先に「計算しています…」を出す
  if (inflight?.id === id) finish(runJob(req));
}

// 計算を頼む。新しく頼むと、前の計算はやめる（null が返る）
function run(req) {
  if (inflight) {
    const old = inflight;
    inflight = null;
    clearTimeout(old.timer);
    old.resolve(null);
    worker?.terminate();
    worker = null;
  }
  return new Promise((resolve) => {
    const id = ++seq;
    inflight = {
      id, req, resolve,
      timer: setTimeout(() => {
        if (inflight?.id !== id) return;
        worker?.terminate();
        worker = null;
        finish({ ok: false, error: '時間がかかりすぎるので、計算をやめました（式や範囲を変えてみてください）', errorKind: 'timeout' });
      }, TIMEOUT),
    };
    if (workerFailed || typeof Worker === 'undefined') {
      runHere(id, req);
      return;
    }
    try {
      worker ??= makeWorker();
      worker.postMessage({ id, req });
    } catch {
      workerFailed = true;
      runHere(id, req);
    }
  });
}

function request(op = 'solve') {
  const p = per();
  const req = { op, kind: st.kind, angle: st.angle, f: p.f };
  for (const f of kind().fields) req[f] = p[f];
  if (st.kind === 'lim') req.side = p.side;
  return req;
}
const keyOf = (req) => JSON.stringify(req);

const cache = new Map(); // 同じ式の答えは覚えておく（タブを行き来しても、すぐ出る）
let waitTimer = null;
let busyTimer = null;

function schedule(delay = WAIT) {
  clearTimeout(waitTimer);
  waitTimer = setTimeout(compute, delay);
}

async function compute() {
  const req = request();
  const key = keyOf(req);
  if (shown?.key === key) return;
  if (cache.has(key)) {
    shown = { key, req, res: cache.get(key) };
    renderResult();
    return;
  }
  clearTimeout(busyTimer);
  busyTimer = setTimeout(renderBusy, BUSY_AFTER);
  const res = await run(req);
  if (res === null) return; // もっと新しい計算に代わった
  clearTimeout(busyTimer);
  if (res.errorKind !== 'timeout') {
    cache.set(key, res);
    if (cache.size > 30) cache.delete(cache.keys().next().value);
  }
  if (res.errorKind === 'bug') console.error(res.detail);
  shown = { key, req, res };
  if (hooks.active()) renderResult();
}

// ---------------------------------------------------------
// 文字にする小道具
// ---------------------------------------------------------
const itemsText = (items) => closeParens(items).map(tokenText).join('');
// 割り切れない短い分数（1/3 など）は分数のまま。0.1 のように割り切れる数は小数で
const terminates = (d) => {
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  return d === 1n;
};
function num(x, sig = 12) {
  if (x.q && x.d !== 1n && !terminates(x.d) && x.n.toString().length + x.d.toString().length <= 9) {
    return `${x.n < 0n ? '−' : ''}${x.n < 0n ? -x.n : x.n}/${x.d}`;
  }
  const f = F.compact(x, sig);
  return f.rounded ? `${f.text}…` : f.text;
}
const boundText = (b) => (b.inf ? (b.inf > 0 ? '∞' : '−∞') : num(b));

// 多項式 → 「x³/3 ＋ x²/2 ＋ x/6」
export function polyText(p, v = 'x') {
  if (pIsZero(p)) return '0';
  const parts = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (N.isZero(c)) continue;
    const neg = N.sign(c) < 0;
    const a = N.absNum(c);
    const xp = i === 0 ? '' : i === 1 ? v : `${v}${S.supText(i)}`;
    let body;
    if (a.q) {
      const top = a.n === 1n && i > 0 ? xp : `${a.n}${xp}`;
      body = a.d === 1n ? top : `${top}/${a.d}`;
    } else {
      body = `${num(a, 8)}${xp}`;
    }
    parts.push((parts.length ? (neg ? ' − ' : ' ＋ ') : neg ? '−' : '') + body);
  }
  return parts.join('') || '0';
}

// 答えの数を、大きく（欄に入る大きさで）
function showNumber(main, x) {
  main.classList.remove('error', 'muted');
  main.disabled = false;
  const forms = [];
  if (x.q && x.d !== 1n) {
    const n = x.n < 0n ? -x.n : x.n;
    if (n.toString().length + x.d.toString().length <= 30) {
      const sign = x.n < 0n ? '<span class="fr-sign">−</span>' : '';
      forms.push({ html: `${sign}<span class="fr"><span class="fr-n">${F.groupInt(n.toString())}</span><span class="fr-d">${F.groupInt(x.d.toString())}</span></span>`, frac: true });
    }
  }
  forms.push(...F.mainForms(x));
  for (const form of forms) {
    main.innerHTML = form.html;
    for (let px = 34; px >= 18; px -= 2) {
      main.style.fontSize = `${px}px`;
      if (main.scrollWidth <= main.clientWidth + 1) return form;
    }
  }
  return forms[forms.length - 1];
}

function showText(main, text, cls) {
  main.classList.remove('error', 'muted');
  if (cls) main.classList.add(cls);
  main.style.fontSize = cls ? '' : text.length > 2 ? '24px' : '';
  main.textContent = text;
  main.disabled = true;
}

// ---------------------------------------------------------
// 表示：欄
// ---------------------------------------------------------
export function showCalculus() {
  render();
  schedule(0);
}

function render() {
  for (const b of document.querySelectorAll('#cuTabs [data-kind]')) {
    b.setAttribute('aria-selected', String(b.dataset.kind === st.kind));
  }
  const k = kind();
  const p = per();
  for (const fb of document.querySelectorAll('#calculusView [data-cfield]')) {
    const f = fb.dataset.cfield;
    fb.hidden = !k.fields.includes(f);
    if (fb.hidden) continue;
    fb.querySelector('.lbl').textContent = k.labels[f];
    const ex = fb.querySelector('.cu-ex');
    const active = p.field === f;
    const items = p[f];
    if (!items.length) {
      ex.replaceChildren(span('placeholder', st.kind === 'sum' && f !== 'f' ? '整数' : PLACEHOLDER[f]));
      if (active) ex.append(span('caret', ''));
    } else {
      const caret = active && !st.fresh ? (st.caret ?? items.length) : null;
      renderItems(ex, items, { caret, ghostParens: f === 'f' });
    }
    fb.classList.toggle('active', active);
    fb.classList.toggle('fresh', active && st.fresh && items.length > 0);
    fb.setAttribute('aria-pressed', String(active));
    // 長い式は小さく
    ex.style.fontSize = '';
    for (let px = 22; px > 15 && ex.scrollWidth > ex.clientWidth + 1; px -= 2) ex.style.fontSize = `${px - 2}px`;
    if (active) ex.querySelector('.caret')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  $('#calculusView').dataset.kind = st.kind;
  $('#cuKeys [data-k="var"]').textContent = k.v;

  // lim の「両側・右から・左から」と、角度
  const opts = $('#cuOpts');
  opts.replaceChildren();
  if (st.kind === 'lim') {
    if (p.at[0] === '∞' || (p.at[0] === '−' && p.at[1] === '∞')) {
      opts.append(el('span', 'opts-text', '∞ へは片側から近づけます'));
    } else {
      opts.append(segOf(SIDES, p.side, (v) => { p.side = v; changed(); }, '近づけ方', hooks.settings()));
    }
  }
  if (usesAngle(p.f)) {
    const b = button('chip cu-angle', `角度：${st.angle === 'rad' ? 'rad' : '度'}`, toggleAngle);
    b.setAttribute('aria-label', '角度のモード（rad・度）を切りかえる');
    opts.append(b);
  }
  opts.hidden = !opts.childElementCount;
  $('#cuHint').textContent = k.hints[p.field];
  if (!shown) {
    // はじめての計算の前（働き手の用意に少しかかる）
    $('#cuLabel').textContent = problemText(request(), null);
    $('#cuCount').textContent = '計算しています…';
  }
  $('#cuCard').classList.toggle('stale', !shown || shown.key !== keyOf(request()));
  save();
}

function toggleAngle() {
  st.angle = st.angle === 'rad' ? 'deg' : 'rad';
  toast(st.angle === 'rad' ? '角度を rad にしました（微分・積分では、ふつうこちら）' : '角度を「度」にしました（x が度の数。sin(x) の微分は π/180 倍になります）');
  changed();
}

function changed() {
  render();
  schedule();
}

// ---------------------------------------------------------
// 表示：答え
// ---------------------------------------------------------
function renderBusy() {
  if (!hooks.active()) return;
  $('#cuCount').textContent = '計算しています…';
  $('#cuCard').classList.add('stale');
}

function renderResult() {
  const { req, res } = shown;
  const main = $('#cuMain');
  const sub = [];
  const notes = [];
  let label = '';
  let count = '';
  let value = null;    // 電卓で使える数

  // 答えの欄に入る大きさを決める前に、となりの「f'(3) ＝」を入れておく
  label = problemText(req, res.ok ? res : null);
  $('#cuLabel').textContent = label;
  if (!res.ok) {
    if (res.errorKind === 'empty') {
      showText(main, '—', 'muted');
      notes.push(res.error);
    } else if (res.errorKind === 'syntax' || res.errorKind === 'incomplete') {
      showText(main, '—', 'muted');
      notes.push(`式が途中か、形がちがいます：${res.error}`);
    } else {
      showText(main, res.error, 'error');
    }
  } else {
    const r = res;
    ({ value, count } = KIND_VIEW[req.kind](r, main, sub, notes, req));
    if (req.angle === 'deg' && usesAngle(req.f)) notes.push('角度は「度」で計算しています（x が度の数）。微分・積分では、ふつう rad を使います。');
  }
  $('#cuCount').textContent = count;
  $('#cuSub').replaceChildren(...sub.map((t) => el('div', '', t)));
  $('#cuNotes').replaceChildren(...notes.map((t) => (typeof t === 'string' ? el('p', '', t) : el('p', t.cls, t.text))));
  $('#btnCuCheck').hidden = !res.ok;
  $('#btnCuToCalc').hidden = !value;
  $('#cuCard').classList.toggle('stale', shown.key !== keyOf(request()));
  shownValue = value;
}

function problemText(req, r) {
  const v = KINDS[req.kind].v;
  if (req.kind === 'diff') return `f'(${itemsText(req.a) || '?'}) ＝`;
  if (req.kind === 'int') return `∫ ${itemsText(req.lo) || '?'}→${itemsText(req.hi) || '?'} ＝`;
  if (req.kind === 'sum') return `Σ ${v}＝${itemsText(req.lo) || '?'}→${itemsText(req.hi) || '?'} ＝`;
  const mark = !r || r.at?.inf ? '' : r.side === 'right' ? '＋' : r.side === 'left' ? '−' : '';
  return `lim ${v}→${itemsText(req.at) || '?'}${mark} ＝`;
}

// 数値で出した答えの、正しい桁の注意書き
const digitsNote = (how, digits) => (digits ? `${how}（上から ${digits} 桁は正しいはず。答えをタップで全部の桁）` : how);

const KIND_VIEW = {
  diff(r, main, sub, notes, req) {
    if (r.zero) showText(main, '0');
    else showNumber(main, r.d1);
    let count;
    if (r.method === 'series') {
      count = r.d1.q ? 'ちょうど' : '式から';
      notes.push(r.d1.q
        ? '式のまま計算した、ちょうどの値です（グラフの、この x での傾き）'
        : '式のまま（テイラー展開で）計算しました。誤差はほとんどありません（グラフの、この x での傾き）');
    } else {
      count = r.digits ? `上から${r.digits}桁` : '数値';
      notes.push(digitsNote('式のままでは計算できないので、x を少しずらした数で計算しました', r.digits));
      if (r.zero) notes.push('傾きは 0 になるようです（数値の計算では、とても小さい数）');
      if (r.side === 'right') notes.push({ text: 'x より左では f(x) が計算できないので、右側だけで出した傾きです', cls: 'warn' });
      if (r.side === 'left') notes.push({ text: 'x より右では f(x) が計算できないので、左側だけで出した傾きです', cls: 'warn' });
    }
    const at = itemsText(req.a);
    if (r.dpoly) sub.push(`f'(x) ＝ ${polyText(r.dpoly)}`);
    sub.push(`f(${at}) ＝ ${num(r.f)}${r.d2 ? `、f''(${at}) ＝ ${num(r.d2)}` : ''}`);
    sub.push(`接線：y ＝ ${polyText([r.tangent.icept, r.tangent.slope])}`);
    return { value: r.zero ? N.ZERO : r.d1, count };
  },

  int(r, main, sub, notes, req) {
    const value = r.approxZero ? N.ZERO : r.value;
    showNumber(main, value);
    let count;
    if (r.method === 'poly') {
      count = value.q ? 'ちょうど' : '式から';
      if (r.antider) sub.push(`F(x) ＝ ${polyText(r.antider)} ＋ C（原始関数）`);
      if (r.antider && !r.lo.inf && !r.hi.inf) sub.push(`F(${itemsText(req.hi)}) − F(${itemsText(req.lo)}) ＝ ${num(value)}`);
      notes.push('x の多項式なので、原始関数（微分すると f になる式）で計算した、ちょうどの値です');
    } else {
      count = r.digits ? `上から${r.digits}桁` : '数値';
      notes.push(digitsNote('数値積分（二重指数関数型）で計算しました', r.digits));
      if (r.approxZero) notes.push('答えは 0 になるようです（数値の計算では、とても小さい数）');
    }
    notes.push('グラフと x 軸の間の面積です（x 軸より下の所はマイナスで数えます）');
    if (r.reversed) notes.push('下端のほうが大きいので、上端から下端への積分のマイナスになります');
    return { value, count };
  },

  sum(r, main, sub, notes) {
    showNumber(main, r.value);
    const exact = r.value.q;
    const many = r.count ? `${F.groupInt(r.count.toString())}個の和` : '';
    let count = exact ? 'ちょうど' : r.digits ? `上から${r.digits}桁` : '数値';
    switch (r.method) {
      case 'empty':
        count = '';
        notes.push('終わりの k がはじめより小さいので、足す項がありません（答えは 0）');
        break;
      case 'formula':
        if (r.formula && !pIsZero(r.formula)) {
          const t = polyText(r.formula, 'n');
          sub.push(t.length <= 160 ? `S(n) ＝ ${t}（k ＝ ${r.lo} から n までの和）` : `S(n) は n の ${r.formula.length - 1} 次式（長いので省略）`);
        }
        if (many) sub.push(many);
        notes.push('k の多項式なので、和の公式 S(n) で計算した、ちょうどの値です');
        break;
      case 'direct':
        if (many) sub.push(many);
        notes.push(`1つずつ全部足しました${exact ? '（ちょうどの値）' : ''}`);
        break;
      case 'geometric':
        sub.push(`となりの項との比 ${num(r.ratio)}（等比数列）`);
        if (many) sub.push(many);
        notes.push(`等比数列の和の公式で計算しました${exact ? '（ちょうどの値）' : ''}`);
        break;
      case 'fast':
        if (many) sub.push(many);
        notes.push('項がすぐ小さくなるので、答えに効かなくなるまで1つずつ足しました（答えをタップで全部の桁）');
        break;
      case 'alternating':
        notes.push(digitsNote('符号が ＋ − 交互の和を、速く近づける方法（CVZ）で計算しました', r.digits));
        break;
      default:
        if (many) sub.push(many);
        notes.push(digitsNote(`${r.hi === Infinity ? '' : '項が1万個より多いので、'}オイラー・マクローリンの公式（積分と補正）で計算しました`, r.digits));
    }
    return { value: r.value, count };
  },

  lim(r, main, sub, notes) {
    const sideName = { right: '右から', left: '左から' };
    const infText = (sg) => (sg > 0 ? '∞' : '−∞');
    const valText = (x) => (x.kind === 'value' ? num(x.approxZero ? N.ZERO : x.value) : x.kind === 'inf' ? infText(x.sign) : 'なし');
    let value = null;
    let count = r.method === 'series' ? '式から' : '数値';
    switch (r.kind) {
      case 'value':
        value = r.approxZero ? N.ZERO : r.value;
        showNumber(main, value);
        if (r.method === 'series') {
          count = value.q ? 'ちょうど' : '式から';
          notes.push('x ＝ a ＋ h とおいて f を h の式（テイラー展開）にして、h → 0 で残る値です');
        } else {
          if (r.digits) count = `上から${r.digits}桁`;
          notes.push(digitsNote('x を近づけた数で計算しました', r.digits));
          if (r.approxZero) notes.push('0 に近づくようです（数値の計算では、とても小さい数）');
        }
        break;
      case 'inf':
        showText(main, infText(r.sign));
        notes.push(`限りなく${r.sign > 0 ? '大きく' : '小さく（マイナスに大きく）'}なります（極限の値はありません）`);
        break;
      case 'split':
        showText(main, '右と左でちがう');
        sub.push(`右から ${infText(r.right)}、左から ${infText(r.left)}`);
        notes.push('右から近づけたときと左から近づけたときで、ちがう向きに限りなく大きくなるので、極限の値はありません（「右から」「左から」でえらべます）');
        break;
      case 'differ':
        showText(main, '右と左でちがう');
        sub.push(`右から ${valText(r.right)}、左から ${valText(r.left)}`);
        notes.push('右から近づけたときと左から近づけたときで答えがちがうので、極限の値はありません（「右から」「左から」でえらべます）');
        break;
      default:
        showText(main, 'なし');
        notes.push('x を近づけても、1つの値に近づきません（ふれ続けるなど）');
    }
    if (r.oneSide) notes.push({ text: `${sideName[r.oneSide]}しか f(x) が計算できないので、${sideName[r.oneSide]}の極限です`, cls: 'warn' });
    if (r.at?.inf) notes.push(`x を ${r.at.inf > 0 ? '大きく' : 'マイナスに大きく'}していったときの値です`);
    return { value, count };
  },
};

// ---------------------------------------------------------
// キー
// ---------------------------------------------------------
function press(key, target) {
  const p = per();
  const field = p.field;
  const items = p[field];
  if (key === 'next') return moveField(1);
  if (key === 'inf') return pressInf(target);
  if (key === 'var') {
    if (field !== 'f') return reject(target, `ここには ${kind().v} は入れられません（数を打ちます）`);
    key = kind().v;
  }
  key = FN_KEY[key] ?? key;
  if (field === 'f' && isVar(key) && key !== kind().v) return reject(target);

  let state = { items, caret: st.fresh ? items.length : Math.min(st.caret ?? items.length, items.length) };
  const typing = !['back', 'left', 'right', 'clear'].includes(key);
  // ∞ の入った欄・えらんだ直後の欄は、打ちはじめると入れかわる（＋ × ÷ などは続きに）
  const continues = ['+', '×', '÷', '^', '!', '²', ')'].includes(key);
  if (typing && (items.includes('∞') || (st.fresh && !continues))) state = { items: [], caret: 0 };
  if (key === 'back' && items.includes('∞')) state = { items: [], caret: 0 };
  const next = key === 'back' && items.includes('∞') ? state : pressKey(state, key);
  if (!next) return reject(target);
  p[field] = next.items;
  st.caret = next.caret;
  st.fresh = false;
  changed();
}

// ∞ キー：∞ → −∞ → ∞ …（f の欄・Σ のはじめには使えない）
function pressInf(target) {
  const p = per();
  const field = p.field;
  if (field === 'f' || field === 'a') return reject(target, '∞ は、下端・上端や「x →」の欄で使えます');
  if (st.kind === 'sum' && field === 'lo') return reject(target, 'はじめの k は整数にします（∞ は「まで」の欄で）');
  const items = p[field];
  const isPos = items.length === 1 && items[0] === '∞';
  if (st.kind === 'sum') p[field] = ['∞'];
  else p[field] = isPos || (items.length === 1 && items[0] === '−') ? ['−', '∞'] : ['∞'];
  st.caret = null;
  st.fresh = false;
  changed();
}

function moveField(step) {
  const fields = kind().fields;
  const p = per();
  p.field = fields[(fields.indexOf(p.field) + step + fields.length) % fields.length];
  st.caret = null;
  st.fresh = p.field !== 'f' && p[p.field].length > 0;
  render();
}

function pickField(f, event) {
  const p = per();
  if (p.field === f) {
    // もう一度タップ：その位置にカーソル
    const ex = $(`#calculusView [data-cfield="${f}"] .cu-ex`);
    st.caret = caretFromPoint(ex, event.clientX, event.clientY, p[f].length);
    st.fresh = false;
  } else {
    p.field = f;
    st.caret = null;
    st.fresh = f !== 'f' && p[f].length > 0;
  }
  render();
}

function pickKind(k) {
  if (k === st.kind) return;
  st.kind = k;
  st.caret = null;
  st.fresh = false;
  render();
  schedule(0);
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
const hint = (text) => el('p', 'hint', text);
function checked(text, ok) {
  const d = el('div', 'rev', `${text} `);
  d.append(el('span', `mark ${ok ? 'ok' : 'ng'}`, ok ? '✓' : '✗'));
  return d;
}
const absDiff = (x, y) => N.absNum(N.sub(x, y));
const log10 = (x) => (N.isZero(x) ? -Infinity : N.approxLog10(N.absNum(x)));

// 近づいていく数の並び（vals）が、答え（target）に近づいているか
function approaches(vals, target, tiny = -8) {
  const errs = vals.map((v) => log10(absDiff(v, target)));
  const scale = Math.max(0, log10(target));
  const last = errs[errs.length - 1];
  if (last === -Infinity || last < scale + tiny) return true;
  return errs.every((e, i) => i === 0 || e <= errs[i - 1] + 1e-9) && last < errs[0];
}

let checkToken = 0;
async function openCalculusCheck() {
  if (!shown?.res.ok) return;
  const req = { ...shown.req, op: 'check' };
  const dialog = $('#checkDialog');
  $('#checkTitle').textContent = `${KINDS[req.kind].name}の検算`;
  const body = $('#checkBody');
  body.replaceChildren(el('p', 'hint', '計算しています…'));
  if (!dialog.open) dialog.showModal();
  const token = ++checkToken;
  const res = await run(req);
  schedule(0); // 検算で止めた計算があれば、やり直す
  if (token !== checkToken || !dialog.open || res === null) return;
  body.replaceChildren();
  if (!res.ok) {
    body.append(el('p', 'summary ng', `検算の計算ができませんでした：${res.error}`));
    return;
  }
  const ok = CHECK_VIEW[req.kind](res, body, req);
  body.prepend(el('p', `summary ${ok ? 'ok' : 'ng'}`, ok ? '✓ 別の方法で計算しても、答えと合います' : '✗ 合わない所があります（下を見てください）'));
}

const CHECK_VIEW = {
  diff(c, body, req) {
    const { ans, rows } = c;
    const d1 = ans.zero ? N.ZERO : ans.d1;
    const a = itemsText(req.a);
    const list = el('div');
    for (const row of rows) {
      const h = num(row.h);
      const neg = N.sign(row.h) < 0;
      list.append(line(`h ＝ ${h}：(f(${a} ${neg ? '−' : '＋'} ${num(N.absNum(row.h))}) − f(${a})) ÷ ${neg ? `(${h})` : h} ＝ ${num(row.value)}`));
    }
    const near = approaches(rows.map((r) => r.value), d1, -3);
    list.append(checked(`h を小さくすると、答えの ${num(d1)} に近づきます`, near));
    list.append(hint('傾き ＝ 高さの差 ÷ 横の差。h（横の差）を小さくしていくと、グラフのこの点での傾き（微分係数）に近づきます。'));
    body.append(section('1. 差の商で近づける', list));
    let ok = near;
    if (ans.dpoly) {
      const same = N.cmp(c.polyAt, d1) === 0;
      ok &&= same;
      body.append(section('2. 微分の公式で（xⁿ → n·xⁿ⁻¹）',
        line(`f'(x) ＝ ${polyText(ans.dpoly)}`),
        checked(`x ＝ ${a} を入れると ${num(c.polyAt)}`, same)));
    } else if (ans.method === 'series') {
      body.append(section('答えの出し方', hint('x ＝ a ＋ h とおいて f を h の式（テイラー展開）に直し、h の係数を取り出しています。上の差の商は、それを別の方法で確かめたものです。')));
    }
    return ok;
  },

  int(c, body, req) {
    const { ans, rows } = c;
    const value = ans.approxZero ? N.ZERO : ans.value;
    const list = el('div');
    const vals = [];
    for (const row of rows) {
      const head = row.n ? `${row.n}等分` : `${num(row.a)} 〜 ${num(row.b)}`;
      if (row.error) list.append(line(`${head}：計算できません（${row.error}）`));
      else {
        vals.push(row.value);
        list.append(line(`${head}：${num(row.value)}`));
      }
    }
    const near = vals.length >= 2 && approaches(vals, value, -6);
    if (rows[0]?.n) {
      list.append(checked(`細かくすると、答えの ${num(value)} に近づきます`, near));
      list.append(hint('区間を等分した細い長方形（高さは まん中の f(x)）の面積を足しています。端で限りなく大きくなる式などは、近づき方がゆっくりです。'));
    } else {
      list.append(checked(`広げると、答えの ${num(value)} に近づきます`, near));
      list.append(hint('∞ のかわりに 10・100・1000 までで積分しています。'));
    }
    body.append(section(rows[0]?.n ? '1. 細い長方形で近づける' : '1. ∞ のかわりに大きな数まで', list));
    let ok = near;
    if (c.antiCheck) {
      const { back, same, Fhi, Flo } = c.antiCheck;
      ok = same && (Fhi === null || N.cmp(N.sub(Fhi, Flo), value) === 0);
      const sec = section('2. 原始関数を微分してもどす',
        line(`F(x) ＝ ${polyText(ans.antider)}`),
        checked(`F'(x) ＝ ${polyText(back)} ＝ f(x)`, same));
      if (Fhi !== null) sec.append(checked(`F(${itemsText(req.hi)}) − F(${itemsText(req.lo)}) ＝ ${num(Fhi)} − ${N.sign(Flo) < 0 ? `(${num(Flo)})` : num(Flo)} ＝ ${num(N.sub(Fhi, Flo))}`, ok));
      body.append(sec);
    }
    return ok;
  },

  sum(c, body, req) {
    const { ans, terms, partial } = c;
    const v = KINDS[req.kind].v;
    const head = el('div');
    for (const t of terms) head.append(line(`${v} ＝ ${t.k}：${t.error ? `計算できません（${t.error}）` : num(t.value)}`));
    body.append(section('1. はじめの項', head));
    let ok = true;
    if (partial.length) {
      const list = el('div');
      const vals = [];
      for (const ps of partial) {
        if (ps.error) { list.append(line(`計算できません（${ps.error}）`)); continue; }
        vals.push(ps.value);
        list.append(line(`${v} ＝ ${ans.lo} 〜 ${ps.upto}（${F.groupInt(String(ps.n))}個）：${num(ps.value)}`));
      }
      if (c.all) {
        const same = vals.length > 0 && N.cmp(vals[vals.length - 1], ans.value) === 0;
        ok &&= same;
        list.append(checked('1つずつ全部足すと、答えと同じ', same));
      } else if (ans.hi === Infinity && vals.length >= 2) {
        const near = approaches(vals, ans.value, -6);
        ok &&= near;
        list.append(checked(`足す数をふやすと、答えの ${num(ans.value)} に近づきます`, near));
        if (ans.method === 'em' || ans.method === 'alternating') list.append(hint('ゆっくり近づく和は、1000個足しても まだ答えから少し離れています。答えは、残りの分を公式で足して出しています。'));
      }
      body.append(section('2. 途中までの和', list));
    }
    if (c.formulaCheck) {
      const fc = c.formulaCheck;
      ok &&= fc.same;
      const sec = section('3. 和の公式 S(n) を確かめる',
        line(`S(n) ＝ ${polyText(ans.formula, 'n')}`),
        checked(`S(${ans.lo - 1n}) ＝ 0（まだ何も足していない）`, fc.zero),
        checked(`S(${fc.n1}) − S(${ans.lo}) ＝ ${num(fc.s1)} − ${num(fc.s0)} ＝ ${num(N.sub(fc.s1, fc.s0))} ＝ f(${fc.n1})`, N.cmp(N.sub(fc.s1, fc.s0), fc.f1) === 0),
        checked('S(n) − S(n − 1) ＝ f(n) が、どの n でも成り立ちます', fc.same));
      if (fc.sHi) sec.append(line(`S(${ans.hi}) ＝ ${num(fc.sHi)}`));
      sec.append(hint('S(n) は「n までの和」。1つ前との差が f(n) になっていれば、S(n) は正しい和の公式です。'));
      body.append(sec);
    }
    if (ans.method === 'geometric' && terms[0]?.value) {
      const a0 = terms[0].value;
      const r = ans.ratio;
      body.append(section('等比数列の公式', ans.hi === Infinity
        ? line(`はじめの項 ÷ (1 − 比) ＝ ${num(a0)} ÷ (1 − ${N.sign(r) < 0 ? `(${num(r)})` : num(r)}) ＝ ${num(N.div(a0, N.sub(N.ONE, r)))}`)
        : line(`はじめの項 × (1 − 比^個数) ÷ (1 − 比)（個数 ${F.groupInt(String(ans.count))}）`)));
    }
    return ok;
  },

  lim(c, body) {
    const { ans, tables } = c;
    const name = { right: '右から（a より少し大きい x）', left: '左から（a より少し小さい x）', inf: 'x を大きくしていく' };
    let ok = true;
    for (const tb of tables) {
      const list = el('div');
      const vals = [];
      for (const row of tb.rows) {
        if (row.error) list.append(line(`x ＝ ${num(row.x)}：計算できません`));
        else {
          vals.push(row.value);
          list.append(line(`x ＝ ${num(row.x)}：f(x) ＝ ${num(row.value)}`));
        }
      }
      // この側で近づく先：数、'inf'（限りなく大きく）、null（なし）
      const one = ans.kind === 'differ' ? (tb.side === 'left' ? ans.left : ans.right) : ans;
      const target = one.kind === 'value' ? (one.approxZero ? N.ZERO : one.value)
        : one.kind === 'inf' || one.kind === 'split' ? 'inf' : null;
      if (target === 'inf') {
        const grow = vals.length >= 2 && log10(vals[vals.length - 1]) > log10(vals[0]) + 1;
        ok &&= grow;
        list.append(checked('x を近づけると、限りなく大きくなっていきます', grow));
      } else if (target) {
        const near = vals.length >= 2 && approaches(vals, target, -4);
        ok &&= near;
        list.append(checked(`x を近づけると ${num(target)} に近づきます`, near));
      }
      body.append(section(name[tb.side === 'inf' || ans.at?.inf ? 'inf' : tb.side], list));
    }
    if (ans.method === 'series') body.append(hint('答えは、x ＝ a ＋ h とおいて f を h の式（テイラー展開）にして出しています。表は、実際に x を近づけて計算した値です。'));
    return ok;
  },
};

// ---------------------------------------------------------
// つなぐ
// ---------------------------------------------------------
// h = { settings(), active(), onUseInCalc(value, label) }
export function initCalculus(h) {
  hooks = h;
  load();
  $('#cuTabs').addEventListener('click', (event) => {
    const b = event.target.closest('[data-kind]');
    if (b) pickKind(b.dataset.kind);
  });
  for (const fb of document.querySelectorAll('#calculusView [data-cfield]')) {
    fb.addEventListener('click', (event) => pickField(fb.dataset.cfield, event));
  }
  $('#cuMain').addEventListener('click', () => {
    if (shownValue) openDetail(shownValue, { name: $('#cuLabel').textContent.replace(/ ＝$/, '') });
  });
  $('#btnCuCheck').addEventListener('click', openCalculusCheck);
  $('#btnCuToCalc').addEventListener('click', () => {
    if (!shownValue) return;
    hooks.onUseInCalc(shownValue, F.chipLabel(shownValue));
  });
  window.addEventListener('resize', () => {
    if (hooks.active() && shown) renderResult();
  });
  setupPad($('#cuKeys'), {
    press,
    settings: hooks.settings,
    active: hooks.active,
    keymap: {
      Backspace: 'back', Escape: 'clear', Delete: 'clear', ArrowLeft: 'left', ArrowRight: 'right',
      Enter: 'next', Tab: 'next', '.': '.', '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^',
      '(': '(', ')': ')', '!': '!', x: 'var', k: 'var',
    },
  });
}
