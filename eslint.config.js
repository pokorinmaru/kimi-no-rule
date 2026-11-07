import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // tools/asset-builder/out holds generated candidates and scratch helpers (gitignored), not code of the repo.
  { ignores: ["**/node_modules/**", "**/dist/**", "**/playwright-report/**", "**/test-results/**", "tools/asset-builder/out/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // fast-check fails a property whose predicate returns anything but true/undefined,
          // and vitest's expect(...).toBe(...) returns an object. Use a block body instead.
          selector:
            "CallExpression[callee.property.name=/^(property|asyncProperty)$/] > ArrowFunctionExpression[expression=true][body.type='CallExpression'][body.callee.object.callee.name='expect']",
          message: "Wrap the fast-check predicate in { } — returning expect(...) makes the property fail.",
        },
      ],
    },
  },
);
