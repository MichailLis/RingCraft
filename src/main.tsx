import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CrashScreen } from './components/CrashScreen.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import '@fontsource/ibm-plex-sans/cyrillic-400.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/cyrillic-500.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/cyrillic-600.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/cyrillic-700.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/cyrillic-400.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/cyrillic-500.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/cyrillic-600.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './index.css';

// StrictMode intentionally not enabled: Viewport3D's effect cleanup does not remove its canvas
// or release the WebGL context, so the dev double-invoke would leak a second context.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback={(e) => <CrashScreen error={e} />}>
    <App />
  </ErrorBoundary>
);
