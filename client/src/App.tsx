import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Router from '@/routes/router';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Router />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4500,
          style: {
            background: '#ffffff',
            color: '#20251f',
            border: '1px solid #dfe4dc',
            borderRadius: '8px',
            padding: '12px 16px',
            fontFamily: 'Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          },
        }}
      />
    </BrowserRouter>
  );
}
