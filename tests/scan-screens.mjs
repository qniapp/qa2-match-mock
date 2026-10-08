#!/usr/bin/env node
// 全シナリオの全手順 (ゲーム本体のカウントダウンは 3 / 2 / 1 も) をヘッドレス Chromium で描画し、
// 両端末の画面 (.screen) にゲームが出さないもの (仮・未決・決定の印、U 番号、モックの注記、日本語) が無いことを確かめる。
// ランダム対戦の画面に 60 秒 (仮の長さ) が出ないこと、検索中のモック操作が端末の外にあることも確かめる (決定 U13)。
// アプリを離れて検索が止まった通知がモーダルではなく、メニューをさまたげないことも確かめる (決定 U43)。
// 結果画面と切断を待つ画面に秒数 (20 秒・3 秒・5 秒、仮の長さ) が出ないこと、スタンプの「3 秒たつ」「5 秒たつ」が端末の外にあること、
// No contest にスコアの行が無いこと (値が決まっていないスコアは "----" ではなく行ごと出さない) も確かめる (決定 U20 / U27 / U28 / U30)。
// Ready 画面 (決定 U31 / U32 / U36) は、プレイヤーごとのカード 2 枚 ("✓ Ready" / "Not ready"、自分のカードに YOU) と、
// 決定どおりのカウントダウン (Ready の 60s、再接続を待つ 20s) だけが数字として出ること、"Start Match" がどこにも無いこと、
// 「アプリを離れる」「切断する」が端末の外 (下のモック操作) にあることも確かめる。
// 部屋の画面 (決定 U1〜U19) は、Match Code の下の "Code expires in 30:00" (U7)、ホストが離れている間だけクライアントのカードのホストが "Away" (U14)、
// 古い文言 (Cancel Match / Leave Match / Go Back / Stay in Room / Ready to start / Match expired. など) が無いこと、
// 画面の下の帯 (2 行の "Connection failed" を含む) が画面に収まりボタンと重ならないことも確かめる。
// 2026-10-08 の決定 (U44〜U55): 切断を待つ間 (対戦中 U46・開始前 U54) は濃い暗幕と "20s" だけが数字として出ること、VS 画面が "Rating 1000" で Rank が無いこと (U48)、
// 部屋のお知らせが Close 付きの帯で画面に収まり押せること (U52)、ミュートのボタンが "Mute opponent emotes" / "Unmute opponent emotes" であること (U49)、
// 切断を待つ間のモック操作 (再接続する / 相手が戻る / 20 秒たつ) が端末の外で押せることも確かめる。
// 最初に、hash なしで開くと自由操作 (両端末が最初の画面で、ボタンを押せ、自動遷移が実時間で進む) で、ページに消した部品 (左のシナリオのパネル、
// 右パネルの状態名の行・「ほか:」のバッジの列・ログタブ、凡例の未決・点線 / 実線、端末の上の黄色い未決の帯、未決トグルのラジオ) が無く、
// タブの名前が「決定」で、モック設定が閉じていることも確かめる (1280x720 で確かめる)。
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
  // ノート PC くらいの縦に狭い画面で確かめる (端末の列が横にスクロールしても押せるか)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 100));

  const evaluate = async (fn) => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `document.fonts.ready.then(() => (${fn})())` });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  const open = async (hash) => {
    events.length = 0;
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url: url + hash });
    for (let i = 0; i < 100 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 50));
  };
  const pageFindings = await evaluate(checkPage);
  // Profile (決定 U56): 自由操作で Cancel は保存せず、Save したものはページを開き直しても残る (localStorage)
  await open('');
  pageFindings.push(...await evaluate(profileSave));
  await open('');
  pageFindings.push(...await evaluate(profileReload));
  // localStorage に既定値と違う値がある状態で全シナリオを描く (シナリオはいつも最初の値から)
  const { frames, findings, norow, mutedVs } = await evaluate(scan);
  findings.unshift(...pageFindings);
  if (!mutedVs) findings.push('スタンプをミュートしたままの VS 画面 (あいさつが隠れないこと) を描いたシナリオが無い');

  console.log(`${frames} 枚 (全シナリオの全手順と、カウントダウン 3 / 2 / 1) の両端末の画面を確かめました`);
  const norowStates = Object.keys(norow);
  console.log(`[data-norow] (行が無いボタンの破線・半透明、モックの手がかりとして残す): ${norowStates.length} 状態 ` +
    `(${norowStates.slice(0, 8).map((k) => `${k}: ${norow[k]}`).join(', ')}${norowStates.length > 8 ? ', …' : ''})`);
  if (findings.length) {
    console.error(`\nNG: 端末の画面にゲームが出さないものが ${findings.length} 件`);
    findings.forEach((f) => console.error('  ' + f));
    process.exitCode = 1;
  } else {
    console.log('ok  hash なしで開くと自由操作で、両端末が最初の画面 (Online Battle) にあり、ボタンを押せ、自動遷移が実時間で進みます');
    console.log('ok  左のシナリオのパネル、右パネルの状態名の行・「ほか:」・ログタブ、凡例の未決・点線 / 実線、端末の上の未決の帯、トグルのラジオはありません');
    console.log('ok  タブの名前は「決定」で、モック設定は閉じています');
    console.log('ok  端末の画面に仮・未決・決定の印、U 番号、モックの注記、日本語はありません');
    console.log(`ok  Profile: Cancel は保存せず、Save したものは開き直しても残り、シナリオは localStorage に関係なく最初の値から。ミュートしたままの VS 画面 ${mutedVs} 枚にもあいさつがあります`);
  }
} finally {
  await cleanup();
}

