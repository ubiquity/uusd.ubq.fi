import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2020,
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
      "prefer-arrow-callback": ["warn", { "allowNamedFunctions": true }],
      "func-style": ["warn", "declaration", { "allowArrowFunctions": false }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
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
        "error",
        { selector: "interface", format: ["PascalCase"], custom: { regex: "^I[A-Z]", match: false } },
        { selector: "memberLike", modifiers: ["private"], format: ["camelCase"], leadingUnderscore: "require" },
        { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow" },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "typeParameter", format: ["PascalCase"], prefix: ["T"] },
        { selector: "variable", format: ["camelCase", "UPPER_CASE"], leadingUnderscore: "allow", trailingUnderscore: "allow" },
        { selector: "variable", format: ["camelCase"], leadingUnderscore: "allow", trailingUnderscore: "allow" },
        { selector: "variable", modifiers: ["destructured"], format: null },
        { selector: "variable", types: ["boolean"], format: ["PascalCase"], prefix: ["is", "should", "has", "can", "did", "will", "matches", "contains", "exists", "found", "includes", "supports", "allows"] },
        { selector: "variableLike", format: ["camelCase"] },
        { selector: ["function", "variable"], format: ["camelCase"] },
      ],
      "no-case-declarations": "off",
      "no-empty": "warn",
    },
  },
  {
    ignores: [
      "**/*.js",
      "public/**",
      "contracts/**",
      "tools/**",
      "lib/**",
      "eslint.config.js",
      "serve.ts",
      "serve-dev.ts",
      "src/utils/generate-devtools-json.ts"
    ],
  },
];
