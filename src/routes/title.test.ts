import { describe, expect, it } from 'vitest';
import { APP_NAME, pageTitle } from './title';

describe('pageTitle', () => {
  it('puts the page first, because a tab narrows from the right', () => {
    expect(pageTitle('Your Stats')).toBe("Your Stats — AJ's Hunt");
  });

  it('names the app as the header does, so the tab and the page agree', () => {
    expect(APP_NAME).toBe("AJ's Hunt");
  });
});
