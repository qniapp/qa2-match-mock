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

// 対戦後の結果画面: 勝ち負け × 再戦の段階 (なし / 自分が申し込んで待機中 / 相手から申し込まれた)
var OUTCOMES = ['Win', 'Lose'];
var RESULT_PHASES = { '': null, '.RematchWaiting': 'wait', '.RematchRequested': 'asked' };
function resultState(role, outcome, phase) { return role + '.' + outcome + 'Result' + (phase || ''); }
var hostResultAny = [];
var clientResultAny = [];
OUTCOMES.forEach(function (o) {
  Object.keys(RESULT_PHASES).forEach(function (ph) {
    hostResultAny.push(resultState('Host', o, ph));
    clientResultAny.push(resultState('Client', o, ph));
  });
});
// 降参で決まった結果 (決定 U38 / U41): 勝った側は "Your opponent surrendered" (Back to Friend Match は通常の結果画面と同じ)、
// 降参した側は負けの結果画面から Online Battle へ戻る。どちらも再戦は無い
hostResultAny.push(resultState('Host', 'Win', '.OpponentSurrendered'));
clientResultAny.push(resultState('Client', 'Win', '.OpponentSurrendered'));

// 試合が続いている状態 (決定 U37: MATCH MENU や降参の確認を開いていても試合は止まらない)
var hostInPlay = ['Host.Game.Play', 'Host.Game.MatchMenu', 'Host.Game.SurrenderConfirm'];
var clientInPlay = ['Client.Game.Play', 'Client.Game.MatchMenu', 'Client.Game.SurrenderConfirm'];

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
  'Host.Game.InPlay': hostInPlay,
  'Client.Game.InPlay': clientInPlay,
};

