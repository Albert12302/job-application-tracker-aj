import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LegalLinks } from '@/components/LegalLinks';
import { APP_NAME } from '@/lib/app-name';

/**
 * The shell the four signed-out screens share (SPEC §4.1, §4.1c–d): the app's
 * name, one line saying what this screen is for, and a card of the same width
 * wherever the user lands. Extracted when the reset screens arrived rather than
 * copied three times — a card that drifts between them reads as two apps.
 *
 * It carries `<main id="main">`, so the skip link has its target on every one
 * of them (§10.2). The privacy and terms links sit in a footer at the bottom
 * of the window, the same place as on the signed-in screens (§4.7).
 */
export function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-10">
        <Card className="w-full max-w-[340px] gap-5 px-1.5 py-6 shadow-xs">
          <CardHeader className="justify-items-center text-center">
            <h1 className="font-heading text-xl font-semibold">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{children}</CardContent>
        </Card>
      </main>
      <footer className="py-4">
        <LegalLinks />
      </footer>
    </div>
  );
}
