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
// ホストが ‹ で部屋の画面を離れても部屋は残り、行った先の画面の下の帯で部屋の様子を示す (決定 U14、2026-10-07)。
//   Waiting       友だちがいない ("Waiting for your friend…"、青)
//   FriendJoined  友だちが入った ("Friend joined!"、緑。本当に入った・入り直したときだけ、U17)
//   FriendInRoom  友だちはいるが Ready していない (青の "Friend is in the room"、U55)
//   FriendReady   友だちが Ready を押した ("Friend is ready!"、赤、U1)
//   Reconnecting  友だちの再接続を待っている ("Reconnecting…"、青。20 秒たつと Waiting、U19)
//   FriendLeft    友だちが抜けた ("Your friend left." を一度だけ 5 秒 (仮) 出して Waiting に戻る、U17 / U55)
// どの帯もタップすると部屋の画面に戻るだけで、Ready は押さない (U1 / U16)。期限切れ (Expired) は濃い赤の "Match code expired."
var AWAY_PLACES = ['FriendMatchRoom', 'StageSelection']; // ホストが Friend Match トップ / ステージ選択にいる
var AWAY_STATUSES = ['Waiting', 'FriendJoined', 'FriendInRoom', 'FriendReady', 'Reconnecting', 'FriendLeft'];
function away(place, status) { return 'Host.Away.' + place + '.' + status; }
function awayStates(place, statuses) { return statuses.map(function (s) { return away(place, s); }); }

var hostAwayPending = []; // 部屋がまだ有効なホスト離席状態
AWAY_PLACES.forEach(function (p) { hostAwayPending = hostAwayPending.concat(awayStates(p, AWAY_STATUSES)); });
var hostAwayWithFriend = []; // 離席中のホストの部屋に友だちがいる
AWAY_PLACES.forEach(function (p) { hostAwayWithFriend = hostAwayWithFriend.concat(awayStates(p, ['FriendJoined', 'FriendInRoom', 'FriendReady', 'Reconnecting'])); });

// Ready 画面 (決定 U31〜U36): 両者が部屋にそろい、同期が終わってから試合が始まるまで。カード 1 枚ずつに "✓ Ready" / "Not ready"
//   .Ready                     どちらも Ready していない
//   .Ready.TimedOut など        どちらも Ready していない + お知らせ (タイムアウト U33 / 相手が取り消した U34 / 読み込みが 20 秒で終わらない U32 / 同期の失敗 U15)
//   .Ready.Confirming          自分が Ready を押して送っている ("Confirming…")
//   .Ready.WaitingForOpponent  自分だけ Ready ("Waiting for opponent…"、60 秒のカウントダウン、Cancel Ready)
//   .Ready.OpponentReady       相手だけ Ready ("Opponent is ready. Are you?")。.Confirming は自分も押して送っている
function lobbyState(R, s) { return R + '.FriendMatch.Lobby.' + s; }
var READY_NOTICES = ['TimedOut', 'OpponentNotReady', 'StartFailed', 'SyncFailed'];
function noneReady(R) { return [lobbyState(R, 'Ready')].concat(READY_NOTICES.map(function (n) { return lobbyState(R, 'Ready.' + n); })); }
function readyScreen(R) {
  return noneReady(R).concat(['Ready.Confirming', 'Ready.WaitingForOpponent', 'Ready.OpponentReady', 'Ready.OpponentReady.Confirming'].map(function (s) { return lobbyState(R, s); }));
}
// 部屋で両者がそろっている間 (Ready 画面と読み込みの "Starting match…")。ここでの切断は U5 (VS 画面・カウントダウン中の切断は U32)
function preStart(R) { return readyScreen(R).concat([lobbyState(R, 'Starting')]); }
// 送っている間 (.Confirming) は退出・‹ を押せない (決定 U53)
function readyIdle(R) { return readyScreen(R).filter(function (s) { return !/Confirming$/.test(s); }); }
// 相手の再接続を待っている (U5: 部屋の中、U32: VS 画面・カウントダウン中から戻った) / 自分が再接続している
function friendGone(R) { return [lobbyState(R, 'FriendDisconnected'), lobbyState(R, 'OpponentDisconnected')]; }
function selfGone(R) { return [lobbyState(R, 'ConnectionLost'), lobbyState(R, 'Reconnecting')]; }
// 試合が始まる前の VS 画面とゲーム本体のカウントダウン (ここでの切断は U32 / U54)
function beforeStart(R) { return [R + '.Opponent', R + '.Game.Countdown']; }
var hostReadyScreen = readyScreen('Host');
var clientReadyScreen = readyScreen('Client');

// 同じ Match Code で次の友だちを待っている (決定 U32 / U34): 最初の待機、友だちが抜けた、友だちが戻らなかった
var hostWaitingForFriend = ['Host.FriendMatch.Lobby.Waiting', 'Host.FriendMatch.Lobby.ClientLeft', 'Host.FriendMatch.Lobby.MatchCancelled'];
// Close Room (決定 U14) と ‹ (部屋を残して離れる、U14) を押せるホストの部屋の画面
var hostClosable = hostWaitingForFriend.concat(['Host.FriendMatch.Lobby.FriendJoined'], readyIdle('Host'), friendGone('Host'));
// 部屋にクライアントがいる (クライアントが抜けるとホストは "Your friend left…"、U34)。再接続中のホストも含む (戻ったときに見る)
var hostWithClient = ['Host.FriendMatch.Lobby.FriendJoined'].concat(preStart('Host'), friendGone('Host'), selfGone('Host'));
// 部屋にいるクライアント (ホストが閉じると "Room closed. The host left."、U34)。再接続中のクライアントも含む
var clientInRoom = ['Client.FriendMatch.Lobby.Connecting'].concat(preStart('Client'), friendGone('Client'), selfGone('Client'));
// Leave Room と ‹ で確認を出せるクライアントの部屋の画面 (決定 U9)
var clientLeavable = ['Client.FriendMatch.Lobby.Connecting'].concat(readyIdle('Client'), friendGone('Client'), ['Client.FriendMatch.Lobby.CouldNotReconnect']);
// Match Code の期限が切れうる部屋の画面 (決定 U7)。読み込み・VS 画面・カウントダウン・U32 の再接続待ちの間は期限の時計が止まる
var hostExpirable = ['Host.FriendMatch.Lobby.FriendJoined'].concat(hostReadyScreen);
var clientExpirable = ['Client.FriendMatch.Lobby.Connecting'].concat(clientReadyScreen);
// 部屋のお知らせ付きの Friend Match トップ (決定 U32 / U34 / U52 / U54)。画面の上の帯で、閉じるのは Close だけ (Match Code を入れても消えない、U52)。
//   HostLeft          ホストが部屋を閉じた / HostDisconnected  VS 画面・カウントダウン中に切断したホストが戻らなかった (U32)
//   RoomClosed        部屋で切断したホストが戻らなかった (U5 / U52) / ReconnectFailed  開始前に切断して戻れなかった側 (U52 / U54)
//   MatchCancelled    Friend Match の再戦の開始前に相手が戻らなかった (U54)
// クライアントは .CodeEntered で Match Code を入れたあと (お知らせはそのまま)。ホストに出るのは ReconnectFailed と MatchCancelled だけ
var ROOM_NOTICE_KEYS = ['HostLeft', 'HostDisconnected', 'RoomClosed', 'ReconnectFailed', 'MatchCancelled'];
var HOST_ROOM_NOTICE_KEYS = ['ReconnectFailed', 'MatchCancelled'];
var clientNoticeTop = ROOM_NOTICE_KEYS.map(function (k) { return 'Client.FriendMatch.Room.' + k; });
var clientNoticeTopFilled = clientNoticeTop.map(function (s) { return s + '.CodeEntered'; });
var hostNoticeTop = HOST_ROOM_NOTICE_KEYS.map(function (k) { return 'Host.FriendMatch.Room.' + k; });
var clientRoomEmpty = ['Client.FriendMatch.Room'].concat(clientNoticeTop);
var clientRoomFilled = ['Client.FriendMatch.Room.CodeEntered'].concat(clientNoticeTopFilled, ['Client.FriendMatch.Room.Error.NotFound',
  'Client.FriendMatch.Room.Error.Expired', 'Client.FriendMatch.Room.Error.Full', 'Client.FriendMatch.Room.ConnectionFailed']);
var clientRoomAny = clientRoomEmpty.concat(clientRoomFilled);
// ホストの Friend Match トップ (Create Match と ‹ を押せる)
var hostTop = ['Host.FriendMatch.Room', 'Host.FriendMatch.Room.ConnectionFailed'].concat(hostNoticeTop);
var hostExpiredAny = ['Host.FriendMatch.Lobby.CodeExpired', 'Host.Away.FriendMatchRoom.Expired', 'Host.Away.StageSelection.Expired'];

// 対戦後の結果画面 (決定 U20〜U30、高宮さん 2026-10-07): 勝敗 (Win / Lose / Draw) × 再戦の段階。
// Friend Match かランダム対戦か、レートが変わる対戦かは状態名ではなくセッション (SESSION_FIELDS の match / rated) で持つ
var OUTCOMES = ['Win', 'Lose', 'Draw'];
var OPPOSITE = { Win: 'Lose', Lose: 'Win', Draw: 'Draw' };
// 再戦の申し込みが終わったあとの一行 (決定 U30 / U50)。両者に出し、次の操作 (どちらかがまた申し込む・結果画面を抜ける) まで残る:
//   Cancelled (申し込まれた側) / CancelledByYou (取り消した側)、Declined (申し込んだ側) / DeclinedByYou (断った側)、
//   Expired (申し込んだ側) / ExpiredIncoming (申し込まれた側)。.Cooldown が付いている 3 秒 (仮) の間は Rematch を押せない
var REMATCH_ENDINGS = ['Cancelled', 'CancelledByYou', 'Declined', 'DeclinedByYou', 'Expired', 'ExpiredIncoming'];
var REMATCH_ENDING_PAIRS = { Cancelled: 'CancelledByYou', CancelledByYou: 'Cancelled', Declined: 'DeclinedByYou', DeclinedByYou: 'Declined',
  Expired: 'ExpiredIncoming', ExpiredIncoming: 'Expired' };
var ENDED_PHASES = REMATCH_ENDINGS.map(function (e) { return '.Rematch' + e; });
var COOLDOWN_PHASES = ENDED_PHASES.map(function (p) { return p + '.Cooldown'; });
// 再戦を申し込める段階: なし と、申し込みが終わって 3 秒たったあと (一行は残っている)
var IDLE_PHASES = [''].concat(ENDED_PHASES);
// 再戦の段階: 申し込める / 自分が申し込んだ / 相手から申し込まれた / 3 秒待ち。ほかに相手が抜けた (.OpponentLeft)
var REMATCH_PHASES = ['', '.RematchRequested', '.RematchIncoming'].concat(ENDED_PHASES, COOLDOWN_PHASES);
var RESULT_PHASES = REMATCH_PHASES.concat(['.OpponentLeft']);
function resultState(role, outcome, phase) { return role + '.' + outcome + 'Result' + (phase || ''); }
function resultStates(role, outcome, phases) { return phases.map(function (ph) { return resultState(role, outcome, ph); }); }
// 勝敗が決まった理由が降参・切断のもの (決定 U38 / U41 / U28) と、勝敗のない No contest (U28)。どれも再戦は無い (U45)
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
// 同じ相手と対戦している間 (VS 画面・ゲーム画面・結果画面)。スタンプのミュートはこの間だけ続く (決定 U49、再戦を含む)
function isWithOpponent(name) { return isResultState(name) || /^(Host|Client)\.(Opponent(\.|$)|Game\.)/.test(name); }
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
// 対戦中の切断 (決定 U28 / U46): 切断した側は再接続を試み、相手は 20 秒 (仮) 待つ。その間サーバーは両者のゲームと得点を止める
var hostInGame = hostInPlay.concat(['Host.Game.Disconnected', 'Host.Game.OpponentDisconnected']);
var clientInGame = clientInPlay.concat(['Client.Game.Disconnected', 'Client.Game.OpponentDisconnected']);
// ランダム対戦で相手を探している状態: Random Match から (U13a) と、結果画面の Find Next Opponent から (U29)
var hostSearching = ['Host.Matchmake', 'Host.Matchmake.NextOpponent'];
var clientSearching = ['Client.Matchmake', 'Client.Matchmake.NextOpponent'];
// Online Battle の中の通知 (Search again / Close、モーダルではない): 検索が止まった (U43 / U47)、開始前に相手が戻らなかった・自分が戻れなかった (U54)
var INLINE_SEARCH_NOTICES = ['Stopped', 'MatchCancelled', 'ReconnectFailed'];

// 端末ごとの付属状態。keeps(状態名) が偽の画面へ移ると初期値に戻る
//   Dialog: 確認ダイアログ (画面が変わると閉じる)
//   Stamp:  自分が送ったスタンプ (U27)。'gg' などは表示中 (3 秒、仮)、'sent' は消えたが次を送れるまでの待ち (送ってから 5 秒、仮)
//   Mute:   相手のスタンプを出さない (U27)。同じ相手と続けて対戦している間 (再戦を含む) だけ続く (決定 U49)
//   Failed: 部屋を残したまま作り直そうとして、サーバーに届かなかった (U6 / U12)。'create' のとき "Connection failed" のトーストを帯の代わりに出す。
//           タップか、画面が変わると消える
var DEVICE_FIELDS = {
  Dialog: { initial: null, keeps: function () { return false; } },
  Stamp: { initial: null, keeps: isResultState },
  Mute: { initial: false, keeps: isWithOpponent },
  Failed: { initial: null, keeps: function () { return false; } },
};
// 対戦のセッション (両端末で共通): match = 'friend' | 'random'、rated = レートが変わる対戦か (ランダム対戦の最初の 1 戦だけ、U21)、
// rematch = 結果画面の Rematch で始まった対戦か (開始前の切断の扱いが変わる、U32 / U54)
var SESSION_FIELDS = { match: null, rated: false, rematch: false };

