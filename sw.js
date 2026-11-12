// =========================================================
// サービスワーカー：スマホにしまったファイルで、すぐ開くしくみ
//
// アプリのファイル（画面の部品）を、まとめてスマホの中にしまっておきます。
//   ・開くとき … ネットを待たずに、しまってあるファイルで開く（速い・ネットがなくても開ける）
//   ・新しい版 … この sw.js が変わると（下の CACHE の番号を上げると）、ブラウザが裏で
//                 新しいファイルを全部取ってきて、別の入れ物にしまう。
//                 アプリを閉じて次に開いたときから新しい版になる。
//                 開いたままなら、画面に「新しい版があります［更新する］」が出る（main.js）。
//   ※ 古い版と新しい版のファイルがまざらないように、入れ物は版ごとに分ける。
//
// ※ 履歴のデータは、ここではなく IndexedDB（js/db.js）に入っています。
// ※ アプリを更新して公開するときは、CACHE の番号を1つ上げてください。
// ※ js などのファイルを新しく足したら、下の PRECACHE にも書き足してください。
//   （テストでもチェックしています）
// =========================================================

const CACHE = 'calculator-v24';   // しまっておく入れ物の名前（版ごとに変える）

// まとめてしまっておくファイル
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/num.js',
  'js/calc.js',
  'js/keys.js',
  'js/check.js',
  'js/check-ui.js',
  'js/format.js',
  'js/ui.js',
  'js/detail.js',
  'js/history.js',
  'js/db.js',
  'js/install.js',
  'js/shop.js',
  'js/shop-ui.js',
  'js/split.js',
  'js/split-ui.js',
  'js/form.js',
  'js/time.js',
  'js/time-ui.js',
  'js/date.js',
  'js/date-ui.js',
  'js/unit.js',
  'js/unit-ui.js',
  'js/sci.js',
  'js/sci-ui.js',
  'js/calculus.js',
  'js/calculus-job.js',
  'js/calculus-worker.js',
  'js/calculus-ui.js',
  'js/base.js',
  'js/base-ui.js',
  'js/complex.js',
  'js/complex-ui.js',
  'js/formulas.js',
  'js/formulas-ui.js',
  'js/big.js',
  'js/big-ui.js',
  'js/prob.js',
  'js/prob-ui.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
];

// ---- 新しい版が来たとき：ファイルを全部取ってきて、新しい入れ物にしまう ----
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 1つでも取れなければ、この版はやめる（古い版のまま。次にまたためす）
    await cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'no-cache' })));
  })());
});

// 開いている画面から「更新する」と言われたら、すぐ交代する
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// ---- 交代したとき：古い入れ物を片付ける ----
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('calculator-') && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim(); // 開いている画面も、すぐ受け持つ
  })());
});

// ---- ファイルを読み込むたびに：しまってあれば、それをすぐ返す ----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // このアプリのファイルを「見る」ときだけ受け持つ（それ以外はブラウザにおまかせ）
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const key = cacheKey(request.url);
    const cache = await caches.open(CACHE);
    const found = await findInCache(cache, key, request.mode === 'navigate');
    if (found) return found;
    // しまっていなければ、ネットから取って、次のためにしまう
    const response = await fetch(request);
    if (response.ok) event.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    return response;
  })());
});

// 「?」から後ろは無視して、同じファイルとして扱う
function cacheKey(url) {
  const { origin, pathname } = new URL(url);
  return origin + pathname;
}

async function findInCache(cache, key, isPage) {
  const options = { ignoreVary: true };
  const found = await cache.match(key, options);
  if (found || !isPage) return found;
  // ページそのものなら、トップページ（index.html）で代わりにする
  return (await cache.match(self.registration.scope, options))
    ?? cache.match(`${self.registration.scope}index.html`, options);
}
