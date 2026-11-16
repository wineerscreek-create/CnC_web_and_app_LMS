/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        answered: "#16a34a",
        notanswered: "#dc2626",
        review: "#ca8a04",
        notvisited: "#6b7280",
      },
    },
  },
  plugins: [],
};
