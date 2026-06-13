export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        cairo: ["Cairo", "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#171717",
        nile: "#006b3a",
        saffron: "#0b8f4d",
        berry: "#004f2a",
        paper: "#f7faf8"
      }
    }
  },
  plugins: []
};
