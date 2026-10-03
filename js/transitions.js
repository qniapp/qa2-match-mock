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

var AWAY_PLACES = ['TOP', 'STAGE']; // ホストが Friend Match トップ / ステージ選択にいる
var AWAY_STATUSES = ['WAITING', 'JOINED', 'READY'];

var H_AWAY_PENDING = []; // マッチがまだ有効なホスト離席状態
AWAY_PLACES.forEach(function (p) {
  AWAY_STATUSES.forEach(function (s) { H_AWAY_PENDING.push('H_AWAY_' + p + '_' + s); });
});

var H_CANCELABLE = ['H_WAITING', 'H_FRIEND_JOINED', 'H_READY', 'H_CONNECTING', 'H_CONN_LOST',
  'H_CLIENT_LEFT', 'H_CLIENT_AWAY', 'H_START_FAILED'];
var H_WITH_CLIENT = ['H_FRIEND_JOINED', 'H_READY', 'H_STARTING', 'H_START_FAILED',
  'H_CONNECTING', 'H_CONN_LOST', 'H_CLIENT_AWAY'];
var C_IN_MATCH = ['C_WAITING', 'C_HOST_AWAY', 'C_FRIEND_JOINED', 'C_READY', 'C_STARTING',
  'C_START_FAILED', 'C_CONNECTING', 'C_CONN_LOST', 'C_AWAY_STAGE_READY'];
var C_LEAVABLE = ['C_HOST_AWAY', 'C_FRIEND_JOINED', 'C_READY', 'C_START_FAILED',
  'C_CONNECTING', 'C_CONN_LOST'];
var C_TOP_ANY = ['C_TOP', 'C_TOP_CODE', 'C_TOP_ERR_NOTFOUND', 'C_TOP_ERR_EXPIRED',
  'C_TOP_ERR_FULL', 'C_TOP_CONN_FAILED'];
var C_TOP_FILLED = ['C_TOP_CODE', 'C_TOP_ERR_NOTFOUND', 'C_TOP_ERR_EXPIRED',
  'C_TOP_ERR_FULL', 'C_TOP_CONN_FAILED'];
var H_EXPIRED_ANY = ['H_CODE_EXPIRED', 'H_EXPIRED', 'H_AWAY_TOP_EXPIRED', 'H_AWAY_STAGE_EXPIRED'];

// 対戦後の結果画面: 勝ち負け × 再戦の段階 (なし / 自分が申し込んで待機中 / 相手から申し込まれた)
var OUTCOMES = ['WIN', 'LOSE'];
var RESULT_PHASES = { '': null, _REMATCH_WAIT: 'wait', _REMATCH_ASKED: 'asked' };
var H_RESULT_ANY = [];
var C_RESULT_ANY = [];
OUTCOMES.forEach(function (o) {
  Object.keys(RESULT_PHASES).forEach(function (ph) {
    H_RESULT_ANY.push('H_RESULT_' + o + ph);
    C_RESULT_ANY.push('C_RESULT_' + o + ph);
  });
});

