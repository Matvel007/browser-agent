/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./sidepanel.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        agent: {
          bg: 'var(--agent-bg)',
          surface: 'var(--agent-surface)',
          card: 'var(--agent-card)',
          border: 'var(--agent-border)',
          text: 'var(--agent-text)',
          muted: 'var(--agent-muted)',
          accent: 'var(--agent-accent)',
          accentHover: 'var(--agent-accent-hover)',
        }
      }
    },
  },
  plugins: [],
}
