// =========================================================
// 微分・積分・Σ・lim の計算をする「別の働き手」（Web Worker）
//
// 計算に時間がかかっても画面が固まらないように、ここで計算する。
// 画面（calculus-ui.js）から { id, req } が来たら、計算して { id, res } を返す。
// =========================================================
import { runJob } from './calculus-job.js';

self.addEventListener('message', (event) => {
  const { id, req } = event.data;
  self.postMessage({ id, res: runJob(req) });
});
