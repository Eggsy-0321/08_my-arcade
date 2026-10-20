# NUMBER MERGE

4×4の数字合体パズル。STARTを押した瞬間から2048完成までの時間を競います。
PCは矢印キー、スマートフォンは盤面上のスワイプで操作します。

- `index.html` / `style.css`: 既存筐体と同じ配色・幅・書体。開始、プレイ、終了画面。
- `model.js`: 四方向の圧縮と合体、生成、終了判定、時計、時間表記。
- `game.js`: キーとPointer Events、タイルアニメーション、画面と記録の更新。
- `thumbnail.svg`: トップの筐体用画像。`data/games.json`から登録。

外部依存・ビルド不要。HTTPサーバーでリポジトリを配信してください。
同じタイルの合体は1操作につき1回。初期2枚と有効操作後の追加タイルは2が90%、4が10%。無効操作では生成しません。2048完成時は即終了し、新しいタイルは生成しません。

時計は`performance.now()`の差分で計測し、表示を100分の1秒で切り捨てます。制限時間と一時停止はありません。非表示タブでも経過時間を含みます。クリアとゲームオーバーで停止し、RETRYは新しい盤面を作成して0から再計測します。

ベストの保存キーは`my-arcade:number-merge:best`（ミリ秒）。クリア時にだけ最短時間を更新します。保存できないブラウザーでも、そのページ内のベストを保持して続行できます。

## 検証

リポジトリ直下で実行：

```sh
node --check games/number-merge/model.js
node --check games/number-merge/game.js
node tests/number-merge.test.cjs
node tests/stack-tower.test.cjs
node tests/block-breaker.test.cjs
git diff --check
```

任意のブラウザーテストには開発環境のPython PlaywrightとChromiumを使用します。ゲームの依存には含みません。親ディレクトリを`python -m http.server 8000`で配信してから：

```sh
python tests/number-merge.browser.py
python tests/stack-tower.browser.py
python tests/block-breaker.browser.py
```

既定URLは`http://127.0.0.1:8000/08_my-arcade/`。`ARCADE_TEST_URL`と`CHROMIUM_PATH`で変更可能です。時間と盤面の制御はテスト側だけで行い、製品コードにテストAPIは設けません。

### 実施結果（2026-10-20）

- JavaScript構文、差分空白チェック：成功。
- NUMBER MERGEのルールテスト8件：成功。四方向、合体順、二重合体防止、無効操作、生成確率の境界、即クリア、生成後の手詰まり、時計とリセット、時間表記を確認。ランダム盤面1000件×4方向でも総和と入力不変を確認。
- 既存ルールテスト：STACK TOWER 7件、BLOCK BREAKER 12件が成功。両作品のChromiumブラウザー回帰テストも成功。
- Chromium：PCキーとモバイル相当のCDPタッチで四方向の操作を確認。開始前・開始後・終了後の計測、速い/遅い再クリア、再読み込み時のベスト復元、失敗時の記録維持、RETRY、HOME、終了画面ボタンの表示範囲を確認。
- 320×568、390×844、430×932、844×390、1100×844で横方向のはみ出しなし。縦画面で盤面が画面内に収まること、スワイプ中にスクロールしないこと、アニメーションの終了と動きを減らす設定、実時間のタイマー動作、localStorageの取得/保存例外でも継続できることを確認。開始・プレイ・クリア画面の画像も確認。

既存ゲーム本体、トップのHTML/CSS/JSには変更を加えていません。既存ブラウザーテストの筐体数を4件へ更新し、BLOCK BREAKERのテストではリロード後の観測参照と0msのフレーム待ちを修正しています。CDPタッチでのドラッグ検証とボタンのクリック検証は分けています。

実機スマートフォン、iOS Safari、Firefox、GitHub Pages本番配信は未確認です。横画面ではページを縦スクロールする場合があります。
