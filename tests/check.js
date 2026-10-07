#!/usr/bin/env node
// 全シナリオを遷移表で再生し、すべての手順が表の行に一致することを確かめる。
// 使い方: node tests/check.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({});
for (const f of ['transitions.js', 'engine.js', 'scenarios.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const { TRANSITIONS, SCREENS, DIALOGS, UNDECIDED, SCENARIOS, EVENT_LABELS, TOASTS, GAME_COUNTDOWN_MS, MATCH_MENU, SURRENDER_CONFIRM, SURRENDER_STATUS, Engine } = ctx;
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const errors = [];
const fail = (msg) => errors.push(msg);
const undecidedIds = new Set(UNDECIDED.map((u) => u.id));
const decidedIds = new Set(UNDECIDED.filter((u) => u.decided).map((u) => u.id));
const openIds = new Set(UNDECIDED.filter((u) => !u.decided).map((u) => u.id));
const states = (pat) => (pat === '*' || pat === '=' ? [] : [].concat(pat));

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
  if (/3·2·1 → ゲーム/.test(sc.desc)) fail(`シナリオ ${sc.id} の説明が 3·2·1 → ゲーム のまま`);
}
if (/countdown: function|cd-nums|Match start/.test(read('js', 'app.js'))) fail('app.js にモック独自のカウントダウン画面が残っている');
if (/\.cd-nums|\.countdown \{/.test(read('css', 'style.css'))) fail('style.css にモック独自のカウントダウンのスタイルが残っている');

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

// シナリオが前提にしていない未決トグルは、どの選択肢にしても最後まで再生できること
for (const sc of SCENARIOS) {
  for (const u of UNDECIDED.filter((x) => x.options && !(sc.opts && x.id in sc.opts))) {
    for (const o of u.options) {
      const res = Engine.replay(sc, undefined, { [u.id]: o.value });
      if (res.failedAt !== -1) {
        fail(`シナリオ ${sc.id}: ${u.id}=${o.value} だと手順 ${res.failedAt + 1} (${Engine.stepEvent(sc.steps[res.failedAt])}) で止まる`);
      }
    }
  }
}

// 決定 (U31): 開始は両者の Start Match だけ。Ready 後の自動開始 (sys.autoStart・U31 トグル・シナリオ 1b の別案) は残っていない
const u31 = UNDECIDED.find((u) => u.id === 'U31');
if (!u31 || !u31.decided) fail('U31 が決定済みになっていない');
for (const id of ['U33', 'U34', 'U35', 'U36']) if (!openIds.has(id)) fail(`未決 ${id} が無い`);
if (EVENT_LABELS['sys.autoStart']) fail('sys.autoStart のラベルが残っている');
for (const r of TRANSITIONS) {
  if (r.event === 'sys.autoStart') fail(`${r.id}: 自動開始の sys.autoStart が残っている`);
  if (r.when && 'U31' in r.when) fail(`${r.id}: U31 のトグル条件が残っている`);
  if (r.event === 'sys.bothStarted' && (r.from.host !== 'Host.FriendMatch.Lobby.Starting' || r.from.client !== 'Client.FriendMatch.Lobby.Starting')) fail(`${r.id}: 両者が押す前に開始する`);
}
for (const sc of SCENARIOS) {
  if (sc.opts && 'U31' in sc.opts) fail(`シナリオ ${sc.id} が U31 のトグルを前提にしている`);
  if (sc.steps.some((st) => Engine.stepEvent(st) === 'sys.autoStart')) fail(`シナリオ ${sc.id} に sys.autoStart が残っている`);
  if (/自動開始|自動で開始/.test(sc.title)) fail(`シナリオ ${sc.id} が自動開始の別案のまま`);
}
// Ready のまま、または片方だけ押した状態からは、自動遷移でも環境イベントでも VS 画面に進まない
const toVs = (r) => r.to.host === 'Host.Opponent' || r.to.client === 'Client.Opponent';
for (const h of ['Host.FriendMatch.Lobby.Ready', 'Host.FriendMatch.Lobby.Ready.WaitingForFriend', 'Host.FriendMatch.Lobby.Ready.FriendReady']) {
  for (const c of ['Client.FriendMatch.Lobby.Ready', 'Client.FriendMatch.Lobby.Ready.WaitingForFriend', 'Client.FriendMatch.Lobby.Ready.FriendReady']) {
    for (const r of TRANSITIONS) {
      const st = Object.assign(Engine.initialState(), { host: h, client: c });
      if (toVs(r) && Engine.findRow(st, r.event) === r) fail(`${h} / ${c} から ${r.id} (${r.event}) で VS 画面へ進む`);
    }
  }
}

const at = (host, client) => Object.assign(Engine.initialState(), { host, client });
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
    if (r.to[d] === game && ![cd, `${R}.Game.MatchMenu`, `${R}.Game.SurrenderConfirm`].includes(r.from[d])) fail(`${r.id}: ${game} にカウントダウンを経ずに入る`);
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

// 決定 (U31): どちらが先に押しても、1 回目で「押した側は待機 / 相手側は Friend is ready!」、2 回目で開始 → VS 画面
const startOrders = [
  ['host', 'client', 'Host.FriendMatch.Lobby.Ready.WaitingForFriend', 'Client.FriendMatch.Lobby.Ready.FriendReady'],
  ['client', 'host', 'Host.FriendMatch.Lobby.Ready.FriendReady', 'Client.FriendMatch.Lobby.Ready.WaitingForFriend'],
];
for (const [first, second, h1, c1] of startOrders) {
  const s1 = expectFire(at('Host.FriendMatch.Lobby.Ready', 'Client.FriendMatch.Lobby.Ready'), `${first}.startMatch`, h1, c1);
  if (!s1) continue;
  if (Engine.canFire(s1, `${first}.startMatch`)) fail(`${first} が押したあとも Start Match を押せる`);
  for (const ev of ['net.unstable', 'host.back', 'client.back', 'timer.codeExpired']) {
    if (Engine.canFire(s1, ev)) fail(`片方だけ押した状態 ${h1} / ${c1} で ${ev} の行がある (U33 / U35 で未決)`);
  }
  const s2 = expectFire(s1, `${second}.startMatch`, 'Host.FriendMatch.Lobby.Starting', 'Client.FriendMatch.Lobby.Starting');
  if (s2) expectFire(s2, 'sys.bothStarted', 'Host.Opponent', 'Client.Opponent');
}
const presserScreens = { 'Host.FriendMatch.Lobby.Ready.WaitingForFriend': 'host', 'Client.FriendMatch.Lobby.Ready.WaitingForFriend': 'client' };
for (const [name, dev] of Object.entries(presserScreens)) {
  const s = SCREENS[name];
  if (s.status !== 'Waiting for your friend…') fail(`${name} の表示が "Waiting for your friend…" でない`);
  const startBtn = s.buttons.find((b) => b.label === 'Start Match');
  if (!startBtn || !startBtn.disabled || startBtn.event) fail(`${name} の Start Match が無効表示になっていない`);
  if (!s.buttons.some((b) => b.label === (dev === 'host' ? 'Cancel Match' : 'Leave Match'))) fail(`${name} にキャンセル / 退出のボタンが無い`);
}
for (const name of ['Host.FriendMatch.Lobby.Ready.FriendReady', 'Client.FriendMatch.Lobby.Ready.FriendReady']) {
  const s = SCREENS[name];
  if (!s.peerReady) fail(`${name} に "Friend is ready!" の表示が無い`);
  if (!s.buttons.some((b) => b.event === 'startMatch' && !b.disabled)) fail(`${name} で Start Match を押せない`);
}
if (!/Friend is ready!/.test(read('js', 'app.js'))) fail('app.js に "Friend is ready!" の描画が無い');
// シナリオ 1 (ホストが先) と 1b (クライアントが先): 1 回目・2 回目の押下と VS 画面
for (const [id, afterFirst] of [['1', 'Host.FriendMatch.Lobby.Ready.WaitingForFriend / Client.FriendMatch.Lobby.Ready.FriendReady'], ['1b', 'Host.FriendMatch.Lobby.Ready.FriendReady / Client.FriendMatch.Lobby.Ready.WaitingForFriend']]) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  const i = sc.steps.findIndex((st) => /\.startMatch$/.test(Engine.stepEvent(st)));
  const got = [i + 1, i + 2, i + 3].map((n) => { const st = Engine.replay(sc, n).state; return `${st.host} / ${st.client}`; });
  const want = [afterFirst, 'Host.FriendMatch.Lobby.Starting / Client.FriendMatch.Lobby.Starting', 'Host.Opponent / Client.Opponent'];
  if (got.join() !== want.join()) fail(`シナリオ ${id} の開始の流れ ${got.join(' → ')} (期待: ${want.join(' → ')})`);
}
console.log('ok  U31: 両者の Start Match で開始 (ホストが先 / クライアントが先)、自動開始なし');

// 対戦後 (Win / Lose) の遷移
const inGame = at('Host.Game.Play', 'Client.Game.Play');
expectFire(inGame, 'host.win', 'Host.WinResult', 'Client.LoseResult');
expectFire(inGame, 'host.lose', 'Host.LoseResult', 'Client.WinResult');
expectFire(inGame, 'client.win', 'Host.LoseResult', 'Client.WinResult');
expectFire(inGame, 'client.lose', 'Host.WinResult', 'Client.LoseResult');

// Win / Lose は両端末が試合中のときだけ行がある。MATCH MENU や降参の確認を開いていても試合は続く (決定 U37)
const hostInPlay = ['Host.Game.Play', 'Host.Game.MatchMenu', 'Host.Game.SurrenderConfirm'];
const clientInPlay = ['Client.Game.Play', 'Client.Game.MatchMenu', 'Client.Game.SurrenderConfirm'];
const hostStates = Object.keys(SCREENS).filter((k) => k.startsWith('Host.'));
const clientStates = Object.keys(SCREENS).filter((k) => k.startsWith('Client.'));
if (hostStates.length + clientStates.length !== Object.keys(SCREENS).length) fail('Host. / Client. で始まらない状態がある');
for (const h of hostStates) {
  for (const c of clientStates) {
    for (const ev of ['host.win', 'host.lose', 'client.win', 'client.lose']) {
      const want = hostInPlay.includes(h) && clientInPlay.includes(c);
      if (Engine.canFire(at(h, c), ev) !== want) fail(`${h} / ${c} で ${ev} の行が${want ? '無い' : 'ある'}`);
    }
  }
}
// カウントダウン中は Win / Lose を押せない (メニューボタンもまだ無い)
for (const ev of ['host.win', 'host.lose', 'client.win', 'client.lose']) {
  if (Engine.canFire(at('Host.Game.Countdown', 'Client.Game.Countdown'), ev)) fail(`カウントダウン中に ${ev} の行がある`);
  if (!Engine.canFire(at('Host.Game.Play', 'Client.Game.Play'), ev)) fail(`プレイ中に ${ev} の行が無い`);
}

// 再戦 (仮): どちらが先に押しても、両者が押したら VS 画面
for (const [first, second] of [['host', 'client'], ['client', 'host']]) {
  const asked = first === 'host' ? ['Host.WinResult.RematchWaiting', 'Client.LoseResult.RematchRequested'] : ['Host.WinResult.RematchRequested', 'Client.LoseResult.RematchWaiting'];
  const s1 = expectFire(at('Host.WinResult', 'Client.LoseResult'), `${first}.rematch`, ...asked);
  if (s1) {
    if (Engine.canFire(s1, `${first}.rematch`)) fail(`${first} が再戦待ちのまま Rematch を押せる`);
    expectFire(s1, `${second}.rematch`, 'Host.Opponent', 'Client.Opponent');
  }
}
// Back to Friend Match (仮): 押した側だけ Friend Match トップ、相手は結果画面のまま
expectFire(at('Host.LoseResult.RematchRequested', 'Client.WinResult.RematchWaiting'), 'host.backToFriendMatch', 'Host.FriendMatch.Room', 'Client.WinResult.RematchWaiting');
expectFire(at('Host.WinResult', 'Client.LoseResult'), 'client.backToFriendMatch', 'Host.WinResult', 'Client.FriendMatch.Room');
expectFire(at('Host.FriendMatch.Room', 'Client.LoseResult'), 'client.backToFriendMatch', 'Host.FriendMatch.Room', 'Client.FriendMatch.Room');
if (Engine.canFire(at('Host.FriendMatch.Room', 'Client.LoseResult.RematchRequested'), 'client.rematch')) fail('相手が抜けたあとも Rematch を押せる');

// 対戦後のシナリオの最終状態
// [勝敗直後, 最後] の状態
const postMatch = {
  '15': ['Host.WinResult / Client.LoseResult', 'Host.FriendMatch.Room / Client.FriendMatch.Room'],
  '15b': ['Host.LoseResult / Client.WinResult', 'Host.LoseResult / Client.FriendMatch.Room'],
  '15c': ['Host.WinResult / Client.LoseResult', 'Host.LoseResult / Client.WinResult'],
};
const pair = (st) => `${st.host} / ${st.client}`;
for (const [id, [afterResult, last]] of Object.entries(postMatch)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  const end = pair(Engine.replay(sc).state);
  if (end !== last) fail(`シナリオ ${id} の最後の状態 ${end} (期待: ${last})`);
  const first = sc.steps.findIndex((st) => /\.(win|lose)$/.test(Engine.stepEvent(st)));
  const mid = pair(Engine.replay(sc, first + 1).state);
  if (mid !== afterResult) fail(`シナリオ ${id} の勝敗直後の状態 ${mid} (期待: ${afterResult})`);
}
console.log('ok  対戦後: Win / Lose・再戦・Back to Friend Match の遷移');

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
  expectFire(st(`${R}.LoseResult.Surrendered`, `${O}.WinResult.OpponentSurrendered`), `${other}.backToFriendMatch`,
    ...pair2(`${R}.LoseResult.Surrendered`, `${O}.FriendMatch.Room`));
  if (Engine.canFire(at('Host.Game.Countdown', 'Client.Game.Countdown'), `${dev}.matchMenu`)) fail(`カウントダウン中に ${dev}.matchMenu の行がある`);
  for (const name of [menu, confirm]) {
    const s = SCREENS[name];
    if (s.view !== 'game' || !s.menu) fail(`${name} がメニュー付きのゲーム画面になっていない`);
  }
  for (const [name, who] of [[`${R}.LoseResult.Surrendered`, 'self'], [`${R}.WinResult.OpponentSurrendered`, 'opponent']]) {
    const s = SCREENS[name];
    if (!s || s.surrender !== who) { fail(`${name} が降参の結果画面になっていない`); continue; }
    if (s.buttons.some((b) => b.event === 'rematch')) fail(`${name} に Rematch がある`);
  }
}
if (MATCH_MENU.title !== 'MATCH MENU' || !/continues while the menu is open/.test(MATCH_MENU.body)) fail('MATCH MENU のタイトルか「試合は続く」の一文が無い');
if (MATCH_MENU.buttons.map((b) => b.label).join() !== 'CONTINUE,SURRENDER') fail('MATCH MENU のボタンが CONTINUE / SURRENDER でない (REMATCH / QUIT は無い)');
if (SURRENDER_CONFIRM.title !== 'Surrender?' || SURRENDER_CONFIRM.body !== 'You will lose.') fail('降参の確認の文言が "Surrender?" / "You will lose." でない');
if (SURRENDER_CONFIRM.buttons.map((b) => b.label).join() !== 'CONTINUE,SURRENDER') fail('降参の確認のボタンが CONTINUE / SURRENDER でない');
if (SURRENDER_STATUS.opponent !== 'Your opponent surrendered') fail('勝った側に "Your opponent surrendered" が出ない');
for (const r of TRANSITIONS) if (/\.(pause|quit|continue|pauseRematch)$/.test(r.event) && !/(matchMenu|surrenderConfirm)\./.test(r.event)) fail(`${r.id}: ポーズの ${r.event} が残っている`);
for (const k of Object.keys(SCREENS)) if (/\.Game\.Pause$/.test(k)) fail(`ポーズの状態 ${k} が残っている`);
if (/timeScale|g-pause|p-dim/.test(read('js', 'app.js') + read('css', 'style.css'))) fail('app.js / style.css にポーズ (試合を止める表示) が残っている');
// モック専用の "Game in progress (mock)" は無くなった
for (const r of TRANSITIONS) if (/backToOnline$/.test(r.event)) fail(`${r.id}: モック専用の ${r.event} が残っている`);
if (/Game in progress/.test(read('js', 'app.js'))) fail('app.js にモック専用のゲーム画面の表示が残っている');
// [手順の途中, 最後] の状態
const menuScenarios = {
  '16': [14, 'Host.Game.MatchMenu / Client.Game.MatchMenu', 'Host.Game.Play / Client.Game.Play'],
  '16b': [18, 'Host.LoseResult.Surrendered / Client.WinResult.OpponentSurrendered', 'Host.MultiModeSelection / Client.WinResult.OpponentSurrendered'],
  '16c': [13, 'Host.Game.MatchMenu / Client.Game.Play', 'Host.LoseResult / Client.WinResult'],
};
for (const [id, [n, mid, last]] of Object.entries(menuScenarios)) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  const got = [pair(Engine.replay(sc, n).state), pair(Engine.replay(sc).state)];
  if (got.join() !== [mid, last].join()) fail(`シナリオ ${id} の状態 ${got.join(' → ')} (期待: ${mid} → ${last})`);
}
console.log('ok  MATCH MENU: 開いても相手は変わらない / CONTINUE / SURRENDER → 確認 → 負け + 相手に "Your opponent surrendered" (両端末)、メニュー中も Win / Lose');

