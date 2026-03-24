実行場所
C:\Users\some3\Documents\GitHub\senate-quiz-pwa\web

1. アプリに反映
node scripts/applyYomiuriMergedToRepresentatives.mjs

内容
- public/data/representatives.yomiuri.merged.json を
  public/data/representatives.json に反映
- 反映前の representatives.json は
  public/data/representatives.backup.before-yomiuri.json に保存

2. 残り15件の検索用リスト作成
node scripts/exportRemainingSearchList.mjs

出力
- web\remaining_no_match_search_list.json
- web\remaining_no_match_search_queries.txt

注意
- アプリ反映後は開発サーバーを開き直すか、再読み込みして確認
- GitHub Pages 反映まで行うなら、コミットして push が必要