// ページの中で実行する。hash なしで開いた直後のページ全体を確かめる
function checkPage() {
  const findings = [];
  const page = (what) => findings.push(`ページ: ${what}`);
  // 自由操作: シナリオなし、両端末が最初の画面 (Online Battle) で、ボタンを押せる
  if (MockApp.scenario !== null) page(`hash なしでシナリオ ${MockApp.scenario.id} が開いている`);
  if (location.hash !== '#s=free') page(`hash が ${location.hash} (期待: #s=free)`);
  const names = [...document.querySelectorAll('.device .state-name')].map((e) => e.textContent).join(' / ');
  if (names !== 'Host.MultiModeSelection / Client.MultiModeSelection') page(`自由操作の最初の画面が ${names}`);
  document.querySelectorAll('.device').forEach((dev) => {
    if (!dev.querySelector('.screen.view-online')) page(`${dev.dataset.dev} が Online Battle の画面でない`);
    if (!dev.querySelector('.screen [data-ev="friendMatch"]:not([data-norow])')) page(`${dev.dataset.dev} の Friend Match を押せない`);
  });
  // 消した部品
  const gone = {
    '.scenario-panel, #scenario-list, #scenario-detail, #btn-next, #btn-prev': '左のシナリオのパネル',
    '.cs-line, #current-state code.state-name': '右パネルの状態名の行',
    '.cs-others, .cs-decided li.others': '決定済みの「ほか:」のバッジの列',
    '[data-tab="log"], [data-tab-body="log"], #event-log': 'ログタブ',
    '.legend .pill-undecided': '凡例の「未決」',
    '.legend-auto, .legend-user': '凡例の「自動遷移 (点線)」「ユーザー操作 (実線)」',
    '.undecided-strip': '端末の上の黄色い未決の帯',
    'input[type="radio"], [data-opt], .u-options, #undecided-count': '未決トグルのラジオ',
  };
  Object.entries(gone).forEach(([sel, what]) => { if (document.querySelector(sel)) page(`${what}が残っている (${sel})`); });
  const legend = document.querySelector('.legend').textContent;
  if (/未決|点線|実線/.test(legend)) page(`凡例に ${legend}`);
  if (/Host\.|Client\./.test(document.querySelector('#current-state').textContent)) page('右パネルに状態名がある');
  if (/ほか:/.test(document.querySelector('#current-state').textContent)) page('右パネルに「ほか:」がある');
  // タブ: 状態遷移表と「決定」(件数なし) の 2 つ
  const tabs = [...document.querySelectorAll('.tabs [data-tab]')].map((b) => b.textContent);
  if (tabs.join() !== '状態遷移表,決定') page(`タブが ${tabs.join(' / ')} (期待: 状態遷移表 / 決定)`);
  // モック設定はふだん閉じた <details> で、環境イベントの下にある
  const settings = document.querySelector('details.mock-settings');
  if (!settings) page('モック設定が <details> でない');
  else {
    if (settings.open) page('モック設定が開いている');
    if (!settings.querySelector('#ctx-codeResult') || !settings.querySelector('#ctx-createResult')) page('モック設定に Join Match / Create Match の結果が無い');
    if (!(document.querySelector('#env-events').compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING)) page('モック設定が環境イベントの下にない');
  }
  // 押すと遷移表どおりに進み、自動遷移 (参加のあとの同期、0.8 秒) は実時間で進む (自由操作)
  const stateOf = (d) => document.querySelector(`.device[data-dev="${d}"] .state-name`).textContent;
  const press = (d, ev) => document.querySelector(`.device[data-dev="${d}"] .screen [data-ev="${ev}"]`).click();
  press('host', 'friendMatch');
  if (stateOf('host') !== 'Host.FriendMatch.Room') page(`自由操作で Friend Match を押しても ${stateOf('host')}`);
  [['host', 'createMatch'], ['client', 'friendMatch'], ['client', 'enterCode'], ['client', 'joinMatch']].forEach(([d, ev]) => press(d, ev));
  const joined = `${stateOf('host')} / ${stateOf('client')}`;
  if (joined !== 'Host.FriendMatch.Lobby.FriendJoined / Client.FriendMatch.Lobby.Connecting') page(`自由操作で参加しても ${joined}`);
  if (!/^⏱ /.test(document.querySelector('#auto-next').textContent)) page(`次の自動遷移の予定が無い (${document.querySelector('#auto-next').textContent})`);
  return new Promise((resolve) => setTimeout(() => {
    const synced = `${stateOf('host')} / ${stateOf('client')}`;
    if (synced !== 'Host.FriendMatch.Lobby.Ready / Client.FriendMatch.Lobby.Ready') page(`自由操作で 0.8 秒たっても同期しない (${synced})`);
    resolve(findings);
  }, 1500));
}

