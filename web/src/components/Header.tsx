import type { CSSProperties } from 'react';

export default function Header() {
  return <div style={styles.hidden} aria-hidden="true" />;
}

const styles: Record<string, CSSProperties> = {
  hidden: {
    display: 'none',
  },
};
