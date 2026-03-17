import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Toaster } from 'react-hot-toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 5000,
        style: {
          background: '#1f2937',
          color: '#e5e7eb',
          border: '1px solid #374151',
          borderRadius: '8px',
          padding: '12px 16px',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#064e3b',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#7f1d1d',
          },
        },
      }}
    />
  </StrictMode>
);