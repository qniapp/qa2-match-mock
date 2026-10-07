/*
 * シナリオ = 遷移表のイベント列。各手順は TRANSITIONS の 1 行をそのまま再生する。
 *   opts: このシナリオが前提とする未決トグル (選択時に強制される)
 *   ctx:  モック設定 (Join Match / Create Match の結果)
 *   hostNote / clientNote: その端末が関与しないときに右パネル (現在の状態の下) に出す注記。端末の画面には出さない
 */

var SCENARIOS = (function () {
  var hostCreates = ['host.friendMatch', 'host.createMatch'];
  var clientJoins = ['client.friendMatch', 'client.enterCode', 'client.joinMatch'];
  var toReady = hostCreates.concat(clientJoins, ['sys.peerConnected', 'sys.ready']);
  // 決定 (U31): 両者が Start Match を押したら開始 (1 回目: 待機 / Friend is ready!、2 回目: Starting match…、自動: VS 画面)
  var bothStart = ['host.startMatch', 'client.startMatch', 'sys.bothStarted']; // ホストが先
  var clientFirst = ['client.startMatch', 'host.startMatch', 'sys.bothStarted']; // クライアントが先
  var toGame = ['vs.done', 'game.countdownDone']; // VS 画面 → ゲーム本体のカウントダウン → プレイ開始
  var clientOnly = 'このシナリオではホストは関与しない (ホストの端末は Online Battle のまま)';
  var hostOnly = 'このシナリオではクライアントは関与しない (クライアントの端末は Online Battle のまま)';
  var toMatchEnd = toReady.concat(bothStart, toGame); // 通常対戦でプレイ開始まで (12 手順)
  var toRandomGame = ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'].concat(toGame); // ランダム対戦でプレイ開始まで (5 手順)
  var postMatch = '結果画面は 2026-10-07 に決定 (U20〜U30)。Win / Lose / Draw と「切断する」は端末の下のモック操作で、勝敗判定そのものは対象外。' +
    '秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値 (初期値 1000、K=24) は QA² 側の仮の値で、タイマーは左の環境イベントか端末の下のモック操作で進める。';
  var matchMenu = 'オンライン対戦の MATCH MENU は 2026-10-07 に決定 (案A、U37〜U42)。試合は止まらず (Time.timeScale = 0 にしない、BGM も下げない)、' +
    '暗幕は薄くゲーム画面が見えたまま。ボタンは CONTINUE と SURRENDER だけで、対戦中に REMATCH / RETRY は無い (U39)。';

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
    { id: '11', title: 'ランダム対戦 (相手が見つかり次第 VS)', diagram: '00 + 10-03 の決定 (U13a)',
      desc: '両者が Random Match を選ぶと、相手を探す画面 ("Searching for an opponent…" と大きな Cancel)。相手が見つかったらすぐ VS 画面へ進み (Ready・Start Match は無い、U13a で決定)、ゲーム本体のカウントダウン → プレイ開始。' +
        '両者が Start Match を押す U31 は Friend Match だけ。探している間の Cancel・‹・アプリを離れたとき・タイムアウトは 11b〜11f (U13 で決定)。',
      steps: ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'].concat(toGame) },
    { id: '11b', title: 'ランダム対戦 → Cancel / ‹ で Online Battle へ', diagram: '10-03 / 10-07 の決定 (U13a / U13)', clientNote: hostOnly,
      desc: 'ホストが Random Match を選び、相手を探している間に Cancel を押すと、確認ダイアログなしで Online Battle の画面に戻る (U13a / U13)。' +
        'もう一度探し、今度は ‹ を押す。‹ も Cancel とまったく同じで Online Battle へ戻る (U13)。探している間に行けるのは Online Battle だけ。',
      steps: ['host.randomMatch', 'host.cancelSearch', 'host.randomMatch', 'host.back'] },
    { id: '11c', title: 'ランダム対戦 → アプリを離れて検索が止まる → Search again', diagram: '10-07 の決定 (U13)',
      desc: 'ホストが相手を探している間にアプリを離れる (バックグラウンド・画面ロック。端末の下のモック操作「アプリを離れる」) と、検索が止まる。' +
        '戻ると "Search stopped because you left the app." (U13)。出す場所 (Online Battle の上) と Search again / Close は仮 (U43)。' +
        'Search again でもう一度探し、クライアントも Random Match を選ぶと相手が見つかって VS 画面へ (U13a)。',
      steps: ['host.randomMatch', 'host.leaveApp', 'host.searchAgain', 'client.randomMatch', 'sys.opponentFound'] },
    { id: '11d', title: 'ランダム対戦 → アプリを離れて検索が止まる → Close', diagram: '10-07 の決定 (U13)', hostNote: clientOnly,
      desc: 'クライアントが相手を探している間にアプリを離れて戻ると "Search stopped because you left the app." (U13)。Close で通知を閉じ、Online Battle のまま (ボタンは仮、U43)。',
      steps: ['client.randomMatch', 'client.leaveApp', 'client.closeNotice'] },
    { id: '11e', title: 'ランダム対戦 → 60 秒で見つからない → Search again', diagram: '10-07 の決定 (U13)',
      desc: 'ホストだけが相手を探し、見つからないまま 60 秒たつ (端末の下のモック操作「60 秒たつ」。60 秒という長さは仮) と、元の画面 (Online Battle) に "No opponent found." と Search again / Close (U13)。' +
        'Search again でもう一度探し、クライアントも Random Match を選ぶと相手が見つかって VS 画面へ (U13a)。',
      steps: ['host.randomMatch', 'host.searchTimeout', 'host.searchAgain', 'client.randomMatch', 'sys.opponentFound'] },
    { id: '11f', title: 'ランダム対戦 → 60 秒で見つからない → Close', diagram: '10-07 の決定 (U13)', clientNote: hostOnly,
      desc: 'ホストが相手を探し、見つからないまま 60 秒 (仮) たつと "No opponent found."。Close で通知を閉じ、Online Battle のまま (U13)。',
      steps: ['host.randomMatch', 'host.searchTimeout', 'host.closeNotice'] },
    { id: '12', title: 'VS 画面中の切断', diagram: 'なし (合意事項)',
      desc: 'VS 画面中に相手が切断した場合の戻り先は未決 (U3)。未決パネルのトグルで戻り先を切り替えられる (既定: ロビーで "Connection lost.")。',
      steps: toReady.concat(bothStart, ['net.lostDuringVs']) },
    { id: '13', title: '接続失敗 (仮)', diagram: '00 (トーストのみ)', ctx: { createResult: 'connFailed', codeResult: 'connFailed' },
      desc: '"Connection failed" トーストは図00 にあるが発生条件が描かれていない (U6)。モックでは Create Match / Join Match の接続失敗として仮に表示する。',
      steps: hostCreates.concat(clientJoins) },
    { id: '14', title: '離席中に Create Match を押す', diagram: 'なし (10-01 合意)', opts: { U14: 'keep' },
      desc: 'ホストが待機中に Friend Match トップへ戻り、もう一度 Create Match を押すと "Create a new match?"。[Keep Current Match] で今のマッチを維持、[Create Match] で作り直す。本文は未決 (U12)。',
      steps: hostCreates.concat(['host.back', 'host.createMatch', 'host.dialog.keepCurrent', 'host.createMatch', 'host.dialog.createMatch']) },
    { id: '15', title: 'Friend Match の対戦後 (ホスト勝利 → 両者が抜ける)', diagram: 'なし (10-07 の決定 U20〜U26)',
      desc: '通常対戦でゲームまで進み、ホストの下の Win を押すと、ホストは "WIN!"、クライアントは自動で "LOSE" の結果画面。両者の名前・スコア・終わった理由と "No rating change (friend match)" (U20 / U21)。' +
        'ボタンは Rematch と Back to Friend Match (U22)。ホストが Back to Friend Match で Friend Match トップへ抜けると、クライアントの結果画面はそのまま "Your opponent left. Rematch is not available." (U24 / U25)。続けてクライアントも抜ける。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.backToFriendMatch', 'client.backToFriendMatch']) },
    { id: '15b', title: 'Friend Match の対戦後 (ホストが Lose を押す → クライアントが先に抜ける)', diagram: 'なし (10-07 の決定 U20〜U26)',
      desc: 'ホストの下の Lose を押すと、ホストは "LOSE"、クライアントは自動で "WIN!"。今度はクライアントが先に Back to Friend Match で抜け、ホストに "Your opponent left. Rematch is not available." (U25)。' + postMatch,
      steps: toMatchEnd.concat(['host.lose', 'client.backToFriendMatch']) },
    { id: '15c', title: 'Friend Match の再戦 (申し込み → 応じる → VS)', diagram: 'なし (10-07 の決定 U23 / U30)',
      desc: 'ホストが勝ったあと、クライアントが Rematch を押すと "Waiting for your opponent…" と Cancel Request、ホストには "Your opponent wants a rematch" と Rematch / Decline (U23 / U30)。' +
        'ホストが Rematch で応じると、ロビーの Start Match を挟まずにそのまま VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (U23)。今度はクライアントが Win を押す。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.rematch'], toGame, ['client.win']) },
    { id: '15d', title: '再戦の申し込みを取り消す → 3 秒後にまた申し込める', diagram: 'なし (10-07 の決定 U30)',
      desc: 'ホストが Rematch で申し込み、Cancel Request で取り消すと、クライアントに "Rematch request was cancelled" (U30)。両者とも結果画面に残り、3 秒 (仮) は Rematch を押せない。' +
        '左の環境イベント「3 秒たつ」でまた押せるようになり、今度はクライアントが申し込んでホストが応じ、VS 画面へ。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.rematch', 'host.cancelRematch', 'timer.rematchCooldown', 'client.rematch', 'host.rematch']) },
    { id: '15e', title: '再戦を断られる (Decline)', diagram: 'なし (10-07 の決定 U30)',
      desc: 'クライアントが Rematch で申し込み、ホストが Decline で断ると、クライアントに "Your opponent declined the rematch" (U30)。両者とも結果画面に残り、3 秒 (仮) のあとはまた申し込める。' +
        'そのあとクライアントが Back to Friend Match で抜けると、ホストに "Your opponent left. Rematch is not available." (U25)。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.declineRematch', 'timer.rematchCooldown', 'client.backToFriendMatch']) },
    { id: '15f', title: '再戦の申し込みに応答がない (20 秒) → 申し込み直す', diagram: 'なし (10-07 の決定 U30)',
      desc: 'ホストが Rematch で申し込み、クライアントが 20 秒 (仮) 応答しないと (左の環境イベント)、ホストに "No response to rematch request"、クライアントの "Your opponent wants a rematch" は消える (U30)。' +
        '3 秒 (仮) のあとホストが申し込み直し、今度はクライアントが応じて VS 画面へ。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.rematch', 'timer.rematchTimeout', 'timer.rematchCooldown', 'host.rematch', 'client.rematch']) },
    { id: '15g', title: '引き分け → 両者が同時に Rematch', diagram: 'なし (10-07 の決定 U20 / U23)',
      desc: 'クライアントの下の Draw を押すと、両者 "DRAW" の結果画面 (U20。引き分けになる条件は U44)。' +
        '両者が同時に Rematch を押す (左の環境イベント) と、申し込みに応じたのと同じく成立し、そのまま VS 画面 → プレイ開始 (U23)。' + postMatch,
      steps: toMatchEnd.concat(['client.draw', 'sys.rematchSimultaneous'], toGame) },
    { id: '15h', title: '結果画面のスタンプとミュート', diagram: 'なし (10-07 の決定 U27)',
      desc: 'ホストが 👏 "Good game"、クライアントが 🤝 "Thanks for the match" を送ると、両者の画面で送った人の名前の上に出る (U27)。送ってから 5 秒 (仮) はスタンプを押せない。' +
        'ホストのスタンプが 3 秒 (仮) で消えたあと、クライアントが 🔔 で相手のスタンプをミュート。ホストが 5 秒 (仮) たって 👍 "Nice" を送ると、ホストの画面には出るがクライアントの画面には出ない。' +
        'クライアントがミュートを解くと出る。3 秒・5 秒は端末の下のモック操作。ミュートの続く範囲と送った本人の画面の表示は仮 (U49)。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.stamp.gg', 'client.stamp.thanks', 'host.stampShown', 'client.muteStamps', 'host.stampInterval', 'host.stamp.nice', 'client.unmuteStamps']) },
    { id: '16', title: '対戦中に MATCH MENU → CONTINUE (試合は続く)', diagram: 'なし (10-07 の決定、案A)',
      desc: 'プレイ中にホストが右上のメニューボタン (☰) を押すと MATCH MENU が開き、"The match continues while the menu is open."。メニューを開いただけでは、クライアントの端末には何も出ない (U38)。' +
        'クライアントも開き、CONTINUE でそれぞれメニューを閉じる。' + matchMenu,
      steps: toMatchEnd.concat(['host.matchMenu', 'client.matchMenu', 'host.matchMenu.continue', 'client.matchMenu.continue']) },
    { id: '16b', title: '対戦中に降参 (SURRENDER → 確認 → 負け)', diagram: 'なし (10-07 の決定、案A)',
      desc: 'ホストが MATCH MENU の SURRENDER を押すと、確認 "Surrender?" / "You will lose." が出る (U40)。いったん CONTINUE でプレイに戻り、もう一度 SURRENDER → SURRENDER で降参する。' +
        'ホストは負けの結果画面 ("You surrendered")、クライアントは勝ちの結果画面に "Your opponent surrendered" (U38)。ホストは Back to Online Battle で Online Battle へ戻る (U41)。' + matchMenu,
      steps: toMatchEnd.concat(['host.matchMenu', 'host.matchMenu.surrender', 'host.surrenderConfirm.continue',
        'host.matchMenu', 'host.matchMenu.surrender', 'host.surrenderConfirm.surrender', 'host.backToOnlineBattle']) },
    { id: '16c', title: 'MATCH MENU を開いている間に試合が終わる', diagram: 'なし (10-07 の決定、案A)',
      desc: 'ホストが MATCH MENU を開いている間も試合は続くので、その間にクライアントが勝つと (端末の下の Win)、ホストのメニューは閉じて負けの結果画面になる (U37)。' + matchMenu,
      steps: toMatchEnd.concat(['host.matchMenu', 'client.win']) },
    { id: '16d', title: 'ランダム対戦で降参 (レートが変わる、再戦なし)', diagram: 'なし (10-07 の決定 U21 / U28 / U41)',
      desc: 'ランダム対戦でクライアントが降参すると、クライアントは "LOSE" / "You surrendered" で 1000 → 988 (-12)、ホストは "WIN!" / "Your opponent surrendered" で 1000 → 1012 (+12) (U21)。' +
        '降参した側は再戦を申し込めず (U28)、Back to Online だけ (U41)。勝ったホストにも Rematch は無く (仮、U45)、Find Next Opponent / Back to Online。' + postMatch,
      steps: toRandomGame.concat(['client.matchMenu', 'client.matchMenu.surrender', 'client.surrenderConfirm.surrender', 'host.findNextOpponent', 'client.backToOnlineBattle']) },
    { id: '17', title: 'ランダム対戦の対戦後 (Elo → 再戦はレートが変わらない → 次の相手)', diagram: 'なし (10-07 の決定 U21 / U22 / U29)',
      desc: 'ランダム対戦でホストが勝つと、ホストは 1000 → 1012 (+12)、クライアントは 1000 → 988 (-12) (U21、Elo の初期値 1000・K=24 は仮)。ボタンは Find Next Opponent / Rematch / Back to Online (U22)。' +
        '再戦すると、その試合はレートが変わらない ("No rating change (rematch)")。ホストが Find Next Opponent で次の相手を探し始めると、クライアントには "Your opponent left. Rematch is not available." (U25)。' +
        'クライアントも Back to Online から Random Match を選ぶと相手が見つかり、VS 画面へ (新しいランダム対戦なのでレートが変わる)。' + postMatch,
      steps: toRandomGame.concat(['host.win', 'client.rematch', 'host.rematch'], toGame,
        ['client.win', 'host.findNextOpponent', 'client.backToOnlineBattle', 'client.randomMatch', 'sys.opponentFound']) },
    { id: '17b', title: 'ランダム対戦の対戦後 → 次の相手が見つからない', diagram: 'なし (10-07 の決定 U29)',
      desc: 'クライアントが勝ったあと、ホストが Find Next Opponent で次の相手を探す。60 秒 (仮) 探しても見つからない (端末の下のモック操作「60 秒たつ」) と "No opponent found." と Search again / Back to Online (U29)。' +
        'Search again でもう一度探し、また見つからないので Back to Online で Online Battle へ。' + postMatch,
      steps: toRandomGame.concat(['client.win', 'host.findNextOpponent', 'host.searchTimeout', 'host.searchAgain', 'host.searchTimeout', 'host.backToOnlineBattle']) },
    { id: '18', title: '対戦中にクライアントが切断 → 20 秒で切断した側の負け', diagram: 'なし (10-07 の決定 U28)',
      desc: 'Friend Match の対戦中にクライアントの接続が切れる (端末の下のモック操作「切断する」) と、ホストは "Your opponent disconnected" で 20 秒 (仮) 待ち、クライアントは "Reconnecting…" (待っている間の画面は仮、U46)。' +
        '20 秒たっても戻らない (左の環境イベント) と、切断したクライアントの負け: ホストは "WIN!" / "Your opponent disconnected"、クライアントは "LOSE" / "You were disconnected" (U28)。再戦は無い (仮、U45)。' + postMatch,
      steps: toMatchEnd.concat(['client.disconnect', 'timer.disconnectTimeout', 'host.backToFriendMatch']) },
    { id: '18b', title: '対戦中にホストが切断 → 20 秒のうちに戻る', diagram: 'なし (10-07 の決定 U28)',
      desc: 'ホストの接続が切れたあと、20 秒 (仮) のうちに通信が回復する (左の環境イベント) と、両者ともプレイに戻って試合を続ける (仮、U46)。そのあとホストが勝つ。' + postMatch,
      steps: toMatchEnd.concat(['host.disconnect', 'net.recovered', 'host.win']) },
    { id: '18c', title: '両者が切断 → No contest', diagram: 'なし (10-07 の決定 U28)',
      desc: 'クライアントの接続が切れ、ホストが待っている間にホストの接続も切れると (左の環境イベント「両者の接続が切れる」)、両者とも "NO CONTEST" / "No contest due to a connection error" (U28)。' +
        'スコアは決まっていないので行ごと出さない (U20)。再戦は無い (仮、U45)。' + postMatch,
      steps: toMatchEnd.concat(['client.disconnect', 'net.bothDisconnected']) },
    { id: '18d', title: 'ランダム対戦でサービス障害 → No contest (レートは変わらない)', diagram: 'なし (10-07 の決定 U28 / U21)',
      desc: 'ランダム対戦の対戦中にサービス障害が起きると (左の環境イベント)、両者とも "NO CONTEST" / "No contest due to a connection error" で "No rating change (no contest)" (U28 / U21)。' +
        'ホストは Back to Online、クライアントは Find Next Opponent で抜ける。' + postMatch,
      steps: toRandomGame.concat(['net.serviceFailure', 'host.backToOnlineBattle', 'client.findNextOpponent']) },
    { id: '18e', title: 'ランダム対戦で切断負け (レートが変わる)', diagram: 'なし (10-07 の決定 U28 / U21)',
      desc: 'ランダム対戦でホストの接続が切れ、20 秒 (仮) たっても戻らないと、ホストの負け: ホストは 1000 → 988 (-12)、クライアントは 1000 → 1012 (+12) (U28 / U21)。' + postMatch,
      steps: toRandomGame.concat(['host.disconnect', 'timer.disconnectTimeout']) },
  ];
})();
