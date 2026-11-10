// =========================================================
// キーを押したときに、式をどう変えるか（画面とは切り離した「きまり」だけ）
//
// state = { items: 式の部品の並び, caret: カーソルの位置（0 ＝ 先頭） }
// pressKey(state, key) は新しい state を返す。押せないキーなら null を返す。
//
// カーソルは式の途中にも置けるので、途中の数字を消したり足したりできる。
// ステップ14：「!」のすぐ後ろの「!」は「!!」（二重階乗）にする。
//             「,」は log( ⁿ√( gcd( lcm( の中で、数のすぐ後ろだけ。
// ステップ18：options.multiDot なら、1つの数に2つ目の小数点も打てる（電卓。直す途中のため）。
//             その数は赤くなり、直すまで答えは出ない（main.js）。「..」と続けては打てない。
// =========================================================
import { isDigit, isRef, isVar, openParens, BINARY_OPS, isFnToken, isOpen } from './calc.js';

const isBinary = (t) => typeof t === 'string' && BINARY_OPS.includes(t);
const isNumberPart = (t) => isDigit(t) || t === '.';
// 「数の終わり」として後ろに演算子や % をつけられるもの
const endsValue = (t) => isDigit(t) || t === '.' || t === ')' || t === '%' || t === '²'
  || t === '!' || t === '!!' || t === '#' || t === '⁻¹' || t === 'π' || t === 'e' || isVar(t) || isRef(t);
// そのすぐ後ろに演算子をつけられないもの（「(」や関数の頭、「,」）
const opensGroup = (t) => t === '(' || t === '√' || t === ',' || isFnToken(t);
// 「,」で数を区切れる関数
const COMMA_FNS = ['log(', 'root(', 'gcd(', 'lcm('];

// カーソルの左で、まだ閉じていない いちばん内側の「(」や関数（なければ null）
function innermostOpen(items, caret) {
  let depth = 0;
  for (let i = caret - 1; i >= 0; i--) {
    if (items[i] === ')') depth++;
    else if (isOpen(items[i])) {
      if (depth === 0) return items[i];
      depth--;
    }
  }
  return null;
}

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

export function pressKey(state, key, { multiDot = false } = {}) {
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
      if (items.slice(run.start, run.end).includes('.')) {
        // 小数点は1つの数に1つだけ（multiDot なら2つ目も。ただし「..」と続けては打てない）
        if (!multiDot || prev === '.' || items[caret] === '.') return null;
      }
      if (!isDigit(prev)) return insert(state, ['0', '.']);
      return insert(state, ['.']);
    }
    case '+':
    case '×':
    case '÷':
    case '^':
    case 'C':
    case 'P':
    case 'mod': {
      if (caret === 0) return null;
      if (opensGroup(prev)) return null;
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
    case '!':
      // 5! のあとの ! は 5!!（二重階乗）。5!! のあとは打てない（(5!)! は ( ) を使う）
      if (prev === '!') return replaceBefore(state, 1, ['!!']);
      if (prev === '!!') return null;
      if (!endsValue(prev)) return null;
      return insert(state, [key]);
    case '%':
    case '²':
    case '!!':
    case '#':
    case '⁻¹':
      if (!endsValue(prev)) return null;
      return insert(state, [key]);
    case ',':
      if (!endsValue(prev)) return null;
      if (!COMMA_FNS.includes(innermostOpen(items, caret))) return null;
      return insert(state, [',']);
    case '√':
    case '(':
    case 'π':
    case 'e':
    case 'x':
    case 'k':
      return insert(state, [key]);
    // 10ˣ と eˣ：「10^(」「e^(」を入れる（数字のすぐ後ろなら × をはさむ。210 にならないように）
    case 'pow10':
      return insert(state, [...(isNumberPart(prev) ? ['×'] : []), '1', '0', '^', '(']);
    case 'exp':
      return insert(state, ['e', '^', '(']);
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
      if (isFnToken(key)) return insert(state, [key]); // sin( など
      return null;
  }
}

// 部品（前の答えなど）をカーソルのところに入れる
export function insertRef(state, ref) {
  return insert(state, [ref]);
}
