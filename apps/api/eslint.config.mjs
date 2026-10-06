import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { baseConfigs } from '../../eslint.base.mjs';

export default defineConfig(
  globalIgnores(['dist', 'coverage']),
  baseConfigs,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // Raw SQL goes through tagged templates only: they parameterise values, while the
      // *Unsafe variants concatenate strings and open the door to SQL injection.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Identifier[name=/^\\$(query|execute)RawUnsafe$/]',
          message:
            'Use the tagged-template $queryRaw`...` / $executeRaw`...`; the *Unsafe variants are banned.',
        },
      ],
    },
  },
);
