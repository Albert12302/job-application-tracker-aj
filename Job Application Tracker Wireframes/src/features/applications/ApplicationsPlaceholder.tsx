/**
 * Where sign-in lands (§4.1 "straight to the dashboard"). The list itself is
 * SPEC §6 step 2; this holds the route so auth has a destination.
 */
export function ApplicationsPlaceholder() {
  return (
    <section aria-labelledby="applications-heading" className="flex flex-col gap-2">
      <h1 id="applications-heading" className="font-heading text-lg font-semibold">
        Applications
      </h1>
      <p className="text-sm text-muted-foreground">The application list isn't built yet.</p>
    </section>
  );
}
