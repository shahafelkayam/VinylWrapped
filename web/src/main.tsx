import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/shrikhand/400.css';
import '@fontsource/monoton/400.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource-variable/dm-sans/index.css';
import './styles/global.css';
import { StoreProvider } from './lib/store.tsx';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
