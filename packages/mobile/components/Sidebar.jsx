import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Icon from './Icon';
import { colors, fontSize, fontFamily, layout, space } from '../theme/tokens';
import { useBreakpoint } from '../theme/breakpoints';
const LOGO = require('../assets/icon.png');
import usePersistedState from '../hooks/usePersistedState';

const NAV_ITEMS = [
  { route: '/',          icon: 'image',   label: 'Library' },
  { route: '/liked',     icon: 'heart',   label: 'Liked' },
  { route: '/tags',      icon: 'list',    label: 'Tags' },
];

const SIDEBAR_W = layout.sidebarWidth;
const SIDEBAR_COLLAPSED = layout.sidebarCollapsedWidth;

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile } = useBreakpoint();
  const [collapsed, setCollapsed] = usePersistedState('sidebar-collapsed', false);

  const width = isMobile ? SIDEBAR_COLLAPSED : (collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_W);
  const showLabels = !isMobile && !collapsed;

  return (
    <View style={{
      width,
      backgroundColor: colors.bg,
      borderRightWidth: 1,
      borderColor: colors.border,
      flexDirection: 'column',
      zIndex: 20,
      overflow: 'hidden',
    }}>
      <View style={{
        padding: 14,
        paddingVertical: showLabels ? 14 : 14,
        paddingHorizontal: showLabels ? 16 : 0,
        borderBottomWidth: 1,
        borderColor: colors.border,
        alignItems: showLabels ? 'flex-start' : 'center',
        gap: space.gap,
      }}>
        <Image source={LOGO} style={{ width: 28, height: 28, flexShrink: 0 }} resizeMode="contain" />
        {showLabels && (
          <View style={{ flexDirection: 'column', gap: 0 }}>
            <Text style={{ fontFamily: fontFamily.mono, fontSize: fontSize.md, fontWeight: '600', color: colors.textEm }}>Photo Quest</Text>
            <Text style={{ fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textMut, fontWeight: '400' }}>v0.7.1</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, paddingVertical: 8 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.route || (item.route !== '/' && pathname.startsWith(item.route));
          return (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route)}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.gap,
                paddingVertical: 6,
                paddingHorizontal: showLabels ? 14 : 6,
                backgroundColor: active ? colors.accentBg : hovered ? colors.surface : 'transparent',
                borderLeftWidth: 2,
                borderColor: active ? colors.accent : 'transparent',
                justifyContent: showLabels ? 'flex-start' : 'center',
              })}
            >
              <Icon name={item.icon} size="sm" color={active || pathname.startsWith(item.route) ? colors.textEm : colors.text} />
              {showLabels && (
                <Text style={{
                  fontFamily: fontFamily.mono,
                  fontSize: fontSize.base,
                  color: active ? colors.textEm : colors.text,
                }}>
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {!isMobile && (
        <View style={{ padding: 10, borderTopWidth: 1, borderColor: colors.border, alignItems: showLabels ? 'stretch' : 'center' }}>
          <Pressable
            onPress={() => setCollapsed(!collapsed)}
            style={({ hovered }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              padding: 5,
              borderRadius: 4,
              backgroundColor: hovered ? colors.surface : 'transparent',
            })}
          >
            <Icon name={collapsed ? 'next' : 'prev'} size="sm" color={colors.textMut} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
