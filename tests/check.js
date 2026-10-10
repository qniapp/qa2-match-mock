#!/usr/bin/env node
// 全シナリオを遷移表で再生し、すべての手順が表の行に一致することを確かめる。
// 使い方: node tests/check.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({});
for (const f of ['transitions.js', 'engine.js', 'profile-store.js', 'scenarios.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const eachSideAll = [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']];
const { TRANSITIONS, SCREENS, DIALOGS, UNDECIDED, SCENARIOS, EVENT_LABELS, TOASTS, GAME_COUNTDOWN_MS, MATCH_MENU, SURRENDER_CONFIRM, Engine } = ctx;
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const errors = [];
const fail = (msg) => errors.push(msg);
const undecidedIds = new Set(UNDECIDED.map((u) => u.id));
const decidedIds = new Set(UNDECIDED.filter((u) => u.decided).map((u) => u.id));
const openIds = new Set(UNDECIDED.filter((u) => !u.decided).map((u) => u.id));
const states = (pat) => (pat === '*' || pat === '=' ? [] : [].concat(pat));

// js/ のファイルの最上位の var は 1 つの名前空間を共有するので、同じ名前を 2 回宣言すると前の値を黙って上書きする
const topVars = ['transitions.js', 'engine.js', 'profile-store.js', 'scenarios.js'].flatMap((f) => [...read('js', f).matchAll(/^var (\w+)/gm)].map((m) => m[1]));
for (const v of new Set(topVars)) if (topVars.filter((x) => x === v).length > 1) fail(`js/ の最上位の var ${v} が 2 回宣言されている`);

// 遷移表そのものの整合性
for (const r of TRANSITIONS) {
  for (const d of Engine.DEVICES) {
    for (const s of states(r.from[d]).concat(states(r.to[d]))) {
      if (!SCREENS[s]) fail(`${r.id}: 未定義の状態 ${s}`);
    }
    const dlg = r.dialog && r.dialog[d];
    if (dlg && !DIALOGS[dlg]) fail(`${r.id}: 未定義のダイアログ ${dlg}`);
  }
  for (const u of r.undecided) if (!openIds.has(u)) fail(`${r.id}: 未決として未定義か決定済みの ${u}`);
  for (const u of r.decided) if (!decidedIds.has(u)) fail(`${r.id}: 決定済みでない ${u} が decided にある`);
  if (!EVENT_LABELS[r.event]) fail(`${r.id}: イベント ${r.event} のラベルが無い`);
}
for (const [name, s] of Object.entries(SCREENS)) {
  for (const u of s.undecided) if (!openIds.has(u)) fail(`${name}: 未決として未定義か決定済みの ${u}`);
  for (const u of s.decided) if (!decidedIds.has(u)) fail(`${name}: 決定済みでない ${u} が decided にある`);
  if (s.toast && !TOASTS[s.toast]) fail(`${name}: 未定義のトースト ${s.toast}`);
}
for (const [name, d] of Object.entries(DIALOGS)) {
  for (const u of d.undecided || []) if (!undecidedIds.has(u)) fail(`dialog ${name}: 未定義の未決 ${u}`);
}

// 決定済みの項目: 誰がいつ決めたかがあり、トグル (options) は残っていない。理由と前提は決定にあれば書く
for (const u of UNDECIDED.filter((x) => x.decided)) {
  for (const k of ['by', 'date']) if (!u.decided[k]) fail(`${u.id}: 決定の ${k} が無い`);
  if (u.options) fail(`${u.id}: 決定済みなのにトグルが残っている`);
}
const u2 = UNDECIDED.find((u) => u.id === 'U2');
if (!u2 || !u2.decided || !u2.decided.reason || !u2.decided.premise) fail('U2 の決定に理由と前提が無い');
for (const u of UNDECIDED) {
  if (UNDECIDED.filter((x) => x.id === u.id).length > 1) fail(`未決 ${u.id} が重複`);
}

// 状態名とグループ名は案 C (2026-10-03): Host. / Client. + qa2 本体の画面名・状態名をドットでつなぐ
const OPTION_C = /^(Host|Client)(\.[A-Z][A-Za-z]*)+$/;
const { STATE_GROUPS } = ctx;
for (const name of Object.keys(SCREENS).concat(Object.keys(STATE_GROUPS))) {
  if (!OPTION_C.test(name)) fail(`状態名・グループ名 ${name} が案 C (Host. / Client. + 画面名) になっていない`);
}
for (const name of Object.keys(STATE_GROUPS)) if (SCREENS[name]) fail(`グループ名 ${name} が状態名と重なる`);
for (const r of TRANSITIONS) {
  for (const d of Engine.DEVICES) {
    const role = d === 'host' ? 'Host.' : 'Client.';
    for (const s of states(r.from[d]).concat(states(r.to[d]))) if (!s.startsWith(role)) fail(`${r.id}: ${d} の欄に ${s}`);
  }
}

