import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ padding: 24, maxWidth: 720 }}>
          <h1 style={{ color: "#b00020" }}>Algo quebrou na interface</h1>
          <p style={{ lineHeight: 1.5 }}>
            Recarregue a página. Se persistir, abra o console do navegador (F12 → Console) e envie o erro.
          </p>
          <pre
            style={{
              background: "#fff",
              border: "2px solid #111",
              borderRadius: 12,
              padding: 12,
              overflow: "auto",
              fontSize: 12,
            }}
          >
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
