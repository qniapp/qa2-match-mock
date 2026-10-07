/*
 * シナリオ = 遷移表のイベント列。各手順は TRANSITIONS の 1 行をそのまま再生する。
 *   ctx:  モック設定 (Join Match / Create Match の結果)
 *   hostNote / clientNote: その端末が関与しないときに右パネル (現在の状態の下) に出す注記。端末の画面には出さない
 */

var SCENARIOS = (function () {
  var hostCreates = ['host.friendMatch', 'host.createMatch'];
  var clientJoins = ['client.friendMatch', 'client.enterCode', 'client.joinMatch'];
  // 参加の確認 (ホスト "Friend joined!" / クライアント "Connecting…") → 両者がそろって同期が終わると Ready 画面 (決定 U4)
  var toReady = hostCreates.concat(clientJoins, ['sys.roomSynced']); // Ready 画面まで (6 手順)
  // 決定 (U31 / U36): 両者が Ready を押したら開始。押すと "Confirming…"、届くと押した側は "Waiting for opponent…"、相手側は "Opponent is ready. Are you?"。
  // 2 人目の Ready が届くと "Starting match…" (読み込み)、自動で VS 画面
  var hostReady = ['host.ready', 'sys.readyConfirmed'];
  var clientReady = ['client.ready', 'sys.readyConfirmed'];
  var bothStart = hostReady.concat(clientReady, ['sys.bothStarted']); // ホストが先 (5 手順)
  var clientFirst = clientReady.concat(hostReady, ['sys.bothStarted']); // クライアントが先
  var toGame = ['vs.done', 'game.countdownDone']; // VS 画面 → ゲーム本体のカウントダウン → プレイ開始
  var clientOnly = 'このシナリオではホストは関与しない (ホストの端末は Online Battle のまま)';
  var hostOnly = 'このシナリオではクライアントは関与しない (クライアントの端末は Online Battle のまま)';
  var toMatchEnd = toReady.concat(bothStart, toGame); // 通常対戦でプレイ開始まで (13 手順)
  var toRandomGame = ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound'].concat(toGame); // ランダム対戦でプレイ開始まで (5 手順)
  var postMatch = '結果画面は 2026-10-07 に決定 (U20〜U30。細部は 2026-10-08 の U44〜U50)。時間切れの勝ち / 負け / 同点と「切断する」は端末の下のモック操作で、得点の計算は対象外。' +
    '秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値 (初期値 1000、K=24) は QA² 側の仮の値で、タイマーは右パネルの環境イベントか端末の下のモック操作で進める。';
  var matchMenu = 'オンライン対戦の MATCH MENU は 2026-10-07 に決定 (案A、U37〜U42)。試合は止まらず (Time.timeScale = 0 にしない、BGM も下げない)、' +
    '暗幕は薄くゲーム画面が見えたまま。ボタンは CONTINUE と SURRENDER だけで、対戦中に REMATCH / RETRY は無い (U39)。';
  var beforeStart = 'Ready 画面と開始前の切断は 2026-10-07 に決定 (U31 の Ready への変更、U32〜U36。細部は 2026-10-08 の U52 / U53)。Ready を取り消せるのは届いたあとの Ready 画面だけで、' +
    '試合が始まる (3-2-1 のあとサーバーが確認する) までは勝敗を記録しない。' +
    '秒数 (Ready の 60 秒・再接続の 20 秒・読み込みの 20 秒) は QA² 側の仮の値で、タイマーは右パネルの環境イベントで進める。「アプリを離れる」「切断する」は端末の下のモック操作。';
  var roomNote = 'フレンド対戦の部屋は 2026-10-07 に決定 (U1〜U19。細部は 2026-10-08 の U51 / U52 / U55)。ホストの ‹ は確認なしで部屋を残して帯で示し (U14)、クライアントの ‹ は退出の確認 (U9)。' +
    '秒数 (再接続の 20 秒・Ready の 60 秒) と Match Code の期限 30 分は QA² 側の仮の値で、タイマーは右パネルの環境イベントで進める。「アプリを離れる」「切断する」は端末の下のモック操作。';

  return [
    { id: '1', title: '通常対戦 (ホストが先に Ready)', diagram: '01',
      desc: 'ホストが Create Match、クライアントが Match Code で Join Match。サーバーが参加を確認すると、ホストは "Friend joined!"、クライアントは "Connecting…" (どちらも Ready はまだ押せない、U4)。' +
        '両者が部屋の画面にそろって同期が終わると Ready 画面になる (決まった待ち時間ではない、U4)。Ready 画面にはプレイヤーごとのカード (どちらも "Not ready")、Match Code の下に "Code expires in 30:00" (U7)、' +
        'ボタンはホストが Ready / Close Room、クライアントが Ready / Leave Room (U14 / U9)。両者が Ready を押したら開始 (U31)。' +
        'ホストが Ready を押すと送っている間 "Confirming…"、届くとホストのカードが "✓ Ready" になり、ホストは "Waiting for opponent…" と 60 秒のカウントダウンと Cancel Ready、クライアントは "Opponent is ready. Are you?"。' +
        'クライアントも押すと両者 "Starting match…" → VS 画面 → ゲーム画面に移り、ゲーム本体のカウントダウン (3 → 2 → 1) のあとプレイ開始。VS 画面は合意で追加したもの (図では「カウントダウン & ゲーム開始」のみ)。モック独自の 3·2·1 は置かない (U2 で決定)。' + beforeStart,
      steps: toReady.concat(bothStart, toGame) },
    { id: '1b', title: '通常対戦 (クライアントが先に Ready)', diagram: '01',
      desc: 'シナリオ 1 と同じだが、クライアントが先に Ready を押す。クライアントは "Waiting for opponent…" と 60 秒のカウントダウン、ホストは "Opponent is ready. Are you?"。' +
        'ホストも押すと両者 "Starting match…" → VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (U31 / U36)。' + beforeStart,
      steps: toReady.concat(clientFirst, toGame) },
    { id: '2a', title: '待機中にホストが別画面へ → 友だちが入る → 緑の帯をタップして戻る', diagram: '02 (10-07 の決定 U4 / U14 / U16 / U17)',
      desc: 'ホストが待機中に ‹ で戻っても部屋は残り、Friend Match トップに青い "Waiting for your friend…" の帯 (U14)。さらに他の画面 (ステージ選択) へ行っても帯が続く。' +
        'クライアントが入ると帯は緑の "Friend joined!" (U17)。ホストが部屋の画面にいないので同期は終わらず、クライアントは "Connecting…" のまま (カードのホストは "Away"、U4)。' +
        'ホストが緑の帯をタップすると部屋の画面に戻り (U16)、両者がそろって同期が終わると Ready 画面。そのあと両者が Ready を押して開始。' + roomNote,
      steps: hostCreates.concat(['host.back', 'host.back'], clientJoins, ['host.tapToast', 'sys.roomSynced'], bothStart, toGame) },
    { id: '2b', title: '待機中にホストが別画面へ → 放置して期限切れ → 作り直す', diagram: '02 (10-07 の決定 U7 / U10 / U18)',
      desc: 'ホストが別画面のまま放置すると Match Code の期限 (30 分、仮) が切れ、濃い赤の "Match code expired." の帯 (U7)。クライアントは別の画面へ移されず、部屋の画面のまま "Match code expired." と Join Match (U18 / U10)。' +
        'ホストが帯をタップすると部屋の画面に "Match code expired." と Create Match (Ready は出さない、U10)。ホストが Create Match で新しい部屋を作り、クライアントは Join Match で Friend Match トップへ戻って新しい Match Code を入れる。' + roomNote,
      steps: hostCreates.concat(['host.back', 'host.back'], clientJoins,
        ['timer.codeExpired', 'host.tapToast', 'host.createMatch', 'client.joinMatch', 'client.enterCode', 'client.joinMatch', 'sys.roomSynced']) },
    { id: '2c', title: 'Ready 画面でホストが ‹ → 友だちが Ready → "Friend is ready!" をタップして戻る', diagram: '02 (10-07 の決定 U1 / U14)',
      desc: 'ホストが Ready を押したあと ‹ で離れると、部屋は残るがホストの Ready は消え (U14)、クライアントには "Opponent is no longer ready." (カードのホストは "Away")。ホストの帯は "Friend is in the room" (U55)。' +
        'クライアントが Ready を押すと、ホストの帯は赤い "Friend is ready!" (U1)。タップすると部屋の画面に戻るだけで、Ready は押さない (U1 / U16)。戻った画面で Ready を押して開始。' + roomNote,
      steps: toReady.concat(hostReady, ['host.back'], clientReady, ['host.tapToast'], hostReady, ['sys.bothStarted'], toGame) },
    { id: '2d', title: 'ホストの離席中に友だちが抜ける → "Your friend left." を一度 → 入り直す', diagram: '02 (10-07 の決定 U17)',
      desc: 'Ready 画面でホストが ‹ で離れている間に、クライアントが Leave Room → 確認 "Leave this room?" → Leave Room で抜ける (U9)。' +
        'ホストの帯に "Your friend left." を一度だけ出し、そのあと青い "Waiting for your friend…" に戻る (U17。出す長さは 5 秒 (仮)、U55)。' +
        'クライアントが同じ Match Code で入り直すと、本当に入り直したので帯は緑の "Friend joined!" (U17)。ホストがタップして戻ると同期して Ready 画面。' + roomNote,
      steps: toReady.concat(['host.back', 'client.leaveRoom', 'client.dialog.leaveRoom', 'sys.friendLeftShown', 'client.joinMatch', 'host.tapToast', 'sys.roomSynced']) },
    { id: '2e', title: 'ホストの離席中に友だちが切断 → "Reconnecting…" → 20 秒で "Waiting for your friend…"', diagram: '02 / 03 (10-07 の決定 U5 / U19)',
      desc: 'Ready 画面でホストが ‹ で離れている間に、クライアントの接続が切れる (端末の下のモック操作「切断する」)。ホストの帯は青い "Waiting for your friend…" ではなく "Reconnecting…" (U19)、' +
        'クライアントは "Connection lost. Reconnecting…" (U5)。ホストがステージ選択へ移っても帯は続く。20 秒 (仮) たっても戻らない (右パネルの環境イベント) と、ホストの帯は "Waiting for your friend…" に戻り、クライアントは "Could not reconnect." と Retry / Leave Room (U5)。' +
        'クライアントが Retry してつながると部屋に入り直し、ホストの帯は緑の "Friend joined!" (U17)。ホストがタップして戻ると同期して Ready 画面。' + roomNote,
      steps: toReady.concat(['host.back', 'client.disconnect', 'host.back', 'timer.disconnectTimeout', 'client.retry', 'net.recovered', 'host.tapToast', 'sys.roomSynced']) },
    { id: '3a', title: 'Ready 画面でホストが切断 → 20 秒のうちに戻る → もう一度 Ready', diagram: '03 (10-07 の決定 U5 で置き換え)',
      desc: 'クライアントが Ready を押して待っている間にホストの接続が切れる (端末の下のモック操作「切断する」)。両者の Ready は消え、20 秒 (仮) まで自動で再接続する (U5)。' +
        'ホストは "Connection lost. Reconnecting…"、クライアントは "Your friend disconnected. Waiting for them to reconnect…"。' +
        '20 秒のうちに戻る (右パネルの環境イベント「通信が回復する」) と、両者とも Ready していない Ready 画面に戻る (入り直しではないので "Friend joined!" は出さない、U17)。両者が Ready を押して開始。' +
        '図03 の「両者が "Connecting…" → "Connection lost." → Cancel Match」の流れは、この決定で置き換えた。' + roomNote,
      steps: toReady.concat(clientReady, ['host.disconnect', 'net.recovered'], bothStart, toGame) },
    { id: '3b', title: 'Ready 画面でクライアントが切断 → 戻らない → Could not reconnect → Leave Room', diagram: '03 (10-07 の決定 U5 で置き換え)',
      desc: 'クライアントの接続が切れ、20 秒 (仮) たっても戻らない (右パネルの環境イベント) と、クライアントは "Could not reconnect." と Retry / Leave Room (U5)。' +
        'ホストは空の部屋を残して "Waiting for your friend…" (同じ Match Code)。クライアントが Leave Room → 確認 → Leave Room で Friend Match トップへ戻る (U5 / U9)。' + roomNote,
      steps: toReady.concat(['client.disconnect', 'timer.disconnectTimeout', 'client.leaveRoom', 'client.dialog.leaveRoom']) },
    { id: '3c', title: 'Ready 画面でホストが切断 → 戻らない → Retry → 空の部屋に戻る', diagram: '03 (10-07 の決定 U5 で置き換え)',
      desc: 'ホストの接続が切れると、両者に 20 秒のカウントダウン ("Connection lost. Reconnecting…" は U52)。20 秒 (仮) たっても戻らないと、ホストは "Could not reconnect." と Retry / Leave Room、' +
        'クライアントは Friend Match トップへ戻り、"The room was closed." の帯 (U52。"You left the room" とは出さない)。' +
        'ホストが Retry してつながる (右パネルの環境イベント「通信が回復する」) と、残しておいた空の部屋に戻る ("Waiting for your friend…"、U5)。' +
        'クライアントが Match Code を入れても帯は残り (U52)、Close で閉じる。同じ Match Code で入り直すと "Friend joined!" (U17)。' + roomNote,
      steps: toReady.concat(['host.disconnect', 'timer.disconnectTimeout', 'host.retry', 'net.recovered', 'client.enterCode', 'client.closeNotice', 'client.joinMatch', 'sys.roomSynced']) },
    { id: '3d', title: '友だちの切断を待っている間にホストが ‹ → "Reconnecting…" の帯 → 戻ってくる', diagram: '03 (10-07 の決定 U14 / U19)',
      desc: 'クライアントの接続が切れ、ホストが "Your friend disconnected…" で待っている間に ‹ で離れる。部屋は残り、帯は青い "Waiting for your friend…" ではなく "Reconnecting…" (U19、図03 の「‹ で青い待機の帯」を置き換えた)。' +
        '20 秒のうちにクライアントが戻ると、クライアントは Ready 画面に戻り、ホストの帯は "Friend is in the room" (U55)。ホストがタップして Ready 画面に戻る (U16)。' + roomNote,
      steps: toReady.concat(['client.disconnect', 'host.back', 'net.recovered', 'host.tapToast']) },
    { id: '4', title: 'ホストが Close Room (部屋を閉じる)', diagram: '04 (10-07 の決定 U14 / U34 で変更)',
      desc: 'ホストが Close Room を押すと確認 (題名 "Close this room?"、U51。本文 "No match has started. No win or loss will be recorded."、U34。ボタン Close Room / Keep Waiting、U11)。' +
        'Close Room で部屋を閉じ、ホストは Friend Match トップ、クライアントは "Room closed. The host left." で Friend Match トップへ (U34)。部屋を閉じるのは Close Room だけで、‹ では閉じない (U14)。' + roomNote,
      steps: toReady.concat(['host.closeRoom', 'host.dialog.closeRoom']) },
    { id: '4b', title: 'Close Room の確認で Keep Waiting', diagram: '04 (10-07 の決定 U11 / U14)',
      desc: 'ホストが Ready を押したあと Close Room を押し、確認で Keep Waiting (以前の "Go Back"、U11) を選ぶと部屋に残る (Ready もそのまま)。そのあとクライアントも Ready を押して開始。' + roomNote,
      steps: toReady.concat(hostReady, ['host.closeRoom', 'host.dialog.keepWaiting'], clientReady, ['sys.bothStarted']) },
    { id: '5', title: 'Ready 画面でクライアントが Leave Room → 同じ Match Code で入り直す', diagram: '05 (10-07 の決定 U9 / U34 で変更)',
      desc: 'クライアントが Leave Room → 確認 "Leave this room?" / "No match has started. No win or loss will be recorded." → Leave Room (U9 / U34)。クライアントは Match Code が残った Friend Match トップへ。' +
        'ホストは "Your friend left. Waiting for another friend…" (U34)。Match Code は変わらないので、クライアントが Join Match で入り直すとホストは "Friend joined!" (本当に入り直したので、U17)。' +
        '図05 の "left the match." → 自動で待機に戻る流れは、この 1 画面にまとめた。' + roomNote,
      steps: toReady.concat(['client.leaveRoom', 'client.dialog.leaveRoom', 'client.joinMatch', 'sys.roomSynced']) },
    { id: '5b', title: '同期の前 ("Connecting…") のクライアントが ‹ → Keep Waiting → Leave Room', diagram: 'なし (10-07 の決定 U9 / U11)',
      desc: '部屋に入った直後 (同期の前) のクライアントは "Connecting…"。以前はボタンが無かったが、Leave Room を出す (U9)。' +
        '‹ を押すと Leave Room と同じ確認 "Leave this room?" (U9)。Keep Waiting で残り (U11)、Leave Room → Leave Room で抜けると、ホストは "Your friend left. Waiting for another friend…"。' + roomNote,
      steps: hostCreates.concat(clientJoins, ['client.back', 'client.dialog.keepWaiting', 'client.leaveRoom', 'client.dialog.leaveRoom']) },
    { id: '6', title: '読み込みが 20 秒で終わらない → もう一度 Ready', diagram: '06 (10-07 の決定 U32 で変更)',
      desc: '両者が Ready を押し ("Starting match…")、読み込みが 20 秒 (仮) で終わらない (右パネルの環境イベント) と、両者に "Match could not start. Please try again." を出して Ready 画面に戻る (U32)。両者の Ready は消える。' +
        'もう一度両者が Ready を押して VS 画面へ。' + beforeStart,
      steps: toReady.concat(bothStart.slice(0, 4), ['timer.loadTimeout'], bothStart, toGame) },
    { id: '6b', title: '開始の同期に失敗 → もう一度 Ready', diagram: '06 (10-07 の決定 U15 で変更)',
      desc: '両者が Ready を押したあと、開始の同期に失敗する (右パネルの環境イベント) と、両者の Ready を消して "Couldn’t start the match. Please ready up again." (U15)。' +
        'ふつうの Ready の流れ (60 秒の期限つき) からやり直し、両者が Ready を押して VS 画面へ。Match Code が有効な間は何度でもやり直せる。図06 の "Unable to start the match." を置き換えた。' + beforeStart,
      steps: toReady.concat(bothStart.slice(0, 4), ['sys.syncFailed'], clientFirst, toGame) },
    { id: '7a', title: 'Ready 画面でクライアントが ‹ → 確認 → Keep Waiting → ‹ → 抜ける', diagram: '07 (10-07 の決定 U9 / U35 で置き換え)',
      desc: 'クライアントが Ready を押したあと ‹ (別の画面へ移る) を押すと、Leave Room と同じ確認 "Leave this room?" (U9 / U35)。Keep Waiting で残り (Ready もそのまま、U11)、もう一度 ‹ → Leave Room で抜ける。' +
        'ホストは "Your friend left. Waiting for another friend…" (U34)。図07 の「別画面へ移ってもマッチを残し、赤いトーストで戻る」流れは無くなった (クライアントは部屋に入ったまま別の画面へは移れない)。' + roomNote,
      steps: toReady.concat(clientReady, ['client.back', 'client.dialog.keepWaiting', 'client.back', 'client.dialog.leaveRoom']) },
    { id: '7b', title: 'Ready のあとアプリを離れる → Ready が消える', diagram: '07 (10-07 の決定 U35 で置き換え)',
      desc: 'ホストが Ready を押したあと、アプリを離れる (バックグラウンド・画面ロック。端末の下のモック操作「アプリを離れる」) と、ホストの Ready は消えて部屋には残る (U35)。' +
        'クライアントには "Opponent is no longer ready." (Cancel Ready と同じ表示、U53)。そのあと両者が Ready を押して開始。' + beforeStart,
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
        'ホストは Ready 画面に "Opponent disconnected. Waiting for them to reconnect…" と 20 秒のカウントダウンと Close Room、クライアントは "Connection lost. Reconnecting…" と 20 秒のカウントダウン (U52)。' +
        '20 秒 (仮) たっても戻らない (右パネルの環境イベント) と、ホストは "Match cancelled. Opponent did not reconnect." (結果なし) で同じ Match Code のまま部屋に残る。' +
        'クライアントは Friend Match トップに "Could not reconnect. The match did not start." の帯 (U52)。もう一度 Match Code を入れて Join Match で入ると "Friend joined!"。' +
        '部屋 (Ready 画面・読み込み) での切断は U5 で、文言と流れが違う (3a〜3d)。' + beforeStart,
      steps: toReady.concat(bothStart, ['client.disconnect', 'timer.disconnectTimeout', 'client.enterCode', 'client.joinMatch']) },
    { id: '13', title: 'Create / Join がサーバーに届かない (Connection failed)', diagram: '00 (トーストのみ、10-07 の決定 U6)', ctx: { createResult: 'connFailed', codeResult: 'connFailed' },
      desc: '"Connection failed" のトーストは、Create Match / Join Match がサーバーに届かないときだけ出す (U6)。ホストは "Couldn’t create a room. Try again."、クライアントは "Couldn’t join the room. Try again."。' +
        'Match Code の誤り・期限切れ・満員 (8〜10) や閉じた部屋の表示とは別。モックではモック設定の「接続失敗」で再現する。トーストはタップで閉じる。',
      steps: hostCreates.concat(clientJoins, ['host.tapToast', 'client.tapToast']) },
    { id: '14', title: '離席中に Create Match → 確認 → 古い部屋は新しい部屋を作れてから閉じる', diagram: 'なし (10-01 合意、10-07 の決定 U12)',
      desc: 'Ready 画面でホストが ‹ で Friend Match トップへ戻り (部屋は残る、U14)、もう一度 Create Match を押すと "Create a new match?"。' +
        '本文はホスト向けの "This will close your current room. Your friend will return to Friend Match." (U12)。[Keep Current Match] で今の部屋のまま、[Create Match] で作り直す。' +
        '新しい部屋を作れたときだけ古い部屋を閉じ、クライアントは "Room closed. The host left." で Friend Match トップへ (U12 / U34)。' +
        '作れなかったとき (モック設定「Create Match の結果 = 接続失敗」、自由操作で試せる) は古い部屋も帯もそのままで、"Connection failed" のトーストを出す (U6)。' + roomNote,
      steps: toReady.concat(['host.back', 'host.createMatch', 'host.dialog.keepCurrent', 'host.createMatch', 'host.dialog.createMatch']) },
    { id: '15', title: 'Friend Match の対戦後 (ホスト勝利 → 両者が抜ける)', diagram: 'なし (10-07 の決定 U20〜U26)',
      desc: '通常対戦でゲームまで進み、時間切れでホストの得点が上 (ホストの下のモック操作「勝ち」) だと、ホストは "WIN!"、クライアントは自動で "LOSE" の結果画面。両者の名前・スコア・終わった理由 ("Time is up"、U44) と "No rating change (friend match)" (U20 / U21)。' +
        'ボタンは Rematch と Back to Friend Match (U22)。ホストが Back to Friend Match で Friend Match トップへ抜けると、クライアントの結果画面はそのまま "Your opponent left. Rematch is not available." (U24 / U25)。続けてクライアントも抜ける。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.backToFriendMatch', 'client.backToFriendMatch']) },
    { id: '15b', title: 'Friend Match の対戦後 (時間切れでホストが負け → クライアントが先に抜ける)', diagram: 'なし (10-07 の決定 U20〜U26)',
      desc: '時間切れでホストの得点が下 (ホストの下のモック操作「負け」) だと、ホストは "LOSE"、クライアントは自動で "WIN!"。今度はクライアントが先に Back to Friend Match で抜け、ホストに "Your opponent left. Rematch is not available." (U25)。' + postMatch,
      steps: toMatchEnd.concat(['host.lose', 'client.backToFriendMatch']) },
    { id: '15c', title: 'Friend Match の再戦 (申し込み → 応じる → VS)', diagram: 'なし (10-07 の決定 U23 / U30)',
      desc: 'ホストが勝ったあと、クライアントが Rematch を押すと "Waiting for your opponent…" と Cancel Request、ホストには "Your opponent wants a rematch" と Rematch / Decline (U23 / U30)。' +
        'ホストが Rematch で応じると、ロビーの Ready を挟まずにそのまま VS 画面 → ゲーム本体のカウントダウン → プレイ開始 (U23)。今度は時間切れでクライアントが勝つ。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.rematch'], toGame, ['client.win']) },
    { id: '15d', title: '再戦の申し込みを取り消す → 3 秒後にまた申し込める', diagram: 'なし (10-07 の決定 U30)',
      desc: 'ホストが Rematch で申し込み、Cancel Request で取り消すと、両者に "Rematch request cancelled" (クライアントは U30、ホストは U50。2026-10-08 に両者の文言を統一)。' +
        '両者とも結果画面に残り、3 秒 (仮) は Rematch を押せない。3 秒たっても一行は次の操作まで残る (U50)。' +
        '右パネルの環境イベント「3 秒たつ」でまた押せるようになり、今度はクライアントが申し込んでホストが応じ、VS 画面へ。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.rematch', 'host.cancelRematch', 'timer.rematchCooldown', 'client.rematch', 'host.rematch']) },
    { id: '15e', title: '再戦を断られる (Decline)', diagram: 'なし (10-07 の決定 U30)',
      desc: 'クライアントが Rematch で申し込み、ホストが Decline で断ると、クライアントに "Your opponent declined the rematch" (U30)、ホストにも "Rematch declined" (U50)。' +
        '両者とも結果画面に残り、3 秒 (仮) のあとはまた申し込める (一行は残る)。' +
        'そのあとクライアントが Back to Friend Match で抜けると、ホストに "Your opponent left. Rematch is not available." (U25)。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.declineRematch', 'timer.rematchCooldown', 'client.backToFriendMatch']) },
    { id: '15f', title: '再戦の申し込みに応答がない (20 秒) → 申し込み直す', diagram: 'なし (10-07 の決定 U30)',
      desc: 'ホストが Rematch で申し込み、クライアントが 20 秒 (仮) 応答しないと (右パネルの環境イベント)、ホストに "No response to rematch request" (U30)、クライアントには "Rematch request expired" (U50)。' +
        '3 秒 (仮) のあとホストが申し込み直し、今度はクライアントが応じて VS 画面へ。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'host.rematch', 'timer.rematchTimeout', 'timer.rematchCooldown', 'host.rematch', 'client.rematch']) },
    { id: '15g', title: '引き分け → 両者が同時に Rematch', diagram: 'なし (10-07 の決定 U20 / U23)',
      desc: '時間切れで同点 (クライアントの下のモック操作「同点」) になると、両者 "DRAW" / "Same score when time ran out" の結果画面 (U20 / U44)。' +
        '両者が同時に Rematch を押す (右パネルの環境イベント) と、申し込みに応じたのと同じく成立し、そのまま VS 画面 → プレイ開始 (U23)。' + postMatch,
      steps: toMatchEnd.concat(['client.draw', 'sys.rematchSimultaneous'], toGame) },
    { id: '15h', title: '結果画面のスタンプとミュート', diagram: 'なし (10-07 の決定 U27)',
      desc: 'ホストが 👏 "Good game"、クライアントが 🤝 "Thanks for the match" を送ると、両者の画面で送った人の名前の上に出る (U27)。送ってから 5 秒 (仮) はスタンプを押せない。' +
        'ホストのスタンプが 3 秒 (仮) で消えたあと、クライアントが 🔔 で相手のスタンプをミュート。ホストが 5 秒 (仮) たって 👍 "Nice" を送ると、ホストの画面には出るがクライアントの画面には出ない。' +
        'クライアントが "Unmute opponent emotes" で解くと出る。3 秒・5 秒は端末の下のモック操作。ミュートは同じ相手と続けて対戦している間だけ続き、相手には知らせない (U49)。' + postMatch,
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
      desc: 'ホストが MATCH MENU を開いている間も試合は続くので、その間に時間切れでクライアントが勝つと (端末の下のモック操作「勝ち」)、ホストのメニューは閉じて負けの結果画面になる (U37)。' + matchMenu,
      steps: toMatchEnd.concat(['host.matchMenu', 'client.win']) },
    { id: '16d', title: 'ランダム対戦で降参 (レートが変わる、再戦なし)', diagram: 'なし (10-07 の決定 U21 / U28 / U41)',
      desc: 'ランダム対戦でクライアントが降参すると、クライアントは "LOSE" / "You surrendered" で 1000 → 988 (-12)、ホストは "WIN!" / "Your opponent surrendered" で 1000 → 1012 (+12) (U21)。' +
        '降参した側は再戦を申し込めず (U28)、Back to Online だけ (U41)。勝ったホストにも Rematch は無く (U45)、Find Next Opponent / Back to Online。' + postMatch,
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
    { id: '17c', title: '次の相手を探している間にアプリを離れる → "Search stopped…" → Search again', diagram: 'なし (10-08 の決定 U47)',
      desc: 'クライアントが勝ったあと、ホストが Find Next Opponent で次の相手を探している間にアプリを離れる (端末の下のモック操作「アプリを離れる」)。' +
        'Random Match から探しているとき (U43) と同じく検索を止め、戻ると Online Battle の中に "Search stopped while the app was in the background." と Search again / Close (U47)。' +
        'Search again でもう一度探し、クライアントも Back to Online から Random Match を選ぶと相手が見つかる。' + postMatch,
      steps: toRandomGame.concat(['client.win', 'host.findNextOpponent', 'host.leaveApp', 'host.searchAgain', 'client.backToOnlineBattle', 'client.randomMatch', 'sys.opponentFound']) },
    { id: '18', title: '対戦中にクライアントが切断 → 20 秒で切断した側の負け', diagram: 'なし (10-07 の決定 U28)',
      desc: 'Friend Match の対戦中にクライアントの接続が切れる (端末の下のモック操作「切断する」) と、サーバーが両者のゲームと得点を止め、ホストは "Your opponent disconnected"、クライアントは "Connection lost" / "Reconnecting…"。' +
        'どちらにも残りの秒数 (20 秒、仮) を出す (U46)。' +
        '20 秒たっても戻らない (右パネルの環境イベント) と、切断したクライアントの負け: ホストは "WIN!" / "Your opponent disconnected"、クライアントは "LOSE" / "You were disconnected" (U28)。再戦は無い (U45)。' + postMatch,
      steps: toMatchEnd.concat(['client.disconnect', 'timer.disconnectTimeout', 'host.backToFriendMatch']) },
    { id: '18b', title: '対戦中にホストが切断 → 20 秒のうちに戻る', diagram: 'なし (10-07 の決定 U28)',
      desc: 'ホストの接続が切れたあと、20 秒 (仮) のうちに通信が回復する (右パネルの環境イベント) と、止めていたところから両者とも試合を続ける (U46)。そのあと時間切れでホストが勝つ。' + postMatch,
      steps: toMatchEnd.concat(['host.disconnect', 'net.recovered', 'host.win']) },
    { id: '18c', title: '両者が切断 → No contest', diagram: 'なし (10-07 の決定 U28)',
      desc: 'クライアントの接続が切れ、ホストが待っている間にホストの接続も切れると (右パネルの環境イベント「両者の接続が切れる」)、両者とも "NO CONTEST" / "No contest due to a connection error" (U28)。' +
        'スコアは決まっていないので行ごと出さない (U20)。再戦は無い (U45)。' + postMatch,
      steps: toMatchEnd.concat(['client.disconnect', 'net.bothDisconnected']) },
    { id: '18d', title: 'ランダム対戦でサービス障害 → No contest (レートは変わらない)', diagram: 'なし (10-07 の決定 U28 / U21)',
      desc: 'ランダム対戦の対戦中にサービス障害が起きると (右パネルの環境イベント)、両者とも "NO CONTEST" / "No contest due to a connection error" で "No rating change (no contest)" (U28 / U21)。' +
        'ホストは Back to Online、クライアントは Find Next Opponent で抜ける。' + postMatch,
      steps: toRandomGame.concat(['net.serviceFailure', 'host.backToOnlineBattle', 'client.findNextOpponent']) },
    { id: '18e', title: 'ランダム対戦で切断負け (レートが変わる)', diagram: 'なし (10-07 の決定 U28 / U21)',
      desc: 'ランダム対戦でホストの接続が切れ、20 秒 (仮) たっても戻らないと、ホストの負け: ホストは 1000 → 988 (-12)、クライアントは 1000 → 1012 (+12) (U28 / U21)。' + postMatch,
      steps: toRandomGame.concat(['host.disconnect', 'timer.disconnectTimeout']) },
    { id: '19', title: 'Cancel Ready (Ready を取り消しても部屋に残る)', diagram: 'なし (10-07 の決定 U34 / U36)',
      desc: 'クライアントが Ready を押したあと、Cancel Ready で取り消す。クライアントは部屋に残って "Not ready" に戻り、ホストには "Opponent is no longer ready." (U34)。' +
        'そのあとホストが Ready を押すと、今度はホストが "Waiting for opponent…" になる。' + beforeStart,
      steps: toReady.concat(clientReady, ['client.cancelReady'], hostReady) },
    { id: '19b', title: 'Ready のタイムアウト (60 秒)', diagram: 'なし (10-07 の決定 U33)',
      desc: 'ホストが Ready を押し、クライアントが 60 秒 (仮) 押さない (右パネルの環境イベント) と、両者の Ready を消して両者に "Ready check timed out. Press Ready when you’re ready." (U33)。' +
        '罰はなく、どちらも部屋に残る。もう一度両者が Ready を押して開始。' + beforeStart,
      steps: toReady.concat(hostReady, ['timer.readyTimeout'], clientFirst, toGame) },
    { id: '19c', title: 'カウントダウン中にホストが切断 → 20 秒のうちに戻る → もう一度 Ready', diagram: 'なし (10-07 の決定 U32)',
      desc: 'ゲーム本体のカウントダウン中にホストの接続が切れる (端末の下のモック操作「切断する」)。3-2-1 のあとサーバーが確認するまでは試合開始ではないので、勝敗はつけず、両者の Ready を消して止める (U32)。' +
        'クライアントは Ready 画面に "Opponent disconnected. Waiting for them to reconnect…" と 20 秒のカウントダウンと Leave Room、ホストは "Connection lost. Reconnecting…" と 20 秒のカウントダウン (U52)。' +
        '20 秒 (仮) のうちに戻る (右パネルの環境イベント「通信が回復する」) と、両者とももう一度 Ready を押し、カウントダウンは 3 からやり直す。' + beforeStart,
      steps: toReady.concat(bothStart, ['vs.done', 'host.disconnect', 'net.recovered'], bothStart, toGame) },
    { id: '19d', title: 'VS 画面中にホストが切断 → 戻らない → Room closed', diagram: 'なし (10-07 の決定 U32)',
      desc: 'VS 画面中にホストの接続が切れると、両者の Ready を消して止める (U32)。クライアントは "Opponent disconnected…" で 20 秒 (仮) 待つ。' +
        'ホストが戻らないと、クライアントは "Room closed. The host disconnected." で Friend Match トップへ (U32)。ホストは Friend Match トップに "Could not reconnect. The match did not start." (U52)。' +
        '部屋での切断 (U5) では、ホストが戻らなくても部屋は残る (3c)。' + beforeStart,
      steps: toReady.concat(bothStart, ['host.disconnect', 'timer.disconnectTimeout']) },
    { id: '19e', title: '友だちの切断を待っている間に Close Room', diagram: 'なし (10-07 の決定 U5 / U14 / U34)',
      desc: 'Ready 画面でクライアントの接続が切れ、ホストが "Your friend disconnected. Waiting for them to reconnect…" で待っている間に Close Room を押す (U5 / U14)。確認のあと Close Room で部屋を閉じる (U34)。' +
        '切断中のクライアントは、戻ったときに "Room closed. The host left." の Friend Match トップ (モックの仮定。お知らせは Close で閉じる帯、U52)。' + roomNote,
      steps: toReady.concat(['client.disconnect', 'host.closeRoom', 'host.dialog.closeRoom']) },
    { id: '20', title: '両者が Ready 画面にいる間に期限切れ → Create Match / Join Match', diagram: 'なし (10-07 の決定 U7 / U10 / U18)',
      desc: '両者が Ready 画面にいる間に Match Code の期限 (30 分、仮) が切れる (右パネルの環境イベント) と、両者に "Match code expired." (U7)。Ready は消え、Ready のボタンも出さない (U10)。' +
        'ホストには Create Match、クライアントには Join Match。クライアントは別の画面へ移されず、今の画面のまま (U18)。ホストが Create Match で新しい部屋を作り、クライアントが Join Match → 新しい Match Code を入れて入る。' + roomNote,
      steps: toReady.concat(clientReady, ['timer.codeExpired', 'host.createMatch', 'client.joinMatch', 'client.enterCode', 'client.joinMatch', 'sys.roomSynced']) },
    { id: '21', title: 'ランダム対戦の VS 画面中に切断 → 20 秒のうちに戻る → VS 画面からやり直す', diagram: 'なし (10-08 の決定 U54)',
      desc: 'ランダム対戦の VS 画面中にクライアントの接続が切れる (端末の下のモック操作「切断する」)。試合はまだ始まっていないが、Ready 画面は無いので VS 画面のまま 20 秒 (仮) 待つ (U54)。' +
        '表示は対戦中の切断 (U46) と同じで、ホストは "Your opponent disconnected"、クライアントは "Connection lost" と、どちらも残りの秒数。' +
        '20 秒のうちに戻る (端末の下のモック操作「再接続する」か右パネルの環境イベント) と、VS 画面からやり直してゲーム本体のカウントダウン → プレイ開始。',
      steps: ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound', 'client.disconnect', 'net.recovered'].concat(toGame) },
    { id: '21b', title: 'ランダム対戦のカウントダウン中に切断 → 戻らない → 取りやめ → Search again', diagram: 'なし (10-08 の決定 U52 / U54)',
      desc: 'ランダム対戦のゲーム本体のカウントダウン中にホストの接続が切れ、20 秒 (仮) たっても戻らない (端末の下のモック操作「20 秒たつ」) と、試合を取りやめる (U54)。勝敗は無く、レートも変わらない。' +
        'ホストは Online Battle の中に "Could not reconnect. The match did not start." (U52)、クライアントは "Match cancelled. Opponent did not reconnect."。どちらも Search again / Close (U54。U43 と同じくモーダルではない)。' +
        '両者が Search again で探し直すと、相手が見つかって新しいランダム対戦の VS 画面 (レートが変わる対戦)。',
      steps: ['host.randomMatch', 'client.randomMatch', 'sys.opponentFound', 'vs.done', 'host.disconnect', 'timer.disconnectTimeout', 'host.searchAgain', 'client.searchAgain', 'sys.opponentFound'] },
    { id: '21c', title: 'Friend Match の再戦の VS 画面中に切断 → 戻らない → Friend Match トップ', diagram: 'なし (10-08 の決定 U52 / U54)',
      desc: 'Friend Match の対戦のあと再戦が成立し、VS 画面中にクライアントの接続が切れる。再戦は Ready 画面に戻らず (U54)、VS 画面のまま 20 秒 (仮) 待つ (表示は U46 と同じ)。' +
        '戻らないと試合を取りやめ (勝敗なし)、両者とも Friend Match トップへ: ホストは "Match cancelled. Opponent did not reconnect."、クライアントは "Could not reconnect. The match did not start." の帯 (U52)。' +
        '行き先 (Back to Friend Match と同じ Friend Match トップ、U24) と帯の文言は 2026-10-08 に確認。両者とも Close で帯を閉じる。' + postMatch,
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.rematch', 'client.disconnect', 'timer.disconnectTimeout', 'host.closeNotice', 'client.closeNotice']) },
  ];
})();
