#!/usr/bin/env node
// 全シナリオの全手順 (ゲーム本体のカウントダウンは 3 / 2 / 1 も) をヘッドレス Chromium で描画し、
// 両端末の画面 (.screen) にゲームが出さないもの (仮・未決・決定の印、U 番号、モックの注記、日本語) が無いことを確かめる。
// 端末の上の帯は未決バッジだけで、すべて見えていること (1280x720 で確かめる) も確かめる。
// 遷移表に行が無いボタンの破線・半透明 ([data-norow]) はモックの操作の手がかりなので数えるだけにする。
// 使い方: node tests/scan-screens.mjs   (Chromium の場所は環境変数 CHROMIUM で変えられる。既定は chromium)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

const server = createServer((req, res) => {
  const file = join(root, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const profile = mkdtempSync(join(tmpdir(), 'qa2-scan-'));
const chrome = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const exited = new Promise((r) => chrome.once('exit', r));
let send = null;
// Browser.close で子プロセス (ネットワークなど) ごと閉じ、終わってからプロファイルを消す
// (kill だけだと、残った子プロセスが消したあとのプロファイルに書き込む)
const cleanup = async () => {
  if (send) send('Browser.close'); else chrome.kill();
  const timer = setTimeout(() => chrome.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
  server.close();
  rmSync(profile, { recursive: true, force: true });
};

try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg);
  };
  send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

  await send('Page.enable');
  // ノート PC くらいの縦に狭い画面で確かめる (端末の上の帯が縮んでバッジが隠れないか)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100));

  const res = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true,
    expression: `document.fonts.ready.then(() => (${scan})())` });
  if (res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
  const { frames, findings, norow } = res.result.result.value;

  console.log(`${frames} 枚 (全シナリオの全手順と、カウントダウン 3 / 2 / 1) の両端末の画面を確かめました`);
  const norowStates = Object.keys(norow);
  console.log(`[data-norow] (行が無いボタンの破線・半透明、モックの手がかりとして残す): ${norowStates.length} 状態 ` +
    `(${norowStates.slice(0, 8).map((k) => `${k}: ${norow[k]}`).join(', ')}${norowStates.length > 8 ? ', …' : ''})`);
  if (findings.length) {
    console.error(`\nNG: 端末の画面にゲームが出さないものが ${findings.length} 件`);
    findings.forEach((f) => console.error('  ' + f));
    process.exitCode = 1;
  } else {
    console.log('ok  端末の画面に仮・未決・決定の印、U 番号、モックの注記、日本語はありません');
    console.log('ok  端末の上の帯は未決バッジだけで、すべて帯の中に見えています');
  }
} finally {
  await cleanup();
}

// ページの中で実行する。シナリオ一覧・手順一覧のボタンは押すと同期的に描画する
function scan() {
  const BAD_TEXT = [[/仮/, '「仮」'], [/未決/, '「未決」'], [/決定/, '「決定」'], [/\bU\d{1,2}\b/, 'U 番号'], [/[\u3040-\u30ff\u3400-\u9fff]/, '日本語']];
  const BAD_SEL = '.mock-note, .tmp, .decided-note, [class*="pill-"], [data-undecided]';
  const findings = [];
  const norow = {};
  let frames = 0;
  // 手順の移動は画面のボタン (シナリオ一覧・手順一覧・カウントダウンの 3 / 2 / 1) を押して行う。
  // hash を書き換えて回すと、Chromium が短時間の大量の history.replaceState を黙って捨てるため、途中から手順が進まなくなる。
  // 描画中の例外はクリックの外へ出てこないので error イベントで拾い、両端末の状態が遷移表の再生結果と同じかも確かめる
  let lastError = null;
  window.addEventListener('error', (e) => { lastError = e.error ? e.error.stack || String(e.error) : e.message; });
  const click = (sel, where, sc, step) => {
    lastError = null;
    const el = document.querySelector(sel);
    if (!el) { findings.push(`${where}: ${sel} が無い`); return false; }
    el.click();
    if (lastError) { findings.push(`${where}: 描画中の例外 ${lastError}`); return false; }
    const st = Engine.replay(sc, step).state;
    const want = ['host', 'client'].map((d) => st[d] + (st[d + 'Dialog'] ? ' + 🗨 ' + st[d + 'Dialog'] : '')).join(' / ');
    const got = [...document.querySelectorAll('.device .state-name')].map((e) => e.textContent).join(' / ');
    if (got !== want) { findings.push(`${where}: その手順を描けていない (${got}、期待: ${want})`); return false; }
    return true;
  };
  const check = (where) => {
    frames++;
    document.querySelectorAll('.device').forEach((dev) => {
      const screen = dev.querySelector('.screen');
      const state = dev.querySelector('.state-name').textContent;
      const at = `${where} ${dev.dataset.dev} (${state})`;
      const text = screen.textContent;
      BAD_TEXT.forEach(([re, what]) => { const m = text.match(re); if (m) findings.push(`${at}: ${what} "${m[0]}" (${text.trim().slice(0, 80)})`); });
      screen.querySelectorAll(BAD_SEL).forEach((el) => findings.push(`${at}: ${el.tagName.toLowerCase()}.${el.className}`));
      screen.querySelectorAll('[title], [aria-label]').forEach((el) => {
        if (el.hasAttribute('data-norow')) return;
        const attr = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
        BAD_TEXT.forEach(([re, what]) => { if (re.test(attr)) findings.push(`${at}: 属性に ${what} (${attr.trim()})`); });
      });
      // 端末の上の帯: 未決バッジだけで、すべてが帯の中に見えていること
      const strip = dev.querySelector('.undecided-strip');
      const box = strip.getBoundingClientRect();
      strip.querySelectorAll('*').forEach((el) => {
        if (el.parentElement === strip && !el.classList.contains('pill-undecided')) findings.push(`${at}: 端末の上の帯に未決以外 (${el.className})`);
      });
      strip.querySelectorAll(':scope > .pill-undecided').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5) findings.push(`${at}: 端末の上の帯で ${el.dataset.undecided} がはみ出して見えない (${Math.max(r.bottom - box.bottom, r.right - box.right).toFixed(1)}px)`);
      });
      const n = screen.querySelectorAll('[data-norow]').length;
      if (n) norow[state] = n;
    });
  };
  SCENARIOS.forEach((sc) => {
    for (let step = 0; step <= sc.steps.length; step++) {
      const where = `s=${sc.id} step=${step}`;
      const sel = step === 0 ? `#scenario-list [data-scenario="${sc.id}"]` : `#step-list [data-step="${step}"]`;
      if (!click(sel, where, sc, step)) continue;
      if (/COUNTDOWN/.test(document.querySelector('.device .state-name').textContent)) {
        GAME_COUNTDOWN.digits.forEach((cd) => {
          if (!click(`#cd-freeze [data-cd="${cd}"]`, `${where} cd=${cd}`, sc, step)) return;
          const frozen = document.querySelector('.g-cd.frozen');
          if (!frozen || frozen.dataset.cd !== String(cd)) findings.push(`${where} cd=${cd}: カウントダウンが ${cd} で止まっていない`);
          check(`${where} cd=${cd}`);
        });
      } else {
        check(where);
      }
    }
  });
  return { frames, findings, norow };
}