// 遷移表の表示で、配列の代わりにグループ名を出すための一覧
var STATE_GROUPS = {
  'Host.Away.Pending': hostAwayPending,
  'Host.Away.WithFriend': hostAwayWithFriend,
  'Host.FriendMatch.Lobby.Closable': hostClosable,
  'Host.FriendMatch.Lobby.WithClient': hostWithClient,
  'Host.FriendMatch.Lobby.Expirable': hostExpirable,
  'Host.Expired.Any': hostExpiredAny,
  'Host.FriendMatch.Lobby.WaitingForFriend': hostWaitingForFriend,
  'Client.FriendMatch.Lobby.InRoom': clientInRoom,
  'Client.FriendMatch.Lobby.Expirable': clientExpirable,
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
  STATE_GROUPS[R + '.FriendMatch.Lobby.Ready.Idle'] = readyIdle(R);
  STATE_GROUPS[R + '.FriendMatch.Lobby.FriendGone'] = friendGone(R);
  STATE_GROUPS[R + '.FriendMatch.Lobby.SelfGone'] = selfGone(R);
  STATE_GROUPS[R + '.Game.BeforeStart'] = beforeStart(R);
  STATE_GROUPS[R + '.Opponent.Waiting'] = [R + '.Opponent.Disconnected', R + '.Opponent.OpponentDisconnected'];
});
STATE_GROUPS['Host.FriendMatch.Room.Top'] = hostTop;
STATE_GROUPS['Client.FriendMatch.Room.Notice'] = clientNoticeTop;
STATE_GROUPS['Client.FriendMatch.Room.Notice.CodeEntered'] = clientNoticeTopFilled;
AWAY_PLACES.forEach(function (p) {
  STATE_GROUPS['Host.Away.' + p + '.Pending'] = awayStates(p, AWAY_STATUSES);
  STATE_GROUPS['Host.Away.' + p + '.Vacant'] = awayStates(p, ['Waiting', 'FriendLeft']);
});
OUTCOMES.forEach(function (o) {
  ['Host', 'Client'].forEach(function (R) {
    STATE_GROUPS[R + '.' + o + 'Result.Rematchable'] = resultStates(R, o, REMATCH_PHASES);
    STATE_GROUPS[R + '.' + o + 'Result.CanRematch'] = resultStates(R, o, IDLE_PHASES);
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
  T({ from: { host: hostTop, client: '*' }, event: 'host.back', to: { host: 'Host.MultiModeSelection', client: '*' } });
  T({ from: { host: hostTop, client: '*' }, event: 'host.createMatch', when: { createResult: 'connFailed' },
    to: { host: 'Host.FriendMatch.Room.ConnectionFailed', client: '*' },
    note: 'モック設定「Create Match の結果 = 接続失敗」のとき。決定 (U6): サーバーに届かないときだけ "Connection failed" と "Couldn\u2019t create a room. Try again."', decided: ['U6'] });
  T({ from: { host: hostTop, client: '*' }, event: 'host.createMatch', to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' },
    note: '図01: Match Code QWERTY123 が発行される。決定 (U7): 期限は 30 分 (仮)、"Code expires in 30:00"。部屋のお知らせは画面が変わるので消える (U52)', decided: ['U7', 'U52'] });
  T({ from: { host: 'Host.FriendMatch.Room.ConnectionFailed', client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Room', client: '*' },
    note: '決定 (U6): トーストをタップして閉じる', decided: ['U6'] });
  T({ from: { host: hostNoticeTop, client: '*' }, event: 'host.closeNotice', to: { host: 'Host.FriendMatch.Room', client: '*' },
    note: '決定 (U52): 部屋のお知らせはモーダルではない帯で、Close で閉じる', decided: ['U52'] });

  T({ from: { host: '*', client: 'Client.MultiModeSelection' }, event: 'client.friendMatch', to: { host: '*', client: 'Client.FriendMatch.Room' } });
  T({ from: { host: '*', client: 'Client.MultiModeSelection' }, event: 'client.randomMatch', to: { host: '*', client: 'Client.Matchmake' },
    note: '決定 (U13a): 相手を探す画面 ("Searching for an opponent…" と Cancel)', decided: ['U13a'] });
  T({ from: { host: '*', client: clientRoomAny }, event: 'client.back', to: { host: '*', client: 'Client.MultiModeSelection' } });
  T({ from: { host: '*', client: 'Client.FriendMatch.Room' }, event: 'client.enterCode', to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' },
    note: 'モックでは入力欄タップで QWERTY123 を入力' });
  ROOM_NOTICE_KEYS.forEach(function (k) {
    var top = 'Client.FriendMatch.Room.' + k;
    T({ from: { host: '*', client: top }, event: 'client.enterCode', to: { host: '*', client: top + '.CodeEntered' },
      note: '決定 (U52): Match Code を入れても部屋のお知らせは消えない (閉じるのは Close だけ)', decided: ['U52'] });
    T({ from: { host: '*', client: top }, event: 'client.closeNotice', to: { host: '*', client: 'Client.FriendMatch.Room' },
      note: '決定 (U52): 部屋のお知らせはモーダルではない帯で、Close で閉じる', decided: ['U52'] });
    T({ from: { host: '*', client: top + '.CodeEntered' }, event: 'client.closeNotice', to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' },
      note: '決定 (U52): Close でお知らせを閉じる (入れた Match Code はそのまま)', decided: ['U52'] });
  });
  T({ from: { host: '*', client: 'Client.FriendMatch.Room.ConnectionFailed' }, event: 'client.tapToast', to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' },
    note: '決定 (U6): トーストをタップして閉じる', decided: ['U6'] });

  // === Join Match の結果 ===
  // "Connection failed" はサーバーに届かないときだけ (決定 U6)。Match Code の誤り・期限切れ・満員・閉じたルームの赤字とは別。
  // 部屋のお知らせ (U52) を出したまま Join Match を押したときは、結果 (部屋・赤字・トースト) がお知らせに取って代わる (2026-10-08 に確認)
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'notFound' },
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.NotFound' }, note: '図08: 無効な Match Code' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'expired' },
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.Expired' }, note: '図09: Match Code が期限切れ' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'full' },
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.Full' }, note: '図10: すでにほかの人が入っている' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch', when: { codeResult: 'connFailed' },
    to: { host: '*', client: 'Client.FriendMatch.Room.ConnectionFailed' },
    note: 'モック設定「Join Match の結果 = 接続失敗」のとき。決定 (U6): サーバーに届かないときだけ "Connection failed" と "Couldn\u2019t join the room. Try again."', decided: ['U6'] });
  T({ from: { host: hostWaitingForFriend, client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Connecting' },
    note: '決定 (U4): サーバーが参加を確認すると、ホストは "Friend joined!"、クライアントは "Connecting…" (どちらも Ready はまだ押せない)。' +
      '友だちが抜けた / 戻らなかったあとも同じ Match Code で入れ、入り直したときも "Friend joined!" (U17 / U32 / U34)', decided: ['U4', 'U17', 'U32', 'U34'] });
  eachPlace(function (p) {
    T({ from: { host: awayStates(p, ['Waiting', 'FriendLeft']), client: clientRoomFilled }, event: 'client.joinMatch',
      to: { host: away(p, 'FriendJoined'), client: 'Client.FriendMatch.Lobby.Connecting' },
      note: '図02: ホストは別画面のまま緑の "Friend joined!"。決定 (U4): ホストが部屋の画面にいないので同期は終わらず、クライアントは "Connecting…" のまま', decided: ['U4', 'U17'] });
  });
  T({ from: { host: hostExpiredAny, client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.Expired' }, note: 'ホストの Match Code が期限切れ' });
  T({ from: { host: '*', client: clientRoomFilled }, event: 'client.joinMatch',
    to: { host: '*', client: 'Client.FriendMatch.Room.Error.NotFound' }, note: 'ホストが待機中の部屋を持っていないので見つからない' });

  // === 参加の確認と同期 (決定 U4、高宮さん 2026-10-07) ===
  // Ready を押せるのは、サーバーが参加を確認し、両者が部屋の画面にいて、同期が終わってから。決まった待ち時間 (以前のモックの 1.5 秒) は置かない
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Connecting' }, event: 'sys.roomSynced', auto: 800,
    to: { host: 'Host.FriendMatch.Lobby.Ready', client: 'Client.FriendMatch.Lobby.Ready' },
    note: '決定 (U4): 両者が部屋の画面にそろって同期が終わると Ready を押せる (決まった待ち時間ではない。モックの 0.8 秒はサーバーの応答の代わり)。決定 (U36): 両者のカード (どちらも "Not ready")',
    decided: ['U4', 'U36'] });

  // === Ready 画面 (決定 U31 変更・U33〜U36、高宮さん 2026-10-07) ===
  // 両者が Ready を押したら開始 (U31)。押した側は送っている間 "Confirming…"、届くと "Waiting for opponent…" と 60 秒 (仮) のカウントダウンと Cancel Ready、
  // 相手側には "Opponent is ready. Are you?" (U36)。Ready を取り消せるのは届いたあとの Ready 画面だけで、送っている間・読み込み・その先は取り消せない (U53)。
  // 試合が始まるまで (3-2-1 のあとサーバーが確認するまで) は勝敗を記録しない (U32)
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
      note: '決定 (U34): 相手が Ready を送っている途中で取り消したときは、相手の Ready が先に待つ側になる (決定 U53)', decided: ['U34', 'U53'] });
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady')), event: d + '.leaveApp', to: pair(L(R, 'Ready'), opponentAfterClear),
      note: 'モック操作。決定 (U35): アプリを離れる (バックグラウンド・画面ロック) とその人の Ready は消え、ルームには残る。相手の表示は Cancel Ready と同じ (決定 U53)', decided: ['U35', 'U53'] });
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady.Confirming')), event: d + '.leaveApp', to: pair(L(R, 'Ready'), L(O, 'Ready.Confirming')),
      note: 'モック操作。決定 (U35): アプリを離れるとその人の Ready は消える。相手の Ready は送っている途中なので、相手が先に待つ側になる (決定 U53)', decided: ['U35', 'U53'] });
    T({ from: pair(L(R, 'Ready.Confirming'), '*'), event: d + '.leaveApp', to: pair(L(R, 'Ready'), '*'),
      note: 'モック操作。決定 (U35): 送っている途中でアプリを離れると Ready は届かない (相手の画面は変わらない、決定 U53)', decided: ['U35', 'U53'] });
    T({ from: pair(L(R, 'Ready.OpponentReady.Confirming'), '*'), event: d + '.leaveApp', to: pair(L(R, 'Ready.OpponentReady'), '*'),
      note: 'モック操作。決定 (U35): 送っている途中でアプリを離れると Ready は届かない (決定 U53)', decided: ['U35', 'U53'] });
    T({ from: pair(noneReady(R).concat([L(R, 'Ready.OpponentReady')]), '*'), event: d + '.leaveApp', to: pair('=', '*'),
      note: 'モック操作。決定 (U35): Ready していないときにアプリを離れて戻っても、何も変わらない', decided: ['U35'] });
    // 60 秒 (仮) 相手が押さなければ両者の Ready を消す (U33)。罰はなく、どちらもルームに残る
    T({ from: pair(L(R, 'Ready.WaitingForOpponent'), L(O, 'Ready.OpponentReady')), event: 'timer.readyTimeout',
      to: pair(L(R, 'Ready.TimedOut'), L(O, 'Ready.TimedOut')),
      note: '決定 (U33): 片方が Ready のまま 60 秒 (仮) 相手が押さなければ、両者の Ready を消して "Ready check timed out. Press Ready when you\u2019re ready."。罰はなく、どちらもメニューへは戻らない', decided: ['U33'] });
  });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.Confirming', client: 'Client.FriendMatch.Lobby.Ready.Confirming' }, event: 'sys.readyConfirmed', auto: 800,
    to: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, note: '決定 (U31): 両者がほぼ同時に Ready を押した。どちらも届いたら開始', decided: ['U31', 'U36'] });

  // === 読み込み (決定 U32 / U15) ===
  // 両者の Ready がそろったら "Starting match…"。20 秒 (仮) で終わらない (U32) か同期に失敗する (U15) と、両者の Ready を消して Ready 画面に戻る
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'sys.bothStarted', auto: 1500,
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { match: 'friend', rated: false, rematch: false },
    note: '合意: マッチ成立時に VS 画面を挟む。決定 (U21): Friend Match はレートが変わらない', decided: ['U21'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'timer.loadTimeout',
    to: { host: 'Host.FriendMatch.Lobby.Ready.StartFailed', client: 'Client.FriendMatch.Lobby.Ready.StartFailed' },
    note: '決定 (U32): 読み込みは 20 秒 (仮) まで。終わらなければ両者に "Match could not start. Please try again." を出して Ready 画面に戻す (両者の Ready は消える)', decided: ['U32'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Starting', client: 'Client.FriendMatch.Lobby.Starting' }, event: 'sys.syncFailed',
    to: { host: 'Host.FriendMatch.Lobby.Ready.SyncFailed', client: 'Client.FriendMatch.Lobby.Ready.SyncFailed' },
    note: '決定 (U15): 同期に失敗したら両者の Ready を消し、"Couldn\u2019t start the match. Please ready up again."。ふつうの Ready の流れ (60 秒の期限つき) からやり直す。' +
      'Match Code が有効な間は何度でもやり直せる (図06 の "Unable to start the match." を置き換えた)', decided: ['U15', 'U33'] });
  T({ from: { host: 'Host.Opponent', client: 'Client.Opponent' }, event: 'vs.done', auto: 2500,
    to: { host: 'Host.Game.Countdown', client: 'Client.Game.Countdown' },
    note: '合意: VS 画面は 2〜3 秒。決定 (U2): そのままゲーム画面へ移り、ゲーム本体のカウントダウンが始まる', decided: ['U2'] });
  T({ from: { host: 'Host.Game.Countdown', client: 'Client.Game.Countdown' }, event: 'game.countdownDone', auto: GAME_COUNTDOWN_MS,
    to: { host: 'Host.Game.Play', client: 'Client.Game.Play' },
    note: '決定 (U2): ゲーム本体の 3 → 2 → 1 (1 秒待ち + 0.8 秒 × 3) が終わるとメニューボタン (☰) が出てプレイ開始。' +
      '決定 (U32): 3-2-1 のあとサーバーが確認した時点で試合開始。ここからは対戦中のルール (20 秒の切断負け・降参の負け、U28 / U38)', decided: ['U2', 'U32'] });

  // === 部屋での切断 (決定 U5、高宮さん 2026-10-07): Ready 画面・読み込み ===
  // 両者の Ready を消し、20 秒 (仮) まで自動で再接続する。切れた側は "Connection lost. Reconnecting…"、
  // 残った側は "Your friend disconnected. Waiting for them to reconnect…"。20 秒で戻れなければ、切れた側に "Could not reconnect." と Retry / Leave Room。
  // クライアントは Friend Match トップへ戻り ("The room was closed."、U52)、ホストは空の部屋を残す (同じ Match Code)。
  // 待っている間は両者に 20 秒 (仮) のカウントダウン (切れた側は決定 U52、残った側は 2026-10-08 に確認)。Match Code の期限の時計は止まらない (U7)
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
    var lost = pair(lobbyState(R, 'ConnectionLost'), lobbyState(O, 'FriendDisconnected'));
    T({ from: pair(preStart(R), preStart(O)), event: d + '.disconnect', to: lost,
      note: 'モック操作。決定 (U5): 部屋での切断は両者の Ready を消して、20 秒 (仮) まで自動で再接続する。切れた側は "Connection lost. Reconnecting…"、' +
        '相手は "Your friend disconnected. Waiting for them to reconnect…"', decided: ['U5'] });
    T({ from: lost, event: 'net.recovered', to: pair(lobbyState(R, 'Ready'), lobbyState(O, 'Ready')),
      note: '決定 (U5): 20 秒のうちに戻れば、両者とも Ready していない Ready 画面に戻る。再接続は入り直しではないので "Friend joined!" は出さない (U17)', decided: ['U5', 'U17'] });
    T({ from: lost, event: 'timer.disconnectTimeout',
      to: pair(lobbyState(R, 'CouldNotReconnect'), O === 'Host' ? 'Host.FriendMatch.Lobby.Waiting' : 'Client.FriendMatch.Room.RoomClosed'),
      note: '決定 (U5): 20 秒 (仮) で戻れなければ、切れた側に "Could not reconnect." と Retry / Leave Room。' +
        (O === 'Host' ? 'ホストは空の部屋を残して "Waiting for your friend…" (同じ Match Code)'
          : '決定 (U52): クライアントは Friend Match トップへ戻り、"The room was closed." の帯 ("You left the room" とは出さない)'),
      decided: O === 'Host' ? ['U5'] : ['U5', 'U52'] });
    T({ from: pair(lobbyState(R, 'CouldNotReconnect'), '*'), event: d + '.retry', to: pair(lobbyState(R, 'ConnectionLost'), '*'),
      note: '決定 (U5): Retry でもう一度つなぎ直す ("Connection lost. Reconnecting…")', decided: ['U5'] });
  });
  // 離席中のホストの部屋で友だちが切断する (決定 U19): ホストの帯は "Reconnecting…"、20 秒たつと "Waiting for your friend…"
  eachPlace(function (p) {
    T({ from: { host: awayStates(p, ['FriendInRoom', 'FriendReady']), client: preStart('Client') }, event: 'client.disconnect',
      to: { host: away(p, 'Reconnecting'), client: 'Client.FriendMatch.Lobby.ConnectionLost' },
      note: 'モック操作。決定 (U5 / U19): クライアントの Ready は消える。離席中のホストの帯は青い "Waiting for your friend…" の代わりに "Reconnecting…"', decided: ['U5', 'U19'] });
    T({ from: { host: away(p, 'Reconnecting'), client: ['Client.FriendMatch.Lobby.ConnectionLost', 'Client.FriendMatch.Lobby.Reconnecting'] }, event: 'net.recovered',
      to: { host: away(p, 'FriendInRoom'), client: 'Client.FriendMatch.Lobby.Ready' },
      note: '決定 (U5 / U19): 20 秒のうちに戻れば、クライアントは Ready 画面へ。ホストの帯は "Friend is in the room" に戻る (U55)', decided: ['U5', 'U19', 'U55'] });
    T({ from: { host: away(p, 'Reconnecting'), client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'timer.disconnectTimeout',
      to: { host: away(p, 'Waiting'), client: 'Client.FriendMatch.Lobby.CouldNotReconnect' },
      note: '決定 (U19 / U5): 20 秒 (仮) たつと、ホストの帯は "Waiting for your friend…" に戻る (空の部屋を残す)。クライアントは "Could not reconnect."', decided: ['U19', 'U5'] });
    T({ from: { host: away(p, 'Reconnecting'), client: 'Client.FriendMatch.Lobby.Reconnecting' }, event: 'timer.disconnectTimeout',
      to: { host: away(p, 'Waiting'), client: 'Client.FriendMatch.Room.ReconnectFailed' },
      note: '決定 (U19 / U32): 20 秒 (仮) たつと、ホストの帯は "Waiting for your friend…" に戻る。決定 (U52): 戻れなかったクライアントは Friend Match トップに "Could not reconnect. The match did not start."',
      decided: ['U19', 'U32', 'U52'] });
  });
  // Retry のあと (切れていないほうはもう次へ進んでいる)。クライアントは部屋がまだあれば入り直し ("Friend joined!")、ホストは空の部屋に戻る
  T({ from: { host: hostWaitingForFriend, client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'net.recovered',
    to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Connecting' },
    note: '決定 (U5 / U17): Retry でつながると、空のまま残っていた部屋に入り直す。入り直しなので、ホストには "Friend joined!"', decided: ['U5', 'U17', 'U4'] });
  eachPlace(function (p) {
    T({ from: { host: awayStates(p, ['Waiting', 'FriendLeft']), client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'net.recovered',
      to: { host: away(p, 'FriendJoined'), client: 'Client.FriendMatch.Lobby.Connecting' },
      note: '決定 (U5 / U17): Retry でつながると部屋に入り直す。離席中のホストの帯は緑の "Friend joined!"', decided: ['U5', 'U17', 'U4'] });
  });
  // 待っている間に Match Code の期限が切れた (U7: 部屋での切断の間は時計が止まらない)。戻った側も今の画面のまま "Match code expired." (U18)
  T({ from: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'net.recovered',
    to: { host: '*', client: 'Client.FriendMatch.Lobby.CodeExpired' },
    note: '決定 (U7 / U18): 部屋での切断を待っている間に期限が切れた。戻ったクライアントにも "Match code expired." と Join Match', decided: ['U7', 'U18', 'U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.CodeExpired' }, event: 'net.recovered',
    to: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' },
    note: '決定 (U7 / U10): 部屋での切断を待っている間に期限が切れた。戻ったホストにも "Match code expired." と Create Match', decided: ['U7', 'U10', 'U5'] });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'net.recovered', to: { host: '*', client: 'Client.FriendMatch.Room.Error.NotFound' },
    note: 'Retry でつながったが、部屋はもう無い (ホストが閉じた・期限が切れた)。モックでは Match Code が見つからないときと同じ表示', decided: ['U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: '*' }, event: 'net.recovered', to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' },
    note: '決定 (U5): Retry でつながると、ホストは残しておいた空の部屋に戻る (同じ Match Code)', decided: ['U5'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: '*' }, event: 'timer.disconnectTimeout', to: { host: 'Host.FriendMatch.Lobby.CouldNotReconnect', client: '*' },
    note: '決定 (U5): Retry しても 20 秒 (仮) でつながらなければ、また "Could not reconnect."', decided: ['U5'] });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'timer.disconnectTimeout', to: { host: '*', client: 'Client.FriendMatch.Lobby.CouldNotReconnect' },
    note: '決定 (U5): Retry しても 20 秒 (仮) でつながらなければ、また "Could not reconnect."', decided: ['U5'] });

  // === VS 画面・カウントダウン中の切断 (決定 U32、Friend Match の Ready 画面から始まった対戦だけ) ===
  // 両者の Ready を消して止める。相手は "Opponent disconnected. Waiting for them to reconnect…"、切れた側は "Connection lost. Reconnecting…" (U52)。
  // どちらも 20 秒 (仮) のカウントダウン。勝敗は記録しない。戻れなかった側は "Could not reconnect. The match did not start." (U52)。
  // ランダム対戦と再戦の VS 画面・カウントダウン中の切断は U54
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
    T({ from: pair([R + '.Opponent', R + '.Game.Countdown'], [O + '.Opponent', O + '.Game.Countdown']), event: d + '.disconnect', when: { match: 'friend', rematch: false },
      to: waiting, note: 'モック操作。決定 (U32): VS 画面・カウントダウン中の切断は開始前なので、Ready 画面に戻して相手は 20 秒 (仮) 待つ。勝敗は記録しない。' +
        '決定 (U52): 切れた側は "Connection lost. Reconnecting…" と 20 秒のカウントダウン', decided: ['U32', 'U3', 'U52'] });
    T({ from: waiting, event: 'net.recovered', to: pair(lobbyState(R, 'Ready'), lobbyState(O, 'Ready')),
      note: '決定 (U32): 戻ったら両者とももう一度 Ready を押す。カウントダウンは 3 からやり直し', decided: ['U32'] });
  });
  T({ from: { host: 'Host.FriendMatch.Lobby.OpponentDisconnected', client: 'Client.FriendMatch.Lobby.Reconnecting' }, event: 'timer.disconnectTimeout',
    to: { host: 'Host.FriendMatch.Lobby.MatchCancelled', client: 'Client.FriendMatch.Room.ReconnectFailed' },
    note: '決定 (U32): 20 秒 (仮) で戻らなければ "Match cancelled. Opponent did not reconnect."。結果は無く、ホストは同じ Match Code のままルームに残る。' +
      '決定 (U52): 戻れなかったクライアントは Friend Match トップに "Could not reconnect. The match did not start."', decided: ['U32', 'U52'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Reconnecting', client: 'Client.FriendMatch.Lobby.OpponentDisconnected' }, event: 'timer.disconnectTimeout',
    to: { host: 'Host.FriendMatch.Room.ReconnectFailed', client: 'Client.FriendMatch.Room.HostDisconnected' },
    note: '決定 (U32): ホストが戻らなければ、クライアントは "Room closed. The host disconnected." で Friend Match トップへ。' +
      '決定 (U52): 戻れなかったホストは Friend Match トップに "Could not reconnect. The match did not start."', decided: ['U32', 'U52'] });

  // === ランダム対戦と再戦の VS 画面・カウントダウン中の切断 (決定 U54、高宮さん 2026-10-08) ===
  // 試合が始まる前なので 20 秒 (仮) 待ち、戻らなければ試合を取りやめる (勝敗なし・レートは変わらない)。Ready 画面には戻さず、戻ったら VS 画面からやり直す。
  // 待っている間は VS 画面の上に、対戦中の切断 (U46) と同じ表示と残りの秒数。取りやめたあとは、ランダム対戦なら Online Battle の中の通知 (Search again / Close)、
  // Friend Match の再戦なら Friend Match トップの帯 (行き先は 2026-10-08 に確認)
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
    var waiting = pair(R + '.Opponent.Disconnected', O + '.Opponent.OpponentDisconnected');
    [[{ match: 'random' }, 'ランダム対戦 (再戦を含む)'], [{ match: 'friend', rematch: true }, 'Friend Match の再戦']].forEach(function (w) {
      T({ from: pair(beforeStart(R), beforeStart(O)), event: d + '.disconnect', when: w[0], to: waiting,
        note: 'モック操作。決定 (U54): ' + w[1] + 'の VS 画面・カウントダウン中の切断は、試合が始まる前なので 20 秒 (仮) 待つ。Ready 画面には戻さない。' +
          '表示は対戦中の切断 (U46) と同じで、どちらにも残りの秒数', decided: ['U54', 'U46'] });
    });
    T({ from: waiting, event: 'net.recovered', to: { host: 'Host.Opponent', client: 'Client.Opponent' },
      note: '決定 (U54): 20 秒のうちに戻れば VS 画面からやり直す (カウントダウンも 3 から)', decided: ['U54'] });
    T({ from: waiting, event: 'timer.disconnectTimeout', when: { match: 'random' },
      to: pair(R + '.Matchmake.ReconnectFailed', O + '.Matchmake.MatchCancelled'),
      note: '決定 (U54): 20 秒 (仮) で戻らなければ試合を取りやめる。勝敗は無く、レートも変わらない。両者とも Online Battle の中の通知と Search again / Close ' +
        '(残った側 "Match cancelled. Opponent did not reconnect."、戻れなかった側 "Could not reconnect. The match did not start."、U52)', decided: ['U54', 'U52', 'U21'] });
    T({ from: waiting, event: 'timer.disconnectTimeout', when: { match: 'friend' },
      to: pair(R + '.FriendMatch.Room.ReconnectFailed', O + '.FriendMatch.Room.MatchCancelled'),
      note: '決定 (U54): 20 秒 (仮) で戻らなければ試合を取りやめる (勝敗なし)。行き先は Back to Friend Match と同じ Friend Match トップ (U24) で、' +
        'お知らせは部屋の帯 (U52、Close で閉じる)。この行き先は 2026-10-08 に確認', decided: ['U54', 'U52', 'U24'] });
  });

  // === 部屋を閉じる・抜ける (決定 U9 / U11 / U14 / U34) ===
  // ホストは Close Room で部屋を閉じる (U14)。クライアントは Leave Room と ‹ で同じ確認 "Leave this room?" を出す (U9)。
  // 本文は "No match has started. No win or loss will be recorded." (U34)、残るボタンは Keep Waiting (U11)
  T({ from: { host: hostClosable, client: '*' }, event: 'host.closeRoom', to: { host: '=', client: '*' }, dialog: { host: 'closeRoom' },
    note: '決定 (U14 / U34): 部屋を閉じるのは Close Room (‹ では閉じない)。確認の本文は "No match has started. No win or loss will be recorded."。題名は "Close this room?" (U51)', decided: ['U14', 'U34', 'U11', 'U51'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.CouldNotReconnect', client: '*' }, event: 'host.leaveRoom', to: { host: '=', client: '*' }, dialog: { host: 'leaveRoom' },
    note: '決定 (U5): "Could not reconnect." の Leave Room。確認は Leave Room と同じ (U9 / U34)', decided: ['U5', 'U9', 'U34'] });
  ['leaveRoom', 'back'].forEach(function (ev) {
    T({ from: { host: '*', client: clientLeavable }, event: 'client.' + ev, to: { host: '*', client: '=' }, dialog: { client: 'leaveRoom' },
      note: ev === 'back' ? '決定 (U9 / U35): ‹ (別の画面へ移る) も Leave Room と同じ確認 "Leave this room?"'
        : '決定 (U9 / U34): クライアントにはどの部屋の画面にも Leave Room。確認 "Leave this room?" / "No match has started. No win or loss will be recorded."',
      decided: ev === 'back' ? ['U9', 'U35', 'U34', 'U11'] : ['U9', 'U34', 'U11'] });
  });
  ['host', 'client'].forEach(function (d) {
    T({ from: Object.assign({ host: '*', client: '*' }, d === 'host' ? { hostDialog: ['closeRoom', 'leaveRoom'] } : { clientDialog: 'leaveRoom' }), event: d + '.dialog.keepWaiting',
      to: { host: d === 'host' ? '=' : '*', client: d === 'client' ? '=' : '*' }, dialog: d === 'host' ? { host: null } : { client: null },
      note: '決定 (U11): 確認の "Go Back" は "Keep Waiting" に。確認を閉じて部屋に残る (Ready はそのまま)', decided: ['U11'] });
  });
  // クライアントが抜けたあと (U34 / U17): ホストは同じ Match Code で次の友だちを待つ。離席中なら帯に "Your friend left." を一度だけ
  T({ from: { host: hostWithClient, client: '*', clientDialog: 'leaveRoom' }, event: 'client.dialog.leaveRoom',
    to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
    note: '決定 (U34): クライアントは Match Code が残った Friend Match トップへ。ホストには "Your friend left. Waiting for another friend…" (Match Code は同じ。再接続中のホストは戻ったときに見る)', decided: ['U34', 'U9'] });
  eachPlace(function (p) {
    T({ from: { host: awayStates(p, ['FriendJoined', 'FriendInRoom', 'FriendReady', 'Reconnecting']), client: '*', clientDialog: 'leaveRoom' }, event: 'client.dialog.leaveRoom',
      to: { host: away(p, 'FriendLeft'), client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
      note: '決定 (U17): ホストの離席中にクライアントが抜けたら、ホストの帯に "Your friend left." を一度だけ出す', decided: ['U17', 'U34', 'U9'] });
  });
  T({ from: { host: '*', client: '*', clientDialog: 'leaveRoom' }, event: 'client.dialog.leaveRoom',
    to: { host: '*', client: 'Client.FriendMatch.Room.CodeEntered' }, dialog: { client: null },
    note: '決定 (U5): "Could not reconnect." から抜ける。クライアントは Friend Match トップへ (ホストはもう空の部屋で待っている)', decided: ['U5', 'U9'] });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'FriendLeft'), client: '*' }, event: 'sys.friendLeftShown', auto: 5000, to: { host: away(p, 'Waiting'), client: '*' },
      note: '決定 (U17 / U55): "Your friend left." は一度だけ 5 秒 (仮) 出す。そのあとは青い "Waiting for your friend…"', decided: ['U17', 'U55'] });
  });
  // ホストが部屋を閉じたあと (U34): クライアントは "Room closed. The host left." の Friend Match トップへ
  T({ from: { host: '*', client: clientInRoom, hostDialog: 'closeRoom' }, event: 'host.dialog.closeRoom',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '決定 (U14 / U34): 部屋を閉じる。クライアントは "Room closed. The host left." で Friend Match トップへ (再接続中のクライアントは戻ったときに見る)', decided: ['U14', 'U34'] });
  T({ from: { host: '*', client: '*', hostDialog: 'closeRoom' }, event: 'host.dialog.closeRoom',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '決定 (U14): 部屋を閉じて Friend Match トップへ (部屋に友だちはいない)', decided: ['U14'] });
  T({ from: { host: '*', client: '*', hostDialog: 'leaveRoom' }, event: 'host.dialog.leaveRoom',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '決定 (U5): "Could not reconnect." から抜けて部屋を閉じる (クライアントはもう Friend Match トップにいる)', decided: ['U5'] });

  // === ホストが ‹ で部屋の画面を離れる (決定 U14、高宮さん 2026-10-07) ===
  // 部屋は残し、行った先の画面の下の帯で示す (図02)。自分の Ready は消える。送っている間・読み込み中・再接続中は ‹ を押せない
  T({ from: { host: hostWaitingForFriend, client: '*' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'Waiting'), client: '*' }, note: '決定 (U14): ‹ でも部屋は残す。図02: 青い "Waiting for your friend…" の帯', decided: ['U14'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: '*' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'FriendJoined'), client: '*' },
    note: '決定 (U14 / U4): 同期の前に離れたので、クライアントは "Connecting…" のまま (ホストが戻るまで Ready を押せない)', decided: ['U14', 'U4'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.WaitingForOpponent', client: 'Client.FriendMatch.Lobby.Ready.OpponentReady' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'FriendInRoom'), client: 'Client.FriendMatch.Lobby.Ready.OpponentNotReady' },
    note: '決定 (U14 / U34): 別の画面へ移ると自分の Ready は消える。クライアントには "Opponent is no longer ready."。帯は "Friend is in the room" (U55)', decided: ['U14', 'U34', 'U55'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.WaitingForOpponent', client: 'Client.FriendMatch.Lobby.Ready.OpponentReady.Confirming' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'FriendInRoom'), client: 'Client.FriendMatch.Lobby.Ready.Confirming' },
    note: '決定 (U14): 別の画面へ移ると自分の Ready は消える。クライアントの Ready は送っている途中なので、クライアントが先に待つ側になる (決定 U53)。帯は "Friend is in the room" (U55)', decided: ['U14', 'U53', 'U55'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.Ready.OpponentReady', client: '*' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'FriendReady'), client: '*' },
    note: '決定 (U14 / U1): ‹ でも部屋は残す。友だちは Ready なので帯は赤い "Friend is ready!"', decided: ['U14', 'U1'] });
  T({ from: { host: noneReady('Host'), client: '*' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'FriendInRoom'), client: '*' },
    note: '決定 (U14): ‹ でも部屋は残す。友だちはいるが Ready していないときの帯は "Friend is in the room" (U55)', decided: ['U14', 'U55'] });
  T({ from: { host: friendGone('Host'), client: '*' }, event: 'host.back',
    to: { host: away('FriendMatchRoom', 'Reconnecting'), client: '*' },
    note: '決定 (U14 / U19): 友だちの再接続を待っている間に離れると、帯は青い "Waiting for your friend…" ではなく "Reconnecting…"', decided: ['U14', 'U19'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' }, event: 'host.back', to: { host: 'Host.FriendMatch.Room', client: '*' },
    note: '期限が切れた部屋はもう無いので、‹ はふつうに Friend Match トップへ' });

  eachPlace(function (p) {
    var other = p === 'FriendMatchRoom' ? 'StageSelection' : 'FriendMatchRoom';
    AWAY_STATUSES.concat(['Expired']).forEach(function (s) {
      T({ from: { host: away(p, s), client: '*' }, event: 'host.back',
        to: { host: away(other, s === 'FriendLeft' ? 'Waiting' : s), client: '*' },
        note: (p === 'FriendMatchRoom' ? '他の画面 (ステージ選択) へ。途中の画面は省略' : 'Friend Match トップへ戻る。途中の画面は省略') +
          (s === 'FriendLeft' ? '。"Your friend left." は一度だけなので、移った先では青い "Waiting for your friend…" (U17)' : ''),
        decided: s === 'FriendLeft' ? ['U17'] : [] });
    });
  });
  // 帯をタップすると部屋の画面に戻る (決定 U1 / U16)。タップで Ready を押したことにはしない
  T({ from: { host: '*', client: '*', hostFailed: 'create' }, event: 'host.tapToast', to: { host: '=', client: '*' }, set: { hostFailed: null },
    note: '決定 (U6 / U12): "Connection failed" のトーストを閉じる。部屋の帯がまた見える', decided: ['U6', 'U12'] });
  eachPlace(function (p) {
    T({ from: { host: away(p, 'Waiting'), client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' },
      note: '決定 (U16): 青い帯をタップすると部屋の画面に戻る', decided: ['U16'] });
    T({ from: { host: away(p, 'FriendLeft'), client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.ClientLeft', client: '*' },
      note: '決定 (U16 / U34): 帯をタップすると部屋の画面 ("Your friend left. Waiting for another friend…") に戻る', decided: ['U16', 'U17', 'U34'] });
    T({ from: { host: away(p, 'FriendJoined'), client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: '*' },
      note: '決定 (U16 / U4): 緑の帯をタップすると部屋の画面に戻る。両者が部屋の画面にそろうので同期が始まる', decided: ['U16', 'U4'] });
    T({ from: { host: away(p, 'FriendInRoom'), client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.Ready', client: '*' },
      note: '決定 (U16 / U17 / U55): "Friend is in the room" の帯をタップすると Ready 画面に戻る。クライアントには "Friend joined!" を出し直さない', decided: ['U16', 'U17', 'U55'] });
    T({ from: { host: away(p, 'FriendReady'), client: '*' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.Ready.OpponentReady', client: '*' },
      note: '決定 (U1): "Friend is ready!" をタップしても部屋の画面に戻るだけで、Ready は押さない (戻ってから Ready / Cancel Ready)', decided: ['U1', 'U16'] });
    T({ from: { host: away(p, 'Reconnecting'), client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.FriendDisconnected', client: '*' },
      note: '決定 (U16 / U19 / U5): 帯をタップすると部屋の画面 ("Your friend disconnected. Waiting for them to reconnect…") に戻る', decided: ['U16', 'U19', 'U5'] });
    T({ from: { host: away(p, 'Reconnecting'), client: 'Client.FriendMatch.Lobby.Reconnecting' }, event: 'host.tapToast', to: { host: 'Host.FriendMatch.Lobby.OpponentDisconnected', client: '*' },
      note: '決定 (U16 / U19 / U32): 帯をタップすると部屋の画面 ("Opponent disconnected…") に戻る', decided: ['U16', 'U19', 'U32'] });
  });
  // 離席中のホストの部屋で、クライアントが Ready を押す・取り消す・時間切れになる (U1 / U33 / U34 / U35)
  eachPlace(function (p) {
    T({ from: { host: away(p, 'FriendInRoom'), client: noneReady('Client') }, event: 'client.ready', to: { host: '*', client: 'Client.FriendMatch.Lobby.Ready.Confirming' },
      note: '決定 (U4 / U31): 同期が終わったあとなら、ホストが離れていても Ready を押せる。送っている間は "Confirming…"', decided: ['U4', 'U31', 'U36'] });
    T({ from: { host: away(p, 'FriendInRoom'), client: 'Client.FriendMatch.Lobby.Ready.Confirming' }, event: 'sys.readyConfirmed', auto: 800,
      to: { host: away(p, 'FriendReady'), client: 'Client.FriendMatch.Lobby.Ready.WaitingForOpponent' },
      note: '決定 (U1): クライアントの Ready が届くと、離席中のホストの帯は赤い "Friend is ready!"。クライアントは "Waiting for opponent…" と 60 秒 (仮)', decided: ['U1', 'U36', 'U33'] });
    ['cancelReady', 'leaveApp'].forEach(function (ev) {
      T({ from: { host: away(p, 'FriendReady'), client: 'Client.FriendMatch.Lobby.Ready.WaitingForOpponent' }, event: 'client.' + ev,
        to: { host: away(p, 'FriendInRoom'), client: 'Client.FriendMatch.Lobby.Ready' },
        note: (ev === 'leaveApp' ? 'モック操作。決定 (U35): アプリを離れると Ready が消える' : '決定 (U34): Cancel Ready') + '。ホストの帯は "Friend is in the room" に戻る (U55)',
        decided: ev === 'leaveApp' ? ['U35', 'U55'] : ['U34', 'U55'] });
    });
    T({ from: { host: away(p, 'FriendReady'), client: 'Client.FriendMatch.Lobby.Ready.WaitingForOpponent' }, event: 'timer.readyTimeout',
      to: { host: away(p, 'FriendInRoom'), client: 'Client.FriendMatch.Lobby.Ready.TimedOut' },
      note: '決定 (U33): ホストが戻らないまま 60 秒 (仮) たつと、クライアントの Ready を消して "Ready check timed out…"。ホストの帯は "Friend is in the room" に戻る (U55)', decided: ['U33', 'U55'] });
  });

  // === Match Code の期限 (決定 U7 / U10 / U18、高宮さん 2026-10-07) ===
  // 期限は 30 分 (仮) で、サーバーが数える。読み込み・VS 画面・カウントダウン・U32 の再接続待ちの間は時計が止まる (その分は減らない)。
  // 部屋での切断 (U5) の再接続待ちの間は止まらない (読み込み中に切れても、読み込みの間の分は止まったまま。2026-10-08 に確認)。
  // 切れたら両者に "Match code expired."。ホストは Create Match、クライアントは Join Match (Ready は出さない、U10)。クライアントは今の画面のまま (U18)
  eachPlace(function (p) {
    var pending = awayStates(p, ['Waiting', 'FriendJoined', 'FriendInRoom', 'FriendReady', 'FriendLeft']);
    T({ from: { host: pending, client: clientExpirable }, event: 'timer.codeExpired',
      to: { host: away(p, 'Expired'), client: 'Client.FriendMatch.Lobby.CodeExpired' },
      note: '図02: 放置したので期限が切れた。決定 (U7 / U18): クライアントは今の画面のまま "Match code expired." と Join Match', decided: ['U7', 'U10', 'U18'] });
    T({ from: { host: pending, client: '*' }, event: 'timer.codeExpired', to: { host: away(p, 'Expired'), client: '*' },
      note: '図02: 放置したので期限が切れた (部屋に友だちはいない)。決定 (U7): 濃い赤の "Match code expired."', decided: ['U7'] });
    T({ from: { host: away(p, 'Reconnecting'), client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'timer.codeExpired', to: { host: away(p, 'Expired'), client: '*' },
      note: '決定 (U7): 部屋での切断 (U5) の間は時計が止まらない。期限が切れるとクライアントが戻っても部屋は無い', decided: ['U7', 'U5'] });
    T({ from: { host: away(p, 'Expired'), client: '*' }, event: 'host.tapToast',
      to: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' }, note: '図02: 期限切れの帯をタップすると部屋の画面 ("Match code expired." と Create Match)', decided: ['U7', 'U10'] });
  });
  T({ from: { host: hostExpirable, client: clientExpirable }, event: 'timer.codeExpired',
    to: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: 'Client.FriendMatch.Lobby.CodeExpired' },
    note: '決定 (U7 / U10 / U18): 両者に "Match code expired."。Ready は消え、ホストは Create Match、クライアントは今の画面のまま Join Match', decided: ['U7', 'U10', 'U18'] });
  // 部屋での切断 (U5) を待っている間に切れる。切れている側は戻ったときに "Match code expired." を見る
  T({ from: { host: 'Host.FriendMatch.Lobby.FriendDisconnected', client: 'Client.FriendMatch.Lobby.ConnectionLost' }, event: 'timer.codeExpired',
    to: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' },
    note: '決定 (U7): 部屋での切断 (U5) の再接続待ちの間は時計が止まらない。ホストに "Match code expired."、クライアントは戻ったときに見る', decided: ['U7', 'U5', 'U10'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.ConnectionLost', client: 'Client.FriendMatch.Lobby.FriendDisconnected' }, event: 'timer.codeExpired',
    to: { host: '*', client: 'Client.FriendMatch.Lobby.CodeExpired' },
    note: '決定 (U7 / U18): 部屋での切断 (U5) の再接続待ちの間は時計が止まらない。クライアントにその場で "Match code expired."、ホストは戻ったときに見る', decided: ['U7', 'U5', 'U18'] });
  T({ from: { host: hostWaitingForFriend, client: '*' }, event: 'timer.codeExpired', to: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' },
    note: '決定 (U7 / U10): 友だちを待っている間に期限が切れた。"Match code expired." と Create Match', decided: ['U7', 'U10'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' }, event: 'host.createMatch', when: { createResult: 'connFailed' },
    to: { host: 'Host.FriendMatch.Room.ConnectionFailed', client: '*' }, note: 'モック設定「Create Match の結果 = 接続失敗」のとき (U6)', decided: ['U10', 'U6'] });
  T({ from: { host: 'Host.FriendMatch.Lobby.CodeExpired', client: '*' }, event: 'host.createMatch', to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' },
    note: '決定 (U10): 期限切れの画面の Create Match で新しい部屋を作る (モックでは同じ Match Code を表示)', decided: ['U10', 'U7'] });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.CodeExpired' }, event: 'client.joinMatch', to: { host: '*', client: 'Client.FriendMatch.Room' },
    note: '決定 (U10 / U18): 期限切れの画面の Join Match で、新しい Match Code を入れる Friend Match トップへ', decided: ['U10', 'U18'] });
  T({ from: { host: '*', client: 'Client.FriendMatch.Lobby.CodeExpired' }, event: 'client.back', to: { host: '*', client: 'Client.FriendMatch.Room' },
    note: '期限が切れた部屋はもう無いので、‹ は確認なしで Friend Match トップへ', decided: ['U18'] });

  // === 離席中のホストが Friend Match トップで Create / Join を押す (10-01 合意、決定 U12) ===
  // 本文は役割で変える (ホスト: "This will close your current room. Your friend will return to Friend Match.")。
  // 古い部屋を閉じるのは、新しい部屋を作れた・入れたときだけ
  var awayTopPending = awayStates('FriendMatchRoom', AWAY_STATUSES);
  T({ from: { host: awayTopPending, client: '*' }, event: 'host.createMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'newMatch' }, note: '合意 (10-01): 確認ダイアログ。決定 (U12): ホスト向けの本文', decided: ['U12'] });
  T({ from: { host: awayTopPending, client: '*' }, event: 'host.joinMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'joinAnother' }, note: '合意 (10-01): 確認ダイアログ。決定 (U12): ホスト向けの本文', decided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: ['newMatch', 'joinAnother'] }, event: 'host.dialog.keepCurrent',
    to: { host: '=', client: '*' }, dialog: { host: null }, note: '合意 (10-01): Keep Current Match で今の部屋のまま' });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.createMatch', when: { createResult: 'connFailed' },
    to: { host: '=', client: '*' }, dialog: { host: null }, set: { hostFailed: 'create' },
    note: 'モック設定「Create Match の結果 = 接続失敗」のとき。決定 (U12 / U6): 新しい部屋を作れなかったので古い部屋は閉じない (帯もそのまま)。"Connection failed" と "Couldn\u2019t create a room. Try again."',
    decided: ['U12', 'U6'] });
  T({ from: { host: '*', client: clientInRoom, hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '決定 (U12): 新しい部屋を作れたら古い部屋を閉じる。友だちは Friend Match トップへ ("Room closed. The host left."、U34)', decided: ['U12', 'U34'] });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, dialog: { host: null }, note: '決定 (U12): 新しい部屋を作れたら古い部屋を閉じる。モックでは同じ Match Code を表示', decided: ['U12'] });
  T({ from: { host: '*', client: clientInRoom, hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'Host.FriendMatch.Room', client: 'Client.FriendMatch.Room.HostLeft' }, dialog: { host: null },
    note: '決定 (U12): 別の部屋に入れたら古い部屋を閉じる (友だちは "Room closed. The host left.")。別の部屋に入る流れはモックでは省略 (入れたものとして Friend Match トップに置く)', decided: ['U12', 'U34'] });
  T({ from: { host: '*', client: '*', hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'Host.FriendMatch.Room', client: '*' }, dialog: { host: null }, note: '決定 (U12): 別の部屋に入れたら古い部屋を閉じる。別の部屋に入る流れはモックでは省略', decided: ['U12'] });
  T({ from: { host: ['Host.Away.FriendMatchRoom.Expired'], client: '*' }, event: 'host.createMatch', when: { createResult: 'connFailed' },
    to: { host: 'Host.FriendMatch.Room.ConnectionFailed', client: '*' }, note: 'モック設定「Create Match の結果 = 接続失敗」のとき (U6)。期限切れの部屋はもう無い', decided: ['U6'] });
  T({ from: { host: ['Host.Away.FriendMatchRoom.Expired'], client: '*' }, event: 'host.createMatch',
    to: { host: 'Host.FriendMatch.Lobby.Waiting', client: '*' }, note: '期限切れの部屋はもう無いので、確認なしで作り直す (モックの仮定)', decided: ['U10'] });

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
    to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { match: 'random', rated: true, rematch: false },
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
    // Online Battle の中の通知 (決定 U43): アプリを離れて検索が止まった (.Stopped、U43 / U47)、ランダム対戦・再戦の開始前に相手が戻らなかった (.MatchCancelled、U54)、
    // 自分が戻れなかった (.ReconnectFailed、U52 / U54)。どれも Search again / Close
    INLINE_SEARCH_NOTICES.forEach(function (k) {
      var st = R + '.Matchmake.' + k;
      var ids = k === 'Stopped' ? ['U43'] : ['U43', 'U54'];
      T({ from: row(st), event: d + '.searchAgain', to: row(R + '.Matchmake'),
        note: '決定 (' + ids.join(' / ') + '): Search again で新しく相手を探す', decided: ids });
      T({ from: row(st), event: d + '.closeNotice', to: row(R + '.MultiModeSelection'),
        note: '決定 (' + ids.join(' / ') + '): Close で通知を閉じ、Online Battle のまま', decided: ids });
      // 通知はモーダルではないので、Online Battle のほかの操作もそのまま使える。ほかの画面へ移ると通知は消える (自動では消えない)
      T({ from: row(st), event: d + '.randomMatch', to: row(R + '.Matchmake'),
        note: '決定 (U43): 通知を出したまま Random Match も押せる (新しく相手を探す。通知は消える)', decided: ids.concat(['U13a']) });
      T({ from: row(st), event: d + '.friendMatch', to: row(R + '.FriendMatch.Room'),
        note: '決定 (U43): 通知を出したまま Friend Match も押せる。ほかの画面へ移ると通知は消える (戻っても出ない)', decided: ids });
    });
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
      note: 'モック操作。決定 (U29): 60 秒 (仮) 探しても見つからなければ "No opponent found." と Search again / Back to Online', decided: ['U29'] });
    T({ from: row(next), event: d + '.leaveApp', to: row(R + '.Matchmake.Stopped'),
      note: 'モック操作。決定 (U47): 次の相手を探している間にアプリを離れたときも U43 と同じ。検索を止め、戻ると Online Battle の中に ' +
        '"Search stopped while the app was in the background." と Search again / Close', decided: ['U47', 'U43', 'U29'] });
    T({ from: row(next + '.NotFound'), event: d + '.searchAgain', to: row(next),
      note: '決定 (U29): Search again でもう一度次の相手を探す', decided: ['U29'] });
    T({ from: row(next + '.NotFound'), event: d + '.backToOnlineBattle', to: row(R + '.MultiModeSelection'),
      note: '決定 (U29): Back to Online で Online Battle へ', decided: ['U29', 'U24'] });
  });

  // === 対戦中の決着と切断 ===
  // 決定 (U44): 時間切れで得点の高いほうが勝ち、同点なら引き分け。時間切れ (勝ち / 負け / 同点) は端末の下のモック操作で、得点の計算はモックの対象外
  [['host.win', 'Win'], ['host.lose', 'Lose'], ['host.draw', 'Draw'], ['client.win', 'Lose'], ['client.lose', 'Win'], ['client.draw', 'Draw']].forEach(function (p) {
    var mine = /win$/.test(p[0]) ? '得点が上で勝ち' : /lose$/.test(p[0]) ? '得点が下で負け' : '同点で引き分け';
    T({ from: { host: hostInPlay, client: clientInPlay }, event: p[0],
      to: { host: resultState('Host', p[1]), client: resultState('Client', OPPOSITE[p[1]]) },
      note: 'モック操作: 時間切れ。押した側が' + mine + '、相手は自動で' + (p[1] === 'Draw' ? '同じく引き分け' : '逆の結果') + '。' +
        '決定 (U44): 終わった理由は ' + (p[1] === 'Draw' ? '"Same score when time ran out"' : '"Time is up"') + '。' +
        '決定 (U20): 結果画面に勝敗・両者の名前・スコア・終わった理由。MATCH MENU や降参の確認を開いていても試合は続いているので、そのまま結果画面へ (U37)',
      decided: ['U44', 'U20', 'U37'] });
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
      note: 'モック操作: この端末の接続が切れる。決定 (U28): 相手は 20 秒 (仮) 待つ。決定 (U46): その間サーバーは両者のゲームと得点を止め、' +
        '残った側は "Your opponent disconnected"、切れた側は "Connection lost" と、どちらも残りの秒数', decided: ['U28', 'U46'] });
    T({ from: waiting, event: 'net.recovered', to: pair(R + '.Game.Play', O + '.Game.Play'),
      note: '決定 (U46): 20 秒 (仮) のうちに戻れば、止めていたところから試合を続ける', decided: ['U28', 'U46'] });
    T({ from: waiting, event: 'timer.disconnectTimeout', to: pair(resultState(R, 'Lose', '.Disconnected'), resultState(O, 'Win', '.OpponentDisconnected')),
      note: '決定 (U28): 20 秒 (仮) たっても戻らなければ切断した側の負け。ランダム対戦ではレートも変わる (U21)', decided: ['U28', 'U21'] });
  });
  T({ from: { host: hostInGame, client: clientInGame }, event: 'net.bothDisconnected', to: { host: 'Host.NoContestResult', client: 'Client.NoContestResult' },
    note: '決定 (U28): 両者が切断したら "No contest due to a connection error"。レートは変わらない。片方の切断を待っている間にもう片方も切れたときも同じ', decided: ['U28', 'U21'] });
  T({ from: { host: hostInGame, client: clientInGame }, event: 'net.serviceFailure', to: { host: 'Host.NoContestResult', client: 'Client.NoContestResult' },
    note: '決定 (U28): サービス障害も "No contest due to a connection error"。レートは変わらない', decided: ['U28', 'U21'] });

  // === 結果画面の再戦 (決定 U23 / U30 / U50) ===
  // どちらからでも申し込め、相手が応じたらそのまま VS 画面へ。申し込みは 20 秒 (仮) で期限切れ。
  // 取り消し・辞退・期限切れのあとは両者とも結果画面に残り、両者に一行を出す (U50)。3 秒 (仮) たつまでは申し込めず、一行は次の操作まで残る。
  // タイマーは環境イベント (端末の外)
  OUTCOMES.forEach(function (o) {
    var H = function (ph) { return resultState('Host', o, ph); };
    var C = function (ph) { return resultState('Client', OPPOSITE[o], ph); };
    var idle = function (f) { return IDLE_PHASES.map(f); };
    [['host', 'client'], ['client', 'host']].forEach(function (p) {
      var d = p[0];
      var other = p[1];
      var mine = d === 'host' ? H : C;
      var theirs = d === 'host' ? C : H;
      var pair = function (m, t) { return d === 'host' ? { host: m, client: t } : { host: t, client: m }; };
      var asked = pair(mine('.RematchRequested'), theirs('.RematchIncoming'));
      T({ from: pair(idle(mine), idle(theirs)), event: d + '.rematch', to: asked,
        note: '決定 (U23 / U30): どちらからでも申し込める。押した側は "Waiting for your opponent…" と Cancel Request、相手は "Your opponent wants a rematch" と Rematch / Decline。' +
          '前の申し込みの一行 (U50) はここで消える', decided: ['U23', 'U30', 'U50'] });
      T({ from: asked, event: other + '.rematch', to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { rated: false, rematch: true },
        note: '決定 (U23): 相手が Rematch で応じたらそのまま VS 画面へ (ロビーの Ready は挟まない)。ランダム対戦の再戦はレートが変わらない (U21)',
        decided: ['U23', 'U21'] });
      T({ from: asked, event: d + '.cancelRematch', to: pair(mine('.RematchCancelledByYou.Cooldown'), theirs('.RematchCancelled.Cooldown')),
        note: '決定 (U30 / U50): Cancel Request で取り消すと、両者に "Rematch request cancelled" (2026-10-08 に両者の文言を統一)。' +
          '両者とも結果画面に残り、3 秒 (仮) は申し込めない', decided: ['U30', 'U50'] });
      T({ from: asked, event: other + '.declineRematch', to: pair(mine('.RematchDeclined.Cooldown'), theirs('.RematchDeclinedByYou.Cooldown')),
        note: '決定 (U30 / U50): Decline で断ると、申し込んだ側に "Your opponent declined the rematch"、断った側にも "Rematch declined"。' +
          '両者とも結果画面に残り、3 秒 (仮) は申し込めない', decided: ['U30', 'U50'] });
      T({ from: asked, event: 'timer.rematchTimeout', to: pair(mine('.RematchExpired.Cooldown'), theirs('.RematchExpiredIncoming.Cooldown')),
        note: '決定 (U30 / U50): 20 秒 (仮) 応答がなければ、申し込んだ側に "No response to rematch request"、申し込まれた側にも "Rematch request expired"。' +
          '両者とも結果画面に残り、3 秒 (仮) は申し込めない', decided: ['U30', 'U50'] });
    });
    T({ from: { host: idle(H), client: idle(C) }, event: 'sys.rematchSimultaneous', to: { host: 'Host.Opponent', client: 'Client.Opponent' }, set: { rated: false, rematch: true },
      note: '決定 (U23): 両者が同時に申し込んだら成立 (応じたのと同じ) で VS 画面へ', decided: ['U23', 'U21'] });
    REMATCH_ENDINGS.forEach(function (e) {
      var ph = '.Rematch' + e;
      var theirPh = '.Rematch' + REMATCH_ENDING_PAIRS[e];
      T({ from: { host: H(ph + '.Cooldown'), client: C(theirPh + '.Cooldown') }, event: 'timer.rematchCooldown', to: { host: H(ph), client: C(theirPh) },
        note: '決定 (U30 / U50): 3 秒 (仮) たったら、どちらからでもまた申し込める。一行は次の操作まで残る', decided: ['U30', 'U50'] });
    });
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
        note: b[3] + '。相手はすでに結果画面を抜けているか、再戦の無い結果画面 (降参・切断・No contest、U45) にいる', decided: ['U22', 'U24', 'U45'] });
    });
    // 降参した側 (決定 U41 / U24): Friend Match でもランダム対戦でも Online Battle へ
    T({ from: pair(resultState(R, 'Lose', '.Surrendered'), '*'), event: d + '.backToOnlineBattle', to: pair(R + '.MultiModeSelection', '*'),
      note: '決定 (U41 / U24): 降参して負けたあとは、Friend Match でもランダム対戦でも Back to Online で Online Battle へ', decided: ['U41', 'U24', 'U22'] });
  });

  // === 結果画面のスタンプ (決定 U27、高宮さん 2026-10-07) ===
  // 👏 Good game / 🤝 Thanks for the match / 👍 Nice。1 つ 3 秒 (仮) 表示し、次を送れるのは送ってから 5 秒 (仮) 後。相手のスタンプはミュートできる (U49: 同じ相手と続けて対戦している間だけ)。
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
        note: '決定 (U27): ' + s.emoji + ' "' + s.text + '" を送る。両者の画面に 3 秒 (仮) 出る。決定 (U49): 相手がミュートしていても自分の画面には出し、相手にミュートは知らせない', decided: ['U27', 'U49'] });
    });
    T({ from: mine(any, field('Stamp', STAMPS.map(function (s) { return s.id; }))), event: d + '.stampShown', to: mine('=', {}), set: field('Stamp', 'sent'),
      note: 'モック操作。決定 (U27): 3 秒 (仮) たつとスタンプが消える。次を送れるのは送ってから 5 秒 (仮) 後', decided: ['U27'] });
    T({ from: mine(any, field('Stamp', STAMPS.map(function (s) { return s.id; }).concat(['sent']))), event: d + '.stampInterval', to: mine('=', {}), set: field('Stamp', null),
      note: 'モック操作。決定 (U27): 送ってから 5 秒 (仮) たつと次を送れる (表示中なら同時に消える)', decided: ['U27'] });
    T({ from: mine(stampable, field('Mute', false)), event: d + '.muteStamps', to: mine('=', {}), set: field('Mute', true),
      note: '決定 (U27 / U49): "Mute opponent emotes" で相手のスタンプをミュートする。同じ相手と続けて対戦している間 (再戦を含む) だけ続く。相手には知らせない', decided: ['U27', 'U49'] });
    T({ from: mine(stampable, field('Mute', true)), event: d + '.unmuteStamps', to: mine('=', {}), set: field('Mute', false),
      note: '決定 (U27 / U49): "Unmute opponent emotes" でミュートを解く', decided: ['U27', 'U49'] });
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
  'host.closeRoom': 'ホスト: Close Room を押す',
  'host.leaveRoom': 'ホスト: "Could not reconnect." の Leave Room を押す',
  'host.retry': 'ホスト: "Could not reconnect." の Retry を押す',
  'host.cancelSearch': 'ホスト: 相手を探している間に Cancel を押す',
  'host.leaveApp': 'ホスト: アプリを離れて戻る (モック操作: バックグラウンド・画面ロック)',
  'host.searchTimeout': 'ホスト: 60 秒 (仮) たっても相手が見つからない (モック操作)',
  'host.searchAgain': 'ホスト: Search again を押す',
  'host.closeNotice': 'ホスト: 通知・お知らせの Close を押す',
  'host.back': 'ホスト: ‹ (戻る / 別画面へ)',
  'host.tapToast': 'ホスト: 画面の下の帯 (トースト) をタップ',
  'host.matchMenu': 'ホスト: メニューボタン (☰) を押す',
  'host.matchMenu.continue': 'ホスト: MATCH MENU の CONTINUE を押す',
  'host.matchMenu.surrender': 'ホスト: MATCH MENU の SURRENDER を押す',
  'host.surrenderConfirm.continue': 'ホスト: 降参の確認で CONTINUE を押す',
  'host.surrenderConfirm.surrender': 'ホスト: 降参の確認で SURRENDER を押す',
  'host.backToOnlineBattle': 'ホスト: Back to Online を押す',
  'host.findNextOpponent': 'ホスト: Find Next Opponent を押す',
  'host.win': 'ホスト: 時間切れで勝つ (得点が上、モック操作)',
  'host.lose': 'ホスト: 時間切れで負ける (得点が下、モック操作)',
  'host.draw': 'ホスト: 時間切れで同点になる (モック操作)',
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
  'host.muteStamps': 'ホスト: Mute opponent emotes を押す (相手のスタンプをミュート)',
  'host.unmuteStamps': 'ホスト: Unmute opponent emotes を押す (ミュートを解く)',
  'host.dialog.closeRoom': 'ホスト: ダイアログで Close Room',
  'host.dialog.keepWaiting': 'ホスト: ダイアログで Keep Waiting',
  'host.dialog.createMatch': 'ホスト: ダイアログで Create Match',
  'host.dialog.joinMatch': 'ホスト: ダイアログで Join Match',
  'host.dialog.keepCurrent': 'ホスト: ダイアログで Keep Current Match',
  'host.dialog.leaveRoom': 'ホスト: ダイアログで Leave Room',
  'client.friendMatch': 'クライアント: Friend Match を選ぶ',
  'client.randomMatch': 'クライアント: Random Match を選ぶ',
  'client.enterCode': 'クライアント: QWERTY123 を入力',
  'client.joinMatch': 'クライアント: Join Match を押す',
  'client.ready': 'クライアント: Ready を押す',
  'client.cancelReady': 'クライアント: Cancel Ready を押す',
  'client.leaveRoom': 'クライアント: Leave Room を押す',
  'client.retry': 'クライアント: "Could not reconnect." の Retry を押す',
  'client.cancelSearch': 'クライアント: 相手を探している間に Cancel を押す',
  'client.leaveApp': 'クライアント: アプリを離れて戻る (モック操作: バックグラウンド・画面ロック)',
  'client.searchTimeout': 'クライアント: 60 秒 (仮) たっても相手が見つからない (モック操作)',
  'client.searchAgain': 'クライアント: Search again を押す',
  'client.closeNotice': 'クライアント: 通知・お知らせの Close を押す',
  'client.back': 'クライアント: ‹ (戻る / 別画面へ)',
  'client.tapToast': 'クライアント: 画面の下の帯 (トースト) をタップ',
  'client.matchMenu': 'クライアント: メニューボタン (☰) を押す',
  'client.matchMenu.continue': 'クライアント: MATCH MENU の CONTINUE を押す',
  'client.matchMenu.surrender': 'クライアント: MATCH MENU の SURRENDER を押す',
  'client.surrenderConfirm.continue': 'クライアント: 降参の確認で CONTINUE を押す',
  'client.surrenderConfirm.surrender': 'クライアント: 降参の確認で SURRENDER を押す',
  'client.backToOnlineBattle': 'クライアント: Back to Online を押す',
  'client.findNextOpponent': 'クライアント: Find Next Opponent を押す',
  'client.win': 'クライアント: 時間切れで勝つ (得点が上、モック操作)',
  'client.lose': 'クライアント: 時間切れで負ける (得点が下、モック操作)',
  'client.draw': 'クライアント: 時間切れで同点になる (モック操作)',
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
  'client.muteStamps': 'クライアント: Mute opponent emotes を押す (相手のスタンプをミュート)',
  'client.unmuteStamps': 'クライアント: Unmute opponent emotes を押す (ミュートを解く)',
  'client.dialog.leaveRoom': 'クライアント: ダイアログで Leave Room',
  'client.dialog.keepWaiting': 'クライアント: ダイアログで Keep Waiting',
  'sys.roomSynced': '自動: サーバーが参加を確認し、両者が部屋の画面にそろって同期が終わる',
  'sys.friendLeftShown': '自動: "Your friend left." を一度 5 秒 (仮) 出し終わる',
  'sys.readyConfirmed': '自動: 押した Ready が届く ("Confirming…" が終わる)',
  'sys.bothStarted': '自動: 開始の同期が終わる',
  'sys.opponentFound': '自動: 対戦相手が見つかる',
  'vs.done': '自動: VS 画面が終わる',
  'game.countdownDone': '自動: ゲーム本体のカウントダウンが終わる',
  'net.recovered': '環境: 通信が回復する',
  'net.bothDisconnected': '環境: 対戦中に両者の接続が切れる',
  'net.serviceFailure': '環境: 対戦中にサービス障害が起きる',
  'timer.disconnectTimeout': '環境: 切断から 20 秒 (仮) たつ',
  'timer.readyTimeout': '環境: 片方が Ready のまま 60 秒 (仮) たつ',
  'timer.loadTimeout': '環境: 読み込み (Starting match…) が 20 秒 (仮) で終わらない',
  'sys.syncFailed': '環境: 開始の同期に失敗する',
  'timer.rematchTimeout': '環境: 再戦の申し込みから 20 秒 (仮) たつ (応答なし)',
  'timer.rematchCooldown': '環境: 3 秒 (仮) たつ (また再戦を申し込める)',
  'sys.rematchSimultaneous': '環境: 両者が同時に Rematch を押す',
  'timer.codeExpired': '環境: Match Code の期限 (30 分、仮) が切れる',
};

