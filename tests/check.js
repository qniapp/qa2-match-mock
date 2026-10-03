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
const { TRANSITIONS, SCREENS, DIALOGS, UNDECIDED, SCENARIOS, EVENT_LABELS, TOASTS, GAME_COUNTDOWN_MS, Engine } = ctx;
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

// モック独自の 3·2·1 (VS 画面のあとのカウントダウン画面) が残っていない
for (const name of Object.keys(SCREENS)) {
  if (/^[HC]_COUNTDOWN$/.test(name)) fail(`モック独自のカウントダウン状態 ${name} が残っている`);
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
  if (r.event === 'sys.bothStarted' && (r.from.host !== 'H_STARTING' || r.from.client !== 'C_STARTING')) fail(`${r.id}: 両者が押す前に開始する`);
}
for (const sc of SCENARIOS) {
  if (sc.opts && 'U31' in sc.opts) fail(`シナリオ ${sc.id} が U31 のトグルを前提にしている`);
  if (sc.steps.some((st) => Engine.stepEvent(st) === 'sys.autoStart')) fail(`シナリオ ${sc.id} に sys.autoStart が残っている`);
  if (/自動開始|自動で開始/.test(sc.title)) fail(`シナリオ ${sc.id} が自動開始の別案のまま`);
}
// Ready のまま、または片方だけ押した状態からは、自動遷移でも環境イベントでも VS 画面に進まない
const toVs = (r) => r.to.host === 'H_VS' || r.to.client === 'C_VS';
for (const h of ['H_READY', 'H_READY_WAITING', 'H_READY_PEER_READY']) {
  for (const c of ['C_READY', 'C_READY_WAITING', 'C_READY_PEER_READY']) {
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
const counting = expectFire(at('H_VS', 'C_VS'), 'vs.done', 'H_GAME_COUNTDOWN', 'C_GAME_COUNTDOWN');
if (counting) expectFire(counting, 'game.countdownDone', 'H_GAME', 'C_GAME');
for (const r of TRANSITIONS) {
  for (const [d, vs, cd, game] of [['host', 'H_VS', 'H_GAME_COUNTDOWN', 'H_GAME'], ['client', 'C_VS', 'C_GAME_COUNTDOWN', 'C_GAME']]) {
    if (r.from[d] === vs && r.event === 'vs.done' && r.to[d] !== cd) fail(`${r.id}: VS 画面のあと ${r.to[d]} (期待: ${cd})`);
    if (r.to[d] === game && r.from[d] !== cd) fail(`${r.id}: ${game} にカウントダウンを経ずに入る`);
  }
}
const cdRow = TRANSITIONS.find((r) => r.event === 'game.countdownDone');
if (!cdRow || cdRow.auto !== GAME_COUNTDOWN_MS || GAME_COUNTDOWN_MS !== 3400) fail('game.countdownDone の自動遷移が 1 秒 + 0.8 秒 × 3 になっていない');
for (const sc of SCENARIOS) {
  const res = Engine.replay(sc);
  res.fired.forEach((r, i) => {
    if (r.event !== 'vs.done') return;
    const st = Engine.replay(sc, i + 1).state;
    if (st.host !== 'H_GAME_COUNTDOWN' || st.client !== 'C_GAME_COUNTDOWN') fail(`シナリオ ${sc.id}: VS 画面のあと ${st.host} / ${st.client}`);
  });
}
console.log('ok  VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (両端末)');

// 決定 (U31): どちらが先に押しても、1 回目で「押した側は待機 / 相手側は Friend is ready!」、2 回目で開始 → VS 画面
const startOrders = [
  ['host', 'client', 'H_READY_WAITING', 'C_READY_PEER_READY'],
  ['client', 'host', 'H_READY_PEER_READY', 'C_READY_WAITING'],
];
for (const [first, second, h1, c1] of startOrders) {
  const s1 = expectFire(at('H_READY', 'C_READY'), `${first}.startMatch`, h1, c1);
  if (!s1) continue;
  if (Engine.canFire(s1, `${first}.startMatch`)) fail(`${first} が押したあとも Start Match を押せる`);
  for (const ev of ['net.unstable', 'host.back', 'client.back', 'timer.codeExpired']) {
    if (Engine.canFire(s1, ev)) fail(`片方だけ押した状態 ${h1} / ${c1} で ${ev} の行がある (U33 / U35 で未決)`);
  }
  const s2 = expectFire(s1, `${second}.startMatch`, 'H_STARTING', 'C_STARTING');
  if (s2) expectFire(s2, 'sys.bothStarted', 'H_VS', 'C_VS');
}
const presserScreens = { H_READY_WAITING: 'host', C_READY_WAITING: 'client' };
for (const [name, dev] of Object.entries(presserScreens)) {
  const s = SCREENS[name];
  if (s.status !== 'Waiting for your friend…') fail(`${name} の表示が "Waiting for your friend…" でない`);
  const startBtn = s.buttons.find((b) => b.label === 'Start Match');
  if (!startBtn || !startBtn.disabled || startBtn.event) fail(`${name} の Start Match が無効表示になっていない`);
  if (!s.buttons.some((b) => b.label === (dev === 'host' ? 'Cancel Match' : 'Leave Match'))) fail(`${name} にキャンセル / 退出のボタンが無い`);
}
for (const name of ['H_READY_PEER_READY', 'C_READY_PEER_READY']) {
  const s = SCREENS[name];
  if (!s.peerReady) fail(`${name} に "Friend is ready!" の表示が無い`);
  if (!s.buttons.some((b) => b.event === 'startMatch' && !b.disabled)) fail(`${name} で Start Match を押せない`);
}
if (!/Friend is ready!/.test(read('js', 'app.js'))) fail('app.js に "Friend is ready!" の描画が無い');
// シナリオ 1 (ホストが先) と 1b (クライアントが先): 1 回目・2 回目の押下と VS 画面
for (const [id, afterFirst] of [['1', 'H_READY_WAITING / C_READY_PEER_READY'], ['1b', 'H_READY_PEER_READY / C_READY_WAITING']]) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) { fail(`シナリオ ${id} が無い`); continue; }
  const i = sc.steps.findIndex((st) => /\.startMatch$/.test(Engine.stepEvent(st)));
  const got = [i + 1, i + 2, i + 3].map((n) => { const st = Engine.replay(sc, n).state; return `${st.host} / ${st.client}`; });
  const want = [afterFirst, 'H_STARTING / C_STARTING', 'H_VS / C_VS'];
  if (got.join() !== want.join()) fail(`シナリオ ${id} の開始の流れ ${got.join(' → ')} (期待: ${want.join(' → ')})`);
}
console.log('ok  U31: 両者の Start Match で開始 (ホストが先 / クライアントが先)、自動開始なし');

