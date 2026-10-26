#!/usr/bin/env node
// 全シナリオの全手順 (ゲーム本体のカウントダウンは 3 / 2 / 1 も) をヘッドレス Chromium で描画し、
// 両端末の画面 (.screen) にゲームが出さないもの (仮・未決・決定の印、U 番号、モックの注記、日本語) が無いことを確かめる。
// ランダム対戦の画面に 60 秒 (仮の長さ) が出ないこと、検索中のモック操作が端末の外にあることも確かめる (決定 U13)。
// Random Match の画面は開くとすぐ "Searching for an opponent…" と大きな Cancel だけになり、Ready を待つ画面が無いことも確かめる (決定 U74)。
// アプリを離れて検索が止まった通知がモーダルではなく、メニューをさまたげないことも確かめる (決定 U43)。
// 結果画面と切断を待つ画面に秒数 (20 秒・3 秒・5 秒、仮の長さ) が出ないこと、スタンプの「3 秒たつ」「5 秒たつ」が端末の外にあること、
// 結果画面にスコアの行が無いこと (qniapp/qa2#1891 FB 7: 勝敗とレーティングの変化だけ) も確かめる (決定 U20 / U27 / U28)。
// 再戦 (決定 U72) は、両者に同じ Rematch だけがあり、押した側のくるくるが画面に収まって後ろの結果画面を押せず、Cancel だけを押せることを確かめる。
// 結果画面の Rematch は、Friend Match でもランダム対戦でもほかのボタンより上に描かれていることも確かめる (決定 U73)。
// Ready 画面 (決定 U31 / U32 / U36) は、プレイヤーごとのカード 2 枚 ("✓ Ready" / "Not ready"、自分のカードに YOU) と、
// 再接続を待つ 20s のカウントダウンだけが数字として出ること (自分だけ Ready で待つ間は秒数ではなく待っている印 (点の動き) を出す、#1891 の FB 6)、"Start Match" がどこにも無いこと、
// 「アプリを離れる」「切断する」が端末の外 (下のモック操作) にあることも確かめる。
// 部屋の画面 (決定 U1〜U19) は、Match Code の下にホストにだけ "Share this code with your friend!" があり期限の表示が無いこと (U58)、
// Match Code のコピーのボタンがホストにだけ ("Copy match code" の名前付きのアイコン。期限切れには無い、#1891 FB 5) あること、クライアントのカードに "Away" が無いこと、
// 古い文言 (Go Back / Stay in Room / Ready to start / Match expired. など) と "room" (名前 (aria-label / title) も、U63) が無いこと、
// 画面の下の帯 (2 行の "Connection failed" を含む) が画面に収まりボタンと重ならないことも確かめる。
// 部屋の画面の出口は左上の ‹ だけ (決定 U57): 部屋を出るボタンが無く、‹ はホストで "Cancel this match?"、クライアントで "Leave this match?" の確認を開き (U63)、
// 確認が画面に収まって Cancel Match / Keep Waiting、Leave / Stay を押せることも確かめる。
// Friend Match トップ (決定 U63、#1891 の FB 19・20) は New Match / Join Match の 2 つのボタンだけで、Join a Match のダイアログ (題名、Match Code の欄、Join、×) が画面に収まり、
// 赤字 (見つからない・期限切れは同じ文言) がダイアログの中にあり、接続失敗のトーストがダイアログの暗幕の上で押せることも確かめる。
// 2026-10-08 の決定 (U44〜U55): 切断を待つ間 (対戦中 U46・開始前 U54) は濃い暗幕と "20s" だけが数字として出ること、VS 画面が "Rating 1000" で Rank が無いこと (U48)、VS 画面でどちらの端末でも相手のカードが上・自分のカードが下であること (#1891 の FB 15)、
// 部屋のお知らせが Close 付きの帯で画面に収まり押せること (U52)、結果画面にスタンプのミュートのボタンが無いこと (U49、#1891 の FB 8)、
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
import { join, extname, normalize, resolve } from 'node:path';
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

// Chromium は TMPDIR の下に Unix ソケット (SingletonSocket) を作り、パスが約 108 バイトを超えると起動できない。
// TMPDIR に .. が含まれるとそのまま長くなるので、正規化してから渡す
const tmp = resolve(tmpdir());
const profile = mkdtempSync(join(tmp, 'qa2-scan-'));
const chrome = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore', env: { ...process.env, TMPDIR: tmp } });
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
  // Chromium はファイルを作ってから中身を書くので、ポートの行が書き終わるまで待つ (空のまま読むと 127.0.0.1:80 につなぎにいく)
  const readPort = () => (existsSync(portFile) ? /^(\d+)\n/.exec(readFileSync(portFile, 'utf8')) : null);
  for (let i = 0; i < 100 && !readPort(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!readPort()) throw new Error(`Chromium の DevToolsActivePort が 10 秒で書かれない (${profile} に書けるか、一時ディレクトリの空きと quota を確認)`);
  const port = readPort()[1];
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

  const evaluate = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `document.fonts.ready.then(() => (${fn})(...${JSON.stringify(args)}))` });
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
  // Profile (決定 U56、#1891 の FB 12 / FB 14): 自由操作でダイアログを開き、選ぶとすぐ保存し、‹ だけで閉じる。選んだものはページを開き直しても残る (localStorage)
  await open('');
  pageFindings.push(...await evaluate(profileSave));
  await open('');
  pageFindings.push(...await evaluate(profileReload));
  // localStorage に既定値と違う値がある状態で全シナリオを描く (シナリオはいつも最初の値から)
  const { frames, findings, norow } = await evaluate(scan);
  findings.unshift(...pageFindings);
  // あいさつを日本語にした端末 (#1891 FB 13、#...&lang=ja) でも、あいさつが出るシナリオを描く。日本語はあいさつだけ
  await open('#lang=ja');
  const ja = await evaluate(scan, ['22', '22b'], 'ja');
  findings.push(...ja.findings.map((f) => `[JA] ${f}`));
  if (!ja.frames) findings.push('[JA] あいさつを日本語にした画面を 1 枚も描いていない');

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
    console.log(`ok  あいさつを日本語 (JA) にした端末でも、Profile と VS 画面のあいさつだけが日本語で、収まっています (${ja.frames} 枚)`);
    console.log(`ok  Profile: Random Match / Friend Match トップ / 部屋の画面の上にダイアログで開き、選ぶとすぐ保存し ("Saved" は出さない)、Esc・暗幕では閉じず右上の × で閉じ、選んだものは開き直しても残り、シナリオは localStorage に関係なく最初の値から`);
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
    if (!settings.querySelector('#ctx-codeResult') || !settings.querySelector('#ctx-createResult')) page('モック設定に Join a Match / New Match の結果が無い');
    if (!(document.querySelector('#env-events').compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING)) page('モック設定が環境イベントの下にない');
  }
  // 押すと遷移表どおりに進み、自動遷移 (参加のあとの同期、0.8 秒) は実時間で進む (自由操作)
  const stateOf = (d) => document.querySelector(`.device[data-dev="${d}"] .state-name`).textContent;
  const press = (d, ev) => document.querySelector(`.device[data-dev="${d}"] .screen [data-ev="${ev}"]`).click();
  press('host', 'friendMatch');
  if (stateOf('host') !== 'Host.FriendMatch.Room') page(`自由操作で Friend Match を押しても ${stateOf('host')}`);
  [['host', 'createMatch'], ['client', 'friendMatch'], ['client', 'openJoin'], ['client', 'enterCode'], ['client', 'joinMatch']].forEach(([d, ev]) => press(d, ev));
  const joined = `${stateOf('host')} / ${stateOf('client')}`;
  if (joined !== 'Host.FriendMatch.Lobby.FriendJoined / Client.FriendMatch.Lobby.Connecting') page(`自由操作で参加しても ${joined}`);
  if (!/^⏱ /.test(document.querySelector('#auto-next').textContent)) page(`次の自動遷移の予定が無い (${document.querySelector('#auto-next').textContent})`);
  return new Promise((resolve) => setTimeout(() => {
    const synced = `${stateOf('host')} / ${stateOf('client')}`;
    if (synced !== 'Host.FriendMatch.Lobby.Ready / Client.FriendMatch.Lobby.Ready') page(`自由操作で 0.8 秒たっても同期しない (${synced})`);
    resolve(findings);
  }, 1500));
}