// ---- 画面の描画仕様 ---------------------------------------------------------
// view: online | friendTop | lobby | stage | random | vs | game | result
// ボタンの event はデバイス名を除いたもの (例: 'ready' → 'host.ready')

// 画面の下の帯 (トースト)。tap があるものはタップで操作できる。sub は 2 行目 (決定 U6 の "Connection failed" の説明)
// 離席中のホストの帯はどれもタップで部屋の画面に戻る (決定 U1 / U16)。文言は決定 U1 / U7 / U17 / U19 / U55
var CONNECTION_FAILED = { create: 'Couldn\u2019t create a room. Try again.', join: 'Couldn\u2019t join the room. Try again.' };
var TOASTS = {
  waiting: { kind: 'blue', text: 'Waiting for your friend\u2026', tap: 'tapToast' },
  joined: { kind: 'green', text: 'Friend joined!', tap: 'tapToast' },
  friendInRoom: { kind: 'blue', text: 'Friend is in the room', tap: 'tapToast' },
  friendReady: { kind: 'red', text: 'Friend is ready!', tap: 'tapToast' },
  reconnecting: { kind: 'blue', text: 'Reconnecting\u2026', tap: 'tapToast' },
  friendLeft: { kind: 'blue', text: 'Your friend left.', tap: 'tapToast' },
  expired: { kind: 'darkred', text: 'Match code expired.', tap: 'tapToast' },
  failedCreate: { kind: 'grey', text: 'Connection failed', sub: CONNECTION_FAILED.create, tap: 'tapToast' },
  failedJoin: { kind: 'grey', text: 'Connection failed', sub: CONNECTION_FAILED.join, tap: 'tapToast' },
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
// 結果画面の終わった理由の行 (決定 U20 / U28 / U38 / U44)。時間切れで得点の高いほうが勝ち、同点なら引き分け (U44)
var END_REASONS = {
  timeUp: 'Time is up',
  timeUpTie: 'Same score when time ran out',
  surrendered: 'You surrendered',
  opponentSurrendered: 'Your opponent surrendered',
  disconnected: 'You were disconnected',
  opponentDisconnected: 'Your opponent disconnected',
  connectionError: 'No contest due to a connection error',
};
// 結果画面の再戦の段階ごとの一行 (決定 U23 / U25 / U30 / U50)。取り消し・辞退・期限切れは両者に出し、3 秒 (仮) のあとも次の操作まで残る (.Cooldown を除いた名前で引く)
var REMATCH_STATUS = {
  RematchRequested: { text: 'Waiting for your opponent…', kind: 'wait' },
  RematchIncoming: { text: 'Your opponent wants a rematch', kind: 'asked' },
  RematchCancelled: { text: 'Rematch request cancelled', kind: 'info' },
  RematchCancelledByYou: { text: 'Rematch request cancelled', kind: 'info' },
  RematchDeclined: { text: 'Your opponent declined the rematch', kind: 'info' },
  RematchDeclinedByYou: { text: 'Rematch declined', kind: 'info' },
  RematchExpired: { text: 'No response to rematch request', kind: 'info' },
  RematchExpiredIncoming: { text: 'Rematch request expired', kind: 'info' },
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
  } else if (spec.rematch && /\.Cooldown$/.test(ph)) rematch = [{ label: 'Rematch', disabled: true }];
  else if (spec.rematch && ph !== 'OpponentLeft') rematch = [{ label: 'Rematch', event: 'rematch', primary: !random }];
  var invited = rematch.some(function (b) { return b.primary; }) || ph === 'RematchRequested';
  if (!random) return rematch.concat([{ label: 'Back to Friend Match', event: 'backToFriendMatch', primary: !rematch.length }]);
  return [{ label: 'Find Next Opponent', event: 'findNextOpponent', primary: !invited }].concat(rematch, [{ label: 'Back to Online', event: 'backToOnlineBattle' }]);
}
// 片方が切断して 20 秒 (仮) 待っている間の表示 (決定 U46)。対戦中 (U28) と、ランダム対戦・再戦の開始前 (U54) で同じ。残りの秒数は timer で別に出す
var DISCONNECT_OVERLAYS = {
  self: { title: 'Connection lost', body: 'Reconnecting…' },
  opponent: { title: 'Your opponent disconnected', body: 'Waiting for your opponent to reconnect…' },
};
// ランダム対戦で相手を探すのをやめたときの通知 (決定 U13 / U43) と、ランダム対戦・再戦の開始前に相手が戻らなかった・自分が戻れなかったときの通知 (U54 / U52)。
// 60 秒という長さは端末の画面には出さない
var SEARCH_NOTICES = { stopped: 'Search stopped while the app was in the background.', notFound: 'No opponent found.',
  matchCancelled: 'Match cancelled. Opponent did not reconnect.', reconnectFailed: 'Could not reconnect. The match did not start.' };
