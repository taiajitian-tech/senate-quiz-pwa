// PATCH: learning improvements
// 追加点：回答時間・自己評価・再出題制御

// 1. 回答時間取得
const startTime = useRef(Date.now());

// 回答時
const elapsed = Date.now() - startTime.current;

// 2. 判定強化
let grade = "again";
if (isCorrect) {
  if (elapsed < 2000) grade = "strong";
  else if (elapsed < 5000) grade = "good";
  else grade = "hard";
}

// 3. スケジューリング
if (grade === "again") requeueSoon(id);
if (grade === "hard") requeueLater(id);
if (grade === "strong") markLearned(id);

// 4. セット終了時復習
if (isEndOfSet) reviewMistakes();
