import js from '@eslint/js';
import ts from 'typescript-eslint';

import jsoncParser from 'jsonc-eslint-parser';

import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';

/* includes the plugin and enables the rules */
import prettierRecommendedConfig from 'eslint-plugin-prettier/recommended';

import globals from 'globals';

/* __dirname is not available, so fake it */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
 * Rules formerly inherited from eslint-config-airbnb-typescript. That package
 * is unmaintained (still peers on ESLint 8) and, via airbnb-typescript/base,
 * only ever contributed these TypeScript re-mappings plus the import settings
 * below - so they are spelled out here instead.
 */
const airbnbTypescriptRules = {
  '@typescript-eslint/default-param-last': 'error',
  '@typescript-eslint/dot-notation': ['error', { allowKeywords: true }],
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'] },
    { selector: 'function', format: ['camelCase', 'PascalCase'] },
    { selector: 'typeLike', format: ['PascalCase'] },
  ],
  '@typescript-eslint/no-dupe-class-members': 'error',
  '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions', 'functions', 'methods'] }],
  '@typescript-eslint/no-loop-func': 'error',
  '@typescript-eslint/no-loss-of-precision': 'error',
  '@typescript-eslint/no-redeclare': 'error',
  '@typescript-eslint/no-shadow': 'error',
  '@typescript-eslint/no-use-before-define': ['error', { functions: true, classes: true, variables: true }],
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  'import/extensions': ['error', 'ignorePackages', { js: 'never', mjs: 'never', jsx: 'never', ts: 'never', tsx: 'never' }],
};

const importSettings = {
  'import/parsers': {
    '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'],
  },
  'import/resolver': {
    node: {
      extensions: ['.mjs', '.js', '.json', '.ts', '.d.ts'],
    },
    /* import doesn't seem to check .ts files without this */
    typescript: {},
  },
  'import/extensions': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.d.ts'],
  'import/external-module-folders': ['node_modules', 'node_modules/@types'],
};

export default ts.config(
  {
    /* the Enyo views stay unlinted for now; the framework-free core modules are covered */
    ignores: [
      'frontend/**',
      '!frontend/core/**',
      '!frontend/configutils.js',
      '!frontend/baseurl.js',
      'lib/**',
      'node_modules/**',
      'dist/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
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
    settings: importSettings,
    rules: {
      /* only enable these for TypeScript files */
      ...ts.configs.stylisticTypeChecked[0].rules,
      ...airbnbTypescriptRules,
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
      '@typescript-eslint/no-unsafe-return': 'off',
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
    /* platform boundary: only services/platform may touch Node built-ins and runtime packages */
    files: ['services/**/*.{js,ts}'],
    ignores: ['services/platform/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'fs',
            'child_process',
            'stream',
            'crypto',
            'http',
            'https',
            'node-fetch',
            'progress-stream',
            'stream.pipeline-shim',
            'bluebird',
            'core-js/stable',
            'regenerator-runtime/runtime',
            '@throwaway96/node-load-cert-dir',
          ].map((name) => ({
            name,
            message: `Import this through ./platform instead (see services/platform/index.ts).`,
          })),
        },
      ],
    },
  },
  {
    /*
     * The service runs on the TV's Node.js, which is 0.10/0.12 on webOS 3.x.
     * Syntax is handled by Babel and ES built-ins by core-js, but nothing can
     * add Node.js APIs that did not exist yet - so gate those statically.
     */
    files: ['services/**/*.{js,ts}'],
    /* the shim that *defines* the newer Buffer API on old Node */
    ignores: ['services/platform/buffer-shim.js'],
    plugins: { n: nodePlugin },
    rules: {
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          version: '>=0.10.0',
          ignores: [
            /* provided by services/platform/buffer-shim.js */
            'Buffer.from',
            /* type-only usages */
            'child_process.ChildProcess',
            'URL',
          ],
        },
      ],
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
    /*
     * Plain ES5 CommonJS, by design:
     *  - tests/legacy: smoke harness that runs on Node.js 0.10
     *  - frontend/core, configutils, baseurl: bundled by enyo-dev (uglify-js 2) for old webOS WebKit
     */
    files: ['tests/legacy/**/*.js', 'frontend/core/**/*.js', 'frontend/configutils.js', 'frontend/baseurl.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-console': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'prefer-rest-params': 'off',
      'prefer-spread': 'off',
      'object-shorthand': 'off',
      'func-names': 'off',
      'prefer-arrow-callback': 'off',
      'prefer-template': 'off',
      'no-buffer-constructor': 'off',
      'prettier/prettier': ['error', { trailingComma: 'none' }],
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
