import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-white/5 border-t border-white/10 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p className="text-purple-200 text-sm flex items-center justify-center gap-1">
          ⚡ Powered by <span className="font-semibold">The Energy Internet</span>
        </p>
        <p className="text-purple-300/60 text-xs mt-2 flex items-center justify-center gap-1">
          © {new Date().getFullYear()} Enerlectra. Made with <Heart className="w-3 h-3 text-red-400" /> for energy democracy.
        </p>
      </div>
    </footer>
  );
}