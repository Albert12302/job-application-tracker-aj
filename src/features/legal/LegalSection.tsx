import type { ReactNode } from 'react';

/** One headed section of a legal page. Lists inside it get their bullets here. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
      <h2 className="font-heading text-lg font-semibold">{heading}</h2>
      {children}
    </section>
  );
}
