import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'manager' | 'captain' | 'cashier';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, credential: string, mode: 'pin' | 'password') => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: async (username: string, credential: string, mode: 'pin' | 'password') => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, credential, mode }),
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();
      await SecureStore.setItemAsync('user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true });
    } catch (error) {
      throw error;
    }
  },
  logout: () => {
    SecureStore.deleteItemAsync('user');
    set({ user: null, isAuthenticated: false });
  },
}));
