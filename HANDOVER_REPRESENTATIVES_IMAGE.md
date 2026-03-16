# 引継ぎ要件（衆議院議員画像取得）

## 目的
- 衆議院議員の顔画像取得を、**未取得議員のみ**に限定して進める。
- 毎回全員を総当たりしない。
- 既存の正しい画像は触らない。
- 誤画像を再探索したい場合だけ、`representatives-image-fix-targets.json` に入れた議員を対象にする。

## 現在の方針
通常運用は以下です。
- `REP_IMAGE_TARGET_MODE=missing`
- `REP_IMAGE_BATCH_LIMIT=25`

意味
- 画像未設定の議員だけを探索する。
- 1回の実行で最大25人だけ処理する。

## モード
### missing
- `image` が空の議員のみ探索する。
- これが標準。

### fix
- `web/public/data/representatives-image-fix-targets.json` に入っている議員だけ再探索する。
- 誤画像の差し替え専用。

### review
- `aiGuess=true` の議員だけ再探索する。
- 推定画像の見直し用。

### all
- 全員対象。
- 重いので通常運用では使わない。

## 画像取得順
1. 手動固定ページ `web/scripts/representativeImageSourcePages.json`
2. 公式プロフィールページ
3. Wikipedia
4. Wikidata / Wikimedia Commons
5. 政党公式
6. trusted fallback
7. 一般検索

## 重要ルール
- **未取得議員のみ総当たり**する。
- 既存画像あり議員は通常 run では触らない。
- 誤画像を直すときだけ `fix` モードを使う。
- GitHub Actions の手動実行は、ユーザーの明示指示がある場合のみ案内する。

## 関連ファイル
- `web/scripts/autoImageFetch.mjs`
- `.github/workflows/update-representatives.yml`
- `web/public/data/representatives-image-fix-targets.json`
- `web/scripts/representativeImageSourcePages.json`


## 今回のUI修正
- 学習画面の出題画像を拡大した。
- 自動再生の画像を拡大した。
- 旧四択画面の下部ボタンを縦並びに戻した。
- 一覧にふりがな表示を追加した。
- 一覧の顔画像サイズを拡大した。

## ユーザー側で手動実行する操作
画面: GitHub → Actions
1. update-representatives
2. Run workflow
3. Branch: main を確認
4. Run workflow

理由
- missing 議員の画像探索
- fix-target に入れた議員の再探索
- representatives.json / 各レポート更新
