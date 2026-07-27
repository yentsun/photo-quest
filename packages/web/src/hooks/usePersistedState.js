/**
 * @file LocalStorage-backed state hook.
 *
 * Persists a value across sessions and resets it when the storage key changes.
 * Defaults are removed from storage to keep it clean.
 */

import { useState, useEffect } from 'react';

function readStorage(key, defaultValue, parse) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return parse(stored);
  } catch {
    return defaultValue;
  }
}

function writeStorage(key, value, defaultValue, serialize) {
  try {
    if (value === defaultValue) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, serialize(value));
    }
  } catch {
    /* Ignore quota/private-mode errors. */
  }
}

export default function usePersistedState(key, defaultValue, options = {}) {
  const { serialize = String, parse = (v) => v } = options;

  const [value, setValue] = useState(() => readStorage(key, defaultValue, parse));

  useEffect(() => {
    setValue(readStorage(key, defaultValue, parse));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    writeStorage(key, value, defaultValue, serialize);
  }, [key, value, defaultValue, serialize]);

  return [value, setValue];
}
