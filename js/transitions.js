/*
 * QA² Friend Match フロー モック - 唯一の状態遷移表
 *
 * 画面の変化はすべてこのファイルの TRANSITIONS で決まる。UI (app.js) は
 * state.host / state.client を SCREENS に従って描画し、イベントを発火するだけ。
 *
 * 行の形:
 *   { id, from: { host, client, hostDialog?, clientDialog? }, event,
 *     to: { host, client }, dialog?: { host?, client? }, when?: {...},
 *     auto?: ms, note, undecided: ['U1'], decided: ['U2'] }
 *
 *   from の host/client: '*' = 何でもよい / 文字列 / 文字列の配列
 *   to の host/client:   '*' = 変更なし / '=' = 同じ状態のまま (ダイアログだけ変える)
 *   when: 未決トグル (U1 など) か、モック設定 (codeResult, createResult) の条件
 *   auto: 自由操作中にこの行を自動で発火するまでの ms (点線矢印 = 自動遷移)
 *
 * 上から順に評価し、最初に一致した行が使われる。
 */

// ---- 状態のグループ -------------------------------------------------------

// 状態名は案 C (2026-10-03): 「Host. / Client.」+ qa2 本体の画面名・状態名。旧名との対応表は README の「状態名」
var AWAY_PLACES = ['FriendMatchRoom', 'StageSelection']; // ホストが Friend Match トップ / ステージ選択にいる
var AWAY_STATUSES = ['Waiting', 'FriendJoined', 'Ready'];
function away(place, status) { return 'Host.Away.' + place + '.' + status; }

var hostAwayPending = []; // マッチがまだ有効なホスト離席状態
AWAY_PLACES.forEach(function (p) {
  AWAY_STATUSES.forEach(function (s) { hostAwayPending.push(away(p, s)); });
});

// Ready 画面 (決定 U31〜U36): 両者がロビーにそろってから試合が始まるまで。カード 1 枚ずつに "✓ Ready" / "Not ready"
//   .Ready                     どちらも Ready していない
//   .Ready.TimedOut など        どちらも Ready していない + お知らせ (タイムアウト U33 / 相手が取り消した U34 / 読み込みの失敗 U32)
//   .Ready.Confirming          自分が Ready を押して送っている ("Confirming…")
//   .Ready.WaitingForOpponent  自分だけ Ready ("Waiting for opponent…"、60 秒のカウントダウン、Cancel Ready)
//   .Ready.OpponentReady       相手だけ Ready ("Opponent is ready. Are you?")。.Confirming は自分も押して送っている
function lobbyState(R, s) { return R + '.FriendMatch.Lobby.' + s; }
var READY_NOTICES = ['TimedOut', 'OpponentNotReady', 'StartFailed'];
function noneReady(R) { return [lobbyState(R, 'Ready')].concat(READY_NOTICES.map(function (n) { return lobbyState(R, 'Ready.' + n); })); }
function readyScreen(R) {
  return noneReady(R).concat(['Ready.Confirming', 'Ready.WaitingForOpponent', 'Ready.OpponentReady', 'Ready.OpponentReady.Confirming'].map(function (s) { return lobbyState(R, s); }));
}
// 試合が始まる前 (決定 U32): Ready 画面と読み込み ("Starting match…")。ここで切断しても勝敗はつかない
function preStart(R) { return readyScreen(R).concat([lobbyState(R, 'Starting')]); }
// Ready 画面で Leave Room / ‹ を押せる状態 (決定 U34 / U35)。送っている間 (.Confirming) は押せない (仮、U53)
function roomLeavable(R) {
  return readyScreen(R).filter(function (s) { return !/Confirming$/.test(s); }).concat([lobbyState(R, 'OpponentDisconnected')]);
}
var hostReadyScreen = readyScreen('Host');
var clientReadyScreen = readyScreen('Client');

var hostCancelable = ['Host.FriendMatch.Lobby.Waiting', 'Host.FriendMatch.Lobby.FriendJoined', 'Host.FriendMatch.Lobby.Connecting', 'Host.FriendMatch.Lobby.ConnectionLost',
  'Host.FriendMatch.Lobby.ClientLeft', 'Host.FriendMatch.Lobby.MatchCancelled'];
// 同じ Match Code で次の友だちを待っている (決定 U32 / U34): 最初の待機、友だちが抜けた、友だちが戻らなかった
var hostWaitingForFriend = ['Host.FriendMatch.Lobby.Waiting', 'Host.FriendMatch.Lobby.ClientLeft', 'Host.FriendMatch.Lobby.MatchCancelled'];
var hostWithClient = ['Host.FriendMatch.Lobby.FriendJoined', 'Host.FriendMatch.Lobby.Ready', 'Host.FriendMatch.Lobby.Connecting', 'Host.FriendMatch.Lobby.ConnectionLost'];
var clientInMatch = ['Client.FriendMatch.Lobby.Waiting', 'Client.FriendMatch.Lobby.HostAway', 'Client.FriendMatch.Lobby.FriendJoined',
  'Client.FriendMatch.Lobby.Connecting', 'Client.FriendMatch.Lobby.ConnectionLost'].concat(clientReadyScreen, ['Client.FriendMatch.Lobby.Starting']);
var clientLeavable = ['Client.FriendMatch.Lobby.HostAway', 'Client.FriendMatch.Lobby.FriendJoined', 'Client.FriendMatch.Lobby.Connecting', 'Client.FriendMatch.Lobby.ConnectionLost'];
// ルームが閉じたお知らせ付きの Friend Match トップ (決定 U32 / U34)
var clientRoomClosed = ['Client.FriendMatch.Room.HostLeft', 'Client.FriendMatch.Room.HostDisconnected'];
var clientRoomEmpty = ['Client.FriendMatch.Room'].concat(clientRoomClosed);
var clientRoomAny = clientRoomEmpty.concat(['Client.FriendMatch.Room.CodeEntered', 'Client.FriendMatch.Room.Error.NotFound', 'Client.FriendMatch.Room.Error.Expired',
  'Client.FriendMatch.Room.Error.Full', 'Client.FriendMatch.Room.ConnectionFailed']);
var clientRoomFilled = ['Client.FriendMatch.Room.CodeEntered', 'Client.FriendMatch.Room.Error.NotFound', 'Client.FriendMatch.Room.Error.Expired',
  'Client.FriendMatch.Room.Error.Full', 'Client.FriendMatch.Room.ConnectionFailed'];
var hostExpiredAny = ['Host.FriendMatch.Lobby.CodeExpired', 'Host.Away.FriendMatchRoom.Expired', 'Host.Away.StageSelection.Expired'];

// 対戦後の結果画面 (決定 U20〜U30、高宮さん 2026-10-07): 勝敗 (Win / Lose / Draw) × 再戦の段階。
// Friend Match かランダム対戦か、レートが変わる対戦かは状態名ではなくセッション (SESSION_FIELDS の match / rated) で持つ
var OUTCOMES = ['Win', 'Lose', 'Draw'];
var OPPOSITE = { Win: 'Lose', Lose: 'Win', Draw: 'Draw' };
// 再戦の段階: なし / 自分が申し込んだ / 相手から申し込まれた / 取り消された / 断られた / 応答がなかった / 3 秒待ち (メッセージなし) / 相手が抜けた
var REMATCH_PHASES = ['', '.RematchRequested', '.RematchIncoming', '.RematchCancelled', '.RematchDeclined', '.RematchExpired', '.RematchCooldown'];
var COOLDOWN_PHASES = ['.RematchCancelled', '.RematchDeclined', '.RematchExpired', '.RematchCooldown'];
var RESULT_PHASES = REMATCH_PHASES.concat(['.OpponentLeft']);
function resultState(role, outcome, phase) { return role + '.' + outcome + 'Result' + (phase || ''); }
function resultStates(role, outcome, phases) { return phases.map(function (ph) { return resultState(role, outcome, ph); }); }
// 勝敗が決まった理由が降参・切断のもの (決定 U38 / U41 / U28) と、勝敗のない No contest (U28)。どれも再戦は無い
var SPECIAL_RESULTS = { Surrendered: 'Lose', OpponentSurrendered: 'Win', Disconnected: 'Lose', OpponentDisconnected: 'Win' };
function specialResults(role) {
  return Object.keys(SPECIAL_RESULTS).map(function (k) { return resultState(role, SPECIAL_RESULTS[k], '.' + k); });
}
function resultAny(role) {
  var list = [];
  OUTCOMES.forEach(function (o) { list = list.concat(resultStates(role, o, RESULT_PHASES)); });
  return list.concat(specialResults(role), [role + '.NoContestResult']);
}
function isResultState(name) { return /^(Host|Client)\.(Win|Lose|Draw|NoContest)Result(\.|$)/.test(name); }
// 同じ相手と対戦している間 (VS 画面・ゲーム画面・結果画面)。スタンプのミュートはこの間だけ続く (U49)
function isWithOpponent(name) { return isResultState(name) || /^(Host|Client)\.(Opponent$|Game\.)/.test(name); }
var hostResultAny = resultAny('Host');
var clientResultAny = resultAny('Client');
// 降参した側 (U41) 以外の結果画面: Back to Friend Match / Find Next Opponent / Back to Online がある
var hostResultLeavable = hostResultAny.filter(function (s) { return s !== 'Host.LoseResult.Surrendered'; });
var clientResultLeavable = clientResultAny.filter(function (s) { return s !== 'Client.LoseResult.Surrendered'; });
// スタンプを送れる結果画面 (U27): 相手がまだ結果画面にいるもの。相手が抜けた・切断した・接続エラーのときは送れない
function stampable(role) {
  var list = [];
  OUTCOMES.forEach(function (o) { list = list.concat(resultStates(role, o, REMATCH_PHASES)); });
  return list.concat([resultState(role, 'Lose', '.Surrendered'), resultState(role, 'Win', '.OpponentSurrendered')]);
}
var hostStampable = stampable('Host');
var clientStampable = stampable('Client');

// 試合が続いている状態 (決定 U37: MATCH MENU や降参の確認を開いていても試合は止まらない)
var hostInPlay = ['Host.Game.Play', 'Host.Game.MatchMenu', 'Host.Game.SurrenderConfirm'];
var clientInPlay = ['Client.Game.Play', 'Client.Game.MatchMenu', 'Client.Game.SurrenderConfirm'];
// 対戦中の切断 (決定 U28): 切断した側は再接続を試み、相手は 20 秒 (仮) 待つ
var hostInGame = hostInPlay.concat(['Host.Game.Disconnected', 'Host.Game.OpponentDisconnected']);
var clientInGame = clientInPlay.concat(['Client.Game.Disconnected', 'Client.Game.OpponentDisconnected']);
// ランダム対戦で相手を探している状態: Random Match から (U13a) と、結果画面の Find Next Opponent から (U29)
var hostSearching = ['Host.Matchmake', 'Host.Matchmake.NextOpponent'];
var clientSearching = ['Client.Matchmake', 'Client.Matchmake.NextOpponent'];

// 端末ごとの付属状態。keeps(状態名) が偽の画面へ移ると初期値に戻る
//   Dialog: 確認ダイアログ (画面が変わると閉じる)
//   Stamp:  自分が送ったスタンプ (U27)。'gg' などは表示中 (3 秒、仮)、'sent' は消えたが次を送れるまでの待ち (送ってから 5 秒、仮)
//   Mute:   相手のスタンプを出さない (U27)。同じ相手と対戦している間だけ続く (仮、U49)
var DEVICE_FIELDS = {
  Dialog: { initial: null, keeps: function () { return false; } },
  Stamp: { initial: null, keeps: isResultState },
  Mute: { initial: false, keeps: isWithOpponent },
};
// 対戦のセッション (両端末で共通): match = 'friend' | 'random'、rated = レートが変わる対戦か (ランダム対戦の最初の 1 戦だけ、U21)
var SESSION_FIELDS = { match: null, rated: false };

// 遷移表の表示で、配列の代わりにグループ名を出すための一覧
var STATE_GROUPS = {
  'Host.Away.Pending': hostAwayPending,
  'Host.FriendMatch.Lobby.Cancelable': hostCancelable,
  'Host.FriendMatch.Lobby.WithClient': hostWithClient,
  'Host.Expired.Any': hostExpiredAny,
  'Host.FriendMatch.Lobby.WaitingForFriend': hostWaitingForFriend,
  'Client.InMatch': clientInMatch,
  'Client.FriendMatch.Room.Empty': clientRoomEmpty,
  'Client.FriendMatch.Lobby.Leavable': clientLeavable,
  'Client.FriendMatch.Room.Any': clientRoomAny,
  'Client.FriendMatch.Room.CodeFilled': clientRoomFilled,
  'Host.Result.Any': hostResultAny,
  'Client.Result.Any': clientResultAny,
  'Host.Result.Leavable': hostResultLeavable,
  'Client.Result.Leavable': clientResultLeavable,
  'Host.Result.Stampable': hostStampable,
  'Client.Result.Stampable': clientStampable,
  'Host.Game.InPlay': hostInPlay,
  'Client.Game.InPlay': clientInPlay,
  'Host.Game.InMatch': hostInGame,
  'Client.Game.InMatch': clientInGame,
  'Host.Matchmake.Searching': hostSearching,
  'Client.Matchmake.Searching': clientSearching,
};
['Host', 'Client'].forEach(function (R) {
  STATE_GROUPS[R + '.FriendMatch.Lobby.Ready.NoneReady'] = noneReady(R);
  STATE_GROUPS[R + '.FriendMatch.Lobby.Ready.Any'] = readyScreen(R);
  STATE_GROUPS[R + '.FriendMatch.Lobby.PreStart'] = preStart(R);
  STATE_GROUPS[R + '.FriendMatch.Lobby.RoomLeavable'] = roomLeavable(R);
  STATE_GROUPS[R + '.Game.BeforeStart'] = [R + '.Opponent', R + '.Game.Countdown'];
});
OUTCOMES.forEach(function (o) {
  ['Host', 'Client'].forEach(function (R) {
    STATE_GROUPS[R + '.' + o + 'Result.Rematchable'] = resultStates(R, o, REMATCH_PHASES);
    STATE_GROUPS[R + '.' + o + 'Result.Cooldown'] = resultStates(R, o, COOLDOWN_PHASES);
  });
});

// ゲーム本体の開始カウントダウン (VsAI の CountdownTimer と同じ): 1 秒待ってから 3 → 2 → 1 を 0.8 秒ずつ
var GAME_COUNTDOWN = { delay: 1000, digit: 800, digits: [3, 2, 1] };
var GAME_COUNTDOWN_MS = GAME_COUNTDOWN.delay + GAME_COUNTDOWN.digit * GAME_COUNTDOWN.digits.length;

// 結果画面のスタンプ (決定 U27)。表示 3 秒・次を送れるまで 5 秒はどちらも QA² 側の仮の値で、端末の画面には出さない
var STAMPS = [
  { id: 'gg', emoji: '\u{1F44F}', text: 'Good game' },
  { id: 'thanks', emoji: '\u{1F91D}', text: 'Thanks for the match' },
  { id: 'nice', emoji: '\u{1F44D}', text: 'Nice' },
];

// ---- 遷移表 ---------------------------------------------------------------

