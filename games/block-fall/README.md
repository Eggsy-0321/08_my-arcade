# BLOCK FALL v1.0

MY ARCADE 第10作。HTML/CSS/Vanilla JavaScriptの静的ゲーム。外部依存・ビルド工程なし。独自Canvas描画・SVGサムネイル・Web Audio合成音のみを使用します。

## ルールと数値

- 10列×20行、I/O/T/L/J/S/Zの7種類、Fisher–Yatesでシャッフルする7-bag。NEXTは次の1個。HOLD、CLEAR、時間制限はありません。
- 時計回り90°のみ。JLSTZ・I別のSRS回転補正（最大5候補）、Oは位置不変。着地点を枠で表示します。
- 横一列を埋めて消去、上の行を下降。1/2/3/4ライン同時消去で100/300/500/800×消去前LEVEL点。ソフトは1マス1点、ハードは1マス2点。コンボ・回転ボーナスなし。
- LEVEL = 1 + floor(LINES / 10)。通常落下間隔は `max(0.08, 0.8 × 0.85^(LEVEL−1))` 秒。初期800ms、1レベルごと15%短縮、最短80ms。
- ソフトドロップは押下時に1マス、その後35ms間隔。ハードは即座に最下段へ移動・固定します。
- 着地猶予500ms。接地中の有効な移動・回転による猶予リセットは1個につき15回まで。移動失敗ではリセットしません。
- 左右は押下時1マス、170ms長押し後に50ms間隔で反復。同時左右は最後に押した方向を優先し、その指を離すと残る方向へ戻ります。
- 出現位置が塞がれている、または盤面上端より上で固定するとGAME OVER。

## 操作・状態

Android向け下部5ボタン：LEFT / RIGHT / ROTATE / SOFT / HARD。Pointer Events、pointer capture、個別pointerIdでマルチタッチを処理。指を離す・キャンセル・ボタン外への移動・capture喪失で入力解除します。

PC：←/→移動、↑時計回り回転、↓長押しソフト、Spaceハード、Esc停止/再開。ゲーム中・カウントダウン・停止中は矢印とSpaceのスクロールを抑止。OSのキーリピートでは回転・ハードを反復しません。

START → COUNTDOWN → PLAYING → PAUSED / GAME OVER。START・RETRY・RESUMEは3→2→1、各1秒。カウント中とPAUSE中は落下・固定・得点・操作を停止します。

タブ非表示・blur・pagehide・画面回転・縦横切替・1秒超の描画中断で自動PAUSEし、すべての入力を解除。復帰後は手動RESUMEと新たな3秒カウントダウンが必要です。短いブラウザーUIの伸縮では縦横が変わらない限りPAUSEしません。

GAME OVERでSCORE/BEST/LINES、RETRY、HOMEを表示。HOMEは `../../index.html`、GitHub Pagesのサブパスに対応します。

## 保存・音声

- `my-arcade:block-fall:best`：最高スコア（得点更新時に保存）。
- `my-arcade:block-fall:sound`：`on` / `off`。初期ON。
- 既存キーの列挙・削除・書換えは行いません。保存不可時はページ内で保持します。
- 移動・回転・固定・ライン消去・GAME OVERを軽量な合成音で通知。初回ユーザー操作でAudioContextを初期化し、API不在・例外・resume失敗時もゲームを継続します。OFF/PAUSEで発音中の音を停止します。

## 構成・再現テスト

- `model.js`：盤面・7-bag・SRS・スコア・レベル・時間・状態・入力反復・保存。DOM/Canvas非依存。`seeded(seed)` または任意の乱数関数をGame/Bagへ注入できます。
- `game.js`：入力イベント、画面同期、Canvas描画、ライフサイクル、Web Audio。通常プレイはMath.random、ブラウザーテストのみ固定シード20261029を注入。
- `style.css` / `index.html` / `thumbnail.svg`：レスポンシブ画面と独自素材。

リポジトリ直下から実行（Node/Python/Playwright/Chromiumは開発時のみ必要）：

```sh
node --check games/block-fall/model.js
node --check games/block-fall/game.js
node --test --test-isolation=none tests/*.test.cjs
# 別ターミナル：リポジトリの親を配信
python -m http.server 8000 --directory ..
python tests/block-fall.browser.py
python tests/arcade.browser.py
# tests/<既存9作品>.browser.py も実行
# リポジトリ直下配信なら ARCADE_TEST_URL=http://127.0.0.1:8000/
git diff --check
```

本作のNodeテスト26件：7形状/時計回り、固定シード1000個の7-bag、移動/衝突、左右壁/床/I専用回転補正、回転不可、ソフト/ハード/落下速度切替時の時間持越し防止、1〜4ライン消去/下降/得点、加速上限、着地猶予/15回上限、生成/NEXT/HOLDなし、GAME OVER、停止/3秒、RETRY、入力反復/複数入力、BEST/SOUND/例外、100シードの盤面不変条件、10作登録/ローカル参照を検証。

Chromiumでは本作9シナリオ（PC、Android相当ネイティブタッチ、保存/音声例外6条件、実フレーム/実Web Audio）を検証。PCキー・長押し・複数タッチ・片指解除・キャンセル・ボタン外移動・スクロール抑止、3秒/停止/復帰/描画中断、NEXT描画、4ライン消去、GAME OVER/RETRY/HOME、保存再読込、既存保存キー維持、320×568 / 360×640 / 390×844 / 430×932 / 1100×844 / 844×390の配置と盤面比率を確認します。

## 未確認・Android実機での確認項目

エミュレーションはAndroid実機の成功を意味しません。実機で以下を確認してください。

- 5ボタンの短押し・長押し速度、移動＋ソフト/回転の同時押し、片指解除、指を外す/キャンセル時の入力残り。
- 高LEVELの視認性と難易度、500msの着地猶予、回転補正の操作感。
- アプリ切替・実際の画面スリープ・縦横回転後の自動PAUSE、復帰後に自動再開しないこと、RESUMEの3秒。
- ブラウザーのアドレスバー/ナビゲーション/セーフエリアが変化した場合の収まり。
- 実際の効果音・音量・ON/OFF・保存、再読込、RETRY/HOME。

Safari/Firefox、GitHub Pages本番配信も未確認です。音声はAPI呼出しまでを自動検証し、聴感は未確認です。

## v1.0 検証記録（2026-10-30 JST）

- Nodeルールテスト：126件成功 / 失敗0件（本作26件、既存100件）。
- Chromiumブラウザーテスト：11本成功 / 失敗0本（本作1本内の9シナリオ、既存9作品、カルーセル）。
- PC・Android相当の操作、実フレーム/実Web Audio、画面キャプチャ、JavaScript構文と差分チェックを実施。
- Git差分とJSON比較で既存9作品の全ディレクトリ、トップHTML/CSS/JS/assets、既存9件の登録内容が変更されていないことを確認。
- 初期検証で見つかったソフト落下の小数時間境界による重複落下と、速度切替時の時間持越しを修正し、再検証は全件成功。
- Android実機、聴感、Safari/Firefox、GitHub Pages本番は未確認。