// Friend Match トップの部屋のお知らせ (決定 U32 / U34 / U52 / U54)。画面の上の帯で、Close で閉じる
var ROOM_NOTICES = {
  HostLeft: 'Room closed. The host left.',
  HostDisconnected: 'Room closed. The host disconnected.',
  RoomClosed: 'The room was closed.',
  ReconnectFailed: SEARCH_NOTICES.reconnectFailed,
  MatchCancelled: SEARCH_NOTICES.matchCancelled,
};

// 右パネルに出す、その状態の画面の説明 (端末の画面の中には出さない)
var GAME_COUNTDOWN_CONTEXT = 'ゲーム本体のカウントダウン（VsAI と同じ 3→2→1）。終わるとメニューボタン (☰) が出てプレイ開始。' +
  '3-2-1 のあとサーバーが確認した時点で試合開始 (決定 U32)。それまでの切断は勝敗をつけない: Friend Match の Ready 画面から始まった対戦は Ready 画面に戻して相手は 20 秒 (仮) 待ち (U32)、' +
  'ランダム対戦と再戦は Ready 画面に戻さずに 20 秒 (仮) 待ち、戻ったら VS 画面からやり直す (U54)。';
var VS_CONTEXT = 'VS 画面 (10-01 の合意)。両者の名前・レーティング・あいさつ。架空の "Rank" はやめ、Friend Match でも "Rating {n}" を出す (決定 U48)。' +
  'モックは両者とも Elo の初期値 1000 (QA² 側の仮の値)。ここでの切断は、Friend Match の Ready 画面から始まった対戦なら U32、ランダム対戦と再戦なら U54。';