var TRANSITIONS = (function () {
  var rows = [];
  function T(r) { rows.push(r); }
  function eachPlace(fn) { AWAY_PLACES.forEach(fn); }

  // === Online Battle / Friend Match トップ ===
  T({ from: { host: 'Host.MultiModeSelection', client: '*' }, event: 'host.friendMatch', to: { host: 'Host.FriendMatch.Room', client: '*' } });
  T({ from: { host: 'Host.MultiModeSelection', client: '*' }, event: 'host.randomMatch', to: { host: 'Host.Matchmake', client: '*' },
    note: '決定 (U13a): 相手を探す画面 ("Searching for an opponent…" と Cancel)', decided: ['U13a'] });
  T({ from: { host: ['Host.FriendMatch.Room', 'Host.FriendMatch.Room.ConnectionFailed'], client: '*' }, event: 'host.back', to: { host: 'Host.MultiModeSelection', client: '*' } });
  T({ from: { host: ['Host.FriendMatch.Room', 'Host.FriendMatch.Room.ConnectionFailed'], client: '*' }, event: 'host.createMatch', when: { createResult: 'connFailed' },
    to: { host: 'Host.FriendMatch.Room.ConnectionFailed', client: '*' }, note: 'モック設定「Create Match の結果 = 接続失敗」のとき', undecided: ['U6'] });
  T({ from: { host: ['Host.FriendMatch.Room', 'Host.FriendMatch.Room.ConnectionFailed'], client: '*' }, event: 'host.createMatch', to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: '図01: Match Code QWERTY123 が発行される' });
  T({ from: { host: 'Host.FriendMatch.Room.ConnectionFailed', client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Room', client: '*' }, undecided: ['U6'] });

  T({ from: { host: '*', client: 'Client.MultiModeSelection' }, event: 'client.friendMatch', to: { host: '*', client: 'Client.FriendMatch.Room' } });
  T({ from: { host: '*', client: 'Client.MultiModeSelection' }, event: 'client.randomMatch', to: { host: '*', client: 'Client.Matchmake' },
    note: '決定 (U13a): 相手を探す画面 ("Searching for an opponent…" と Cancel)', decided: ['U13a'] });
  T({ from: { host: '*', client: clientRoomAny }, event: 'client.back', to: { host: '*', client: 'Client.MultiModeSelection' } });
  T({ from: { host: '*', client: clientRoomEmpty }, event: 'client.enterCode', to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' },
    note: 'モックでは入力欄タップで QWERTY123 を入力。ルームが閉じたお知らせ (U32 / U34) はほかの操作で消える (仮、U52)', undecided: ['U52'] });
  T({ from: { host: '*', client: 'Client.FriendMatch.Room.ConnectionFailed' }, event: 'client.tapToast', to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, undecided: ['U6'] });

  // === Join Match の結果 ===
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'notFound' },
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.NotFound' }, note: '図08: 無効な Match Code' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'expired' },
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.Expired' }, note: '図09: Match Code が期限切れ' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'full' },
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.Full' }, note: '図10: すでにほかの人が入っている' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'connFailed' },
    to: { host: '*', client: 'Client.FriendMatch.Room.ConnectionFailed' }, note: '"Connection failed" の発生条件は図に無い', undecided: ['U6'] });
  T({ from: { host: hostWaitingForFriend, client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Waiting' },
    note: '図01: ホストは Friend joined!、クライアントはまず Waiting for your friend…。友だちが抜けた / 戻らなかったあとも同じ Match Code で入れる (U32 / U34)', decided: ['U32', 'U34'] });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'Waiting'), client: clientRoomFilled }, event: 'client.joinMatch',
      to: { host: away(p, 'FriendJoined'), client: 'Client.FriendMatch.Lobby.Waiting' }, note: '図02: ホストは別画面のまま緑の "Friend joined!" トースト' });
  });
  T({ from: { host: hostExpiredAny, client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.Expired' }, note: 'ホストの Match Code が期限切れ' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.NotFound' }, note: 'ホストが待機中のマッチを持っていないので見つからない' });

  // === 通常対戦 (図01) ===
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'sys.peerConnected', auto: 800,
    to: { host: '*', client: 'Client.FriendMatch.Lobby.FriendJoined' }, note: '図01: 点線 (自動)' });
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.FriendJoined' }, event: 'sys.readyScreen', auto: 1500,
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' },
    note: '図01: 点線 (自動)。何をもって Ready 画面になるか不明。決定 (U36): 両者のカード (どちらも "Not ready") と Ready / Leave Room', undecided: ['U4'], decided: ['U36'] });

  // === Ready 画面 (決定 U31 変更・U32〜U36、高宮さん 2026-10-07) ===
  // 両者が Ready を押したら開始 (U31)。押した側は送っている間 "Confirming…"、届くと "Waiting for opponent…" と 60 秒 (仮) のカウントダウンと Cancel Ready、
  // 相手側には "Opponent is ready. Are you?" (U36)。試合が始まるまで (3-2-1 のあとサーバーが確認するまで) は Ready を取り消せ、勝敗は記録しない
  [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var O = p[3];
    var pair = function (mine, theirs, extra) {
      var r = {};
      r[d] = mine;
      r[other] = theirs;
      return Object.assign(r, extra);
    };
    var dlg = function (v) { var r = {}; r[d] = v; return r; };
    var field = function (f, v) { var r = {}; r[d + f] = v; return r; };
    var L = function (role, s) { return lobbyState(role, s); };
    T({ from: pair(noneReady(R), noneReady(O).concat([L(O, 'Ready.Confirming')])), event: d + '.ready', to: pair(L(R, 'Ready.Confirming'), '*'),
      note: '決定 (U31 / U36): Ready を押すと、送っている間は "Confirming…"。相手の画面はまだ変わらない。お知らせ (タイムアウトなど) は消える', decided: ['U31', 'U36'] });
    T({ from: pair(L(R, 'Ready.OpponentReady'), L(O, 'Ready.WaitingForOpponent')), event: d + '.ready', to: pair(L(R, 'Ready.OpponentReady.Confirming'), '*'),
      note: '決定 (U31 / U36): 相手が Ready のあとに押す。送っている間は "Confirming…"', decided: ['U31', 'U36'] });
    T({ from: pair(L(R, 'Ready.Confirming'), noneReady(O)), event: 'sys.readyConfirmed', auto: 800,
      to: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady')),
      note: '決定 (U36): 届くと、押した側は "✓ Ready" と "Waiting for opponent…"、60 秒 (仮) のカウントダウン、Cancel Ready。相手側は "Opponent is ready. Are you?"', decided: ['U36', 'U33'] });
    T({ from: pair(L(R, 'Ready.OpponentReady.Confirming'), L(O, 'Ready.WaitingForOpponent')), event: 'sys.readyConfirmed', auto: 800,
      to: pair(L(R, 'Starting'), L(O, 'Starting')), note: '決定 (U31): 両者の Ready がそろったので開始。読み込みの間は "Starting match…" (両者のカードが "✓ Ready")', decided: ['U31', 'U36'] });
    // Cancel Ready とアプリを離れたとき (U34 / U35): 自分の Ready だけ消え、ルームには残る。相手の画面には "Opponent is no longer ready."
    var opponentAfterClear = L(O, 'Ready.OpponentNotReady');
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady')), event: d + '.cancelReady', to: pair(L(R, 'Ready'), opponentAfterClear),
      note: '決定 (U34 / U36): Cancel Ready で Ready を取り消してもルームに残る。相手には "Opponent is no longer ready."', decided: ['U34', 'U36'] });
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady.Confirming')), event: d + '.cancelReady', to: pair(L(R, 'Ready'), L(O, 'Ready.Confirming')),
      note: '決定 (U34): 相手が Ready を送っている途中で取り消したときは、相手の Ready が先に待つ側になる (仮、U53)', decided: ['U34'], undecided: ['U53'] });
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady')), event: d + '.leaveApp', to: pair(L(R, 'Ready'), opponentAfterClear),
      note: 'モック操作。決定 (U35): アプリを離れる (バックグラウンド・画面ロック) とその人の Ready は消え、ルームには残る。相手の表示は Cancel Ready と同じ (仮、U53)', decided: ['U35'], undecided: ['U53'] });
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady.Confirming')), event: d + '.leaveApp', to: pair(L(R, 'Ready'), L(O, 'Ready.Confirming')),
      note: 'モック操作。決定 (U35): アプリを離れるとその人の Ready は消える。相手の Ready は送っている途中なので、相手が先に待つ側になる (仮、U53)', decided: ['U35'], undecided: ['U53'] });
    T({ from: pair(L(R, 'Ready.Confirming'), '*'), event: d + '.leaveApp', to: pair(L(R, 'Ready'), '*'),
      note: 'モック操作。決定 (U35): 送っている途中でアプリを離れると Ready は届かない (相手の画面は変わらない、仮、U53)', decided: ['U35'], undecided: ['U53'] });
    T({ from: pair(L(R, 'Ready.OpponentReady.Confirming'), '*'), event: d + '.leaveApp', to: pair(L(R, 'Ready.OpponentReady'), '*'),
      note: 'モック操作。決定 (U35): 送っている途中でアプリを離れると Ready は届かない (仮、U53)', decided: ['U35'], undecided: ['U53'] });
    T({ from: pair(noneReady(R).concat([L(R, 'Ready.OpponentReady')]), '*'), event: d + '.leaveApp', to: pair('=', '*'),
      note: 'モック操作。決定 (U35): Ready していないときにアプリを離れて戻っても、何も変わらない', decided: ['U35'] });
    // 60 秒 (仮) 相手が押さなければ両者の Ready を消す (U33)。罰はなく、どちらもルームに残る
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady')), event: 'timer.readyTimeout',
      to: pair(L(R, 'Ready.TimedOut'), L(O, 'Ready.TimedOut')),
      note: '決定 (U33): 片方が Ready のまま 60 秒 (仮) 相手が押さなければ、両者の Ready を消して "Ready check timed out. Press Ready when you\u2019re ready."。罰はなく、どちらもメニューへは戻らない', decided: ['U33'] });
    // 退出 (U34 / U35): Leave Room と ‹ (別の画面へ移る) は同じ確認を出す
    ['leaveRoom', 'back'].forEach(function (ev) {
      T({ from: pair(roomLeavable(R), '*'), event: d + '.' + ev, to: pair('=', '*'), dialog: dlg('leaveRoom'),
        note: ev === 'back' ? '決定 (U35): ‹ (別の画面へ移る) も Leave Room と同じ確認 "No match has started. No win or loss will be recorded."'
          : '決定 (U34): 抜ける前に確認 "No match has started. No win or loss will be recorded." (題名とボタンは仮、U51)',
        decided: ev === 'back' ? ['U35', 'U34'] : ['U34'], undecided: ['U51'] });
    });
    T({ from: pair('*', '*', field('Dialog', 'leaveRoom')), event: d + '.dialog.stay', to: pair('=', '*'), dialog: dlg(null),
      note: '確認を閉じてルームに残る (Ready はそのまま)', decided: ['U34'], undecided: ['U51'] });
  });
  // 抜けたあと (U34): クライアントが抜けるとホストは同じ Match Code で次の友だちを待つ。ホストが抜けるとルームは閉じ、クライアントは Friend Match トップへ
  T({ from: { host: '*', client: roomLeavable('Client'), clientDialog: 'leaveRoom' }, event: 'client.dialog.leaveRoom',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
    note: '決定 (U34): ホストには "Your friend left. Waiting for another friend…" (Match Code は同じ)。ホストが切断中でも同じ (仮、U52)', decided: ['U34'], undecided: ['U52'] });
  T({ from: { host: roomLeavable('Host'), client: '*', hostDialog: 'leaveRoom' }, event: 'host.dialog.leaveRoom',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '決定 (U34): ルームを閉じる。クライアントは "Room closed. The host left." で Friend Match トップへ。クライアントが切断中でも同じ (仮、U52)', decided: ['U34'], undecided: ['U52'] });

  // 読み込み (U32): 両者の Ready がそろったら "Starting match…"。20 秒 (仮) で終わらなければ、両者とも Ready 画面に戻る
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'sys.bothStarted', auto: 1500,
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { match: 'friend', rated: false },
    note: '合意: マッチ成立時に VS 画面を挟む。決定 (U21): Friend Match はレートが変わらない', decided: ['U21'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'timer.loadTimeout',
    to: { host: 'Host.FriendMatch.Lobby.Ready.StartFailed', client: 'Client.FriendMatch.Lobby.Ready.StartFailed' },
    note: '決定 (U32): 読み込みは 20 秒 (仮) まで。終わらなければ両者に "Match could not start. Please try again." を出して Ready 画面に戻す (両者の Ready は消える)。図06 の "Unable to start the match." を置き換えた', decided: ['U32'], undecided: ['U15'] });
  T({ from: { host: 'Host.Opponent', client: 'Client.Opponent' }, event: 'vs.done', auto: 2500,
    to: { host: 'Host.Game.Countdown', client: 'Client.Game.Countdown' },
    note: '合意: VS 画面は 2〜3 秒。決定 (U2): そのままゲーム画面へ移り、ゲーム本体のカウントダウンが始まる', decided: ['U2'] });
  T({ from: { host: 'Host.Game.Countdown', client: 'Client.Game.Countdown' }, event: 'game.countdownDone', auto: GAME_COUNTDOWN_MS,
    to: { host: 'Host.Game.Play', client: 'Client.Game.Play' },
    note: '決定 (U2): ゲーム本体の 3 → 2 → 1 (1 秒待ち + 0.8 秒 × 3) が終わるとメニューボタン (☰) が出てプレイ開始。' +
      '決定 (U32): 3-2-1 のあとサーバーが確認した時点で試合開始。ここからは対戦中のルール (20 秒の切断負け・降参の負け、U28 / U38)', decided: ['U2', 'U32'] });

  // === 開始前の切断 (決定 U32): Ready 画面・読み込み・VS 画面・カウントダウン中 ===
  // 両者の Ready を消して止める。相手は "Opponent disconnected. Waiting for them to reconnect…" と 20 秒 (仮) のカウントダウンと Leave Room。勝敗は記録しない。
  // VS 画面とカウントダウンは Friend Match のとき (ランダム対戦と再戦のあいだの切断は U54)
  [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var O = p[3];
    var pair = function (mine, theirs) {
      var r = {};
      r[d] = mine;
      r[other] = theirs;
      return r;
    };
    var waiting = pair(lobbyState(R, 'Reconnecting'), lobbyState(O, 'OpponentDisconnected'));
    T({ from: pair(preStart(R), preStart(O)), event: d + '.disconnect', to: waiting,
      note: 'モック操作。決定 (U32 / U33): 開始前の切断は両者の Ready を消して止める。相手は 20 秒 (仮) 待つ。切断した側の画面は仮 (U52)', decided: ['U32', 'U33'], undecided: ['U52'] });
    T({ from: pair([R + '.Opponent', R + '.Game.Countdown'], [O + '.Opponent', O + '.Game.Countdown']), event: d + '.disconnect', when: { match: 'friend' }, to: waiting,
      note: 'モック操作。決定 (U32): VS 画面・カウントダウン中の切断も開始前なので、Ready 画面に戻して相手は 20 秒 (仮) 待つ。勝敗は記録しない', decided: ['U32', 'U3'], undecided: ['U52'] });
    T({ from: waiting, event: 'net.recovered', to: pair(lobbyState(R, 'Ready'), lobbyState(O, 'Ready')),
      note: '決定 (U32): 戻ったら両者とももう一度 Ready を押す。カウントダウンは 3 からやり直し', decided: ['U32'] });
  });
  T({ from: { host: 'Host.FriendMatch.Lobby.OpponentDisconnected', client: 'Client.FriendMatch.Lobby.Reconnecting' }, event: 'timer.disconnectTimeout',
    to: { host: 'Host.FriendMatch.Lobby.MatchCancelled', client: 'Client.FriendMatch.Room.CodeEntered' },
    note: '決定 (U32): 20 秒 (仮) で戻らなければ "Match cancelled. Opponent did not reconnect."。結果は無く、ホストは同じ Match Code のままルームに残る。クライアント側は仮 (U52)', decided: ['U32'], undecided: ['U52'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Reconnecting', client: 'Client.FriendMatch.Lobby.OpponentDisconnected' }, event: 'timer.disconnectTimeout',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.HostDisconnected' },
    note: '決定 (U32): ホストが戻らなければ、クライアントは "Room closed. The host disconnected." で Friend Match トップへ。ホスト側は仮 (U52)', decided: ['U32'], undecided: ['U52'] });

  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.Confirming', client: 'Client.FriendMatch.Lobby.Ready.Confirming' }, event: 'sys.readyConfirmed', auto: 800,
    to: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, note: '決定 (U31): 両者がほぼ同時に Ready を押した。どちらも届いたら開始', decided: ['U31', 'U36'] });

  // === ホストのキャンセル (図03, 図04。Ready 画面より前のロビー) ===
  // Ready 画面では Leave Room (決定 U34)。それより前のロビーは図どおり Cancel Match だが、クライアントの行き先は U34 にそろえた (仮、U51)
  T({ from: { host: hostCancelable, client: '*' }, event: 'host.cancelMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'cancel' }, note: '確認ダイアログ' });
  T({ from: { host: '*', client: '*', hostDialog: 'cancel' }, event: 'host.dialog.keepWaiting',
    to: { host: '=', client: '*' }, dialog: { host: null }, note: '合意: 図の "Go Back" → "Keep Waiting"' });
  T({ from: { host: '*', client: clientInMatch, hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '図04 の "cancelled the match." は、U34 の決定 (ホストが抜けるとクライアントは "Room closed. The host left." で Friend Match トップへ) にそろえた (仮、U51)', decided: ['U34', 'U8'], undecided: ['U51'] });
  T({ from: { host: '*', client: '*', hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '図03/04: Friend Match トップへ' });

  // === クライアントの退出 (図05。Ready 画面より前のロビー) ===
  // Ready 画面では Leave Room (決定 U34)。それより前のロビーは図どおり Leave Match だが、ホストの表示は U34 にそろえた (仮、U51)
  T({ from: { host: '*', client: clientLeavable }, event: 'client.leaveMatch',
    to: { host: '*', client: '=' }, dialog: { client: 'leave' }, note: '確認ダイアログ', undecided: ['U11'] });
  T({ from: { host: '*', client: '*', clientDialog: 'leave' }, event: 'client.dialog.goBack',
    to: { host: '*', client: '=' }, dialog: { client: null }, undecided: ['U11'] });
  T({ from: { host: hostWithClient, client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
    note: '図05: クライアントは入力欄に Match Code が残ったトップへ。ホストの表示は U34 の決定 ("Your friend left. Waiting for another friend…"、同じ Match Code) にそろえた (仮、U51)', decided: ['U34'], undecided: ['U51'] });
  eachPlace(function (p) {
    T({ from: { host: [away(p, 'FriendJoined'), away(p, 'Ready')], client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
      to: { host: away(p, 'Waiting'), client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
      note: 'ホスト離席中の退出: トーストが青に戻る (図に無い)', undecided: ['U17'] });
  });
  T({ from: { host: '*', client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null } });

  // クライアント待機中 (Client.FriendMatch.Lobby.Waiting) の退出: 図にボタンが無いので ‹ で抜ける仮定
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'client.back',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, note: 'Client.FriendMatch.Lobby.Waiting には退出ボタンが無い。‹ で抜ける仮定', undecided: ['U9'] });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'FriendJoined'), client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'client.back',
      to: { host: away(p, 'Waiting'), client: 'Client.FriendMatch.Room.CodeEntered' }, note: 'Client.FriendMatch.Lobby.Waiting には退出ボタンが無い。‹ で抜ける仮定', undecided: ['U9'] });
  });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'client.back',
    to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, undecided: ['U9'] });

  // === ホストが別画面へ移る (図02, 図03。Ready 画面より前) ===
  // Ready 画面からの ‹ は確認を出す (決定 U35)。それより前 (待機中・Friend joined!) は図02 どおり別画面へ移ってもマッチを維持する (U14)
  T({ from: { host: hostWaitingForFriend, client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.Waiting', client: '*' }, note: '図02: 別画面に遷移したらバナーで状態を示す', undecided: ['U14'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.FriendJoined', client: '*' }, undecided: ['U14'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.Waiting', client: '*' }, note: '図03: Connection lost から ‹ で青いバナー付きトップへ (?)', undecided: ['U19', 'U14'] });
  T({ from: { host: hostWaitingForFriend.concat(['Host.FriendMatch.Lobby.FriendJoined', 'Host.FriendMatch.Lobby.ConnectionLost']), client: '*' }, event: 'host.back', when: { U14: 'confirm' },
    to: { host: '=', client: '*' }, dialog: { host: 'cancel' }, note: 'U14 別案: ‹ でキャンセル確認を出す', undecided: ['U14'] });

  eachPlace(function (p) {
    var other = p === 'FriendMatchRoom' ? 'StageSelection' : 'FriendMatchRoom';
    AWAY_STATUSES.concat(['Expired']).forEach(function (s) {
      T({ from: { host: away(p, s), client: '*' }, event: 'host.back',
        to: { host: away(other, s), client: '*' },
        note: p === 'FriendMatchRoom' ? '他の画面 (ステージ選択) へ。途中の画面は省略' : 'Friend Match トップへ戻る。途中の画面は省略' });
    });
  });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'FriendJoined'), client: ['Client.FriendMatch.Lobby.Waiting', 'Client.FriendMatch.Lobby.FriendJoined'] }, event: 'sys.readyScreen', auto: 1500,
      to: { host: away(p, 'Ready'), client: 'Client.FriendMatch.Lobby.HostAway' }, note: '図02: 緑 → 赤 "Ready to start"、クライアントは "Away"', undecided: ['U4'] });
  });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'Ready'), client: 'Client.FriendMatch.Lobby.HostAway' }, event: 'host.tapToast', when: { U1: 'lobby' },
      to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.FriendJoined' }, note: '図02: Ready to start ボタン押下で遷移', undecided: ['U1', 'U17'] });
    T({ from: { host: away(p, 'Ready'), client: 'Client.FriendMatch.Lobby.HostAway' }, event: 'host.tapToast', when: { U1: 'direct' },
      to: { host: 'Host.FriendMatch.Lobby.Ready.WaitingForOpponent', client: 'Client.FriendMatch.Lobby.Ready.OpponentReady' },
      note: 'U1 別案: トーストのタップでホストが Ready を押した扱い。開始はクライアントも Ready を押してから (U31 決定)', undecided: ['U1'], decided: ['U31'] });
    T({ from: { host: away(p, 'Waiting'), client: '*' }, event: 'host.tapToast', when: { U16: 'yes' },
      to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: 'U16 別案: 青バナーもタップでロビーへ', undecided: ['U16'] });
    T({ from: { host: away(p, 'FriendJoined'), client: '*' }, event: 'host.tapToast', when: { U16: 'yes' },
      to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: '*' }, note: 'U16 別案: 緑トーストもタップでロビーへ', undecided: ['U16'] });
  });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.FriendJoined' }, event: 'sys.readyScreen', auto: 1500,
    to: { host: '*', client: 'Client.FriendMatch.Lobby.Ready' }, note: '図02: ホストが戻ったあとクライアントも Ready 画面へ', undecided: ['U17'] });

  eachPlace(function (p) {
    var pending = AWAY_STATUSES.map(function (s) { return away(p, s); });
    T({ from: { host: pending, client: ['Client.FriendMatch.Lobby.Waiting', 'Client.FriendMatch.Lobby.HostAway'] }, event: 'timer.codeExpired',
      to: { host: away(p, 'Expired'), client: 'Client.FriendMatch.Lobby.MatchExpired' }, note: '図02: 放置したので Match Code の有効期限が切れた', undecided: ['U7'] });
    T({ from: { host: pending, client: '*' }, event: 'timer.codeExpired',
      to: { host: away(p, 'Expired'), client: '*' }, undecided: ['U7'] });
    T({ from: { host: away(p, 'Expired'), client: '*' }, event: 'host.tapToast',
      to: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' }, note: '図02: 期限切れトーストをタップ' });
  });
  T({ from: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' }, event: 'host.back', to: { host: 'Host.FriendMatch.Room', client: '*' } });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.MatchExpired' }, event: 'client.back', to: { host: '*', client: 'Client.FriendMatch.Room' } });

  // 離席中のホストが Friend Match トップで Create / Join を押す (10-01 合意)
  var awayTopPending = AWAY_STATUSES.map(function (s) { return away('FriendMatchRoom', s); });
  T({ from: { host: awayTopPending, client: '*' }, event: 'host.createMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'newMatch' }, note: '合意 (10-01): 確認ダイアログ', undecided: ['U12'] });
  T({ from: { host: awayTopPending, client: '*' }, event: 'host.joinMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'joinAnother' }, note: '合意 (10-01): 確認ダイアログ', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.keepCurrent',
    to: { host: '=', client: '*' }, dialog: { host: null } });
  T({ from: { host: '*', client: '*', hostDialog: 'joinAnother' }, event: 'host.dialog.keepCurrent',
    to: { host: '=', client: '*' }, dialog: { host: null } });
  T({ from: { host: '*', client: clientInMatch, hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '古いマッチにいたクライアントの扱いは図に無い。モックでは U34 (ホストが抜けた) にそろえて "Room closed. The host left."', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, dialog: { host: null }, note: 'モックでは同じ Match Code を表示' });
  T({ from: { host: '*', client: clientInMatch, hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '別マッチへの参加はモックでは省略。古いマッチのクライアントは U34 にそろえて "Room closed. The host left."', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '別マッチへの参加はモックでは省略', undecided: ['U12'] });
  T({ from: { host: ['Host.Away.FriendMatchRoom.Expired'], client: '*' }, event: 'host.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: '期限切れなので確認なしで作り直し (モックの仮定)' });

  // === Ready 画面で通信が不安定になる (図03。Ready を押す前) ===
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, event: 'net.unstable',
    to: { host: 'Host.FriendMatch.Lobby.Connecting', client: 'Client.FriendMatch.Lobby.Connecting' }, note: '図03: 何らかの理由により通信が不安定になった。クライアント側は図に無い', undecided: ['U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Connecting', client: 'Client.FriendMatch.Lobby.Connecting' }, event: 'net.recovered',
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, note: '図03: 通信が回復' });
  T({ from: { host: 'Host.FriendMatch.Lobby.Connecting', client: 'Client.FriendMatch.Lobby.Connecting' }, event: 'net.lost',
    to: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, note: '図03: 通信が回復しない', undecided: ['U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'net.recovered', when: { U5: 'wait' },
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, note: 'U5 別案: しばらく待てば復帰できる', undecided: ['U5'] });

  // === 対戦中の MATCH MENU (決定 U37〜U42、高宮さん 2026-10-07、案A) ===
  // 試合は止まらない (Time.timeScale = 0 にしない)。メニューや確認を開いただけでは相手の端末は変わらない (U38)。対戦中の REMATCH / RETRY は無い (U39)
  [['host', 'Host', 'client'], ['client', 'Client', 'host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var O = other === 'host' ? 'Host' : 'Client';
    var row = function (mine, theirs) {
      var r = {};
      r[d] = mine;
      r[other] = theirs;
      return r;
    };
    T({ from: row(R + '.Game.Play', '*'), event: d + '.matchMenu', to: row(R + '.Game.MatchMenu', '*'),
      note: '決定 (U37 / U38): ☰ で MATCH MENU を開く。試合は続き、相手の端末には何も出ない', decided: ['U37', 'U38'] });
    T({ from: row(R + '.Game.MatchMenu', '*'), event: d + '.matchMenu.continue', to: row(R + '.Game.Play', '*'),
      note: '決定 (U37): CONTINUE でメニューを閉じる (試合はずっと続いている)', decided: ['U37'] });
    T({ from: row(R + '.Game.MatchMenu', '*'), event: d + '.matchMenu.surrender', to: row(R + '.Game.SurrenderConfirm', '*'),
      note: '決定 (U40 / U41): SURRENDER (QUIT ではない) で確認を出す。確認中も試合は続く', decided: ['U40', 'U41'] });
    T({ from: row(R + '.Game.SurrenderConfirm', '*'), event: d + '.surrenderConfirm.continue', to: row(R + '.Game.Play', '*'),
      note: '決定 (U40): CONTINUE で確認を閉じてプレイに戻る', decided: ['U40'] });
    T({ from: row(R + '.Game.SurrenderConfirm', other === 'host' ? hostInPlay : clientInPlay), event: d + '.surrenderConfirm.surrender',
      to: row(resultState(R, 'Lose', '.Surrendered'), resultState(O, 'Win', '.OpponentSurrendered')),
      note: '決定 (U38 / U40): 降参した側は負け、相手は (メニューを開いていても) 勝ちの結果画面に "Your opponent surrendered"', decided: ['U38', 'U40'] });
  });

  // === ランダム対戦 (決定 U13a: 相手が見つかり次第 VS 画面へ。Ready 画面は挟まない。U31 は Friend Match だけ) ===
  T({ from: { host: hostSearching, client: clientSearching }, event: 'sys.opponentFound', auto: 2500,
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { match: 'random', rated: true },
    note: '決定 (U13a): 相手が見つかり次第 VS 画面へ。Ready 画面と Ready ボタンは無い (U31 は Friend Match だけ)。' +
      '結果画面の Find Next Opponent から探しているときも同じ (U29)。決定 (U21): レートが変わる対戦 (Elo)', decided: ['U13a', 'U29', 'U21'] });
  // 相手を探している間の操作 (決定 U13、高宮さん 2026-10-07)。探している間に行けるのは Online Battle だけ (Cancel と ‹)。
  // アプリを離れる (バックグラウンド・画面ロック) と 60 秒 (長さは仮) のタイムアウトは、Win / Lose と同じく端末の下のモック操作
  [['host', 'Host', 'client'], ['client', 'Client', 'host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var row = function (mine) {
      var r = {};
      r[d] = mine;
      r[other] = '*';
      return r;
    };
    T({ from: row(R + '.Matchmake'), event: d + '.cancelSearch', to: row(R + '.MultiModeSelection'),
      note: '決定 (U13a / U13): Cancel で Online Battle へ。確認ダイアログは出さない', decided: ['U13a', 'U13'] });
    T({ from: row(R + '.Matchmake'), event: d + '.back', to: row(R + '.MultiModeSelection'),
      note: '決定 (U13): ‹ は Cancel とまったく同じ (確認なしで Online Battle へ)', decided: ['U13'] });
    T({ from: row(R + '.Matchmake'), event: d + '.leaveApp', to: row(R + '.Matchmake.Stopped'),
      note: 'モック操作。決定 (U13 / U43): アプリを離れると検索を止め、戻ると Online Battle の中に "Search stopped while the app was in the background." の通知 (モーダルではない)', decided: ['U13', 'U43'] });
    T({ from: row(R + '.Matchmake'), event: d + '.searchTimeout', to: row(R + '.Matchmake.NotFound'),
      note: 'モック操作。決定 (U13): 見つからなければ元の画面 (Online Battle) に "No opponent found." と Search again / Close。60 秒という長さは仮', decided: ['U13'] });
    T({ from: row(R + '.Matchmake.NotFound'), event: d + '.searchAgain', to: row(R + '.Matchmake'),
      note: '決定 (U13): Search again でもう一度相手を探す', decided: ['U13'] });
    T({ from: row(R + '.Matchmake.NotFound'), event: d + '.closeNotice', to: row(R + '.MultiModeSelection'),
      note: '決定 (U13): Close で通知を閉じ、Online Battle のまま', decided: ['U13'] });
    T({ from: row(R + '.Matchmake.Stopped'), event: d + '.searchAgain', to: row(R + '.Matchmake'),
      note: '決定 (U43): Search again で新しく相手を探す', decided: ['U43'] });
    T({ from: row(R + '.Matchmake.Stopped'), event: d + '.closeNotice', to: row(R + '.MultiModeSelection'),
      note: '決定 (U43): Close で通知を閉じ、Online Battle のまま', decided: ['U43'] });
    // 通知はモーダルではないので、Online Battle のほかの操作もそのまま使える。ほかの画面へ移ると通知は消える (自動では消えない)
    T({ from: row(R + '.Matchmake.Stopped'), event: d + '.randomMatch', to: row(R + '.Matchmake'),
      note: '決定 (U43): 通知を出したまま Random Match も押せる (新しく相手を探す。通知は消える)', decided: ['U43', 'U13a'] });
    T({ from: row(R + '.Matchmake.Stopped'), event: d + '.friendMatch', to: row(R + '.FriendMatch.Room'),
      note: '決定 (U43): 通知を出したまま Friend Match も押せる。ほかの画面へ移ると通知は消える (戻っても出ない)', decided: ['U43'] });
  });

  // === 次の相手を探す (決定 U29、高宮さん 2026-10-07) ===
  // ランダム対戦の結果画面の Find Next Opponent で探し始める。見た目は Random Match と同じ "Searching for an opponent…" と Cancel。
  // 60 秒 (長さは仮) 探しても見つからなければ "No opponent found." と Search again / Back to Online (U13 の Online Battle の通知とはボタンが違う)
  [['host', 'Host', 'client'], ['client', 'Client', 'host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var row = function (mine) {
      var r = {};
      r[d] = mine;
      r[other] = '*';
      return r;
    };
    var next = R + '.Matchmake.NextOpponent';
    T({ from: row(next), event: d + '.cancelSearch', to: row(R + '.MultiModeSelection'),
      note: '仮: Random Match から探しているとき (U13) と同じく、Cancel は確認なしで Online Battle へ', decided: ['U29', 'U13'] });
    T({ from: row(next), event: d + '.back', to: row(R + '.MultiModeSelection'),
      note: '仮: Random Match から探しているとき (U13) と同じく、‹ は Cancel とまったく同じ', decided: ['U29', 'U13'] });
    T({ from: row(next), event: d + '.searchTimeout', to: row(next + '.NotFound'),
      note: 'モック操作。決定 (U29): 60 秒 (仮) 探しても見つからなければ "No opponent found." と Search again / Back to Online。' +
        'アプリを離れたとき (U13 / U43 の "Search stopped…") に当たる行は無い (U47)', decided: ['U29'], undecided: ['U47'] });
    T({ from: row(next + '.NotFound'), event: d + '.searchAgain', to: row(next),
      note: '決定 (U29): Search again でもう一度次の相手を探す', decided: ['U29'] });
    T({ from: row(next + '.NotFound'), event: d + '.backToOnlineBattle', to: row(R + '.MultiModeSelection'),
      note: '決定 (U29): Back to Online で Online Battle へ', decided: ['U29', 'U24'] });
  });

  // === 対戦中の決着と切断 ===
  // Win / Lose / Draw は端末の下のモック操作。勝敗判定そのものはモックの対象外 (引き分けになる条件は U44)
  [['host.win', 'Win'], ['host.lose', 'Lose'], ['host.draw', 'Draw'], ['client.win', 'Lose'], ['client.lose', 'Win'], ['client.draw', 'Draw']].forEach(function (p) {
    var mine = /win$/.test(p[0]) ? '勝ち' : /lose$/.test(p[0]) ? '負け' : '引き分け';
    T({ from: { host: hostInPlay, client: clientInPlay }, event: p[0],
      to: { host: resultState('Host', p[1]), client: resultState('Client', OPPOSITE[p[1]]) },
      note: 'モック操作: 押した側が' + mine + '、相手は自動で' + (p[1] === 'Draw' ? '同じく引き分け' : '逆の結果') + '。' +
        '決定 (U20): 結果画面に勝敗・両者の名前・スコア・終わった理由。MATCH MENU や降参の確認を開いていても試合は続いているので、そのまま結果画面へ (U37)',
      decided: ['U20', 'U37'], undecided: p[1] === 'Draw' ? ['U44'] : [] });
  });
  // 決定 (U28): 片方が切断したら 20 秒 (仮) 待ち、戻らなければ切断した側の負け。両者の切断・サービス障害は No contest
  [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var O = p[3];
    var pair = function (mine, theirs) {
      var r = {};
      r[d] = mine;
      r[other] = theirs;
      return r;
    };
    var waiting = pair(R + '.Game.Disconnected', O + '.Game.OpponentDisconnected');
    T({ from: pair(d === 'host' ? hostInPlay : clientInPlay, other === 'host' ? hostInPlay : clientInPlay), event: d + '.disconnect', to: waiting,
      note: 'モック操作: この端末の接続が切れる。決定 (U28): 相手は 20 秒 (仮) 待つ。待っている間の両端末の画面は仮 (U46)', decided: ['U28'], undecided: ['U46'] });
    T({ from: waiting, event: 'net.recovered', to: pair(R + '.Game.Play', O + '.Game.Play'),
      note: '仮: 20 秒 (仮) 以内に戻れば試合を続ける (U46)', decided: ['U28'], undecided: ['U46'] });
    T({ from: waiting, event: 'timer.disconnectTimeout', to: pair(resultState(R, 'Lose', '.Disconnected'), resultState(O, 'Win', '.OpponentDisconnected')),
      note: '決定 (U28): 20 秒 (仮) たっても戻らなければ切断した側の負け。ランダム対戦ではレートも変わる (U21)', decided: ['U28', 'U21'] });
  });
  T({ from: { host: hostInGame, client: clientInGame }, event: 'net.bothDisconnected', to: { host: 'Host.NoContestResult', client: 'Client.NoContestResult' },
    note: '決定 (U28): 両者が切断したら "No contest due to a connection error"。レートは変わらない。片方の切断を待っている間にもう片方も切れたときも同じ', decided: ['U28', 'U21'] });
  T({ from: { host: hostInGame, client: clientInGame }, event: 'net.serviceFailure', to: { host: 'Host.NoContestResult', client: 'Client.NoContestResult' },
    note: '決定 (U28): サービス障害も "No contest due to a connection error"。レートは変わらない', decided: ['U28', 'U21'] });

  // === 結果画面の再戦 (決定 U23 / U30、高宮さん 2026-10-07) ===
  // どちらからでも申し込め、相手が応じたらそのまま VS 画面へ。申し込みは 20 秒 (仮) で期限切れ。
  // 取り消し・辞退・期限切れのあとは両者とも結果画面に残り、3 秒 (仮) たつまで申し込めない。タイマーは環境イベント (端末の外)
  OUTCOMES.forEach(function (o) {
    var H = function (ph) { return resultState('Host', o, ph); };
    var C = function (ph) { return resultState('Client', OPPOSITE[o], ph); };
    [['host', 'client'], ['client', 'host']].forEach(function (p) {
      var d = p[0];
      var other = p[1];
      var mine = d === 'host' ? H : C;
      var theirs = d === 'host' ? C : H;
      var pair = function (m, t) { return d === 'host' ? { host: m, client: t } : { host: t, client: m }; };
      var asked = pair(mine('.RematchRequested'), theirs('.RematchIncoming'));
      T({ from: pair(mine(''), theirs('')), event: d + '.rematch', to: asked,
        note: '決定 (U23 / U30): どちらからでも申し込める。押した側は "Waiting for your opponent…" と Cancel Request、相手は "Your opponent wants a rematch" と Rematch / Decline',
        decided: ['U23', 'U30'] });
      T({ from: asked, event: other + '.rematch', to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { rated: false },
        note: '決定 (U23): 相手が Rematch で応じたらそのまま VS 画面へ (ロビーの Ready は挟まない)。ランダム対戦の再戦はレートが変わらない (U21)',
        decided: ['U23', 'U21'] });
      T({ from: asked, event: d + '.cancelRematch', to: pair(mine('.RematchCooldown'), theirs('.RematchCancelled')),
        note: '決定 (U30): Cancel Request で取り消すと、相手に "Rematch request was cancelled"。両者とも結果画面に残り、3 秒 (仮) は申し込めない', decided: ['U30'], undecided: ['U50'] });
      T({ from: asked, event: other + '.declineRematch', to: pair(mine('.RematchDeclined'), theirs('.RematchCooldown')),
        note: '決定 (U30): Decline で断ると、申し込んだ側に "Your opponent declined the rematch"。両者とも結果画面に残り、3 秒 (仮) は申し込めない', decided: ['U30'], undecided: ['U50'] });
      T({ from: asked, event: 'timer.rematchTimeout', to: pair(mine('.RematchExpired'), theirs('.RematchCooldown')),
        note: '決定 (U30): 20 秒 (仮) 応答がなければ、申し込んだ側に "No response to rematch request"。両者とも結果画面に残り、3 秒 (仮) は申し込めない', decided: ['U30'], undecided: ['U50'] });
    });
    T({ from: { host: H(''), client: C('') }, event: 'sys.rematchSimultaneous', to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { rated: false },
      note: '決定 (U23): 両者が同時に申し込んだら成立 (応じたのと同じ) で VS 画面へ', decided: ['U23', 'U21'] });
    T({ from: { host: resultStates('Host', o, COOLDOWN_PHASES), client: resultStates('Client', OPPOSITE[o], COOLDOWN_PHASES) }, event: 'timer.rematchCooldown',
      to: { host: H(''), client: C('') }, note: '決定 (U30): 3 秒 (仮) たったら、どちらからでもまた申し込める', decided: ['U30'] });
  });

  // === 結果画面から抜ける (決定 U22 / U24 / U25 / U26) ===
  // 自動では次へ進まない (U26)。Friend Match は Back to Friend Match、ランダム対戦は Find Next Opponent / Back to Online。
  // 相手がまだ再戦できる結果画面にいれば、相手には "Your opponent left. Rematch is not available." (U25、勝敗とレートは変わらない)
  [['host', 'Host', 'client', 'Client'], ['client', 'Client', 'host', 'Host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var O = p[3];
    var pair = function (mine, theirs) {
      var r = {};
      r[d] = mine;
      r[other] = theirs;
      return r;
    };
    var leavable = d === 'host' ? hostResultLeavable : clientResultLeavable;
    [
      ['backToFriendMatch', R + '.FriendMatch.Room', 'friend', '決定 (U24): Friend Match トップ (Match Code を作る・入れる画面) へ。前の Match Code は使えなくなる'],
      ['findNextOpponent', R + '.Matchmake.NextOpponent', 'random', '決定 (U22 / U29): 次の相手を探す (60 秒、仮)'],
      ['backToOnlineBattle', R + '.MultiModeSelection', 'random', '決定 (U22 / U24): Online Battle へ'],
    ].forEach(function (b) {
      OUTCOMES.forEach(function (oo) {
        T({ from: pair(leavable, resultStates(O, oo, REMATCH_PHASES)), event: d + '.' + b[0], when: { match: b[2] },
          to: pair(b[1], resultState(O, oo, '.OpponentLeft')),
          note: b[3] + '。決定 (U25): 相手に "Your opponent left. Rematch is not available."', decided: ['U22', 'U24', 'U25'] });
      });
      T({ from: pair(leavable, '*'), event: d + '.' + b[0], when: { match: b[2] }, to: pair(b[1], '*'),
        note: b[3] + '。相手はすでに結果画面を抜けているか、再戦の無い結果画面 (降参・切断・No contest) にいる', decided: ['U22', 'U24'], undecided: ['U45'] });
    });
    // 降参した側 (決定 U41 / U24): Friend Match でもランダム対戦でも Online Battle へ
    T({ from: pair(resultState(R, 'Lose', '.Surrendered'), '*'), event: d + '.backToOnlineBattle', to: pair(R + '.MultiModeSelection', '*'),
      note: '決定 (U41 / U24): 降参して負けたあとは、Friend Match でもランダム対戦でも Back to Online で Online Battle へ', decided: ['U41', 'U24', 'U22'] });
  });

  // === 結果画面のスタンプ (決定 U27、高宮さん 2026-10-07) ===
  // 👏 Good game / 🤝 Thanks for the match / 👍 Nice。1 つ 3 秒 (仮) 表示し、次を送れるのは送ってから 5 秒 (仮) 後。相手のスタンプはミュートできる。
  // 3 秒・5 秒は端末の下のモック操作
  [['host', 'Host', 'client'], ['client', 'Client', 'host']].forEach(function (p) {
    var d = p[0];
    var R = p[1];
    var other = p[2];
    var mine = function (st, extra) {
      var r = {};
      r[d] = st;
      r[other] = '*';
      return Object.assign(r, extra);
    };
    var field = function (f, v) {
      var r = {};
      r[d + f] = v;
      return r;
    };
    var stampable = d === 'host' ? hostStampable : clientStampable;
    var any = d === 'host' ? hostResultAny : clientResultAny;
    STAMPS.forEach(function (s) {
      T({ from: mine(stampable, field('Stamp', null)), event: d + '.stamp.' + s.id, to: mine('=', {}), set: field('Stamp', s.id),
        note: '決定 (U27): ' + s.emoji + ' "' + s.text + '" を送る。両者の画面に 3 秒 (仮) 出る (相手がミュートしていれば相手には出ない)', decided: ['U27'], undecided: ['U49'] });
    });
    T({ from: mine(any, field('Stamp', STAMPS.map(function (s) { return s.id; }))), event: d + '.stampShown', to: mine('=', {}), set: field('Stamp', 'sent'),
      note: 'モック操作。決定 (U27): 3 秒 (仮) たつとスタンプが消える。次を送れるのは送ってから 5 秒 (仮) 後', decided: ['U27'] });
    T({ from: mine(any, field('Stamp', STAMPS.map(function (s) { return s.id; }).concat(['sent']))), event: d + '.stampInterval', to: mine('=', {}), set: field('Stamp', null),
      note: 'モック操作。決定 (U27): 送ってから 5 秒 (仮) たつと次を送れる (表示中なら同時に消える)', decided: ['U27'] });
    T({ from: mine(stampable, field('Mute', false)), event: d + '.muteStamps', to: mine('=', {}), set: field('Mute', true),
      note: '決定 (U27): 相手のスタンプをミュートする。続く範囲 (同じ相手と対戦している間) は仮 (U49)', decided: ['U27'], undecided: ['U49'] });
    T({ from: mine(stampable, field('Mute', true)), event: d + '.unmuteStamps', to: mine('=', {}), set: field('Mute', false),
      note: '決定 (U27): ミュートを解く', decided: ['U27'], undecided: ['U49'] });
  });

  rows.forEach(function (r, i) {
    r.id = 'T' + String(i + 1).padStart(2, '0');
    r.undecided = r.undecided || [];
    r.decided = r.decided || [];
  });
  return rows;
})();

// ---- イベントの日本語ラベル ---------------------------------------------------

var EVENT_LABELS = {
  'host.friendMatch': 'ホスト: Friend Match を選ぶ',
  'host.randomMatch': 'ホスト: Random Match を選ぶ',
  'host.createMatch': 'ホスト: Create Match を押す',
  'host.joinMatch': 'ホスト: Join Match を押す',
  'host.ready': 'ホスト: Ready を押す',
  'host.cancelReady': 'ホスト: Cancel Ready を押す',
  'host.leaveRoom': 'ホスト: Leave Room を押す (ルームを閉じる)',
  'host.cancelMatch': 'ホスト: Cancel Match を押す',
  'host.cancelSearch': 'ホスト: 相手を探している間に Cancel を押す',
  'host.leaveApp': 'ホスト: アプリを離れて戻る (モック操作: バックグラウンド・画面ロック)',
  'host.searchTimeout': 'ホスト: 60 秒 (仮) たっても相手が見つからない (モック操作)',
  'host.searchAgain': 'ホスト: Search again を押す',
  'host.closeNotice': 'ホスト: 通知の Close を押す',
  'host.back': 'ホスト: ‹ (戻る / 別画面へ)',
  'host.tapToast': 'ホスト: トーストをタップ',
  'host.matchMenu': 'ホスト: メニューボタン (☰) を押す',
  'host.matchMenu.continue': 'ホスト: MATCH MENU の CONTINUE を押す',
  'host.matchMenu.surrender': 'ホスト: MATCH MENU の SURRENDER を押す',
  'host.surrenderConfirm.continue': 'ホスト: 降参の確認で CONTINUE を押す',
  'host.surrenderConfirm.surrender': 'ホスト: 降参の確認で SURRENDER を押す',
  'host.backToOnlineBattle': 'ホスト: Back to Online を押す',
  'host.findNextOpponent': 'ホスト: Find Next Opponent を押す',
  'host.win': 'ホスト: Win を押す (モック操作)',
  'host.lose': 'ホスト: Lose を押す (モック操作)',
  'host.draw': 'ホスト: Draw を押す (モック操作)',
  'host.disconnect': 'ホスト: 接続が切れる (モック操作)',
  'host.rematch': 'ホスト: Rematch を押す (申し込む / 応じる)',
  'host.cancelRematch': 'ホスト: Cancel Request を押す (再戦の申し込みを取り消す)',
  'host.declineRematch': 'ホスト: Decline を押す (再戦を断る)',
  'host.backToFriendMatch': 'ホスト: Back to Friend Match を押す',
  'host.stamp.gg': 'ホスト: スタンプ 👏 Good game を送る',
  'host.stamp.thanks': 'ホスト: スタンプ 🤝 Thanks for the match を送る',
  'host.stamp.nice': 'ホスト: スタンプ 👍 Nice を送る',
  'host.stampShown': 'ホスト: 送ったスタンプが出てから 3 秒 (仮) たつ (モック操作)',
  'host.stampInterval': 'ホスト: スタンプを送ってから 5 秒 (仮) たつ (モック操作)',
  'host.muteStamps': 'ホスト: 相手のスタンプをミュートする',
  'host.unmuteStamps': 'ホスト: スタンプのミュートを解く',
  'host.dialog.cancelMatch': 'ホスト: ダイアログで Cancel Match',
  'host.dialog.keepWaiting': 'ホスト: ダイアログで Keep Waiting',
  'host.dialog.createMatch': 'ホスト: ダイアログで Create Match',
  'host.dialog.joinMatch': 'ホスト: ダイアログで Join Match',
  'host.dialog.keepCurrent': 'ホスト: ダイアログで Keep Current Match',
  'host.dialog.leaveRoom': 'ホスト: ダイアログで Leave Room',
  'host.dialog.stay': 'ホスト: ダイアログで Stay in Room',
  'client.friendMatch': 'クライアント: Friend Match を選ぶ',
  'client.randomMatch': 'クライアント: Random Match を選ぶ',
  'client.enterCode': 'クライアント: QWERTY123 を入力',
  'client.joinMatch': 'クライアント: Join Match を押す',
  'client.ready': 'クライアント: Ready を押す',
  'client.cancelReady': 'クライアント: Cancel Ready を押す',
  'client.leaveRoom': 'クライアント: Leave Room を押す',
  'client.leaveMatch': 'クライアント: Leave Match を押す',
  'client.cancelSearch': 'クライアント: 相手を探している間に Cancel を押す',
  'client.leaveApp': 'クライアント: アプリを離れて戻る (モック操作: バックグラウンド・画面ロック)',
  'client.searchTimeout': 'クライアント: 60 秒 (仮) たっても相手が見つからない (モック操作)',
  'client.searchAgain': 'クライアント: Search again を押す',
  'client.closeNotice': 'クライアント: 通知の Close を押す',
  'client.back': 'クライアント: ‹ (戻る / 別画面へ)',
  'client.tapToast': 'クライアント: トーストをタップ',
  'client.matchMenu': 'クライアント: メニューボタン (☰) を押す',
  'client.matchMenu.continue': 'クライアント: MATCH MENU の CONTINUE を押す',
  'client.matchMenu.surrender': 'クライアント: MATCH MENU の SURRENDER を押す',
  'client.surrenderConfirm.continue': 'クライアント: 降参の確認で CONTINUE を押す',
  'client.surrenderConfirm.surrender': 'クライアント: 降参の確認で SURRENDER を押す',
  'client.backToOnlineBattle': 'クライアント: Back to Online を押す',
  'client.findNextOpponent': 'クライアント: Find Next Opponent を押す',
  'client.win': 'クライアント: Win を押す (モック操作)',
  'client.lose': 'クライアント: Lose を押す (モック操作)',
  'client.draw': 'クライアント: Draw を押す (モック操作)',
  'client.disconnect': 'クライアント: 接続が切れる (モック操作)',
  'client.rematch': 'クライアント: Rematch を押す (申し込む / 応じる)',
  'client.cancelRematch': 'クライアント: Cancel Request を押す (再戦の申し込みを取り消す)',
  'client.declineRematch': 'クライアント: Decline を押す (再戦を断る)',
  'client.backToFriendMatch': 'クライアント: Back to Friend Match を押す',
  'client.stamp.gg': 'クライアント: スタンプ 👏 Good game を送る',
  'client.stamp.thanks': 'クライアント: スタンプ 🤝 Thanks for the match を送る',
  'client.stamp.nice': 'クライアント: スタンプ 👍 Nice を送る',
  'client.stampShown': 'クライアント: 送ったスタンプが出てから 3 秒 (仮) たつ (モック操作)',
  'client.stampInterval': 'クライアント: スタンプを送ってから 5 秒 (仮) たつ (モック操作)',
  'client.muteStamps': 'クライアント: 相手のスタンプをミュートする',
  'client.unmuteStamps': 'クライアント: スタンプのミュートを解く',
  'client.dialog.leaveMatch': 'クライアント: ダイアログで Leave Match',
  'client.dialog.goBack': 'クライアント: ダイアログで Go Back',
  'client.dialog.leaveRoom': 'クライアント: ダイアログで Leave Room',
  'client.dialog.stay': 'クライアント: ダイアログで Stay in Room',
  'sys.peerConnected': '自動: クライアントの接続完了',
  'sys.readyScreen': '自動: Ready 画面になる',
  'sys.readyConfirmed': '自動: 押した Ready が届く ("Confirming…" が終わる)',
  'sys.bothStarted': '自動: 開始の同期が終わる',
  'sys.opponentFound': '自動: 対戦相手が見つかる',
  'vs.done': '自動: VS 画面が終わる',
  'game.countdownDone': '自動: ゲーム本体のカウントダウンが終わる',
  'net.unstable': '環境: 通信が不安定になる',
  'net.recovered': '環境: 通信が回復する',
  'net.lost': '環境: 通信が回復しない',
  'net.bothDisconnected': '環境: 対戦中に両者の接続が切れる',
  'net.serviceFailure': '環境: 対戦中にサービス障害が起きる',
  'timer.disconnectTimeout': '環境: 切断から 20 秒 (仮) たつ',
  'timer.readyTimeout': '環境: 片方が Ready のまま 60 秒 (仮) たつ',
  'timer.loadTimeout': '環境: 読み込み (Starting match…) が 20 秒 (仮) で終わらない',
  'timer.rematchTimeout': '環境: 再戦の申し込みから 20 秒 (仮) たつ (応答なし)',
  'timer.rematchCooldown': '環境: 3 秒 (仮) たつ (また再戦を申し込める)',
  'sys.rematchSimultaneous': '環境: 両者が同時に Rematch を押す',
  'timer.codeExpired': '環境: Match Code の有効期限が切れる',
};

// ---- 画面の描画仕様 ---------------------------------------------------------
// view: online | friendTop | lobby | stage | random | vs | game | result
// ボタンの event はデバイス名を除いたもの (例: 'ready' → 'host.ready')

var TOASTS = {
  waiting: { kind: 'blue', text: 'Waiting for your friend…' },
  joined: { kind: 'green', text: 'Friend joined!' },
  ready: { kind: 'red', text: 'Ready to start', tap: 'tapToast' },
  expired: { kind: 'darkred', text: 'Match code expired', tap: 'tapToast' },
  failed: { kind: 'grey', text: 'Connection failed', tap: 'tapToast' },
  lost: { kind: 'grey', text: 'Connection lost' },
};

// オンライン対戦の MATCH MENU (決定 U37〜U42) と降参の確認。ボタンの event はデバイス名を除いたもの。
// 対戦中に REMATCH / RETRY は出さず (U39)、QUIT ではなく SURRENDER (U41)
var MATCH_MENU = {
  title: 'MATCH MENU', body: 'The match continues while the menu is open.',
  buttons: [{ label: 'CONTINUE', event: 'matchMenu.continue', kind: 'continue' }, { label: 'SURRENDER', event: 'matchMenu.surrender', kind: 'surrender' }],
};
var SURRENDER_CONFIRM = {
  title: 'Surrender?', body: 'You will lose.',
  buttons: [{ label: 'CONTINUE', event: 'surrenderConfirm.continue', kind: 'continue' }, { label: 'SURRENDER', event: 'surrenderConfirm.surrender', kind: 'surrender' }],
};
// 結果画面の終わった理由の行 (決定 U20 / U28 / U38)
var END_REASONS = {
  finish: 'Match finished',
  surrendered: 'You surrendered',
  opponentSurrendered: 'Your opponent surrendered',
  disconnected: 'You were disconnected',
  opponentDisconnected: 'Your opponent disconnected',
  connectionError: 'No contest due to a connection error',
};
// 結果画面の再戦の段階ごとの一行 (決定 U23 / U25 / U30)。.RematchCooldown (自分が取り消した・断った、相手の申し込みが期限切れ) は何も出さない
var REMATCH_STATUS = {
  RematchRequested: { text: 'Waiting for your opponent…', kind: 'wait' },
  RematchIncoming: { text: 'Your opponent wants a rematch', kind: 'asked' },
  RematchCancelled: { text: 'Rematch request was cancelled', kind: 'info' },
  RematchDeclined: { text: 'Your opponent declined the rematch', kind: 'info' },
  RematchExpired: { text: 'No response to rematch request', kind: 'info' },
  OpponentLeft: { text: 'Your opponent left. Rematch is not available.', kind: 'info' },
};
// レーティング (決定 U21): ランダム対戦の最初の 1 戦だけ Elo で変わる。Friend Match と、同じ相手との再戦では変わらない。
// 初期値 1000・K=24 は QA² 側の仮の値 (モックでは両者とも初期値から)
var ELO = { initial: 1000, k: 24 };
var OUTCOME_SCORE = { Win: 1, Lose: 0, Draw: 0.5 };
function eloDelta(mine, theirs, score) {
  return Math.round(ELO.k * (score - 1 / (1 + Math.pow(10, (theirs - mine) / 400))));
}
function ratingText(outcome, session) {
  if (session.match === 'friend') return 'No rating change (friend match)';
  if (session.match !== 'random') return null;
  if (outcome === 'NoContest') return 'No rating change (no contest)';
  if (!session.rated) return 'No rating change (rematch)';
  var delta = eloDelta(ELO.initial, ELO.initial, OUTCOME_SCORE[outcome]);
  return ELO.initial + ' \u2192 ' + (ELO.initial + delta) + ' (' + (delta > 0 ? '+' + delta : delta < 0 ? '-' + -delta : '\u00B10') + ')';
}
// 試合のスコア (モックのデモ値。自分 - 相手)。決まっていないとき (No contest) は行ごと出さない (U20)
var DEMO_SCORES = { Win: [3200, 2750], Lose: [2750, 3200], Draw: [2900, 2900] };
// 結果画面のボタン (決定 U22 / U24 / U41)。Friend Match とランダム対戦で違うので、画面 (SCREENS) とセッションの match から決める
function resultButtons(spec, match) {
  if (spec.reason === 'surrendered') return [{ label: 'Back to Online', event: 'backToOnlineBattle', primary: true }];
  var random = match === 'random';
  var ph = spec.phase;
  var rematch = [];
  if (spec.rematch && ph === 'RematchRequested') rematch = [{ label: 'Cancel Request', event: 'cancelRematch' }];
  else if (spec.rematch && ph === 'RematchIncoming') {
    rematch = [{ label: 'Rematch', event: 'rematch', primary: true, half: true }, { label: 'Decline', event: 'declineRematch', half: true }];
  } else if (spec.rematch && COOLDOWN_PHASES.indexOf('.' + ph) !== -1) rematch = [{ label: 'Rematch', disabled: true }];
  else if (spec.rematch && ph !== 'OpponentLeft') rematch = [{ label: 'Rematch', event: 'rematch', primary: !random }];
  var invited = rematch.some(function (b) { return b.primary; }) || ph === 'RematchRequested';
  if (!random) return rematch.concat([{ label: 'Back to Friend Match', event: 'backToFriendMatch', primary: !rematch.length }]);
  return [{ label: 'Find Next Opponent', event: 'findNextOpponent', primary: !invited }].concat(rematch, [{ label: 'Back to Online', event: 'backToOnlineBattle' }]);
}
// 対戦中に片方が切断したときのゲーム画面の上の表示 (U28 の決定の待ち時間。表示は仮、U46)
var DISCONNECT_OVERLAYS = {
  self: { title: 'Connection lost', body: 'Reconnecting…' },
  opponent: { title: 'Your opponent disconnected', body: 'Waiting for your opponent to reconnect…' },
};
// ランダム対戦で相手を探すのをやめたときの通知 (決定 U13)。60 秒という長さは端末の画面には出さない
var SEARCH_NOTICES = { stopped: 'Search stopped while the app was in the background.', notFound: 'No opponent found.' };

// 右パネルに出す、その状態の画面の説明 (端末の画面の中には出さない)
var GAME_COUNTDOWN_CONTEXT = 'ゲーム本体のカウントダウン（VsAI と同じ 3→2→1）。終わるとメニューボタン (☰) が出てプレイ開始。' +
  '3-2-1 のあとサーバーが確認した時点で試合開始 (決定 U32)。それまでの切断 (Friend Match の VS 画面・カウントダウン中) は勝敗をつけず、Ready 画面に戻して相手は 20 秒 (仮) 待つ。';
var GAME_CONTEXT = 'プレイ中のゲーム画面 (プレースホルダー)。右上のメニューボタン (☰) で MATCH MENU を開く (U37)。決着は端末の下のモック操作 Win / Lose / Draw、「切断する」でこの端末の接続が切れる (U28)。';
// 結果画面の説明。端末の画面には出さず (未決は端末の上の帯)、右パネルに出す。秒数・Elo の値が QA² 側の仮の値であることもここと README にだけ書く
var RESULT_CONTEXT = '結果画面 (決定 U20〜U22 / U24 / U26)。勝敗・両者の名前・スコア・終わった理由を出す (スコアはモックのデモ値。No contest のように決まっていないときは行ごと出さない)。' +
  'レーティングはランダム対戦の最初の 1 戦だけ Elo で変わり、Friend Match と同じ相手との再戦では変わらない (U21)。Elo の初期値 1000・K=24 は QA² 側の仮の値。' +
  'ボタンは Friend Match なら Rematch / Back to Friend Match、ランダム対戦なら Find Next Opponent / Rematch / Back to Online。自動では次へ進まない (U26)。';
var RESULT_PHASE_CONTEXT = {
  RematchRequested: '自分が再戦を申し込んで待っている (U23 / U30)。Cancel Request で取り消せる。応答の期限 20 秒 (仮) は左の環境イベントで進める (秒数は端末の画面に出さない)。',
  RematchIncoming: '相手から再戦を申し込まれた (U23 / U30)。Rematch で応じるとそのまま VS 画面、Decline で断る。',
  RematchCancelled: '相手が申し込みを取り消した (U30)。両者とも結果画面に残り、3 秒 (仮) は Rematch を押せない (左の環境イベント「3 秒たつ」で進める)。',
  RematchDeclined: '相手が再戦を断った (U30)。両者とも結果画面に残り、3 秒 (仮) は Rematch を押せない (左の環境イベント「3 秒たつ」で進める)。',
  RematchExpired: '再戦の申し込みに 20 秒 (仮) 応答がなかった (U30)。両者とも結果画面に残り、3 秒 (仮) は Rematch を押せない (左の環境イベント「3 秒たつ」で進める)。',
  RematchCooldown: '取り消した・断った・申し込まれたまま期限が切れた側 (U30)。メッセージは出さず (仮、U50)、3 秒 (仮) は Rematch を押せない。',
  OpponentLeft: '相手が結果画面を抜けた (決定 U25)。勝敗とレートは変わらず、再戦はできない。',
};
var STAMP_CONTEXT = 'スタンプ (決定 U27): 👏 Good game / 🤝 Thanks for the match / 👍 Nice。1 つ 3 秒 (仮) 出て、次を送れるのは送ってから 5 秒 (仮) 後 (どちらも端末の下のモック操作で進める)。' +
  '🔔 で相手のスタンプをミュートできる (続く範囲は仮、U49)。';
var MATCHMAKE_CONTEXT = 'ランダム対戦で相手を探している画面 (決定 U13a / U13)。相手が見つかり次第 VS 画面へ進む (Ready 画面は無い)。' +
  'Cancel と ‹ はどちらも確認なしで Online Battle へ戻る (U13)。探している間は、ほかの画面へは行けない。' +
  'アプリを離れる (バックグラウンド・画面ロック) と検索を止める。60 秒探しても見つからなければ Online Battle に "No opponent found." を出す (60 秒という長さは仮)。' +
  'どちらも端末の下のモック操作で試せる。';
var SEARCH_STOPPED_CONTEXT = 'アプリを離れた (バックグラウンド・画面ロック) ので検索を止めた (決定 U13)。戻ると Online Battle の中に "Search stopped while the app was in the background." を出す (決定 U43)。' +
  'モーダルではないので Random Match / Friend Match もそのまま押せる。Search again で新しく探し、Close で閉じる。自動では消えず、ほかの画面へ移ると消える。';
var SEARCH_NOT_FOUND_CONTEXT = '60 秒探しても相手が見つからなかった (決定 U13、60 秒という長さは仮)。元の画面 (Online Battle) に "No opponent found." を出す。' +
  'Search again でもう一度相手を探し (Searching に戻る)、Close で通知を閉じて Online Battle のまま。';
var MATCH_MENU_CONTEXT = 'MATCH MENU (決定 U37)。試合は止まらない: Time.timeScale = 0 にせず、暗幕も薄くしてゲームが見えたまま。メニュー中に試合が終われば (Win / Lose) そのまま結果画面へ。' +
  '開いただけでは相手の端末には何も出ない (U38)。対戦中に REMATCH / RETRY は無い (U39、再戦は結果画面だけ)。BGM も下げない (U42、モックには音が無い)。';
var SURRENDER_CONFIRM_CONTEXT = '降参の確認 (決定 U40)。確認中も試合は続く。CONTINUE でプレイに戻り、SURRENDER で負けが決まって相手は勝ちの結果画面に "Your opponent surrendered" (U38)。ボタンは QUIT ではなく SURRENDER (U41)。';
var SPECIAL_RESULT_CONTEXT = {
  Surrendered: '降参した側の負けの結果画面 (決定 U38)。Friend Match でもランダム対戦でも Back to Online で Online Battle へ戻る (決定 U41 / U24)。降参した側は再戦を申し込めない (U28)。',
  OpponentSurrendered: '相手が降参したので勝ち。"Your opponent surrendered" を出す (決定 U38)。降参した側は再戦を申し込めないので、モックではこちらからも申し込めない (仮、U45)。',
  Disconnected: '自分の接続が切れ、20 秒 (仮) のうちに戻れなかったので負け (決定 U28)。ランダム対戦ではレートも変わる。再戦は無い (仮、U45)。',
  OpponentDisconnected: '相手の接続が切れ、20 秒 (仮) のうちに戻らなかったので勝ち (決定 U28)。再戦は無い (仮、U45)。',
  NoContest: '両者の切断かサービス障害で、勝敗なし (決定 U28)。"No contest due to a connection error"、レートは変わらない。スコアは決まっていないので行ごと出さない (U20)。再戦は無い (仮、U45)。',
};
var DISCONNECT_CONTEXT = {
  self: 'この端末の接続が切れた (決定 U28)。20 秒 (仮) のうちに戻れば試合を続け、戻れなければ負け。待っている間の画面と、試合が止まるかは仮 (U46)。左の環境イベントで「通信が回復する」「切断から 20 秒たつ」を選べる。',
  opponent: '相手の接続が切れたので 20 秒 (仮) 待つ (決定 U28)。戻らなければ勝ち。待っている間の画面と、試合が止まるかは仮 (U46)。Win / Lose / Draw は押せない。',
};
var NEXT_SEARCH_CONTEXT = '結果画面の Find Next Opponent で次の相手を探している (決定 U29)。見た目と Cancel / ‹ は Random Match から探しているとき (U13) と同じ。' +
  '60 秒 (仮) 探しても見つからなければ "No opponent found." と Search again / Back to Online。探している間にアプリを離れたときの行は無い (U47)。';
var NEXT_NOT_FOUND_CONTEXT = '60 秒 (仮) 探しても次の相手が見つからなかった (決定 U29)。Search again でもう一度探し、Back to Online で Online Battle へ。' +
  '(Random Match から探したとき (U13) は Online Battle の上に出すので Close だが、こちらは Random Match の画面の上に出すので Back to Online)';

// Ready 画面 (決定 U31 変更 / U32〜U36)。60 秒・20 秒は端末の画面にはカウントダウンとして出すが、それが QA² 側の仮の値であることは右パネルと README にだけ書く
var READY_TEXT = {
  waiting: 'Waiting for opponent\u2026',
  opponentReady: 'Opponent is ready. Are you?',
  confirming: 'Confirming\u2026',
  starting: 'Starting match\u2026',
  reconnecting: 'Reconnecting\u2026',
  opponentDisconnected: 'Opponent disconnected.\nWaiting for them to reconnect\u2026',
};
var READY_NOTICE_TEXT = {
  TimedOut: 'Ready check timed out. Press Ready when you\u2019re ready.',
  OpponentNotReady: 'Opponent is no longer ready.',
  StartFailed: 'Match could not start. Please try again.',
};
var READY_TIMERS = { ready: 60, reconnect: 20 }; // 秒。どちらも QA² 側の仮の値 (U33 / U32)
var READY_CONTEXT = 'Ready 画面 (決定 U31 変更 / U36)。プレイヤーごとのカードに "\u2713 Ready" / "Not ready"。両者が Ready を押したら "Starting match\u2026" → VS 画面 → ゲーム本体のカウントダウン。' +
  '3-2-1 のあとサーバーが確認するまでは試合開始ではなく、Ready は取り消せ、勝敗は記録しない (U32)。Leave Room と \u2039 は確認 "No match has started. No win or loss will be recorded." を出す (U34 / U35)。' +
  '端末の下のモック操作「アプリを離れる」でその人の Ready が消え (U35)、「切断する」で開始前の切断になる (U32)。';
var READY_PHASE_CONTEXT = {
  Confirming: 'Ready を送っている間 (決定 U36)。ボタンが "Confirming\u2026" になり、届くと自動で次へ進む (モックは 0.8 秒)。送っている間は Leave Room / \u2039 を押せない (仮、U53)。',
  WaitingForOpponent: '自分だけ Ready (決定 U36)。"Waiting for opponent\u2026" と 60 秒のカウントダウン、Cancel Ready。60 秒は QA² 側の仮の値で、モックは押した直後の "60s" のまま描く。' +
    '相手が押さないまま 60 秒たつと (左の環境イベント) 両者の Ready が消えて "Ready check timed out…" (U33)。Cancel Ready で取り消しても、ルームには残る (U34)。',
  OpponentReady: '相手だけ Ready (決定 U36)。"Opponent is ready. Are you?"。Ready を押せば開始する。',
  TimedOut: '片方が Ready のまま 60 秒 (仮) たったので、両者の Ready を消した (決定 U33)。罰はなく、どちらもルームに残る。',
  OpponentNotReady: '相手が Ready を取り消した (Cancel Ready、決定 U34) か、アプリを離れて Ready が消えた (決定 U35。相手への表示が同じなのは仮、U53)。',
  StartFailed: '読み込み ("Starting match\u2026") が 20 秒 (仮) で終わらなかった (決定 U32)。両者とも Ready 画面に戻り、Ready は消えている。もう一度両者が Ready を押せば開始する。',
  Starting: '両者の Ready がそろい、読み込み中 (決定 U31 / U32)。20 秒 (仮) で終わらなければ "Match could not start. Please try again." で両者とも Ready 画面に戻る (左の環境イベント)。' +
    '読み込み中は Cancel Ready / Leave Room / \u2039 を出さない (仮、U53)。',
  OpponentDisconnected: '開始前に相手の接続が切れた (決定 U32)。両者の Ready を消し、"Opponent disconnected. Waiting for them to reconnect\u2026" と 20 秒のカウントダウン、Leave Room。' +
    '20 秒は QA² 側の仮の値で、モックは "20s" のまま描く。戻れば (左の環境イベント「通信が回復する」) 両者とももう一度 Ready を押し、カウントダウンは 3 からやり直す。' +
    '戻らなければ (「切断から 20 秒たつ」)、相手がクライアントならホストは "Match cancelled. Opponent did not reconnect." で同じ Match Code のままルームに残り、相手がホストならクライアントは "Room closed. The host disconnected." で Friend Match トップへ。勝敗は記録しない。',
  Reconnecting: 'この端末の接続が切れた (開始前、決定 U32)。相手は 20 秒 (仮) 待つ。切断した側の "Reconnecting\u2026" の表示と、戻れなかったときの行き先は仮 (U52)。',
};
var ROOM_CONTEXT = {
  ClientLeft: '友だちが抜けた (決定 U34)。同じ Match Code のまま、次の友だちを待つ。図05 の "left the match." → 自動で待機に戻る流れを、この 1 画面にまとめた。',
  MatchCancelled: '開始前に切断した友だちが 20 秒 (仮) のうちに戻らなかった (決定 U32)。結果は無く、同じ Match Code のままルームに残って次の友だちを待つ。',
  HostLeft: 'ホストがルームを閉じた (決定 U34)。Friend Match トップに "Room closed. The host left."。前の Match Code は使えない。お知らせはほかの操作で消える (仮、U52)。',
  HostDisconnected: '開始前に切断したホストが 20 秒 (仮) のうちに戻らなかった (決定 U32)。Friend Match トップに "Room closed. The host disconnected."。お知らせはほかの操作で消える (仮、U52)。',
};

var SCREENS = (function () {
  var S = {};
  var B = {
    // Ready 画面 (決定 U31 変更 / U34 / U36)。送っている間のボタンは無効表示 (遷移表の「行なし」の破線とは別の、ゲーム内の見た目)
    // Ready は、相手がまだ Ready 画面に来ていない間 (図02 でホストが戻った直後など) は出さない
    ready: { label: 'Ready', event: 'ready', primary: true, hideIfNoRow: true },
    confirming: { label: 'Confirming\u2026', primary: true, disabled: true },
    cancelReady: { label: 'Cancel Ready', event: 'cancelReady' },
    leaveRoom: { label: 'Leave Room', event: 'leaveRoom' },
    leaveRoomOff: { label: 'Leave Room', disabled: true },
    cancel: { label: 'Cancel Match', event: 'cancelMatch' },
    leave: { label: 'Leave Match', event: 'leaveMatch' },
    // ランダム対戦で相手を探している間の Cancel (決定 U13a)。席を外す人のために大きく出す
    search: { label: 'Cancel', event: 'cancelSearch', big: true },
  };
  function matchmake() {
    return { view: 'random', title: 'Random Match', back: 'back', status: 'Searching for an opponent…',
      buttons: [B.search], decided: ['U13a', 'U13'], context: MATCHMAKE_CONTEXT };
  }
  // 相手を探すのをやめたときの通知 (決定 U13)。Search again / Close
  function noticeButtons() {
    return [{ label: 'Search again', event: 'searchAgain', primary: true }, { label: 'Close', event: 'closeNotice' }];
  }
  // 見つからなかったとき: 元の画面 (Online Battle) の上に出す
  function searchNotice(text, extra) {
    return Object.assign(online(), { notice: { text: text, buttons: noticeButtons() }, decided: ['U13'] }, extra);
  }
  // アプリを離れて止まったとき (決定 U43): Online Battle の中に出す。モーダルではなく、ほかの操作を妨げない
  function inlineSearchNotice(text, extra) {
    return Object.assign(online(), { inlineNotice: { text: text, buttons: noticeButtons() }, decided: ['U13', 'U43'] }, extra);
  }
  // 結果画面の Find Next Opponent で次の相手を探す (決定 U29)。見た目は Random Match から探すときと同じ
  function nextSearch() {
    return Object.assign(matchmake(), { decided: ['U29', 'U13a'], undecided: ['U47'], context: NEXT_SEARCH_CONTEXT });
  }
  function nextNotFound() {
    return { view: 'random', title: 'Random Match', back: null, buttons: [], notice: { text: SEARCH_NOTICES.notFound, buttons: [
      { label: 'Search again', event: 'searchAgain', primary: true }, { label: 'Back to Online', event: 'backToOnlineBattle' }] },
    decided: ['U29'], context: NEXT_NOT_FOUND_CONTEXT };
  }
  // 片方が切断して 20 秒 (仮) 待っている間のゲーム画面 (決定 U28、表示は仮 U46)
  function disconnectWait(who) {
    return { view: 'game', overlay: DISCONNECT_OVERLAYS[who], decided: ['U28'], undecided: ['U46'], context: DISCONNECT_CONTEXT[who] };
  }
  function matchMenu() {
    return { view: 'game', menu: MATCH_MENU, decided: ['U37', 'U38', 'U39', 'U42'], context: MATCH_MENU_CONTEXT };
  }
  function surrenderConfirm() {
    return { view: 'game', menu: SURRENDER_CONFIRM, decided: ['U37', 'U40', 'U41'], context: SURRENDER_CONFIRM_CONTEXT };
  }
  function online(dev) {
    return { view: 'online', title: 'ONLINE BATTLE', back: null, items: [
      { label: 'Random Match', event: 'randomMatch' }, { label: 'Friend Match', event: 'friendMatch' }] };
  }
  function top(extra) {
    return Object.assign({ view: 'friendTop', title: 'Friend Match', back: 'back', input: '' }, extra);
  }
  function lobby(extra) {
    return Object.assign({ view: 'lobby', title: 'Friend Match', back: 'back', buttons: [] }, extra);
  }
  // Ready 画面: プレイヤーごとのカード (自分・相手の Ready)、状況の一行、カウントダウン (秒)、お知らせ、ボタン
  function readyLobby(mine, theirs, phase, extra) {
    var spec = lobby({ cards: { me: mine, them: theirs }, buttons: [B.ready, B.leaveRoom], decided: ['U31', 'U36'],
      context: [READY_CONTEXT].concat(READY_PHASE_CONTEXT[phase] || []) });
    return Object.assign(spec, extra);
  }
  function readyScreens(R) {
    var L = function (s) { return lobbyState(R, s); };
    S[L('Ready')] = readyLobby(false, false, null, {});
    S[L('Ready.TimedOut')] = readyLobby(false, false, 'TimedOut', { readyNotice: READY_NOTICE_TEXT.TimedOut, decided: ['U31', 'U36', 'U33'] });
    S[L('Ready.OpponentNotReady')] = readyLobby(false, false, 'OpponentNotReady', { readyNotice: READY_NOTICE_TEXT.OpponentNotReady, decided: ['U31', 'U36', 'U34', 'U35'], undecided: ['U53'] });
    S[L('Ready.StartFailed')] = readyLobby(false, false, 'StartFailed', { readyNotice: READY_NOTICE_TEXT.StartFailed, decided: ['U31', 'U36', 'U32'], undecided: ['U15'] });
    S[L('Ready.Confirming')] = readyLobby(false, false, 'Confirming', { back: 'disabled', buttons: [B.confirming, B.leaveRoomOff], undecided: ['U53'] });
    S[L('Ready.WaitingForOpponent')] = readyLobby(true, false, 'WaitingForOpponent', { status: READY_TEXT.waiting, timer: READY_TIMERS.ready,
      buttons: [B.cancelReady, B.leaveRoom], decided: ['U31', 'U36', 'U33', 'U34'] });
    S[L('Ready.OpponentReady')] = readyLobby(false, true, 'OpponentReady', { status: READY_TEXT.opponentReady });
    S[L('Ready.OpponentReady.Confirming')] = readyLobby(false, true, 'Confirming', { status: READY_TEXT.opponentReady, back: 'disabled',
      buttons: [B.confirming, B.leaveRoomOff], undecided: ['U53'] });
    S[L('Starting')] = readyLobby(true, true, 'Starting', { status: READY_TEXT.starting, back: 'disabled', buttons: [], decided: ['U31', 'U36', 'U32'], undecided: ['U53'] });
    S[L('Reconnecting')] = readyLobby(false, false, 'Reconnecting', { status: READY_TEXT.reconnecting, back: 'disabled', buttons: [], decided: ['U32'], undecided: ['U52'] });
    S[L('OpponentDisconnected')] = readyLobby(false, false, 'OpponentDisconnected', { status: READY_TEXT.opponentDisconnected, timer: READY_TIMERS.reconnect,
      buttons: [B.leaveRoom], decided: ['U32', 'U34', 'U35'], undecided: ['U51'] });
  }
  var errMsg = {
    NotFound: 'Match not found. Check the Match Code and try again.',
    Expired: 'The match has expired.',
    Full: 'The match is already full.',
  };

  // --- ホスト ---
  S['Host.MultiModeSelection'] = online('host');
  S['Host.FriendMatch.Room'] = top({});
  S['Host.FriendMatch.Room.ConnectionFailed'] = top({ toast: 'failed', undecided: ['U6'] });
  S['Host.FriendMatch.Lobby.Waiting'] = lobby({ status: 'Waiting for your friend…', buttons: [B.cancel] });
  S['Host.FriendMatch.Lobby.FriendJoined'] = lobby({ name: 'Client User', status: 'Friend joined!', buttons: [B.cancel], undecided: ['U4'] });
  readyScreens('Host');
  S['Host.FriendMatch.Lobby.Connecting'] = lobby({ name: 'Client User', status: 'Connecting…', buttons: [B.cancel] });
  S['Host.FriendMatch.Lobby.ConnectionLost'] = lobby({ name: 'Client User', status: 'Connection lost.', buttons: [B.cancel], undecided: ['U5'] });
  S['Host.FriendMatch.Lobby.ClientLeft'] = lobby({ status: 'Your friend left.\nWaiting for another friend\u2026', buttons: [B.cancel],
    decided: ['U34'], undecided: ['U51'], context: ROOM_CONTEXT.ClientLeft });
  S['Host.FriendMatch.Lobby.MatchCancelled'] = lobby({ status: 'Match cancelled.\nOpponent did not reconnect.', buttons: [B.cancel],
    decided: ['U32'], context: ROOM_CONTEXT.MatchCancelled });
  S['Host.FriendMatch.Lobby.CodeExpired'] = lobby({ status: 'Match code expired.', undecided: ['U7'] });
  var awayToast = { Waiting: 'waiting', FriendJoined: 'joined', Ready: 'ready', Expired: 'expired' };
  AWAY_PLACES.forEach(function (p) {
    Object.keys(awayToast).forEach(function (s) {
      var u = s === 'Ready' ? ['U1'] : s === 'Expired' ? ['U7'] : ['U16'];
      S[away(p, s)] = p === 'FriendMatchRoom'
        ? top({ toast: awayToast[s], undecided: u })
        : { view: 'stage', back: 'back', toast: awayToast[s], undecided: u };
    });
  });
  S['Host.Matchmake'] = matchmake();
  S['Host.Matchmake.Stopped'] = inlineSearchNotice(SEARCH_NOTICES.stopped, { context: SEARCH_STOPPED_CONTEXT });
  S['Host.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Host.Matchmake.NextOpponent'] = nextSearch();
  S['Host.Matchmake.NextOpponent.NotFound'] = nextNotFound();
  S['Host.Opponent'] = { view: 'vs', undecided: ['U48'], decided: ['U32'] };
  // ゲーム画面: カウントダウン中 (メニューボタンなし・Win / Lose は押せない) → プレイ中 ⇄ MATCH MENU → 降参の確認
  S['Host.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2', 'U32'], context: GAME_COUNTDOWN_CONTEXT };
  S['Host.Game.Play'] = { view: 'game', context: GAME_CONTEXT };
  S['Host.Game.MatchMenu'] = matchMenu();
  S['Host.Game.SurrenderConfirm'] = surrenderConfirm();
  S['Host.Game.Disconnected'] = disconnectWait('self');
  S['Host.Game.OpponentDisconnected'] = disconnectWait('opponent');

  // --- クライアント ---
  S['Client.MultiModeSelection'] = online('client');
  S['Client.FriendMatch.Room'] = top({});
  S['Client.FriendMatch.Room.CodeEntered'] = top({ input: 'QWERTY123' });
  S['Client.FriendMatch.Room.HostLeft'] = top({ roomNotice: 'Room closed. The host left.', decided: ['U34'], undecided: ['U52'], context: ROOM_CONTEXT.HostLeft });
  S['Client.FriendMatch.Room.HostDisconnected'] = top({ roomNotice: 'Room closed. The host disconnected.', decided: ['U32'], undecided: ['U52'], context: ROOM_CONTEXT.HostDisconnected });
  Object.keys(errMsg).forEach(function (k) {
    S['Client.FriendMatch.Room.Error.' + k] = top({ input: 'QWERTY123', error: errMsg[k] });
  });
  S['Client.FriendMatch.Room.ConnectionFailed'] = top({ input: 'QWERTY123', toast: 'failed', undecided: ['U6'] });
  S['Client.FriendMatch.Lobby.Waiting'] = lobby({ status: 'Waiting for your friend…', undecided: ['U9'] });
  S['Client.FriendMatch.Lobby.HostAway'] = lobby({ name: 'Host User', status: 'Away', buttons: [B.leave] });
  S['Client.FriendMatch.Lobby.FriendJoined'] = lobby({ name: 'Host User', status: 'Friend joined!', buttons: [B.leave], undecided: ['U4'] });
  readyScreens('Client');
  S['Client.FriendMatch.Lobby.Connecting'] = lobby({ name: 'Host User', status: 'Connecting…', buttons: [B.leave], undecided: ['U5'] });
  S['Client.FriendMatch.Lobby.ConnectionLost'] = lobby({ name: 'Host User', status: 'Connection lost.', buttons: [B.leave], undecided: ['U5'] });
  S['Client.FriendMatch.Lobby.MatchExpired'] = lobby({ status: 'Match expired.', undecided: ['U7'] });
  S['Client.Matchmake'] = matchmake();
  S['Client.Matchmake.Stopped'] = inlineSearchNotice(SEARCH_NOTICES.stopped, { context: SEARCH_STOPPED_CONTEXT });
  S['Client.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Client.Matchmake.NextOpponent'] = nextSearch();
  S['Client.Matchmake.NextOpponent.NotFound'] = nextNotFound();
  S['Client.Opponent'] = { view: 'vs', undecided: ['U48'], decided: ['U32'] };
  S['Client.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2', 'U32'], context: GAME_COUNTDOWN_CONTEXT };
  S['Client.Game.Play'] = { view: 'game', context: GAME_CONTEXT };
  S['Client.Game.MatchMenu'] = matchMenu();
  S['Client.Game.SurrenderConfirm'] = surrenderConfirm();
  S['Client.Game.Disconnected'] = disconnectWait('self');
  S['Client.Game.OpponentDisconnected'] = disconnectWait('opponent');

  // --- 対戦後の結果画面 (両端末共通。決定 U20〜U30) ---
  // outcome: Win / Lose / Draw / NoContest、phase: 再戦の段階、reason: 終わった理由 (END_REASONS のキー)。
  // ボタンと Rating の行はセッション (Friend Match かランダム対戦か) で変わるので、描画のときに resultButtons / ratingText で決める
  function result(outcome, phase, extra) {
    var rematch = !extra || extra.rematch !== false;
    var cooldown = COOLDOWN_PHASES.indexOf('.' + phase) !== -1;
    var stamps = phase !== 'OpponentLeft' && (!extra || extra.stamps !== false);
    var spec = { view: 'result', title: 'RESULT', back: null, outcome: outcome, phase: phase, reason: 'finish', rematch: rematch, stamps: stamps,
      decided: ['U20', 'U21', 'U22', 'U24', 'U26'].concat(rematch ? ['U23', 'U30'] : [], stamps ? ['U27'] : [], phase === 'OpponentLeft' ? ['U25'] : []),
      undecided: [].concat(outcome !== 'NoContest' && (!extra || !extra.reason) ? ['U44'] : [], cooldown ? ['U50'] : [], stamps ? ['U49'] : []),
      context: [RESULT_CONTEXT].concat(RESULT_PHASE_CONTEXT[phase] || [], stamps ? [STAMP_CONTEXT] : []) };
    return Object.assign(spec, extra);
  }
  ['Host', 'Client'].forEach(function (role) {
    OUTCOMES.forEach(function (o) {
      RESULT_PHASES.forEach(function (ph) { S[resultState(role, o, ph)] = result(o, ph.slice(1)); });
    });
    var special = function (key, reason, decided, undecided) {
      var spec = result(SPECIAL_RESULTS[key], '', { rematch: false, stamps: /Surrendered$/.test(key), reason: reason });
      spec.decided = spec.decided.concat(decided);
      spec.undecided = spec.undecided.concat(undecided);
      spec.context = [RESULT_CONTEXT, SPECIAL_RESULT_CONTEXT[key]].concat(spec.stamps ? [STAMP_CONTEXT] : []);
      S[resultState(role, SPECIAL_RESULTS[key], '.' + key)] = spec;
    };
    // 降参 (決定 U38 / U41) と切断 (決定 U28) で決まった結果。再戦は無い (U45)
    special('Surrendered', 'surrendered', ['U38', 'U41', 'U28'], []);
    special('OpponentSurrendered', 'opponentSurrendered', ['U38'], ['U45']);
    special('Disconnected', 'disconnected', ['U28'], ['U45']);
    special('OpponentDisconnected', 'opponentDisconnected', ['U28'], ['U45']);
    S[role + '.NoContestResult'] = Object.assign(result('NoContest', '', { rematch: false, stamps: false, reason: 'connectionError' }), {
      decided: ['U20', 'U21', 'U22', 'U24', 'U26', 'U28'], undecided: ['U45'], context: [RESULT_CONTEXT, SPECIAL_RESULT_CONTEXT.NoContest] });
  });

  Object.keys(S).forEach(function (k) {
    S[k].undecided = S[k].undecided || [];
    S[k].decided = S[k].decided || [];
  });
  return S;
})();

