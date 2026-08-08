import { Modal as RNModal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { colors, spacing, fontSize, radius } from './theme';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  closable?: boolean;
}

export function Modal({ open, onClose, title, children, closable = true }: ModalProps) {
  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && closable) onClose();
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }
  }, [open, closable, onClose]);

  return (
    <RNModal visible={open} transparent animationType="fade" onRequestClose={closable ? onClose : undefined}>
      <Pressable style={styles.scrim} onPress={closable ? onClose : undefined}>
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          {title ? (
            <View style={styles.titlebar}>
              <Text style={styles.title}>{title}</Text>
              {closable && <IconButton icon={<Icon name="close" size={16} />} label="Close" onPress={onClose} />}
            </View>
          ) : null}
          <View style={styles.body}>{children}</View>
        </View>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    backgroundColor: colors.bgHighlight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
  },
  titlebar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.fg,
    fontSize: fontSize.lg,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  body: {
    padding: spacing.lg,
  },
});
