/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:   '#667eea',
          secondary: '#764ba2',
          glow:      'rgba(102, 126, 234, 0.35)',
        },
        surface: {
          base:    '#0d0d1a',
          raised:  '#13131f',
          overlay: '#1a1a2e',
        },
        glass: {
          bg:           'rgba(255, 255, 255, 0.04)',
          border:       'rgba(255, 255, 255, 0.08)',
          borderHover:  'rgba(102, 126, 234, 0.4)',
        },
        // Keep primary scale for backward compat
        primary: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        accent: {
          emerald: '#10b981',
          amber:   '#f59e0b',
          rose:    '#f43f5e',
          sky:     '#38bdf8',
        },
      },
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient':   'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'brand-gradient-h': 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
        'success-gradient': 'linear-gradient(90deg, #10b981, #059669)',
      },
      boxShadow: {
        'glow-purple': '0 0 24px rgba(102, 126, 234, 0.35)',
        'glow-green':  '0 0 24px rgba(16, 185, 129, 0.3)',
        'card':        '0 8px 32px rgba(0, 0, 0, 0.4)',
        'card-hover':  '0 12px 40px rgba(102, 126, 234, 0.2)',
      },
      animation: {
        'spin-slow':  'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':    'shimmer 1.5s infinite',
        'fade-in':    'fadeIn 0.3s ease forwards',
        'slide-up':   'slideUp 0.3s ease forwards',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}