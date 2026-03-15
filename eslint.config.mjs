import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      ".next-*/**",
      "node_modules/**",
      ".agents/**",
      ".opencode/**",
      "artifacts/**",
      "scripts/**",
      "tests/**",
      "submodules/**",
      "coverage/**",
      "build/**",
      "dist/**",
      "*.log",
      "test-*.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["app/**/*.{js,mjs,cjs,ts,tsx}", "components/**/*.{js,mjs,cjs,ts,tsx}", "lib/**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": "warn",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "off",
      "no-console": "off",
    },
  },
)
