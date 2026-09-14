import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library's auto-cleanup never
// registers itself. Do it here instead of per test file.
afterEach(cleanup)

// jsdom has no CSS.escape, which user-event uses to find a radio's group when an
// arrow key moves the choice. Radio names here come from useId (`:r1:`-style), so
// a minimal escape of anything outside [A-Za-z0-9_-] is enough.
if (typeof globalThis.CSS === 'undefined') {
  Object.defineProperty(globalThis, 'CSS', { value: {}, configurable: true })
}
if (typeof globalThis.CSS.escape !== 'function') {
  globalThis.CSS.escape = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`)
}
