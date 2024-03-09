import js from '@eslint/js';
import ts from 'typescript-eslint';

import jsoncParser from 'jsonc-eslint-parser';

import prettierPlugin from 'eslint-plugin-prettier';
import importPlugin from 'eslint-plugin-import';

import prettierConfig from 'eslint-config-prettier';

import globals from 'globals';

/* __dirname is not available, so fake it */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* eslint-config-airbnb-typescript is not yet compatible with flat config */
import airbnbBaseConfig from 'eslint-config-airbnb-typescript/base.js'; /* eslint-disable-line import/extensions */
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/* convert eslintrc style to flat config */
const airbnbCompat = compat.config(airbnbBaseConfig);

/* tries to include a conflicting plugin by default and is missing this one */
airbnbCompat[0].plugins = {
  import: importPlugin,
};

export default ts.config(
  {
    ignores: ['frontend/**', 'lib/**', 'node_modules/**', 'dist/**'],
  },
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...airbnbCompat,
  prettierConfig,
  {
    /* all JS/TS files */
    files: ['**/*.{js,mjs,cjs,ts}'],
    plugins: {
      prettier: prettierPlugin,
      import: importPlugin,
    },
    rules: {
      'prettier/prettier': ['error'],
      /* allow names that start with _ to be unused */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    /* non-TypeScript JS files */
    files: ['**/*.{js,mjs,cjs,json}'],
    /* disable the TypeScript-specific rules from strictTypeChecked */
    ...ts.configs.disableTypeChecked,
  },
  {
    /* TypeScript files */
    files: ['**/*.ts'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        /* use closest tsconfig.json */
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': ts.plugin,
    },
    settings: {
      'import/resolver': {
        /* import doesn't seem to check .ts files without this */
        typescript: {},
      },
    },
    rules: {
      /* only enable these for TypeScript files */
      ...ts.configs.stylisticTypeChecked[0].rules,
      '@typescript-eslint/ban-ts-comment': 'off',
      /* avoid spurious errors */
      '@typescript-eslint/no-base-to-string': [
        'error',
        {
          ignoredTypeNames: ['Error', 'ErrnoException'],
        },
      ],
      /* use @ts-expect-error instead of @ts-ignore */
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      /* too many errors with this one */
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    /* check syntax of JSON files */
    files: ['**/*.json'],
    languageOptions: {
      parser: jsoncParser,
    },
  },
  {
    files: ['services/**/*.{js,ts}', 'tools/*.js', 'eslint.config.{js,cjs,mjs}', 'webpack.config.js'],
    /* all of these use node */
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['services/**/*.{js,ts}'],
    rules: {
      /* logging to console is fine */
      'no-console': 'off',
      /* no dev dependencies in shipped code */
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: false,
          packageDir: __dirname,
        },
      ],
    },
  },
  {
    files: ['tools/*.js'],
    rules: {
      /* not sure how to tell it these aren't modules */
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    files: ['*.config.{js,cjs,mjs}'],
    rules: {
      /* obviously we need dev dependencies */
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          packageDir: __dirname,
        },
      ],
    },
  },
  {
    files: ['eslint.config.{js,cjs,mjs}'],
    rules: {
      /* necessary for flat config */
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['webpack.config.js'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
);