// 遷移表の表示で、配列の代わりにグループ名を出すための一覧
var STATE_GROUPS = {
  H_AWAY_PENDING: H_AWAY_PENDING, H_CANCELABLE: H_CANCELABLE, H_WITH_CLIENT: H_WITH_CLIENT,
  H_EXPIRED_ANY: H_EXPIRED_ANY, C_IN_MATCH: C_IN_MATCH, C_LEAVABLE: C_LEAVABLE,
  C_TOP_ANY: C_TOP_ANY, C_TOP_FILLED: C_TOP_FILLED, H_RESULT_ANY: H_RESULT_ANY, C_RESULT_ANY: C_RESULT_ANY,
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
  T({ from: { host: 'H_ONLINE', client: '*' }, event: 'host.friendMatch', to: { host: 'H_TOP', client: '*' } });
  T({ from: { host: 'H_ONLINE', client: '*' }, event: 'host.randomMatch', to: { host: 'H_RANDOM_WAITING', client: '*' }, undecided: ['U13'] });
  T({ from: { host: ['H_TOP', 'H_TOP_CONN_FAILED'], client: '*' }, event: 'host.back', to: { host: 'H_ONLINE', client: '*' } });
  T({ from: { host: ['H_TOP', 'H_TOP_CONN_FAILED'], client: '*' }, event: 'host.createMatch', when: { createResult: 'connFailed' },
    to: { host: 'H_TOP_CONN_FAILED', client: '*' }, note: 'モック設定「Create Match の結果 = 接続失敗」のとき', undecided: ['U6'] });
  T({ from: { host: ['H_TOP', 'H_TOP_CONN_FAILED'], client: '*' }, event: 'host.createMatch', to: { host: 'H_WAITING', client: '*' }, note: '図01: Match Code QWERTY123 が発行される' });
  T({ from: { host: 'H_TOP_CONN_FAILED', client: '*' }, event: 'host.tapToast', to: { host: 'H_TOP', client: '*' }, undecided: ['U6'] });

  T({ from: { host: '*', client: 'C_ONLINE' }, event: 'client.friendMatch', to: { host: '*', client: 'C_TOP' } });
  T({ from: { host: '*', client: 'C_ONLINE' }, event: 'client.randomMatch', to: { host: '*', client: 'C_RANDOM_WAITING' }, undecided: ['U13'] });
  T({ from: { host: '*', client: C_TOP_ANY }, event: 'client.back', to: { host: '*', client: 'C_ONLINE' } });
  T({ from: { host: '*', client: 'C_TOP' }, event: 'client.enterCode', to: { host: '*', client: 'C_TOP_CODE' }, note: 'モックでは入力欄タップで QWERTY123 を入力' });
  T({ from: { host: '*', client: 'C_TOP_CONN_FAILED' }, event: 'client.tapToast', to: { host: '*', client: 'C_TOP_CODE' }, undecided: ['U6'] });

  // === Join Match の結果 ===
  T({ from: { host: '*', client: C_TOP_FILLED }, event: 'client.joinMatch', when: { codeResult: 'notFound' },
    to: { host: '*', client: 'C_TOP_ERR_NOTFOUND' }, note: '図08: 無効な Match Code' });
  T({ from: { host: '*', client: C_TOP_FILLED }, event: 'client.joinMatch', when: { codeResult: 'expired' },
    to: { host: '*', client: 'C_TOP_ERR_EXPIRED' }, note: '図09: Match Code が期限切れ' });
  T({ from: { host: '*', client: C_TOP_FILLED }, event: 'client.joinMatch', when: { codeResult: 'full' },
    to: { host: '*', client: 'C_TOP_ERR_FULL' }, note: '図10: すでにほかの人が入っている' });
  T({ from: { host: '*', client: C_TOP_FILLED }, event: 'client.joinMatch', when: { codeResult: 'connFailed' },
    to: { host: '*', client: 'C_TOP_CONN_FAILED' }, note: '"Connection failed" の発生条件は図に無い', undecided: ['U6'] });
  T({ from: { host: 'H_WAITING', client: C_TOP_FILLED }, event: 'client.joinMatch',
    to: { host: 'H_FRIEND_JOINED', client: 'C_WAITING' }, note: '図01: ホストは Friend joined!、クライアントはまず Waiting for your friend…' });
  eachPlace(function (p) {
    T({ from: { host: 'H_AWAY_' + p + '_WAITING', client: C_TOP_FILLED }, event: 'client.joinMatch',
      to: { host: 'H_AWAY_' + p + '_JOINED', client: 'C_WAITING' }, note: '図02: ホストは別画面のまま緑の "Friend joined!" トースト' });
  });
  T({ from: { host: H_EXPIRED_ANY, client: C_TOP_FILLED }, event: 'client.joinMatch',
    to: { host: '*', client: 'C_TOP_ERR_EXPIRED' }, note: 'ホストの Match Code が期限切れ' });
  T({ from: { host: '*', client: C_TOP_FILLED }, event: 'client.joinMatch',
    to: { host: '*', client: 'C_TOP_ERR_NOTFOUND' }, note: 'ホストが待機中のマッチを持っていないので見つからない' });

  // === 通常対戦 (図01) ===
  T({ from: { host: 'H_FRIEND_JOINED', client: 'C_WAITING' }, event: 'sys.peerConnected', auto: 800,
    to: { host: '*', client: 'C_FRIEND_JOINED' }, note: '図01: 点線 (自動)' });
  T({ from: { host: 'H_FRIEND_JOINED', client: 'C_FRIEND_JOINED' }, event: 'sys.ready', auto: 1500,
    to: { host: 'H_READY', client: 'C_READY' }, note: '図01: 点線 (自動)。何をもって Ready か不明', undecided: ['U4'] });
  T({ from: { host: 'H_READY', client: '*' }, event: 'host.startMatch', when: { U31: 'both' },
    to: { host: 'H_STARTING', client: '*' }, note: '先に押した側は相手を待つ', undecided: ['U31'] });
  T({ from: { host: '*', client: 'C_READY' }, event: 'client.startMatch', when: { U31: 'both' },
    to: { host: '*', client: 'C_STARTING' }, note: '先に押した側は相手を待つ', undecided: ['U31'] });
  T({ from: { host: 'H_READY', client: 'C_READY' }, event: 'sys.autoStart', when: { U31: 'auto' }, auto: 3000,
    to: { host: 'H_VS', client: 'C_VS' }, note: 'U31 別案: Ready になったら自動で開始', undecided: ['U31'] });
  T({ from: { host: 'H_STARTING', client: 'C_STARTING' }, event: 'sys.bothStarted', auto: 1500,
    to: { host: 'H_VS', client: 'C_VS' }, note: '合意: マッチ成立時に VS 画面を挟む' });
  T({ from: { host: 'H_VS', client: 'C_VS' }, event: 'vs.done', auto: 2500,
    to: { host: 'H_GAME_COUNTDOWN', client: 'C_GAME_COUNTDOWN' },
    note: '合意: VS 画面は 2〜3 秒。決定 (U2): そのままゲーム画面へ移り、ゲーム本体のカウントダウンが始まる', decided: ['U2'] });
  T({ from: { host: 'H_GAME_COUNTDOWN', client: 'C_GAME_COUNTDOWN' }, event: 'game.countdownDone', auto: GAME_COUNTDOWN_MS,
    to: { host: 'H_GAME', client: 'C_GAME' }, note: '決定 (U2): ゲーム本体の 3 → 2 → 1 (1 秒待ち + 0.8 秒 × 3) が終わるとポーズボタンが出てプレイ開始', decided: ['U2'] });
  T({ from: { host: 'H_GAME', client: '*' }, event: 'host.backToOnline', to: { host: 'H_ONLINE', client: '*' }, note: 'モック専用のリセット' });
  T({ from: { host: '*', client: 'C_GAME' }, event: 'client.backToOnline', to: { host: '*', client: 'C_ONLINE' }, note: 'モック専用のリセット' });

  // === Start Match 直後の同期失敗 (図06) ===
  T({ from: { host: 'H_STARTING', client: 'C_STARTING' }, event: 'sys.startFailed',
    to: { host: 'H_START_FAILED', client: 'C_START_FAILED' }, note: '図06: 接続が切れる / 同期処理の失敗' });
  T({ from: { host: 'H_START_FAILED', client: '*' }, event: 'host.startMatch',
    to: { host: 'H_STARTING', client: '*' }, note: '図06: 再試行', undecided: ['U15'] });
  T({ from: { host: '*', client: 'C_START_FAILED' }, event: 'client.startMatch',
    to: { host: '*', client: 'C_STARTING' }, note: '図06: 再試行', undecided: ['U15'] });

  // === ホストのキャンセル (図03, 図04) ===
  T({ from: { host: H_CANCELABLE, client: '*' }, event: 'host.cancelMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'cancel' }, note: '確認ダイアログ' });
  T({ from: { host: '*', client: '*', hostDialog: 'cancel' }, event: 'host.dialog.keepWaiting',
    to: { host: '=', client: '*' }, dialog: { host: null }, note: '合意: 図の "Go Back" → "Keep Waiting"' });
  T({ from: { host: '*', client: C_IN_MATCH, hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'H_TOP', client: 'C_HOST_CANCELLED' }, dialog: { host: null }, note: '図04: クライアントは "cancelled the match."', undecided: ['U8'] });
  T({ from: { host: '*', client: '*', hostDialog: 'cancel' }, event: 'host.dialog.cancelMatch',
    to: { host: 'H_TOP', client: '*' }, dialog: { host: null }, note: '図03/04: Friend Match トップへ' });
  T({ from: { host: 'H_EXPIRED', client: '*' }, event: 'host.cancelMatch',
    to: { host: 'H_TOP', client: '*' }, note: '期限切れなので確認ダイアログなし (モックの仮定)', undecided: ['U10'] });
  T({ from: { host: 'H_EXPIRED', client: '*' }, event: 'host.back', to: { host: 'H_TOP', client: '*' } });

  // === クライアントの退出 (図05) ===
  T({ from: { host: '*', client: C_LEAVABLE }, event: 'client.leaveMatch',
    to: { host: '*', client: '=' }, dialog: { client: 'leave' }, note: '確認ダイアログ', undecided: ['U11'] });
  T({ from: { host: '*', client: '*', clientDialog: 'leave' }, event: 'client.dialog.goBack',
    to: { host: '*', client: '=' }, dialog: { client: null }, undecided: ['U11'] });
  T({ from: { host: H_WITH_CLIENT, client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: 'H_CLIENT_LEFT', client: 'C_TOP_CODE' }, dialog: { client: null }, note: '図05: クライアントは入力欄に Match Code が残ったトップへ' });
  eachPlace(function (p) {
    T({ from: { host: ['H_AWAY_' + p + '_JOINED', 'H_AWAY_' + p + '_READY'], client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
      to: { host: 'H_AWAY_' + p + '_WAITING', client: 'C_TOP_CODE' }, dialog: { client: null },
      note: 'ホスト離席中の退出: トーストが青に戻る (図に無い)', undecided: ['U17'] });
  });
  T({ from: { host: '*', client: '*', clientDialog: 'leave' }, event: 'client.dialog.leaveMatch',
    to: { host: '*', client: 'C_TOP_CODE' }, dialog: { client: null } });
  T({ from: { host: 'H_CLIENT_LEFT', client: '*' }, event: 'sys.resetWaiting', auto: 1500,
    to: { host: 'H_WAITING', client: '*' }, note: '図05: 点線 (自動)。同じ Match Code で待機に戻る' });

  // クライアント待機中 (C_WAITING) の退出: 図にボタンが無いので ‹ で抜ける仮定
  T({ from: { host: 'H_FRIEND_JOINED', client: 'C_WAITING' }, event: 'client.back',
    to: { host: 'H_CLIENT_LEFT', client: 'C_TOP_CODE' }, note: 'C_WAITING には退出ボタンが無い。‹ で抜ける仮定', undecided: ['U9'] });
  eachPlace(function (p) {
    T({ from: { host: 'H_AWAY_' + p + '_JOINED', client: 'C_WAITING' }, event: 'client.back',
      to: { host: 'H_AWAY_' + p + '_WAITING', client: 'C_TOP_CODE' }, note: 'C_WAITING には退出ボタンが無い。‹ で抜ける仮定', undecided: ['U9'] });
  });
  T({ from: { host: '*', client: 'C_WAITING' }, event: 'client.back',
    to: { host: '*', client: 'C_TOP_CODE' }, undecided: ['U9'] });

  // === ホストが別画面へ移る (図02, 図03) ===
  T({ from: { host: 'H_WAITING', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'H_AWAY_TOP_WAITING', client: '*' }, note: '図02: 別画面に遷移したらバナーで状態を示す', undecided: ['U14'] });
  T({ from: { host: 'H_FRIEND_JOINED', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'H_AWAY_TOP_JOINED', client: '*' }, undecided: ['U14'] });
  T({ from: { host: 'H_READY', client: ['C_READY', 'C_FRIEND_JOINED'] }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'H_AWAY_TOP_READY', client: 'C_HOST_AWAY' }, note: '図07 の逆: ホスト離席でクライアントは "Away"', undecided: ['U14'] });
  T({ from: { host: 'H_CONN_LOST', client: '*' }, event: 'host.back', when: { U14: 'keep' },
    to: { host: 'H_AWAY_TOP_WAITING', client: '*' }, note: '図03: Connection lost から ‹ で青いバナー付きトップへ (?)', undecided: ['U19', 'U14'] });
  T({ from: { host: ['H_WAITING', 'H_FRIEND_JOINED', 'H_READY', 'H_CONN_LOST'], client: '*' }, event: 'host.back', when: { U14: 'confirm' },
    to: { host: '=', client: '*' }, dialog: { host: 'cancel' }, note: 'U14 別案: ‹ でキャンセル確認を出す', undecided: ['U14'] });

  eachPlace(function (p) {
    var other = p === 'TOP' ? 'STAGE' : 'TOP';
    AWAY_STATUSES.concat(['EXPIRED']).forEach(function (s) {
      T({ from: { host: 'H_AWAY_' + p + '_' + s, client: '*' }, event: 'host.back',
        to: { host: 'H_AWAY_' + other + '_' + s, client: '*' },
        note: p === 'TOP' ? '他の画面 (ステージ選択) へ。途中の画面は省略' : 'Friend Match トップへ戻る。途中の画面は省略' });
    });
  });
  eachPlace(function (p) {
    T({ from: { host: 'H_AWAY_' + p + '_JOINED', client: ['C_WAITING', 'C_FRIEND_JOINED'] }, event: 'sys.ready', auto: 1500,
      to: { host: 'H_AWAY_' + p + '_READY', client: 'C_HOST_AWAY' }, note: '図02: 緑 → 赤 "Ready to start"、クライアントは "Away"', undecided: ['U4'] });
  });
  eachPlace(function (p) {
    T({ from: { host: 'H_AWAY_' + p + '_READY', client: 'C_HOST_AWAY' }, event: 'host.tapToast', when: { U1: 'lobby' },
      to: { host: 'H_READY', client: 'C_FRIEND_JOINED' }, note: '図02: Ready to start ボタン押下で遷移', undecided: ['U1', 'U17'] });
    T({ from: { host: 'H_AWAY_' + p + '_READY', client: 'C_HOST_AWAY' }, event: 'host.tapToast', when: { U1: 'direct' },
      to: { host: 'H_STARTING', client: 'C_READY' }, note: 'U1 別案: トーストのタップで Start Match 扱い', undecided: ['U1'] });
    T({ from: { host: 'H_AWAY_' + p + '_WAITING', client: '*' }, event: 'host.tapToast', when: { U16: 'yes' },
      to: { host: 'H_WAITING', client: '*' }, note: 'U16 別案: 青バナーもタップでロビーへ', undecided: ['U16'] });
    T({ from: { host: 'H_AWAY_' + p + '_JOINED', client: '*' }, event: 'host.tapToast', when: { U16: 'yes' },
      to: { host: 'H_FRIEND_JOINED', client: '*' }, note: 'U16 別案: 緑トーストもタップでロビーへ', undecided: ['U16'] });
  });
  T({ from: { host: 'H_READY', client: 'C_FRIEND_JOINED' }, event: 'sys.ready', auto: 1500,
    to: { host: '*', client: 'C_READY' }, note: '図02: ホストが戻ったあとクライアントも Ready へ', undecided: ['U17'] });

  eachPlace(function (p) {
    var pending = AWAY_STATUSES.map(function (s) { return 'H_AWAY_' + p + '_' + s; });
    T({ from: { host: pending, client: ['C_WAITING', 'C_HOST_AWAY'] }, event: 'timer.codeExpired',
      to: { host: 'H_AWAY_' + p + '_EXPIRED', client: 'C_MATCH_EXPIRED' }, note: '図02: 放置したので Match Code の有効期限が切れた', undecided: ['U7'] });
    T({ from: { host: pending, client: '*' }, event: 'timer.codeExpired',
      to: { host: 'H_AWAY_' + p + '_EXPIRED', client: '*' }, undecided: ['U7'] });
    T({ from: { host: 'H_AWAY_' + p + '_EXPIRED', client: '*' }, event: 'host.tapToast',
      to: { host: 'H_CODE_EXPIRED', client: '*' }, note: '図02: 期限切れトーストをタップ' });
  });
  T({ from: { host: 'H_CODE_EXPIRED', client: '*' }, event: 'host.back', to: { host: 'H_TOP', client: '*' } });
  T({ from: { host: '*', client: 'C_MATCH_EXPIRED' }, event: 'client.back', to: { host: '*', client: 'C_TOP' } });
  T({ from: { host: '*', client: 'C_HOST_CANCELLED' }, event: 'client.back',
    to: { host: '*', client: 'C_TOP' }, note: '図04 にはボタンが無く ‹ のみ', undecided: ['U8'] });

  // 離席中のホストが Friend Match トップで Create / Join を押す (10-01 合意)
  var awayTopPending = AWAY_STATUSES.map(function (s) { return 'H_AWAY_TOP_' + s; });
  T({ from: { host: awayTopPending, client: '*' }, event: 'host.createMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'newMatch' }, note: '合意 (10-01): 確認ダイアログ', undecided: ['U12'] });
  T({ from: { host: awayTopPending, client: '*' }, event: 'host.joinMatch',
    to: { host: '=', client: '*' }, dialog: { host: 'joinAnother' }, note: '合意 (10-01): 確認ダイアログ', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.keepCurrent',
    to: { host: '=', client: '*' }, dialog: { host: null } });
  T({ from: { host: '*', client: '*', hostDialog: 'joinAnother' }, event: 'host.dialog.keepCurrent',
    to: { host: '=', client: '*' }, dialog: { host: null } });
  T({ from: { host: '*', client: C_IN_MATCH, hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'H_WAITING', client: 'C_HOST_CANCELLED' }, dialog: { host: null }, note: '古いマッチにいたクライアントの扱いは図に無い', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'newMatch' }, event: 'host.dialog.createMatch',
    to: { host: 'H_WAITING', client: '*' }, dialog: { host: null }, note: 'モックでは同じ Match Code を表示' });
  T({ from: { host: '*', client: C_IN_MATCH, hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'H_TOP', client: 'C_HOST_CANCELLED' }, dialog: { host: null }, note: '別マッチへの参加はモックでは省略', undecided: ['U12'] });
  T({ from: { host: '*', client: '*', hostDialog: 'joinAnother' }, event: 'host.dialog.joinMatch',
    to: { host: 'H_TOP', client: '*' }, dialog: { host: null }, note: '別マッチへの参加はモックでは省略', undecided: ['U12'] });
  T({ from: { host: ['H_AWAY_TOP_EXPIRED'], client: '*' }, event: 'host.createMatch',
    to: { host: 'H_WAITING', client: '*' }, note: '期限切れなので確認なしで作り直し (モックの仮定)' });

  // === クライアントが別画面へ移る (図07) ===
  T({ from: { host: 'H_READY', client: 'C_READY' }, event: 'client.back',
    to: { host: 'H_CLIENT_AWAY', client: 'C_AWAY_STAGE_READY' }, note: '図07: クライアントが他の画面に遷移した' });
  T({ from: { host: '*', client: 'C_READY' }, event: 'client.back',
    to: { host: '*', client: 'C_AWAY_STAGE_READY' } });
  T({ from: { host: 'H_CLIENT_AWAY', client: 'C_AWAY_STAGE_READY' }, event: 'client.tapToast',
    to: { host: 'H_READY', client: 'C_READY' }, note: '図07: Ready to start をタップして戻る' });
  T({ from: { host: '*', client: 'C_AWAY_STAGE_READY' }, event: 'client.tapToast',
    to: { host: '*', client: 'C_READY' } });
  T({ from: { host: 'H_CLIENT_AWAY', client: 'C_AWAY_STAGE_READY' }, event: 'timer.codeExpired',
    to: { host: 'H_EXPIRED', client: 'C_AWAY_STAGE_EXPIRED' }, note: '図07: クライアントが戻らず期限切れ。クライアント側は図に無い', undecided: ['U10', 'U18', 'U7'] });
  T({ from: { host: '*', client: 'C_AWAY_STAGE_EXPIRED' }, event: 'client.tapToast',
    to: { host: '*', client: 'C_MATCH_EXPIRED' }, undecided: ['U18'] });

  // === Ready 後の通信不安定 (図03) ===
  T({ from: { host: 'H_READY', client: 'C_READY' }, event: 'net.unstable',
    to: { host: 'H_CONNECTING', client: 'C_CONNECTING' }, note: '図03: 何らかの理由により通信が不安定になった。クライアント側は図に無い', undecided: ['U5'] });
  T({ from: { host: 'H_CONNECTING', client: 'C_CONNECTING' }, event: 'net.recovered',
    to: { host: 'H_READY', client: 'C_READY' }, note: '図03: 通信が回復' });
  T({ from: { host: 'H_CONNECTING', client: 'C_CONNECTING' }, event: 'net.lost',
    to: { host: 'H_CONN_LOST', client: 'C_CONN_LOST' }, note: '図03: 通信が回復しない', undecided: ['U5'] });
  T({ from: { host: 'H_CONN_LOST', client: 'C_CONN_LOST' }, event: 'net.recovered', when: { U5: 'wait' },
    to: { host: 'H_READY', client: 'C_READY' }, note: 'U5 別案: しばらく待てば復帰できる', undecided: ['U5'] });

  // === VS 画面中の切断 (合意済みの追加項目、図なし) ===
  T({ from: { host: 'H_VS', client: 'C_VS' }, event: 'net.lostDuringVs', when: { U3: 'lobby' },
    to: { host: 'H_CONN_LOST', client: 'C_CONN_LOST' }, note: 'U3 既定: ロビーで "Connection lost."', undecided: ['U3'] });
  T({ from: { host: 'H_VS', client: 'C_VS' }, event: 'net.lostDuringVs', when: { U3: 'top' },
    to: { host: 'H_TOP', client: 'C_TOP_CODE' }, note: 'U3 別案: Friend Match トップへ', undecided: ['U3'] });
  T({ from: { host: 'H_VS', client: 'C_VS' }, event: 'net.lostDuringVs', when: { U3: 'online' },
    to: { host: 'H_ONLINE', client: 'C_ONLINE' }, note: 'U3 別案: Online Battle へ', undecided: ['U3'] });

  // === ランダム対戦 (図00, 09-30 の旧案) ===
  T({ from: { host: 'H_RANDOM_WAITING', client: '*' }, event: 'host.cancelMatch',
    to: { host: 'H_ONLINE', client: '*' }, note: '確認ダイアログの有無は不明', undecided: ['U13'] });
  T({ from: { host: 'H_RANDOM_WAITING', client: '*' }, event: 'host.back', to: { host: 'H_ONLINE', client: '*' }, undecided: ['U13'] });
  T({ from: { host: '*', client: 'C_RANDOM_WAITING' }, event: 'client.cancelMatch',
    to: { host: '*', client: 'C_ONLINE' }, note: '確認ダイアログの有無は不明', undecided: ['U13'] });
  T({ from: { host: '*', client: 'C_RANDOM_WAITING' }, event: 'client.back', to: { host: '*', client: 'C_ONLINE' }, undecided: ['U13'] });
  T({ from: { host: 'H_RANDOM_WAITING', client: 'C_RANDOM_WAITING' }, event: 'sys.opponentFound', auto: 2500,
    to: { host: 'H_VS', client: 'C_VS' }, note: '合意: 対戦相手が見つかったら VS 画面', undecided: ['U13'] });

  // === 対戦後 (図なし、すべて未決) ===
  // Win / Lose は端末の下のモック操作。勝敗判定そのものはモックの対象外
  var opposite = { WIN: 'LOSE', LOSE: 'WIN' };
  [['host.win', 'WIN'], ['host.lose', 'LOSE'], ['client.win', 'LOSE'], ['client.lose', 'WIN']].forEach(function (p) {
    T({ from: { host: 'H_GAME', client: 'C_GAME' }, event: p[0],
      to: { host: 'H_RESULT_' + p[1], client: 'C_RESULT_' + opposite[p[1]] },
      note: 'モック操作: 押した側が' + (/win$/.test(p[0]) ? '勝ち' : '負け') + '、相手は自動で逆の結果。対戦後の画面は図に無い', undecided: ['U28'] });
  });
  OUTCOMES.forEach(function (o) {
    var h = 'H_RESULT_' + o;
    var c = 'C_RESULT_' + opposite[o];
    T({ from: { host: h, client: c }, event: 'host.rematch', to: { host: h + '_REMATCH_WAIT', client: c + '_REMATCH_ASKED' },
      note: '仮: 押した側は相手を待ち、相手には再戦の希望を表示', undecided: ['U23'] });
    T({ from: { host: h, client: c }, event: 'client.rematch', to: { host: h + '_REMATCH_ASKED', client: c + '_REMATCH_WAIT' },
      note: '仮: 押した側は相手を待ち、相手には再戦の希望を表示', undecided: ['U23'] });
    T({ from: { host: h + '_REMATCH_ASKED', client: c + '_REMATCH_WAIT' }, event: 'host.rematch', to: { host: 'H_VS', client: 'C_VS' },
      note: '仮: 両者が押したら VS 画面からやり直す。同じ Match Code を使うかは未決', undecided: ['U23'] });
    T({ from: { host: h + '_REMATCH_WAIT', client: c + '_REMATCH_ASKED' }, event: 'client.rematch', to: { host: 'H_VS', client: 'C_VS' },
      note: '仮: 両者が押したら VS 画面からやり直す。同じ Match Code を使うかは未決', undecided: ['U23'] });
  });
  T({ from: { host: H_RESULT_ANY, client: C_RESULT_ANY }, event: 'host.backToFriendMatch', to: { host: 'H_TOP', client: '=' },
    note: '仮: 押した側だけ Friend Match トップへ。相手は結果画面のまま', undecided: ['U24', 'U25'] });
  T({ from: { host: H_RESULT_ANY, client: '*' }, event: 'host.backToFriendMatch', to: { host: 'H_TOP', client: '*' },
    note: '仮: 相手はすでに結果画面を抜けている', undecided: ['U24'] });
  T({ from: { host: H_RESULT_ANY, client: C_RESULT_ANY }, event: 'client.backToFriendMatch', to: { host: '=', client: 'C_TOP' },
    note: '仮: 押した側だけ Friend Match トップへ。相手は結果画面のまま', undecided: ['U24', 'U25'] });
  T({ from: { host: '*', client: C_RESULT_ANY }, event: 'client.backToFriendMatch', to: { host: '*', client: 'C_TOP' },
    note: '仮: 相手はすでに結果画面を抜けている', undecided: ['U24'] });

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
  'host.back': 'ホスト: ‹ (戻る / 別画面へ)',
  'host.tapToast': 'ホスト: トーストをタップ',
  'host.backToOnline': 'ホスト: Back to Online Battle (モック)',
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
  'client.cancelMatch': 'クライアント: Cancel Match を押す',
  'client.back': 'クライアント: ‹ (戻る / 別画面へ)',
  'client.tapToast': 'クライアント: トーストをタップ',
  'client.backToOnline': 'クライアント: Back to Online Battle (モック)',
  'client.win': 'クライアント: Win を押す (モック操作)',
  'client.lose': 'クライアント: Lose を押す (モック操作)',
  'client.rematch': 'クライアント: Rematch を押す (仮)',
  'client.backToFriendMatch': 'クライアント: Back to Friend Match を押す (仮)',
  'client.dialog.leaveMatch': 'クライアント: ダイアログで Leave Match',
  'client.dialog.goBack': 'クライアント: ダイアログで Go Back',
  'sys.peerConnected': '自動: クライアントの接続完了',
  'sys.ready': '自動: Ready になる',
  'sys.autoStart': '自動: 開始 (U31 別案)',
  'sys.bothStarted': '自動: 両者が開始',
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
  random: { kind: 'pink', text: 'Waiting for opponent' },
};

var SCREENS = (function () {
  var S = {};
  var B = {
    start: { label: 'Start Match', event: 'startMatch', primary: true, hideIfNoRow: true },
    cancel: { label: 'Cancel Match', event: 'cancelMatch' },
    leave: { label: 'Leave Match', event: 'leaveMatch' },
  };
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
    NOTFOUND: 'Match not found. Check the Match Code and try again.',
    EXPIRED: 'The match has expired.',
    FULL: 'The match is already full.',
  };

  // --- ホスト ---
  S.H_ONLINE = online('host');
  S.H_TOP = top({});
  S.H_TOP_CONN_FAILED = top({ toast: 'failed', undecided: ['U6'] });
  S.H_WAITING = lobby({ status: 'Waiting for your friend…', buttons: [B.cancel] });
  S.H_FRIEND_JOINED = lobby({ name: 'Client User', status: 'Friend joined!', buttons: [B.cancel], undecided: ['U4'] });
  S.H_READY = lobby({ name: 'Client User', status: 'Ready', buttons: [B.start, B.cancel], undecided: ['U31'] });
  S.H_STARTING = lobby({ name: 'Client User', status: 'Starting match…', back: 'disabled' });
  S.H_START_FAILED = lobby({ name: 'Client User', status: 'Unable to start the match.\nPlease try again.', back: 'disabled',
    buttons: [{ label: 'Start Match', event: 'startMatch', primary: true }, B.cancel], undecided: ['U15'] });
  S.H_CONNECTING = lobby({ name: 'Client User', status: 'Connecting…', buttons: [B.cancel] });
  S.H_CONN_LOST = lobby({ name: 'Client User', status: 'Connection lost.', buttons: [B.cancel], undecided: ['U5'] });
  S.H_CLIENT_LEFT = lobby({ name: 'Client User', status: 'left the match.', buttons: [B.cancel] });
  S.H_CLIENT_AWAY = lobby({ name: 'Client User', status: 'Away', buttons: [B.cancel] });
  S.H_EXPIRED = lobby({ status: 'Match expired.', buttons: [{ label: 'Start Match', event: 'startMatch', primary: true }, B.cancel],
    undecided: ['U10', 'U7'] });
  S.H_CODE_EXPIRED = lobby({ status: 'Match code expired.', undecided: ['U7'] });
  var awayToast = { WAITING: 'waiting', JOINED: 'joined', READY: 'ready', EXPIRED: 'expired' };
  AWAY_PLACES.forEach(function (p) {
    Object.keys(awayToast).forEach(function (s) {
      var u = s === 'READY' ? ['U1'] : s === 'EXPIRED' ? ['U7'] : ['U16'];
      S['H_AWAY_' + p + '_' + s] = p === 'TOP'
        ? top({ toast: awayToast[s], undecided: u })
        : { view: 'stage', back: 'back', toast: awayToast[s], undecided: u };
    });
  });
  S.H_RANDOM_WAITING = { view: 'random', title: 'Random Match', back: 'back', status: 'Waiting for opponent…',
    buttons: [B.cancel], toast: 'random', undecided: ['U13'] };
  S.H_VS = { view: 'vs', undecided: [] };
  // ゲーム画面: カウントダウン中 (ポーズボタンなし・Win / Lose は押せない) → プレイ中
  S.H_GAME_COUNTDOWN = { view: 'game', countdown: true, decided: ['U2'], undecided: ['U32'] };
  S.H_GAME = { view: 'game' };

  // --- クライアント ---
  S.C_ONLINE = online('client');
  S.C_TOP = top({});
  S.C_TOP_CODE = top({ input: 'QWERTY123' });
  Object.keys(errMsg).forEach(function (k) {
    S['C_TOP_ERR_' + k] = top({ input: 'QWERTY123', error: errMsg[k] });
  });
  S.C_TOP_CONN_FAILED = top({ input: 'QWERTY123', toast: 'failed', undecided: ['U6'] });
  S.C_WAITING = lobby({ status: 'Waiting for your friend…', undecided: ['U9'] });
  S.C_HOST_AWAY = lobby({ name: 'Host User', status: 'Away', buttons: [B.leave] });
  S.C_FRIEND_JOINED = lobby({ name: 'Host User', status: 'Friend joined!', buttons: [B.leave], undecided: ['U4'] });
  S.C_READY = lobby({ name: 'Host User', status: 'Ready', buttons: [B.start, B.leave], undecided: ['U31'] });
  S.C_STARTING = lobby({ name: 'Host User', status: 'Starting match…', back: 'disabled' });
  S.C_START_FAILED = lobby({ name: 'Host User', status: 'Unable to start the match.\nPlease try again.', back: 'disabled',
    buttons: [{ label: 'Start Match', event: 'startMatch', primary: true }, B.leave], undecided: ['U15'] });
  S.C_CONNECTING = lobby({ name: 'Host User', status: 'Connecting…', buttons: [B.leave], undecided: ['U5'] });
  S.C_CONN_LOST = lobby({ name: 'Host User', status: 'Connection lost.', buttons: [B.leave], undecided: ['U5'] });
  S.C_HOST_CANCELLED = lobby({ name: 'Host User', status: 'cancelled the match.', undecided: ['U8'] });
  S.C_MATCH_EXPIRED = lobby({ status: 'Match expired.', undecided: ['U7'] });
  S.C_AWAY_STAGE_READY = { view: 'stage', back: 'back', toast: 'ready' };
  S.C_AWAY_STAGE_EXPIRED = { view: 'stage', back: 'back', toast: 'expired', undecided: ['U18'] };
  S.C_RANDOM_WAITING = { view: 'random', title: 'Random Match', back: 'back', status: 'Waiting for opponent…',
    buttons: [B.cancel], toast: 'random', undecided: ['U13'] };
  S.C_VS = { view: 'vs' };
  S.C_GAME_COUNTDOWN = { view: 'game', countdown: true, decided: ['U2'], undecided: ['U32'] };
  S.C_GAME = { view: 'game' };

  // --- 対戦後 (両端末共通。図なし) ---
  ['H', 'C'].forEach(function (p) {
    OUTCOMES.forEach(function (o) {
      Object.keys(RESULT_PHASES).forEach(function (ph) {
        S[p + '_RESULT_' + o + ph] = { view: 'result', title: 'RESULT', back: null, outcome: o, rematch: RESULT_PHASES[ph],
          undecided: ['U20', 'U22', 'U26', 'U27'] };
      });
    });
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
// decided があるものは決定済み (ID はそのまま残し、画面では緑の「決定」で表示する)。

var GAME_COUNTDOWN_PREMISE = '前提として、ゲーム側で VsPlayer の modeStartAnimationType を None から Countdown に変える（設定 1 行）';

var UNDECIDED = [
  { id: 'U1', title: 'Ready トーストから VS への入り方',
    desc: '別画面にいるホストが赤い "Ready to start" トーストをタップしたあと、ロビーの Ready 画面に戻って Start Match を押すのか、タップで直接開始するのか。' +
      'VS 画面のあとの流れ (モックの 3·2·1 をやめてゲーム本体のカウントダウン) は U2 で決定済みで、どちらの入り方でも同じ。トーストのタップ後の入り方は決まっていない。',
    options: [{ value: 'lobby', label: 'ロビーの Ready 画面へ (図02)' }, { value: 'direct', label: 'タップで直接開始扱い' }], default: 'lobby' },
  { id: 'U2', title: '開始のカウントダウン',
    desc: '元の論点は「開始は両者の Start Match か、自動カウントダウンか」。このうちカウントダウンの部分が決まった: VS 画面のあと (ランダム対戦・Friend Match・再戦とも) はモック独自の 3·2·1 を出さず、ゲーム画面に移ってゲーム本体のカウントダウン (VsAI と同じ 3 → 2 → 1) を使う。' +
      '両者が Start Match を押すか、Ready 後に自動で開始するかは決まっていないので U31 に分けた。',
    decided: { by: '高宮さん', date: '2026-10-03', reason: 'ゲーム本体にゲーム開始時のカウントダウンがあるため、モック側の 3·2·1 は不要', premise: GAME_COUNTDOWN_PREMISE } },
  { id: 'U3', title: 'VS 画面中に相手が切断したときの戻り先',
    desc: '合意済みの VS 画面中に切断した場合の画面は図に無い。',
    options: [{ value: 'lobby', label: 'ロビーで "Connection lost."' }, { value: 'top', label: 'Friend Match トップ' }, { value: 'online', label: 'Online Battle' }], default: 'lobby' },
  { id: 'U4', title: 'Friend joined! → Ready の条件',
    desc: '何をもって Ready になるのか (自動遷移の条件・待ち時間) が不明。モックでは 1.5 秒後に自動で Ready にしている。' },
  { id: 'U5', title: 'Connection lost 時の扱いとクライアント側の表示',
    desc: '図03 の赤字メモ「しばらく待つか、導線的にキャンセルしかないようにするか」。タイムアウトの長さも未定。クライアント側の画面は図に無く、モックではホストと対称の "Connecting…" / "Connection lost." を仮表示している。',
    options: [{ value: 'cancel', label: 'キャンセルのみ (図03)' }, { value: 'wait', label: 'しばらく待てば復帰できる' }], default: 'cancel' },
  { id: 'U6', title: '"Connection failed" トーストの発生条件',
    desc: '09-30 の図にトーストだけあり、出る場面が描かれていない。モックでは Create Match / Join Match の接続失敗として仮に表示している。' },
  { id: 'U7', title: 'Match Code の有効期限と文言の差',
    desc: '有効期限の長さが未定。ホスト側は "Match code expired." / トースト "Match code expired"、クライアント側は "Match expired." と文言が異なる。' },
  { id: 'U8', title: 'ホストがキャンセルした後のクライアントの出口',
    desc: '"Host User / cancelled the match." の画面にボタンが無い (‹ のみ)。モックでは ‹ で Friend Match トップに戻る。' },
  { id: 'U9', title: 'クライアント待機中 (C_WAITING) の退出方法',
    desc: '"Waiting for your friend…" のクライアント画面にボタンが無い。モックでは ‹ で抜けて Match Code 入力済みのトップへ戻る。' },
  { id: 'U10', title: 'クライアント離脱で期限切れ後のホスト画面の Start Match',
    desc: '図07 で "Match expired." の画面に Start Match と Cancel Match がある。期限切れで開始できる意味が不明なため、モックでは Start Match に遷移行を用意していない (押せない)。' },
  { id: 'U11', title: '"Leave this match?" の "Go Back" の文言',
    desc: '"Cancel this match?" は合意で "Keep Waiting" にしたが、"Leave this match?" の "Go Back" は合意の対象外。"Stay in Match" などに揃えるか。' },
  { id: 'U12', title: '"Create a new match?" / "Join another match?" の本文と影響',
    desc: '10-01 の合意でボタンは [Create Match]/[Join Match] + [Keep Current Match]。本文は残っている図に無いので仮に "Your current Match Code will no longer be valid." を表示。古いマッチに入っていたクライアントの扱いも未定 (モックでは "cancelled the match.")。' },
  { id: 'U13', title: 'ランダム対戦の待機・離脱・Ready の扱い',
    desc: 'ランダム対戦は 09-30 の旧案 (図00) のみで、10-02 の図に無い。トースト・離席・Ready / Start Match・キャンセル確認の有無が未定。' },
  { id: 'U14', title: 'ホストが ‹ で戻ったときにマッチを維持するか',
    desc: '図02 はバナーを出してマッチを維持する。‹ でキャンセル確認を出す案もありうる。',
    options: [{ value: 'keep', label: '維持してバナー表示 (図02)' }, { value: 'confirm', label: 'キャンセル確認を出す' }], default: 'keep' },
  { id: 'U15', title: '同期失敗時に片方だけ再試行した場合',
    desc: '図06 は両者が Start Match で再試行する。片方だけ再試行した場合や、再試行の回数制限が未定。' },
  { id: 'U16', title: '青 / 緑のバナーをタップしてロビーに戻れるか',
    desc: '図02 で "Ready to start" と "Match code expired" はタップで遷移するが、"Waiting for your friend…" と "Friend joined!" のタップは描かれていない。',
    options: [{ value: 'no', label: 'タップできない (図02)' }, { value: 'yes', label: 'タップでロビーへ' }], default: 'no' },
  { id: 'U17', title: 'ホストが戻ったときクライアントに "Friend joined!" を再表示するか',
    desc: '図02 では Away → Friend joined! → Ready の順。すでに一度 Ready だった場合も同じか。ホスト離席中にクライアントが退出した場合のホスト側表示も図に無い。' },
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
    desc: '再戦できるか、両者の同意が必要か、VS 画面を挟むか、同じ Match Code (同じマッチ) を使うか。モックは中立な仮の流れとして、押した側に "Waiting for your friend…"、相手に "Your friend wants a rematch" を出し、両者が押したら VS 画面からやり直す。' },
  { id: 'U24', title: '対戦後の戻り先',
    desc: 'モックでは "Back to Friend Match" で Friend Match トップ (Match Code 入力欄は空) に戻る。Online Battle や、同じマッチのロビーに戻る案もありうる。' },
  { id: 'U25', title: '結果画面で相手が先に抜けた・切断したときの表示',
    desc: 'モックでは相手が "Back to Friend Match" で抜けても、自分の結果画面は変わらない (再戦待ちの "Waiting for your friend…" や "Your friend wants a rematch" もそのまま残る)。相手が抜けた・切断したことをどう伝えるかは未定。' },
  { id: 'U26', title: '結果画面から自動で次へ進むか',
    desc: 'タイムアウトで自動的に次の画面へ進むのか、ボタンを押すまで結果画面に留まるのか。両者の操作が必要か。モックには自動遷移が無い。' },
  { id: 'U27', title: '結果画面であいさつ絵文字を送れるか',
    desc: 'issue の「あいさつ＋絵文字」はモックでは VS 画面に表示している。対戦後にもあいさつや絵文字を送れるか。' },
  { id: 'U28', title: '勝敗が決まらない場合 (引き分け・対戦中の切断・降参)',
    desc: '端末の下の Win / Lose ボタンはモック操作で、勝敗の判定そのものと、両端末に同じ結果を出す同期は対象外。引き分け、対戦中の切断、降参したときの扱いと画面は未定。' },
  { id: 'U29', title: 'ランダム対戦の対戦後',
    desc: 'ランダム対戦 (U13) の対戦後も Friend Match と同じ結果画面か。モックでは同じ画面になり、"Back to Friend Match" も出てしまう。再戦や戻り先 (Random Match の待機に戻るなど) が違うかは未定。' },
  { id: 'U30', title: '再戦の申し込みの取り消し・応答待ちのタイムアウト',
    desc: 'モックでは Rematch を押したあと取り消せない (待機中の Rematch は押せない)。相手が応じないときのタイムアウトや、申し込まれた側が断る手段も未定。' },
  { id: 'U31', title: '開始は両者の Start Match か、Ready 後の自動開始か',
    desc: 'U2 から分けた残りの論点 (U2 のカウントダウンの部分は決定済み)。図では両者が Start Match を押し、先に押した側は "Starting match…" で相手を待つ。Ready になったら自動で開始する案もありうる。どちらでも、開始後は VS 画面 → ゲーム本体のカウントダウン。',
    options: [{ value: 'both', label: '両者が Start Match を押す (図01)' }, { value: 'auto', label: 'Ready 後に自動で開始' }], default: 'both' },
  { id: 'U32', title: 'ゲーム本体のカウントダウン中に相手が切断したとき',
    desc: 'VS 画面中の切断 (U3) と対戦中の切断 (U28) の間にある、ゲーム画面のカウントダウン (約 3.4 秒) 中に相手が切断した場合の扱いと画面は決まっていない。モックには遷移行が無い。' },
];
