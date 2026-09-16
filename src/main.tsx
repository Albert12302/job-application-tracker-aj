import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/queries/query-client'
import { useSession } from '@/queries/use-session'
import { router } from './App.tsx'
import './styles/globals.css'

/** Auth provider: feeds the session to the router and reacts when it changes. */
// eslint-disable-next-line react-refresh/only-export-components -- the entry module is never hot-swapped
function SessionRouter() {
  const session = useSession()

  useEffect(() => {
    // Nothing to re-run yet: the router is not mounted until the session is
    // known, and invalidating now would run the guards against the placeholder
    // context — redirecting an expired session without saying it expired.
    if (session.status === 'loading') return
    // Any sign-out — deliberate, expired, or from another tab — drops every
    // cached row, so the next person at this browser sees none of it (§9.6).
    if (session.status === 'signed-out') queryClient.clear()
    // Re-run the guards: off /sign-in after signing in, onto it after signing out.
    void router.invalidate()
  }, [session])

  // supabase-js restores the session from storage before this resolves; the
  // pause is a frame, not a page load, so it gets no spinner (§8.1).
  if (session.status === 'loading') return <p role="status" className="sr-only">Loading</p>

  return <RouterProvider router={router} context={{ session }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionRouter />
      <Toaster position="bottom-center" />
    </QueryClientProvider>
  </StrictMode>,
)
