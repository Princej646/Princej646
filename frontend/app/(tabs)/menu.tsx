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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

let useDBStore: any = null;
if (Platform.OS !== 'web') {
  useDBStore = require('../../store/dbStore').useDBStore;
}

interface Category {
  id: string;
  name: string;
  display_order: number;
  active: number;
}

interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  base_price: number;
  image_base64: string | null;
  active: number;
}

interface Addon {
  id: string;
  item_id: string;
  addon_name: string;
  price: number;
}

export default function MenuScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showAddonModal, setShowAddonModal] = useState(false);
  
  // Category form
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  // Menu item form
  const [itemName, setItemName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  
  // Addon form
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [itemAddons, setItemAddons] = useState<Addon[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadCategories();
    }
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadMenuItems(selectedCategory);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const result = await db.getAllAsync<Category>(
        'SELECT * FROM categories WHERE active = 1 ORDER BY display_order'
      );
      setCategories(result);
      if (result.length > 0 && !selectedCategory) {
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

  const handleSaveCategory = async () => {
    if (!useDBStore || !categoryName.trim()) {
      Alert.alert('Error', 'Please enter category name');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      if (editingCategory) {
        await db.runAsync(
          'UPDATE categories SET name = ? WHERE id = ?',
          [categoryName, editingCategory.id]
        );
        Alert.alert('Success', 'Category updated successfully');
      } else {
        const id = `cat_${Date.now()}`;
        const maxOrder = categories.length > 0 
          ? Math.max(...categories.map(c => c.display_order)) + 1 
          : 1;
        await db.runAsync(
          'INSERT INTO categories (id, name, display_order, active) VALUES (?, ?, ?, ?)',
          [id, categoryName, maxOrder, 1]
        );
        Alert.alert('Success', 'Category added successfully');
      }
      setShowCategoryModal(false);
      setCategoryName('');
      setEditingCategory(null);
      await loadCategories();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save category');
    }
  };

  const handleSaveMenuItem = async () => {
    if (!useDBStore || !itemName.trim() || !itemPrice || !selectedCategory) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      if (editingItem) {
        await db.runAsync(
          'UPDATE menu_items SET name = ?, description = ?, base_price = ?, image_base64 = ? WHERE id = ?',
          [itemName, itemDescription, parseFloat(itemPrice), itemImage, editingItem.id]
        );
        Alert.alert('Success', 'Menu item updated successfully');
      } else {
        const id = `item_${Date.now()}`;
        await db.runAsync(
          'INSERT INTO menu_items (id, category_id, name, description, base_price, image_base64, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, selectedCategory, itemName, itemDescription, parseFloat(itemPrice), itemImage, 1]
        );
        Alert.alert('Success', 'Menu item added successfully');
      }
      setShowItemModal(false);
      resetItemForm();
      await loadMenuItems(selectedCategory);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save menu item');
    }
  };

  const handleAddAddon = async () => {
    if (!useDBStore || !selectedItem || !addonName.trim() || !addonPrice) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    try {
      const id = `addon_${Date.now()}`;
      await db.runAsync(
        'INSERT INTO item_addons (id, item_id, addon_name, price) VALUES (?, ?, ?, ?)',
        [id, selectedItem.id, addonName, parseFloat(addonPrice)]
      );
      Alert.alert('Success', 'Add-on added successfully');
      setAddonName('');
      setAddonPrice('');
      await loadItemAddons(selectedItem.id);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add add-on');
    }
  };

  const handleDeleteAddon = async (addonId: string) => {
    if (!useDBStore) return;
    const db = useDBStore.getState().getDatabase();
    if (!db) return;

    Alert.alert(
      'Delete Add-on',
      'Are you sure you want to delete this add-on?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM item_addons WHERE id = ?', [addonId]);
              if (selectedItem) {
                await loadItemAddons(selectedItem.id);
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete add-on');
            }
          },
        },
      ]
    );
  };

  const pickImage = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Image picker is not available on web');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll permission is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setItemImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const resetItemForm = () => {
    setItemName('');
    setItemDescription('');
    setItemPrice('');
    setItemImage(null);
    setEditingItem(null);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setShowCategoryModal(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemDescription(item.description);
    setItemPrice(item.base_price.toString());
    setItemImage(item.image_base64);
    setShowItemModal(true);
  };

  const openAddonsModal = (item: MenuItem) => {
    setSelectedItem(item);
    loadItemAddons(item.id);
    setShowAddonModal(true);
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Menu Management</Text>
        </View>
        <View style={styles.webNotice}>
          <Ionicons name="phone-portrait" size={64} color="#FF6B35" />
          <Text style={styles.webNoticeText}>This feature is only available on mobile devices</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Menu Management</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: '#95E1D3' }]}
            onPress={() => setShowCategoryModal(true)}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.headerButtonText}>Category</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: '#FF6B35' }]}
            onPress={() => {
              resetItemForm();
              setShowItemModal(true);
            }}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.headerButtonText}>Item</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryTabs}>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTab,
              selectedCategory === category.id && styles.categoryTabActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
            onLongPress={() => openEditCategory(category)}
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

      {/* Menu Items Grid */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.itemsGrid}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.itemCard}
            onPress={() => openEditItem(item)}
          >
            {item.image_base64 ? (
              <View style={styles.itemImageContainer}>
                <Text style={styles.itemImagePlaceholder}>🍽️</Text>
              </View>
            ) : (
              <View style={styles.itemImageContainer}>
                <Ionicons name="fast-food" size={32} color="#999" />
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemDescription} numberOfLines={2}>{item.description}</Text>
              <View style={styles.itemFooter}>
                <Text style={styles.itemPrice}>₹{item.base_price.toFixed(2)}</Text>
                <TouchableOpacity
                  style={styles.addonButton}
                  onPress={() => openAddonsModal(item)}
                >
                  <Ionicons name="add-circle" size={20} color="#4ECDC4" />
                  <Text style={styles.addonButtonText}>Add-ons</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Category Modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Category Name"
              value={categoryName}
              onChangeText={setCategoryName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowCategoryModal(false);
                  setCategoryName('');
                  setEditingCategory(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSaveCategory}
              >
                <Text style={styles.confirmButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Menu Item Modal */}
      <Modal visible={showItemModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </Text>
              
              <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                {itemImage ? (
                  <Text style={styles.imagePickerText}>📷 Change Image</Text>
                ) : (
                  <>
                    <Ionicons name="camera" size={24} color="#666" />
                    <Text style={styles.imagePickerText}>Add Image</Text>
                  </>
                )}
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder="Item Name *"
                value={itemName}
                onChangeText={setItemName}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description"
                value={itemDescription}
                onChangeText={setItemDescription}
                multiline
                numberOfLines={3}
              />
              <TextInput
                style={styles.input}
                placeholder="Price *"
                value={itemPrice}
                onChangeText={setItemPrice}
                keyboardType="decimal-pad"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowItemModal(false);
                    resetItemForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleSaveMenuItem}
                >
                  <Text style={styles.confirmButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Add-ons Modal */}
      <Modal visible={showAddonModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manage Add-ons</Text>
            <Text style={styles.modalSubtitle}>{selectedItem?.name}</Text>
            
            <View style={styles.addonInputRow}>
              <TextInput
                style={[styles.input, { flex: 2, marginRight: 8 }]}
                placeholder="Add-on Name"
                value={addonName}
                onChangeText={setAddonName}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="Price"
                value={addonPrice}
                onChangeText={setAddonPrice}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.addAddonButton} onPress={handleAddAddon}>
                <Ionicons name="add" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.addonsList}>
              {itemAddons.map((addon) => (
                <View key={addon.id} style={styles.addonItem}>
                  <View style={styles.addonItemInfo}>
                    <Text style={styles.addonItemName}>{addon.addon_name}</Text>
                    <Text style={styles.addonItemPrice}>₹{addon.price.toFixed(2)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteAddon(addon.id)}>
                    <Ionicons name="trash" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalButton, styles.confirmButton, { width: '100%' }]}
              onPress={() => {
                setShowAddonModal(false);
                setSelectedItem(null);
                setItemAddons([]);
              }}
            >
              <Text style={styles.confirmButtonText}>Done</Text>
            </TouchableOpacity>
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
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  categoryTabs: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  categoryTab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  categoryTabActive: {
    borderBottomColor: '#FF6B35',
  },
  categoryTabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  categoryTabTextActive: {
    color: '#FF6B35',
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  itemsGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  itemCard: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemImageContainer: {
    height: 120,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImagePlaceholder: {
    fontSize: 48,
  },
  itemInfo: {
    padding: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    minHeight: 32,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B35',
  },
  addonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addonButtonText: {
    fontSize: 12,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 20,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: 12,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    fontSize: 16,
    color: '#666',
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
  addonInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  addAddonButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#4ECDC4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addonsList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  addonItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8,
  },
  addonItemInfo: {
    flex: 1,
  },
  addonItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  addonItemPrice: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
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