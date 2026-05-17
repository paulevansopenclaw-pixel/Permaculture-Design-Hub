import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ""}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="rounded-xl p-4 text-[12px] space-y-1.5"
          style={{ background: "hsl(0, 25%, 10%)", border: "1px solid hsl(0, 25%, 20%)", color: "#f87171" }}
        >
          <div className="font-semibold">Something went wrong</div>
          <div style={{ color: "hsl(0, 20%, 55%)" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-[11px] underline mt-1"
            style={{ color: "hsl(0, 30%, 55%)" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
