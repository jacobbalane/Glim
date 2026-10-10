import React from 'react';
import ReactDOM from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import App from './App';
import '@fontsource-variable/manrope';
import './styles.css';

const browserPreview = import.meta.env.DEV && !isTauri();
const PreviewPage =
  browserPreview && /^\/preview\/?$/.test(location.pathname)
    ? React.lazy(() => import('./PreviewPage'))
    : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {PreviewPage ? (
      <React.Suspense fallback={null}>
        <PreviewPage />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
