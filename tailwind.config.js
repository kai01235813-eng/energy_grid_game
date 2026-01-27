/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#0a0e27',
          darker: '#050816',
          blue: '#00d4ff',
          gold: '#ffd700',
          red: '#ff3366',
          purple: '#9d4edd',
        }
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'spark': 'spark 1s ease-out infinite',
        'flow': 'flow 3s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: 1, filter: 'brightness(1)' },
          '50%': { opacity: 0.6, filter: 'brightness(1.5)' },
        },
        'spark': {
          '0%': { transform: 'scale(0.8)', opacity: 0.8 },
          '50%': { transform: 'scale(1.2)', opacity: 1 },
          '100%': { transform: 'scale(0.8)', opacity: 0.8 },
        },
        'flow': {
          '0%': { strokeDashoffset: 100 },
          '100%': { strokeDashoffset: 0 },
        }
      }
    },
  },
  plugins: [],
}
