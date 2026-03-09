import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", padding: 16 }}>
          <div style={{ width: "min(720px, 100%)", margin: "0 auto", border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>画面エラー</div>
            <div style={{ marginTop: 8 }}>表示中の画面でエラーが発生しました。ページを再読み込みしてください。</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
