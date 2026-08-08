import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Link, usePathname } from 'expo-router';
import QRCodeSvg from 'react-native-qrcode-svg';
import { clientRoutes } from '@photo-quest/shared';
import { Icon, Modal } from '../ui';
import { colors, spacing, fontSize, radius } from '../ui/theme';
import { fetchNetworkInfo } from '../../utils/api';

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Header({ collapsed, onToggle }: HeaderProps) {
  const [networkUrl, setNetworkUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetchNetworkInfo()
      .then((info) => {
        if (info.ip) {
          const webPort = 7838;
          setNetworkUrl(`http://${info.ip}:${webPort}`);
        }
      })
      .catch(() => {});
  }, []);

  const isActive = (route: string) => pathname === route;

  const navItem = (route: string, iconName: string, label: string) => {
    const active = isActive(route);
    return (
      <Link href={route as any} asChild>
        <Pressable style={[styles.navItem, active && styles.navItemActive]} accessibilityLabel={collapsed ? label : undefined}>
          <Icon name={iconName as any} size={18} color={active ? colors.accent : colors.fg} />
          {!collapsed && <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>}
        </Pressable>
      </Link>
    );
  };

  return (
    <>
      <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
        <View style={styles.logo}>
          <Link href={clientRoutes.dashboard as any} asChild>
            <Pressable style={styles.logoLink}>
              {!collapsed && (
                <View>
                  <Text style={styles.logoText}>Photo Quest</Text>
                  <Text style={styles.version}>v0.7.1</Text>
                </View>
              )}
            </Pressable>
          </Link>
        </View>

        <View style={styles.nav}>
          {navItem(clientRoutes.dashboard, 'folder', 'Library')}
          {navItem(clientRoutes.liked, 'heart', 'Liked')}
          {navItem(clientRoutes.tags, 'list', 'Tags')}
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.toggle} onPress={onToggle} accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={collapsed ? 'next' : 'prev'} size={16} color={colors.fgDim} />
          </Pressable>
        </View>
      </View>

      {networkUrl && (
        <Modal open={showQr} onClose={() => setShowQr(false)} title="Open on another device">
          <View style={{ alignItems: 'center', gap: spacing.lg }}>
            <View style={{ padding: spacing.lg, backgroundColor: '#fff', borderRadius: radius.md }}>
              <QRCode value={networkUrl} size={220} />
            </View>
            <Text style={{ color: colors.fgDim, fontSize: fontSize.sm, fontFamily: 'monospace', textAlign: 'center' }}>{networkUrl}</Text>
          </View>
        </Modal>
      )}
    </>
  );
}

function QRCode({ value, size }: { value: string; size: number }) {
  return (
    <View style={{ padding: spacing.lg, backgroundColor: '#fff', borderRadius: radius.md }}>
      <QRCodeSvg value={value} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 200,
    backgroundColor: colors.bgHighlight,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: spacing.md,
  },
  sidebarCollapsed: {
    width: 48,
  },
  logo: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoText: {
    color: colors.fg,
    fontSize: fontSize.lg,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  version: {
    color: colors.fgDim,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },
  nav: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginHorizontal: spacing.xs,
    marginVertical: 2,
  },
  navItemActive: {
    backgroundColor: 'rgba(38,139,210,0.15)',
  },
  navLabel: {
    color: colors.fg,
    fontSize: fontSize.md,
    fontFamily: 'monospace',
  },
  navLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  toggle: {
    padding: spacing.xs,
  },
});
