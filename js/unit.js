// =========================================================
// 単位の変換（画面なし・テストあり）
//
// 単位は「基準の単位（長さなら m）のいくつ分か」を、正確な分数で持つ。
//   変換： 打った数 × 元の単位の大きさ ÷ 見たい単位の大きさ
// 温度だけは足し引きもある（℃ ＝ (℉ − 32) × 5/9）ので、
//   基準（℃）＝ 数 × a ＋ b の a と b で持つ。
//
// 単位の項目：
//   sym  … 画面に出す名前（cm・坪 など）
//   read … 読み方（漢字の単位だけ）
//   f    … 基準の単位いくつ分か（'0.0254' や '400/121' のように書く。分数のまま正確に）
//          '180/π' のように π があるものだけは概数（approx: true。π は80桁で計算、50桁を出す）
//   def  … その大きさがどこから来たか（検算で見せる）
//   note … 注意書き（一覧の、その単位のすぐ下に出す）
//   dms  … 一覧のその単位の下に、度分秒（57°17′44.81″）も出す（角度の「度」）
//   inv  … 逆数の単位（f のかわりに書く）。基準 ＝ inv ÷ 数（燃費の L/100km ＝ 100 ÷ km/L）
// =========================================================
import * as N from './num.js';
import * as F from './format.js';

// '0.0254' や '400/121' や '-160/9' → 正確な数（'180/π' だけは概数）
function q(text) {
  if (text.endsWith('/π')) return N.div(q(text.slice(0, -2)), N.pi());
  const neg = text.startsWith('-');
  const [a, b] = (neg ? text.slice(1) : text).split('/');
  const x = b === undefined ? N.parseDecimal(a) : N.div(N.parseDecimal(a), N.parseDecimal(b));
  return neg ? N.neg(x) : x;
}

