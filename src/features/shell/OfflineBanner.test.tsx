import { act, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';

/**
 * The banner appears while the browser has no network and leaves when it comes
 * back (SPEC §8.2), and its live region is there in both states (§10.4).
 */

const BANNER = "You're offline. Changes won't save.";

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

/** The browser's own event; useSyncExternalStore is subscribed to it. */
function announce(event: 'online' | 'offline') {
  act(() => {
    window.dispatchEvent(new Event(event));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('OfflineBanner', () => {
  it('says nothing while the browser has a network', () => {
    setOnline(true);
    render(<OfflineBanner />);

    expect(screen.queryByText(BANNER)).toBeNull();
    // The region is mounted empty rather than arriving with its text (§10.4).
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('appears when the network goes, and leaves when it returns', () => {
    setOnline(true);
    render(<OfflineBanner />);

    setOnline(false);
    announce('offline');
    expect(screen.getByText(BANNER)).toBeTruthy();

    setOnline(true);
    announce('online');
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it('is already showing when a page loads with no network', () => {
    setOnline(false);
    render(<OfflineBanner />);

    expect(screen.getByText(BANNER)).toBeTruthy();
  });

  it('has no axe violations while showing', async () => {
    setOnline(false);
    const { container } = render(<OfflineBanner />);

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