var GAME_CONTEXT = 'プレイ中のゲーム画面 (プレースホルダー)。右上のメニューボタン (☰) で MATCH MENU を開く (U37、試合は止まらない)。' +
  '決着は時間切れで、得点の高いほうが勝ち・同点なら引き分け (U44)。端末の下のモック操作「時間切れ」の勝ち / 負け / 同点で決着させ、「切断する」でこの端末の接続が切れる (U28 / U46)。';
// 結果画面の説明。端末の画面には出さず、右パネルに出す。秒数・Elo の値が QA² 側の仮の値であることもここと README にだけ書く
var RESULT_CONTEXT = '結果画面 (決定 U20〜U22 / U24 / U26)。勝敗・両者の名前・スコア・終わった理由を出す (スコアはモックのデモ値。No contest のように決まっていないときは行ごと出さない)。' +
  '時間切れで終わったときの理由は "Time is up"、同点の引き分けは "Same score when time ran out" (U44)。' +
  'レーティングはランダム対戦の最初の 1 戦だけ Elo で変わり、Friend Match と同じ相手との再戦では変わらない (U21)。Elo の初期値 1000・K=24 は QA² 側の仮の値。' +
  'ボタンは Friend Match なら Rematch / Back to Friend Match、ランダム対戦なら Find Next Opponent / Rematch / Back to Online。自動では次へ進まない (U26)。';
var RESULT_COOLDOWN_CONTEXT = '3 秒 (仮) は Rematch を押せない (右パネルの環境イベント「3 秒たつ」で進める)。3 秒たっても一行は残り、どちらかがまた申し込むか結果画面を抜けるまで出しておく (U50)。';
var RESULT_PHASE_CONTEXT = {
  RematchRequested: '自分が再戦を申し込んで待っている (U23 / U30)。Cancel Request で取り消せる。応答の期限 20 秒 (仮) は右パネルの環境イベントで進める (秒数は端末の画面に出さない)。',
  RematchIncoming: '相手から再戦を申し込まれた (U23 / U30)。Rematch で応じるとそのまま VS 画面、Decline で断る。',
  RematchCancelled: '相手が申し込みを取り消した (U30)。取り消した側と同じ "Rematch request cancelled" を出す (2026-10-08 に両者の文言を統一)。両者とも結果画面に残る。',
  RematchCancelledByYou: '自分が申し込みを取り消した。取り消した側にも "Rematch request cancelled" を出す (U50。相手と同じ文言、2026-10-08)。両者とも結果画面に残る。',
  RematchDeclined: '相手が再戦を断った (U30)。両者とも結果画面に残る。',
  RematchDeclinedByYou: '自分が再戦を断った。断った側にも "Rematch declined" を出す (U50)。両者とも結果画面に残る。',
  RematchExpired: '再戦の申し込みに 20 秒 (仮) 応答がなかった (U30)。両者とも結果画面に残る。',
  RematchExpiredIncoming: '申し込まれた再戦に 20 秒 (仮) 応答しなかった。申し込まれた側にも "Rematch request expired" を出す (U50)。両者とも結果画面に残る。',
  OpponentLeft: '相手が結果画面を抜けた (決定 U25)。勝敗とレートは変わらず、再戦はできない。',
};
var STAMP_CONTEXT = 'スタンプ (決定 U27): 👏 Good game / 🤝 Thanks for the match / 👍 Nice。1 つ 3 秒 (仮) 出て、次を送れるのは送ってから 5 秒 (仮) 後 (どちらも端末の下のモック操作で進める)。' +
  '"Mute opponent emotes" で相手のスタンプをミュートでき、同じ相手と続けて対戦している間 (再戦を含む) だけ続く。自分のスタンプは自分の画面に出し、ミュートしたことは相手に知らせない (U49)。';
var MATCHMAKE_CONTEXT = 'ランダム対戦で相手を探している画面 (決定 U13a / U13)。相手が見つかり次第 VS 画面へ進む (Ready 画面は無い)。' +
  'Cancel と ‹ はどちらも確認なしで Online Battle へ戻る (U13)。探している間は、ほかの画面へは行けない。' +
  'アプリを離れる (バックグラウンド・画面ロック) と検索を止める。60 秒探しても見つからなければ Online Battle に "No opponent found." を出す (60 秒という長さは仮)。' +
  'どちらも端末の下のモック操作で試せる。';
var SEARCH_STOPPED_CONTEXT = 'アプリを離れた (バックグラウンド・画面ロック) ので検索を止めた (決定 U13)。戻ると Online Battle の中に "Search stopped while the app was in the background." を出す (決定 U43)。' +
  '結果画面の Find Next Opponent から探していたときも同じ (U47)。' +
  'モーダルではないので Random Match / Friend Match もそのまま押せる。Search again で新しく探し、Close で閉じる。自動では消えず、ほかの画面へ移ると消える。';
var SEARCH_NOT_FOUND_CONTEXT = '60 秒探しても相手が見つからなかった (決定 U13、60 秒という長さは仮)。元の画面 (Online Battle) に "No opponent found." を出す。' +
  'Search again でもう一度相手を探し (Searching に戻る)、Close で通知を閉じて Online Battle のまま。';
var START_CANCELLED_CONTEXT = {
  MatchCancelled: 'ランダム対戦 (再戦を含む) の VS 画面・カウントダウン中に相手が切断し、20 秒 (仮) のうちに戻らなかったので試合を取りやめた (決定 U54)。勝敗は無く、レートも変わらない。' +
    'Online Battle の中に "Match cancelled. Opponent did not reconnect." と Search again / Close (U43 と同じくモーダルではない。文言は U32 の文言にそろえた。どちらも 2026-10-08 に確認)。',
  ReconnectFailed: 'ランダム対戦 (再戦を含む) の VS 画面・カウントダウン中にこの端末の接続が切れ、20 秒 (仮) のうちに戻れなかった (決定 U54)。勝敗は無く、レートも変わらない。' +
    'Online Battle の中に "Could not reconnect. The match did not start." (U52) と Search again / Close (U43 と同じくモーダルではない)。',
};
var MATCH_MENU_CONTEXT = 'MATCH MENU (決定 U37)。試合は止まらない: Time.timeScale = 0 にせず、暗幕も薄くしてゲームが見えたまま。メニュー中に試合が終われば (時間切れ) そのまま結果画面へ。' +
  '開いただけでは相手の端末には何も出ない (U38)。対戦中に REMATCH / RETRY は無い (U39、再戦は結果画面だけ)。BGM も下げない (U42、モックには音が無い)。' +
  '試合が止まるのは片方の切断を待つ 20 秒 (仮) の間だけ (U46)。';
var SURRENDER_CONFIRM_CONTEXT = '降参の確認 (決定 U40)。確認中も試合は続く。CONTINUE でプレイに戻り、SURRENDER で負けが決まって相手は勝ちの結果画面に "Your opponent surrendered" (U38)。ボタンは QUIT ではなく SURRENDER (U41)。';
var SPECIAL_RESULT_CONTEXT = {
  Surrendered: '降参した側の負けの結果画面 (決定 U38)。Friend Match でもランダム対戦でも Back to Online で Online Battle へ戻る (決定 U41 / U24)。再戦は無い (U28 / U45)。',
  OpponentSurrendered: '相手が降参したので勝ち。"Your opponent surrendered" を出す (決定 U38)。降参で終わった試合のあとは、どちらからも再戦できない (U45)。',
  Disconnected: '自分の接続が切れ、20 秒 (仮) のうちに戻れなかったので負け (決定 U28)。ランダム対戦ではレートも変わる。切断で終わった試合のあとは再戦できない (U45)。',
  OpponentDisconnected: '相手の接続が切れ、20 秒 (仮) のうちに戻らなかったので勝ち (決定 U28)。切断で終わった試合のあとは再戦できない (U45)。',
  NoContest: '両者の切断かサービス障害で、勝敗なし (決定 U28)。"No contest due to a connection error"、レートは変わらない。スコアは決まっていないので行ごと出さない (U20)。再戦はできない (U45)。',
};
var DISCONNECT_CONTEXT = {
  self: 'この端末の接続が切れた (決定 U28)。20 秒 (仮) のうちに戻れば試合を続け、戻れなければ負け。待っている間はサーバーが両者のゲームと得点を止め、' +
    '"Connection lost" / "Reconnecting…" と残りの秒数を出す (U46。20 秒は QA² 側の仮の値で、モックは "20s" のまま描く)。MATCH MENU では試合は止まらない (U37)。' +
    '端末の下のモック操作 (または右パネルの環境イベント) で「再接続する」「20 秒たつ」を選べる。',
  opponent: '相手の接続が切れたので 20 秒 (仮) 待つ (決定 U28)。戻らなければ勝ち。待っている間はサーバーが両者のゲームと得点を止め、' +
    '"Your opponent disconnected" / "Waiting for your opponent to reconnect…" と残りの秒数を出す (U46)。時間切れの決着は押せない。',
};
var START_DISCONNECT_CONTEXT = {
  self: 'ランダム対戦か再戦の VS 画面・カウントダウン中に、この端末の接続が切れた (決定 U54)。試合はまだ始まっていないので、Ready 画面には戻さずに 20 秒 (仮) 待つ。' +
    '表示は対戦中の切断 (U46) と同じ "Connection lost" / "Reconnecting…" と残りの秒数。戻れば VS 画面からやり直し、戻れなければ試合を取りやめる (勝敗なし・レートは変わらない)。',
  opponent: 'ランダム対戦か再戦の VS 画面・カウントダウン中に相手の接続が切れた (決定 U54)。Ready 画面には戻さずに 20 秒 (仮) 待つ (表示は U46 と同じ)。' +
    '戻れば VS 画面からやり直し、戻らなければ試合を取りやめる: ランダム対戦は Online Battle に "Match cancelled. Opponent did not reconnect." と Search again / Close、' +
    'Friend Match の再戦は Friend Match トップの帯 (行き先は 2026-10-08 に確認)。',
};
var NEXT_SEARCH_CONTEXT = '結果画面の Find Next Opponent で次の相手を探している (決定 U29)。見た目と Cancel / ‹ は Random Match から探しているとき (U13) と同じ。' +
  '60 秒 (仮) 探しても見つからなければ "No opponent found." と Search again / Back to Online。探している間にアプリを離れると、Random Match のとき (U43) と同じく Online Battle の中に "Search stopped…" (U47)。';
var NEXT_NOT_FOUND_CONTEXT = '60 秒 (仮) 探しても次の相手が見つからなかった (決定 U29)。Search again でもう一度探し、Back to Online で Online Battle へ。' +
  '(Random Match から探したとき (U13) は Online Battle の上に出すので Close だが、こちらは Random Match の画面の上に出すので Back to Online)';

// Ready 画面 (決定 U31 変更 / U32〜U36)。60 秒・20 秒は端末の画面にはカウントダウンとして出すが、それが QA² 側の仮の値であることは右パネルと README にだけ書く
var READY_TEXT = {
  waiting: 'Waiting for opponent\u2026',
  opponentReady: 'Opponent is ready. Are you?',
  confirming: 'Confirming\u2026',
  starting: 'Starting match\u2026',
  opponentDisconnected: 'Opponent disconnected.\nWaiting for them to reconnect\u2026',
};
// 部屋の画面の状況の一行 (決定 U4 / U5 / U7 / U10 / U18 / U52)
var ROOM_TEXT = {
  waiting: 'Waiting for your friend\u2026',
  friendJoined: 'Friend joined!',
  connecting: 'Connecting\u2026',
  connectionLost: 'Connection lost.\nReconnecting\u2026',
  friendDisconnected: 'Your friend disconnected.\nWaiting for them to reconnect\u2026',
  couldNotReconnect: 'Could not reconnect.',
  codeExpired: 'Match code expired.',
};
// Match Code の期限 (決定 U7)。30 分は QA² 側の仮の値で、サーバーが数える。モックは "30:00" のまま描く
var CODE_EXPIRY = { minutes: 30, text: 'Code expires in 30:00' };
var READY_NOTICE_TEXT = {
  TimedOut: 'Ready check timed out. Press Ready when you\u2019re ready.',
  OpponentNotReady: 'Opponent is no longer ready.',
  StartFailed: 'Match could not start. Please try again.',
  SyncFailed: 'Couldn\u2019t start the match. Please ready up again.',
};
var READY_TIMERS = { ready: 60, reconnect: 20 }; // 秒。どちらも QA² 側の仮の値 (U33 / U5 / U32 / U46 / U54)
var ROOM_RULES_CONTEXT = 'Match Code の期限は 30 分 (QA² 側の仮の値) で、サーバーが数える。読み込み・VS 画面・カウントダウン・U32 の再接続待ちの間は時計が止まり、部屋での切断 (U5) の再接続待ちの間は止まらない (決定 U7)。' +
  'ホストは Close Room で部屋を閉じ (確認 "Close this room?"、U51)、\u2039 では確認なしで部屋を残したまま離れる (自分の Ready は消える、U14)。クライアントは Leave Room と \u2039 で確認 "Leave this room?" を出す (U9)。';
