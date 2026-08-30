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
    },
  },
];
