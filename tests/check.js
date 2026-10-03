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
const { TRANSITIONS, SCREENS, DIALOGS, UNDECIDED, SCENARIOS, EVENT_LABELS, TOASTS, Engine } = ctx;

const errors = [];
const fail = (msg) => errors.push(msg);
const undecidedIds = new Set(UNDECIDED.map((u) => u.id));
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
  for (const u of r.undecided) if (!undecidedIds.has(u)) fail(`${r.id}: 未定義の未決 ${u}`);
  if (!EVENT_LABELS[r.event]) fail(`${r.id}: イベント ${r.event} のラベルが無い`);
}
for (const [name, s] of Object.entries(SCREENS)) {
  for (const u of s.undecided) if (!undecidedIds.has(u)) fail(`${name}: 未定義の未決 ${u}`);
  if (s.toast && !TOASTS[s.toast]) fail(`${name}: 未定義のトースト ${s.toast}`);
}
for (const [name, d] of Object.entries(DIALOGS)) {
  for (const u of d.undecided || []) if (!undecidedIds.has(u)) fail(`dialog ${name}: 未定義の未決 ${u}`);
}

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

// 対戦後 (Win / Lose) の遷移
const at = (host, client) => Object.assign(Engine.initialState(), { host, client });
const expectFire = (from, event, host, client) => {
  const res = Engine.fire(from, event);
  const got = res ? `${res.state.host} / ${res.state.client}` : '行なし';
  if (got !== `${host} / ${client}`) fail(`${from.host} / ${from.client} で ${event} → ${got} (期待: ${host} / ${client})`);
  return res && res.state;
};
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
