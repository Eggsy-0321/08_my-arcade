# 08_my-arcade
HTML/CSS/JavaScriptで制作する、ドット絵風のWebゲームセンター。さまざまなミニゲームを追加して遊べるゲームポータルです。

## MVP

HTML / CSS / Vanilla JavaScriptのみで動作する静的サイトです。外部依存・ビルドは不要です。筐体をクリック・タップ、またはTabで選択してEnterで開きます。初期登録の「SAMPLE GAME」は起動確認ページで、ゲーム本体は含みません。

```text
index.html                 トップページ
css/arcade.css             店内・筐体・共通スタイル
js/arcade.js               JSON読み込みと筐体生成
data/games.json            ゲーム一覧（配列）
assets/pixel-scene.svg     サムネイル未指定・読み込み失敗時の代替画像
games/sample/index.html   起動確認ページ
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

- トップにSAMPLE GAMEの筐体が1件表示され、クリック・タップ・Tab/Enterで起動確認ページへ移動できること。
- 起動確認ページの戻るリンクで一覧へ戻れること。
- PC幅とスマホ幅で横方向にはみ出さず、フォーカス枠が見えること。
- JSONに公開項目を追加すると筐体が増え、`draft`は表示されないこと。
- `thumbnail`が空または存在しない画像でも代替画像が表示されること。
- JSONの取得失敗や構文エラー時に読み込み失敗のメッセージが表示されること。
- 親フォルダをHTTP配信して`/08_my-arcade/`から開いても、筐体・起動・戻る操作が動作すること。
