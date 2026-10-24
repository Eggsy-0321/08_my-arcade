# 08_my-arcade
HTML/CSS/JavaScriptで制作する、ドット絵風のWebゲームセンター。さまざまなミニゲームを追加して遊べるゲームポータルです。

## MVP

HTML / CSS / Vanilla JavaScriptのみで動作する静的サイトです。外部依存・ビルドは不要です。トップページは中央フォーカス型の横カルーセルです。スワイプ・左右筐体のタップ・左右ボタン・←/→キーで作品を選び、中央筐体・PLAY・Enterで起動します。Tabでフォーカスを移動できます。「STACK TOWER」「BLOCK BREAKER」「NUMBER MERGE」「BUBBLE SHOOTER」「SNAKE INVADERS」「LIGHTS OUT」「ALIEN INVADERS」「FLASHLIGHT MAZE」がプレイできます。

```text
index.html                 トップページ
css/arcade.css             店内・筐体・共通スタイル
js/arcade.js               JSON読み込み・筐体生成・循環カルーセル操作
data/games.json            ゲーム一覧（配列）
assets/pixel-scene.svg     サムネイル未指定・読み込み失敗時の代替画像
games/stack-tower/        STACK TOWER（HTML・CSS・ルール・描画/操作・SVG）
games/block-breaker/      BLOCK BREAKER
games/number-merge/       NUMBER MERGE
games/bubble-shooter/     BUBBLE SHOOTER
games/snake-invaders/     SNAKE INVADERS
games/lights-out/         LIGHTS OUT
games/alien-invaders/     ALIEN INVADERS
games/flashlight-maze/    FLASHLIGHT MAZE
tests/                   各作品のルールテスト・任意のブラウザーテスト
```

## ローカル起動

JSONをfetchで取得するため、ファイルを直接開くのではなくHTTPサーバー経由で確認します。Python 3がある場合、PowerShellで次を実行してください。

```powershell
cd C:\Game\08_my-arcade
python -m http.server 8000
```

ブラウザーで <http://localhost:8000/> を開きます。終了はCtrl+Cです。Pythonがない場合は、エディターの静的HTTPプレビュー機能などを利用できます。サイト自体にPythonは必要ありません。

## ゲーム追加手順

1. `games/` 内にゲーム用フォルダを作成し、HTMLゲームを配置します（例：`games/my-game/index.html`）。
2. ゲームページに一覧へ戻るリンクを設置します。

   ```html
   <a href="../../index.html">ゲーム一覧へ戻る</a>
   ```

3. 必要ならローカルのサムネイル画像を配置します（例：`assets/my-game.png`）。推奨比率は240:164です。カルーセルでは画像全体を表示枠内に収めます。
4. `data/games.json` の配列に次のオブジェクトを追記します。既存項目との間にカンマを入れてください。トップページのHTML・CSS・JSの変更は不要です。

   ```json
   {
     "id": "my-game",
     "title": "MY GAME",
     "description": "ゲームの説明を記載します。",
     "category": "パズル",
     "thumbnail": "./assets/my-game.png",
     "url": "./games/my-game/index.html",
     "status": "published"
   }
   ```

`id`は重複しない識別子にします。`title`・`description`・`category`は空でない文字列、`url`はサイト内の相対パスを指定します。`thumbnail`を空文字列にすると同梱の代替画像を使います。画像が取得できない場合も代替表示します。表示順はJSONの登録順です。`status`が厳密に`published`の項目のみ表示し、`draft`などは非表示になります。

`url`と`thumbnail`は**トップページを基準とした相対パス**です。`/`から始まる絶対パス・外部URL・サイトの外へ出るパスは使用しません。説明やタイトルにHTMLは使えません（文字として表示されます）。公開項目の必須情報が不正、JSON形式が不正、取得に失敗した場合は一覧にエラーメッセージを表示します。公開ゲームが0件の場合は準備中の表示になります。

## ゲーム共通UI仕様

