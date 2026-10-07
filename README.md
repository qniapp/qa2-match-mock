# qa2-match-mock

QA² のオンライン対戦 (Friend Match) の導線を議論するための、使い捨ての HTML モックです (qniapp/qa2#1891)。
ホストとクライアントの 2 台の画面を並べ、同じ操作で両方がどう変わるかを一度に見られるようにしています。
見た目の作り込みよりも、流れの分かりやすさを優先しています。

> 注意: このリポジトリは使い捨てのモックで、製品コードではありません。リポジトリは public で、GitHub Pages (https://qniapp.github.io/qa2-match-mock/ 、`match-flow-mock` ブランチから配信) で公開しています。

## 目的

- ogwssk さんの図 (2026-09-30 の旧案 00、2026-10-02 の 01〜10) の画面遷移を、ホストとクライアントを同時に動かして確認する
- 10-01 に合意した文言・ボタン・VS 画面を反映した状態で、残っている **未決** を洗い出して議論する

## 開き方

ビルドも依存パッケージも不要です。

- `index.html` をブラウザで直接開く (`file://` で動きます)
- またはローカルサーバーで開く: `python3 -m http.server` → <http://localhost:8000/>

URL の `#s=<シナリオ ID>&step=<手順数>` で、特定のシナリオの特定の手順を直接開けます (例: `index.html#s=1&step=6`)。
`#s=free` は自由操作です。キーボードの ← / → でも手順を戻す / 進めることができます。
ゲーム本体のカウントダウン中の手順では、`&cd=3` / `&cd=2` / `&cd=1` で止めて表示する数字を選べます
(例: `index.html#s=1&step=11&cd=1`。省略すると 3)。詳しくは「ゲーム画面とゲーム本体のカウントダウン」を見てください。

## 画面構成

- **左: シナリオ** - シナリオを選ぶと両方の端末がリセットされ、説明と手順の一覧が出ます。
  `▶ 次へ` / `◀ 戻る` / `⟲ 最初から` / `自動再生` (1 手順あたり約 1.2 秒、VS 画面とゲーム本体のカウントダウンは実際の長さ) で進めます。
  手順をクリックするとその手順まで飛べます。下の「環境イベント」は、通信切断や期限切れなど電話のボタン以外の外部要因です。
  「モック設定」で Join Match / Create Match の結果 (Match not found・期限切れ・満員・接続失敗) を切り替えられます。
- **中央: 2 台の端末** - 左が `ホスト` (青)、右が `クライアント` (橙)。電話のボタンは直接押せます (押すと遷移表の同じイベントが発火します)。
  シナリオの次の手順と同じ操作ならシナリオが進み、違う操作ならシナリオを外れて自由操作になります。
  遷移表に行が無い操作は破線・半透明で表示し、押しても何も起きません (ログに「行なし」と残ります)。
  端末の下の `モック操作` はゲーム内 UI ではない操作で、ふだんは決着と切断 (`Win` / `Lose` / `Draw` / `切断する`)、ランダム対戦で相手を探している間は `アプリを離れる` / `60 秒たつ`、
  結果画面ではスタンプの `3 秒たつ` / `5 秒たつ` です (「ランダム対戦の待機中の操作」「対戦後の結果画面」を参照)。
  端末の上の黄色い `未決` バッジは、その画面や直前の遷移が未決事項に依存していることを示します。クリックすると未決一覧へ移動します
  (7 個以上のときは番号だけを出し、題名はマウスを乗せると出ます)。
  電話の画面の中には、ゲームが実際に出すものだけを描きます (決定・未決・仮の印やモックの注記は出さない。「端末の画面にはゲームが出すものだけ」を参照)。
- **右: 状態遷移表** - 上に両端末の現在の状態、対戦のセッション (Friend Match かランダム対戦か、レートが変わるか)、今の画面の説明 (例: ゲーム本体のカウントダウン、MATCH MENU や結果画面の仮の点、シナリオ 8〜10 の「ホストは関与しない」)、
  「決定済み」の一覧 (緑の `決定` バッジ。今の画面や直前の遷移に関係する項目は題名まで明るく表示し、U2 は前提も表示。
  ほかの決定はバッジだけを「ほか:」の 1 行に並べ、題名はマウスを乗せると出る) を出します。
  この上の部分は長くなると、遷移表が見えるようにスクロールします。その下で、遷移表 (直前に発火した行を青、今の状態から発火できる行を緑の線で表示)、
  未決一覧 (トグル付き)、イベントログ (新しい順) をタブで切り替えます。

シナリオを手順で進めている間は、自動遷移 (図の点線矢印) は手順として 1 つずつ進み、VS 画面やゲーム本体のカウントダウンのアニメーションも止まります
(スクリーンショットを決定的にするため。カウントダウンは `cd` で選んだ数字の静止した姿勢)。自由操作中と自動再生中は、自動遷移とアニメーションが実時間で進みます。

## 状態遷移表

画面の変化を決めるのは `js/transitions.js` の `TRANSITIONS` (1 本の配列) だけです。`js/app.js` は `state.host` / `state.client` を
`SCREENS` に従って描画し、イベントを `js/engine.js` に渡すだけです。

```js
{ from: { host: 'Host.FriendMatch.Lobby.Waiting', client: clientRoomFilled }, event: 'client.joinMatch',
  to: { host: 'Host.FriendMatch.Lobby.FriendJoined', client: 'Client.FriendMatch.Lobby.Waiting' }, note: '...', undecided: ['U4'] }
```

- `from` / `to` の `host` / `client`: 状態名、状態名の配列 (表ではグループ名で表示。例の `clientRoomFilled` はグループ `Client.FriendMatch.Room.CodeFilled`)、`'*'` (何でもよい / 変更なし)、`'='` (同じ状態のままダイアログだけ変える)
- `from.hostDialog` / `dialog: { host: 'cancel' }`: 確認ダイアログの開閉 (ダイアログの文言は `DIALOGS`)
- `when`: 未決トグル (`{ U14: 'keep' }`) やモック設定 (`{ codeResult: 'notFound' }`) の条件
- `auto`: 自由操作中に自動で発火するまでのミリ秒 (図の点線矢印)
- 上から順に評価し、最初に一致した行が使われます。行の ID (T01〜) は並び順から自動で振られます。

- `decided`: その行に関係する決定済みの項目 (例: `['U2']`)。表では緑の `決定` バッジで表示します。
- `set`: 行が発火したときに書き換えるセッション (`match` / `rated`) と端末ごとの付属状態 (`hostStamp` / `hostMute` など)。
  `from` にも付属状態の条件 (例: `hostStamp: null`) を書けます。どちらも表のメモに「設定:」「条件:」と出します (「対戦後の結果画面」を参照)。

ほかに `SCREENS` (状態 → 画面の描画仕様、トーストもここで決まる)、`DIALOGS`、`TOASTS`、`UNDECIDED` (未決一覧。決定済みの項目は `decided` 付き)、
`DEVICE_FIELDS` (端末ごとの付属状態: ダイアログ・スタンプ・ミュート)、`SESSION_FIELDS` (対戦のセッション) が同じファイルにあります。
シナリオは `js/scenarios.js` にイベントの列として定義しており、遷移表の行をそのまま再生します。

自己テスト: `node tests/check.js` で、全シナリオが遷移表どおりに最後まで再生できること、未定義の状態や未決 ID が無いこと、
シナリオが前提にしていない未決トグルをどれに切り替えても再生できることを確認します。
対戦後 (U20〜U30 で決定) の遷移も個別に確認します (下の段落)。
また、モック独自の 3·2·1 (その画面 `view: 'countdown'`、イベント `countdown.done`) が残っていないこと、
VS 画面のあとは両端末ともゲーム画面のカウントダウン (`Host.Game.Countdown` / `Client.Game.Countdown`) になること、
カウントダウン中は Win / Lose の行が無く、プレイ開始後 (`Host.Game.Play` / `Client.Game.Play`) にはあることも確認します。
開始 (U31 で決定) については、ホストが先・クライアントが先のどちらでも、1 回目の Start Match で「押した側は待機 / 相手側は "Friend is ready!"」、
2 回目で "Starting match…"、続く自動遷移で VS 画面になること、Ready のままや片方だけ押した状態から VS 画面へ進む行が無いこと、
自動開始 (`sys.autoStart`・U31 のトグル・シナリオの別案) が残っていないことを確認します。
ランダム対戦 (U13a で決定) については、相手が見つかると両端末とも直接 VS 画面になること、ランダム対戦の状態から Ready / Start Match / "Starting match…" へ進む行が無いこと、
相手を探す画面が "Searching for an opponent…" と大きな Cancel だけ (トーストなし) であること、シナリオ 11 の流れを確認します。
相手を探している間の操作 (U13 で決定) については、両端末とも (相手の端末がどの状態でも) Cancel と ‹ が確認ダイアログなしで Online Battle に戻ること、
探している間に行が有るのは Cancel / ‹ / アプリを離れる / 60 秒たつ の 4 つだけで、行き先は Online Battle か通知だけであること、
アプリを離れると `*.Matchmake.Stopped` ("Search stopped while the app was in the background.")、60 秒たつと `*.Matchmake.NotFound` ("No opponent found.") になり、
どちらも Search again (→ `*.Matchmake`) / Close (→ `*.MultiModeSelection`) を出すこと、通知の文言に数字 (60 秒) が無いこと、
U13 が高宮さん 2026-10-07 の決定で、説明に「60 秒という長さは仮」があること、遷移表に U13 が未決として残っていないこと、
端末の下のモック操作に「アプリを離れる」「60 秒たつ」があること、シナリオ 11b〜11f の流れを確認します。
検索停止のお知らせ (U43 で決定) については、U43 が高宮さん 2026-10-07 の決定で遷移表・画面に未決として残っていないこと、古い文言 "…because you left the app." が残っていないこと、
`*.Matchmake.Stopped` の通知が Online Battle の中 (モーダルではない) で、"No opponent found." だけがモーダルのままであること、
通知を出したまま Random Match / Friend Match が Online Battle と同じ行き先へ行けること (両端末、相手の端末がどの状態でも)、
通知から出ていく行はすべてその端末のユーザー操作で、行き先に通知が無いこと (自動遷移・環境イベントでは消えない)、シナリオ 11g の流れを確認します。
MATCH MENU (U37〜U42 で決定) については、両端末とも ☰ で `Host.Game.MatchMenu` / `Client.Game.MatchMenu` が開き、相手の端末が (プレイ中・メニュー中・確認中のどれでも) 変わらないこと、
CONTINUE でプレイに戻ること、SURRENDER で確認 (`*.Game.SurrenderConfirm`) を挟み、確認の CONTINUE でプレイに戻り、SURRENDER で
自分は `*.LoseResult.Surrendered`、相手は `*.WinResult.OpponentSurrendered` になること、負けた側は Back to Online で Online Battle に戻ることを確認します。
メニュー・確認の文言とボタン (CONTINUE / SURRENDER だけで REMATCH / QUIT は無い)、メニュー中・確認中も Win / Lose の行があること (試合は止まらない)、
カウントダウン中・メニュー中に ☰ の行が無いこと、ポーズの状態・イベント・`timeScale` が残っていないこと、
U37〜U42 が高宮さん 2026-10-07 の決定であること、モック専用の "Game in progress (mock)" が残っていないことも確かめます。
対戦後 (U20〜U30 で決定) については、U20〜U30 が高宮さん 2026-10-07 の決定で遷移表に未決として残っていないこと、新しい未決 U44〜U50 があること、
決着 (Win / Lose / Draw) と「切断する」が両端末とも試合中だけ押せること、結果画面 (58 状態) の勝敗と終わった理由、No contest 以外にスコアがあること、
レーティング (Friend Match・Elo の +12 / -12 / ±0・再戦・No contest) の文言、シナリオの途中のセッション (`match` / `rated`)、
結果画面のボタン (Friend Match / ランダム対戦 × 再戦の段階 × 降参・切断・No contest) と、そのボタンにすべて行があること、
戻り先と、相手に "Your opponent left. Rematch is not available." が出ること (勝敗は同じ)、Friend Match のボタンがランダム対戦に無いこと (と逆)、
再戦の申し込み・応じる (VS 画面、レートは変わらない)・取り消す・断る・期限切れ・同時・3 秒の間は申し込めないこと (勝ち / 負け / 引き分け、両方向)、結果画面からの自動遷移が無いこと、
スタンプ (3 種類、5 秒の間は送れない、3 秒で消える、ミュート、再戦の間はミュートが続き結果画面を抜けると戻る、送れない結果画面)、
対戦中の切断 (20 秒で切断した側の負け、回復、両者の切断・サービス障害は No contest、待っている間は決着を押せない)、
次の相手を探す (60 秒で "No opponent found." と Search again / Back to Online、見つかればレートが変わる対戦)、
右パネルの説明に秒数と Elo の値が仮であることが書いてあること、結果画面の文言に数字が無いこと、シナリオ 15〜15h / 16d / 17 / 17b / 18〜18e の流れを確かめます。
最後に、端末の画面に決定の注記を出すコードと、端末の上に `決定` バッジを出すコードが無いこと、
結果画面の決まっていない点 (U44 / U45 / U49 / U50) が端末の上の帯に、仮の値の説明が右パネルにあることも確認します。

端末の画面の検査: `node tests/scan-screens.mjs` (ヘッドレス Chromium が必要。場所は環境変数 `CHROMIUM` で変えられます) で、
全シナリオの全手順 (ゲーム本体のカウントダウンは 3 / 2 / 1 それぞれ。計 595 枚) を 1280x720 の画面で実際に描画し、
両端末の画面 (`.screen`) に `仮`・`未決`・`決定`・U 番号・日本語・モックの注記 (`.mock-note`、`.pill-*` など) が無いこと、
端末の上の帯が未決バッジだけで、すべて帯の中に見えていることを確認します。各手順で両端末の状態が遷移表の再生結果と同じかも確かめます。
ランダム対戦の画面 (`*.Matchmake*`) に数字 (60 秒という仮の長さ) が無いこと、「アプリを離れる」「60 秒たつ」が端末の画面の中には無く、相手を探している間は端末の下で押せることも確かめます。
結果画面と切断を待つ画面に秒数 (20 秒・3 秒・5 秒) と `----` が無いこと、No contest にスコアの行が無いこと、モック操作 (Win / Draw / 切断する / スタンプの 3 秒・5 秒) が端末の画面の中に無いこと、
スタンプを送った端末では端末の下の「3 秒たつ」「5 秒たつ」を押せて、自分の名前の上に吹き出しがあることも確かめます。
アプリを離れて検索が止まった画面 (`*.Matchmake.Stopped`) では、通知のボックスが Online Battle のメニューの中にあって暗幕 (`.dim`) が無いこと、
ボックスが端末の画面に収まっていること、Random Match / Friend Match と通知のボタンの真ん中を押すとそのボタン自身に当たる (上に何も重なっていない) ことも確かめます (U43)。
遷移表に行が無いボタンの破線・半透明 (`[data-norow]`) はモックの操作の手がかりとして残しているので、数を表示するだけです。

## 状態名 (案 C: Host. / Client. + 本体の画面名、2026-10-03)

高宮さんが案 C を選んだので (2026-10-03)、状態名をすべて `役割.画面.状態` の形に改名しました。
役割と画面の名前は、qa2 本体のコードの名前 (`/home/yasuhito/Work/qa2-verify` で確認、`7fbb97305`) をもとにしています。

- 役割: `Host.` / `Client.` (本体の `MultiplayManager.IsHost()` / `IsClient()` [1])
- 画面: `MultiModeSelection` (Online Battle) / `FriendMatch.Room` (Friend Match トップ) / `FriendMatch.Lobby` (Match Code を発行したあとの待機・Ready) /
  `Matchmake` (ランダム対戦で相手を探す) / `Opponent` (VS 画面) / `Game.Countdown` / `Game.Play` / `Game.MatchMenu` / `Game.SurrenderConfirm` / `WinResult` / `LoseResult`、
  ホストの離席は `Host.Away.FriendMatchRoom.*` / `Host.Away.StageSelection.*`
- 本体に 1 対 1 の名前が無いもの (Room、Lobby、Opponent (VS 画面)、Countdown、離席の Away、ステージ選択、図の段階名) には **近い名前を当てた** ので、下の表の「対応」に書いています。
- 遷移表のグループ名も同じ形にしました (例: `Host.FriendMatch.Lobby.Cancelable`)。グループは状態名と重ならない名前 (`.Any` や形容詞) にしています。JS の変数名は `hostCancelable` などの camelCase です。

改名は 67 状態と 12 グループ (計 79 個) です。遷移表の行・画面の描画仕様は改名前と同じです (改名前の遷移表を下の表で写したものと、改名後の 135 行が一致することを確認)。
URL (`#s=..&step=..&cd=..`) とスクリーンショットのファイル名には状態名が入っていないので、どちらもそのまま使えます。
その後、MATCH MENU の決定 (2026-10-07) で `Game.Pause` を `Game.MatchMenu` に改名し、`Game.SurrenderConfirm` と降参の結果画面 (`LoseResult.Surrendered` / `WinResult.OpponentSurrendered`) を足したので、
73 状態・14 グループ、遷移表は 141 行になりました (「対戦中の MATCH MENU」を参照)。
さらに、ランダム対戦の待機中の操作の決定 (U13、2026-10-07) で `Matchmake.Stopped` / `Matchmake.NotFound` を足して 77 状態・14 グループ、遷移表は 153 行になりました (「ランダム対戦の待機中の操作」を参照)。
対戦後の結果画面の決定 (U20〜U30、2026-10-07) で結果画面を作り直したので、127 状態・34 グループ、遷移表は 235 行になりました (「対戦後の結果画面」を参照)。
検索停止のお知らせの決定 (U43、2026-10-07) で通知から Random Match / Friend Match へ行く行を足したので、今は 127 状態・34 グループ、遷移表は 239 行です (「検索停止のお知らせ」を参照)。
このとき再戦の段階の名前を変えました: 自分が申し込んだ `.RematchWaiting` → `.RematchRequested`、相手から申し込まれた `.RematchRequested` → `.RematchIncoming` (下の対応表の新名は改名当時のもの)。
`node tests/check.js` は、すべての状態名とグループ名が `Host.` / `Client.` + 大文字で始まる名前をドットでつないだ形であること、遷移表の host 欄に `Host.`、client 欄に `Client.` の状態だけがあることも確かめます。

根拠にした qa2 本体のファイル (`/home/yasuhito/Work/qa2-verify` からの相対パス):

1. `Assets/Scripts/Runtime/Core/Multiplay/MultiplayManager.cs` - `IsHost()` (357 行目) / `IsClient()` (364 行目)、Unity Lobby (`using Unity.Services.Lobbies`、`public Lobby Lobby` 36 行目)
2. `Assets/Scripts/Runtime/Features/Title/MultiModeSelectionView.cs` - `MultiModeSelectionView`
3. `Assets/Scripts/Runtime/Features/Title/FriendMatchView.cs` - `ShowRoomScreen` (98 行目) / `ShowHostScreen` (106 行目) / `ShowClientScreen` (115 行目) / `ShowReadyScreen` (123 行目)
4. `Assets/Scripts/Runtime/Features/Title/MatchmakeView.cs` - `MatchmakeView`
5. `Assets/Scripts/Runtime/Features/Title/OpponentView.cs` - `OpponentView.Show(opponentName)`
6. `Assets/Scripts/Runtime/Core/Game/GameContext.cs` - `enum GameState { Idle, Play, Win, Lose }` (`Play` は 12 行目)
7. `Assets/Scripts/Runtime/Features/GameModes/GameModeTransition.cs` - `enum GameModeTransitionScreen` の `AiStageRankSelection` / `Pause` / `WinResult` / `LoseResult` (63〜66 行目)
8. `Assets/Scripts/Runtime/Features/ModeStartAnimation/CountdownTimer.cs` - `CountdownTimer`
9. `Assets/App/Scenes/Main/Scripts/Views/PauseView.cs` - `PauseView`
10. `Assets/App/Scenes/Main/Scripts/Views/WinView.cs` / `LoseView.cs` - `WinView` / `LoseView`

### 旧名 → 新名の対応表 (状態 67)

対応: 「一致」= 本体に同じ名前がある。「近い名前を当てた」= 本体に 1 対 1 の名前が無く、近い画面・クラスの名前を使った。「段階名はモック独自」= 図の段階をモックが分けたもので、本体に対応するものが無い。

| 旧名 | 新名 | 本体での名前・根拠 | 対応 |
|---|---|---|---|
| `H_ONLINE` | `Host.MultiModeSelection` | `MultiModeSelectionView` [2] | 一致 |
| `C_ONLINE` | `Client.MultiModeSelection` | `MultiModeSelectionView` [2] | 一致 |
| `H_TOP` | `Host.FriendMatch.Room` | `FriendMatchView` の Room 画面 (`ShowRoomScreen`) [3] | 近い名前を当てた |
| `C_TOP` | `Client.FriendMatch.Room` | `FriendMatchView` の Room 画面 (`ShowRoomScreen`) [3] | 近い名前を当てた |
| `H_TOP_CONN_FAILED` | `Host.FriendMatch.Room.ConnectionFailed` | `FriendMatchView` の Room 画面 [3] + モックの段階 `ConnectionFailed` | 近い名前を当てた (段階名はモック独自) |
| `C_TOP_CONN_FAILED` | `Client.FriendMatch.Room.ConnectionFailed` | `FriendMatchView` の Room 画面 [3] + モックの段階 `ConnectionFailed` | 近い名前を当てた (段階名はモック独自) |
| `C_TOP_CODE` | `Client.FriendMatch.Room.CodeEntered` | `FriendMatchView` の Room 画面 [3] + モックの段階 `CodeEntered` | 近い名前を当てた (段階名はモック独自) |
| `C_TOP_ERR_NOTFOUND` | `Client.FriendMatch.Room.Error.NotFound` | `FriendMatchView` の Room 画面 [3] + モックの段階 `Error.NotFound` | 近い名前を当てた (段階名はモック独自) |
| `C_TOP_ERR_EXPIRED` | `Client.FriendMatch.Room.Error.Expired` | `FriendMatchView` の Room 画面 [3] + モックの段階 `Error.Expired` | 近い名前を当てた (段階名はモック独自) |
| `C_TOP_ERR_FULL` | `Client.FriendMatch.Room.Error.Full` | `FriendMatchView` の Room 画面 [3] + モックの段階 `Error.Full` | 近い名前を当てた (段階名はモック独自) |
| `H_WAITING` | `Host.FriendMatch.Lobby.Waiting` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `Waiting` | 近い名前を当てた (段階名はモック独自) |
| `C_WAITING` | `Client.FriendMatch.Lobby.Waiting` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `Waiting` | 近い名前を当てた (段階名はモック独自) |
| `H_FRIEND_JOINED` | `Host.FriendMatch.Lobby.FriendJoined` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `FriendJoined` | 近い名前を当てた (段階名はモック独自) |
| `C_FRIEND_JOINED` | `Client.FriendMatch.Lobby.FriendJoined` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `FriendJoined` | 近い名前を当てた (段階名はモック独自) |
| `C_HOST_AWAY` | `Client.FriendMatch.Lobby.HostAway` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `HostAway` | 近い名前を当てた (段階名はモック独自) |
| `H_READY` | `Host.FriendMatch.Lobby.Ready` | `FriendMatchView` の Ready 画面 (`ShowReadyScreen`) [3] | 近い名前を当てた |
| `C_READY` | `Client.FriendMatch.Lobby.Ready` | `FriendMatchView` の Ready 画面 (`ShowReadyScreen`) [3] | 近い名前を当てた |
| `H_READY_WAITING` | `Host.FriendMatch.Lobby.Ready.WaitingForFriend` | `FriendMatchView` の Ready 画面 (`ShowReadyScreen`) [3] + モックの段階 `WaitingForFriend` (U31) | 近い名前を当てた (段階名はモック独自) |
| `C_READY_WAITING` | `Client.FriendMatch.Lobby.Ready.WaitingForFriend` | `FriendMatchView` の Ready 画面 (`ShowReadyScreen`) [3] + モックの段階 `WaitingForFriend` (U31) | 近い名前を当てた (段階名はモック独自) |
| `H_READY_PEER_READY` | `Host.FriendMatch.Lobby.Ready.FriendReady` | `FriendMatchView` の Ready 画面 (`ShowReadyScreen`) [3] + モックの段階 `FriendReady` (U31) | 近い名前を当てた (段階名はモック独自) |
| `C_READY_PEER_READY` | `Client.FriendMatch.Lobby.Ready.FriendReady` | `FriendMatchView` の Ready 画面 (`ShowReadyScreen`) [3] + モックの段階 `FriendReady` (U31) | 近い名前を当てた (段階名はモック独自) |
| `H_STARTING` | `Host.FriendMatch.Lobby.Starting` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `Starting` | 近い名前を当てた (段階名はモック独自) |
| `C_STARTING` | `Client.FriendMatch.Lobby.Starting` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `Starting` | 近い名前を当てた (段階名はモック独自) |
| `H_START_FAILED` | `Host.FriendMatch.Lobby.StartFailed` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `StartFailed` | 近い名前を当てた (段階名はモック独自) |
| `C_START_FAILED` | `Client.FriendMatch.Lobby.StartFailed` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `StartFailed` | 近い名前を当てた (段階名はモック独自) |
| `H_CONNECTING` | `Host.FriendMatch.Lobby.Connecting` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `Connecting` | 近い名前を当てた (段階名はモック独自) |
| `C_CONNECTING` | `Client.FriendMatch.Lobby.Connecting` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `Connecting` | 近い名前を当てた (段階名はモック独自) |
| `H_CONN_LOST` | `Host.FriendMatch.Lobby.ConnectionLost` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `ConnectionLost` | 近い名前を当てた (段階名はモック独自) |
| `C_CONN_LOST` | `Client.FriendMatch.Lobby.ConnectionLost` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `ConnectionLost` | 近い名前を当てた (段階名はモック独自) |
| `H_CLIENT_LEFT` | `Host.FriendMatch.Lobby.ClientLeft` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `ClientLeft` | 近い名前を当てた (段階名はモック独自) |
| `H_CLIENT_AWAY` | `Host.FriendMatch.Lobby.ClientAway` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `ClientAway` | 近い名前を当てた (段階名はモック独自) |
| `C_HOST_CANCELLED` | `Client.FriendMatch.Lobby.HostCancelled` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `HostCancelled` | 近い名前を当てた (段階名はモック独自) |
| `H_EXPIRED` | `Host.FriendMatch.Lobby.MatchExpired` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `MatchExpired` | 近い名前を当てた (段階名はモック独自) |
| `C_MATCH_EXPIRED` | `Client.FriendMatch.Lobby.MatchExpired` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `MatchExpired` | 近い名前を当てた (段階名はモック独自) |
| `H_CODE_EXPIRED` | `Host.FriendMatch.Lobby.CodeExpired` | Unity Lobby (`MultiplayManager.Lobby`) [1] と `FriendMatchView` の Host / Client 画面 [3] + モックの段階 `CodeExpired` | 近い名前を当てた (段階名はモック独自) |
| `H_AWAY_TOP_WAITING` | `Host.Away.FriendMatchRoom.Waiting` | 本体に無い (モックの離席。図02)。`FriendMatchRoom` は `FriendMatchView` の Room 画面 [3] | 近い名前を当てた (モック独自) |
| `H_AWAY_TOP_JOINED` | `Host.Away.FriendMatchRoom.FriendJoined` | 本体に無い (モックの離席。図02)。`FriendMatchRoom` は `FriendMatchView` の Room 画面 [3] | 近い名前を当てた (モック独自) |
| `H_AWAY_TOP_READY` | `Host.Away.FriendMatchRoom.Ready` | 本体に無い (モックの離席。図02)。`FriendMatchRoom` は `FriendMatchView` の Room 画面 [3] | 近い名前を当てた (モック独自) |
| `H_AWAY_TOP_EXPIRED` | `Host.Away.FriendMatchRoom.Expired` | 本体に無い (モックの離席。図02)。`FriendMatchRoom` は `FriendMatchView` の Room 画面 [3] | 近い名前を当てた (モック独自) |
| `H_AWAY_STAGE_WAITING` | `Host.Away.StageSelection.Waiting` | 本体に無い (モックの離席。図02 / 図07)。`StageSelection` は `GameModeTransitionScreen.AiStageRankSelection` [7] に近い | 近い名前を当てた (モック独自) |
| `H_AWAY_STAGE_JOINED` | `Host.Away.StageSelection.FriendJoined` | 本体に無い (モックの離席。図02 / 図07)。`StageSelection` は `GameModeTransitionScreen.AiStageRankSelection` [7] に近い | 近い名前を当てた (モック独自) |
| `H_AWAY_STAGE_READY` | `Host.Away.StageSelection.Ready` | 本体に無い (モックの離席。図02 / 図07)。`StageSelection` は `GameModeTransitionScreen.AiStageRankSelection` [7] に近い | 近い名前を当てた (モック独自) |
| `H_AWAY_STAGE_EXPIRED` | `Host.Away.StageSelection.Expired` | 本体に無い (モックの離席。図02 / 図07)。`StageSelection` は `GameModeTransitionScreen.AiStageRankSelection` [7] に近い | 近い名前を当てた (モック独自) |
| `C_AWAY_STAGE_READY` | `Client.Away.StageSelection.Ready` | 本体に無い (モックの離席。図02 / 図07)。`StageSelection` は `GameModeTransitionScreen.AiStageRankSelection` [7] に近い | 近い名前を当てた (モック独自) |
| `C_AWAY_STAGE_EXPIRED` | `Client.Away.StageSelection.Expired` | 本体に無い (モックの離席。図02 / 図07)。`StageSelection` は `GameModeTransitionScreen.AiStageRankSelection` [7] に近い | 近い名前を当てた (モック独自) |
| `H_RANDOM_WAITING` | `Host.Matchmake` | `MatchmakeView` [4] | 一致 |
| `C_RANDOM_WAITING` | `Client.Matchmake` | `MatchmakeView` [4] | 一致 |
| `H_VS` | `Host.Opponent` | `OpponentView` (相手の名前を出す画面) [5]。モックの VS 画面 | 近い名前を当てた |
| `C_VS` | `Client.Opponent` | `OpponentView` (相手の名前を出す画面) [5]。モックの VS 画面 | 近い名前を当てた |
| `H_GAME_COUNTDOWN` | `Host.Game.Countdown` | `CountdownTimer` [8] (`Game` は `GameState` [6]) | 近い名前を当てた |
| `C_GAME_COUNTDOWN` | `Client.Game.Countdown` | `CountdownTimer` [8] (`Game` は `GameState` [6]) | 近い名前を当てた |
| `H_GAME` | `Host.Game.Play` | `GameState.Play` [6] | 一致 |
| `C_GAME` | `Client.Game.Play` | `GameState.Play` [6] | 一致 |
| `H_GAME_PAUSED` | `Host.Game.Pause` → `Host.Game.MatchMenu` (2026-10-07) | 改名時は `PauseView` [9] / `GameModeTransitionScreen.Pause` [7]。MATCH MENU はオンライン専用の新しい画面で、本体に名前は無い (U37) | 改名時は一致。今は本体に無い |
| `C_GAME_PAUSED` | `Client.Game.Pause` → `Client.Game.MatchMenu` (2026-10-07) | 改名時は `PauseView` [9] / `GameModeTransitionScreen.Pause` [7]。MATCH MENU はオンライン専用の新しい画面で、本体に名前は無い (U37) | 改名時は一致。今は本体に無い |
| `H_RESULT_WIN` | `Host.WinResult` | `GameModeTransitionScreen.WinResult` [7] / `WinView` [10] | 一致 |
| `C_RESULT_WIN` | `Client.WinResult` | `GameModeTransitionScreen.WinResult` [7] / `WinView` [10] | 一致 |
| `H_RESULT_WIN_REMATCH_WAIT` | `Host.WinResult.RematchWaiting` | `GameModeTransitionScreen.WinResult` [7] / `WinView` [10] + モックの段階 `RematchWaiting` (U23) | 近い名前を当てた (段階名はモック独自) |
| `C_RESULT_WIN_REMATCH_WAIT` | `Client.WinResult.RematchWaiting` | `GameModeTransitionScreen.WinResult` [7] / `WinView` [10] + モックの段階 `RematchWaiting` (U23) | 近い名前を当てた (段階名はモック独自) |
| `H_RESULT_WIN_REMATCH_ASKED` | `Host.WinResult.RematchRequested` | `GameModeTransitionScreen.WinResult` [7] / `WinView` [10] + モックの段階 `RematchRequested` (U23) | 近い名前を当てた (段階名はモック独自) |
| `C_RESULT_WIN_REMATCH_ASKED` | `Client.WinResult.RematchRequested` | `GameModeTransitionScreen.WinResult` [7] / `WinView` [10] + モックの段階 `RematchRequested` (U23) | 近い名前を当てた (段階名はモック独自) |
| `H_RESULT_LOSE` | `Host.LoseResult` | `GameModeTransitionScreen.LoseResult` [7] / `LoseView` [10] | 一致 |
| `C_RESULT_LOSE` | `Client.LoseResult` | `GameModeTransitionScreen.LoseResult` [7] / `LoseView` [10] | 一致 |
| `H_RESULT_LOSE_REMATCH_WAIT` | `Host.LoseResult.RematchWaiting` | `GameModeTransitionScreen.LoseResult` [7] / `LoseView` [10] + モックの段階 `RematchWaiting` (U23) | 近い名前を当てた (段階名はモック独自) |
| `C_RESULT_LOSE_REMATCH_WAIT` | `Client.LoseResult.RematchWaiting` | `GameModeTransitionScreen.LoseResult` [7] / `LoseView` [10] + モックの段階 `RematchWaiting` (U23) | 近い名前を当てた (段階名はモック独自) |
| `H_RESULT_LOSE_REMATCH_ASKED` | `Host.LoseResult.RematchRequested` | `GameModeTransitionScreen.LoseResult` [7] / `LoseView` [10] + モックの段階 `RematchRequested` (U23) | 近い名前を当てた (段階名はモック独自) |
| `C_RESULT_LOSE_REMATCH_ASKED` | `Client.LoseResult.RematchRequested` | `GameModeTransitionScreen.LoseResult` [7] / `LoseView` [10] + モックの段階 `RematchRequested` (U23) | 近い名前を当てた (段階名はモック独自) |

### 旧名 → 新名の対応表 (遷移表のグループ 12)

| 旧名 | 新名 | JS の変数名 | 内容 |
|---|---|---|---|
| `H_AWAY_PENDING` | `Host.Away.Pending` | `hostAwayPending` | マッチがまだ有効なホストの離席 (FriendMatchRoom / StageSelection × Waiting / FriendJoined / Ready) (6 状態) |
| `H_CANCELABLE` | `Host.FriendMatch.Lobby.Cancelable` | `hostCancelable` | ホストが Cancel Match で確認ダイアログを出せるロビーの状態 (8 状態) |
| `H_WITH_CLIENT` | `Host.FriendMatch.Lobby.WithClient` | `hostWithClient` | クライアントがいるホストのロビーの状態 (7 状態) |
| `H_EXPIRED_ANY` | `Host.Expired.Any` | `hostExpiredAny` | ホストの期限切れ (ロビーと離席) (4 状態) |
| `H_ONE_PRESSED` | `Host.FriendMatch.Lobby.Ready.OnePressed` | `hostOnePressed` | 片方だけ Start Match を押した (U31) (2 状態) |
| `C_ONE_PRESSED` | `Client.FriendMatch.Lobby.Ready.OnePressed` | `clientOnePressed` | 片方だけ Start Match を押した (U31) (2 状態) |
| `C_IN_MATCH` | `Client.InMatch` | `clientInMatch` | クライアントがマッチに入っている状態 (ロビーと離席) (11 状態) |
| `C_LEAVABLE` | `Client.FriendMatch.Lobby.Leavable` | `clientLeavable` | クライアントが Leave Match で確認ダイアログを出せるロビーの状態 (6 状態) |
| `C_TOP_ANY` | `Client.FriendMatch.Room.Any` | `clientRoomAny` | クライアントの Friend Match トップ (Room) のすべて (6 状態) |
| `C_TOP_FILLED` | `Client.FriendMatch.Room.CodeFilled` | `clientRoomFilled` | Match Code が入力済みの Room (5 状態) |
| `H_RESULT_ANY` | `Host.Result.Any` | `hostResultAny` | ホストの結果画面のすべて (6 状態) |
| `C_RESULT_ANY` | `Client.Result.Any` | `clientResultAny` | クライアントの結果画面のすべて (6 状態) |

2026-10-07 (MATCH MENU) の変更: `Host.Result.Any` / `Client.Result.Any` に相手が降参した勝ちの結果画面 (`*.WinResult.OpponentSurrendered`) を足して 7 状態にしました
(降参した側の `*.LoseResult.Surrendered` は Back to Friend Match が無いので入れていない)。
新しいグループ `Host.Game.InPlay` / `Client.Game.InPlay` (`hostInPlay` / `clientInPlay`、3 状態ずつ) は、試合が続いている状態 (`Game.Play` / `Game.MatchMenu` / `Game.SurrenderConfirm`) です。

2026-10-07 (対戦後の結果画面、U20〜U30) の変更: `Host.Result.Any` / `Client.Result.Any` は結果画面のすべて (29 状態ずつ。降参した側も含めた) になりました。
新しいグループは、Back to Friend Match などがある結果画面 `*.Result.Leavable` (降参した側以外)、スタンプを送れる結果画面 `*.Result.Stampable`、
試合中と切断を待つ間 `*.Game.InMatch`、相手を探している状態 `*.Matchmake.Searching` (Random Match から / Find Next Opponent から)、
勝敗ごとの再戦できる段階 `*.WinResult.Rematchable` などと 3 秒待ちの段階 `*.WinResult.Cooldown` など (勝ち・負け・引き分け) です (計 34 グループ)。

## シナリオ一覧

元の図は qniapp/qa2#1891 の ogwssk さんのコメント (09-30 の図 00、10-02 の図 01〜10) です。

| ID | シナリオ | 元の図 |
|---|---|---|
| 1 | 通常対戦 (ホストが先に Start Match) | 01 |
| 1b | 通常対戦 (クライアントが先に Start Match) | 01 |
| 2a | 待機中にホストが別画面へ → 戻って対戦 | 02 |
| 2b | 待機中にホストが別画面へ → 放置して期限切れ | 02 |
| 3a | Ready 後に通信不安定 → 回復 | 03 |
| 3b | Ready 後に通信不安定 → 切断 → キャンセル | 03 |
| 3c | Ready 後に通信不安定 → 切断 → ‹ で戻る | 03 |
| 4 | Ready 後にホストがキャンセル | 04 |
| 4b | キャンセル確認で Keep Waiting | 04 |
| 5 | Ready 後にクライアントが退出 | 05 |
| 6 | Start Match 直後の切断・同期失敗 | 06 |
| 7a | Ready 後にクライアントが別画面へ → 戻って対戦 | 07 |
| 7b | Ready 後にクライアントが別画面へ → 期限切れ | 07 |
| 8 | 無効な Match Code | 08 |
| 9 | Match Code が期限切れ | 09 |
| 10 | マッチが満員 | 10 |
| 11 | ランダム対戦 (相手が見つかり次第 VS) | 00 + 10-03 の決定 (U13a) |
| 11b | ランダム対戦 → Cancel / ‹ で Online Battle へ | 10-03 / 10-07 の決定 (U13a / U13) |
| 11c | ランダム対戦 → アプリを離れて検索が止まる → Search again | 10-07 の決定 (U13) |
| 11d | ランダム対戦 → アプリを離れて検索が止まる → Close | 10-07 の決定 (U13) |
| 11e | ランダム対戦 → 60 秒で見つからない → Search again | 10-07 の決定 (U13) |
| 11f | ランダム対戦 → 60 秒で見つからない → Close | 10-07 の決定 (U13) |
| 12 | VS 画面中の切断 | なし (合意事項) |
| 13 | 接続失敗 (仮) | 00 (トーストのみ) |
| 14 | 離席中に Create Match を押す | なし (10-01 合意) |
| 15 | Friend Match の対戦後 (ホスト勝利 → 両者が抜ける) | なし (10-07 の決定 U20〜U26) |
| 15b | Friend Match の対戦後 (ホストが Lose を押す → クライアントが先に抜ける) | なし (10-07 の決定 U20〜U26) |
| 15c | Friend Match の再戦 (申し込み → 応じる → VS) | なし (10-07 の決定 U23 / U30) |
| 15d | 再戦の申し込みを取り消す → 3 秒後にまた申し込める | なし (10-07 の決定 U30) |
| 15e | 再戦を断られる (Decline) | なし (10-07 の決定 U30) |
| 15f | 再戦の申し込みに応答がない (20 秒) → 申し込み直す | なし (10-07 の決定 U30) |
| 15g | 引き分け → 両者が同時に Rematch | なし (10-07 の決定 U20 / U23) |
| 15h | 結果画面のスタンプとミュート | なし (10-07 の決定 U27) |
| 16 | 対戦中に MATCH MENU → CONTINUE (試合は続く) | なし (10-07 の決定、案A) |
| 16b | 対戦中に降参 (SURRENDER → 確認 → 負け) | なし (10-07 の決定、案A) |
| 16c | MATCH MENU を開いている間に試合が終わる | なし (10-07 の決定、案A) |
| 16d | ランダム対戦で降参 (レートが変わる、再戦なし) | なし (10-07 の決定 U21 / U28 / U41) |
| 17 | ランダム対戦の対戦後 (Elo → 再戦はレートが変わらない → 次の相手) | なし (10-07 の決定 U21 / U22 / U29) |
| 17b | ランダム対戦の対戦後 → 次の相手が見つからない | なし (10-07 の決定 U29) |
| 18 | 対戦中にクライアントが切断 → 20 秒で切断した側の負け | なし (10-07 の決定 U28) |
| 18b | 対戦中にホストが切断 → 20 秒のうちに戻る | なし (10-07 の決定 U28) |
| 18c | 両者が切断 → No contest | なし (10-07 の決定 U28) |
| 18d | ランダム対戦でサービス障害 → No contest (レートは変わらない) | なし (10-07 の決定 U28 / U21) |
| 18e | ランダム対戦で切断負け (レートが変わる) | なし (10-07 の決定 U28 / U21) |

## 開始は両者の Start Match (2026-10-03 決定、U31、Friend Match だけ)

高宮さんの決定 (2026-10-03、未決 U31): Friend Match では、両者が Start Match を押したら開始します。Ready になっても自動では開始しません。
ランダム対戦には Start Match が無く、相手が見つかり次第 VS 画面へ進みます (U13a、「ランダム対戦は相手が見つかり次第 VS へ」を参照)。
片方が押すと、押した側は待機表示になり、相手側には相手が準備完了であることを表示します。

### モックでの表示

| 段階 | 押した側 | 相手側 |
|---|---|---|
| 両者 Ready | "Ready"、[Start Match] (有効) | 同じ |
| 片方が押した | 相手の名前の下に "Waiting for your friend…"。[Start Match] は無効表示 (半透明・実線。遷移表の「行なし」の破線とは別) | 相手の名前の下に緑の "Friend is ready!"、"Ready"、[Start Match] (有効) |
| 両者が押した | "Starting match…" (同期中、約 1.5 秒) | 同じ |
| そのあと | VS 画面 → ゲーム画面でゲーム本体のカウントダウン → プレイ開始 | 同じ |

- 押した側の文言は、合意済みのフレンド待機の文言 "Waiting for your friend…" をそのまま使いました (相手を待つ、同じ状況のため)。
- もう一方のボタン (ホストの Cancel Match、クライアントの Leave Match) は Ready のときと同じく残しています。
- 文言・無効表示にするか隠すか・ホストとクライアントで同じ表示にするかはモックの仮で、未決 U36 にしています。

### 状態・イベント

| 変更 | 状態 / イベント |
|---|---|
| 追加 | `Host.FriendMatch.Lobby.Ready.WaitingForFriend` / `Client.FriendMatch.Lobby.Ready.WaitingForFriend` (自分が先に押して相手を待つ)、`Host.FriendMatch.Lobby.Ready.FriendReady` / `Client.FriendMatch.Lobby.Ready.FriendReady` (相手が先に押した。"Friend is ready!")。遷移表ではグループ `Host.FriendMatch.Lobby.Ready.OnePressed` / `Client.FriendMatch.Lobby.Ready.OnePressed` |
| 意味を変更 | `Host.FriendMatch.Lobby.Starting` / `Client.FriendMatch.Lobby.Starting` ("Starting match…"): 以前は「自分が押して相手を待つ」状態。今は「両者が押して開始の同期中」と、図06 の再試行で先に押した側の待機 |
| 削除 | イベント `sys.autoStart` (Ready 後の自動開始)、U31 のトグル、シナリオ 1b の「U31 別案: 自動開始」 |
| 変更なし | `host.startMatch` / `client.startMatch` / `sys.bothStarted` (ラベルは「自動: 開始の同期が終わる」に変更) |

流れ: `Host.FriendMatch.Lobby.Ready` / `Client.FriendMatch.Lobby.Ready` → (先に押した側の `startMatch`) → `Host.FriendMatch.Lobby.Ready.WaitingForFriend` / `Client.FriendMatch.Lobby.Ready.FriendReady` (ホストが先) または
`Host.FriendMatch.Lobby.Ready.FriendReady` / `Client.FriendMatch.Lobby.Ready.WaitingForFriend` (クライアントが先) → (もう一方の `startMatch`) → `Host.FriendMatch.Lobby.Starting` / `Client.FriendMatch.Lobby.Starting` → `sys.bothStarted` → `Host.Opponent` / `Client.Opponent`。

"Starting match…" をどこに残すか: 図01 では先に押した側が "Starting match…" で相手を待ちます。決定に合わせて、この待機は "Waiting for your friend…" にしました (「表記の修正」に表記差分として記載)。
"Starting match…" は、両者が押したあと VS 画面までの短い同期の間 (図06 の同期失敗 `sys.startFailed` はここで起きる) と、図06 の再試行で先に押した側の待機に残しています。
図06 の再試行を初回の開始と同じ表示 ("Waiting for your friend…" / "Friend is ready!") に揃えるかは決まっていないので、U15 に書き足しました。

手順の数は変わりません (Start Match 2 回と `sys.bothStarted` の 3 手順のまま) ので、既存の `#s=..&step=..` はそのまま使えます。

- `index.html#s=1&step=8` - ホストが先に押した: ホスト "Waiting for your friend…" / クライアント "Friend is ready!"
- `index.html#s=1b&step=8` - クライアントが先に押した: クライアント "Waiting for your friend…" / ホスト "Friend is ready!"
- `index.html#s=1&step=9` - 両者が押した: 両者 "Starting match…"
- `index.html#s=1b&step=10` - 両者が押したあとの VS 画面

### 片方だけ押した状態と、ほかの流れ

片方だけ押した状態は、図にも決定にも無い場面と重なります。新しい挙動は作らず、次のようにしています。

| 場面 | モック | 未決 |
|---|---|---|
| 相手が切断した / いつまでも押さない / 押した側が取り消したい | 遷移行なし (環境イベントは出ない。押した側の Start Match は無効表示のまま) | U33 |
| ホストの Cancel Match / クライアントの Leave Match | Ready からのキャンセル (図04)・退出 (図05) と同じ結果を仮に置く | U34 |
| どちらかが ‹ で別画面へ移る (離席) | 遷移行なし (‹ は破線で押せない)。そのため、クライアントが押したあとにホストの "Ready to start" トーストが出る場面も無い | U35 |
| 再戦 (Rematch) | 片方が申し込み、もう片方が応じたら VS 画面へ。ロビーの Start Match は挟まない (2026-10-07 決定) | U23 (決定) |
| ランダム対戦 | 相手が見つかり次第 VS 画面へ。Start Match は無い (2026-10-03 決定) | U13a (決定) |

Start Match を押す前 (両者 Ready) の通信不安定 (3a/3b/3c)・キャンセル (4/4b)・退出 (5)・離席 (2a/7a/7b) は今までどおりで、続きは両者の Start Match になります。
U1 の別案 (トーストのタップで開始扱い) は、「ホストが Start Match を押した扱い」に変えました (ホスト "Waiting for your friend…" / クライアント "Friend is ready!")。

遷移表は 126 行から 131 行になりました (自動開始の 1 行と古い Start Match の 2 行を削除し、Start Match の 4 行と、片方が押したあとのキャンセル・退出の仮の 4 行を追加)。

![ホストが先に Start Match](docs/screenshots/26-u31-host-pressed-first.png)

![クライアントが先に Start Match](docs/screenshots/27-u31-client-pressed-first.png)

![両者が押したあとの VS 画面](docs/screenshots/28-u31-both-pressed-vs.png)

## ゲーム画面とゲーム本体のカウントダウン (2026-10-03 決定)

高宮さんの決定 (2026-10-03、未決 U2 のカウントダウンの部分): VS 画面のあとにモック独自の 3·2·1 は出しません (ランダム対戦・Friend Match・再戦とも)。
VS 画面が終わるとゲーム画面に移り、ゲーム本体の開始カウントダウンがそこで再生されます。
理由は、ゲーム本体にゲーム開始時のカウントダウンがあり、モック側の 3·2·1 は要らないためです。

**前提として、ゲーム側で VsPlayer の modeStartAnimationType を None から Countdown に変える（設定 1 行）。**
今のゲームで 3-2-1 の `CountdownTimer` を使うのは VsAI (AI 対戦) だけで、VsPlayer (オンライン対戦) は `None` になっています。

### モックでの再現 (実機の VsAI の画面と同じ見た目・タイミング)

- 自分のフィールドの上の中央に、細い水色 (`#D3F7FB`) の数字と、同じ色の細い円のリング。3 → 2 → 1 だけで、"GO" / "START" の文字は出ません (ゲームでは開始は効果音だけ)。
- タイミング: ゲーム画面が出てから 1 秒待ち、数字 1 つにつき 0.8 秒 (合計 3.4 秒)。数字は 0.5 → 0.66 倍に拡大しながら 0.15 秒で現れ、0.55 秒まで少しずつ大きくなり、
  最後の 0.25 秒で 1.6 倍に広がりながら消えます。リングも同じタイミングで 0.2 → 0.34 → 1.6 倍。
- カウントダウン中はメニューボタンが無く、端末の下の Win / Lose も押せません (遷移表に行が無い)。"1" が消えるとメニューボタン (右上の ☰、U37) が出てプレイ開始になり、Win / Lose が押せるようになります。
- ゲーム画面は実機にならったプレースホルダーです: 上に相手の小さなフィールド、その下に "Time 0:00" と "Score 0"、自分のフィールド、下のバー。
- 決定 U2 とその前提 (「前提として、ゲーム側で VsPlayer の modeStartAnimationType を None から Countdown に変える（設定 1 行）」) は、
  右パネルの「決定済み」に出しています。以前はカウントダウンの画面の中に注記を出していましたが、端末の画面にはゲームが出すものだけを描くことにしたので、右パネルへ移しました。

### 状態・イベント

| 変更 | 状態 / イベント |
|---|---|
| 削除 | 状態 `H_COUNTDOWN` / `C_COUNTDOWN` (旧名、案 C への改名より前に削除したので対応表には無い。モック独自の 3·2·1 の画面)、イベント `countdown.done` |
| 追加 | 状態 `Host.Game.Countdown` / `Client.Game.Countdown` (ゲーム画面 + ゲーム本体のカウントダウン、メニューボタンなし)、イベント `game.countdownDone` (自動、3.4 秒) |
| 変更なし | `Host.Game.Play` / `Client.Game.Play` (プレイ中、メニューボタン ☰ あり、Win / Lose を押せる) |

流れ: `Host.Opponent` / `Client.Opponent` → `vs.done` → `Host.Game.Countdown` / `Client.Game.Countdown` → `game.countdownDone` → `Host.Game.Play` / `Client.Game.Play`。
このときの遷移表の行数は 126 行のままでした (`vs.done` の行き先を変え、`countdown.done` の行を `game.countdownDone` に置き換えた)。
手順の数も変わらないので、既存の `#s=..&step=..` はそのまま使えます (例: 通常対戦の手順 11 がカウントダウン、手順 12 がプレイ開始)。

### 手順で止めて見る (`cd`)

シナリオを手順で進めている間は、カウントダウンを 1 つの数字で止めて表示します。表示する数字は URL の `&cd=3` / `&cd=2` / `&cd=1`、
またはカウントダウン中に左のパネルに出る `3` `2` `1` のボタンで選べます (省略時は 3)。自由操作中と自動再生中は実時間でアニメーションします。

- `index.html#s=1&step=11&cd=3` - 両端末に "3" とリング
- `index.html#s=1&step=11&cd=1` - 両端末に "1" とリング
- `index.html#s=1&step=12` - カウントダウンが終わってプレイ開始 (メニューボタン ☰ あり、Win / Lose が押せる)

カウントダウン中に相手が切断した場合の扱いは決まっていないので、遷移行は作らず未決 U32 にしています。

![ゲーム本体のカウントダウン: 3](docs/screenshots/23-ingame-countdown-3.png)

![ゲーム本体のカウントダウン: 1](docs/screenshots/24-ingame-countdown-1.png)

![カウントダウン後: メニューボタン (☰) が出て Win / Lose が押せる](docs/screenshots/25-game-started-menu.png)

## 対戦中の MATCH MENU (2026-10-07 決定、案A / U37〜U42)

高宮さんの決定 (2026-10-07、案A): オンライン対戦では、VsAI のポーズポップアップの代わりに **MATCH MENU (☰)** を出します。**試合は止まりません。**
以前のモック (2026-10-03) は「オンラインでも VsAI と同じポーズポップアップ (CONTINUE / REMATCH / QUIT) を出す」仮の案でしたが、それを置き換えました。

| ID | 決定 |
|---|---|
| U37 | ☰ MATCH MENU。開いても試合は止まらない (オンラインでは `Time.timeScale = 0` にしない)。メニューに "The match continues while the menu is open." と出す |
| U38 | メニューを開いただけでは相手には何も見えない。降参すると自分は負け、相手は勝ちの結果画面に "Your opponent surrendered" |
| U39 | 対戦中に REMATCH / RETRY は出さない。再戦は結果画面だけ |
| U40 | 降参の前に確認「降参しますか？ 負けになります」("Surrender?" / "You will lose.")。ボタンは CONTINUE (続ける) / SURRENDER (降参する)。確認中も試合は続く |
| U41 | ボタンは QUIT ではなく SURRENDER。負けの結果画面のあとは Online Battle (`Host.MultiModeSelection` / `Client.MultiModeSelection`) へ戻る |
| U42 | MATCH MENU 中も BGM を下げない (ダッキングしない)。モックには音が無いので記録だけ |

以前のゲーム画面にあったモック専用の "Game in progress (mock)" の文字は 2026-10-03 に削除したままです (端末の下の Win / Lose はそのまま)。

### 見た目

パネルとボタンは実機のポーズポップアップ (`Menu_Pause`) の値を、電話の画面幅 360px に合わせて × 0.3077 で縮めたものです
(パネル 271px 幅、塗り `#0B0B0B` α 0.9、白い枠線。ボタン 246 x 40px、間隔 9.2px、文字は Oxanium Regular、文字間隔 0.05em)。ポーズと違うのは次の点です。

- HUD の右上のボタンは ‖ ではなく ☰ (同じ枠に横線 3 本)。プレイ中だけ出て、メニュー・確認を開いている間は消える
- 暗幕は実機のポーズの α 0.784 より薄い α 0.35。試合が続いていることが分かるように、フィールドや HUD が見えたまま
- パネルの上にタイトル (`MATCH MENU` / `Surrender?`) と一文 ("The match continues while the menu is open." / "You will lose.") がある
- ボタンは 2 つだけ: `CONTINUE` (塗り `#020202`) と `SURRENDER` (実機の QUIT と同じ `#EF2B2B` α 0.51 の塗りと薄い走査線)

### 動き

| 操作 | 自分の端末 | 相手の端末 | 決定 |
|---|---|---|---|
| ☰ | MATCH MENU を開く (試合は続く) | 変わらない | U37, U38 |
| MATCH MENU の CONTINUE | メニューを閉じてプレイの画面に戻る | 変わらない | U37 |
| MATCH MENU の SURRENDER | 降参の確認 "Surrender?" / "You will lose." を開く (試合は続く) | 変わらない | U40, U41 |
| 確認の CONTINUE | 確認を閉じてプレイの画面に戻る | 変わらない | U40 |
| 確認の SURRENDER | 負けの結果画面 ("LOSE"、"You surrendered"、Back to Online) | 勝ちの結果画面 ("WIN!"、"Your opponent surrendered"、Back to Friend Match。ランダム対戦なら Find Next Opponent / Back to Online)。メニューや確認を開いていても同じ | U38, U40 |
| 負けの結果画面の Back to Online | Online Battle に戻る | 結果画面のまま | U41 |

- 試合は止まらないので、メニューや確認を開いていても端末の下の Win / Lose (試合の決着) は押せます。そのときは開いていたメニューが閉じて、通常の結果画面になります (シナリオ 16c)。
- 降参の結果画面には Rematch はありません (降参した側は再戦を申し込めない、U28。勝った側から申し込めるかは未決 U45)。勝った側の戻り先は、通常の結果画面と同じです (U24)。
- 降参の結果画面のボタンの文言は、2026-10-07 の結果画面の決定 (U22) で "Back to Online Battle" から "Back to Online" になりました。Score と Rating の表示も通常の結果画面と同じです (U20 / U21)。
- 引き分けと対戦中の切断も 2026-10-07 に決まりました (U20 / U28、「対戦後の結果画面」を参照)。

### 状態・イベント

| 変更 | 状態 / イベント |
|---|---|
| 改名 | 状態 `Host.Game.Pause` / `Client.Game.Pause` → `Host.Game.MatchMenu` / `Client.Game.MatchMenu` |
| 追加 | 状態 `Host.Game.SurrenderConfirm` / `Client.Game.SurrenderConfirm` (降参の確認)、`Host.LoseResult.Surrendered` / `Client.LoseResult.Surrendered` (降参した側)、`Host.WinResult.OpponentSurrendered` / `Client.WinResult.OpponentSurrendered` (相手が降参した側) |
| 追加 | イベント `*.matchMenu` (☰)、`*.matchMenu.continue`、`*.matchMenu.surrender`、`*.surrenderConfirm.continue`、`*.surrenderConfirm.surrender`、`*.backToOnlineBattle` (`*` は `host` / `client`) |
| 削除 | イベント `*.pause` / `*.continue` / `*.quit` / `*.pauseRematch` |
| 変更 | Win / Lose の 4 行 (T124〜T127) の `from` を `Host.Game.InPlay` / `Client.Game.InPlay` (プレイ中・メニュー中・確認中) に広げた |

遷移表は 135 行から 141 行になりました (ポーズの 6 行 T30〜T35 を MATCH MENU の 10 行 T30〜T39 に置き換え、末尾に降参した側の Back to Online Battle の 2 行 T140 / T141 を追加)。
そのため、対戦後の行は T124〜T139 になりました。シナリオ 16 / 16b は書き直し、16c を足しました。ほかのシナリオの手順の数は変わらないので、既存の `#s=..&step=..` はそのまま使えます。

- `index.html#s=16&step=13` - ホストだけ MATCH MENU (クライアントはプレイ中のまま)
- `index.html#s=16&step=14` - 両者が MATCH MENU
- `index.html#s=16b&step=14` - ホストの降参の確認 "Surrender?" / "You will lose."
- `index.html#s=16b&step=18` - ホストは負け "You surrendered"、クライアントは勝ち "Your opponent surrendered"
- `index.html#s=16b&step=19` - ホストが Back to Online で Online Battle に戻った
- `index.html#s=16c&step=14` - ホストが MATCH MENU を開いている間にクライアントが勝った

![ホストの MATCH MENU (クライアントはプレイ中のまま)](docs/screenshots/29-match-menu-host.png)

![両者の MATCH MENU](docs/screenshots/30-match-menu-both.png)

![降参の確認](docs/screenshots/31-surrender-confirm.png)

![降参の結果: 負け "You surrendered" / 勝ち "Your opponent surrendered"](docs/screenshots/32-surrender-result.png)

![MATCH MENU を開いている間に試合が終わる](docs/screenshots/36-match-ends-during-menu.png)

## 端末の画面にはゲームが出すものだけ (2026-10-03)

高宮さんの指摘を受けて、電話の画面の中には、ゲームが実際に出すものだけを描くことにしました。

- カウントダウンの画面にあった決定 U2 の注記 (前提の説明と `決定 U2` バッジ) を削除し、右パネルの「決定済み」に移しました。
- 端末の上の帯には `未決` バッジだけを出し、`決定` バッジ (U2, U31) は右パネルの「決定済み」に移しました。今の画面や直前の遷移に関係する決定は、そこで明るく表示します。
- 画面の説明 (ゲーム本体のカウントダウン、MATCH MENU の決定、結果画面の仮の点など) も、右パネルの現在の状態の下に出します。
- 続けて、電話の画面の中に残っていた未決・仮の印とモックの注記も外へ出しました (2026-10-03)。

| 状態 | 以前は画面の中にあったもの | 移した先 |
|---|---|---|
| `Host.WinResult*` / `Host.LoseResult*` / `Client.WinResult*` / `Client.LoseResult*` (結果画面、ホスト・クライアントで 6 状態ずつ) | Rank の横の `仮` と `未決 U21`、Score の `仮`、Rematch の `未決 U23` (自分が申し込んで待っている `.RematchWaiting` では `未決 U30`)、Back to Friend Match の `未決 U24` | 端末の上の帯に `未決` U21 / U23 / U24 (`.RematchWaiting` では U30 も)。右パネルの説明に「Rank の変化と Score はどちらも仮の表示で、Score の ---- は値が決まっていないため (U21)」と U23 / U24 / U30 の説明。Score の表示は `----` のまま |
| シナリオ 8 / 9 / 10 のホスト (`Host.MultiModeSelection`) | 注記「このシナリオではホストは関与しない」 | 右パネルの現在の状態の下 (`Host` 付きの 1 行)。ホストの端末はその時点の画面 (Online Battle) だけ |

2026-10-07 に結果画面が決まったので (U20〜U30)、結果画面の帯には U21 / U23 / U24 / U30 ではなく、決まっていない点 (U44 / U45 / U49 / U50) だけを出し、Score の `----` はやめました (決まっていないスコアは行ごと出さない、U20)。

これで電話の画面の中には、決定・未決・仮の印もモックの注記もありません (`node tests/scan-screens.mjs` で全シナリオの全手順を確認)。
モックの仮置きとして画面の中に残しているのは次のものだけです。

| 状態 | 画面の中にあるもの | 場所 |
|---|---|---|
| すべての状態 | 遷移表に行が無いボタンの破線・半透明 (例: 片方だけ押したあとの ‹) | `css/style.css` `.screen [data-norow]` |
| `Host.Game.*` / `Client.Game.*`、`Host.Away.StageSelection.*` / `Client.Away.StageSelection.*` | ゲーム画面 (フィールド・HUD) とステージ選択の画面そのものがプレースホルダー | `js/app.js` `VIEWS.game` / `VIEWS.stage` |

## ランダム対戦は相手が見つかり次第 VS へ (2026-10-03 決定、U13a)

高宮さんの決定 (2026-10-03、U13 の一部を U13a として分けた): ランダム対戦では、相手が見つかり次第 VS 画面へ進みます。
Ready・Start Match・"Starting match…" は挟みません。両者が Start Match を押す U31 は Friend Match だけの決定です。
相手を探している画面には、相手を探していることが分かる表示と、席を外す人のための目立つ Cancel を出します。

### モックでの表示

| 段階 | 端末の画面 |
|---|---|
| Random Match を選ぶ | 見出し "Random Match"、中央に "Searching for an opponent…" と順に光る 3 つの点、下に大きな [Cancel] |
| 相手が見つかる (自動、約 2.5 秒) | すぐ VS 画面 → ゲーム画面でゲーム本体のカウントダウン → プレイ開始 (Friend Match と同じ) |
| Cancel を押す | 確認なしで Online Battle の画面 (Random Match / Friend Match を選ぶ画面) に戻る (確認を出さないことは U13 で決定) |

- 09-30 の旧案 (図00) にあったピンクのトースト "Waiting for opponent" と、待機画面の "Waiting for opponent…" はやめ、"Searching for an opponent…" にしました (「表記の修正」)。
- 端末の画面には決定の印を出さず、右パネルの「決定済み」に `決定 U13a` を出します。画面の説明も右パネルの現在の状態の下に出します。

### U13 の分け方

| ID | 状態 | 内容 |
|---|---|---|
| U13a | 決定 (高宮さん 2026-10-03) | ランダム対戦は相手が見つかり次第 VS 画面へ (Start Match なし)。相手を探す画面に "Searching for an opponent…" と Cancel。Cancel で Online Battle へ |
| U13 | 決定 (高宮さん 2026-10-07) | 残りの論点 (Cancel の確認、‹、アプリを離れたとき、タイムアウト)。下の「ランダム対戦の待機中の操作」を参照 |

### 状態・イベント

| 変更 | 状態 / イベント |
|---|---|
| 追加 | イベント `host.cancelSearch` / `client.cancelSearch` (相手を探している間の Cancel → Online Battle、決定 U13a、確認の有無は U13) |
| 削除 | イベント `client.cancelMatch` (ランダム対戦でだけ使っていた)、トースト `random` (ピンクの "Waiting for opponent") |
| 意味を明確化 | `sys.opponentFound` (相手を探す 2 端末 → VS 画面) に決定 U13a を付けた。ランダム対戦の状態から Ready / Start Match / "Starting match…" へ進む行は無い (`tests/check.js` で確認) |

遷移表は 135 行のままです (ランダム対戦の 5 行を、相手が見つかる 1 行・Cancel の 2 行・‹ の 2 行に書き直した)。
シナリオ 11 を「ランダム対戦 (相手が見つかり次第 VS)」に書き直し、11b「ランダム対戦 → Cancel で Online Battle へ」を追加しました。
11 の手順の数は変わらない (5 手順) ので、既存の `#s=11&step=..` はそのまま使えます。

- `index.html#s=11&step=2` - 両者が相手を探している ("Searching for an opponent…" と Cancel)
- `index.html#s=11&step=3` - 相手が見つかり、すぐ VS 画面
- `index.html#s=11b&step=1` - ホストだけ相手を探している
- `index.html#s=11b&step=2` - ホストが Cancel で Online Battle に戻った

![ランダム対戦: 相手を探している (Cancel 付き)](docs/screenshots/33-random-searching.png)

![ランダム対戦: 相手が見つかり、すぐ VS 画面](docs/screenshots/34-random-matched-vs.png)

![ランダム対戦: Cancel で Online Battle へ](docs/screenshots/35-random-cancel-online.png)

## ランダム対戦の待機中の操作 (2026-10-07 決定、U13)

高宮さんの決定 (2026-10-07、U13 の残り): 相手を探している間 ("Searching for an opponent…") の操作が決まりました。相手が見つかり次第 VS 画面へ進むこと (U13a) は変わりません。

| 場面 | 決定 | モックの状態 |
|---|---|---|
| Cancel を押す | 確認ダイアログを出さずに Online Battle へ戻る | `*.Matchmake` → `*.MultiModeSelection` |
| ‹ を押す | Cancel とまったく同じ (確認なしで Online Battle へ)。探している間は、ほかの画面へは行けない (出口は Cancel と ‹ だけ) | `*.Matchmake` → `*.MultiModeSelection` |
| アプリを離れる (バックグラウンドへ移る・画面ロック) | 検索を止める。戻ると通知を出す (文言・出す場所・ボタンは U43 で決定。「検索停止のお知らせ」を参照) | `*.Matchmake` → `*.Matchmake.Stopped` |
| 60 秒探しても相手が見つからない | 元の画面 (Online Battle) に戻り、"No opponent found." と Search again / Close | `*.Matchmake` → `*.Matchmake.NotFound` |

**60 秒という長さは仮です** (変わりうる)。そのため、60 秒は右パネルの説明・遷移表のメモ・この README にだけ書き、端末の画面には出しません (`tests/scan-screens.mjs` で確認)。

### Search again と Close

| ボタン | 動き | モックの状態 |
|---|---|---|
| Search again | もう一度相手を探す ("Searching for an opponent…" の画面に戻る)。相手も探していれば、すぐ VS 画面へ (U13a) | `*.Matchmake.NotFound` / `*.Matchmake.Stopped` → `*.Matchmake` |
| Close | 通知を閉じる。画面は元の Online Battle のまま (もう一度 Random Match / Friend Match を選べる) | `*.Matchmake.NotFound` / `*.Matchmake.Stopped` → `*.MultiModeSelection` |

- "No opponent found." は、確認ダイアログ (Cancel this match? など) と同じ見た目で、Online Battle の上に出します。Search again を主なボタン (青い枠) にしました。
- U13 の決定のときは "Search stopped because you left the app." の出す場所とボタンが決まっておらず、未決 U43 にしていました。
  U43 も 2026-10-07 に決まり、Online Battle の中のモーダルではない通知になりました (下の「検索停止のお知らせ」を参照)。

### モック操作 (端末の外)

アプリを離れることと 60 秒たつことは、電話の画面のボタンではないので、Win / Lose と同じく端末の下のモック操作にしました。
相手を探している間 (`*.Matchmake`) だけ、`モック操作 (検索中): [アプリを離れる] [60 秒たつ]` が出ます (ほかの画面ではふだんどおり Win / Lose)。

- **アプリを離れる**: アプリを離れて戻ってきたところを 1 回の操作で再現します (離れている間の画面はゲームの画面ではないので描きません)。
- **60 秒たつ**: 実際に 60 秒待たずに、タイムアウトしたところへ進めます。自由操作中に実時間で 60 秒待つ自動遷移にはしませんでした
  (モックの自動遷移は、どちらかの端末でイベントが起きるたびにタイマーをかけ直すので、もう一方の端末を操作すると 60 秒が最初からになってしまうため)。

### 状態・イベント

| 変更 | 状態 / イベント |
|---|---|
| 追加 | 状態 `Host.Matchmake.Stopped` / `Client.Matchmake.Stopped` (アプリを離れて検索が止まった。当時は Online Battle の上に "Search stopped because you left the app."、今は U43 の通知)、`Host.Matchmake.NotFound` / `Client.Matchmake.NotFound` (見つからなかった。Online Battle の上に "No opponent found.") |
| 追加 | イベント `*.leaveApp` (モック操作: アプリを離れて戻る)、`*.searchTimeout` (モック操作: 60 秒たっても見つからない)、`*.searchAgain` (Search again)、`*.closeNotice` (Close) (`*` は `host` / `client`) |
| 未決 → 決定 | `*.cancelSearch` と、相手を探している間の `*.back` の行から未決 U13 を外し、決定 U13 を付けた (動きは前と同じ: 確認なしで Online Battle へ) |

遷移表は 141 行から 153 行になりました (相手を探している間の Cancel と ‹ の 4 行を、端末ごとに 8 行ずつの 16 行に書き直した: Cancel、‹、アプリを離れる、60 秒たつ、通知 2 つ × Search again / Close)。
そのため、ランダム対戦より後ろの行 (対戦後) は T136〜T153 になりました。

シナリオ 11b に ‹ の手順を足し (「ランダム対戦 → Cancel / ‹ で Online Battle へ」、2 手順 → 4 手順。前の 2 手順は同じなので `#s=11b&step=1` / `step=2` はそのまま使えます)、11c〜11f を足しました。

- `index.html#s=11b&step=4` - もう一度探して ‹ を押し、Online Battle に戻った
- `index.html#s=11c&step=2` - ホストがアプリを離れて戻った: Online Battle の中に "Search stopped while the app was in the background." (U43)
- `index.html#s=11c&step=5` - Search again のあと、クライアントも探して VS 画面
- `index.html#s=11d&step=3` - クライアントが通知を Close して Online Battle
- `index.html#s=11e&step=2` - ホストが 60 秒たっても見つからない: "No opponent found."
- `index.html#s=11f&step=3` - Close して Online Battle

![ランダム対戦: アプリを離れて検索が止まった](docs/screenshots/37-random-search-stopped.png)

![ランダム対戦: 相手が見つからなかった](docs/screenshots/38-random-not-found.png)

## 検索停止のお知らせ (2026-10-07 決定、U43)

高宮さんの決定 (2026-10-07): 相手を探している間にアプリを離れて (バックグラウンドへ移る・画面ロック) 検索が止まったとき、戻ったプレイヤーに出す通知が決まりました。

| 項目 | 決定 |
|---|---|
| 出す場所 | Online Battle の画面 (`Host.MultiModeSelection` / `Client.MultiModeSelection`) の **中** に、通知のボックスとして出す。**モーダルではなく**、操作をさまたげない |
| 文言 | "Search stopped while the app was in the background." (以前の "Search stopped because you left the app." から変更) |
| ボタン | Search again (新しく相手を探す) と Close |
| 消えるとき | **自動では消えない**。Close を押すか、ほかの画面へ移ると消える (Online Battle のほかの操作もそのまま使える) |

60 秒探しても見つからなかったときの "No opponent found." (U13) は、これまでどおり Online Battle の上のダイアログ (Search again / Close) です。

### モックでの見せ方

- 通知のボックスは、Random Match / Friend Match のメニューの **下** に置きました。上に置くとメニューの位置がずれて、押そうとした場所が変わるためです。
  見た目は確認ダイアログと同じ紺の枠で、暗幕は重ねません。ボタンは横並びで、Search again を主なボタン (青い枠) にしました。
- 通知を出したまま、Random Match (新しく探す) と Friend Match (Friend Match トップへ) を押せます。行き先はどちらも、通知を出していない Online Battle から押したときと同じです。
- ほかの画面へ移ると通知は消え、‹ で Online Battle に戻っても出ません。通知を出している状態からの自動遷移は無く、相手の端末の操作や環境イベントでも消えません。

| 操作 | 動き | モックの状態 |
|---|---|---|
| Search again | 新しく相手を探す ("Searching for an opponent…") | `*.Matchmake.Stopped` → `*.Matchmake` |
| Close | 通知を閉じる。Online Battle のまま | `*.Matchmake.Stopped` → `*.MultiModeSelection` |
| Random Match (通知の上のメニュー) | 新しく相手を探す (Search again と同じ行き先)。通知は消える | `*.Matchmake.Stopped` → `*.Matchmake` |
| Friend Match (通知の上のメニュー) | Friend Match トップへ。通知は消える | `*.Matchmake.Stopped` → `*.FriendMatch.Room` |

### 状態・イベント

| 変更 | 状態 / イベント |
|---|---|
| 意味を変更 | `Host.Matchmake.Stopped` / `Client.Matchmake.Stopped` の画面: Online Battle の上のダイアログ → Online Battle の中の通知 (モーダルではない)。画面の仕様は `notice` ではなく `inlineNotice` |
| 追加 | 行 `*.Matchmake.Stopped` + `*.randomMatch` → `*.Matchmake`、`*.Matchmake.Stopped` + `*.friendMatch` → `*.FriendMatch.Room` (両端末で 4 行) |
| 未決 → 決定 | アプリを離れる行と、通知の Search again / Close の行から未決 U43 を外し、決定 U43 を付けた |

遷移表は 235 行から 239 行になりました (状態は 127 のまま)。新しい 4 行はランダム対戦の待機中の行の中に入るので、それより後ろの行 (次の相手を探す・対戦中・対戦後) の番号は 4 つずつずれました。
シナリオ 11c / 11d の説明を新しい文言にし、11g を足しました (ほかのシナリオの手順の数は変わらないので、既存の `#s=..&step=..` はそのまま使えます)。

- `index.html#s=11c&step=2` - ホストがアプリを離れて戻った: Online Battle の中に通知
- `index.html#s=11d&step=2` - クライアントがアプリを離れて戻った: Online Battle の中に通知
- `index.html#s=11g&step=3` - 通知を出したまま Friend Match を押した (Friend Match トップ)
- `index.html#s=11g&step=4` - ‹ で Online Battle に戻った (通知は出ない)

![ランダム対戦: アプリを離れて検索が止まった (Online Battle の中の通知)](docs/screenshots/37-random-search-stopped.png)

## 対戦後の結果画面 (2026-10-07 決定、U20〜U30)

高宮さんの決定 (2026-10-07、推奨案): 以前は図が無く仮のプレースホルダーだった対戦後の画面 (未決 U20〜U30) が、すべて決まりました。

| ID | 決定 |
|---|---|
| U20 | 結果画面に Win / Lose / Draw / No contest、両者の名前、スコア、終わった理由を出す。スコアが決まっていなければ行ごと出さない ("----" は出さない) |
| U21 | Friend Match は "No rating change (friend match)"。ランダム対戦は Elo (初期値 1000、K=24) で、例えば "1000 → 1012 (+12)"。ランダム対戦で同じ相手と続けて再戦したときは変わらない |
| U22 | Friend Match: Rematch / Back to Friend Match。ランダム対戦: Find Next Opponent / Rematch / Back to Online |
| U23 | どちらからでも再戦を申し込める。相手が応じたらそのまま VS 画面へ。同時に申し込んだら成立 |
| U24 | Friend Match は Friend Match トップ (Match Code を作る・入れる画面) へ戻り、前の Match Code は使えなくなる。ランダム対戦は Online Battle へ。降参した側は Online Battle へ (U41 で決定済み) |
| U25 | 相手が抜けたら結果画面はそのままで "Your opponent left. Rematch is not available."。勝敗とレートは変わらない |
| U26 | 自動では次へ進まない |
| U27 | スタンプ 3 種類: 👏 "Good game" / 🤝 "Thanks for the match" / 👍 "Nice"。1 つ 3 秒表示、送る間隔は 5 秒、ミュートできる |
| U28 | 片方が切断したら 20 秒待ち、戻らなければ切断した側の負け。両者の切断・サービス障害は "No contest due to a connection error" でレートは変わらない。降参した側は再戦を申し込めない |
| U29 | 次の相手は 60 秒探す。見つからなければ "No opponent found." と Search again / Back to Online |
| U30 | 再戦の申し込みの応答期限は 20 秒。申し込んだ側に Cancel Request。取り消されたら相手に "Rematch request was cancelled"、断られたら申し込んだ側に "Your opponent declined the rematch"、期限切れなら "No response to rematch request"。どの場合も両者とも結果画面に残り、3 秒後にまた申し込める |

**秒数 (20 秒・3 秒・5 秒・60 秒) と Elo の値 (初期値 1000、K=24) は QA² 側の仮の値です** (変わりうる)。
そのため、秒数と「仮の値」であることは右パネルの説明・遷移表のメモ・この README にだけ書き、電話の画面には出しません (`tests/scan-screens.mjs` で確認)。
Elo の結果 (例: "1000 → 1012 (+12)") は決定どおり電話の画面に出します。

### 結果画面

上から順に次のものを出します。ゲームの UI キット ("RESULT" の見出しと大きな "WIN!" / "LOSE") にならった、これまでの結果画面を作り直しました。

| 部分 | 内容 |
|---|---|
| 見出し | "WIN!" (青) / "LOSE" (赤) / "DRAW" (黄) / "NO CONTEST" (灰、小さめ) |
| 終わった理由 | "Match finished" (ゲームの決着。文言は仮、U44) / "You surrendered" / "Your opponent surrendered" / "You were disconnected" / "Your opponent disconnected" / "No contest due to a connection error" |
| 両者の名前 | 左に自分 (`YOU` 付き)、右に相手。送ったスタンプはその人の名前の上に吹き出しで出る |
| スコア | "3,200 – 2,750" (自分 - 相手、モックのデモ値)。No contest は決まっていないので行ごと出さない |
| レーティング | Friend Match は "No rating change (friend match)"。ランダム対戦は "Rating 1000 → 1012 (+12)" (負けは "1000 → 988 (-12)"、引き分けは "1000 → 1000 (±0)")、再戦は "No rating change (rematch)"、No contest は "No rating change (no contest)" |
| 再戦の一行 | 下の「再戦」を参照 |
| スタンプ | 👏 🤝 👍 と、相手のスタンプのミュート (🔔 / ミュート中は 🔕) |
| ボタン | 下の表 |

モックでは両者とも初期値の 1000 から Elo を計算します (同じレート同士なので、勝ちは +12、負けは -12、引き分けは ±0)。

| 結果画面 | Friend Match | ランダム対戦 |
|---|---|---|
| ふつう (勝ち・負け・引き分け) | **Rematch** / Back to Friend Match | **Find Next Opponent** / Rematch / Back to Online |
| 自分が申し込んだ | Cancel Request / Back to Friend Match | Find Next Opponent / Cancel Request / Back to Online |
| 相手から申し込まれた | **Rematch** \| Decline / Back to Friend Match | Find Next Opponent / **Rematch** \| Decline / Back to Online |
| 取り消し・辞退・期限切れのあと 3 秒 | Rematch (無効表示) / Back to Friend Match | Find Next Opponent / Rematch (無効表示) / Back to Online |
| 相手が抜けた | **Back to Friend Match** | **Find Next Opponent** / Back to Online |
| 降参した側 | **Back to Online** | **Back to Online** |
| 相手が降参した・切断の勝ち負け・No contest | **Back to Friend Match** | **Find Next Opponent** / Back to Online |

太字は主なボタン (青い枠)、`|` は横に並べた 2 つです。Online Battle に戻るボタンは、降参後のもの (以前の "Back to Online Battle") も含めて "Back to Online" にそろえました。

### 再戦 (U23 / U30)

| 段階 | 申し込んだ側 | 申し込まれた側 |
|---|---|---|
| Rematch を押した | "Waiting for your opponent…"、Cancel Request | "Your opponent wants a rematch"、Rematch / Decline |
| 申し込まれた側が Rematch (応じる) / 両者が同時に Rematch | VS 画面 → ゲーム本体のカウントダウン → プレイ (ロビーの Start Match は挟まない) | 同じ |
| Cancel Request (取り消す) | (何も出さない)、3 秒は Rematch を押せない | "Rematch request was cancelled"、3 秒は押せない |
| Decline (断る) | "Your opponent declined the rematch"、3 秒は押せない | (何も出さない)、3 秒は押せない |
| 20 秒応答がない | "No response to rematch request"、3 秒は押せない | 申し込みの表示が消える、3 秒は押せない |
| 3 秒たつ | どちらからでもまた申し込める (メッセージは消える) | 同じ |
| 相手が結果画面を抜けた | "Your opponent left. Rematch is not available." (Rematch のボタンは消える) | - |

- 以前の仮の流れで使っていた "Waiting for your friend…" / "Your friend wants a rematch" は、ランダム対戦でも使うので "Waiting for your opponent…" / "Your opponent wants a rematch" にしました (決定の文言 "Your opponent declined the rematch" などにそろえた)。
- 「申し込まれた側」が応じるボタンは、申し込むボタンと同じ Rematch です (両者が Rematch を押したら成立、という U23 の決定と同じ形)。
- 両者が同時に押すことは 1 台ずつの操作では起こせないので、左の環境イベント「両者が同時に Rematch を押す」にしました。
- ランダム対戦の再戦の試合はレートが変わりません (再戦を続けても同じ)。Find Next Opponent で次に見つかった相手との試合は、またレートが変わります。

### スタンプ (U27)

- 3 つのボタン (👏 / 🤝 / 👍) で送ると、両者の画面で送った人の名前の上に吹き出し ("👏 Good game" など) が出ます。
- 送ってから 5 秒は、送った人のスタンプのボタンが無効表示になります。吹き出しは 3 秒で消えます (相手のボタンは押せるので、両者の吹き出しが同時に出ることもある)。
- 🔔 を押すとミュートになり (🔕)、相手のスタンプが自分の画面に出なくなります。自分が送ったスタンプは自分の画面には出ます。相手にはミュートしたことは伝えません。
- 相手が抜けた結果画面、切断で決まった結果画面、No contest ではスタンプを送れません (相手に届かないため)。降参の結果画面では送れます。

### 対戦中の切断 (U28)

| 場面 | 切断した側 | 相手 |
|---|---|---|
| 対戦中に片方の接続が切れる | ゲーム画面の上に "Connection lost" / "Reconnecting…" | ゲーム画面の上に "Your opponent disconnected" / "Waiting for your opponent to reconnect…" |
| 20 秒のうちに通信が回復する | プレイに戻る | プレイに戻る |
| 20 秒たっても戻らない | "LOSE" / "You were disconnected" (ランダム対戦ではレートも変わる) | "WIN!" / "Your opponent disconnected" |
| 両者の接続が切れる / サービス障害 | "NO CONTEST" / "No contest due to a connection error"、レートは変わらない | 同じ |

待っている間の画面 (パネルの文言・試合が止まるか・待ち時間を出すか) は決定に無いので、MATCH MENU と同じパネルを使った仮の表示にし、未決 U46 にしました。モックでは待っている間は Win / Lose / Draw を押せません。

### 次の相手を探す (U29)

Find Next Opponent を押すと、Random Match から探すときと同じ "Searching for an opponent…" と Cancel の画面になります (Cancel と ‹ は確認なしで Online Battle へ、U13 と同じ)。
もう一方の端末が Random Match か Find Next Opponent で探していれば、相手が見つかって VS 画面へ進みます。
60 秒探しても見つからなければ、Random Match の画面の上に "No opponent found." と Search again / Back to Online を出します (Random Match から探したときは Online Battle の上に出すので Close)。

### モック操作 (端末の外)

電話の画面のボタンではないものは、端末の下のモック操作か、左の「環境イベント」で起こします。

| 場所 | 操作 | 出る場面 |
|---|---|---|
| 端末の下 `モック操作 (対戦)` | Win / Lose / Draw (押した側が勝ち / 負け / 引き分け)、切断する (この端末の接続が切れる) | 対戦中 |
| 端末の下 `モック操作 (スタンプ)` | 3 秒たつ (送ったスタンプが消える)、5 秒たつ (また送れる) | 結果画面 |
| 端末の下 `モック操作 (検索中)` | アプリを離れる、60 秒たつ | 相手を探している間 (Find Next Opponent から探しているときは「アプリを離れる」は押せない、U47) |
| 左の環境イベント | 両者の接続が切れる、サービス障害が起きる、通信が回復する、切断から 20 秒たつ | 対戦中・切断を待っている間 |
| 左の環境イベント | 両者が同時に Rematch を押す、再戦の申し込みから 20 秒たつ、3 秒たつ | 結果画面 |

どのタイマーも、U13 の「60 秒たつ」と同じ理由で自由操作中の自動遷移にはしていません (モックの自動遷移は、どちらかの端末でイベントが起きるたびにタイマーをかけ直すため)。

### 状態・イベント・遷移表

結果画面は `役割.勝敗Result.段階` です (例: `Host.WinResult.RematchIncoming`)。Friend Match かランダム対戦か、レートが変わる対戦かは状態名に入れず、
両端末で共通の **セッション** (`match` = `friend` / `random`、`rated` = `true` / `false`) に持たせました。
状態名に入れると、VS 画面・ゲーム画面・MATCH MENU まで Friend Match 用とランダム対戦用に分ける必要があり、遷移表がほぼ 2 倍になるためです。
セッションは VS 画面へ進む行 (`sys.bothStarted` / `sys.opponentFound` / 再戦の成立) が `set` で書き、結果画面の行は `when: { match: 'friend' }` などで分けます。右パネルの「対戦:」の行に今のセッションを出します。

スタンプとミュートは再戦の段階と独立しているので、状態名には入れず、確認ダイアログ (`hostDialog`) と同じ **端末ごとの付属状態** (`hostStamp` / `hostMute` など) にしました。
端末の上の状態名の後ろに `+ 💬 gg` (送ったスタンプ)、`+ 💬 sent` (消えたが次を送れるまでの待ち)、`+ 🔕` (ミュート) と出ます。
付属状態は `js/transitions.js` の `DEVICE_FIELDS` で決まり、その状態で続かない画面へ移ると初期値に戻ります (スタンプは結果画面を出ると、ミュートは同じ相手と対戦している間 (VS 画面・ゲーム画面・結果画面) を出ると戻る)。

| 変更 | 状態 / イベント |
|---|---|
| 改名 | `*.WinResult.RematchWaiting` / `*.LoseResult.RematchWaiting` (自分が申し込んだ) → `*.RematchRequested`、以前の `*.RematchRequested` (相手から申し込まれた) → `*.RematchIncoming` |
| 追加 | 状態 `*.DrawResult*`、再戦の段階 `.RematchCancelled` / `.RematchDeclined` / `.RematchExpired` / `.RematchCooldown` / `.OpponentLeft` (勝ち・負け・引き分けそれぞれ)、`*.LoseResult.Disconnected` / `*.WinResult.OpponentDisconnected` / `*.NoContestResult`、`*.Game.Disconnected` / `*.Game.OpponentDisconnected` (切断を待つ)、`*.Matchmake.NextOpponent` / `*.Matchmake.NextOpponent.NotFound` (次の相手を探す) |
| 追加 | イベント `*.draw` / `*.disconnect` (モック操作)、`*.cancelRematch` / `*.declineRematch`、`*.findNextOpponent`、`*.stamp.gg` / `*.stamp.thanks` / `*.stamp.nice`、`*.stampShown` / `*.stampInterval` (モック操作)、`*.muteStamps` / `*.unmuteStamps`、環境 `net.bothDisconnected` / `net.serviceFailure` / `timer.disconnectTimeout` / `timer.rematchTimeout` / `timer.rematchCooldown` / `sys.rematchSimultaneous` |
| 変更 | `*.backToOnlineBattle` のボタンの文言を "Back to Online" に。ランダム対戦の結果画面と次の相手が見つからないときにも使う。`net.recovered` を切断を待つ間にも使う |
| 追加 | 行の `set` (セッションと付属状態を書き換える) と、`from` の付属状態の条件 (例: `hostStamp: null`)。遷移表のメモに「条件:」「設定:」として出す |

遷移表は 153 行から 235 行になりました (対戦後の 18 行を書き直して 100 行に)。状態は 77 から 127、グループは 14 から 34 です。
下の行番号は、そのあと U43 (検索停止のお知らせ) でランダム対戦の待機中に 4 行足したあとの、今の番号です (U20〜U30 の決定のときより 4 つ後ろ)。

| 行 | 内容 |
|---|---|
| T140〜T149 | 次の相手を探す (Cancel・‹・60 秒たつ・Search again・Back to Online) |
| T150〜T155 | 決着 (Win / Lose / Draw のモック操作) |
| T156〜T163 | 対戦中の切断・回復・20 秒たつ・両者の切断・サービス障害 |
| T164〜T199 | 再戦 (申し込む・応じる・取り消す・断る・期限切れ・同時・3 秒たつ。勝ち / 負け / 引き分けそれぞれ) |
| T200〜T225 | 結果画面から抜ける (Back to Friend Match / Find Next Opponent / Back to Online。相手には "Your opponent left…") |
| T226〜T239 | スタンプ (送る・3 秒たつ・5 秒たつ・ミュート) |

### 決定に書かれていないので置いた仮定 (新しい未決)

| 仮定 (モックの動き) | 未決 |
|---|---|
| ゲームの決着のときの終わった理由は "Match finished"。引き分けは端末の下の Draw で起こす | U44 |
| 降参で勝った側からも再戦を申し込めない。切断で決まった試合と No contest のあとも再戦は無い。そのため、これらの結果画面では相手が抜けても "Your opponent left…" を出さない | U45 |
| 切断を待つ間は、ゲーム画面の上にパネルを出し、Win / Lose / Draw を押せない。20 秒のうちに戻れば試合を続ける | U46 |
| Find Next Opponent から探している間にアプリを離れたときの行は無い | U47 |
| VS 画面の "Rank 12" / "Rank 9" はそのまま (レーティングとは別のものとして扱う) | U48 |
| ミュートは同じ相手と対戦している間 (再戦を含む) だけ続く。送ったスタンプは本人の画面にも出し、ミュートしたことは相手に伝えない | U49 |
| 取り消した側・断った側・申し込まれたまま期限が切れた側には何も出さない。メッセージは 3 秒たつと消える | U50 |
| スコアはデモ値 (勝ち 3,200 / 負け 2,750 / 引き分け 2,900)。決まっていないのは No contest だけとした | (U20 の範囲) |
| Online Battle に戻るボタンは、降参後も含めて "Back to Online" にそろえた | (U22 の範囲) |
| Friend Match トップに戻ると Match Code の入力欄は空。前の Match Code (QWERTY123) で Join Match すると "Match not found." | (U24 の範囲) |

### シナリオ

| ID | 手順 | 見られる画面 |
|---|---|---|
| 15 | 15 | 13: ホスト WIN! / クライアント LOSE (Friend Match) → 14: ホストが Back to Friend Match、クライアントに "Your opponent left…" → 15: 両者 Friend Match トップ |
| 15b | 14 | 13: ホスト LOSE / クライアント WIN! → 14: クライアントが先に抜け、ホストに "Your opponent left…" |
| 15c | 18 | 14: クライアントが申し込んだ ("Waiting for your opponent…" / "Your opponent wants a rematch") → 15: ホストが応じて VS 画面 → 18: 再戦の結果 |
| 15d | 18 | 14: ホストが申し込む → 15: Cancel Request (クライアントに "Rematch request was cancelled") → 16: 3 秒たつ → 18: クライアントが申し込み、ホストが応じて VS 画面 |
| 15e | 17 | 15: ホストが Decline (クライアントに "Your opponent declined the rematch") → 17: クライアントが抜け、ホストに "Your opponent left…" |
| 15f | 18 | 15: 20 秒たつ (ホストに "No response to rematch request") → 16: 3 秒たつ → 18: 申し込み直して VS 画面 |
| 15g | 16 | 13: 両者 DRAW → 14: 両者が同時に Rematch で VS 画面 |
| 15h | 20 | 14〜15: 両者がスタンプを送る → 16: ホストのスタンプが消える → 17: クライアントがミュート → 19: ホストの 👍 はクライアントに出ない → 20: ミュートを解くと出る |
| 16d | 10 | 8: ランダム対戦で降参 (降参した側 1000 → 988 (-12)、Back to Online だけ) → 9: ホストは次の相手を探す → 10: クライアントは Online Battle |
| 17 | 15 | 6: ランダム対戦の結果 (1000 → 1012 (+12) / 1000 → 988 (-12)) → 8: 再戦の VS 画面 → 11: 再戦の結果 ("No rating change (rematch)") → 12: ホストが Find Next Opponent、クライアントに "Your opponent left…" → 15: 新しい相手と VS 画面 |
| 17b | 11 | 7: ホストが次の相手を探す → 8: "No opponent found." (Search again / Back to Online) → 11: Online Battle |
| 18 | 15 | 13: クライアントの切断 (ホストは "Your opponent disconnected"、クライアントは "Reconnecting…") → 14: 20 秒たつ (ホスト WIN! / クライアント LOSE) |
| 18b | 15 | 13: ホストの切断 → 14: 通信が回復してプレイに戻る → 15: ホストの勝ち |
| 18c | 14 | 14: 両者の切断で NO CONTEST |
| 18d | 8 | 6: ランダム対戦でサービス障害 → NO CONTEST ("No rating change (no contest)") |
| 18e | 7 | 7: ランダム対戦の切断負け (1000 → 988 (-12) / 1000 → 1012 (+12)) |

15 / 15b / 15c は手順の数が変わらないので、既存の `#s=15&step=13`、`#s=15c&step=14` などはそのまま使えます (画面は新しい結果画面になった)。

![Friend Match の結果画面](docs/screenshots/17-result-win-lose.png)

![再戦の申し込み (申し込んだ側と申し込まれた側)](docs/screenshots/18-rematch-wait.png)

![ランダム対戦の結果画面 (Elo)](docs/screenshots/39-result-random-elo.png)

![ランダム対戦の再戦の結果 (レートは変わらない)](docs/screenshots/49-random-rematch-no-rating.png)

![再戦の申し込みが取り消された](docs/screenshots/40-rematch-cancelled.png)

![再戦を断られた](docs/screenshots/41-rematch-declined.png)

![再戦の申し込みに応答がない](docs/screenshots/42-rematch-expired.png)

![相手が抜けた](docs/screenshots/22-host-back-client-result.png)

![スタンプ](docs/screenshots/43-stamps.png)

![ミュート中のスタンプ](docs/screenshots/44-stamps-muted.png)

![引き分け](docs/screenshots/45-draw.png)

![対戦中の切断を待つ](docs/screenshots/46-disconnect-wait.png)

![切断で決まった結果](docs/screenshots/47-disconnect-result.png)

![No contest](docs/screenshots/48-no-contest.png)

![次の相手が見つからない](docs/screenshots/50-next-opponent-not-found.png)

![ランダム対戦で降参 (レートが変わる)](docs/screenshots/51-random-surrender-elo.png)

## 合意事項の反映 (10-01 の yasuhito のコメントで合意)

1. 用語は **Match Code** に統一 (図の Friend Match トップの "Enter Match ID" は "Enter Match Code" にした)
2. トーストは sentence case: "Waiting for your friend…" / "Friend joined!" / "Ready to start" / "Match code expired" / "Connection failed" / "Connection lost"
3. ボタンは何が起きるかを書く: "Create a new match?" / "Join another match?" は **Keep Current Match**、"Cancel this match?" は **Keep Waiting** / **Cancel Match**
4. フレンド待機の文言は **"Waiting for your friend…"** (三点リーダー 1 文字)
5. マッチ成立時に **VS 画面** (両者の名前・ランク・あいさつ + 絵文字、約 2.5 秒) → ~~**3 · 2 · 1**~~ → ゲーム開始 (プレースホルダー)。
   VS 画面のプレイヤー情報はモック用の架空データです。
   → 変更 (2026-10-03、U2 で決定): VS 画面のあとのモック独自の 3·2·1 はやめ、ゲーム画面でゲーム本体のカウントダウン (3 → 2 → 1) を使います。

## 表記の修正 (図との差分)

| 図の表記 | モックの表記 | 理由 |
|---|---|---|
| Enter Match ID | Enter Match Code | 合意 1 (用語の統一) |
| ONLINE BATTE | ONLINE BATTLE | 誤字 |
| Match not found. check the Match Code and try again | Match not found. Check the Match Code and try again. | 文頭の大文字・句点 |
| Connection was lost. | Connection lost. | 合意 2 のトースト文言に合わせた |
| Connecting... / Connectinng... | Connecting… | 誤字・三点リーダー |
| "Cancel this match?" の Go Back | Keep Waiting | 合意 3 (10-02 の図は Go Back のまま。未決ではなく表記差分) |
| Starting match.... (点 4 つ) | Starting match… | 三点リーダーに統一 |
| Connection Failed (09-30 のトースト) | Connection failed | 合意 2 (sentence case) |
| Waiting for opponent... (09-30 の旧案のピンクのトーストと待機画面) | "Searching for an opponent…" (待機画面の文言、トーストは無し) | U13a の決定 (相手を探す画面に Searching と Cancel を出す)。三点リーダー |
| 図01 で先に Start Match を押した側の "Starting match…" | "Waiting for your friend…" (相手側には "Friend is ready!") | U31 の決定 (押した側は待機表示、相手側には準備完了を表示)。"Starting match…" は両者が押したあとの同期中と図06 の再試行に残した。文言は U36 |

"Leave this match?" の "Go Back" は合意の対象外なので図のまま残し、未決 U11 にしています。

## 未決一覧

画面上の `未決` バッジ・未決タブと同じ ID です。選択肢があるものは未決タブのトグルで切り替えられ、既定は図の通り (図に無ければ最も中立な案) です。
決まった項目は ID を変えずに下の「決定済み」に移し、右パネルの「決定済み」と未決タブに緑の `決定` で表示します (端末の上や画面の中には出しません)。

### 決定済み

- **U2 開始のカウントダウン** - 決定 (高宮さん 2026-10-03)  
  元の論点は「開始は両者の Start Match か、自動カウントダウンか」。このうちカウントダウンの部分が決まりました:
  VS 画面のあと (ランダム対戦・Friend Match・再戦とも) はモック独自の 3·2·1 を出さず、ゲーム画面に移ってゲーム本体のカウントダウン (VsAI と同じ 3 → 2 → 1) を使います。  
  理由: ゲーム本体にゲーム開始時のカウントダウンがあるため、モック側の 3·2·1 は不要。  
  前提として、ゲーム側で VsPlayer の modeStartAnimationType を None から Countdown に変える（設定 1 行）。  
  決定はモックの 3·2·1 をやめることだけで、「両者が Start Match を押すか、Ready 後に自動で開始するか」は決めていません。
  そこでこの残りの論点 (と、そのトグル) を新しい未決 **U31** に分けました。U31 も同じ日に決まりました (下)。
- **U31 Friend Match の開始は両者が Start Match を押してから** - 決定 (高宮さん 2026-10-03)  
  Friend Match では、両者が Start Match を押したら開始する (Ready 後の自動開始はしない)。ランダム対戦には Start Match が無い (U13a)。片方が押すと、押した側は待機表示、相手側には相手が準備完了であることを表示する。
  U31 のトグルと、自動開始の別案だったシナリオ 1b は削除し、1b は「クライアントが先に Start Match」にしました。
  詳しくは「開始は両者の Start Match」を見てください。表示の細部 (U36) と、片方だけ押した状態の扱い (U33〜U35) は未決です。
- **U13a ランダム対戦は相手が見つかり次第 VS 画面へ (Start Match なし)** - 決定 (高宮さん 2026-10-03、U13 の一部)  
  相手が見つかったらすぐ VS 画面へ進む (Ready・Start Match・"Starting match…" は挟まない)。両者が Start Match を押す U31 は Friend Match だけ。
  相手を探している画面には "Searching for an opponent…" (点が順に光る) と、席を外す人のための大きな Cancel を出す。Cancel を押すと Online Battle の画面に戻る。
  Cancel に確認を挟むか、離席・タイムアウトの扱いは U13 に残しました (U13 も 2026-10-07 に決定、下)。詳しくは「ランダム対戦は相手が見つかり次第 VS へ」を見てください。
- **U13 ランダム対戦の待機中: Cancel と ‹ は確認なしで戻る。アプリを離れたら検索を止める。見つからなければ "No opponent found."** - 決定 (高宮さん 2026-10-07)  
  相手を探している間 ("Searching for an opponent…") の操作。Cancel を押すと、確認ダイアログを出さずに Online Battle へ戻る。‹ も Cancel とまったく同じ (Online Battle へ)。探している間は、ほかの画面へは行けない。
  アプリを離れる (バックグラウンドへ移る・画面ロック) と検索を止め、戻ったときに通知を出す (文言・出す場所・ボタンは U43 で決定、下)。
  60 秒探しても相手が見つからなければ、元の画面 (Online Battle) に戻って "No opponent found." と Search again / Close を出す。Search again でもう一度探し、Close で通知を閉じる。
  **60 秒という長さは仮** (変わりうる)。"Search stopped…" の通知の場所とボタンは決定に無かったので未決 U43 にし、U43 も同じ日に決まりました。詳しくは「ランダム対戦の待機中の操作」を見てください。
- **U43 アプリを離れて検索が止まったら、Online Battle の中に通知 (Search again / Close)。自動では消えない** - 決定 (高宮さん 2026-10-07)  
  戻ったときに Online Battle の画面の中に通知のボックスを出す。モーダルではなく、Online Battle のほかの操作 (Random Match / Friend Match) をさまたげない。
  文言は "Search stopped while the app was in the background." (以前の "Search stopped because you left the app." から変更)。ボタンは Search again (新しく探す) と Close。
  通知は自動では消えず、ほかの画面へ移ると消える。60 秒で見つからなかったときの "No opponent found." (U13) はこれまでどおり。詳しくは「検索停止のお知らせ」を見てください。
- **U37 オンライン対戦は ☰ MATCH MENU。開いても試合は止まらない** - 決定 (高宮さん 2026-10-07、案A)  
  オンライン対戦では VsAI のポーズポップアップの代わりに MATCH MENU (☰) を出す。VsAI やソロのポーズのように `Time.timeScale = 0` でゲームを止めることはせず、メニューを開いている間も試合は続く。
  メニューには "The match continues while the menu is open." と出し、CONTINUE (閉じる) と SURRENDER (降参) を置く。メニュー中に試合が終われば、そのまま結果画面へ進む。
- **U38 メニューを開いても相手には何も見えない。降参すると相手は勝ち + "Your opponent surrendered"** - 決定 (高宮さん 2026-10-07、案A)  
  MATCH MENU を開いただけでは、相手の端末には何も出さない。降参すると降参した側は負けの結果画面 ("You surrendered")、相手は勝ちの結果画面に "Your opponent surrendered" を出す (相手がメニューや確認を開いていても同じ)。
- **U39 対戦中に REMATCH / RETRY は出さない (再戦は結果画面だけ)** - 決定 (高宮さん 2026-10-07、案A)  
  実機のポーズポップアップの 2 番目のボタン (VsAI では REMATCH、ソロでは RETRY) は MATCH MENU に置かない。再戦は結果画面の Rematch だけ (進め方は U23 で決定、2026-10-07)。
- **U40 降参の前に確認を出す ("Surrender?" / "You will lose.")** - 決定 (高宮さん 2026-10-07、案A)  
  SURRENDER を押すと確認「降参しますか？ 負けになります」(画面の英語は "Surrender?" / "You will lose.") を出す。ボタンは CONTINUE (続ける、プレイに戻る) と SURRENDER (降参する)。確認中も試合は続く。
- **U41 ボタンは SURRENDER (QUIT ではない)。負けの結果画面のあと Online Battle へ** - 決定 (高宮さん 2026-10-07、案A)  
  MATCH MENU のボタンの文言は QUIT ではなく SURRENDER。降参して負けの結果画面を見たあとは Online Battle (`Host.MultiModeSelection` / `Client.MultiModeSelection`) に戻る。
  モックでは負けの結果画面の Back to Online で戻る (ボタンの文言は U22 で決定、2026-10-07)。
- **U42 MATCH MENU 中も BGM を下げない** - 決定 (高宮さん 2026-10-07、案A)  
  実ゲームのポーズは BGM を -5dB 下げる (ダッキング) が、MATCH MENU では試合が続くので BGM を下げない。モックには音が無いので、決定の記録だけ。

- **U20 結果画面: 勝敗・両者の名前・スコア・終わった理由を出す** - 決定 (高宮さん 2026-10-07)  
  結果画面に勝敗 (Win / Lose / Draw / No contest)、両者の名前、スコア、終わった理由を出す。スコアが決まっていないときは "----" などを出さずに行ごと出さない。
  通常の決着のときの終わった理由の文言 (モックは "Match finished") と、引き分けになる条件は決定に無いので U44 にしました。
- **U21 レーティング: Friend Match は変わらない。ランダム対戦は Elo (初期値 1000、K=24)。同じ相手との再戦は変わらない** - 決定 (高宮さん 2026-10-07)  
  Friend Match は "No rating change (friend match)"。ランダム対戦は Elo で、例えば "1000 → 1012 (+12)"。ランダム対戦で同じ相手と続けて再戦したときは変わらない。
  **初期値 1000 と K=24 は QA² 側の仮の値** (変わりうる)。VS 画面の "Rank" との関係は U48 にしました。
- **U22 結果画面のボタン** - 決定 (高宮さん 2026-10-07)  
  Friend Match: Rematch / Back to Friend Match。ランダム対戦: Find Next Opponent / Rematch / Back to Online。降参した側は Back to Online だけ (U41)。
- **U23 再戦: どちらからでも申し込め、相手が応じたらそのまま VS 画面へ。同時に申し込んだら成立** - 決定 (高宮さん 2026-10-07)
- **U24 戻り先: Friend Match は Friend Match トップ (前の Match Code は無効)、ランダム対戦は Online Battle** - 決定 (高宮さん 2026-10-07)  
  降参した側は Friend Match でも Online Battle に戻る (U41 で決定済み)。
- **U25 相手が結果画面を抜けたら "Your opponent left. Rematch is not available."** - 決定 (高宮さん 2026-10-07)  
  自分の結果画面はそのまま残り、勝敗とレートは変わらない。
- **U26 結果画面から自動では次へ進まない** - 決定 (高宮さん 2026-10-07)
- **U27 結果画面のスタンプ: 👏 Good game / 🤝 Thanks for the match / 👍 Nice。表示 3 秒、間隔 5 秒、ミュートあり** - 決定 (高宮さん 2026-10-07)  
  **3 秒と 5 秒は QA² 側の仮の値**。ミュートの続く範囲と送った本人の画面の表示は U49 にしました。
- **U28 対戦中の切断: 片方なら 20 秒待って切断した側の負け。両者の切断・サービス障害は No contest** - 決定 (高宮さん 2026-10-07)  
  両者の切断・サービス障害は "No contest due to a connection error" で、レートは変わらない。降参した側は再戦を申し込めない。**20 秒は QA² 側の仮の値**。
  以前の U28 に残っていた引き分けと対戦中の切断も、これと U20 で決まりました。待っている間の画面は U46、降参・切断のあとの再戦は U45 にしました。
- **U29 ランダム対戦の Find Next Opponent: 60 秒探して見つからなければ "No opponent found."** - 決定 (高宮さん 2026-10-07)  
  見つからなければ Search again / Back to Online を出す。**60 秒は QA² 側の仮の値**。探している間にアプリを離れたときは U47 にしました。
- **U30 再戦の申し込み: 応答期限 20 秒、Cancel Request で取り消し、Decline で断る。どの場合も結果画面に残り 3 秒後にまた申し込める** - 決定 (高宮さん 2026-10-07)  
  取り消されたら相手に "Rematch request was cancelled"、断られたら申し込んだ側に "Your opponent declined the rematch"、期限切れなら "No response to rematch request"。
  **20 秒と 3 秒は QA² 側の仮の値**。メッセージを出さない側の表示は U50 にしました。

詳しくは「対戦後の結果画面」を見てください。

U37〜U42 は、2026-10-03 のモックで「オンラインでも VsAI のポーズポップアップ (CONTINUE / REMATCH / QUIT) を出す」仮の案に付けていた未決です。
案A でまとめて決まったので、ポーズの状態・イベントは MATCH MENU に置き換えました (「対戦中の MATCH MENU」を参照)。
U28 (引き分け・対戦中の切断・降参) のうち、オンライン対戦の降参は U38 / U40 / U41 で決まったので、U28 には引き分けと対戦中の切断だけを残しました。
その残り (引き分け・対戦中の切断) も 2026-10-07 に U20 / U28 で決まりました。

U1 (Ready トーストから VS への入り方) にも同じ決定を当てはめるか確認しましたが、U1 の論点は「トーストをタップしたあと、ロビーの Ready 画面に戻るか、直接開始するか」で、
3·2·1 には触れていません。そのため U1 は未決のまま残し、「VS 画面のあとの流れは U2 で決定済み」という一文だけを足しました。

### 未決

- **U1 Ready トーストから VS への入り方**  
  別画面にいるホストが赤い "Ready to start" トーストをタップしたあと、ロビーの Ready 画面に戻って Start Match を押すのか、タップで Start Match を押した扱いにするのか。
  U31 の決定により、どちらでもクライアントが Start Match を押すまで開始しない (別案ではホストは "Waiting for your friend…"、クライアントには "Friend is ready!")。
  VS 画面のあとの流れ (モックの 3·2·1 をやめてゲーム本体のカウントダウン) は U2 で決定済みで、どちらの入り方でも同じ。トーストのタップ後の入り方は決まっていない。  
  トグル: ロビーの Ready 画面へ (図02) (既定) / タップで Start Match を押した扱い
- **U2** - 決定済み (上の「決定済み」を参照)。残りの論点だった U31 も決定済み
- **U3 VS 画面中に相手が切断したときの戻り先**  
  合意済みの VS 画面中に切断した場合の画面は図に無い。  
  トグル: ロビーで "Connection lost." (既定) / Friend Match トップ / Online Battle
- **U4 Friend joined! → Ready の条件**  
  何をもって Ready になるのか (自動遷移の条件・待ち時間) が不明。モックでは 1.5 秒後に自動で Ready にしている。
  Ready は Start Match を押せるようになる段階で、Ready になっても自動では開始しない (U31 で決定: 両者が Start Match を押したら開始)。
- **U5 Connection lost 時の扱いとクライアント側の表示**  
  図03 の赤字メモ「しばらく待つか、導線的にキャンセルしかないようにするか」。タイムアウトの長さも未定。クライアント側の画面は図に無く、モックではホストと対称の "Connecting…" / "Connection lost." を仮表示している。  
  トグル: キャンセルのみ (図03) (既定) / しばらく待てば復帰できる
- **U6 "Connection failed" トーストの発生条件**  
  09-30 の図にトーストだけあり、出る場面が描かれていない。モックでは Create Match / Join Match の接続失敗として仮に表示している。
- **U7 Match Code の有効期限と文言の差**  
  有効期限の長さが未定。ホスト側は "Match code expired." / トースト "Match code expired"、クライアント側は "Match expired." と文言が異なる。
- **U8 ホストがキャンセルした後のクライアントの出口**  
  "Host User / cancelled the match." の画面にボタンが無い (‹ のみ)。モックでは ‹ で Friend Match トップに戻る。
- **U9 クライアント待機中 (Client.FriendMatch.Lobby.Waiting) の退出方法**  
  "Waiting for your friend…" のクライアント画面にボタンが無い。モックでは ‹ で抜けて Match Code 入力済みのトップへ戻る。
- **U10 クライアント離脱で期限切れ後のホスト画面の Start Match**  
  図07 で "Match expired." の画面に Start Match と Cancel Match がある。期限切れで開始できる意味が不明なため、モックでは Start Match に遷移行を用意していない (押せない)。
- **U11 "Leave this match?" の "Go Back" の文言**  
  "Cancel this match?" は合意で "Keep Waiting" にしたが、"Leave this match?" の "Go Back" は合意の対象外。"Stay in Match" などに揃えるか。
- **U12 "Create a new match?" / "Join another match?" の本文と影響**  
  10-01 の合意でボタンは [Create Match]/[Join Match] + [Keep Current Match]。本文は残っている図に無いので仮に "Your current Match Code will no longer be valid." を表示。古いマッチに入っていたクライアントの扱いも未定 (モックでは "cancelled the match.")。
- **U13** - 決定済み (上の「決定済み」を参照)
- **U14 ホストが ‹ で戻ったときにマッチを維持するか**  
  図02 はバナーを出してマッチを維持する。‹ でキャンセル確認を出す案もありうる。  
  トグル: 維持してバナー表示 (図02) (既定) / キャンセル確認を出す
- **U15 同期失敗時に片方だけ再試行した場合**  
  図06 は両者が Start Match で再試行する。片方だけ再試行した場合や、再試行の回数制限が未定。
  再試行で先に押した側は図06 どおり "Starting match…" で相手を待ち、相手側には何も出ない。初回の開始 (U31) の "Waiting for your friend…" / "Friend is ready!" に揃えるかも未定。
- **U16 青 / 緑のバナーをタップしてロビーに戻れるか**  
  図02 で "Ready to start" と "Match code expired" はタップで遷移するが、"Waiting for your friend…" と "Friend joined!" のタップは描かれていない。  
  トグル: タップできない (図02) (既定) / タップでロビーへ
- **U17 ホストが戻ったときクライアントに "Friend joined!" を再表示するか**  
  図02 では Away → Friend joined! → Ready の順。すでに一度 Ready だった場合も同じか。ホスト離席中にクライアントが退出した場合のホスト側表示も図に無い。
  ホストが戻って Ready になったあとも、開始には両者の Start Match が必要 (U31 で決定)。
- **U18 クライアントが別画面にいる間に期限切れになったときのクライアント側**  
  図07 はホスト側のみ。モックではクライアントに "Match code expired" トーストを出し、タップで "Match expired." を表示している。
- **U19 Connection lost から ‹ で戻ると青い "Waiting for your friend…" バナー**  
  図03 では Connection lost の画面から ‹ で戻ると、待機中のバナー付き Friend Match トップになる。相手が切断されたのに待機扱いでよいか。
- **U20〜U30** - 決定済み (上の「決定済み」を参照)
- **U13a** - 決定済み (上の「決定済み」を参照)。U13 の残りも決定済み
- **U31** - 決定済み (上の「決定済み」を参照)
- **U32 ゲーム本体のカウントダウン中に相手が切断したとき**  
  VS 画面中の切断 (U3) と対戦中の切断 (U28) の間にある、ゲーム画面のカウントダウン (約 3.4 秒) 中に相手が切断した場合の扱いと画面は決まっていない。モックには遷移行が無い。
  対戦中の切断は U28 で決まった (20 秒待って切断した側の負け、両者なら No contest) が、カウントダウン中にも当てはめるかは決まっていない。
- **U33 片方だけ Start Match を押した状態で、相手が切断した / いつまでも押さないとき**  
  U31 の決定で、片方が押すと相手が押すまで待つ。その間に相手が切断した場合や、相手がいつまでも押さない場合の扱い (タイムアウトするか、キャンセルになるか、押した側が押したことを取り消せるか) は決まっていない。
  モックには遷移行が無い (片方が押したあとは「通信が不安定になる」などの環境イベントを出せず、押した側の Start Match は無効表示のまま)。
- **U34 片方が Start Match を押したあとの Cancel Match / Leave Match**  
  片方が押して相手を待っている間に、ホストが Cancel Match、またはクライアントが Leave Match を押したときの扱いは図に無い。押した側が自分でキャンセル・退出する場合と、準備完了の相手を残してキャンセル・退出する場合がある。
  モックでは Ready からのキャンセル (図04: クライアントに "cancelled the match.") ・退出 (図05: ホストに "left the match." → 待機に戻る) と同じ結果を仮に置いている。相手に何を伝えるかは未定。
- **U35 片方が Start Match を押したあとに別画面へ移る (‹) とき**  
  押した側、または準備完了の相手を待たせている側が ‹ で別画面へ移ったときの扱いは図に無い。マッチを維持してトーストを出すのか (図02 / 図07 のように)、押したことが取り消されるのかが未定。
  クライアントが押したあとにホストが離れた場合の "Ready to start" トーストの扱いも未定。モックには遷移行が無い (‹ は押せない)。
- **U36 片方が Start Match を押したあとの表示の細部**  
  U31 で決まったのは「押した側は待機表示、相手側には相手が準備完了であることを表示」まで。モックの文言 (押した側の "Waiting for your friend…"、相手側の名前の下の "Friend is ready!")、
  押した側の Start Match を無効表示にするか隠すか、ホスト・クライアントで同じ表示にするかは仮。
- **U37〜U42** - 決定済み (上の「決定済み」を参照)
- **U43** - 決定済み (上の「決定済み」を参照)
- **U44 通常の決着のときの終わった理由の文言と、引き分けになる条件**  
  U20 の決定で結果画面に終わった理由を出すが、降参・切断・接続エラー以外 (ゲームの決着) のときの文言は決まっていない。モックは仮に "Match finished" を出している。
  また Draw (引き分け) が結果の 1 つになったが、どういうときに引き分けになるかはゲームのルール次第で決まっていない (モックは端末の下のモック操作 Draw)。
- **U45 降参・切断・接続エラーで終わった試合のあとの再戦**  
  U28 の決定は「降参した側は再戦を申し込めない」。降参で勝った側から申し込めるか (降参した側が応じられるか) は決まっていない。
  切断で勝敗が決まった試合と No contest のあと、再戦できるかも決まっていない。モックではどれも再戦のボタンを出さない (降参した側は U41 のとおり Back to Online だけ)。
  そのため、これらの結果画面では相手が抜けても "Your opponent left. Rematch is not available." (U25) を出していない。
- **U46 切断を待つ 20 秒の間の両端末の画面と、試合が止まるか**  
  U28 の決定で、片方が切断したら 20 秒待つ。その間の画面は決まっていない。モックはゲーム画面の上に、残った側には "Your opponent disconnected" / "Waiting for your opponent to reconnect…"、
  切断した側には "Connection lost" / "Reconnecting…" を出し、20 秒のうちに戻れば試合を続ける (環境イベント「通信が回復する」)。
  待っている間も試合 (残った側のプレイ) が続くのか止まるのか、待ち時間を画面に出すかも未定。モックでは待っている間は Win / Lose / Draw を押せない。
- **U47 次の相手を探している間にアプリを離れたとき**  
  U13 / U43 の決定で、Random Match から探している間にアプリを離れると検索を止め、戻ると Online Battle の中に "Search stopped while the app was in the background." を出す。
  結果画面の Find Next Opponent から探している間 (U29) にアプリを離れたときも同じでよいか、通知をどこに出すかは決まっていない。モックには行が無い (端末の下の「アプリを離れる」は押せない)。
- **U48 VS 画面の "Rank" とレーティング (Elo) の関係**  
  VS 画面は 10-01 の合意で名前・ランク・あいさつを出し、モックは "Rank 12" / "Rank 9" (架空) を出している。U21 の決定でランダム対戦は Elo のレーティング (初期値 1000) になった。
  VS 画面の "Rank" はレーティングとは別のもの (プレイヤーのレベルなど) か、レーティングを出すのか、Friend Match でも出すのかは決まっていない。
- **U49 スタンプのミュートの続く範囲と、送った本人の画面の表示**  
  U27 の決定でスタンプはミュートできるが、ミュートがいつまで続くか (その結果画面だけ / 同じ相手との再戦の間 / ずっと) は決まっていない。モックは同じ相手と対戦している間 (再戦を含む) だけ続く。
  送ったスタンプを送った本人の画面にも出すか、ミュートしたことを相手に知らせるかも未定 (モックは本人の画面にも出し、相手には知らせない)。
- **U50 再戦が取り消し・辞退・期限切れになったとき、メッセージを出さない側の表示**  
  U30 の決定のメッセージは、取り消されたら相手 ("Rematch request was cancelled")、断られたら申し込んだ側 ("Your opponent declined the rematch")、期限切れなら申し込んだ側 ("No response to rematch request") に出す。
  もう一方 (取り消した側・断った側・申し込まれたまま期限が切れた側) の表示は決まっていない。モックでは何も出さず、3 秒の間 Rematch を押せない表示にしている。メッセージを 3 秒たったあとも残すかも未定 (モックは 3 秒で消える)。
