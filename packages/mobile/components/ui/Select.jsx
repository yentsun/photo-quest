import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fontSize, fontFamily } from '../../theme/tokens';

const BASE = {
  flexDirection: 'row',
  alignItems: 'center',
  height: 26,
  paddingHorizontal: 8,
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderColor: colors.border,
  cursor: 'pointer',
};

const OPTION = {
  paddingHorizontal: 10,
  paddingVertical: 6,
  backgroundColor: colors.surface,
};

export default function Select({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value;

  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        style={(state) => {
          const { pressed, hovered } = state;
          const bg = hovered ? colors.surface : 'transparent';
          const bd = hovered ? colors.textMut : colors.border;
          const cl = hovered ? colors.textEm : colors.text;
          return [BASE, { backgroundColor: bg, borderColor: bd }];
        }}
        onPress={() => setOpen(!open)}
      >
        <Text style={{ color: open ? colors.textEm : colors.text, fontSize: fontSize.sm, fontFamily: fontFamily.mono }}>
          {label}
        </Text>
      </Pressable>
      {open && (
        <View style={{
          position: 'absolute',
          top: 26 + 2,
          left: 0,
          right: 0,
          zIndex: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          {options.map(({ value: v, label: l }) => (
            <Pressable
              key={v}
              style={({ hovered }) => [
                OPTION,
                hovered && { backgroundColor: colors.dim },
              ]}
              onPress={() => { onChange(v); setOpen(false); }}
            >
              <Text style={{
                color: v === value ? colors.textEm : colors.text,
                fontSize: fontSize.sm,
                fontFamily: fontFamily.mono,
              }}>
                {l}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
