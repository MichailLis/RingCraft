import { createRequire } from 'node:module';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';

// typescript-eslint does not support the TypeScript 7 (native) package yet, so route its
// `require('typescript')` calls to the side-by-side TS 6 API package. tsc itself still uses TS 7.
const require = createRequire(import.meta.url);
const Module = require('node:module');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request === 'typescript' ? '@typescript/typescript6' : request, ...rest);
};

const { default: tseslint } = await import('typescript-eslint');

export default tseslint.config(
  { ignores: ['dist', 'playwright-report', 'test-results', '.superpowers', '.claude'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest']
);
