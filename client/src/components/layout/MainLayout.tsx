import { ReactNode, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { cn } from '@/lib/utils/cn';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#020205] text-white selection:bg-brand-primary/30">
      {/* 1. HEADER */}
      <Header />

      <div className="flex flex-1 relative overflow-hidden">
        
        {/* 2. SIDEBAR (Desktop) */}
        <aside className="hidden md:block sticky top-20 h-[calc(100vh-5rem)] z-40">
          <Sidebar 
            collapsed={isCollapsed} 
            onToggle={() => setIsCollapsed(!isCollapsed)} 
          />
        </aside>

        {/* 3. MOBILE SIDEBAR */}
        {isMobileOpen && (
          <div 
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md md:hidden"
            onClick={() => setIsMobileOpen(false)}
          >
            <div 
              className="w-72 h-full glass border-r border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar onNavigate={() => setIsMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* 4. MAIN CONTENT */}
        <main 
          className={cn(
            "flex-1 w-full transition-all duration-500 ease-in-out px-4 md:px-10 py-8 z-10",
            isCollapsed ? "md:ml-2" : "md:ml-4"
          )}
        >
          <div className="max-w-7xl mx-auto">
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-both">
              {children}
            </div>
          </div>
        </main>

        {/* BACKGROUND AMBIENCE */}
        <div className="fixed top-[-15%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/10 blur-[150px] rounded-full pointer-events-none -z-10" />
        <div className="fixed bottom-[-15%] right-[-10%] w-[40%] h-[40%] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      </div>

      <Footer />
    </div>
  );
}
