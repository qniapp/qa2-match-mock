/*
 * シナリオ = 遷移表のイベント列。各手順は TRANSITIONS の 1 行をそのまま再生する。
 *   opts: このシナリオが前提とする未決トグル (選択時に強制される)
 *   ctx:  モック設定 (Join Match / Create Match の結果)
 *   hostNote / clientNote: その端末が関与しないときに端末の上に出す注記
 */

var SCENARIOS = (function () {
  var hostCreates = ['host.friendMatch', 'host.createMatch'];
  var clientJoins = ['client.friendMatch', 'client.enterCode', 'client.joinMatch'];
  var toReady = hostCreates.concat(clientJoins, ['sys.peerConnected', 'sys.ready']);
  // 決定 (U31): 両者が Start Match を押したら開始 (1 回目: 待機 / Friend is ready!、2 回目: Starting match…、自動: VS 画面)
  var bothStart = ['host.startMatch', 'client.startMatch', 'sys.bothStarted']; // ホストが先
  var clientFirst = ['client.startMatch', 'host.startMatch', 'sys.bothStarted']; // クライアントが先
  var toGame = ['vs.done', 'game.countdownDone']; // VS 画面 → ゲーム本体のカウントダウン → プレイ開始
  var clientOnly = 'このシナリオではホストは関与しない';
  var toMatchEnd = toReady.concat(bothStart, toGame); // 通常対戦でプレイ開始まで (12 手順)
  var postMatch = '対戦後の部分は図が無く、画面もボタンもすべて仮 (未決 U20〜U30)。Win / Lose は端末の下のモック操作で、勝敗判定そのものは対象外。';

  return [
    { id: '1', title: '通常対戦 (ホストが先に Start Match)', diagram: '01',
      desc: 'ホストが Create Match、クライアントが Match Code で Join Match。自動で Friend joined! → Ready になる。Ready になっても自動では始まらず、両者が Start Match を押したら開始 (U31 で決定)。先に押したホストは "Waiting for your friend…" (Start Match は無効表示)、クライアントの画面にはホストの名前の下に "Friend is ready!"。クライアントも押すと両者 "Starting match…" → VS 画面 → ゲーム画面に移り、ゲーム本体のカウントダウン (3 → 2 → 1) のあとプレイ開始。VS 画面は合意で追加したもの (図では「カウントダウン & ゲーム開始」のみ)。モック独自の 3·2·1 は置かない (U2 で決定)。',
      steps: toReady.concat(bothStart, toGame) },
    { id: '1b', title: '通常対戦 (クライアントが先に Start Match)', diagram: '01',
      desc: 'シナリオ 1 と同じだが、クライアントが先に Start Match を押す。クライアントは "Waiting for your friend…"、ホストの画面にはクライアントの名前の下に "Friend is ready!"。ホストも押すと両者 "Starting match…" → VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (U31 で決定)。',
      steps: toReady.concat(clientFirst, toGame) },
    { id: '2a', title: '待機中にホストが別画面へ → 戻って対戦', diagram: '02', opts: { U14: 'keep', U1: 'lobby' },
      desc: 'ホストが待機中に ‹ で戻ると、Friend Match トップに青い "Waiting for your friend…" バナー。さらに他の画面 (ステージ選択) へ行っても表示が続く。クライアントが入ると緑 "Friend joined!" → 赤 "Ready to start"。クライアント側は "Host User / Away"。ホストが赤いトーストをタップするとロビーの Ready に戻り、クライアントは Friend joined! → Ready。そのあと両者が Start Match を押して開始 (U31 で決定)。',
      steps: hostCreates.concat(['host.back', 'host.back'], clientJoins,
        ['sys.ready', 'host.tapToast', 'sys.ready'], bothStart, toGame) },
    { id: '2b', title: '待機中にホストが別画面へ → 放置して期限切れ', diagram: '02', opts: { U14: 'keep' },
      desc: 'ホストが別画面のまま放置すると Match Code の有効期限が切れ、濃い赤の "Match code expired" トースト。タップすると "Match code expired." のロビー。クライアントは "Match expired."。',
      steps: hostCreates.concat(['host.back', 'host.back'], clientJoins,
        ['sys.ready', 'timer.codeExpired', 'host.tapToast']) },
    { id: '3a', title: 'Ready 後に通信不安定 → 回復', diagram: '03',
      desc: '何らかの理由で通信が不安定になり "Connecting…"。通信が回復すると Ready に戻り、両者が Start Match を押して開始。図03 はホスト側のみで、クライアント側は仮表示 (未決 U5)。片方だけ Start Match を押したあとの切断は未決 (U33) で、遷移行が無い。',
      steps: toReady.concat(['net.unstable', 'net.recovered'], bothStart, toGame) },
    { id: '3b', title: 'Ready 後に通信不安定 → 切断 → キャンセル', diagram: '03',
      desc: '通信が回復しないと "Connection lost."。Cancel Match → "Cancel this match?" → Cancel Match で Friend Match トップへ。しばらく待つかキャンセルのみかは未決 (U5)。どちらも Start Match を押す前の切断 (片方が押したあとの切断は U33)。',
      steps: toReady.concat(['net.unstable', 'net.lost', 'host.cancelMatch', 'host.dialog.cancelMatch']) },
    { id: '3c', title: 'Ready 後に通信不安定 → 切断 → ‹ で戻る', diagram: '03', opts: { U14: 'keep' },
      desc: '図03 では Connection lost の画面から ‹ で戻ると、青い "Waiting for your friend…" バナー付きの Friend Match トップになる (未決 U19)。',
      steps: toReady.concat(['net.unstable', 'net.lost', 'host.back']) },
    { id: '4', title: 'Ready 後にホストがキャンセル', diagram: '04',
      desc: 'ホストが Cancel Match → "Cancel this match?" → Cancel Match。ホストは Friend Match トップ、クライアントは "Host User / cancelled the match."。クライアントの次の操作は未決 (U8)。どちらも Start Match を押す前のキャンセル (片方が押したあとは U34)。',
      steps: toReady.concat(['host.cancelMatch', 'host.dialog.cancelMatch']) },
    { id: '4b', title: 'キャンセル確認で Keep Waiting', diagram: '04',
      desc: '"Cancel this match?" で Keep Waiting を選ぶとロビーに戻る。合意で図の "Go Back" を "Keep Waiting" にした。',
      steps: toReady.concat(['host.cancelMatch', 'host.dialog.keepWaiting']) },
    { id: '5', title: 'Ready 後にクライアントが退出', diagram: '05',
      desc: 'クライアントが Leave Match → "Leave this match?" → Leave Match。クライアントは Match Code が残った Friend Match トップへ。ホストは "Client User / left the match." のあと自動で "Waiting for your friend…" に戻る (同じ Match Code を再利用)。どちらも Start Match を押す前の退出 (片方が押したあとは U34)。',
      steps: toReady.concat(['client.leaveMatch', 'client.dialog.leaveMatch', 'sys.resetWaiting']) },
    { id: '6', title: 'Start Match 直後の切断・同期失敗', diagram: '06',
      desc: '両者が Start Match を押し ("Starting match…")、その直後に接続が切れる / 同期に失敗すると "Unable to start the match. Please try again."。両者が Start Match で再試行して VS 画面へ。再試行で先に押した側は図06 どおり "Starting match…" で相手を待つ。片方だけ再試行した場合は未決 (U15)。',
      steps: toReady.concat(['host.startMatch', 'client.startMatch', 'sys.startFailed'], bothStart, toGame) },
    { id: '7a', title: 'Ready 後にクライアントが別画面へ → 戻って対戦', diagram: '07',
      desc: 'クライアントが他の画面に移ると赤い "Ready to start" トースト、ホストは "Client User / Away"。クライアントがトーストをタップすると両者 Ready に戻り、両者が Start Match を押して開始。どちらも Start Match を押す前の離席 (片方が押したあとは U35)。',
      steps: toReady.concat(['client.back', 'client.tapToast'], bothStart, toGame) },
    { id: '7b', title: 'Ready 後にクライアントが別画面へ → 期限切れ', diagram: '07',
      desc: 'クライアントが戻らないまま有効期限が切れると、ホストは "Match expired." (Start Match / Cancel Match 付き、未決 U10)。クライアント側は図に無い (U18)。',
      steps: toReady.concat(['client.back', 'timer.codeExpired', 'client.tapToast']) },
    { id: '8', title: '無効な Match Code', diagram: '08', ctx: { codeResult: 'notFound' }, hostNote: clientOnly,
      desc: 'Join Match すると赤字で "Match not found. Check the Match Code and try again." を表示し、画面はそのまま。',
      steps: clientJoins },
    { id: '9', title: 'Match Code が期限切れ', diagram: '09', ctx: { codeResult: 'expired' }, hostNote: clientOnly,
      desc: 'Join Match すると赤字で "The match has expired."。',
      steps: clientJoins },
    { id: '10', title: 'マッチが満員', diagram: '10', ctx: { codeResult: 'full' }, hostNote: clientOnly,
      desc: 'Match は存在するが、すでにほかの人が入っている。赤字で "The match is already full."。',
      steps: clientJoins },
    { id: '11', title: 'ランダム対戦 (旧案)', diagram: '00',
      desc: '09-30 の旧案 (図00)。Random Match で "Waiting for opponent…" とピンクのトースト。相手が見つかったら合意どおり VS 画面 → ゲーム本体のカウントダウン → プレイ開始。10-02 の図に無いので扱いは未決 (U13)。',
      steps: ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'].concat(toGame) },
    { id: '12', title: 'VS 画面中の切断', diagram: 'なし (合意事項)',
      desc: 'VS 画面中に相手が切断した場合の戻り先は未決 (U3)。未決パネルのトグルで戻り先を切り替えられる (既定: ロビーで "Connection lost.")。',
      steps: toReady.concat(bothStart, ['net.lostDuringVs']) },
    { id: '13', title: '接続失敗 (仮)', diagram: '00 (トーストのみ)', ctx: { createResult: 'connFailed', codeResult: 'connFailed' },
      desc: '"Connection failed" トーストは図00 にあるが発生条件が描かれていない (U6)。モックでは Create Match / Join Match の接続失敗として仮に表示する。',
      steps: hostCreates.concat(clientJoins) },
    { id: '14', title: '離席中に Create Match を押す', diagram: 'なし (10-01 合意)', opts: { U14: 'keep' },
      desc: 'ホストが待機中に Friend Match トップへ戻り、もう一度 Create Match を押すと "Create a new match?"。[Keep Current Match] で今のマッチを維持、[Create Match] で作り直す。本文は未決 (U12)。',
      steps: hostCreates.concat(['host.back', 'host.createMatch', 'host.dialog.keepCurrent', 'host.createMatch', 'host.dialog.createMatch']) },
    { id: '15', title: '通常対戦 → 対戦後 (ホスト勝利)', diagram: '01 + なし (対戦後)',
      desc: '通常対戦でゲームまで進み、ホストの下の Win を押すと、ホストは "WIN!"、クライアントは自動で "LOSE" の結果画面。ホストが Back to Friend Match で先に抜けてもクライアントは結果画面のまま (U25)。続けてクライアントも抜ける。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.backToFriendMatch', 'client.backToFriendMatch']) },
    { id: '15b', title: '通常対戦 → 対戦後 (ホストが Lose を押す)', diagram: '01 + なし (対戦後)',
      desc: 'ホストの下の Lose を押すと、ホストは "LOSE"、クライアントは自動で "WIN!"。今度はクライアントが先に Back to Friend Match で抜ける。' + postMatch,
      steps: toMatchEnd.concat(['host.lose', 'client.backToFriendMatch']) },
    { id: '15c', title: '対戦後に再戦 (仮)', diagram: 'なし (対戦後)',
      desc: 'ホストが勝ったあと、クライアントが Rematch を押すと "Waiting for your friend…"、ホストには "Your friend wants a rematch"。ホストも Rematch を押すと VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (再戦でロビーの Start Match を挟むかは U23 で未決。モックは挟まない)。今度はクライアントが Win を押す。再戦の有無・同意の要否・VS 画面を挟むか・Match Code の再利用はすべて未決 (U23)。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.rematch'], toGame, ['client.win']) },
  ];
})();
