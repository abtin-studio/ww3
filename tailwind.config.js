/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Vazirmatn', 'monospace'],
      },
      colors: {
        tactical: {
          bg: '#060a12',
          panel: '#0b1220',
          card: '#101a2e',
          border: '#1e2f4d',
          accent: '#10b981',
          amber: '#f59e0b',
          crimson: '#ef4444',
          cyan: '#06b6d4',
        },
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar-sweep': 'spin 6s linear infinite',
      },
    },
  },
  plugins: [],
};
