import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { COLORS, RESTAURANT } from '../../constants/theme';

let useDBStore: any = null;
if (Platform.OS !== 'web') {
  useDBStore = require('../../store/dbStore').useDBStore;
}

interface Order {
  id: string;
  table_id: string;
  status: string;
  created_at: string;
  bill_printed: number;
}

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  addons_json: string | null;
  order_id?: string;
}

interface TableOrders {
  table_id: string;
  table_number: string;
  orders: Order[];
}

export default function BillingScreen() {
  const [readyOrders, setReadyOrders] = useState<any[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<any[]>([]); // Support multiple orders
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [billPrinted, setBillPrinted] = useState(false);
  const [showPartPaymentModal, setShowPartPaymentModal] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [tableOrdersMap, setTableOrdersMap] = useState<Map<string, TableOrders>>(new Map());
  const [unprintedOrders, setUnprintedOrders] = useState<any[]>([]); // Orders ready to print bill

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadReadyOrders();
    }
  }, []);

  // Refresh data when pathname changes (screen comes into focus)
  const pathname = usePathname();
  
  useEffect(() => {
    if (pathname === '/billing' || pathname === '/(tabs)/billing') {
      if (Platform.OS !== 'web') {
        loadReadyOrders();
      }
    }
  }, [pathname]);

  const loadReadyOrders = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      // Get orders that have bill printed and ready for settlement
      const printedOrders = await db.getAllAsync(`
        SELECT o.*, t.table_number 
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE o.status = 'preparing' AND o.bill_printed = 1
        ORDER BY t.table_number, o.created_at DESC
      `);
      
      // Get orders ready for bill printing (submitted to kitchen but bill not printed)
      const unprintedOrdersResult = await db.getAllAsync(`
        SELECT o.*, t.table_number 
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE o.status = 'preparing' AND o.bill_printed = 0
        ORDER BY t.table_number, o.created_at DESC
      `);
      
      setUnprintedOrders(unprintedOrdersResult);
      
      // Group printed orders by table
      const tableMap = new Map<string, TableOrders>();
      for (const order of printedOrders) {
        const tableId = order.table_id;
        if (!tableMap.has(tableId)) {
          tableMap.set(tableId, {
            table_id: tableId,
            table_number: order.table_number,
            orders: []
          });
        }
        tableMap.get(tableId)!.orders.push(order);
      }
      
      setTableOrdersMap(tableMap);
      setReadyOrders(printedOrders);
    } catch (error) {
      console.error('Error loading ready orders:', error);
    }
  };

  const loadOrderDetails = async (orders: any[]) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      // Load items from all selected orders
      const allItems: OrderItem[] = [];
      for (const order of orders) {
        const items = await db.getAllAsync<OrderItem>(
          'SELECT *, ? as order_id FROM order_items WHERE order_id = ?',
          [order.id, order.id]
        );
        allItems.push(...items);
      }
      setOrderItems(allItems);
      setSelectedOrders(orders);
    } catch (error) {
      console.error('Error loading order details:', error);
    }
  };

  const loadSingleOrderDetails = async (order: any) => {
    loadOrderDetails([order]);
  };

  const loadTableOrders = async (tableOrders: TableOrders) => {
    // Load all orders for this table
    loadOrderDetails(tableOrders.orders);
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

  const handlePrintBill = async () => {
    if (!useDBStore || selectedOrders.length === 0) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    Alert.alert(
      'Print Bill',
      'Bill will be printed. Proceed to settle payment after customer pays.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Print',
          onPress: async () => {
            try {
              // Mark all selected orders as bill_printed
              for (const order of selectedOrders) {
                await db.runAsync(
                  'UPDATE orders SET bill_printed = 1 WHERE id = ?',
                  [order.id]
                );
              }
              // Here you would integrate with actual printer
              setBillPrinted(true);
              Alert.alert('Success', 'Bill printed successfully. Now settle the payment.');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to print bill');
            }
          },
        },
      ]
    );
  };

  // Function to load and show an unprinted order for bill printing
  const handlePrintOrderBill = async (order: any) => {
    loadSingleOrderDetails(order);
  };

  const handleSettleBill = (paymentMethod: string) => {
    if (!useDBStore || selectedOrders.length === 0) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    const user = require('../../store/authStore').useAuthStore.getState().user;
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    const orderCount = selectedOrders.length;
    const tableNumber = selectedOrders[0].table_number;

    Alert.alert(
      'Settle Bill',
      `Settle ${orderCount} order${orderCount > 1 ? 's' : ''} via ${paymentMethod}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Payment',
          onPress: async () => {
            try {
              const total = calculateSubtotal(); // This is the total WITH GST (inclusive)
              const gst = calculateGST(total);

              const billId = `bill_${Date.now()}`;
              const orderIds = selectedOrders.map(o => o.id);
              const orderIdsJson = JSON.stringify(orderIds);
              
              await db.runAsync(`
                INSERT INTO bills (
                  id, order_id, order_ids_json, table_number, subtotal, cgst, sgst, total, 
                  payment_method, billed_by_user_id, billed_by_username
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                billId,
                orderIds[0], // Primary order ID for backward compatibility
                orderIdsJson, // All order IDs as JSON
                tableNumber,
                gst.baseAmount, // Base amount without GST
                gst.cgst,
                gst.sgst,
                total, // Total includes GST
                paymentMethod,
                user.id,
                user.username,
              ]);

              // Mark all orders as completed
              for (const order of selectedOrders) {
                await db.runAsync(
                  'UPDATE orders SET status = ? WHERE id = ?',
                  ['completed', order.id]
                );
              }

              // Check if table still has any active orders or pending bills
              const tableId = selectedOrders[0].table_id;
              const remainingOrders = await db.getFirstAsync<{ count: number }>(
                `SELECT COUNT(*) as count FROM orders 
                 WHERE table_id = ? AND status IN ('pending', 'preparing')`,
                [tableId]
              );

              // Only set table to available if no more orders
              if (remainingOrders?.count === 0) {
                await db.runAsync(
                  'UPDATE tables SET status = ? WHERE id = ?',
                  ['available', tableId]
                );
              }

              Alert.alert(
                'Success',
                `Payment settled! Total: ₹${total.toFixed(2)}`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setSelectedOrders([]);
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
        { 
          text: 'Part Payment', 
          onPress: () => {
            setCashAmount('');
            setCardAmount('');
            setUpiAmount('');
            setShowPartPaymentModal(true);
          }
        },
      ]
    );
  };

  const handlePartPayment = () => {
    const cash = parseFloat(cashAmount) || 0;
    const card = parseFloat(cardAmount) || 0;
    const upi = parseFloat(upiAmount) || 0;
    const totalPaid = cash + card + upi;
    const billTotal = calculateSubtotal();

    if (totalPaid === 0) {
      Alert.alert('Error', 'Please enter at least one payment amount');
      return;
    }

    if (Math.abs(totalPaid - billTotal) > 0.01) {
      Alert.alert(
        'Amount Mismatch',
        `Total paid: ₹${totalPaid.toFixed(2)}\nBill amount: ₹${billTotal.toFixed(2)}\n\nPlease adjust the amounts to match the bill.`
      );
      return;
    }

    // Build payment method string
    const paymentParts = [];
    if (cash > 0) paymentParts.push(`Cash: ₹${cash.toFixed(2)}`);
    if (card > 0) paymentParts.push(`Card: ₹${card.toFixed(2)}`);
    if (upi > 0) paymentParts.push(`UPI: ₹${upi.toFixed(2)}`);
    const paymentMethod = paymentParts.join(' + ');

    setShowPartPaymentModal(false);
    handleSettleBill(paymentMethod);
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
        {selectedOrders.length > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setSelectedOrders([]);
              setOrderItems([]);
              setBillPrinted(false);
            }}
          >
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {selectedOrders.length === 0 ? (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.ordersList}>
            {/* Section: Orders Ready to Print Bill */}
            {unprintedOrders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Ready to Print Bill</Text>
                {unprintedOrders.map((order) => (
                  <TouchableOpacity
                    key={order.id}
                    style={[styles.orderCard, styles.unprintedOrderCard]}
                    onPress={() => handlePrintOrderBill(order)}
                  >
                    <View style={styles.orderCardHeader}>
                      <View>
                        <Text style={styles.tableNumber}>Table {order.table_number}</Text>
                        <Text style={styles.orderId}>Order #{order.id.slice(-8)}</Text>
                        <Text style={styles.orderTime}>
                          {new Date(order.created_at).toLocaleTimeString()}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, styles.readyBadge]}>
                        <Ionicons name="print" size={16} color="#4ECDC4" />
                        <Text style={styles.statusTextTeal}>Print Bill</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Section: Pending Settlement */}
            {tableOrdersMap.size > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Pending Settlement</Text>
                {Array.from(tableOrdersMap.values()).map((tableOrders) => (
                  <View key={tableOrders.table_id} style={styles.tableOrdersCard}>
                    <View style={styles.tableOrdersHeader}>
                      <Text style={styles.tableNumber}>Table {tableOrders.table_number}</Text>
                      {tableOrders.orders.length > 1 && (
                        <TouchableOpacity
                          style={styles.mergeButton}
                          onPress={() => loadTableOrders(tableOrders)}
                        >
                          <Ionicons name="git-merge" size={16} color="#FFF" />
                          <Text style={styles.mergeButtonText}>Merge All ({tableOrders.orders.length})</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    {tableOrders.orders.map((order) => (
                      <TouchableOpacity
                        key={order.id}
                        style={styles.orderCard}
                        onPress={() => loadSingleOrderDetails(order)}
                      >
                        <View style={styles.orderCardHeader}>
                          <View>
                            <Text style={styles.orderId}>Order #{order.id.slice(-8)}</Text>
                            <Text style={styles.orderTime}>
                              {new Date(order.created_at).toLocaleTimeString()}
                            </Text>
                          </View>
                          <View style={styles.statusBadge}>
                            <Ionicons name="receipt" size={16} color="#FF9800" />
                            <Text style={styles.statusTextOrange}>Bill Printed</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Empty State */}
            {unprintedOrders.length === 0 && tableOrdersMap.size === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={64} color="#E0E0E0" />
                <Text style={styles.emptyStateText}>No orders ready for billing</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollView}>
          <View style={styles.billContainer}>
            {/* Restaurant Header on Bill */}
            <View style={styles.restaurantHeader}>
              <View style={styles.restaurantLogoSmall}>
                <Ionicons name="leaf" size={24} color={COLORS.secondary} />
              </View>
              <Text style={styles.restaurantNameBill}>{RESTAURANT.name}</Text>
              <Text style={styles.restaurantTagline}>{RESTAURANT.tagline}</Text>
            </View>
            
            <View style={styles.billHeader}>
              <Text style={styles.billTitle}>Table {selectedOrders[0].table_number}</Text>
              {selectedOrders.length === 1 ? (
                <>
                  <Text style={styles.billOrderId}>Order #{selectedOrders[0].id.slice(-8)}</Text>
                  <Text style={styles.billDate}>
                    {new Date(selectedOrders[0].created_at).toLocaleString()}
                  </Text>
                </>
              ) : (
                <View style={styles.mergedOrdersInfo}>
                  <Text style={styles.mergedOrdersTitle}>{selectedOrders.length} Orders Combined</Text>
                  {selectedOrders.map((order, idx) => (
                    <Text key={order.id} style={styles.mergedOrderId}>
                      #{order.id.slice(-8)} ({new Date(order.created_at).toLocaleTimeString()})
                    </Text>
                  ))}
                </View>
              )}
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

      {/* Part Payment Modal */}
      <Modal visible={showPartPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Part Payment</Text>
            <Text style={styles.modalSubtitle}>
              Total Bill: ₹{calculateSubtotal().toFixed(2)}
            </Text>

            <View style={styles.partPaymentInputs}>
              <View style={styles.paymentInputGroup}>
                <Text style={styles.paymentLabel}>💵 Cash Amount</Text>
                <TextInput
                  style={styles.paymentInput}
                  placeholder="0.00"
                  value={cashAmount}
                  onChangeText={setCashAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.paymentInputGroup}>
                <Text style={styles.paymentLabel}>💳 Card Amount</Text>
                <TextInput
                  style={styles.paymentInput}
                  placeholder="0.00"
                  value={cardAmount}
                  onChangeText={setCardAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.paymentInputGroup}>
                <Text style={styles.paymentLabel}>📱 UPI Amount</Text>
                <TextInput
                  style={styles.paymentInput}
                  placeholder="0.00"
                  value={upiAmount}
                  onChangeText={setUpiAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.totalPaidRow}>
                <Text style={styles.totalPaidLabel}>Total Paid:</Text>
                <Text style={styles.totalPaidValue}>
                  ₹{((parseFloat(cashAmount) || 0) + (parseFloat(cardAmount) || 0) + (parseFloat(upiAmount) || 0)).toFixed(2)}
                </Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowPartPaymentModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handlePartPayment}
              >
                <Text style={styles.confirmButtonText}>Confirm Payment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  orderCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  unprintedOrderCard: {
    backgroundColor: '#FFF',
    borderLeftColor: '#4ECDC4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  readyBadge: {
    backgroundColor: '#E0F7F5',
  },
  statusTextTeal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableOrdersCard: {
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
  tableOrdersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  mergeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  mergeButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  tableNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  orderId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
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
  statusTextOrange: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9800',
  },
  orderTime: {
    fontSize: 12,
    color: '#999',
  },
  billContainer: {
    padding: 16,
  },
  restaurantHeader: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  restaurantLogoSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.backgroundLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginBottom: 8,
  },
  restaurantNameBill: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  restaurantTagline: {
    fontSize: 12,
    color: COLORS.textOnDark,
    opacity: 0.7,
    marginTop: 4,
  },
  billHeader: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  mergedOrdersInfo: {
    marginTop: 12,
    alignItems: 'center',
  },
  mergedOrdersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9C27B0',
    marginBottom: 8,
  },
  mergedOrderId: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 18,
    color: '#4ECDC4',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '600',
  },
  partPaymentInputs: {
    marginBottom: 20,
  },
  paymentInputGroup: {
    marginBottom: 16,
  },
  paymentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  paymentInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    color: '#1A1A1A',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  totalPaidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FFF5F0',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  totalPaidLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  totalPaidValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