- すべてのゲームにMY ARCADEトップへ戻る導線を設ける。
- GAME OVER画面にはRETRYと「← MY ARCADEへ戻る」リンクを表示する。
- クリア状態のあるゲームではALL CLEAR画面にも両方を表示する。
- 終了画面の戻るリンクはRETRYの下に置き、スマートフォンでも押しやすいサイズにする。
- 通常プレイ中もHOMEリンクなどでトップへ戻れるようにする。
- `games/<game>/` からは `../../index.html` などの相対パスを使い、GitHub Pagesのサブパス配信でも正しく戻れることを確認する。

## GitHub Pages

このファイル構成のまま、GitHubリポジトリのSettings → Pagesから配信対象ブランチと`/ (root)`を選択して公開できます。ビルド処理は不要です。CSS・JS・JSON・ゲームへのリンクはすべて相対パスなので、`https://Eggsy-0321.github.io/08_my-arcade/` のようなサブパスでも動作します。

## 動作確認

- トップに公開済み8作品が登録順で表示され、スワイプ・左右筐体タップ・←/→キーで循環選択できること。中央筐体・PLAY・Enterで正しいゲームが起動すること。
- PC幅とスマホ幅で横方向にはみ出さず、フォーカス枠が見えること。
- JSONに公開項目を追加すると筐体が増え、`draft`は表示されないこと。
- `thumbnail`が空または存在しない画像でも代替画像が表示されること。
- JSONの取得失敗や構文エラー時に読み込み失敗のメッセージが表示されること。
- 親フォルダをHTTP配信して`/08_my-arcade/`から開いても、筐体・起動・戻る操作が動作すること。


### トップページ UI v2

中央の筐体と作品情報・`01 / 08`形式の位置表示を同期し、左右の筐体は縮小・減光します。約250msの切り替え中は追加操作を受け付けません。横に40px以上、縦移動の1.3倍を超えるドラッグをスワイプとし、移動したジェスチャーの直後450msは筐体・PLAYによる起動を抑止します。縦スクロールとピンチ拡大はブラウザーに任せます。`prefers-reduced-motion`では切り替え演出を省略します。

公開作品0件・取得失敗は案内を表示し、1件では左右ボタンを無効化します。2件では同じ作品の左右の表示用筐体を用意し、どちらの方向にも循環できます。通常のAndroid縦画面に収まる余白を使い、小さい高さや文字拡大時は縦スクロールで内容に到達できます。

親ディレクトリをHTTP配信し、開発用のPython PlaywrightとChromiumが利用できる環境で次を実行します（サイト自体の依存追加はありません）。リポジトリ直下を配信する場合は`ARCADE_TEST_URL=http://127.0.0.1:8000/`を指定してください。

```sh
node --test tests/*.test.cjs
python tests/arcade.browser.py
```

カルーセルのブラウザーテストでは320×568・360×640・390×844・430×932・1280×800、実タッチイベントによる左右スワイプ、循環、誤起動抑止、左右筐体・中央筐体・PLAY、全6作品のURL、キーボード・連続操作・フォーカス・動きを減らす設定、0/1/2/3/9件、非公開作品の除外、JSON・画像の失敗、サブパス遷移を確認します。既存6作品のブラウザーテストも新しい選択操作に対応しています。実機Android、Firefox/Safari、GitHub Pages本番配信は別途確認が必要です。


## STACK TOWER

`games/stack-tower/index.html` がエントリーポイントです。タップ・クリック・Spaceで移動中のブロックを設置し、重なった部分を積み上げます。START → PLAYING → GAME_OVERの状態を持ち、RETRYでスコア0から再開します。

- `model.js`：CSSピクセル単位の重なり判定、PERFECT、左右交互の出現、経過時間による往復移動、速度上限。
- `game.js`：入力・状態・スコア・Canvas描画・カメラ・演出・画面サイズ変更。イベントと描画ループは初期化時だけ登録します。画面外の古い段と期限切れの落下片は破棄します。
- `style.css`：スマホの縦画面、ピクセル調の配色、画面オーバーレイ。Canvas解像度はdevicePixelRatioに追従します。
- `thumbnail.svg`：一覧用のローカル画像。外部リソース、ライブラリ、ビルドは不要です。

