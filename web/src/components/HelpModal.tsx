import React from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function HelpModal(props: Props) {
  if (!props.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={styles.overlay}
      onClick={props.onClose}
    >
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>{props.title}</div>
          <button type="button" style={styles.closeBtn} onClick={props.onClose}>
            閉じる
          </button>
        </div>
        <div style={styles.body}>{props.children}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  },
  card: {
    width: "min(560px, 100%)",
    maxHeight: "min(88vh, 760px)",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #ddd",
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    position: "sticky",
    top: 0,
    background: "#fff",
    zIndex: 1,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
  },
  closeBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #999",
    background: "#fff",
    fontSize: 14,
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 1.7,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    paddingRight: 4,
  },
};
