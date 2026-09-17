import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Nothing on screen is moving any more.
 *
 * Anything read off a moving element is read through its animation: a toast
 * fading in measures about 1.6:1 for its first frames, and a control in a
 * dialog still zooming in measures 95% of its height — 41.8px where §11 asks
 * for 44. Both pass once settled, so without this the check fails at random.
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
}

/** Scan what is on screen, once nothing is animating (SPEC §10.5). */
export async function expectAxeClean(page: Page): Promise<void> {
  await settled(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}