const RAW = [
  {
    key: 'len', name: '長さ', base: 'm', from: 'cm', to: 'in',
    hint: 'インチ・フィートなどは国際的に決まった長さです（1インチ ＝ 2.54cm ちょうど）',
    units: [
      { key: 'nm', sym: 'nm', read: 'ナノメートル', f: '0.000000001', def: '10億分の1 m', note: '光の波長（目に見える光は 約380〜780nm）や、半導体の細かさに使います' },
      { key: 'um', sym: 'μm', read: 'マイクロメートル', f: '0.000001', def: '100万分の1 m（1000分の1 mm）', note: '「ミクロン」とも。髪の毛の太さは 約80μm' },
      { key: 'mm', sym: 'mm', f: '0.001' },
      { key: 'cm', sym: 'cm', f: '0.01' },
      { key: 'm', sym: 'm', f: '1' },
      { key: 'km', sym: 'km', f: '1000' },
      { key: 'in', sym: 'インチ', f: '0.0254', def: '2.54cm ちょうど（国際的なきまり）' },
      { key: 'ft', sym: 'フィート', f: '0.3048', def: '12インチ' },
      { key: 'yd', sym: 'ヤード', f: '0.9144', def: '3フィート' },
      { key: 'mi', sym: 'マイル', f: '1609.344', def: '1760ヤード' },
      { key: 'nmi', sym: '海里', read: 'かいり', f: '1852', def: '1852m ちょうど（国際的なきまり）', note: '海や空の道のりに使います' },
      { key: 'sun', sym: '寸', read: 'すん', f: '1/33', def: '1尺の10分の1' },
      { key: 'shaku', sym: '尺', read: 'しゃく', f: '10/33', def: '10/33 m（明治のきまり。約30.3cm）' },
      { key: 'ken', sym: '間', read: 'けん', f: '20/11', def: '6尺 ＝ 60/33 m（約1.82m）' },
      { key: 'au', sym: '天文単位', read: 'au', f: '149597870700', def: '149,597,870,700m ちょうど（2012年の国際的なきまり）', note: '太陽と地球のだいたいの距離（約1.5億km）。太陽系の中の距離に使います' },
      { key: 'ly', sym: '光年', read: 'こうねん', f: '9460730472580800', def: '光が1年（365.25日）に進む距離 ＝ 299,792,458 m/s × 31,557,600秒', note: '約9.46兆km。時間ではなく「長さ」の単位です' },
      { key: 'pc', sym: 'パーセク', read: 'pc', f: '96939420213600000/π', def: '648000/π 天文単位（1天文単位が角度の1秒に見える距離）', note: '約3.26光年。π を使うので答えは概数です（上から50桁）' },
    ],
  },
  {
    key: 'mass', name: '重さ', base: 'g', from: 'kg', to: 'lb',
    units: [
      { key: 'mg', sym: 'mg', f: '0.001' },
      { key: 'g', sym: 'g', f: '1' },
      { key: 'kg', sym: 'kg', f: '1000' },
      { key: 't', sym: 'トン', f: '1000000', def: '1000kg' },
      { key: 'oz', sym: 'オンス', f: '28.349523125', def: '16分の1ポンド', note: '金・銀の重さのオンス（トロイオンス 約31.1g）とはちがいます' },
      { key: 'lb', sym: 'ポンド', f: '453.59237', def: '0.45359237kg ちょうど（国際的なきまり）' },
      { key: 'monme', sym: '匁', read: 'もんめ', f: '3.75', def: '1貫の1000分の1', note: '真珠の重さにも使います' },
      { key: 'kin', sym: '斤', read: 'きん', f: '600', def: '160匁', note: '食パンの「1斤」は別のきまりです（340g 以上）' },
      { key: 'kan', sym: '貫', read: 'かん', f: '3750', def: '3.75kg（明治のきまり）' },
    ],
  },
  {
    key: 'area', name: '面積', base: 'm²', from: 'm2', to: 'tsubo',
    hint: '畳の大きさは地方や建物でちがいます（ここでは 1畳 ＝ 1.62m²）',
    units: [
      { key: 'cm2', sym: 'cm²', f: '0.0001' },
      { key: 'm2', sym: 'm²', f: '1' },
      { key: 'a', sym: 'アール', f: '100', def: '10m × 10m' },
      { key: 'ha', sym: 'ヘクタール', f: '10000', def: '100m × 100m' },
      { key: 'km2', sym: 'km²', f: '1000000' },
      { key: 'tsubo', sym: '坪', read: 'つぼ', f: '400/121', def: '1間 × 1間（20/11 m × 20/11 m）', note: '約3.31m²。だいたい2畳' },
      { key: 'jo', sym: '畳', read: 'じょう', f: '1.62', def: '不動産の広告のきまりの大きさ', note: '地方でちがいます（江戸間 約1.55m²・京間 約1.82m²）。ここでは広告のきまりの 1.62m²' },
      { key: 'tan', sym: '反', read: 'たん', f: '120000/121', def: '300坪', note: '田や畑の広さ' },
      { key: 'ft2', sym: '平方フィート', f: '0.09290304', def: '1フィート × 1フィート' },
      { key: 'ac', sym: 'エーカー', f: '4046.8564224', def: '43560平方フィート' },
    ],
  },
  {
    key: 'vol', name: '体積', base: 'mL', from: 'go', to: 'mL',
    hint: '小さじ・大さじ・カップ・合は、日本のものです',
    units: [
      { key: 'mL', sym: 'mL', f: '1', note: '1mL ＝ 1cc ＝ 1cm³' },
      { key: 'L', sym: 'L', f: '1000' },
      { key: 'm3', sym: 'm³', f: '1000000', def: '1000L' },
      { key: 'tsp', sym: '小さじ', f: '5', def: '5mL（日本の計量スプーン）' },
      { key: 'tbsp', sym: '大さじ', f: '15', def: '15mL（日本の計量スプーン）' },
      { key: 'cup', sym: 'カップ', f: '200', def: '200mL（日本の計量カップ）', note: '日本の1カップは 200mL（アメリカは 約237mL）' },
      { key: 'go', sym: '合', read: 'ごう', f: '240100/1331', def: '1升の10分の1', note: 'お米の1合（約180mL）。炊飯器のカップと同じ' },
      { key: 'sho', sym: '升', read: 'しょう', f: '2401000/1331', def: '2401/1331 L（明治のきまり。約1.804L）', note: '一升びんの1升' },
      { key: 'gal', sym: 'ガロン', f: '3785.411784', def: '231立方インチ（アメリカ）', note: 'アメリカのガロン（イギリスのガロンは 約4.546L）' },
      { key: 'floz', sym: '液量オンス', f: '29.5735295625', def: '128分の1ガロン（アメリカ）', note: 'アメリカの液量オンス' },
      { key: 'uscup', sym: 'カップ（米）', f: '236.5882365', def: '16分の1ガロン（アメリカ）', note: 'アメリカのレシピのカップ' },
    ],
  },
  {
    key: 'temp', name: '温度', base: '℃', from: 'c', to: 'f',
    hint: '温度は、かけ算だけでなく足し引きもある変換です（0℃ ＝ 32℉）',
    units: [
      { key: 'c', sym: '℃', a: '1', b: '0' },
      { key: 'f', sym: '℉', a: '5/9', b: '-160/9', def: '℃ ＝ (℉ − 32) × 5/9', note: 'アメリカで使う温度（カ氏）' },
      { key: 'k', sym: 'K', a: '1', b: '-273.15', def: '℃ ＝ K − 273.15', note: 'ケルビン。0K が絶対零度（−273.15℃）' },
    ],
  },
  {
    key: 'angle', name: '角度', base: '度', from: 'rad', to: 'deg',
    hint: '180度 ＝ π rad。「π rad」の行は π の何倍か（0.5 π rad ＝ π/2 rad ＝ 90度）',
    units: [
      { key: 'deg', sym: '度', f: '1', dms: true },
      { key: 'rad', sym: 'rad', read: 'ラジアン', f: '180/π', def: '半径と同じ長さの弧の角度（180/π 度）', note: 'π を使うので答えは概数です（上から50桁）。π の何倍かでちょうどの数がほしいときは「π rad」' },
      { key: 'pirad', sym: 'π rad', read: 'π の何倍', f: '180', def: 'π rad ＝ 180度（半回転）', note: '「π の何倍か」を打ちます（π/2 rad なら 0.5、π/4 rad なら 0.25）' },
      { key: 'turn', sym: '回転', f: '360', def: '1回転 ＝ 360度' },
      { key: 'grad', sym: 'グラード', f: '9/10', def: '直角を100に分けた角度（1回転 ＝ 400グラード）', note: '測量で使うことがあります（gon とも）' },
      { key: 'amin', sym: '分（′）', read: 'かくふん', f: '1/60', def: '1度の60分の1', note: '角度の「分」です（時間の分ではありません）' },
      { key: 'asec', sym: '秒（″）', read: 'かくびょう', f: '1/3600', def: '1分の60分の1（1度の3600分の1）' },
    ],
  },
  {
    key: 'speed', name: '速さ', base: 'm/s', from: 'kmh', to: 'ms',
    units: [
      { key: 'kmh', sym: 'km/h', read: '時速', f: '5/18', def: '1時間に 1km（1000m ÷ 3600秒）' },
      { key: 'ms', sym: 'm/s', read: '秒速', f: '1', def: '1秒に 1m' },
      { key: 'mmin', sym: 'm/分', read: '分速', f: '1/60', def: '1分に 1m' },
      { key: 'mph', sym: 'mph', read: 'マイル毎時', f: '0.44704', def: '1時間に 1マイル（1609.344m）' },
      { key: 'kn', sym: 'ノット', f: '463/900', def: '1時間に 1海里（1852m）', note: '船や飛行機の速さ' },
    ],
  },
  {
    key: 'data', name: 'データ', base: 'ビット', from: 'GB', to: 'GiB',
    hint: 'KB・MB・GB は 1000 ずつ。1024 ずつのもの（KiB・MiB・GiB）もあります',
    units: [
      { key: 'bit', sym: 'ビット', f: '1' },
      { key: 'B', sym: 'B', read: 'バイト', f: '8', def: '8ビット' },
      { key: 'KB', sym: 'KB', f: '8000', def: '1000B' },
      { key: 'MB', sym: 'MB', f: '8000000', def: '1000KB' },
      { key: 'GB', sym: 'GB', f: '8000000000', def: '1000MB' },
      { key: 'TB', sym: 'TB', f: '8000000000000', def: '1000GB' },
      { key: 'KiB', sym: 'KiB', f: '8192', def: '1024B' },
      { key: 'MiB', sym: 'MiB', f: '8388608', def: '1024KiB' },
      { key: 'GiB', sym: 'GiB', f: '8589934592', def: '1024MiB', note: 'Windows では、これを「GB」と表示します' },
      { key: 'TiB', sym: 'TiB', f: '8796093022208', def: '1024GiB' },
    ],
  },
  {
    key: 'energy', name: 'エネルギー', base: 'J', from: 'kcal', to: 'kJ',
    units: [
      { key: 'J', sym: 'J', read: 'ジュール', f: '1' },
      { key: 'kJ', sym: 'kJ', f: '1000' },
      { key: 'cal', sym: 'cal', read: 'カロリー', f: '4.184', def: '4.184J（日本の計量法のきまり）' },
      { key: 'kcal', sym: 'kcal', f: '4184', def: '1000cal', note: '食べ物のカロリー' },
      { key: 'Wh', sym: 'Wh', f: '3600', def: '1W を1時間（3600秒）' },
      { key: 'kWh', sym: 'kWh', f: '3600000', def: '1000Wh', note: '電気代の単位' },
    ],
  },
  {
    key: 'press', name: '圧力', base: 'Pa', from: 'hPa', to: 'atm',
    units: [
      { key: 'Pa', sym: 'Pa', read: 'パスカル', f: '1' },
      { key: 'hPa', sym: 'hPa', f: '100', note: '天気予報の気圧' },
      { key: 'kPa', sym: 'kPa', f: '1000' },
      { key: 'MPa', sym: 'MPa', f: '1000000' },
      { key: 'atm', sym: '気圧', f: '101325', def: '101325Pa ちょうど（標準の大気圧）' },
      { key: 'mmHg', sym: 'mmHg', f: '101325/760', def: '1気圧の760分の1', note: '血圧の単位' },
      { key: 'bar', sym: 'bar', read: 'バール', f: '100000' },
      { key: 'kgfcm2', sym: 'kgf/cm²', f: '98066.5', def: '1kg の重さ（9.80665N）が 1cm² にかかる', note: '昔のタイヤの空気圧など' },
      { key: 'psi', sym: 'psi', f: '4.4482216152605/0.00064516', def: '1ポンドの重さ（4.4482216152605N）が 1平方インチにかかる', note: 'アメリカのタイヤの空気圧など' },
    ],
  },
  {
    key: 'time', name: '時間', base: '秒', from: 'h', to: 'min',
    hint: '「1年」はここでは 365日 です（うるう年は 366日）。日付どうしの計算は「日付」のタブで',
    units: [
      { key: 'us', sym: 'マイクロ秒', read: 'μs', f: '0.000001', def: '100万分の1 秒' },
      { key: 'ms', sym: 'ミリ秒', read: 'ms', f: '0.001', def: '1000分の1 秒' },
      { key: 's', sym: '秒', f: '1' },
      { key: 'min', sym: '分', f: '60', def: '60秒' },
      { key: 'h', sym: '時間', f: '3600', def: '60分' },
      { key: 'day', sym: '日', f: '86400', def: '24時間' },
      { key: 'week', sym: '週', f: '604800', def: '7日' },
      { key: 'mon', sym: '月（30日）', f: '2592000', def: '30日とした1か月', note: '1か月は 28〜31日 です。ここでは 30日 として計算します' },
      { key: 'year', sym: '年（365日）', f: '31536000', def: '365日', note: 'うるう年は 366日。平均の1年は 約365.2425日' },
    ],
  },
  {
    key: 'force', name: '力', base: 'N', from: 'kgf', to: 'N',
    hint: '1 kgf は「1kg の物の重さ」と同じ力です（地球の上で）',
    units: [
      { key: 'N', sym: 'N', read: 'ニュートン', f: '1', note: '1kg の物を 1m/s² で加速する力。100g の物の重さが 約1N' },
      { key: 'kN', sym: 'kN', f: '1000' },
      { key: 'gf', sym: 'gf', read: 'グラム重', f: '0.00980665', def: '1g の物の重さ（標準の重力 9.80665m/s² で）' },
      { key: 'kgf', sym: 'kgf', read: 'キログラム重', f: '9.80665', def: '1kg の物の重さ（標準の重力 9.80665m/s² で）', note: '重力は場所で少しちがうので、決めた値（9.80665）を使います' },
      { key: 'dyn', sym: 'dyn', read: 'ダイン', f: '0.00001', def: '1g の物を 1cm/s² で加速する力（古い単位系）' },
      { key: 'lbf', sym: 'lbf', read: 'ポンド重', f: '4.4482216152605', def: '1ポンド（0.45359237kg）の物の重さ' },
    ],
  },
  {
    key: 'power', name: '仕事率', base: 'W', from: 'PS', to: 'kW',
    hint: '馬力は2つあります。日本の車のカタログは PS（仏馬力）',
    units: [
      { key: 'W', sym: 'W', read: 'ワット', f: '1', note: '1秒に 1J の仕事（電力も同じ単位）' },
      { key: 'kW', sym: 'kW', f: '1000' },
      { key: 'MW', sym: 'MW', f: '1000000' },
      { key: 'PS', sym: 'PS', read: '仏馬力', f: '735.49875', def: '75kg の物を1秒に 1m 持ち上げる（75 kgf·m/s）', note: '日本・ヨーロッパの車の「馬力」' },
      { key: 'HP', sym: 'HP', read: '英馬力', f: '745.69987158227022', def: '550ポンドの物を1秒に 1フィート持ち上げる', note: 'アメリカ・イギリスの「馬力」（PS より少し大きい）' },
      { key: 'kcalh', sym: 'kcal/h', f: '523/450', def: '1時間に 1kcal（4184J ÷ 3600秒）', note: 'ガス器具などの能力に使われていました' },
    ],
  },
  {
    key: 'freq', name: '周波数', base: 'Hz', from: 'rpm', to: 'Hz',
    hint: '1 Hz ＝ 1秒に1回。rpm は 1分あたりの回転数です',
    units: [
      { key: 'Hz', sym: 'Hz', read: 'ヘルツ', f: '1', note: '1秒に1回' },
      { key: 'kHz', sym: 'kHz', f: '1000', note: 'AM ラジオは 約500〜1600 kHz' },
      { key: 'MHz', sym: 'MHz', f: '1000000', note: 'FM ラジオは 約76〜95 MHz' },
      { key: 'GHz', sym: 'GHz', f: '1000000000', note: 'Wi-Fi は 2.4 GHz・5 GHz など' },
      { key: 'THz', sym: 'THz', f: '1000000000000', note: '目に見える光は 約400〜800 THz' },
      { key: 'rpm', sym: 'rpm', read: '回転/分', f: '1/60', def: '1分に1回転（60秒に1回）', note: 'エンジンやモーターの回転数' },
    ],
  },
  {
    key: 'charge', name: '電気量', base: 'C', from: 'mAh', to: 'C',
    hint: '電池の「mAh」は電気の量です。エネルギー（Wh）にするには 電圧 をかけます',
    units: [
      { key: 'C', sym: 'C', read: 'クーロン', f: '1', note: '1A の電流が 1秒に運ぶ電気の量' },
      { key: 'mC', sym: 'mC', f: '0.001' },
      { key: 'uC', sym: 'μC', f: '0.000001' },
      { key: 'mAh', sym: 'mAh', f: '3.6', def: '1mA で1時間（0.001A × 3600秒）', note: '電池・モバイルバッテリーの容量。Wh ＝ mAh ÷ 1000 × 電圧（V）' },
      { key: 'Ah', sym: 'Ah', f: '3600', def: '1A で1時間（3600秒）', note: '車のバッテリーなどの容量' },
      { key: 'e', sym: '電気素量', read: 'e', f: '0.0000000000000000001602176634', def: '電子1個の電気の量 ＝ 1.602176634 × 10⁻¹⁹ C ちょうど（2019年のきまり）' },
    ],
  },
  {
    key: 'mag', name: '磁場', base: 'T', from: 'mT', to: 'G',
    hint: '磁束密度（磁場の強さ）の単位です。1 T ＝ 10000 ガウス',
    units: [
      { key: 'T', sym: 'T', read: 'テスラ', f: '1', note: 'とても強い磁場です（病院の MRI が 1.5〜3 T くらい）' },
      { key: 'mT', sym: 'mT', f: '0.001', def: '1000分の1 T', note: '1 mT ＝ 10 ガウス' },
      { key: 'uT', sym: 'μT', f: '0.000001', def: '100万分の1 T', note: '地球の磁場（地磁気）は 約25〜65 μT' },
      { key: 'nT', sym: 'nT', f: '0.000000001', def: '10億分の1 T' },
      { key: 'G', sym: 'ガウス', read: 'G', f: '0.0001', def: '1万分の1 T（古い単位系の単位）', note: '磁石の強さの表示で、いまも使われることがあります' },
      { key: 'Wbm2', sym: 'Wb/m²', read: 'ウェーバ毎平方メートル', f: '1', def: '1m² を 1Wb の磁束がつらぬく（T と同じ）' },
    ],
  },
  {
    key: 'density', name: '密度', base: 'kg/m³', from: 'gcm3', to: 'kgm3',
    hint: '水は 約1 g/cm³（＝ 1000 kg/m³）',
    units: [
      { key: 'kgm3', sym: 'kg/m³', f: '1' },
      { key: 'gcm3', sym: 'g/cm³', f: '1000', def: '1cm³ が 1g（＝ 1m³ が 1000kg）', note: '水が 約1、鉄が 約7.9、金が 約19.3' },
      { key: 'gL', sym: 'g/L', f: '1', def: '1L が 1g（kg/m³ と同じ）', note: '空気は 約1.2 g/L（20℃）' },
      { key: 'kgL', sym: 'kg/L', f: '1000', def: '1L が 1kg（g/cm³ と同じ）' },
      { key: 'lbft3', sym: 'ポンド/立方フィート', f: '0.45359237/0.028316846592', def: '1立方フィート（0.028316846592m³）が 1ポンド（0.45359237kg）' },
    ],
  },
  {
    key: 'fuel', name: '燃費', base: 'km/L', from: 'kmL', to: 'l100',
    hint: 'km/L と mpg は大きいほど、L/100km は小さいほど 燃費がよい',
    units: [
      { key: 'kmL', sym: 'km/L', f: '1', note: '1L で走れる距離（日本）。大きいほど燃費がよい' },
      { key: 'l100', sym: 'L/100km', inv: '100', def: '100km 走るのに使う燃料 ＝ 100 ÷（km/L）', note: 'ヨーロッパなどの表し方。小さいほど燃費がよい（割り算で変換します）' },
      { key: 'mpg', sym: 'mpg（米）', f: '1.609344/3.785411784', def: '1ガロン（3.785411784L）で走れるマイル（1.609344km）', note: 'アメリカのガロンでの mpg' },
      { key: 'mpguk', sym: 'mpg（英）', f: '1.609344/4.54609', def: '1ガロン（4.54609L）で走れるマイル（1.609344km）', note: 'イギリスのガロンは大きいので、同じ車でも数字が大きくなります' },
    ],
  },
  {
    key: 'dose', name: '放射線', base: 'Sv', from: 'mSv', to: 'uSv',
    hint: '体への影響の大きさ（シーベルト）です。ベクレル（放射能）とは別の量なので、変換できません',
    units: [
      { key: 'Sv', sym: 'Sv', read: 'シーベルト', f: '1', note: 'X線・γ線なら 1 Gy（グレイ）＝ 1 Sv。α線などは同じ Gy でも Sv が大きくなります' },
      { key: 'mSv', sym: 'mSv', f: '0.001', note: '自然の放射線は 1年で 約2.1 mSv（日本の平均）' },
      { key: 'uSv', sym: 'μSv', f: '0.000001', note: '胸のX線検査1回が 約60 μSv' },
      { key: 'nSv', sym: 'nSv', f: '0.000000001' },
      { key: 'rem', sym: 'レム', read: 'rem', f: '0.01', def: '0.01 Sv（古い単位）' },
    ],
  },
  {
    key: 'activity', name: '放射能', base: 'Bq', from: 'Ci', to: 'Bq',
    hint: '放射線を出す強さ（1秒にこわれる原子の数）です。シーベルトには、そのままでは変換できません',
    units: [
      { key: 'Bq', sym: 'Bq', read: 'ベクレル', f: '1', note: '1秒に 1個の原子核がこわれる' },
      { key: 'kBq', sym: 'kBq', f: '1000' },
      { key: 'MBq', sym: 'MBq', f: '1000000' },
      { key: 'GBq', sym: 'GBq', f: '1000000000' },
      { key: 'Ci', sym: 'キュリー', read: 'Ci', f: '37000000000', def: '3.7 × 10¹⁰ Bq ちょうど（ラジウム 1g くらい。古い単位）' },
    ],
  },
];

