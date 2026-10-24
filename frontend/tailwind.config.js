/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 700: '#1b2a6b', 800: '#14205a', 900: '#0e1747', 950: '#0a1034' },
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulseRing: { '0%,100%': { opacity: '0.35' }, '50%': { opacity: '1' } },
      },
      animation: { fadeUp: 'fadeUp .35s ease-out both', pulseRing: 'pulseRing 2.4s ease-in-out infinite' },
    },
  },
  plugins: [],
};
