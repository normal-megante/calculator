// =========================================================
// データ保存のしくみ（IndexedDB）
//
// IndexedDB は、ブラウザの中にある「データの保管庫」です。
// 計算の履歴はすべてここに保存され、スマホの外には送られません。
//
// 棚（ストア）
//   history : 計算の履歴（＝ を押すたびに1つ）
//     { id, time, items: 式, value: 答え, name: 名前, kind: 種類 }
//     items と value は、BigInt を文字にした形（num.js の serialize）で入れる
// =========================================================

const DB_NAME = 'calculator';

// データの形を変えるときは、この数字を1つ上げて、upgrade() に直し方を書き足す
//   1：最初の形（history）
const DB_VERSION = 1;

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    const history = db.createObjectStore('history', { keyPath: 'id' });
    history.createIndex('time', 'time');
  }
}

let opening = null;

function openDb() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

async function run(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('history', mode);
    const result = work(tx.objectStore('history'));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 全部（新しい順）
export async function getAllHistory() {
  const list = await run('readonly', (store) => store.getAll());
  return list.sort((a, b) => b.time - a.time);
}

export function putHistory(entry) {
  return run('readwrite', (store) => { store.put(entry); });
}

export function deleteHistory(id) {
  return run('readwrite', (store) => { store.delete(id); });
}

export function deleteManyHistory(ids) {
  return run('readwrite', (store) => { ids.forEach((id) => store.delete(id)); });
}
