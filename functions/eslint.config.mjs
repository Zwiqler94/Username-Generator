import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { fixupConfigRules } from "@eslint/compat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ["lib/**/*", "*.DS_Store"],
  },
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "./node_modules/gts",
      "plugin:@typescript-eslint/recommended",
    ),
  ),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
    },

    rules: {
      quotes: ["error", "double"],
      "import/no-unresolved": 0,
    },
  },
];
