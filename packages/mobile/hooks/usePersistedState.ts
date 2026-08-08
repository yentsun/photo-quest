import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

function readStorage<T>(key: string, defaultValue: T, parse: (v: string) => T): T {
  try {
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  options: { serialize?: (v: T) => string; parse?: (v: string) => T } = {}
): [T, (value: T) => void] {
  const { serialize = JSON.stringify, parse = JSON.parse } = options;
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((stored) => {
        if (stored !== null) {
          try {
            setValue(parse(stored));
          } catch { /* ignore */ }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    if (JSON.stringify(value) === JSON.stringify(defaultValue)) {
      AsyncStorage.removeItem(key).catch(() => {});
    } else {
      AsyncStorage.setItem(key, serialize(value)).catch(() => {});
    }
  }, [key, value, defaultValue, serialize, loaded]);

  return [value, setValue];
}
