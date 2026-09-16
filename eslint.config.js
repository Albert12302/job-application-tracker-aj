import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config([
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'src/components/ui'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // CLAUDE.md "Conventions": TypeScript strict; no `any`.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Node-side config and Playwright specs.
    files: ['*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
])
