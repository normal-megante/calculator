// =========================================================
// キーを押したときに、式をどう変えるか（画面とは切り離した「きまり」だけ）
//
// state = { items: 式の部品の並び, caret: カーソルの位置（0 ＝ 先頭） }
// pressKey(state, key) は新しい state を返す。押せないキーなら null を返す。
//
// カーソルは式の途中にも置けるので、途中の数字を消したり足したりできる。
// =========================================================
import { isDigit, isRef, openParens, BINARY_OPS } from './calc.js';

const isBinary = (t) => typeof t === 'string' && BINARY_OPS.includes(t);
const isNumberPart = (t) => isDigit(t) || t === '.';
// 「数の終わり」として後ろに演算子や % をつけられるもの
const endsValue = (t) => isDigit(t) || t === '.' || t === ')' || t === '%' || t === '²' || isRef(t);

// カーソルのところにある数（数字と小数点のかたまり）の範囲
function numberRunAround(items, caret) {
  let start = caret;
  while (start > 0 && isNumberPart(items[start - 1])) start--;
  let end = caret;
  while (end < items.length && isNumberPart(items[end])) end++;
  return { start, end };
}

function insert(state, parts) {
  const items = [...state.items];
  items.splice(state.caret, 0, ...parts);
  return { items, caret: state.caret + parts.length };
}

// カーソルの左の部品を n 個消してから parts を入れる
function replaceBefore(state, n, parts) {
  const items = [...state.items];
  items.splice(state.caret - n, n, ...parts);
  return { items, caret: state.caret - n + parts.length };
}

export function pressKey(state, key) {
  const { items, caret } = state;
  const prev = items[caret - 1];
  const prev2 = items[caret - 2];

  if (isDigit(key)) {
    // 数の先頭の 0 は、次の数字で置きかえる（「07」ではなく「7」）
    const run = numberRunAround(items, caret);
    const runText = items.slice(run.start, run.end).join('');
    if (runText === '0' && caret === run.end) {
      return key === '0' ? null : replaceBefore(state, 1, [key]);
    }
    return insert(state, [key]);
  }

  switch (key) {
    case '00': {
      const run = numberRunAround(items, caret);
      if (run.start === caret) return pressKey(state, '0'); // 数の頭なら 0 を1つだけ
      const runText = items.slice(run.start, run.end).join('');
      if (runText === '0') return null;
      return insert(state, ['0', '0']);
    }
    case '.': {
      const run = numberRunAround(items, caret);
      if (items.slice(run.start, run.end).includes('.')) return null; // 小数点は1つの数に1つだけ
      if (!isDigit(prev)) return insert(state, ['0', '.']);
      return insert(state, ['.']);
    }
    case '+':
    case '×':
    case '÷':
    case '^': {
      if (caret === 0) return null;
      if (prev === '(' || prev === '√') return null;
      if (isBinary(prev)) {
        // 「5×−」のあとに＋なら、2つとも置きかえて「5＋」
        const n = prev === '−' && isBinary(prev2) ? 2 : 1;
        if (caret - n === 0) return null;
        return replaceBefore(state, n, [key]);
      }
      return insert(state, [key]);
    }
    case '−': {
      // − は「マイナスの数」にも使うので、どこでも入れられる。＋や−のすぐ後なら置きかえ
      if (prev === '+' || prev === '−') return replaceBefore(state, 1, ['−']);
      return insert(state, ['−']);
    }
    case '%':
    case '²':
      if (!endsValue(prev)) return null;
      return insert(state, [key]);
    case '√':
    case '(':
      return insert(state, [key]);
    case ')':
      if (openParens(items, caret) === 0) return null;
      if (!endsValue(prev)) return null;
      return insert(state, [')']);
    case 'back':
      if (caret === 0) return null;
      return replaceBefore(state, 1, []);
    case 'left':
      return caret > 0 ? { items, caret: caret - 1 } : null;
    case 'right':
      return caret < items.length ? { items, caret: caret + 1 } : null;
    case 'clear':
      return items.length ? { items: [], caret: 0 } : null;
    default:
      return null;
  }
}

// 部品（前の答えなど）をカーソルのところに入れる
export function insertRef(state, ref) {
  return insert(state, [ref]);
}
