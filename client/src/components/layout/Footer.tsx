import { Zap } from 'lucide-react';

export function Footer() {
  return (
    <footer
      className="mt-auto"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(13, 13, 26, 0.6)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
          >
            <Zap size={12} className="text-white" fill="white" />
          </div>
          <span className="text-sm font-display font-semibold" style={{ color: 'rgba(240,240,255,0.6)' }}>
            Enerlectra
          </span>
          <span className="text-sm" style={{ color: 'rgba(240,240,255,0.25)' }}>·</span>
          <span className="text-xs" style={{ color: 'rgba(240,240,255,0.3)' }}>
            ⚡ Powered by The Energy Internet
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: 'rgba(240,240,255,0.25)' }}>
            Beta v1.0
          </span>
          <span className="text-xs" style={{ color: 'rgba(240,240,255,0.25)' }}>
            © 2026 Enerlectra
          </span>
          <span className="text-xs" style={{ color: 'rgba(240,240,255,0.3)' }}>
            Made with ♥ for energy democracy
          </span>
        </div>
      </div>
    </footer>
  );
}