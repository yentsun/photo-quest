import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, Platform } from 'react-native';
import Button from './Button';
import { colors, fontSize, fontFamily } from '../theme/tokens';

const MENU_TOP = 26 + 6;

export default function Select({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value;

  const toggle = () => {
    if (!open && Platform.OS === 'web' && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right, width: r.width });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const isFixedWeb = open && Platform.OS === 'web' && menuPos;
  const menuStyle = isFixedWeb
    ? { position: 'fixed', top: menuPos.top, right: menuPos.right, minWidth: menuPos.width, zIndex: 1000 }
    : { position: 'absolute', top: MENU_TOP, right: 0, minWidth: '100%', zIndex: 60 };

  return (
    <View ref={wrapRef} style={{ position: 'relative' }}>
      <Button variant="ghost" size="sm" onPress={toggle}>
        <Text selectable={false} style={{ color: colors.textEm, fontSize: fontSize.xs, fontFamily: fontFamily.mono }} numberOfLines={1}>
          {label}
        </Text>
        <Text
          selectable={false}
          style={{
            color: colors.textMut,
            fontSize: fontSize.xs,
            lineHeight: fontSize.xs,
            transform: [{ rotate: open ? '180deg' : '0deg' }],
          }}
        >
          ▾
        </Text>
      </Button>

      {open && (
        <View
          style={[
            menuStyle,
            {
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.textMut,
              padding: 5,
              shadowColor: '#002b36',
              shadowOffset: { width: 0, height: 10 },
              shadowRadius: 28,
              shadowOpacity: 0.22,
              elevation: 8,
            },
          ]}
        >
          {options.map(({ value: v, label: l }) => (
            <Pressable
              key={v}
              onPress={() => { onChange(v); setOpen(false); }}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingVertical: 6,
                paddingHorizontal: 8,
                backgroundColor: hovered ? colors.surface : 'transparent',
              })}
            >
              <Text
                selectable={false}
                style={{
                  flex: 1,
                  color: v === value ? colors.textEm : colors.text,
                  fontSize: fontSize.base,
                  fontFamily: fontFamily.mono,
                }}
              >
                {l}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