var READY_CONTEXT = 'Ready 画面 (決定 U31 変更 / U36)。プレイヤーごとのカードに "\u2713 Ready" / "Not ready"。両者が Ready を押したら "Starting match\u2026" → VS 画面 → ゲーム本体のカウントダウン。' +
  'Ready を取り消せるのは届いたあとの Ready 画面だけで、送っている間と読み込み・VS 画面から先は取り消せない (U53)。3-2-1 のあとサーバーが確認するまでは試合開始ではなく、勝敗は記録しない (U32)。' + ROOM_RULES_CONTEXT +
  '端末の下のモック操作「アプリを離れる」でその人の Ready が消え (U35)、「切断する」で部屋での切断になる (U5)。ホストが離れている間、クライアントのカードのホストは "Away"。';
var RECONNECT_TIMER_CONTEXT = '20 秒は QA² 側の仮の値で、モックは "20s" のまま描く。';
var READY_PHASE_CONTEXT = {
  Confirming: 'Ready を送っている間 (決定 U36)。ボタンが "Confirming\u2026" になり、届くと自動で次へ進む (モックは 0.8 秒)。送っている間は Ready を取り消せず、Close Room / Leave Room / \u2039 も押せない (U53)。',
  WaitingForOpponent: '自分だけ Ready (決定 U36)。"Waiting for opponent\u2026" と 60 秒のカウントダウン、Cancel Ready。60 秒は QA² 側の仮の値で、モックは押した直後の "60s" のまま描く。' +
    '相手が押さないまま 60 秒たつと (右パネルの環境イベント) 両者の Ready が消えて "Ready check timed out…" (U33)。Cancel Ready で取り消しても、部屋には残る (U34)。',
  OpponentReady: '相手だけ Ready (決定 U36)。"Opponent is ready. Are you?"。Ready を押せば開始する。離席中に "Friend is ready!" の帯をタップして戻ったときもこの画面 (Ready は押していない、U1)。',
  TimedOut: '片方が Ready のまま 60 秒 (仮) たったので、両者の Ready を消した (決定 U33)。罰はなく、どちらも部屋に残る。',
  OpponentNotReady: '相手が Ready を取り消した (Cancel Ready、決定 U34)、アプリを離れて Ready が消えた (決定 U35)、またはホストが別の画面へ移って Ready が消えた (決定 U14)。相手への表示はどれも同じ (U53)。',
  StartFailed: '読み込み ("Starting match\u2026") が 20 秒 (仮) で終わらなかった (決定 U32)。両者とも Ready 画面に戻り、Ready は消えている。もう一度両者が Ready を押せば開始する。',
  SyncFailed: '開始の同期に失敗した (決定 U15)。両者の Ready を消し、ふつうの Ready の流れ (60 秒 (仮) の期限つき) からやり直す。Match Code が有効な間は何度でもやり直せる。',
  Starting: '両者の Ready がそろい、読み込み中 (決定 U31 / U32)。20 秒 (仮) で終わらなければ "Match could not start. Please try again."、同期に失敗すれば "Couldn\u2019t start the match. Please ready up again." で両者とも Ready 画面に戻る (U15、どちらも右パネルの環境イベント)。' +
    '読み込み中は Ready を取り消せず、Cancel Ready / Close Room / Leave Room / \u2039 を出さない (U53)。ここでの切断は部屋での切断 (U5)。',
  OpponentDisconnected: 'VS 画面・カウントダウン中に相手の接続が切れた (決定 U32)。両者の Ready を消し、"Opponent disconnected. Waiting for them to reconnect\u2026" と 20 秒のカウントダウン。' + RECONNECT_TIMER_CONTEXT +
    '戻れば (右パネルの環境イベント「通信が回復する」) 両者とももう一度 Ready を押し、カウントダウンは 3 からやり直す。' +
    '戻らなければ (「切断から 20 秒たつ」)、相手がクライアントならホストは "Match cancelled. Opponent did not reconnect." で同じ Match Code のまま部屋に残り、相手がホストならクライアントは "Room closed. The host disconnected." で Friend Match トップへ。勝敗は記録しない。',
  Reconnecting: 'VS 画面・カウントダウン中にこの端末の接続が切れた (決定 U32)。"Connection lost. Reconnecting\u2026" と 20 秒のカウントダウン (U52)。' + RECONNECT_TIMER_CONTEXT +
    '戻れなければ Friend Match トップに "Could not reconnect. The match did not start." (U52)。',
  FriendJoined: '友だちが入った (決定 U4)。サーバーが参加を確認し、両者が部屋の画面にいて同期が終わると Ready を押せる (決まった待ち時間ではない。モックは 0.8 秒で自動で進む)。',
  Connecting: '部屋に入った (決定 U4)。同期が終わるまでは "Connecting\u2026" で Ready を押せない。ホストが別の画面にいる間は同期が終わらない (ホストが戻ると進む)。Leave Room と \u2039 で確認を出す (U9)。',
  ConnectionLost: '部屋でこの端末の接続が切れた (決定 U5)。両者の Ready は消え、20 秒まで自動で再接続する ("Connection lost. Reconnecting\u2026" と残りの秒数、U52)。' + RECONNECT_TIMER_CONTEXT +
    '戻れれば (右パネルの環境イベント「通信が回復する」) Ready 画面へ、戻れなければ (「切断から 20 秒たつ」) "Could not reconnect."。この間も Match Code の期限の時計は止まらない (U7)。',
  FriendDisconnected: '部屋で相手の接続が切れた (決定 U5)。両者の Ready は消え、"Your friend disconnected. Waiting for them to reconnect\u2026" で 20 秒待つ。' +
    '残りの秒数も出す (切れた側 (U52) と VS 画面中の切断 (U32) にそろえた。2026-10-08 に確認)。' + RECONNECT_TIMER_CONTEXT +
    '戻らなければ、相手がクライアントならホストは空の部屋を残して "Waiting for your friend…"、相手がホストならクライアントは Friend Match トップに "The room was closed." (U52)。',
  CouldNotReconnect: '20 秒 (仮) で再接続できなかった (決定 U5)。Retry でもう一度つなぎ直し、Leave Room で抜ける。' +
    'クライアントは Friend Match トップへ戻り ("The room was closed.")、ホストは空の部屋を残している (Retry でつながると、ホストはその部屋に、クライアントはまだ部屋があれば入り直す)。',
};
var ROOM_NOTICE_CONTEXT = '部屋のお知らせは画面の上の帯で、モーダルではない (決定 U52)。Close で閉じるまで残り、Match Code を入れても消えない。ほかの画面へ移る (‹・Create Match・Join Match の結果) と消える。';
var ROOM_CONTEXT = {
  Waiting: '部屋を作った (図01)。"Code expires in 30:00" は Match Code の期限 (決定 U7。30 分は QA² 側の仮の値で、モックは数えない)。' + ROOM_RULES_CONTEXT,
  ClientLeft: '友だちが抜けた (決定 U34)。同じ Match Code のまま、次の友だちを待つ。図05 の "left the match." → 自動で待機に戻る流れを、この 1 画面にまとめた。',
  MatchCancelled: 'VS 画面・カウントダウン中に切断した友だちが 20 秒 (仮) のうちに戻らなかった (決定 U32)。結果は無く、同じ Match Code のまま部屋に残って次の友だちを待つ。',
  HostLeft: 'ホストが部屋を閉じた (決定 U34)。Friend Match トップに "Room closed. The host left."。前の Match Code は使えない。' + ROOM_NOTICE_CONTEXT,
  HostDisconnected: 'VS 画面・カウントダウン中に切断したホストが 20 秒 (仮) のうちに戻らなかった (決定 U32)。Friend Match トップに "Room closed. The host disconnected."。' + ROOM_NOTICE_CONTEXT,
  RoomClosed: '部屋で切断したホストが 20 秒 (仮) のうちに戻らなかった (決定 U5 / U52)。Friend Match トップに "The room was closed." ("You left the room" とは出さない)。' +
    'Match Code の入力欄は空にした (2026-10-08 に確認。ホストが Retry で空の部屋に戻っていれば、同じ Match Code で入り直せる)。' + ROOM_NOTICE_CONTEXT,
  ReconnectFailed: '試合が始まる前 (VS 画面・カウントダウン) に切断し、20 秒 (仮) のうちに戻れなかった (決定 U52)。Friend Match トップに "Could not reconnect. The match did not start."。' +
    'Friend Match の再戦の開始前 (U54) も同じ (行き先は 2026-10-08 に確認)。' + ROOM_NOTICE_CONTEXT,
  RoomMatchCancelled: 'Friend Match の再戦の VS 画面・カウントダウン中に相手が切断し、20 秒 (仮) のうちに戻らなかった (決定 U54)。勝敗は無い。' +
    'Friend Match トップに "Match cancelled. Opponent did not reconnect." (行き先と文言は Back to Friend Match (U24) と U32 にそろえた。2026-10-08 に確認)。' + ROOM_NOTICE_CONTEXT,
  CodeExpired: 'Match Code の期限 (30 分、QA² 側の仮の値) が切れた (決定 U7)。両者に "Match code expired."。Ready は出さず、ホストは Create Match で新しい部屋を作り、クライアントは Join Match で新しい Match Code を入れる (決定 U10)。' +
    'クライアントは別の画面へ移されず、今の画面のまま (決定 U18)。部屋での切断を待っている間に切れたときは、戻った側もこの画面。',
  ConnectionFailed: 'Create Match / Join Match がサーバーに届かなかった (決定 U6)。"Connection failed" はこのときだけで、Match Code の誤り・期限切れ・満員・閉じた部屋の赤字とは別。タップで閉じる。',
  Away: 'ホストが \u2039 で部屋の画面を離れた (決定 U14、確認は出さない)。部屋は残り、画面の下の帯で部屋の様子を示す。帯をタップすると部屋の画面に戻るだけで、Ready は押さない (U1 / U16)。' +
    '青 "Waiting for your friend\u2026" (友だちがいない)、青 "Friend is in the room" (友だちはいるが Ready していない、U55)、緑 "Friend joined!" (本当に入った・入り直したときだけ、U17)、' +
    '赤 "Friend is ready!" (U1)、"Reconnecting\u2026" (友だちの再接続待ち。20 秒 (仮) たつと "Waiting for your friend\u2026"、U19)、"Your friend left." (一度だけ 5 秒 (仮)、U17 / U55)、濃い赤 "Match code expired." (U7)。',
};