// ---- ダイアログ ---------------------------------------------------------------

var DIALOGS = {
  cancel: { title: 'Cancel this match?', body: 'Your current Match Code will no longer be valid.',
    buttons: [{ label: 'Cancel Match', event: 'dialog.cancelMatch', danger: true }, { label: 'Keep Waiting', event: 'dialog.keepWaiting' }] },
  // Ready 画面と、開始前に相手の切断を待っている間 (決定 U34 / U35)。本文は決定の文言、題名と Stay in Room は仮 (U51)
  leaveRoom: { title: 'Leave this room?', body: 'No match has started. No win or loss will be recorded.',
    buttons: [{ label: 'Leave Room', event: 'dialog.leaveRoom', danger: true }, { label: 'Stay in Room', event: 'dialog.stay' }],
    undecided: ['U51'] },
  leave: { title: 'Leave this match?', body: 'You\u2019ll leave the current match.',
    buttons: [{ label: 'Leave Match', event: 'dialog.leaveMatch', danger: true }, { label: 'Go Back', event: 'dialog.goBack' }],
    undecided: ['U11'] },
  newMatch: { title: 'Create a new match?', body: 'Your current Match Code will no longer be valid.',
    buttons: [{ label: 'Create Match', event: 'dialog.createMatch', danger: true }, { label: 'Keep Current Match', event: 'dialog.keepCurrent' }],
    undecided: ['U12'] },
  joinAnother: { title: 'Join another match?', body: 'Your current Match Code will no longer be valid.',
    buttons: [{ label: 'Join Match', event: 'dialog.joinMatch', danger: true }, { label: 'Keep Current Match', event: 'dialog.keepCurrent' }],
    undecided: ['U12'] },
};