判定はまず重なりの有無を確認し、重なりがある場合に左端の差が4px以内なら下段の位置・幅へ補正します。4pxを超える場合は実際の重なり幅を残します。幅の下限を設けず、細いブロックでも判定を広げません。速度は125px/秒から1段ごとに6px/秒増え、310px/秒で止まります。

ベストは `my-arcade.stack-tower.best` に保存します。localStorageが利用できない場合も同じページ内のベストを保持してプレイを続けます。意図しない連続入力を避けるため、開始・設置から140ms以内の設置とキーリピートは無視します。非表示タブでは進行を止め、復帰時やフレーム停止後の急な移動を抑えます。

### 自動チェック

リポジトリ直下で実行します。Node.jsは開発時のテスト用で、サイトの実行には不要です。

```sh
node --check games/stack-tower/model.js
node --check games/stack-tower/game.js
node tests/stack-tower.test.cjs
git diff --check
```

ルールテストは7件：完全一致、±4px境界、4.01pxと左右の部分重なり、接触/非接触、極小幅、次段の幅/出現方向、速度上限、フレームレートによらない移動を確認します（関連ケースを同じテスト内にまとめています）。

任意のブラウザーチェックにはPython版PlaywrightとChromiumを別途用意します。ゲームの依存には追加していません。親フォルダをHTTP配信し、プロジェクトサイトと同じサブパスで検証します。

```sh
# 別ターミナル：08_my-arcadeを含む親フォルダで実行
python -m http.server 8000
# リポジトリ直下で実行
python tests/stack-tower.browser.py
```

既定URLは `http://127.0.0.1:8000/08_my-arcade/`、Chromiumは `/usr/bin/chromium` です。環境に応じて `ARCADE_TEST_URL` と `CHROMIUM_PATH` を指定できます。ブラウザーテストは時間を制御し、境界値や高い塔ではテスト側だけでブロック位置を調整します。製品コードにテスト用APIはありません。

### 実施結果と未確認事項

2026-10-20、Node.js 24とヘッドレスChromiumで実施：

- JavaScript構文チェック、上記7件のルールテスト、差分空白チェック：成功。
- 一覧とゲームカード遷移、START、タップ設置、二重入力防止、Space、通常/ベストスコア、PERFECT境界と部分重なり：成功。
- 60段までの積み上げとカメラ描画、320×568・390×844・430×932・844×390のリサイズ、DPR 3のCanvas寸法と横方向のはみ出し：成功。
- GAME OVER、最終スコア、RETRY、再読み込み後の保存値、トップへの帰還の動作：成功。
- localStorageの取得/保存をそれぞれ例外にした場合の継続、PCのマウス設置とSpaceでのSTART：成功。
- 通常のrequestAnimationFrameによる開始/移動表示もChromiumで確認。高い塔とGAME OVERのスクリーンショットを確認。

実機スマートフォン、iOS Safari、Firefox、GitHub Pages本番配信は未確認です。長時間のメモリ計測は未実施です。横画面など高さが小さい画面では操作領域の最小高さを確保するため、縦スクロールする場合があります。縦画面でのプレイを推奨します。

### GitHub Pagesでの確認

1. 作業ブランチの差分をレビューして配信対象ブランチへマージします。
2. Settings → Pagesでそのブランチと `/ (root)` を選び、配信完了を待ちます。既に設定済みなら変更不要です。
3. `https://Eggsy-0321.github.io/08_my-arcade/` を開き、STACK TOWERの筐体から起動します。
4. START → 設置 → GAME OVER → RETRYと、再読み込み後のBEST、MY ARCADEへの戻りを確認します。
5. 直接URL `https://Eggsy-0321.github.io/08_my-arcade/games/stack-tower/` でも起動できます。


## BUBBLE SHOOTER

第4作。`games/bubble-shooter/index.html` を単独で開いてプレイできます。トップの筐体からも起動できます。外部依存・ビルドは不要です。

