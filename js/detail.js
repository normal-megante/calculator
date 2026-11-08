// =========================================================
// 答えのくわしい表示（全部の桁・くり返し・指数・分数・読み方・桁数）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import { $, toast } from './ui.js';

const dialog = () => $('#detailDialog');

function section(title, ...children) {
  const sec = document.createElement('section');
  sec.className = 'd-sec';
  const h = document.createElement('h3');
  h.textContent = title;
  sec.append(h, ...children);
  return sec;
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function textEl(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.textContent = text;
  return e;
}

function copyButton(text, label = 'コピー') {
  const b = textEl('button', 'ghost', label);
  b.type = 'button';
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('コピーしました');
    } catch {
      toast('コピーできませんでした');
    }
  });
  return b;
}

// くり返す部分に線を引いた HTML
function repeatingHtml(full) {
  const { text, repeat } = full;
  if (!repeat) return escape(text);
  const point = text.indexOf('.');
  const before = text.slice(0, point + repeat.start);
  const rep = text.slice(point + repeat.start, point + repeat.start + repeat.digits.length);
  const after = text.slice(point + repeat.start + repeat.digits.length);
  return `${escape(before)}<span class="rep">${escape(rep)}</span>${escape(after)}`;
}

function escape(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function openDetail(value, { name = '' } = {}) {
  const body = $('#detailBody');
  body.replaceChildren();
  $('#detailTitle').textContent = name ? `「${name}」のくわしい表示` : '答えのくわしい表示';

  // 全部の桁
  const full = F.fullDigits(value);
  const big = el('div', 'd-big', full.kind === 'repeating' ? repeatingHtml(full) : full.html);
  const notes = [];
  if (full.kind === 'integer' || full.kind === 'finite') notes.push('四捨五入していない、正確な値です。');
  if (full.note) notes.push(full.note);
  if (full.kind === 'repeating') {
    if (full.repeat) {
      notes.push(`小数第${full.repeat.start}位から「${full.repeat.digits}」をずっとくり返す小数です（線の部分）。`);
    } else {
      notes.push('ずっと続く小数です。くり返しが長いので、途中までを出しています。');
    }
  }
  if (full.kind === 'approx') {
    notes.push('√ などの割り切れない計算や、とても大きな数をふくむので、上から50桁を四捨五入した値です。');
  }
  const row = el('div', 'd-row');
  row.append(copyButton(full.plain));
  const title = full.kind === 'approx' ? '答え（上から50桁）' : '全部の桁';
  body.append(section(title, big, ...notes.map((n) => textEl('p', 'hint', n)), row));

  // 万・億・兆
  const reading = F.japaneseReading(value);
  if (reading) {
    const items = [textEl('p', 'd-text', (reading.approx ? '約 ' : '') + reading.text)];
    if (reading.fraction) items.push(textEl('p', 'hint', '小数点より上（整数の部分）の読み方です。'));
    if (reading.approx && !reading.over) items.push(textEl('p', 'hint', '上から50桁より下は 0 として読んでいます。'));
    body.append(section('読み方', ...items));
  }

  // 指数
  const digits = F.integerDigits(value);
  // 大きい数・とても小さい数のときだけ（概数は上ですでに指数の形のことがあるので出さない）
  const small = !N.isZero(value) && N.roundSig(value, 1).exp <= -3;
  if (full.kind !== 'approx' && (digits > 12 || small)) {
    const sci = F.scientific(value);
    const items = [el('p', 'd-big', sci.html)];
    if (sci.rounded) items.push(textEl('p', 'hint', '上から50桁までを四捨五入しています。'));
    body.append(section('指数で表すと（×10の〇乗）', ...items));
  }

  // 分数
  const fr = F.fractionForm(value);
  if (fr) {
    if (fr.tooLong) {
      body.append(section('分数で表すと', textEl('p', 'hint', '分子と分母がとても長いので、省いています。')));
    } else {
      const items = [textEl('p', 'd-text', fr.text)];
      if (fr.mixed) items.push(textEl('p', 'd-text', `＝ ${fr.mixed}（帯分数）`));
      const r = el('div', 'd-row');
      r.append(copyButton(fr.text.replace(/,/g, '').replace('−', '-'), '分数をコピー'));
      body.append(section('分数で表すと', ...items, r));
    }
  }

  // 桁数
  if (digits >= 5) {
    body.append(section('桁数', textEl('p', 'd-text', `整数の部分が ${digits.toLocaleString()} 桁`)));
  }

  if (!dialog().open) dialog().showModal();
  dialog().scrollTop = 0;
}
