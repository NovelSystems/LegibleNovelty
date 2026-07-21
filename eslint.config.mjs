import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "eslint.config.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript handles undefined-identifier checking; no-undef would
      // otherwise flag Node/DOM globals in .ts files.
      "no-undef": "off",
    },
  },
);