// ---- VS 画面のデモデータ (架空) ----------------------------------------------

var PLAYERS = {
  host: { name: 'Yasuhito', rank: 12, emoji: '👋', greeting: 'Hello!' },
  client: { name: 'ogwssk', rank: 9, emoji: '😎', greeting: 'Let\u2019s go!' },
};

// ---- 未決一覧 -----------------------------------------------------------------
// options があるものは 未決パネルでトグルできる。default は図の通り (無ければ最も中立な案)。
// decided があるものは決定済み (ID はそのまま残す)。端末の画面の中や端末の上には出さず、右パネルの「決定済み」と未決タブに緑で表示する。

var GAME_COUNTDOWN_PREMISE = '前提として、ゲーム側で VsPlayer の modeStartAnimationType を None から Countdown に変える（設定 1 行）';

var UNDECIDED = [
  { id: 'U1', title: 'Ready トーストから VS への入り方',
    desc: '別画面にいるホストが赤い "Ready to start" トーストをタップしたあと、ロビーの Ready 画面に戻って Ready ボタンを押すのか、タップで Ready を押した扱いにするのか。' +
      'U31 の決定により、どちらでもクライアントが Ready を押すまで開始しない (別案ではホストは "Waiting for opponent…"、クライアントには "Opponent is ready. Are you?")。' +
      'VS 画面のあとの流れ (モックの 3·2·1 をやめてゲーム本体のカウントダウン) は U2 で決定済みで、どちらの入り方でも同じ。トーストのタップ後の入り方は決まっていない。' +
      'Ready 画面から ‹ で別画面へ移るときは確認を出す (U35) ので、このトーストが出るのは、ホストが Ready 画面になる前 (待機中・Friend joined!) に別画面へ移っていたときだけ。',
    options: [{ value: 'lobby', label: 'ロビーの Ready 画面へ (図02)' }, { value: 'direct', label: 'タップで Ready を押した扱い' }], default: 'lobby' },
  { id: 'U2', title: '開始のカウントダウン',
    desc: '元の論点は「開始は両者の Start Match (今の Ready ボタン、U31) か、自動カウントダウンか」。このうちカウントダウンの部分が決まった: VS 画面のあと (ランダム対戦・Friend Match・再戦とも) はモック独自の 3·2·1 を出さず、ゲーム画面に移ってゲーム本体のカウントダウン (VsAI と同じ 3 → 2 → 1) を使う。' +
      '両者が押すか、Ready 後に自動で開始するかはこの決定に含まれないので U31 に分けた (U31 も 2026-10-03 に決定: 両者が押したら開始。ボタンの名前は 2026-10-07 に Ready に変更)。',
    decided: { by: '高宮さん', date: '2026-10-03', reason: 'ゲーム本体にゲーム開始時のカウントダウンがあるため、モック側の 3·2·1 は不要', premise: GAME_COUNTDOWN_PREMISE } },
  { id: 'U3', title: 'VS 画面中に相手が切断したときの戻り先',
    desc: 'U32 の決定で解消した。Friend Match の VS 画面中の切断は開始前の切断なので、両者の Ready を消して Ready 画面に戻し、残った側は "Opponent disconnected. Waiting for them to reconnect…" で 20 秒待つ。' +
      '以前のトグル (ロビーで "Connection lost." / Friend Match トップ / Online Battle) は削除した。ランダム対戦と再戦の VS 画面中の切断は U54。',
    decided: { by: '高宮さん', date: '2026-10-07', reason: 'U32 (VS 画面・カウントダウン中の切断) の決定に含まれる' } },
  { id: 'U4', title: 'Friend joined! → Ready 画面の条件',
    desc: '何をもって Ready 画面 (両者が Ready ボタンを押せる段階) になるのか (自動遷移の条件・待ち時間) が不明。モックでは 1.5 秒後に自動で Ready 画面にしている。' +
      'Ready 画面になっても自動では開始しない (U31 で決定: 両者が Ready を押したら開始)。' },
  { id: 'U5', title: 'Connection lost 時の扱いとクライアント側の表示',
    desc: '図03 の赤字メモ「しばらく待つか、導線的にキャンセルしかないようにするか」。タイムアウトの長さも未定。クライアント側の画面は図に無く、モックではホストと対称の "Connecting…" / "Connection lost." を仮表示している。' +
      'U32 で、片方の切断 (開始前) は "Opponent disconnected…" で 20 秒待つことに決まった。図03 の両者が同時に "Connecting…" になる流れ (Ready を押す前) との関係も未定で、モックは図03 の流れを残している。',
    options: [{ value: 'cancel', label: 'キャンセルのみ (図03)' }, { value: 'wait', label: 'しばらく待てば復帰できる' }], default: 'cancel' },
  { id: 'U6', title: '"Connection failed" トーストの発生条件',
    desc: '09-30 の図にトーストだけあり、出る場面が描かれていない。モックでは Create Match / Join Match の接続失敗として仮に表示している。' },
  { id: 'U7', title: 'Match Code の有効期限と文言の差',
    desc: '有効期限の長さが未定。ホスト側は "Match code expired." / トースト "Match code expired"、クライアント側は "Match expired." と文言が異なる。' },
  { id: 'U8', title: 'ホストがキャンセルした後のクライアントの出口',
    desc: 'U34 の決定で解消した。ホストがルームを閉じると、クライアントは "Room closed. The host left." を見て Friend Match トップへ移る (以前の "Host User / cancelled the match." の画面と ‹ は無くなった)。' +
      'Ready 画面より前のロビーで Cancel Match を押したときも同じにした (仮、U51)。',
    decided: { by: '高宮さん', date: '2026-10-07', reason: 'U34 (ホストがルームを閉じたときのクライアント) の決定に含まれる' } },
  { id: 'U9', title: 'クライアント待機中 (Client.FriendMatch.Lobby.Waiting) の退出方法',
    desc: '"Waiting for your friend…" のクライアント画面にボタンが無い。モックでは ‹ で抜けて Match Code 入力済みのトップへ戻る。' },
  { id: 'U10', title: 'クライアント離脱で期限切れ後のホスト画面の Start Match',
    desc: 'U35 の決定で解消した。図07 の「クライアントが Ready 画面から別画面へ移り、マッチを残したまま期限切れになる」場面が無くなった (‹ は Leave Room と同じ確認を出す) ので、"Match expired." の画面 (Start Match / Cancel Match) も無くなった。',
    decided: { by: '高宮さん', date: '2026-10-07', reason: 'U35 (Ready 画面から別画面へ移るときは確認を出す) の決定で、この画面が無くなった' } },
  { id: 'U11', title: '"Leave this match?" の "Go Back" の文言',
    desc: '"Cancel this match?" は合意で "Keep Waiting" にしたが、"Leave this match?" の "Go Back" は合意の対象外。"Stay in Match" などに揃えるか。' },
  { id: 'U12', title: '"Create a new match?" / "Join another match?" の本文と影響',
    desc: '10-01 の合意でボタンは [Create Match]/[Join Match] + [Keep Current Match]。本文は残っている図に無いので仮に "Your current Match Code will no longer be valid." を表示。古いマッチに入っていたクライアントの扱いも未定 (モックでは U34 のホストがルームを閉じたときと同じ "Room closed. The host left." で Friend Match トップへ)。' },
  { id: 'U13', title: 'ランダム対戦の待機中: Cancel と ‹ は確認なしで戻る。アプリを離れたら検索を止める。見つからなければ "No opponent found."',
    desc: '相手を探している間 ("Searching for an opponent…") の操作。Cancel を押すと、確認ダイアログを出さずに Online Battle へ戻る。' +
      '‹ も Cancel とまったく同じ (Online Battle へ)。探している間は、ほかの画面へは行けない (出口は Cancel と ‹ だけ)。' +
      'アプリを離れる (バックグラウンドへ移る・画面ロック) と検索を止め、戻ったときに通知を出す (文言・出す場所・ボタンは U43 で決定: Online Battle の中に "Search stopped while the app was in the background." と Search again / Close)。' +
      '60 秒探しても相手が見つからなければ元の画面 (Online Battle) に戻り、"No opponent found." と Search again / Close を出す。Search again でもう一度探し、Close で通知を閉じる。' +
      '60 秒という長さは仮 (変わりうる)。相手が見つかり次第 VS 画面へ進むこと (U13a) は変わらない。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U13a', title: 'ランダム対戦は相手が見つかり次第 VS 画面へ (Ready 画面なし)',
    desc: 'U13 から分けた決定。ランダム対戦では、相手が見つかったらすぐ VS 画面へ進む (Ready 画面・Ready ボタン・"Starting match…" は挟まない)。' +
      '両者が Ready を押す U31 は Friend Match だけ。相手を探している画面には "Searching for an opponent…" (点が順に光る) と、席を外す人のための大きな Cancel を出す。' +
      'Cancel を押すと Online Battle の画面に戻る。確認を挟まないこと、‹・アプリを離れたとき・タイムアウトの扱いは U13 で決定 (2026-10-07)。',
    decided: { by: '高宮さん', date: '2026-10-03' } },
  { id: 'U14', title: 'ホストが ‹ で戻ったときにマッチを維持するか',
    desc: '図02 はバナーを出してマッチを維持する。‹ でキャンセル確認を出す案もありうる。Ready 画面からの ‹ は U35 で決まった (Leave Room と同じ確認) ので、残っているのは Ready 画面より前 (待機中・Friend joined!・Connection lost) のとき。',
    options: [{ value: 'keep', label: '維持してバナー表示 (図02)' }, { value: 'confirm', label: 'キャンセル確認を出す' }], default: 'keep' },
  { id: 'U15', title: '読み込みに失敗したあとの再試行の回数',
    desc: 'U32 の決定で、読み込みが 20 秒で終わらなければ "Match could not start. Please try again." で両者とも Ready 画面に戻る (図06 の "Unable to start the match." と Start Match での再試行を置き換えた)。' +
      '片方だけ再試行した場合は、ふつうの Ready (片方だけ Ready → 相手を待つ、U33 / U36) になった。再試行の回数に制限を設けるか、お知らせをいつ消すか (モックは次に Ready を押すと消える) は決まっていない。' },
  { id: 'U16', title: '青 / 緑のバナーをタップしてロビーに戻れるか',
    desc: '図02 で "Ready to start" と "Match code expired" はタップで遷移するが、"Waiting for your friend…" と "Friend joined!" のタップは描かれていない。',
    options: [{ value: 'no', label: 'タップできない (図02)' }, { value: 'yes', label: 'タップでロビーへ' }], default: 'no' },
  { id: 'U17', title: 'ホストが戻ったときクライアントに "Friend joined!" を再表示するか',
    desc: '図02 では Away → Friend joined! → Ready 画面の順。すでに一度 Ready 画面だった場合も同じか。ホスト離席中にクライアントが退出した場合のホスト側表示も図に無い' +
      ' (ロビーにいるホストには "Your friend left. Waiting for another friend…" を出すことが U34 で決まったが、別画面にいるホストのトーストは青い "Waiting for your friend…" に戻すだけにしている)。' +
      'ホストが戻って Ready 画面になったあとも、開始には両者の Ready が必要 (U31 で決定)。' },
  { id: 'U18', title: 'クライアントが別画面にいる間に期限切れになったときのクライアント側',
    desc: 'U35 の決定で解消した。クライアントが Ready 画面から別画面へ移るときは Leave Room と同じ確認を出し、移ったらルームを抜ける。マッチを残したまま別画面にいる場面 (図07) が無くなったので、この期限切れも起きない。',
    decided: { by: '高宮さん', date: '2026-10-07', reason: 'U35 (Ready 画面から別画面へ移るときは確認を出す) の決定で、この場面が無くなった' } },
  { id: 'U19', title: 'Connection lost から ‹ で戻ると青い "Waiting for your friend…" バナー',
    desc: '図03 では Connection lost の画面から ‹ で戻ると、待機中のバナー付き Friend Match トップになる。相手が切断されたのに待機扱いでよいか。' },
  { id: 'U20', title: '結果画面: 勝敗・両者の名前・スコア・終わった理由を出す',
    desc: '結果画面には、勝敗 (Win / Lose / Draw / No contest。画面は "WIN!" / "LOSE" / "DRAW" / "NO CONTEST")、両者の名前、スコア、終わった理由を出す。' +
      'スコアが決まっていないときは、"----" などを出さずに行ごと出さない (モックでは No contest のとき)。モックのスコアはデモ値。' +
      '通常の決着のときの終わった理由の文言 (モックは "Match finished") と、引き分けになる条件は決定に無いので U44 にした。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U21', title: 'レーティング: Friend Match は変わらない。ランダム対戦は Elo (初期値 1000、K=24)。同じ相手との再戦は変わらない',
    desc: 'Friend Match の結果画面には "No rating change (friend match)" を出す。ランダム対戦は Elo (初期値 1000、K=24) で変わり、例えば "1000 → 1012 (+12)" と出す。' +
      'ランダム対戦で同じ相手と続けて再戦したときはレートが変わらない (モックでは "No rating change (rematch)")。No contest も変わらない ("No rating change (no contest)")。' +
      '初期値 1000 と K=24 は QA² 側の仮の値 (変わりうる)。モックでは両者とも初期値 1000 から計算する。VS 画面の "Rank" との関係は U48。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U22', title: '結果画面のボタン: Friend Match は Rematch / Back to Friend Match、ランダム対戦は Find Next Opponent / Rematch / Back to Online',
    desc: 'Friend Match: Rematch (同じ相手と再戦) と Back to Friend Match。ランダム対戦: Find Next Opponent (次の相手を探す)、Rematch (同じ相手と再戦)、Back to Online。' +
      '再戦を申し込んだ側には Cancel Request、申し込まれた側には Rematch と Decline を出す (U30)。降参した側は Back to Online だけ (U41)。' +
      'Online Battle へ戻るボタンは、降参後のものも含めてすべて "Back to Online" にそろえた。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U23', title: '再戦: どちらからでも申し込め、相手が応じたらそのまま VS 画面へ。同時に申し込んだら成立',
    desc: '結果画面の Rematch で、どちらのプレイヤーからでも再戦を申し込める。相手が応じたら (Rematch を押したら)、ロビーの Ready を挟まずにそのまま VS 画面へ進む。' +
      '両者が同時に申し込んだ場合も成立 (応じたのと同じ)。申し込んだ側には "Waiting for your opponent…"、申し込まれた側には "Your opponent wants a rematch" を出す。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U24', title: '戻り先: Friend Match は Friend Match トップ (前の Match Code は無効)、ランダム対戦は Online Battle',
    desc: 'Friend Match の Back to Friend Match は、Match Code を作る・入れる画面 (Friend Match トップ) に戻る。前の Match Code は使えなくなる。' +
      'ランダム対戦の Back to Online は Online Battle (MultiModeSelection) に戻る。降参した側は Friend Match でも Online Battle に戻る (U41 で決定済み)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U25', title: '相手が結果画面を抜けたら "Your opponent left. Rematch is not available."',
    desc: '相手が結果画面を抜けても、自分の結果画面はそのまま残し、"Your opponent left. Rematch is not available." を出す (Rematch のボタンは消える)。勝敗とレートは変わらない。' +
      '申し込み中・申し込まれ中の再戦も、このとき無くなる。降参・切断・No contest の結果画面にはもともと再戦が無いので、モックではこの一行を出さない。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U26', title: '結果画面から自動では次へ進まない',
    desc: '結果画面はタイムアウトで次の画面へ自動で進むことはしない。ボタンを押すまで結果画面に留まる。モックにも結果画面からの自動遷移は無い。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U27', title: '結果画面のスタンプ: 👏 Good game / 🤝 Thanks for the match / 👍 Nice。表示 3 秒、間隔 5 秒、ミュートあり',
    desc: '結果画面で 3 種類のスタンプを送れる: 👏 "Good game"、🤝 "Thanks for the match"、👍 "Nice"。1 つのスタンプは 3 秒表示し、次を送れるのは送ってから 5 秒後。' +
      '相手のスタンプはミュートできる。3 秒と 5 秒は QA² 側の仮の値 (変わりうる)。モックでは送った本人の画面にも出し、ミュートは同じ相手と対戦している間だけ続く (どちらも仮、U49)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U28', title: '対戦中の切断: 片方なら 20 秒待って切断した側の負け。両者の切断・サービス障害は No contest',
    desc: '片方が切断したら 20 秒待ち、戻らなければ切断した側の負け (ランダム対戦ではレートも変わる)。' +
      '両者が切断した場合とサービス障害の場合は "No contest due to a connection error" で、レートは変わらない。降参した側は再戦を申し込めない。' +
      '20 秒は QA² 側の仮の値 (変わりうる)。待っている間の画面と、試合が止まるかは決定に無いので U46 にした。引き分けは U20 で結果の 1 つになった (なる条件は U44)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U29', title: 'ランダム対戦の Find Next Opponent: 60 秒探して見つからなければ "No opponent found."',
    desc: 'ランダム対戦の結果画面の Find Next Opponent で、次の相手を探す (見た目と Cancel / ‹ は Random Match から探すとき (U13) と同じ)。' +
      '60 秒探しても見つからなければ "No opponent found." と Search again / Back to Online を出す。60 秒は QA² 側の仮の値 (変わりうる)。' +
      '探している間にアプリを離れたときは U47。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U30', title: '再戦の申し込み: 応答期限 20 秒、Cancel Request で取り消し、Decline で断る。どの場合も結果画面に残り 3 秒後にまた申し込める',
    desc: '再戦の申し込みには 20 秒の応答期限がある。申し込んだ側には Cancel Request を出す。取り消すと相手に "Rematch request was cancelled"、' +
      '相手が断ると申し込んだ側に "Your opponent declined the rematch"、期限が切れると申し込んだ側に "No response to rematch request" を出す。' +
      'どの場合も両者とも結果画面に残り、3 秒後にまた申し込める。20 秒・3 秒は QA² 側の仮の値 (変わりうる)。メッセージを出さない側の表示は U50。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U31', title: 'Friend Match の開始は両者が Ready を押してから (ボタンの名前は Start Match から Ready に変更)',
    desc: 'U2 から分けた残りの論点。Friend Match では、両者が Ready を押したら開始する (Ready 画面になっても自動では開始しない)。ランダム対戦には Ready 画面が無く、相手が見つかり次第 VS 画面へ進む (U13a)。' +
      '2026-10-07 の変更: ボタンの名前を Start Match から Ready にした (画面・イベント・状態の名前も合わせた)。片方が押すと、押した側は "Waiting for opponent…"、相手側には "Opponent is ready. Are you?" (表示は U36)。' +
      '両者が押すと "Starting match…" (読み込み) → VS 画面 → ゲーム本体のカウントダウン。3-2-1 のあとサーバーが確認した時点で試合開始で、それまでは Ready を取り消せ、勝敗は記録しない (U32)。' +
      '片方だけ押した状態のタイムアウトは U33、取り消し・退出は U34、別画面へ移る・アプリを離れるは U35。',
    decided: { by: '高宮さん', date: '2026-10-03、Ready への変更は 2026-10-07' } },
  { id: 'U32', title: '開始前 (Ready 画面・読み込み・VS 画面・カウントダウン) の切断: Ready を消して止め、相手は 20 秒待つ。読み込みは 20 秒まで',
    desc: '試合が始まる (3-2-1 のあとサーバーが確認する) までの切断は、両者の Ready を消して止める。勝敗は記録しない。残った側には "Opponent disconnected. Waiting for them to reconnect…" と 20 秒のカウントダウン、Leave Room を出す。' +
      '戻ってきたら両者とももう一度 Ready を押し、カウントダウンは 3 からやり直す。戻らなければ、切断したのがクライアントならホストに "Match cancelled. Opponent did not reconnect." (結果なし、ホストは同じ Match Code のままルームに残る)、' +
      'ホストならクライアントに "Room closed. The host disconnected." を出して Friend Match トップへ。読み込み ("Starting match…") は 20 秒までで、終わらなければ "Match could not start. Please try again." で両者とも Ready 画面に戻る。' +
      '試合が始まったあとは、これまでのルール (20 秒の切断負け U28、降参の負け U38)。20 秒は QA² 側の仮の値 (変わりうる)。切断した側の画面は U52、ランダム対戦・再戦の VS 画面中の切断は U54。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U33', title: 'Ready のタイムアウト: 片方が Ready のまま 60 秒で両者の Ready を消す (罰なし)',
    desc: '片方が Ready を押し、相手が 60 秒のうちに押さなければ、両者の Ready を消して両者に "Ready check timed out. Press Ready when you’re ready." を出す。' +
      '罰はなく、どちらもルームに残る (メニューへは戻らない)。その間の切断は U32 のとおり。60 秒は QA² 側の仮の値 (変わりうる)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U34', title: '取り消しと退出: Cancel Ready はルームに残る。クライアントが抜けるとホストは同じ Match Code で待つ。ホストが閉じるとクライアントは Friend Match トップへ',
    desc: 'Cancel Ready で Ready を取り消してもルームに残り、相手には "Opponent is no longer ready." を出す。クライアントが抜けると、ホストには "Your friend left. Waiting for another friend…" を出し、Match Code は変えない。' +
      'ホストがルームを閉じると、クライアントには "Room closed. The host left." を出して Friend Match トップへ移す。抜ける前に確認 "No match has started. No win or loss will be recorded." を出す。' +
      '抜けるボタンは、U32 の切断を待つ画面の Leave Room にそろえ、Ready 画面でもホスト・クライアントとも Leave Room にした。確認の題名 ("Leave this room?") とルームに残るボタン ("Stay in Room") は決定に無いので U51 にした。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U35', title: 'Ready 画面から別画面へ移る / ‹ は退出と同じ確認。アプリを離れるとその人の Ready が消える',
    desc: 'Ready 画面からほかの画面へ移るとき・‹ を押したときは、Leave Room と同じ確認 ("No match has started. No win or loss will be recorded.") を出す。' +
      'アプリを離れる (バックグラウンドへ移る・画面ロック) と、その人の Ready は消える (ルームには残る)。' +
      'そのため、図07 の「クライアントが別画面へ移ってもマッチを残し、赤い "Ready to start" トーストで戻る」流れは無くなった (U10 / U18 も解消)。アプリを離れたときに相手に出す表示は U53。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U36', title: 'Ready 画面: プレイヤーごとのカード ("✓ Ready" / "Not ready")。押した側に "Waiting for opponent…"・60 秒のカウントダウン・Cancel Ready',
    desc: 'Ready 画面にはプレイヤーごとにカードを出し、"✓ Ready" か "Not ready" を表示する。Ready を押した側には "Waiting for opponent…"、60 秒のカウントダウン、Cancel Ready を出す。' +
      '押していない側には "Opponent is ready. Are you?" を出す。押して送っている間は "Confirming…" を出す。' +
      'モックではカードの順は自分が左 (YOU 付き)、"Confirming…" は Ready ボタンの場所に無効表示で出す。カウントダウンは押した直後の "60s" のまま描く (実時間では減らさない)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U37', title: 'オンライン対戦は ☰ MATCH MENU。開いても試合は止まらない',
    desc: '案A。オンライン対戦では VsAI のポーズポップアップの代わりに MATCH MENU (☰) を出す。VsAI やソロのポーズのように Time.timeScale = 0 でゲームを止めることはせず、メニューを開いている間も試合は続く。' +
      'メニューには "The match continues while the menu is open." と出し、CONTINUE (閉じる) と SURRENDER (降参、U40 / U41) を置く。ゲーム画面は薄い暗幕の向こうに見えたままにして、止まっているように見せない。' +
      'メニュー中に試合が終われば、そのまま結果画面へ進む (モックでは端末の下の Win / Lose)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U38', title: 'メニューを開いても相手には何も見えない。降参すると相手は勝ち + "Your opponent surrendered"',
    desc: 'MATCH MENU を開いただけでは、相手の端末には何も出さない (相手はそのままプレイを続ける)。' +
      '降参すると降参した側は負けの結果画面 ("You surrendered")、相手は勝ちの結果画面に "Your opponent surrendered" を出す。相手がメニューや降参の確認を開いていても同じ。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U39', title: '対戦中に REMATCH / RETRY は出さない (再戦は結果画面だけ)',
    desc: '実機のポーズポップアップの 2 番目のボタン (VsAI では REMATCH、ソロでは RETRY) は、オンライン対戦の MATCH MENU には置かない。再戦は結果画面の Rematch だけ (進め方は U23)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U40', title: '降参の前に確認を出す ("Surrender?" / "You will lose.")',
    desc: 'MATCH MENU の SURRENDER を押すと、すぐには降参せず確認を出す: 「降参しますか？ 負けになります」(画面の英語は "Surrender?" / "You will lose.")。' +
      'ボタンは CONTINUE (続ける、プレイに戻る) と SURRENDER (降参する)。確認を開いている間も試合は続く。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U41', title: 'ボタンは SURRENDER (QUIT ではない)。負けの結果画面のあと Online Battle へ',
    desc: 'MATCH MENU のボタンの文言は QUIT ではなく SURRENDER。降参して負けの結果画面を見たあとは、Online Battle (Host.MultiModeSelection / Client.MultiModeSelection) に戻る。' +
      'モックでは負けの結果画面の Back to Online で戻る (ボタンの文言は U22 で決定、2026-10-07)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U42', title: 'MATCH MENU 中も BGM を下げない',
    desc: '実ゲームのポーズは BGM を -5dB 下げる (ダッキング) が、オンライン対戦の MATCH MENU では試合が続くので BGM を下げない。モックには音が無いので、決定の記録だけ。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U43', title: 'アプリを離れて検索が止まったら、Online Battle の中に通知 (Search again / Close)。自動では消えない',
    desc: '相手を探している間にアプリを離れて (バックグラウンド・画面ロック) 検索が止まったら、戻ったときに Online Battle の画面の中に通知のボックスを出す。' +
      'モーダルではなく、Online Battle のほかの操作 (Random Match / Friend Match) をさまたげない。文言は "Search stopped while the app was in the background." ' +
      '(以前の "Search stopped because you left the app." から変更)。ボタンは Search again (新しく探す) と Close。' +
      '通知は自動では消えず、ほかの画面へ移ると消える。60 秒で見つからなかったときの "No opponent found." (U13) はこれまでどおり。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U44', title: '通常の決着のときの終わった理由の文言と、引き分けになる条件',
    desc: 'U20 の決定で結果画面に終わった理由を出すが、降参・切断・接続エラー以外 (ゲームの決着) のときの文言は決まっていない。モックは仮に "Match finished" を出している。' +
      'また Draw (引き分け) が結果の 1 つになったが、どういうときに引き分けになるかはゲームのルール次第で決まっていない (モックは端末の下のモック操作 Draw)。' },
  { id: 'U45', title: '降参・切断・接続エラーで終わった試合のあとの再戦',
    desc: 'U28 の決定は「降参した側は再戦を申し込めない」。降参で勝った側から申し込めるか (降参した側が応じられるか) は決まっていない。' +
      '切断で勝敗が決まった試合と No contest のあと、再戦できるかも決まっていない。モックではどれも再戦のボタンを出さない (降参した側は U41 のとおり Back to Online だけ)。' +
      'そのため、これらの結果画面では相手が抜けても "Your opponent left. Rematch is not available." (U25) を出していない。' },
  { id: 'U46', title: '切断を待つ 20 秒の間の両端末の画面と、試合が止まるか',
    desc: 'U28 の決定で、片方が切断したら 20 秒待つ。その間の画面は決まっていない。モックはゲーム画面の上に、残った側には "Your opponent disconnected" / "Waiting for your opponent to reconnect…"、' +
      '切断した側には "Connection lost" / "Reconnecting…" を出し、20 秒のうちに戻れば試合を続ける (環境イベント「通信が回復する」)。' +
      '待っている間も試合 (残った側のプレイ) が続くのか止まるのか、待ち時間を画面に出すかも未定 (開始前の切断を待つ画面は U32 で 20 秒のカウントダウンを出すことに決まった)。モックでは待っている間は Win / Lose / Draw を押せない。' },
  { id: 'U47', title: '次の相手を探している間にアプリを離れたとき',
    desc: 'U13 / U43 の決定で、Random Match から探している間にアプリを離れると検索を止め、戻ると Online Battle の中に "Search stopped while the app was in the background." を出す。' +
      '結果画面の Find Next Opponent から探している間 (U29) にアプリを離れたときも同じでよいか、通知をどこに出すかは決まっていない。モックには行が無い (端末の下の「アプリを離れる」は押せない)。' },
  { id: 'U48', title: 'VS 画面の "Rank" とレーティング (Elo) の関係',
    desc: 'VS 画面は 10-01 の合意で名前・ランク・あいさつを出し、モックは "Rank 12" / "Rank 9" (架空) を出している。U21 の決定でランダム対戦は Elo のレーティング (初期値 1000) になった。' +
      'VS 画面の "Rank" はレーティングとは別のもの (プレイヤーのレベルなど) か、レーティングを出すのか、Friend Match でも出すのかは決まっていない。' },
  { id: 'U49', title: 'スタンプのミュートの続く範囲と、送った本人の画面の表示',
    desc: 'U27 の決定でスタンプはミュートできるが、ミュートがいつまで続くか (その結果画面だけ / 同じ相手との再戦の間 / ずっと) は決まっていない。モックは同じ相手と対戦している間 (再戦を含む) だけ続く。' +
      '送ったスタンプを送った本人の画面にも出すか、ミュートしたことを相手に知らせるかも未定 (モックは本人の画面にも出し、相手には知らせない)。' },
  { id: 'U50', title: '再戦が取り消し・辞退・期限切れになったとき、メッセージを出さない側の表示',
    desc: 'U30 の決定のメッセージは、取り消されたら相手 ("Rematch request was cancelled")、断られたら申し込んだ側 ("Your opponent declined the rematch")、期限切れなら申し込んだ側 ("No response to rematch request") に出す。' +
      'もう一方 (取り消した側・断った側・申し込まれたまま期限が切れた側) の表示は決まっていない。モックでは何も出さず、3 秒の間 Rematch を押せない表示にしている。メッセージを 3 秒たったあとも残すかも未定 (モックは 3 秒で消える)。' },
  { id: 'U51', title: 'Ready 画面より前のロビーのボタン名と確認ダイアログ、Leave Room の確認の題名とボタン',
    desc: 'U34 の決定で Ready 画面と切断を待つ画面のボタンは Leave Room (ホストもクライアントも)、確認の本文は "No match has started. No win or loss will be recorded." になった。' +
      '確認の題名とルームに残るボタンは決まっていないので、モックは "Leave this room?" と "Stay in Room" にしている。' +
      'Ready 画面より前のロビー (待機中・Friend joined!・Connecting… など) は図どおり Cancel Match / Leave Match と元の確認 ("Cancel this match?" / "Leave this match?") のまま。' +
      'ただし抜けたあとの相手の表示は U34 にそろえた (ホストが閉じるとクライアントは "Room closed. The host left."、クライアントが抜けるとホストは "Your friend left. Waiting for another friend…"、どちらも自動で待機には戻らない)。ボタン名と確認をそろえるかは決まっていない。' },
  { id: 'U52', title: '開始前に切断した側の画面と、ルームが閉じたお知らせの消え方',
    desc: 'U32 の決定は、残った側の表示と、戻らなかったときの残った側の行き先まで。切断した側の画面は決まっていないので、モックは Ready 画面に "Reconnecting…" (ボタンなし) を出し、' +
      '20 秒で戻れなかったら Friend Match トップへ移す (クライアントは Match Code を入力欄に残し、ホストのルームは閉じる)。切断中に相手が Leave Room で抜けたときも、戻ったときに同じ表示 (ホストが抜けたら "Room closed. The host left."、クライアントが抜けたらホストは "Your friend left…") にしている。' +
      'Friend Match トップの "Room closed…" のお知らせは、ほかの操作 (Match Code の入力・‹) で消える (ボタンは無い)。' },
  { id: 'U53', title: 'Ready 画面の細部: 送っている間・読み込み中の操作、アプリを離れたときの相手の表示',
    desc: 'U36 の決定に無い細部。モックでは、Ready を送っている間 ("Confirming…") は Leave Room / ‹ を押せず、読み込み中 ("Starting match…") は Cancel Ready / Leave Room / ‹ を出さない。' +
      'アプリを離れて Ready が消えたとき (U35)、相手には Cancel Ready と同じ "Opponent is no longer ready." を出す。相手が Ready を送っている途中で取り消したときは、相手の Ready が届いて相手が待つ側になる。' +
      '戻ってきた・再接続したあとの表示 (お知らせを出すか) も決まっていない (モックは出さない)。' },
  { id: 'U54', title: 'ランダム対戦と再戦の VS 画面・カウントダウン中の切断',
    desc: 'U32 は Friend Match の Ready 画面からの開始前の切断の決定。ランダム対戦 (Ready 画面が無い、U13a) と、結果画面の Rematch で始まった再戦 (ロビーの Ready を挟まない、U23) の VS 画面・カウントダウン中に切断したときの扱いは決まっていない。' +
      'モックでは Friend Match の再戦は U32 と同じく Ready 画面に戻し、ランダム対戦のときは行が無い (端末の下の「切断する」は押せない)。' },
];
