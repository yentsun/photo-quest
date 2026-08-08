import { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#002b36', padding: 24 }}>
          <Text style={{ color: '#dc322f', fontSize: 20, fontFamily: 'monospace', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: '#839496', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>{this.state.error?.message}</Text>
          <TouchableOpacity onPress={this.handleReset} style={{ paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#268bd2', borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
