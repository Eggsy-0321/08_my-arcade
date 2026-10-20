# 08_my-arcade
HTML/CSS/JavaScriptで制作する、ドット絵風のWebゲームセンター。さまざまなミニゲームを追加して遊べるゲームポータルです。

## MVP

HTML / CSS / Vanilla JavaScriptのみで動作する静的サイトです。外部依存・ビルドは不要です。筐体をクリック・タップ、またはTabで選択してEnterで開きます。「STACK TOWER」がプレイできます。「SAMPLE GAME」は起動確認ページです。

```text
index.html                 トップページ
css/arcade.css             店内・筐体・共通スタイル
js/arcade.js               JSON読み込みと筐体生成
data/games.json            ゲーム一覧（配列）
assets/pixel-scene.svg     サムネイル未指定・読み込み失敗時の代替画像
games/sample/index.html   起動確認ページ
games/stack-tower/        STACK TOWER（HTML・CSS・ルール・描画/操作・SVG）
tests/                   STACK TOWERのルールテスト・任意のブラウザーテスト
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

3. 必要ならローカルのサムネイル画像を配置します（例：`assets/my-game.png`）。推奨比率は240:164です。表示枠に合わせてトリミングされます。
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

## GitHub Pages

このファイル構成のまま、GitHubリポジトリのSettings → Pagesから配信対象ブランチと`/ (root)`を選択して公開できます。ビルド処理は不要です。CSS・JS・JSON・ゲームへのリンクはすべて相対パスなので、`https://Eggsy-0321.github.io/08_my-arcade/` のようなサブパスでも動作します。

## 動作確認

- トップにSAMPLE GAMEとSTACK TOWERの筐体が2件表示され、クリック・タップ・Tab/Enterでそれぞれ移動できること。
- 起動確認ページの戻るリンクで一覧へ戻れること。
- PC幅とスマホ幅で横方向にはみ出さず、フォーカス枠が見えること。
- JSONに公開項目を追加すると筐体が増え、`draft`は表示されないこと。
- `thumbnail`が空または存在しない画像でも代替画像が表示されること。
- JSONの取得失敗や構文エラー時に読み込み失敗のメッセージが表示されること。
- 親フォルダをHTTP配信して`/08_my-arcade/`から開いても、筐体・起動・戻る操作が動作すること。


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
- 一覧2件とゲームカード遷移、START、タップ設置、二重入力防止、Space、通常/ベストスコア、PERFECT境界と部分重なり：成功。
- 60段までの積み上げとカメラ描画、320×568・390×844・430×932・844×390のリサイズ、DPR 3のCanvas寸法と横方向のはみ出し：成功。
- GAME OVER、最終スコア、RETRY、再読み込み後の保存値、トップへの帰還と既存SAMPLE GAMEの起動：成功。
- localStorageの取得/保存をそれぞれ例外にした場合の継続、PCのマウス設置とSpaceでのSTART：成功。
- 通常のrequestAnimationFrameによる開始/移動表示もChromiumで確認。高い塔とGAME OVERのスクリーンショットを確認。

実機スマートフォン、iOS Safari、Firefox、GitHub Pages本番配信は未確認です。長時間のメモリ計測は未実施です。横画面など高さが小さい画面では操作領域の最小高さを確保するため、縦スクロールする場合があります。縦画面でのプレイを推奨します。

### GitHub Pagesでの確認

1. 作業ブランチの差分をレビューして配信対象ブランチへマージします。
2. Settings → Pagesでそのブランチと `/ (root)` を選び、配信完了を待ちます。既に設定済みなら変更不要です。
3. `https://Eggsy-0321.github.io/08_my-arcade/` を開き、STACK TOWERの筐体から起動します。
4. START → 設置 → GAME OVER → RETRYと、再読み込み後のBEST、MY ARCADEへの戻りを確認します。
5. 直接URL `https://Eggsy-0321.github.io/08_my-arcade/games/stack-tower/` でも起動できます。
