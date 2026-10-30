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

/*
 * eslint-config-airbnb-typescript still refers to the formatting rules that
 * typescript-eslint v8 removed (they moved to @stylistic). They are all turned
 * off by eslint-config-prettier anyway, so drop any rule the plugin no longer
 * defines instead of failing on startup.
 */
const tsPrefix = '@typescript-eslint/';
for (const config of airbnbCompat) {
  if (!config.rules) continue;
  config.rules = Object.fromEntries(
    Object.entries(config.rules).filter(([name]) => !name.startsWith(tsPrefix) || name.slice(tsPrefix.length) in ts.plugin.rules),
  );
}

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
      /* Luna payloads are untyped and numbers in messages are fine */
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowAny: true,
          allowBoolean: true,
          allowNumber: true,
          allowNullish: true,
        },
      ],
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
    /* unit tests: type-checked against the test tsconfig, may use dev dependencies */
    files: ['tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          packageDir: __dirname,
        },
      ],
      /* tests load the plain-JS frontend modules with require() */
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      /* node:test's describe()/it() return promises that are not meant to be awaited */
      '@typescript-eslint/no-floating-promises': 'off',
      /* assertions on JSON.parse() output are the whole point here */
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['services/**/*.{js,ts}', 'tests/**/*.ts', 'tools/*.js', 'eslint.config.{js,mjs,cjs}', 'webpack.config.js'],
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
      '@typescript-eslint/no-require-imports': 'off',
      /* build scripts may use dev dependencies */
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
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['babel.config.json', 'tsconfig.json', 'tsconfig.test.json'],
    rules: {
      /* has various issues (e.g., forcing arrays/objects onto a single line) */
      'prettier/prettier': 'off',
    },
  },
);
