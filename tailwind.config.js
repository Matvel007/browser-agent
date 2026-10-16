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
        chatgpt: {
          sidebar: '#171717',
          main: '#212121',
          card: '#2f2f2f',
          hover: '#2a2a2a',
          border: '#383838',
          input: '#303030',
          text: '#ececec',
          muted: '#b4b4b4'
        }
      }
    },
  },
  plugins: [],
}
