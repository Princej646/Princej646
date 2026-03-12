import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';

export default function LoginScreen() {
  const router = useRouter();
  const [loginMode, setLoginMode] = useState<'pin' | 'password'>('pin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    try {
      if (loginMode === 'pin') {
        if (pin.length !== 4) {
          Alert.alert('Error', 'PIN must be 4 digits');
          return;
        }
        await login(username, pin, 'pin');
      } else {
        if (!username || !password) {
          Alert.alert('Error', 'Please enter username and password');
          return;
        }
        await login(username, password, 'password');
      }
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="restaurant" size={64} color="#FF6B35" />
          <Text style={styles.title}>Restaurant POS</Text>
          <Text style={styles.subtitle}>Secure Offline System</Text>
        </View>

        <View style={styles.loginCard}>
          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                loginMode === 'pin' && styles.modeButtonActive,
              ]}
              onPress={() => setLoginMode('pin')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  loginMode === 'pin' && styles.modeButtonTextActive,
                ]}
              >
                PIN Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                loginMode === 'password' && styles.modeButtonActive,
              ]}
              onPress={() => setLoginMode('password')}
            >
              <Text
                style={[
                  styles.modeButtonText,
                  loginMode === 'password' && styles.modeButtonTextActive,
                ]}
              >
                Password Login
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="person" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#999"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          {loginMode === 'pin' ? (
            <View style={styles.inputContainer}>
              <Ionicons name="keypad" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="4-digit PIN"
                placeholderTextColor="#999"
                value={pin}
                onChangeText={(text) => setPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          )}

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Text style={styles.loginButtonText}>Login</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>

          <Text style={styles.demoHint}>
            Demo: admin / 1234 (PIN) or admin / admin123 (Password)
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  loginCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  modeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#FF6B35',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modeButtonTextActive: {
    color: '#FFF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
  },
  loginButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginRight: 8,
  },
  demoHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});