- 5色・上から5段の千鳥六角格子。同じ色を3個以上つなげると1個10点、天井から切り離されたバブルは1個20点。時間制限・追加倍率はありません。
- LEFT / RIGHTの短押しで3度、長押しで連続照準移動（左右70度まで）。PCは左右矢印キーとSpaceで操作。照準ガイドは壁反射と最初のバブル衝突を表示します。
- 現在弾・NEXTは盤面に存在する色だけを使用。全消去するとスコアを維持して新しい5段を生成します。
- 連続ミスで天井に1段追加。許容回数は0〜499点で3回、500〜1,499点で2回、1,500点以上で1回。同色消去成功時にミスを0へ戻し、スコア到達時点で難易度を変更します。
- 吸着・段追加・消去・落下の処理後、バブル下端が下限ラインへ達するとGAME OVER。最終スコア・BEST・RETRY・HOMEを表示します。HOMEは `../../index.html` です。
- BESTは `my-arcade:bubble-shooter:best` に保存。ストレージが利用できない場合もセッション内のBESTを保持します。RETRYでスコア・盤面・角度・弾・演出・入力状態を初期化します。
- `model.js` はルール・探索・連続衝突計算、`game.js` は描画・操作・保存を担当。段追加時は格子原点の左右ずれを反転し、既存バブルの横位置と隣接関係を保持します。タブ非表示中は停止し、終了後はアニメーションフレームを停止します。
- 縦画面を優先し、320×568から画面内に収まる配置と48px以上の操作ボタンを使用。色を区別する補助としてバブルに1〜5の番号も表示します。

### 自動チェック

リポジトリ直下で実行します。Node.js・Python・Playwrightは開発時のみ使用し、ゲーム本体の依存には追加していません。

```sh
node --check games/bubble-shooter/model.js
node --check games/bubble-shooter/game.js
node --test tests/*.test.cjs
git diff --check
```

13件の新規ルールテストで、同色2個以下/3個以上、両向きの千鳥隣接、浮遊探索と得点、左右壁反射、吸着・貫通防止、照準との一致、スコア境界のミス条件、段追加時の座標維持、色の更新、全消去継続、下限判定、RETRY、HOME・登録を検証します。再現可能なランダム連続発射でも盤面の重複・重なり・浮遊残留を検証します。

任意のブラウザーチェックは、親フォルダを `python -m http.server 8000` で配信してから実行します。`ARCADE_TEST_URL`・`CHROMIUM_PATH` で既定値を変更できます。

```sh
python tests/bubble-shooter.browser.py
python tests/stack-tower.browser.py
python tests/block-breaker.browser.py
python tests/number-merge.browser.py
```

2026-10-21にNode.js 24とヘッドレスChromiumで、全作品のルールテスト・ブラウザーテスト、構文・差分チェックが成功。新作はPCキー/Android相当のネイティブタッチ、長押し・重複発射防止、320×568〜430×932の縦画面とPC幅、スクロール抑制、スコア・BEST保存/復元・保存例外、終了時のループ停止、RETRY、HOME、実アニメーションフレームでの発射を確認しました。既存3作品のゲーム本体と共通トップページは変更せず、既存ブラウザーテストの筐体数だけを5件へ更新しています。

実機Android/iOS、Safari・Firefox、GitHub Pages本番配信は未確認です。

## SNAKE INVADERS

第5作。`games/snake-invaders/index.html` とトップページの筐体から起動できます。ビルド・外部ライブラリ不要のCanvasシューティングです。

