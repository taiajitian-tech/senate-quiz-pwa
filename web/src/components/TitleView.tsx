import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { getAvailableTargets, getTargetLabels, getTargetTabs, type AppMode, type Target } from "./data";
import HelpModal from "./HelpModal";

type Props = {
  appMode: AppMode;
  onChangeAppMode: (mode: AppMode) => void;
  target: Target;
  onChangeTarget: (target: Target) => void;
  onOpenFirstGuide: () => void;
  onStartLearn: () => void;
  onStartReverse: () => void;
  onStartReview: () => void;
  onOpenAutoplay: () => void;
  onOpenStats: () => void;
  onOpenList: () => void;
  onOpenBackup: () => void;
  onOpenUpdates: () => void;
};

type UpdatesMeta = {
  totalChanges: number;
  generatedAt: string;
};

const UPDATES_LAST_SEEN_KEY = "updates_last_seen_generated_at_v1";

function readLastSeenGeneratedAt(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(UPDATES_LAST_SEEN_KEY) ?? "";
}

function formatGeneratedAt(value: string): string {
  if (!value) return "未生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type MenuButtonProps = {
  label: string;
  sub: string;
  tone?: "default" | "primary" | "guide";
  onClick: () => void;
};

function MenuButton(props: MenuButtonProps) {
  const buttonStyle = props.tone === "primary"
    ? styles.primaryCardBtn
    : props.tone === "guide"
      ? styles.guideCardBtn
      : styles.cardBtn;

  return (
    <button type="button" style={buttonStyle} onClick={props.onClick}>
      <div style={styles.cardBtnTitle}>{props.label}</div>
      <div style={styles.cardBtnSub}>{props.sub}</div>
    </button>
  );
}