// 分数を先に作っておく
export const CATS = RAW.map((c) => ({
  ...c,
  units: c.units.map((u) => {
    if (u.a !== undefined) return { ...u, a: q(u.a), b: q(u.b), affine: true };
    // 逆数の単位（燃費の L/100km）：基準 ＝ inv ÷ 数
    if (u.inv !== undefined) return { ...u, inv: q(u.inv), invText: u.inv };
    return { ...u, f: q(u.f), ...(u.f.includes('π') ? { ftext: u.f, approx: true } : {}) };
  }),
}));

export const catByKey = (key) => CATS.find((c) => c.key === key) ?? null;
export const unitOf = (cat, key) => cat.units.find((u) => u.key === key) ?? null;
export const baseUnit = (cat) => cat.units.find((u) => u.sym === cat.base);

// 打った数 → 基準の単位
export function toBase(u, x) {
  if (u.inv) return N.div(u.inv, x);
  return u.affine ? N.add(N.mul(x, u.a), u.b) : N.mul(x, u.f);
}

// 基準の単位 → その単位
export function fromBase(u, y) {
  if (u.inv) return N.div(u.inv, y);
  return u.affine ? N.div(N.sub(y, u.b), u.a) : N.div(y, u.f);
}

const ABS_ZERO = q('-273.15');

