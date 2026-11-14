// js/store.js
// Purpose: the one observable state store every module reads and writes (Session Primer v2, STATE).
// Exports: store { get, set, subscribe }, INITIAL_STATE
// Owner: Claude · Task C2
//
// state = { countryId, view: 'country'|'basin', year: 2012..2025, focus: <variable id>, playing: boolean }
// store.set(patch) shallow-merges and notifies subscribers only if at least one value really changed.
// store.subscribe(fn) returns an unsubscribe function; fn(state, prev) runs after every change.

export const INITIAL_STATE = Object.freeze({
  countryId: 'canada',
  view: 'country',
  year: 2023,
  focus: 'fire_frp',
  playing: false,
});

let state = { ...INITIAL_STATE };
const listeners = new Set();

export const store = {
  /** Current state object. Treat it as read-only. */
  get() {
    return state;
  },

  /** Shallow merge. Returns true when something changed (and subscribers were notified). */
  set(patch) {
    if (!patch || typeof patch !== 'object') return false;
    const next = { ...state };
    let changed = false;
    for (const key of Object.keys(patch)) {
      const value = patch[key];
      if (value === undefined) continue;
      if (!Object.is(next[key], value)) {
        next[key] = value;
        changed = true;
      }
    }
    if (!changed) return false;
    const prev = state;
    state = Object.freeze(next);
    for (const fn of Array.from(listeners)) {
      try {
        fn(state, prev);
      } catch (err) {
        console.warn('store: a subscriber threw', err);
      }
    }
    return true;
  },

  /** Register fn(state, prev). Returns unsubscribe(). */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Test helper: back to the initial state (does not notify). */
  reset() {
    state = { ...INITIAL_STATE };
  },
};

export default store;