// 決定 (U13a): ランダム対戦は相手が見つかり次第 VS 画面へ。Ready / Start Match / Starting match… を挟まない (U31 は Friend Match だけ)。
// 相手を探す画面は "Searching for an opponent…" と大きな Cancel で、Cancel は Online Battle へ戻る
const u13a = UNDECIDED.find((u) => u.id === 'U13a');
if (!u13a || !u13a.decided) fail('U13a が決定済みになっていない');
if (!openIds.has('U13')) fail('U13 (ランダム対戦の残り) が未決として残っていない');
if (!/Friend Match/.test(u31.title)) fail('U31 の題名が Friend Match だけの決定になっていない');
expectFire(at('Host.Matchmake', 'Client.Matchmake'), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
expectFire(at('Host.Matchmake', 'Client.MultiModeSelection'), 'host.cancelSearch', 'Host.MultiModeSelection', 'Client.MultiModeSelection');
expectFire(at('Host.MultiModeSelection', 'Client.Matchmake'), 'client.cancelSearch', 'Host.MultiModeSelection', 'Client.MultiModeSelection');
const randomStates = ['Host.Matchmake', 'Client.Matchmake'];
const friendStart = /\.FriendMatch\.Lobby\.(Ready|Starting|StartFailed)/;
for (const r of TRANSITIONS) {
  const fromRandom = Engine.DEVICES.some((d) => states(r.from[d]).some((s) => randomStates.includes(s)));
  if (fromRandom && Engine.DEVICES.some((d) => friendStart.test(r.to[d]))) fail(`${r.id}: ランダム対戦から ${r.to.host} / ${r.to.client} (Ready / Start Match) へ進む`);
  if (r.event === 'sys.opponentFound' && !r.decided.includes('U13a')) fail(`${r.id}: 相手が見つかる行に決定 U13a が無い`);
  if (r.decided.includes('U31') && Engine.DEVICES.some((d) => states(r.from[d]).some((s) => randomStates.includes(s)))) fail(`${r.id}: ランダム対戦の行に U31 が付いている`);
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
const sc11b = SCENARIOS.find((x) => x.id === '11b');
const got11b = sc11b ? [1, 2].map((n) => pair(Engine.replay(sc11b, n).state)).join(' → ') : 'なし';
if (got11b !== 'Host.Matchmake / Client.MultiModeSelection → Host.MultiModeSelection / Client.MultiModeSelection') fail(`シナリオ 11b の流れ ${got11b}`);
console.log('ok  U13a: ランダム対戦は相手が見つかり次第 VS 画面、Searching + Cancel、Cancel で Online Battle');

// 端末の画面にはゲームが出すものだけ: 決定の注記や「決定」バッジは端末の中にも端末の上にも出さない (右パネルへ)
const appJs = read('js', 'app.js');
if (/decided-note|decidedNoteHtml|GAME_COUNTDOWN_PREMISE/.test(appJs)) fail('app.js が端末の画面に決定の注記を出している');
if (/pillHtml\(id, 'pill-decided'/.test(appJs)) fail('app.js が端末の上に「決定」バッジを出している');
console.log('ok  端末の画面と端末の上に決定の注記・バッジが無い');

// 端末の画面には仮・未決の印やモックの注記も出さない (未決は端末の上の帯、説明は右パネル)。
// 実際の描画は tests/scan-screens.mjs が全シナリオの全手順で確かめる
if (/mock-note|class="tmp"|pill-undecided small inline|btn-wrap/.test(appJs)) fail('app.js が端末の画面に仮・未決の印やモックの注記を出している');
for (const [name, s] of Object.entries(SCREENS)) {
  if (s.view !== 'result') continue;
  // 再戦 (U23) と Back to Friend Match の戻り先 (U24) は、そのボタンがある結果画面だけ
  const events = (s.buttons || [{ event: 'rematch' }, { event: 'backToFriendMatch' }]).map((b) => b.event);
  const want = ['U21'].concat(events.includes('rematch') ? ['U23'] : [], events.includes('backToFriendMatch') ? ['U24'] : [], s.rematch === 'wait' ? ['U30'] : []);
  for (const id of want) if (!s.undecided.includes(id)) fail(`${name}: 端末の上の帯に未決 ${id} が無い`);
  if (!/仮の表示/.test([].concat(s.context).join())) fail(`${name}: 右パネルに Rank / Score が仮の表示だという説明が無い`);
}
console.log('ok  結果画面の仮・未決の印は端末の上の帯と右パネルに出す');

const unused = TRANSITIONS.filter((r) => !used.has(r.id));
console.log(`\n遷移表 ${TRANSITIONS.length} 行のうち ${used.size} 行をシナリオで再生 (残り ${unused.length} 行は自由操作で到達)`);

if (errors.length) {
  console.error('\nNG');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\nすべてのシナリオが遷移表どおりに最後まで再生できました');