// 1つの数を、その種類の全部の単位に
//   返す値：{ base, values: Map(単位の key → 数) } / { error }
export function convertAll(cat, fromKey, x) {
  const from = unitOf(cat, fromKey);
  // 逆数の単位がある種類（燃費）は、0 や マイナスだと割り算ができない
  if (cat.units.some((u) => u.inv) && N.sign(x) <= 0) {
    return { error: `${cat.name}は 0 より大きい数で打ってください` };
  }
  const base = toBase(from, x);
  if (cat.key === 'temp' && N.cmp(base, ABS_ZERO) < 0) {
    return { error: '絶対零度（−273.15℃）より低い温度はありません' };
  }
  const values = new Map();
  for (const u of cat.units) values.set(u.key, u.key === fromKey ? x : fromBase(u, base));
  return { base, values };
}

export function convert(cat, fromKey, toKey, x) {
  return fromBase(unitOf(cat, toKey), toBase(unitOf(cat, fromKey), x));
}

// ---------------------------------------------------------
// 表示の形
// ---------------------------------------------------------
// 数 → { text, html, rounded }（四捨五入したら後ろに「…」）
export function valueText(x, sig = 12) {
  const f = F.compact(x, sig);
  return f.rounded ? { ...f, text: `${f.text}…`, html: `${f.html}…` } : f;
}