// ゲーム本体の開始カウントダウン (VsAI の CountdownTimer と同じ): 1 秒待ってから 3 → 2 → 1 を 0.8 秒ずつ
var GAME_COUNTDOWN = { delay: 1000, digit: 800, digits: [3, 2, 1] };
var GAME_COUNTDOWN_MS = GAME_COUNTDOWN.delay + GAME_COUNTDOWN.digit * GAME_COUNTDOWN.digits.length;

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
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, note: '合意: マッチ成立時に VS 画面を挟む' });
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
  T({ from: { host: 'Host.Matchmake', client: 'Client.Matchmake' }, event: 'sys.opponentFound', auto: 2500,
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, note: '決定 (U13a): 相手が見つかり次第 VS 画面へ。Ready / Start Match は無い (U31 は Friend Match だけ)', decided: ['U13a'] });
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
      note: 'モック操作。決定 (U13): アプリを離れると検索を止め、戻ると "Search stopped because you left the app." を出す。出す場所 (Online Battle の上) とボタンは仮', decided: ['U13'], undecided: ['U43'] });
    T({ from: row(R + '.Matchmake'), event: d + '.searchTimeout', to: row(R + '.Matchmake.NotFound'),
      note: 'モック操作。決定 (U13): 見つからなければ元の画面 (Online Battle) に "No opponent found." と Search again / Close。60 秒という長さは仮', decided: ['U13'] });
    T({ from: row(R + '.Matchmake.NotFound'), event: d + '.searchAgain', to: row(R + '.Matchmake'),
      note: '決定 (U13): Search again でもう一度相手を探す', decided: ['U13'] });
    T({ from: row(R + '.Matchmake.NotFound'), event: d + '.closeNotice', to: row(R + '.MultiModeSelection'),
      note: '決定 (U13): Close で通知を閉じ、Online Battle のまま', decided: ['U13'] });
    T({ from: row(R + '.Matchmake.Stopped'), event: d + '.searchAgain', to: row(R + '.Matchmake'),
      note: '仮: "No opponent found." と同じく Search again でもう一度相手を探す', decided: ['U13'], undecided: ['U43'] });
    T({ from: row(R + '.Matchmake.Stopped'), event: d + '.closeNotice', to: row(R + '.MultiModeSelection'),
      note: '仮: "No opponent found." と同じく Close で通知を閉じ、Online Battle のまま', decided: ['U13'], undecided: ['U43'] });
  });

  // === 対戦後 (図なし、すべて未決) ===
  // Win / Lose は端末の下のモック操作。勝敗判定そのものはモックの対象外
  var opposite = { Win: 'Lose', Lose: 'Win' };
  [['host.win', 'Win'], ['host.lose', 'Lose'], ['client.win', 'Lose'], ['client.lose', 'Win']].forEach(function (p) {
    T({ from: { host: hostInPlay, client: clientInPlay }, event: p[0],
      to: { host: resultState('Host', p[1]), client: resultState('Client', opposite[p[1]]) },
      note: 'モック操作: 押した側が' + (/win$/.test(p[0]) ? '勝ち' : '負け') + '、相手は自動で逆の結果。対戦後の画面は図に無い。' +
        'MATCH MENU や降参の確認を開いていても試合は続いているので、そのまま結果画面へ (決定 U37)', undecided: ['U28'], decided: ['U37'] });
  });
  OUTCOMES.forEach(function (o) {
    var h = resultState('Host', o);
    var c = resultState('Client', opposite[o]);
    T({ from: { host: h, client: c }, event: 'host.rematch', to: { host: h + '.RematchWaiting', client: c + '.RematchRequested' },
      note: '仮: 押した側は相手を待ち、相手には再戦の希望を表示', undecided: ['U23'] });
    T({ from: { host: h, client: c }, event: 'client.rematch', to: { host: h + '.RematchRequested', client: c + '.RematchWaiting' },
      note: '仮: 押した側は相手を待ち、相手には再戦の希望を表示', undecided: ['U23'] });
    T({ from: { host: h + '.RematchRequested', client: c + '.RematchWaiting' }, event: 'host.rematch', to: { host: 'Host.Opponent', client: 'Client.Opponent' },
      note: '仮: 両者が押したら VS 画面からやり直す。同じ Match Code を使うかは未決', undecided: ['U23'] });
    T({ from: { host: h + '.RematchWaiting', client: c + '.RematchRequested' }, event: 'client.rematch', to: { host: 'Host.Opponent', client: 'Client.Opponent' },
      note: '仮: 両者が押したら VS 画面からやり直す。同じ Match Code を使うかは未決', undecided: ['U23'] });
  });
  T({ from: { host: hostResultAny, client: clientResultAny }, event: 'host.backToFriendMatch', to: { host: 'Host.FriendMatch.Room', client: '=' },
    note: '仮: 押した側だけ Friend Match トップへ。相手は結果画面のまま', undecided: ['U24', 'U25'] });
  T({ from: { host: hostResultAny, client: '*' }, event: 'host.backToFriendMatch', to: { host: 'Host.FriendMatch.Room', client: '*' },
    note: '仮: 相手はすでに結果画面を抜けている', undecided: ['U24'] });
  T({ from: { host: hostResultAny, client: clientResultAny }, event: 'client.backToFriendMatch', to: { host: '=', client: 'Client.FriendMatch.Room' },
    note: '仮: 押した側だけ Friend Match トップへ。相手は結果画面のまま', undecided: ['U24', 'U25'] });
  T({ from: { host: '*', client: clientResultAny }, event: 'client.backToFriendMatch', to: { host: '*', client: 'Client.FriendMatch.Room' },
    note: '仮: 相手はすでに結果画面を抜けている', undecided: ['U24'] });
  // 降参した側の負けの結果画面 (決定 U41): Online Battle (Host.MultiModeSelection / Client.MultiModeSelection) へ戻る。相手は結果画面のまま
  T({ from: { host: resultState('Host', 'Lose', '.Surrendered'), client: '*' }, event: 'host.backToOnlineBattle', to: { host: 'Host.MultiModeSelection', client: '*' },
    note: '決定 (U41): 降参して負けたあとは Online Battle へ。ボタンの文言は仮 (U22)', decided: ['U41'], undecided: ['U22'] });
  T({ from: { host: '*', client: resultState('Client', 'Lose', '.Surrendered') }, event: 'client.backToOnlineBattle', to: { host: '*', client: 'Client.MultiModeSelection' },
    note: '決定 (U41): 降参して負けたあとは Online Battle へ。ボタンの文言は仮 (U22)', decided: ['U41'], undecided: ['U22'] });

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
  'host.backToOnlineBattle': 'ホスト: Back to Online Battle を押す (降参後)',
  'host.win': 'ホスト: Win を押す (モック操作)',
  'host.lose': 'ホスト: Lose を押す (モック操作)',
  'host.rematch': 'ホスト: Rematch を押す (仮)',
  'host.backToFriendMatch': 'ホスト: Back to Friend Match を押す (仮)',
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
  'client.backToOnlineBattle': 'クライアント: Back to Online Battle を押す (降参後)',
  'client.win': 'クライアント: Win を押す (モック操作)',
  'client.lose': 'クライアント: Lose を押す (モック操作)',
  'client.rematch': 'クライアント: Rematch を押す (仮)',
  'client.backToFriendMatch': 'クライアント: Back to Friend Match を押す (仮)',
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
// 降参で決まった結果画面の一行 (決定 U38)
var SURRENDER_STATUS = { self: 'You surrendered', opponent: 'Your opponent surrendered' };
// ランダム対戦で相手を探すのをやめたときの通知 (決定 U13)。60 秒という長さは端末の画面には出さない
var SEARCH_NOTICES = { stopped: 'Search stopped because you left the app.', notFound: 'No opponent found.' };

