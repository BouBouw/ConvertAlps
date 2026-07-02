/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Palette vars are RGB channels in CSS; Tailwind wraps them with
        // rgb(var(--X) / <alpha-value>) so opacity modifiers (/80, /50…) work
        // and ALL bg-*/text-*/border-* classes respond to [data-theme="light"].
        ice: {
          50:  'rgb(var(--ice-50)  / <alpha-value>)',
          100: 'rgb(var(--ice-100) / <alpha-value>)',
          200: 'rgb(var(--ice-200) / <alpha-value>)',
          300: 'rgb(var(--ice-300) / <alpha-value>)',
          400: 'rgb(var(--ice-400) / <alpha-value>)',
          500: 'rgb(var(--ice-500) / <alpha-value>)',
          600: 'rgb(var(--ice-600) / <alpha-value>)',
          700: 'rgb(var(--ice-700) / <alpha-value>)',
          800: 'rgb(var(--ice-800) / <alpha-value>)',
          900: 'rgb(var(--ice-900) / <alpha-value>)',
          950: 'rgb(var(--ice-950) / <alpha-value>)',
        },
        navy: {
          950: 'rgb(var(--navy-950) / <alpha-value>)',
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          850: 'rgb(var(--navy-850) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          600: 'rgb(var(--navy-600) / <alpha-value>)',
          500: 'rgb(var(--navy-500) / <alpha-value>)',
          400: 'rgb(var(--navy-400) / <alpha-value>)',
          300: 'rgb(var(--navy-300) / <alpha-value>)',
        },
      },
      backgroundImage: {
        'gradient-ice': 'linear-gradient(135deg, #7FA6B8 0%, #2A3E4B 100%)',
        'gradient-ice-soft': 'linear-gradient(180deg, rgba(127,166,184,0.08) 0%, rgba(42,62,75,0.04) 100%)',
        'gradient-navy': 'linear-gradient(180deg, #0D1B25 0%, #060D14 100%)',
      },
      boxShadow: {
        'ice': '0 0 0 1px rgba(127,166,184,0.15), 0 4px 24px rgba(6,13,20,0.6)',
        'ice-sm': '0 0 0 1px rgba(127,166,184,0.10), 0 2px 8px rgba(6,13,20,0.4)',
        'ice-glow': '0 0 12px rgba(91,142,166,0.25)',
        'panel': '0 1px 0 rgba(127,166,184,0.06) inset, 0 8px 32px rgba(6,13,20,0.5)',
        'inset-top': 'inset 0 1px 0 rgba(127,166,184,0.08)',
      },
      animation: {
        'pulse-fast':   'pulse 0.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':    'spin 3s linear infinite',
        'fade-in':      'fadeIn 0.15s ease-out',
        'slide-up':     'slideUp 0.2s ease-out',
        'slide-right':  'slideRight 0.2s ease-out',
        'shimmer':      'shimmer 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: '0' },                    to: { opacity: '1' } },
        slideUp:     { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideRight:  { from: { transform: 'translateX(-6px)', opacity: '0' }, to: { transform: 'translateX(0)', opacity: '1' } },
        shimmer:     { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
