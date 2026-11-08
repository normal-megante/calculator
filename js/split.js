// =========================================================
// 割り勘の計算（画面とは切り離した計算だけ）
//
// 人の組 group = {
//   id, name,
//   count: '4'（人数）,
//   fixed: false … 倍率と＋円で分ける / true … 金額指定（この組の人は1人 amount 円だけ払う）,
//   mult: '1.5'（倍率。空なら 1）, plus: '500'（＋円。空なら 0）, minus: true なら −円,
//   amount: '3000'（金額指定のときの1人の額）,
// }
// 一部の人だけで払う物 part = { id, name, amount: '8000', members: [group id, …] }
//   → えらんだ組の人で等分する（倍率・＋円は使わない）
//
// 1人あたり（ちょうど）＝ 倍率 × 1倍あたり ＋ ＋円 ＋ 一部の人だけで払う物の分
//   1倍あたり ＝（合計 − 払う物 − 金額指定 − ＋円）÷（倍率×人数 の合計）
//   だから「1人あたり（ちょうど）× 人数」を全部足すと、ぴったり合計になる。
//
// 端数 opts = { unit: 1 | 10 | 100 | 500 | 1000, how, payer }
//   how 'up'    … 1人あたりを単位で切り上げ（多めに集める → 余りが出る）
//       'down'  … 単位で切り捨て（足りない分が出る）
//       'payer' … ほかの人は単位で四捨五入、幹事1人がぴったりになるように払う
//   payer … 幹事がいる組の id（いなければ、倍率で分ける最初の組）
//   金額指定の額は、打ったとおり（端数の調整をしない）
//
// 数はぜんぶ num.js の正確な分数で計算するので、誤差は出ない。
// =========================================================
import * as N from './num.js';
import * as F from './format.js';
import { amountOf, toYen } from './shop.js';

export const UNITS = [1, 10, 100, 500, 1000];
export const HOWS = {
  up: '切り上げ（余りが出る）',
  down: '切り捨て（足りない分が出る）',
  payer: '幹事がぴったりに合わせる',
};
export const DEFAULT_OPTS = { unit: 100, how: 'up', payer: null };

const sum = (list) => list.reduce((a, b) => N.add(a, b), N.ZERO);

// 単位（100円など）で丸める。way は 'up' 切り上げ・'down' 切り捨て・'near' 四捨五入
export function roundUnit(x, unit, way) {
  const u = N.frac(BigInt(unit));
  const mode = way === 'up' ? 'ceil' : way === 'down' ? 'floor' : 'round';
  return N.mul(toYen(N.div(x, u), mode), u);
}

// 組の名前（なければ番号で）
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
export function groupName(group, index, total) {
  if (group.name) return group.name;
  if (total === 1) return 'みんな';
  return `${index < CIRCLED.length ? CIRCLED[index] : `(${index + 1})`}の人`;
}

