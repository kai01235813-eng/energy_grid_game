import React from 'react';
import SmartGridGame from './components/SmartGridGame';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <SmartGridGame />
    </ErrorBoundary>
  );
}

export default App;
