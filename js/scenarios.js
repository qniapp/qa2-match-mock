/*
 * シナリオ = 遷移表のイベント列。各手順は TRANSITIONS の 1 行をそのまま再生する。
 *   ctx:  モック設定 (Join a Match / New Match の結果)
 *   hostNote / clientNote: その端末が関与しないときに右パネル (現在の状態の下) に出す注記。端末の画面には出さない
 * シナリオの説明はページに出さず、README のシナリオ一覧に書く。
 */

var SCENARIOS = (function () {
  var hostCreates = ['host.friendMatch', 'host.createMatch'];
  // Join Match で Join a Match を開き、Match Code を入れて Join (決定 U63)
  var joinCode = ['client.openJoin', 'client.enterCode', 'client.joinMatch'];
  var clientJoins = ['client.friendMatch'].concat(joinCode);
  // 参加の確認 (ホスト "Friend joined!" / クライアント "Connecting…") → 両者がそろって同期が終わると Ready 画面 (決定 U4)
  var toReady = hostCreates.concat(clientJoins, ['sys.roomSynced']); // Ready 画面まで (7 手順)
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
  var randomSearch = ['host.randomMatch', 'host.startSearch', 'client.randomMatch', 'client.startSearch']; // 両者が Random Match の画面を開いて Ready で探し始める (U62)
  var toRandomGame = randomSearch.concat(['sys.opponentFound'], toGame); // ランダム対戦でプレイ開始まで (7 手順)

  return [
    { id: '1', title: '通常対戦 (ホストが先に Ready)', diagram: '01',
      steps: toReady.concat(bothStart, toGame) },
    { id: '1b', title: '通常対戦 (クライアントが先に Ready)', diagram: '01',
      steps: toReady.concat(clientFirst, toGame) },
    { id: '3a', title: 'Ready 画面でホストが切断 → 20 秒のうちに戻る → もう一度 Ready', diagram: '03 (10-07 の決定 U5 で置き換え)',
      steps: toReady.concat(clientReady, ['host.disconnect', 'net.recovered'], bothStart, toGame) },
    { id: '3b', title: 'Ready 画面でクライアントが切断 → 戻らない → Could not reconnect → ‹ で抜ける', diagram: '03 (10-07 の決定 U5 で置き換え、10-10 の U57 で ‹ に)',
      steps: toReady.concat(['client.disconnect', 'timer.disconnectTimeout', 'client.back', 'client.dialog.leaveMatch']) },
    { id: '3c', title: 'Ready 画面でホストが切断 → 戻らない → Retry → 空の部屋に戻る', diagram: '03 (10-07 の決定 U5 で置き換え)',
      steps: toReady.concat(['host.disconnect', 'timer.disconnectTimeout', 'host.retry', 'net.recovered', 'client.openJoin', 'client.closeJoin', 'client.closeNotice'], joinCode, ['sys.roomSynced']) },
    { id: '3e', title: 'Ready 画面でホストが切断 → 戻らない → Could not reconnect → ‹ で部屋を閉じる', diagram: '03 (10-07 の決定 U5、10-10 の U57)',
      steps: toReady.concat(['host.disconnect', 'timer.disconnectTimeout', 'host.back', 'host.dialog.cancelMatch']) },
    { id: '4', title: 'Ready 画面でホストが ‹ → "Cancel this match?" → 部屋を閉じる', diagram: '04 (10-07 の決定 U34、10-10 の U57 で ‹ に)',
      steps: toReady.concat(['host.back', 'host.dialog.cancelMatch']) },
    { id: '4b', title: 'ホストの ‹ の確認で Keep Waiting (Ready のまま残る)', diagram: '04 (10-07 の決定 U11、10-10 の U57)',
      steps: toReady.concat(hostReady, ['host.back', 'host.dialog.keepWaiting'], clientReady, ['sys.bothStarted']) },
    { id: '4c', title: '友だちを待っている間にホストが ‹ → Keep Waiting → ‹ → 部屋を閉じる', diagram: 'なし (10-10 の決定 U57)', clientNote: hostOnly,
      steps: hostCreates.concat(['host.back', 'host.dialog.keepWaiting', 'host.back', 'host.dialog.cancelMatch']) },
    { id: '5', title: 'Ready 画面でクライアントが ‹ → "Leave this match?" → 抜ける → 同じ Match Code で入り直す', diagram: '05 (10-07 の決定 U34、10-10 の U57 で ‹ に)',
      steps: toReady.concat(['client.back', 'client.dialog.leaveMatch'], joinCode, ['sys.roomSynced']) },
    { id: '5b', title: '同期の前 ("Connecting…") のクライアントが ‹ → Stay → ‹ → 抜ける', diagram: 'なし (10-07 の決定 U9 / U11、10-10 の U57)',
      steps: hostCreates.concat(clientJoins, ['client.back', 'client.dialog.stay', 'client.back', 'client.dialog.leaveMatch']) },
    { id: '6', title: '読み込みが 20 秒で終わらない → もう一度 Ready', diagram: '06 (10-07 の決定 U32 で変更)',
      steps: toReady.concat(bothStart.slice(0, 4), ['timer.loadTimeout'], bothStart, toGame) },
    { id: '6b', title: '開始の同期に失敗 → もう一度 Ready', diagram: '06 (10-07 の決定 U15 で変更)',
      steps: toReady.concat(bothStart.slice(0, 4), ['sys.syncFailed'], clientFirst, toGame) },
    { id: '7a', title: 'Ready 画面でクライアントが ‹ → 確認 → Stay → ‹ → 抜ける', diagram: '07 (10-07 の決定 U9 / U35 で置き換え)',
      steps: toReady.concat(clientReady, ['client.back', 'client.dialog.stay', 'client.back', 'client.dialog.leaveMatch']) },
    { id: '7b', title: 'Ready のあとアプリを離れる → Ready が消える', diagram: '07 (10-07 の決定 U35 で置き換え)',
      steps: toReady.concat(hostReady, ['host.leaveApp'], bothStart, toGame) },
    { id: '8', title: '無効な Match Code', diagram: '08', ctx: { codeResult: 'notFound' }, hostNote: clientOnly,
      steps: clientJoins },
    { id: '9', title: 'Match Code が期限切れ (見つからないときと同じ表示)', diagram: '09 (10-17 の決定 U63 で 08 と同じ表示に)',
      steps: hostCreates.concat(['timer.codeExpired'], clientJoins) },
    { id: '10', title: 'マッチが満員', diagram: '10', ctx: { codeResult: 'full' }, hostNote: clientOnly,
      steps: clientJoins },
    { id: '11', title: 'ランダム対戦 (Ready で探し始め、相手が見つかり次第 VS)', diagram: '00 + 10-03 の決定 (U13a)、10-17 の U62',
      steps: randomSearch.concat(['sys.opponentFound'], toGame) },
    { id: '11b', title: 'ランダム対戦 → Cancel で Ready 待ちに戻る / ‹ で Online Battle へ', diagram: '10-07 の決定 (U13)、10-17 の U62', clientNote: hostOnly,
      steps: ['host.randomMatch', 'host.startSearch', 'host.cancelSearch', 'host.startSearch', 'host.back', 'host.randomMatch', 'host.back'] },
    { id: '11c', title: 'ランダム対戦 → アプリを離れて検索が止まる → Search again', diagram: '10-07 の決定 (U13 / U43)',
      steps: ['host.randomMatch', 'host.startSearch', 'host.leaveApp', 'host.searchAgain', 'client.randomMatch', 'client.startSearch', 'sys.opponentFound'] },
    { id: '11d', title: 'ランダム対戦 → アプリを離れて検索が止まる → Close', diagram: '10-07 の決定 (U13 / U43)', hostNote: clientOnly,
      steps: ['client.randomMatch', 'client.startSearch', 'client.leaveApp', 'client.closeNotice'] },
    { id: '11g', title: 'ランダム対戦 → アプリを離れて検索が止まる → 通知を出したまま Friend Match', diagram: '10-07 の決定 (U43)', clientNote: hostOnly,
      steps: ['host.randomMatch', 'host.startSearch', 'host.leaveApp', 'host.friendMatch', 'host.back'] },
    { id: '11h', title: 'ランダム対戦 → アプリを離れて検索が止まる → 通知を出したまま Random Match (Ready 待ちから)', diagram: '10-07 の決定 (U43)、10-17 の U62', clientNote: hostOnly,
      steps: ['host.randomMatch', 'host.startSearch', 'host.leaveApp', 'host.randomMatch', 'host.startSearch'] },
    { id: '11e', title: 'ランダム対戦 → 60 秒で見つからない → Search again', diagram: '10-07 の決定 (U13)',
      steps: ['host.randomMatch', 'host.startSearch', 'host.searchTimeout', 'host.searchAgain', 'client.randomMatch', 'client.startSearch', 'sys.opponentFound'] },
    { id: '11f', title: 'ランダム対戦 → 60 秒で見つからない → Close', diagram: '10-07 の決定 (U13)', clientNote: hostOnly,
      steps: ['host.randomMatch', 'host.startSearch', 'host.searchTimeout', 'host.closeNotice'] },
    { id: '12', title: 'VS 画面中にクライアントが切断 → 戻らない → 同じ Match Code で入り直す', diagram: 'なし (10-07 の決定 U32)',
      steps: toReady.concat(bothStart, ['client.disconnect', 'timer.disconnectTimeout'], joinCode) },
    { id: '13b', title: 'ホストが Match Code をコピー → "Match code copied" のトースト → 2 秒で消える', diagram: 'なし (10-19 の決定 U69)', clientNote: hostOnly,
      steps: hostCreates.concat(['host.copyCode', 'toast.hidden']) },
    { id: '13', title: 'New Match / Join がサーバーに届かない (Connection failed)', diagram: '00 (トーストのみ、10-07 の決定 U6)', ctx: { createResult: 'connFailed', codeResult: 'connFailed' },
      steps: hostCreates.concat(clientJoins, ['host.tapToast', 'client.tapToast']) },
    { id: '15', title: 'Friend Match の対戦後 (ホスト勝利 → 両者が同じ部屋へ戻る → クライアントが抜ける)', diagram: 'なし (10-07 の決定 U20〜U26、10-17 の U61)',
      steps: toMatchEnd.concat(['host.win', 'host.backToFriendMatch', 'client.backToFriendMatch', 'sys.roomSynced', 'client.back', 'client.dialog.leaveMatch']) },
    { id: '15b', title: 'Friend Match の対戦後 (ホストが負け → クライアントが先に部屋へ戻る → ホストが部屋を閉じる)', diagram: 'なし (10-07 の決定 U20〜U26、10-17 の U61)',
      steps: toMatchEnd.concat(['host.lose', 'client.backToFriendMatch', 'host.backToFriendMatch', 'sys.roomSynced', 'host.back', 'host.dialog.cancelMatch']) },
    { id: '15c', title: 'Friend Match の再戦 (申し込み → 応じる → VS)', diagram: 'なし (10-07 の決定 U23 / U30)',
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.rematch'], toGame, ['client.win']) },
    { id: '15d', title: '再戦の申し込みを取り消す → 3 秒後にまた申し込める', diagram: 'なし (10-07 の決定 U30)',
      steps: toMatchEnd.concat(['host.win', 'host.rematch', 'host.cancelRematch', 'timer.rematchCooldown', 'client.rematch', 'host.rematch']) },
    { id: '15e', title: '再戦を断られる (Decline)', diagram: 'なし (10-07 の決定 U30)',
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.declineRematch', 'timer.rematchCooldown', 'client.backToFriendMatch']) },
    { id: '15f', title: '再戦の申し込みに応答がない (20 秒) → 申し込み直す', diagram: 'なし (10-07 の決定 U30)',
      steps: toMatchEnd.concat(['host.win', 'host.rematch', 'timer.rematchTimeout', 'timer.rematchCooldown', 'host.rematch', 'client.rematch']) },
    { id: '15g', title: '引き分け → 両者が同時に Rematch', diagram: 'なし (10-07 の決定 U20 / U23)',
      steps: toMatchEnd.concat(['client.draw', 'sys.rematchSimultaneous'], toGame) },
    { id: '15h', title: '結果画面のスタンプ', diagram: 'なし (10-07 の決定 U27)',
      steps: toMatchEnd.concat(['host.win', 'host.stamp.gg', 'client.stamp.thanks', 'host.stampShown', 'host.stampInterval', 'host.stamp.nice']) },
    { id: '16', title: '対戦中に MATCH MENU → CONTINUE (試合は続く)', diagram: 'なし (10-07 の決定、案A)',
      steps: toMatchEnd.concat(['host.matchMenu', 'client.matchMenu', 'host.matchMenu.continue', 'client.matchMenu.continue']) },
    { id: '16b', title: '対戦中に降参 (MATCH MENU の SURRENDER ですぐ負け) → 降参した側が Rematch → 応じる', diagram: 'なし (10-07 の決定、案A、10-19 の U65 / U66)',
      steps: toMatchEnd.concat(['host.matchMenu', 'host.matchMenu.continue', 'host.matchMenu', 'host.matchMenu.surrender', 'host.rematch', 'client.rematch'], toGame) },
    { id: '16c', title: 'MATCH MENU を開いている間に試合が終わる', diagram: 'なし (10-07 の決定、案A)',
      steps: toMatchEnd.concat(['host.matchMenu', 'client.win']) },
    { id: '16d', title: 'ランダム対戦で降参 (レートが変わる) → 降参した側も勝った側も Find Next Opponent', diagram: 'なし (10-07 の決定 U21 / U28 / U41、10-19 の U65〜U67)',
      steps: toRandomGame.concat(['client.matchMenu', 'client.matchMenu.surrender', 'client.findNextOpponent', 'host.findNextOpponent']) },
    { id: '17', title: 'ランダム対戦の対戦後 (Elo → 負けた側の Rematch に応じる → レートが変わらない → 次の相手)', diagram: 'なし (10-07 の決定 U21 / U22 / U29、10-17 の U60)',
      steps: toRandomGame.concat(['host.win', 'client.rematch', 'host.rematch'], toGame,
        ['host.win', 'host.findNextOpponent', 'client.backToRandomMatch', 'client.startSearch', 'sys.opponentFound']) },
    { id: '17d', title: 'ランダム対戦で負けた側の Rematch を断る → 勝った側は次の相手へ', diagram: 'なし (10-17 の決定 U60)',
      steps: toRandomGame.concat(['host.win', 'client.rematch', 'host.declineRematch', 'timer.rematchCooldown', 'host.findNextOpponent', 'client.backToRandomMatch']) },
    { id: '17e', title: 'ランダム対戦で負けた側の Rematch に応答がない (20 秒) → 申し込み直す → 応じる', diagram: 'なし (10-17 の決定 U60)',
      steps: toRandomGame.concat(['host.win', 'client.rematch', 'timer.rematchTimeout', 'timer.rematchCooldown', 'client.rematch', 'host.rematch'], toGame) },
    { id: '17b', title: 'ランダム対戦の対戦後 → 次の相手が見つからない', diagram: 'なし (10-07 の決定 U29)',
      steps: toRandomGame.concat(['host.win', 'host.findNextOpponent', 'host.searchTimeout', 'host.searchAgain', 'host.searchTimeout', 'host.backToOnlineBattle']) },
    { id: '17c', title: '次の相手を探している間にアプリを離れる → "Search stopped…" → Search again', diagram: 'なし (10-08 の決定 U47)',
      steps: toRandomGame.concat(['host.win', 'host.findNextOpponent', 'host.leaveApp', 'host.searchAgain', 'client.backToRandomMatch', 'client.startSearch', 'sys.opponentFound']) },
    { id: '18', title: '対戦中にクライアントが切断 → 20 秒で切断した側の負け', diagram: 'なし (10-07 の決定 U28)',
      steps: toMatchEnd.concat(['client.disconnect', 'timer.disconnectTimeout', 'host.backToFriendMatch']) },
    { id: '18b', title: '対戦中にホストが切断 → 20 秒のうちに戻る', diagram: 'なし (10-07 の決定 U28)',
      steps: toMatchEnd.concat(['host.disconnect', 'net.recovered', 'host.win']) },
    { id: '18c', title: '両者が切断 → No contest', diagram: 'なし (10-07 の決定 U28)',
      steps: toMatchEnd.concat(['client.disconnect', 'net.bothDisconnected']) },
    { id: '18d', title: 'ランダム対戦でサービス障害 → No contest (レートは変わらない)', diagram: 'なし (10-07 の決定 U28 / U21)',
      steps: toRandomGame.concat(['net.serviceFailure', 'host.backToRandomMatch', 'client.findNextOpponent']) },
    { id: '18e', title: 'ランダム対戦で切断負け (レートが変わる)', diagram: 'なし (10-07 の決定 U28 / U21)',
      steps: toRandomGame.concat(['host.disconnect', 'timer.disconnectTimeout']) },
    { id: '19', title: 'Cancel Ready (Ready を取り消しても部屋に残る)', diagram: 'なし (10-07 の決定 U34 / U36)',
      steps: toReady.concat(clientReady, ['client.cancelReady'], hostReady) },
    { id: '19b', title: 'Ready のタイムアウト (60 秒)', diagram: 'なし (10-07 の決定 U33)',
      steps: toReady.concat(hostReady, ['timer.readyTimeout'], clientFirst, toGame) },
    { id: '19c', title: 'カウントダウン中にホストが切断 → 20 秒のうちに戻る → もう一度 Ready', diagram: 'なし (10-07 の決定 U32)',
      steps: toReady.concat(bothStart, ['vs.done', 'host.disconnect', 'net.recovered'], bothStart, toGame) },
    { id: '19d', title: 'VS 画面中にホストが切断 → 戻らない → 対戦の取りやめ', diagram: 'なし (10-07 の決定 U32)',
      steps: toReady.concat(bothStart, ['host.disconnect', 'timer.disconnectTimeout']) },
    { id: '19e', title: '友だちの切断を待っている間にホストが ‹ → 部屋を閉じる', diagram: 'なし (10-07 の決定 U5 / U34、10-10 の U57)',
      steps: toReady.concat(['client.disconnect', 'host.back', 'host.dialog.cancelMatch']) },
    { id: '20', title: '両者が Ready 画面にいる間に期限切れ → New Match / Join Match', diagram: 'なし (10-07 の決定 U7 / U10 / U18)',
      steps: toReady.concat(clientReady, ['timer.codeExpired', 'host.createMatch'], joinCode, ['sys.roomSynced']) },
    { id: '21', title: 'ランダム対戦の VS 画面中に切断 → 20 秒のうちに戻る → VS 画面からやり直す', diagram: 'なし (10-08 の決定 U54)',
      steps: randomSearch.concat(['sys.opponentFound', 'client.disconnect', 'net.recovered'], toGame) },
    { id: '21b', title: 'ランダム対戦のカウントダウン中に切断 → 戻らない → 取りやめ → Search again', diagram: 'なし (10-08 の決定 U52 / U54)',
      steps: randomSearch.concat(['sys.opponentFound', 'vs.done', 'host.disconnect', 'timer.disconnectTimeout', 'host.searchAgain', 'client.searchAgain', 'sys.opponentFound']) },
    { id: '21c', title: 'Friend Match の再戦の VS 画面中に切断 → 戻らない → Friend Match トップ', diagram: 'なし (10-08 の決定 U52 / U54)',
      steps: toMatchEnd.concat(['host.win', 'client.rematch', 'host.rematch', 'client.disconnect', 'timer.disconnectTimeout', 'host.closeNotice', 'client.closeNotice']) },
    // Profile (決定 U56、入口は #1891 の FB 12): Random Match・Friend Match トップ・部屋の画面 (U68) の上にダイアログで開く。選ぶとすぐ保存し、右上の × で閉じる (#1891 の FB 14、U64)。
    // 相手を探している間と部屋の画面で選ぶと、この対戦の相手に見える
    { id: '22', title: 'Random Match で相手を探している間に Profile を開いて選ぶ → 見つかった相手の VS 画面に出る', diagram: 'なし (10-08 の決定 U56、#1891 の FB 12 / FB 14)',
      steps: ['host.randomMatch', 'host.startSearch', 'host.profile', 'host.dialog.pickEmoji.rocket', 'host.dialog.pickGreeting.bringItOn', 'host.dialog.closeProfile',
        'client.randomMatch', 'client.startSearch', 'sys.opponentFound'].concat(toGame, ['client.win', 'host.rematch', 'client.rematch']) },
    { id: '22b', title: 'Friend Match で Profile を開いて選ぶとすぐ保存され、× で閉じても開き直しても残る', diagram: 'なし (10-08 の決定 U56、#1891 の FB 12 / FB 14、10-19 の U64)', clientNote: hostOnly,
      steps: ['host.friendMatch', 'host.profile', 'host.dialog.pickEmoji.robot', 'host.dialog.pickGreeting.goodLuck', 'host.dialog.closeProfile',
        'host.profile', 'host.dialog.pickEmoji.star', 'host.dialog.closeProfile'] },
    { id: '22c', title: 'Ready 画面で Profile を開いて選ぶ → 相手が Ready を押しても閉じない → × で閉じて Ready → VS 画面に出る', diagram: 'なし (10-19 の決定 U68)',
      steps: toReady.concat(['host.profile', 'host.dialog.pickEmoji.rocket', 'client.ready', 'sys.readyConfirmed', 'host.dialog.pickGreeting.bringItOn',
        'host.dialog.closeProfile', 'host.ready', 'sys.readyConfirmed', 'sys.bothStarted']) },
  ];
})();
