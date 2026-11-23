import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CrashScreen } from './components/CrashScreen.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// StrictMode intentionally not enabled: Viewport3D's effect cleanup does not remove its canvas
// or release the WebGL context, so the dev double-invoke would leak a second context.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback={(e) => <CrashScreen error={e} />}>
    <App />
  </ErrorBoundary>
);