// ページの中で実行する。自由操作で Random Match / Friend Match トップ / 部屋の画面 (U68) の Profile を押すと、画面はそのままダイアログが開き (#1891 の FB 12)、
// 選ぶとすぐ localStorage に保存する ("Saved" は出さない)。閉じるのは右上の × だけで、Esc や暗幕を押しても閉じない (決定 U56 / U64、#1891 の FB 14)
function profileSave() {
  const findings = [];
  const page = (what) => findings.push(`Profile: ${what}`);
  const KEY = ProfileStore.KEY;
  if (localStorage.getItem(KEY) !== null) page('最初から localStorage に値がある');
  const host = document.querySelector('.device[data-dev="host"]');
  const stateName = () => host.querySelector('.state-name').textContent;
  const press = (sel) => { const el = host.querySelector(`.screen ${sel}`); if (!el || el.hasAttribute('data-norow')) { page(`${sel} を押せない (${stateName()})`); return; } el.focus(); el.click(); }; // 押すボタンにフォーカスしてから押す (指やマウスで押したときと同じ)
  const preview = () => [...host.querySelectorAll('.pf-card .vs-emoji, .pf-card .vs-name, .pf-card .vs-greet')].map((e) => e.textContent).join(' ');
  const dialog = () => host.querySelector('.screen .dim > .pf-dialog[role="dialog"][aria-modal="true"]');
  const close = '.pf-dialog > .d-close[aria-label="Close"]';
  const noSaved = (when) => { if (dialog() && (/Saved/.test(dialog().textContent) || dialog().querySelector('.pf-saved, .pf-back'))) page(`${when}に "Saved" か ‹ がある (U64)`); };
  const stored = () => { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && `${v.host.emoji} ${v.host.greeting}`; };
  if (host.querySelector('.screen [data-ev="profile"]')) page('Online Battle に Profile がある');
  press('[data-ev="friendMatch"]');
  if (host.querySelector('.hdr-profile .hp-emoji').textContent !== '\u{1F44B}') page('Friend Match トップの Profile に既定の 👋 が無い');
  press('[data-ev="profile"]');
  if (!dialog() || stateName() !== 'Host.FriendMatch.Room + 🗨 profile') page(`Friend Match トップで Profile を押しても、画面がそのままダイアログが開かない (${stateName()})`);
  const title = dialog() && document.getElementById(dialog().getAttribute('aria-labelledby'));
  if (!title || title.textContent !== 'Profile') page('ダイアログの aria-labelledby が題名 "Profile" を指していない');
  if (!host.querySelector('.screen .friend-top, .screen .body')) page('ダイアログの後ろに Friend Match トップが無い');
  if (document.activeElement !== host.querySelector(`.screen ${close}`)) page('ダイアログを開いたときにフォーカスが × に無い');
  if (preview() !== '\u{1F44B} Yasuhito \u201cHello!\u201d') page(`開いたときの見本が ${preview()}`);
  noSaved('何も選ぶ前');
  if (dialog() && dialog().querySelector('.pf-close, .pf-actions, [data-ev="dialog.saveProfile"]')) page('ダイアログに Save / Cancel が残っている');
  press('[data-ev="dialog.pickEmoji.robot"]');
  if (stored() !== '\u{1F916} hello') page(`絵文字を選んでもすぐ保存されない (${localStorage.getItem(KEY)})`);
  press('[data-ev="dialog.pickGreeting.goodLuck"]');
  if (preview() !== '\u{1F916} Yasuhito \u201cGood luck!\u201d') page(`選んでも見本が変わらない (${preview()})`);
  if (stored() !== '\u{1F916} goodLuck') page(`あいさつを選んでもすぐ保存されない (${localStorage.getItem(KEY)})`);
  noSaved('選んだあと');
  if (document.activeElement !== host.querySelector('[data-ev="dialog.pickGreeting.goodLuck"]')) page('選んだあとにフォーカスが選んだボタンに残らない');
  // Esc と暗幕では閉じない
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  if (!dialog() || stateName() !== 'Host.FriendMatch.Room + 🗨 profile') page(`Esc で閉じた (${stateName()})`);
  host.querySelector('.screen .dim').click();
  if (!dialog() || stateName() !== 'Host.FriendMatch.Room + 🗨 profile') page(`ダイアログの外 (暗幕) を押すと閉じた (${stateName()})`);
  // 右上の × で閉じると、Friend Match トップのまま選んだものが残る
  press(close);
  if (dialog() || stateName() !== 'Host.FriendMatch.Room') page(`× で閉じないか、Friend Match トップから移った (${stateName()})`);
  if (host.querySelector('.hdr-profile .hp-emoji').textContent !== '\u{1F916}') page('× で閉じたあとの Profile のボタンの絵文字が 🤖 でない');
  press('[data-ev="profile"]');
  if (preview() !== '\u{1F916} Yasuhito \u201cGood luck!\u201d') page(`開き直した見本が ${preview()}`);
  press(close);
  // 部屋の画面 (U68) でも開け、選んだものはこの対戦の相手に見せる値になる。Match Code のコピーで "Match code copied" のトースト (U69)
  press('[data-ev="createMatch"]');
  press('[data-ev="copyCode"]');
  const copied = host.querySelector('.screen .toast');
  if (!copied || copied.textContent !== 'Match code copied' || stateName() !== 'Host.FriendMatch.Lobby.Waiting + 🔔 codeCopied') page(`Match Code をコピーしてもトーストが出ない (${stateName()} / ${copied && copied.textContent})`);
  press('[data-ev="profile"]');
  if (!dialog() || !/^Host\.FriendMatch\.Lobby\.Waiting( \+ 🔔 codeCopied)? \+ 🗨 profile$/.test(stateName().replace(' + 🗨 profile + 🔔 codeCopied', ' + 🔔 codeCopied + 🗨 profile'))) page(`部屋の画面で Profile を押しても、画面がそのままダイアログが開かない (${stateName()})`);
  press('[data-ev="dialog.pickEmoji.star"]');
  press(close);
  if (dialog() || !/^Host\.FriendMatch\.Lobby\.Waiting/.test(stateName()) || host.querySelector('.hdr-profile .hp-emoji').textContent !== '\u{1F31F}') page(`部屋の画面で × で閉じないか、選んだものが残らない (${stateName()})`);
  press('.back');
  press('[data-ev="dialog.cancelMatch"]');
  // Random Match で相手を探している間 (開くとすぐ探す、U74) に開いて選ぶと、相手を探し続けたまま保存する
  press('.back');
  press('[data-ev="randomMatch"]');
  press('[data-ev="profile"]');
  if (!dialog() || stateName() !== 'Host.Matchmake + 🗨 profile') page(`Random Match で Profile を押しても、画面がそのままダイアログが開かない (${stateName()})`);
  press('[data-ev="dialog.pickEmoji.rocket"]');
  press('[data-ev="dialog.pickGreeting.bringItOn"]');
  if (stateName() !== 'Host.Matchmake + 🗨 profile') page(`選ぶと Random Match から移るか、ダイアログが閉じる (${stateName()})`);
  press(close);
  if (dialog() || stateName() !== 'Host.Matchmake') page(`× で閉じないか、Random Match から移った (${stateName()})`);
  if (host.querySelector('.hdr-profile .hp-emoji').textContent !== '\u{1F680}') page('閉じたあとの Profile のボタンの絵文字が 🚀 でない');
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (!saved || saved.host.emoji !== '\u{1F680}' || saved.host.greeting !== 'bringItOn' || saved.client.emoji !== '\u{1F60E}') page(`選んだものが保存されない (${localStorage.getItem(KEY)})`);
  press('[data-ev="cancelSearch"]');
  return findings;
}

