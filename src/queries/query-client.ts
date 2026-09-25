import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    // One retry absorbs a blip; more would keep a real failure on a skeleton for seconds.
    // Reads keep the default networkMode ('online'), which pauses them while
    // there is no network, and 'always' was tried here and reverted. It turns
    // another option off behind your back: `refetchOnReconnect` defaults to
    // `networkMode !== 'always'` (query-core `defaultQueryOptions`), so with it
    // set, a screen that failed while offline would never refresh itself when
    // the network came back — the opposite of what it was set for. Paused is
    // also the better failure while offline: the rows already in the cache stay
    // on screen under the banner instead of racing a refetch that cannot land,
    // and query-core dispatches `status: 'error'` on a failed refetch whether
    // or not the cache still holds rows. A first load with no network waits on
    // its skeleton until the network returns, which the banner explains.
    queries: { retry: 1 },
    // A retried upload is a second upload. Retrying is the user's call (§8.2 "Retry").
    // 'always' here is what makes §8.2's "Changes won't save" true, and it is a
    // write-only setting: the default 'online' does not fail a write with no
    // network, it *pauses* it and replays it on reconnect, so a change the
    // banner had just said would not save would land minutes later with nothing
    // on screen having said so — the §8.1 rule against failing silently, broken
    // in the direction hardest to notice. Mutations have no refetchOnReconnect
    // to lose by it.
    mutations: { retry: false, networkMode: 'always' },
  },
});
