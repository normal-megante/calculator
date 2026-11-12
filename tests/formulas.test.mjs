// 公式集のデータ（js/formulas.js）のテスト
// 実行方法（calculator フォルダで）： node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMULA_CATS, ALL_FORMULAS, formulaById, plainOf, searchFormulas } from '../js/formulas.js';

test('公式のそろい方（名前は id なので重ならない・中身がある）', () => {
  const names = ALL_FORMULAS.map((f) => f.name);
  assert.equal(new Set(names).size, names.length, '同じ名前の公式があります');
  assert.equal(new Set(FORMULA_CATS.map((c) => c.key)).size, FORMULA_CATS.length);
  for (const c of FORMULA_CATS) assert.ok(c.items.length > 0, `${c.name} が空`);
  for (const f of ALL_FORMULAS) {
    assert.ok(f.name && f.f && f.v, `${f.name} の中身`);
    assert.equal(formulaById(f.name), f);
  }
  assert.equal(formulaById('ない公式'), null);
});

test('公式の HTML は、決まったタグだけで、閉じている', () => {
  for (const f of ALL_FORMULAS) {
    const tags = [...f.f.matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[1]);
    assert.deepEqual(tags.filter((t) => !['span', 'sup', 'sub', 'br'].includes(t)), [], f.name);
    for (const t of ['span', 'sup', 'sub']) {
      const open = (f.f.match(new RegExp(`<${t}[ >]`, 'g')) ?? []).length;
      const close = (f.f.match(new RegExp(`</${t}>`, 'g')) ?? []).length;
      assert.equal(open, close, `${f.name} の <${t}>`);
    }
    assert.doesNotMatch(f.f, /<span(?! class="fx-fr")(?!>)/, `${f.name}：span は分数だけ`);
    // 文字の説明・注意書きは、ふつうの文字（画面には textContent で出す）
    for (const text of [f.name, f.v, f.n ?? '', f.k ?? '']) assert.doesNotMatch(text, /[<>]/, f.name);
  }
});

test('検索用の文字（分数は「(上)/(下)」）', () => {
  const tri = formulaById('三角形の面積');
  assert.equal(plainOf(tri.f), 'S ＝ (1)/(2) × a × h');
  assert.equal(plainOf(formulaById('円の面積').f), 'S ＝ πr2');
});

test('さがす', () => {
  const names = (q) => searchFormulas(q).map((f) => f.name);
  assert.deepEqual(names(''), []);
  assert.ok(names('円').includes('円の面積'));
  assert.ok(names('オーム').includes('オームの法則'));
  assert.ok(names('解の公式').includes('2次方程式の解の公式'));
  assert.ok(names('ピタゴラス').includes('三平方の定理'));    // 検索用の言葉
  assert.ok(names('ＲＩ').includes('オームの法則'));            // 全角の英字も半角に
  assert.ok(names('ｖ ＝ fλ').includes('波の速さ'));           // 全角の英字も半角に
  assert.deepEqual(names('電気 並列'), ['合成抵抗', '合成容量']); // 言葉は全部ふくむもの
  assert.deepEqual(names('抵抗 並列 どの'), ['合成抵抗']);
  assert.ok(names('テスラ').includes('磁束密度と磁束'));
  assert.ok(names('電磁波').includes('電磁波の速さ'));
  assert.deepEqual(names('ぜんぜんない'), []);
});