- 9:16の黒いフィールド。横ドラッグ、PCの左右矢印キーで青い宇宙船を操作し、0.5秒ごとに自動射撃します。
- 蛇は頭1個＋胴体3〜8個。左右端で反転し、直径2個分を経路に沿って下降。胴体は頭の通過経路を距離で追従します。出現直後の胴体は入口の外から続いて入場します。
- 胴体命中は尻尾を1個削除して10点。頭撃破は100＋残存胴体×20点。弾は進行方向で最初の対象だけに命中し、同時接触なら頭を優先します。
- 頭の下端が高さ65%の赤い点線に触れると終了。胴体・自機との接触判定はありません。
- 出現間隔は6/5/4/3/2秒、速度は初期値の1/1.125/1.25/1.375/1.5倍へ30秒ごとに上昇し、120秒以降固定。最大5匹、上限時の予定は1件だけ保留して空き次第補充します。
- PAUSE・タブ非表示・フォーカス喪失で停止し、RESUMEで再開。経過時間・移動・弾・出現・点滅演出・効果音を停止します。
- BESTは得点時に `my-arcade:snake-invaders:best` へ保存。ストレージ利用不可時はセッション内で保持します。
- SOUNDは初期OFF、START画面のみ切替可能。射撃・胴体命中・頭撃破の3効果音をWeb Audioで生成し、BGMはありません。設定は保存せずRETRYでOFFに戻します。
- `model.js` はルール・経路・衝突判定、`game.js` は描画・入力・画面・保存・音を担当します。

### 検証

リポジトリ直下で実行します。ブラウザーテストは親ディレクトリを `python -m http.server 8000` で配信してから実行します。

```sh
node --check games/snake-invaders/model.js
node --check games/snake-invaders/game.js
node --test tests/*.test.cjs
python tests/snake-invaders.browser.py
python tests/stack-tower.browser.py
python tests/block-breaker.browser.py
python tests/number-merge.browser.py
python tests/bubble-shooter.browser.py
git diff --check
```

13件のルールテストで左右反転・下降・経路追従、得点・尻尾削除、非貫通・命中順序、難易度境界、出現上限・保留、頭のみのライン判定、停止・再開、移動・射撃・RETRY、得点通知・登録・サブパスを検証します。

2026-10-21、Node.js 24とヘッドレスChromiumで既存4作品を含むルールテスト・ブラウザーテストを実施。新作はPC左右キー、Android相当のネイティブタッチ、320×568〜430×932の縦画面・PC・横画面での9:16表示、スクロール抑制、即時開始、PAUSE/RESUME、BEST保存・復元・例外時の継続、SOUND初期OFF/RETRY時リセット、HOMEのサブパス帰還、実アニメーションフレームと3種類のWeb Audio生成を確認しました。既存4作品の本体は変更せず、既存ブラウザーテストは登録筐体数の期待値だけを6へ更新しています。

実機Android/iOS、Safari・Firefox、GitHub Pages本番配信、実際のスピーカー出力・聴感は未確認です。

中央放置のバランス検証は `node tests/snake-invaders-idle.cjs` で再現できます。各シードの結果は [中央放置検証](./tests/snake-invaders-idle.md) を参照してください。


## LIGHTS OUT

`games/lights-out/index.html` が6作品目の入口です。5×5盤面のマスをタップ・クリックすると、そのマスと上下左右が反転します。一般的な消灯ルールとは異なり、**25マスすべてONでクリア**です。NORMAL固定、1問クリア型で、制限時間・手数制限・ヒントはありません。

- STARTで問題生成と計時開始。完成状態から重複しない6〜10マスを反転するため必ず解答可能で、初期クリア盤面は除外します。RETRYでは直前と異なる問題を生成します。乱数が固定されても無限再生成しないよう、再試行に上限と解答可能な代替配置を設けています。
- RESETは現在の初期盤面に戻し、MOVES・TIMEを0から即時計測します。
- PAUSEまたはページ非表示で時計を停止し、盤面を隠します。再表示だけでは再開せず、RESUMEが必要です。
- 全ONになった瞬間に時計と記録を確定し、約1秒のネオンウェーブ後にCLEARを表示します。演出中は盤面・RESET・PAUSE・サウンド設定を変更できません。CLEARには今回の手数・時間、それぞれのBESTとの比較、RETRY・HOMEを表示します。
- 電子音はWeb Audio APIで生成し、BGMや外部音声ファイルは使いません。SOUNDは初期ON、設定保存あり。ストレージや音声APIの例外はゲーム進行を妨げません。
- 保存キーは `my-arcade:lights-out:best-moves`、`my-arcade:lights-out:best-time`（ミリ秒）、`my-arcade:lights-out:sound`（`on` / `off`）。手数・時間は独立した最小値として保存します。不正・欠損レコードは未記録として扱い、保存不可時もページ内の記録を保持します。進行状況は保存せず、リロード時はSTARTに戻ります。
- 既存作と同じHTML・CSS・model.js・game.js・軽量SVG構成です。外部依存・ビルド不要で、共通トップページと既存5作品の本体には変更を加えていません。

