import { ReactNode, useState } from 'react';
import { Header } from '../Header';
import { Sidebar } from '../Sidebar';
import { cn } from '../../utils/cn';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-surface-base text-primary selection:bg-brand-primary/30">
      {/* 1. HEADER (Fixed at top) */}
      <Header />

      <div className="flex flex-1 relative">
        
        {/* 2. SIDEBAR (Desktop) */}
        <div className="hidden md:block sticky top-20 h-[calc(100vh-5rem)] z-40">
          <Sidebar 
            collapsed={isCollapsed} 
            onToggle={() => setIsCollapsed(!isCollapsed)} 
          />
        </div>

        {/* 3. MOBILE SIDEBAR DRAWER */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileOpen(false)}
          >
            <div 
              className="w-72 h-full glass border-r border-glass"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar onNavigate={() => setIsMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* 4. MAIN CONTENT AREA */}
        <main 
          className={cn(
            "flex-1 w-full transition-all duration-300 ease-in-out px-4 md:px-8 py-8",
            // Dynamically adjust padding if you want the content to stay centered or push
            isCollapsed ? "md:ml-2" : "md:ml-4"
          )}
        >
          <div className="max-w-7xl mx-auto">
            {/* Page Entrance Animation Wrapper */}
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 fill-mode-both">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Subtle background glow that follows the layout */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/5 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-brand-secondary/5 blur-[100px] rounded-full pointer-events-none z-0" />
    </div>
  );
}