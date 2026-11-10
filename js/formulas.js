// =========================================================
// 公式集のデータ（ステップ20。画面なし・テストあり）
//
// 公式をタップすると、電卓の上に出したまま計算できる（main.js の showPin）。
//   name … 公式の名前（id もかねる。電卓の上に出している公式は、この名前で覚えておく）
//   f    … 公式（HTML。分数は fr(上, 下)、右上の小さい字は <sup>）
//   v    … 文字の意味（単位も）
//   n    … 注意書き（なくてもよい）
//   k    … 検索用の言葉（なくてもよい）
// =========================================================

// 分数（上と下）
const fr = (n, d) => `<span class="fx-fr"><span>${n}</span><span>${d}</span></span>`;
const HALF = fr('1', '2');
const THIRD = fr('1', '3');

export const FORMULA_CATS = [
  {
    key: 'area', name: '図形', items: [
      { name: '長方形の面積', f: 'S ＝ a × b', v: 'a：たて　b：よこ' },
      { name: '正方形の面積', f: 'S ＝ a<sup>2</sup>', v: 'a：1辺の長さ（対角線 d なら S ＝ d² ÷ 2）' },
      { name: '三角形の面積', f: `S ＝ ${HALF} × a × h`, v: 'a：底辺　h：高さ（底辺に垂直な長さ）' },
      { name: '平行四辺形の面積', f: 'S ＝ a × h', v: 'a：底辺　h：高さ' },
      { name: '台形の面積', f: `S ＝ ${HALF} × (a ＋ b) × h`, v: 'a：上底　b：下底　h：高さ' },
      { name: 'ひし形の面積', f: `S ＝ ${HALF} × a × b`, v: 'a, b：2本の対角線の長さ' },
      { name: '円の面積', f: 'S ＝ πr<sup>2</sup>', v: 'r：半径　π ≒ 3.14', k: 'えん まる' },
      { name: '円周の長さ', f: 'ℓ ＝ 2πr', v: 'r：半径（直径 × π と同じ）', k: 'えんしゅう' },
      { name: 'おうぎ形の面積', f: `S ＝ πr<sup>2</sup> × ${fr('x', '360')} ＝ ${HALF}ℓr`, v: 'r：半径　x：中心角（度）　ℓ：弧の長さ' },
      { name: 'おうぎ形の弧の長さ', f: `ℓ ＝ 2πr × ${fr('x', '360')}`, v: 'r：半径　x：中心角（度）', n: '中心角をラジアン θ で表すと ℓ ＝ rθ、面積は S ＝ ½r²θ' },
      { name: '多角形の内角の和', f: '180° × (n − 2)', v: 'n：角の数（外角の和はいつも 360°）' },
    ],
  },
  {
    key: 'solid', name: '立体', items: [
      { name: '直方体の体積', f: 'V ＝ a × b × c', v: 'a, b, c：たて・よこ・高さ' },
      { name: '立方体の体積', f: 'V ＝ a<sup>3</sup>', v: 'a：1辺の長さ' },
      { name: '角柱・円柱の体積', f: 'V ＝ S × h', v: 'S：底面積　h：高さ' },
      { name: '円柱の体積', f: 'V ＝ πr<sup>2</sup>h', v: 'r：底面の半径　h：高さ' },
      { name: '角すい・円すいの体積', f: `V ＝ ${THIRD} × S × h`, v: 'S：底面積　h：高さ', n: '同じ底面・高さの柱の 3分の1' },
      { name: '円すいの体積', f: `V ＝ ${THIRD}πr<sup>2</sup>h`, v: 'r：底面の半径　h：高さ' },
      { name: '球の体積', f: `V ＝ ${fr('4', '3')}πr<sup>3</sup>`, v: 'r：半径', k: 'きゅう ボール' },
      { name: '球の表面積', f: 'S ＝ 4πr<sup>2</sup>', v: 'r：半径' },
      { name: '円柱の表面積', f: 'S ＝ 2πr<sup>2</sup> ＋ 2πrh', v: 'r：底面の半径　h：高さ（底面2つ ＋ 側面）' },
      { name: '円すいの側面積', f: 'S ＝ πrℓ', v: 'r：底面の半径　ℓ：母線の長さ', n: '表面積は 底面 πr² を足す' },
    ],
  },
  {
    key: 'tri', name: '三平方・三角比', items: [
      { name: '三平方の定理', f: 'a<sup>2</sup> ＋ b<sup>2</sup> ＝ c<sup>2</sup>', v: 'c：斜辺（直角の向かいの辺）　a, b：ほかの2辺', n: '3 : 4 : 5、5 : 12 : 13 は直角三角形', k: 'ピタゴラス' },
      { name: '三角比', f: `sin θ ＝ ${fr('a', 'c')}　cos θ ＝ ${fr('b', 'c')}　tan θ ＝ ${fr('a', 'b')}`, v: 'c：斜辺　a：θ の向かいの辺　b：θ のとなりの辺（直角三角形）', k: 'サイン コサイン タンジェント' },
      { name: '三角比の関係', f: `sin<sup>2</sup>θ ＋ cos<sup>2</sup>θ ＝ 1<br>tan θ ＝ ${fr('sin θ', 'cos θ')}　1 ＋ tan<sup>2</sup>θ ＝ ${fr('1', 'cos<sup>2</sup>θ')}`, v: 'θ：角度' },
      { name: '正弦定理', f: `${fr('a', 'sin A')} ＝ ${fr('b', 'sin B')} ＝ ${fr('c', 'sin C')} ＝ 2R`, v: 'a, b, c：角 A, B, C の向かいの辺　R：外接円の半径' },
      { name: '余弦定理', f: 'a<sup>2</sup> ＝ b<sup>2</sup> ＋ c<sup>2</sup> − 2bc cos A', v: 'A：辺 b と c の間の角', n: 'A ＝ 90° なら三平方の定理になる' },
      { name: '三角形の面積（2辺と間の角）', f: `S ＝ ${HALF}ab sin C`, v: 'a, b：2辺　C：その間の角' },
      { name: 'ヘロンの公式', f: `S ＝ √(s(s − a)(s − b)(s − c))<br>s ＝ ${fr('a ＋ b ＋ c', '2')}`, v: 'a, b, c：3辺の長さ（3辺だけで面積がわかる）' },
      { name: '加法定理', f: 'sin(α ＋ β) ＝ sin α cos β ＋ cos α sin β<br>cos(α ＋ β) ＝ cos α cos β − sin α sin β', v: 'α, β：角度', n: '− のときは、β を −β にする（sin(−β) ＝ −sin β）' },
      { name: '2倍角の公式', f: 'sin 2θ ＝ 2 sin θ cos θ<br>cos 2θ ＝ cos<sup>2</sup>θ − sin<sup>2</sup>θ ＝ 1 − 2sin<sup>2</sup>θ', v: 'θ：角度' },
      { name: '度とラジアン', f: `180° ＝ π rad　1 rad ＝ ${fr('180°', 'π')} ≒ 57.3°`, v: 'rad：ラジアン（半径と同じ長さの弧の角度）', n: '変換は「単位」の「角度」で。電卓の角度は「関数」の「角度」で切りかえ', k: 'ラジアン 弧度法' },
    ],
  },
  {
    key: 'alg', name: '式・方程式', items: [
      { name: '展開の公式（2乗）', f: '(a ＋ b)<sup>2</sup> ＝ a<sup>2</sup> ＋ 2ab ＋ b<sup>2</sup><br>(a − b)<sup>2</sup> ＝ a<sup>2</sup> − 2ab ＋ b<sup>2</sup>', v: '因数分解は、この逆', k: 'てんかい いんすうぶんかい' },
      { name: '展開の公式（和と差）', f: '(a ＋ b)(a − b) ＝ a<sup>2</sup> − b<sup>2</sup><br>(x ＋ a)(x ＋ b) ＝ x<sup>2</sup> ＋ (a ＋ b)x ＋ ab', v: '因数分解は、この逆', k: 'てんかい いんすうぶんかい' },
      { name: '展開の公式（3乗）', f: '(a ＋ b)<sup>3</sup> ＝ a<sup>3</sup> ＋ 3a<sup>2</sup>b ＋ 3ab<sup>2</sup> ＋ b<sup>3</sup><br>a<sup>3</sup> ＋ b<sup>3</sup> ＝ (a ＋ b)(a<sup>2</sup> − ab ＋ b<sup>2</sup>)', v: '(a − b)³ は b を −b にする', k: 'てんかい いんすうぶんかい' },
      { name: '2次方程式の解の公式', f: `x ＝ ${fr('−b ± √(b<sup>2</sup> − 4ac)', '2a')}`, v: 'ax² ＋ bx ＋ c ＝ 0 の解（a ≠ 0）', n: 'b ＝ 2b′ なら x ＝ (−b′ ± √(b′² − ac)) ÷ a', k: 'かいのこうしき 二次方程式' },
      { name: '判別式', f: 'D ＝ b<sup>2</sup> − 4ac', v: 'D ＞ 0：実数の解が2つ　D ＝ 0：1つ（重解）　D ＜ 0：実数の解なし' },
      { name: '解と係数の関係', f: `α ＋ β ＝ −${fr('b', 'a')}　αβ ＝ ${fr('c', 'a')}`, v: 'α, β：ax² ＋ bx ＋ c ＝ 0 の2つの解' },
      { name: '2次関数の頂点', f: `y ＝ a(x − p)<sup>2</sup> ＋ q　頂点 (p, q)<br>p ＝ −${fr('b', '2a')}　q ＝ −${fr('b<sup>2</sup> − 4ac', '4a')}`, v: 'y ＝ ax² ＋ bx ＋ c を平方完成した形', k: 'へいほうかんせい' },
      { name: '直線の傾き', f: `a ＝ ${fr('y₂ − y₁', 'x₂ − x₁')}`, v: '(x₁, y₁)・(x₂, y₂)：直線が通る2点（y ＝ ax ＋ b の a）', k: 'かたむき 1次関数' },
      { name: '2点の間の距離', f: 'd ＝ √((x₂ − x₁)<sup>2</sup> ＋ (y₂ − y₁)<sup>2</sup>)', v: '(x₁, y₁)・(x₂, y₂)：2点', n: '三平方の定理と同じ考え方' },
      { name: '中点', f: `(${fr('x₁ ＋ x₂', '2')}, ${fr('y₁ ＋ y₂', '2')})`, v: '(x₁, y₁)・(x₂, y₂)：2点' },
    ],
  },
  {
    key: 'exp', name: '指数・対数・数列', items: [
      { name: '指数法則', f: 'a<sup>m</sup> × a<sup>n</sup> ＝ a<sup>m＋n</sup>　(a<sup>m</sup>)<sup>n</sup> ＝ a<sup>mn</sup><br>(ab)<sup>n</sup> ＝ a<sup>n</sup>b<sup>n</sup>　a<sup>0</sup> ＝ 1　a<sup>−n</sup> ＝ ' + fr('1', 'a<sup>n</sup>'), v: 'a：0 でない数' },
      { name: '対数（log）', f: 'a<sup>x</sup> ＝ M　⇔　x ＝ log<sub>a</sub>M', v: 'a：底（1 でない正の数）　M：正の数', n: 'この電卓の log は底が 10。底を変えるときは「関数」→「もっと」の log(底, 数)', k: 'ログ たいすう' },
      { name: '対数の性質', f: `log MN ＝ log M ＋ log N　log ${fr('M', 'N')} ＝ log M − log N<br>log M<sup>r</sup> ＝ r log M`, v: '底はそろえる（どれも同じ底）', k: 'ログ たいすう' },
      { name: '底の変換', f: `log<sub>a</sub>b ＝ ${fr('log<sub>c</sub>b', 'log<sub>c</sub>a')}`, v: 'c：好きな底（10 や e）', k: 'ログ たいすう' },
      { name: '等差数列', f: 'a<sub>n</sub> ＝ a ＋ (n − 1)d', v: 'a：はじめの項　d：公差（となりとの差）　n：何番目' },
      { name: '等差数列の和', f: `S<sub>n</sub> ＝ ${fr('n(a ＋ ℓ)', '2')} ＝ ${fr('n{2a ＋ (n − 1)d}', '2')}`, v: 'a：はじめの項　ℓ：最後の項　d：公差' },
      { name: '等比数列', f: 'a<sub>n</sub> ＝ ar<sup>n−1</sup>', v: 'a：はじめの項　r：公比（となりとの比）' },
      { name: '等比数列の和', f: `S<sub>n</sub> ＝ ${fr('a(r<sup>n</sup> − 1)', 'r − 1')}`, v: 'a：はじめの項　r：公比（r ≠ 1。r ＝ 1 なら S ＝ na）' },
      { name: '1 から n までの和', f: `1 ＋ 2 ＋ … ＋ n ＝ ${fr('n(n ＋ 1)', '2')}`, v: 'n：最後の数', n: '微積分の Σ でも計算できます' },
      { name: '2乗・3乗の和', f: `1<sup>2</sup> ＋ 2<sup>2</sup> ＋ … ＋ n<sup>2</sup> ＝ ${fr('n(n ＋ 1)(2n ＋ 1)', '6')}<br>1<sup>3</sup> ＋ 2<sup>3</sup> ＋ … ＋ n<sup>3</sup> ＝ {${fr('n(n ＋ 1)', '2')}}<sup>2</sup>`, v: 'n：最後の数' },
    ],
  },
  {
    key: 'count', name: '場合の数・確率', items: [
      { name: '順列', f: `<sub>n</sub>P<sub>r</sub> ＝ ${fr('n!', '(n − r)!')}`, v: 'n 個から r 個えらんで並べる（並べ方）', n: '電卓の「関数」の nPr で計算できます', k: 'じゅんれつ' },
      { name: '組合せ', f: `<sub>n</sub>C<sub>r</sub> ＝ ${fr('n!', 'r!(n − r)!')}`, v: 'n 個から r 個えらぶ（えらび方。順番は数えない）', n: '電卓の「関数」の nCr で計算できます', k: 'くみあわせ' },
      { name: '確率', f: `P(A) ＝ ${fr('A が起こる場合の数', '全部の場合の数')}`, v: 'どれも同じくらい起こるとき' },
      { name: '余事象の確率', f: 'P(A でない) ＝ 1 − P(A)', v: '「少なくとも1回」は 1 −（1回も起こらない確率）' },
      { name: '反復試行の確率', f: '<sub>n</sub>C<sub>r</sub> p<sup>r</sup>(1 − p)<sup>n−r</sup>', v: 'n 回のうち、確率 p のことがちょうど r 回起こる', n: '「確率」のタブの「くり返し」で計算できます', k: '二項分布' },
      { name: '期待値', f: 'E ＝ x₁p₁ ＋ x₂p₂ ＋ … ＋ x<sub>n</sub>p<sub>n</sub>', v: 'x：値　p：その値になる確率（全部足すと 1）', k: 'へいきん' },
    ],
  },
  {
    key: 'daily', name: '割合・速さ', items: [
      { name: '速さ・時間・道のり', f: '速さ ＝ 道のり ÷ 時間<br>道のり ＝ 速さ × 時間　時間 ＝ 道のり ÷ 速さ', v: '単位をそろえる（時速 km/h なら 時間 は「時間」）', n: '時速 → 秒速 は ÷ 3.6（「単位」の「速さ」でも）', k: 'はじき みはじ' },
      { name: '割合', f: '割合 ＝ くらべる量 ÷ もとにする量<br>くらべる量 ＝ もとにする量 × 割合', v: '百分率（%）＝ 割合 × 100　歩合：0.1 ＝ 1割', k: 'パーセント わりあい' },
      { name: '平均', f: '平均 ＝ 合計 ÷ 個数　合計 ＝ 平均 × 個数', v: '「確率」のタブの「偏差値・分布」でデータの平均も出せます', k: 'へいきん' },
      { name: '食塩水の濃度', f: '濃度（%）＝ 食塩 ÷ 食塩水 × 100', v: '食塩水 ＝ 水 ＋ 食塩（水だけで割らない）', k: 'のうど' },
      { name: '単価', f: '単価 ＝ 値段 ÷ 量', v: '100g あたりなら 値段 ÷ g × 100' },
      { name: '消費税', f: '税込 ＝ 税抜 × 1.1（軽減税率は × 1.08）<br>税抜 ＝ 税込 ÷ 1.1', v: '1円未満の切り捨て・四捨五入はお店による', n: '「お買い物」の「税込・税抜」でも' },
      { name: '割引', f: '〇% 引き の値段 ＝ 値段 × (1 − 〇 ÷ 100)', v: '2割引き ＝ × 0.8', k: 'わりびき セール' },
    ],
  },
  {
    key: 'motion', name: '力と運動', items: [
      { name: '速さ（物理）', f: `v ＝ ${fr('x', 't')}`, v: 'v：速さ（m/s）　x：進んだ距離（m）　t：時間（s）' },
      { name: '等加速度運動', f: `v ＝ v₀ ＋ at<br>x ＝ v₀t ＋ ${HALF}at<sup>2</sup><br>v<sup>2</sup> − v₀<sup>2</sup> ＝ 2ax`, v: 'v₀：はじめの速さ　a：加速度（m/s²）　t：時間　x：変位', k: 'かそくど' },
      { name: '自由落下', f: `v ＝ gt　h ＝ ${HALF}gt<sup>2</sup>　v<sup>2</sup> ＝ 2gh`, v: 'g：重力加速度 ≒ 9.8 m/s²　h：落ちた距離', n: '空気の抵抗は考えない', k: 'らっか' },
      { name: '運動方程式', f: 'ma ＝ F', v: 'm：質量（kg）　a：加速度（m/s²）　F：力（N）', k: 'ニュートン' },
      { name: '重力（重さ）', f: 'W ＝ mg', v: 'W：重さ（N）　m：質量（kg）　g ≒ 9.8 m/s²', n: '1kg の物の重さ ≒ 9.8N' },
      { name: 'フックの法則', f: 'F ＝ kx', v: 'F：ばねの力（N）　k：ばね定数（N/m）　x：のび・縮み（m）', k: 'ばね' },
      { name: '圧力', f: `p ＝ ${fr('F', 'S')}`, v: 'p：圧力（Pa ＝ N/m²）　F：面を垂直におす力（N）　S：面積（m²）' },
      { name: '密度', f: `ρ ＝ ${fr('m', 'V')}`, v: 'ρ：密度（g/cm³ や kg/m³）　m：質量　V：体積', n: '水 ≒ 1 g/cm³' },
      { name: '水圧・浮力', f: 'p ＝ ρgh　F ＝ ρVg', v: 'ρ：液体の密度（kg/m³）　h：深さ（m）　V：液体の中にある部分の体積（m³）', k: 'アルキメデス' },
      { name: '運動量と力積', f: 'p ＝ mv　FΔt ＝ mv′ − mv', v: 'p：運動量（kg·m/s）　FΔt：力積（N·s）', n: 'ぶつかる前と後で、運動量の合計は同じ（外から力がないとき）' },
      { name: '等速円運動', f: `v ＝ rω　a ＝ rω<sup>2</sup> ＝ ${fr('v<sup>2</sup>', 'r')}　T ＝ ${fr('2π', 'ω')}`, v: 'r：半径　ω：角速度（rad/s）　a：中心向きの加速度　T：周期' },
      { name: '万有引力', f: `F ＝ G${fr('Mm', 'r<sup>2</sup>')}`, v: 'G ≒ 6.67 × 10⁻¹¹ N·m²/kg²　M, m：質量　r：中心の間の距離', k: 'いんりょく' },
    ],
  },
  {
    key: 'energy', name: '仕事・エネルギー・熱', items: [
      { name: '仕事', f: 'W ＝ Fx', v: 'W：仕事（J）　F：力（N）　x：力の向きに動いた距離（m）', n: '力と動きの向きに角 θ があれば W ＝ Fx cos θ' },
      { name: '仕事率', f: `P ＝ ${fr('W', 't')}`, v: 'P：仕事率（W）　W：仕事（J）　t：時間（s）' },
      { name: '運動エネルギー', f: `K ＝ ${HALF}mv<sup>2</sup>`, v: 'K：エネルギー（J）　m：質量（kg）　v：速さ（m/s）' },
      { name: '位置エネルギー', f: 'U ＝ mgh', v: 'm：質量（kg）　g ≒ 9.8 m/s²　h：高さ（m）' },
      { name: 'ばねのエネルギー', f: `U ＝ ${HALF}kx<sup>2</sup>`, v: 'k：ばね定数（N/m）　x：のび・縮み（m）' },
      { name: '力学的エネルギー保存', f: `${HALF}mv<sup>2</sup> ＋ mgh ＝ 一定`, v: '摩擦や空気の抵抗がないとき', k: 'ほぞん' },
      { name: '熱量', f: 'Q ＝ mcΔT', v: 'Q：熱量（J）　m：質量（g）　c：比熱（水 ≒ 4.2 J/(g·K)）　ΔT：温度の変化', n: '1 cal ≒ 4.2 J（水 1g を 1℃ 上げる熱）', k: 'ひねつ' },
      { name: '熱効率', f: `e ＝ ${fr('W', 'Q')}`, v: 'W：した仕事　Q：使った熱（いつも 1 より小さい）', k: 'こうりつ' },
    ],
  },
  {
    key: 'elec', name: '電気', items: [
      { name: 'オームの法則', f: 'V ＝ RI', v: 'V：電圧（V）　R：抵抗（Ω）　I：電流（A）', n: '電流 ＝ 電圧 ÷ 抵抗、抵抗 ＝ 電圧 ÷ 電流', k: 'でんあつ でんりゅう ていこう' },
      { name: '電力', f: `P ＝ VI ＝ I<sup>2</sup>R ＝ ${fr('V<sup>2</sup>', 'R')}`, v: 'P：電力（W）　V：電圧（V）　I：電流（A）　R：抵抗（Ω）', k: 'ワット' },
      { name: '電力量', f: 'W ＝ Pt', v: 'W：電力量（J、または Wh）　P：電力（W）　t：時間（s、または h）', n: '1 kWh ＝ 3,600,000 J' },
      { name: '電気代', f: '電気代 ＝ W ÷ 1000 × 時間 × 1kWh の単価', v: 'W：電力（ワット）　時間：使った時間（h）', n: '単価は契約による（目安 31円/kWh）', k: 'でんきだい kWh' },
      { name: '合成抵抗', f: `直列：R ＝ R₁ ＋ R₂<br>並列：${fr('1', 'R')} ＝ ${fr('1', 'R₁')} ＋ ${fr('1', 'R₂')}　（R ＝ ${fr('R₁R₂', 'R₁ ＋ R₂')}）`, v: 'R₁, R₂：それぞれの抵抗（Ω）', n: '並列の合成抵抗は、どの抵抗よりも小さい', k: 'ちょくれつ へいれつ' },
      { name: '電気量', f: 'Q ＝ It', v: 'Q：電気量（C）　I：電流（A）　t：時間（s）', n: '電池の 1000 mAh ＝ 1A で 1時間 ＝ 3600 C' },
      { name: 'ジュール熱', f: `Q ＝ I<sup>2</sup>Rt ＝ VIt`, v: 'Q：熱（J）　I：電流（A）　R：抵抗（Ω）　t：時間（s）' },
      { name: 'コンデンサー', f: `Q ＝ CV　U ＝ ${HALF}CV<sup>2</sup>`, v: 'Q：電気量（C）　C：電気容量（F）　V：電圧（V）　U：たくわえるエネルギー（J）' },
    ],
  },
  {
    key: 'wave', name: '波・音・光', items: [
      { name: '波の速さ', f: 'v ＝ fλ', v: 'v：速さ（m/s）　f：振動数（Hz）　λ：波長（m）', k: 'はちょう しんどうすう' },
      { name: '周期と振動数', f: `T ＝ ${fr('1', 'f')}`, v: 'T：周期（s。1回ゆれる時間）　f：振動数（Hz）' },
      { name: '音の速さ', f: 'V ≒ 331.5 ＋ 0.6t', v: 'V：音の速さ（m/s）　t：気温（℃）', n: '15℃ でおよそ 340 m/s' },
      { name: 'レンズの式', f: `${fr('1', 'a')} ＋ ${fr('1', 'b')} ＝ ${fr('1', 'f')}　倍率 ＝ ${fr('b', 'a')}`, v: 'a：物体からレンズ　b：レンズから像　f：焦点距離（凸レンズ・実像のとき）' },
      { name: '屈折の法則', f: `n ＝ ${fr('sin i', 'sin r')} ＝ ${fr('v₁', 'v₂')}`, v: 'i：入射角　r：屈折角　v：それぞれの所での速さ', n: '光の速さ（真空）≒ 3.0 × 10⁸ m/s', k: 'くっせつ' },
    ],
  },
];

// すべての公式（{ ...公式, cat: 種類 }）
export const ALL_FORMULAS = FORMULA_CATS.flatMap((cat) => cat.items.map((item) => ({ ...item, cat })));

export const formulaById = (name) => ALL_FORMULAS.find((f) => f.name === name) ?? null;

// HTML → 文字だけ（検索用。分数は「上/下」に）
export function plainOf(html) {
  return html
    .replace(/<span class="fx-fr"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>/g, '($1)/($2)')
    .replace(/<br>/g, ' ')
    .replace(/<[^>]+>/g, '');
}

// 全角の英数字 → 半角、小文字に（検索用）
const fold = (s) => s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toLowerCase();

// 言葉で公式をさがす（空白で区切った言葉が、全部ふくまれるもの）
export function searchFormulas(query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return ALL_FORMULAS.filter((f) => {
    const hay = fold(`${f.name} ${f.cat.name} ${plainOf(f.f)} ${f.v} ${f.n ?? ''} ${f.k ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}
