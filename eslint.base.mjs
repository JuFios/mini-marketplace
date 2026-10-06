import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint rules for every workspace. Each app composes this with its own
 * environment-specific config (globals, framework plugins, project bans).
 */
export const baseConfigs = defineConfig(
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // `any` is banned (use `unknown` + narrowing); this is also on in `recommended`,
      // pinned here so the repo rule survives a preset change.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Config files are plain JS outside any tsconfig; type-aware rules cannot run on them.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    linterOptions: {
      // A stale disable comment hides nothing and misleads the next reader.
      reportUnusedDisableDirectives: 'error',
    },
  },
);