// 右パネルに出す、その状態の画面の説明 (端末の画面の中には出さない)
var GAME_COUNTDOWN_CONTEXT = 'ゲーム本体のカウントダウン（VsAI と同じ 3→2→1）。終わるとメニューボタン (☰) が出てプレイ開始。';
var GAME_CONTEXT = 'プレイ中のゲーム画面 (プレースホルダー)。右上のメニューボタン (☰) で MATCH MENU を開く (U37)。勝敗は端末の下のモック操作 Win / Lose。';
// 結果画面の仮の点。端末の画面には出さず (未決は端末の上の帯)、右パネルの説明に出す
var RESULT_CONTEXT = '結果画面 (図なしの仮の画面、U20)。Rank の変化と Score はどちらも仮の表示で、Score の ---- は値が決まっていないため (U21)。Rematch の扱いは U23、Back to Friend Match の戻り先は U24。';
var RESULT_WAIT_CONTEXT = [RESULT_CONTEXT, '自分が申し込んで待っている間の Rematch (取り消し) は U30 で、行が無く押せない。'];
var MATCHMAKE_CONTEXT = 'ランダム対戦で相手を探している画面 (決定 U13a / U13)。相手が見つかり次第 VS 画面へ進む (Start Match は無い)。' +
  'Cancel と ‹ はどちらも確認なしで Online Battle へ戻る (U13)。探している間は、ほかの画面へは行けない。' +
  'アプリを離れる (バックグラウンド・画面ロック) と検索を止める。60 秒探しても見つからなければ Online Battle に "No opponent found." を出す (60 秒という長さは仮)。' +
  'どちらも端末の下のモック操作で試せる。';
var SEARCH_STOPPED_CONTEXT = 'アプリを離れた (バックグラウンド・画面ロック) ので検索を止めた (決定 U13)。戻ると "Search stopped because you left the app." を出す。' +
  '出す場所 (Online Battle の上) と Search again / Close のボタンは、"No opponent found." にそろえたモックの仮 (U43)。';
var SEARCH_NOT_FOUND_CONTEXT = '60 秒探しても相手が見つからなかった (決定 U13、60 秒という長さは仮)。元の画面 (Online Battle) に "No opponent found." を出す。' +
  'Search again でもう一度相手を探し (Searching に戻る)、Close で通知を閉じて Online Battle のまま。';
var MATCH_MENU_CONTEXT = 'MATCH MENU (決定 U37)。試合は止まらない: Time.timeScale = 0 にせず、暗幕も薄くしてゲームが見えたまま。メニュー中に試合が終われば (Win / Lose) そのまま結果画面へ。' +
  '開いただけでは相手の端末には何も出ない (U38)。対戦中に REMATCH / RETRY は無い (U39、再戦は結果画面だけ)。BGM も下げない (U42、モックには音が無い)。';