// 割り切れる小数なら、その小数の文字（{ text: '2.54', neg }）。割り切れない・長すぎるなら null
//   欄に打ち直せる形にするときに使う（整数 maxInt 桁・小数 maxDecimals 桁まで）
export function plainDecimal(x, { maxInt = 12, maxDecimals = 8 } = {}) {
  if (!x.q) return null;
  // 分母が 2 と 5 だけでできていれば、割り切れる小数
  let d = x.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const k = Math.max(twos, fives); // 小数点の下の桁数
  if (k > maxDecimals) return null;
  const neg = x.n < 0n;
  const s = (((neg ? -x.n : x.n) * N.pow10(k)) / x.d).toString().padStart(k + 1, '0');
  const int = s.slice(0, s.length - k);
  const dec = s.slice(s.length - k);
  if (int.length > maxInt) return null;
  return { text: dec ? `${int}.${dec}` : int, neg };
}

// 単位の大きさを式の中に書く形（割り切れる小数ならそのまま「0.0254」、割り切れなければ分数「400/121」）
export function factorText(x) {
  const p = plainDecimal(x, { maxInt: 30, maxDecimals: 30 });
  return p ? F.groupNumberText(p.text) : F.fractionForm(x).text;
}

// 単位の大きさの書き方（rad の「180/π」のように、書いたままのものはそのまま）
export const factorLabel = (u) => u.ftext ?? factorText(u.f);

