/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#faf9f5',
        forest: '#355a47',
        terracotta: '#b9654e',
        mustard: '#d29d40',
        sage: '#e8eee6',
      },
    },
  },
  plugins: [],
}
