import { useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, Pressable, Platform } from 'react-native';
import Icon from './Icon';
import IconButton from './IconButton';
import { colors, fontSize, fontFamily, space } from '../theme/tokens';
import { SCRIM_IN, MODAL_IN } from '../theme/presets';

export default function Modal({
  open,
  onClose,
  title,
  children,
  closable = true,
}) {
  const scrim = useRef(new Animated.Value(0)).current;
  const panel = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(scrim, { toValue: 1, duration: SCRIM_IN.duration, useNativeDriver: false }),
        Animated.timing(panel, { toValue: 1, duration: MODAL_IN.duration, useNativeDriver: false }),
      ]).start();
    } else {
      scrim.setValue(0);
      panel.setValue(0);
    }
  }, [open, scrim, panel]);

  useEffect(() => {
    if (!open || !closable) return;
    if (Platform.OS !== 'web') return;

    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closable, onClose]);

  if (!open) return null;

  const scrimOpacity = scrim;
  const panelTranslateY = panel.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const panelOpacity = panel;

  return (
    <Pressable
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,12,16,0.65)',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
        padding: 20,
        opacity: scrimOpacity,
      }}
      onPress={closable ? onClose : undefined}
    >
      <Animated.View
        style={{
          position: 'relative',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.textMut,
          boxShadow: '0 16px 40px rgba(0,12,16,0.4)',
          width: 'min(540px, 100%)',
          maxHeight: '90vh',
          flexDirection: 'column',
          overflow: 'auto',
          opacity: panelOpacity,
          transform: [{ translateY: panelTranslateY }],
        }}
        // Stop click propagation so scrim click closes but panel click doesn't
      >
        <Pressable onPress={(e) => e?.stopPropagation?.()}>
          {title && (
            <View style={{
              backgroundColor: colors.bg,
              borderBottomWidth: 1,
              borderColor: colors.border,
              paddingVertical: 6,
              paddingLeft: 14,
              paddingRight: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}>
              <Text style={{
                flex: 1,
                fontSize: fontSize.sm,
                fontWeight: '500',
                color: colors.textEm,
              }}>
                {title}
              </Text>
              {closable && (
                <IconButton
                  icon={<Icon name="close" size="sm" />}
                  onPress={onClose}
                  label="Close modal"
                />
              )}
            </View>
          )}
          <View style={{
            padding: 14,
            flexDirection: 'column',
            gap: space.gap,
          }}>
            {children}
          </View>
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}
