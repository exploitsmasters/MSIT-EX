/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'custom-purple': '#4A3B85', // Define your custom color
      },
    },
  },
  plugins: [],
};