// ページの中で実行する。開き直した自由操作は保存した値から始まり、シナリオは最初の値から (決定 U56)
function profileReload() {
  const findings = [];
  const page = (what) => findings.push(`Profile (開き直し): ${what}`);
  const host = document.querySelector('.device[data-dev="host"]');
  host.querySelector('.screen [data-ev="friendMatch"]').click();
  const emoji = host.querySelector('.hdr-profile .hp-emoji');
  if (!emoji || emoji.textContent !== '\u{1F680}') page(`Friend Match トップの Profile の絵文字が ${emoji && emoji.textContent}`);
  host.querySelector('.screen [data-ev="profile"]').click();
  const sel = [...host.querySelectorAll('.pf-emoji.selected, .pf-greet.selected')].map((e) => e.textContent).join(' / ');
  if (sel !== '\u{1F680} / Bring it on!') page(`開き直した Profile で選ばれているのが ${sel}`);
  // シナリオ 1 の VS 画面は保存した値に関係なく 👋 "Hello!"
  MockApp.show('1', 12);
  const greet = [...document.querySelectorAll('.device[data-dev="host"] .vs-card.host .vs-emoji, .device[data-dev="host"] .vs-card.host .vs-greet')].map((e) => e.textContent).join(' ');
  if (greet !== '\u{1F44B} \u201cHello!\u201d') page(`シナリオ 1 の VS 画面が保存した値 (${greet}) を使う`);
  if (localStorage.getItem(ProfileStore.KEY) === null) page('シナリオを開いたら保存した値が消えた');
  return findings;
}

