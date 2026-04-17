const path = require('path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.resolve(__dirname, 'index.html'),
    path.resolve(__dirname, 'src/**/*.{ts,tsx}')
  ],
  theme: {
    extend: {}
  },
  plugins: []
}
