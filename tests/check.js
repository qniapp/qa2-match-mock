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
const { TRANSITIONS, SCREENS, DIALOGS, UNDECIDED, SCENARIOS, EVENT_LABELS, TOASTS, GAME_COUNTDOWN_MS, MATCH_MENU, SURRENDER_CONFIRM, Engine } = ctx;
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const errors = [];
const fail = (msg) => errors.push(msg);
const undecidedIds = new Set(UNDECIDED.map((u) => u.id));
const decidedIds = new Set(UNDECIDED.filter((u) => u.decided).map((u) => u.id));
const openIds = new Set(UNDECIDED.filter((u) => !u.decided).map((u) => u.id));
const states = (pat) => (pat === '*' || pat === '=' ? [] : [].concat(pat));

// js/ のファイルの最上位の var は 1 つの名前空間を共有するので、同じ名前を 2 回宣言すると前の値を黙って上書きする
const topVars = ['transitions.js', 'engine.js', 'scenarios.js'].flatMap((f) => [...read('js', f).matchAll(/^var (\w+)/gm)].map((m) => m[1]));
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

const pair = (st) => `${st.host} / ${st.client}`;
const appJs = read('js', 'app.js');
// ホストのキャンセル (図04): クライアントには "cancelled the match." (Ready からでも、片方が Start Match を押したあとでも)
const sc4 = SCENARIOS.find((x) => x.id === '4');
if (pair(Engine.replay(sc4).state) !== 'Host.FriendMatch.Room / Client.FriendMatch.Lobby.HostCancelled') fail(`シナリオ 4 の最後の状態 ${pair(Engine.replay(sc4).state)}`);

