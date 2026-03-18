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
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  username: string;
  name: string;
  role: string;
}

export default function UsersScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<User[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('captain');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      Alert.alert('Access Denied', 'Only admin can access user management');
      router.back();
      return;
    }
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const handleSaveUser = async () => {
    if (!username.trim() || !name.trim() || !password.trim() || !pin.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      Alert.alert('Error', 'PIN must be exactly 4 digits');
      return;
    }

    try {
      const url = editingUser
        ? `${BACKEND_URL}/api/users/${editingUser.id}`
        : `${BACKEND_URL}/api/users`;
      
      const method = editingUser ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          name,
          role,
          password,
          pin,
        }),
      });

      if (response.ok) {
        Alert.alert('Success', editingUser ? 'User updated' : 'User created');
        setModalVisible(false);
        resetForm();
        loadUsers();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to save user');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      Alert.alert('Error', 'You cannot delete your own account');
      return;
    }

    Alert.alert(
      'Delete User',
      'Are you sure you want to delete this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${BACKEND_URL}/api/users/${userId}`, {
                method: 'DELETE',
              });

              if (response.ok) {
                Alert.alert('Success', 'User deleted');
                loadUsers();
              } else {
                Alert.alert('Error', 'Failed to delete user');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  };

  const openAddUser = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setName(user.name);
    setRole(user.role);
    setPassword(''); // Don't show existing password
    setPin(''); // Don't show existing PIN
    setModalVisible(true);
  };

  const resetForm = () => {
    setEditingUser(null);
    setUsername('');
    setName('');
    setRole('captain');
    setPassword('');
    setPin('');
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return 'shield-checkmark';
      case 'manager':
        return 'briefcase';
      case 'captain':
        return 'restaurant';
      case 'cashier':
        return 'cash';
      default:
        return 'person';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return '#FF6B35';
      case 'manager':
        return '#4ECDC4';
      case 'captain':
        return '#95E1D3';
      case 'cashier':
        return '#F38181';
      default:
        return '#999';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Management</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddUser}>
          <Ionicons name="add" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.usersList}>
          {users.map((user) => (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.userInfo}>
                <View
                  style={[
                    styles.userIcon,
                    { backgroundColor: `${getRoleColor(user.role)}20` },
                  ]}
                >
                  <Ionicons
                    name={getRoleIcon(user.role) as any}
                    size={24}
                    color={getRoleColor(user.role)}
                  />
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user.role) }]}>
                    <Text style={styles.roleBadgeText}>{user.role.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.userActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditUser(user)}
                >
                  <Ionicons name="pencil" size={20} color="#4ECDC4" />
                </TouchableOpacity>
                {user.id !== currentUser?.id && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteUser(user.id)}
                  >
                    <Ionicons name="trash" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Add/Edit User Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingUser ? 'Edit User' : 'Add New User'}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  editable={!editingUser}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter full name"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role *</Text>
                <View style={styles.roleSelector}>
                  {['admin', 'manager', 'captain', 'cashier'].map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.roleOption,
                        role === r && styles.roleOptionActive,
                      ]}
                      onPress={() => setRole(r)}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          role === r && styles.roleOptionTextActive,
                        ]}
                      >
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Password * {editingUser && '(leave empty to keep unchanged)'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  4-Digit PIN * {editingUser && '(leave empty to keep unchanged)'}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 4-digit PIN"
                  value={pin}
                  onChangeText={(text) => setPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleSaveUser}
                >
                  <Text style={styles.confirmButtonText}>
                    {editingUser ? 'Update' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
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
  usersList: {
    padding: 16,
  },
  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  userUsername: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },
  modalScrollContent: {
    padding: 16,
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  inputGroup: {
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
  roleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleOptionActive: {
    backgroundColor: '#FFF5F0',
    borderColor: '#FF6B35',
  },
  roleOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  roleOptionTextActive: {
    color: '#FF6B35',
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
