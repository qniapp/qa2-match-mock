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
const { TRANSITIONS, SCREENS, DIALOGS, UNDECIDED, SCENARIOS, EVENT_LABELS, TOASTS, GAME_COUNTDOWN_MS, MATCH_MENU, Engine } = ctx;
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
  'sys.peerConnected', 'sys.readyScreen', 'net.unstable', 'net.lost', 'host.cancelMatch', 'client.leaveMatch',
  'client.dialog.goBack', 'host.dialog.stay',
  // 2026-10-10 (U57): Close Room / Leave Room のボタンと、部屋を残す離席 (帯・"Your friend left."・作り直しの確認) は無くなった
  'host.closeRoom', 'host.leaveRoom', 'client.leaveRoom', 'host.dialog.leaveRoom', 'host.joinMatch', 'host.dialog.createMatch', 'host.dialog.joinMatch',
  'host.dialog.keepCurrent', 'sys.friendLeftShown',
  // 2026-10-17 (U63、#1891 の FB 19): 確認の Close Room / Leave Room / クライアントの Keep Waiting は Cancel Match / Leave / Stay に。
  // (Cancel Match / Leave / Stay は SPEC15 で一度消した名前だが、U63 で文言ごと戻したので古いイベントからは外した)
  'host.dialog.closeRoom', 'client.dialog.leaveRoom', 'client.dialog.keepWaiting'];
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
// U63 (#1891 の FB 19・20): 画面に "Room" / "room" を出さない (Close / Leave Room、"Close this room?"、"Room closed…" など)。
// 見つからない・期限切れの赤字は 1 つにまとめたので、以前の 2 つの文言も出さない
const OLD_TEXTS = /Start Match|Ready to start|Stay in Room|Go Back|Match expired\.|Unable to start|Check the Match Code and try again|The match has expired|Create Match/;
if (OLD_TEXTS.test(shownText + read('js', 'app.js'))) fail(`画面に古い文言 (${(shownText + read('js', 'app.js')).match(OLD_TEXTS)[0]}) が残っている`);
{
  // 状態名 (Client.FriendMatch.Room など) と CSS のクラス名 (room-notice) は画面に出ないので除く
  const visible = JSON.stringify([Object.values(SCREENS), DIALOGS, TOASTS, ctx.REMATCH_STATUS, ctx.ROOM_NOTICES], (k, v) => (k === 'context' ? undefined : v)) +
    read('js', 'app.js').replace(/room-notice/g, '');
  const m = visible.match(/\broom\b/i);
  if (m) fail(`画面に "${m[0]}" が残っている (U63: "Room" とは書かない)`);
}
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
  // U57 / U9 / U11 / U34: クライアントの ‹ は "Leave this match?"。Keep Waiting で残り (Ready はそのまま)、Leave Room で抜ける
  const leave = Engine.fire(s2, 'client.back');
  if (!leave || leave.state.clientDialog !== 'leaveMatch' || leave.state.client !== s2.client) fail(`${pair(s2)} で client.back が "Leave this match?" にならない`);
  else {
    const stay = Engine.fire(leave.state, 'client.dialog.stay');
    if (!stay || pair(stay.state) !== pair(s2) || stay.state.clientDialog !== null) fail('クライアントの Keep Waiting で部屋に残らない');
    expectFire(leave.state, 'client.dialog.leaveMatch', 'Host.FriendMatch.Lobby.ClientLeft', 'Client.FriendMatch.Room');
  }
  // U57: ホストの ‹ は "Cancel this match?" → 閉じる。Keep Waiting で残る
  const close = Engine.fire(s2, 'host.back');
  if (!close || close.state.hostDialog !== 'cancelMatch' || close.state.host !== s2.host) fail(`${pair(s2)} で host.back が "Cancel this match?" にならない`);
  else {
    const stay = Engine.fire(close.state, 'host.dialog.keepWaiting');
    if (!stay || pair(stay.state) !== pair(s2) || stay.state.hostDialog !== null) fail('ホストの Keep Waiting で部屋に残らない');
    expectFire(close.state, 'host.dialog.cancelMatch', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.HostLeft');
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
// U36 / U4 / U5 / U57: 部屋の画面の表示 (カード、状況の一行、再接続のカウントダウン、ボタン、‹)。部屋を出るボタン (Close Room / Leave Room) は無く、出口は ‹ だけ。
// ‹ を押せないのは、送っている間・読み込み・自分の再接続中 (U53)
const btns = (s) => s.buttons.map((b) => b.label + (b.disabled ? '(無効)' : '')).join(' / ');
const roomWant = (R) => ({
  Ready: [false, false, null, null, 'Ready', 'back'],
  'Ready.Confirming': [false, false, null, null, 'Confirming…(無効)', 'disabled'],
  'Ready.WaitingForOpponent': [true, false, 'Waiting for opponent…', null, 'Cancel Ready', 'back'],
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
    // #1891 の FB 6: 自分だけ Ready で待つ間は秒数を出さず、待っている印 (点の動き) だけを出す
    if (!!s.dots !== (k === 'Ready.WaitingForOpponent')) fail(`${L(R, k)} の待っている印が ${s.dots ? 'ある' : '無い'} (FB 6: Waiting for opponent… にだけ出す)`);
    if (s.codeHint !== (R === 'Host')) fail(`${L(R, k)} の "${ctx.CODE_HINT}" が ${s.codeHint ? 'ある' : '無い'} (U58: ホストにだけ出す)`);
  }
  const cnr = SCREENS[L(R, 'CouldNotReconnect')];
  if (!cnr || cnr.status !== 'Could not reconnect.' || btns(cnr) !== 'Retry' || cnr.back !== 'back' || cnr.codeHint || cnr.cards) fail(`${L(R, 'CouldNotReconnect')} が "Could not reconnect." と Retry / ‹ でない (U5 / U57)`);
  const exp = SCREENS[L(R, 'CodeExpired')];
  if (!exp || exp.status !== 'Match code expired.' || btns(exp) !== (R === 'Host' ? 'New Match' : 'Join Match') || exp.codeHint || exp.cards) fail(`${L(R, 'CodeExpired')} が "Match code expired." と ${R === 'Host' ? 'New Match' : 'Join Match'} だけでない (U7 / U10)`);
}
for (const k of ['Waiting', 'ClientLeft', 'MatchCancelled']) {
  const s = SCREENS[L('Host', k)];
  if (btns(s) !== '' || s.back !== 'back' || !s.codeHint) fail(`${L('Host', k)} にボタンがあるか、‹ か "${ctx.CODE_HINT}" が無い (U57 / U58)`);
}
// U57: どの画面にも Close Room / Leave Room のボタンは無い (確認ダイアログのボタンにだけある)
for (const [name, s] of Object.entries(SCREENS)) {
  const labels = (s.buttons || []).map((b) => b.label);
  if (labels.some((l) => /^(Close|Leave) Room$/.test(l))) fail(`${name} に ${labels.join(' / ')} のボタンがある (U57: 出口は ‹ だけ)`);
}
if (!/\\u2713 Ready/.test(appJs) || !/Not ready/.test(appJs) || !/rd-card/.test(appJs) || !/rd-timer/.test(appJs) || !/s\.dots/.test(appJs)) fail('app.js に Ready 画面のカード ("✓ Ready" / "Not ready")・再接続のカウントダウン・待っている印の描画が無い');
// U58: Match Code の期限は画面に出さず、ホストにだけ "Share this code with your friend!"。クライアントの画面には出さない
if (!/CODE_HINT/.test(appJs) || ctx.CODE_HINT !== 'Share this code with your friend!') fail('部屋の画面に "Share this code with your friend!" (U58) が無い');
if ('CODE_EXPIRY' in ctx || /expires in/i.test(appJs) || Object.values(SCREENS).some((s) => 'expiry' in s)) fail('部屋の画面に Match Code の期限の表示が残っている (U58)');
for (const [name, s] of Object.entries(SCREENS)) if (s.codeHint && !name.startsWith('Host.FriendMatch.Lobby.')) fail(`${name} に "${ctx.CODE_HINT}" がある (U58: ホストの部屋の画面だけ)`);
{
  const u58 = UNDECIDED.find((u) => u.id === 'U58');
  if (!u58 || !u58.decided || !/YoshiyukiN/.test(u58.decided.by) || u58.decided.date !== '2026-10-10' || !/#1891/.test(u58.desc)) fail('U58 が #1891 の YoshiyukiN さんの FB (2026-10-10) の決定になっていない');
  if (!/U58/.test(UNDECIDED.find((u) => u.id === 'U7').desc)) fail('U7 の説明に、U58 で変わったことが無い');
}
const dlgWant = {
  leaveMatch: ['Leave this match?', 'No match has started. No win or loss will be recorded.', 'Leave / Stay'],
  cancelMatch: ['Cancel this match?', 'No match has started. No win or loss will be recorded.', 'Cancel Match / Keep Waiting'],
};
for (const [k, want] of Object.entries(dlgWant)) {
  const d = DIALOGS[k];
  const got = d && [d.title, d.body, d.buttons.map((b) => b.label).join(' / ')];
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`ダイアログ ${k} が ${JSON.stringify(want)} でない (${JSON.stringify(got)})`);
}
if (Object.keys(DIALOGS).join() !== 'cancelMatch,leaveMatch,profile') fail(`使わないダイアログが残っている (${Object.keys(DIALOGS)})`);
if ('ROOM_SWITCH_BODY' in ctx) fail('U12 の作り直しの確認の本文が残っている (U57 で無くなった)');
// #1891 の FB 5: Match Code のコピーのボタンはホストの部屋の画面にだけ。期限切れの画面には出さない。文字ではなくアイコンで、"Copy match code" の名前がある
for (const [name, s] of Object.entries(SCREENS)) {
  if (s.view !== 'lobby') continue;
  const want = name.startsWith('Host.') && !/\.CodeExpired$/.test(name);
  if (!!s.copyCode !== want) fail(`${name} の Match Code のコピーのボタンが ${s.copyCode ? 'ある' : '無い'} (#1891 FB 5: ホストにだけ。期限切れには無い)`);
}
if (!/class="copy" aria-label="Copy match code" title="Copy match code"' \+\s*attrs\(dev, 'copyCode'\) \+ '>' \+ COPY_ICON/.test(appJs) || !/var COPY_ICON = '<svg/.test(appJs) || />Copy</.test(appJs)) {
  fail('Match Code のコピーのボタンが "Copy match code" の名前付きのアイコンでないか、押しても copyCode を発火しない (#1891 FB 5 / U69)');
}
// U69 (#1891 の FB): コピーのボタンを押すと、画面はそのままで "Match code copied" のトースト。2 秒 (仮) か画面が変わると消える
{
  const copyable = Object.keys(SCREENS).filter((n) => SCREENS[n].copyCode);
  for (const name of Object.keys(SCREENS).filter((n) => n.startsWith('Host.'))) {
    const st = at(name, 'Client.MultiModeSelection');
    const res = Engine.fire(st, 'host.copyCode');
    if (!!res !== copyable.includes(name)) fail(`${name} で Match Code のコピーの行が${res ? 'ある' : '無い'} (コピーのボタンと合わない)`);
    if (res && (res.state.host !== name || res.state.hostToast !== 'codeCopied')) fail(`${name} のコピーで画面が変わるか、トーストが出ない`);
  }
  if (TOASTS.codeCopied.text !== 'Match code copied' || TOASTS.codeCopied.tap) fail('コピーのトーストが "Match code copied" (タップでは何もしない) でない');
  const copied = Engine.fire(at('Host.FriendMatch.Lobby.Waiting', 'Client.MultiModeSelection'), 'host.copyCode').state;
  const hidden = Engine.nextAuto(copied);
  if (!hidden || hidden.event !== 'toast.hidden' || hidden.auto !== 2000) fail('コピーのトーストが 2 秒 (仮) の自動遷移で消えない');
  else if (Engine.fire(copied, 'toast.hidden').state.hostToast !== null) fail('toast.hidden でトーストが消えない');
  const joined = Engine.fire(Engine.fire(copied, 'client.friendMatch').state, 'client.openJoin');
  const moved = joined && Engine.fire(Engine.fire(joined.state, 'client.enterCode').state, 'client.joinMatch');
  if (!moved || moved.state.host !== 'Host.FriendMatch.Lobby.FriendJoined' || moved.state.hostToast !== null) fail('画面が変わってもコピーのトーストが消えない');
  if (!/spec\.toast \|\| app\.state\[dev \+ 'Toast'\]/.test(appJs)) fail('app.js が画面によらないトースト (付属状態の Toast) を描かない');
}
console.log('ok  U31 / U33〜U36 / U4 / U9 / U11 / U57: Ready (Confirming → Waiting for opponent / Opponent is ready)、Cancel Ready、アプリを離れる、60 秒のタイムアウト (秒数は出さず待っている印だけ、FB 6)、‹ の確認 (Cancel this match? / Leave this match?) (両端末)');
console.log('ok  U58: 部屋の画面に Match Code の期限を出さず、ホストにだけ "Share this code with your friend!" (クライアント・期限切れ・Could not reconnect. には無い)');
console.log('ok  #1891 FB 5 / U69: Match Code のコピーのボタンはホストにだけ (アイコン、"Copy match code")。クライアントと期限切れの画面には無く、押すと "Match code copied" のトースト (2 秒か画面が変わると消える)');

// 決定 (U4): Ready を押せるのは参加の確認・両者が部屋の画面・同期の 3 つがそろってから。決まった待ち時間は置かない
{
  const joined = expectFire(at(L('Host', 'Waiting'), 'Client.FriendMatch.Room.Join.CodeEntered'), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
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
  // U52: ホストが戻らなかったとき、クライアントは "The match was canceled." の Friend Match トップ
  const theirsAfter = O === 'Host' ? L('Host', 'Waiting') : 'Client.FriendMatch.Room.RoomClosed';
  const gone = expectFire(w, 'timer.disconnectTimeout', ...side(L(R, 'CouldNotReconnect'), theirsAfter));
  if (gone) {
    const retry = expectFire(gone, `${d}.retry`, ...side(L(R, 'ConnectionLost'), theirsAfter));
    // Retry でつながる: クライアントは空のまま残っていた部屋に入り直し ("Friend joined!")、ホストは空の部屋に戻る
    if (retry) expectFire(retry, 'net.recovered', ...(d === 'client' ? [L('Host', 'FriendJoined'), L('Client', 'Connecting')] : [L('Host', 'Waiting'), 'Client.FriendMatch.Room.RoomClosed']));
    if (retry) expectFire(retry, 'timer.disconnectTimeout', ...side(L(R, 'CouldNotReconnect'), theirsAfter));
    // U57: "Could not reconnect." の出口も ‹ (ホストは "Cancel this match?"、クライアントは "Leave this match?")
    const dlg = d === 'host' ? 'cancelMatch' : 'leaveMatch';
    const leave = Engine.fire(gone, `${d}.back`);
    if (!leave || leave.state[`${d}Dialog`] !== dlg) fail(`${L(R, 'CouldNotReconnect')} の ‹ が ${dlg} の確認にならない`);
    else expectFire(leave.state, `${d}.dialog.${dlg}`, ...side(d === 'host' ? 'Host.FriendMatch.Room' : 'Client.FriendMatch.Room', theirsAfter));
  }
  // 残った側も ‹ で部屋を出られる (ホストは閉じる、クライアントは抜ける)。切れた側は戻ったときに結果を見る
  if (o === 'host') {
    const c = Engine.fire(w, 'host.back');
    if (!c || c.state.hostDialog !== 'cancelMatch') fail(`${pair(w)} で host.back が "Cancel this match?" にならない`);
    else expectFire(c.state, 'host.dialog.cancelMatch', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.HostLeft');
  } else {
    const c = Engine.fire(w, 'client.back');
    if (!c || c.state.clientDialog !== 'leaveMatch') fail(`${pair(w)} で client.back が "Leave this match?" にならない`);
    else expectFire(c.state, 'client.dialog.leaveMatch', L('Host', 'ClientLeft'), 'Client.FriendMatch.Room');
  }
  for (const ev of Object.keys(EVENT_LABELS)) {
    const res = Engine.fire(w, ev);
    if (res && (ctx.isResultState(res.state.host) || ctx.isResultState(res.state.client))) fail(`部屋での切断 ${pair(w)} から ${ev} で結果画面へ行く`);
  }
}
// 部屋がもう無いので Friend Match トップに "The match was canceled." の帯 (U52。赤字は Join a Match の中にだけ出す、U63)
expectFire(at('Host.FriendMatch.Room', L('Client', 'ConnectionLost')), 'net.recovered', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.RoomClosed');
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
expectFire(at(L('Host', 'MatchCancelled'), 'Client.FriendMatch.Room.Join.CodeEntered'), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
expectFire(at(L('Host', 'ClientLeft'), 'Client.FriendMatch.Room.Join.CodeEntered'), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
for (const r of TRANSITIONS) if (r.event === 'sys.resetWaiting' || (r.auto && [].concat(r.from.host).includes(L('Host', 'ClientLeft')))) fail(`${r.id}: "Your friend left…" から自動で進む`);
const roomTexts = { [L('Host', 'ClientLeft')]: 'Your opponent left the match.\nWaiting for another friend…', [L('Host', 'MatchCancelled')]: 'Match cancelled.\nOpponent did not reconnect.', [L('Host', 'Waiting')]: 'Waiting for your friend…' };
for (const [name, text] of Object.entries(roomTexts)) if (!SCREENS[name] || SCREENS[name].status !== text) fail(`${name} の表示が "${text}" でない`);
for (const [name, text] of [['Client.FriendMatch.Room.HostLeft', 'The host canceled the match.'], ['Client.FriendMatch.Room.HostDisconnected', 'The host disconnected. The match was canceled.']]) {
  const s = SCREENS[name];
  if (!s || s.view !== 'friendTop' || !s.roomNotice || s.roomNotice.text !== text || s.join) fail(`${name} が "${text}" の Friend Match トップ (Join a Match は閉じている) でない`);
}
// ゲーム本体のカウントダウンが終わったら (サーバーが確認したら) 試合開始。そこからは対戦中のルール (切断は 20 秒で負け、U28)
expectFire(at('Host.Game.Play', 'Client.Game.Play'), 'host.disconnect', 'Host.Game.Disconnected', 'Client.Game.OpponentDisconnected');
console.log('ok  U32 / U15: VS 画面・カウントダウン中の切断は Ready を消して 20 秒待つ (Match cancelled・The host disconnected. The match was canceled.)、読み込みは 20 秒で "Match could not start."、同期の失敗は "Couldn’t start the match."、勝敗なし (両端末)');

// 決定 U57 (YoshiyukiN さんの FB、#1891 の 1・2 番目、2026-10-10): 部屋の画面の出口は ‹ だけ。
// ホストの ‹ は "Cancel this match?" → 部屋を閉じる (クライアントは "The host canceled the match.")、クライアントの ‹ は "Leave this match?" → 部屋を抜ける。
// どちらも Keep Waiting で部屋に残る。部屋を残したまま別の画面へは移れない (以前の U14 の離席・帯 U1 / U16 / U19 / U55 と U12 の確認は無くなった)
{
  const u57 = UNDECIDED.find((u) => u.id === 'U57');
  if (!u57 || !u57.decided || !/YoshiyukiN/.test(u57.decided.by) || u57.decided.date !== '2026-10-10' || !/#1891/.test(u57.desc)) fail('U57 が #1891 の YoshiyukiN さんの FB (2026-10-10) の決定になっていない');
  for (const id of ['U1', 'U9', 'U12', 'U14', 'U16', 'U19', 'U34', 'U55']) if (!/U57/.test(UNDECIDED.find((u) => u.id === id).desc)) fail(`${id} の説明に、U57 で変わったことが無い`);
  // 部屋を残す離席が無い: 状態・帯・グループ・ステージ選択の画面・クライアントのカードの "Away"
  for (const name of Object.keys(SCREENS).concat(Object.keys(STATE_GROUPS))) if (/\.Away(\.|$)/.test(name)) fail(`離席の ${name} が残っている (U57)`);
  if (Object.keys(TOASTS).join() !== 'failedCreate,failedJoin,joinNotFound,joinFull,codeCopied') fail(`離席中の帯が残っている (${Object.keys(TOASTS)})`);
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
      if (r.to[d] !== '=' || !r.dialog || r.dialog[d] !== (d === 'host' ? 'cancelMatch' : 'leaveMatch')) fail(`${r.id}: ${from} の ‹ が確認 (${d === 'host' ? 'Cancel this match?' : 'Leave this match?'}) を出さない`);
    }
  }
  // ‹ を押せる部屋の画面はすべて確認を出し、Keep Waiting で同じ画面に残り、確定で閉じる / 抜ける (相手がどの状態でも)
  const backable = (R) => Object.keys(SCREENS).filter((n) => n.startsWith(`${R}.FriendMatch.Lobby.`) && SCREENS[n].back === 'back' && !/CodeExpired$/.test(n));
  const sorted = (list) => list.slice().sort().join();
  if (sorted(backable('Host')) !== sorted(STATE_GROUPS['Host.FriendMatch.Lobby.Closable'])) fail(`‹ を押せるホストの部屋の画面 (${backable('Host')}) と、確認を出す画面が合わない`);
  if (sorted(backable('Client')) !== sorted(STATE_GROUPS['Client.FriendMatch.Lobby.Leavable'])) fail(`‹ を押せるクライアントの部屋の画面 (${backable('Client')}) と、確認を出す画面が合わない`);
  for (const [d, R, , O, dlg] of [['host', 'Host', 'client', 'Client', 'cancelMatch'], ['client', 'Client', 'host', 'Host', 'leaveMatch']]) {
    for (const mine of backable(R)) {
      for (const theirs of [`${O}.MultiModeSelection`].concat(Object.keys(SCREENS).filter((n) => n.startsWith(`${O}.FriendMatch.Lobby.`)))) {
        const st = at(...(d === 'host' ? [mine, theirs] : [theirs, mine]));
        const res = Engine.fire(st, `${d}.back`);
        if (!res || res.state[`${d}Dialog`] !== dlg || res.state[d] !== mine || res.state[O.toLowerCase()] !== theirs) { fail(`${mine} / ${theirs} で ${d}.back が ${dlg} の確認にならない`); continue; }
        // 残るボタンはホストが Keep Waiting (U11)、クライアントが Stay (U63)
        const stay = Engine.fire(res.state, `${d}.dialog.${d === 'host' ? 'keepWaiting' : 'stay'}`);
        if (!stay || pair(stay.state) !== pair(st) || stay.state[`${d}Dialog`] !== null) fail(`${mine} / ${theirs} で ${d === 'host' ? 'Keep Waiting' : 'Stay'} のあと部屋に残らない`);
        const done = Engine.fire(res.state, `${d}.dialog.${dlg}`);
        if (!done) { fail(`${mine} / ${theirs} で ${dlg} を確定できない`); continue; }
        const wantMine = d === 'host' ? 'Host.FriendMatch.Room' : 'Client.FriendMatch.Room';
        if (done.state[d] !== wantMine || done.state[`${d}Dialog`] !== null) fail(`${mine} / ${theirs} で確定したあと ${done.state[d]} (期待: ${wantMine})`);
        // 相手の画面: ホストが閉じたら、部屋にいるクライアントは "The host canceled the match."。クライアントが抜けたら、部屋のホストは "Your friend left…"
        const inRoom = d === 'host' ? STATE_GROUPS['Client.FriendMatch.Lobby.InRoom'].includes(theirs) : STATE_GROUPS['Host.FriendMatch.Lobby.WithClient'].includes(theirs);
        const wantTheirs = inRoom ? (d === 'host' ? 'Client.FriendMatch.Room.HostLeft' : 'Host.FriendMatch.Lobby.ClientLeft') : theirs;
        if (done.state[O.toLowerCase()] !== wantTheirs) fail(`${mine} / ${theirs} で確定したあと相手が ${done.state[O.toLowerCase()]} (期待: ${wantTheirs})`);
      }
    }
  }
  // "Friend joined!" になるのは本当に入った・入り直したときだけ (U17)。結果画面から同じ部屋へ戻ってきたとき (U61) も入り直し
  for (const r of TRANSITIONS) {
    const toJoined = [].concat(r.to.host).some((s) => /\.FriendJoined$/.test(s)) && ![].concat(r.from.host).some((s) => /\.FriendJoined$/.test(s));
    if (toJoined && !['client.joinMatch', 'net.recovered', 'host.backToFriendMatch', 'client.backToFriendMatch'].includes(r.event)) fail(`${r.id}: ${r.event} で "Friend joined!" になる (U17: 本当に入ったときだけ)`);
    if (toJoined && r.event === 'net.recovered' && ![].concat(r.from.client).every((s) => s === L('Client', 'ConnectionLost'))) fail(`${r.id}: 再接続で "Friend joined!" になる`);
  }
}
console.log('ok  U57 / U63: 部屋の画面の出口は ‹ だけ (部屋を出るボタンは無い)。ホストは "Cancel this match?" で閉じ (Keep Waiting で残る)、クライアントは "Leave this match?" で抜ける (Stay で残る)。離席と帯は無い (両端末)');

// 決定 U6 / U7 / U10 / U18
{
  // U6: "Connection failed" は Create / Join がサーバーに届かないときだけ。誤り・期限切れ・満員とは別
  if (TOASTS.failedCreate.text !== 'Connection failed' || TOASTS.failedCreate.sub !== 'Couldn\u2019t create a match. Try again.') fail('ホストの "Connection failed" の文言が違う');
  if (TOASTS.failedJoin.text !== 'Connection failed' || TOASTS.failedJoin.sub !== 'Couldn\u2019t join the match. Try again.') fail('クライアントの "Connection failed" の文言が違う');
  if (SCREENS['Host.FriendMatch.Room.ConnectionFailed'].toast !== 'failedCreate' || SCREENS['Client.FriendMatch.Room.Join.ConnectionFailed'].toast !== 'failedJoin') fail('"Connection failed" の画面のトーストが役割と合わない');
  for (const r of TRANSITIONS) {
    if ([].concat(r.to.host, r.to.client).some((s) => /ConnectionFailed$/.test(s)) && !(r.when && (r.when.createResult === 'connFailed' || r.when.codeResult === 'connFailed'))) fail(`${r.id}: サーバーに届かないとき以外に "Connection failed" になる (U6)`);
  }
  // U69: Match Code の誤り・満員もトーストだが、"Connection failed" (U6) とは別の文言で、タップでは何もしない
  for (const [k, toast] of [['NotFound', 'joinNotFound'], ['Full', 'joinFull']]) {
    if (SCREENS[`Client.FriendMatch.Room.Join.Error.${k}`].toast !== toast || TOASTS[toast].tap || /Connection failed/.test(TOASTS[toast].text)) fail(`Client.FriendMatch.Room.Join.Error.${k} のトーストが ${toast} でない (U69)`);
  }
  if (!/t-sub/.test(appJs)) fail('app.js がトーストの 2 行目 (U6 の説明) を描かない');
  // U7 / U10 / U18: 期限切れ。両者に "Match code expired."、ホストは Create Match、クライアントは今の画面のまま Join Match
  for (const [h, c] of [[L('Host', 'Ready'), L('Client', 'Ready')], [L('Host', 'Ready.OpponentReady'), L('Client', 'Ready.WaitingForOpponent')], [L('Host', 'FriendJoined'), L('Client', 'Connecting')]]) {
    expectFire(at(h, c), 'timer.codeExpired', L('Host', 'CodeExpired'), L('Client', 'CodeExpired'));
  }
  expectFire(at(L('Host', 'Waiting'), 'Client.MultiModeSelection'), 'timer.codeExpired', L('Host', 'CodeExpired'), 'Client.MultiModeSelection');
  expectFire(at(L('Host', 'CodeExpired'), L('Client', 'CodeExpired')), 'host.createMatch', L('Host', 'Waiting'), L('Client', 'CodeExpired'));
  expectFire(at(L('Host', 'CodeExpired'), L('Client', 'CodeExpired')), 'client.openJoin', L('Host', 'CodeExpired'), 'Client.FriendMatch.Room.Join');
  for (const d of ['host', 'client']) if (Engine.canFire(at(L('Host', 'CodeExpired'), L('Client', 'CodeExpired')), `${d}.ready`)) fail(`期限切れの画面で ${d}.ready の行がある (U10)`);
  for (const r of TRANSITIONS) {
    if (r.event === 'timer.codeExpired' && [].concat(r.to.client).some((s) => /^Client\.FriendMatch\.Room/.test(s))) fail(`${r.id}: 期限切れでクライアントを別の画面へ移す (U18)`);
    if (r.event === 'timer.codeExpired' && Engine.DEVICES.some((d) => [].concat(r.from[d]).some((s) => /Starting$|\.Opponent$|Countdown$|Lobby\.(Reconnecting|OpponentDisconnected)$/.test(s)))) fail(`${r.id}: 時計が止まっている間 (読み込み・VS 画面・カウントダウン・U32 の再接続待ち) に期限が切れる (U7)`);
  }
}
console.log('ok  U6 / U7 / U10 / U18: "Connection failed" はサーバーに届かないときだけ、期限 30 分と "Match code expired."、New Match / Join Match');

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
  '1': [[7, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`], [8, `${L('Host', 'Ready.Confirming')} / ${L('Client', 'Ready')}`], [9, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady')}`],
    [10, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady.Confirming')}`], [11, `${L('Host', 'Starting')} / ${L('Client', 'Starting')}`], [12, 'Host.Opponent / Client.Opponent']],
  '1b': [[6, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`], [9, `${L('Host', 'Ready.OpponentReady')} / ${L('Client', 'Ready.WaitingForOpponent')}`], [12, 'Host.Opponent / Client.Opponent']],
  '3a': [[10, `${L('Host', 'ConnectionLost')} / ${L('Client', 'FriendDisconnected')}`], [11, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`]],
  '3b': [[9, `${L('Host', 'Waiting')} / ${L('Client', 'CouldNotReconnect')}`], [11, `${L('Host', 'Waiting')} / Client.FriendMatch.Room`]],
  '3c': [[9, `${L('Host', 'CouldNotReconnect')} / Client.FriendMatch.Room.RoomClosed`], [11, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.RoomClosed`],
    // U63: Join a Match を開いても帯は後ろに残り (U52)、× で閉じると帯のある Friend Match トップに戻る
    [12, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.RoomClosed.Join`], [13, `${L('Host', 'Waiting')} / Client.FriendMatch.Room.RoomClosed`],
    [14, `${L('Host', 'Waiting')} / Client.FriendMatch.Room`], [17, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`]],
  '3e': [[9, `${L('Host', 'CouldNotReconnect')} / Client.FriendMatch.Room.RoomClosed`], [10, `${L('Host', 'CouldNotReconnect')} / Client.FriendMatch.Room.RoomClosed`],
    [11, 'Host.FriendMatch.Room / Client.FriendMatch.Room.RoomClosed']],
  '4': [[9, 'Host.FriendMatch.Room / Client.FriendMatch.Room.HostLeft']],
  '4b': [[11, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady')}`], [14, 'Host.Opponent / Client.Opponent']],
  '4c': [[3, `${L('Host', 'Waiting')} / Client.MultiModeSelection`], [4, `${L('Host', 'Waiting')} / Client.MultiModeSelection`], [6, 'Host.FriendMatch.Room / Client.MultiModeSelection']],
  '5': [[9, `${L('Host', 'ClientLeft')} / Client.FriendMatch.Room`], [12, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`]],
  '5b': [[8, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`], [10, `${L('Host', 'ClientLeft')} / Client.FriendMatch.Room`]],
  '6': [[12, `${L('Host', 'Ready.StartFailed')} / ${L('Client', 'Ready.StartFailed')}`], [17, 'Host.Opponent / Client.Opponent']],
  '6b': [[12, `${L('Host', 'Ready.SyncFailed')} / ${L('Client', 'Ready.SyncFailed')}`], [17, 'Host.Opponent / Client.Opponent']],
  '7a': [[10, `${L('Host', 'Ready.OpponentReady')} / ${L('Client', 'Ready.WaitingForOpponent')}`], [13, `${L('Host', 'ClientLeft')} / Client.FriendMatch.Room`]],
  '7b': [[10, `${L('Host', 'Ready')} / ${L('Client', 'Ready.OpponentNotReady')}`]],
  '12': [[13, `${L('Host', 'OpponentDisconnected')} / ${L('Client', 'Reconnecting')}`], [14, `${L('Host', 'MatchCancelled')} / Client.FriendMatch.Room.ReconnectFailed`],
    [15, `${L('Host', 'MatchCancelled')} / Client.FriendMatch.Room.ReconnectFailed.Join`], [16, `${L('Host', 'MatchCancelled')} / Client.FriendMatch.Room.ReconnectFailed.Join.CodeEntered`],
    [17, `${L('Host', 'FriendJoined')} / ${L('Client', 'Connecting')}`]],
  '13': [[6, 'Host.FriendMatch.Room.ConnectionFailed / Client.FriendMatch.Room.Join.ConnectionFailed']],
  '19': [[10, `${L('Host', 'Ready.OpponentNotReady')} / ${L('Client', 'Ready')}`], [12, `${L('Host', 'Ready.WaitingForOpponent')} / ${L('Client', 'Ready.OpponentReady')}`]],
  '19b': [[10, `${L('Host', 'Ready.TimedOut')} / ${L('Client', 'Ready.TimedOut')}`]],
  '19c': [[13, 'Host.Game.Countdown / Client.Game.Countdown'], [14, `${L('Host', 'Reconnecting')} / ${L('Client', 'OpponentDisconnected')}`],
    [15, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`], [21, 'Host.Game.Countdown / Client.Game.Countdown']],
  '19d': [[13, `${L('Host', 'Reconnecting')} / ${L('Client', 'OpponentDisconnected')}`], [14, 'Host.FriendMatch.Room.ReconnectFailed / Client.FriendMatch.Room.HostDisconnected']],
  '19e': [[8, `${L('Host', 'FriendDisconnected')} / ${L('Client', 'ConnectionLost')}`], [10, 'Host.FriendMatch.Room / Client.FriendMatch.Room.HostLeft']],
  '20': [[10, `${L('Host', 'CodeExpired')} / ${L('Client', 'CodeExpired')}`], [11, `${L('Host', 'Waiting')} / ${L('Client', 'CodeExpired')}`], [15, `${L('Host', 'Ready')} / ${L('Client', 'Ready')}`]],
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
const hostInPlay = ['Host.Game.Play', 'Host.Game.MatchMenu'];
const clientInPlay = ['Client.Game.Play', 'Client.Game.MatchMenu'];
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

// U20: 結果画面の中身 (勝敗・両者の名前・終わった理由)。スコアはどの結果画面にも出さない (qniapp/qa2#1891 FB 7)
const { END_REASONS, REMATCH_STATUS, ELO, STAMPS, DISCONNECT_OVERLAYS, ratingText, resultButtons, resultReason, isResultState } = ctx;
const resultNames = Object.keys(SCREENS).filter((k) => SCREENS[k].view === 'result');
if (resultNames.some((k) => !isResultState(k)) || Object.keys(SCREENS).some((k) => isResultState(k) && SCREENS[k].view !== 'result')) fail('isResultState と結果画面の一覧が合わない');
if (resultNames.length !== 36) fail(`結果画面が ${resultNames.length} 状態 (期待: 36 = 2 端末 × (Win / Lose / Draw × 5 段階 + 切断 2 + No contest))`);
// U66 (#1891 の FB 10): 降参で終わった試合は再戦の無い特別な結果画面ではなく、時間切れと同じ結果画面 (理由はセッションの surrendered で出し分ける)
if (resultNames.some((k) => /Surrendered/.test(k))) fail('降参の特別な結果画面 (.Surrendered / .OpponentSurrendered) が残っている (U66)');
for (const name of resultNames) {
  const s = SCREENS[name];
  if (!['Win', 'Lose', 'Draw', 'NoContest'].includes(s.outcome)) fail(`${name}: 勝敗 ${s.outcome}`);
  if (!END_REASONS[s.reason]) fail(`${name}: 終わった理由 ${s.reason} が無い`);
  if (!s.decided.includes('U20')) fail(`${name}: 決定 U20 が無い`);
}
if (/'----'|dim-value/.test(appJs)) fail('app.js に値の決まっていないスコアの ---- が残っている');
if ('DEMO_SCORES' in ctx || /DEMO_SCORES|r-row"><span>Score/.test(appJs)) fail('結果画面にスコアの行が残っている (FB 7)');
const reasons = { timeUp: 'Time is up', timeUpTie: 'Same score when time ran out', surrendered: 'You surrendered', opponentSurrendered: 'Your opponent surrendered',
  disconnected: 'You were disconnected', opponentDisconnected: 'Your opponent disconnected', connectionError: 'No contest due to a connection error' };
if (JSON.stringify(END_REASONS) !== JSON.stringify(reasons)) fail('終わった理由の文言が違う');
for (const [name, outcome, reason] of [['Host.NoContestResult', 'NoContest', 'connectionError'], ['Client.LoseResult.Disconnected', 'Lose', 'disconnected'],
  ['Host.WinResult.OpponentDisconnected', 'Win', 'opponentDisconnected']]) {
  const s = SCREENS[name];
  if (!s || s.outcome !== outcome || s.reason !== reason) fail(`${name} が ${outcome} / ${reason} の結果画面でない`);
}
// 降参で終わった試合 (U38 / U66): 負けた側は "You surrendered"、勝った側は "Your opponent surrendered"。再戦の段階が進んでも同じ。時間切れのときは "Time is up"
for (const [name, surrendered, want] of [['Client.LoseResult', true, 'surrendered'], ['Host.WinResult', true, 'opponentSurrendered'],
  ['Host.LoseResult.RematchRequested', true, 'surrendered'], ['Client.WinResult.RematchIncoming', true, 'opponentSurrendered'],
  ['Client.LoseResult', false, 'timeUp'], ['Host.DrawResult', false, 'timeUpTie'], ['Host.LoseResult.Disconnected', false, 'disconnected']]) {
  const got = resultReason(SCREENS[name], { surrendered });
  if (got !== want) fail(`${name} (surrendered=${surrendered}) の終わった理由 ${got} (期待: ${want})`);
}
if (!/resultReason\(s, app\.state\)/.test(appJs)) fail('app.js が結果画面の終わった理由をセッションの surrendered で出し分けていない (U66)');
if (!/r-outcome/.test(appJs) || !/NO CONTEST/.test(appJs) || !/DRAW/.test(appJs)) fail('app.js に DRAW / NO CONTEST の見出しが無い');

// U21: レーティング。Friend Match は変わらない、ランダム対戦は Elo (初期値 1000、K=24)、同じ相手との再戦と No contest は変わらない。
// U70 (#1891 の FB): Friend Match では変わらないのが明らかなので、Rating の行ごと出さない
if (ELO.initial !== 1000 || ELO.k !== 24) fail('Elo が初期値 1000・K=24 でない');
if (/friend match\)/.test(read('js', 'transitions.js').split('var UNDECIDED')[0] + appJs)) fail('"No rating change (friend match)" が決定の一覧の外に残っている (U70)');
const ratings = [
  ['Win', friend, null], ['Lose', friend, null], ['Draw', friend, null], ['NoContest', friend, null],
  ['Win', random, '1000 \u2192 1012 (+12)'], ['Lose', random, '1000 \u2192 988 (\u221212)'], ['Draw', random, '1000 \u2192 1000 (\u00B10)'],
  ['NoContest', random, 'No rating change (no contest)'], ['Win', { match: 'random', rated: false }, 'No rating change (rematch)'],
];
for (const [o, session, want] of ratings) if (ratingText(o, session) !== want) fail(`レート ${o} ${JSON.stringify(session)}: ${ratingText(o, session)} (期待: ${want})`);
// セッション: Friend Match は rated=false、ランダム対戦は rated=true、再戦で rated=false、次のランダム対戦でまた rated=true
const sessionAt = (id, n) => { const st = Engine.replay(SCENARIOS.find((x) => x.id === id), n).state; return `${st.match}/${st.rated}`; };
for (const [id, n, want] of [['15', 14, 'friend/false'], ['15c', 20, 'friend/false'], ['17', 8, 'random/true'], ['17', 14, 'random/false'], ['17', 18, 'random/true'], ['18e', 9, 'random/true']]) {
  if (sessionAt(id, n) !== want) fail(`シナリオ ${id} の手順 ${n} のセッション ${sessionAt(id, n)} (期待: ${want})`);
}

// U22 / U24 / U59 / U67 / U72: ボタン。Friend Match は Rematch / Back to Friend Match、ランダム対戦は勝ち負けによらず Find Next Opponent / Rematch / Back to Random Match。
// 再戦の段階 (相手が先に押した・自分が押してくるくるを出している・両者が押した) でボタンは変わらない (U72: Cancel Request / Accept / Decline は無い)。
// 降参で終わった試合も同じ結果画面なので、同じボタン (U66)
const labels = (name, match) => resultButtons(SCREENS[name], match).map((b) => b.label + (b.primary ? '(主)' : '')).join(' / ');
const wantButtons = [
  ['Host.WinResult', 'friend', 'Rematch(主) / Back to Friend Match'],
  ['Host.WinResult', 'random', 'Find Next Opponent(主) / Rematch / Back to Random Match'],
  ['Host.LoseResult', 'random', 'Find Next Opponent(主) / Rematch / Back to Random Match'],
  ['Host.LoseResult', 'friend', 'Rematch(主) / Back to Friend Match'],
  ['Host.DrawResult', 'random', 'Find Next Opponent(主) / Rematch / Back to Random Match'],
  ['Host.LoseResult.OpponentLeft', 'random', 'Find Next Opponent(主) / Back to Random Match'],
  ['Host.LoseResult.Disconnected', 'random', 'Find Next Opponent(主) / Back to Random Match'],
  ['Host.WinResult.OpponentLeft', 'friend', 'Back to Friend Match(主)'],
  ['Host.WinResult.OpponentLeft', 'random', 'Find Next Opponent(主) / Back to Random Match'],
  ['Host.NoContestResult', 'random', 'Find Next Opponent(主) / Back to Random Match'],
];
for (const [name, match, want] of wantButtons) if (labels(name, match) !== want) fail(`${name} (${match}) のボタン ${labels(name, match)} (期待: ${want})`);
for (const o of ['Win', 'Lose', 'Draw']) {
  for (const ph of ['.RematchIncoming', '.RematchRequested', '.RematchStarting']) {
    for (const match of ['friend', 'random']) {
      if (labels(`Host.${o}Result${ph}`, match) !== labels(`Host.${o}Result`, match)) fail(`Host.${o}Result${ph} (${match}) のボタンが再戦の段階で変わる (U72): ${labels(`Host.${o}Result${ph}`, match)}`);
    }
  }
}
for (const name of resultNames) if (!resultButtons(SCREENS[name], 'random').some((b) => b.event === 'findNextOpponent')) fail(`${name} (random) に Find Next Opponent が無い (U67)`);
if (/label: '(Cancel Request|Accept|Decline)'|declineRematch|rematchTimeout|rematchCooldown|相手が応じる|相手が断る/.test(read('js', 'transitions.js').split('var UNDECIDED')[0] + appJs)) {
  fail('Cancel Request / Accept / Decline、断る・期限切れ・3 秒待ちの行かボタンが残っている (U72)');
}
// U59: 結果画面のボタンはホストとクライアントで同じで、戻るボタンはどの結果画面でも 1 つだけ (Online Battle へ戻るボタンは無い)
{
  const u59 = UNDECIDED.find((u) => u.id === 'U59');
  if (!u59 || !u59.decided || u59.decided.date !== '2026-10-17' || !/#1891/.test(u59.desc)) fail('U59 が #1891 の FB (2026-10-17) の決定になっていない');
}
// U72: 自分だけが押して待っている端末の下のモック操作で、相手の Rematch を進められる
{
  const u72 = UNDECIDED.find((u) => u.id === 'U72');
  if (!u72 || !u72.decided || u72.decided.date !== '2026-10-20' || !/#1891/.test(u72.desc) || !/高宮さん/.test(u72.decided.by)) fail('U72 が高宮さんの #1891 の FB (2026-10-20) の決定になっていない');
  if (!/モック操作 \(再戦\)/.test(appJs) || !/相手も Rematch を押す/.test(appJs)) fail('app.js に再戦のモック操作「相手も Rematch を押す」が無い');
}
const BACK_BUTTONS = { friend: 'Back to Friend Match:backToFriendMatch', random: 'Back to Random Match:backToRandomMatch' };
for (const name of resultNames.filter((k) => k.startsWith('Host.'))) {
  for (const match of ['friend', 'random']) {
    const clientName = name.replace(/^Host\./, 'Client.');
    if (labels(name, match) !== labels(clientName, match)) fail(`${name} と ${clientName} (${match}) のボタンが違う: ${labels(name, match)} / ${labels(clientName, match)}`);
    const backs = resultButtons(SCREENS[name], match).filter((b) => /^Back to /.test(b.label)).map((b) => `${b.label}:${b.event}`);
    if (backs.join() !== BACK_BUTTONS[match]) fail(`${name} (${match}) の戻るボタン ${backs.join(' / ')} (期待: ${BACK_BUTTONS[match]} だけ)`);
  }
}
// 結果画面のボタンは、どちらの対戦でも遷移表の行がある (相手は対になる段階か、すでに抜けた画面)。
// 再戦のくるくる (.RematchRequested / .RematchStarting) の間は、後ろのボタンとスタンプに行が無い (U72: 押せない)
const PAIRED = { '': '', RematchIncoming: 'RematchRequested', RematchRequested: 'RematchIncoming', RematchStarting: 'RematchStarting' };
const SPINNING = ['RematchRequested', 'RematchStarting'];
const opposite = { Win: 'Lose', Lose: 'Win', Draw: 'Draw' };
for (const [dev, R, , O] of eachSide) {
  for (const session of [friend, random]) {
    const gone = session.match === 'friend' ? `${O}.FriendMatch.Room` : `${O}.MultiModeSelection`;
    for (const name of resultNames.filter((k) => k.startsWith(R + '.'))) {
      const s = SCREENS[name];
      let theirs = gone;
      if (s.rematch && s.phase in PAIRED) theirs = `${O}.${opposite[s.outcome]}Result${PAIRED[s.phase] ? '.' + PAIRED[s.phase] : ''}`;
      const st = at(...sides(dev, name, theirs), session);
      const spinning = SPINNING.includes(s.phase);
      if (spinning !== !!s.spinner) fail(`${name} のくるくるが段階と合わない`);
      for (const b of resultButtons(s, session.match)) {
        if (Engine.canFire(st, `${dev}.${b.event}`) === spinning) fail(`${name} (${session.match}, 相手 ${theirs}) の ${b.label} の行が${spinning ? 'ある (くるくるの後ろは押せない)' : '無い'}`);
      }
      if (spinning && Engine.canFire(st, `${dev}.stamp.gg`)) fail(`${name} でくるくるの後ろのスタンプを送れる`);
      if (!s.rematch || s.phase === 'OpponentLeft') {
        for (const ev of ['rematch', 'cancelRematch']) if (Engine.canFire(st, `${dev}.${ev}`)) fail(`${name} で再戦の ${ev} の行がある`);
      }
    }
  }
}
// 戻り先 (U59 / U61): 同じ部屋 (Friend Match) / Random Match / 次の相手を探す。相手には "Your opponent left. Rematch is not available." (U25、勝敗は同じ)
const returnedTo = (R) => (R === 'Host' ? 'Host.FriendMatch.Lobby.FriendReturning' : 'Client.FriendMatch.Lobby.WaitingForHost');
if (SCREENS['Host.FriendMatch.Room'].join || SCREENS['Client.FriendMatch.Room'].join) fail('Friend Match トップで Join a Match が開いたまま (前の Match Code が残る)');
for (const [dev, R, other, O] of eachSide) {
  for (const o of ['Win', 'Lose', 'Draw']) {
    const mine = `${R}.${o}Result`;
    const theirs = `${O}.${opposite[o]}Result`;
    for (const [ev, session, dest] of [['backToFriendMatch', friend, returnedTo(R)], ['findNextOpponent', random, `${R}.Matchmake.NextOpponent`], ['backToRandomMatch', random, `${R}.Matchmake`]]) {
      // U67: 負けた側にも Find Next Opponent がある (勝ち・負け・引き分けで同じ)。
      // U72: 相手が先に Rematch を押していても (相手はくるくる) 抜けられ、相手のくるくるは閉じて "…Rematch is not available." になる
      expectFire(at(...sides(dev, mine, theirs), session), `${dev}.${ev}`, ...sides(dev, dest, `${theirs}.OpponentLeft`));
      expectFire(at(...sides(dev, mine + '.RematchIncoming', theirs + '.RematchRequested'), session), `${dev}.${ev}`, ...sides(dev, dest, `${theirs}.OpponentLeft`));
      for (const [ph, theirPh] of [['.RematchRequested', '.RematchIncoming'], ['.RematchStarting', '.RematchStarting']]) {
        if (Engine.canFire(at(...sides(dev, mine + ph, theirs + theirPh), session), `${dev}.${ev}`)) fail(`${mine}${ph} (${session.match}) のくるくるの間に ${ev} の行がある (U72)`);
      }
      // Friend Match のボタンはランダム対戦に無く、その逆も無い
      const wrong = session === friend ? random : friend;
      if (Engine.canFire(at(...sides(dev, mine, theirs), wrong), `${dev}.${ev}`)) fail(`${mine} (${wrong.match}) で ${ev} の行がある`);
    }
  }
  // U59 / U66 / U67: 降参した側も時間切れの負けと同じ結果画面で、Rematch・Find Next Opponent・戻るボタンがある。Online Battle へ戻るボタンは無い
  for (const session of [friend, random]) {
    const res = Engine.fire(Engine.fire(at(...sides(dev, `${R}.Game.Play`, `${O}.Game.Play`), session), `${dev}.matchMenu`).state, `${dev}.matchMenu.surrender`);
    if (!res || pair(res.state) !== pair({ [dev]: `${R}.LoseResult`, [other]: `${O}.WinResult` }) || !res.state.surrendered) {
      fail(`${R} の降参 (${session.match}) が ${res && pair(res.state)} (surrendered=${res && res.state.surrendered}) になる (期待: 時間切れと同じ結果画面と surrendered=true、U66)`);
      continue;
    }
    // U72: 降参した側からも、勝った側からも同じ Rematch を押せる (ランダム対戦でも)
    expectFire(res.state, `${dev}.rematch`, ...sides(dev, `${R}.LoseResult.RematchRequested`, `${O}.WinResult.RematchIncoming`));
    expectFire(res.state, `${other}.rematch`, ...sides(dev, `${R}.LoseResult.RematchIncoming`, `${O}.WinResult.RematchRequested`));
    if (session === random) expectFire(res.state, `${dev}.findNextOpponent`, ...sides(dev, `${R}.Matchmake.NextOpponent`, `${O}.WinResult.OpponentLeft`));
    for (const ev of ['backToOnlineBattle']) if (Engine.canFire(res.state, `${dev}.${ev}`)) fail(`${R} の降参の結果画面 (${session.match}) に ${ev} の行がある`);
    // 再戦が始まると surrendered は消え、次の試合は時間切れの理由に戻る
    const again = Engine.fire(Engine.fire(Engine.fire(res.state, `${dev}.rematch`).state, `${other}.rematch`).state, 'sys.rematchStarted');
    if (!again || again.state[dev] !== `${R}.Opponent` || again.state.surrendered !== false) fail(`${R} の降参のあとの再戦で surrendered が残る`);
  }
  // 時間切れの決着では surrendered にならない
  const timeUp = Engine.fire(at(...sides(dev, `${R}.Game.Play`, `${O}.Game.Play`), random), `${dev}.lose`);
  if (!timeUp || timeUp.state.surrendered) fail('時間切れの決着で surrendered になる');
  // U59 (#1891 の FB 17): Back to Random Match で着く Random Match の画面は、メニューから Random Match を開いたときと同じ最初の状態
  // (端末の付属状態・相手に見せる絵文字とあいさつも同じ)
  for (const name of resultNames.filter((k) => k.startsWith(R + '.') && !SCREENS[k].spinner)) {
    const fromResult = Engine.fire(at(...sides(dev, name, `${O}.MultiModeSelection`), random), `${dev}.backToRandomMatch`);
    const fromMenu = Engine.fire(at(...sides(dev, `${R}.MultiModeSelection`, `${O}.MultiModeSelection`)), `${dev}.randomMatch`);
    const mine = (res) => res && JSON.stringify(Object.keys(res.state).filter((k) => k === dev || (k.startsWith(dev) && k !== dev)).map((k) => [k, res.state[k]]));
    if (!fromResult || mine(fromResult) !== mine(fromMenu)) fail(`${name} の Back to Random Match の行き先 ${mine(fromResult)} がメニューの Random Match ${mine(fromMenu)} と違う`);
  }
}
if (REMATCH_STATUS.OpponentLeft.text !== 'Your opponent left. Rematch is not available.') fail('相手が抜けたときの文言が違う');

// U61 (#1891 の FB 11): Back to Friend Match は両者を同じ部屋 (同じ Match Code) へ戻す。先に押した側は部屋で待ち、相手も押すと入室と同じ流れ。
// 部屋を閉じるのはホストの ‹ (確認つき) だけで、クライアントの ‹ はクライアントだけが抜ける
{
  const u61 = UNDECIDED.find((u) => u.id === 'U61');
  if (!u61 || !u61.decided || u61.decided.date !== '2026-10-17' || !/#1891/.test(u61.desc)) fail('U61 が #1891 の FB (2026-10-17) の決定になっていない');
  if (REMATCH_STATUS.FriendReturned.text !== 'Your friend went back to Friend Match. Rematch is not available.') fail('Friend Match で相手が部屋に戻ったときの文言が違う');
  if (!/'FriendReturned'/.test(read('js', 'app.js'))) fail('app.js が Friend Match の結果画面で相手が部屋に戻った一行を出していない');
  const hostBack = 'Host.FriendMatch.Lobby.FriendReturning';
  const clientBack = 'Client.FriendMatch.Lobby.WaitingForHost';
  if (SCREENS[hostBack].view !== 'lobby' || SCREENS[hostBack].status !== 'Waiting for your friend to return\u2026' || !SCREENS[hostBack].codeHint) fail(`${hostBack} の画面が違う`);
  if (SCREENS[clientBack].view !== 'lobby' || SCREENS[clientBack].status !== 'Waiting for the host to return\u2026' || SCREENS[clientBack].codeHint) fail(`${clientBack} の画面が違う`);
  // U71 (#1891 の FB): 先に戻った側にも、相手が戻る前から両者のカード (どちらも Not ready) と、押せない Ready を出す
  for (const name of [hostBack, clientBack]) {
    const sc = SCREENS[name];
    if (!sc.cards || sc.cards.me !== false || sc.cards.them !== false) fail(`${name} に両者のカードが無い (U71)`);
    if ((sc.buttons || []).map((b) => b.label + (b.disabled ? '(無効)' : '')).join() !== 'Ready(無効)') fail(`${name} のボタンが押せない Ready でない (U71 / U4)`);
    if (!sc.decided.includes('U71')) fail(`${name} に決定 U71 が無い`);
  }
  // 後から押した側は、待っている相手の部屋に入る (入室と同じく "Friend joined!" / "Connecting…" → Ready 画面)
  const joined = ['Host.FriendMatch.Lobby.FriendJoined', 'Client.FriendMatch.Lobby.Connecting'];
  expectFire(at('Host.WinResult.OpponentLeft', clientBack, friend), 'host.backToFriendMatch', ...joined);
  expectFire(at(hostBack, 'Client.LoseResult.OpponentLeft', friend), 'client.backToFriendMatch', ...joined);
  expectFire(Object.assign(at('Host.LoseResult', clientBack, friend), { surrendered: true }), 'host.backToFriendMatch', ...joined);
  // ホストの ‹ は確認のあと部屋を閉じる。あとから押したクライアントは Friend Match トップに "The host canceled the match."
  const closing = Engine.fire(at(hostBack, 'Client.LoseResult.OpponentLeft', friend), 'host.back');
  if (!closing || closing.state.host !== hostBack || closing.state.hostDialog !== 'cancelMatch') fail(`${hostBack} の ‹ で "Cancel this match?" が出ない`);
  const closed = closing && expectFire(closing.state, 'host.dialog.cancelMatch', 'Host.FriendMatch.Room', 'Client.LoseResult.OpponentLeft');
  if (closed) expectFire(closed, 'client.backToFriendMatch', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room.HostLeft');
  // クライアントの ‹ は確認のあとクライアントだけ抜ける。部屋は残り、あとから戻ったホストには "Your friend left…"
  const leaving = Engine.fire(at('Host.WinResult.OpponentLeft', clientBack, friend), 'client.back');
  if (!leaving || leaving.state.client !== clientBack || leaving.state.clientDialog !== 'leaveMatch') fail(`${clientBack} の ‹ で "Leave this match?" が出ない`);
  const left = leaving && expectFire(leaving.state, 'client.dialog.leaveMatch', 'Host.WinResult.OpponentLeft', 'Client.FriendMatch.Room');
  if (left) expectFire(left, 'host.backToFriendMatch', 'Host.FriendMatch.Lobby.ClientLeft', 'Client.FriendMatch.Room');
  // 待っている間に期限が切れた部屋 (U7) には入れない
  expectFire(at('Host.FriendMatch.Lobby.CodeExpired', 'Client.WinResult.OpponentLeft', friend), 'client.backToFriendMatch',
    'Host.FriendMatch.Lobby.CodeExpired', 'Client.FriendMatch.Lobby.CodeExpired');
  // ランダム対戦に部屋は無い
  if (Engine.canFire(at('Host.WinResult', 'Client.LoseResult', random), 'host.backToFriendMatch')) fail('ランダム対戦で Back to Friend Match の行がある');
}

// U23 / U72: 再戦。両者に同じ Rematch があり、押した側はキャンセルできるくるくる、相手には "Your opponent wants a rematch" の一行だけ。
// 相手も押す (同時を含む) と両者に同じくるくる ("Starting match…") を出し、そのまま VS 画面 (レートは変わらない対戦)。
// Friend Match でもランダム対戦でも、勝ち負けによらず同じ。Cancel で何も押していない結果画面に戻り、すぐまた押せる (一行・3 秒待ちは無い)
if (JSON.stringify(REMATCH_STATUS) !== JSON.stringify({ RematchIncoming: { text: 'Your opponent wants a rematch', kind: 'asked' },
  OpponentLeft: { text: 'Your opponent left. Rematch is not available.', kind: 'info' },
  FriendReturned: { text: 'Your friend went back to Friend Match. Rematch is not available.', kind: 'info' } })) fail(`再戦の一行が違う: ${JSON.stringify(REMATCH_STATUS)}`);
if (JSON.stringify(ctx.REMATCH_SPINNERS) !== JSON.stringify({ RematchRequested: { text: 'Waiting for opponent\u2026', cancel: { label: 'Cancel', event: 'cancelRematch' } },
  RematchStarting: { text: 'Starting match\u2026' } })) fail(`再戦のくるくるが違う: ${JSON.stringify(ctx.REMATCH_SPINNERS)}`);
if (!/rematchSpinnerHtml/.test(appJs) || !/class="spinner"/.test(appJs) || !/' inert'/.test(appJs)) fail('app.js が再戦のくるくるを描いて後ろの結果画面を inert にしていない (U72)');
if (resultNames.some((k) => /\.Rematch(Cancelled|Declined|Expired)|Cooldown/.test(k))) fail('取り消し・辞退・期限切れの一行か 3 秒待ちの状態が残っている (U72)');
for (const o of ['Win', 'Lose', 'Draw']) {
  const H = (ph) => `Host.${o}Result${ph}`;
  const C = (ph) => `Client.${opposite[o]}Result${ph}`;
  for (const [dev, other] of [['host', 'client'], ['client', 'host']]) {
    const p = (m, t) => (dev === 'host' ? [H(m), C(t)] : [H(t), C(m)]);
    for (const session of [friend, random]) {
      // 自分が先に押す: 自分はくるくる、相手は一行だけ。相手の Rematch はそのまま押せる
      const asked = expectFire(at(H(''), C(''), session), `${dev}.rematch`, ...p('.RematchRequested', '.RematchIncoming'));
      if (!asked) continue;
      if (Engine.canFire(asked, `${dev}.rematch`) || Engine.canFire(asked, `${other}.cancelRematch`)) fail(`${p('.RematchRequested', '.RematchIncoming')} で押せないはずの再戦の操作がある`);
      // Cancel で取り消すと、両者とも何も押していない結果画面に戻る。すぐまた押せる
      const cancelled = expectFire(asked, `${dev}.cancelRematch`, ...p('', ''));
      if (cancelled) for (const d of ['host', 'client']) if (!Engine.canFire(cancelled, `${d}.rematch`)) fail(`${pair(cancelled)} で ${d} がすぐまた押せない`);
      // 相手が先に押していたら、自分が押すと両者に同じくるくる。取り消せず、自動でそのまま VS 画面へ
      const starting = expectFire(asked, `${other}.rematch`, H('.RematchStarting'), C('.RematchStarting'));
      if (!starting) continue;
      for (const d of ['host', 'client']) for (const ev of ['rematch', 'cancelRematch']) if (Engine.canFire(starting, `${d}.${ev}`)) fail(`${pair(starting)} で ${d}.${ev} の行がある`);
      const row = TRANSITIONS.find((r) => r.event === 'sys.rematchStarted' && [].concat(r.from.host).includes(H('.RematchStarting')));
      if (!row || !row.auto) fail(`${H('.RematchStarting')} から VS 画面へ自動で進む行が無い`);
      const vs = expectFire(starting, 'sys.rematchStarted', 'Host.Opponent', 'Client.Opponent');
      if (vs && (vs.match !== session.match || vs.rated !== false || vs.rematch !== true)) fail(`再戦の VS 画面のセッション ${vs.match}/${vs.rated}/${vs.rematch} (期待: ${session.match}/false/true)`);
    }
  }
  for (const session of [friend, random]) {
    const both = expectFire(at(H(''), C(''), session), 'sys.rematchSimultaneous', H('.RematchStarting'), C('.RematchStarting'));
    if (Engine.canFire(at(H('.RematchIncoming'), C('.RematchRequested'), session), 'sys.rematchSimultaneous')) fail('片方が押したあとに同時の申し込みの行がある');
    const vs = both && expectFire(both, 'sys.rematchStarted', 'Host.Opponent', 'Client.Opponent');
    if (vs && (vs.rated !== false || vs.rematch !== true)) fail('同時の再戦でレートが変わる / 再戦の印が付かない');
  }
}
// U26: 結果画面から自動では次へ進まない (両者が Rematch を押したあと (U72) の VS 画面へ進む行だけは自動)
for (const r of TRANSITIONS) {
  if (r.auto && Engine.DEVICES.some((d) => [].concat(r.from[d]).some((s) => isResultState(s) && !/\.RematchStarting$/.test(s)))) fail(`${r.id}: 結果画面から自動で進む`);
}

// U27: スタンプ。3 種類、送ってから 5 秒は送れない、3 秒で消える。結果画面を抜けると消える。ミュートは無い (U49、#1891 の FB 8)
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
  if (Engine.canFire(st, `${other}.muteStamps`) || `${other}Mute` in st) fail(`${other} がまだミュートできる (U49、#1891 の FB 8)`);
  // 送ったスタンプは結果画面を抜けると消える (再戦の VS 画面へ進んだときも)
  let m = Engine.fire(st, `${dev}.rematch`).state;
  m = Engine.fire(m, `${other}.rematch`).state;
  m = Engine.fire(m, 'sys.rematchStarted').state;
  if (m[`${dev}Stamp`] !== null) fail(`再戦の VS 画面でスタンプ ${m[`${dev}Stamp`]}`);
  for (const name of [`${R}.WinResult.OpponentLeft`, `${R}.WinResult.OpponentDisconnected`, `${R}.LoseResult.Disconnected`, `${R}.NoContestResult`]) {
    if (SCREENS[name].stamps || Engine.canFire(at(...sides(dev, name, `${O}.MultiModeSelection`), friend), `${dev}.stamp.gg`)) fail(`${name} でスタンプを送れる`);
  }
}
if (!/stampsHtml/.test(appJs) || !/r-bubble/.test(appJs)) fail('app.js にスタンプ・吹き出しの描画が無い');
if (/muteStamps|Mute/.test(appJs + JSON.stringify(TRANSITIONS.map((r) => r.event)))) fail('ミュートの描画か遷移が残っている (U49、#1891 の FB 8)');

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
expectFire(at('Host.Game.MatchMenu', 'Client.Game.MatchMenu'), 'net.bothDisconnected', 'Host.NoContestResult', 'Client.NoContestResult');
expectFire(at('Host.Game.Play', 'Client.Game.Play'), 'net.serviceFailure', 'Host.NoContestResult', 'Client.NoContestResult');
for (const o of Object.values(DISCONNECT_OVERLAYS)) if (/\d/.test(o.title + o.body)) fail(`切断を待つ表示に数字 (20 秒) がある: ${o.title} / ${o.body}`);

// U29: 次の相手を探す。見た目は Random Match と同じ。60 秒で見つからなければ "No opponent found." と Search again / Back to Online
for (const [dev, R, , O] of eachSide) {
  const next = `${R}.Matchmake.NextOpponent`;
  const st = (mine) => at(...sides(dev, mine, `${O}.MultiModeSelection`));
  expectFire(st(next), `${dev}.searchTimeout`, ...sides(dev, `${next}.NotFound`, `${O}.MultiModeSelection`));
  // U62: Cancel は Random Match から探しているときと同じく、Random Match の画面の Ready を待つ状態へ
  expectFire(st(next), `${dev}.cancelSearch`, ...sides(dev, `${R}.Matchmake`, `${O}.MultiModeSelection`));
  expectFire(st(next), `${dev}.back`, ...sides(dev, `${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
  expectFire(st(`${next}.NotFound`), `${dev}.searchAgain`, ...sides(dev, next, `${O}.MultiModeSelection`));
  expectFire(st(`${next}.NotFound`), `${dev}.backToOnlineBattle`, ...sides(dev, `${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
  // U47: 次の相手を探している間にアプリを離れても U43 と同じ (Online Battle の中に "Search stopped…")
  expectFire(st(next), `${dev}.leaveApp`, ...sides(dev, `${R}.Matchmake.Stopped`, `${O}.MultiModeSelection`));
  const nf = SCREENS[`${next}.NotFound`];
  if (!nf.notice || nf.notice.text !== 'No opponent found.' || nf.notice.buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Search again:searchAgain,Back to Online:backToOnlineBattle') fail(`${next}.NotFound の通知が "No opponent found." と Search again / Back to Online でない`);
  if (SCREENS[next].status !== 'Searching for an opponent…') fail(`${next} の表示が Random Match と同じでない`);
  const found = expectFire(at(...sides(dev, next, `${O}.Matchmake.Searching`)), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
  if (Engine.canFire(at(...sides(dev, next, `${O}.Matchmake`)), 'sys.opponentFound')) fail(`${O}.Matchmake (Ready を待っている) で相手が見つかる (U62)`);
  if (found && (found.match !== 'random' || found.rated !== true)) fail('次の相手との対戦がレートの変わるランダム対戦になっていない');
}

// 秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値が仮であることは右パネル (説明) と README に書く
const resultContext = [].concat(SCREENS['Host.WinResult'].context).join();
if (!/1000/.test(resultContext) || !/K=24/.test(resultContext) || !/仮の値/.test(resultContext)) fail('結果画面の右パネルに Elo の値が仮であることが無い');
for (const [name, want] of [['Host.WinResult.RematchStarting', /1\.5 秒 \(仮\)/], ['Host.WinResult', /5 秒 \(仮\)/],
  ['Host.Game.OpponentDisconnected', /20 秒 \(仮\)/], ['Host.Matchmake.NextOpponent', /60 秒 \(仮\)/]]) {
  if (!want.test([].concat(SCREENS[name].context).join())) fail(`${name} の右パネルに ${want} が無い`);
}
for (const [k, v] of Object.entries(Object.assign({}, END_REASONS, ...Object.values(REMATCH_STATUS).map((x, i) => ({ [i]: x.text }))))) if (/\d/.test(v)) fail(`結果画面の文言に数字: ${k} ${v}`);

// シナリオの流れ (手順ごとの両端末の状態)
const flows = {
  '15': [[15, 'Host.WinResult / Client.LoseResult'], [16, 'Host.FriendMatch.Lobby.FriendReturning / Client.LoseResult.OpponentLeft'],
    [17, 'Host.FriendMatch.Lobby.FriendJoined / Client.FriendMatch.Lobby.Connecting'], [18, 'Host.FriendMatch.Lobby.Ready / Client.FriendMatch.Lobby.Ready'],
    [20, 'Host.FriendMatch.Lobby.ClientLeft / Client.FriendMatch.Room']],
  '15b': [[15, 'Host.LoseResult / Client.WinResult'], [16, 'Host.LoseResult.OpponentLeft / Client.FriendMatch.Lobby.WaitingForHost'],
    [17, 'Host.FriendMatch.Lobby.FriendJoined / Client.FriendMatch.Lobby.Connecting'], [18, 'Host.FriendMatch.Lobby.Ready / Client.FriendMatch.Lobby.Ready'],
    [20, 'Host.FriendMatch.Room / Client.FriendMatch.Room.HostLeft']],
  '15c': [[16, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [17, 'Host.WinResult.RematchStarting / Client.LoseResult.RematchStarting'],
    [18, 'Host.Opponent / Client.Opponent'], [21, 'Host.LoseResult / Client.WinResult']],
  '15d': [[16, 'Host.WinResult.RematchRequested / Client.LoseResult.RematchIncoming'], [17, 'Host.WinResult / Client.LoseResult'],
    [18, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [19, 'Host.WinResult.RematchStarting / Client.LoseResult.RematchStarting'], [20, 'Host.Opponent / Client.Opponent']],
  '15e': [[16, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [17, 'Host.FriendMatch.Lobby.FriendReturning / Client.LoseResult.OpponentLeft'],
    [18, 'Host.FriendMatch.Lobby.FriendJoined / Client.FriendMatch.Lobby.Connecting'], [19, 'Host.FriendMatch.Lobby.Ready / Client.FriendMatch.Lobby.Ready']],
  '15f': [[16, 'Host.WinResult.RematchRequested / Client.LoseResult.RematchIncoming'], [17, 'Host.WinResult.RematchStarting / Client.LoseResult.RematchStarting'],
    [18, 'Host.Opponent / Client.Opponent'], [20, 'Host.Game.Play / Client.Game.Play']],
  '15g': [[15, 'Host.DrawResult / Client.DrawResult'], [16, 'Host.DrawResult.RematchStarting / Client.DrawResult.RematchStarting'], [17, 'Host.Opponent / Client.Opponent'],
    [19, 'Host.Game.Play / Client.Game.Play']],
  '16d': [[9, 'Host.WinResult / Client.LoseResult'], [10, 'Host.WinResult.OpponentLeft / Client.Matchmake.NextOpponent'], [11, 'Host.Matchmake.NextOpponent / Client.Matchmake.NextOpponent']],
  '17': [[8, 'Host.WinResult / Client.LoseResult'], [9, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'],
    [10, 'Host.WinResult.RematchStarting / Client.LoseResult.RematchStarting'], [11, 'Host.Opponent / Client.Opponent'],
    [14, 'Host.WinResult / Client.LoseResult'], [15, 'Host.Matchmake.NextOpponent / Client.LoseResult.OpponentLeft'],
    [16, 'Host.Matchmake.NextOpponent / Client.Matchmake'], [17, 'Host.Matchmake.NextOpponent / Client.Matchmake.Searching'], [18, 'Host.Opponent / Client.Opponent']],
  '17d': [[9, 'Host.WinResult.RematchRequested / Client.LoseResult.RematchIncoming'], [10, 'Host.WinResult.OpponentLeft / Client.Matchmake.NextOpponent'],
    [11, 'Host.Matchmake / Client.Matchmake.NextOpponent']],
  '17e': [[9, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [10, 'Host.WinResult / Client.LoseResult'],
    [11, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [12, 'Host.WinResult.RematchStarting / Client.LoseResult.RematchStarting'],
    [13, 'Host.Opponent / Client.Opponent'], [15, 'Host.Game.Play / Client.Game.Play']],
  '17b': [[10, 'Host.Matchmake.NextOpponent.NotFound / Client.LoseResult.OpponentLeft'], [11, 'Host.Matchmake.NextOpponent / Client.LoseResult.OpponentLeft'], [13, 'Host.MultiModeSelection / Client.LoseResult.OpponentLeft']],
  '18': [[15, 'Host.Game.OpponentDisconnected / Client.Game.Disconnected'], [16, 'Host.WinResult.OpponentDisconnected / Client.LoseResult.Disconnected']],
  '18b': [[15, 'Host.Game.Disconnected / Client.Game.OpponentDisconnected'], [16, 'Host.Game.Play / Client.Game.Play'], [17, 'Host.WinResult / Client.LoseResult']],
  '18c': [[16, 'Host.NoContestResult / Client.NoContestResult']],
  '18d': [[8, 'Host.NoContestResult / Client.NoContestResult'], [10, 'Host.Matchmake / Client.Matchmake.NextOpponent']],
  '18e': [[9, 'Host.LoseResult.Disconnected / Client.WinResult.OpponentDisconnected']],
};
for (const [id, checks] of Object.entries(flows)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  for (const [n, want] of checks) {
    const got = pair(Engine.replay(sc, n).state);
    if (got !== want) fail(`シナリオ ${id} の手順 ${n}: ${got} (期待: ${want})`);
  }
}
// 15h: スタンプ (手順ごとの hostStamp / clientStamp)
const sc15h = SCENARIOS.find((x) => x.id === '15h');
const stampFlow = [15, 16, 17, 18, 19, 20].map((n) => { const st = Engine.replay(sc15h, n).state; return `${st.hostStamp},${st.clientStamp}`; }).join(' → ');
const stampWantFlow = 'null,null → gg,null → gg,thanks → sent,thanks → null,thanks → nice,thanks';
if (stampFlow !== stampWantFlow) fail(`シナリオ 15h のスタンプ ${stampFlow} (期待: ${stampWantFlow})`);
console.log('ok  対戦後 (U20〜U30): 結果画面の中身・レート・ボタン・戻り先・再戦・スタンプ・切断・次の相手 (両端末)');

// 対戦中の MATCH MENU (決定 U37〜U42、案A): ☰ で開いても相手の端末は変わらない。CONTINUE で閉じ、SURRENDER ですぐ降参する (確認は MATCH MENU の 1 回だけ、U65)。
// 降参すると自分は負け、相手は (メニューを開いていても) 勝ち + "Your opponent surrendered" (U38)。どちらも時間切れと同じ結果画面 (U66)
for (const id of ['U37', 'U38', 'U39', 'U40', 'U41', 'U42']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.by !== '高宮さん' || u.decided.date !== '2026-10-07') fail(`${id} が 高宮さん 2026-10-07 の決定になっていない`);
}
if (/降参/.test(UNDECIDED.find((u) => u.id === 'U28').title)) fail('U28 の題名に決定済みの降参が残っている');
for (const [id, later] of [['U40', 'U65'], ['U45', 'U66'], ['U60', 'U67'], ['U56', 'U64'], ['U56', 'U68'], ['U63', 'U69'], ['U21', 'U70'], ['U61', 'U71'],
  ['U22', 'U72'], ['U23', 'U72'], ['U30', 'U72'], ['U50', 'U72'], ['U60', 'U72'], ['U67', 'U72']]) {
  if (!new RegExp(later).test(UNDECIDED.find((u) => u.id === id).desc)) fail(`${id} の説明に、${later} で変わったことが無い`);
}
for (const id of ['U64', 'U65', 'U66', 'U67', 'U68', 'U69', 'U70', 'U71']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.date !== '2026-10-19' || !/高宮さん/.test(u.decided.by) || !/#1891/.test(u.desc)) fail(`${id} が 高宮さん 2026-10-19 (#1891 の FB) の決定になっていない`);
}
for (const [dev, R, other, O] of [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']]) {
  const pair2 = (mine, theirs) => (dev === 'host' ? [mine, theirs] : [theirs, mine]);
  const st = (mine, theirs) => at(...pair2(mine, theirs));
  const [play, menu] = [`${R}.Game.Play`, `${R}.Game.MatchMenu`];
  for (const theirs of clientInPlay.concat(hostInPlay).filter((s) => s.startsWith(O + '.'))) {
    const m = expectFire(st(play, theirs), `${dev}.matchMenu`, ...pair2(menu, theirs));
    if (!m) continue;
    if (Engine.canFire(m, `${dev}.matchMenu`)) fail(`${menu} でもう一度メニューを開ける`);
    for (const ev of ['pause', 'quit', 'continue', 'pauseRematch', 'rematch']) if (Engine.canFire(m, `${dev}.${ev}`)) fail(`${menu} で ${dev}.${ev} の行がある`);
    expectFire(m, `${dev}.matchMenu.continue`, ...pair2(play, theirs));
    // U65 (#1891 の FB 18): SURRENDER ですぐ負け。"Surrender?" の確認は挟まない
    const c = expectFire(m, `${dev}.matchMenu.surrender`, ...pair2(`${R}.LoseResult`, `${O}.WinResult`));
    if (c && !c.surrendered) fail(`${menu} の SURRENDER で surrendered にならない`);
  }
  const surrendered = (session) => Object.assign(st(`${R}.LoseResult`, `${O}.WinResult`), session, { surrendered: true });
  expectFire(surrendered(friend), `${dev}.backToFriendMatch`,
    ...pair2(R === 'Host' ? 'Host.FriendMatch.Lobby.FriendReturning' : 'Client.FriendMatch.Lobby.WaitingForHost', `${O}.WinResult.OpponentLeft`));
  expectFire(surrendered(random), `${dev}.backToRandomMatch`, ...pair2(`${R}.Matchmake`, `${O}.WinResult.OpponentLeft`));
  expectFire(surrendered(friend), `${other}.backToFriendMatch`,
    ...pair2(`${R}.LoseResult.OpponentLeft`, O === 'Host' ? 'Host.FriendMatch.Lobby.FriendReturning' : 'Client.FriendMatch.Lobby.WaitingForHost'));
  if (Engine.canFire(at('Host.Game.Countdown', 'Client.Game.Countdown'), `${dev}.matchMenu`)) fail(`カウントダウン中に ${dev}.matchMenu の行がある`);
  const s = SCREENS[menu];
  if (s.view !== 'game' || !s.menu) fail(`${menu} がメニュー付きのゲーム画面になっていない`);
}
if (Object.keys(SCREENS).some((k) => /SurrenderConfirm/.test(k)) || 'SURRENDER_CONFIRM' in ctx || TRANSITIONS.some((r) => /surrenderConfirm/.test(r.event))) fail('降参の確認 (2 回目の確認) が残っている (U65)');
if (/降参の確認/.test(appJs)) fail('app.js に降参の確認の描画・説明が残っている (U65)');
if (MATCH_MENU.title !== 'MATCH MENU' || !/continues while the menu is open/.test(MATCH_MENU.body)) fail('MATCH MENU のタイトルか「試合は続く」の一文が無い');
if (MATCH_MENU.buttons.map((b) => b.label).join() !== 'CONTINUE,SURRENDER') fail('MATCH MENU のボタンが CONTINUE / SURRENDER でない (REMATCH / QUIT は無い)');
if (END_REASONS.opponentSurrendered !== 'Your opponent surrendered' || END_REASONS.surrendered !== 'You surrendered') fail('降参の結果画面の "You surrendered" / "Your opponent surrendered" が無い');
for (const r of TRANSITIONS) if (/\.(pause|quit|continue|pauseRematch)$/.test(r.event) && !/matchMenu\./.test(r.event)) fail(`${r.id}: ポーズの ${r.event} が残っている`);
for (const k of Object.keys(SCREENS)) if (/\.Game\.Pause$/.test(k)) fail(`ポーズの状態 ${k} が残っている`);
if (/timeScale|g-pause|p-dim/.test(read('js', 'app.js') + read('css', 'style.css'))) fail('app.js / style.css にポーズ (試合を止める表示) が残っている');
// モック専用の "Game in progress (mock)" は無くなった
for (const r of TRANSITIONS) if (/backToOnline$/.test(r.event)) fail(`${r.id}: モック専用の ${r.event} が残っている`);
if (/Game in progress/.test(read('js', 'app.js'))) fail('app.js にモック専用のゲーム画面の表示が残っている');
// [手順の途中, 最後] の状態
const menuScenarios = {
  '16': [16, 'Host.Game.MatchMenu / Client.Game.MatchMenu', 'Host.Game.Play / Client.Game.Play'],
  '16b': [18, 'Host.LoseResult / Client.WinResult', 'Host.Game.Play / Client.Game.Play'],
  '16c': [15, 'Host.Game.MatchMenu / Client.Game.Play', 'Host.LoseResult / Client.WinResult'],
};
for (const [id, [n, mid, last]] of Object.entries(menuScenarios)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  const got = [pair(Engine.replay(sc, n).state), pair(Engine.replay(sc).state)];
  if (got.join() !== [mid, last].join()) fail(`シナリオ ${id} の状態 ${got.join(' → ')} (期待: ${mid} → ${last})`);
}
console.log('ok  MATCH MENU: 開いても相手は変わらない / CONTINUE / SURRENDER ですぐ負け (確認は 1 回だけ、U65) + 相手に "Your opponent surrendered"、降参のあとも再戦できる (U66) (両端末)、メニュー中も Win / Lose');

// 決定 (U13a): ランダム対戦は相手が見つかり次第 VS 画面へ。Ready 画面 / Starting match… を挟まない (U31 は Friend Match だけ)。
// 相手を探す画面は "Searching for an opponent…" と大きな Cancel (Ready を押してから、U62)
const u13a = UNDECIDED.find((u) => u.id === 'U13a');
if (!u13a || !u13a.decided) fail('U13a が決定済みになっていない');
if (!/Friend Match/.test(u31.title)) fail('U31 の題名が Friend Match だけの決定になっていない');
expectFire(at('Host.Matchmake.Searching', 'Client.Matchmake.Searching'), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
const randomStates = ['Host.Matchmake.Searching', 'Client.Matchmake.Searching'];
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
const got11 = sc11 ? [1, 2, 3, 4, 5, 6, 7].map((n) => pair(Engine.replay(sc11, n).state)).join(' → ') : 'なし';
const want11 = 'Host.Matchmake / Client.MultiModeSelection → Host.Matchmake.Searching / Client.MultiModeSelection → Host.Matchmake.Searching / Client.Matchmake → ' +
  'Host.Matchmake.Searching / Client.Matchmake.Searching → Host.Opponent / Client.Opponent → Host.Game.Countdown / Client.Game.Countdown → Host.Game.Play / Client.Game.Play';
if (got11 !== want11) fail(`シナリオ 11 の流れ ${got11} (期待: ${want11})`);
console.log('ok  U13a: ランダム対戦は相手が見つかり次第 VS 画面、Searching + Cancel');

// 決定 (U13、高宮さん 2026-10-07): 相手を探している間の Cancel / ‹ は確認なし。Cancel は Random Match の画面の Ready を待つ状態へ、‹ は Online Battle へ (U62)。
// 探している間に行けるのはその 2 つだけ。アプリを離れると検索を止めて通知 (出し方は U43)、
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
  for (const theirs of [`${O}.MultiModeSelection`, `${O}.Matchmake`, `${O}.Matchmake.Searching`, `${O}.Matchmake.NotFound`, `${O}.FriendMatch.Room`]) {
    const st = (mine) => at(...pair3(mine, theirs));
    const [idle, search, stopped, notFound, online] = [`${R}.Matchmake`, `${R}.Matchmake.Searching`, `${R}.Matchmake.Stopped`, `${R}.Matchmake.NotFound`, `${R}.MultiModeSelection`];
    for (const [ev, dest] of [['cancelSearch', idle], ['back', online]]) {
      const res = Engine.fire(st(search), `${dev}.${ev}`);
      if (!res || res.state[dev + 'Dialog']) fail(`${search} の ${ev} で確認ダイアログが出る`);
      expectFire(st(search), `${dev}.${ev}`, ...pair3(dest, theirs));
    }
    expectFire(st(search), `${dev}.leaveApp`, ...pair3(stopped, theirs));
    expectFire(st(search), `${dev}.searchTimeout`, ...pair3(notFound, theirs));
    for (const notice of [stopped, notFound]) {
      expectFire(st(notice), `${dev}.searchAgain`, ...pair3(search, theirs));
      expectFire(st(notice), `${dev}.closeNotice`, ...pair3(online, theirs));
    }
  }
  // 探している間に押せるのは Cancel / ‹ とモック操作 (アプリを離れる・60 秒たつ) と Profile (画面はそのままダイアログを開く、#1891 の FB 12) だけで、
  // 行き先は Ready を待つ状態・Online Battle か通知
  const devEvents = Object.keys(EVENT_LABELS).filter((ev) => ev.startsWith(dev + '.'));
  const allowed = ['cancelSearch', 'back', 'leaveApp', 'searchTimeout', 'profile'].map((e) => `${dev}.${e}`);
  for (const ev of devEvents) {
    const res = Engine.fire(at('Host.Matchmake.Searching', 'Client.Matchmake.Searching'), ev);
    if (res && !allowed.includes(ev)) fail(`${R}.Matchmake.Searching で ${ev} の行がある (探している間はほかの画面へ行けない)`);
    if (res && ![`${R}.Matchmake`, `${R}.MultiModeSelection`, `${R}.Matchmake.Stopped`, `${R}.Matchmake.NotFound`].concat(ev === `${dev}.profile` ? [`${R}.Matchmake.Searching`] : []).includes(res.state[dev])) fail(`${R}.Matchmake.Searching から ${ev} で ${res.state[dev]} へ行く`);
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
  for (const name of [`${R}.Matchmake`, `${R}.Matchmake.Searching`]) if (SCREENS[name].undecided.length) fail(`${name} に未決 ${SCREENS[name].undecided} が残っている`);
}
if (!/leaveApp/.test(appJs) || !/searchTimeout/.test(appJs) || !/mockControlsHtml/.test(appJs)) fail('app.js の端末の下のモック操作に「アプリを離れる」「60 秒たつ」が無い');
// [手順ごとの状態] (11b〜11f)
const u13Scenarios = {
  '11b': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake / Client.MultiModeSelection',
    'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection',
    'Host.Matchmake / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection'],
  '11c': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.Stopped / Client.MultiModeSelection',
    'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.Matchmake', 'Host.Matchmake.Searching / Client.Matchmake.Searching',
    'Host.Opponent / Client.Opponent'],
  '11d': ['Host.MultiModeSelection / Client.Matchmake', 'Host.MultiModeSelection / Client.Matchmake.Searching', 'Host.MultiModeSelection / Client.Matchmake.Stopped',
    'Host.MultiModeSelection / Client.MultiModeSelection'],
  '11e': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.NotFound / Client.MultiModeSelection',
    'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.Matchmake', 'Host.Matchmake.Searching / Client.Matchmake.Searching',
    'Host.Opponent / Client.Opponent'],
  '11f': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.NotFound / Client.MultiModeSelection',
    'Host.MultiModeSelection / Client.MultiModeSelection'],
  '11h': ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.Stopped / Client.MultiModeSelection',
    'Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection'],
};
for (const [id, want] of Object.entries(u13Scenarios)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  const got = sc ? want.map((_, i) => pair(Engine.replay(sc, i + 1).state)) : [];
  if (!sc || sc.steps.length !== want.length || got.join() !== want.join()) fail(`シナリオ ${id} の流れ ${got.join(' → ')} (期待: ${want.join(' → ')})`);
}
console.log('ok  U13: Cancel は確認なしで Ready 待ち、‹ は確認なしで Online Battle、アプリを離れると "Search stopped…"、見つからなければ "No opponent found." (Search again / Close) (両端末)');

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
  for (const theirs of [`${O}.MultiModeSelection`, `${O}.Matchmake`, `${O}.Matchmake.Searching`, `${O}.FriendMatch.Room`]) {
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
  const want = ['Host.Matchmake / Client.MultiModeSelection', 'Host.Matchmake.Searching / Client.MultiModeSelection', 'Host.Matchmake.Stopped / Client.MultiModeSelection',
    'Host.FriendMatch.Room / Client.MultiModeSelection', 'Host.MultiModeSelection / Client.MultiModeSelection'];
  const sc = SCENARIOS.find((x) => x.id === '11g');
  const got = sc ? want.map((_, i) => pair(Engine.replay(sc, i + 1).state)) : [];
  if (!sc || sc.steps.length !== want.length || got.join() !== want.join()) fail(`シナリオ 11g の流れ ${got.join(' → ')} (期待: ${want.join(' → ')})`);
}
console.log('ok  U43: 検索が止まった通知は Online Battle の中 (モーダルではない)、Search again / Close、ほかの画面へ移ると消え、自動では消えない (両端末)');

// 決定 (U62、#1891 の FB 16・17): Random Match の画面は開いただけでは探さない。大きな Ready で探し始め、探している間は同じ場所のボタンが Cancel になり、
// Cancel で Ready を待つ状態に戻る。Random Match の画面へはどこから来ても Ready を待つ状態 (Search again / Find Next Opponent だけはすぐ探す)
const u61 = UNDECIDED.find((u) => u.id === 'U62');
if (!u61 || !u61.decided || u61.decided.date !== '2026-10-17' || !/#1891/.test(u61.desc)) fail('U62 が #1891 の FB (2026-10-17) の決定になっていない');
for (const [dev, R, O] of [['host', 'Host', 'Client'], ['client', 'Client', 'Host']]) {
  const pair3 = (mine, theirs) => (dev === 'host' ? [mine, theirs] : [theirs, mine]);
  const [idle, search, online] = [`${R}.Matchmake`, `${R}.Matchmake.Searching`, `${R}.MultiModeSelection`];
  const idleScreen = SCREENS[idle];
  const searchScreen = SCREENS[search];
  if (idleScreen.view !== 'random' || idleScreen.title !== 'Random Match' || idleScreen.status) fail(`${idle} が "Searching…" の無い Random Match の画面でない`);
  const btn = (s) => s.buttons.map((b) => `${b.label}:${b.event}:${!!b.big}`).join();
  if (btn(idleScreen) !== 'Ready:startSearch:true' || !idleScreen.buttons[0].primary) fail(`${idle} のボタンが大きな Ready だけでない (${btn(idleScreen)})`);
  if (btn(searchScreen) !== 'Cancel:cancelSearch:true') fail(`${search} のボタンが大きな Cancel だけでない (${btn(searchScreen)})`);
  for (const theirs of [`${O}.MultiModeSelection`, `${O}.Matchmake`, `${O}.Matchmake.Searching`]) {
    const st = (mine) => at(...pair3(mine, theirs));
    expectFire(st(online), `${dev}.randomMatch`, ...pair3(idle, theirs));
    expectFire(st(idle), `${dev}.startSearch`, ...pair3(search, theirs));
    expectFire(st(idle), `${dev}.back`, ...pair3(online, theirs));
    expectFire(st(search), `${dev}.cancelSearch`, ...pair3(idle, theirs));
    // Ready を待っている間は相手が見つからない (自動でも)
    if (Engine.canFire(st(idle), 'sys.opponentFound')) fail(`${idle} (相手 ${theirs}) で相手が見つかる`);
  }
  // Ready を待っている間に押せるのは Ready と ‹ と Profile (画面はそのままダイアログを開く、#1891 の FB 12) だけ
  const idleSt = at(...pair3(idle, `${O}.MultiModeSelection`));
  for (const ev of Object.keys(EVENT_LABELS).filter((e) => e.startsWith(dev + '.'))) {
    if (Engine.canFire(idleSt, ev) && ![`${dev}.startSearch`, `${dev}.back`, `${dev}.profile`].includes(ev)) fail(`${idle} で ${ev} の行がある`);
  }
  if (!idleScreen.profile) fail(`${idle} に Profile が無い (#1891 の FB 12: Random Match の画面で開ける)`);
  expectFire(at(...pair3(idle, `${O}.MultiModeSelection`)), `${dev}.profile`, ...pair3(idle, `${O}.MultiModeSelection`));
}
// Random Match の画面へ入る行はすべて Ready を待つ状態へ着く。すぐ探すのは、はっきり探し直すボタン (Search again / Find Next Opponent) だけ
const isRandomView = (name) => !!SCREENS[name] && SCREENS[name].view === 'random';
for (const r of TRANSITIONS) {
  const d = Engine.deviceOf(r.event);
  if (d === null) continue;
  const to = r.to[d];
  if (typeof to !== 'string' || !isRandomView(to) || states(r.from[d]).every(isRandomView)) continue;
  const action = r.event.slice(d.length + 1);
  const ok = /\.Matchmake$/.test(to) || (['searchAgain', 'findNextOpponent'].includes(action) && /\.Matchmake\.(Searching|NextOpponent)$/.test(to));
  if (!ok) fail(`${r.id}: ${r.event} で Random Match の画面の ${to} へ着く (Ready を待つ状態でない、U62)`);
}
for (const r of TRANSITIONS) if (/^(host|client)\.(randomMatch|backToRandomMatch)$/.test(r.event) && !/\.Matchmake$/.test(r.to[Engine.deviceOf(r.event)])) fail(`${r.id}: ${r.event} が Ready を待つ状態へ行かない`);
console.log('ok  U62: Random Match の画面は Ready を待って始まり (メニュー・通知・結果画面のどこからでも)、Ready で探し、Cancel で Ready 待ちに戻る (両端末)');

// 端末の画面にはゲームが出すものだけ: 決定の注記や「決定」バッジは端末の中にも端末の上にも出さない (右パネルへ)
if (/decided-note|decidedNoteHtml|GAME_COUNTDOWN_PREMISE/.test(appJs)) fail('app.js が端末の画面に決定の注記を出している');
if (/pillHtml|undecided-strip/.test(appJs)) fail('app.js が端末の上にバッジを出している');
console.log('ok  端末の画面と端末の上に決定の注記・バッジが無い');

// 端末の画面には仮・未決の印やモックの注記も出さない (説明は右パネル)。
// 実際の描画は tests/scan-screens.mjs が全シナリオの全手順で確かめる
if (/mock-note|class="tmp"|pill-undecided small inline|btn-wrap/.test(appJs)) fail('app.js が端末の画面に仮・未決の印やモックの注記を出している');
// 結果画面の決定 (U44 / U45 / U49 / U72) は右パネルの「決定済み」に出し、仮の値の説明も右パネルに出す
for (const [name, s] of Object.entries(SCREENS)) {
  if (s.view !== 'result') continue;
  const want = [].concat(s.stamps ? ['U49'] : [], s.rematch ? ['U72'] : [], /^timeUp/.test(s.reason) ? ['U44'] : [],
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
// U49: スタンプのミュートは無い (#1891 の FB 8)。結果画面にミュートのボタンを出さない
if (/opponent emotes|r-mute/.test(appJs + read('css', 'style.css'))) fail('結果画面にミュートのボタンが残っている (U49、#1891 の FB 8)');
// U51: ホストの ‹ の確認の題名 (U63 で "Cancel this match?" に)。U12 のクライアント向けの本文は保留 (README に書く)
if (DIALOGS.cancelMatch.title !== 'Cancel this match?') fail('ホストの ‹ の確認の題名が "Cancel this match?" でない (U51 / U63)');
if (!/保留/.test(UNDECIDED.find((u) => u.id === 'U51').desc) || !/U12[^\n]*保留|保留[^\n]*U12/.test(read('README.md'))) fail('U12 のクライアント向けの本文が保留だと書かれていない (U51)');
// U52: 部屋のお知らせはモーダルではない帯で Close で閉じる。Join a Match を開いて Match Code を入れても消えない (U63)
const ROOM_NOTICES_WANT = { HostLeft: 'The host canceled the match.', HostDisconnected: 'The host disconnected. The match was canceled.', RoomClosed: 'The match was canceled.',
  ReconnectFailed: 'Could not reconnect. The match did not start.', MatchCancelled: 'Match cancelled. Opponent did not reconnect.' };
if (JSON.stringify(ctx.ROOM_NOTICES) !== JSON.stringify(ROOM_NOTICES_WANT)) fail('部屋のお知らせの文言が違う (U52)');
if (/You left the room/.test(shownText)) fail('"You left the room" を出している (U52)');
for (const k of Object.keys(ROOM_NOTICES_WANT)) {
  const top = `Client.FriendMatch.Room.${k}`;
  for (const name of [top, `${top}.Join`, `${top}.Join.CodeEntered`]) {
    const sc = SCREENS[name];
    if (!sc || sc.view !== 'friendTop' || !sc.roomNotice || sc.roomNotice.text !== ROOM_NOTICES_WANT[k] || sc.roomNotice.buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Close:closeNotice') {
      fail(`${name} が "${ROOM_NOTICES_WANT[k]}" と Close の帯の Friend Match トップでない`);
    }
    const want = name === top ? undefined : JSON.stringify({ input: name.endsWith('.CodeEntered') ? 'QWERTY123' : '' });
    if (sc && JSON.stringify(sc.join) !== want) fail(`${name} の Join a Match が ${JSON.stringify(sc.join)} (期待: ${want})`);
  }
  expectFire(at('Host.MultiModeSelection', top), 'client.openJoin', 'Host.MultiModeSelection', `${top}.Join`);
  expectFire(at('Host.MultiModeSelection', `${top}.Join`), 'client.enterCode', 'Host.MultiModeSelection', `${top}.Join.CodeEntered`);
  expectFire(at('Host.MultiModeSelection', `${top}.Join.CodeEntered`), 'client.closeJoin', 'Host.MultiModeSelection', top);
  expectFire(at('Host.MultiModeSelection', top), 'client.closeNotice', 'Host.MultiModeSelection', 'Client.FriendMatch.Room');
  // Join a Match はモーダルなので、開いている間はお知らせの Close と ‹ を押せない
  for (const ev of ['client.closeNotice', 'client.back']) if (Engine.canFire(at('Host.MultiModeSelection', `${top}.Join.CodeEntered`), ev)) fail(`${top}.Join.CodeEntered で ${ev} の行がある (U63: ダイアログはモーダル)`);
  expectFire(at('Host.FriendMatch.Lobby.Waiting', `${top}.Join.CodeEntered`), 'client.joinMatch', 'Host.FriendMatch.Lobby.FriendJoined', 'Client.FriendMatch.Lobby.Connecting');
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
// U63 (#1891 の FB 19・20): Friend Match トップは New Match / Join Match の 2 つのボタンだけ。Match Code は Join Match で開く Join a Match に入れる。
// 誤り・満員はダイアログの中の赤字ではなく画面の下のトースト (U69) で、見つからない・期限切れは同じ "Match not found" / "The code may be wrong or expired."
{
  const u62 = UNDECIDED.find((u) => u.id === 'U63');
  if (!u62 || !u62.decided || u62.decided.date !== '2026-10-17' || !/#1891/.test(u62.desc) || !/19/.test(u62.decided.by) || !/20/.test(u62.decided.by)) fail('U63 が #1891 の FB 19・20 (2026-10-17) の決定になっていない');
  const ft = appJs.slice(appJs.indexOf('friendTop: function'), appJs.indexOf('lobby: function'));
  const labels = [...ft.matchAll(/>([A-Za-z ]+)<\/button>/g)].map((m) => m[1]);
  if (labels.join() !== 'New Match,Join Match' || /class="input"|sec-label/.test(ft)) fail(`Friend Match トップのボタンが New Match / Join Match だけでない (${labels.join(' / ')})、または入力欄が残っている (U63)`);
  if (!/attrs\(dev, 'createMatch'\) \+ '>New Match</.test(ft) || !/attrs\(dev, 'openJoin'\) \+ '>Join Match</.test(ft)) fail('New Match / Join Match のイベントが createMatch / openJoin でない (U63)');
  const jd = appJs.slice(appJs.indexOf('function joinDialogHtml'), appJs.indexOf('function roomNoticeHtml'));
  for (const want of ['aria-label="Join a Match"', '<div class="d-title">Join a Match</div>', '>Match Code</div>', "attrs(dev, 'enterCode')", "attrs(dev, 'joinMatch') + '>Join</button>", "attrs(dev, 'closeJoin')"]) {
    if (!jd.includes(want)) fail(`Join a Match のダイアログに ${want} が無い (U63)`);
  }
  if (/class="error"|j\.error/.test(jd) || /\.error \{|\.join-dialog \.error/.test(read('css', 'style.css'))) fail('Join a Match のダイアログの中に赤字が残っている (U69: トーストで出す)');
  const J = 'Client.FriendMatch.Room.Join';
  const want = { [J]: ['', null], [`${J}.CodeEntered`]: ['QWERTY123', null], [`${J}.Error.NotFound`]: ['QWERTY123', 'Match not found|The code may be wrong or expired.'],
    [`${J}.Error.Full`]: ['QWERTY123', 'The match is already full.|'], [`${J}.ConnectionFailed`]: ['QWERTY123', 'Connection failed|Couldn\u2019t join the match. Try again.'] };
  for (const [name, [input, toast]] of Object.entries(want)) {
    const sc = SCREENS[name];
    const got = sc && sc.toast ? `${TOASTS[sc.toast].text}|${TOASTS[sc.toast].sub || ''}` : null;
    if (!sc || sc.view !== 'friendTop' || !sc.join || sc.join.input !== input || 'error' in sc.join || got !== toast) fail(`${name} の Join a Match が ${JSON.stringify(sc && sc.join)} / トースト ${got} (期待: ${input} / ${toast})`);
  }
  for (const name of Object.keys(SCREENS)) if (SCREENS[name].error || 'input' in SCREENS[name]) fail(`${name} にダイアログの外の入力欄・赤字がある (U63)`);
  if (Object.keys(SCREENS).some((n) => /\.Error\.Expired$|Room\.CodeEntered$|Room\.ConnectionFailed$/.test(n) && n.startsWith('Client.'))) fail('ダイアログの外の .CodeEntered / .ConnectionFailed か、期限切れの赤字 (.Error.Expired) が残っている (U63)');
  // 開く・入れる・閉じる・Join
  expectFire(at('Host.MultiModeSelection', 'Client.FriendMatch.Room'), 'client.openJoin', 'Host.MultiModeSelection', J);
  expectFire(at('Host.MultiModeSelection', J), 'client.enterCode', 'Host.MultiModeSelection', `${J}.CodeEntered`);
  for (const from of [J, `${J}.CodeEntered`, `${J}.Error.NotFound`, `${J}.Error.Full`, `${J}.ConnectionFailed`]) {
    expectFire(at('Host.MultiModeSelection', from), 'client.closeJoin', 'Host.MultiModeSelection', 'Client.FriendMatch.Room');
    if (Engine.canFire(at('Host.MultiModeSelection', from), 'client.back')) fail(`${from} で ‹ を押せる (U63: ダイアログはモーダル)`);
  }
  if (Engine.canFire(at('Host.FriendMatch.Lobby.Waiting', J), 'client.joinMatch')) fail('Match Code を入れる前に Join で入れる');
  // 見つからない・期限切れは同じ赤字 (FB 20)。モック設定にも期限切れは無い
  expectFire(at('Host.MultiModeSelection', `${J}.CodeEntered`), 'client.joinMatch', 'Host.MultiModeSelection', `${J}.Error.NotFound`);
  expectFire(at(L('Host', 'CodeExpired'), `${J}.CodeEntered`), 'client.joinMatch', L('Host', 'CodeExpired'), `${J}.Error.NotFound`);
  expectFire(at('Host.FriendMatch.Lobby.Waiting', `${J}.Error.NotFound`), 'client.joinMatch', L('Host', 'FriendJoined'), L('Client', 'Connecting'));
  if (TRANSITIONS.some((r) => r.when && r.when.codeResult === 'expired') || /value="expired"/.test(read('index.html'))) fail('Match Code の期限切れが見つからないときと別の結果として残っている (U63、FB 20)');
  const sc9 = SCENARIOS.find((x) => x.id === '9');
  if (!sc9 || Engine.replay(sc9).state.client !== `${J}.Error.NotFound` || Engine.replay(sc9).state.host !== L('Host', 'CodeExpired')) fail('シナリオ 9 (期限切れ) が "Match not found. The code may be wrong or expired." で終わらない (U63)');
  // 接続失敗のトーストはダイアログを開いたまま出し、ダイアログの暗幕の上に描く (タップできる)
  if (appJs.indexOf('joinDialogHtml(dev, s.join)') === -1 || !/VIEWS\[spec\.view\]\(dev, spec\) \+ toastHtml/.test(appJs)) fail('接続失敗のトーストが Join a Match の暗幕の上に描かれない (U6 / U63)');
  expectFire(at('Host.MultiModeSelection', `${J}.ConnectionFailed`), 'client.tapToast', 'Host.MultiModeSelection', `${J}.CodeEntered`);
  // 文言: ホスト "Cancel this match?" (Cancel Match / Keep Waiting)、クライアント "Leave this match?" (Leave / Stay)、帯と一行
  if (SCREENS[L('Host', 'ClientLeft')].status.split('\n')[0] !== 'Your opponent left the match.') fail('クライアントが抜けたときのホストの一行が "Your opponent left the match." でない (U63)');
  if (ctx.ROOM_NOTICES.HostLeft !== 'The host canceled the match.') fail('ホストが閉じたときのクライアントの帯が "The host canceled the match." でない (U63)');
  if (btns(SCREENS[L('Host', 'CodeExpired')]) !== 'New Match' || SCREENS[L('Client', 'CodeExpired')].buttons[0].event !== 'openJoin') fail('期限切れの画面のボタンが New Match / Join Match (Join a Match を開く) でない (U63)');
}
console.log('ok  U63 (#1891 FB 19・20): Friend Match トップは New Match / Join Match だけ、Join a Match のダイアログ (Match Code・Join・×・赤字)、見つからない・期限切れは同じ赤字、"Room" を使わない文言');

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
    expectFire(st, `${d}.searchAgain`, ...side(`${R}.Matchmake.Searching`, `${O}.MultiModeSelection`));
    expectFire(st, `${d}.closeNotice`, ...side(`${R}.MultiModeSelection`, `${O}.MultiModeSelection`));
    expectFire(st, `${d}.friendMatch`, ...side(`${R}.FriendMatch.Room`, `${O}.MultiModeSelection`));
  }
}
// U55: 離席中の帯は 2026-10-10 の U57 で無くなった (上の U57 の確認)
// pi の仮定 3 (2026-10-08 に確認): 部屋での切断 (U5) の再接続待ちの間は Match Code の期限の時計が止まらない
expectFire(at(L('Host', 'FriendDisconnected'), L('Client', 'ConnectionLost')), 'timer.codeExpired', L('Host', 'CodeExpired'), L('Client', 'ConnectionLost'));
expectFire(at(L('Host', 'ConnectionLost'), L('Client', 'FriendDisconnected')), 'timer.codeExpired', L('Host', 'ConnectionLost'), L('Client', 'CodeExpired'));
expectFire(at(L('Host', 'CodeExpired'), L('Client', 'ConnectionLost')), 'net.recovered', L('Host', 'CodeExpired'), L('Client', 'CodeExpired'));
expectFire(at(L('Host', 'ConnectionLost'), L('Client', 'CodeExpired')), 'net.recovered', L('Host', 'CodeExpired'), L('Client', 'CodeExpired'));
// pi の仮定 1 (ホストの ‹ は確認を出さない) は 2026-10-10 の U57 で変わった (ホストの ‹ は "Cancel this match?"。上の U57 の確認)。
// 仮定 5: Online Battle へ戻るボタンは降参のあとも "Back to Online"
if (/Back to Online Battle/.test(shownText + appJs)) fail('"Back to Online Battle" が残っている (すべて "Back to Online")');
console.log('ok  U44〜U55 (2026-10-08): 時間切れの決着、再戦なし、切断で止める 20 秒、次の相手の検索停止、Rating、ミュートなし、再戦の一行、部屋のお知らせ、開始前の切断の取りやめ');

// 決定 U56 (高宮さん 2026-10-08): Profile。相手に見せる絵文字とあいさつを 10 個ずつの候補から 1 つずつ選ぶ
{
  const { PROFILE_EMOJIS, PROFILE_GREETINGS, PROFILE_DEFAULT, PLAYERS, ProfileStore, GREETING_LANGS, greetingText } = ctx;
  // 状態のあいさつは id (#1891 FB 13)。英語の文にして比べる
  const say = (id) => greetingText(id, 'en');
  const u56 = UNDECIDED.find((u) => u.id === 'U56');
  if (!u56 || !u56.decided || u56.decided.by !== '高宮さん' || u56.decided.date !== '2026-10-08') fail('U56 (Profile) が 高宮さん 2026-10-08 の決定になっていない');
  if (UNDECIDED.some((u) => !u.decided)) fail('Profile を足して未決ができた (期待: 0 件)');
  // 候補 (内容と順番、10-08 に 5・6・7・10 番目を変えた)。アポストロフィはどれも ’ (U+2019)
  const EMOJIS = ['\u{1F44B}', '\u{1F642}', '\u{1F60E}', '\u{1F916}', '\u{1F9E0}', '\u269B\uFE0F', '\u{1F52C}', '\u{1F31F}', '\u{1F340}', '\u{1F680}'];
  const GREETINGS = ['Hello!', 'Let\u2019s go!', 'Have fun!', 'Good luck!', 'Let\u2019s do this!', 'Bring it on!', 'Ready?', 'Here we go!', 'Happy puzzling!', 'May the best player win!'];
  if (PROFILE_EMOJIS.map((e) => e.emoji).join('|') !== EMOJIS.join('|')) fail(`絵文字の候補が ${PROFILE_EMOJIS.map((e) => e.emoji).join(' ')} (期待: ${EMOJIS.join(' ')})`);
  if (PROFILE_GREETINGS.map((g) => g.en).join('|') !== GREETINGS.join('|')) fail(`あいさつの候補が ${PROFILE_GREETINGS.map((g) => g.en).join(' / ')}`);
  // あいさつは日本語と英語だけにローカライズする (#1891 FB 13)。日本語の ! と ? は全角で、英語の文字は混ぜない
  const GREETINGS_JA = ['こんにちは！', 'いくよ！', '楽しもう！', 'がんばってね！', 'がんばろう！', 'かかってこい！', '準備はいい？', 'さあ、始めよう！', 'パズルを楽しもう！', 'いい勝負をしよう！'];
  if (JSON.stringify(GREETING_LANGS) !== '["en","ja"]') fail(`あいさつの言語が ${GREETING_LANGS.join(', ')} (期待: en, ja だけ)`);
  for (const g of PROFILE_GREETINGS) if (Object.keys(g).join() !== 'id,en,ja') fail(`あいさつ ${g.id} の言語が ${Object.keys(g).slice(1).join(', ')} (期待: en, ja だけ)`);
  if (PROFILE_GREETINGS.map((g) => g.ja).join('|') !== GREETINGS_JA.join('|')) fail(`日本語のあいさつが ${PROFILE_GREETINGS.map((g) => g.ja).join(' / ')}`);
  if (new Set(GREETINGS_JA).size !== GREETINGS_JA.length) fail('日本語のあいさつに同じ文がある');
  for (const t of GREETINGS_JA) if (/[A-Za-z!?'\u2019]/.test(t)) fail(`日本語のあいさつ ${t} に半角の ! ? や英字がある`);
  if (greetingText('bringItOn', 'ja') !== 'かかってこい！' || greetingText('bringItOn', 'en') !== 'Bring it on!') fail('greetingText が id と言語で文を返さない');
  for (const list of [PROFILE_EMOJIS, PROFILE_GREETINGS]) if (new Set(list.map((x) => x.id)).size !== 10) fail('候補の id が 10 個そろっていない');
  for (const e of PROFILE_EMOJIS) if (!/^[A-Z][a-z ]+$/.test(e.name)) fail(`絵文字 ${e.emoji} の読み上げ名が英語でない (${e.name})`);
  // 既定値は全員 👋 "Hello!"。相手の役 (ogwssk 😎 "Let’s go!") は前からの値のまま。名前は変えられず、ほかの名前は足さない
  if (PROFILE_DEFAULT.emoji !== EMOJIS[0] || say(PROFILE_DEFAULT.greeting) !== 'Hello!') fail('既定値が 👋 "Hello!" でない');
  const init = Engine.initialState();
  if (`${init.hostEmoji} ${say(init.hostGreeting)}` !== `${EMOJIS[0]} Hello!`) fail(`ホストの最初の値が ${init.hostEmoji} ${init.hostGreeting}`);
  if (`${init.clientEmoji} ${say(init.clientGreeting)}` !== '\u{1F60E} Let\u2019s go!') fail(`クライアント (ogwssk) の最初の値が ${init.clientEmoji} ${init.clientGreeting}`);
  if (JSON.stringify(PLAYERS) !== JSON.stringify({ host: { name: 'Yasuhito' }, client: { name: 'ogwssk', emoji: '\u{1F60E}', greeting: 'letsGo' } })) fail(`PLAYERS が ${JSON.stringify(PLAYERS)}`);
  // アポストロフィは ’ (U+2019) だけ: 候補、ホストの既定値、相手 (ogwssk) の値、どのシナリオの VS 画面のあいさつにも ' (U+0027) が無い
  const straight = (t) => typeof t === 'string' && t.includes("'");
  for (const t of PROFILE_GREETINGS.map((g) => g.en).concat(say(PROFILE_DEFAULT.greeting), say(PLAYERS.client.greeting))) if (straight(t)) fail(`あいさつ ${t} にまっすぐな ' がある (’ にそろえる)`);
  if (!PROFILE_GREETINGS.some((g) => g.en.includes('\u2019'))) fail('あいさつの候補に ’ が 1 つも無い');
  let vsGreetings = 0;
  for (const sc of SCENARIOS) {
    for (let n = 0; n <= sc.steps.length; n++) {
      const st = Engine.replay(sc, n).state;
      for (const d of Engine.DEVICES) {
        if (!SCREENS[st[d]] || SCREENS[st[d]].view !== 'vs') continue;
        for (const who of Engine.DEVICES) {
          vsGreetings++;
          if (!say(st[who + 'ShownGreeting']) || straight(say(st[who + 'ShownGreeting']))) fail(`シナリオ ${sc.id} 手順 ${n}: VS 画面のあいさつ ${st[who + 'ShownGreeting']} が候補に無いか、まっすぐな '`);
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

  // 開けるのは Random Match (Ready を待っている画面 (U62) と相手を探している画面)、Friend Match トップ (#1891 の FB 12。Join a Match を開いている間は除く、U63)、
  // ‹ を押せる部屋の画面 (期限切れを除く、U68)。今の画面の上にダイアログで開く。Online Battle・対戦中には行もボタンも無く、専用の Profile 画面は無い
  if (Object.keys(SCREENS).some((n) => /\.Profile$/.test(n)) || Object.values(SCREENS).some((sp) => sp.view === 'profile')) fail('専用の Profile 画面が残っている');
  if (/\.Profile\b/.test(read('js', 'scenarios.js'))) fail('シナリオに Profile 画面が残っている');
  if (!/FB 12/.test(u56.desc) || !/#1891/.test(u56.desc)) fail('U56 の説明に #1891 の FB 12 (入口をダイアログに変えた) が無い');
  for (const [d, R, O] of [['host', 'Host', 'Client'], ['client', 'Client', 'Host']]) {
    const searching = [`${R}.Matchmake.Searching`, `${R}.Matchmake.NextOpponent`];
    // Join a Match のダイアログ (U63) を開いている間はモーダルなので、Profile のボタンは後ろに見えるが押せない (‹ と同じ)
    const friendTopAll = Object.keys(SCREENS).filter((n) => n.startsWith(`${R}.FriendMatch.Room`));
    const friendTop = friendTopAll.filter((n) => !SCREENS[n].join);
    // U68 (#1891 の FB): Match Code を出している部屋の画面のうち、‹ を押せるもの (送っている間・読み込み・自分の再接続中は ‹ を押せない) と期限切れ以外
    const lobby = Object.keys(SCREENS).filter((n) => n.startsWith(`${R}.FriendMatch.Lobby.`) && SCREENS[n].back === 'back' && !/\.CodeExpired$/.test(n));
    if (lobby.length < (R === 'Host' ? 15 : 12) || !lobby.includes(L(R, 'Ready')) || !lobby.includes(L(R, 'Ready.WaitingForOpponent'))) fail(`${R} の Profile を開ける部屋の画面が ${lobby.join(', ')}`);
    const openable = searching.concat([`${R}.Matchmake`], friendTop, lobby);
    if (friendTop.length < (R === 'Host' ? 4 : 6)) fail(`${R} の Friend Match トップの状態が ${friendTop.length} 個しかない`);
    if (R === 'Client' && friendTopAll.length - friendTop.length < 15) fail('Client の Join a Match を開いた状態が少ない');
    const others = [`${O}.MultiModeSelection`, L(O, 'Ready'), `${O}.Game.Play`, `${O}.Matchmake.Searching`];
    for (const name of Object.keys(SCREENS).filter((n) => n.startsWith(R + '.'))) {
      for (const o of others) {
        const st = d === 'host' ? at(name, o) : at(o, name);
        const ok = Engine.canFire(st, `${d}.profile`);
        if (ok !== openable.includes(name)) fail(`${name} (相手 ${o}) で Profile の行が ${ok ? 'ある' : '無い'}`);
        if (ok) {
          const r = Engine.fire(st, `${d}.profile`);
          if (r.state[d] !== name || r.state[d + 'Dialog'] !== 'profile' || r.state[O.toLowerCase()] !== o) fail(`${name}: Profile で画面が変わるか、ダイアログが開かない (${r.state[d]} / ${r.state[d + 'Dialog']})`);
        }
      }
      const hasButton = !!SCREENS[name].profile || (SCREENS[name].items || []).some((it) => it.event === 'profile');
      if (hasButton !== (openable.includes(name) || friendTopAll.includes(name))) fail(`${name} の Profile のボタンが ${hasButton ? 'ある' : '無い'}`);
    }
    if (!SCREENS[`${R}.Matchmake`].profile || !SCREENS[`${R}.Matchmake.Searching`].profile || SCREENS[`${R}.Matchmake`].title !== 'Random Match' || SCREENS[`${R}.FriendMatch.Room`].title !== 'Friend Match') fail(`${R} の Random Match / Friend Match の画面に Profile が無い`);
    if (Engine.canFire(at(`${R}.MultiModeSelection`, `${O}.MultiModeSelection`), `${d}.profile`)) fail(`${R}: Online Battle から Profile を開ける`);
    // ダイアログの中の操作は、絵文字 10 個・あいさつ 10 個 (相手を探している間、部屋の画面 (U68)、探していない間 (Ready を待っている・Friend Match トップ) で 1 行ずつ)・× で閉じるだけ。
    // Save / Cancel は無い (#1891 の FB 14)。どれも画面はそのまま
    const inDialog = TRANSITIONS.filter((r) => r.from[d + 'Dialog'] === 'profile');
    const picks = PROFILE_EMOJIS.map((e) => `dialog.pickEmoji.${e.id}`).concat(PROFILE_GREETINGS.map((g) => `dialog.pickGreeting.${g.id}`));
    const want = picks.concat(picks, picks, ['dialog.closeProfile']);
    if (inDialog.map((r) => r.event.slice(d.length + 1)).join() !== want.join()) fail(`${R} の Profile のダイアログの操作が ${inDialog.map((r) => r.event).join(', ')}`);
    for (const r of inDialog.concat(TRANSITIONS.filter((x) => x.event === `${d}.profile`))) {
      if (r.to[d] !== '=' || states(r.from[d]).some((n) => !openable.includes(n))) fail(`${r.id}: Profile の行が ${states(r.from[d]).join()} → ${r.to[d]}`);
    }
    if (DIALOGS.profile.close !== 'dialog.closeProfile') fail('Profile のダイアログの × が closeProfile でない');
    if (/Escape[\s\S]{0,80}Profile|pf-close|saveProfile|Cancel<\/button>/.test(appJs.slice(appJs.indexOf('function profileDialogHtml')))) fail('Profile のダイアログに Save / Cancel か、Esc で閉じる処理が残っている');
    // U64 (#1891 の FB): 閉じるのは Join a Match と同じ右上の × (Close)。左上の ‹ (Back) と "Saved" は無い
    const pfHtml = appJs.slice(appJs.indexOf('function profileDialogHtml'), appJs.indexOf('function dialogHtml'));
    if (!pfHtml.includes(`'<button type="button" class="d-close" aria-label="Close"' + attrs(dev, d.close) + '>\\u00d7</button>'`)) fail('Profile のダイアログの右上に × (Close) が無い (U64)');
    if (/pf-back|aria-label="Back"|Saved|ProfileSaved/.test(pfHtml) || /pf-back|pf-saved/.test(read('css', 'style.css')) || 'ProfileSaved' in ctx.DEVICE_FIELDS) fail('Profile のダイアログに ‹ (Back) か "Saved" が残っている (U64)');
    // 選ぶとすぐ保存し、見本が変わる (#1891 の FB 14)。× で閉じても保存した値のまま、次に開くとその値から。どちらでも画面はそのまま
    for (const where of [`${R}.Matchmake.Searching`, `${R}.Matchmake`, `${R}.FriendMatch.Room`, L(R, 'Ready'), L(R, 'Ready.WaitingForOpponent')]) {
      const open = (st) => Engine.fire(st, `${d}.profile`);
      const st = d === 'host' ? at(where, `${O}.MultiModeSelection`) : at(`${O}.MultiModeSelection`, where);
      const pick = (s, e, g) => [`${d}.dialog.pickEmoji.${e}`, `${d}.dialog.pickGreeting.${g}`].reduce((x, ev) => { const r = Engine.fire(x, ev); if (!r) fail(`${ev} の行が無い`); return r ? r.state : x; }, s);
      const before = `${st[d + 'Emoji']} ${say(st[d + 'Greeting'])}`;
      let o = open(st).state;
      if (`${o[d + 'Emoji']} ${say(o[d + 'Greeting'])}` !== before) fail(`${where}: Profile を開いたときに値が変わる`);
      for (const ev of ['back', 'cancelSearch', 'startSearch', 'createMatch', 'ready', 'cancelReady', 'copyCode']) if (Engine.canFire(o, `${d}.${ev}`)) fail(`${where}: Profile のダイアログの後ろの画面を操作できる (${ev}、モーダルでない)`);
      o = pick(o, 'robot', 'goodLuck');
      if (o[d] !== where || o[d + 'Dialog'] !== 'profile' || `${o[d + 'Emoji']} ${say(o[d + 'Greeting'])}` !== '\u{1F916} Good luck!') fail(`${where}: Profile で選んでもすぐ保存されない`);
      // 相手を探している間と部屋の画面 (U68) で選んだものは、この対戦の相手に見せる値にもなる
      const shownNow = searching.includes(where) || lobby.includes(where);
      if ((`${o[d + 'ShownEmoji']} ${say(o[d + 'ShownGreeting'])}` === '\u{1F916} Good luck!') !== shownNow) fail(`${where}: 選んだ値を相手に見せる値に${shownNow ? '写さない' : '写す'}`);
      const c = Engine.fire(o, `${d}.dialog.closeProfile`).state;
      if (c[d] !== where || c[d + 'Dialog'] !== null || `${c[d + 'Emoji']} ${say(c[d + 'Greeting'])}` !== '\u{1F916} Good luck!') fail(`${where}: × で閉じないか、選んだ値が残らない`);
      const reopenedHere = open(c).state;
      if (`${reopenedHere[d + 'Emoji']} ${say(reopenedHere[d + 'Greeting'])}` !== '\u{1F916} Good luck!') fail(`${where}: Profile をもう一度開くと保存した値から始まらない`);
    }
    // Profile を開けない画面へ変わる (相手が見つかる) とダイアログは閉じる。選んだものは保存済みで、見つかった相手にも見える
    const both = Engine.fire(pickState(at('Host.Matchmake.Searching', 'Client.Matchmake.Searching'), d), 'sys.opponentFound');
    if (!both || both.state[d] !== `${R}.Opponent` || both.state[d + 'Dialog'] !== null || both.state[d + 'Emoji'] !== '\u{1F680}' || both.state[d + 'ShownEmoji'] !== '\u{1F680}') fail(`${R}: 相手が見つかっても Profile のダイアログが閉じないか、選んだものが保存されていない`);
    // U68: 部屋の中で画面が変わる (相手が Ready を押す・相手が切断する) ときは開いたまま。読み込みが始まる・期限が切れると閉じる
    const go = (st, evs) => evs.reduce((x, ev) => { const r = x && Engine.fire(x, ev); if (x && !r) fail(`U68: ${ev} の行が無い (${x.host} / ${x.client})`); return r && r.state; }, st);
    const other = d === 'host' ? 'client' : 'host';
    const roomOpen = pickState(at(L('Host', 'Ready'), L('Client', 'Ready')), d);
    const theirReady = go(roomOpen, [`${other}.ready`, 'sys.readyConfirmed']);
    if (!theirReady || theirReady[d] !== L(R, 'Ready.OpponentReady') || theirReady[d + 'Dialog'] !== 'profile') fail(`${R}: 部屋で相手が Ready を押すと Profile のダイアログが閉じる (U68)`);
    const theirGone = go(roomOpen, [`${other}.disconnect`]);
    if (!theirGone || theirGone[d] !== L(R, 'FriendDisconnected') || theirGone[d + 'Dialog'] !== 'profile') fail(`${R}: 部屋で相手が切断すると Profile のダイアログが閉じる (U68)`);
    const expired = go(roomOpen, ['timer.codeExpired']);
    if (!expired || expired[d] !== L(R, 'CodeExpired') || expired[d + 'Dialog'] !== null) fail(`${R}: 期限が切れても Profile のダイアログが開いたまま (U68)`);
    const started = go(at(...(d === 'host' ? [L('Host', 'Ready.WaitingForOpponent'), L('Client', 'Ready.OpponentReady')] : [L('Host', 'Ready.OpponentReady'), L('Client', 'Ready.WaitingForOpponent')])),
      [`${d}.profile`, `${other}.ready`, 'sys.readyConfirmed']);
    if (!started || started[d] !== L(R, 'Starting') || started[d + 'Dialog'] !== null) fail(`${R}: 読み込み (Starting match…) が始まっても Profile のダイアログが開いたまま (U68)`);
  }
  function pickState(st, d) {
    return [`${d}.profile`, `${d}.dialog.pickEmoji.rocket`].reduce((x, ev) => Engine.fire(x, ev).state, st);
  }

  // 値を固定するのは部屋を作る・入る・相手を探し始めるとき。変えたものが相手に見えるのは次の部屋・次の検索から
  const run = (st, evs, where) => evs.reduce((s, ev) => { if (!s) return s; const r = Engine.fire(s, ev); if (!r) fail(`${where}: ${ev} の行が無い (${s.host} / ${s.client})`); return r && r.state; }, st);
  const shown = (st, d) => st && `${st[d + 'ShownEmoji']} ${say(st[d + 'ShownGreeting'])}`;
  const sc1 = SCENARIOS.find((x) => x.id === '1');
  let room = Engine.replay(sc1, 7).state; // 両者が Ready 画面
  // 部屋にいる間に (ほかのタブなどで) 保存した値が変わっても、この部屋で相手に見えるのは部屋に入ったときの値
  room = Object.assign({}, room, { hostEmoji: '\u{1F680}', hostGreeting: 'bringItOn', clientEmoji: '\u{1F340}', clientGreeting: 'haveFun' });
  let vs = run(room, sc1.steps.slice(7, 12), '固定');
  if (!vs || vs.host !== 'Host.Opponent' || shown(vs, 'host') !== `${EMOJIS[0]} Hello!` || shown(vs, 'client') !== '\u{1F60E} Let\u2019s go!') fail(`部屋に入ったあとに変えた値が、その部屋の VS 画面に出る (${shown(vs, 'host')} / ${shown(vs, 'client')})`);
  // 次の部屋 (ホストが作る・クライアントが入る) から新しい値
  // Back to Friend Match は同じ部屋へ戻るだけなので固定し直さない (U61)。ホストが部屋を閉じて作り直すと新しい値
  let next = run(vs, ['vs.done', 'game.countdownDone', 'host.win', 'host.backToFriendMatch', 'client.backToFriendMatch'], '次の部屋');
  if (next && (shown(next, 'host') !== `${EMOJIS[0]} Hello!` || shown(next, 'client') !== '\u{1F60E} Let\u2019s go!')) fail('同じ部屋へ戻っただけで固定した値が変わる');
  next = run(next, ['sys.roomSynced', 'host.back', 'host.dialog.cancelMatch', 'host.createMatch'], '次の部屋');
  if (shown(next, 'host') !== '\u{1F680} Bring it on!' || shown(next, 'client') !== '\u{1F60E} Let\u2019s go!') fail(`次の部屋を作っても新しい値にならない (${shown(next, 'host')} / ${shown(next, 'client')})`);
  next = run(next, ['client.openJoin', 'client.enterCode', 'client.joinMatch'], '次の部屋');
  if (shown(next, 'client') !== '\u{1F340} Have fun!') fail(`次の部屋に入っても新しい値にならない (${shown(next, 'client')})`);
  // 次の検索から: 探していないとき (Friend Match トップ、Random Match で Ready を待っている間) に保存しただけでは変わらず、
  // Random Match の Ready / Search again / Find Next Opponent で新しい値。Random Match の画面を開いただけ (U62) では固定しない。
  // 相手を探している間に選んだものは、まだ相手がいないので見つかる相手に見える (#1891 の FB 12 / FB 14)
  let srch = run(Engine.initialState(), ['host.friendMatch', 'host.profile', 'host.dialog.pickEmoji.robot', 'host.dialog.closeProfile', 'host.back'], '検索');
  if (srch && srch.hostShownEmoji !== null) fail('検索の前に相手に見せる値が決まっている');
  srch = run(srch, ['host.randomMatch'], '検索');
  if (srch && srch.hostShownEmoji !== null) fail('Random Match の画面を開いただけで値が固定される (U62: Ready で探し始めるときに固定する)');
  srch = run(srch, ['host.startSearch'], '検索');
  if (srch && srch.hostShownEmoji !== '\u{1F916}') fail('Random Match の Ready で値が固定されない');
  srch = run(srch, ['host.leaveApp', 'host.friendMatch', 'host.profile', 'host.dialog.pickEmoji.star', 'host.dialog.closeProfile'], '検索');
  if (srch && srch.hostShownEmoji !== '\u{1F916}') fail('探していないときに保存しただけで、相手に見せる値が変わる');
  srch = run(srch, ['host.back', 'host.randomMatch', 'host.profile', 'host.dialog.pickGreeting.haveFun', 'host.dialog.closeProfile'], '検索');
  if (shown(srch, 'host') !== '\u{1F916} Hello!') fail(`Random Match で Ready を待っている間に選んだだけで、相手に見せる値が変わる (${shown(srch, 'host')})`);
  srch = run(srch, ['host.startSearch'], '検索');
  if (shown(srch, 'host') !== '\u{1F31F} Have fun!') fail(`Ready を待っている間に選んだものが、Ready で固定されない (${shown(srch, 'host')})`);
  srch = run(srch, ['host.profile', 'host.dialog.pickGreeting.letsGo'], '検索');
  if (shown(srch, 'host') !== '\u{1F31F} Let\u2019s go!' || `${srch.hostEmoji} ${say(srch.hostGreeting)}` !== '\u{1F31F} Let\u2019s go!') fail(`相手を探している間に選んだものが、見つかる相手に見える値にならない (${shown(srch, 'host')})`);
  srch = run(srch, ['host.dialog.closeProfile'], '検索');
  srch = run(srch, ['client.randomMatch', 'client.startSearch', 'sys.opponentFound'], '検索');
  if (shown(srch, 'host') !== '\u{1F31F} Let\u2019s go!') fail(`探している間に保存した値が VS 画面に出ない (${shown(srch, 'host')})`);
  srch = Object.assign({}, run(srch, ['vs.done', 'game.countdownDone', 'host.win'], '検索'), { hostEmoji: '\u{1F9E0}' });
  const nextOpp = run(srch, ['host.findNextOpponent'], '検索');
  if (nextOpp && nextOpp.hostShownEmoji !== '\u{1F9E0}') fail('Find Next Opponent で値が固定されない');
  let backToRandom = run(srch, ['host.backToRandomMatch'], '検索');
  if (backToRandom && backToRandom.hostShownEmoji !== '\u{1F31F}') fail('Back to Random Match (Ready を待つだけ) で値が変わる (U59 / U62: メニューの Random Match と同じ)');
  backToRandom = run(backToRandom, ['host.startSearch'], '検索');
  if (backToRandom && backToRandom.hostShownEmoji !== '\u{1F9E0}') fail('Back to Random Match のあとの Ready で値が固定されない');
  const rematch = run(srch, ['client.rematch', 'host.rematch'], '再戦');
  if (rematch && rematch.hostShownEmoji !== '\u{1F31F}') fail('同じ相手との再戦で固定した値が変わる (次の部屋・次の検索ではない)');
  // 固定する行の一覧: イベントが部屋を作る・入る・探し始めるもので、行き先が部屋の画面か相手を探す画面 (失敗や Match Code の誤りの行には無い)。
  // ほかに、相手を探している間に Profile で選ぶ行は、選んだ値を相手に見せる値にも書く (set。探していないときの行は書かない)
  for (const r of TRANSITIONS) {
    const d = Engine.deviceOf(r.event);
    const copies = !!(r.copy && r.copy[d + 'ShownEmoji']);
    const want = d !== null && /\.(createMatch|dialog\.createMatch|joinMatch|startSearch|searchAgain|findNextOpponent)$/.test(r.event) &&
      /\.(FriendMatch\.Lobby\.|Matchmake\.Searching$|Matchmake\.NextOpponent$)/.test(r.to[d]);
    if (copies !== want) fail(`${r.id} (${r.event} → ${r.to[d]}): 相手に見せる値を${copies ? '固定する' : '固定しない'}`);
    if (copies && !r.decided.includes('U56')) fail(`${r.id}: 値を固定する行に決定 U56 が無い`);
    const m = /\.dialog\.pick(Emoji|Greeting)\./.exec(r.event);
    if (m) {
      const whileSearching = states(r.from[d]).every((n) => /\.Matchmake\.(Searching|NextOpponent)$|\.FriendMatch\.Lobby\./.test(n));
      const writes = !!r.set && (d + 'Shown' + m[1]) in r.set;
      if (writes !== whileSearching || (writes && r.set[d + 'Shown' + m[1]] !== r.set[d + m[1]])) fail(`${r.id}: 相手を探している間・部屋の画面${whileSearching ? '' : 'の外'}で選んだ値を相手に見せる値へ${writes ? '書く' : '書かない'}`);
    }
  }
  // どのシナリオでも、相手と向き合う画面 (VS・ゲーム・結果) では両者の値が決まっている
  for (const sc of SCENARIOS) {
    for (let n = 0; n <= sc.steps.length; n++) {
      const st = Engine.replay(sc, n).state;
      for (const d of Engine.DEVICES) if (ctx.isWithOpponent(st[d]) && (!st[d + 'ShownEmoji'] || !st[d + 'ShownGreeting'] || !st[d === 'host' ? 'clientShownEmoji' : 'hostShownEmoji'])) fail(`シナリオ ${sc.id} 手順 ${n}: ${st[d]} で相手に見せる値が決まっていない`);
    }
  }

  // シナリオ 22: 相手を探している間に選ぶ (すぐ保存) → ランダム対戦の VS 画面に出る。再戦の VS 画面にもあいさつは出る
  const sc22 = SCENARIOS.find((x) => x.id === '22');
  const vs22 = sc22 && Engine.replay(sc22, 9).state;
  const search22 = sc22 && Engine.replay(sc22, 5).state;
  if (!search22 || search22.host !== 'Host.Matchmake.Searching' || search22.hostDialog !== 'profile' || search22.hostEmoji !== '\u{1F680}') fail('シナリオ 22 で相手を探している間に Profile のダイアログが開いていないか、選んだものが保存されていない');
  if (!vs22 || vs22.host !== 'Host.Opponent' || shown(vs22, 'host') !== '\u{1F680} Bring it on!' || shown(vs22, 'client') !== '\u{1F60E} Let\u2019s go!') fail(`シナリオ 22 の VS 画面が ${vs22 && shown(vs22, 'host')}`);
  const end22 = sc22 && Engine.replay(sc22);
  if (!end22 || end22.failedAt !== -1 || end22.state.client !== 'Client.Opponent' || shown(end22.state, 'host') !== '\u{1F680} Bring it on!') fail('シナリオ 22 の最後が再戦の VS 画面 (ホストのあいさつ付き) でない');
  if (STAMPS.map((x) => `${x.emoji} ${x.text}`).join(' / ') !== '\u{1F44F} Good game / \u{1F91D} Thanks for the match / \u{1F44D} Nice') fail('結果画面のスタンプ (U27) が変わった');
  const sc22b = SCENARIOS.find((x) => x.id === '22b');
  const end22b = sc22b && Engine.replay(sc22b).state;
  const mid22b = sc22b && Engine.replay(sc22b, 5).state;
  if (!mid22b || mid22b.hostDialog !== null || `${mid22b.hostEmoji} ${say(mid22b.hostGreeting)}` !== '\u{1F916} Good luck!') fail('シナリオ 22b で選んだものが × で閉じたあとに残らない');
  // シナリオ 22c (U68): Ready 画面で選ぶ → 相手が Ready を押してもダイアログは開いたまま → × で閉じて Ready → この対戦の VS 画面に出る
  const sc22c = SCENARIOS.find((x) => x.id === '22c');
  const mid22c = sc22c && Engine.replay(sc22c, 11).state;
  if (!mid22c || mid22c.host !== 'Host.FriendMatch.Lobby.Ready.OpponentReady' || mid22c.hostDialog !== 'profile' || mid22c.hostShownEmoji !== '\u{1F680}') fail('シナリオ 22c で相手が Ready を押すと Profile のダイアログが閉じるか、選んだものが相手に見せる値にならない');
  const end22c = sc22c && Engine.replay(sc22c);
  if (!end22c || end22c.failedAt !== -1 || end22c.state.host !== 'Host.Opponent' || shown(end22c.state, 'host') !== '\u{1F680} Bring it on!') fail(`シナリオ 22c の最後の VS 画面が ${end22c && shown(end22c.state, 'host')} (期待: 🚀 Bring it on!)`);
  if (!end22b || end22b.host !== 'Host.FriendMatch.Room' || end22b.hostDialog !== null || `${end22b.hostEmoji} ${say(end22b.hostGreeting)}` !== '\u{1F31F} Good luck!') fail('シナリオ 22b の最後で選んだ値が残らないか、Friend Match トップに残らない');
  if (SCENARIOS.some((sc) => sc.steps.some((ev) => /saveProfile/.test(ev)))) fail('シナリオに Profile の Save が残っている');

  // localStorage: モックの名前で区切ったキーに保存し、読み直す (新しく開いたアプリ) と同じ値。壊れた値・候補に無い値は最初の値に戻す
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  if (!/^qa2-match-mock\./.test(ProfileStore.KEY)) fail(`localStorage のキー ${ProfileStore.KEY} がモックの名前で区切られていない`);
  const fresh = ProfileStore.load(storage);
  if (JSON.stringify(fresh) !== JSON.stringify({ host: { emoji: EMOJIS[0], greeting: 'hello' }, client: { emoji: '\u{1F60E}', greeting: 'letsGo' } })) fail(`何も保存していないときの値が ${JSON.stringify(fresh)}`);
  const savedState = run(Engine.initialState(ctx.Engine.defaultCtx(), fresh), ['host.friendMatch', 'host.profile', 'host.dialog.pickEmoji.rocket', 'host.dialog.pickGreeting.happyPuzzling', 'host.dialog.closeProfile'], '保存');
  ProfileStore.save(storage, { host: { emoji: savedState.hostEmoji, greeting: savedState.hostGreeting }, client: { emoji: savedState.clientEmoji, greeting: savedState.clientGreeting } });
  const reopened = Engine.initialState(Engine.defaultCtx(), ProfileStore.load(storage));
  if (`${reopened.hostEmoji} ${reopened.hostGreeting}` !== '\u{1F680} happyPuzzling' || reopened.clientEmoji !== '\u{1F60E}') fail(`保存して開き直した値が ${reopened.hostEmoji} ${reopened.hostGreeting}`);
  const opened = Engine.fire(Engine.fire(reopened, 'host.randomMatch').state, 'host.profile').state;
  if (`${opened.hostEmoji} ${opened.hostGreeting}` !== '\u{1F680} happyPuzzling') fail('開き直したあとの Profile の見本が保存した値でない');
  // 前のモック (#1891 FB 13 より前) は英語の文で残していた。読み直すと id になる
  mem.set(ProfileStore.KEY, JSON.stringify({ host: { emoji: EMOJIS[1], greeting: 'Good luck!' }, client: { emoji: '\u{1F60E}', greeting: 'Let\u2019s go!' } }));
  const legacy = ProfileStore.load(storage);
  if (legacy.host.greeting !== 'goodLuck' || legacy.client.greeting !== 'letsGo') fail(`前のモックが残した英語の文を id に読み替えない (${JSON.stringify(legacy)})`);
  for (const bad of ['{', 'null', JSON.stringify({ host: { emoji: 'X', greeting: 'hello' } }), JSON.stringify({ host: { emoji: EMOJIS[1], greeting: 'Hi!' } }), JSON.stringify({ host: { emoji: EMOJIS[1], greeting: 'こんにちは！' } })]) {
    mem.set(ProfileStore.KEY, bad);
    if (ProfileStore.load(storage).host.emoji !== EMOJIS[0]) fail(`壊れた値 ${bad} で最初の値に戻らない`);
  }
  // シナリオは localStorage に関係なく、いつも最初の値から (Engine.replay は保存した値を受け取らない)
  if (Engine.replay(sc22, 0).state.hostEmoji !== EMOJIS[0]) fail('シナリオが最初の値から始まらない');
  if (!/if \(app\.scenario \|\| !storage\) return;/.test(appJs)) fail('app.js がシナリオの再生中にも localStorage に書く');
  console.log('ok  U56 (2026-10-08、入口は #1891 の FB 12): Profile の候補 10 + 10 (アポストロフィは ’、あいさつは日本語と英語、#1891 FB 13)・既定値 👋 "Hello!"・Random Match と Friend Match トップの上にダイアログで開く (Online Battle と専用の画面は無い)・部屋の画面でも開ける (U68)・選ぶとすぐ保存し (FB 14、"Saved" は出さない)、閉じるのは右上の × だけ (U64)・次の部屋と次の検索から相手に見える (探している間と部屋の画面で選んだものはこの対戦の相手にも)・localStorage・再戦の VS 画面にもあいさつは出る');
}

const unused = TRANSITIONS.filter((r) => !used.has(r.id));
console.log(`\n遷移表 ${TRANSITIONS.length} 行のうち ${used.size} 行をシナリオで再生 (残り ${unused.length} 行は自由操作で到達)`);

if (errors.length) {
  console.error('\nNG');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\nすべてのシナリオが遷移表どおりに最後まで再生できました');
