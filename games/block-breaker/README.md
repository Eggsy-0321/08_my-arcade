# BLOCK BREAKER

HTML/CSS/JavaScriptのみで動く1ステージ制タイムアタック。
`model.js`に状態遷移・単調時計・固定400×580座標の物理処理、`game.js`に入力・描画・音声・保存処理を置いています。表示サイズやDPRは物理座標に影響しません。

- 最大50msのデルタタイムを、移動距離2px以下のサブステップに分割。
- 非表示・ウィンドウblurで自動停止。再開は明示操作。
- BEST・MUTE保存に失敗してもプレイ可能。

リポジトリルートでの検証:

```sh
node tests/block-breaker.test.cjs
node tests/stack-tower.test.cjs
```

任意のブラウザ検証（Python PlaywrightとChromiumが必要、ゲーム自体には不要）:

```sh
# リポジトリの親ディレクトリを配信し、Pages相当のサブパスを検証
python -m http.server 8000 --directory ..
# 別ターミナル、リポジトリルートで
python tests/block-breaker.browser.py
```

既定URLは `http://127.0.0.1:8000/08_my-arcade/`。
`ARCADE_TEST_URL`と`CHROMIUM_PATH`で変更できます。
ブラウザテストは時計を制御し、本番モデルの呼び出しを観測して終了状態を再現します。実機の音声出力やタッチ感の評価は別途必要です。
