import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { actions, toasterTimeout } from '@photo-quest/shared';
import { useGlobal } from '../contexts/GlobalContext';
import Icon from './Icon';
import IconButton from './IconButton';
import ProgressBar from './ProgressBar';
import { accents, colors, fontSize } from '../theme/tokens';

const TYPES = {
  success: { bg: '#1a3a1d', border: accents.green },
  error: { bg: '#3a1d1a', border: accents.red },
  info: { bg: '#1a2a3a', border: accents.blue },
};

export default function ToasterMessage() {
  const { dispatch, state } = useGlobal();
  const { errorMessage, errorStatus, toastMessage, toastType, toastProgress } = state;

  const message = toastMessage || errorMessage;
  const type = toastType || (errorStatus === 500 ? 'error' : 'info');
  const isToast = Boolean(toastMessage);

  useEffect(() => {
    if (!message || toastProgress) return;
    const timeoutId = setTimeout(
      () => dispatch({ type: isToast ? actions.TOAST_DISMISSED : actions.ERROR_DISMISSED }),
      toasterTimeout
    );
    return () => clearTimeout(timeoutId);
  }, [message, isToast, toastProgress, dispatch]);

  if (!message || message === 'Unauthorized') return null;

  const theme = TYPES[type] ?? TYPES.info;
  const dismiss = () => dispatch({ type: isToast ? actions.TOAST_DISMISSED : actions.ERROR_DISMISSED });

  return (
    <View
      style={{
        position: 'absolute', bottom: 16, right: 16, zIndex: 9999,
        backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border,
        paddingVertical: 10, paddingLeft: 14, paddingRight: 10,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        elevation: 6,
        shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: 'column', gap: 6 }}>
        <Text style={{ color: colors.textEm, fontSize: fontSize.sm }}>
          {errorStatus === 500 && !isToast ? 'Server Error: ' : ''}
          {message}
        </Text>
        {toastProgress && (
          <ProgressBar
            value={toastProgress.value ?? 0}
            max={toastProgress.max ?? 1}
            width={28}
            brackets={false}
            showPct={false}
            indeterminate={toastProgress.indeterminate}
            variant="light"
          />
        )}
      </View>
      <IconButton
        icon={<Icon name="close" size="sm" color={colors.textMut} />}
        onPress={dismiss}
        label="Dismiss message"
        size="sm"
      />
    </View>
  );
}
