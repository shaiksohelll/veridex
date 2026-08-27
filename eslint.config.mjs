import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".git/**",
      ".manus-logs/**",
      "client/public/__manus__/**",
      "client/src/_core/**",
      "client/src/pages/ComponentShowcase.tsx",
      "client/src/pages/Home.tsx",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "server/_core/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
