import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Router from "./routes/router";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { LogPanel } from "./components/ui/LogPanel";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex flex-col min-h-screen bg-slate-950 text-slate-50">
        <Header />
        
        {/* The main container for the router content */}
        <main className="flex-grow"> 
          <Router />
        </main>

        <Footer />
        
        {/* Global UI Elements */}
        <LogPanel />
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#0f172a',
              color: '#fff',
              border: '1px solid #1e293b',
            },
          }} 
        />
      </div>
    </BrowserRouter>
  );
}