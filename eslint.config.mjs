import js from '@eslint/js';
import ts from 'typescript-eslint';

import jsoncParser from 'jsonc-eslint-parser';

import importPlugin from 'eslint-plugin-import';

/* includes the plugin and enables the rules */
import prettierRecommendedConfig from 'eslint-plugin-prettier/recommended';

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
  prettierRecommendedConfig,
  {
    /* all JS/TS files */
    files: ['**/*.{js,mjs,cjs,ts}'],
    linterOptions: {
      /* disable for now */
      // reportUnusedDisableDirectives: 'warn',
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          trailingComma: 'all',
        },
      ],
      /* allow names that start with _ to be unused */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          destructuredArrayIgnorePattern: '^_',
          /* varsIgnorePattern affects catch as well */
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
    files: ['services/**/*.{js,ts}', 'tools/*.js', 'eslint.config.{js,mjs,cjs}', 'webpack.config.js'],
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
    languageOptions: {
      /* these scripts run during build, so they can use recent Node.js */
      ecmaVersion: 'latest',
      sourceType: 'script',
    },
    rules: {
      /* not sure how to tell it these aren't modules */
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    files: ['*.config.{js,mjs,cjs}'],
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
    files: ['eslint.config.{js,mjs,cjs}'],
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
  {
    files: ['babel.config.json', 'tsconfig.json'],
    rules: {
      /* has various issues (e.g., forcing arrays/objects onto a single line) */
      'prettier/prettier': 'off',
    },
  },
);
