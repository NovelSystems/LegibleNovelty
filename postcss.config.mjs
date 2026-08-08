/** PostCSS config — Tailwind v4 uses its own PostCSS plugin (no autoprefixer;
 * vendor prefixing is handled internally by Lightning CSS). */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
