import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts'],
    languageOptions: { parser: tsParser },
    rules: { 'no-undef': 'off' },
  },
  {
    files: ['tests/integration/*.test.ts'],
    rules: { 'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }] },
  },
  { languageOptions: { globals: globals.node } },
];
