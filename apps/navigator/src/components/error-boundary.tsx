import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { reportError } from '../lib/crash';

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null };

/**
 * Last line of defence: a screen that fails to render shows what went wrong and a way back,
 * never a blank page, and the error is reported to the TURN server. Plain styles on purpose, so it
 * still renders when the theme or fonts are what failed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(
      Object.assign(new Error(error.message), {
        stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`,
      }),
      'render',
    );
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0B1220',
          padding: 24,
          paddingTop: 72,
          gap: 14,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>
          Something went wrong
        </Text>
        <Text style={{ color: '#B9BFCA', fontSize: 15, lineHeight: 21 }}>
          TURN hit an error and sent the details to the TURN server on your
          computer. Try again; if it keeps happening, the details below help.
        </Text>
        <ScrollView
          style={{
            flexGrow: 0,
            maxHeight: 260,
            backgroundColor: '#141A25',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text
            style={{ color: '#F2F1EE', fontSize: 13, fontFamily: 'monospace' }}
          >
            {error.message}
            {'\n\n'}
            {(error.stack ?? '').split('\n').slice(0, 12).join('\n')}
          </Text>
        </ScrollView>
        <Pressable
          onPress={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
          style={{
            backgroundColor: '#2F5AF2',
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }
}
