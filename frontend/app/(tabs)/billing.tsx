import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

let useDBStore: any = null;
if (Platform.OS !== 'web') {
  useDBStore = require('../../store/dbStore').useDBStore;
}

interface Order {
  id: string;
  table_id: string;
  status: string;
  created_at: string;
}

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  addons_json: string | null;
}

export default function BillingScreen() {
  const [readyOrders, setReadyOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [billPrinted, setBillPrinted] = useState(false);
  const [showPartPaymentModal, setShowPartPaymentModal] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadReadyOrders();
    }
  }, []);

  const loadReadyOrders = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const orders = await db.getAllAsync(`
        SELECT o.*, t.table_number 
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE o.status = 'preparing'
        ORDER BY o.created_at DESC
      `);
      setReadyOrders(orders);
    } catch (error) {
      console.error('Error loading ready orders:', error);
    }
  };

  const loadOrderDetails = async (order: any) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const items = await db.getAllAsync<OrderItem>(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
      setOrderItems(items);
      setSelectedOrder(order);
    } catch (error) {
      console.error('Error loading order details:', error);
    }
  };

  const calculateSubtotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  };

  const calculateGST = (totalWithGST: number) => {
    const gstRate = 0.05; // 5% GST (inclusive)
    // For inclusive GST: Base = Total / (1 + GST Rate)
    const baseAmount = totalWithGST / (1 + gstRate);
    const totalGST = totalWithGST - baseAmount;
    const cgst = totalGST / 2; // 2.5%
    const sgst = totalGST / 2; // 2.5%
    return { baseAmount, cgst, sgst, totalGST };
  };

  const handlePrintBill = () => {
    Alert.alert(
      'Print Bill',
      'Bill will be printed. Proceed to settle payment after customer pays.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Print',
          onPress: () => {
            // Here you would integrate with actual printer
            // For now, just mark as printed
            setBillPrinted(true);
            Alert.alert('Success', 'Bill printed successfully. Now settle the payment.');
          },
        },
      ]
    );
  };

  const handleSettleBill = (paymentMethod: string) => {
    if (!useDBStore || !selectedOrder) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    const user = require('../../store/authStore').useAuthStore.getState().user;
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    Alert.alert(
      'Settle Bill',
      `Customer paid via ${paymentMethod}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Payment',
          onPress: async () => {
            try {
              const total = calculateSubtotal(); // This is the total WITH GST (inclusive)
              const gst = calculateGST(total);

              const billId = `bill_${Date.now()}`;
              await db.runAsync(`
                INSERT INTO bills (
                  id, order_id, table_number, subtotal, cgst, sgst, total, 
                  payment_method, billed_by_user_id, billed_by_username
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                billId,
                selectedOrder.id,
                selectedOrder.table_number,
                gst.baseAmount, // Base amount without GST
                gst.cgst,
                gst.sgst,
                total, // Total includes GST
                paymentMethod,
                user.id,
                user.username,
              ]);

              await db.runAsync(
                'UPDATE orders SET status = ? WHERE id = ?',
                ['completed', selectedOrder.id]
              );

              await db.runAsync(
                'UPDATE tables SET status = ?, current_order_id = NULL WHERE id = ?',
                ['available', selectedOrder.table_id]
              );

              Alert.alert(
                'Success',
                `Payment settled! Total: ₹${total.toFixed(2)}`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setSelectedOrder(null);
                      setOrderItems([]);
                      setBillPrinted(false);
                      loadReadyOrders();
                    },
                  },
                ]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to settle bill');
            }
          },
        },
      ]
    );
  };

  const handleSettleBillPrompt = () => {
    Alert.alert(
      'Select Payment Method',
      'How did the customer pay?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Cash', onPress: () => handleSettleBill('Cash') },
        { text: 'Card', onPress: () => handleSettleBill('Card') },
        { text: 'UPI', onPress: () => handleSettleBill('UPI') },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReadyOrders();
    setRefreshing(false);
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Billing</Text>
        </View>
        <View style={styles.webNotice}>
          <Ionicons name="phone-portrait" size={64} color="#4ECDC4" />
          <Text style={styles.webNoticeText}>This feature is only available on mobile devices</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Billing</Text>
        {selectedOrder && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setSelectedOrder(null);
              setOrderItems([]);
            }}
          >
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {!selectedOrder ? (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.ordersList}>
            {readyOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={64} color="#E0E0E0" />
                <Text style={styles.emptyStateText}>No orders ready for billing</Text>
              </View>
            ) : (
              readyOrders.map((order) => (
                <TouchableOpacity
                  key={order.id}
                  style={styles.orderCard}
                  onPress={() => loadOrderDetails(order)}
                >
                  <View style={styles.orderCardHeader}>
                    <View>
                      <Text style={styles.tableNumber}>Table {order.table_number}</Text>
                      <Text style={styles.orderId}>Order #{order.id.slice(-8)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#999" />
                  </View>
                  <View style={styles.orderCardFooter}>
                    <View style={styles.statusBadge}>
                      <Ionicons name="time" size={16} color="#FF6B35" />
                      <Text style={styles.statusText}>Ready</Text>
                    </View>
                    <Text style={styles.orderTime}>
                      {new Date(order.created_at).toLocaleTimeString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.billContainer}>
            <View style={styles.billHeader}>
              <Text style={styles.billTitle}>Table {selectedOrder.table_number}</Text>
              <Text style={styles.billOrderId}>Order #{selectedOrder.id.slice(-8)}</Text>
              <Text style={styles.billDate}>
                {new Date(selectedOrder.created_at).toLocaleString()}
              </Text>
            </View>

            <View style={styles.billItems}>
              <Text style={styles.sectionTitle}>Items</Text>
              {orderItems.map((item, index) => {
                const addons = item.addons_json ? JSON.parse(item.addons_json) : [];
                const itemTotal = item.unit_price * item.quantity;
                return (
                  <View key={index} style={styles.billItem}>
                    <View style={styles.billItemHeader}>
                      <Text style={styles.billItemQuantity}>{item.quantity}x</Text>
                      <View style={styles.billItemInfo}>
                        <Text style={styles.billItemName}>{item.item_name}</Text>
                        {addons.length > 0 && (
                          <Text style={styles.billItemAddons}>
                            + {addons.map((a: any) => a.addon_name).join(', ')}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.billItemPrice}>₹{itemTotal.toFixed(2)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.billSummary}>
              <Text style={styles.sectionTitle}>Bill Summary</Text>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total (incl. GST)</Text>
                <Text style={styles.summaryValue}>₹{calculateSubtotal().toFixed(2)}</Text>
              </View>

              <View style={styles.gstSection}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Base Amount</Text>
                  <Text style={styles.summaryValue}>
                    ₹{calculateGST(calculateSubtotal()).baseAmount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>CGST (2.5%)</Text>
                  <Text style={styles.summaryValue}>
                    ₹{calculateGST(calculateSubtotal()).cgst.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>SGST (2.5%)</Text>
                  <Text style={styles.summaryValue}>
                    ₹{calculateGST(calculateSubtotal()).sgst.toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Payable</Text>
                <Text style={styles.totalValue}>
                  ₹{calculateSubtotal().toFixed(2)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.generateButton}
              onPress={handlePrintBill}
              disabled={billPrinted}
            >
              <Ionicons name="print" size={24} color="#FFF" />
              <Text style={styles.generateButtonText}>
                {billPrinted ? 'Bill Printed ✓' : 'Print Bill'}
              </Text>
            </TouchableOpacity>

            {billPrinted && (
              <TouchableOpacity
                style={[styles.generateButton, styles.settleButton]}
                onPress={handleSettleBillPrompt}
              >
                <Ionicons name="checkmark-done" size={24} color="#FFF" />
                <Text style={styles.generateButtonText}>Settle Bill & Payment</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  backButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  ordersList: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  orderCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tableNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  orderId: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF5F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
  },
  orderTime: {
    fontSize: 14,
    color: '#999',
  },
  billContainer: {
    padding: 16,
  },
  billHeader: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  billTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  billOrderId: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  billDate: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  billItems: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  billItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  billItemHeader: {
    flexDirection: 'row',
  },
  billItemQuantity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35',
    width: 40,
  },
  billItemInfo: {
    flex: 1,
  },
  billItemName: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  billItemAddons: {
    fontSize: 14,
    color: '#4ECDC4',
    marginTop: 2,
  },
  billItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  billSummary: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  gstSection: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F5F5F5',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  generateButton: {
    flexDirection: 'row',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  settleButton: {
    backgroundColor: '#4CAF50',
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
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
