import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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
}

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableSeats, setNewTableSeats] = useState('4');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadTables();
    }
  }, []);

  const loadTables = async () => {
    if (Platform.OS === 'web' || !useDBStore) return;
    
    const db = useDBStore.getState().getDatabase();
    if (!db) return;
    try {
      const result = await db.getAllAsync<Table>(
        'SELECT * FROM tables ORDER BY table_number'
      );
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

  const handleTablePress = (table: Table) => {
    if (table.status === 'available') {
      Alert.alert(
        `Table ${table.table_number}`,
        'What would you like to do?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Take Order',
            onPress: () => router.push(`/order/${table.id}`),
          },
        ]
      );
    } else {
      Alert.alert(
        `Table ${table.table_number}`,
        'Table is currently occupied',
        [
          { text: 'OK', style: 'cancel' },
          {
            text: 'View Order',
            onPress: () => router.push(`/order/${table.id}`),
          },
        ]
      );
    }
  };

  const getTableColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#4ECDC4';
      case 'occupied':
        return '#FF6B35';
      case 'reserved':
        return '#95E1D3';
      default:
        return '#999';
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
              { borderTopColor: getTableColor(table.status) },
            ]}
            onPress={() => handleTablePress(table)}
          >
            <View style={styles.tableHeader}>
              <Text style={styles.tableNumber}>{table.table_number}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getTableColor(table.status) },
                ]}
              >
                <Text style={styles.statusText}>{table.status}</Text>
              </View>
            </View>
            <View style={styles.tableInfo}>
              <Ionicons name="person" size={16} color="#666" />
              <Text style={styles.seatsText}>{table.seats} seats</Text>
            </View>
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
});
