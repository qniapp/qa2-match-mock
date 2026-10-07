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

var hostCancelable = ['Host.FriendMatch.Lobby.Waiting', 'Host.FriendMatch.Lobby.FriendJoined', 'Host.FriendMatch.Lobby.Ready', 'Host.FriendMatch.Lobby.Connecting', 'Host.FriendMatch.Lobby.ConnectionLost',
  'Host.FriendMatch.Lobby.ClientLeft', 'Host.FriendMatch.Lobby.ClientAway', 'Host.FriendMatch.Lobby.StartFailed'];
var hostWithClient = ['Host.FriendMatch.Lobby.FriendJoined', 'Host.FriendMatch.Lobby.Ready', 'Host.FriendMatch.Lobby.Starting', 'Host.FriendMatch.Lobby.StartFailed',
  'Host.FriendMatch.Lobby.Connecting', 'Host.FriendMatch.Lobby.ConnectionLost', 'Host.FriendMatch.Lobby.ClientAway'];
// 片方だけ Start Match を押した状態 (U31 決定): 押した側は待機 (.WaitingForFriend)、相手側には準備完了 (.FriendReady)
var hostOnePressed = ['Host.FriendMatch.Lobby.Ready.WaitingForFriend', 'Host.FriendMatch.Lobby.Ready.FriendReady'];
var clientOnePressed = ['Client.FriendMatch.Lobby.Ready.WaitingForFriend', 'Client.FriendMatch.Lobby.Ready.FriendReady'];
var clientInMatch = ['Client.FriendMatch.Lobby.Waiting', 'Client.FriendMatch.Lobby.HostAway', 'Client.FriendMatch.Lobby.FriendJoined', 'Client.FriendMatch.Lobby.Ready', 'Client.FriendMatch.Lobby.Ready.WaitingForFriend', 'Client.FriendMatch.Lobby.Ready.FriendReady', 'Client.FriendMatch.Lobby.Starting',
  'Client.FriendMatch.Lobby.StartFailed', 'Client.FriendMatch.Lobby.Connecting', 'Client.FriendMatch.Lobby.ConnectionLost', 'Client.Away.StageSelection.Ready'];
var clientLeavable = ['Client.FriendMatch.Lobby.HostAway', 'Client.FriendMatch.Lobby.FriendJoined', 'Client.FriendMatch.Lobby.Ready', 'Client.FriendMatch.Lobby.StartFailed',
  'Client.FriendMatch.Lobby.Connecting', 'Client.FriendMatch.Lobby.ConnectionLost'];
var clientRoomAny = ['Client.FriendMatch.Room', 'Client.FriendMatch.Room.CodeEntered', 'Client.FriendMatch.Room.Error.NotFound', 'Client.FriendMatch.Room.Error.Expired',
  'Client.FriendMatch.Room.Error.Full', 'Client.FriendMatch.Room.ConnectionFailed'];
var clientRoomFilled = ['Client.FriendMatch.Room.CodeEntered', 'Client.FriendMatch.Room.Error.NotFound', 'Client.FriendMatch.Room.Error.Expired',
  'Client.FriendMatch.Room.Error.Full', 'Client.FriendMatch.Room.ConnectionFailed'];