// ページの中で実行する。MockApp.show は同期的に描画する
// only を渡すと、そのシナリオ (id の配列) だけを描く。wantLang は両端末のあいさつの言語 (#1891 FB 13、既定は en)
function scan(only, wantLang = 'en') {
  const BAD_TEXT = [[/仮/, '「仮」'], [/未決/, '「未決」'], [/決定/, '「決定」'], [/\bU\d{1,2}\b/, 'U 番号'], [/[\u3040-\u30ff\u3400-\u9fff]/, '日本語']];
  const MATCH_CODE_TEXT = 'QWERTY123';
  const BAD_SEL = '.mock-note, .tmp, .decided-note, [class*="pill-"], [data-undecided]';
  const findings = [];
  const norow = {};
  let frames = 0;
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
      // あいさつの言語 (#1891 FB 13)。日本語にしたあいさつだけは日本語を出してよい
      const lang = document.querySelector(`.lang-toggle[data-dev="${dev.dataset.dev}"] [aria-pressed="true"]`).dataset.lang;
      if (lang !== wantLang) findings.push(`${at}: あいさつの言語が ${lang} (期待: ${wantLang})`);
      const quote = lang === 'ja' ? ['\u300c', '\u300d'] : ['\u201c', '\u201d'];
      const say = (id) => greetingText(id, lang);
      const localized = lang === 'ja' ? [...screen.querySelectorAll('.vs-greet, .pf-greet')].map((e) => e.textContent) : [];
      const text = localized.reduce((t, g) => t.replace(g, ''), screen.textContent);
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
      // Random Match の画面 (決定 U74): 開くとすぐ "Searching for an opponent…" と点、大きな Cancel だけ (Ready を待つ画面は無い)
      if (/\.Matchmake(\.NextOpponent)?$/.test(state)) {
        const btns = [...screen.querySelectorAll('.actions .btn')];
        const got = btns.map((b) => `${b.textContent}:${b.dataset.ev}`).join();
        if (got !== 'Cancel:cancelSearch' || !btns[0].classList.contains('big') || btns[0].hasAttribute('data-norow')) findings.push(`${at}: ボタンが大きな Cancel だけでない (${got})`);
        if (!screen.querySelector('.dots') || !/Searching for an opponent/.test(text)) findings.push(`${at}: "Searching for an opponent…" と点が無い`);
      }
      if (screen.querySelector('[data-ev="startSearch"]')) findings.push(`${at}: Random Match の Ready (startSearch) のボタンがある (U74)`);
      if (/\.Matchmake(\.NextOpponent)?$/.test(state)) {
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
      // 結果画面とゲーム画面 (決定 U20〜U30 / U28): 仮の秒数を出さない。スタンプのタイマーは端末の下だけ。スコアは出さない (FB 7)。
      // 切断を待つ間 (決定 U46 / U54) だけは、残りの秒数 "20s" を濃い暗幕の上のパネルに出す
      const waitingTimer = screen.querySelector('.m-dim.paused .m-timer');
      const isWaiting = /\.(Game|Opponent)\.(Disconnected|OpponentDisconnected)\b/.test(state);
      if (isWaiting !== !!waitingTimer || (waitingTimer && waitingTimer.textContent !== '20s')) findings.push(`${at}: 切断を待つ間の残りの秒数が ${waitingTimer ? waitingTimer.textContent : 'なし'}`);
      const restText = waitingTimer ? text.replace(waitingTimer.textContent, '') : text;
      // Ready 画面の *.Lobby.OpponentDisconnected は 20s を出す画面なので含めない (下の Ready 画面の検査で確かめる)
      if (/Result|\.Game\.|\.Opponent(\.|$|\s)/.test(state) && /\b\d+\s*(s|sec|secs|seconds?)\b/i.test(restText)) findings.push(`${at}: 秒数がある: ${restText.trim().slice(0, 80)}`);
      if (isWaiting) {
        const want = /\.Disconnected\b/.test(state) ? ['Connection lost', 'Reconnecting…'] : ['Your opponent disconnected', 'Waiting for your opponent to reconnect…'];
        const got = [...screen.querySelectorAll('.m-panel .m-title, .m-panel .m-body')].map((e) => e.textContent);
        if (got.join() !== want.join()) findings.push(`${at}: 切断を待つ表示が ${got.join(' / ')} (期待: ${want.join(' / ')})`);
        const evs = [...dev.querySelectorAll('.mock-controls [data-env]:not([data-norow])')].map((e) => e.dataset.env).join();
        if (evs !== 'net.recovered,timer.disconnectTimeout') findings.push(`${at}: 端末の下のモック操作で再接続 / 20 秒たつを押せない (${evs})`);
        if (screen.querySelector('.g-menu')) findings.push(`${at}: 切断を待つ間にメニューボタンがある`);
      }
      if (screen.querySelector('.m-dim') && !/\.Game\.MatchMenu\b/.test(state) && !isWaiting) findings.push(`${at}: 暗幕がある`);
      if (/\.Game\.MatchMenu\b/.test(state) && screen.querySelector('.m-dim.paused')) findings.push(`${at}: MATCH MENU の暗幕が止まった表示 (U37)`);
      // VS 画面 (決定 U48): 両者のカードに "Rating 1000"。Rank は無い
      if (screen.querySelector('.vs')) {
        const ratings = [...screen.querySelectorAll('.vs-card .vs-rating')].map((e) => e.textContent);
        if (ratings.join() !== `Rating ${ELO.initial},Rating ${ELO.initial}`) findings.push(`${at}: VS 画面のレーティングが ${ratings.join(' / ')}`);
        // ゲーム画面と同じく、どちらの端末でも相手のカードが上、自分のカード (YOU) が下 (qniapp/qa2#1891 FB 15)
        const cards = [...screen.querySelectorAll('.vs-card')];
        const order = cards.map((c) => (c.classList.contains('host') ? 'host' : 'client') + (c.querySelector('.you') ? '(YOU)' : ''));
        const want = dev.dataset.dev === 'host' ? 'client,host(YOU)' : 'host,client(YOU)';
        const [top, bottom] = cards.map((c) => c.getBoundingClientRect().top);
        if (order.join() !== want || !(top < bottom)) findings.push(`${at}: VS 画面で相手のカードが上、自分のカードが下になっていない (上から ${order.join(' / ')})`);
      }
      if (/\bRank\b/.test(text)) findings.push(`${at}: "Rank" が残っている`);
      // VS 画面の絵文字とあいさつ (決定 U56): 部屋を作った・入った・探し始めたときに固定した値
      const d = dev.dataset.dev;
      if (screen.querySelector('.vs')) {
        ['host', 'client'].forEach((who) => {
          const card = [...screen.querySelectorAll(`.vs-card.${who} .vs-emoji, .vs-card.${who} .vs-greet`)].map((e) => e.textContent).join(' ');
          const want = `${current[who + 'ShownEmoji']} ${quote[0]}${say(current[who + 'ShownGreeting'])}${quote[1]}`;
          if (card !== want) findings.push(`${at}: VS 画面の ${who} のカードが ${card} (期待: ${want})`);
          if (card.includes("'")) findings.push(`${at}: VS 画面の ${who} のあいさつにまっすぐな ' (’ にそろえる)`);
        });
      }
      // Profile のボタン (決定 U56、#1891 の FB 12): Random Match (相手を探している画面)、Friend Match トップ、‹ を押せる部屋の画面 (期限切れを除く、U68) の右上にだけあり、
      // 保存した絵文字を添える。題名と重ならず、画面に収まる。押せないのはダイアログを開いている間 (と、"No opponent found." の後ろ) だけ
      const pItem = screen.querySelector('.hdr-profile');
      const inLobby = /\.FriendMatch\.Lobby\./.test(current[d]) && !/\.CodeExpired$/.test(current[d]) && screen.querySelector('.hdr button.back');
      const pWant = (/^(Host|Client)\.(Matchmake(\.NextOpponent)?|FriendMatch\.Room(\.[A-Za-z.]+)?)( \+|$)/.test(state) && !/Matchmake\..*NotFound/.test(state)) || !!inLobby;
      if (pWant !== !!pItem || screen.querySelectorAll('[data-ev="profile"]').length !== (pWant ? 1 : 0)) findings.push(`${at}: Profile のボタンが ${pItem ? 'ある' : '無い'}`);
      if (pItem) {
        if (pItem.textContent !== `${current[d + 'Emoji']}Profile` || pItem.getAttribute('aria-haspopup') !== 'dialog') findings.push(`${at}: Profile のボタンが ${pItem.textContent}`);
        // Join a Match のダイアログ (U63) もモーダルなので、開いている間は押せない
        if (pItem.hasAttribute('data-norow') !== (current[d + 'Dialog'] !== null || /\.FriendMatch\.Room(\.[A-Za-z]+)?\.Join\b/.test(state))) findings.push(`${at}: Profile のボタンを押せるかが違う`);
        const sr = screen.getBoundingClientRect();
        const r = pItem.getBoundingClientRect();
        const t = document.createRange();
        t.selectNodeContents(screen.querySelector('.hdr .title'));
        const tr = t.getBoundingClientRect();
        if (r.top < sr.top || r.right > sr.right - 8) findings.push(`${at}: Profile のボタンが画面の端からはみ出している`);
        if (tr.right > r.left - 6 && tr.left < r.right) findings.push(`${at}: Profile のボタンが題名と重なっている`);
      }
      // Profile のダイアログ (決定 U56、#1891 の FB 12 / FB 14): 題名・右上の × (U64)・見本・絵文字 10・あいさつ 10 が画面に収まって重ならず、選んだものが 1 つずつ。Save / Cancel・‹・"Saved" は無い
      const pfDialog = screen.querySelector('.dim > .pf-dialog');
      if (/ 🗨 profile/.test(state) !== !!pfDialog) findings.push(`${at}: Profile のダイアログが ${pfDialog ? 'ある' : '無い'}`);
      if (pfDialog) {
        if (pfDialog.getAttribute('role') !== 'dialog' || pfDialog.getAttribute('aria-modal') !== 'true') findings.push(`${at}: Profile のダイアログに role="dialog" / aria-modal が無い`);
        const close = pfDialog.querySelector(':scope > .d-close');
        if (!close || close.getAttribute('aria-label') !== 'Close' || close.textContent !== '\u00d7' || close.hasAttribute('data-norow')) findings.push(`${at}: Profile のダイアログの右上の × を押せない (U64)`);
        const ht = pfDialog.querySelector('.pf-head .d-title').getBoundingClientRect();
        const dr = pfDialog.getBoundingClientRect();
        if (close) {
          const cr = close.getBoundingClientRect();
          if (cr.left < ht.right || cr.right > dr.right || dr.right - cr.right > 16 || cr.top > ht.bottom || cr.bottom < ht.top) findings.push(`${at}: Profile のダイアログの × が題名の右 (ダイアログの右上) に無い`);
        }
        if (pfDialog.querySelectorAll('button').length !== 1 + PROFILE_EMOJIS.length + PROFILE_GREETINGS.length || pfDialog.querySelector('.pf-close, .pf-actions, .pf-back, .btn')) findings.push(`${at}: Profile のダイアログに × と候補のほかのボタン (Save / Cancel / ‹) がある`);
        if (pfDialog.querySelector('.pf-saved') || /Saved/.test(pfDialog.textContent)) findings.push(`${at}: Profile のダイアログに "Saved" がある (U64)`);
        if (screen.querySelector('.hdr .back:not([data-norow])')) findings.push(`${at}: Profile のダイアログの後ろの ‹ を押せる`);
        const emojis = [...screen.querySelectorAll('.pf-emoji')];
        const greets = [...screen.querySelectorAll('.pf-greet')];
        if (emojis.map((e) => e.textContent).join(' ') !== PROFILE_EMOJIS.map((e) => e.emoji).join(' ')) findings.push(`${at}: 絵文字の候補が ${emojis.map((e) => e.textContent).join(' ')}`);
        if (greets.map((e) => e.textContent).join(' / ') !== PROFILE_GREETINGS.map((g) => g[lang]).join(' / ')) findings.push(`${at}: あいさつの候補が違う (${lang})`);
        // どのあいさつも 1 行に収まる (折り返すとその行だけボタンが高くなる)
        greets.forEach((g) => { const r = document.createRange(); r.selectNodeContents(g); if (r.getClientRects().length !== 1) findings.push(`${at}: あいさつ ${g.textContent} が 1 行に収まらない`); });
        const sel = [...screen.querySelectorAll('.selected')].map((e) => e.textContent);
        if (sel.join(' / ') !== `${current[d + 'Emoji']} / ${say(current[d + 'Greeting'])}`) findings.push(`${at}: 選ばれているのが ${sel.join(' / ')}`);
        if ([...screen.querySelectorAll('[aria-pressed="true"]')].length !== 2) findings.push(`${at}: aria-pressed が 2 つでない`);
        const pv = [...screen.querySelectorAll('.pf-card > div')].map((e) => e.textContent).join(' ');
        if (pv !== `${current[d + 'Emoji']} ${d === 'host' ? 'Yasuhito' : 'ogwssk'} ${quote[0]}${say(current[d + 'Greeting'])}${quote[1]}`) findings.push(`${at}: 見本が ${pv}`);
        if (screen.querySelector('input, textarea, [contenteditable]')) findings.push(`${at}: 自由入力の欄がある`);
        if (pfDialog.querySelector('.pf-emoji[data-norow], .pf-greet[data-norow]')) findings.push(`${at}: Profile のダイアログに押せない部品がある`);
        const sr = screen.getBoundingClientRect();
        const parts = [...screen.querySelectorAll('.pf-head .d-title, .pf-dialog > .d-close, .pf-card, .pf-emojis, .pf-greets')].map((el) => [el, el.getBoundingClientRect()]);
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
        // Join a Match (U63) を開いている間は、帯はダイアログの暗幕の後ろに残り、Close は押せない
        const joinOpen = !!screen.querySelector('.join-dialog');
        const close = notice.querySelector('.rn-close');
        if (!close || close.textContent !== 'Close' || close.hasAttribute('data-norow') !== joinOpen) findings.push(`${at}: お知らせの Close を${joinOpen ? ' Join a Match の後ろで' : ''}押せ${joinOpen ? 'る' : 'ない'}`);
        if (screen.querySelector('.dim') && !joinOpen) findings.push(`${at}: お知らせがモーダル (暗幕がある)`);
        const sr = screen.getBoundingClientRect();
        const nr = notice.getBoundingClientRect();
        if (nr.top < sr.top || nr.bottom > sr.bottom || nr.left < sr.left || nr.right > sr.right) findings.push(`${at}: お知らせの帯が画面からはみ出している`);
        screen.querySelectorAll('.ft-buttons .btn').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom > nr.top + 0.5 && nr.bottom > r.top + 0.5 && r.right > nr.left && nr.right > r.left) findings.push(`${at}: お知らせの帯が ${el.textContent.trim()} と重なっている`);
        });
        if (close) { const cr = close.getBoundingClientRect(); if (cr.right > nr.right || cr.top < nr.top || cr.bottom > nr.bottom) findings.push(`${at}: Close が帯からはみ出している`); }
      }
      // スタンプのミュートは無い (U49、#1891 の FB 8)
      if (/opponent emotes/i.test(text) || /🔕/.test(state)) findings.push(`${at}: スタンプのミュートが残っている`);
      // Ready 画面 (決定 U31 / U32 / U36) と部屋の画面 (決定 U1〜U19)。古い文言は出さない。"Room" / "room" も出さない (U63、#1891 の FB 19)
      const OLD = text.match(/Start Match|Ready to start|Stay in Room|Go Back|Match expired\.|Create Match|Check the Match Code and try again|The match has expired|\broom\b/i);
      if (OLD) findings.push(`${at}: 古い文言 "${OLD[0]}" が残っている`);
      const roomAttr = [...screen.querySelectorAll('[aria-label], [title]')].map((el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`).find((t) => /\broom\b/i.test(t));
      if (roomAttr) findings.push(`${at}: 名前 (aria-label / title) に "room" がある (${roomAttr.trim()})`);
      // Friend Match トップ (U63): ボタンは New Match と Join Match だけ。Match Code は Join a Match のダイアログに入れる
      if (screen.classList.contains('view-friendTop')) {
        const top = [...screen.querySelectorAll('.body .btn')].map((b) => b.textContent).join(' / ');
        if (top !== 'New Match / Join Match' || screen.querySelector('.body .input, .body .sec-label')) findings.push(`${at}: Friend Match トップが New Match / Join Match だけでない (${top})`);
        const jd = screen.querySelector('.join-dialog');
        const joinState = /^(Host|Client)\.FriendMatch\.Room(\.[A-Za-z]+)?\.Join(\.|$)/.test(state);
        if (!!jd !== joinState) findings.push(`${at}: Join a Match が ${jd ? '開いている' : '無い'}`);
        if (jd) {
          const title = jd.querySelector('.d-title');
          const label = jd.querySelector('.d-label');
          const field = jd.querySelector('.input');
          const btnsIn = [...jd.querySelectorAll('.btn')].map((b) => b.textContent);
          const close = jd.querySelector('.d-close');
          if (jd.getAttribute('aria-label') !== 'Join a Match' || !title || title.textContent !== 'Join a Match' || !label || label.textContent !== 'Match Code' || !field || field.getAttribute('aria-label') !== 'Match Code') findings.push(`${at}: Join a Match の題名・Match Code の欄が違う`);
          if (btnsIn.join() !== 'Join' || !close || close.getAttribute('aria-label') !== 'Close' || close.hasAttribute('data-norow')) findings.push(`${at}: Join a Match のボタンが Join と × (閉じる) でない (${btnsIn.join(' / ')})`);
          const filled = !/\.Join$/.test(state);
          const value = field && field.querySelector('.value');
          if ((value ? value.textContent : '') !== (filled ? MATCH_CODE_TEXT : '')) findings.push(`${at}: Match Code の欄が ${value ? value.textContent : '空'}`);
          const join = jd.querySelector('.btn');
          if (join && join.hasAttribute('data-norow') === filled) findings.push(`${at}: Join を ${filled ? '押せない' : 'Match Code を入れる前に押せる'}`);
          // Match Code の誤り・満員はダイアログの中の赤字ではなく、画面の下のトースト (U69、#1891 の FB)
          if (jd.querySelector('.error, [role="alert"]')) findings.push(`${at}: Join a Match の中に赤字がある (U69: トーストで出す)`);
          const toastNow = screen.querySelector('.toast');
          const toastText = toastNow ? [toastNow.firstChild && toastNow.firstChild.textContent, (toastNow.querySelector('.t-sub') || {}).textContent].filter(Boolean).join(' / ') : null;
          const wantToast = /\.Error\.NotFound$/.test(state) ? 'Match not found / The code may be wrong or expired.' : /\.Error\.Full$/.test(state) ? 'The match is already full.'
            : /\.ConnectionFailed$/.test(state) ? 'Connection failed / Couldn\u2019t join the match. Try again.' : null;
          if (toastText !== wantToast) findings.push(`${at}: Join a Match のトーストが ${toastText || 'なし'} (期待: ${wantToast || 'なし'})`);
          // ダイアログは画面に収まり、中の部品は重ならず、× が題名と重ならない
          const sr = screen.getBoundingClientRect();
          const jr = jd.getBoundingClientRect();
          if (jr.top < sr.top || jr.bottom > sr.bottom || jr.left < sr.left || jr.right > sr.right) findings.push(`${at}: Join a Match が画面からはみ出している`);
          const parts = [title, label, field, join].filter(Boolean).map((el) => [el, el.getBoundingClientRect()]);
          for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
            const [a, ra] = parts[i]; const [b, rb] = parts[j];
            if (ra.bottom > rb.top + 0.5 && rb.bottom > ra.top + 0.5) findings.push(`${at}: Join a Match の ${a.className || a.tagName} と ${b.className || b.tagName} が重なっている`);
          }
          if (close && title) { const cr = close.getBoundingClientRect(); const tr = title.getBoundingClientRect(); if (cr.left < tr.right && cr.bottom > tr.top && tr.bottom > cr.top) findings.push(`${at}: × が題名と重なっている`); }
          // 接続失敗のトーストはダイアログの暗幕の上に出て押せる (U6)
          const toastEl = screen.querySelector('.toast');
          if (toastEl) {
            toastEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const tr = toastEl.getBoundingClientRect();
            const hit = document.elementFromPoint((tr.left + tr.right) / 2, (tr.top + tr.bottom) / 2);
            if (!hit || !toastEl.contains(hit)) findings.push(`${at}: トーストが Join a Match の暗幕の下にある`);
            const jr2 = jd.getBoundingClientRect();
            if (tr.top < jr2.bottom + 0.5 && jr2.top < tr.bottom) findings.push(`${at}: トーストが Join a Match と重なっている`);
          }
        }
      }
      // Match Code の期限は画面に出さない (U58)
      if (/expires in/i.test(text)) findings.push(`${at}: Match Code の期限の表示が残っている`);
      // 部屋の画面: ホストにだけ Match Code の下に "Share this code with your friend!" (U58)。期限切れと再接続できなかった画面には出さない。数字は Match Code・カードのレーティング (#1891 FB 4)・カウントダウンだけ
      const hint = screen.querySelector('.code-hint');
      const wantHint = /^Host\.FriendMatch\.Lobby\./.test(state) && !/\.(CodeExpired|CouldNotReconnect)\b/.test(state);
      if (!!hint !== wantHint || (hint && hint.textContent !== CODE_HINT)) findings.push(`${at}: Match Code の下の一行が ${hint ? hint.textContent : 'なし'} (期待: ${wantHint ? CODE_HINT : 'なし'})`);
      // Match Code のコピーのボタン (#1891 FB 5): ホストの部屋の画面にだけ、文字の無いアイコンで "Copy match code" の名前と title がある (U63)。期限切れには無い
      const copy = screen.querySelector('.copy');
      const wantCopy = /^Host\.FriendMatch\.Lobby\./.test(state) && !/\.CodeExpired\b/.test(state);
      if (!!copy !== wantCopy) findings.push(`${at}: Match Code のコピーのボタンが ${copy ? 'ある' : '無い'} (期待: ${wantCopy ? 'ある' : '無い'})`);
      if (copy && (copy.tagName !== 'BUTTON' || copy.getAttribute('aria-label') !== 'Copy match code' || copy.title !== 'Copy match code' || !copy.querySelector('svg') || copy.textContent.trim())) {
        findings.push(`${at}: Match Code のコピーのボタンが "Copy match code" の名前付きのアイコンでない`);
      }
      if (/\.FriendMatch\.Lobby\./.test(state)) {
        const timerText = (screen.querySelector('.rd-timer') || { textContent: '\u0000' }).textContent;
        const rest = [...screen.querySelectorAll('.rd-rating')].reduce((t, r) => t.replace(r.textContent, ''), text.replace(MATCH_CODE_TEXT, '').replace(timerText, ''));
        if (/\d/.test(rest)) findings.push(`${at}: Match Code・レーティング・カウントダウンのほかに数字がある: ${rest.trim().slice(0, 80)}`);
      }
      // 画面の下の帯 (トースト): 端末の画面に収まり、ボタンや入力欄・お知らせと重ならない。サーバーに届かないときの "Connection failed" (U6)、
      // Match Code の誤り・満員 (U69) は画面ごと、Match Code をコピーしたときの "Match code copied" (U69) は付属状態の Toast で出す
      const toast = screen.querySelector('.toast');
      const wantToastKey = SCREENS[current[d]].toast || current[d + 'Toast'];
      if (!!toast !== !!wantToastKey || (toast && toast.firstChild.textContent !== TOASTS[wantToastKey].text)) findings.push(`${at}: トーストが ${toast ? toast.textContent : 'なし'} (期待: ${wantToastKey ? TOASTS[wantToastKey].text : 'なし'})`);
      if (toast) {
        const sr = screen.getBoundingClientRect();
        const tr = toast.getBoundingClientRect();
        if (tr.top < sr.top || tr.bottom > sr.bottom || tr.left < sr.left || tr.right > sr.right) findings.push(`${at}: 帯が画面からはみ出している`);
        screen.querySelectorAll('.btn, .input, .room-notice, .menu-item').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom > tr.top + 0.5 && tr.bottom > r.top + 0.5 && r.right > tr.left && tr.right > r.left) findings.push(`${at}: 帯 "${toast.textContent}" が ${el.textContent.trim() || el.className} と重なっている`);
        });
        if (toast.scrollWidth > toast.clientWidth + 1) findings.push(`${at}: 帯の文字がはみ出している (${toast.textContent})`);
        const chev = toast.querySelector('.chev');
        if (chev) { const cr = chev.getBoundingClientRect(); if (cr.top < tr.top || cr.bottom > tr.bottom) findings.push(`${at}: 帯の › が帯の外にある (${toast.textContent})`); }
      }
      if (screen.querySelector('[data-ev="leaveApp"], [data-ev="disconnect"]')) findings.push(`${at}: マッチのモック操作が端末の画面の中にある`);
      // Back to Friend Match で先に部屋へ戻った側 (FriendReturning / WaitingForHost) も、相手が戻る前から両者のカードを出す (U71、#1891 の FB)
      if (/\.FriendMatch\.Lobby\.(Ready|Starting|Reconnecting|OpponentDisconnected|FriendJoined|Connecting|ConnectionLost|FriendDisconnected|FriendReturning|WaitingForHost)/.test(state)) {
        const cards = [...screen.querySelectorAll('.rd-card')];
        const states = cards.map((c) => c.querySelector('.rd-state').textContent);
        if (cards.length !== 2 || states.some((t) => !['\u2713 Ready', 'Not ready'].includes(t))) findings.push(`${at}: プレイヤーごとのカードが 2 枚 ("✓ Ready" / "Not ready") でない (${states.join(', ')})`);
        if (!cards[0] || !cards[0].querySelector('.you') || screen.querySelectorAll('.rd-card .you').length !== 1) findings.push(`${at}: 自分のカードに YOU が無い`);
        // 名前の横にレーティング (#1891 FB 4)。VS 画面と同じ名前と Rating 1000 (決定 U48)
        const names = cards.map((c) => c.querySelector('.rd-name').textContent);
        const wantNames = d === 'host' ? ['Yasuhito1000', 'ogwssk1000'] : ['ogwssk1000', 'Yasuhito1000'];
        if (names.join() !== wantNames.join() || cards.some((c) => !c.querySelector('.rd-name .rd-rating'))) findings.push(`${at}: カードの名前とレーティングが ${names.join(', ')}`);
        cards.forEach((c) => { const n = c.querySelector('.rd-name'); if (n.scrollWidth > c.clientWidth) findings.push(`${at}: カードの名前がはみ出している (${n.textContent})`); });
        const timer = screen.querySelector('.rd-timer');
        const wantTimer = /\.(OpponentDisconnected|Reconnecting|ConnectionLost|FriendDisconnected)\b/.test(state) ? '20s' : null;
        if ((timer ? timer.textContent : null) !== wantTimer) findings.push(`${at}: カウントダウンが ${timer ? timer.textContent : 'なし'} (期待: ${wantTimer || 'なし'})`);
        const dots = screen.querySelector('.rd-info .dots');
        if (!!dots !== /WaitingForOpponent/.test(state)) findings.push(`${at}: 待っている印 (点の動き) が ${dots ? 'ある' : '無い'} (FB 6: Waiting for opponent… にだけ出す)`);
        ['leaveApp', 'disconnect'].forEach((ev) => {
          if (!dev.querySelector(`.mock-controls [data-ev="${ev}"]`)) findings.push(`${at}: 端末の下のモック操作に ${ev} が無い`);
        });
        // ‹ の確認 (決定 U9 / U34 / U57 / U63) を開いても、後ろの画面のボタンは消えない
        if (/🗨 (leaveMatch|cancelMatch)/.test(state)) {
          const name = state.split(' + ')[0];
          const want = SCREENS[name].buttons.map((b) => b.label).join(' / ');
          const got = [...screen.querySelectorAll('.actions .btn')].map((b) => b.textContent).join(' / ');
          if (got !== want) findings.push(`${at}: 確認の後ろのボタンが ${got} (期待: ${want})`);
        }
        // カード・お知らせ・状況の一行・ボタンが端末の画面に収まり、重ならない
        const sr = screen.getBoundingClientRect();
        const parts = [...screen.querySelectorAll('.code-hint, .rd-cards, .rd-notice, .rd-info .status, .rd-timer, .actions')].map((el) => [el, el.getBoundingClientRect()]);
        parts.forEach(([el, r]) => { if (r.top < sr.top || r.bottom > sr.bottom) findings.push(`${at}: ${el.className} が画面からはみ出している`); });
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
          const [a, ra] = parts[i]; const [b, rb] = parts[j];
          if (a.contains(b) || b.contains(a)) continue;
          if (ra.bottom > rb.top + 0.5 && rb.bottom > ra.top + 0.5 && ra.right > rb.left && rb.right > ra.left) findings.push(`${at}: ${a.className} と ${b.className} が重なっている`);
        }
      }
      // 部屋の画面の出口は ‹ だけ (決定 U57)。部屋を出るボタン (Cancel Match / Leave) は確認ダイアログの中にだけある (U63)
      if (/\.FriendMatch\.Lobby\./.test(state)) {
        const exits = [...screen.querySelectorAll('.actions .btn')].map((b) => b.textContent).filter((t) => /^(Cancel Match|Leave|Leave Match|(Close|Leave) Room)$/.test(t));
        if (exits.length) findings.push(`${at}: 部屋の画面に ${exits.join(' / ')} のボタンがある (出口は ‹ だけ)`);
        const back = screen.querySelector('.hdr .back');
        // 確認や Profile (U68) を開いている間は ‹ に行が無い (確認の Cancel Match / Keep Waiting、Leave / Stay で答える。Profile は × で閉じる)
        const wantBack = /🗨 (cancelMatch|leaveMatch|profile)/.test(state) ? 'none'
          : /\.(Ready\.Confirming|Ready\.OpponentReady\.Confirming|Starting|ConnectionLost|Reconnecting)\b/.test(state) ? 'disabled' : 'button';
        const gotBack = back && back.tagName === 'BUTTON' && !back.hasAttribute('data-norow') ? 'button' : back && back.classList.contains('disabled') ? 'disabled' : 'none';
        if (gotBack !== wantBack) findings.push(`${at}: ‹ が ${gotBack} (期待: ${wantBack})`);
      }
      const dialog = screen.querySelector('.dialog');
      const roomDialog = (state.match(/🗨 (cancelMatch|leaveMatch)/) || [])[1];
      if (roomDialog) {
        const want = roomDialog === 'cancelMatch' ? ['Cancel this match?', 'Cancel Match', 'Keep Waiting'] : ['Leave this match?', 'Leave', 'Stay'];
        const got = dialog ? [dialog.querySelector('.d-title').textContent].concat([...dialog.querySelectorAll('.btn')].map((b) => b.textContent)) : [];
        if (got.join() !== want.join()) findings.push(`${at}: 確認が ${got.join(' / ')} (期待: ${want.join(' / ')})`);
        if (dialog) {
          const sr = screen.getBoundingClientRect();
          const r = dialog.getBoundingClientRect();
          if (r.top < sr.top || r.bottom > sr.bottom || r.left < sr.left || r.right > sr.right) findings.push(`${at}: 確認が画面からはみ出している`);
          dialog.querySelectorAll('.btn').forEach((b) => { if (b.hasAttribute('data-norow')) findings.push(`${at}: 確認の ${b.textContent} を押せない`); });
        }
      }
      if (/----/.test(text)) findings.push(`${at}: 値の決まっていない ---- がある`);
      if (screen.querySelector('[data-ev="stampShown"], [data-ev="stampInterval"], [data-ev="disconnect"], [data-ev="win"], [data-ev="draw"]')) findings.push(`${at}: モック操作が端末の画面の中にある`);
      if (screen.querySelector('.result') && /Score/.test(text)) findings.push(`${at}: 結果画面にスコアの行がある`);
      if (screen.querySelector('.result')) {
        // Friend Match ではレートの行を出さない (U70、#1891 の FB)
        if (current.match === 'friend' && (screen.querySelector('.r-stats') || /rating/i.test(text))) findings.push(`${at}: Friend Match の結果画面にレートの行がある (U70)`);
        // ランダム対戦は勝ち負けによらず Find Next Opponent がある (U67。再戦のくるくるの後ろでは押せないだけで、見た目は同じ)
        const nextOpp = [...screen.querySelectorAll('.result-actions .btn')].find((b) => b.textContent === 'Find Next Opponent');
        if (current.match === 'random' && (!nextOpp || (!screen.querySelector('.rematch-wait') && nextOpp.dataset.ev !== 'findNextOpponent'))) findings.push(`${at}: ランダム対戦の結果画面に Find Next Opponent が無い (U67)`);
        // 降参で終わった試合 (U38 / U66): 終わった理由は "You surrendered" / "Your opponent surrendered" で、Friend Match では再戦のボタンがある
        const reason = screen.querySelector('.r-reason').textContent;
        if (current.surrendered && !/(You|Your opponent) surrendered/.test(reason)) findings.push(`${at}: 降参で終わった試合の理由が ${reason}`);
        const actionLabels = [...screen.querySelectorAll('.result-actions .btn')].map((b) => b.textContent);
        if (/surrendered/.test(reason) && current.match === 'friend' && !/OpponentLeft/.test(state) && !actionLabels.includes('Rematch')) {
          findings.push(`${at}: 降参で終わった Friend Match の結果画面に再戦のボタンが無い (U66)`);
        }
        // 再戦 (U72、#1891 の 2026-10-20 の FB): 再戦できる結果画面は、勝ち負けと再戦の段階によらず同じボタン。Cancel Request / Accept / Decline は無い
        if (actionLabels.some((l) => /^(Cancel Request|Accept|Decline)$/.test(l))) findings.push(`${at}: 結果画面に ${actionLabels.join(' / ')} がある (U72)`);
        const canRematch = /\.(Win|Lose|Draw)Result(\.Rematch\w+)?$/.test(state);
        if (canRematch && actionLabels.join() !== (current.match === 'friend' ? 'Rematch,Back to Friend Match' : 'Rematch,Find Next Opponent,Back to Random Match')) {
          findings.push(`${at}: 結果画面のボタンが ${actionLabels.join(' / ')} (U72: 両者に同じ Rematch、U73: Rematch がいちばん上)`);
        }
        // U73: Rematch は描いた画面でもいちばん上 (ほかのボタンより上にある)
        const actionTops = [...screen.querySelectorAll('.result-actions .btn')].map((b) => [b.textContent, b.getBoundingClientRect().top]);
        const rematchTop = actionTops.find(([l]) => l === 'Rematch');
        if (rematchTop && actionTops.some(([l, t]) => l !== 'Rematch' && t <= rematchTop[1])) findings.push(`${at}: Rematch がいちばん上に描かれていない (U73)`);
        const line = screen.querySelector('.r-status').textContent;
        if ((line === 'Your opponent wants a rematch') !== /\.RematchIncoming$/.test(state)) findings.push(`${at}: 再戦の一行が "${line}"`);
        // 自分が押した (.RematchRequested) / 両者が押した (.RematchStarting) 間は、くるくるが画面に収まり、後ろの結果画面は inert で押せない。
        // Cancel は自分だけが押した間だけで、押せる (上に何も重なっていない)
        const wait = screen.querySelector('.dim.rematch-wait');
        const spinning = /\.Rematch(Requested|Starting)$/.test(state);
        if (!!wait !== spinning) findings.push(`${at}: 再戦のくるくるが${spinning ? '無い' : 'ある'}`);
        if (wait) {
          const wantText = /Requested$/.test(state) ? 'Waiting for opponent\u2026' : 'Starting match\u2026';
          if (!wait.querySelector('.spinner') || wait.querySelector('.rw-text').textContent !== wantText) findings.push(`${at}: くるくるの表示が違う (${wait.textContent})`);
          const sr = screen.getBoundingClientRect();
          const box = wait.querySelector('.rw-box').getBoundingClientRect();
          if (box.top < sr.top || box.bottom > sr.bottom || box.left < sr.left || box.right > sr.right) findings.push(`${at}: くるくるが画面からはみ出している`);
          if (!screen.querySelector('.result').inert || !screen.querySelector('.result-actions').inert) findings.push(`${at}: くるくるの後ろの結果画面が inert でない`);
          if (screen.querySelector('.result [data-ev], .result-actions [data-ev]')) findings.push(`${at}: くるくるの後ろのボタンにイベントがある`);
          const cancel = wait.querySelector('.rw-cancel');
          if (!!cancel !== /Requested$/.test(state)) findings.push(`${at}: くるくるの Cancel が${cancel ? 'ある' : '無い'}`);
          if (cancel) {
            const scroller = document.querySelector('.devices');
            const [sx, sy] = [scroller.scrollLeft, scroller.scrollTop];
            cancel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            const r = cancel.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (cancel.textContent !== 'Cancel' || cancel.hasAttribute('data-norow') || !cancel.contains(hit)) findings.push(`${at}: くるくるの Cancel を押せない`);
            scroller.scrollTo(sx, sy);
            const evs = [...dev.querySelectorAll('.mock-controls [data-env]:not([data-norow])')].map((e) => e.textContent).join();
            if (evs !== '相手も Rematch を押す') findings.push(`${at}: 端末の下のモック操作で相手の Rematch を押せない (${evs})`);
          }
        }
      }
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
  SCENARIOS.filter((sc) => !only || only.includes(sc.id)).forEach((sc) => {
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
  return { frames, findings, norow };
}