// モック独自の 3·2·1 (VS 画面のあとのカウントダウン画面) が残っていない
for (const name of Object.keys(SCREENS)) {
  if (SCREENS[name].view === 'countdown') fail(`${name} がモック独自のカウントダウン画面を描画する`);
}
for (const r of TRANSITIONS) if (r.event === 'countdown.done') fail(`${r.id}: モック独自の countdown.done が残っている`);
if (EVENT_LABELS['countdown.done']) fail('countdown.done のラベルが残っている');
for (const sc of SCENARIOS) {
  if (sc.steps.some((st) => Engine.stepEvent(st) === 'countdown.done')) fail(`シナリオ ${sc.id} に countdown.done が残っている`);
}
if (/countdown: function|cd-nums|Match start/.test(read('js', 'app.js'))) fail('app.js にモック独自のカウントダウン画面が残っている');
if (/\.cd-nums|\.countdown \{/.test(read('css', 'style.css'))) fail('style.css にモック独自のカウントダウンのスタイルが残っている');

// シナリオの説明はページに出さず、README のシナリオ一覧に 1 シナリオ 1 行で書く (ID は公開版のそのシナリオへのリンク)
const scenarioRows = new Map([...read('README.md').matchAll(/^\| \[([0-9a-z]+)\]\(https:\/\/qniapp\.github\.io\/qa2-match-mock\/#s=\1&step=0\) \| (.*) \|$/gm)]
  .map((m) => [m[1], m[2].split(' | ')]));
for (const sc of SCENARIOS) {
  if ('desc' in sc) fail(`シナリオ ${sc.id} の説明 (desc) が js/scenarios.js に残っている`);
  const row = scenarioRows.get(sc.id);
  if (!row) fail(`README のシナリオ一覧にシナリオ ${sc.id} の行が無い`);
  else if (row.length !== 3 || row[0] !== sc.title || row[2].length < 20) fail(`README のシナリオ一覧の ${sc.id} の行が「シナリオ | 元の図 | 説明」になっていない`);
  else if (/3·2·1 → ゲーム/.test(row[2])) fail(`シナリオ ${sc.id} の説明が 3·2·1 → ゲーム のまま`);
}
if (scenarioRows.size !== SCENARIOS.length) fail(`README のシナリオ一覧が ${scenarioRows.size} 行 (シナリオは ${SCENARIOS.length})`);

// シナリオの再生
const used = new Set();
const ids = new Set();
for (const sc of SCENARIOS) {
  if (ids.has(sc.id)) fail(`シナリオ ${sc.id} が重複`);
  ids.add(sc.id);
  const res = Engine.replay(sc);
  if (res.failedAt !== -1) {
    const ev = Engine.stepEvent(sc.steps[res.failedAt]);
    fail(`シナリオ ${sc.id}: 手順 ${res.failedAt + 1} (${ev}) に一致する行が無い。状態 host=${res.state.host} client=${res.state.client}`);
    continue;
  }
  res.fired.forEach((r) => used.add(r.id));
  console.log(`ok  ${sc.id.padEnd(3)} ${sc.title} (${sc.steps.length} 手順) → ${res.state.host} / ${res.state.client}`);
}

// 未決トグルのしくみ (opts / options / 未決タブのラジオ) は 2026-10-08 に消した (未決が 0 件で切り替えるものが無い)
if (UNDECIDED.some((u) => 'options' in u || 'default' in u)) fail('未決一覧にトグル (options / default) が残っている');
if ('defaultOpts' in Engine || 'opts' in Engine.initialState()) fail('Engine に未決トグル (opts) が残っている');
if (/\bopts\b|data-opt|setOpt|type="radio"/.test(read('js', 'app.js'))) fail('app.js に未決トグルが残っている');

// 決定 (U31、2026-10-07 に開始ボタンの名前を Ready に変更): 開始は両者の Ready だけ。Ready 画面になっても自動では開始しない
const u31 = UNDECIDED.find((u) => u.id === 'U31');
if (!u31 || !u31.decided) fail('U31 が決定済みになっていない');
if (u31 && (!/Ready/.test(u31.title) || !/2026-10-07/.test(u31.decided.date))) fail('U31 の題名・日付が Ready への変更 (2026-10-07) になっていない');
// SPEC15 (U1〜U19、2026-10-07) で無くなったもの: 1.5 秒の自動 Ready (U4)、図03 の通信不安定 (U5)、Cancel Match / Leave Match と古い確認 (U9 / U11 / U14)
const OLD_EVENTS = ['sys.autoStart', 'host.startMatch', 'client.startMatch', 'sys.startFailed', 'sys.resetWaiting', 'net.lostDuringVs', 'sys.ready',
  'sys.peerConnected', 'sys.readyScreen', 'net.unstable', 'net.lost', 'host.cancelMatch', 'host.dialog.cancelMatch', 'client.leaveMatch', 'client.dialog.leaveMatch',
  'client.dialog.goBack', 'host.dialog.stay', 'client.dialog.stay',
  // 2026-10-09 (U57): Close Room / Leave Room のボタンと、部屋を残す離席 (帯・"Your friend left."・作り直しの確認) は無くなった
  'host.closeRoom', 'host.leaveRoom', 'client.leaveRoom', 'host.dialog.leaveRoom', 'host.joinMatch', 'host.dialog.createMatch', 'host.dialog.joinMatch',
  'host.dialog.keepCurrent', 'sys.friendLeftShown'];
for (const ev of OLD_EVENTS) if (EVENT_LABELS[ev]) fail(`古いイベント ${ev} のラベルが残っている`);
for (const r of TRANSITIONS) {
  if (OLD_EVENTS.includes(r.event)) fail(`${r.id}: 古いイベント ${r.event} が残っている`);
  if (r.when && Object.keys(r.when).some((k) => /^U\d+$/.test(k))) fail(`${r.id}: 決定済みのトグル条件 ${Object.keys(r.when)} が残っている`);
  if (r.event === 'sys.bothStarted' && (r.from.host !== 'Host.FriendMatch.Lobby.Starting' || r.from.client !== 'Client.FriendMatch.Lobby.Starting')) fail(`${r.id}: 両者が押す前に開始する`);
}
for (const sc of SCENARIOS) {
  if ('opts' in sc) fail(`シナリオ ${sc.id} に未決トグル (opts) が残っている`);
  if (sc.steps.some((st) => OLD_EVENTS.includes(Engine.stepEvent(st)))) fail(`シナリオ ${sc.id} に古いイベントが残っている`);
  if (/Start Match|自動開始|自動で開始/.test(sc.title)) fail(`シナリオ ${sc.id} の題名が Start Match / 自動開始のまま`);
}
// 古い状態 (片方だけ押した .WaitingForFriend / Ready 画面の .FriendReady、図04 の HostCancelled、図07 の ClientAway / Client.Away.* / Match expired.、図06 の StartFailed、
// 図03 の Host.FriendMatch.Lobby.Connecting、同期の前のクライアントの Waiting / FriendJoined / HostAway、離席中の "Ready to start" (.Away.*.Ready)) が残っていない
for (const name of Object.keys(SCREENS)) {
  if (/WaitingForFriend$|Lobby\.Ready\.FriendReady$|HostCancelled|ClientAway|^Client\.Away\.|^Host\.FriendMatch\.Lobby\.(MatchExpired|StartFailed|Connecting)$|^Client\.FriendMatch\.Lobby\.(StartFailed|Waiting|FriendJoined|HostAway|MatchExpired)$|^Host\.Away\./.test(name)) fail(`古い状態 ${name} が残っている`);
}
// "Start Match" や古い文言はどこにも出さない (画面・ダイアログ・トースト・アプリ)
// (右パネルの説明 context は経緯を書くので除く)
const shownText = JSON.stringify([SCREENS, DIALOGS, TOASTS], (k, v) => (k === 'context' ? undefined : v));
const OLD_TEXTS = /Start Match|cancelled the match|left the match\.|Ready to start|Stay in Room|Go Back|Leave Match|Cancel Match|Cancel this match|Leave this match|Match expired\.|Unable to start/;
if (OLD_TEXTS.test(shownText + read('js', 'app.js'))) fail(`画面に古い文言 (${(shownText + read('js', 'app.js')).match(OLD_TEXTS)[0]}) が残っている`);
if (/Start Match/.test(read('README.md') + JSON.stringify(UNDECIDED) + JSON.stringify(SCENARIOS))) fail('README・未決一覧・シナリオに "Start Match" が残っている (今は Ready)');
// Ready 画面からは、自動遷移でも環境イベントでも VS 画面に進まない (読み込みの "Starting match…" を経る)
const { readyScreen, preStart } = ctx;
const toVs = (r) => r.to.host === 'Host.Opponent' || r.to.client === 'Client.Opponent';
for (const h of readyScreen('Host')) {
  for (const c of readyScreen('Client')) {
    for (const r of TRANSITIONS) {
      const st = Object.assign(Engine.initialState(), { host: h, client: c });
      if (toVs(r) && Engine.findRow(st, r.event) === r) fail(`${h} / ${c} から ${r.id} (${r.event}) で VS 画面へ進む`);
    }
  }
}

// session: { match, rated } (結果画面のボタンは Friend Match かランダム対戦かで変わる)
const at = (host, client, session) => Object.assign(Engine.initialState(), { host, client }, session);
const expectFire = (from, event, host, client) => {
  const res = Engine.fire(from, event);
  const got = res ? `${res.state.host} / ${res.state.client}` : '行なし';
  if (got !== `${host} / ${client}`) fail(`${from.host} / ${from.client} で ${event} → ${got} (期待: ${host} / ${client})`);
  return res && res.state;
};

// VS 画面のあとは両端末ともゲーム画面のカウントダウン (ゲーム本体の 3 → 2 → 1) → プレイ開始
const counting = expectFire(at('Host.Opponent', 'Client.Opponent'), 'vs.done', 'Host.Game.Countdown', 'Client.Game.Countdown');
if (counting) expectFire(counting, 'game.countdownDone', 'Host.Game.Play', 'Client.Game.Play');
for (const r of TRANSITIONS) {
  for (const [d, R] of [['host', 'Host'], ['client', 'Client']]) {
    const [vs, cd, game] = [`${R}.Opponent`, `${R}.Game.Countdown`, `${R}.Game.Play`];
    if (r.from[d] === vs && r.event === 'vs.done' && r.to[d] !== cd) fail(`${r.id}: VS 画面のあと ${r.to[d]} (期待: ${cd})`);
    // Host.Game.Play / Client.Game.Play に入るのはカウントダウンの後か、MATCH MENU・降参の確認の CONTINUE だけ
    // (U28: 切断を待っている間に通信が回復したときも戻る)
    if (r.to[d] === game && ![cd, `${R}.Game.MatchMenu`, `${R}.Game.SurrenderConfirm`, `${R}.Game.Disconnected`, `${R}.Game.OpponentDisconnected`].includes(r.from[d])) fail(`${r.id}: ${game} にカウントダウンを経ずに入る`);
  }
}
const cdRow = TRANSITIONS.find((r) => r.event === 'game.countdownDone');
if (!cdRow || cdRow.auto !== GAME_COUNTDOWN_MS || GAME_COUNTDOWN_MS !== 3400) fail('game.countdownDone の自動遷移が 1 秒 + 0.8 秒 × 3 になっていない');
for (const sc of SCENARIOS) {
  const res = Engine.replay(sc);
  res.fired.forEach((r, i) => {
    if (r.event !== 'vs.done') return;
    const st = Engine.replay(sc, i + 1).state;
    if (st.host !== 'Host.Game.Countdown' || st.client !== 'Client.Game.Countdown') fail(`シナリオ ${sc.id}: VS 画面のあと ${st.host} / ${st.client}`);
  });
}
console.log('ok  VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (両端末)');

// 決定 (U31 / U36): どちらが先に押しても、"Confirming…" → 届くと押した側は "Waiting for opponent…"、相手側は "Opponent is ready. Are you?" →
// もう一方も押して "Confirming…" → 届くと "Starting match…" → VS 画面
const L = (R, s) => `${R}.FriendMatch.Lobby.${s}`;
const pair = (st) => `${st.host} / ${st.client}`;
const appJs = read('js', 'app.js');
for (const [first, second, F, S2] of [['host', 'client', 'Host', 'Client'], ['client', 'host', 'Client', 'Host']]) {
  const side = (mine, theirs) => (first === 'host' ? [mine, theirs] : [theirs, mine]);
  const s1 = expectFire(at(L('Host', 'Ready'), L('Client', 'Ready')), `${first}.ready`, ...side(L(F, 'Ready.Confirming'), L(S2, 'Ready')));
  if (!s1) continue;
  for (const ev of [`${first}.ready`, `${first}.back`, `${first}.cancelReady`]) if (Engine.canFire(s1, ev)) fail(`送っている間 (${pair(s1)}) に ${ev} の行がある`);
  const s2 = expectFire(s1, 'sys.readyConfirmed', ...side(L(F, 'Ready.WaitingForOpponent'), L(S2, 'Ready.OpponentReady')));
  if (!s2) continue;
  if (Engine.canFire(s2, `${first}.ready`)) fail(`${first} が押したあとも Ready を押せる`);
  if (Engine.canFire(s2, 'timer.loadTimeout') || Engine.canFire(s2, 'sys.syncFailed')) fail(`片方だけ Ready の ${pair(s2)} で読み込みの失敗の行がある`);
  const s3 = expectFire(s2, `${second}.ready`, ...side(L(F, 'Ready.WaitingForOpponent'), L(S2, 'Ready.OpponentReady.Confirming')));
  const s4 = s3 && expectFire(s3, 'sys.readyConfirmed', L('Host', 'Starting'), L('Client', 'Starting'));
  if (s4) {
    for (const d of ['host', 'client']) for (const ev of ['ready', 'cancelReady', 'back', 'leaveApp']) if (Engine.canFire(s4, `${d}.${ev}`)) fail(`読み込み中に ${d}.${ev} の行がある`);
    if (Engine.canFire(s4, 'timer.codeExpired')) fail('読み込み中に Match Code の期限が切れる (U7: 時計は止まる)');
    expectFire(s4, 'sys.bothStarted', 'Host.Opponent', 'Client.Opponent');
  }
  // U34: Cancel Ready は部屋に残り、相手に "Opponent is no longer ready."。U35: アプリを離れても同じ。Ready していない側が離れても何も変わらない
  expectFire(s2, `${first}.cancelReady`, ...side(L(F, 'Ready'), L(S2, 'Ready.OpponentNotReady')));
  expectFire(s2, `${first}.leaveApp`, ...side(L(F, 'Ready'), L(S2, 'Ready.OpponentNotReady')));
  expectFire(s2, `${second}.leaveApp`, ...side(L(F, 'Ready.WaitingForOpponent'), L(S2, 'Ready.OpponentReady')));
  expectFire(s1, `${first}.leaveApp`, ...side(L(F, 'Ready'), L(S2, 'Ready')));
  if (s3) expectFire(s3, `${second}.leaveApp`, ...side(L(F, 'Ready.WaitingForOpponent'), L(S2, 'Ready.OpponentReady')));
  // U33: 片方が Ready のまま 60 秒で両者の Ready を消す (どちらも部屋に残る)
  expectFire(s2, 'timer.readyTimeout', L('Host', 'Ready.TimedOut'), L('Client', 'Ready.TimedOut'));
  // U57 / U9 / U11 / U34: クライアントの ‹ は "Leave this room?"。Keep Waiting で残り (Ready はそのまま)、Leave Room で抜ける
  const leave = Engine.fire(s2, 'client.back');
  if (!leave || leave.state.clientDialog !== 'leaveRoom' || leave.state.client !== s2.client) fail(`${pair(s2)} で client.back が "Leave this room?" にならない`);
  else {
    const stay = Engine.fire(leave.state, 'client.dialog.keepWaiting');
    if (!stay || pair(stay.state) !== pair(s2) || stay.state.clientDialog !== null) fail('クライアントの Keep Waiting で部屋に残らない');
    expectFire(leave.state, 'client.dialog.leaveRoom', 'Host.FriendMatch.Lobby.ClientLeft', 'Client.FriendMatch.Room.CodeEntered');
  }
  // U57: ホストの ‹ は "Close this room?" → 閉じる。Keep Waiting で残る
  const close = Engine.fire(s2, 'host.back');
  if (!close || close.state.hostDialog !== 'closeRoom' || close.state.host !== s2.host) fail(`${pair(s2)} で host.back が "Close this room?" にならない`);
  else {
    const stay = Engine.fire(close.state, 'host.dialog.keepWaiting');
    if (!stay || pair(stay.state) !== pair(s2) || stay.state.hostDialog !== null) fail('ホストの Keep Waiting で部屋に残らない');
    expectFire(close.state, 'host.dialog.closeRoom', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.HostLeft');
  }
}
// 両者がほぼ同時に押した (どちらも送っている間) → 両方届いたら開始
{
  const a = Engine.fire(at(L('Host', 'Ready'), L('Client', 'Ready')), 'host.ready');
  const b = a && expectFire(a.state, 'client.ready', L('Host', 'Ready.Confirming'), L('Client', 'Ready.Confirming'));
  if (b) expectFire(b, 'sys.readyConfirmed', L('Host', 'Starting'), L('Client', 'Starting'));
}
// お知らせ付きの Ready 画面 (タイムアウト・相手が取り消した・読み込みが 20 秒で終わらない・同期の失敗) からも Ready を押せ、お知らせは消える
const READY_NOTICES_WANT = { TimedOut: 'Ready check timed out. Press Ready when you\u2019re ready.', OpponentNotReady: 'Opponent is no longer ready.',
  StartFailed: 'Match could not start. Please try again.', SyncFailed: 'Couldn\u2019t start the match. Please ready up again.' };
for (const [k, text] of Object.entries(READY_NOTICES_WANT)) {
  for (const R of ['Host', 'Client']) {
    const s = SCREENS[L(R, `Ready.${k}`)];
    if (!s || s.readyNotice !== text) fail(`${L(R, `Ready.${k}`)} のお知らせが "${text}" でない`);
    if (s && (s.cards.me || s.cards.them)) fail(`${L(R, `Ready.${k}`)} で Ready が消えていない`);
  }
  expectFire(at(L('Host', `Ready.${k}`), L('Client', `Ready.${k}`)), 'host.ready', L('Host', 'Ready.Confirming'), L('Client', `Ready.${k}`));
}
// U36 / U4 / U5 / U57: 部屋の画面の表示 (カード、状況の一行、カウントダウン、ボタン、‹)。部屋を出るボタン (Close Room / Leave Room) は無く、出口は ‹ だけ。
// ‹ を押せないのは、送っている間・読み込み・自分の再接続中 (U53)
const btns = (s) => s.buttons.map((b) => b.label + (b.disabled ? '(無効)' : '')).join(' / ');
const roomWant = (R) => ({
  Ready: [false, false, null, null, 'Ready', 'back'],
  'Ready.Confirming': [false, false, null, null, 'Confirming…(無効)', 'disabled'],
  'Ready.WaitingForOpponent': [true, false, 'Waiting for opponent…', 60, 'Cancel Ready', 'back'],
  'Ready.OpponentReady': [false, true, 'Opponent is ready. Are you?', null, 'Ready', 'back'],
  'Ready.OpponentReady.Confirming': [false, true, 'Opponent is ready. Are you?', null, 'Confirming…(無効)', 'disabled'],
  Starting: [true, true, 'Starting match…', null, '', 'disabled'],
  [R === 'Host' ? 'FriendJoined' : 'Connecting']: [false, false, R === 'Host' ? 'Friend joined!' : 'Connecting…', null, 'Ready(無効)', 'back'],
  ConnectionLost: [false, false, 'Connection lost.\nReconnecting…', 20, '', 'disabled'],
  FriendDisconnected: [false, false, 'Your friend disconnected.\nWaiting for them to reconnect…', 20, '', 'back'],
  Reconnecting: [false, false, 'Connection lost.\nReconnecting…', 20, '', 'disabled'],
  OpponentDisconnected: [false, false, 'Opponent disconnected.\nWaiting for them to reconnect…', 20, '', 'back'],
});
for (const R of ['Host', 'Client']) {
  for (const [k, want] of Object.entries(roomWant(R))) {
    const s = SCREENS[L(R, k)];
    if (!s || !s.cards) { fail(`${L(R, k)} が Ready 画面 (カード付き) でない`); continue; }
    const got = [s.cards.me, s.cards.them, s.status || null, s.timer || null, btns(s), s.back];
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${L(R, k)} の表示 ${JSON.stringify(got)} (期待: ${JSON.stringify(want)})`);
    if (!s.expiry) fail(`${L(R, k)} に "Code expires in 30:00" が無い (U7)`);
  }
  const cnr = SCREENS[L(R, 'CouldNotReconnect')];
  if (!cnr || cnr.status !== 'Could not reconnect.' || btns(cnr) !== 'Retry' || cnr.back !== 'back' || cnr.cards) fail(`${L(R, 'CouldNotReconnect')} が "Could not reconnect." と Retry / ‹ でない (U5 / U57)`);
  const exp = SCREENS[L(R, 'CodeExpired')];
  if (!exp || exp.status !== 'Match code expired.' || btns(exp) !== (R === 'Host' ? 'Create Match' : 'Join Match') || exp.expiry || exp.cards) fail(`${L(R, 'CodeExpired')} が "Match code expired." と ${R === 'Host' ? 'Create Match' : 'Join Match'} だけでない (U7 / U10)`);
}
for (const k of ['Waiting', 'ClientLeft', 'MatchCancelled']) {
  const s = SCREENS[L('Host', k)];
  if (btns(s) !== '' || s.back !== 'back' || !s.expiry) fail(`${L('Host', k)} にボタンがあるか、‹ か期限の表示が無い (U57 / U7)`);
}
// U57: どの画面にも Close Room / Leave Room のボタンは無い (確認ダイアログのボタンにだけある)
for (const [name, s] of Object.entries(SCREENS)) {
  const labels = (s.buttons || []).map((b) => b.label);
  if (labels.some((l) => /^(Close|Leave) Room$/.test(l))) fail(`${name} に ${labels.join(' / ')} のボタンがある (U57: 出口は ‹ だけ)`);
}
if (!/\\u2713 Ready/.test(appJs) || !/Not ready/.test(appJs) || !/rd-card/.test(appJs) || !/rd-timer/.test(appJs)) fail('app.js に Ready 画面のカード ("✓ Ready" / "Not ready") とカウントダウンの描画が無い');
if (!/CODE_EXPIRY\.text/.test(appJs) || ctx.CODE_EXPIRY.text !== 'Code expires in 30:00' || ctx.CODE_EXPIRY.minutes !== 30) fail('部屋の画面に "Code expires in 30:00" (U7) が無い');
const dlgWant = {
  leaveRoom: ['Leave this room?', 'No match has started. No win or loss will be recorded.', 'Leave Room / Keep Waiting'],
  closeRoom: ['Close this room?', 'No match has started. No win or loss will be recorded.', 'Close Room / Keep Waiting'],
};
for (const [k, want] of Object.entries(dlgWant)) {
  const d = DIALOGS[k];
  const got = d && [d.title, d.body, d.buttons.map((b) => b.label).join(' / ')];
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`ダイアログ ${k} が ${JSON.stringify(want)} でない (${JSON.stringify(got)})`);
}
if (Object.keys(DIALOGS).join() !== 'closeRoom,leaveRoom') fail(`使わないダイアログが残っている (${Object.keys(DIALOGS)})`);
if ('ROOM_SWITCH_BODY' in ctx) fail('U12 の作り直しの確認の本文が残っている (U57 で無くなった)');
console.log('ok  U31 / U33〜U36 / U4 / U9 / U11 / U57: Ready (Confirming → Waiting for opponent / Opponent is ready)、Cancel Ready、アプリを離れる、60 秒のタイムアウト、‹ の確認 (Close this room? / Leave this room?) (両端末)');

// 決定 (U4): Ready を押せるのは参加の確認・両者が部屋の画面・同期の 3 つがそろってから。決まった待ち時間は置かない
{
  const joined = expectFire(at(L('Host', 'Waiting'), 'Client.FriendMatch.Room.CodeEntered'), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
  if (joined) {
    for (const d of ['host', 'client']) if (Engine.canFire(joined, `${d}.ready`)) fail(`同期の前 (${pair(joined)}) に ${d}.ready の行がある`);
    expectFire(joined, 'sys.roomSynced', L('Host', 'Ready'), L('Client', 'Ready'));
  }
  const synced = TRANSITIONS.filter((r) => r.event === 'sys.roomSynced');
  if (synced.length !== 1 || synced[0].auto === 1500 || !synced[0].decided.includes('U4')) fail('同期の行が 1 行でない / 1.5 秒の固定の待ち時間が残っている / 決定 U4 が無い');
}
console.log('ok  U4: 参加の確認 ("Friend joined!" / "Connecting…") → 両者が部屋の画面にそろって同期 → Ready');

// 決定 (U5): 部屋 (Ready 画面・読み込み) での切断は両者の Ready を消し、20 秒まで再接続。戻れなければ "Could not reconnect." と Retry / Leave Room。
// クライアントは Friend Match トップへ、ホストは空の部屋を残す
for (const [d, R, o, O] of eachSideAll) {
  const side = (mine, theirs) => (d === 'host' ? [mine, theirs] : [theirs, mine]);
  const lost = side(L(R, 'ConnectionLost'), L(O, 'FriendDisconnected'));
  for (const mine of preStart(R)) for (const theirs of preStart(O)) expectFire(at(...side(mine, theirs)), `${d}.disconnect`, ...lost);
  const w = at(...lost);
  expectFire(w, 'net.recovered', L('Host', 'Ready'), L('Client', 'Ready'));
  // U52: ホストが戻らなかったとき、クライアントは "The room was closed." の Friend Match トップ
  const theirsAfter = O === 'Host' ? L('Host', 'Waiting') : 'Client.FriendMatch.Room.RoomClosed';
  const gone = expectFire(w, 'timer.disconnectTimeout', ...side(L(R, 'CouldNotReconnect'), theirsAfter));
  if (gone) {
    const retry = expectFire(gone, `${d}.retry`, ...side(L(R, 'ConnectionLost'), theirsAfter));
    // Retry でつながる: クライアントは空のまま残っていた部屋に入り直し ("Friend joined!")、ホストは空の部屋に戻る
    if (retry) expectFire(retry, 'net.recovered', ...(d === 'client' ? [L('Host', 'FriendJoined'), L('Client', 'Connecting')] : [L('Host', 'Waiting'), 'Client.FriendMatch.Room.RoomClosed']));
    if (retry) expectFire(retry, 'timer.disconnectTimeout', ...side(L(R, 'CouldNotReconnect'), theirsAfter));
    // U57: "Could not reconnect." の出口も ‹ (ホストは "Close this room?"、クライアントは "Leave this room?")
    const dlg = d === 'host' ? 'closeRoom' : 'leaveRoom';
    const leave = Engine.fire(gone, `${d}.back`);
    if (!leave || leave.state[`${d}Dialog`] !== dlg) fail(`${L(R, 'CouldNotReconnect')} の ‹ が ${dlg} の確認にならない`);
    else expectFire(leave.state, `${d}.dialog.${dlg}`, ...side(d === 'host' ? 'Host.FriendMatch.Room' : 'Client.FriendMatch.Room.CodeEntered', theirsAfter));
  }
  // 残った側も ‹ で部屋を出られる (ホストは閉じる、クライアントは抜ける)。切れた側は戻ったときに結果を見る
  if (o === 'host') {
    const c = Engine.fire(w, 'host.back');
    if (!c || c.state.hostDialog !== 'closeRoom') fail(`${pair(w)} で host.back が "Close this room?" にならない`);
    else expectFire(c.state, 'host.dialog.closeRoom', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.HostLeft');
  } else {
    const c = Engine.fire(w, 'client.back');
    if (!c || c.state.clientDialog !== 'leaveRoom') fail(`${pair(w)} で client.back が "Leave this room?" にならない`);
    else expectFire(c.state, 'client.dialog.leaveRoom', L('Host', 'ClientLeft'), 'Client.FriendMatch.Room.CodeEntered');
  }
  for (const ev of Object.keys(EVENT_LABELS)) {
    const res = Engine.fire(w, ev);
    if (res && (ctx.isResultState(res.state.host) || ctx.isResultState(res.state.client))) fail(`部屋での切断 ${pair(w)} から ${ev} で結果画面へ行く`);
  }
}
expectFire(at('Host.FriendMatch.Room', L('Client', 'ConnectionLost')), 'net.recovered', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.Error.NotFound');
if (Engine.canFire(at(L('Host', 'ConnectionLost'), L('Client', 'FriendDisconnected')), 'host.back')) fail('再接続中のホストが ‹ を押せる');
console.log('ok  U5: 部屋での切断は Ready を消して 20 秒まで再接続、"Could not reconnect." と Retry / ‹、クライアントは Friend Match トップ・ホストは空の部屋 (両端末)');

// 決定 (U32): VS 画面・カウントダウン中の切断は Ready を消して止め、相手は 20 秒待つ。勝敗は記録しない
for (const [d, R, , O] of eachSideAll) {
  const side = (mine, theirs) => (d === 'host' ? [mine, theirs] : [theirs, mine]);
  const waiting = side(L(R, 'Reconnecting'), L(O, 'OpponentDisconnected'));
  for (const [mine, theirs] of [[`${R}.Opponent`, `${O}.Opponent`], [`${R}.Game.Countdown`, `${O}.Game.Countdown`]]) {
    expectFire(at(...side(mine, theirs), { match: 'friend', rated: false, rematch: false }), `${d}.disconnect`, ...waiting);
    // U54: ランダム対戦 (再戦を含む) と Friend Match の再戦は Ready 画面に戻さない
    for (const session of [{ match: 'random', rated: true, rematch: false }, { match: 'random', rated: false, rematch: true }, { match: 'friend', rated: false, rematch: true }]) {
      expectFire(at(...side(mine, theirs), session), `${d}.disconnect`, ...side(`${R}.Opponent.Disconnected`, `${O}.Opponent.OpponentDisconnected`));
    }
  }
  const w = at(...waiting);
  expectFire(w, 'net.recovered', L('Host', 'Ready'), L('Client', 'Ready'));
  // U52: 戻れなかった側は "Could not reconnect. The match did not start."
  if (d === 'client') expectFire(w, 'timer.disconnectTimeout', L('Host', 'MatchCancelled'), 'Client.FriendMatch.Room.ReconnectFailed');
  else expectFire(w, 'timer.disconnectTimeout', 'Host.FriendMatch.Room.ReconnectFailed', 'Client.FriendMatch.Room.HostDisconnected');
  if (Engine.canFire(w, 'timer.codeExpired')) fail(`U32 の再接続待ち ${pair(w)} で Match Code の期限が切れる (U7: 時計は止まる)`);
  for (const ev of Object.keys(EVENT_LABELS)) {
    const res = Engine.fire(w, ev);
    if (res && (ctx.isResultState(res.state.host) || ctx.isResultState(res.state.client))) fail(`開始前の切断 ${pair(w)} から ${ev} で結果画面へ行く`);
  }
}
expectFire(at(L('Host', 'Starting'), L('Client', 'Starting')), 'timer.loadTimeout', L('Host', 'Ready.StartFailed'), L('Client', 'Ready.StartFailed'));
expectFire(at(L('Host', 'Starting'), L('Client', 'Starting')), 'sys.syncFailed', L('Host', 'Ready.SyncFailed'), L('Client', 'Ready.SyncFailed'));
// 同じ Match Code で次の友だちを待つ (U32 の Match cancelled、U34 の Your friend left) と、部屋が閉じた Friend Match トップ
expectFire(at(L('Host', 'MatchCancelled'), 'Client.FriendMatch.Room.CodeEntered'), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
expectFire(at(L('Host', 'ClientLeft'), 'Client.FriendMatch.Room.CodeEntered'), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
for (const r of TRANSITIONS) if (r.event === 'sys.resetWaiting' || (r.auto && [].concat(r.from.host).includes(L('Host', 'ClientLeft')))) fail(`${r.id}: "Your friend left…" から自動で進む`);
const roomTexts = { [L('Host', 'ClientLeft')]: 'Your friend left.\nWaiting for another friend…', [L('Host', 'MatchCancelled')]: 'Match cancelled.\nOpponent did not reconnect.', [L('Host', 'Waiting')]: 'Waiting for your friend…' };
for (const [name, text] of Object.entries(roomTexts)) if (!SCREENS[name] || SCREENS[name].status !== text) fail(`${name} の表示が "${text}" でない`);
for (const [name, text] of [['Client.FriendMatch.Room.HostLeft', 'Room closed. The host left.'], ['Client.FriendMatch.Room.HostDisconnected', 'Room closed. The host disconnected.']]) {
  const s = SCREENS[name];
  if (!s || s.view !== 'friendTop' || !s.roomNotice || s.roomNotice.text !== text || s.input !== '') fail(`${name} が "${text}" の Friend Match トップ (入力欄は空) でない`);
}
// ゲーム本体のカウントダウンが終わったら (サーバーが確認したら) 試合開始。そこからは対戦中のルール (切断は 20 秒で負け、U28)
expectFire(at('Host.Game.Play', 'Client.Game.Play'), 'host.disconnect', 'Host.Game.Disconnected', 'Client.Game.OpponentDisconnected');
console.log('ok  U32 / U15: VS 画面・カウントダウン中の切断は Ready を消して 20 秒待つ (Match cancelled・Room closed)、読み込みは 20 秒で "Match could not start."、同期の失敗は "Couldn’t start the match."、勝敗なし (両端末)');

// 決定 U57 (YoshiyukiN さんの FB、#1891 の 1・2 番目、2026-10-09): 部屋の画面の出口は ‹ だけ。
// ホストの ‹ は "Close this room?" → 部屋を閉じる (クライアントは "Room closed. The host left.")、クライアントの ‹ は "Leave this room?" → 部屋を抜ける。
// どちらも Keep Waiting で部屋に残る。部屋を残したまま別の画面へは移れない (以前の U14 の離席・帯 U1 / U16 / U19 / U55 と U12 の確認は無くなった)
{
  const u57 = UNDECIDED.find((u) => u.id === 'U57');
  if (!u57 || !u57.decided || !/YoshiyukiN/.test(u57.decided.by) || u57.decided.date !== '2026-10-09' || !/#1891/.test(u57.desc)) fail('U57 が #1891 の YoshiyukiN さんの FB (2026-10-09) の決定になっていない');
  for (const id of ['U1', 'U9', 'U12', 'U14', 'U16', 'U19', 'U34', 'U55']) if (!/U57/.test(UNDECIDED.find((u) => u.id === id).desc)) fail(`${id} の説明に、U57 で変わったことが無い`);
  // 部屋を残す離席が無い: 状態・帯・グループ・ステージ選択の画面・クライアントのカードの "Away"
  for (const name of Object.keys(SCREENS).concat(Object.keys(STATE_GROUPS))) if (/\.Away(\.|$)/.test(name)) fail(`離席の ${name} が残っている (U57)`);
  if (Object.keys(TOASTS).join() !== 'failedCreate,failedJoin') fail(`離席中の帯が残っている (${Object.keys(TOASTS)})`);
  for (const [name, s] of Object.entries(SCREENS)) if (s.view === 'stage') fail(`${name} がステージ選択 (離席の行き先) を描く`);
  if (/peerAway|'Away'|STAGE_TILES|stage:/.test(appJs) || /\.rd-card\.away|\.stage-grid|\.tile \{/.test(read('css', 'style.css'))) fail('app.js / style.css に離席 ("Away"・ステージ選択) が残っている');
  if ('Failed' in ctx.DEVICE_FIELDS || /Failed'\] === 'create'/.test(appJs)) fail('離席中の作り直しの失敗 (付属状態 Failed) が残っている');
  // どの行も、部屋の画面から部屋の外の画面へは確認 (ダイアログ) を経ずに行かない。ただし部屋がもう無いとき (期限切れ・切断・相手の操作・試合へ進む) は除く
  const roomScreen = (n) => /^(Host|Client)\.FriendMatch\.Lobby\./.test(n);
  for (const r of TRANSITIONS) {
    const d = Engine.deviceOf(r.event);
    if (!d || !/\.back$/.test(r.event)) continue;
    for (const from of states(r.from[d]).filter(roomScreen)) {
      if (/CodeExpired$/.test(from)) { if (r.to[d] !== `${d === 'host' ? 'Host' : 'Client'}.FriendMatch.Room`) fail(`${r.id}: 期限切れの ‹ が Friend Match トップへ行かない`); continue; }
      if (r.to[d] !== '=' || !r.dialog || r.dialog[d] !== (d === 'host' ? 'closeRoom' : 'leaveRoom')) fail(`${r.id}: ${from} の ‹ が確認 (${d === 'host' ? 'Close this room?' : 'Leave this room?'}) を出さない`);
    }
  }
  // ‹ を押せる部屋の画面はすべて確認を出し、Keep Waiting で同じ画面に残り、確定で閉じる / 抜ける (相手がどの状態でも)
  const backable = (R) => Object.keys(SCREENS).filter((n) => n.startsWith(`${R}.FriendMatch.Lobby.`) && SCREENS[n].back === 'back' && !/CodeExpired$/.test(n));
  const sorted = (list) => list.slice().sort().join();
  if (sorted(backable('Host')) !== sorted(STATE_GROUPS['Host.FriendMatch.Lobby.Closable'])) fail(`‹ を押せるホストの部屋の画面 (${backable('Host')}) と、確認を出す画面が合わない`);
  if (sorted(backable('Client')) !== sorted(STATE_GROUPS['Client.FriendMatch.Lobby.Leavable'])) fail(`‹ を押せるクライアントの部屋の画面 (${backable('Client')}) と、確認を出す画面が合わない`);
  for (const [d, R, , O, dlg] of [['host', 'Host', 'client', 'Client', 'closeRoom'], ['client', 'Client', 'host', 'Host', 'leaveRoom']]) {
    for (const mine of backable(R)) {
      for (const theirs of [`${O}.MultiModeSelection`].concat(Object.keys(SCREENS).filter((n) => n.startsWith(`${O}.FriendMatch.Lobby.`)))) {
        const st = at(...(d === 'host' ? [mine, theirs] : [theirs, mine]));
        const res = Engine.fire(st, `${d}.back`);
        if (!res || res.state[`${d}Dialog`] !== dlg || res.state[d] !== mine || res.state[O.toLowerCase()] !== theirs) { fail(`${mine} / ${theirs} で ${d}.back が ${dlg} の確認にならない`); continue; }
        const stay = Engine.fire(res.state, `${d}.dialog.keepWaiting`);
        if (!stay || pair(stay.state) !== pair(st) || stay.state[`${d}Dialog`] !== null) fail(`${mine} / ${theirs} で Keep Waiting のあと部屋に残らない`);
        const done = Engine.fire(res.state, `${d}.dialog.${dlg}`);
        if (!done) { fail(`${mine} / ${theirs} で ${dlg} を確定できない`); continue; }
        const wantMine = d === 'host' ? 'Host.FriendMatch.Room' : 'Client.FriendMatch.Room.CodeEntered';
        if (done.state[d] !== wantMine || done.state[`${d}Dialog`] !== null) fail(`${mine} / ${theirs} で確定したあと ${done.state[d]} (期待: ${wantMine})`);
        // 相手の画面: ホストが閉じたら、部屋にいるクライアントは "Room closed. The host left."。クライアントが抜けたら、部屋のホストは "Your friend left…"
        const inRoom = d === 'host' ? STATE_GROUPS['Client.FriendMatch.Lobby.InRoom'].includes(theirs) : STATE_GROUPS['Host.FriendMatch.Lobby.WithClient'].includes(theirs);
        const wantTheirs = inRoom ? (d === 'host' ? 'Client.FriendMatch.Room.HostLeft' : 'Host.FriendMatch.Lobby.ClientLeft') : theirs;
        if (done.state[O.toLowerCase()] !== wantTheirs) fail(`${mine} / ${theirs} で確定したあと相手が ${done.state[O.toLowerCase()]} (期待: ${wantTheirs})`);
      }
    }
  }
  // "Friend joined!" になるのは本当に入った・入り直したときだけ (U17)
  for (const r of TRANSITIONS) {
    const toJoined = [].concat(r.to.host).some((s) => /\.FriendJoined$/.test(s)) && ![].concat(r.from.host).some((s) => /\.FriendJoined$/.test(s));
    if (toJoined && !['client.joinMatch', 'net.recovered'].includes(r.event)) fail(`${r.id}: ${r.event} で "Friend joined!" になる (U17: 本当に入ったときだけ)`);
    if (toJoined && r.event === 'net.recovered' && ![].concat(r.from.client).every((s) => s === L('Client', 'ConnectionLost'))) fail(`${r.id}: 再接続で "Friend joined!" になる`);
  }
}
console.log('ok  U57: 部屋の画面の出口は ‹ だけ (Close Room / Leave Room のボタンは無い)。ホストは "Close this room?" で閉じ、クライアントは "Leave this room?" で抜ける。Keep Waiting で残る。離席と帯は無い (両端末)');

// 決定 U6 / U7 / U10 / U18
{
  // U6: "Connection failed" は Create / Join がサーバーに届かないときだけ。誤り・期限切れ・満員とは別
  if (TOASTS.failedCreate.text !== 'Connection failed' || TOASTS.failedCreate.sub !== 'Couldn\u2019t create a room. Try again.') fail('ホストの "Connection failed" の文言が違う');
  if (TOASTS.failedJoin.text !== 'Connection failed' || TOASTS.failedJoin.sub !== 'Couldn\u2019t join the room. Try again.') fail('クライアントの "Connection failed" の文言が違う');
  if (SCREENS['Host.FriendMatch.Room.ConnectionFailed'].toast !== 'failedCreate' || SCREENS['Client.FriendMatch.Room.ConnectionFailed'].toast !== 'failedJoin') fail('"Connection failed" の画面のトーストが役割と合わない');
  for (const r of TRANSITIONS) {
    if ([].concat(r.to.host, r.to.client).some((s) => /ConnectionFailed$/.test(s)) && !(r.when && (r.when.createResult === 'connFailed' || r.when.codeResult === 'connFailed'))) fail(`${r.id}: サーバーに届かないとき以外に "Connection failed" になる (U6)`);
  }
  for (const k of ['NotFound', 'Expired', 'Full']) if (SCREENS[`Client.FriendMatch.Room.Error.${k}`].toast) fail(`Client.FriendMatch.Room.Error.${k} にトーストがある (U6: 赤字とは別)`);
  if (!/t-sub/.test(appJs)) fail('app.js がトーストの 2 行目 (U6 の説明) を描かない');
  // U7 / U10 / U18: 期限切れ。両者に "Match code expired."、ホストは Create Match、クライアントは今の画面のまま Join Match
  for (const [h, c] of [[L('Host', 'Ready'), L('Client', 'Ready')], [L('Host', 'Ready.OpponentReady'), L('Client', 'Ready.WaitingForOpponent')], [L('Host', 'FriendJoined'), L('Client', 'Connecting')]]) {
    expectFire(at(h, c), 'timer.codeExpired', L('Host', 'CodeExpired'), L('Client', 'CodeExpired'));
  }
  expectFire(at(L('Host', 'Waiting'), 'Client.MultiModeSelection'), 'timer.codeExpired', L('Host', 'CodeExpired'), 'Client.MultiModeSelection');
  expectFire(at(L('Host', 'CodeExpired'), L('Client', 'CodeExpired')), 'host.createMatch', L('Host', 'Waiting'), L('Client', 'CodeExpired'));
  expectFire(at(L('Host', 'CodeExpired'), L('Client', 'CodeExpired')), 'client.joinMatch', L('Host', 'CodeExpired'), 'Client.FriendMatch.Room');
  for (const d of ['host', 'client']) if (Engine.canFire(at(L('Host', 'CodeExpired'), L('Client', 'CodeExpired')), `${d}.ready`)) fail(`期限切れの画面で ${d}.ready の行がある (U10)`);
  for (const r of TRANSITIONS) {
    if (r.event === 'timer.codeExpired' && [].concat(r.to.client).some((s) => /^Client\.FriendMatch\.Room/.test(s))) fail(`${r.id}: 期限切れでクライアントを別の画面へ移す (U18)`);
    if (r.event === 'timer.codeExpired' && Engine.DEVICES.some((d) => [].concat(r.from[d]).some((s) => /Starting$|\.Opponent$|Countdown$|Lobby\.(Reconnecting|OpponentDisconnected)$/.test(s)))) fail(`${r.id}: 時計が止まっている間 (読み込み・VS 画面・カウントダウン・U32 の再接続待ち) に期限が切れる (U7)`);
  }
}
console.log('ok  U6 / U7 / U10 / U18: "Connection failed" はサーバーに届かないときだけ、期限 30 分と "Match code expired."、Create Match / Join Match');

// 決定 U1〜U19 (高宮さん。U2 / U13 は以前の決定)。U3 / U8 は以前の決定で解消。未決は 0 件 (U44〜U55 は 2026-10-08 に決定)
for (const id of ['U1', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19',
  'U32', 'U33', 'U34', 'U35', 'U36', 'U43']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.by !== '高宮さん' || u.decided.date !== '2026-10-07') fail(`${id} が 高宮さん 2026-10-07 の決定になっていない`);
  for (const r of TRANSITIONS) if (r.undecided.includes(id)) fail(`${r.id}: 決定済みの ${id} が未決として残っている`);
  for (const [name, s] of Object.entries(SCREENS)) if (s.undecided.includes(id)) fail(`${name}: 決定済みの ${id} が未決として残っている`);
  for (const [name, d] of Object.entries(DIALOGS)) if ((d.undecided || []).includes(id)) fail(`ダイアログ ${name}: 決定済みの ${id} が未決として残っている`);
}
for (const id of ['U3', 'U8']) if (!/解消/.test(UNDECIDED.find((x) => x.id === id).desc)) fail(`${id} の説明に、どの決定で解消したかが無い`);
for (const u of UNDECIDED.filter((x) => ['U1', 'U3', 'U5', 'U14', 'U16'].includes(x.id))) if (u.options) fail(`${u.id} のトグルが残っている`);
const openList = UNDECIDED.filter((u) => !u.decided).map((u) => u.id).join();
if (openList !== '') fail(`未決が ${openList} (期待: 0 件)`);
// 秒数と 30 分が仮の値であることは右パネル (説明) に書き、端末の画面には書かない
for (const [k, want] of [['Ready.WaitingForOpponent', /60 秒は QA² 側の仮の値/], ['OpponentDisconnected', /20 秒は QA² 側の仮の値/], ['Starting', /20 秒 \(仮\)/],
  ['ConnectionLost', /20 秒は QA² 側の仮の値/], ['CodeExpired', /30 分、QA² 側の仮の値/], ['Waiting', /30 分は QA² 側の仮の値/]]) {
  if (!want.test([].concat(SCREENS[L('Host', k)].context).join())) fail(`${L('Host', k)} の右パネルに ${want} が無い`);
}
if (/仮/.test(shownText)) fail('端末に出す文言に「仮」がある');
// シナリオの流れ
const readyFlows = {
  '1': [[6, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`], [7, `${L('Host', 'Ready.Confirming')} / ${L('Client', 'Ready')}`], [8, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady')}`],
    [9, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady.Confirming')}`], [10, `${L('Host', 'Starting')} / ${L('Client', 'Starting')}`], [11, 'Host.Opponent / Client.Opponent']],
  '1b': [[5, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`], [8, `${L('Host', 'Ready.OpponentReady')} / ${L('Client', 'Ready.WaitingForOpponent')}`], [11, 'Host.Opponent / Client.Opponent']],
  '3a': [[9, `${L('Host', 'ConnectionLost')} / ${L('Client', 'FriendDisconnected')}`], [10, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`]],
  '3b': [[8, `${L('Host', 'Waiting')} / ${L('Client', 'CouldNotReconnect')}`], [10, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.CodeEntered`]],
  '3c': [[8, `${L('Host', 'CouldNotReconnect')} / Client.FriendMatch.Room.RoomClosed`], [10, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.RoomClosed`],
    [11, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.RoomClosed.CodeEntered`], [12, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.CodeEntered`],
    [13, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`]],
  '3e': [[8, `${L('Host', 'CouldNotReconnect')} / Client.FriendMatch.Room.RoomClosed`], [9, `${L('Host', 'CouldNotReconnect')} / Client.FriendMatch.Room.RoomClosed`],
    [10, 'Host.FriendMatch.Room / Client.FriendMatch.Room.RoomClosed']],
  '4': [[8, 'Host.FriendMatch.Room / Client.FriendMatch.Room.HostLeft']],
  '4b': [[10, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady')}`], [13, 'Host.Opponent / Client.Opponent']],
  '4c': [[3, `${L('Host', 'Waiting')} / Client.MultiModeSelection`], [4, `${L('Host', 'Waiting')} / Client.MultiModeSelection`], [6, 'Host.FriendMatch.Room / Client.MultiModeSelection']],
  '5': [[8, `${L('Host', 'ClientLeft')} / Client.FriendMatch.Room.CodeEntered`], [9, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`]],
  '5b': [[7, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`], [9, `${L('Host', 'ClientLeft')} / Client.FriendMatch.Room.CodeEntered`]],
  '6': [[11, `${L('Host', 'Ready.StartFailed')} / ${L('Client', 'Ready.StartFailed')}`], [16, 'Host.Opponent / Client.Opponent']],
  '6b': [[11, `${L('Host', 'Ready.SyncFailed')} / ${L('Client', 'Ready.SyncFailed')}`], [16, 'Host.Opponent / Client.Opponent']],
  '7a': [[9, `${L('Host', 'Ready.OpponentReady')} / ${L('Client', 'Ready.WaitingForOpponent')}`], [12, `${L('Host', 'ClientLeft')} / Client.FriendMatch.Room.CodeEntered`]],
  '7b': [[9, `${L('Host', 'Ready')} / ${L('Client', 'Ready.OpponentNotReady')}`]],
  '12': [[12, `${L('Host', 'OpponentDisconnected')} / ${L('Client', 'Reconnecting')}`], [13, `${L('Host', 'MatchCancelled')} / Client.FriendMatch.Room.ReconnectFailed`],
    [14, `${L('Host', 'MatchCancelled')} / Client.FriendMatch.Room.ReconnectFailed.CodeEntered`], [15, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`]],
  '13': [[5, 'Host.FriendMatch.Room.ConnectionFailed / Client.FriendMatch.Room.ConnectionFailed']],
  '19': [[9, `${L('Host', 'Ready.OpponentNotReady')} / ${L('Client', 'Ready')}`], [11, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady')}`]],
  '19b': [[9, `${L('Host', 'Ready.TimedOut')} / ${L('Client', 'Ready.TimedOut')}`]],
  '19c': [[12, 'Host.Game.Countdown / Client.Game.Countdown'], [13, `${L('Host', 'Reconnecting')} / ${L('Client', 'OpponentDisconnected')}`],
    [14, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`], [20, 'Host.Game.Countdown / Client.Game.Countdown']],
  '19d': [[12, `${L('Host', 'Reconnecting')} / ${L('Client', 'OpponentDisconnected')}`], [13, 'Host.FriendMatch.Room.ReconnectFailed / Client.FriendMatch.Room.HostDisconnected']],
  '19e': [[7, `${L('Host', 'FriendDisconnected')} / ${L('Client', 'ConnectionLost')}`], [9, 'Host.FriendMatch.Room / Client.FriendMatch.Room.HostLeft']],
  '20': [[9, `${L('Host', 'CodeExpired')} / ${L('Client', 'CodeExpired')}`], [10, `${L('Host', 'Waiting')} / ${L('Client', 'CodeExpired')}`], [14, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`]],
};
for (const [id, checks] of Object.entries(readyFlows)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  for (const [n, want] of checks) {
    const got = pair(Engine.replay(sc, n).state);
    if (got !== want) fail(`シナリオ ${id} の手順 ${n}: ${got} (期待: ${want})`);
  }
}
console.log('ok  シナリオ 1〜7b / 12 / 13 / 19〜20 の部屋・Ready・切断・期限切れの流れ');

// 対戦後 (決定 U20〜U30、高宮さん 2026-10-07)
const friend = { match: 'friend', rated: false };
const random = { match: 'random', rated: true };
for (const id of ['U20', 'U21', 'U22', 'U23', 'U24', 'U25', 'U26', 'U27', 'U28', 'U29', 'U30']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.by !== '高宮さん' || u.decided.date !== '2026-10-07') fail(`${id} が 高宮さん 2026-10-07 の決定になっていない`);
  for (const r of TRANSITIONS) if (r.undecided.includes(id)) fail(`${r.id}: 決定済みの ${id} が未決として残っている`);
}
// 決まっていなかった点 (U44〜U55) は 2026-10-08 に決定 (下でまとめて確かめる)
const eachSide = [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']];
const sides = (dev, mine, theirs) => (dev === 'host' ? [mine, theirs] : [theirs, mine]);

// 決着 (モック操作): 押した側が勝ち / 負け / 引き分け、相手は逆 (引き分けは同じ)。両端末が試合中のときだけ
const inGame = at('Host.Game.Play', 'Client.Game.Play', friend);
expectFire(inGame, 'host.win', 'Host.WinResult', 'Client.LoseResult');
expectFire(inGame, 'host.lose', 'Host.LoseResult', 'Client.WinResult');
expectFire(inGame, 'client.win', 'Host.LoseResult', 'Client.WinResult');
expectFire(inGame, 'client.lose', 'Host.WinResult', 'Client.LoseResult');
expectFire(inGame, 'host.draw', 'Host.DrawResult', 'Client.DrawResult');
expectFire(inGame, 'client.draw', 'Host.DrawResult', 'Client.DrawResult');
const hostInPlay = ['Host.Game.Play', 'Host.Game.MatchMenu', 'Host.Game.SurrenderConfirm'];
const clientInPlay = ['Client.Game.Play', 'Client.Game.MatchMenu', 'Client.Game.SurrenderConfirm'];
const hostStates = Object.keys(SCREENS).filter((k) => k.startsWith('Host.'));
const clientStates = Object.keys(SCREENS).filter((k) => k.startsWith('Client.'));
if (hostStates.length + clientStates.length !== Object.keys(SCREENS).length) fail('Host. / Client. で始まらない状態がある');
for (const h of hostStates) {
  for (const c of clientStates) {
    for (const ev of ['host.win', 'host.lose', 'host.draw', 'client.win', 'client.lose', 'client.draw', 'host.disconnect', 'client.disconnect']) {
      // 「切断する」は開始前 (Ready 画面・読み込み、U32) にもある。VS 画面・カウントダウンは Friend Match のときだけなので、セッションの無いここでは行が無い (U5: 部屋での切断)
      const want = (hostInPlay.includes(h) && clientInPlay.includes(c)) || (/disconnect$/.test(ev) && preStart('Host').includes(h) && preStart('Client').includes(c));
      if (Engine.canFire(at(h, c), ev) !== want) fail(`${h} / ${c} で ${ev} の行が${want ? '無い' : 'ある'}`);
    }
  }
}
for (const ev of ['host.win', 'host.lose', 'host.draw', 'client.win', 'client.lose', 'client.draw']) {
  if (Engine.canFire(at('Host.Game.Countdown', 'Client.Game.Countdown'), ev)) fail(`カウントダウン中に ${ev} の行がある`);
}

// U20: 結果画面の中身 (勝敗・両者の名前・スコア・終わった理由)。スコアが決まっていない No contest は行ごと出さない (---- は出さない)
const { END_REASONS, REMATCH_STATUS, DEMO_SCORES, ELO, STAMPS, DISCONNECT_OVERLAYS, ratingText, resultButtons, isResultState } = ctx;
const resultNames = Object.keys(SCREENS).filter((k) => SCREENS[k].view === 'result');
if (resultNames.some((k) => !isResultState(k)) || Object.keys(SCREENS).some((k) => isResultState(k) && SCREENS[k].view !== 'result')) fail('isResultState と結果画面の一覧が合わない');
if (resultNames.length !== 106) fail(`結果画面が ${resultNames.length} 状態 (期待: 106 = 2 端末 × (Win / Lose / Draw × 16 段階 + 降参・切断 4 + No contest))`);
for (const name of resultNames) {
  const s = SCREENS[name];
  if (!['Win', 'Lose', 'Draw', 'NoContest'].includes(s.outcome)) fail(`${name}: 勝敗 ${s.outcome}`);
  if (!END_REASONS[s.reason]) fail(`${name}: 終わった理由 ${s.reason} が無い`);
  if (s.outcome !== 'NoContest' && !DEMO_SCORES[s.outcome]) fail(`${name}: スコアが無い`);
  if (!s.decided.includes('U20')) fail(`${name}: 決定 U20 が無い`);
}
if (/'----'|dim-value/.test(appJs)) fail('app.js に値の決まっていないスコアの ---- が残っている');
const reasons = { timeUp: 'Time is up', timeUpTie: 'Same score when time ran out', surrendered: 'You surrendered', opponentSurrendered: 'Your opponent surrendered',
  disconnected: 'You were disconnected', opponentDisconnected: 'Your opponent disconnected', connectionError: 'No contest due to a connection error' };
if (JSON.stringify(END_REASONS) !== JSON.stringify(reasons)) fail('終わった理由の文言が違う');
for (const [name, outcome, reason] of [['Host.NoContestResult', 'NoContest', 'connectionError'], ['Client.LoseResult.Disconnected', 'Lose', 'disconnected'],
  ['Host.WinResult.OpponentDisconnected', 'Win', 'opponentDisconnected'], ['Client.LoseResult.Surrendered', 'Lose', 'surrendered'], ['Host.WinResult.OpponentSurrendered', 'Win', 'opponentSurrendered']]) {
  const s = SCREENS[name];
  if (!s || s.outcome !== outcome || s.reason !== reason) fail(`${name} が ${outcome} / ${reason} の結果画面でない`);
}
if (!/r-outcome/.test(appJs) || !/NO CONTEST/.test(appJs) || !/DRAW/.test(appJs)) fail('app.js に DRAW / NO CONTEST の見出しが無い');

// U21: レーティング。Friend Match は変わらない、ランダム対戦は Elo (初期値 1000、K=24)、同じ相手との再戦と No contest は変わらない
if (ELO.initial !== 1000 || ELO.k !== 24) fail('Elo が初期値 1000・K=24 でない');
const ratings = [
  ['Win', friend, 'No rating change (friend match)'], ['Lose', friend, 'No rating change (friend match)'], ['NoContest', friend, 'No rating change (friend match)'],
  ['Win', random, '1000 \u2192 1012 (+12)'], ['Lose', random, '1000 \u2192 988 (-12)'], ['Draw', random, '1000 \u2192 1000 (\u00B10)'],
  ['NoContest', random, 'No rating change (no contest)'], ['Win', { match: 'random', rated: false }, 'No rating change (rematch)'],
];
for (const [o, session, want] of ratings) if (ratingText(o, session) !== want) fail(`レート ${o} ${JSON.stringify(session)}: ${ratingText(o, session)} (期待: ${want})`);
// セッション: Friend Match は rated=false、ランダム対戦は rated=true、再戦で rated=false、次のランダム対戦でまた rated=true
const sessionAt = (id, n) => { const st = Engine.replay(SCENARIOS.find((x) => x.id === id), n).state; return `${st.match}/${st.rated}`; };
for (const [id, n, want] of [['15', 14, 'friend/false'], ['15c', 19, 'friend/false'], ['17', 6, 'random/true'], ['17', 11, 'random/false'], ['17', 15, 'random/true'], ['18e', 7, 'random/true']]) {
  if (sessionAt(id, n) !== want) fail(`シナリオ ${id} の手順 ${n} のセッション ${sessionAt(id, n)} (期待: ${want})`);
}

// U22 / U24: ボタン。Friend Match は Rematch / Back to Friend Match、ランダム対戦は Find Next Opponent / Rematch / Back to Online。降参した側は Back to Online だけ
const labels = (name, match) => resultButtons(SCREENS[name], match).map((b) => b.label + (b.disabled ? '(無効)' : '')).join(' / ');
const wantButtons = [
  ['Host.WinResult', 'friend', 'Rematch / Back to Friend Match'],
  ['Host.WinResult', 'random', 'Find Next Opponent / Rematch / Back to Online'],
  ['Host.WinResult.RematchRequested', 'friend', 'Cancel Request / Back to Friend Match'],
  ['Client.LoseResult.RematchIncoming', 'random', 'Find Next Opponent / Rematch / Decline / Back to Online'],
  ['Host.DrawResult.RematchDeclinedByYou.Cooldown', 'friend', 'Rematch(無効) / Back to Friend Match'],
  ['Host.DrawResult.RematchDeclinedByYou', 'friend', 'Rematch / Back to Friend Match'],
  ['Client.WinResult.RematchExpiredIncoming.Cooldown', 'random', 'Find Next Opponent / Rematch(無効) / Back to Online'],
  ['Host.WinResult.OpponentLeft', 'friend', 'Back to Friend Match'],
  ['Host.WinResult.OpponentLeft', 'random', 'Find Next Opponent / Back to Online'],
  ['Host.LoseResult.Surrendered', 'friend', 'Back to Online'],
  ['Client.LoseResult.Surrendered', 'random', 'Back to Online'],
  ['Host.WinResult.OpponentSurrendered', 'friend', 'Back to Friend Match'],
  ['Host.NoContestResult', 'random', 'Find Next Opponent / Back to Online'],
];
for (const [name, match, want] of wantButtons) if (labels(name, match) !== want) fail(`${name} (${match}) のボタン ${labels(name, match)} (期待: ${want})`);
// 結果画面のボタンは、どの段階・どちらの対戦でも遷移表の行がある (相手は対になる段階か、すでに抜けた画面)
const PAIRED = { '': '', RematchRequested: 'RematchIncoming', RematchIncoming: 'RematchRequested' };
for (const [e, f] of Object.entries(ctx.REMATCH_ENDING_PAIRS)) { PAIRED[`Rematch${e}`] = `Rematch${f}`; PAIRED[`Rematch${e}.Cooldown`] = `Rematch${f}.Cooldown`; }
const opposite = { Win: 'Lose', Lose: 'Win', Draw: 'Draw' };
for (const [dev, R, , O] of eachSide) {
  for (const session of [friend, random]) {
    const gone = session.match === 'friend' ? `${O}.FriendMatch.Room` : `${O}.MultiModeSelection`;
    for (const name of resultNames.filter((k) => k.startsWith(R + '.'))) {
      const s = SCREENS[name];
      let theirs = gone;
      if (s.rematch && s.phase in PAIRED) theirs = `${O}.${opposite[s.outcome]}Result${PAIRED[s.phase] ? '.' + PAIRED[s.phase] : ''}`;
      const st = at(...sides(dev, name, theirs), session);
      for (const b of resultButtons(s, session.match)) {
        if (!b.disabled && !Engine.canFire(st, `${dev}.${b.event}`)) fail(`${name} (${session.match}, 相手 ${theirs}) の ${b.label} に行が無い`);
      }
      if (!s.rematch || s.phase === 'OpponentLeft') {
        for (const ev of ['rematch', 'cancelRematch', 'declineRematch']) if (Engine.canFire(st, `${dev}.${ev}`)) fail(`${name} で再戦の ${ev} の行がある`);
      }
    }
  }
}
// 戻り先 (U24): Friend Match トップ (入力欄は空) / Online Battle / 次の相手を探す。相手には "Your opponent left. Rematch is not available." (U25、勝敗は同じ)
if (SCREENS['Host.FriendMatch.Room'].input !== '' || SCREENS['Client.FriendMatch.Room'].input !== '') fail('Friend Match トップの入力欄に前の Match Code が残る');
for (const [dev, R, other, O] of eachSide) {
  for (const o of ['Win', 'Lose', 'Draw']) {
    const mine = `${R}.${o}Result`;
    const theirs = `${O}.${opposite[o]}Result`;
    for (const [ev, session, dest] of [['backToFriendMatch', friend, `${R}.FriendMatch.Room`], ['findNextOpponent', random, `${R}.Matchmake.NextOpponent`], ['backToOnlineBattle', random, `${R}.MultiModeSelection`]]) {
      for (const ph of ['', '.RematchRequested', '.RematchIncoming', '.RematchDeclinedByYou.Cooldown', '.RematchCancelled']) {
        const theirPh = { '': '', '.RematchRequested': '.RematchIncoming', '.RematchIncoming': '.RematchRequested', '.RematchDeclinedByYou.Cooldown': '.RematchDeclined.Cooldown',
          '.RematchCancelled': '.RematchCancelledByYou' }[ph];
        expectFire(at(...sides(dev, mine + ph, theirs + theirPh), session), `${dev}.${ev}`, ...sides(dev, dest, `${theirs}.OpponentLeft`));
      }
      // Friend Match のボタンはランダム対戦に無く、その逆も無い
      const wrong = session === friend ? random : friend;
      if (Engine.canFire(at(...sides(dev, mine, theirs), wrong), `${dev}.${ev}`)) fail(`${mine} (${wrong.match}) で ${ev} の行がある`);
    }
  }
  expectFire(at(...sides(dev, `${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`), friend), `${dev}.backToOnlineBattle`,
    ...sides(dev, `${R}.MultiModeSelection`, `${O}.WinResult.OpponentSurrendered`));
  expectFire(at(...sides(dev, `${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`), random), `${dev}.backToOnlineBattle`,
    ...sides(dev, `${R}.MultiModeSelection`, `${O}.WinResult.OpponentSurrendered`));
  if (Engine.canFire(at(...sides(dev, `${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`), friend), `${dev}.backToFriendMatch`)) fail(`${R}.LoseResult.Surrendered に Back to Friend Match がある`);
}
if (REMATCH_STATUS.OpponentLeft.text !== 'Your opponent left. Rematch is not available.') fail('相手が抜けたときの文言が違う');

// U23 / U30: 再戦。どちらからでも申し込め、応じたら VS 画面 (レートは変わらない対戦)。同時なら成立。取り消し・辞退・期限切れのあとは両者とも結果画面に残り、3 秒後にまた申し込める
// U50: 取り消し・辞退・期限切れは両者に一行 (U30 の文言 + もう一方の文言)。3 秒たっても次の操作まで残る
const statusText = { RematchRequested: 'Waiting for your opponent…', RematchIncoming: 'Your opponent wants a rematch', RematchCancelled: 'Rematch request cancelled',
  RematchCancelledByYou: 'Rematch request cancelled', RematchDeclined: 'Your opponent declined the rematch', RematchDeclinedByYou: 'Rematch declined',
  RematchExpired: 'No response to rematch request', RematchExpiredIncoming: 'Rematch request expired' };
for (const [k, t] of Object.entries(statusText)) if (!REMATCH_STATUS[k] || REMATCH_STATUS[k].text !== t) fail(`${k} の文言が "${t}" でない`);
// 2026-10-08 (高宮さん): 取り消しの一行は両者とも "Rematch request cancelled" ("was" は付けない)。
// 申し込まれた側 (相手) の結果画面の一行と、リポジトリのどの文章にも以前の "was" 付きの文言が残っていないことを確かめる
const cancelledNames = resultNames.filter((k) => /\.RematchCancelled(ByYou)?(\.Cooldown)?$/.test(k));
if (cancelledNames.filter((k) => /\.RematchCancelled(\.Cooldown)?$/.test(k)).length < 6) fail('申し込まれた側の取り消しの状態が足りない');
for (const name of cancelledNames) {
  if (REMATCH_STATUS[SCREENS[name].status].text !== 'Rematch request cancelled') fail(`${name} の取り消しの一行が "Rematch request cancelled" でない`);
}
const OLD_CANCELLED = new RegExp('was' + ' cancelled', 'i');
const textFiles = require('child_process').execFileSync('git', ['ls-files'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' })
  .split('\n').filter((f) => /\.(js|mjs|md|html|css|json)$/.test(f));
for (const f of textFiles) if (OLD_CANCELLED.test(read(f))) fail(`${f} に以前の "was" 付きの取り消しの文言が残っている`);
if (Object.keys(REMATCH_STATUS).some((k) => /Cooldown/.test(k)) || Object.keys(SCREENS).some((k) => /RematchCooldown/.test(k))) fail('メッセージを出さない .RematchCooldown が残っている (U50)');
for (const name of resultNames.filter((k) => /\.Rematch(Cancelled|Declined|Expired)/.test(k))) {
  const s = SCREENS[name];
  if (!REMATCH_STATUS[s.status]) fail(`${name} に一行が無い (U50)`);
  if (/\.Cooldown$/.test(name) !== resultButtons(s, 'friend').some((b) => b.label === 'Rematch' && b.disabled)) fail(`${name} の Rematch の無効表示が 3 秒待ちと合わない`);
}
for (const o of ['Win', 'Lose', 'Draw']) {
  const H = (ph) => `Host.${o}Result${ph}`;
  const C = (ph) => `Client.${opposite[o]}Result${ph}`;
  for (const [dev, other] of [['host', 'client'], ['client', 'host']]) {
    const p = (m, t) => (dev === 'host' ? [H(m), C(t)] : [H(t), C(m)]);
    for (const session of [friend, random]) {
      const asked = expectFire(at(H(''), C(''), session), `${dev}.rematch`, ...p('.RematchRequested', '.RematchIncoming'));
      if (!asked) continue;
      if (Engine.canFire(asked, `${dev}.rematch`) || Engine.canFire(asked, `${other}.cancelRematch`) || Engine.canFire(asked, `${dev}.declineRematch`)) fail(`${p('.RematchRequested', '.RematchIncoming')} で押せないはずの再戦の操作がある`);
      const vs = expectFire(asked, `${other}.rematch`, 'Host.Opponent', 'Client.Opponent');
      if (vs && (vs.match !== session.match || vs.rated !== false || vs.rematch !== true)) fail(`再戦の VS 画面のセッション ${vs.match}/${vs.rated}/${vs.rematch} (期待: ${session.match}/false/true)`);
      for (const [ev, mineEnd, theirEnd] of [[`${dev}.cancelRematch`, 'CancelledByYou', 'Cancelled'], [`${other}.declineRematch`, 'Declined', 'DeclinedByYou'],
        ['timer.rematchTimeout', 'Expired', 'ExpiredIncoming']]) {
        const want = p(`.Rematch${mineEnd}.Cooldown`, `.Rematch${theirEnd}.Cooldown`);
        const cooled = expectFire(asked, ev, ...want);
        if (!cooled) continue;
        for (const d of ['host', 'client']) if (Engine.canFire(cooled, `${d}.rematch`)) fail(`${want.join(' / ')} (3 秒待ち) で ${d}.rematch の行がある`);
        // 3 秒たつと押せるようになるが、一行は残る (U50)。どちらかがまた申し込むと消える
        const after = expectFire(cooled, 'timer.rematchCooldown', ...p(`.Rematch${mineEnd}`, `.Rematch${theirEnd}`));
        if (!after) continue;
        for (const d of ['host', 'client']) {
          const again = Engine.fire(after, `${d}.rematch`);
          if (!again || !/RematchRequested$/.test(again.state[d])) fail(`${pair(after)} で ${d} がまた申し込めない`);
        }
        if (!Engine.canFire(after, 'sys.rematchSimultaneous')) fail(`${pair(after)} で同時の申し込みが成立しない`);
      }
    }
  }
  const both = expectFire(at(H(''), C(''), random), 'sys.rematchSimultaneous', 'Host.Opponent', 'Client.Opponent');
  if (both && (both.rated !== false || both.rematch !== true)) fail('同時の再戦でレートが変わる / 再戦の印が付かない');
}
// U26: 結果画面から自動では次へ進まない
for (const r of TRANSITIONS) if (r.auto && Engine.DEVICES.some((d) => [].concat(r.from[d]).some((s) => isResultState(s)))) fail(`${r.id}: 結果画面から自動で進む`);

// U27: スタンプ。3 種類、送ってから 5 秒は送れない、3 秒で消える、ミュートで相手のスタンプを出さない。結果画面を抜けると消え、ミュートは同じ相手といる間だけ続く
const stampWant = [['gg', '\u{1F44F}', 'Good game'], ['thanks', '\u{1F91D}', 'Thanks for the match'], ['nice', '\u{1F44D}', 'Nice']];
if (JSON.stringify(STAMPS.map((s) => [s.id, s.emoji, s.text])) !== JSON.stringify(stampWant)) fail('スタンプが 👏 Good game / 🤝 Thanks for the match / 👍 Nice でない');
for (const [dev, R, other, O] of eachSide) {
  let st = at(...sides(dev, `${R}.WinResult`, `${O}.LoseResult`), friend);
  const sent = Engine.fire(st, `${dev}.stamp.gg`);
  if (!sent || sent.state[`${dev}Stamp`] !== 'gg' || sent.state[`${other}Stamp`] !== null) { fail(`${dev} がスタンプを送れない`); continue; }
  st = sent.state;
  if (Engine.canFire(st, `${dev}.stamp.nice`)) fail(`${dev} がスタンプを送ってすぐ次を送れる`);
  if (!Engine.canFire(st, `${other}.stamp.thanks`)) fail(`${other} は ${dev} のスタンプ中にも送れるはず`);
  const hidden = Engine.fire(st, `${dev}.stampShown`).state;
  if (hidden[`${dev}Stamp`] !== 'sent' || Engine.canFire(hidden, `${dev}.stamp.nice`)) fail('3 秒で消えたあと、5 秒たつ前に送れる');
  const ready = Engine.fire(hidden, `${dev}.stampInterval`).state;
  if (ready[`${dev}Stamp`] !== null || !Engine.canFire(ready, `${dev}.stamp.nice`)) fail('5 秒たっても送れない');
  const muted = Engine.fire(st, `${other}.muteStamps`);
  if (!muted || muted.state[`${other}Mute`] !== true || !Engine.canFire(muted.state, `${other}.unmuteStamps`)) fail(`${other} がミュートできない`);
  // ミュートは再戦 (VS → 試合 → 結果) の間は続き、結果画面を抜けると戻る。送ったスタンプは結果画面を抜けると消える
  let m = muted.state;
  m = Engine.fire(m, `${dev}.rematch`).state;
  m = Engine.fire(m, `${other}.rematch`).state;
  if (m[`${other}Mute`] !== true || m[`${dev}Stamp`] !== null) fail(`再戦の VS 画面でミュート ${m[`${other}Mute`]} / スタンプ ${m[`${dev}Stamp`]}`);
  const left = Engine.fire(Object.assign({}, muted.state), `${other}.backToFriendMatch`);
  if (!left || left.state[`${other}Mute`] !== false) fail('結果画面を抜けてもミュートが続く');
  for (const name of [`${R}.WinResult.OpponentLeft`, `${R}.WinResult.OpponentDisconnected`, `${R}.LoseResult.Disconnected`, `${R}.NoContestResult`]) {
    if (SCREENS[name].stamps || Engine.canFire(at(...sides(dev, name, `${O}.MultiModeSelection`), friend), `${dev}.stamp.gg`)) fail(`${name} でスタンプを送れる`);
  }
}
if (!/stampsHtml/.test(appJs) || !/r-bubble/.test(appJs) || !/Mute opponent emotes/.test(appJs)) fail('app.js にスタンプ・吹き出し・ミュートの描画が無い');

// U28: 対戦中の切断。片方なら 20 秒待って切断した側の負け (戻れば続ける)。両者・サービス障害は No contest。降参した側は再戦を申し込めない
for (const [dev, R, , O] of eachSide) {
  for (const theirs of (O === 'Host' ? hostInPlay : clientInPlay)) {
    const wait = expectFire(at(...sides(dev, `${R}.Game.Play`, theirs), random), `${dev}.disconnect`, ...sides(dev, `${R}.Game.Disconnected`, `${O}.Game.OpponentDisconnected`));
    if (!wait) continue;
    for (const ev of ['host.win', 'client.lose', 'host.draw', 'host.matchMenu', 'client.matchMenu']) if (Engine.canFire(wait, ev)) fail(`切断を待っている間に ${ev} の行がある`);
    expectFire(wait, 'net.recovered', ...sides(dev, `${R}.Game.Play`, `${O}.Game.Play`));
    expectFire(wait, 'timer.disconnectTimeout', ...sides(dev, `${R}.LoseResult.Disconnected`, `${O}.WinResult.OpponentDisconnected`));
    expectFire(wait, 'net.bothDisconnected', 'Host.NoContestResult', 'Client.NoContestResult');
    expectFire(wait, 'net.serviceFailure', 'Host.NoContestResult', 'Client.NoContestResult');
  }
  // U46: 両者の画面に残りの秒数 (20s)。残った側 "Your opponent disconnected"、切れた側 "Connection lost"
  for (const [name, who] of [[`${R}.Game.Disconnected`, 'self'], [`${R}.Game.OpponentDisconnected`, 'opponent']]) {
    const s = SCREENS[name];
    if (!s || s.view !== 'game' || s.overlay !== DISCONNECT_OVERLAYS[who] || s.timer !== 20 || !s.decided.includes('U46')) fail(`${name} が残りの秒数付きの切断を待つゲーム画面 (決定 U46) になっていない`);
  }
}
expectFire(at('Host.Game.MatchMenu', 'Client.Game.SurrenderConfirm'), 'net.bothDisconnected', 'Host.NoContestResult', 'Client.NoContestResult');
expectFire(at('Host.Game.Play', 'Client.Game.Play'), 'net.serviceFailure', 'Host.NoContestResult', 'Client.NoContestResult');
for (const o of Object.values(DISCONNECT_OVERLAYS)) if (/\d/.test(o.title + o.body)) fail(`切断を待つ表示に数字 (20 秒) がある: ${o.title} / ${o.body}`);

// U29: 次の相手を探す。見た目は Random Match と同じ。60 秒で見つからなければ "No opponent found." と Search again / Back to Online
for (const [dev, R, , O] of eachSide) {
  const next = `${R}.Matchmake.NextOpponent`;
  const st = (mine) => at(...sides(dev, mine, `${O}.MultiModeSelection`));
  expectFire(st(next), `${dev}.searchTimeout`, ...sides(dev, `${next}.NotFound`, `${O}.MultiModeSelection`));
  expectFire(st(next), `${dev}.cancelSearch`, ...sides(dev, `${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
  expectFire(st(next), `${dev}.back`, ...sides(dev, `${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
  expectFire(st(`${next}.NotFound`), `${dev}.searchAgain`, ...sides(dev, next, `${O}.MultiModeSelection`));
  expectFire(st(`${next}.NotFound`), `${dev}.backToOnlineBattle`, ...sides(dev, `${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
  // U47: 次の相手を探している間にアプリを離れても U43 と同じ (Online Battle の中に "Search stopped…")
  expectFire(st(next), `${dev}.leaveApp`, ...sides(dev, `${R}.Matchmake.Stopped`, `${O}.MultiModeSelection`));
  const nf = SCREENS[`${next}.NotFound`];
  if (!nf.notice || nf.notice.text !== 'No opponent found.' || nf.notice.buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Search again:searchAgain,Back to Online:backToOnlineBattle') fail(`${next}.NotFound の通知が "No opponent found." と Search again / Back to Online でない`);
  if (SCREENS[next].status !== 'Searching for an opponent…') fail(`${next} の表示が Random Match と同じでない`);
  const found = expectFire(at(...sides(dev, next, `${O}.Matchmake`)), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
  if (found && (found.match !== 'random' || found.rated !== true)) fail('次の相手との対戦がレートの変わるランダム対戦になっていない');
}

// 秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値が仮であることは右パネル (説明) と README に書く
const resultContext = [].concat(SCREENS['Host.WinResult'].context).join();
if (!/1000/.test(resultContext) || !/K=24/.test(resultContext) || !/仮の値/.test(resultContext)) fail('結果画面の右パネルに Elo の値が仮であることが無い');
for (const [name, want] of [['Host.WinResult.RematchRequested', /20 秒 \(仮\)/], ['Host.WinResult.RematchDeclined.Cooldown', /3 秒 \(仮\)/], ['Host.WinResult', /5 秒 \(仮\)/],
  ['Host.Game.OpponentDisconnected', /20 秒 \(仮\)/], ['Host.Matchmake.NextOpponent', /60 秒 \(仮\)/]]) {
  if (!want.test([].concat(SCREENS[name].context).join())) fail(`${name} の右パネルに ${want} が無い`);
}
for (const [k, v] of Object.entries(Object.assign({}, END_REASONS, ...Object.values(REMATCH_STATUS).map((x, i) => ({ [i]: x.text }))))) if (/\d/.test(v)) fail(`結果画面の文言に数字: ${k} ${v}`);

// シナリオの流れ (手順ごとの両端末の状態)
const flows = {
  '15': [[14, 'Host.WinResult / Client.LoseResult'], [15, 'Host.FriendMatch.Room / Client.LoseResult.OpponentLeft'], [16, 'Host.FriendMatch.Room / Client.FriendMatch.Room']],
  '15b': [[14, 'Host.LoseResult / Client.WinResult'], [15, 'Host.LoseResult.OpponentLeft / Client.FriendMatch.Room']],
  '15c': [[15, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [16, 'Host.Opponent / Client.Opponent'], [19, 'Host.LoseResult / Client.WinResult']],
  '15d': [[16, 'Host.WinResult.RematchCancelledByYou.Cooldown / Client.LoseResult.RematchCancelled.Cooldown'], [17, 'Host.WinResult.RematchCancelledByYou / Client.LoseResult.RematchCancelled'],
    [18, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [19, 'Host.Opponent / Client.Opponent']],
  '15e': [[16, 'Host.WinResult.RematchDeclinedByYou.Cooldown / Client.LoseResult.RematchDeclined.Cooldown'], [17, 'Host.WinResult.RematchDeclinedByYou / Client.LoseResult.RematchDeclined'],
    [18, 'Host.WinResult.OpponentLeft / Client.FriendMatch.Room']],
  '15f': [[16, 'Host.WinResult.RematchExpired.Cooldown / Client.LoseResult.RematchExpiredIncoming.Cooldown'], [17, 'Host.WinResult.RematchExpired / Client.LoseResult.RematchExpiredIncoming'],
    [19, 'Host.Opponent / Client.Opponent']],
  '15g': [[14, 'Host.DrawResult / Client.DrawResult'], [15, 'Host.Opponent / Client.Opponent'], [17, 'Host.Game.Play / Client.Game.Play']],
  '16d': [[8, 'Host.WinResult.OpponentSurrendered / Client.LoseResult.Surrendered'], [10, 'Host.Matchmake.NextOpponent / Client.MultiModeSelection']],
  '17': [[6, 'Host.WinResult / Client.LoseResult'], [8, 'Host.Opponent / Client.Opponent'], [11, 'Host.LoseResult / Client.WinResult'],
    [12, 'Host.Matchmake.NextOpponent / Client.WinResult.OpponentLeft'], [15, 'Host.Opponent / Client.Opponent']],
  '17b': [[8, 'Host.Matchmake.NextOpponent.NotFound / Client.WinResult.OpponentLeft'], [9, 'Host.Matchmake.NextOpponent / Client.WinResult.OpponentLeft'], [11, 'Host.MultiModeSelection / Client.WinResult.OpponentLeft']],
  '18': [[14, 'Host.Game.OpponentDisconnected / Client.Game.Disconnected'], [15, 'Host.WinResult.OpponentDisconnected / Client.LoseResult.Disconnected']],
  '18b': [[14, 'Host.Game.Disconnected / Client.Game.OpponentDisconnected'], [15, 'Host.Game.Play / Client.Game.Play'], [16, 'Host.WinResult / Client.LoseResult']],
  '18c': [[15, 'Host.NoContestResult / Client.NoContestResult']],
  '18d': [[6, 'Host.NoContestResult / Client.NoContestResult'], [8, 'Host.MultiModeSelection / Client.Matchmake.NextOpponent']],
  '18e': [[7, 'Host.LoseResult.Disconnected / Client.WinResult.OpponentDisconnected']],
};
for (const [id, checks] of Object.entries(flows)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  for (const [n, want] of checks) {
    const got = pair(Engine.replay(sc, n).state);
    if (got !== want) fail(`シナリオ ${id} の手順 ${n}: ${got} (期待: ${want})`);
  }
}
// 15h: スタンプとミュート (手順ごとの hostStamp / clientStamp / clientMute)
const sc15h = SCENARIOS.find((x) => x.id === '15h');
const stampFlow = [14, 15, 16, 17, 18, 19, 20, 21].map((n) => { const st = Engine.replay(sc15h, n).state; return `${st.hostStamp},${st.clientStamp},${st.clientMute}`; }).join(' → ');
const stampWantFlow = 'null,null,false → gg,null,false → gg,thanks,false → sent,thanks,false → sent,thanks,true → null,thanks,true → nice,thanks,true → nice,thanks,false';
if (stampFlow !== stampWantFlow) fail(`シナリオ 15h のスタンプ ${stampFlow} (期待: ${stampWantFlow})`);
console.log('ok  対戦後 (U20〜U30): 結果画面の中身・レート・ボタン・戻り先・再戦・スタンプ・切断・次の相手 (両端末)');

// 対戦中の MATCH MENU (決定 U37〜U42、案A): ☰ で開いても相手の端末は変わらない。CONTINUE で閉じ、SURRENDER は確認を挟む。
// 降参すると自分は負け、相手は (メニューを開いていても) 勝ち + "Your opponent surrendered"。負けの結果画面から Online Battle へ
for (const id of ['U37', 'U38', 'U39', 'U40', 'U41', 'U42']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.by !== '高宮さん' || u.decided.date !== '2026-10-07') fail(`${id} が 高宮さん 2026-10-07 の決定になっていない`);
}
if (/降参/.test(UNDECIDED.find((u) => u.id === 'U28').title)) fail('U28 の題名に決定済みの降参が残っている');
for (const [dev, R, other, O] of [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']]) {
  const pair2 = (mine, theirs) => (dev === 'host' ? [mine, theirs] : [theirs, mine]);
  const st = (mine, theirs) => at(...pair2(mine, theirs));
  const [play, menu, confirm] = [`${R}.Game.Play`, `${R}.Game.MatchMenu`, `${R}.Game.SurrenderConfirm`];
  for (const theirs of clientInPlay.concat(hostInPlay).filter((s) => s.startsWith(O + '.'))) {
    const m = expectFire(st(play, theirs), `${dev}.matchMenu`, ...pair2(menu, theirs));
    if (!m) continue;
    if (Engine.canFire(m, `${dev}.matchMenu`)) fail(`${menu} でもう一度メニューを開ける`);
    for (const ev of ['pause', 'quit', 'continue', 'pauseRematch', 'rematch']) if (Engine.canFire(m, `${dev}.${ev}`)) fail(`${menu} で ${dev}.${ev} の行がある`);
    expectFire(m, `${dev}.matchMenu.continue`, ...pair2(play, theirs));
    const c = expectFire(m, `${dev}.matchMenu.surrender`, ...pair2(confirm, theirs));
    if (!c) continue;
    expectFire(c, `${dev}.surrenderConfirm.continue`, ...pair2(play, theirs));
    expectFire(c, `${dev}.surrenderConfirm.surrender`, ...pair2(`${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`));
  }
  expectFire(st(`${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`), `${dev}.backToOnlineBattle`,
    ...pair2(`${R}.MultiModeSelection`, `${O}.WinResult.OpponentSurrendered`));
  expectFire(Object.assign(st(`${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`), friend), `${other}.backToFriendMatch`,
    ...pair2(`${R}.LoseResult.Surrendered`, `${O}.FriendMatch.Room`));
  if (Engine.canFire(at('Host.Game.Countdown', 'Client.Game.Countdown'), `${dev}.matchMenu`)) fail(`カウントダウン中に ${dev}.matchMenu の行がある`);
  for (const name of [menu, confirm]) {
    const s = SCREENS[name];
    if (s.view !== 'game' || !s.menu) fail(`${name} がメニュー付きのゲーム画面になっていない`);
  }
  for (const [name, reason] of [[`${R}.LoseResult.Surrendered`, 'surrendered'], [`${R}.WinResult.OpponentSurrendered`, 'opponentSurrendered']]) {
    const s = SCREENS[name];
    if (!s || s.reason !== reason) { fail(`${name} が降参の結果画面になっていない`); continue; }
    for (const match of ['friend', 'random']) if (resultButtons(s, match).some((b) => b.event === 'rematch')) fail(`${name} (${match}) に Rematch がある`);
  }
}
if (MATCH_MENU.title !== 'MATCH MENU' || !/continues while the menu is open/.test(MATCH_MENU.body)) fail('MATCH MENU のタイトルか「試合は続く」の一文が無い');
if (MATCH_MENU.buttons.map((b) => b.label).join() !== 'CONTINUE,SURRENDER') fail('MATCH MENU のボタンが CONTINUE / SURRENDER でない (REMATCH / QUIT は無い)');
if (SURRENDER_CONFIRM.title !== 'Surrender?' || SURRENDER_CONFIRM.body !== 'You will lose.') fail('降参の確認の文言が "Surrender?" / "You will lose." でない');
if (SURRENDER_CONFIRM.buttons.map((b) => b.label).join() !== 'CONTINUE,SURRENDER') fail('降参の確認のボタンが CONTINUE / SURRENDER でない');
if (END_REASONS.opponentSurrendered !== 'Your opponent surrendered' || END_REASONS.surrendered !== 'You surrendered') fail('降参の結果画面の "You surrendered" / "Your opponent surrendered" が無い');
for (const r of TRANSITIONS) if (/\.(pause|quit|continue|pauseRematch)$/.test(r.event) && !/(matchMenu|surrenderConfirm)\./.test(r.event)) fail(`${r.id}: ポーズの ${r.event} が残っている`);
for (const k of Object.keys(SCREENS)) if (/\.Game\.Pause$/.test(k)) fail(`ポーズの状態 ${k} が残っている`);
if (/timeScale|g-pause|p-dim/.test(read('js', 'app.js') + read('css', 'style.css'))) fail('app.js / style.css にポーズ (試合を止める表示) が残っている');
// モック専用の "Game in progress (mock)" は無くなった
for (const r of TRANSITIONS) if (/backToOnline$/.test(r.event)) fail(`${r.id}: モック専用の ${r.event} が残っている`);
if (/Game in progress/.test(read('js', 'app.js'))) fail('app.js にモック専用のゲーム画面の表示が残っている');
// [手順の途中, 最後] の状態
const menuScenarios = {
  '16': [15, 'Host.Game.MatchMenu / Client.Game.MatchMenu', 'Host.Game.Play / Client.Game.Play'],
  '16b': [19, 'Host.LoseResult.Surrendered / Client.WinResult.OpponentSurrendered', 'Host.MultiModeSelection / Client.WinResult.OpponentSurrendered'],
  '16c': [14, 'Host.Game.MatchMenu / Client.Game.Play', 'Host.LoseResult / Client.WinResult'],
};
for (const [id, [n, mid, last]] of Object.entries(menuScenarios)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  const got = [pair(Engine.replay(sc, n).state), pair(Engine.replay(sc).state)];
  if (got.join() !== [mid, last].join()) fail(`シナリオ ${id} の状態 ${got.join(' → ')} (期待: ${mid} → ${last})`);
}
console.log('ok  MATCH MENU: 開いても相手は変わらない / CONTINUE / SURRENDER → 確認 → 負け + 相手に "Your opponent surrendered" (両端末)、メニュー中も Win / Lose');

// 決定 (U13a): ランダム対戦は相手が見つかり次第 VS 画面へ。Ready 画面 / Starting match… を挟まない (U31 は Friend Match だけ)。
// 相手を探す画面は "Searching for an opponent…" と大きな Cancel
const u13a = UNDECIDED.find((u) => u.id === 'U13a');
if (!u13a || !u13a.decided) fail('U13a が決定済みになっていない');
if (!/Friend Match/.test(u31.title)) fail('U31 の題名が Friend Match だけの決定になっていない');
expectFire(at('Host.Matchmake', 'Client.Matchmake'), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
const randomStates = ['Host.Matchmake', 'Client.Matchmake'];
const friendStart = /\.FriendMatch\.Lobby\.(Ready|Starting|StartFailed)/;
for (const r of TRANSITIONS) {
  const fromRandom = Engine.DEVICES.some((d) => states(r.from[d]).some((s) => s.startsWith('Host.Matchmake') || s.startsWith('Client.Matchmake')));
  if (fromRandom && Engine.DEVICES.some((d) => friendStart.test(r.to[d]))) fail(`${r.id}: ランダム対戦から ${r.to.host} / ${r.to.client} (Ready 画面) へ進む`);
  if (r.event === 'sys.opponentFound' && !r.decided.includes('U13a')) fail(`${r.id}: 相手が見つかる行に決定 U13a が無い`);
  if (r.decided.includes('U31') && fromRandom) fail(`${r.id}: ランダム対戦の行に U31 が付いている`);
}
for (const name of randomStates) {
  const s = SCREENS[name];
  if (s.status !== 'Searching for an opponent…') fail(`${name} の表示が "Searching for an opponent…" でない`);
  if (s.toast) fail(`${name} にトーストが残っている`);
  const labels = s.buttons.map((b) => b.label).join();
  if (labels !== 'Cancel' || !s.buttons[0].big || s.buttons[0].event !== 'cancelSearch') fail(`${name} のボタンが大きな Cancel だけでない (${labels})`);
}
const sc11 = SCENARIOS.find((x) => x.id === '11');
const got11 = sc11 ? [2, 3, 4, 5].map((n) => pair(Engine.replay(sc11, n).state)).join(' → ') : 'なし';
const want11 = 'Host.Matchmake / Client.Matchmake → Host.Opponent / Client.Opponent → Host.Game.Countdown / Client.Game.Countdown → Host.Game.Play / Client.Game.Play';
if (got11 !== want11) fail(`シナリオ 11 の流れ ${got11} (期待: ${want11})`);
console.log('ok  U13a: ランダム対戦は相手が見つかり次第 VS 画面、Searching + Cancel');

// 決定 (U13、高宮さん 2026-10-07): 相手を探している間の Cancel は確認なしで Online Battle へ。‹ も Cancel とまったく同じ。
// 探している間に行けるのは Online Battle だけ。アプリを離れると検索を止めて通知 (出し方は U43)、
// 見つからなければ元の画面 (Online Battle) に "No opponent found." と Search again (→ 探し直す) / Close (→ 通知を閉じる)。
// 60 秒という長さは仮で、右パネル (説明) と README にだけ書き、端末の画面には出さない
const u13 = UNDECIDED.find((u) => u.id === 'U13');
if (!u13 || !u13.decided || u13.decided.by !== '高宮さん' || u13.decided.date !== '2026-10-07') fail('U13 が 高宮さん 2026-10-07 の決定になっていない');
if (u13 && !/60 秒という長さは仮/.test(u13.desc)) fail('U13 の説明に「60 秒という長さは仮」が無い');
for (const r of TRANSITIONS) {
  if (r.undecided.includes('U13')) fail(`${r.id}: 決定済みの U13 が未決として残っている`);
  if (r.note && /確認を挟むかは未決|仮: ‹ も Cancel/.test(r.note)) fail(`${r.id}: U13 が未決だったころのメモが残っている`);
}
if (!/60 秒という長さは仮/.test(SCREENS['Host.Matchmake.NotFound'].context)) fail('"No opponent found." の右パネルの説明に「60 秒という長さは仮」が無い');
for (const [dev, R, O] of [['host', 'Host', 'Client'], ['client', 'Client', 'Host']]) {
  const pair3 = (mine, theirs) => (dev === 'host' ? [mine, theirs] : [theirs, mine]);
  for (const theirs of [`${O}.MultiModeSelection`, `${O}.Matchmake`, `${O}.Matchmake.NotFound`, `${O}.FriendMatch.Room`]) {
    const st = (mine) => at(...pair3(mine, theirs));
    const [search, stopped, notFound, online] = [`${R}.Matchmake`, `${R}.Matchmake.Stopped`, `${R}.Matchmake.NotFound`, `${R}.MultiModeSelection`];
    for (const ev of ['cancelSearch', 'back']) {
      const res = Engine.fire(st(search), `${dev}.${ev}`);
      if (!res || res.state[dev + 'Dialog']) fail(`${search} の ${ev} で確認ダイアログが出る`);
      expectFire(st(search), `${dev}.${ev}`, ...pair3(online, theirs));
    }
    expectFire(st(search), `${dev}.leaveApp`, ...pair3(stopped, theirs));
    expectFire(st(search), `${dev}.searchTimeout`, ...pair3(notFound, theirs));
    for (const notice of [stopped, notFound]) {
      expectFire(st(notice), `${dev}.searchAgain`, ...pair3(search, theirs));
      expectFire(st(notice), `${dev}.closeNotice`, ...pair3(online, theirs));
    }
  }
  // 探している間に押せるのは Cancel / ‹ とモック操作 (アプリを離れる・60 秒たつ) だけで、行き先は Online Battle か通知
  const devEvents = Object.keys(EVENT_LABELS).filter((ev) => ev.startsWith(dev + '.'));
  const allowed = ['cancelSearch', 'back', 'leaveApp', 'searchTimeout'].map((e) => `${dev}.${e}`);
  for (const ev of devEvents) {
    const res = Engine.fire(at('Host.Matchmake', 'Client.Matchmake'), ev);
    if (res && !allowed.includes(ev)) fail(`${R}.Matchmake で ${ev} の行がある (探している間はほかの画面へ行けない)`);
    if (res && ![`${R}.MultiModeSelection`, `${R}.Matchmake.Stopped`, `${R}.Matchmake.NotFound`].includes(res.state[dev])) fail(`${R}.Matchmake から ${ev} で ${res.state[dev]} へ行く`);
  }
  // "No opponent found." (モーダル) を出している間に押せるのは Search again / Close だけ
  const notFoundSt = at(...pair3(`${R}.Matchmake.NotFound`, `${O}.MultiModeSelection`));
  for (const ev of devEvents) if (Engine.canFire(notFoundSt, ev) && ![`${dev}.searchAgain`, `${dev}.closeNotice`].includes(ev)) fail(`${R}.Matchmake.NotFound で ${ev} の行がある`);
  // 通知の画面: 文言と Search again / Close。60 秒という長さは画面に出さない。
  // "No opponent found." は Online Battle の上 (モーダル)、"Search stopped…" は Online Battle の中 (モーダルではない、U43)
  for (const [name, key, text] of [[`${R}.Matchmake.Stopped`, 'inlineNotice', 'Search stopped while the app was in the background.'],
    [`${R}.Matchmake.NotFound`, 'notice', 'No opponent found.']]) {
    const s = SCREENS[name];
    if (!s || s.view !== 'online' || !s[key]) { fail(`${name} が Online Battle の ${key} になっていない`); continue; }
    if (s.notice && s.inlineNotice) fail(`${name} にモーダルとインラインの通知が両方ある`);
    if (s[key].text !== text) fail(`${name} の文言が "${text}" でない (${s[key].text})`);
    if (s[key].buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Search again:searchAgain,Close:closeNotice') fail(`${name} のボタンが Search again / Close でない`);
    if (/\d/.test(s[key].text)) fail(`${name} の画面に数字 (60 秒) が出る`);
    if (!s.decided.includes('U13')) fail(`${name} に決定 U13 が無い`);
  }
  if (SCREENS[`${R}.Matchmake.Stopped`].notice) fail(`${R}.Matchmake.Stopped の通知がモーダル (U43 はモーダルにしない)`);
  if (SCREENS[`${R}.Matchmake`].undecided.length) fail(`${R}.Matchmake に未決 ${SCREENS[`${R}.Matchmake`].undecided} が残っている`);
}
if (!/leaveApp/.test(appJs) || !/searchTimeout/.test(appJs) || !/mockControlsHtml/.test(appJs)) fail('app.js の端末の下のモック操作に「アプリを離れる」「60 秒たつ」が無い');
// [手順ごとの状態] (11b〜11f)
const u13Scenarios = {
  '11b': ['Host.Matchmake / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection',
    'Host.Matchmake / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection'],
  '11c': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Stopped / Client.MultiModeSelection', 'Host.Matchmake / Client.MultiModeSelection',
    'Host.Matchmake / Client.Matchmake', 'Host.Opponent / Client.Opponent'],
  '11d': ['Host.MultiModeSelection / Client.Matchmake', 'Host.MultiModeSelection / Client.Matchmake.Stopped', 'Host.MultiModeSelection / Client.MultiModeSelection'],
  '11e': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.NotFound / Client.MultiModeSelection', 'Host.Matchmake / Client.MultiModeSelection',
    'Host.Matchmake / Client.Matchmake', 'Host.Opponent / Client.Opponent'],
  '11f': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.NotFound / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection'],
};
for (const [id, want] of Object.entries(u13Scenarios)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  const got = sc ? want.map((_, i) => pair(Engine.replay(sc, i + 1).state)) : [];
  if (!sc || sc.steps.length !== want.length || got.join() !== want.join()) fail(`シナリオ ${id} の流れ ${got.join(' → ')} (期待: ${want.join(' → ')})`);
}
console.log('ok  U13: Cancel / ‹ は確認なしで Online Battle、アプリを離れると "Search stopped…"、見つからなければ "No opponent found." (Search again / Close) (両端末)');

// 決定 (U43、高宮さん 2026-10-07): アプリを離れて検索が止まったら、戻ったときに Online Battle の中に通知のボックス (モーダルではない)。
// 文言 "Search stopped while the app was in the background."、ボタンは Search again (新しく探す) / Close。
// 自動では消えず、ほかの画面へ移ると消える (Online Battle のほかの操作もそのまま使える)。"No opponent found." はこれまでどおり
const u43 = UNDECIDED.find((u) => u.id === 'U43');
if (!u43 || !u43.decided || u43.decided.by !== '高宮さん' || u43.decided.date !== '2026-10-07') fail('U43 が 高宮さん 2026-10-07 の決定になっていない');
if (u43 && !u43.desc.includes('Search stopped while the app was in the background.')) fail('U43 の説明に新しい文言が無い');
for (const r of TRANSITIONS) if (r.undecided.includes('U43')) fail(`${r.id}: 決定済みの U43 が未決として残っている`);
for (const name of Object.keys(SCREENS)) {
  const s = SCREENS[name];
  if ((s.undecided || []).includes('U43')) fail(`${name} に決定済みの U43 が未決として残っている`);
  for (const n of [s.notice, s.inlineNotice]) if (n && /because you left the app/.test(n.text)) fail(`${name} に古い文言 "…because you left the app." が残っている`);
}
for (const [dev, R, O] of [['host', 'Host', 'Client'], ['client', 'Client', 'Host']]) {
  const pair3 = (mine, theirs) => (dev === 'host' ? [mine, theirs] : [theirs, mine]);
  const stopped = `${R}.Matchmake.Stopped`;
  if (!SCREENS[stopped].decided.includes('U43')) fail(`${stopped} に決定 U43 が無い`);
  // Online Battle で押せるもの (Random Match / Friend Match) は、通知を出している間も同じ行き先へ行ける。行き先に通知は無い
  const online = SCREENS[`${R}.MultiModeSelection`];
  if (SCREENS[stopped].items.map((i) => i.event).join() !== online.items.map((i) => i.event).join()) fail(`${stopped} のメニューが Online Battle と違う`);
  for (const theirs of [`${O}.MultiModeSelection`, `${O}.Matchmake`, `${O}.FriendMatch.Room`]) {
    for (const it of online.items) {
      const ev = `${dev}.${it.event}`;
      const want = Engine.fire(at(...pair3(`${R}.MultiModeSelection`, theirs)), ev);
      if (!want) { fail(`${R}.MultiModeSelection で ${ev} の行が無い`); continue; }
      expectFire(at(...pair3(stopped, theirs)), ev, want.state.host, want.state.client);
    }
  }
  // 通知から出ていく行はすべて、ユーザーの操作で、通知の無い画面へ行く (自動・環境・タイマーでは消えない)
  const st = at(...pair3(stopped, `${O}.MultiModeSelection`));
  for (const ev of Object.keys(EVENT_LABELS)) {
    const res = Engine.fire(st, ev);
    if (!res || res.state[dev] === stopped) continue;
    if (!ev.startsWith(dev + '.')) fail(`${stopped} が ${ev} (ユーザー以外の操作) で消える`);
    if (res.row.auto) fail(`${stopped} から自動遷移 (${res.row.id}) がある`);
    const to = SCREENS[res.state[dev]];
    if (to.notice || to.inlineNotice) fail(`${stopped} から ${ev} で行った ${res.state[dev]} にも通知がある`);
  }
  if (![`${dev}.searchAgain`, `${dev}.closeNotice`, `${dev}.randomMatch`, `${dev}.friendMatch`].every((ev) => Engine.canFire(st, ev))) fail(`${stopped} で Search again / Close / Random Match / Friend Match のどれかが押せない`);
}
// アプリ: インラインの通知は Online Battle のメニューの中に描き、暗幕 (.dim) を重ねない
if (!/inlineNoticeHtml\(dev, s\.inlineNotice\)/.test(appJs)) fail('app.js が Online Battle の中にインラインの通知を描いていない');
if (!/\.inline-notice\s*\{/.test(read('css', 'style.css'))) fail('style.css に .inline-notice が無い');
// [手順ごとの状態] 11g: 通知を出したまま Friend Match → ‹ で戻っても通知は出ない
{
  const want = ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Stopped / Client.MultiModeSelection',
    'Host.FriendMatch.Room / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection'];
  const sc = SCENARIOS.find((x) => x.id === '11g');
  const got = sc ? want.map((_, i) => pair(Engine.replay(sc, i + 1).state)) : [];
  if (!sc || sc.steps.length !== want.length || got.join() !== want.join()) fail(`シナリオ 11g の流れ ${got.join(' → ')} (期待: ${want.join(' → ')})`);
}
console.log('ok  U43: 検索が止まった通知は Online Battle の中 (モーダルではない)、Search again / Close、ほかの画面へ移ると消え、自動では消えない (両端末)');

// 端末の画面にはゲームが出すものだけ: 決定の注記や「決定」バッジは端末の中にも端末の上にも出さない (右パネルへ)
if (/decided-note|decidedNoteHtml|GAME_COUNTDOWN_PREMISE/.test(appJs)) fail('app.js が端末の画面に決定の注記を出している');
if (/pillHtml|undecided-strip/.test(appJs)) fail('app.js が端末の上にバッジを出している');
console.log('ok  端末の画面と端末の上に決定の注記・バッジが無い');

// 端末の画面には仮・未決の印やモックの注記も出さない (説明は右パネル)。
// 実際の描画は tests/scan-screens.mjs が全シナリオの全手順で確かめる
if (/mock-note|class="tmp"|pill-undecided small inline|btn-wrap/.test(appJs)) fail('app.js が端末の画面に仮・未決の印やモックの注記を出している');
// 結果画面の決定 (U44 / U45 / U49 / U50) は右パネルの「決定済み」に出し、仮の値の説明も右パネルに出す
for (const [name, s] of Object.entries(SCREENS)) {
  if (s.view !== 'result') continue;
  const want = [].concat(s.stamps ? ['U49'] : [], /\.Rematch(Cancelled|Declined|Expired)/.test(name) ? ['U50'] : [], /^timeUp/.test(s.reason) ? ['U44'] : [],
    /\.(Surrendered|OpponentSurrendered|Disconnected|OpponentDisconnected)$|NoContest/.test(name) ? ['U45'] : []);
  for (const id of want) if (!s.decided.includes(id)) fail(`${name}: 決定 ${id} が無い`);
  if (!/仮の値/.test([].concat(s.context).join())) fail(`${name}: 右パネルに秒数・Elo の値が仮だという説明が無い`);
}
console.log('ok  結果画面の決定は右パネル、仮の値の説明は右パネルに出す');

// 決定 (U44〜U55、高宮さん 2026-10-08) と、確認された pi の仮定 5 点
for (const id of ['U44', 'U45', 'U46', 'U47', 'U48', 'U49', 'U50', 'U51', 'U52', 'U53', 'U54', 'U55']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.by !== '高宮さん' || u.decided.date !== '2026-10-08') fail(`${id} が 高宮さん 2026-10-08 の決定になっていない`);
}
for (const r of TRANSITIONS) if (r.undecided.length) fail(`${r.id}: 未決 ${r.undecided} が残っている`);
for (const [name, sc] of Object.entries(SCREENS)) if (sc.undecided.length) fail(`${name}: 未決 ${sc.undecided} が残っている`);
for (const [name, d] of Object.entries(DIALOGS)) if ((d.undecided || []).length) fail(`ダイアログ ${name}: 未決 ${d.undecided} が残っている`);
// U44: 時間切れで得点の高いほうが勝ち、同点なら引き分け。"Time is up" / "Same score when time ran out"
for (const R of ['Host', 'Client']) {
  for (const [o, reason] of [['Win', 'timeUp'], ['Lose', 'timeUp'], ['Draw', 'timeUpTie']]) {
    const sc = SCREENS[`${R}.${o}Result`];
    if (sc.reason !== reason) fail(`${R}.${o}Result の終わった理由が ${sc.reason} (期待: ${reason})`);
  }
}
if (/Match finished/.test(shownText + appJs)) fail('仮の "Match finished" が残っている');
if (ctx.DEMO_SCORES.Draw[0] !== ctx.DEMO_SCORES.Draw[1] || ctx.DEMO_SCORES.Win[0] <= ctx.DEMO_SCORES.Win[1]) fail('デモのスコアが U44 (高いほうが勝ち・同点は引き分け) と合わない');
if (!/'時間切れ'|時間切れ\)/.test(appJs) || !/btn\('draw', '同点'/.test(appJs)) fail('端末の下のモック操作が時間切れの勝ち / 負け / 同点になっていない');
// U45: 降参・切断・No contest のあとは、どちらからも再戦できない
for (const name of resultNames.filter((k) => /\.(Surrendered|OpponentSurrendered|Disconnected|OpponentDisconnected)$|NoContest/.test(k))) {
  for (const match of ['friend', 'random']) if (resultButtons(SCREENS[name], match).some((b) => b.label === 'Rematch')) fail(`${name} (${match}) に Rematch がある (U45)`);
}
// U46: 片方の切断はゲームと得点を止める (濃い暗幕)。MATCH MENU は止めない (薄い暗幕のまま)
if (!/m-dim paused/.test(appJs) || !/\.m-dim\.paused \{ background: rgba\(0, 0, 0, 0\.784\)/.test(read('css', 'style.css'))) fail('切断を待つ間の暗幕が、止まっていることを示す濃さになっていない (U46)');
if (/class="m-dim paused[^"]*"[^;]*matchMenu|function matchMenuHtml[^}]*paused/.test(appJs)) fail('MATCH MENU の暗幕が止まった表示になっている (U37)');
// U48: VS 画面は "Rating {n}" (Friend Match でも)。架空の Rank は無い
if (/Rank|rank/.test(appJs + JSON.stringify(ctx.PLAYERS)) || !/Rating ' \+ ELO\.initial/.test(appJs)) fail('VS 画面が "Rating {n}" になっていない / Rank が残っている (U48)');
// U49: ミュートのボタンの文言。ミュートは同じ相手と続けて対戦している間だけ (VS 画面の切断待ちを含む)
if (!/Mute opponent emotes/.test(appJs) || !/Unmute opponent emotes/.test(appJs) || /Mute stamps/.test(appJs)) fail('ミュートのボタンが "Mute opponent emotes" / "Unmute opponent emotes" でない (U49)');
for (const name of ['Host.Opponent.Disconnected', 'Client.Opponent.OpponentDisconnected', 'Host.Game.Countdown']) if (!ctx.isWithOpponent(name)) fail(`${name} でミュートが解ける (U49)`);
// U51: Close Room の確認の題名は "Close this room?"。U12 のクライアント向けの本文は保留 (README に書く)
if (DIALOGS.closeRoom.title !== 'Close this room?') fail('Close Room の確認の題名が "Close this room?" でない (U51)');
if (!/保留/.test(UNDECIDED.find((u) => u.id === 'U51').desc) || !/U12[^\n]*保留|保留[^\n]*U12/.test(read('README.md'))) fail('U12 のクライアント向けの本文が保留だと書かれていない (U51)');
// U52: 部屋のお知らせはモーダルではない帯で Close で閉じる。Match Code を入れても消えない
const ROOM_NOTICES_WANT = { HostLeft: 'Room closed. The host left.', HostDisconnected: 'Room closed. The host disconnected.', RoomClosed: 'The room was closed.',
  ReconnectFailed: 'Could not reconnect. The match did not start.', MatchCancelled: 'Match cancelled. Opponent did not reconnect.' };
if (JSON.stringify(ctx.ROOM_NOTICES) !== JSON.stringify(ROOM_NOTICES_WANT)) fail('部屋のお知らせの文言が違う (U52)');
if (/You left the room/.test(shownText)) fail('"You left the room" を出している (U52)');
for (const k of Object.keys(ROOM_NOTICES_WANT)) {
  const top = `Client.FriendMatch.Room.${k}`;
  for (const name of [top, `${top}.CodeEntered`]) {
    const sc = SCREENS[name];
    if (!sc || sc.view !== 'friendTop' || !sc.roomNotice || sc.roomNotice.text !== ROOM_NOTICES_WANT[k] || sc.roomNotice.buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Close:closeNotice') {
      fail(`${name} が "${ROOM_NOTICES_WANT[k]}" と Close の帯の Friend Match トップでない`);
    }
    if (sc && sc.input !== (name === top ? '' : 'QWERTY123')) fail(`${name} の入力欄が ${sc.input}`);
  }
  expectFire(at('Host.MultiModeSelection', top), 'client.enterCode', 'Host.MultiModeSelection', `${top}.CodeEntered`);
  expectFire(at('Host.MultiModeSelection', top), 'client.closeNotice', 'Host.MultiModeSelection', 'Client.FriendMatch.Room');
  expectFire(at('Host.MultiModeSelection', `${top}.CodeEntered`), 'client.closeNotice', 'Host.MultiModeSelection', 'Client.FriendMatch.Room.CodeEntered');
  expectFire(at('Host.FriendMatch.Lobby.Waiting', `${top}.CodeEntered`), 'client.joinMatch', 'Host.FriendMatch.Lobby.FriendJoined', 'Client.FriendMatch.Lobby.Connecting');
  expectFire(at('Host.MultiModeSelection', top), 'client.back', 'Host.MultiModeSelection', 'Client.MultiModeSelection');
  for (const r of TRANSITIONS) if (r.auto && [].concat(r.from.client).includes(top)) fail(`${top} から自動で進む (U52: Close で閉じる)`);
}
for (const k of ['ReconnectFailed', 'MatchCancelled']) {
  const name = `Host.FriendMatch.Room.${k}`;
  if (!SCREENS[name] || SCREENS[name].roomNotice.text !== ROOM_NOTICES_WANT[k]) fail(`${name} が "${ROOM_NOTICES_WANT[k]}" の帯でない`);
  expectFire(at(name, 'Client.MultiModeSelection'), 'host.closeNotice', 'Host.FriendMatch.Room', 'Client.MultiModeSelection');
  expectFire(at(name, 'Client.MultiModeSelection'), 'host.createMatch', 'Host.FriendMatch.Lobby.Waiting', 'Client.MultiModeSelection');
}
if (!/roomNoticeHtml/.test(appJs) || !/\.room-notice \{ display: flex/.test(read('css', 'style.css'))) fail('部屋のお知らせが Close 付きの帯で描かれていない (U52)');
// U53: Ready を送っている間・読み込み・VS 画面から先は取り消せない
for (const [h, c] of [[L('Host', 'Ready.Confirming'), L('Client', 'Ready')], [L('Host', 'Starting'), L('Client', 'Starting')], ['Host.Opponent', 'Client.Opponent'], ['Host.Game.Countdown', 'Client.Game.Countdown']]) {
  for (const d of ['host', 'client']) if (Engine.canFire(at(h, c, friend), `${d}.cancelReady`)) fail(`${h} / ${c} で ${d}.cancelReady の行がある (U53)`);
}
// U54: ランダム対戦と再戦の開始前の切断。20 秒待ち、戻れば VS 画面から、戻らなければ取りやめ (勝敗なし)。ランダム対戦は Search again / Close
for (const [d, R, , O] of eachSideAll) {
  const side = (mine, theirs) => (d === 'host' ? [mine, theirs] : [theirs, mine]);
  const waiting = side(`${R}.Opponent.Disconnected`, `${O}.Opponent.OpponentDisconnected`);
  for (const [session, gone] of [[{ match: 'random', rated: true, rematch: false }, side(`${R}.Matchmake.ReconnectFailed`, `${O}.Matchmake.MatchCancelled`)],
    [{ match: 'random', rated: false, rematch: true }, side(`${R}.Matchmake.ReconnectFailed`, `${O}.Matchmake.MatchCancelled`)],
    [{ match: 'friend', rated: false, rematch: true }, side(`${R}.FriendMatch.Room.ReconnectFailed`, `${O}.FriendMatch.Room.MatchCancelled`)]]) {
    const w = at(...waiting, session);
    expectFire(w, 'net.recovered', 'Host.Opponent', 'Client.Opponent');
    const cancelled = expectFire(w, 'timer.disconnectTimeout', ...gone);
    if (cancelled && (ctx.isResultState(cancelled.host) || ctx.isResultState(cancelled.client))) fail('開始前の切断で結果画面へ行く (U54: 勝敗なし)');
    for (const ev of ['host.win', 'client.draw', 'host.matchMenu', 'net.bothDisconnected']) if (Engine.canFire(w, ev)) fail(`${pair(w)} で ${ev} の行がある`);
  }
  for (const name of waiting) {
    const sc = SCREENS[name];
    if (!sc || sc.view !== 'vs' || !sc.overlay || sc.timer !== 20 || !sc.decided.includes('U54')) fail(`${name} が残りの秒数付きの VS 画面 (決定 U54) でない`);
  }
  for (const [k, text] of [['MatchCancelled', 'Match cancelled. Opponent did not reconnect.'], ['ReconnectFailed', 'Could not reconnect. The match did not start.']]) {
    const name = `${R}.Matchmake.${k}`;
    const sc = SCREENS[name];
    if (!sc || sc.view !== 'online' || !sc.inlineNotice || sc.notice || sc.inlineNotice.text !== text ||
      sc.inlineNotice.buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Search again:searchAgain,Close:closeNotice') fail(`${name} が "${text}" と Search again / Close の Online Battle の中の通知でない`);
    const st = at(...side(name, `${O}.MultiModeSelection`));
    expectFire(st, `${d}.searchAgain`, ...side(`${R}.Matchmake`, `${O}.MultiModeSelection`));
    expectFire(st, `${d}.closeNotice`, ...side(`${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
    expectFire(st, `${d}.friendMatch`, ...side(`${R}.FriendMatch.Room`, `${O}.MultiModeSelection`));
  }
}
// U55: 離席中の帯は 2026-10-09 の U57 で無くなった (上の U57 の確認)
// pi の仮定 3 (2026-10-08 に確認): 部屋での切断 (U5) の再接続待ちの間は Match Code の期限の時計が止まらない
expectFire(at(L('Host', 'FriendDisconnected'), L('Client', 'ConnectionLost')), 'timer.codeExpired', L('Host', 'CodeExpired'), L('Client', 'ConnectionLost'));
expectFire(at(L('Host', 'ConnectionLost'), L('Client', 'FriendDisconnected')), 'timer.codeExpired', L('Host', 'ConnectionLost'), L('Client', 'CodeExpired'));
expectFire(at(L('Host', 'CodeExpired'), L('Client', 'ConnectionLost')), 'net.recovered', L('Host', 'CodeExpired'), L('Client', 'CodeExpired'));
expectFire(at(L('Host', 'ConnectionLost'), L('Client', 'CodeExpired')), 'net.recovered', L('Host', 'CodeExpired'), L('Client', 'CodeExpired'));
// pi の仮定 1 (ホストの ‹ は確認を出さない) は 2026-10-09 の U57 で変わった (ホストの ‹ は "Close this room?"。上の U57 の確認)。
// 仮定 5: Online Battle へ戻るボタンは降参のあとも "Back to Online"
if (/Back to Online Battle/.test(shownText + appJs)) fail('"Back to Online Battle" が残っている (すべて "Back to Online")');
console.log('ok  U44〜U55 (2026-10-08): 時間切れの決着、再戦なし、切断で止める 20 秒、次の相手の検索停止、Rating、ミュート、再戦の一行、部屋のお知らせ、開始前の切断の取りやめ');

// 決定 U56 (高宮さん 2026-10-08): Profile。相手に見せる絵文字とあいさつを 10 個ずつの候補から 1 つずつ選ぶ
{
  const { PROFILE_EMOJIS, PROFILE_GREETINGS, PROFILE_DEFAULT, PLAYERS, ProfileStore } = ctx;
  const u56 = UNDECIDED.find((u) => u.id === 'U56');
  if (!u56 || !u56.decided || u56.decided.by !== '高宮さん' || u56.decided.date !== '2026-10-08') fail('U56 (Profile) が 高宮さん 2026-10-08 の決定になっていない');
  if (UNDECIDED.some((u) => !u.decided)) fail('Profile を足して未決ができた (期待: 0 件)');
  // 候補 (内容と順番、10-08 に 5・6・7・10 番目を変えた)。アポストロフィはどれも ’ (U+2019)
  const EMOJIS = ['\u{1F44B}', '\u{1F642}', '\u{1F60E}', '\u{1F916}', '\u{1F9E0}', '\u269B\uFE0F', '\u{1F52C}', '\u{1F31F}', '\u{1F340}', '\u{1F680}'];
  const GREETINGS = ['Hello!', 'Let\u2019s go!', 'Have fun!', 'Good luck!', 'Let\u2019s do this!', 'Bring it on!', 'Ready?', 'Here we go!', 'Happy puzzling!', 'May the best player win!'];
  if (PROFILE_EMOJIS.map((e) => e.emoji).join('|') !== EMOJIS.join('|')) fail(`絵文字の候補が ${PROFILE_EMOJIS.map((e) => e.emoji).join(' ')} (期待: ${EMOJIS.join(' ')})`);
  if (PROFILE_GREETINGS.map((g) => g.text).join('|') !== GREETINGS.join('|')) fail(`あいさつの候補が ${PROFILE_GREETINGS.map((g) => g.text).join(' / ')}`);
  for (const list of [PROFILE_EMOJIS, PROFILE_GREETINGS]) if (new Set(list.map((x) => x.id)).size !== 10) fail('候補の id が 10 個そろっていない');
  for (const e of PROFILE_EMOJIS) if (!/^[A-Z][a-z ]+$/.test(e.name)) fail(`絵文字 ${e.emoji} の読み上げ名が英語でない (${e.name})`);
  // 既定値は全員 👋 "Hello!"。相手の役 (ogwssk 😎 "Let’s go!") は前からの値のまま。名前は変えられず、ほかの名前は足さない
  if (PROFILE_DEFAULT.emoji !== EMOJIS[0] || PROFILE_DEFAULT.greeting !== 'Hello!') fail('既定値が 👋 "Hello!" でない');
  const init = Engine.initialState();
  if (`${init.hostEmoji} ${init.hostGreeting}` !== `${EMOJIS[0]} Hello!`) fail(`ホストの最初の値が ${init.hostEmoji} ${init.hostGreeting}`);
  if (`${init.clientEmoji} ${init.clientGreeting}` !== '\u{1F60E} Let\u2019s go!') fail(`クライアント (ogwssk) の最初の値が ${init.clientEmoji} ${init.clientGreeting}`);
  if (JSON.stringify(PLAYERS) !== JSON.stringify({ host: { name: 'Yasuhito' }, client: { name: 'ogwssk', emoji: '\u{1F60E}', greeting: 'Let\u2019s go!' } })) fail(`PLAYERS が ${JSON.stringify(PLAYERS)}`);
  // アポストロフィは ’ (U+2019) だけ: 候補、ホストの既定値、相手 (ogwssk) の値、どのシナリオの VS 画面のあいさつにも ' (U+0027) が無い
  const straight = (t) => typeof t === 'string' && t.includes("'");
  for (const t of PROFILE_GREETINGS.map((g) => g.text).concat(PROFILE_DEFAULT.greeting, PLAYERS.client.greeting)) if (straight(t)) fail(`あいさつ ${t} にまっすぐな ' がある (’ にそろえる)`);
  if (!PROFILE_GREETINGS.some((g) => g.text.includes('\u2019'))) fail('あいさつの候補に ’ が 1 つも無い');
  let vsGreetings = 0;
  for (const sc of SCENARIOS) {
    for (let n = 0; n <= sc.steps.length; n++) {
      const st = Engine.replay(sc, n).state;
      for (const d of Engine.DEVICES) {
        if (!SCREENS[st[d]] || SCREENS[st[d]].view !== 'vs') continue;
        for (const who of Engine.DEVICES) {
          vsGreetings++;
          if (straight(st[who + 'ShownGreeting'])) fail(`シナリオ ${sc.id} 手順 ${n}: VS 画面のあいさつ ${st[who + 'ShownGreeting']} にまっすぐな '`);
        }
      }
    }
  }
  if (vsGreetings === 0) fail('VS 画面のあいさつを 1 つも確かめていない');
  // 10-08 に入れ替えた前の 4 つのあいさつ (と id) はどこにも残さない。このファイル自身にも書かないよう、かけらから組み立てる
  const apos = "(\\\\u2019|\u2019|')";
  const OLD_GREETINGS = new RegExp([
    ['Let', apos, 's sol', 've this'], ['Let', apos, 's try our', ' best'], ['Ready when', ' you are'], ['A fair', ' match'],
    ['lets', 'SolveThis'], ['lets', 'TryOurBest'], ['ready', 'WhenYouAre'], ['fair', 'Match'],
  ].map((parts) => parts.join('')).join('|'), 'i');
  for (const f of ['index.html', 'README.md', ...fs.readdirSync(path.join(__dirname, '..', 'js')).map((n) => `js/${n}`)]) {
    const m = read(f).match(OLD_GREETINGS);
    if (m) fail(`${f} に前のあいさつ ${m[0]} が残っている`);
  }
  if (/PLAYERS\[[^\]]+\]\.(emoji|greeting)|\bp\.(emoji|greeting)/.test(appJs)) fail('app.js が絵文字とあいさつを PLAYERS から読んでいる (保存した値・固定した値を使う)');

  // 開けるのは Online Battle (と、その中の通知を出している間) だけ。探している間・部屋・対戦中には行もボタンも無い
  for (const [d, R, O] of [['host', 'Host', 'Client'], ['client', 'Client', 'Host']]) {
    const openable = [`${R}.MultiModeSelection`, `${R}.Matchmake.Stopped`, `${R}.Matchmake.MatchCancelled`, `${R}.Matchmake.ReconnectFailed`];
    const others = [`${O}.MultiModeSelection`, `${O}.Profile`, L(O, 'Ready'), `${O}.Game.Play`, `${O}.Matchmake`];
    for (const name of Object.keys(SCREENS).filter((n) => n.startsWith(R + '.'))) {
      for (const o of others) {
        const st = d === 'host' ? at(name, o) : at(o, name);
        const ok = Engine.canFire(st, `${d}.profile`);
        if (ok !== openable.includes(name)) fail(`${name} (相手 ${o}) で Profile の行が ${ok ? 'ある' : '無い'}`);
      }
      const hasButton = (SCREENS[name].items || []).some((it) => it.event === 'profile');
      if (hasButton !== (SCREENS[name].view === 'online')) fail(`${name} の Profile のボタンが ${hasButton ? 'ある' : '無い'}`);
    }
    for (const r of TRANSITIONS.filter((x) => x.event === `${d}.profile`)) {
      if (states(r.from[d]).join() !== openable.join() || r.to[d] !== `${R}.Profile`) fail(`${r.id}: Profile を開く行が ${states(r.from[d]).join()} → ${r.to[d]}`);
    }
    // Profile 画面の操作は、絵文字 10 個・あいさつ 10 個・Save・Cancel・‹ だけ。どれも Online Battle かこの画面のまま
    const fromProfile = TRANSITIONS.filter((r) => states(r.from[d]).includes(`${R}.Profile`)).map((r) => r.event.slice(d.length + 1));
    const want = PROFILE_EMOJIS.map((e) => `pickEmoji.${e.id}`).concat(PROFILE_GREETINGS.map((g) => `pickGreeting.${g.id}`), ['saveProfile', 'cancelProfile', 'back']);
    if (fromProfile.join() !== want.join()) fail(`${R}.Profile の操作が ${fromProfile.join(', ')}`);
    if (SCREENS[`${R}.Profile`].back !== 'back' || SCREENS[`${R}.Profile`].view !== 'profile') fail(`${R}.Profile の ‹ が無い`);
    // 見本は選ぶたびに変わる (Draft)。Save で保存し、Cancel と ‹ は捨てる。保存した値で次に開く
    const open = (st) => Engine.fire(st, `${d}.profile`);
    let st = Engine.initialState();
    const pick = (s, e, g) => [`${d}.pickEmoji.${e}`, `${d}.pickGreeting.${g}`].reduce((x, ev) => { const r = Engine.fire(x, ev); if (!r) fail(`${ev} の行が無い`); return r ? r.state : x; }, s);
    const before = `${st[d + 'Emoji']} ${st[d + 'Greeting']}`;
    let o = open(st).state;
    if (`${o[d + 'DraftEmoji']} ${o[d + 'DraftGreeting']}` !== before) fail(`${R}.Profile を開いたときの見本が保存した値でない`);
    o = pick(o, 'robot', 'goodLuck');
    if (`${o[d + 'DraftEmoji']} ${o[d + 'DraftGreeting']}` !== '\u{1F916} Good luck!' || `${o[d + 'Emoji']} ${o[d + 'Greeting']}` !== before) fail(`${R}.Profile で選んでも見本が変わらないか、保存前に保存した値が変わる`);
    for (const ev of ['cancelProfile', 'back']) {
      const c = Engine.fire(o, `${d}.${ev}`).state;
      if (c[d] !== `${R}.MultiModeSelection` || `${c[d + 'Emoji']} ${c[d + 'Greeting']}` !== before || c[d + 'DraftEmoji'] !== null) fail(`${R}.Profile の ${ev} で捨てられない`);
    }
    const saved = Engine.fire(o, `${d}.saveProfile`).state;
    if (saved[d] !== `${R}.MultiModeSelection` || `${saved[d + 'Emoji']} ${saved[d + 'Greeting']}` !== '\u{1F916} Good luck!') fail(`${R}.Profile の Save で保存されない`);
    if (`${open(saved).state[d + 'DraftEmoji']}` !== '\u{1F916}') fail(`${R}.Profile をもう一度開くと保存した値から始まらない`);
  }

  // 値を固定するのは部屋を作る・入る・相手を探し始めるとき。変えたものが相手に見えるのは次の部屋・次の検索から
  const run = (st, evs, where) => evs.reduce((s, ev) => { if (!s) return s; const r = Engine.fire(s, ev); if (!r) fail(`${where}: ${ev} の行が無い (${s.host} / ${s.client})`); return r && r.state; }, st);
  const shown = (st, d) => st && `${st[d + 'ShownEmoji']} ${st[d + 'ShownGreeting']}`;
  const sc1 = SCENARIOS.find((x) => x.id === '1');
  let room = Engine.replay(sc1, 6).state; // 両者が Ready 画面
  // 部屋にいる間に (ほかのタブなどで) 保存した値が変わっても、この部屋で相手に見えるのは部屋に入ったときの値
  room = Object.assign({}, room, { hostEmoji: '\u{1F680}', hostGreeting: 'Bring it on!', clientEmoji: '\u{1F340}', clientGreeting: 'Have fun!' });
  let vs = run(room, sc1.steps.slice(6, 11), '固定');
  if (!vs || vs.host !== 'Host.Opponent' || shown(vs, 'host') !== `${EMOJIS[0]} Hello!` || shown(vs, 'client') !== '\u{1F60E} Let\u2019s go!') fail(`部屋に入ったあとに変えた値が、その部屋の VS 画面に出る (${shown(vs, 'host')} / ${shown(vs, 'client')})`);
  // 次の部屋 (ホストが作る・クライアントが入る) から新しい値
  let next = run(vs, ['vs.done', 'game.countdownDone', 'host.win', 'host.backToFriendMatch', 'client.backToFriendMatch'], '次の部屋');
  if (next && shown(next, 'host') !== `${EMOJIS[0]} Hello!`) fail('結果画面を抜けただけで固定した値が変わる');
  next = run(next, ['host.createMatch'], '次の部屋');
  if (shown(next, 'host') !== '\u{1F680} Bring it on!' || shown(next, 'client') !== '\u{1F60E} Let\u2019s go!') fail(`次の部屋を作っても新しい値にならない (${shown(next, 'host')} / ${shown(next, 'client')})`);
  next = run(next, ['client.enterCode', 'client.joinMatch'], '次の部屋');
  if (shown(next, 'client') !== '\u{1F340} Have fun!') fail(`次の部屋に入っても新しい値にならない (${shown(next, 'client')})`);
  // 次の検索から: 保存しただけでは変わらず、Random Match / Search again / Find Next Opponent で新しい値
  let srch = run(Engine.initialState(), ['host.profile', 'host.pickEmoji.robot', 'host.saveProfile'], '検索');
  if (srch && srch.hostShownEmoji !== null) fail('検索の前に相手に見せる値が決まっている');
  srch = run(srch, ['host.randomMatch'], '検索');
  if (srch && srch.hostShownEmoji !== '\u{1F916}') fail('Random Match で値が固定されない');
  srch = run(srch, ['host.leaveApp', 'host.profile', 'host.pickEmoji.star', 'host.saveProfile'], '検索');
  if (srch && srch.hostShownEmoji !== '\u{1F916}') fail('探していないときに保存しただけで、相手に見せる値が変わる');
  srch = run(srch, ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'], '検索');
  if (shown(srch, 'host') !== '\u{1F31F} Hello!') fail(`次の検索で新しい値にならない (${shown(srch, 'host')})`);
  srch = Object.assign({}, run(srch, ['vs.done', 'game.countdownDone', 'client.win'], '検索'), { hostEmoji: '\u{1F9E0}' });
  const nextOpp = run(srch, ['host.findNextOpponent'], '検索');
  if (nextOpp && nextOpp.hostShownEmoji !== '\u{1F9E0}') fail('Find Next Opponent で値が固定されない');
  const rematch = run(srch, ['host.rematch', 'client.rematch'], '再戦');
  if (rematch && rematch.hostShownEmoji !== '\u{1F31F}') fail('同じ相手との再戦で固定した値が変わる (次の部屋・次の検索ではない)');
  // 固定する行の一覧: イベントが部屋を作る・入る・探し始めるもので、行き先が部屋の画面か相手を探す画面 (失敗や Match Code の誤りの行には無い)
  for (const r of TRANSITIONS) {
    const d = Engine.deviceOf(r.event);
    const copies = !!(r.copy && r.copy[d + 'ShownEmoji']);
    const want = d !== null && /\.(createMatch|dialog\.createMatch|joinMatch|randomMatch|searchAgain|findNextOpponent)$/.test(r.event) &&
      /\.(FriendMatch\.Lobby\.|Matchmake$|Matchmake\.NextOpponent$)/.test(r.to[d]);
    if (copies !== want) fail(`${r.id} (${r.event} → ${r.to[d]}): 相手に見せる値を${copies ? '固定する' : '固定しない'}`);
    if (copies && !r.decided.includes('U56')) fail(`${r.id}: 値を固定する行に決定 U56 が無い`);
  }
  // どのシナリオでも、相手と向き合う画面 (VS・ゲーム・結果) では両者の値が決まっている
  for (const sc of SCENARIOS) {
    for (let n = 0; n <= sc.steps.length; n++) {
      const st = Engine.replay(sc, n).state;
      for (const d of Engine.DEVICES) if (ctx.isWithOpponent(st[d]) && (!st[d + 'ShownEmoji'] || !st[d + 'ShownGreeting'] || !st[d === 'host' ? 'clientShownEmoji' : 'hostShownEmoji'])) fail(`シナリオ ${sc.id} 手順 ${n}: ${st[d]} で相手に見せる値が決まっていない`);
    }
  }

  // シナリオ 22: 変えて Save → ランダム対戦の VS 画面に出る。スタンプをミュートして再戦しても VS 画面のあいさつは出る (U49 はスタンプだけ)
  const sc22 = SCENARIOS.find((x) => x.id === '22');
  const vs22 = sc22 && Engine.replay(sc22, 7).state;
  if (!vs22 || vs22.host !== 'Host.Opponent' || shown(vs22, 'host') !== '\u{1F680} Bring it on!' || shown(vs22, 'client') !== '\u{1F60E} Let\u2019s go!') fail(`シナリオ 22 の VS 画面が ${vs22 && shown(vs22, 'host')}`);
  const end22 = sc22 && Engine.replay(sc22);
  if (!end22 || end22.failedAt !== -1 || end22.state.client !== 'Client.Opponent' || !end22.state.clientMute || shown(end22.state, 'host') !== '\u{1F680} Bring it on!') fail('シナリオ 22 の最後がミュートしたままの再戦の VS 画面 (ホストのあいさつ付き) でない');
  if (/Mute/.test(appJs.slice(appJs.indexOf('    vs: function'), appJs.indexOf('    // ゲーム画面のプレースホルダー')))) fail('VS 画面の描画がミュートを見ている (あいさつはミュートで隠さない)');
  if (STAMPS.map((x) => `${x.emoji} ${x.text}`).join(' / ') !== '\u{1F44F} Good game / \u{1F91D} Thanks for the match / \u{1F44D} Nice') fail('結果画面のスタンプ (U27) が変わった');
  const sc22b = SCENARIOS.find((x) => x.id === '22b');
  const end22b = sc22b && Engine.replay(sc22b).state;
  if (!end22b || end22b.host !== 'Host.MultiModeSelection' || `${end22b.hostEmoji} ${end22b.hostGreeting}` !== `${EMOJIS[0]} Hello!`) fail('シナリオ 22b の Cancel / ‹ で値が変わる');

  // localStorage: モックの名前で区切ったキーに保存し、読み直す (新しく開いたアプリ) と同じ値。壊れた値・候補に無い値は最初の値に戻す
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  if (!/^qa2-match-mock\./.test(ProfileStore.KEY)) fail(`localStorage のキー ${ProfileStore.KEY} がモックの名前で区切られていない`);
  const fresh = ProfileStore.load(storage);
  if (JSON.stringify(fresh) !== JSON.stringify({ host: { emoji: EMOJIS[0], greeting: 'Hello!' }, client: { emoji: '\u{1F60E}', greeting: 'Let\u2019s go!' } })) fail(`何も保存していないときの値が ${JSON.stringify(fresh)}`);
  const savedState = run(Engine.initialState(ctx.Engine.defaultCtx(), fresh), ['host.profile', 'host.pickEmoji.rocket', 'host.pickGreeting.happyPuzzling', 'host.saveProfile'], '保存');
  ProfileStore.save(storage, { host: { emoji: savedState.hostEmoji, greeting: savedState.hostGreeting }, client: { emoji: savedState.clientEmoji, greeting: savedState.clientGreeting } });
  const reopened = Engine.initialState(Engine.defaultCtx(), ProfileStore.load(storage));
  if (`${reopened.hostEmoji} ${reopened.hostGreeting}` !== '\u{1F680} Happy puzzling!' || reopened.clientEmoji !== '\u{1F60E}') fail(`保存して開き直した値が ${reopened.hostEmoji} ${reopened.hostGreeting}`);
  const opened = Engine.fire(reopened, 'host.profile').state;
  if (`${opened.hostDraftEmoji} ${opened.hostDraftGreeting}` !== '\u{1F680} Happy puzzling!') fail('開き直したあとの Profile の見本が保存した値でない');
  for (const bad of ['{', 'null', JSON.stringify({ host: { emoji: 'X', greeting: 'Hello!' } }), JSON.stringify({ host: { emoji: EMOJIS[1], greeting: 'Hi!' } })]) {
    mem.set(ProfileStore.KEY, bad);
    if (ProfileStore.load(storage).host.emoji !== EMOJIS[0]) fail(`壊れた値 ${bad} で最初の値に戻らない`);
  }
  // シナリオは localStorage に関係なく、いつも最初の値から (Engine.replay は保存した値を受け取らない)
  if (Engine.replay(sc22, 0).state.hostEmoji !== EMOJIS[0]) fail('シナリオが最初の値から始まらない');
  if (!/if \(app\.scenario \|\| !storage\) return;/.test(appJs)) fail('app.js がシナリオの再生中にも localStorage に書く');
  console.log('ok  U56 (2026-10-08): Profile の候補 10 + 10 (アポストロフィは ’)・既定値 👋 "Hello!"・Online Battle からだけ開ける・Save / Cancel / ‹・次の部屋と次の検索から相手に見える・localStorage・ミュートでもあいさつは出る');
}

const unused = TRANSITIONS.filter((r) => !used.has(r.id));
console.log(`\n遷移表 ${TRANSITIONS.length} 行のうち ${used.size} 行をシナリオで再生 (残り ${unused.length} 行は自由操作で到達)`);

if (errors.length) {
  console.error('\nNG');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\nすべてのシナリオが遷移表どおりに最後まで再生できました');
