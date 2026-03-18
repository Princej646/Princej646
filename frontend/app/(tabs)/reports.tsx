import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';

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
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [selectedView, setSelectedView] = useState<'analytics' | 'bills'>('analytics');
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [topItems, setTopItems] = useState<ItemSale[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadReports();
    }
  }, [selectedPeriod]);

  const loadReports = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      await loadDailySummary(db);
      await loadTopItems(db);
      await loadWeeklyData(db);
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
