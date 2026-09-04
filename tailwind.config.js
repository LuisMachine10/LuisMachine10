/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta Sistema Mena: terminal financiera, no app de fitness.
        marino: {
          950: '#0C1826',
          900: '#122238',
          800: '#1F3A5F',
          700: '#2B4E7C',
          600: '#3A6396',
        },
        dorado: {
          600: '#B8860B',
          500: '#CFA028',
          400: '#E0B84A',
        },
        pergamino: '#EDE7DA',
        humo: '#9AA7B8',
        verde: '#3F7D5A',
        rojo: '#A34A3C',
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
