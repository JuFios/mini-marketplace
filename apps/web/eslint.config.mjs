import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import storybook from 'eslint-plugin-storybook';
import globals from 'globals';
import { baseConfigs } from '../../eslint.base.mjs';

export default defineConfig(
  globalIgnores(['dist', 'coverage', 'storybook-static']),
  baseConfigs,
  reactHooks.configs.flat.recommended,
  storybook.configs['flat/recommended'],
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // XSS: React escapes by default; raw HTML injection bypasses that. Both the JSX
      // attribute and the props-object form (createElement / spread) are covered.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message: 'dangerouslySetInnerHTML is banned (XSS risk).',
        },
        {
          selector: 'Property[key.name="dangerouslySetInnerHTML"]',
          message: 'dangerouslySetInnerHTML is banned (XSS risk).',
        },
      ],
    },
  },
);
