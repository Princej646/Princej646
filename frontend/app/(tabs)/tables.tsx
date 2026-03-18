import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../../store/authStore';

let useDBStore: any = null;
if (Platform.OS !== 'web') {
  useDBStore = require('../../store/dbStore').useDBStore;
}

interface Table {
  id: string;
  table_number: string;
  seats: number;
  status: string;
  current_order_id: string | null;
  pending_bills_count?: number;
  active_order_id?: string | null;
}

export default function TablesScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const segments = useSegments();
  const [tables, setTables] = useState<Table[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableSeats, setNewTableSeats] = useState('4');
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [transferFromTable, setTransferFromTable] = useState<Table | null>(null);
  const [transferToTableId, setTransferToTableId] = useState<string>('');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadTables();
    }
  }, []);

  // Reload tables when screen comes into focus using segments (expo-router compatible)
  useEffect(() => {
    const isTablesScreen = segments.length >= 1 && segments[0] === '(tabs)' && segments[1] === 'tables';
    if (isTablesScreen && Platform.OS !== 'web') {
      loadTables();
    }
  }, [segments]);

  // Also reload on app state change
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && Platform.OS !== 'web') {
        loadTables();
      }
    });
    return () => subscription?.remove();
  }, []);

  const loadTables = async () => {
    if (Platform.OS === 'web' || !useDBStore) return;
    
    const db = useDBStore.getState().getDatabase();
    if (!db) return;
    try {
      // Get tables with additional info about pending bills and active orders
      const result = await db.getAllAsync<Table>(`
        SELECT t.*,
          (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.bill_printed = 1 AND o.status = 'preparing') as pending_bills_count,
          (SELECT o.id FROM orders o WHERE o.table_id = t.id AND o.status IN ('pending', 'preparing') ORDER BY o.created_at DESC LIMIT 1) as active_order_id
        FROM tables t
        ORDER BY t.table_number
      `);
      setTables(result);
    } catch (error) {
      console.error('Error loading tables:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTables();
    setRefreshing(false);
  };

  const handleAddTable = async () => {
    if (Platform.OS === 'web' || !useDBStore) {
      Alert.alert('Error', 'Database not available on web');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db || !newTableNumber.trim()) {
      Alert.alert('Error', 'Please enter table number');
      return;
    }

    try {
      const id = `table_${Date.now()}`;
      await db.runAsync(
        'INSERT INTO tables (id, table_number, seats, status) VALUES (?, ?, ?, ?)',
        [id, newTableNumber, parseInt(newTableSeats) || 4, 'available']
      );
      setAddModalVisible(false);
      setNewTableNumber('');
      setNewTableSeats('4');
      await loadTables();
      Alert.alert('Success', 'Table added successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add table');
    }
  };

  const handleEditTable = async () => {
    if (Platform.OS === 'web' || !useDBStore || !editingTable) {
      Alert.alert('Error', 'Invalid operation');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db || !newTableNumber.trim()) {
      Alert.alert('Error', 'Please enter table number');
      return;
    }

    try {
      await db.runAsync(
        'UPDATE tables SET table_number = ?, seats = ? WHERE id = ?',
        [newTableNumber, parseInt(newTableSeats) || 4, editingTable.id]
      );
      setEditModalVisible(false);
      setEditingTable(null);
      setNewTableNumber('');
      setNewTableSeats('4');
      await loadTables();
      Alert.alert('Success', 'Table updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update table');
    }
  };

  const handleDeleteTable = (table: Table) => {
    Alert.alert(
      'Delete Table',
      `Are you sure you want to delete Table ${table.table_number}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!useDBStore) return;
            const db = useDBStore.getState().getDatabase();
            if (!db) return;

            try {
              // Check if table has any orders (even completed ones)
              const hasOrders = await db.getFirstAsync<{ count: number }>(
                'SELECT COUNT(*) as count FROM orders WHERE table_id = ?',
                [table.id]
              );

              if (hasOrders && hasOrders.count > 0) {
                Alert.alert('Cannot Delete', 'This table has order history. Please clear all orders first.');
                return;
              }

              // Delete the table
              await db.runAsync('DELETE FROM tables WHERE id = ?', [table.id]);
              
              await loadTables();
              Alert.alert('Success', `Table ${table.table_number} deleted successfully`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete table');
            }
          },
        },
      ]
    );
  };

  const handleTransferOrder = async () => {
    if (Platform.OS === 'web' || !useDBStore || !transferFromTable || !transferToTableId) {
      Alert.alert('Error', 'Please select a table to transfer to');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    const toTable = tables.find(t => t.id === transferToTableId);
    if (!toTable) {
      Alert.alert('Error', 'Target table not found');
      return;
    }

    // Check target table doesn't have active orders
    const targetHasActiveOrder = toTable.active_order_id || toTable.current_order_id;
    if (targetHasActiveOrder) {
      Alert.alert('Error', 'Target table already has an active order');
      return;
    }

    const activeOrderId = transferFromTable.active_order_id || transferFromTable.current_order_id;
    if (!activeOrderId) {
      Alert.alert('Error', 'No active order to transfer');
      return;
    }

    try {
      // Update the order's table_id
      await db.runAsync(
        'UPDATE orders SET table_id = ? WHERE id = ?',
        [transferToTableId, activeOrderId]
      );

      // Check if source table still has any orders
      const remainingOrders = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM orders 
         WHERE table_id = ? AND status IN ('pending', 'preparing')`,
        [transferFromTable.id]
      );

      // Update the old table status
      if (remainingOrders?.count === 0) {
        await db.runAsync(
          'UPDATE tables SET status = ? WHERE id = ?',
          ['available', transferFromTable.id]
        );
      }

      // Update the new table status
      await db.runAsync(
        'UPDATE tables SET status = ? WHERE id = ?',
        ['occupied', transferToTableId]
      );

      setTransferModalVisible(false);
      setTransferFromTable(null);
      setTransferToTableId('');
      await loadTables();
      Alert.alert('Success', `Order transferred to Table ${toTable.table_number}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to transfer order');
    }
  };

  const openEditTable = (table: Table) => {
    setEditingTable(table);
    setNewTableNumber(table.table_number);
    setNewTableSeats(table.seats.toString());
    setEditModalVisible(true);
  };

  const openTransferModal = (table: Table) => {
    const hasActiveOrder = table.active_order_id || table.current_order_id;
    if (!hasActiveOrder) {
      Alert.alert('Error', 'This table has no active order to transfer');
      return;
    }
    setTransferFromTable(table);
    setTransferToTableId('');
    setTransferModalVisible(true);
  };

  const handleCancelOrder = (table: Table) => {
    const activeOrderId = table.active_order_id || table.current_order_id;
    if (!activeOrderId) {
      Alert.alert('Error', 'No active order to cancel');
      return;
    }

    Alert.alert(
      'Cancel Order',
      `Are you sure you want to cancel the order for Table ${table.table_number}? All items will be removed.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel Order',
          style: 'destructive',
          onPress: async () => {
            if (!useDBStore) return;
            const db = useDBStore.getState().getDatabase();
            if (!db) return;

            try {
              // Delete all order items
              await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [activeOrderId]);
              
              // Delete KOT prints for this order
              await db.runAsync('DELETE FROM kot_prints WHERE order_id = ?', [activeOrderId]);
              
              // Delete the order
              await db.runAsync('DELETE FROM orders WHERE id = ?', [activeOrderId]);
              
              // Check if table still has any other orders (including those with bill_printed = 1)
              const remainingOrders = await db.getFirstAsync<{ count: number }>(
                `SELECT COUNT(*) as count FROM orders 
                 WHERE table_id = ? AND status IN ('pending', 'preparing')`,
                [table.id]
              );

              // Update table status if no more orders
              if (!remainingOrders || remainingOrders.count === 0) {
                await db.runAsync(
                  'UPDATE tables SET status = ?, current_order_id = NULL WHERE id = ?',
                  ['available', table.id]
                );
              }

              await loadTables();
              Alert.alert('Success', 'Order cancelled successfully');
            } catch (error: any) {
              console.error('Cancel order error:', error);
              Alert.alert('Error', error.message || 'Failed to cancel order');
            }
          },
        },
      ]
    );
  };

  const handleTablePress = (table: Table) => {
    const options: any[] = [
      { text: 'Cancel', style: 'cancel' as const },
    ];

    const hasActiveOrder = table.active_order_id || table.current_order_id;
    const hasPendingBills = (table.pending_bills_count || 0) > 0;

    // Case 1: Table has pending bills (previous customer not settled)
    if (hasPendingBills) {
      // Option to start fresh order for new customer
      options.push({
        text: '👤 New Customer',
        onPress: () => router.push(`/order/${table.id}`),
      });
      
      // Option to view/settle pending bills
      options.push({
        text: '📋 View Pending Bills',
        onPress: () => router.push('/(tabs)/billing'),
      });
      
      // If also has active order, show option to view it
      if (hasActiveOrder) {
        options.push({
          text: '📝 View Current Order',
          onPress: () => router.push(`/order/${table.id}`),
        });
        options.push({
          text: 'Transfer Current Order',
          onPress: () => openTransferModal(table),
        });
        options.push({
          text: '🗑️ Cancel Current Order',
          style: 'destructive',
          onPress: () => handleCancelOrder(table),
        });
      }
    } 
    // Case 2: Table has active order (no pending bills)
    else if (hasActiveOrder) {
      options.push({
        text: 'View/Edit Order',
        onPress: () => router.push(`/order/${table.id}`),
      });
      options.push({
        text: 'Transfer Order',
        onPress: () => openTransferModal(table),
      });
      options.push({
        text: '🗑️ Cancel Order',
        style: 'destructive',
        onPress: () => handleCancelOrder(table),
      });
    } 
    // Case 3: Table is completely available
    else {
      options.push({
        text: 'Take Order',
        onPress: () => router.push(`/order/${table.id}`),
      });
    }

    // Only admin can edit/delete table details
    if (user?.role === 'admin') {
      options.push({
        text: '✏️ Edit Table',
        onPress: () => openEditTable(table),
      });
      
      // Only allow delete if table has no active orders or pending bills
      if (!hasActiveOrder && !hasPendingBills) {
        options.push({
          text: '🗑️ Delete Table',
          style: 'destructive',
          onPress: () => handleDeleteTable(table),
        });
      }
    }

    // Build status text
    let statusText = `Seats: ${table.seats}`;
    if (hasPendingBills) {
      statusText += `\n⏳ ${table.pending_bills_count} pending bill${(table.pending_bills_count || 0) > 1 ? 's' : ''} (old customer)`;
    }
    if (hasActiveOrder) {
      statusText += `\n✏️ Active order in progress`;
    }
    if (!hasPendingBills && !hasActiveOrder) {
      statusText += `\n✅ Available`;
    }

    Alert.alert(
      `Table ${table.table_number}`,
      statusText,
      options
    );
  };

  const getTableColor = (table: Table) => {
    const hasActiveOrder = table.active_order_id || table.current_order_id;
    const hasPendingBills = (table.pending_bills_count || 0) > 0;

    if (hasPendingBills && hasActiveOrder) {
      return '#9C27B0'; // Purple: has both pending bill AND active order
    } else if (hasPendingBills) {
      return '#FF9800'; // Orange: has pending bill(s), awaiting settlement
    } else if (hasActiveOrder || table.status === 'occupied') {
      return '#FF6B35'; // Red-orange: occupied with active order
    } else if (table.status === 'reserved') {
      return '#95E1D3';
    } else {
      return '#4ECDC4'; // Teal: available
    }
  };

  const getTableStatus = (table: Table) => {
    const hasActiveOrder = table.active_order_id || table.current_order_id;
    const hasPendingBills = (table.pending_bills_count || 0) > 0;

    if (hasPendingBills && hasActiveOrder) {
      return 'billing+order';
    } else if (hasPendingBills) {
      return 'billing';
    } else if (hasActiveOrder || table.status === 'occupied') {
      return 'occupied';
    } else {
      return table.status;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tables</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setAddModalVisible(true)}
        >
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.gridContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {tables.map((table) => (
          <TouchableOpacity
            key={table.id}
            style={[
              styles.tableCard,
              { borderTopColor: getTableColor(table) },
            ]}
            onPress={() => handleTablePress(table)}
          >
            <View style={styles.tableHeader}>
              <Text style={styles.tableNumber}>{table.table_number}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getTableColor(table) },
                ]}
              >
                <Text style={styles.statusText}>{getTableStatus(table)}</Text>
              </View>
            </View>
            <View style={styles.tableInfo}>
              <Ionicons name="person" size={16} color="#666" />
              <Text style={styles.seatsText}>{table.seats} seats</Text>
            </View>
            {/* Show active order indicator */}
            {(table.active_order_id || table.current_order_id) && (
              <View style={styles.activeOrderBadge}>
                <Ionicons name="create" size={14} color="#FF6B35" />
                <Text style={styles.activeOrderText}>Order in progress</Text>
              </View>
            )}
            {/* Show pending bills indicator */}
            {(table.pending_bills_count || 0) > 0 && (
              <View style={styles.pendingBillsBadge}>
                <Ionicons name="time" size={14} color="#FF9800" />
                <Text style={styles.pendingBillsText}>
                  {table.pending_bills_count} bill{(table.pending_bills_count || 0) > 1 ? 's' : ''} unsettled
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Table</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Table Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., T7"
                value={newTableNumber}
                onChangeText={setNewTableNumber}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Number of Seats</Text>
              <TextInput
                style={styles.input}
                placeholder="4"
                value={newTableSeats}
                onChangeText={setNewTableSeats}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setAddModalVisible(false);
                  setNewTableNumber('');
                  setNewTableSeats('4');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddTable}
              >
                <Text style={styles.confirmButtonText}>Add Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Table Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Table</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Table Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., T7"
                value={newTableNumber}
                onChangeText={setNewTableNumber}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Number of Seats</Text>
              <TextInput
                style={styles.input}
                placeholder="4"
                value={newTableSeats}
                onChangeText={setNewTableSeats}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setEditModalVisible(false);
                  setEditingTable(null);
                  setNewTableNumber('');
                  setNewTableSeats('4');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleEditTable}
              >
                <Text style={styles.confirmButtonText}>Update Table</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer Order Modal */}
      <Modal
        visible={transferModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTransferModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Transfer Order</Text>
            <Text style={styles.modalSubtitle}>
              From: Table {transferFromTable?.table_number}
            </Text>

            <Text style={styles.inputLabel}>Select Target Table</Text>
            <ScrollView style={styles.transferTableList}>
              {tables
                .filter(
                  (t) => t.status === 'available' && t.id !== transferFromTable?.id
                )
                .map((table) => (
                  <TouchableOpacity
                    key={table.id}
                    style={[
                      styles.transferTableOption,
                      transferToTableId === table.id && styles.transferTableOptionSelected,
                    ]}
                    onPress={() => setTransferToTableId(table.id)}
                  >
                    <View style={styles.transferTableInfo}>
                      <Text style={styles.transferTableNumber}>
                        {table.table_number}
                      </Text>
                      <Text style={styles.transferTableSeats}>
                        {table.seats} seats
                      </Text>
                    </View>
                    <Ionicons
                      name={
                        transferToTableId === table.id
                          ? 'radio-button-on'
                          : 'radio-button-off'
                      }
                      size={24}
                      color={transferToTableId === table.id ? '#4ECDC4' : '#999'}
                    />
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setTransferModalVisible(false);
                  setTransferFromTable(null);
                  setTransferToTableId('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleTransferOrder}
                disabled={!transferToTableId}
              >
                <Text style={styles.confirmButtonText}>Transfer</Text>
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
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  gridContainer: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  tableCard: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tableNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  tableInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seatsText: {
    fontSize: 14,
    color: '#666',
  },
  activeOrderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FFF0EB',
    borderRadius: 4,
  },
  activeOrderText: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '600',
  },
  pendingBillsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 4,
  },
  pendingBillsText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButton: {
    backgroundColor: '#FF6B35',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  transferTableList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  transferTableOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  transferTableOptionSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0FFFE',
  },
  transferTableInfo: {
    flex: 1,
  },
  transferTableNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  transferTableSeats: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});
