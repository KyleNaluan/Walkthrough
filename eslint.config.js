import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {ignores: ['**/dist', '**/node_modules', '.vercel', 'coverage']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Google TypeScript Style Guide conventions that lint can enforce.
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {assertionStyle: 'as'},
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
      ],
    },
  },
  {
    files: ['server/**/*.ts', 'api/**/*.ts'],
    languageOptions: {globals: globals.node},
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {globals: globals.browser},
    plugins: {'react-hooks': reactHooks, 'react-refresh': reactRefresh},
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {allowConstantExport: true},
      ],
    },
  },
  prettier,
);
