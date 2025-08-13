import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        Deno: "readonly",
        crypto: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      prettier: prettier,
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      ...eslintConfigPrettier.rules,
      "prettier/prettier": "error",
      "prefer-arrow-callback": "off",
      "func-style": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "variableLike", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
        { selector: "memberLike", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
        { selector: "typeParameter", format: ["PascalCase"], prefix: ["T"] },
        { selector: "interface", format: ["PascalCase"] },
        { selector: ["function"], format: ["camelCase"] },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
      ],
      "no-case-declarations": "off",
      "no-empty": "warn",
    },
  },
  {
    ignores: ["**/*.js", "public/**", "contracts/**", "tools/**", "lib/**", "eslint.config.js"],
  },
];
