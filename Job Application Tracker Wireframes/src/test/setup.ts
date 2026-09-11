import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library's auto-cleanup never
// registers itself. Do it here instead of per test file.
afterEach(cleanup)