var hostExpiredAny = ['Host.FriendMatch.Lobby.CodeExpired', 'Host.FriendMatch.Lobby.MatchExpired', 'Host.Away.FriendMatchRoom.Expired', 'Host.Away.StageSelection.Expired'];

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
  'Host.FriendMatch.Lobby.Ready.OnePressed': hostOnePressed,
  'Client.FriendMatch.Lobby.Ready.OnePressed': clientOnePressed,
  'Client.InMatch': clientInMatch,
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
  T({ from: { host: '*', client: 'Client.FriendMatch.Room' }, event: 'client.enterCode', to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, note: 'モックでは入力欄タップで QWERTY123 を入力' });
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
  T({ from: { host: 'Host.FriendMatch.Lobby.Waiting', client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Waiting' }, note: '図01: ホストは Friend joined!、クライアントはまず Waiting for your friend…' });
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
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.FriendJoined' }, event: 'sys.ready', auto: 1500,
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, note: '図01: 点線 (自動)。何をもって Ready か不明', undecided: ['U4'] });
  // 決定 (U31): 両者が Start Match を押したら開始。先に押した側は待機、相手側には相手が準備完了であることを表示
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, event: 'host.startMatch',
    to: { host: 'Host.FriendMatch.Lobby.Ready.WaitingForFriend', client: 'Client.FriendMatch.Lobby.Ready.FriendReady' },
    note: '決定 (U31): 押した側は "Waiting for your friend…"、相手側には "Friend is ready!" (図01 では押した側は "Starting match…")', decided: ['U31'], undecided: ['U36'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, event: 'client.startMatch',
    to: { host: 'Host.FriendMatch.Lobby.Ready.FriendReady', client: 'Client.FriendMatch.Lobby.Ready.WaitingForFriend' },
    note: '決定 (U31): 押した側は "Waiting for your friend…"、相手側には "Friend is ready!" (図01 では押した側は "Starting match…")', decided: ['U31'], undecided: ['U36'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.FriendReady', client: 'Client.FriendMatch.Lobby.Ready.WaitingForFriend' }, event: 'host.startMatch',
    to: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, note: '決定 (U31): 両者が押したので開始。同期の間は図の "Starting match…"', decided: ['U31'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.WaitingForFriend', client: 'Client.FriendMatch.Lobby.Ready.FriendReady' }, event: 'client.startMatch',
    to: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, note: '決定 (U31): 両者が押したので開始。同期の間は図の "Starting match…"', decided: ['U31'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'sys.bothStarted', auto: 1500,
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { match: 'friend', rated: false },
    note: '合意: マッチ成立時に VS 画面を挟む。決定 (U21): Friend Match はレートが変わらない', decided: ['U21'] });
  T({ from: { host: 'Host.Opponent', client: 'Client.Opponent' }, event: 'vs.done', auto: 2500,
    to: { host: 'Host.Game.Countdown', client: 'Client.Game.Countdown' },
    note: '合意: VS 画面は 2〜3 秒。決定 (U2): そのままゲーム画面へ移り、ゲーム本体のカウントダウンが始まる', decided: ['U2'] });
  T({ from: { host: 'Host.Game.Countdown', client: 'Client.Game.Countdown' }, event: 'game.countdownDone', auto: GAME_COUNTDOWN_MS,
    to: { host: 'Host.Game.Play', client: 'Client.Game.Play' }, note: '決定 (U2): ゲーム本体の 3 → 2 → 1 (1 秒待ち + 0.8 秒 × 3) が終わるとメニューボタン (☰) が出てプレイ開始', decided: ['U2'] });

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

  // === Start Match 直後の同期失敗 (図06) ===
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'sys.startFailed',
    to: { host: 'Host.FriendMatch.Lobby.StartFailed', client: 'Client.FriendMatch.Lobby.StartFailed' }, note: '図06: 接続が切れる / 同期処理の失敗' });
  T({ from: { host: 'Host.FriendMatch.Lobby.StartFailed', client: '*' }, event: 'host.startMatch',
    to: { host: 'Host.FriendMatch.Lobby.Starting', client: '*' }, note: '図06: 再試行。先に押した側は図どおり "Starting match…" で相手を待つ', undecided: ['U15'] });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.StartFailed' }, event: 'client.startMatch',
    to: { host: '*', client: 'Client.FriendMatch.Lobby.Starting' }, note: '図06: 再試行。先に押した側は図どおり "Starting match…" で相手を待つ', undecided: ['U15'] });

  // === ホストのキャンセル (図03, 図04) ===
  // 片方が Start Match を押したあとのキャンセルは図に無い。Ready からのキャンセルと同じ結果を仮に置く
  T({ from: { host: hostOnePressed, client: '*' }, event: 'host.cancelMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'cancel' }, note: '仮: 片方が Start Match を押したあとのキャンセル (図に無い)', undecided: ['U34'] });
  T({ from: { host: hostOnePressed, client: clientOnePressed, hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Lobby.HostCancelled' }, dialog: { host: null }, note: '仮: Ready からのキャンセル (図04) と同じ結果', undecided: ['U34', 'U8'] });
  T({ from: { host: hostCancelable, client: '*' }, event: 'host.cancelMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'cancel' }, note: '確認ダイアログ' });
  T({ from: { host: '*', client: '*', hostDialog: 'cancel' }, event: 'host.dialog.keepWaiting',
    to: { host: '=', client: '*' }, dialog: { host: null }, note: '合意: 図の "Go Back" → "Keep Waiting"' });
  T({ from: { host: '*', client: clientInMatch, hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Lobby.HostCancelled' }, dialog: { host: null }, note: '図04: クライアントは "cancelled the match."', undecided: ['U8'] });
  T({ from: { host: '*', client: '*', hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '図03/04: Friend Match トップへ' });
  T({ from: { host: 'Host.FriendMatch.Lobby.MatchExpired', client: '*' }, event: 'host.cancelMatch',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, note: '期限切れなので確認ダイアログなし (モックの仮定)', undecided: ['U10'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.MatchExpired', client: '*' }, event: 'host.back', to: { host: 'Host.FriendMatch.Room', client: '*' } });

  // === クライアントの退出 (図05) ===
  // 片方が Start Match を押したあとの退出は図に無い。Ready からの退出と同じ結果を仮に置く
  T({ from: { host: '*', client: clientOnePressed }, event: 'client.leaveMatch',
    to: { host: '*', client: '=' }, dialog: { client: 'leave' }, note: '仮: 片方が Start Match を押したあとの退出 (図に無い)', undecided: ['U34', 'U11'] });
  T({ from: { host: hostOnePressed, client: clientOnePressed, clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null }, note: '仮: Ready からの退出 (図05) と同じ結果', undecided: ['U34'] });
  T({ from: { host: '*', client: clientLeavable }, event: 'client.leaveMatch',
    to: { host: '*', client: '=' }, dialog: { client: 'leave' }, note: '確認ダイアログ', undecided: ['U11'] });
  T({ from: { host: '*', client: '*', clientDialog: 'leave' }, event: 'client.dialog.goBack',
    to: { host: '*', client: '=' }, dialog: { client: null }, undecided: ['U11'] });
  T({ from: { host: hostWithClient, client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null }, note: '図05: クライアントは入力欄に Match Code が残ったトップへ' });
  eachPlace(function (p) {
    T({ from: { host: [away(p, 'FriendJoined'), away(p, 'Ready')], client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
      to: { host: away(p, 'Waiting'), client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
      note: 'ホスト離席中の退出: トーストが青に戻る (図に無い)', undecided: ['U17'] });
  });
  T({ from: { host: '*', client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null } });
  T({ from: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: '*' }, event: 'sys.resetWaiting', auto: 1500,
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: '図05: 点線 (自動)。同じ Match Code で待機に戻る' });

  // クライアント待機中 (Client.FriendMatch.Lobby.Waiting) の退出: 図にボタンが無いので ‹ で抜ける仮定
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'client.back',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, note: 'Client.FriendMatch.Lobby.Waiting には退出ボタンが無い。‹ で抜ける仮定', undecided: ['U9'] });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'FriendJoined'), client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'client.back',
      to: { host: away(p, 'Waiting'), client: 'Client.FriendMatch.Room.CodeEntered' }, note: 'Client.FriendMatch.Lobby.Waiting には退出ボタンが無い。‹ で抜ける仮定', undecided: ['U9'] });
  });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.Waiting' }, event: 'client.back',
    to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, undecided: ['U9'] });

  // === ホストが別画面へ移る (図02, 図03) ===
  T({ from: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.Waiting', client: '*' }, note: '図02: 別画面に遷移したらバナーで状態を示す', undecided: ['U14'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.FriendJoined', client: '*' }, undecided: ['U14'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: ['Client.FriendMatch.Lobby.Ready', 'Client.FriendMatch.Lobby.FriendJoined'] }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.Ready', client: 'Client.FriendMatch.Lobby.HostAway' }, note: '図07 の逆: ホスト離席でクライアントは "Away"', undecided: ['U14'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'Host.Away.FriendMatchRoom.Waiting', client: '*' }, note: '図03: Connection lost から ‹ で青いバナー付きトップへ (?)', undecided: ['U19', 'U14'] });
  T({ from: { host: ['Host.FriendMatch.Lobby.Waiting', 'Host.FriendMatch.Lobby.FriendJoined', 'Host.FriendMatch.Lobby.Ready', 'Host.FriendMatch.Lobby.ConnectionLost'], client: '*' }, event: 'host.back', when: { U14: 'confirm' },
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
    T({ from: { host: away(p, 'FriendJoined'), client: ['Client.FriendMatch.Lobby.Waiting', 'Client.FriendMatch.Lobby.FriendJoined'] }, event: 'sys.ready', auto: 1500,
      to: { host: away(p, 'Ready'), client: 'Client.FriendMatch.Lobby.HostAway' }, note: '図02: 緑 → 赤 "Ready to start"、クライアントは "Away"', undecided: ['U4'] });
  });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'Ready'), client: 'Client.FriendMatch.Lobby.HostAway' }, event: 'host.tapToast', when: { U1: 'lobby' },
      to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.FriendJoined' }, note: '図02: Ready to start ボタン押下で遷移', undecided: ['U1', 'U17'] });
    T({ from: { host: away(p, 'Ready'), client: 'Client.FriendMatch.Lobby.HostAway' }, event: 'host.tapToast', when: { U1: 'direct' },
      to: { host: 'Host.FriendMatch.Lobby.Ready.WaitingForFriend', client: 'Client.FriendMatch.Lobby.Ready.FriendReady' },
      note: 'U1 別案: トーストのタップでホストが Start Match を押した扱い。開始はクライアントも押してから (U31 決定)', undecided: ['U1'], decided: ['U31'] });
    T({ from: { host: away(p, 'Waiting'), client: '*' }, event: 'host.tapToast', when: { U16: 'yes' },
      to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: 'U16 別案: 青バナーもタップでロビーへ', undecided: ['U16'] });
    T({ from: { host: away(p, 'FriendJoined'), client: '*' }, event: 'host.tapToast', when: { U16: 'yes' },
      to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: '*' }, note: 'U16 別案: 緑トーストもタップでロビーへ', undecided: ['U16'] });
  });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.FriendJoined' }, event: 'sys.ready', auto: 1500,
    to: { host: '*', client: 'Client.FriendMatch.Lobby.Ready' }, note: '図02: ホストが戻ったあとクライアントも Ready へ', undecided: ['U17'] });

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
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.HostCancelled' }, event: 'client.back',
    to: { host: '*', client: 'Client.FriendMatch.Room' }, note: '図04 にはボタンが無く ‹ のみ', undecided: ['U8'] });

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
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: 'Client.FriendMatch.Lobby.HostCancelled' }, dialog: { host: null }, note: '古いマッチにいたクライアントの扱いは図に無い', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, dialog: { host: null }, note: 'モックでは同じ Match Code を表示' });
  T({ from: { host: '*', client: clientInMatch, hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Lobby.HostCancelled' }, dialog: { host: null }, note: '別マッチへの参加はモックでは省略', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '別マッチへの参加はモックでは省略', undecided: ['U12'] });
  T({ from: { host: ['Host.Away.FriendMatchRoom.Expired'], client: '*' }, event: 'host.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: '期限切れなので確認なしで作り直し (モックの仮定)' });

  // === クライアントが別画面へ移る (図07) ===
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, event: 'client.back',
    to: { host: 'Host.FriendMatch.Lobby.ClientAway', client: 'Client.Away.StageSelection.Ready' }, note: '図07: クライアントが他の画面に遷移した' });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.Ready' }, event: 'client.back',
    to: { host: '*', client: 'Client.Away.StageSelection.Ready' } });
  T({ from: { host: 'Host.FriendMatch.Lobby.ClientAway', client: 'Client.Away.StageSelection.Ready' }, event: 'client.tapToast',
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, note: '図07: Ready to start をタップして戻る' });
  T({ from: { host: '*', client: 'Client.Away.StageSelection.Ready' }, event: 'client.tapToast',
    to: { host: '*', client: 'Client.FriendMatch.Lobby.Ready' } });
  T({ from: { host: 'Host.FriendMatch.Lobby.ClientAway', client: 'Client.Away.StageSelection.Ready' }, event: 'timer.codeExpired',
    to: { host: 'Host.FriendMatch.Lobby.MatchExpired', client: 'Client.Away.StageSelection.Expired' }, note: '図07: クライアントが戻らず期限切れ。クライアント側は図に無い', undecided: ['U10', 'U18', 'U7'] });
  T({ from: { host: '*', client: 'Client.Away.StageSelection.Expired' }, event: 'client.tapToast',
    to: { host: '*', client: 'Client.FriendMatch.Lobby.MatchExpired' }, undecided: ['U18'] });

  // === Ready 後の通信不安定 (図03) ===
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, event: 'net.unstable',
    to: { host: 'Host.FriendMatch.Lobby.Connecting', client: 'Client.FriendMatch.Lobby.Connecting' }, note: '図03: 何らかの理由により通信が不安定になった。クライアント側は図に無い', undecided: ['U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Connecting', client: 'Client.FriendMatch.Lobby.Connecting' }, event: 'net.recovered',
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, note: '図03: 通信が回復' });
  T({ from: { host: 'Host.FriendMatch.Lobby.Connecting', client: 'Client.FriendMatch.Lobby.Connecting' }, event: 'net.lost',
    to: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, note: '図03: 通信が回復しない', undecided: ['U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'net.recovered', when: { U5: 'wait' },
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' }, note: 'U5 別案: しばらく待てば復帰できる', undecided: ['U5'] });

  // === VS 画面中の切断 (合意済みの追加項目、図なし) ===
  T({ from: { host: 'Host.Opponent', client: 'Client.Opponent' }, event: 'net.lostDuringVs', when: { U3: 'lobby' },
    to: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, note: 'U3 既定: ロビーで "Connection lost."', undecided: ['U3'] });
  T({ from: { host: 'Host.Opponent', client: 'Client.Opponent' }, event: 'net.lostDuringVs', when: { U3: 'top' },
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.CodeEntered' }, note: 'U3 別案: Friend Match トップへ', undecided: ['U3'] });
  T({ from: { host: 'Host.Opponent', client: 'Client.Opponent' }, event: 'net.lostDuringVs', when: { U3: 'online' },
    to: { host: 'Host.MultiModeSelection', client: 'Client.MultiModeSelection' }, note: 'U3 別案: Online Battle へ', undecided: ['U3'] });

  // === ランダム対戦 (決定 U13a: 相手が見つかり次第 VS 画面へ。Ready / Start Match は挟まない。U31 は Friend Match だけ) ===
  T({ from: { host: hostSearching, client: clientSearching }, event: 'sys.opponentFound', auto: 2500,
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { match: 'random', rated: true },
    note: '決定 (U13a): 相手が見つかり次第 VS 画面へ。Ready / Start Match は無い (U31 は Friend Match だけ)。' +
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
        note: '決定 (U23): 相手が Rematch で応じたらそのまま VS 画面へ (ロビーの Start Match は挟まない)。ランダム対戦の再戦はレートが変わらない (U21)',
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
  'host.startMatch': 'ホスト: Start Match を押す',
  'host.cancelMatch': 'ホスト: Cancel Match を押す',
  'host.cancelSearch': 'ホスト: 相手を探している間に Cancel を押す',
  'host.leaveApp': 'ホスト: 相手を探している間にアプリを離れて戻る (モック操作: バックグラウンド・画面ロック)',
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
  'host.disconnect': 'ホスト: 対戦中に接続が切れる (モック操作)',
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
  'client.friendMatch': 'クライアント: Friend Match を選ぶ',
  'client.randomMatch': 'クライアント: Random Match を選ぶ',
  'client.enterCode': 'クライアント: QWERTY123 を入力',
  'client.joinMatch': 'クライアント: Join Match を押す',
  'client.startMatch': 'クライアント: Start Match を押す',
  'client.leaveMatch': 'クライアント: Leave Match を押す',
  'client.cancelSearch': 'クライアント: 相手を探している間に Cancel を押す',
  'client.leaveApp': 'クライアント: 相手を探している間にアプリを離れて戻る (モック操作: バックグラウンド・画面ロック)',
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
  'client.disconnect': 'クライアント: 対戦中に接続が切れる (モック操作)',
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
  'sys.peerConnected': '自動: クライアントの接続完了',
  'sys.ready': '自動: Ready になる',
  'sys.bothStarted': '自動: 開始の同期が終わる',
  'sys.startFailed': '環境: 開始時の同期に失敗',
  'sys.resetWaiting': '自動: 待機に戻る',
  'sys.opponentFound': '自動: 対戦相手が見つかる',
  'vs.done': '自動: VS 画面が終わる',
  'game.countdownDone': '自動: ゲーム本体のカウントダウンが終わる',
  'net.unstable': '環境: 通信が不安定になる',
  'net.recovered': '環境: 通信が回復する',
  'net.lost': '環境: 通信が回復しない',
  'net.lostDuringVs': '環境: VS 画面中に相手が切断',
  'net.bothDisconnected': '環境: 対戦中に両者の接続が切れる',
  'net.serviceFailure': '環境: 対戦中にサービス障害が起きる',
  'timer.disconnectTimeout': '環境: 切断から 20 秒 (仮) たつ',
  'timer.rematchTimeout': '環境: 再戦の申し込みから 20 秒 (仮) たつ (応答なし)',
  'timer.rematchCooldown': '環境: 3 秒 (仮) たつ (また再戦を申し込める)',
  'sys.rematchSimultaneous': '環境: 両者が同時に Rematch を押す',
  'timer.codeExpired': '環境: Match Code の有効期限が切れる',
};

// ---- 画面の描画仕様 ---------------------------------------------------------
// view: online | friendTop | lobby | stage | random | vs | game | result
// ボタンの event はデバイス名を除いたもの (例: 'startMatch' → 'host.startMatch')

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
var GAME_COUNTDOWN_CONTEXT = 'ゲーム本体のカウントダウン（VsAI と同じ 3→2→1）。終わるとメニューボタン (☰) が出てプレイ開始。';
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
var MATCHMAKE_CONTEXT = 'ランダム対戦で相手を探している画面 (決定 U13a / U13)。相手が見つかり次第 VS 画面へ進む (Start Match は無い)。' +
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

var SCREENS = (function () {
  var S = {};
  var B = {
    start: { label: 'Start Match', event: 'startMatch', primary: true, hideIfNoRow: true },
    // 押したあとの Start Match: 無効表示 (遷移表の「行なし」の破線とは別の、ゲーム内の見た目)
    pressed: { label: 'Start Match', primary: true, disabled: true },
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
  S['Host.FriendMatch.Lobby.Ready'] = lobby({ name: 'Client User', status: 'Ready', buttons: [B.start, B.cancel], decided: ['U31'] });
  S['Host.FriendMatch.Lobby.Ready.WaitingForFriend'] = lobby({ name: 'Client User', status: 'Waiting for your friend…', buttons: [B.pressed, B.cancel],
    decided: ['U31'], undecided: ['U33', 'U35', 'U36'] });
  S['Host.FriendMatch.Lobby.Ready.FriendReady'] = lobby({ name: 'Client User', peerReady: true, status: 'Ready', buttons: [B.start, B.cancel],
    decided: ['U31'], undecided: ['U33', 'U35', 'U36'] });
  S['Host.FriendMatch.Lobby.Starting'] = lobby({ name: 'Client User', status: 'Starting match…', back: 'disabled' });
  S['Host.FriendMatch.Lobby.StartFailed'] = lobby({ name: 'Client User', status: 'Unable to start the match.\nPlease try again.', back: 'disabled',
    buttons: [{ label: 'Start Match', event: 'startMatch', primary: true }, B.cancel], undecided: ['U15'] });
  S['Host.FriendMatch.Lobby.Connecting'] = lobby({ name: 'Client User', status: 'Connecting…', buttons: [B.cancel] });
  S['Host.FriendMatch.Lobby.ConnectionLost'] = lobby({ name: 'Client User', status: 'Connection lost.', buttons: [B.cancel], undecided: ['U5'] });
  S['Host.FriendMatch.Lobby.ClientLeft'] = lobby({ name: 'Client User', status: 'left the match.', buttons: [B.cancel] });
  S['Host.FriendMatch.Lobby.ClientAway'] = lobby({ name: 'Client User', status: 'Away', buttons: [B.cancel] });
  S['Host.FriendMatch.Lobby.MatchExpired'] = lobby({ status: 'Match expired.', buttons: [{ label: 'Start Match', event: 'startMatch', primary: true }, B.cancel],
    undecided: ['U10', 'U7'] });
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
  S['Host.Opponent'] = { view: 'vs', undecided: ['U48'] };
  // ゲーム画面: カウントダウン中 (メニューボタンなし・Win / Lose は押せない) → プレイ中 ⇄ MATCH MENU → 降参の確認
  S['Host.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2'], undecided: ['U32'], context: GAME_COUNTDOWN_CONTEXT };
  S['Host.Game.Play'] = { view: 'game', context: GAME_CONTEXT };
  S['Host.Game.MatchMenu'] = matchMenu();
  S['Host.Game.SurrenderConfirm'] = surrenderConfirm();
  S['Host.Game.Disconnected'] = disconnectWait('self');
  S['Host.Game.OpponentDisconnected'] = disconnectWait('opponent');

  // --- クライアント ---
  S['Client.MultiModeSelection'] = online('client');
  S['Client.FriendMatch.Room'] = top({});
  S['Client.FriendMatch.Room.CodeEntered'] = top({ input: 'QWERTY123' });
  Object.keys(errMsg).forEach(function (k) {
    S['Client.FriendMatch.Room.Error.' + k] = top({ input: 'QWERTY123', error: errMsg[k] });
  });
  S['Client.FriendMatch.Room.ConnectionFailed'] = top({ input: 'QWERTY123', toast: 'failed', undecided: ['U6'] });
  S['Client.FriendMatch.Lobby.Waiting'] = lobby({ status: 'Waiting for your friend…', undecided: ['U9'] });
  S['Client.FriendMatch.Lobby.HostAway'] = lobby({ name: 'Host User', status: 'Away', buttons: [B.leave] });
  S['Client.FriendMatch.Lobby.FriendJoined'] = lobby({ name: 'Host User', status: 'Friend joined!', buttons: [B.leave], undecided: ['U4'] });
  S['Client.FriendMatch.Lobby.Ready'] = lobby({ name: 'Host User', status: 'Ready', buttons: [B.start, B.leave], decided: ['U31'] });
  S['Client.FriendMatch.Lobby.Ready.WaitingForFriend'] = lobby({ name: 'Host User', status: 'Waiting for your friend…', buttons: [B.pressed, B.leave],
    decided: ['U31'], undecided: ['U33', 'U35', 'U36'] });
  S['Client.FriendMatch.Lobby.Ready.FriendReady'] = lobby({ name: 'Host User', peerReady: true, status: 'Ready', buttons: [B.start, B.leave],
    decided: ['U31'], undecided: ['U33', 'U35', 'U36'] });
  S['Client.FriendMatch.Lobby.Starting'] = lobby({ name: 'Host User', status: 'Starting match…', back: 'disabled' });
  S['Client.FriendMatch.Lobby.StartFailed'] = lobby({ name: 'Host User', status: 'Unable to start the match.\nPlease try again.', back: 'disabled',
    buttons: [{ label: 'Start Match', event: 'startMatch', primary: true }, B.leave], undecided: ['U15'] });
  S['Client.FriendMatch.Lobby.Connecting'] = lobby({ name: 'Host User', status: 'Connecting…', buttons: [B.leave], undecided: ['U5'] });
  S['Client.FriendMatch.Lobby.ConnectionLost'] = lobby({ name: 'Host User', status: 'Connection lost.', buttons: [B.leave], undecided: ['U5'] });
  S['Client.FriendMatch.Lobby.HostCancelled'] = lobby({ name: 'Host User', status: 'cancelled the match.', undecided: ['U8'] });
  S['Client.FriendMatch.Lobby.MatchExpired'] = lobby({ status: 'Match expired.', undecided: ['U7'] });
  S['Client.Away.StageSelection.Ready'] = { view: 'stage', back: 'back', toast: 'ready' };
  S['Client.Away.StageSelection.Expired'] = { view: 'stage', back: 'back', toast: 'expired', undecided: ['U18'] };
  S['Client.Matchmake'] = matchmake();
  S['Client.Matchmake.Stopped'] = inlineSearchNotice(SEARCH_NOTICES.stopped, { context: SEARCH_STOPPED_CONTEXT });
  S['Client.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Client.Matchmake.NextOpponent'] = nextSearch();
  S['Client.Matchmake.NextOpponent.NotFound'] = nextNotFound();
  S['Client.Opponent'] = { view: 'vs', undecided: ['U48'] };
  S['Client.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2'], undecided: ['U32'], context: GAME_COUNTDOWN_CONTEXT };
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
    desc: '別画面にいるホストが赤い "Ready to start" トーストをタップしたあと、ロビーの Ready 画面に戻って Start Match を押すのか、タップで Start Match を押した扱いにするのか。' +
      'U31 の決定により、どちらでもクライアントが Start Match を押すまで開始しない (別案ではホストは "Waiting for your friend…"、クライアントには "Friend is ready!")。' +
      'VS 画面のあとの流れ (モックの 3·2·1 をやめてゲーム本体のカウントダウン) は U2 で決定済みで、どちらの入り方でも同じ。トーストのタップ後の入り方は決まっていない。',
    options: [{ value: 'lobby', label: 'ロビーの Ready 画面へ (図02)' }, { value: 'direct', label: 'タップで Start Match を押した扱い' }], default: 'lobby' },
  { id: 'U2', title: '開始のカウントダウン',
    desc: '元の論点は「開始は両者の Start Match か、自動カウントダウンか」。このうちカウントダウンの部分が決まった: VS 画面のあと (ランダム対戦・Friend Match・再戦とも) はモック独自の 3·2·1 を出さず、ゲーム画面に移ってゲーム本体のカウントダウン (VsAI と同じ 3 → 2 → 1) を使う。' +
      '両者が Start Match を押すか、Ready 後に自動で開始するかはこの決定に含まれないので U31 に分けた (U31 も 2026-10-03 に決定: 両者が Start Match を押したら開始)。',
    decided: { by: '高宮さん', date: '2026-10-03', reason: 'ゲーム本体にゲーム開始時のカウントダウンがあるため、モック側の 3·2·1 は不要', premise: GAME_COUNTDOWN_PREMISE } },
  { id: 'U3', title: 'VS 画面中に相手が切断したときの戻り先',
    desc: '合意済みの VS 画面中に切断した場合の画面は図に無い。',
    options: [{ value: 'lobby', label: 'ロビーで "Connection lost."' }, { value: 'top', label: 'Friend Match トップ' }, { value: 'online', label: 'Online Battle' }], default: 'lobby' },
  { id: 'U4', title: 'Friend joined! → Ready の条件',
    desc: '何をもって Ready になるのか (自動遷移の条件・待ち時間) が不明。モックでは 1.5 秒後に自動で Ready にしている。' +
      'Ready は Start Match を押せるようになる段階で、Ready になっても自動では開始しない (U31 で決定: 両者が Start Match を押したら開始)。' },
  { id: 'U5', title: 'Connection lost 時の扱いとクライアント側の表示',
    desc: '図03 の赤字メモ「しばらく待つか、導線的にキャンセルしかないようにするか」。タイムアウトの長さも未定。クライアント側の画面は図に無く、モックではホストと対称の "Connecting…" / "Connection lost." を仮表示している。',
    options: [{ value: 'cancel', label: 'キャンセルのみ (図03)' }, { value: 'wait', label: 'しばらく待てば復帰できる' }], default: 'cancel' },
  { id: 'U6', title: '"Connection failed" トーストの発生条件',
    desc: '09-30 の図にトーストだけあり、出る場面が描かれていない。モックでは Create Match / Join Match の接続失敗として仮に表示している。' },
  { id: 'U7', title: 'Match Code の有効期限と文言の差',
    desc: '有効期限の長さが未定。ホスト側は "Match code expired." / トースト "Match code expired"、クライアント側は "Match expired." と文言が異なる。' },
  { id: 'U8', title: 'ホストがキャンセルした後のクライアントの出口',
    desc: '"Host User / cancelled the match." の画面にボタンが無い (‹ のみ)。モックでは ‹ で Friend Match トップに戻る。' },
  { id: 'U9', title: 'クライアント待機中 (Client.FriendMatch.Lobby.Waiting) の退出方法',
    desc: '"Waiting for your friend…" のクライアント画面にボタンが無い。モックでは ‹ で抜けて Match Code 入力済みのトップへ戻る。' },
  { id: 'U10', title: 'クライアント離脱で期限切れ後のホスト画面の Start Match',
    desc: '図07 で "Match expired." の画面に Start Match と Cancel Match がある。期限切れで開始できる意味が不明なため、モックでは Start Match に遷移行を用意していない (押せない)。' },
  { id: 'U11', title: '"Leave this match?" の "Go Back" の文言',
    desc: '"Cancel this match?" は合意で "Keep Waiting" にしたが、"Leave this match?" の "Go Back" は合意の対象外。"Stay in Match" などに揃えるか。' },
  { id: 'U12', title: '"Create a new match?" / "Join another match?" の本文と影響',
    desc: '10-01 の合意でボタンは [Create Match]/[Join Match] + [Keep Current Match]。本文は残っている図に無いので仮に "Your current Match Code will no longer be valid." を表示。古いマッチに入っていたクライアントの扱いも未定 (モックでは "cancelled the match.")。' },
  { id: 'U13', title: 'ランダム対戦の待機中: Cancel と ‹ は確認なしで戻る。アプリを離れたら検索を止める。見つからなければ "No opponent found."',
    desc: '相手を探している間 ("Searching for an opponent…") の操作。Cancel を押すと、確認ダイアログを出さずに Online Battle へ戻る。' +
      '‹ も Cancel とまったく同じ (Online Battle へ)。探している間は、ほかの画面へは行けない (出口は Cancel と ‹ だけ)。' +
      'アプリを離れる (バックグラウンドへ移る・画面ロック) と検索を止め、戻ったときに通知を出す (文言・出す場所・ボタンは U43 で決定: Online Battle の中に "Search stopped while the app was in the background." と Search again / Close)。' +
      '60 秒探しても相手が見つからなければ元の画面 (Online Battle) に戻り、"No opponent found." と Search again / Close を出す。Search again でもう一度探し、Close で通知を閉じる。' +
      '60 秒という長さは仮 (変わりうる)。相手が見つかり次第 VS 画面へ進むこと (U13a) は変わらない。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U13a', title: 'ランダム対戦は相手が見つかり次第 VS 画面へ (Start Match なし)',
    desc: 'U13 から分けた決定。ランダム対戦では、相手が見つかったらすぐ VS 画面へ進む (Ready・Start Match・"Starting match…" は挟まない)。' +
      '両者が Start Match を押す U31 は Friend Match だけ。相手を探している画面には "Searching for an opponent…" (点が順に光る) と、席を外す人のための大きな Cancel を出す。' +
      'Cancel を押すと Online Battle の画面に戻る。確認を挟まないこと、‹・アプリを離れたとき・タイムアウトの扱いは U13 で決定 (2026-10-07)。',
    decided: { by: '高宮さん', date: '2026-10-03' } },
  { id: 'U14', title: 'ホストが ‹ で戻ったときにマッチを維持するか',
    desc: '図02 はバナーを出してマッチを維持する。‹ でキャンセル確認を出す案もありうる。',
    options: [{ value: 'keep', label: '維持してバナー表示 (図02)' }, { value: 'confirm', label: 'キャンセル確認を出す' }], default: 'keep' },
  { id: 'U15', title: '同期失敗時に片方だけ再試行した場合',
    desc: '図06 は両者が Start Match で再試行する。片方だけ再試行した場合や、再試行の回数制限が未定。' +
      '再試行で先に押した側は図06 どおり "Starting match…" で相手を待ち、相手側には何も出ない。初回の開始 (U31) の "Waiting for your friend…" / "Friend is ready!" に揃えるかも未定。' },
  { id: 'U16', title: '青 / 緑のバナーをタップしてロビーに戻れるか',
    desc: '図02 で "Ready to start" と "Match code expired" はタップで遷移するが、"Waiting for your friend…" と "Friend joined!" のタップは描かれていない。',
    options: [{ value: 'no', label: 'タップできない (図02)' }, { value: 'yes', label: 'タップでロビーへ' }], default: 'no' },
  { id: 'U17', title: 'ホストが戻ったときクライアントに "Friend joined!" を再表示するか',
    desc: '図02 では Away → Friend joined! → Ready の順。すでに一度 Ready だった場合も同じか。ホスト離席中にクライアントが退出した場合のホスト側表示も図に無い。' +
      'ホストが戻って Ready になったあとも、開始には両者の Start Match が必要 (U31 で決定)。' },
  { id: 'U18', title: 'クライアントが別画面にいる間に期限切れになったときのクライアント側',
    desc: '図07 はホスト側のみ。モックではクライアントに "Match code expired" トーストを出し、タップで "Match expired." を表示している。' },
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
    desc: '結果画面の Rematch で、どちらのプレイヤーからでも再戦を申し込める。相手が応じたら (Rematch を押したら)、ロビーの Start Match を挟まずにそのまま VS 画面へ進む。' +
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
  { id: 'U31', title: 'Friend Match の開始は両者が Start Match を押してから',
    desc: 'U2 から分けた残りの論点。Friend Match では、両者が Start Match を押したら開始する (Ready 後の自動開始はしない)。ランダム対戦には Start Match が無く、相手が見つかり次第 VS 画面へ進む (U13a)。片方が押すと、押した側は待機表示 ("Waiting for your friend…"、Start Match は無効表示)、' +
      '相手側には相手が準備完了であること ("Friend is ready!") を表示する。両者が押すと "Starting match…" (同期) → VS 画面 → ゲーム本体のカウントダウン。' +
      '図01 では先に押した側は "Starting match…" で相手を待つが、モックでは決定に合わせて "Waiting for your friend…" にした (表記差分)。表示の細部は U36、片方だけ押した状態での切断・放置は U33、キャンセル・退出は U34、離席は U35。',
    decided: { by: '高宮さん', date: '2026-10-03' } },
  { id: 'U32', title: 'ゲーム本体のカウントダウン中に相手が切断したとき',
    desc: 'VS 画面中の切断 (U3) と対戦中の切断 (U28) の間にある、ゲーム画面のカウントダウン (約 3.4 秒) 中に相手が切断した場合の扱いと画面は決まっていない。モックには遷移行が無い。' +
      '対戦中の切断は U28 で決まった (20 秒待って切断した側の負け、両者なら No contest) が、カウントダウン中にも当てはめるかは決まっていない。' },
  { id: 'U33', title: '片方だけ Start Match を押した状態で、相手が切断した / いつまでも押さないとき',
    desc: 'U31 の決定で、片方が押すと相手が押すまで待つ。その間に相手が切断した場合や、相手がいつまでも押さない場合の扱い (タイムアウトするか、キャンセルになるか、押した側が押したことを取り消せるか) は決まっていない。' +
      'モックには遷移行が無い (片方が押したあとは「通信が不安定になる」などの環境イベントを出せず、押した側の Start Match は無効表示のまま)。' },
  { id: 'U34', title: '片方が Start Match を押したあとの Cancel Match / Leave Match',
    desc: '片方が押して相手を待っている間に、ホストが Cancel Match、またはクライアントが Leave Match を押したときの扱いは図に無い。押した側が自分でキャンセル・退出する場合と、準備完了の相手を残してキャンセル・退出する場合がある。' +
      'モックでは Ready からのキャンセル (図04: クライアントに "cancelled the match.") ・退出 (図05: ホストに "left the match." → 待機に戻る) と同じ結果を仮に置いている。相手に何を伝えるかは未定。' },
  { id: 'U35', title: '片方が Start Match を押したあとに別画面へ移る (‹) とき',
    desc: '押した側、または準備完了の相手を待たせている側が ‹ で別画面へ移ったときの扱いは図に無い。マッチを維持してトーストを出すのか (図02 / 図07 のように)、押したことが取り消されるのかが未定。' +
      'クライアントが押したあとにホストが離れた場合の "Ready to start" トーストの扱いも未定。モックには遷移行が無い (‹ は押せない)。' },
  { id: 'U36', title: '片方が Start Match を押したあとの表示の細部',
    desc: 'U31 で決まったのは「押した側は待機表示、相手側には相手が準備完了であることを表示」まで。モックの文言 (押した側の "Waiting for your friend…"、相手側の名前の下の "Friend is ready!")、' +
      '押した側の Start Match を無効表示にするか隠すか、ホスト・クライアントで同じ表示にするかは仮。' },
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
      '待っている間も試合 (残った側のプレイ) が続くのか止まるのか、待ち時間を画面に出すかも未定。モックでは待っている間は Win / Lose / Draw を押せない。' },
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
];
