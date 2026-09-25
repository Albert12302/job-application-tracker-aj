import { afterEach, describe, expect, it, vi } from 'vitest';
import { WriteRateLimitedError } from '@/data/write-limit';
import { OFFLINE, OfflineError, ReportedError, errorReference, failureMessage, reporting, WAIT_A_MINUTE } from './errors';

/**
 * What a failure becomes when the browser has no network (SPEC §8.2 "Offline").
 *
 * The thing worth holding still is that an offline failure is not a bug: it is
 * never written to `app_errors` and never carries a reference, exactly as a
 * refused write is not. Reporting one would also be a request with no network
 * to make it on.
 */

// Only whether a row is written matters here, never its contents.
const insert = vi.fn(async () => ({ error: null }));
vi.mock('@/data/app-errors', () => ({ insertAppError: () => insert() }));

/** navigator.onLine is read-only; the offline state is what the browser reports. */
function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

afterEach(() => {
  vi.restoreAllMocks();
  insert.mockClear();
});

const fails = () => Promise.reject(new TypeError('Failed to fetch'));

describe('reporting, offline', () => {
  it('turns a failure into an OfflineError and reports nothing', async () => {
    setOnline(false);
    const error = await reporting('load_applications', fails).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(OfflineError);
    expect(insert).not.toHaveBeenCalled();
    expect(errorReference(error)).toBeNull();
  });

  it('reports the same failure when the browser thinks it is online', async () => {
    setOnline(true);
    const error = await reporting('load_applications', fails).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ReportedError);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(errorReference(error)).toHaveLength(8);
  });

  it('leaves an expected outcome alone, offline or not', async () => {
    setOnline(false);
    const rejected = new Error('cover letter refused');
    const error = await reporting('attach_cover_letter', () => Promise.reject(rejected), () => true).catch(
      (thrown: unknown) => thrown,
    );

    // Offline is the wrong reason for a file the app refused before any request.
    expect(error).toBe(rejected);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('failureMessage', () => {
  it('adds the offline line', () => {
    expect(failureMessage("Couldn't save the filter.", new OfflineError())).toBe(`Couldn't save the filter. ${OFFLINE}`);
  });

  it('still adds the wait for a refused write', () => {
    expect(failureMessage("Couldn't save the filter.", new WriteRateLimitedError())).toBe(
      `Couldn't save the filter. ${WAIT_A_MINUTE}`,
    );
  });

  it('leaves every other failure with the plain copy', () => {
    expect(failureMessage("Couldn't save the filter.", new Error('boom'))).toBe("Couldn't save the filter.");
  });
});
