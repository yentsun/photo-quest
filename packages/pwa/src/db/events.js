/**
 * @file Tiny pub/sub for local IDB mutations.
 *
 * Every action in db/actions.js calls `emitMutation()` after committing.
 * The sync hook subscribes so the server pill can flash "syncing" even
 * for purely local writes that never touch the network.
 */

const listeners = new Set();

export function emitMutation() {
  console.debug('[emit] mutation →', listeners.size, 'listeners');
  for (const fn of listeners) fn();
}

export function onMutation(fn) {
  listeners.add(fn);
  console.debug('[emit] +listener, total', listeners.size);
  return () => {
    listeners.delete(fn);
    console.debug('[emit] -listener, total', listeners.size);
  };
}
