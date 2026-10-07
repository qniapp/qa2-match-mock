/*
 * シナリオ = 遷移表のイベント列。各手順は TRANSITIONS の 1 行をそのまま再生する。
 *   opts: このシナリオが前提とする未決トグル (選択時に強制される)
 *   ctx:  モック設定 (Join Match / Create Match の結果)
 *   hostNote / clientNote: その端末が関与しないときに右パネル (現在の状態の下) に出す注記。端末の画面には出さない
 */

var SCENARIOS = (function () {
  var hostCreates = ['host.friendMatch', 'host.createMatch'];
  var clientJoins = ['client.friendMatch', 'client.enterCode', 'client.joinMatch'];
  var toReady = hostCreates.concat(clientJoins, ['sys.peerConnected', 'sys.readyScreen']); // Ready 画面まで (7 手順)
  // 決定 (U31 / U36): 両者が Ready を押したら開始。押すと "Confirming…"、届くと押した側は "Waiting for opponent…"、相手側は "Opponent is ready. Are you?"。
  // 2 人目の Ready が届くと "Starting match…" (読み込み)、自動で VS 画面
  var hostReady = ['host.ready', 'sys.readyConfirmed'];
  var clientReady = ['client.ready', 'sys.readyConfirmed'];
  var bothStart = hostReady.concat(clientReady, ['sys.bothStarted']); // ホストが先 (5 手順)
  var clientFirst = clientReady.concat(hostReady, ['sys.bothStarted']); // クライアントが先
  var toGame = ['vs.done', 'game.countdownDone']; // VS 画面 → ゲーム本体のカウントダウン → プレイ開始
  var clientOnly = 'このシナリオではホストは関与しない (ホストの端末は Online Battle のまま)';
  var hostOnly = 'このシナリオではクライアントは関与しない (クライアントの端末は Online Battle のまま)';
  var toMatchEnd = toReady.concat(bothStart, toGame); // 通常対戦でプレイ開始まで (14 手順)
  var toRandomGame = ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'].concat(toGame); // ランダム対戦でプレイ開始まで (5 手順)
  var postMatch = '結果画面は 2026-10-07 に決定 (U20〜U30)。Win / Lose / Draw と「切断する」は端末の下のモック操作で、勝敗判定そのものは対象外。' +
    '秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値 (初期値 1000、K=24) は QA² 側の仮の値で、タイマーは左の環境イベントか端末の下のモック操作で進める。';
  var matchMenu = 'オンライン対戦の MATCH MENU は 2026-10-07 に決定 (案A、U37〜U42)。試合は止まらず (Time.timeScale = 0 にしない、BGM も下げない)、' +
    '暗幕は薄くゲーム画面が見えたまま。ボタンは CONTINUE と SURRENDER だけで、対戦中に REMATCH / RETRY は無い (U39)。';
  var beforeStart = 'Ready 画面と開始前の切断は 2026-10-07 に決定 (U31 の Ready への変更、U32〜U36)。試合が始まる (3-2-1 のあとサーバーが確認する) までは Ready を取り消せ、勝敗は記録しない。' +
    '秒数 (Ready の 60 秒・再接続の 20 秒・読み込みの 20 秒) は QA² 側の仮の値で、タイマーは左の環境イベントで進める。「アプリを離れる」「切断する」は端末の下のモック操作。';

  return [
    { id: '1', title: '通常対戦 (ホストが先に Ready)', diagram: '01',
      desc: 'ホストが Create Match、クライアントが Match Code で Join Match。自動で Friend joined! → Ready 画面になる。Ready 画面にはプレイヤーごとのカード (どちらも "Not ready") と Ready / Leave Room (U36)。' +
        'Ready 画面になっても自動では始まらず、両者が Ready を押したら開始 (U31。ボタンの名前は 2026-10-07 に Start Match から Ready に変更)。' +
        'ホストが Ready を押すと送っている間 "Confirming…"、届くとホストのカードが "✓ Ready" になり、ホストは "Waiting for opponent…" と 60 秒のカウントダウンと Cancel Ready、クライアントは "Opponent is ready. Are you?"。' +
        'クライアントも押すと両者 "Starting match…" → VS 画面 → ゲーム画面に移り、ゲーム本体のカウントダウン (3 → 2 → 1) のあとプレイ開始。VS 画面は合意で追加したもの (図では「カウントダウン & ゲーム開始」のみ)。モック独自の 3·2·1 は置かない (U2 で決定)。' + beforeStart,
      steps: toReady.concat(bothStart, toGame) },
    { id: '1b', title: '通常対戦 (クライアントが先に Ready)', diagram: '01',
      desc: 'シナリオ 1 と同じだが、クライアントが先に Ready を押す。クライアントは "Waiting for opponent…" と 60 秒のカウントダウン、ホストは "Opponent is ready. Are you?"。' +
        'ホストも押すと両者 "Starting match…" → VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (U31 / U36)。' + beforeStart,
      steps: toReady.concat(clientFirst, toGame) },
    { id: '2a', title: '待機中にホストが別画面へ → 戻って対戦', diagram: '02', opts: { U14: 'keep', U1: 'lobby' },
      desc: 'ホストが待機中に ‹ で戻ると、Friend Match トップに青い "Waiting for your friend…" バナー。さらに他の画面 (ステージ選択) へ行っても表示が続く。クライアントが入ると緑 "Friend joined!" → 赤 "Ready to start"。クライアント側は "Host User / Away"。ホストが赤いトーストをタップするとロビーの Ready 画面に戻り、クライアントは Friend joined! → Ready 画面。そのあと両者が Ready を押して開始 (U31 で決定)。',
      steps: hostCreates.concat(['host.back', 'host.back'], clientJoins,
        ['sys.readyScreen', 'host.tapToast', 'sys.readyScreen'], bothStart, toGame) },
    { id: '2b', title: '待機中にホストが別画面へ → 放置して期限切れ', diagram: '02', opts: { U14: 'keep' },
      desc: 'ホストが別画面のまま放置すると Match Code の有効期限が切れ、濃い赤の "Match code expired" トースト。タップすると "Match code expired." のロビー。クライアントは "Match expired."。',
      steps: hostCreates.concat(['host.back', 'host.back'], clientJoins,
        ['sys.readyScreen', 'timer.codeExpired', 'host.tapToast']) },
    { id: '3a', title: 'Ready 画面で通信不安定 → 回復', diagram: '03',
      desc: 'Ready を押す前に、何らかの理由で通信が不安定になり "Connecting…"。通信が回復すると Ready 画面に戻り、両者が Ready を押して開始。図03 はホスト側のみで、クライアント側は仮表示 (未決 U5)。' +
        '片方の接続が切れたとき (開始前) は U32 で決まった別の流れ (19c / 19d / 12)。',
      steps: toReady.concat(['net.unstable', 'net.recovered'], bothStart, toGame) },
    { id: '3b', title: 'Ready 画面で通信不安定 → 切断 → キャンセル', diagram: '03',
      desc: '通信が回復しないと "Connection lost."。Cancel Match → "Cancel this match?" → Cancel Match で Friend Match トップへ。クライアントは U34 にそろえて "Room closed. The host left." で Friend Match トップへ (仮、U51)。' +
        'しばらく待つかキャンセルのみかは未決 (U5)。',
      steps: toReady.concat(['net.unstable', 'net.lost', 'host.cancelMatch', 'host.dialog.cancelMatch']) },
    { id: '3c', title: 'Ready 後に通信不安定 → 切断 → ‹ で戻る', diagram: '03', opts: { U14: 'keep' },
      desc: '図03 では Connection lost の画面から ‹ で戻ると、青い "Waiting for your friend…" バナー付きの Friend Match トップになる (未決 U19)。',
      steps: toReady.concat(['net.unstable', 'net.lost', 'host.back']) },
    { id: '4', title: 'Ready 画面でホストが Leave Room (ルームを閉じる)', diagram: '04 (10-07 の決定 U34 で変更)',
      desc: 'ホストが Leave Room を押すと、確認 "No match has started. No win or loss will be recorded." (U34。題名 "Leave this room?" と Stay in Room は仮、U51)。' +
        'Leave Room でルームを閉じ、ホストは Friend Match トップ、クライアントは "Room closed. The host left." で Friend Match トップへ (U34)。図04 の "cancelled the match." と ‹ だけの画面は無くなった (U8 も解消)。' + beforeStart,
      steps: toReady.concat(['host.leaveRoom', 'host.dialog.leaveRoom']) },
    { id: '4b', title: 'Leave Room の確認で Stay in Room', diagram: '04 (10-07 の決定 U34 で変更)',
      desc: 'ホストが Ready を押したあと Leave Room を押し、確認で Stay in Room を選ぶとルームに残る (Ready もそのまま)。そのあとクライアントも Ready を押して開始。' + beforeStart,
      steps: toReady.concat(hostReady, ['host.leaveRoom', 'host.dialog.stay'], clientReady, ['sys.bothStarted']) },
    { id: '5', title: 'Ready 画面でクライアントが Leave Room → 同じ Match Code で入り直す', diagram: '05 (10-07 の決定 U34 で変更)',
      desc: 'クライアントが Leave Room → 確認 "No match has started. No win or loss will be recorded." → Leave Room。クライアントは Match Code が残った Friend Match トップへ。' +
        'ホストは "Your friend left. Waiting for another friend…" (U34)。Match Code は変わらないので、クライアントが Join Match で入り直すとホストは Friend joined! になる。' +
        '図05 の "left the match." → 自動で待機に戻る流れは、この 1 画面にまとめた。' + beforeStart,
      steps: toReady.concat(['client.leaveRoom', 'client.dialog.leaveRoom', 'client.joinMatch']) },
    { id: '6', title: '読み込みが 20 秒で終わらない → もう一度 Ready', diagram: '06 (10-07 の決定 U32 で変更)',
      desc: '両者が Ready を押し ("Starting match…")、読み込みが 20 秒 (仮) で終わらない (左の環境イベント) と、両者に "Match could not start. Please try again." を出して Ready 画面に戻る (U32)。両者の Ready は消える。' +
        'もう一度両者が Ready を押して VS 画面へ。図06 の "Unable to start the match." と、片方だけ再試行したとき (U15) の扱いを置き換えた。' + beforeStart,
      steps: toReady.concat(bothStart.slice(0, 4), ['timer.loadTimeout'], bothStart, toGame) },
    { id: '7a', title: 'Ready 画面でクライアントが ‹ → 確認 → 抜ける', diagram: '07 (10-07 の決定 U35 で置き換え)',
      desc: 'クライアントが Ready を押したあと ‹ (別の画面へ移る) を押すと、Leave Room と同じ確認 "No match has started. No win or loss will be recorded." (U35)。Stay in Room で残り、もう一度 ‹ → Leave Room で抜ける。' +
        'ホストは "Your friend left. Waiting for another friend…" (U34)。図07 の「別画面へ移ってもマッチを残し、赤い "Ready to start" トーストで戻る」流れは無くなった (U10 / U18 も解消)。' + beforeStart,
      steps: toReady.concat(clientReady, ['client.back', 'client.dialog.stay', 'client.back', 'client.dialog.leaveRoom']) },
    { id: '7b', title: 'Ready のあとアプリを離れる → Ready が消える', diagram: '07 (10-07 の決定 U35 で置き換え)',
      desc: 'ホストが Ready を押したあと、アプリを離れる (バックグラウンド・画面ロック。端末の下のモック操作「アプリを離れる」) と、ホストの Ready は消えてルームには残る (U35)。' +
        'クライアントには "Opponent is no longer ready." (Cancel Ready と同じ表示、仮、U53)。そのあと両者が Ready を押して開始。' + beforeStart,
      steps: toReady.concat(hostReady, ['host.leaveApp'], bothStart, toGame) },
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
      desc: '両者が Random Match を選ぶと、相手を探す画面 ("Searching for an opponent…" と大きな Cancel)。相手が見つかったらすぐ VS 画面へ進み (Ready 画面は無い、U13a で決定)、ゲーム本体のカウントダウン → プレイ開始。' +
        '両者が Ready を押す U31 は Friend Match だけ。探している間の Cancel・‹・アプリを離れたとき・タイムアウトは 11b〜11f (U13 で決定)。',
      steps: ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'].concat(toGame) },
    { id: '11b', title: 'ランダム対戦 → Cancel / ‹ で Online Battle へ', diagram: '10-03 / 10-07 の決定 (U13a / U13)', clientNote: hostOnly,
      desc: 'ホストが Random Match を選び、相手を探している間に Cancel を押すと、確認ダイアログなしで Online Battle の画面に戻る (U13a / U13)。' +
        'もう一度探し、今度は ‹ を押す。‹ も Cancel とまったく同じで Online Battle へ戻る (U13)。探している間に行けるのは Online Battle だけ。',
      steps: ['host.randomMatch', 'host.cancelSearch', 'host.randomMatch', 'host.back'] },
    { id: '11c', title: 'ランダム対戦 → アプリを離れて検索が止まる → Search again', diagram: '10-07 の決定 (U13 / U43)',
      desc: 'ホストが相手を探している間にアプリを離れる (バックグラウンド・画面ロック。端末の下のモック操作「アプリを離れる」) と、検索が止まる (U13)。' +
        '戻ると Online Battle の中に "Search stopped while the app was in the background." と Search again / Close (U43、モーダルではない)。' +
        'Search again でもう一度探し、クライアントも Random Match を選ぶと相手が見つかって VS 画面へ (U13a)。',
      steps: ['host.randomMatch', 'host.leaveApp', 'host.searchAgain', 'client.randomMatch', 'sys.opponentFound'] },
    { id: '11d', title: 'ランダム対戦 → アプリを離れて検索が止まる → Close', diagram: '10-07 の決定 (U13 / U43)', hostNote: clientOnly,
      desc: 'クライアントが相手を探している間にアプリを離れて戻ると、Online Battle の中に "Search stopped while the app was in the background." (U13 / U43)。Close で通知を閉じ、Online Battle のまま (U43)。',
      steps: ['client.randomMatch', 'client.leaveApp', 'client.closeNotice'] },
    { id: '11g', title: 'ランダム対戦 → アプリを離れて検索が止まる → 通知を出したまま Friend Match', diagram: '10-07 の決定 (U43)', clientNote: hostOnly,
      desc: 'ホストがアプリを離れて検索が止まり、Online Battle の中に "Search stopped while the app was in the background."。通知はモーダルではないので、' +
        'そのまま Friend Match を押せる (U43)。ほかの画面へ移ると通知は消え、‹ で Online Battle に戻っても出ない。通知は自動では消えない。',
      steps: ['host.randomMatch', 'host.leaveApp', 'host.friendMatch', 'host.back'] },
    { id: '11e', title: 'ランダム対戦 → 60 秒で見つからない → Search again', diagram: '10-07 の決定 (U13)',
      desc: 'ホストだけが相手を探し、見つからないまま 60 秒たつ (端末の下のモック操作「60 秒たつ」。60 秒という長さは仮) と、元の画面 (Online Battle) に "No opponent found." と Search again / Close (U13)。' +
        'Search again でもう一度探し、クライアントも Random Match を選ぶと相手が見つかって VS 画面へ (U13a)。',
      steps: ['host.randomMatch', 'host.searchTimeout', 'host.searchAgain', 'client.randomMatch', 'sys.opponentFound'] },
    { id: '11f', title: 'ランダム対戦 → 60 秒で見つからない → Close', diagram: '10-07 の決定 (U13)', clientNote: hostOnly,
      desc: 'ホストが相手を探し、見つからないまま 60 秒 (仮) たつと "No opponent found."。Close で通知を閉じ、Online Battle のまま (U13)。',
      steps: ['host.randomMatch', 'host.searchTimeout', 'host.closeNotice'] },
    { id: '12', title: 'VS 画面中にクライアントが切断 → 戻らない → 同じ Match Code で入り直す', diagram: 'なし (10-07 の決定 U32)',
      desc: 'VS 画面中にクライアントの接続が切れる (端末の下のモック操作「切断する」) と、試合はまだ始まっていないので両者の Ready を消して止める (U32)。' +
        'ホストは Ready 画面に "Opponent disconnected. Waiting for them to reconnect…" と 20 秒のカウントダウンと Leave Room、クライアントは "Reconnecting…" (切断した側の画面は仮、U52)。' +
        '20 秒 (仮) たっても戻らない (左の環境イベント) と、ホストは "Match cancelled. Opponent did not reconnect." (結果なし) で同じ Match Code のままルームに残る。クライアントがもう一度 Join Match で入ると Friend joined!。' +
        '以前の U3 (VS 画面中の切断の戻り先) のトグルは、この決定で無くなった。' + beforeStart,
      steps: toReady.concat(bothStart, ['client.disconnect', 'timer.disconnectTimeout', 'client.joinMatch']) },
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
        'ホストが Rematch で応じると、ロビーの Ready を挟まずにそのまま VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (U23)。今度はクライアントが Win を押す。' + postMatch,
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
    { id: '19', title: 'Cancel Ready (Ready を取り消してもルームに残る)', diagram: 'なし (10-07 の決定 U34 / U36)',
      desc: 'クライアントが Ready を押したあと、Cancel Ready で取り消す。クライアントはルームに残って "Not ready" に戻り、ホストには "Opponent is no longer ready." (U34)。' +
        'そのあとホストが Ready を押すと、今度はホストが "Waiting for opponent…" になる。' + beforeStart,
      steps: toReady.concat(clientReady, ['client.cancelReady'], hostReady) },
    { id: '19b', title: 'Ready のタイムアウト (60 秒)', diagram: 'なし (10-07 の決定 U33)',
      desc: 'ホストが Ready を押し、クライアントが 60 秒 (仮) 押さない (左の環境イベント) と、両者の Ready を消して両者に "Ready check timed out. Press Ready when you’re ready." (U33)。' +
        '罰はなく、どちらもルームに残る。もう一度両者が Ready を押して開始。' + beforeStart,
      steps: toReady.concat(hostReady, ['timer.readyTimeout'], clientFirst, toGame) },
    { id: '19c', title: 'カウントダウン中にホストが切断 → 20 秒のうちに戻る → もう一度 Ready', diagram: 'なし (10-07 の決定 U32)',
      desc: 'ゲーム本体のカウントダウン中にホストの接続が切れる (端末の下のモック操作「切断する」)。3-2-1 のあとサーバーが確認するまでは試合開始ではないので、勝敗はつけず、両者の Ready を消して止める (U32)。' +
        'クライアントは Ready 画面に "Opponent disconnected. Waiting for them to reconnect…" と 20 秒のカウントダウンと Leave Room、ホストは "Reconnecting…" (仮、U52)。' +
        '20 秒 (仮) のうちに戻る (左の環境イベント「通信が回復する」) と、両者とももう一度 Ready を押し、カウントダウンは 3 からやり直す。' + beforeStart,
      steps: toReady.concat(bothStart, ['vs.done', 'host.disconnect', 'net.recovered'], bothStart, toGame) },
    { id: '19d', title: 'Ready 画面でホストが切断 → 戻らない → Room closed', diagram: 'なし (10-07 の決定 U32 / U33)',
      desc: 'クライアントが Ready を押して待っている間にホストの接続が切れると、両者の Ready を消して止める (U32 / U33)。クライアントは "Opponent disconnected…" で 20 秒 (仮) 待つ。' +
        'ホストが戻らないと、クライアントは "Room closed. The host disconnected." で Friend Match トップへ (U32)。ホストは Friend Match トップ (仮、U52)。' + beforeStart,
      steps: toReady.concat(clientReady, ['host.disconnect', 'timer.disconnectTimeout']) },
    { id: '19e', title: '相手の切断を待っている間に Leave Room', diagram: 'なし (10-07 の決定 U32 / U34)',
      desc: 'Ready 画面でクライアントの接続が切れ、ホストが "Opponent disconnected…" で待っている間に Leave Room を押す。確認 "No match has started. No win or loss will be recorded." のあと Leave Room でルームを閉じる (U32 / U34)。' +
        '切断中のクライアントは、戻ったときに "Room closed. The host left." の Friend Match トップ (仮、U52)。' + beforeStart,
      steps: toReady.concat(['client.disconnect', 'host.leaveRoom', 'host.dialog.leaveRoom']) },
  ];
})();