### 検証

リポジトリ直下でルールテストを実行します。

```sh
node --test tests/*.test.cjs
```

ブラウザーテストは親ディレクトリを `python -m http.server 8000` で配信し、PlaywrightとChromiumを用意して実行します。これらは開発用で、ゲームの実行依存ではありません。`ARCADE_TEST_URL`・`CHROMIUM_PATH`で配信先とブラウザーを変更できます。

```sh
python tests/lights-out.browser.py
python tests/stack-tower.browser.py
python tests/block-breaker.browser.py
python tests/number-merge.browser.py
python tests/bubble-shooter.browser.py
python tests/snake-invaders.browser.py
```

新作のルールテストでは全25マスの反転範囲、1000問の解答可能性・選択数・重複なし、手数・時計、RESET、PAUSE/RESUME、演出中の操作禁止、異なるRETRY問題、保存値の検証を確認します。ブラウザーテストではPCクリック・Android相当タッチ、320×568〜430×932とPC幅、記録の独立更新・同値・再読込、音声ON/OFF、保存・音声APIの例外、手動/自動PAUSE、実時間の演出完了、一覧遷移・HOMEを確認します。既存ブラウザーテストの変更は登録筐体数の期待値（6→7）のみです。

実機Androidでの操作・音の聞こえ方、Safari/Firefox、GitHub Pages本番での配信は未確認です。

2026-10-21にNode.jsの全62ケース（新作9ケースを含む）、全6作品のPlaywrightテスト、JavaScript構文・差分チェックが最終実行で成功しました。SNAKE INVADERSの中央放置20シードも全てGAME OVERを確認しました。既存SNAKE INVADERSブラウザーテストの帰還後BEST確認が初回に1度失敗しましたが、変更前mainと本ブランチの再実行は成功し、原因は特定できていません。ゲーム本体や検証条件は変更していません。

## ALIEN INVADERS

第7作。`games/alien-invaders/index.html` またはトップの筐体から起動します。既存の中央フォーカス型カルーセルと6作品の本体は変更していません。HTML/CSS/JavaScriptとローカルSVGのみで、外部ライブラリ・ビルドは不要です。

- 5列×4行の1ウェーブ。上10体は装甲付きHP2（紫）、1発目で破損形状（橙）になり、下10体はHP1（緑）。全滅でCLEAR。ライフ0・防衛ライン到達・自機接触でGAME OVER。
- 論理座標360×480（3:4固定）のCanvasと独立操作パネル。Androidは左右デジタルスティック＋赤い射撃ボタンを同時操作。PCは←/→とSpace。射撃は押下直後と長押し0.35秒間隔、最大3発、自動射撃なし。スティック中央18%を停止範囲とし、離すと中央へ戻ります。
- 編隊は初期5列の幅220を敵の減少後も維持し、左右8pxの余白で反転・22px下降。各列の最下段生存敵からランダムに1体が真下へ射撃します。初回を含め1〜2秒のランダム間隔、敵弾数の上限なし。
- タイマーはPLAYING中の単調増加時計の差分だけを加算し、PAUSE/RESUME時に基準時刻を更新。HUDは実測時間のみ。最終記録は実測時間＋被弾回数×3秒、100分の1秒の整数で比較。同じ更新フレームの全滅を被弾・敗北より優先し、以前の被弾だけを保持します。
- BESTはCLEAR時のみ `my-arcade:alien-invaders:best` に100分の1秒単位の整数1件を保存。同値は更新せず、新記録時だけNEW BEST!を表示。RETRY/RESTART/GAME OVERは保存値を変更しません。ストレージが使用できない場合はページ内で保持します。
- PAUSE→RESUME/RESTART/HOME、終了→RETRY/HOME。RESTARTは確認なしで初期化・即開始。タブ非表示・blur・pagehide・タッチ端末横画面で自動PAUSEし、復帰後は手動RESUMEが必要です。PAUSE・終了・入力キャンセルでは入力と押下表示を解除します。
- Web Audioで短い射撃・撃破・被弾・CLEAR音を生成（BGMなし）。SOUND初期ON、`my-arcade:alien-invaders:sound` にon/offを保存。ユーザー操作でAudioContextを開始・再開し、音声APIの例外でもプレイを続けます。

