/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary palette (Emerald/Teal - Universal clean energy theme)
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#10b981',  // Main brand color - Emerald
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        
        // Energy-specific professional colors
        energy: {
          solar: '#f59e0b',     // Amber - represents sun
          wind: '#06b6d4',      // Cyan - represents air/sky
          hydro: '#3b82f6',     // Blue - represents water
          battery: '#8b5cf6',   // Purple - represents storage
          grid: '#64748b',      // Slate - represents infrastructure
          biomass: '#84cc16',   // Lime - represents organic
        },
        
        // Accent colors for data visualization
        accent: {
          success: '#10b981',   // Emerald
          warning: '#f59e0b',   // Amber
          danger: '#ef4444',    // Red
          info: '#3b82f6',      // Blue
          purple: '#a855f7',    // Purple
          pink: '#ec4899',      // Pink
          teal: '#14b8a6',      // Teal
          orange: '#f97316',    // Orange
        },
        
        // Glass effect helpers
        glass: {
          light: 'rgba(255, 255, 255, 0.05)',
          medium: 'rgba(255, 255, 255, 0.10)',
          strong: 'rgba(255, 255, 255, 0.15)',
        }
      },
      
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      
      animation: {
        'fade-in': 'fadeIn 0.6s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in': 'slideIn 0.4s ease-out',
        'slide-down': 'slideDown 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 3s infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(16, 185, 129, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      },
      
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'shimmer': 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
        'mesh-gradient': 'radial-gradient(at 40% 20%, rgba(16, 185, 129, 0.3) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(59, 130, 246, 0.3) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(139, 92, 246, 0.3) 0px, transparent 50%)',
      },
      
      boxShadow: {
        'glow-sm': '0 0 10px rgba(16, 185, 129, 0.3)',
        'glow': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glow-lg': '0 0 30px rgba(16, 185, 129, 0.5)',
        'glow-xl': '0 0 40px rgba(16, 185, 129, 0.6)',
        'inner-glow': 'inset 0 0 20px rgba(16, 185, 129, 0.1)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      
      backdropBlur: {
        xs: '2px',
      },
      
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
```

