import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ belongs to Playwright; Vitest owns only co-located unit and
    // component tests (CLAUDE.md "Testing").
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/services/**'],
    },
  },
})