### 初期バランス

すべて `games/alien-invaders/model.js` の `C` に集約。速度は論理px/秒、時間は秒です。

| 項目 | 値 | 設定理由 |
| --- | --- | --- |
| 自機速度 | 210 | 移動可能幅330を約1.57秒で横断。精密操作と回避を両立 |
| 自機弾速 | 360 | 初期下段まで約0.78秒、上段まで約1.1秒。予測射撃の余地を確保 |
| 敵弾速 | 145 | 初期最下段から自機まで約1.9秒。見てから回避できる初期値 |
| 編隊初速 | 14 | 序盤の横移動を緩やかにし、狙う時間を確保 |
| 撃破1体ごとの加速 | ＋1.5 | 生存数減少による狙いやすさを移動速度で補う |
| 編隊最高速度 | 42 | 後半でも自機が追える範囲に制限 |
| 下降幅 | 22 | 敵の高さ1体分 |
| 敵射撃間隔 | 1〜2 | 確定仕様、発射ごとに再抽選、初回の猶予追加なし |
| 自機連射間隔／最大弾数 | 0.35／3 | 確定仕様、攻撃位置と発射タイミングに意味を持たせる |
| 被弾無敵／ペナルティ | 1／＋3 | 確定仕様、連続被弾を防止 |
| 自機被弾矩形 | 22×15 | 見た目30×21より小さく設定 |

40〜60秒は実機で調整する目標です。標準プレイの到達時間を自動テストで保証していません。

### 検証

親ディレクトリを `python -m http.server 8000` で配信し、開発用のNode.js、Python Playwright、Chromiumで実行します。サイトの依存追加はありません。

```sh
node --check games/alien-invaders/model.js
node --check games/alien-invaders/game.js
node --test --test-isolation=none tests/*.test.cjs
python tests/alien-invaders.browser.py
python tests/arcade.browser.py
python tests/stack-tower.browser.py
python tests/block-breaker.browser.py
python tests/number-merge.browser.py
python tests/bubble-shooter.browser.py
python tests/snake-invaders.browser.py
python tests/lights-out.browser.py
git diff --check
```

新作14件のルールテストは初期配置・装甲・連射と3発制限・独立直進・固定仮想矩形・加速上限・射撃候補とランダム間隔・敵弾無制限・被弾と無敵・終了優先順位・時計停止・入力解除・記録単位を検証します。ブラウザーテストはPCキー、ネイティブの同時タッチ、中央停止・指離し・キャンセル、PAUSE/RESUME/RESTART、自動PAUSEと復帰、横画面切替、CLEAR/GAME OVERの表示、BEST更新・同値・保存例外・再読込、サウンド設定・音声例外、320×568〜430×932・PCの配置、実フレームと音声生成、一覧起動とサブパスHOMEを確認します。既存テストの変更は7作品への登録対応に限定しています。

実機Androidでのマルチタッチ感触、アプリ切替・スリープ・画面回転、アドレスバー伸縮、音量・連射音の聴感、40〜60秒を目安とした難易度調整は別途確認が必要です。Safari/Firefox、GitHub Pages本番配信も未確認です。

2026-10-22、Node.js 24とヘッドレスChromiumで全76件のルールテスト（新作14件）、新作・カルーセル・既存6作品の全ブラウザーテスト、JavaScript構文・差分チェックが成功。390px縦画面・320pxのCLEAR画面・PC実フレームのスクリーンショットを確認しました。実機Androidは未確認です。


