import { BrowserRouter } from 'react-router-dom';
import Router from './routes/router';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { LogPanel } from './components/ui/LogPanel';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
      <Router />
      <Footer />
      <LogPanel />
    </BrowserRouter>
  );
}