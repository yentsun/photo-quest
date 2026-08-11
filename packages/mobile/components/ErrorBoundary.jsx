import React from 'react';
import { View, Text } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#002b36' }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: '#dc322f', marginBottom: 16 }}>Something went wrong</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
