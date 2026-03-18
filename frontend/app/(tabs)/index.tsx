import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, RESTAURANT } from '../../constants/theme';

let useDBStore: any = null;

const initDBStore = async () => {
  if (Platform.OS !== 'web' && !useDBStore) {
    try {
      const dbStoreModule = await import('../../store/dbStore');
      useDBStore = dbStoreModule.useDBStore;
    } catch (error) {
      console.error('Failed to load dbStore:', error);
    }
  }
};

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalTables: 0,
    occupiedTables: 0,
    todayOrders: 0,
    todayRevenue: 0,
  });

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    
    if (Platform.OS !== 'web') {
      initDBStore().then(() => {
        if (useDBStore) {
          const { initDatabase, isInitialized } = useDBStore.getState();
          if (!isInitialized) {
            initDatabase().catch(console.error);
          } else {
            loadStats();
          }
        }
      });
    }
  }, [user]);

  // Reload stats when screen comes into focus (fixes data sync issue between user sessions)
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' && useDBStore) {
        loadStats();
      }
    }, [])
  );

  const loadStats = async () => {
    if (Platform.OS === 'web' || !useDBStore) return;
    
    try {
      const db = useDBStore.getState().getDatabase();
      if (!db) return;

      const tables = await db.getAllAsync('SELECT * FROM tables');
      const occupied = tables.filter((t: any) => t.status === 'occupied').length;

      const today = new Date().toISOString().split('T')[0];
      
      // Count today's completed orders (those that have been billed)
      const ordersResult = await db.getFirstAsync(
        `SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ? AND status = 'completed'`,
        [today]
      );

      // Get today's revenue from bills
      const billsResult = await db.getFirstAsync(
        `SELECT SUM(total) as revenue, COUNT(*) as count FROM bills WHERE DATE(billed_at) = ?`,
        [today]
      );

      setStats({
        totalTables: tables.length,
        occupiedTables: occupied,
        todayOrders: billsResult?.count || 0,
        todayRevenue: billsResult?.revenue || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const quickActions = [
    {
      icon: 'add-circle',
      label: 'New Order',
      color: COLORS.primary,
      route: '/tables',
      roles: ['captain', 'admin'],
    },
    {
      icon: 'receipt',
      label: 'Generate Bill',
      color: COLORS.secondary,
      route: '/billing',
      roles: ['cashier', 'admin', 'captain'],
    },
    {
      icon: 'restaurant',
      label: 'Manage Menu',
      color: COLORS.primary,
      route: '/menu',
      roles: ['admin', 'manager'],
    },
    {
      icon: 'bar-chart',
      label: 'View Reports',
      color: COLORS.secondary,
      route: '/reports',
      roles: ['admin'],
    },
  ];

  const filteredActions = quickActions.filter((action) =>
    action.roles.includes(user?.role || '')
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.restaurantName}>{RESTAURANT.name}</Text>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.username}>{user?.name}</Text>
            <Text style={styles.role}>{user?.role?.toUpperCase()}</Text>
          </View>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="leaf" size={28} color={COLORS.secondary} />
            </View>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="grid-outline" size={32} color={COLORS.primary} />
            <Text style={styles.statValue}>{stats.totalTables}</Text>
            <Text style={styles.statLabel}>Total Tables</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={32} color={COLORS.secondary} />
            <Text style={styles.statValue}>{stats.occupiedTables}</Text>
            <Text style={styles.statLabel}>Occupied</Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="cart-outline" size={32} color={COLORS.primary} />
            <Text style={styles.statValue}>{stats.todayOrders}</Text>
            <Text style={styles.statLabel}>Today Orders</Text>
          </View>
          {user?.role !== 'captain' && (
            <View style={styles.statCard}>
              <Ionicons name="cash-outline" size={32} color={COLORS.secondary} />
              <Text style={styles.statValue}>₹{stats.todayRevenue.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Today Revenue</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {filteredActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.actionCard, { borderLeftColor: action.color }]}
                onPress={() => router.push(action.route as any)}
              >
                <Ionicons name={action.icon as any} size={32} color={action.color} />
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.backgroundLight,
  },
  restaurantName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textOnDark,
    opacity: 0.7,
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textOnDark,
    marginTop: 4,
  },
  role: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '600',
    marginTop: 4,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: 12,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  actionsGrid: {
    gap: 16,
  },
  actionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderLeftWidth: 4,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
});
