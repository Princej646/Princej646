import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

let useDBStore: any = null;
let backupUtils: any = null;

if (Platform.OS !== 'web') {
  useDBStore = require('../store/dbStore').useDBStore;
  backupUtils = require('../utils/backup');
}

interface BackupFile {
  name: string;
  date: string;
}

export default function BackupScreen() {
  const router = useRouter();
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [selectedBackupFile, setSelectedBackupFile] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadBackupFiles();
    }
  }, []);

  const loadBackupFiles = async () => {
    if (!backupUtils) return;
    
    try {
      const files = await backupUtils.listBackupFiles();
      const formattedFiles = files.map((name: string) => {
        // Parse date from filename: pos_backup_2024-01-15T10-30-00-000Z.json
        const dateMatch = name.match(/pos_backup_(.+)\.json/);
        let date = 'Unknown date';
        if (dateMatch) {
          const dateStr = dateMatch[1].replace(/-/g, ':').replace('T', ' ').substring(0, 19);
          date = dateStr.replace(/:/g, '-').substring(0, 10) + ' ' + dateStr.substring(11, 19).replace(/-/g, ':');
        }
        return { name, date };
      });
      setBackupFiles(formattedFiles.reverse()); // Most recent first
    } catch (error) {
      console.error('Error loading backup files:', error);
    }
  };

  const handleCreateBackup = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPasswordModal(true);
  };

  const handleConfirmBackup = async () => {
    if (password.length < 4) {
      Alert.alert('Error', 'Password must be at least 4 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setShowPasswordModal(false);
    setIsLoading(true);

    try {
      const db = useDBStore?.getState().getDatabase();
      if (!db) {
        throw new Error('Database not available');
      }

      const { filePath, fileName } = await backupUtils.createBackup(db, password);
      
      Alert.alert(
        'Backup Created',
        `Backup saved as ${fileName}`,
        [
          { text: 'OK', onPress: () => loadBackupFiles() },
          {
            text: 'Share',
            onPress: async () => {
              try {
                await backupUtils.shareBackup(filePath);
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to share backup');
              }
              loadBackupFiles();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create backup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreFromFile = () => {
    setSelectedBackupFile(null);
    setRestorePassword('');
    setShowRestoreModal(true);
  };

  const handleRestoreFromLocalBackup = (fileName: string) => {
    Alert.alert(
      'Restore Backup',
      `Restore from ${fileName}?\n\nThis will replace ALL current data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            setSelectedBackupFile(fileName);
            setRestorePassword('');
            setShowRestoreModal(true);
          },
        },
      ]
    );
  };

  const handleConfirmRestore = async () => {
    if (restorePassword.length < 4) {
      Alert.alert('Error', 'Please enter the backup password');
      return;
    }

    setShowRestoreModal(false);
    setIsLoading(true);

    try {
      const db = useDBStore?.getState().getDatabase();
      if (!db) {
        throw new Error('Database not available');
      }

      let fileUri: string | undefined;
      if (selectedBackupFile) {
        // Use local backup file
        const FileSystem = require('expo-file-system');
        fileUri = `${FileSystem.documentDirectory}${selectedBackupFile}`;
      }

      const result = await backupUtils.restoreBackup(db, restorePassword, fileUri);
      
      if (result.success) {
        Alert.alert('Success', result.message, [
          { text: 'OK', onPress: () => router.replace('/(tabs)') },
        ]);
      } else {
        Alert.alert('Restore Failed', result.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore backup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShareBackup = async (fileName: string) => {
    if (!backupUtils) return;
    
    try {
      const FileSystem = require('expo-file-system');
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      await backupUtils.shareBackup(filePath);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to share backup');
    }
  };

  const handleDeleteBackup = (fileName: string) => {
    Alert.alert(
      'Delete Backup',
      `Are you sure you want to delete ${fileName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await backupUtils.deleteBackupFile(fileName);
              loadBackupFiles();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete backup');
            }
          },
        },
      ]
    );
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Backup & Restore</Text>
        </View>
        <View style={styles.webNotice}>
          <Ionicons name="cloud" size={64} color="#E0E0E0" />
          <Text style={styles.webNoticeText}>Backup & Restore is only available on mobile devices</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Backup & Restore</Text>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Processing...</Text>
        </View>
      )}

      <ScrollView style={styles.scrollView}>
        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCreateBackup}>
            <View style={styles.actionIcon}>
              <Ionicons name="cloud-upload" size={28} color="#FFF" />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Create Backup</Text>
              <Text style={styles.actionSubtitle}>Save all data with encryption</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handleRestoreFromFile}>
            <View style={[styles.actionIcon, styles.restoreIcon]}>
              <Ionicons name="cloud-download" size={28} color="#FFF" />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Restore from File</Text>
              <Text style={styles.actionSubtitle}>Import backup from external file</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Saved Backups */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Backups</Text>
          
          {backupFiles.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>No backups saved yet</Text>
              <Text style={styles.emptySubtext}>Create a backup to protect your data</Text>
            </View>
          ) : (
            backupFiles.map((file) => (
              <View key={file.name} style={styles.backupCard}>
                <View style={styles.backupInfo}>
                  <Ionicons name="document" size={24} color="#FF6B35" />
                  <View style={styles.backupDetails}>
                    <Text style={styles.backupDate}>{file.date}</Text>
                    <Text style={styles.backupName} numberOfLines={1}>{file.name}</Text>
                  </View>
                </View>
                
                <View style={styles.backupActions}>
                  <TouchableOpacity
                    style={styles.backupActionBtn}
                    onPress={() => handleShareBackup(file.name)}
                  >
                    <Ionicons name="share-outline" size={20} color="#4ECDC4" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.backupActionBtn}
                    onPress={() => handleRestoreFromLocalBackup(file.name)}
                  >
                    <Ionicons name="refresh" size={20} color="#FF6B35" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.backupActionBtn}
                    onPress={() => handleDeleteBackup(file.name)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={24} color="#4ECDC4" />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Encrypted Backups</Text>
              <Text style={styles.infoSubtitle}>
                All backups are encrypted with AES-256. Remember your password - it's required to restore data.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Create Backup Password Modal */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Backup Password</Text>
            <Text style={styles.modalSubtitle}>
              This password will be required to restore the backup
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password (min 4 characters)"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowPasswordModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleConfirmBackup}
              >
                <Text style={styles.confirmButtonText}>Create Backup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Restore Password Modal */}
      <Modal visible={showRestoreModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Backup Password</Text>
            <Text style={styles.modalSubtitle}>
              {selectedBackupFile 
                ? 'Enter the password used when creating this backup'
                : 'Select a backup file and enter its password'
              }
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Backup Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter backup password"
                secureTextEntry
                value={restorePassword}
                onChangeText={setRestorePassword}
              />
            </View>

            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color="#FF9800" />
              <Text style={styles.warningText}>
                This will replace ALL current data. Make sure you have a backup of current data if needed.
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowRestoreModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.restoreConfirmButton]}
                onPress={handleConfirmRestore}
              >
                <Text style={styles.confirmButtonText}>Restore</Text>
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  scrollView: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
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
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  restoreIcon: {
    backgroundColor: '#4ECDC4',
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  emptyState: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  backupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  backupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backupDetails: {
    marginLeft: 12,
    flex: 1,
  },
  backupDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  backupName: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  backupActions: {
    flexDirection: 'row',
    gap: 8,
  },
  backupActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E0F7F5',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  infoSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    lineHeight: 20,
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
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    lineHeight: 18,
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
  restoreConfirmButton: {
    backgroundColor: '#4ECDC4',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  webNotice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  webNoticeText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
});