var SURRENDER_CONFIRM_CONTEXT = '降参の確認 (決定 U40)。確認中も試合は続く。CONTINUE でプレイに戻り、SURRENDER で負けが決まって相手は勝ちの結果画面に "Your opponent surrendered" (U38)。ボタンは QUIT ではなく SURRENDER (U41)。';
var SURRENDERED_LOSE_CONTEXT = '降参した側の負けの結果画面 (決定 U38)。Back to Online Battle で Online Battle へ戻る (決定 U41、文言は仮 U22)。降参のあとに再戦は無い。Rank の変化と Score は仮の表示 (U21)。';
var SURRENDERED_WIN_CONTEXT = '相手が降参したので勝ち。"Your opponent surrendered" を出す (決定 U38)。相手はもう抜けているので再戦は無い。Rank の変化と Score は仮の表示 (U21)、Back to Friend Match の戻り先は U24。';

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
  // 相手を探すのをやめたときの通知 (決定 U13)。元の画面 (Online Battle) の上に出す
  function searchNotice(text, extra) {
    return Object.assign(online(), { notice: { text: text, buttons: [
      { label: 'Search again', event: 'searchAgain', primary: true }, { label: 'Close', event: 'closeNotice' }] }, decided: ['U13'] }, extra);
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
  S['Host.Matchmake.Stopped'] = searchNotice(SEARCH_NOTICES.stopped, { undecided: ['U43'], context: SEARCH_STOPPED_CONTEXT });
  S['Host.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Host.Opponent'] = { view: 'vs', undecided: [] };
  // ゲーム画面: カウントダウン中 (メニューボタンなし・Win / Lose は押せない) → プレイ中 ⇄ MATCH MENU → 降参の確認
  S['Host.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2'], undecided: ['U32'], context: GAME_COUNTDOWN_CONTEXT };
  S['Host.Game.Play'] = { view: 'game', context: GAME_CONTEXT };
  S['Host.Game.MatchMenu'] = matchMenu();
  S['Host.Game.SurrenderConfirm'] = surrenderConfirm();

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
  S['Client.Matchmake.Stopped'] = searchNotice(SEARCH_NOTICES.stopped, { undecided: ['U43'], context: SEARCH_STOPPED_CONTEXT });
  S['Client.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Client.Opponent'] = { view: 'vs' };
  S['Client.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2'], undecided: ['U32'], context: GAME_COUNTDOWN_CONTEXT };
  S['Client.Game.Play'] = { view: 'game', context: GAME_CONTEXT };
  S['Client.Game.MatchMenu'] = matchMenu();
  S['Client.Game.SurrenderConfirm'] = surrenderConfirm();

  // --- 対戦後 (両端末共通。図なし) ---
  ['Host', 'Client'].forEach(function (role) {
    OUTCOMES.forEach(function (o) {
      Object.keys(RESULT_PHASES).forEach(function (ph) {
        var wait = RESULT_PHASES[ph] === 'wait';
        S[resultState(role, o, ph)] = { view: 'result', title: 'RESULT', back: null, outcome: o.toUpperCase(), rematch: RESULT_PHASES[ph],
          undecided: ['U20', 'U21', 'U22', 'U23', 'U24', 'U26', 'U27'].concat(wait ? ['U30'] : []),
          context: wait ? RESULT_WAIT_CONTEXT : RESULT_CONTEXT };
      });
    });
    // 降参で決まった結果 (決定 U38 / U41)。再戦のボタンは出さない
    S[resultState(role, 'Lose', '.Surrendered')] = { view: 'result', title: 'RESULT', back: null, outcome: 'LOSE', surrender: 'self',
      buttons: [{ label: 'Back to Online Battle', event: 'backToOnlineBattle', primary: true }],
      decided: ['U38', 'U41'], undecided: ['U20', 'U21', 'U22'], context: SURRENDERED_LOSE_CONTEXT };
    S[resultState(role, 'Win', '.OpponentSurrendered')] = { view: 'result', title: 'RESULT', back: null, outcome: 'WIN', surrender: 'opponent',
      buttons: [{ label: 'Back to Friend Match', event: 'backToFriendMatch' }],
      decided: ['U38'], undecided: ['U20', 'U21', 'U22', 'U24', 'U25'], context: SURRENDERED_WIN_CONTEXT };
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
      'アプリを離れる (バックグラウンドへ移る・画面ロック) と検索を止め、戻ったときに "Search stopped because you left the app." (アプリを離れたので検索を止めました) を出す。' +
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
  { id: 'U20', title: '対戦後の画面の内容',
    desc: 'ogwssk さんの図は「カウントダウン & ゲーム開始」で終わり、対戦後の画面は無い。モックは QA² の既存の 1 人用リザルト画面 ("RESULT" の見出しと大きな "WIN!" / "LOSE") にならった仮の画面。WIN! / LOSE の見せ方、スコアや対戦の詳細を出すかは未定。' },
  { id: 'U21', title: 'ランク変動の表示と計算',
    desc: 'issue の当初のチェックリストにある「ランクアップ　ランクダウン」。モックの "Rank 12 → 13" (勝つと +1、負けると変わらない) は仮の値。Friend Match でランクが変わるのか、負けたら下がるのか、ランクアップ・ランクダウンの見せ方も未定。' },
  { id: 'U22', title: '対戦後のボタン構成と文言',
    desc: '"Rematch" / "Back to Friend Match" は仮。ゲームの UI キットには "REMATCH" ボタンがある。ほかのボタン (Online Battle へ戻るなど) が要るか、文言や大文字・小文字も未定。' },
  { id: 'U23', title: '再戦の有無と進め方',
    desc: '再戦できるか、両者の同意が必要か、VS 画面を挟むか、同じ Match Code (同じマッチ) を使うか。モックは中立な仮の流れとして、押した側に "Waiting for your friend…"、相手に "Your friend wants a rematch" を出し、両者が押したら VS 画面からやり直す。' +
      'U31 の決定 (両者が Start Match を押したら開始) は初回の開始についてのもので、再戦でもロビーに戻って両者の Start Match を挟むのか、両者の Rematch だけで開始するのかは決まっていない。' },
  { id: 'U24', title: '対戦後の戻り先',
    desc: 'モックでは "Back to Friend Match" で Friend Match トップ (Match Code 入力欄は空) に戻る。Online Battle や、同じマッチのロビーに戻る案もありうる。' },
  { id: 'U25', title: '結果画面で相手が先に抜けた・切断したときの表示',
    desc: 'モックでは相手が "Back to Friend Match" で抜けても、自分の結果画面は変わらない (再戦待ちの "Waiting for your friend…" や "Your friend wants a rematch" もそのまま残る)。相手が抜けた・切断したことをどう伝えるかは未定。' },
  { id: 'U26', title: '結果画面から自動で次へ進むか',
    desc: 'タイムアウトで自動的に次の画面へ進むのか、ボタンを押すまで結果画面に留まるのか。両者の操作が必要か。モックには自動遷移が無い。' },
  { id: 'U27', title: '結果画面であいさつ絵文字を送れるか',
    desc: 'issue の「あいさつ＋絵文字」はモックでは VS 画面に表示している。対戦後にもあいさつや絵文字を送れるか。' },
  { id: 'U28', title: '勝敗が決まらない場合 (引き分け・対戦中の切断)',
    desc: '端末の下の Win / Lose ボタンはモック操作で、勝敗の判定そのものと、両端末に同じ結果を出す同期は対象外。引き分け、対戦中の切断のときの扱いと画面は未定。' +
      'オンライン対戦の降参 (MATCH MENU の SURRENDER) は U38 / U40 / U41 で決定済み。' },
  { id: 'U29', title: 'ランダム対戦の対戦後',
    desc: 'ランダム対戦 (U13) の対戦後も Friend Match と同じ結果画面か。モックでは同じ画面になり、"Back to Friend Match" も出てしまう。再戦や戻り先 (Random Match の待機に戻るなど) が違うかは未定。' },
  { id: 'U30', title: '再戦の申し込みの取り消し・応答待ちのタイムアウト',
    desc: 'モックでは Rematch を押したあと取り消せない (待機中の Rematch は押せない)。相手が応じないときのタイムアウトや、申し込まれた側が断る手段も未定。' },
  { id: 'U31', title: 'Friend Match の開始は両者が Start Match を押してから',
    desc: 'U2 から分けた残りの論点。Friend Match では、両者が Start Match を押したら開始する (Ready 後の自動開始はしない)。ランダム対戦には Start Match が無く、相手が見つかり次第 VS 画面へ進む (U13a)。片方が押すと、押した側は待機表示 ("Waiting for your friend…"、Start Match は無効表示)、' +
      '相手側には相手が準備完了であること ("Friend is ready!") を表示する。両者が押すと "Starting match…" (同期) → VS 画面 → ゲーム本体のカウントダウン。' +
      '図01 では先に押した側は "Starting match…" で相手を待つが、モックでは決定に合わせて "Waiting for your friend…" にした (表記差分)。表示の細部は U36、片方だけ押した状態での切断・放置は U33、キャンセル・退出は U34、離席は U35。',
    decided: { by: '高宮さん', date: '2026-10-03' } },
  { id: 'U32', title: 'ゲーム本体のカウントダウン中に相手が切断したとき',
    desc: 'VS 画面中の切断 (U3) と対戦中の切断 (U28) の間にある、ゲーム画面のカウントダウン (約 3.4 秒) 中に相手が切断した場合の扱いと画面は決まっていない。モックには遷移行が無い。' },
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
      'モックでは負けの結果画面の "Back to Online Battle" で戻る (ボタンの文言は U22 で仮)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U42', title: 'MATCH MENU 中も BGM を下げない',
    desc: '実ゲームのポーズは BGM を -5dB 下げる (ダッキング) が、オンライン対戦の MATCH MENU では試合が続くので BGM を下げない。モックには音が無いので、決定の記録だけ。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U43', title: 'アプリを離れて検索が止まったときの通知の場所とボタン',
    desc: 'U13 の決定で、相手を探している間にアプリを離れると検索を止め、戻ったときに "Search stopped because you left the app." を出す。' +
      'どの画面の上に出すか、どんなボタンを置くかは決定に書かれていない。モックでは "No opponent found." (U13) とそろえて、Online Battle の上に Search again / Close を出している。' +
      'Close (や OK) だけにする、"Searching for an opponent…" の画面の上に出す、などの案もありうる。' },
];
