import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RESTAURANT } from '../constants/theme';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') {
      router.replace('/web-notice');
      return;
    }
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const userStr = await SecureStore.getItemAsync('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        useAuthStore.setState({ user, isAuthenticated: true });
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    } catch (error) {
      router.replace('/login');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Ionicons name="leaf" size={48} color={COLORS.secondary} />
      </View>
      <Text style={styles.appName}>{RESTAURANT.name}</Text>
      <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.primary,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 24,
  },
  loader: {
    marginTop: 20,
  },
});