## FLASHLIGHT MAZE

第8作。`games/flashlight-maze/index.html` またはトップの8番目の筐体から起動します。既存7作品の本体・共通UI・カルーセル実装は変更していません。HTML/CSS/JavaScriptとローカルSVGのみで、外部依存・ビルド工程はありません。

- START/RESTART/RETRYで新しい13×13迷路を生成。左上(1,1)から右下(11,11)へ、必ず到達できる通路を深さ優先探索で掘ります。最短32歩以上を採用し、24回で条件を満たさなければ到達可能な蛇行迷路へ切り替えます。直前と同じ迷路も避け、固定乱数でも生成が終了します。
- MEMORY中は20秒間、全体・S・Gを表示し移動禁止。自動暗転後にESCAPE TIMEを開始します。中心から半径3マスの円でクリップし、光は壁を通過します。円外は完全な黒で、探索履歴は残りません。Gは中心が照射範囲に入ったときだけ描画します。時間制限・ライフ・GAME OVER・全体再確認はありません。
- 下部の方向ボタンを1回押すと1マス移動。280ms長押し後に130ms間隔で連続移動。PCは矢印・WASD。離す・キャンセル・ボタン外移動・PAUSE・終了・再開始で入力を解除します。
- PAUSEは迷路を完全に隠し、両時計・移動を停止。タブ非表示・blur・pagehide・画面方向変更で自動PAUSEし、手動RESUMEで再開します。描画フレームが2秒以上途切れた場合も最後のフレーム時刻でPAUSEし、スリープからの時間加算を防ぎます。
- CLEARで迷路全体を表示し、迷路の下にTIME/BEST・RETRY・HOMEを表示。記録は記憶20秒とPAUSEを除いた脱出時間で、最速のみ `my-arcade:flashlight-maze:best` にミリ秒で保存。ストレージ利用不可時はページ内で保持します。HOMEはサブパス配信対応の `../../index.html`。
- Web Audioによる短い移動音とCLEAR音のみ。SOUND設定は `my-arcade:flashlight-maze:sound`。音声APIの不在・例外でも継続できます。調整値は `model.js` の `C` に集約しています。

検証コマンド（Python PlaywrightとChromiumは開発時のみ使用）：

```sh
node --check games/flashlight-maze/model.js
node --check games/flashlight-maze/game.js
node --test --test-isolation=none tests/*.test.cjs
python tests/flashlight-maze.browser.py
python tests/arcade.browser.py
# 既存7作品も tests/<game>.browser.py を実行
```

ルールテスト12件はランダム1000迷路の到達性・全通路の接続・境界・経路長、固定乱数の生成上限、時計と状態遷移、1マス移動・壁・連続入力、照射判定、PAUSE/RESUME/RESTART/CLEAR、BEST値と登録を検証します。新作ブラウザーテストはPC/Android相当の一連の操作、ネイティブタッチ・長押し・キャンセル・ボタン外移動、Canvasの黒画素・壁越し照射、記憶中と脱出中の停止、非表示・blur・pagehide・回転・スリープ相当、記録保存と再読み込み、RETRY/HOME、320×568〜430×932・PC・横画面の配置、ストレージ/音声例外6条件、実時間20秒と実Web Audioを確認します。既存テストの変更は8作品登録に伴う件数・循環位置の更新のみです。

Android実機では、長押し速度・指を離す/外す操作、アプリ切替・スリープ・回転、アドレスバーとナビゲーション領域の伸縮、光の視認性・効果音を確認してください。実機Android、Safari/Firefox、GitHub Pages本番配信は別途確認が必要です。

2026-10-24、Node.js 24でルールテスト全88件（新作12件）が成功、失敗0件。ヘッドレスChromiumで新作・カルーセル・既存7作品のブラウザーテスト全9本が成功、失敗0本。新作内のPC/Android相当・例外6条件・実時間の9シナリオも成功し、JavaScript構文・差分チェック、脱出/CLEAR画像を確認しました。実機Androidは未確認です。
