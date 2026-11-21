import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { RealtimeProvider } from './src/context/RealtimeContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  const { width, height } = useWindowDimensions();
  const showPhoneFrame = Platform.OS === 'web' && width > 560;

  const content = (
    <SafeAreaProvider>
      <AuthProvider>
        <RealtimeProvider>
          <StatusBar style="light" />
          <AppNavigator />
        </RealtimeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );

  if (!showPhoneFrame) {
    return content;
  }

  return (
    <View style={styles.desktopStage}>
      <View
        style={[
          styles.phoneShell,
          { height: Math.min(Math.max(height - 36, 640), 860) },
        ]}
      >
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopStage: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  phoneShell: {
    width: 412,
    maxWidth: '96%',
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 6,
    borderColor: '#1E293B',
  },
});
