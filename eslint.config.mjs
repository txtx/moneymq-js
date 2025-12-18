// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, prettier, {
  ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.mjs', '**/*.d.ts'],
}, {
  files: ['**/*.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
  },
}, storybook.configs["flat/recommended"]);