// 割り勘
// 返す値：{
//   ok, error（計算できないときの理由）, warning,
//   total, people: 人数の合計,
//   rows: [組ごと { id, count, fixed, mult, plus, partShare, exact: 1人あたり（ちょうど）, pay: 1人あたり（端数のあと）, subtotal }],
//   parts: [{ id, name, amount, members: [rows], count: 人数, share: 1人あたり }],
//   partsSum, fixedSum, plusSum, rest: 倍率で分ける分, weight: 倍率×人数の合計, perWeight: 1倍あたり,
//   exactSum: ちょうどの額×人数の合計（＝合計になるはず）,
//   payer: { row, pay }（幹事が調整するとき）, collected: 集まるお金, diff: 集まるお金 − 合計（＋なら余り、−なら足りない）,
// }
export function splitOf({ total, groups, parts = [] }, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const T = amountOf(total);
  const rows = groups.map((g, i) => {
    const fixed = !!g.fixed;
    let plus = !fixed && g.plus ? amountOf(g.plus) : N.ZERO;
    if (g.minus) plus = N.neg(plus);
    return {
      id: g.id,
      index: i,
      name: groupName(g, i, groups.length),
      count: g.count ? amountOf(g.count) : N.ZERO,
      fixed,
      mult: fixed ? N.ZERO : g.mult ? amountOf(g.mult) : N.ONE,
      plus,
      amount: fixed ? amountOf(g.amount) : null,
      partShare: N.ZERO,
      parts: [],
      exact: null,
      pay: null,
      subtotal: N.ZERO,
    };
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result = { ok: false, total: T, rows, parts: [], opts: o, people: sum(rows.map((r) => r.count)) };
  const fail = (error) => Object.assign(result, { error });

  if (N.isZero(T)) return fail('合計を打ってください');
  if (N.isZero(result.people)) return fail('人数を打ってください');

  // 一部の人だけで払う物
  for (const p of parts) {
    const amount = amountOf(p.amount);
    const members = (p.members ?? []).map((id) => byId.get(id)).filter((r) => r && !r.fixed && !N.isZero(r.count));
    const info = { id: p.id, name: p.name || '払う物', amount, members, count: sum(members.map((r) => r.count)), share: null };
    result.parts.push(info);
    if (N.isZero(amount)) continue;
    if (N.isZero(info.count)) return fail(`「${info.name}」を払う人をえらんでください`);
    info.share = N.div(amount, info.count);
    for (const r of members) {
      r.partShare = N.add(r.partShare, info.share);
      r.parts.push(info);
    }
  }
  result.partsSum = sum(result.parts.map((p) => p.amount));

  // 金額指定・＋円・倍率
  result.fixedSum = sum(rows.filter((r) => r.fixed).map((r) => N.mul(r.amount, r.count)));
  result.plusSum = sum(rows.filter((r) => !r.fixed).map((r) => N.mul(r.plus, r.count)));
  result.weight = sum(rows.filter((r) => !r.fixed).map((r) => N.mul(r.mult, r.count)));
  result.rest = N.sub(N.sub(N.sub(T, result.partsSum), result.fixedSum), result.plusSum);
  if (N.sign(result.rest) < 0) {
    return fail('合計より、払う物・金額指定・足す円の合計のほうが大きくなっています');
  }
  if (N.isZero(result.weight)) {
    if (!N.isZero(result.rest)) return fail('倍率で分ける人がいません（全員が金額指定か、倍率が 0）');
    result.perWeight = N.ZERO;
  } else {
    result.perWeight = N.div(result.rest, result.weight);
  }

  // 1人あたり（ちょうど）
  for (const r of rows) {
    r.exact = r.fixed ? r.amount : N.add(N.add(N.mul(r.mult, result.perWeight), r.plus), r.partShare);
    if (N.sign(r.exact) < 0) return fail(`「${r.name}」の1人あたりがマイナスになります（−円が大きすぎます）`);
  }
  result.exactSum = sum(rows.map((r) => N.mul(r.exact, r.count)));

  // 端数
  const { unit } = o;
  let how = o.how;
  if (how === 'payer') {
    const ok = (r) => r && !r.fixed && !N.isZero(r.count);
    const payer = ok(byId.get(o.payer)) ? byId.get(o.payer) : rows.find(ok);
    if (!payer) {
      how = 'up';
      result.warning = '幹事にできる人がいないので、切り上げにしています';
    } else {
      for (const r of rows) r.pay = r.fixed ? r.amount : roundUnit(r.exact, unit, 'near');
      let others = N.ZERO;
      for (const r of rows) {
        const n = r === payer ? N.sub(r.count, N.ONE) : r.count;
        others = N.add(others, N.mul(r.pay, n));
      }
      const pay = N.sub(T, others);
      result.payer = { row: payer, pay };
      for (const r of rows) r.subtotal = N.mul(r.pay, r.count);
      payer.subtotal = N.add(N.mul(payer.pay, N.sub(payer.count, N.ONE)), pay);
      if (N.sign(pay) < 0) result.warning = '幹事の分がマイナスになります（単位を小さくしてください）';
    }
  }
  if (how !== 'payer') {
    for (const r of rows) {
      r.pay = r.fixed ? r.amount : roundUnit(r.exact, unit, how);
      r.subtotal = N.mul(r.pay, r.count);
    }
  }
  result.how = how;
  result.collected = sum(rows.map((r) => r.subtotal));
  result.diff = N.sub(result.collected, T);
  result.ok = true;
  return result;
}

const num = F.amountText;
const yen = F.yenText;

// 余り・足りない分のことば
export function diffText(diff) {
  if (N.sign(diff) > 0) return `余り ${yen(diff)}`;
  if (N.sign(diff) < 0) return `${yen(N.neg(diff))} 足りない`;
  return 'ぴったり';
}

// 結果の文（LINE などに貼る用）
export function summaryText(result) {
  if (!result.ok) return '';
  const lines = [`割り勘（合計 ${yen(result.total)}・${num(result.people)}人）`];
  for (const r of result.rows) {
    if (N.isZero(r.count)) continue;
    if (result.payer?.row === r) {
      if (N.cmp(r.count, N.ONE) === 0) lines.push(`${r.name}（幹事）：${yen(result.payer.pay)}`);
      else lines.push(`${r.name} ${num(r.count)}人：1人 ${yen(r.pay)}（幹事1人は ${yen(result.payer.pay)}）`);
    } else {
      lines.push(`${r.name} ${num(r.count)}人：1人 ${yen(r.pay)}`);
    }
  }
  lines.push(`集まるお金 ${yen(result.collected)}（${diffText(result.diff)}）`);
  return lines.join('\n');
}
