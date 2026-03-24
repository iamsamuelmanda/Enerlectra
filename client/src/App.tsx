import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Router from "@/routes/router"; // Fixed: Using Alias
import { Header } from "@/components/layout/Header"; // Fixed: Using Alias
import { Footer } from "@/components/layout/Footer"; // Fixed: Using Alias
import { LogPanel } from "@/components/ui/LogPanel"; // Fixed: Using Alias

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
            duration: 5000,
            style: {
              background: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '12px 16px',
            },
            success: {
              iconTheme: {
                primary: '#22c55e',
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
      </div>
    </BrowserRouter>
  );
}