export default function TitleView(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [updatesMeta, setUpdatesMeta] = useState<UpdatesMeta>({ totalChanges: 0, generatedAt: "" });
  const [lastSeenGeneratedAt, setLastSeenGeneratedAt] = useState<string>(() => readLastSeenGeneratedAt());
  const targetTabs = useMemo(() => getTargetTabs(props.appMode), [props.appMode]);
  const targetLabels = useMemo(() => getTargetLabels(props.appMode), [props.appMode]);
  const availableTargets = useMemo(() => getAvailableTargets(props.appMode), [props.appMode]);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = import.meta.env.BASE_URL ?? "/";

    (async () => {
      try {
        const response = await fetch(`${baseUrl}data/updates.json`, { cache: "no-store" });
        if (!response.ok) return;
        const json = await response.json() as Partial<UpdatesMeta>;
        if (cancelled) return;
        setUpdatesMeta({
          totalChanges: typeof json.totalChanges === "number" ? json.totalChanges : 0,
          generatedAt: typeof json.generatedAt === "string" ? json.generatedAt : "",
        });
      } catch (error) {
        console.error(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasUnreadUpdates = updatesMeta.totalChanges > 0 && !!updatesMeta.generatedAt && lastSeenGeneratedAt !== updatesMeta.generatedAt;

  const handleOpenUpdates = () => {
    if (updatesMeta.generatedAt && typeof window !== "undefined") {
      window.localStorage.setItem(UPDATES_LAST_SEEN_KEY, updatesMeta.generatedAt);
      setLastSeenGeneratedAt(updatesMeta.generatedAt);
    }
    props.onOpenUpdates();
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.topControlRow}>
          <button
            type="button"
            style={styles.noticeIconBtn}
            onClick={handleOpenUpdates}
            aria-label={updatesMeta.totalChanges > 0 ? `お知らせ ${updatesMeta.totalChanges} 件` : `お知らせ 変更なし ${formatGeneratedAt(updatesMeta.generatedAt)} 確認`}
            title={updatesMeta.totalChanges > 0 ? `お知らせ ${updatesMeta.totalChanges} 件` : `お知らせ 変更なし ${formatGeneratedAt(updatesMeta.generatedAt)} 確認`}
          >
            <span style={styles.noticeIconText}>🔔</span>
            {hasUnreadUpdates ? <span style={styles.noticeBadge}>{updatesMeta.totalChanges > 9 ? "9+" : String(updatesMeta.totalChanges)}</span> : null}
          </button>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)} aria-label="ヘルプ" title="ヘルプ">？</button>
        </div>

        <div style={styles.titleBlock}>
          <div style={styles.title}>議員集</div>
          <div style={styles.titleSub}>まず見て、次に思い出す。開始前に条件を決めて覚える学習アプリ</div>
          <div style={styles.noticeHint}>{updatesMeta.totalChanges > 0 ? `更新あり ${updatesMeta.totalChanges} 件` : `変更なし ${formatGeneratedAt(updatesMeta.generatedAt)} 確認`}</div>
        </div>

        <div style={styles.modeSwitchWrap}>
          <div style={styles.modeSwitchLabel}>モード</div>
          <div style={styles.modeSwitchRow}>
            <button type="button" style={{ ...styles.modeBtn, ...(props.appMode === "basic" ? styles.modeBtnActive : null) }} onClick={() => props.onChangeAppMode("basic")}>基本</button>
            <button type="button" style={{ ...styles.modeBtn, ...(props.appMode === "entrance" ? styles.modeBtnActive : null) }} onClick={() => props.onChangeAppMode("entrance")}>玄関</button>
          </div>
          <div style={styles.modeHelpText}>{props.appMode === "basic" ? "通常の学習用です。" : "玄関対応に必要な対象だけを出します。"}</div>
        </div>

        <div style={styles.targetSelectWrap}>
          <label htmlFor="title-target-select" style={styles.targetSelectLabel}>区分選択</label>
          <select
            id="title-target-select"
            value={props.target}
            onChange={(e) => props.onChangeTarget(e.target.value as Target)}
            style={styles.targetSelect}
          >
            {availableTargets.map((target) => (
              <option key={target} value={target}>
                {targetTabs[target]}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.targetLabel}>{targetLabels[props.target]}</div>

        <div style={styles.quickStartBox}>
          <div style={styles.quickStartTitle}>まず使う場所</div>
          <div style={styles.quickStartGrid}>
            <MenuButton tone="guide" label="最初に" sub="使い方と覚え方を先に確認する" onClick={props.onOpenFirstGuide} />
            <MenuButton tone="primary" label="学習" sub={props.appMode === "basic" ? "基本モード。顔から名前を思い出す" : "玄関モード。玄関用の対象だけを学習する"} onClick={props.onStartLearn} />
          </div>
        </div>

        <div style={styles.menuSectionTitle}>学習メニュー</div>
        <div style={styles.menu}>
          <MenuButton label="逆学習" sub="名前を見て顔を思い出す" onClick={props.onStartReverse} />
          <MenuButton label="復習" sub="忘れかけだけを出して定着させる" onClick={props.onStartReview} />
          <MenuButton label="自動再生" sub="最初の大量インプットに使う" onClick={props.onOpenAutoplay} />
          <MenuButton label="一覧" sub="全体を見渡して確認する" onClick={props.onOpenList} />
          <MenuButton label="成績確認" sub="覚えた・うろ覚え・未確認を確認する" onClick={props.onOpenStats} />
          <MenuButton label="バックアップ" sub="学習記録の保存と復元" onClick={props.onOpenBackup} />
        </div>

        <div style={styles.guideBox}>
          <div style={styles.guideTitle}>おすすめの順番</div>
          <div style={styles.stepGrid}>
            <div style={styles.stepCard}><div style={styles.stepNum}>1</div><div><b>自動再生</b><div style={styles.stepText}>秒数を画面内で調整しながら顔を一気に見る</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>2</div><div><b>学習</b><div style={styles.stepText}>問題数と出題対象を決めて名前を思い出す</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>3</div><div><b>逆学習</b><div style={styles.stepText}>名前から顔も引けるようにする</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>4</div><div><b>復習</b><div style={styles.stepText}>忘れかけを戻して定着させる</div></div></div>
          </div>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（アプリ）">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div><b>最初にやること</b></div>
          <div>最初にで流れを確認し、そのあと自動再生か学習へ入ると迷いにくくなります。</div>
          <div><b>モードの違い</b></div>
          <div>基本は従来どおり、玄関は玄関対応に必要な対象だけを絞って学習します。</div>
          <div><b>迷ったときの基準</b></div>
          <div>3秒以内に出なければ考え込まず、答えを見て次へ進めた方が効率が上がります。</div>
          <div><b>復習の役割</b></div>
          <div>復習は、開始前に問題数を決めて、忘れかけや苦手な議員を集中的に出します。</div>
        </div>
      </HelpModal>
    </div>
  );
}

const commonBtn: CSSProperties = {
  width: "100%",
  padding: "14px 12px",
  borderRadius: 14,
};

const styles: Record<string, CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "#f7f8fa",
  },
  card: {
    width: "min(760px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
  },
  topControlRow: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  titleBlock: { width: "100%", display: "flex", flexDirection: "column", gap: 4 },
  title: { fontSize: 40, fontWeight: 800, letterSpacing: 1 },
  titleSub: { fontSize: 14, color: "#555", marginTop: 4 },
  noticeHint: { fontSize: 12, color: "#555", marginTop: 2 },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
  noticeIconBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" },
  noticeIconText: { fontSize: 18, fontWeight: 800, lineHeight: 1 },
  noticeBadge: { position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 999, background: "#d1242f", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #f7f8fa" },
  modeSwitchWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 8, border: "1px solid #d9e2f2", background: "#fff", borderRadius: 16, padding: 14 },
  modeSwitchLabel: { fontSize: 14, fontWeight: 700 },
  modeSwitchRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  modeBtn: { padding: "12px 10px", borderRadius: 12, border: "1px solid #999", background: "#fff", fontWeight: 800 },
  modeBtnActive: { border: "1px solid #111", background: "#111", color: "#fff" },
  modeHelpText: { fontSize: 12, color: "#666" },
  targetSelectWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 6 },
  targetSelectLabel: { fontSize: 14, fontWeight: 700 },
  targetSelect: { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #999", background: "#fff", fontSize: 16 },
  targetLabel: { width: "100%", fontSize: 13, color: "#555" },
  quickStartBox: { width: "100%", display: "flex", flexDirection: "column", gap: 10, border: "1px solid #d9e2f2", background: "#fff", borderRadius: 16, padding: 14 },
  quickStartTitle: { fontSize: 16, fontWeight: 800 },
  quickStartGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  menuSectionTitle: { width: "100%", fontSize: 16, fontWeight: 800 },
  menu: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  cardBtn: { ...commonBtn, border: "1px solid #ddd", background: "#fff", textAlign: "left" },
  primaryCardBtn: { ...commonBtn, border: "1px solid #1d4ed8", background: "#eff6ff", textAlign: "left" },
  guideCardBtn: { ...commonBtn, border: "1px solid #7c3aed", background: "#f5f3ff", textAlign: "left" },
  cardBtnTitle: { fontSize: 17, fontWeight: 800 },
  cardBtnSub: { fontSize: 13, color: "#555", marginTop: 6 },
  guideBox: { width: "100%", display: "flex", flexDirection: "column", gap: 10, border: "1px solid #ddd", background: "#fff", borderRadius: 16, padding: 14 },
  guideTitle: { fontSize: 16, fontWeight: 800 },
  stepGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  stepCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "flex-start", background: "#fbfcff" },
  stepNum: { width: 26, height: 26, borderRadius: 999, background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flex: "0 0 26px" },
  stepText: { fontSize: 13, color: "#555", marginTop: 4 },
};