// 対戦後 (決定 U20〜U30、高宮さん 2026-10-07)
const friend = { match: 'friend', rated: false };
const random = { match: 'random', rated: true };
for (const id of ['U20', 'U21', 'U22', 'U23', 'U24', 'U25', 'U26', 'U27', 'U28', 'U29', 'U30']) {
  const u = UNDECIDED.find((x) => x.id === id);
  if (!u || !u.decided || u.decided.by !== '高宮さん' || u.decided.date !== '2026-10-07') fail(`${id} が 高宮さん 2026-10-07 の決定になっていない`);
  for (const r of TRANSITIONS) if (r.undecided.includes(id)) fail(`${r.id}: 決定済みの ${id} が未決として残っている`);
}
// 決まっていない点は新しい未決 (U44〜U50)
for (const id of ['U44', 'U45', 'U46', 'U47', 'U48', 'U49', 'U50']) if (!openIds.has(id)) fail(`未決 ${id} が無い`);
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
      const want = hostInPlay.includes(h) && clientInPlay.includes(c);
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
if (resultNames.length !== 58) fail(`結果画面が ${resultNames.length} 状態 (期待: 58 = 2 端末 × (Win / Lose / Draw × 8 段階 + 降参・切断 4 + No contest))`);
for (const name of resultNames) {
  const s = SCREENS[name];
  if (!['Win', 'Lose', 'Draw', 'NoContest'].includes(s.outcome)) fail(`${name}: 勝敗 ${s.outcome}`);
  if (!END_REASONS[s.reason]) fail(`${name}: 終わった理由 ${s.reason} が無い`);
  if (s.outcome !== 'NoContest' && !DEMO_SCORES[s.outcome]) fail(`${name}: スコアが無い`);
  if (!s.decided.includes('U20')) fail(`${name}: 決定 U20 が無い`);
}
if (/'----'|dim-value/.test(appJs)) fail('app.js に値の決まっていないスコアの ---- が残っている');
const reasons = { finish: 'Match finished', surrendered: 'You surrendered', opponentSurrendered: 'Your opponent surrendered',
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
for (const [id, n, want] of [['15', 13, 'friend/false'], ['15c', 18, 'friend/false'], ['17', 6, 'random/true'], ['17', 11, 'random/false'], ['17', 15, 'random/true'], ['18e', 7, 'random/true']]) {
  if (sessionAt(id, n) !== want) fail(`シナリオ ${id} の手順 ${n} のセッション ${sessionAt(id, n)} (期待: ${want})`);
}

// U22 / U24: ボタン。Friend Match は Rematch / Back to Friend Match、ランダム対戦は Find Next Opponent / Rematch / Back to Online。降参した側は Back to Online だけ
const labels = (name, match) => resultButtons(SCREENS[name], match).map((b) => b.label + (b.disabled ? '(無効)' : '')).join(' / ');
const wantButtons = [
  ['Host.WinResult', 'friend', 'Rematch / Back to Friend Match'],
  ['Host.WinResult', 'random', 'Find Next Opponent / Rematch / Back to Online'],
  ['Host.WinResult.RematchRequested', 'friend', 'Cancel Request / Back to Friend Match'],
  ['Client.LoseResult.RematchIncoming', 'random', 'Find Next Opponent / Rematch / Decline / Back to Online'],
  ['Host.DrawResult.RematchCooldown', 'friend', 'Rematch(無効) / Back to Friend Match'],
  ['Host.WinResult.OpponentLeft', 'friend', 'Back to Friend Match'],
  ['Host.WinResult.OpponentLeft', 'random', 'Find Next Opponent / Back to Online'],
  ['Host.LoseResult.Surrendered', 'friend', 'Back to Online'],
  ['Client.LoseResult.Surrendered', 'random', 'Back to Online'],
  ['Host.WinResult.OpponentSurrendered', 'friend', 'Back to Friend Match'],
  ['Host.NoContestResult', 'random', 'Find Next Opponent / Back to Online'],
];
for (const [name, match, want] of wantButtons) if (labels(name, match) !== want) fail(`${name} (${match}) のボタン ${labels(name, match)} (期待: ${want})`);
// 結果画面のボタンは、どの段階・どちらの対戦でも遷移表の行がある (相手は対になる段階か、すでに抜けた画面)
const PAIRED = { '': '', RematchRequested: 'RematchIncoming', RematchIncoming: 'RematchRequested', RematchCancelled: 'RematchCooldown', RematchDeclined: 'RematchCooldown', RematchExpired: 'RematchCooldown' };
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
      for (const ph of ['', '.RematchRequested', '.RematchIncoming', '.RematchCooldown']) {
        const theirPh = { '': '', '.RematchRequested': '.RematchIncoming', '.RematchIncoming': '.RematchRequested', '.RematchCooldown': '.RematchDeclined' }[ph];
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
const statusText = { RematchRequested: 'Waiting for your opponent…', RematchIncoming: 'Your opponent wants a rematch', RematchCancelled: 'Rematch request was cancelled',
  RematchDeclined: 'Your opponent declined the rematch', RematchExpired: 'No response to rematch request' };
for (const [k, t] of Object.entries(statusText)) if (!REMATCH_STATUS[k] || REMATCH_STATUS[k].text !== t) fail(`${k} の文言が "${t}" でない`);
if (REMATCH_STATUS.RematchCooldown) fail('メッセージを出さない側 (.RematchCooldown) に文言がある');
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
      if (vs && (vs.match !== session.match || vs.rated !== false)) fail(`再戦の VS 画面のセッション ${vs.match}/${vs.rated} (期待: ${session.match}/false)`);
      for (const [ev, want] of [[`${dev}.cancelRematch`, p('.RematchCooldown', '.RematchCancelled')], [`${other}.declineRematch`, p('.RematchDeclined', '.RematchCooldown')],
        ['timer.rematchTimeout', p('.RematchExpired', '.RematchCooldown')]]) {
        const cooled = expectFire(asked, ev, ...want);
        if (!cooled) continue;
        for (const d of ['host', 'client']) if (Engine.canFire(cooled, `${d}.rematch`)) fail(`${want.join(' / ')} (3 秒待ち) で ${d}.rematch の行がある`);
        expectFire(cooled, 'timer.rematchCooldown', H(''), C(''));
      }
    }
  }
  const both = expectFire(at(H(''), C(''), random), 'sys.rematchSimultaneous', 'Host.Opponent', 'Client.Opponent');
  if (both && both.rated !== false) fail('同時の再戦でレートが変わる');
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
if (!/stampsHtml/.test(appJs) || !/r-bubble/.test(appJs) || !/Mute stamps/.test(appJs)) fail('app.js にスタンプ・吹き出し・ミュートの描画が無い');

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
  for (const name of [`${R}.Game.Disconnected`, `${R}.Game.OpponentDisconnected`]) {
    const s = SCREENS[name];
    if (!s || s.view !== 'game' || !s.overlay || !s.undecided.includes('U46')) fail(`${name} が切断を待つゲーム画面 (未決 U46) になっていない`);
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
  if (Engine.canFire(st(next), `${dev}.leaveApp`)) fail(`${next} で leaveApp の行がある (U47 で未決)`);
  const nf = SCREENS[`${next}.NotFound`];
  if (!nf.notice || nf.notice.text !== 'No opponent found.' || nf.notice.buttons.map((b) => `${b.label}:${b.event}`).join() !== 'Search again:searchAgain,Back to Online:backToOnlineBattle') fail(`${next}.NotFound の通知が "No opponent found." と Search again / Back to Online でない`);
  if (SCREENS[next].status !== 'Searching for an opponent…') fail(`${next} の表示が Random Match と同じでない`);
  const found = expectFire(at(...sides(dev, next, `${O}.Matchmake`)), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
  if (found && (found.match !== 'random' || found.rated !== true)) fail('次の相手との対戦がレートの変わるランダム対戦になっていない');
}

// 秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値が仮であることは右パネル (説明) と README に書く
const resultContext = [].concat(SCREENS['Host.WinResult'].context).join();
if (!/1000/.test(resultContext) || !/K=24/.test(resultContext) || !/仮の値/.test(resultContext)) fail('結果画面の右パネルに Elo の値が仮であることが無い');
for (const [name, want] of [['Host.WinResult.RematchRequested', /20 秒 \(仮\)/], ['Host.WinResult.RematchDeclined', /3 秒 \(仮\)/], ['Host.WinResult', /5 秒 \(仮\)/],
  ['Host.Game.OpponentDisconnected', /20 秒 \(仮\)/], ['Host.Matchmake.NextOpponent', /60 秒 \(仮\)/]]) {
  if (!want.test([].concat(SCREENS[name].context).join())) fail(`${name} の右パネルに ${want} が無い`);
}
for (const [k, v] of Object.entries(Object.assign({}, END_REASONS, ...Object.values(REMATCH_STATUS).map((x, i) => ({ [i]: x.text }))))) if (/\d/.test(v)) fail(`結果画面の文言に数字: ${k} ${v}`);

// シナリオの流れ (手順ごとの両端末の状態)
const flows = {
  '15': [[13, 'Host.WinResult / Client.LoseResult'], [14, 'Host.FriendMatch.Room / Client.LoseResult.OpponentLeft'], [15, 'Host.FriendMatch.Room / Client.FriendMatch.Room']],
  '15b': [[13, 'Host.LoseResult / Client.WinResult'], [14, 'Host.LoseResult.OpponentLeft / Client.FriendMatch.Room']],
  '15c': [[14, 'Host.WinResult.RematchIncoming / Client.LoseResult.RematchRequested'], [15, 'Host.Opponent / Client.Opponent'], [18, 'Host.LoseResult / Client.WinResult']],
  '15d': [[15, 'Host.WinResult.RematchCooldown / Client.LoseResult.RematchCancelled'], [16, 'Host.WinResult / Client.LoseResult'], [18, 'Host.Opponent / Client.Opponent']],
  '15e': [[15, 'Host.WinResult.RematchCooldown / Client.LoseResult.RematchDeclined'], [17, 'Host.WinResult.OpponentLeft / Client.FriendMatch.Room']],
  '15f': [[15, 'Host.WinResult.RematchExpired / Client.LoseResult.RematchCooldown'], [16, 'Host.WinResult / Client.LoseResult'], [18, 'Host.Opponent / Client.Opponent']],
  '15g': [[13, 'Host.DrawResult / Client.DrawResult'], [14, 'Host.Opponent / Client.Opponent'], [16, 'Host.Game.Play / Client.Game.Play']],
  '16d': [[8, 'Host.WinResult.OpponentSurrendered / Client.LoseResult.Surrendered'], [10, 'Host.Matchmake.NextOpponent / Client.MultiModeSelection']],
  '17': [[6, 'Host.WinResult / Client.LoseResult'], [8, 'Host.Opponent / Client.Opponent'], [11, 'Host.LoseResult / Client.WinResult'],
    [12, 'Host.Matchmake.NextOpponent / Client.WinResult.OpponentLeft'], [15, 'Host.Opponent / Client.Opponent']],
  '17b': [[8, 'Host.Matchmake.NextOpponent.NotFound / Client.WinResult.OpponentLeft'], [9, 'Host.Matchmake.NextOpponent / Client.WinResult.OpponentLeft'], [11, 'Host.MultiModeSelection / Client.WinResult.OpponentLeft']],
  '18': [[13, 'Host.Game.OpponentDisconnected / Client.Game.Disconnected'], [14, 'Host.WinResult.OpponentDisconnected / Client.LoseResult.Disconnected']],
  '18b': [[13, 'Host.Game.Disconnected / Client.Game.OpponentDisconnected'], [14, 'Host.Game.Play / Client.Game.Play'], [15, 'Host.WinResult / Client.LoseResult']],
  '18c': [[14, 'Host.NoContestResult / Client.NoContestResult']],
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
const stampFlow = [13, 14, 15, 16, 17, 18, 19, 20].map((n) => { const st = Engine.replay(sc15h, n).state; return `${st.hostStamp},${st.clientStamp},${st.clientMute}`; }).join(' → ');
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
// 相手を探す画面は "Searching for an opponent…" と大きな Cancel
const u13a = UNDECIDED.find((u) => u.id === 'U13a');
if (!u13a || !u13a.decided) fail('U13a が決定済みになっていない');
if (!/Friend Match/.test(u31.title)) fail('U31 の題名が Friend Match だけの決定になっていない');
expectFire(at('Host.Matchmake', 'Client.Matchmake'), 'sys.opponentFound', 'Host.Opponent', 'Client.Opponent');
const randomStates = ['Host.Matchmake', 'Client.Matchmake'];
const friendStart = /\.FriendMatch\.Lobby\.(Ready|Starting|StartFailed)/;
for (const r of TRANSITIONS) {
  const fromRandom = Engine.DEVICES.some((d) => states(r.from[d]).some((s) => s.startsWith('Host.Matchmake') || s.startsWith('Client.Matchmake')));
  if (fromRandom && Engine.DEVICES.some((d) => friendStart.test(r.to[d]))) fail(`${r.id}: ランダム対戦から ${r.to.host} / ${r.to.client} (Ready / Start Match) へ進む`);
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
if (/pillHtml\(id, 'pill-decided'/.test(appJs)) fail('app.js が端末の上に「決定」バッジを出している');
console.log('ok  端末の画面と端末の上に決定の注記・バッジが無い');

// 端末の画面には仮・未決の印やモックの注記も出さない (未決は端末の上の帯、説明は右パネル)。
// 実際の描画は tests/scan-screens.mjs が全シナリオの全手順で確かめる
if (/mock-note|class="tmp"|pill-undecided small inline|btn-wrap/.test(appJs)) fail('app.js が端末の画面に仮・未決の印やモックの注記を出している');
// 結果画面の決まっていない点は端末の上の帯 (未決バッジ) と右パネルの説明に出す
for (const [name, s] of Object.entries(SCREENS)) {
  if (s.view !== 'result') continue;
  const want = [].concat(s.stamps ? ['U49'] : [], /Cooldown$/.test(name) ? ['U50'] : [], s.reason === 'finish' ? ['U44'] : [],
    /\.(OpponentSurrendered|Disconnected|OpponentDisconnected)$|NoContest/.test(name) ? ['U45'] : []);
  for (const id of want) if (!s.undecided.includes(id)) fail(`${name}: 端末の上の帯に未決 ${id} が無い`);
  if (!/仮の値/.test([].concat(s.context).join())) fail(`${name}: 右パネルに秒数・Elo の値が仮だという説明が無い`);
}
console.log('ok  結果画面の未決の印は端末の上の帯、仮の値の説明は右パネルに出す');

const unused = TRANSITIONS.filter((r) => !used.has(r.id));
console.log(`\n遷移表 ${TRANSITIONS.length} 行のうち ${used.size} 行をシナリオで再生 (残り ${unused.length} 行は自由操作で到達)`);

if (errors.length) {
  console.error('\nNG');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\nすべてのシナリオが遷移表どおりに最後まで再生できました');
