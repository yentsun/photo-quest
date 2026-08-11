import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

function readStorage(key, defaultValue, parse) {
  try {
    return AsyncStorage.getItem(key).then(stored => {
      if (stored === null) return defaultValue;
      try { return parse(stored); } catch { return defaultValue; }
    });
  } catch { return Promise.resolve(defaultValue); }
}

function writeStorage(key, value, defaultValue, serialize) {
  try {
    if (value === defaultValue) {
      AsyncStorage.removeItem(key).catch(() => {});
    } else {
      AsyncStorage.setItem(key, serialize(value)).catch(() => {});
    }
  } catch {}
}

export default function usePersistedState(key, defaultValue, options = {}) {
  const { serialize = JSON.stringify, parse = JSON.parse } = options;
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    let cancelled = false;
    readStorage(key, defaultValue, parse).then(v => {
      if (!cancelled) setValue(v);
    });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    writeStorage(key, value, defaultValue, serialize);
  }, [key, value, defaultValue, serialize]);

  return [value, setValue];
}
