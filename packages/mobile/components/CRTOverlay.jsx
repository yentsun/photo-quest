import { View } from 'react-native';

export default function CRTOverlay() {
  return (
    <>
      <View
        style={{
          position: 'absolute', inset: 0, zIndex: 100,
          pointerEvents: 'none',
          ...(typeof window === 'undefined' ? {} : {
            backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
          }),
        }}
      />
      <View
        style={{
          position: 'absolute', inset: 0, zIndex: 100,
          pointerEvents: 'none',
          ...(typeof window === 'undefined' ? {} : {
            backgroundImage: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)',
          }),
        }}
      />
    </>
  );
}
