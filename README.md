# qa2-match-mock

QA² のオンライン対戦 (Friend Match) の導線を議論するための、使い捨ての HTML モックです (qniapp/qa2#1891)。
ホストとクライアントの 2 台の画面を並べ、同じ操作で両方がどう変わるかを一度に見られるようにしています。
見た目の作り込みよりも、流れの分かりやすさを優先しています。

> 注意: このリポジトリは使い捨て・private です。製品コードではありません。

## 目的

- ogwssk さんの図 (2026-09-30 の旧案 00、2026-10-02 の 01〜10) の画面遷移を、ホストとクライアントを同時に動かして確認する
- 10-01 に合意した文言・ボタン・VS 画面を反映した状態で、残っている **未決** を洗い出して議論する

## 開き方

ビルドも依存パッケージも不要です。

- `index.html` をブラウザで直接開く (`file://` で動きます)
- またはローカルサーバーで開く: `python3 -m http.server` → <http://localhost:8000/>

URL の `#s=<シナリオ ID>&step=<手順数>` で、特定のシナリオの特定の手順を直接開けます (例: `index.html#s=1&step=6`)。
`#s=free` は自由操作です。キーボードの ← / → でも手順を戻す / 進めることができます。

## 画面構成

- **左: シナリオ** - シナリオを選ぶと両方の端末がリセットされ、説明と手順の一覧が出ます。
  `▶ 次へ` / `◀ 戻る` / `⟲ 最初から` / `自動再生` (1 手順あたり約 1.2 秒、VS 画面とカウントダウンは実際の長さ) で進めます。
  手順をクリックするとその手順まで飛べます。下の「環境イベント」は、通信切断や期限切れなど電話のボタン以外の外部要因です。
  「モック設定」で Join Match / Create Match の結果 (Match not found・期限切れ・満員・接続失敗) を切り替えられます。
- **中央: 2 台の端末** - 左が `ホスト` (青)、右が `クライアント` (橙)。電話のボタンは直接押せます (押すと遷移表の同じイベントが発火します)。
  シナリオの次の手順と同じ操作ならシナリオが進み、違う操作ならシナリオを外れて自由操作になります。
  遷移表に行が無い操作は破線・半透明で表示し、押しても何も起きません (ログに「行なし」と残ります)。
  端末の上の黄色い `未決` バッジは、その画面や直前の遷移が未決事項に依存していることを示します。クリックすると未決一覧へ移動します。
- **右: 状態遷移表** - 両端末の現在の状態、遷移表 (直前に発火した行を青、今の状態から発火できる行を緑の線で表示)、
  未決一覧 (トグル付き)、イベントログ (新しい順) をタブで切り替えます。

シナリオを手順で進めている間は、自動遷移 (図の点線矢印) は手順として 1 つずつ進み、VS 画面やカウントダウンのアニメーションも止まります
(スクリーンショットを決定的にするため)。自由操作中と自動再生中は、自動遷移が実時間で進みます。

## 状態遷移表

画面の変化を決めるのは `js/transitions.js` の `TRANSITIONS` (1 本の配列) だけです。`js/app.js` は `state.host` / `state.client` を
`SCREENS` に従って描画し、イベントを `js/engine.js` に渡すだけです。

```js
{ from: { host: 'H_WAITING', client: C_TOP_FILLED }, event: 'client.joinMatch',
  to: { host: 'H_FRIEND_JOINED', client: 'C_WAITING' }, note: '...', undecided: ['U4'] }
```

- `from` / `to` の `host` / `client`: 状態名、状態名の配列 (表ではグループ名で表示)、`'*'` (何でもよい / 変更なし)、`'='` (同じ状態のままダイアログだけ変える)
- `from.hostDialog` / `dialog: { host: 'cancel' }`: 確認ダイアログの開閉 (ダイアログの文言は `DIALOGS`)
- `when`: 未決トグル (`{ U2: 'both' }`) やモック設定 (`{ codeResult: 'notFound' }`) の条件
- `auto`: 自由操作中に自動で発火するまでのミリ秒 (図の点線矢印)
- 上から順に評価し、最初に一致した行が使われます。行の ID (T01〜) は並び順から自動で振られます。

ほかに `SCREENS` (状態 → 画面の描画仕様、トーストもここで決まる)、`DIALOGS`、`TOASTS`、`UNDECIDED` (未決一覧) が同じファイルにあります。
シナリオは `js/scenarios.js` にイベントの列として定義しており、遷移表の行をそのまま再生します。

自己テスト: `node tests/check.js` で、全シナリオが遷移表どおりに最後まで再生できること、未定義の状態や未決 ID が無いこと、
シナリオが前提にしていない未決トグルをどれに切り替えても再生できることを確認します。

## シナリオ一覧

元の図は qniapp/qa2#1891 の ogwssk さんのコメント (09-30 の図 00、10-02 の図 01〜10) です。

| ID | シナリオ | 元の図 |
|---|---|---|
| 1 | 通常対戦 | 01 |
| 1b | 通常対戦 (U2 別案: 自動開始) | 01 |
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
| 11 | ランダム対戦 (旧案) | 00 |
| 12 | VS 画面中の切断 | なし (合意事項) |
| 13 | 接続失敗 (仮) | 00 (トーストのみ) |
| 14 | 離席中に Create Match を押す | なし (10-01 合意) |

## 合意事項の反映 (10-01 の yasuhito のコメントで合意)

1. 用語は **Match Code** に統一 (図の Friend Match トップの "Enter Match ID" は "Enter Match Code" にした)
2. トーストは sentence case: "Waiting for your friend…" / "Friend joined!" / "Ready to start" / "Match code expired" / "Connection failed" / "Connection lost"
3. ボタンは何が起きるかを書く: "Create a new match?" / "Join another match?" は **Keep Current Match**、"Cancel this match?" は **Keep Waiting** / **Cancel Match**
4. フレンド待機の文言は **"Waiting for your friend…"** (三点リーダー 1 文字)
5. マッチ成立時に **VS 画面** (両者の名前・ランク・あいさつ + 絵文字、約 2.5 秒) → **3 · 2 · 1** → ゲーム開始 (プレースホルダー)。
   VS 画面のプレイヤー情報はモック用の架空データです。

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
| Waiting for opponent... | Waiting for opponent… | 三点リーダーに統一 |

"Leave this match?" の "Go Back" は合意の対象外なので図のまま残し、未決 U11 にしています。

## 未決一覧

画面上の `未決` バッジ・未決タブと同じ ID です。選択肢があるものは未決タブのトグルで切り替えられ、既定は図の通り (図に無ければ最も中立な案) です。

- **U1 Ready トーストから VS への入り方**  
  別画面にいるホストが赤い "Ready to start" トーストをタップしたあと、ロビーの Ready 画面に戻って Start Match を押すのか、タップで直接開始するのか。  
  トグル: ロビーの Ready 画面へ (図02) (既定) / タップで直接開始扱い
- **U2 開始は両者の Start Match か、自動カウントダウンか**  
  図では両者が Start Match を押し、先に押した側は "Starting match…" で相手を待つ。Ready になったら自動で開始する案もありうる。  
  トグル: 両者が Start Match を押す (図01) (既定) / Ready 後に自動で開始
- **U3 VS 画面中に相手が切断したときの戻り先**  
  合意済みの VS 画面中に切断した場合の画面は図に無い。  
  トグル: ロビーで "Connection lost." (既定) / Friend Match トップ / Online Battle
- **U4 Friend joined! → Ready の条件**  
  何をもって Ready になるのか (自動遷移の条件・待ち時間) が不明。モックでは 1.5 秒後に自動で Ready にしている。
- **U5 Connection lost 時の扱いとクライアント側の表示**  
  図03 の赤字メモ「しばらく待つか、導線的にキャンセルしかないようにするか」。タイムアウトの長さも未定。クライアント側の画面は図に無く、モックではホストと対称の "Connecting…" / "Connection lost." を仮表示している。  
  トグル: キャンセルのみ (図03) (既定) / しばらく待てば復帰できる
- **U6 "Connection failed" トーストの発生条件**  
  09-30 の図にトーストだけあり、出る場面が描かれていない。モックでは Create Match / Join Match の接続失敗として仮に表示している。
- **U7 Match Code の有効期限と文言の差**  
  有効期限の長さが未定。ホスト側は "Match code expired." / トースト "Match code expired"、クライアント側は "Match expired." と文言が異なる。
- **U8 ホストがキャンセルした後のクライアントの出口**  
  "Host User / cancelled the match." の画面にボタンが無い (‹ のみ)。モックでは ‹ で Friend Match トップに戻る。
- **U9 クライアント待機中 (C_WAITING) の退出方法**  
  "Waiting for your friend…" のクライアント画面にボタンが無い。モックでは ‹ で抜けて Match Code 入力済みのトップへ戻る。
- **U10 クライアント離脱で期限切れ後のホスト画面の Start Match**  
  図07 で "Match expired." の画面に Start Match と Cancel Match がある。期限切れで開始できる意味が不明なため、モックでは Start Match に遷移行を用意していない (押せない)。
- **U11 "Leave this match?" の "Go Back" の文言**  
  "Cancel this match?" は合意で "Keep Waiting" にしたが、"Leave this match?" の "Go Back" は合意の対象外。"Stay in Match" などに揃えるか。
- **U12 "Create a new match?" / "Join another match?" の本文と影響**  
  10-01 の合意でボタンは [Create Match]/[Join Match] + [Keep Current Match]。本文は残っている図に無いので仮に "Your current Match Code will no longer be valid." を表示。古いマッチに入っていたクライアントの扱いも未定 (モックでは "cancelled the match.")。
- **U13 ランダム対戦の待機・離脱・Ready の扱い**  
  ランダム対戦は 09-30 の旧案 (図00) のみで、10-02 の図に無い。トースト・離席・Ready / Start Match・キャンセル確認の有無が未定。
- **U14 ホストが ‹ で戻ったときにマッチを維持するか**  
  図02 はバナーを出してマッチを維持する。‹ でキャンセル確認を出す案もありうる。  
  トグル: 維持してバナー表示 (図02) (既定) / キャンセル確認を出す
- **U15 同期失敗時に片方だけ再試行した場合**  
  図06 は両者が Start Match で再試行する。片方だけ再試行した場合や、再試行の回数制限が未定。
- **U16 青 / 緑のバナーをタップしてロビーに戻れるか**  
  図02 で "Ready to start" と "Match code expired" はタップで遷移するが、"Waiting for your friend…" と "Friend joined!" のタップは描かれていない。  
  トグル: タップできない (図02) (既定) / タップでロビーへ
- **U17 ホストが戻ったときクライアントに "Friend joined!" を再表示するか**  
  図02 では Away → Friend joined! → Ready の順。すでに一度 Ready だった場合も同じか。ホスト離席中にクライアントが退出した場合のホスト側表示も図に無い。
- **U18 クライアントが別画面にいる間に期限切れになったときのクライアント側**  
  図07 はホスト側のみ。モックではクライアントに "Match code expired" トーストを出し、タップで "Match expired." を表示している。
- **U19 Connection lost から ‹ で戻ると青い "Waiting for your friend…" バナー**  
  図03 では Connection lost の画面から ‹ で戻ると、待機中のバナー付き Friend Match トップになる。相手が切断されたのに待機扱いでよいか。
