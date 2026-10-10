// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      '**/node_modules/**',
      'context/**',
      '**/.next/**',
      'coverage/**',
      // A separate project — Arjun_Hiring Application / kargo-shortlist, with
      // its own .git and its own .env.local — is nested inside this folder.
      // It is not ours. Flagged to the user; excluded here and in .gitignore
      // rather than touched.
      'Desktop/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',

      // Non-negotiable 8: transcripts and secrets never reach a log. Enforced
      // properly by tests/acceptance/T18-no-transcript-in-logs.test.ts; this
      // rule is the cheap first line of defence.
      'no-console': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
