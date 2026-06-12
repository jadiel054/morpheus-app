/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyan: '#00FFFF',
        'electric-blue': '#0080FF',
        'dark-bg': '#050a0f',
        'dark-card': '#0a1520',
        'dark-border': '#0d2030',
        'teal-dark': '#003344',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'scanline': 'scanline 3s linear infinite',
        'pulse-cyan': 'pulse-cyan 2s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.5s ease-out',
        'hud-rotate': 'hud-rotate 10s linear infinite',
      },
    },
  },
  plugins: [],
}
