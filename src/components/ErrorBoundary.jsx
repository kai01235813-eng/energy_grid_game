import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          background: '#0a0e27',
          color: '#f87171',
          fontFamily: 'monospace',
          minHeight: '100vh',
          whiteSpace: 'pre-wrap',
        }}>
          <h2 style={{ color: '#fbbf24' }}>⚠️ 런타임 에러</h2>
          <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
