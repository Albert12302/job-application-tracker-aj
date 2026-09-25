/**
 * Whether the browser has a network (SPEC §8.2 "Offline").
 *
 * `navigator.onLine` is only trustworthy in one direction: false means there is
 * no network and a request cannot land, while true means no more than that an
 * interface is up — a captive portal or a dead uplink still reads as online. So
 * it is asked here as "is this definitely offline", never as proof of a
 * connection: a failure that happens while it reads true keeps the ordinary
 * error path, reference and all.
 *
 * It sits in lib/ rather than hooks/ because queries/errors.ts asks the same
 * question outside React, on the catch of every failed request.
 */
export function isOffline(): boolean {
  return navigator.onLine === false;
}

/** Calls `onChange` whenever the browser gains or loses its network. */
export function subscribeToOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