// ページの中で実行する。自由操作で Profile を開き、Cancel では保存せず、Save で localStorage に保存する (決定 U56)
function profileSave() {
  const findings = [];
  const page = (what) => findings.push(`Profile: ${what}`);
  const KEY = ProfileStore.KEY;
  if (localStorage.getItem(KEY) !== null) page('最初から localStorage に値がある');
  const host = document.querySelector('.device[data-dev="host"]');
  const press = (sel) => { const el = host.querySelector(`.screen ${sel}`); if (!el || el.hasAttribute('data-norow')) { page(`${sel} を押せない`); return; } el.click(); };
  const preview = () => [...host.querySelectorAll('.pf-card .vs-emoji, .pf-card .vs-name, .pf-card .vs-greet')].map((e) => e.textContent).join(' ');
  if (host.querySelector('.menu-item.secondary .mi-emoji').textContent !== '\u{1F44B}') page('Online Battle の Profile に既定の 👋 が無い');
  press('[data-ev="profile"]');
  if (preview() !== '\u{1F44B} Yasuhito \u201cHello!\u201d') page(`開いたときの見本が ${preview()}`);
  press('[data-ev="pickEmoji.robot"]');
  press('[data-ev="pickGreeting.goodLuck"]');
  if (preview() !== '\u{1F916} Yasuhito \u201cGood luck!\u201d') page(`選んでも見本が変わらない (${preview()})`);
  press('[data-ev="cancelProfile"]');
  if (localStorage.getItem(KEY) !== null) page(`Cancel で保存された (${localStorage.getItem(KEY)})`);
  press('[data-ev="profile"]');
  if (preview() !== '\u{1F44B} Yasuhito \u201cHello!\u201d') page(`Cancel のあと開き直した見本が ${preview()}`);
  press('[data-ev="pickEmoji.star"]');
  host.querySelector('.screen .back').click();
  if (localStorage.getItem(KEY) !== null) page('‹ で保存された');
  press('[data-ev="profile"]');
  press('[data-ev="pickEmoji.rocket"]');
  press('[data-ev="pickGreeting.bringItOn"]');
  press('[data-ev="saveProfile"]');
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!saved || saved.host.emoji !== '\u{1F680}' || saved.host.greeting !== 'Bring it on!' || saved.client.emoji !== '\u{1F60E}') page(`Save で保存されない (${localStorage.getItem(KEY)})`);
  return findings;
}

// ページの中で実行する。開き直した自由操作は保存した値から始まり、シナリオは最初の値から (決定 U56)
function profileReload() {
  const findings = [];
  const page = (what) => findings.push(`Profile (開き直し): ${what}`);
  const host = document.querySelector('.device[data-dev="host"]');
  const emoji = host.querySelector('.menu-item.secondary .mi-emoji');
  if (!emoji || emoji.textContent !== '\u{1F680}') page(`Online Battle の Profile の絵文字が ${emoji && emoji.textContent}`);
  host.querySelector('.screen [data-ev="profile"]').click();
  const sel = [...host.querySelectorAll('.pf-emoji.selected, .pf-greet.selected')].map((e) => e.textContent).join(' / ');
  if (sel !== '\u{1F680} / Bring it on!') page(`開き直した Profile で選ばれているのが ${sel}`);
  // シナリオ 1 の VS 画面は保存した値に関係なく 👋 "Hello!"
  MockApp.show('1', 11);
  const greet = [...document.querySelectorAll('.device[data-dev="host"] .vs-card.host .vs-emoji, .device[data-dev="host"] .vs-card.host .vs-greet')].map((e) => e.textContent).join(' ');
  if (greet !== '\u{1F44B} \u201cHello!\u201d') page(`シナリオ 1 の VS 画面が保存した値 (${greet}) を使う`);
  if (localStorage.getItem(ProfileStore.KEY) === null) page('シナリオを開いたら保存した値が消えた');
  return findings;
}