var SCREENS = (function () {
  var S = {};
  var B = {
    // Ready 画面 (決定 U31 変更 / U34 / U36)。送っている間のボタンは無効表示 (遷移表の「行なし」の破線とは別の、ゲーム内の見た目)
    // Ready は、相手がまだ Ready 画面に来ていない間 (図02 でホストが戻った直後など) は出さない
    ready: { label: 'Ready', event: 'ready', primary: true, hideIfNoRow: true },
    confirming: { label: 'Confirming\u2026', primary: true, disabled: true },
    cancelReady: { label: 'Cancel Ready', event: 'cancelReady' },
    readyOff: { label: 'Ready', primary: true, disabled: true },
    // 部屋を出るボタン: クライアントは Leave Room (決定 U9)、ホストは Close Room (決定 U14)
    leaveRoom: { label: 'Leave Room', event: 'leaveRoom' },
    leaveRoomOff: { label: 'Leave Room', disabled: true },
    closeRoom: { label: 'Close Room', event: 'closeRoom' },
    closeRoomOff: { label: 'Close Room', disabled: true },
    retry: { label: 'Retry', event: 'retry', primary: true },
    createMatch: { label: 'Create Match', event: 'createMatch', primary: true },
    joinMatch: { label: 'Join Match', event: 'joinMatch', primary: true },
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
  // アプリを離れて止まったとき (決定 U43 / U47) と、ランダム対戦・再戦の開始前に取りやめたとき (U54): Online Battle の中に出す。モーダルではなく、ほかの操作を妨げない
  function inlineSearchNotice(text, extra) {
    return Object.assign(online(), { inlineNotice: { text: text, buttons: noticeButtons() }, decided: ['U13', 'U43'] }, extra);
  }
  // 結果画面の Find Next Opponent で次の相手を探す (決定 U29 / U47)。見た目は Random Match から探すときと同じ
  function nextSearch() {
    return Object.assign(matchmake(), { decided: ['U29', 'U13a', 'U47'], context: NEXT_SEARCH_CONTEXT });
  }
  function nextNotFound() {
    return { view: 'random', title: 'Random Match', back: null, buttons: [], notice: { text: SEARCH_NOTICES.notFound, buttons: [
      { label: 'Search again', event: 'searchAgain', primary: true }, { label: 'Back to Online', event: 'backToOnlineBattle' }] },
    decided: ['U29'], context: NEXT_NOT_FOUND_CONTEXT };
  }
  // 片方が切断して 20 秒 (仮) 待っている間 (決定 U46)。サーバーが両者のゲームと得点を止めるので、暗幕は MATCH MENU より濃くし、残りの秒数を出す。
  // 対戦中 (U28) はゲーム画面の上、ランダム対戦・再戦の開始前 (U54) は VS 画面の上
  function disconnectWait(who) {
    return { view: 'game', overlay: DISCONNECT_OVERLAYS[who], timer: READY_TIMERS.reconnect, decided: ['U28', 'U46'], context: DISCONNECT_CONTEXT[who] };
  }
  function startDisconnectWait(who) {
    return { view: 'vs', overlay: DISCONNECT_OVERLAYS[who], timer: READY_TIMERS.reconnect, decided: ['U54', 'U46'], context: START_DISCONNECT_CONTEXT[who] };
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
  // Friend Match トップの部屋のお知らせ (決定 U52)。モーダルではない帯で、Close で閉じる
  function roomNotice(key, decided) {
    return { roomNotice: { text: ROOM_NOTICES[key], buttons: [{ label: 'Close', event: 'closeNotice' }] }, decided: decided,
      context: ROOM_CONTEXT[key === 'MatchCancelled' ? 'RoomMatchCancelled' : key] };
  }
  // 部屋の画面。Match Code の下に期限 "Code expires in 30:00" (決定 U7)。期限が切れた画面では出さない
  function lobby(extra) {
    return Object.assign({ view: 'lobby', title: 'Friend Match', back: 'back', buttons: [], expiry: true }, extra);
  }
  // Ready 画面: プレイヤーごとのカード (自分・相手の Ready)、状況の一行、カウントダウン (秒)、お知らせ、ボタン。
  // 部屋を出るボタンはホストが Close Room (U14)、クライアントが Leave Room (U9)
  function readyLobby(R, mine, theirs, phase, extra) {
    var exit = R === 'Host' ? B.closeRoom : B.leaveRoom;
    var spec = lobby({ cards: { me: mine, them: theirs }, buttons: [B.ready, exit], decided: ['U31', 'U36', 'U7', R === 'Host' ? 'U14' : 'U9'],
      context: [READY_CONTEXT].concat(READY_PHASE_CONTEXT[phase] || []) });
    return Object.assign(spec, extra, { decided: spec.decided.concat((extra && extra.decided) || []) });
  }
  function readyScreens(R) {
    var L = function (s) { return lobbyState(R, s); };
    var exit = R === 'Host' ? B.closeRoom : B.leaveRoom;
    var exitOff = R === 'Host' ? B.closeRoomOff : B.leaveRoomOff;
    var notice = function (k, decided, undecided) {
      S[L('Ready.' + k)] = readyLobby(R, false, false, k, { readyNotice: READY_NOTICE_TEXT[k], decided: decided, undecided: undecided || [] });
    };
    S[L('Ready')] = readyLobby(R, false, false, null, { decided: ['U4'] });
    notice('TimedOut', ['U33']);
    notice('OpponentNotReady', ['U34', 'U35', 'U14', 'U53']);
    notice('StartFailed', ['U32']);
    notice('SyncFailed', ['U15', 'U33']);
    S[L('Ready.Confirming')] = readyLobby(R, false, false, 'Confirming', { back: 'disabled', buttons: [B.confirming, exitOff], decided: ['U53'] });
    S[L('Ready.WaitingForOpponent')] = readyLobby(R, true, false, 'WaitingForOpponent', { status: READY_TEXT.waiting, timer: READY_TIMERS.ready,
      buttons: [B.cancelReady, exit], decided: ['U33', 'U34'] });
    S[L('Ready.OpponentReady')] = readyLobby(R, false, true, 'OpponentReady', { status: READY_TEXT.opponentReady, decided: R === 'Host' ? ['U1'] : [] });
    S[L('Ready.OpponentReady.Confirming')] = readyLobby(R, false, true, 'Confirming', { status: READY_TEXT.opponentReady, back: 'disabled',
      buttons: [B.confirming, exitOff], decided: ['U53'] });
    S[L('Starting')] = readyLobby(R, true, true, 'Starting', { status: READY_TEXT.starting, back: 'disabled', buttons: [], decided: ['U32', 'U15', 'U53'] });
    // 同期の前 (決定 U4): ホストは "Friend joined!"、クライアントは "Connecting…"。どちらも Ready はまだ押せない
    S[R === 'Host' ? L('FriendJoined') : L('Connecting')] = readyLobby(R, false, false, R === 'Host' ? 'FriendJoined' : 'Connecting', {
      status: R === 'Host' ? ROOM_TEXT.friendJoined : ROOM_TEXT.connecting, buttons: [B.readyOff, exit], decided: ['U4', 'U17'] });
    // 部屋での切断 (決定 U5): 切れた側 / 残った側 / 再接続できなかった側。どちらにも残りの秒数 (切れた側は U52、残った側は 2026-10-08 に確認)
    S[L('ConnectionLost')] = readyLobby(R, false, false, 'ConnectionLost', { status: ROOM_TEXT.connectionLost, timer: READY_TIMERS.reconnect, back: 'disabled', buttons: [],
      decided: ['U5', 'U52'] });
    S[L('FriendDisconnected')] = readyLobby(R, false, false, 'FriendDisconnected', { status: ROOM_TEXT.friendDisconnected, timer: READY_TIMERS.reconnect, buttons: [exit],
      decided: ['U5', 'U34'].concat(R === 'Host' ? ['U19'] : []) });
    S[L('CouldNotReconnect')] = lobby({ status: ROOM_TEXT.couldNotReconnect, back: null, buttons: [B.retry, B.leaveRoom], expiry: false, decided: ['U5'],
      context: [READY_PHASE_CONTEXT.CouldNotReconnect] });
    // VS 画面・カウントダウン中の切断 (決定 U32)。切れた側は "Connection lost. Reconnecting…" と残りの秒数 (U52)
    S[L('Reconnecting')] = readyLobby(R, false, false, 'Reconnecting', { status: ROOM_TEXT.connectionLost, timer: READY_TIMERS.reconnect, back: 'disabled', buttons: [],
      decided: ['U32', 'U52'] });
    S[L('OpponentDisconnected')] = readyLobby(R, false, false, 'OpponentDisconnected', { status: READY_TEXT.opponentDisconnected, timer: READY_TIMERS.reconnect,
      buttons: [exit], decided: ['U32', 'U34'] });
    // 期限切れ (決定 U7 / U10 / U18): Ready は出さず、ホストは Create Match、クライアントは Join Match
    S[L('CodeExpired')] = lobby({ status: ROOM_TEXT.codeExpired, expiry: false, buttons: [R === 'Host' ? B.createMatch : B.joinMatch],
      decided: ['U7', 'U10'].concat(R === 'Client' ? ['U18'] : []), context: ROOM_CONTEXT.CodeExpired });
  }
  var errMsg = {
    NotFound: 'Match not found. Check the Match Code and try again.',
    Expired: 'The match has expired.',
    Full: 'The match is already full.',
  };

  // --- ホスト ---
  S['Host.MultiModeSelection'] = online('host');
  S['Host.FriendMatch.Room'] = top({});
  S['Host.FriendMatch.Room.ConnectionFailed'] = top({ toast: 'failedCreate', decided: ['U6'], context: ROOM_CONTEXT.ConnectionFailed });
  S['Host.FriendMatch.Room.ReconnectFailed'] = top(roomNotice('ReconnectFailed', ['U52', 'U32', 'U54']));
  S['Host.FriendMatch.Room.MatchCancelled'] = top(roomNotice('MatchCancelled', ['U54', 'U52']));
  S['Host.FriendMatch.Lobby.Waiting'] = lobby({ status: ROOM_TEXT.waiting, buttons: [B.closeRoom], decided: ['U7', 'U14'], context: ROOM_CONTEXT.Waiting });
  readyScreens('Host');
  S['Host.FriendMatch.Lobby.ClientLeft'] = lobby({ status: 'Your friend left.\nWaiting for another friend\u2026', buttons: [B.closeRoom],
    decided: ['U34', 'U7', 'U14'], context: ROOM_CONTEXT.ClientLeft });
  S['Host.FriendMatch.Lobby.MatchCancelled'] = lobby({ status: 'Match cancelled.\nOpponent did not reconnect.', buttons: [B.closeRoom],
    decided: ['U32', 'U7', 'U14'], context: ROOM_CONTEXT.MatchCancelled });
  // ホストが ‹ で部屋の画面を離れている間 (決定 U14): Friend Match トップかステージ選択の下に、部屋の様子の帯
  var awayToast = { Waiting: 'waiting', FriendJoined: 'joined', FriendInRoom: 'friendInRoom', FriendReady: 'friendReady', Reconnecting: 'reconnecting', FriendLeft: 'friendLeft', Expired: 'expired' };
  var awayDecided = { Waiting: ['U16'], FriendJoined: ['U16', 'U17', 'U4'], FriendInRoom: ['U16', 'U17', 'U55'], FriendReady: ['U1', 'U16'], Reconnecting: ['U19', 'U16', 'U5'],
    FriendLeft: ['U17', 'U16', 'U55'], Expired: ['U7', 'U10'] };
  AWAY_PLACES.forEach(function (p) {
    Object.keys(awayToast).forEach(function (s) {
      var extra = { toast: awayToast[s], decided: ['U14'].concat(awayDecided[s]), context: ROOM_CONTEXT.Away };
      S[away(p, s)] = p === 'FriendMatchRoom' ? top(extra) : Object.assign({ view: 'stage', back: 'back' }, extra);
    });
  });
  S['Host.Matchmake'] = matchmake();
  S['Host.Matchmake.Stopped'] = inlineSearchNotice(SEARCH_NOTICES.stopped, { context: SEARCH_STOPPED_CONTEXT });
  S['Host.Matchmake.MatchCancelled'] = inlineSearchNotice(SEARCH_NOTICES.matchCancelled, { decided: ['U54', 'U43'], context: START_CANCELLED_CONTEXT.MatchCancelled });
  S['Host.Matchmake.ReconnectFailed'] = inlineSearchNotice(SEARCH_NOTICES.reconnectFailed, { decided: ['U54', 'U52', 'U43'], context: START_CANCELLED_CONTEXT.ReconnectFailed });
  S['Host.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Host.Matchmake.NextOpponent'] = nextSearch();
  S['Host.Matchmake.NextOpponent.NotFound'] = nextNotFound();
  S['Host.Opponent'] = { view: 'vs', decided: ['U32', 'U48', 'U54'], context: VS_CONTEXT };
  S['Host.Opponent.Disconnected'] = startDisconnectWait('self');
  S['Host.Opponent.OpponentDisconnected'] = startDisconnectWait('opponent');
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
  // 部屋のお知らせ (決定 U52): HostLeft (U34)、HostDisconnected (U32)、RoomClosed (U5)、ReconnectFailed (U32 / U54)、MatchCancelled (U54)。Match Code を入れた .CodeEntered も
  var noticeDecided = { HostLeft: ['U34'], HostDisconnected: ['U32'], RoomClosed: ['U5'], ReconnectFailed: ['U32', 'U54'], MatchCancelled: ['U54'] };
  ROOM_NOTICE_KEYS.forEach(function (k) {
    var spec = roomNotice(k, ['U52'].concat(noticeDecided[k]));
    S['Client.FriendMatch.Room.' + k] = top(spec);
    S['Client.FriendMatch.Room.' + k + '.CodeEntered'] = top(Object.assign({}, spec, { input: 'QWERTY123' }));
  });
  Object.keys(errMsg).forEach(function (k) {
    S['Client.FriendMatch.Room.Error.' + k] = top({ input: 'QWERTY123', error: errMsg[k] });
  });
  S['Client.FriendMatch.Room.ConnectionFailed'] = top({ input: 'QWERTY123', toast: 'failedJoin', decided: ['U6'], context: ROOM_CONTEXT.ConnectionFailed });
  readyScreens('Client');
  S['Client.Matchmake'] = matchmake();
  S['Client.Matchmake.Stopped'] = inlineSearchNotice(SEARCH_NOTICES.stopped, { context: SEARCH_STOPPED_CONTEXT });
  S['Client.Matchmake.MatchCancelled'] = inlineSearchNotice(SEARCH_NOTICES.matchCancelled, { decided: ['U54', 'U43'], context: START_CANCELLED_CONTEXT.MatchCancelled });
  S['Client.Matchmake.ReconnectFailed'] = inlineSearchNotice(SEARCH_NOTICES.reconnectFailed, { decided: ['U54', 'U52', 'U43'], context: START_CANCELLED_CONTEXT.ReconnectFailed });
  S['Client.Matchmake.NotFound'] = searchNotice(SEARCH_NOTICES.notFound, { context: SEARCH_NOT_FOUND_CONTEXT });
  S['Client.Matchmake.NextOpponent'] = nextSearch();
  S['Client.Matchmake.NextOpponent.NotFound'] = nextNotFound();
  S['Client.Opponent'] = { view: 'vs', decided: ['U32', 'U48', 'U54'], context: VS_CONTEXT };
  S['Client.Opponent.Disconnected'] = startDisconnectWait('self');
  S['Client.Opponent.OpponentDisconnected'] = startDisconnectWait('opponent');
  S['Client.Game.Countdown'] = { view: 'game', countdown: true, decided: ['U2', 'U32'], context: GAME_COUNTDOWN_CONTEXT };
  S['Client.Game.Play'] = { view: 'game', context: GAME_CONTEXT };
  S['Client.Game.MatchMenu'] = matchMenu();
  S['Client.Game.SurrenderConfirm'] = surrenderConfirm();
  S['Client.Game.Disconnected'] = disconnectWait('self');
  S['Client.Game.OpponentDisconnected'] = disconnectWait('opponent');

  // --- 対戦後の結果画面 (両端末共通。決定 U20〜U30) ---
  // outcome: Win / Lose / Draw / NoContest、phase: 再戦の段階、reason: 終わった理由 (END_REASONS のキー)。
  // ボタンと Rating の行はセッション (Friend Match かランダム対戦か) で変わるので、描画のときに resultButtons / ratingText で決める
  // phase の .Cooldown は「3 秒 (仮) は Rematch を押せない」で、一行 (REMATCH_STATUS) は .Cooldown を除いた名前で引く (U50)
  function result(outcome, phase, extra) {
    var rematch = !extra || extra.rematch !== false;
    var cooldown = /\.Cooldown$/.test(phase);
    var status = phase.replace(/\.Cooldown$/, '');
    var ended = REMATCH_ENDINGS.indexOf(status.replace(/^Rematch/, '')) !== -1;
    var stamps = phase !== 'OpponentLeft' && (!extra || extra.stamps !== false);
    var spec = { view: 'result', title: 'RESULT', back: null, outcome: outcome, phase: phase, status: status,
      reason: outcome === 'Draw' ? 'timeUpTie' : 'timeUp', rematch: rematch, stamps: stamps,
      decided: ['U20', 'U21', 'U22', 'U24', 'U26'].concat(rematch ? ['U23', 'U30'] : [], ended ? ['U50'] : [], stamps ? ['U27', 'U49'] : [],
        phase === 'OpponentLeft' ? ['U25'] : [], !extra || !extra.reason ? ['U44'] : []),
      context: [RESULT_CONTEXT].concat(RESULT_PHASE_CONTEXT[status] || [], cooldown ? [RESULT_COOLDOWN_CONTEXT] : [], stamps ? [STAMP_CONTEXT] : []) };
    return Object.assign(spec, extra);
  }
  ['Host', 'Client'].forEach(function (role) {
    OUTCOMES.forEach(function (o) {
      RESULT_PHASES.forEach(function (ph) { S[resultState(role, o, ph)] = result(o, ph.slice(1)); });
    });
    var special = function (key, reason, decided) {
      var spec = result(SPECIAL_RESULTS[key], '', { rematch: false, stamps: /Surrendered$/.test(key), reason: reason });
      spec.decided = spec.decided.concat(decided, ['U45']);
      spec.context = [RESULT_CONTEXT, SPECIAL_RESULT_CONTEXT[key]].concat(spec.stamps ? [STAMP_CONTEXT] : []);
      S[resultState(role, SPECIAL_RESULTS[key], '.' + key)] = spec;
    };
    // 降参 (決定 U38 / U41) と切断 (決定 U28) で決まった結果。どちらからも再戦は無い (U45)
    special('Surrendered', 'surrendered', ['U38', 'U41', 'U28']);
    special('OpponentSurrendered', 'opponentSurrendered', ['U38']);
    special('Disconnected', 'disconnected', ['U28']);
    special('OpponentDisconnected', 'opponentDisconnected', ['U28']);
    S[role + '.NoContestResult'] = Object.assign(result('NoContest', '', { rematch: false, stamps: false, reason: 'connectionError' }), {
      decided: ['U20', 'U21', 'U22', 'U24', 'U26', 'U28', 'U45'], context: [RESULT_CONTEXT, SPECIAL_RESULT_CONTEXT.NoContest] });
  });

  Object.keys(S).forEach(function (k) {
    S[k].undecided = S[k].undecided || [];
    S[k].decided = S[k].decided || [];
  });
  return S;
})();

// ---- ダイアログ ---------------------------------------------------------------

// 部屋を出る前の確認 (決定 U9 / U11 / U34) と、離席中に別の部屋を作る・入る前の確認 (10-01 合意、決定 U12)
var ROOM_LEAVE_BODY = 'No match has started. No win or loss will be recorded.';
// U12: 本文は役割で変える。クライアント向けの本文を出す場面はモックに無いので保留 (クライアントは部屋に入ったまま別の画面へは移れない、U9 / U51)
var ROOM_SWITCH_BODY = {
  host: 'This will close your current room. Your friend will return to Friend Match.',
  client: 'This will leave your current room. Your friend\u2019s room will stay open.',
};
var DIALOGS = {
  // ホストの Close Room (決定 U14)。本文は U34、残るボタンは U11、題名は U51
  closeRoom: { title: 'Close this room?', body: ROOM_LEAVE_BODY,
    buttons: [{ label: 'Close Room', event: 'dialog.closeRoom', danger: true }, { label: 'Keep Waiting', event: 'dialog.keepWaiting' }] },
  // クライアントの Leave Room と ‹ (決定 U9 / U11 / U34)。ホストも "Could not reconnect." の Leave Room ではこの確認 (U5)
  leaveRoom: { title: 'Leave this room?', body: ROOM_LEAVE_BODY,
    buttons: [{ label: 'Leave Room', event: 'dialog.leaveRoom', danger: true }, { label: 'Keep Waiting', event: 'dialog.keepWaiting' }] },
  newMatch: { title: 'Create a new match?', body: ROOM_SWITCH_BODY.host,
    buttons: [{ label: 'Create Match', event: 'dialog.createMatch', danger: true }, { label: 'Keep Current Match', event: 'dialog.keepCurrent' }] },
  joinAnother: { title: 'Join another match?', body: ROOM_SWITCH_BODY.host,
    buttons: [{ label: 'Join Match', event: 'dialog.joinMatch', danger: true }, { label: 'Keep Current Match', event: 'dialog.keepCurrent' }] },
};

// ---- VS 画面のデモデータ (架空) ----------------------------------------------
// レーティングは "Rating {n}" (決定 U48)。モックは両者とも Elo の初期値 (ELO.initial)

var PLAYERS = {
  host: { name: 'Yasuhito', emoji: '👋', greeting: 'Hello!' },
  client: { name: 'ogwssk', emoji: '😎', greeting: 'Let\u2019s go!' },
};

// ---- 未決一覧 -----------------------------------------------------------------
// options があるものは 未決パネルでトグルできる。default は図の通り (無ければ最も中立な案)。
// decided があるものは決定済み (ID はそのまま残す)。端末の画面の中や端末の上には出さず、右パネルの「決定済み」と未決タブに緑で表示する。

var GAME_COUNTDOWN_PREMISE = '前提として、ゲーム側で VsPlayer の modeStartAnimationType を None から Countdown に変える（設定 1 行）';

var UNDECIDED = [
  { id: 'U1', title: '"Friend is ready!" の帯をタップしても部屋の画面に戻るだけ (Ready は押さない)',
    desc: '離席中のホストに、友だちが Ready を押したことを赤い帯 "Friend is ready!" で知らせる (以前の "Ready to start" から変更)。帯をタップすると部屋の画面 (Ready 画面) に戻るだけで、Ready は押さない。' +
      '戻った画面のボタンは、これまでどおり Ready (押すと Cancel Ready)。開始は両者が Ready を押してから (U31)。以前のトグル (ロビーへ戻る / タップで押した扱い) は削除した。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U2', title: '開始のカウントダウン',
    desc: '元の論点は「開始は両者が開始ボタン (今の Ready、U31) を押すか、自動カウントダウンか」。このうちカウントダウンの部分が決まった: VS 画面のあと (ランダム対戦・Friend Match・再戦とも) はモック独自の 3·2·1 を出さず、ゲーム画面に移ってゲーム本体のカウントダウン (VsAI と同じ 3 → 2 → 1) を使う。' +
      '両者が押すか、Ready 後に自動で開始するかはこの決定に含まれないので U31 に分けた (U31 も 2026-10-03 に決定: 両者が押したら開始。ボタンの名前は 2026-10-07 に Ready に変更)。',
    decided: { by: '高宮さん', date: '2026-10-03', reason: 'ゲーム本体にゲーム開始時のカウントダウンがあるため、モック側の 3·2·1 は不要', premise: GAME_COUNTDOWN_PREMISE } },
  { id: 'U3', title: 'VS 画面中に相手が切断したときの戻り先',
    desc: 'U32 の決定で解消した。Friend Match の VS 画面中の切断は開始前の切断なので、両者の Ready を消して Ready 画面に戻し、残った側は "Opponent disconnected. Waiting for them to reconnect…" で 20 秒待つ。' +
      '以前のトグル (ロビーで "Connection lost." / Friend Match トップ / Online Battle) は削除した。ランダム対戦と再戦の VS 画面中の切断は U54 (2026-10-08 に決定)。',
    decided: { by: '高宮さん', date: '2026-10-07', reason: 'U32 (VS 画面・カウントダウン中の切断) の決定に含まれる' } },
  { id: 'U4', title: 'Ready を押せるのは、参加の確認・両者が部屋の画面にいる・同期の 3 つがそろってから (決まった待ち時間なし)',
    desc: 'サーバーが参加を確認し、両者が部屋の画面にいて、同期が終わったら Ready を押せる。以前のモックの「1.5 秒たったら自動で Ready」はやめた。' +
      '同期の前は、ホストに "Friend joined!"、クライアントに "Connecting…" を出し、どちらも Ready は押せない表示。ホストが別の画面にいる間は同期が終わらない (戻ると進む)。' +
      'モックの自動遷移の 0.8 秒はサーバーの応答の代わりで、待ち時間を決めたものではない。同期が終わってからホストが離れても、クライアントは Ready を押せる (U1 の場面)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U5', title: '部屋での切断: 20 秒まで自動で再接続。戻れなければ "Could not reconnect." と Retry / Leave Room',
    desc: '部屋 (Ready 画面・読み込み) で切断したら、20 秒まで自動で再接続し、その間は両者の Ready を消す。切れた側には "Connection lost. Reconnecting…"、' +
      '残った側には "Your friend disconnected. Waiting for them to reconnect…"。20 秒で戻れなければ、切れた側に "Could not reconnect." と Retry / Leave Room。' +
      'クライアントは Friend Match トップへ戻り、ホストは空の部屋を残す (同じ Match Code)。図03 の「両者が "Connecting…" → "Connection lost." → Cancel Match だけ」の流れとトグルは削除した。' +
      '20 秒は QA² 側の仮の値 (変わりうる)。VS 画面・カウントダウン中の切断は U32 (読み込み中の切断は U5、2026-10-08 に確認)。ホストが戻らずに Friend Match トップへ戻るクライアントには "The room was closed." (U52、2026-10-08)。' +
      '待っている間の残りの秒数は U52 で決まった (切れた側)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U6', title: '"Connection failed" は Create / Join がサーバーに届かないときだけ',
    desc: '"Connection failed" のトーストは、Create Match / Join Match がサーバーに届かないときだけ出す。文言はホストが "Couldn’t create a room. Try again."、クライアントが "Couldn’t join the room. Try again."。' +
      'Match Code の誤り・期限切れ・満員・閉じた部屋の赤字 (図08〜10 など) とは別。モックでは「モック設定」の Create Match / Join Match の結果を「接続失敗」にすると出る。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U7', title: 'Match Code の期限は 30 分 (サーバーが数える)。"Code expires in 30:00"、切れたら両者に "Match code expired."',
    desc: 'Match Code の期限は 30 分で、サーバーが数える。部屋の画面の Match Code の下に "Code expires in 30:00" を出す (モックは数えずに 30:00 のまま)。' +
      '開始の読み込み・VS 画面・カウントダウンと、U32 の再接続待ちの間は時計が止まる (その分は減らない)。切れたら両者に "Match code expired." (以前のクライアント側の "Match expired." とトーストの "Match code expired" をそろえた)。' +
      '30 分は QA² 側の仮の値 (変わりうる)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U8', title: 'ホストがキャンセルした後のクライアントの出口',
    desc: 'U34 の決定で解消した。ホストがルームを閉じると、クライアントは "Room closed. The host left." を見て Friend Match トップへ移る (以前の "Host User / cancelled the match." の画面と ‹ は無くなった)。' +
      'ボタンは Close Room (U14) になり、どの部屋の画面から閉じても同じ。',
    decided: { by: '高宮さん', date: '2026-10-07', reason: 'U34 (ホストがルームを閉じたときのクライアント) の決定に含まれる' } },
  { id: 'U9', title: 'クライアントには Leave Room。Leave Room と ‹ は同じ確認 "Leave this room?" を出す',
    desc: '以前ボタンの無かった待機中 ("Connecting…") も含めて、クライアントの部屋の画面にはいつも Leave Room を出す。Leave Room と ‹ (端末の戻る) はどちらも同じ確認を出す: ' +
      '題名 "Leave this room?"、本文は U34 で決まった "No match has started. No win or loss will be recorded."、ボタンは Leave Room / Keep Waiting (U11)。' +
      '以前の Leave Match と "Leave this match?" はこの確認にまとめた。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U10', title: '期限切れの画面には Ready を出さない。ホストは Create Match、クライアントは Join Match',
    desc: '"Match code expired." の画面には Ready を出さない (図07 の "Match expired." の画面にあった開始ボタンは無くなった)。ホストには Create Match (新しい部屋を作る)、クライアントには Join Match (新しい Match Code を入れる Friend Match トップへ) を出す。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U11', title: '確認の "Go Back" は "Keep Waiting" に',
    desc: '部屋を出る前の確認の、部屋に残るボタンは "Keep Waiting" (以前の "Go Back" と、SPEC14 の仮の "Stay in Room" をそろえた)。クライアントの "Leave this room?" (U9) とホストの Close Room の確認 (U14) の両方。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U12', title: '"Create a new match?" / "Join another match?" の本文は役割で変える。古い部屋は新しい部屋に入れてから閉じる',
    desc: '本文はホストが "This will close your current room. Your friend will return to Friend Match."、クライアントが "This will leave your current room. Your friend’s room will stay open."。' +
      '古い部屋を閉じるのは、新しい部屋を作れた・入れたときだけ (作れなければ古い部屋はそのまま。モックではモック設定「Create Match の結果 = 接続失敗」で試せる)。' +
      'ボタンは 10-01 の合意どおり Create Match / Join Match と Keep Current Match。クライアント向けの本文を出す場面はモックに無いので保留 (U51、2026-10-08)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
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
  { id: 'U14', title: 'ホストの ‹ は部屋を残して帯で示す。閉じるのは Close Room。別の画面へ移ると自分の Ready は消える',
    desc: 'ホストが ‹ で部屋の画面を離れても部屋は残し、行った先の画面の下の帯で部屋の様子を示す (図02)。部屋を閉じるのは別のボタン Close Room (以前の Cancel Match)。' +
      '別の画面へ移ると自分の Ready は消える (友だちには "Opponent is no longer ready.")。U35 の「‹ は退出と同じ確認」はクライアントにだけ残る (U9)。' +
      'Close Room の確認の本文は U34、残るボタンは Keep Waiting (U11)、題名は "Close this room?" (U51)。以前のトグル (維持 / キャンセル確認) は削除した。' +
      'ホストの ‹ には確認を出さない (確認を出すのはクライアントだけ、2026-10-08 に確認)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U15', title: '同期に失敗したら両者の Ready を消し、ふつうの Ready の流れからやり直す ("Couldn’t start the match. Please ready up again.")',
    desc: '開始の同期に失敗したら、両者の Ready を消して "Couldn’t start the match. Please ready up again." を出し、ふつうの Ready の流れ (60 秒の期限つき、U33) からやり直す。' +
      'Match Code が有効な間は何度でもやり直せる。読み込みが 20 秒で終わらないとき (U32 の "Match could not start. Please try again.") とは別のお知らせ。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U16', title: '青 / 緑の帯もタップすると部屋の画面に戻る。タップで Ready にはならない',
    desc: '離席中のホストの帯は、青 ("Waiting for your friend…" など) も緑 ("Friend joined!") も、タップすると部屋の画面に戻る (赤 "Friend is ready!" と濃い赤 "Match code expired." も同じ)。' +
      'どの帯のタップでも Ready は押さない (U1)。以前のトグル (タップできない / ロビーへ) は削除した。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U17', title: '"Friend joined!" は本当に入った・入り直したときだけ。ホスト離席中に友だちが抜けたら "Your friend left." を一度',
    desc: '"Friend joined!" は、友だちが本当に部屋に入った・入り直したとき (Leave Room のあとの Join Match、"Could not reconnect." のあとの Retry など) だけ出す。' +
      'ホストが戻ったとき・再接続できたときには出さない (以前の図02 の「Away → Friend joined! → Ready」の 2 回目は無くなった)。' +
      'ホストの離席中に友だちが抜けたら、ホストの帯に "Your friend left." を一度だけ出し、そのあとは青い "Waiting for your friend…" に戻る (出す長さは 5 秒、U55 で 2026-10-08 に決定)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U18', title: '期限切れでもクライアントを今の画面から動かさない。その場で "Match code expired." と Join Match',
    desc: 'Match Code の期限が切れても、クライアントを別の画面へ移さない。今の画面 (部屋の画面) のまま "Match code expired." と Join Match を出す (U10)。' +
      '以前のモックの「別画面にいるクライアントに期限切れのトースト → タップで "Match expired."」は無くなった (クライアントは部屋に入ったまま別の画面へは移れない、U9)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U19', title: '友だちの再接続を待っている間の帯は "Reconnecting…"。20 秒たつと "Waiting for your friend…"',
    desc: '友だちの再接続を待っている間 (U5 / U32) にホストが部屋の画面を離れると、帯は青い "Waiting for your friend…" ではなく "Reconnecting…" を出す。' +
      '20 秒たっても戻らなければ "Waiting for your friend…" に戻す (空の部屋を残している)。図03 の「Connection lost から ‹ で青い待機の帯」は、この決定で置き換えた。20 秒は QA² 側の仮の値。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U20', title: '結果画面: 勝敗・両者の名前・スコア・終わった理由を出す',
    desc: '結果画面には、勝敗 (Win / Lose / Draw / No contest。画面は "WIN!" / "LOSE" / "DRAW" / "NO CONTEST")、両者の名前、スコア、終わった理由を出す。' +
      'スコアが決まっていないときは、"----" などを出さずに行ごと出さない (モックでは No contest のとき)。モックのスコアはデモ値。' +
      '通常の決着のときの終わった理由の文言と引き分けになる条件は U44 で決まった (2026-10-08: 時間切れで "Time is up"、同点なら "Same score when time ran out")。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U21', title: 'レーティング: Friend Match は変わらない。ランダム対戦は Elo (初期値 1000、K=24)。同じ相手との再戦は変わらない',
    desc: 'Friend Match の結果画面には "No rating change (friend match)" を出す。ランダム対戦は Elo (初期値 1000、K=24) で変わり、例えば "1000 → 1012 (+12)" と出す。' +
      'ランダム対戦で同じ相手と続けて再戦したときはレートが変わらない (モックでは "No rating change (rematch)")。No contest も変わらない ("No rating change (no contest)")。' +
      '初期値 1000 と K=24 は QA² 側の仮の値 (変わりうる)。モックでは両者とも初期値 1000 から計算する。VS 画面は "Rank" をやめて "Rating {n}" を出す (U48、2026-10-08)。',
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
      '相手のスタンプはミュートできる。3 秒と 5 秒は QA² 側の仮の値 (変わりうる)。送った本人の画面にも出し、ミュートは同じ相手と続けて対戦している間だけ続く (U49、2026-10-08)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U28', title: '対戦中の切断: 片方なら 20 秒待って切断した側の負け。両者の切断・サービス障害は No contest',
    desc: '片方が切断したら 20 秒待ち、戻らなければ切断した側の負け (ランダム対戦ではレートも変わる)。' +
      '両者が切断した場合とサービス障害の場合は "No contest due to a connection error" で、レートは変わらない。降参した側は再戦を申し込めない。' +
      '20 秒は QA² 側の仮の値 (変わりうる)。待っている間は両者のゲームと得点を止め、両者に残りの秒数を出す (U46、2026-10-08)。引き分けは U20 で結果の 1 つになり、なる条件は U44 で決まった。' +
      '降参・切断・No contest のあとは、どちらからも再戦できない (U45)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U29', title: 'ランダム対戦の Find Next Opponent: 60 秒探して見つからなければ "No opponent found."',
    desc: 'ランダム対戦の結果画面の Find Next Opponent で、次の相手を探す (見た目と Cancel / ‹ は Random Match から探すとき (U13) と同じ)。' +
      '60 秒探しても見つからなければ "No opponent found." と Search again / Back to Online を出す。60 秒は QA² 側の仮の値 (変わりうる)。' +
      '探している間にアプリを離れたときは Random Match のとき (U43) と同じ (U47、2026-10-08)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U30', title: '再戦の申し込み: 応答期限 20 秒、Cancel Request で取り消し、Decline で断る。どの場合も結果画面に残り 3 秒後にまた申し込める',
    desc: '再戦の申し込みには 20 秒の応答期限がある。申し込んだ側には Cancel Request を出す。取り消すと相手に "Rematch request cancelled" (2026-10-08 に取り消した側 (U50) と同じ文言に統一)、' +
      '相手が断ると申し込んだ側に "Your opponent declined the rematch"、期限が切れると申し込んだ側に "No response to rematch request" を出す。' +
      'どの場合も両者とも結果画面に残り、3 秒後にまた申し込める。20 秒・3 秒は QA² 側の仮の値 (変わりうる)。もう一方にも一行を出し、次の操作まで残す (U50、2026-10-08)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U31', title: 'Friend Match の開始は両者が Ready を押してから (2026-10-07 にボタンの名前を Ready に変更)',
    desc: 'U2 から分けた残りの論点。Friend Match では、両者が Ready を押したら開始する (Ready 画面になっても自動では開始しない)。ランダム対戦には Ready 画面が無く、相手が見つかり次第 VS 画面へ進む (U13a)。' +
      '2026-10-07 の変更: 開始ボタンの名前を Ready にした (画面・イベント・状態の名前も合わせた。以前の名前は図01 のもの)。片方が押すと、押した側は "Waiting for opponent…"、相手側には "Opponent is ready. Are you?" (表示は U36)。' +
      '両者が押すと "Starting match…" (読み込み) → VS 画面 → ゲーム本体のカウントダウン。3-2-1 のあとサーバーが確認した時点で試合開始で、それまでは勝敗を記録しない (U32)。' +
      'Ready を取り消せるのは届いたあとの Ready 画面だけで、送っている間と読み込み・VS 画面から先は取り消せない (U53、2026-10-08)。' +
      '片方だけ押した状態のタイムアウトは U33、取り消し・退出は U34、別画面へ移る・アプリを離れるは U35。',
    decided: { by: '高宮さん', date: '2026-10-03、Ready への変更は 2026-10-07' } },
  { id: 'U32', title: 'VS 画面・カウントダウン中の切断: Ready を消して止め、相手は 20 秒待つ。読み込みは 20 秒まで',
    desc: 'Friend Match の VS 画面・カウントダウン中 (試合が始まる、つまり 3-2-1 のあとサーバーが確認するまで) の切断は、両者の Ready を消して止める。勝敗は記録しない。残った側には "Opponent disconnected. Waiting for them to reconnect…" と 20 秒のカウントダウン、Leave Room を出す。' +
      '戻ってきたら両者とももう一度 Ready を押し、カウントダウンは 3 からやり直す。戻らなければ、切断したのがクライアントならホストに "Match cancelled. Opponent did not reconnect." (結果なし、ホストは同じ Match Code のままルームに残る)、' +
      'ホストならクライアントに "Room closed. The host disconnected." を出して Friend Match トップへ。読み込み ("Starting match…") は 20 秒までで、終わらなければ "Match could not start. Please try again." で両者とも Ready 画面に戻る。' +
      '試合が始まったあとは、これまでのルール (20 秒の切断負け U28、降参の負け U38)。20 秒は QA² 側の仮の値 (変わりうる)。切断した側の画面と戻れなかった側の表示は U52、ランダム対戦・再戦の VS 画面中の切断は U54 (どちらも 2026-10-08)。' +
      '部屋 (Ready 画面・読み込み) での切断は U5 で決まった (2026-10-07、SPEC14 のモックでは U32 に含めていた。U32 が VS 画面とカウントダウンだけなのは 2026-10-08 に確認)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U33', title: 'Ready のタイムアウト: 片方が Ready のまま 60 秒で両者の Ready を消す (罰なし)',
    desc: '片方が Ready を押し、相手が 60 秒のうちに押さなければ、両者の Ready を消して両者に "Ready check timed out. Press Ready when you’re ready." を出す。' +
      '罰はなく、どちらもルームに残る (メニューへは戻らない)。その間の切断は U5 のとおり。ホストが離席中に時間切れになったときも同じ (ホストの帯は青に戻る)。60 秒は QA² 側の仮の値 (変わりうる)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U34', title: '取り消しと退出: Cancel Ready はルームに残る。クライアントが抜けるとホストは同じ Match Code で待つ。ホストが閉じるとクライアントは Friend Match トップへ',
    desc: 'Cancel Ready で Ready を取り消してもルームに残り、相手には "Opponent is no longer ready." を出す。クライアントが抜けると、ホストには "Your friend left. Waiting for another friend…" を出し、Match Code は変えない。' +
      'ホストがルームを閉じると、クライアントには "Room closed. The host left." を出して Friend Match トップへ移す。抜ける前に確認 "No match has started. No win or loss will be recorded." を出す。' +
      'ボタンはクライアントが Leave Room (U9)、ホストが Close Room (U14)。確認の題名はクライアントが "Leave this room?" (U9)、残るボタンは Keep Waiting (U11)。ホストの確認の題名は "Close this room?" (U51)。確認の本文は "No match has started. No win or loss will be recorded." (2026-10-08 に確認)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U35', title: 'クライアントが別画面へ移る / ‹ は退出と同じ確認。アプリを離れるとその人の Ready が消える',
    desc: 'Ready 画面からほかの画面へ移るとき・‹ を押したときは、Leave Room と同じ確認 ("No match has started. No win or loss will be recorded.") を出す。' +
      'アプリを離れる (バックグラウンドへ移る・画面ロック) と、その人の Ready は消える (ルームには残る)。' +
      'そのため、図07 の「クライアントが別画面へ移ってもマッチを残し、赤い "Ready to start" トーストで戻る」流れは無くなった (U10 / U18 も解消)。アプリを離れたときに相手に出す表示は U53 ("Opponent is no longer ready.")。ホストの ‹ は U14 (2026-10-07) で変わった: 部屋を残して帯で示し、ホストの Ready は消える。確認を出すのはクライアントだけ (U9)。',
    decided: { by: '高宮さん', date: '2026-10-07' } },
  { id: 'U36', title: 'Ready 画面: プレイヤーごとのカード ("✓ Ready" / "Not ready")。押した側に "Waiting for opponent…"・60 秒のカウントダウン・Cancel Ready',
    desc: 'Ready 画面にはプレイヤーごとにカードを出し (ホストが離れている間、クライアントのカードのホストは "Away")、"✓ Ready" か "Not ready" を表示する。Ready を押した側には "Waiting for opponent…"、60 秒のカウントダウン、Cancel Ready を出す。' +
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
  { id: 'U44', title: '時間切れで得点の高いほうが勝ち、同点なら引き分け ("Time is up" / "Same score when time ran out")',
    desc: '試合は時間切れで終わり、得点の高いほうが勝ち。同点なら引き分け (DRAW)。結果画面の終わった理由は、時間切れなら "Time is up"、同点の引き分けなら "Same score when time ran out" ' +
      '(以前のモックの仮の "Match finished" を置き換えた)。モックでは端末の下のモック操作「時間切れ」の勝ち / 負け / 同点で決着させる (得点の計算は対象外。スコアはデモ値)。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U45', title: '降参・切断・No contest で終わった試合のあとは、どちらからも再戦できない',
    desc: '降参・切断で勝敗が決まった試合と、No contest の試合のあとは、どちらの側にも Rematch を出さない (降参で勝った側からも申し込めない)。これまでのモックのとおり。' +
      'そのため、これらの結果画面では相手が抜けても "Your opponent left. Rematch is not available." (U25) を出さない。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U46', title: '対戦中の片方の切断: サーバーが両者のゲームと得点を 20 秒止め、両者の画面に残りの秒数',
    desc: '対戦中に片方が切断したら、サーバーが両者のゲームと得点を 20 秒止める (待っている間に試合は進まない)。両者の画面に残りの秒数を出す。' +
      '残った側は "Your opponent disconnected" / "Waiting for your opponent to reconnect…" / 残りの秒数、切断した側は "Connection lost" / "Reconnecting…" / 残りの秒数。' +
      '20 秒のうちに戻れば止めたところから続け、戻らなければ切断した側の負け (U28)。MATCH MENU ではこれまでどおり試合は止まらない (U37)。20 秒は QA² 側の仮の値 (変わりうる)。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U47', title: '次の相手を探している間にアプリを離れたときも U43 と同じ (Online Battle の中に "Search stopped…")',
    desc: '結果画面の Find Next Opponent で次の相手を探している間 (U29) にアプリを離れたときも、Random Match から探しているとき (U13 / U43) と同じ。' +
      '検索を止め、戻ると Online Battle の中に "Search stopped while the app was in the background." と Search again / Close を出す (モーダルではない)。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U48', title: 'VS 画面は架空の Rank をやめて "Rating {n}"。Friend Match でも出す',
    desc: 'VS 画面の架空の "Rank 12" / "Rank 9" はやめ、レーティング (U21 の Elo) を "Rating {n}" で出す。Friend Match の VS 画面でも出す (Friend Match ではレートは変わらない)。' +
      'モックでは両者とも Elo の初期値 1000 (QA² 側の仮の値) を出す。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U49', title: 'スタンプのミュートは同じ相手と続けて対戦している間だけ。自分のスタンプは自分に見え、相手には知らせない',
    desc: '相手のスタンプのミュートは、同じ相手と続けて対戦している間 (再戦を含む) だけ続く。結果画面を抜けて別の相手と対戦すると解ける。' +
      '自分が送ったスタンプは自分の画面に出す。ミュートしたことは相手に知らせない。ボタンは "Mute opponent emotes" / "Unmute opponent emotes"。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U50', title: '再戦が取り消し・辞退・期限切れになったら、もう一方にも一行を出し、次の操作まで残す',
    desc: 'U30 のメッセージに加えて、もう一方にも出す: 取り消した側に "Rematch request cancelled"、断った側に "Rematch declined"、申し込まれたまま期限が切れた側に "Rematch request expired"。' +
      'U30 のメッセージ (申し込まれた側の "Rematch request cancelled"、申し込んだ側の "Your opponent declined the rematch" / "No response to rematch request") はそのまま。' +
      '取り消しは両者とも "Rematch request cancelled" (2026-10-08 に統一)。' +
      'どの一行も次の操作 (どちらかがまた申し込む・結果画面を抜ける) まで残す。Rematch を押せないのは 3 秒 (決定済み、QA² 側の仮の値)。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U51', title: 'ホストの Close Room の確認の題名は "Close this room?"。U12 のクライアント向けの本文は保留',
    desc: 'ホストの Close Room の確認の題名は "Close this room?" のまま (本文は U34、ボタンは Close Room / Keep Waiting)。' +
      'U12 で決まったクライアント向けの本文 ("This will leave your current room. Your friend’s room will stay open.") は、出す場面が無い (クライアントは部屋に入ったまま別の画面へは移れない、U9) ので保留。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U52', title: '開始前の切断の表示: 切れた側も "Connection lost. Reconnecting…" と残りの秒数。部屋のお知らせは Close で閉じる帯',
    desc: '切断した側には "Connection lost. Reconnecting…" と残りの秒数を出す (VS 画面・カウントダウン中の切断 (U32) も)。' +
      'U32 で戻れなかった側には "Could not reconnect. The match did not start."。U5 でホストが戻らなかったとき、クライアントには "The room was closed." (「You left the room」とは出さない)。' +
      '部屋のお知らせ ("Room closed…" など) はモーダルではない帯で、Close で閉じる。以前のモックの「Match Code を入れると消える」はやめた。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U53', title: 'Ready は送っている間と VS 画面から先は取り消せない (今のモックのまま)',
    desc: '今のモックのまま。Ready を送っている間 ("Confirming…") と、読み込み ("Starting match…")・VS 画面から先は Ready を取り消せない (「VS 画面までは取り消せる」案は採らない)。' +
      '送っている間は Close Room / Leave Room / ‹ も押せない。アプリを離れて Ready が消えたとき (U35) とホストが別の画面へ移って Ready が消えたとき (U14) は、相手に Cancel Ready と同じ "Opponent is no longer ready."。' +
      '相手が Ready を送っている途中で取り消したときは、相手の Ready が届いて相手が待つ側になる。戻ってきた・再接続したあとにお知らせは出さない。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U54', title: 'ランダム対戦と再戦の開始前の切断: 20 秒待ち、戻らなければ取りやめ (勝敗なし・レートは変わらない)。戻ったら VS 画面から',
    desc: 'ランダム対戦と再戦 (Friend Match の再戦も) の VS 画面・カウントダウン中に切断したら、20 秒待つ。戻らなければ試合を取りやめ、勝敗はつけず、レートも変わらない。' +
      'ランダム対戦はそのあと Search again / Close を出す。再戦は Ready 画面に戻らず、戻ってきたら VS 画面からやり直す。20 秒は QA² 側の仮の値 (変わりうる)。' +
      'モックでは、待っている間は VS 画面の上に対戦中の切断 (U46) と同じ表示と残りの秒数、取りやめたあとは Online Battle の中の通知 (U43 と同じ見せ方)。' +
      'Friend Match の再戦を取りやめたあとは両者とも Friend Match トップの帯で、残った側は "Match cancelled. Opponent did not reconnect." (行き先と文言は 2026-10-08 に確認)。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
  { id: 'U55', title: '離席中の帯: 友だちがいて Ready していなければ "Friend is in the room"。"Your friend left." は 5 秒',
    desc: 'ホストの離席中、友だちが部屋にいて Ready していないときの帯は "Friend is in the room" (以前のモックの青い "Waiting for your friend…" から変更)。' +
      '"Your friend left." は 5 秒出す (以前のモックは 3 秒)。5 秒は QA² 側の仮の値 (変わりうる)。',
    decided: { by: '高宮さん', date: '2026-10-08' } },
];
