import type { CSSProperties } from "react";

type UpdatesLike = {
  updatedAt?: string;
  totalChanges?: number;
};

type HeaderProps = {
  updates?: UpdatesLike;
};

export default function Header(_props: HeaderProps) {
  return <div style={styles.hidden} aria-hidden="true" />;
}

const styles: Record<string, CSSProperties> = {
  hidden: {
    display: "none",
  },
};