// ページの中で実行する。MockApp.show は同期的に描画する
function scan() {
  const BAD_TEXT = [[/仮/, '「仮」'], [/未決/, '「未決」'], [/決定/, '「決定」'], [/\bU\d{1,2}\b/, 'U 番号'], [/[\u3040-\u30ff\u3400-\u9fff]/, '日本語']];
  const MATCH_CODE_TEXT = 'QWERTY123';
  const BAD_SEL = '.mock-note, .tmp, .decided-note, [class*="pill-"], [data-undecided]';
  const findings = [];
  const norow = {};
  let frames = 0;
  let mutedVs = 0;
  let current = null; // 描いている手順の遷移表の状態
  // 手順の移動は MockApp.show (#s=..&step=..&cd=.. の deep link と同じ) を直接呼んで行う。
  // hash を書き換えて回すと、Chromium が短時間の大量の history.replaceState を黙って捨てるため、途中から手順が進まなくなる。
  // 両端末の状態が遷移表の再生結果と同じかも確かめる
  const show = (where, sc, step, cd) => {
    try { MockApp.show(sc.id, step, cd); } catch (e) { findings.push(`${where}: 描画中の例外 ${e.stack || e}`); return false; }
    const st = Engine.replay(sc, step).state;
    current = st;
    const want = ['host', 'client'].map((d) => st[d] + Engine.extrasLabel(st, d)).join(' / ');
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
      // ランダム対戦 (決定 U13): 60 秒という仮の長さは端末の画面に出さない。「アプリを離れる」「60 秒たつ」は端末の外 (下のモック操作) だけ
      if (/\.Matchmake/.test(state) && /\d/.test(text)) findings.push(`${at}: 数字がある (60 秒は端末の画面に出さない): ${text.trim().slice(0, 80)}`);
      if (screen.querySelector('[data-ev="leaveApp"], [data-ev="searchTimeout"]')) findings.push(`${at}: 検索中のモック操作が端末の画面の中にある`);
      if (/\.Matchmake$/.test(state)) {
        ['leaveApp', 'searchTimeout'].forEach((ev) => {
          if (!dev.querySelector(`.mock-controls [data-ev="${ev}"]:not([data-norow])`)) findings.push(`${at}: 端末の下のモック操作で ${ev} を押せない`);
        });
      }
      // アプリを離れて検索が止まった通知 (決定 U43): Online Battle の中のボックスで、暗幕を重ねない。
      // メニュー (Random Match / Friend Match) は上に何も重ならず押せ、通知は端末の画面に収まっている
      if (/\.Matchmake\.Stopped$/.test(state)) {
        const box = screen.querySelector('.menu > .inline-notice');
        if (!box) findings.push(`${at}: Online Battle の中に通知のボックスが無い`);
        if (screen.querySelector('.dim')) findings.push(`${at}: 通知がモーダル (暗幕がある)`);
        if (box) {
          const sr = screen.getBoundingClientRect();
          const r = box.getBoundingClientRect();
          if (r.top < sr.top || r.bottom > sr.bottom || r.left < sr.left || r.right > sr.right) findings.push(`${at}: 通知のボックスが画面からはみ出している`);
          if (box.textContent.indexOf('Search stopped while the app was in the background.') !== 0) findings.push(`${at}: 通知の文言が違う (${box.textContent})`);
        }
        // 1280x720 では端末の列が横にスクロールするので、押す人と同じく見えるところまでスクロールしてから確かめ、元に戻す
        const scroller = document.querySelector('.devices');
        const [sx, sy] = [scroller.scrollLeft, scroller.scrollTop];
        screen.querySelectorAll('.menu-item, .inline-notice .btn').forEach((el) => {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (el.hasAttribute('data-norow') || !el.contains(hit)) findings.push(`${at}: ${el.textContent.trim()} を押せない`);
        });
        scroller.scrollTo(sx, sy);
      }
      // 結果画面とゲーム画面 (決定 U20〜U30 / U28): 仮の秒数を出さない。スタンプのタイマーは端末の下だけ。スコアが決まっていなければ行ごと出さない。
      // 切断を待つ間 (決定 U46 / U54) だけは、残りの秒数 "20s" を濃い暗幕の上のパネルに出す
      const waitingTimer = screen.querySelector('.m-dim.paused .m-timer');
      const isWaiting = /\.(Game|Opponent)\.(Disconnected|OpponentDisconnected)\b/.test(state);
      if (isWaiting !== !!waitingTimer || (waitingTimer && waitingTimer.textContent !== '20s')) findings.push(`${at}: 切断を待つ間の残りの秒数が ${waitingTimer ? waitingTimer.textContent : 'なし'}`);
      const restText = waitingTimer ? text.replace(waitingTimer.textContent, '') : text;
      if (/Result|\.Game\.|\.Opponent/.test(state) && /\b\d+\s*(s|sec|secs|seconds?)\b/i.test(restText)) findings.push(`${at}: 秒数がある: ${restText.trim().slice(0, 80)}`);
      if (isWaiting) {
        const want = /\.Disconnected\b/.test(state) ? ['Connection lost', 'Reconnecting…'] : ['Your opponent disconnected', 'Waiting for your opponent to reconnect…'];
        const got = [...screen.querySelectorAll('.m-panel .m-title, .m-panel .m-body')].map((e) => e.textContent);
        if (got.join() !== want.join()) findings.push(`${at}: 切断を待つ表示が ${got.join(' / ')} (期待: ${want.join(' / ')})`);
        const evs = [...dev.querySelectorAll('.mock-controls [data-env]:not([data-norow])')].map((e) => e.dataset.env).join();
        if (evs !== 'net.recovered,timer.disconnectTimeout') findings.push(`${at}: 端末の下のモック操作で再接続 / 20 秒たつを押せない (${evs})`);
        if (screen.querySelector('.g-menu')) findings.push(`${at}: 切断を待つ間にメニューボタンがある`);
      }
      if (screen.querySelector('.m-dim') && !/\.Game\.(MatchMenu|SurrenderConfirm)\b/.test(state) && !isWaiting) findings.push(`${at}: 暗幕がある`);
      if (/\.Game\.(MatchMenu|SurrenderConfirm)\b/.test(state) && screen.querySelector('.m-dim.paused')) findings.push(`${at}: MATCH MENU の暗幕が止まった表示 (U37)`);
      // VS 画面 (決定 U48): 両者のカードに "Rating 1000"。Rank は無い
      if (screen.querySelector('.vs')) {
        const ratings = [...screen.querySelectorAll('.vs-card .vs-rating')].map((e) => e.textContent);
        if (ratings.join() !== `Rating ${ELO.initial},Rating ${ELO.initial}`) findings.push(`${at}: VS 画面のレーティングが ${ratings.join(' / ')}`);
      }
      if (/\bRank\b/.test(text)) findings.push(`${at}: "Rank" が残っている`);
      // VS 画面の絵文字とあいさつ (決定 U56): 部屋を作った・入った・探し始めたときに固定した値。スタンプのミュート (U49) でも隠さない
      const d = dev.dataset.dev;
      if (screen.querySelector('.vs')) {
        ['host', 'client'].forEach((who) => {
          const card = [...screen.querySelectorAll(`.vs-card.${who} .vs-emoji, .vs-card.${who} .vs-greet`)].map((e) => e.textContent).join(' ');
          const want = `${current[who + 'ShownEmoji']} \u201c${current[who + 'ShownGreeting']}\u201d`;
          if (card !== want) findings.push(`${at}: VS 画面の ${who} のカードが ${card} (期待: ${want})`);
          if (card.includes("'")) findings.push(`${at}: VS 画面の ${who} のあいさつにまっすぐな ' (’ にそろえる)`);
        });
        if (current[d + 'Mute']) mutedVs++;
      }
      // Online Battle の Profile (決定 U56): 保存した絵文字を添える。押せるのは Online Battle とその中の通知のときだけ
      const pItem = screen.querySelector('.menu-item.secondary');
      if (/\.(MultiModeSelection|Matchmake\.(Stopped|MatchCancelled|ReconnectFailed|NotFound))$/.test(state) !== !!pItem) findings.push(`${at}: Profile のボタンが ${pItem ? 'ある' : '無い'}`);
      if (pItem) {
        if (pItem.textContent.replace('›', '').trim() !== `${current[d + 'Emoji']}Profile`) findings.push(`${at}: Profile のボタンが ${pItem.textContent}`);
        if (pItem.hasAttribute('data-norow') !== /NotFound$/.test(state)) findings.push(`${at}: Profile のボタンを押せるかが違う`);
      }
      // Profile 画面 (決定 U56): 見本・絵文字 10・あいさつ 10・Save / Cancel が画面に収まって重ならず、選んだものが 1 つずつ
      if (/\.Profile$/.test(state)) {
        const emojis = [...screen.querySelectorAll('.pf-emoji')];
        const greets = [...screen.querySelectorAll('.pf-greet')];
        if (emojis.map((e) => e.textContent).join(' ') !== PROFILE_EMOJIS.map((e) => e.emoji).join(' ')) findings.push(`${at}: 絵文字の候補が ${emojis.map((e) => e.textContent).join(' ')}`);
        if (greets.map((e) => e.textContent).join(' / ') !== PROFILE_GREETINGS.map((g) => g.text).join(' / ')) findings.push(`${at}: あいさつの候補が違う`);
        const sel = [...screen.querySelectorAll('.selected')].map((e) => e.textContent);
        if (sel.join(' / ') !== `${current[d + 'DraftEmoji']} / ${current[d + 'DraftGreeting']}`) findings.push(`${at}: 選ばれているのが ${sel.join(' / ')}`);
        if ([...screen.querySelectorAll('[aria-pressed="true"]')].length !== 2) findings.push(`${at}: aria-pressed が 2 つでない`);
        const pv = [...screen.querySelectorAll('.pf-card > div')].map((e) => e.textContent).join(' ');
        if (pv !== `${current[d + 'DraftEmoji']} ${d === 'host' ? 'Yasuhito' : 'ogwssk'} \u201c${current[d + 'DraftGreeting']}\u201d`) findings.push(`${at}: 見本が ${pv}`);
        if (screen.querySelector('input, textarea, [contenteditable]')) findings.push(`${at}: 自由入力の欄がある`);
        const btns = [...screen.querySelectorAll('.pf-actions .btn')].map((b) => b.textContent);
        if (btns.join() !== 'Save,Cancel') findings.push(`${at}: ボタンが ${btns.join(' / ')}`);
        if (screen.querySelector('.pf-emoji[data-norow], .pf-greet[data-norow], .pf-actions [data-norow], .back[data-norow]')) findings.push(`${at}: Profile 画面に押せない部品がある`);
        const sr = screen.getBoundingClientRect();
        const parts = [...screen.querySelectorAll('.hdr, .pf-card, .pf-emojis, .pf-greets, .pf-actions .btn')].map((el) => [el, el.getBoundingClientRect()]);
        parts.forEach(([el, r]) => { if (r.top < sr.top || r.bottom > sr.bottom || r.left < sr.left || r.right > sr.right) findings.push(`${at}: ${el.className} が画面からはみ出している`); });
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const [a, ra] = parts[i]; const [b, rb] = parts[j];
          if (ra.bottom > rb.top + 0.5 && rb.bottom > ra.top + 0.5 && ra.right > rb.left && rb.right > ra.left) findings.push(`${at}: ${a.className} と ${b.className} が重なっている`);
        }
        greets.forEach((g) => { if (g.scrollWidth > g.clientWidth + 1 || g.scrollHeight > g.clientHeight + 1) findings.push(`${at}: あいさつ "${g.textContent}" がはみ出している`); });
      }
      // 部屋のお知らせ (決定 U52): モーダルではない帯で、Close を押せる。画面に収まり、ほかの部品と重ならない
      const notice = screen.querySelector('.room-notice');
      if (/\.FriendMatch\.Room\.(HostLeft|HostDisconnected|RoomClosed|ReconnectFailed|MatchCancelled)\b/.test(state) !== !!notice) findings.push(`${at}: 部屋のお知らせの帯が ${notice ? 'ある' : '無い'}`);
      if (notice) {
        const close = notice.querySelector('.rn-close');
        if (!close || close.textContent !== 'Close' || close.hasAttribute('data-norow')) findings.push(`${at}: お知らせの Close を押せない`);
        if (screen.querySelector('.dim')) findings.push(`${at}: お知らせがモーダル (暗幕がある)`);
        const sr = screen.getBoundingClientRect();
        const nr = notice.getBoundingClientRect();
        if (nr.top < sr.top || nr.bottom > sr.bottom || nr.left < sr.left || nr.right > sr.right) findings.push(`${at}: お知らせの帯が画面からはみ出している`);
        screen.querySelectorAll('.btn, .input, .sec-label').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom > nr.top + 0.5 && nr.bottom > r.top + 0.5 && r.right > nr.left && nr.right > r.left) findings.push(`${at}: お知らせの帯が ${el.textContent.trim()} と重なっている`);
        });
        if (close) { const cr = close.getBoundingClientRect(); if (cr.right > nr.right || cr.top < nr.top || cr.bottom > nr.bottom) findings.push(`${at}: Close が帯からはみ出している`); }
      }
      // スタンプのミュート (決定 U49)
      const mute = screen.querySelector('.r-mute');
      if (mute && !/^.?.?(Mute|Unmute) opponent emotes$/u.test(mute.textContent)) findings.push(`${at}: ミュートのボタンが ${mute.textContent}`);
      if (mute && (/🔕/.test(state) !== /Unmute/.test(mute.textContent))) findings.push(`${at}: ミュートのボタンが状態と合わない (${mute.textContent})`);
      // Ready 画面 (決定 U31 / U32 / U36) と部屋の画面 (決定 U1〜U19)。古い文言は出さない
      const OLD = text.match(/Start Match|Ready to start|Stay in Room|Go Back|Leave Match|Cancel Match|Cancel this match|Leave this match|Match expired\.|cancelled the match|left the match\./);
      if (OLD) findings.push(`${at}: 古い文言 "${OLD[0]}" が残っている`);
      // 部屋の画面: Match Code の下に期限 "Code expires in 30:00" (U7)。期限切れと再接続できなかった画面には出さない。数字は Match Code・期限・カウントダウンだけ
      if (/\.FriendMatch\.Lobby\./.test(state)) {
        const exp = screen.querySelector('.code-expiry');
        const wantExpiry = !/\.(CodeExpired|CouldNotReconnect)\b/.test(state);
        if (!!exp !== wantExpiry || (exp && exp.textContent !== CODE_EXPIRY.text)) findings.push(`${at}: 期限の表示が ${exp ? exp.textContent : 'なし'} (期待: ${wantExpiry ? CODE_EXPIRY.text : 'なし'})`);
        const timerText = (screen.querySelector('.rd-timer') || { textContent: '\u0000' }).textContent;
        const rest = text.replace(MATCH_CODE_TEXT, '').replace(CODE_EXPIRY.text, '').replace(timerText, '');
        if (/\d/.test(rest)) findings.push(`${at}: Match Code・期限・カウントダウンのほかに数字がある: ${rest.trim().slice(0, 80)}`);
      }
      // 画面の下の帯 (トースト): 端末の画面に収まり、ボタンや入力欄・お知らせと重ならない。作り直しに失敗したとき (⚠ createFailed) は "Connection failed" (U6 / U12)
      const toast = screen.querySelector('.toast');
      if (toast) {
        const sr = screen.getBoundingClientRect();
        const tr = toast.getBoundingClientRect();
        if (tr.top < sr.top || tr.bottom > sr.bottom || tr.left < sr.left || tr.right > sr.right) findings.push(`${at}: 帯が画面からはみ出している`);
        screen.querySelectorAll('.btn, .input, .room-notice, .error, .menu-item, .tile').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom > tr.top + 0.5 && tr.bottom > r.top + 0.5 && r.right > tr.left && tr.right > r.left) findings.push(`${at}: 帯 "${toast.textContent}" が ${el.textContent.trim() || el.className} と重なっている`);
        });
        if (toast.scrollWidth > toast.clientWidth + 1) findings.push(`${at}: 帯の文字がはみ出している (${toast.textContent})`);
        const chev = toast.querySelector('.chev');
        if (chev) { const cr = chev.getBoundingClientRect(); if (cr.top < tr.top || cr.bottom > tr.bottom) findings.push(`${at}: 帯の › が帯の外にある (${toast.textContent})`); }
      }
      if (/⚠ createFailed/.test(state) && (!toast || !/^Connection failed/.test(toast.textContent))) findings.push(`${at}: 作り直しの失敗で "Connection failed" の帯が出ていない`);
      if (screen.querySelector('[data-ev="leaveApp"], [data-ev="disconnect"]')) findings.push(`${at}: ルームのモック操作が端末の画面の中にある`);
      if (/\.FriendMatch\.Lobby\.(Ready|Starting|Reconnecting|OpponentDisconnected|FriendJoined|Connecting|ConnectionLost|FriendDisconnected)/.test(state)) {
        const cards = [...screen.querySelectorAll('.rd-card')];
        const states = cards.map((c) => c.querySelector('.rd-state').textContent);
        if (cards.length !== 2 || states.some((t) => !['\u2713 Ready', 'Not ready', 'Away'].includes(t))) findings.push(`${at}: プレイヤーごとのカードが 2 枚 ("✓ Ready" / "Not ready" / "Away") でない (${states.join(', ')})`);
        // ホストが ‹ で離れている間 (決定 U14) だけ、クライアントのカードのホストは "Away"
        const hostAway = /^Host\.Away\./.test(document.querySelector('.device[data-dev="host"] .state-name').textContent);
        const wantAway = dev.dataset.dev === 'client' && hostAway;
        if ((states[1] === 'Away') !== wantAway || states[0] === 'Away') findings.push(`${at}: 相手のカードの "Away" が ${states[1] === 'Away'} (期待: ${wantAway})`);
        if (!cards[0] || !cards[0].querySelector('.you') || screen.querySelectorAll('.rd-card .you').length !== 1) findings.push(`${at}: 自分のカードに YOU が無い`);
        const timer = screen.querySelector('.rd-timer');
        const wantTimer = /WaitingForOpponent/.test(state) ? '60s' : /\.(OpponentDisconnected|Reconnecting|ConnectionLost|FriendDisconnected)\b/.test(state) ? '20s' : null;
        if ((timer ? timer.textContent : null) !== wantTimer) findings.push(`${at}: カウントダウンが ${timer ? timer.textContent : 'なし'} (期待: ${wantTimer || 'なし'})`);
        ['leaveApp', 'disconnect'].forEach((ev) => {
          if (!dev.querySelector(`.mock-controls [data-ev="${ev}"]`)) findings.push(`${at}: 端末の下のモック操作に ${ev} が無い`);
        });
        // Leave Room / Close Room の確認 (決定 U9 / U14 / U34) を開いても、後ろの画面のボタンは消えない
        if (/🗨 (leaveRoom|closeRoom)/.test(state)) {
          const name = state.split(' + ')[0];
          const want = SCREENS[name].buttons.map((b) => b.label).join(' / ');
          const got = [...screen.querySelectorAll('.actions .btn')].map((b) => b.textContent).join(' / ');
          if (got !== want) findings.push(`${at}: 確認の後ろのボタンが ${got} (期待: ${want})`);
        }
        // カード・お知らせ・状況の一行・ボタンが端末の画面に収まり、重ならない
        const sr = screen.getBoundingClientRect();
        const parts = [...screen.querySelectorAll('.code-expiry, .rd-cards, .rd-notice, .rd-info .status, .rd-timer, .actions')].map((el) => [el, el.getBoundingClientRect()]);
        parts.forEach(([el, r]) => { if (r.top < sr.top || r.bottom > sr.bottom) findings.push(`${at}: ${el.className} が画面からはみ出している`); });
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const [a, ra] = parts[i]; const [b, rb] = parts[j];
          if (a.contains(b) || b.contains(a)) continue;
          if (ra.bottom > rb.top + 0.5 && rb.bottom > ra.top + 0.5 && ra.right > rb.left && rb.right > ra.left) findings.push(`${at}: ${a.className} と ${b.className} が重なっている`);
        }
      }
      if (/----/.test(text)) findings.push(`${at}: 値の決まっていない ---- がある`);
      if (screen.querySelector('[data-ev="stampShown"], [data-ev="stampInterval"], [data-ev="disconnect"], [data-ev="win"], [data-ev="draw"]')) findings.push(`${at}: モック操作が端末の画面の中にある`);
      if (/NoContestResult/.test(state) && /Score/.test(text)) findings.push(`${at}: No contest にスコアの行がある`);
      if (/💬 (gg|thanks|nice)/.test(state)) {
        ['stampShown', 'stampInterval'].forEach((ev) => {
          if (!dev.querySelector(`.mock-controls [data-ev="${ev}"]:not([data-norow])`)) findings.push(`${at}: 端末の下のモック操作で ${ev} を押せない`);
        });
        if (!screen.querySelector('.r-player.me .r-bubble')) findings.push(`${at}: 送ったスタンプの吹き出しが無い`);
      }
      const n = screen.querySelectorAll('[data-norow]').length;
      if (n) norow[state] = n;
    });
  };
  SCENARIOS.forEach((sc) => {
    for (let step = 0; step <= sc.steps.length; step++) {
      const where = `s=${sc.id} step=${step}`;
      if (!show(where, sc, step)) continue;
      if (/\.Game\.Countdown$/.test(document.querySelector('.device .state-name').textContent)) {
        GAME_COUNTDOWN.digits.forEach((cd) => {
          if (!show(`${where} cd=${cd}`, sc, step, cd)) return;
          const frozen = document.querySelector('.g-cd.frozen');
          if (!frozen || frozen.dataset.cd !== String(cd)) findings.push(`${where} cd=${cd}: カウントダウンが ${cd} で止まっていない`);
          check(`${where} cd=${cd}`);
        });
      } else {
        check(where);
      }
    }
  });
  return { frames, findings, norow, mutedVs };
}
