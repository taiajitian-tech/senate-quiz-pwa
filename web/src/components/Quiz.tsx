import { useEffect, useMemo, useState } from "react";

type Senator = {
  id: number;
  name: string;
  group?: string;
  images: string[];
};

type Mode = "normal" | "review";

const WRONG_IDS_KEY = "senateQuizWrongIds.v1";

const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pickN = <T,>(arr: T[], n: number) => shuffle(arr).slice(0, n);

const loadWrongIds = (): number[] => {
  try {
    const raw = localStorage.getItem(WRONG_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => Number.isFinite(x)).map((x) => Number(x));
  } catch {
    return [];
  }
};

const saveWrongIds = (ids: number[]) => {
  try {
    localStorage.setItem(WRONG_IDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
};

export default function Quiz() {
  const [senators, setSenators] = useState<Senator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("normal");

  // normal: 20問の出題順（senator.id配列）と現在位置
  const [normalOrder, setNormalOrder] = useState<number[]>([]);
  const [normalPos, setNormalPos] = useState(0);

  // review: 間違いリスト（idのSet）と現在の出題id
  const [reviewWrongSet, setReviewWrongSet] = useState<Set<number>>(new Set());
  const [reviewCurrentId, setReviewCurrentId] = useState<number | null>(null);

  const [imgError, setImgError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // GitHub Pages 配下対応（BASE_URL）
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}data/senators.json`;

  // 初期ロード
  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        const arr = Array.isArray(json) ? (json as Senator[]) : [];
        setSenators(arr);

        // 永続の間違いリストを復元
        const wrongIds = loadWrongIds();
        setReviewWrongSet(new Set(wrongIds));

        // normal 20問を生成
        const ids = shuffle(arr.map((s) => s.id)).slice(0, Math.min(20, arr.length));
        setNormalOrder(ids);
        setNormalPos(0);

        // reviewの現在問題は未設定（必要時にセット）
        setReviewCurrentId(null);

        setSelectedId(null);
        setImgError(false);
        setMode("normal");
      } catch (e) {
        console.error(e);
        setSenators([]);
        setLoadError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const senatorsById = useMemo(() => {
    const m = new Map<number, Senator>();
    for (const s of senators) m.set(s.id, s);
    return m;
  }, [senators]);

  // 現在問題（modeによって決定）
  const current: Senator | null = useMemo(() => {
    if (senators.length === 0) return null;

    if (mode === "normal") {
      const id = normalOrder[normalPos];
      return id ? senatorsById.get(id) ?? null : null;
    }

    // review
    if (reviewCurrentId == null) return null;
    return senatorsById.get(reviewCurrentId) ?? null;
  }, [mode, normalOrder, normalPos, reviewCurrentId, senatorsById, senators.length]);

  // 選択肢（最大4択）
  const choices = useMemo(() => {
    if (!current || senators.length === 0) return [];

    // データが4件未満でもUIが空にならないように、存在する分だけ表示する
    const uniqueIds = Array.from(new Set(senators.map((s) => s.id)));

    // currentが含まれないケースも吸収
    if (!uniqueIds.includes(current.id)) uniqueIds.unshift(current.id);

    // 4件未満なら存在分だけ
    if (uniqueIds.length <= 4) {
      return shuffle(uniqueIds).slice(0, uniqueIds.length);
    }

    const others = senators.filter((s) => s.id !== current.id);
    const wrongIds = shuffle(others).slice(0, 3).map((s) => s.id);

    return shuffle([current.id, ...wrongIds]);
  }, [current, senators]);

  const imgUrl = current?.images?.[0] ?? "";
  const isAnswered = selectedId != null;
  const isCorrect = isAnswered && current ? selectedId === current.id : false;

  // normalの進捗
  const normalTotal = Math.min(20, senators.length);
  const isNormalFinished =
    mode === "normal" && normalOrder.length > 0 && normalPos >= normalOrder.length;

  // reviewの進捗
  const reviewRemaining = mode === "review" ? reviewWrongSet.size : 0;
  const isReviewFinished = mode === "review" && reviewWrongSet.size === 0;

  const ensureReviewCurrent = (setTo: Set<number>) => {
    if (setTo.size === 0) {
      setReviewCurrentId(null);
      return;
    }
    // いまのcurrentが残っていれば維持、無ければランダムに選ぶ
    if (reviewCurrentId != null && setTo.has(reviewCurrentId)) return;
    const ids = Array.from(setTo.values());
    const pick = ids[Math.floor(Math.random() * ids.length)];
    setReviewCurrentId(pick);
  };

  const startNormal20 = () => {
    const ids = shuffle(senators.map((s) => s.id)).slice(0, Math.min(20, senators.length));
    setMode("normal");
    setNormalOrder(ids);
    setNormalPos(0);
    setSelectedId(null);
    setImgError(false);
  };

  const startReview = () => {
    const setTo = new Set(loadWrongIds());
    setReviewWrongSet(setTo);
    setMode("review");
    setSelectedId(null);
    setImgError(false);
    setTimeout(() => ensureReviewCurrent(setTo), 0);
  };

  const resetAll = () => {
    saveWrongIds([]);
    setReviewWrongSet(new Set());
    setReviewCurrentId(null);
    startNormal20();
  };

  const onSelect = (id: number) => {
    if (selectedId != null) return;
    setSelectedId(id);
  };

  const onNext = () => {
    if (!isAnswered) return;

    // 間違い記録（normal/review共通）
    if (current) {
      const wrongNow = selectedId !== current.id;
      if (wrongNow) {
        const nextIds = new Set<number>(loadWrongIds());
        nextIds.add(current.id);
        const arr = Array.from(nextIds.values()).sort((a, b) => a - b);
        saveWrongIds(arr);
        setReviewWrongSet(new Set(arr));
      } else if (mode === "review") {
        // reviewで正解したら、そのIDを間違いリストから外す
        const nextIds = new Set<number>(loadWrongIds());
        nextIds.delete(current.id);
        const arr = Array.from(nextIds.values()).sort((a, b) => a - b);
        saveWrongIds(arr);
        const nextSet = new Set(arr);
        setReviewWrongSet(nextSet);
        // 次の問題を決定
        setSelectedId(null);
        setImgError(false);
        setTimeout(() => ensureReviewCurrent(nextSet), 0);
        return;
      }
    }

    if (mode === "normal") {
      const nextPos = normalPos + 1;
      setSelectedId(null);
      setImgError(false);
      setNormalPos(nextPos);
      return;
    }

    // reviewで不正解の場合：同じ集合から別の問題へ（正解するまで繰り返し）
    if (mode === "review") {
      setSelectedId(null);
      setImgError(false);
      const setTo = new Set(loadWrongIds());
      setReviewWrongSet(setTo);
      // 「違う問題」を優先
      const ids = Array.from(setTo.values()).filter((id) => id !== current?.id);
      const pickFrom = ids.length > 0 ? ids : Array.from(setTo.values());
      if (pickFrom.length === 0) {
        setReviewCurrentId(null);
      } else {
        const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        setReviewCurrentId(pick);
      }
      return;
    }
  };

  if (loading) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>読み込み中</div>
          <div style={styles.sub}>senators.json を確認</div>
        </div>
      </div>
    );
  }

  if (loadError || senators.length === 0) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>データを読み込めませんでした</div>
          <div style={styles.sub}>{loadError ? loadError : "senators.json が 0 件です"}</div>
          <div style={{ ...styles.sub, wordBreak: "break-all", marginTop: 12 }}>
            <a href={dataUrl} target="_blank" rel="noreferrer">
              {dataUrl}
            </a>
          </div>
          <button style={{ ...styles.btn, marginTop: 16 }} onClick={() => location.reload()}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  // normal終了画面
  if (isNormalFinished) {
    const wrongCount = loadWrongIds().length;
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>20問終了</div>
          <div style={styles.sub}>間違い登録：{wrongCount} 件</div>

          <div style={styles.actions}>
            <button type="button" style={styles.primaryBtn} onClick={startNormal20}>
              通常モードをもう一度（20問）
            </button>

            <button
              type="button"
              style={styles.choiceBtn}
              onClick={startReview}
              disabled={wrongCount === 0}
              aria-disabled={wrongCount === 0}
              title={wrongCount === 0 ? "間違いがありません" : ""}
            >
              復習モード（分かるまで）
            </button>

            <button type="button" style={styles.dangerBtn} onClick={resetAll}>
              リセット（間違い履歴を消す）
            </button>
          </div>
        </div>
      </div>
    );
  }

  // review終了画面
  if (isReviewFinished) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>復習完了</div>
          <div style={styles.sub}>間違いは全て解消されました</div>

          <div style={styles.actions}>
            <button type="button" style={styles.primaryBtn} onClick={startNormal20}>
              通常モード（20問）へ
            </button>
            <button type="button" style={styles.dangerBtn} onClick={resetAll}>
              リセット
            </button>
          </div>
        </div>
      </div>
    );
  }

  // review開始直後に current が無い場合
  if (mode === "review" && current == null) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>復習モード</div>
          <div style={styles.sub}>間違いデータを準備中</div>
          <div style={styles.actions}>
            <button type="button" style={styles.primaryBtn} onClick={startReview}>
              読み直し
            </button>
            <button type="button" style={styles.dangerBtn} onClick={resetAll}>
              リセット
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>データ不整合</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.topRow}>
          <div style={styles.modeTag}>
            {mode === "normal" ? "通常" : "復習"}
          </div>

          <button type="button" style={styles.resetInlineBtn} onClick={resetAll}>
            リセット
          </button>
        </div>

        <div style={styles.title}>この議員は誰？</div>

        <div style={styles.progress}>
          {mode === "normal" ? (
            <span>
              {Math.min(normalPos + 1, normalTotal)}/{normalTotal}
            </span>
          ) : (
            <span>残り：{reviewRemaining}</span>
          )}
        </div>

        <div style={styles.imageBox}>
          {imgUrl && !imgError ? (
            <img
              src={imgUrl}
              alt={current.name}
              style={styles.image}
              onError={() => setImgError(true)}
            />
          ) : (
            <div style={styles.noImage}>画像なし</div>
          )}
        </div>

        <div style={styles.group}>{current.group ?? ""}</div>

        {senators.length > 0 && senators.length < 4 ? (
          <div style={styles.notice}>
            データが{senators.length}件のため、選択肢が{Math.min(4, senators.length)}件表示されています。
          </div>
        ) : null}

        <div style={styles.choices}>
          {choices.map((id) => {
            const s = senators.find((x) => x.id === id);
            const label = s
              ? `${s.name}${s.group ? `（${s.group}）` : ""}`
              : String(id);

            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                disabled={selectedId !== null}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background:
                    selectedId === null
                      ? "#fff"
                      : selectedId === id
                      ? isCorrect
                        ? "#e6ffed"
                        : "#ffe6e6"
                      : "#f7f7f7",
                  cursor: selectedId === null ? "pointer" : "default",
                  fontSize: 16,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={styles.footer}>
          <div style={styles.result}>
            {!isAnswered ? (
              <span>選択</span>
            ) : isCorrect ? (
              <span style={{ color: "#1a7f37" }}>正解</span>
            ) : (
              <span style={{ color: "#cf222e" }}>
                不正解（正解：{current.name}）
              </span>
            )}
          </div>

          <button
            type="button"
            style={isAnswered ? styles.nextBtn : styles.nextBtnDisabled}
            onClick={onNext}
            disabled={!isAnswered}
            aria-disabled={!isAnswered}
          >
            次へ
          </button>
        </div>

        <div style={styles.bottomActions}>
          {mode === "normal" ? (
            <button type="button" style={styles.secondaryBtn} onClick={startReview}>
              復習モードへ
            </button>
          ) : (
            <button type="button" style={styles.secondaryBtn} onClick={startNormal20}>
              通常モードへ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  },
  card: {
    width: "min(560px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "center",
  },
  topRow: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
  },
  modeTag: {
    fontSize: "12px",
    fontWeight: 700,
    border: "1px solid #ddd",
    borderRadius: "999px",
    padding: "6px 10px",
    background: "#fff",
  },
  resetInlineBtn: {
    padding: "8px 10px",
    borderRadius: "10px",
    border: "1px solid #999",
    background: "#fff",
    cursor: "pointer",
    fontSize: "14px",
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    textAlign: "center",
  },
  sub: {
    fontSize: "14px",
    opacity: 0.8,
    textAlign: "center",
  },
  progress: {
    fontSize: "13px",
    opacity: 0.8,
  },
  imageBox: {
    width: "min(260px, 70vw)",
    aspectRatio: "1 / 1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    overflow: "hidden",
    border: "1px solid #ddd",
    background: "#fafafa",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  noImage: {
    fontSize: "14px",
    color: "#666",
  },
  group: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#555",
    marginTop: "2px",
  },
  notice: {
    width: "100%",
    fontSize: "12px",
    color: "#666",
    textAlign: "center",
    padding: "4px 0",
  },
  choices: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "10px",
  },
  choiceBtn: {
    width: "100%",
    padding: "12px 10px",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "16px",
  },
  footer: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "4px",
  },
  result: {
    fontSize: "14px",
    flex: 1,
  },
  nextBtn: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #999",
    background: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  nextBtnDisabled: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #ddd",
    background: "#f5f5f5",
    cursor: "not-allowed",
    whiteSpace: "nowrap",
    color: "#888",
  },
  bottomActions: {
    width: "100%",
    display: "flex",
    justifyContent: "flex-end",
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #999",
    background: "#fff",
    cursor: "pointer",
  },
  actions: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginTop: "6px",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: "10px",
    border: "1px solid #0969da",
    background: "#eef6ff",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 700,
  },
  dangerBtn: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: "10px",
    border: "1px solid #cf222e",
    background: "#fff0f0",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 700,
  },
};
