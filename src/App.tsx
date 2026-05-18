import React from 'react';
import { AppShell } from './components/layout/AppShell';

// ── Error boundary so render crashes show a message instead of a blank page ──
interface EBState { error: Error | null }
class ErrorBoundary extends React.Component<React.PropsWithChildren, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(e: Error): EBState { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#0e0f0c', color: '#ffc091', fontFamily: 'monospace', height: '100vh' }}>
          <h2 style={{ color: '#d03238', marginBottom: 12 }}>렌더링 오류</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#868685', marginTop: 8 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); }}
            style={{ marginTop: 16, padding: '6px 16px', background: '#9fe870', color: '#163300', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => (
  <ErrorBoundary>
    <AppShell />
  </ErrorBoundary>
);

export default App;
