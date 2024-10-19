/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./static/**/*.{html,css,ts}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
};
