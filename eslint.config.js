// ESLint flat config for the Expo app.
// Base: eslint-config-expo (React Native + TypeScript + Expo globals).
// eslint-config-prettier disables stylistic rules that conflict with Prettier.
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // Global ignore list — kept separate so it applies to every config below.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'web-build/**',
      '.expo/**',
      'ios/**',
      'android/**',
      'coverage/**',
    ],
  },
  ...expoConfig,
  prettierConfig,
  {
    rules: {
      // Flag sequential awaits in loops for review — parallelize where safe.
      'no-await-in-loop': 'warn',
      // The app intentionally relies on console.* for debugging.
      'no-console': 'off',
      // Data-fetching effects (load-on-mount) are a standard React pattern; the
      // rule flags async setState reachable from effects, which is not worth
      // restructuring away in this codebase.
      'react-hooks/set-state-in-effect': 'off',
      // axios's default export is an instance with a .create method; the rule
      // misreads it as a named-export shadow.
      'import/no-named-as-default-member': 'off',
    },
  },
];
