/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./static/**/*.{html,css}", "./src/**/*.{ts}"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["night", "halloween", "synthwave"],
  },
};
