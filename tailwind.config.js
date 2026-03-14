/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAFAF8',
        foreground: '#1A1A1A',
        muted: '#F5F3F0',
        'muted-foreground': '#6B6B6B',
        accent: '#B8860B',
        'accent-secondary': '#D4A84B',
        'accent-foreground': '#FFFFFF',
        border: '#E8E4DF',
        card: '#FFFFFF',
        ring: '#B8860B',
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      letterSpacing: {
        'wide-sm': '0.05em',
        'wide': '0.1em',
        'wider': '0.15em',
      },
    },
  },
  plugins: [],
}
