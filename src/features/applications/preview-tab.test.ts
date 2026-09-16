import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPreviewTab } from './preview-tab';

describe('openPreviewTab', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens a blank tab, cuts it off from the app, then sends it to the URL without a history entry', () => {
    const fake = { opener: window as Window | null, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(fake as unknown as Window);

    const tab = openPreviewTab();
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(fake.opener).toBeNull();

    tab!.show('https://storage.example/letter.pdf?token=t');
    expect(fake.location.replace).toHaveBeenCalledWith('https://storage.example/letter.pdf?token=t');
    tab!.close();
    expect(fake.close).toHaveBeenCalledTimes(1);
  });

  it('is null when the browser blocks the tab', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openPreviewTab()).toBeNull();
  });
});
