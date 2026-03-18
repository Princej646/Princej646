import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';

let useDBStore: any = null;
let bluetoothPrinter: any = null;
if (Platform.OS !== 'web') {
  useDBStore = require('../../store/dbStore').useDBStore;
  bluetoothPrinter = require('../../utils/bluetoothPrinter').bluetoothPrinter;
}

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  base_price: number;
}

interface Addon {
  id: string;
  addon_name: string;
  price: number;
}

interface OrderItem {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  addons_json: string | null;
  notes: string | null;
}

export default function OrderScreen() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  
  const [table, setTable] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemAddons, setItemAddons] = useState<Addon[]>([]);
  
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [itemNotes, setItemNotes] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  useEffect(() => {
    if (Platform.OS !== 'web' && tableId) {
      loadTableAndOrder();
      loadCategories();
    }
  }, [tableId]);

  useEffect(() => {
    if (selectedCategory) {
      loadMenuItems(selectedCategory);
    }
  }, [selectedCategory]);

  const loadTableAndOrder = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const tableResult = await db.getFirstAsync(
        'SELECT * FROM tables WHERE id = ?',
        [tableId]
      );
      setTable(tableResult);

      // Find active order that hasn't been billed yet
      const orderResult = await db.getFirstAsync(
        `SELECT * FROM orders 
         WHERE table_id = ? AND bill_printed = 0 AND status IN ('pending', 'preparing')
         ORDER BY created_at DESC LIMIT 1`,
        [tableId]
      );
      
      if (orderResult) {
        setOrder(orderResult);
        
        const items = await db.getAllAsync<OrderItem>(
          'SELECT * FROM order_items WHERE order_id = ?',
          [orderResult.id]
        );
        setOrderItems(items);
      } else {
        setOrder(null);
        setOrderItems([]);
      }
    } catch (error) {
      console.error('Error loading table and order:', error);
    }
  };

  const loadCategories = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const result = await db.getAllAsync<Category>(
        'SELECT * FROM categories WHERE active = 1 ORDER BY display_order'
      );
      setCategories(result);
      if (result.length > 0) {
        setSelectedCategory(result[0].id);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadMenuItems = async (categoryId: string) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const result = await db.getAllAsync<MenuItem>(
        'SELECT * FROM menu_items WHERE category_id = ? AND active = 1',
        [categoryId]
      );
      setMenuItems(result);
    } catch (error) {
      console.error('Error loading menu items:', error);
    }
  };

  const loadItemAddons = async (itemId: string) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const result = await db.getAllAsync<Addon>(
        'SELECT * FROM item_addons WHERE item_id = ?',
        [itemId]
      );
      setItemAddons(result);
    } catch (error) {
      console.error('Error loading addons:', error);
    }
  };

  const createOrder = async () => {
    if (!useDBStore || !user) return null;
    const db = useDBStore.getState().getDatabase();
    if (!db) return null;

    try {
      const orderId = `order_${Date.now()}`;
      await db.runAsync(
        'INSERT INTO orders (id, table_id, created_by_user_id, created_by_username, status, bill_printed) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, tableId, user.id, user.username, 'pending', 0]
      );
      
      // Update table status to occupied
      await db.runAsync(
        'UPDATE tables SET status = ? WHERE id = ?',
        ['occupied', tableId]
      );
      
      return orderId;
    } catch (error) {
      console.error('Error creating order:', error);
      return null;
    }
  };

  const handleAddItem = async (item: MenuItem) => {
    setSelectedItem(item);
    await loadItemAddons(item.id);
    setItemQuantity(1);
    setSelectedAddons([]);
    setItemNotes('');
    setShowItemModal(true);
  };

  const handleConfirmAddItem = async () => {
    if (!useDBStore || !selectedItem) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      let currentOrderId = order?.id;
      
      if (!currentOrderId) {
        currentOrderId = await createOrder();
        if (!currentOrderId) {
          Alert.alert('Error', 'Failed to create order');
          return;
        }
      }

      const selectedAddonsList = itemAddons.filter(a => selectedAddons.includes(a.id));
      const addonsJson = JSON.stringify(selectedAddonsList);
      const addonsTotalPrice = selectedAddonsList.reduce((sum, a) => sum + a.price, 0);
      const totalUnitPrice = selectedItem.base_price + addonsTotalPrice;

      const orderItemId = `oi_${Date.now()}`;
      await db.runAsync(
        'INSERT INTO order_items (id, order_id, item_id, item_name, quantity, unit_price, addons_json, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [orderItemId, currentOrderId, selectedItem.id, selectedItem.name, itemQuantity, totalUnitPrice, addonsJson, itemNotes]
      );

      setShowItemModal(false);
      await loadTableAndOrder();
      Alert.alert('Success', 'Item added to order');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add item');
    }
  };

  const handleRemoveOrderItem = async (orderItemId: string) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    Alert.alert(
      'Remove Item',
      'Are you sure you want to remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM order_items WHERE id = ?', [orderItemId]);
              await loadTableAndOrder();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove item');
            }
          },
        },
      ]
    );
  };

  const handleSubmitOrder = async () => {
    if (!useDBStore || !order) {
      Alert.alert('Error', 'No order to submit');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    Alert.alert(
      'Submit Order',
      'Send this order to kitchen (KOT)?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            try {
              await db.runAsync(
                'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['preparing', order.id]
              );

              const kotId = `kot_${Date.now()}`;
              await db.runAsync(
                'INSERT INTO kot_prints (id, order_id, table_number, items_json, printed_by_username) VALUES (?, ?, ?, ?, ?)',
                [kotId, order.id, table?.table_number, JSON.stringify(orderItems), user?.username]
              );

              // Try to print KOT via Bluetooth printer
              if (bluetoothPrinter && bluetoothPrinter.isConnected()) {
                try {
                  const printItems = orderItems.map(item => {
                    const addons = item.addons_json ? JSON.parse(item.addons_json) : [];
                    return {
                      name: item.item_name,
                      quantity: item.quantity,
                      notes: item.notes || undefined,
                      addons: addons.length > 0 ? addons.map((a: any) => a.name) : undefined,
                    };
                  });

                  await bluetoothPrinter.printKOT({
                    tableNumber: table?.table_number || 'Unknown',
                    orderId: order.id,
                    items: printItems,
                    timestamp: new Date().toLocaleString(),
                    printedBy: user?.username || 'Unknown',
                  });

                  Alert.alert('Success', 'Order sent to kitchen! KOT printed.');
                } catch (printError) {
                  console.error('KOT print error:', printError);
                  Alert.alert('Success', 'Order sent to kitchen! (Printer not available)');
                }
              } else {
                Alert.alert('Success', 'Order sent to kitchen! (Connect printer in Settings)');
              }
              
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to submit order');
            }
          },
        },
      ]
    );
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.webNotice}>This feature is only available on mobile devices</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Table {table?.table_number}</Text>
          <Text style={styles.headerSubtitle}>
            {order ? `Order #${order.id.slice(-8)}` : 'New Order'}
          </Text>
        </View>
        {orderItems.length > 0 && (
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmitOrder}
          >
            <Ionicons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        {/* Left: Menu Items */}
        <View style={styles.menuSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryTabs}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryTab,
                  selectedCategory === category.id && styles.categoryTabActive,
                ]}
                onPress={() => setSelectedCategory(category.id)}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    selectedCategory === category.id && styles.categoryTabTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={styles.menuItemsList}>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => handleAddItem(item)}
              >
                <View style={styles.menuItemInfo}>
                  <Text style={styles.menuItemName}>{item.name}</Text>
                  <Text style={styles.menuItemDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <Text style={styles.menuItemPrice}>₹{item.base_price.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Right: Order Summary */}
        <View style={styles.orderSection}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderTitle}>Order Summary</Text>
            <Text style={styles.orderCount}>{orderItems.length} items</Text>
          </View>

          <ScrollView style={styles.orderItemsList}>
            {orderItems.map((item) => {
              const addons = item.addons_json ? JSON.parse(item.addons_json) : [];
              return (
                <View key={item.id} style={styles.orderItem}>
                  <View style={styles.orderItemHeader}>
                    <Text style={styles.orderItemQuantity}>{item.quantity}x</Text>
                    <View style={styles.orderItemInfo}>
                      <Text style={styles.orderItemName}>{item.item_name}</Text>
                      {addons.length > 0 && (
                        <Text style={styles.orderItemAddons}>
                          + {addons.map((a: any) => a.addon_name).join(', ')}
                        </Text>
                      )}
                      {item.notes && (
                        <Text style={styles.orderItemNotes}>Note: {item.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveOrderItem(item.id)}>
                      <Ionicons name="close-circle" size={24} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.orderItemPrice}>
                    ₹{(item.unit_price * item.quantity).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {orderItems.length > 0 && (
            <View style={styles.orderFooter}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>₹{calculateTotal().toFixed(2)}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Add Item Modal */}
      <Modal visible={showItemModal} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
              style={styles.keyboardAvoidingContainer}
            >
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <ScrollView 
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.modalScrollContent}
                  >
                    <Text style={styles.modalTitle}>{selectedItem?.name}</Text>
                    <Text style={styles.modalSubtitle}>₹{selectedItem?.base_price.toFixed(2)}</Text>

                    {itemAddons.length > 0 && (
                      <View style={styles.addonsSection}>
                        <Text style={styles.addonsSectionTitle}>Add-ons</Text>
                        {itemAddons.map((addon) => (
                          <TouchableOpacity
                            key={addon.id}
                            style={styles.addonOption}
                            onPress={() => {
                              if (selectedAddons.includes(addon.id)) {
                                setSelectedAddons(selectedAddons.filter(id => id !== addon.id));
                              } else {
                                setSelectedAddons([...selectedAddons, addon.id]);
                              }
                            }}
                          >
                            <Ionicons
                              name={selectedAddons.includes(addon.id) ? "checkbox" : "square-outline"}
                              size={24}
                              color="#FF6B35"
                            />
                            <Text style={styles.addonOptionText}>{addon.addon_name}</Text>
                            <Text style={styles.addonOptionPrice}>+₹{addon.price.toFixed(2)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.quantitySection}>
                      <Text style={styles.quantitySectionTitle}>Quantity</Text>
                      <View style={styles.quantityControls}>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                        >
                          <Ionicons name="remove" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.quantityValue}>{itemQuantity}</Text>
                        <TouchableOpacity
                          style={styles.quantityButton}
                          onPress={() => setItemQuantity(itemQuantity + 1)}
                        >
                          <Ionicons name="add" size={24} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <TextInput
                      style={styles.notesInput}
                      placeholder="Special instructions (optional)"
                      placeholderTextColor="#999"
                      value={itemNotes}
                      onChangeText={setItemNotes}
                      multiline
                      returnKeyType="done"
                      blurOnSubmit={true}
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </ScrollView>
                  
                  {/* Buttons outside ScrollView to ensure visibility */}
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.cancelButton]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowItemModal(false);
                      }}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.confirmButton]}
                      onPress={() => {
                        Keyboard.dismiss();
                        handleConfirmAddItem();
                      }}
                    >
                      <Text style={styles.confirmButtonText}>Add to Order</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
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
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 16,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  submitButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4ECDC4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  menuSection: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  categoryTabs: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  categoryTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  categoryTabActive: {
    borderBottomColor: '#FF6B35',
  },
  categoryTabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  categoryTabTextActive: {
    color: '#FF6B35',
    fontWeight: 'bold',
  },
  menuItemsList: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  menuItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  menuItemDescription: {
    fontSize: 12,
    color: '#666',
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  orderSection: {
    width: '40%',
    backgroundColor: '#FFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E0E0E0',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  orderCount: {
    fontSize: 14,
    color: '#666',
  },
  orderItemsList: {
    flex: 1,
  },
  orderItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  orderItemHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  orderItemQuantity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35',
    width: 30,
  },
  orderItemInfo: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  orderItemAddons: {
    fontSize: 12,
    color: '#4ECDC4',
    marginTop: 2,
  },
  orderItemNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#999',
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'right',
  },
  orderFooter: {
    padding: 16,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardAvoidingContainer: {
    width: '85%',
    maxHeight: '80%',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    maxHeight: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  modalSubtitle: {
    fontSize: 18,
    color: '#FF6B35',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  addonsSection: {
    marginBottom: 20,
  },
  addonsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  addonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  addonOptionText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1A1A',
    marginLeft: 12,
  },
  addonOptionPrice: {
    fontSize: 14,
    color: '#666',
  },
  quantitySection: {
    marginBottom: 20,
  },
  quantitySectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  quantityButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    minWidth: 40,
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    fontSize: 14,
    color: '#1A1A1A',
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
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
    backgroundColor: '#4ECDC4',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  webNotice: {
    flex: 1,
    textAlign: 'center',
    marginTop: 100,
    fontSize: 18,
    color: '#666',
  },
});