// 対戦後 (Win / Lose) の遷移
const inGame = at('H_GAME', 'C_GAME');
expectFire(inGame, 'host.win', 'H_RESULT_WIN', 'C_RESULT_LOSE');
expectFire(inGame, 'host.lose', 'H_RESULT_LOSE', 'C_RESULT_WIN');
expectFire(inGame, 'client.win', 'H_RESULT_LOSE', 'C_RESULT_WIN');
expectFire(inGame, 'client.lose', 'H_RESULT_WIN', 'C_RESULT_LOSE');

// Win / Lose は両端末が対戦中 (H_GAME / C_GAME) のときだけ行がある
const hostStates = Object.keys(SCREENS).filter((k) => k.startsWith('H_'));
const clientStates = Object.keys(SCREENS).filter((k) => k.startsWith('C_'));
for (const h of hostStates) {
  for (const c of clientStates) {
    for (const ev of ['host.win', 'host.lose', 'client.win', 'client.lose']) {
      const want = h === 'H_GAME' && c === 'C_GAME';
      if (Engine.canFire(at(h, c), ev) !== want) fail(`${h} / ${c} で ${ev} の行が${want ? '無い' : 'ある'}`);
    }
  }
}
// カウントダウン中は Win / Lose を押せない (ポーズボタンもまだ無い)
for (const ev of ['host.win', 'host.lose', 'client.win', 'client.lose']) {
  if (Engine.canFire(at('H_GAME_COUNTDOWN', 'C_GAME_COUNTDOWN'), ev)) fail(`カウントダウン中に ${ev} の行がある`);
  if (!Engine.canFire(at('H_GAME', 'C_GAME'), ev)) fail(`プレイ中に ${ev} の行が無い`);
}

// 再戦 (仮): どちらが先に押しても、両者が押したら VS 画面
for (const [first, second] of [['host', 'client'], ['client', 'host']]) {
  const asked = first === 'host' ? ['H_RESULT_WIN_REMATCH_WAIT', 'C_RESULT_LOSE_REMATCH_ASKED'] : ['H_RESULT_WIN_REMATCH_ASKED', 'C_RESULT_LOSE_REMATCH_WAIT'];
  const s1 = expectFire(at('H_RESULT_WIN', 'C_RESULT_LOSE'), `${first}.rematch`, ...asked);
  if (s1) {
    if (Engine.canFire(s1, `${first}.rematch`)) fail(`${first} が再戦待ちのまま Rematch を押せる`);
    expectFire(s1, `${second}.rematch`, 'H_VS', 'C_VS');
  }
}
// Back to Friend Match (仮): 押した側だけ Friend Match トップ、相手は結果画面のまま
expectFire(at('H_RESULT_LOSE_REMATCH_ASKED', 'C_RESULT_WIN_REMATCH_WAIT'), 'host.backToFriendMatch', 'H_TOP', 'C_RESULT_WIN_REMATCH_WAIT');
expectFire(at('H_RESULT_WIN', 'C_RESULT_LOSE'), 'client.backToFriendMatch', 'H_RESULT_WIN', 'C_TOP');
expectFire(at('H_TOP', 'C_RESULT_LOSE'), 'client.backToFriendMatch', 'H_TOP', 'C_TOP');
if (Engine.canFire(at('H_TOP', 'C_RESULT_LOSE_REMATCH_ASKED'), 'client.rematch')) fail('相手が抜けたあとも Rematch を押せる');

// 対戦後のシナリオの最終状態
// [勝敗直後, 最後] の状態
const postMatch = {
  '15': ['H_RESULT_WIN / C_RESULT_LOSE', 'H_TOP / C_TOP'],
  '15b': ['H_RESULT_LOSE / C_RESULT_WIN', 'H_RESULT_LOSE / C_TOP'],
  '15c': ['H_RESULT_WIN / C_RESULT_LOSE', 'H_RESULT_LOSE / C_RESULT_WIN'],
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

const unused = TRANSITIONS.filter((r) => !used.has(r.id));
console.log(`\n遷移表 ${TRANSITIONS.length} 行のうち ${used.size} 行をシナリオで再生 (残り ${unused.length} 行は自由操作で到達)`);

if (errors.length) {
  console.error('\nNG');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('\nすべてのシナリオが遷移表どおりに最後まで再生できました');
