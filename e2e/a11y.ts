import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Scan what is on screen, once nothing is animating (SPEC §10.5).
 *
 * The wait is the point of having this in one place: a toast fading in
 * measures about 1.6:1 for its first frames and passes once settled, and a
 * button fading out of its pending state does the same — a scan that lands
 * mid-fade fails at random (CLAUDE.md).
 */
export async function expectAxeClean(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}