// 同じ数か（概数がまざっていたら、上から50桁で比べる）
export function sameValue(a, b) {
  if (N.cmp(a, b) === 0) return true;
  if (a.q && b.q) return false;
  const ra = N.roundSig(a, N.SHOW);
  const rb = N.roundSig(b, N.SHOW);
  return ra.neg === rb.neg && ra.digits === rb.digits && ra.exp === rb.exp;
}

// 度 → 度分秒（57°17′44.81″）。秒は小数第2位まで（四捨五入したら「約」）。10億度より大きければ null
const HUNDREDTH_SEC = 360000n; // 1度 ＝ 0.01秒 の 360000 個分
export function dmsText(deg) {
  const neg = N.sign(deg) < 0;
  const a = N.absNum(deg);
  if (N.cmp(a, N.frac(1000000000n)) >= 0) return null;
  const h = N.mul(a, N.frac(HUNDREDTH_SEC));
  let n;
  let exact;
  if (h.q) {
    n = (2n * h.n + h.d) / (2n * h.d); // 四捨五入
    exact = h.n % h.d === 0n;
  } else {
    const e = BigInt(h.e);
    if (e >= 0n) {
      n = h.m * 10n ** e;
      exact = true;
    } else if (e < -200n) {
      n = 0n;
      exact = h.m === 0n;
    } else {
      const den = 10n ** -e;
      n = (2n * h.m + den) / (2n * den);
      exact = false;
    }
  }
  const d = n / HUNDREDTH_SEC;
  const rest = n % HUNDREDTH_SEC;
  const m = (rest / 6000n).toString().padStart(2, '0');
  const s100 = rest % 6000n;
  const sec = (s100 / 100n).toString().padStart(2, '0');
  const dec = (s100 % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  const sign = neg && n > 0n ? '−' : '';
  return `${exact ? '' : '約 '}${sign}${F.groupInt(d.toString())}°${m}′${sec}${dec ? `.${dec}` : ''}″`;
}
