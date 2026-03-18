import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';

let useDBStore: any = null;
if (Platform.OS !== 'web') {
  useDBStore = require('../../store/dbStore').useDBStore;
}

interface DailySummary {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

interface ItemSale {
  item_name: string;
  quantity: number;
  revenue: number;
}

export default function ReportsScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const isFocused = useIsFocused();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [selectedView, setSelectedView] = useState<'analytics' | 'bills'>('analytics');
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [topItems, setTopItems] = useState<ItemSale[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);

  useEffect(() => {
    // Access guard - only admin can view reports
    if (currentUser?.role !== 'admin') {
      Alert.alert('Access Denied', 'Only admin users can access reports', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)'),
        },
      ]);
      return;
    }

    if (Platform.OS !== 'web') {
      loadReports();
    }
  }, [selectedPeriod, currentUser]);

  // Reload reports when screen comes into focus (fixes data sync issue between user sessions)
  useEffect(() => {
    if (isFocused && Platform.OS !== 'web' && currentUser?.role === 'admin') {
      loadReports();
    }
  }, [isFocused, selectedPeriod]);

  const loadReports = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      await loadDailySummary(db);
      await loadTopItems(db);
      await loadWeeklyData(db);
      await loadBills(db); // Always load bills to ensure data is fresh
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  };

  const loadDailySummary = async (db: any) => {
    const today = new Date().toISOString().split('T')[0];
    
    const bills = await db.getAllAsync(
      `SELECT COUNT(*) as count, SUM(total) as revenue, AVG(total) as avg 
       FROM bills WHERE DATE(billed_at) = ?`,
      [today]
    );

    if (bills && bills[0]) {
      setDailySummary({
        date: today,
        totalOrders: bills[0].count || 0,
        totalRevenue: bills[0].revenue || 0,
        avgOrderValue: bills[0].avg || 0,
      });
    }
  };

  const loadTopItems = async (db: any) => {
    const daysBack = selectedPeriod === 'today' ? 0 : selectedPeriod === 'week' ? 7 : 30;
    
    const items = await db.getAllAsync(`
      SELECT 
        oi.item_name,
        SUM(oi.quantity) as quantity,
        SUM(oi.unit_price * oi.quantity) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'completed'
      ${daysBack > 0 ? `AND DATE(o.created_at) >= DATE('now', '-${daysBack} days')` : `AND DATE(o.created_at) = DATE('now')`}
      GROUP BY oi.item_name
      ORDER BY quantity DESC
      LIMIT 5
    `);

    setTopItems(items || []);
  };

  const loadWeeklyData = async (db: any) => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const result = await db.getFirstAsync(
        `SELECT SUM(total) as revenue FROM bills WHERE DATE(billed_at) = ?`,
        [dateStr]
      );

      data.push({
        value: result?.revenue || 0,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        frontColor: i === 0 ? '#FF6B35' : '#4ECDC4',
      });
    }
    setWeeklyData(data);
  };

  const loadBills = async (db: any) => {
    const daysBack = selectedPeriod === 'today' ? 0 : selectedPeriod === 'week' ? 7 : 30;
    
    const billsList = await db.getAllAsync(`
      SELECT * FROM bills 
      ${daysBack > 0 ? `WHERE DATE(billed_at) >= DATE('now', '-${daysBack} days')` : `WHERE DATE(billed_at) = DATE('now')`}
      ORDER BY billed_at DESC
    `);

    setBills(billsList || []);
  };

  const handleDeleteBill = async (billId: string) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    Alert.alert(
      'Delete Bill',
      'This will permanently delete the bill and all its order data. This cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              // Get bill details first
              const bill = await db.getFirstAsync(
                'SELECT * FROM bills WHERE id = ?',
                [billId]
              );

              if (!bill) {
                Alert.alert('Error', 'Bill not found');
                return;
              }

              // Get all order IDs associated with this bill (could be merged orders)
              let orderIds: string[] = [];
              if (bill.order_ids_json) {
                try {
                  orderIds = JSON.parse(bill.order_ids_json);
                } catch {
                  orderIds = bill.order_id ? [bill.order_id] : [];
                }
              } else if (bill.order_id) {
                orderIds = [bill.order_id];
              }

              // Delete the bill FIRST (removes foreign key reference)
              await db.runAsync('DELETE FROM bills WHERE id = ?', [billId]);

              // Delete order items for all orders
              for (const orderId of orderIds) {
                if (orderId) {
                  await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [orderId]);
                }
              }

              // Delete KOT prints for all orders
              for (const orderId of orderIds) {
                if (orderId) {
                  await db.runAsync('DELETE FROM kot_prints WHERE order_id = ?', [orderId]);
                }
              }

              // Delete all orders
              for (const orderId of orderIds) {
                if (orderId) {
                  await db.runAsync('DELETE FROM orders WHERE id = ?', [orderId]);
                }
              }

              // Check if table still has any orders, if not make it available
              const tableOrders = await db.getFirstAsync<{ count: number }>(
                `SELECT COUNT(*) as count FROM orders 
                 WHERE table_id = (SELECT id FROM tables WHERE table_number = ?) 
                 AND status IN ('pending', 'preparing')`,
                [bill.table_number]
              );

              if (tableOrders?.count === 0) {
                await db.runAsync(
                  'UPDATE tables SET status = ? WHERE table_number = ?',
                  ['available', bill.table_number]
                );
              }

              await loadReports();
              Alert.alert('Success', 'Bill and all associated records deleted permanently');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete bill');
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reports</Text>
        </View>
        <View style={styles.webNotice}>
          <Ionicons name="phone-portrait" size={64} color="#F38181" />
          <Text style={styles.webNoticeText}>This feature is only available on mobile devices</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
      </View>

      <View style={styles.viewSelector}>
        <TouchableOpacity
          style={[
            styles.viewButton,
            selectedView === 'analytics' && styles.viewButtonActive,
          ]}
          onPress={() => setSelectedView('analytics')}
        >
          <Ionicons name="stats-chart" size={20} color={selectedView === 'analytics' ? '#FFF' : '#666'} />
          <Text
            style={[
              styles.viewButtonText,
              selectedView === 'analytics' && styles.viewButtonTextActive,
            ]}
          >
            Analytics
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewButton,
            selectedView === 'bills' && styles.viewButtonActive,
          ]}
          onPress={() => {
            setSelectedView('bills');
            if (Platform.OS !== 'web') {
              const db = useDBStore.getState().getDatabase();
              if (db) loadBills(db);
            }
          }}
        >
          <Ionicons name="receipt" size={20} color={selectedView === 'bills' ? '#FFF' : '#666'} />
          <Text
            style={[
              styles.viewButtonText,
              selectedView === 'bills' && styles.viewButtonTextActive,
            ]}
          >
            Bills
          </Text>
        </TouchableOpacity>
      </View>

      {selectedView === 'analytics' ? (
        <>
          <View style={styles.periodSelector}>
            {['today', 'week', 'month'].map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  selectedPeriod === period && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod(period as any)}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === period && styles.periodButtonTextActive,
                  ]}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {/* Summary Cards */}
            <View style={styles.summaryCards}>
              <View style={styles.summaryCard}>
                <Ionicons name="cart" size={32} color="#FF6B35" />
                <Text style={styles.summaryValue}>
                  {dailySummary?.totalOrders || 0}
                </Text>
                <Text style={styles.summaryLabel}>Orders</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="cash" size={32} color="#4ECDC4" />
                <Text style={styles.summaryValue}>
                  ₹{(dailySummary?.totalRevenue || 0).toFixed(0)}
                </Text>
                <Text style={styles.summaryLabel}>Revenue</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="trending-up" size={32} color="#95E1D3" />
                <Text style={styles.summaryValue}>
                  ₹{(dailySummary?.avgOrderValue || 0).toFixed(0)}
                </Text>
                <Text style={styles.summaryLabel}>Avg Order</Text>
              </View>
            </View>

            {/* Weekly Chart */}
            {weeklyData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Last 7 Days Revenue</Text>
                <BarChart
                  data={weeklyData}
                  barWidth={35}
                  noOfSections={4}
                  barBorderRadius={4}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  yAxisTextStyle={{ color: '#666' }}
                  xAxisLabelTextStyle={{ color: '#666', fontSize: 12 }}
                  height={200}
                  spacing={20}
                />
              </View>
            )}

            {/* Top Items */}
            <View style={styles.topItemsCard}>
              <Text style={styles.sectionTitle}>Top Selling Items</Text>
              {topItems.length > 0 ? (
                topItems.map((item, index) => (
                  <View key={index} style={styles.topItem}>
                    <View style={styles.topItemRank}>
                      <Text style={styles.topItemRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.topItemInfo}>
                      <Text style={styles.topItemName}>{item.item_name}</Text>
                      <Text style={styles.topItemStats}>
                        {item.quantity} sold • ₹{item.revenue.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.topItemProgress}>
                      <View
                        style={[
                          styles.topItemProgressBar,
                          {
                            width: `${Math.min((item.quantity / (topItems[0]?.quantity || 1)) * 100, 100)}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No data available for this period</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.periodSelector}>
            {['today', 'week', 'month'].map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodButton,
                  selectedPeriod === period && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod(period as any)}
              >
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === period && styles.periodButtonTextActive,
                  ]}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <View style={styles.billsList}>
              {bills.length > 0 ? (
                bills.map((bill) => (
                  <View key={bill.id} style={styles.billCard}>
                    <View style={styles.billHeader}>
                      <View>
                        <Text style={styles.billTable}>Table {bill.table_number}</Text>
                        <Text style={styles.billDate}>
                          {new Date(bill.billed_at).toLocaleString()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteBill(bill.id)}
                      >
                        <Ionicons name="trash" size={20} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.billDetails}>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>Base Amount:</Text>
                        <Text style={styles.billValue}>₹{bill.subtotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>CGST (2.5%):</Text>
                        <Text style={styles.billValue}>₹{bill.cgst.toFixed(2)}</Text>
                      </View>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>SGST (2.5%):</Text>
                        <Text style={styles.billValue}>₹{bill.sgst.toFixed(2)}</Text>
                      </View>
                      <View style={[styles.billRow, styles.billTotalRow]}>
                        <Text style={styles.billTotalLabel}>Total:</Text>
                        <Text style={styles.billTotalValue}>₹{bill.total.toFixed(2)}</Text>
                      </View>
                      <View style={styles.billFooter}>
                        <Text style={styles.billPayment}>{bill.payment_method}</Text>
                        <Text style={styles.billBy}>by {bill.billed_by_username}</Text>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="receipt-outline" size={64} color="#E0E0E0" />
                  <Text style={styles.emptyStateText}>No bills for this period</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    gap: 8,
  },
  viewSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  viewButtonActive: {
    backgroundColor: '#FF6B35',
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  viewButtonTextActive: {
    color: '#FFF',
  },
  billsList: {
    padding: 16,
  },
  billCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  billTable: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  billDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billDetails: {
    gap: 8,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billLabel: {
    fontSize: 14,
    color: '#666',
  },
  billValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  billTotalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  billTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  billFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  billPayment: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
  },
  billBy: {
    fontSize: 12,
    color: '#999',
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
  },
  periodButtonActive: {
    backgroundColor: '#FF6B35',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#FFF',
  },
  scrollView: {
    flex: 1,
  },
  summaryCards: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  topItemsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  topItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  topItemRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topItemRankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  topItemInfo: {
    flex: 1,
  },
  topItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  topItemStats: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  topItemProgress: {
    width: 80,
    height: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  topItemProgressBar: {
    height: '100%',
    backgroundColor: '#4ECDC4',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
  },
  webNotice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  webNoticeText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 24,
  },
});
