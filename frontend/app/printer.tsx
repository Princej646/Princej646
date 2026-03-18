import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

let bluetoothPrinter: any = null;
let Device: any = null;

if (Platform.OS !== 'web') {
  const printerModule = require('../utils/bluetoothPrinter');
  bluetoothPrinter = printerModule.bluetoothPrinter;
  Device = printerModule.Device;
}

interface PrinterDevice {
  id: string;
  name: string | null;
}

export default function PrinterScreen() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' && bluetoothPrinter) {
      checkConnection();
    }
    
    return () => {
      if (bluetoothPrinter) {
        bluetoothPrinter.stopScan();
      }
    };
  }, []);

  const checkConnection = async () => {
    if (!bluetoothPrinter) return;
    
    const device = bluetoothPrinter.getConnectedDevice();
    if (device) {
      setConnectedDevice({ id: device.id, name: device.name });
    } else {
      // Try auto-connect to saved printer
      const savedDevice = await bluetoothPrinter.autoConnectToSavedPrinter();
      if (savedDevice) {
        setConnectedDevice({ id: savedDevice.id, name: savedDevice.name });
      }
    }
  };

  const handleScan = async () => {
    if (!bluetoothPrinter) {
      Alert.alert('Error', 'Bluetooth not available');
      return;
    }

    setIsScanning(true);
    setDevices([]);

    try {
      await bluetoothPrinter.scanForPrinters(
        (device: any) => {
          setDevices((prev) => {
            if (prev.some((d) => d.id === device.id)) return prev;
            return [...prev, { id: device.id, name: device.name }];
          });
        },
        15000 // 15 seconds scan
      );
    } catch (error: any) {
      Alert.alert('Scan Error', error.message || 'Failed to scan for printers');
    } finally {
      setIsScanning(false);
    }
  };

  const handleStopScan = () => {
    if (bluetoothPrinter) {
      bluetoothPrinter.stopScan();
      setIsScanning(false);
    }
  };

  const handleConnect = async (device: PrinterDevice) => {
    if (!bluetoothPrinter) return;

    setIsConnecting(true);
    try {
      await bluetoothPrinter.connectToPrinter(device.id);
      setConnectedDevice(device);
      Alert.alert('Connected', `Connected to ${device.name || 'Printer'}`);
    } catch (error: any) {
      Alert.alert('Connection Error', error.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!bluetoothPrinter) return;

    try {
      await bluetoothPrinter.clearSavedPrinter();
      setConnectedDevice(null);
      Alert.alert('Disconnected', 'Printer disconnected successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to disconnect');
    }
  };

  const handleTestPrint = async () => {
    if (!bluetoothPrinter || !connectedDevice) {
      Alert.alert('Error', 'No printer connected');
      return;
    }

    try {
      await bluetoothPrinter.printKOT({
        tableNumber: 'TEST',
        orderId: 'test_' + Date.now(),
        items: [
          { name: 'Test Item 1', quantity: 2, notes: 'Extra spicy' },
          { name: 'Test Item 2', quantity: 1, addons: ['Add-on A', 'Add-on B'] },
        ],
        timestamp: new Date().toLocaleString(),
        printedBy: 'Test User',
      });
      Alert.alert('Success', 'Test KOT printed successfully!');
    } catch (error: any) {
      Alert.alert('Print Error', error.message || 'Failed to print');
    }
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bluetooth Printer</Text>
        </View>
        <View style={styles.webNotice}>
          <Ionicons name="print" size={64} color="#E0E0E0" />
          <Text style={styles.webNoticeText}>Printer setup is only available on mobile devices</Text>
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
        <Text style={styles.headerTitle}>Bluetooth Printer</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Connected Printer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connected Printer</Text>
          
          {connectedDevice ? (
            <View style={styles.connectedCard}>
              <View style={styles.connectedInfo}>
                <View style={styles.connectedIcon}>
                  <Ionicons name="print" size={32} color="#4ECDC4" />
                </View>
                <View>
                  <Text style={styles.connectedName}>{connectedDevice.name || 'Unknown Printer'}</Text>
                  <Text style={styles.connectedStatus}>Connected</Text>
                </View>
              </View>
              
              <View style={styles.connectedActions}>
                <TouchableOpacity style={styles.testButton} onPress={handleTestPrint}>
                  <Ionicons name="document-text" size={20} color="#FFF" />
                  <Text style={styles.testButtonText}>Test Print</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                  <Text style={styles.disconnectButtonText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noConnectionCard}>
              <Ionicons name="print-outline" size={48} color="#E0E0E0" />
              <Text style={styles.noConnectionText}>No printer connected</Text>
              <Text style={styles.noConnectionSubtext}>Scan for nearby printers to connect</Text>
            </View>
          )}
        </View>

        {/* Scan Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Available Printers</Text>
            {isScanning ? (
              <TouchableOpacity style={styles.stopButton} onPress={handleStopScan}>
                <Text style={styles.stopButtonText}>Stop</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.scanButton} onPress={handleScan}>
                <Ionicons name="refresh" size={20} color="#FFF" />
                <Text style={styles.scanButtonText}>Scan</Text>
              </TouchableOpacity>
            )}
          </View>

          {isScanning && (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator size="small" color="#FF6B35" />
              <Text style={styles.scanningText}>Scanning for printers...</Text>
            </View>
          )}

          {devices.length === 0 && !isScanning ? (
            <View style={styles.emptyDevices}>
              <Text style={styles.emptyDevicesText}>
                No printers found. Make sure your printer is turned on and in pairing mode.
              </Text>
            </View>
          ) : (
            devices.map((device) => (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceCard}
                onPress={() => handleConnect(device)}
                disabled={isConnecting || connectedDevice?.id === device.id}
              >
                <View style={styles.deviceInfo}>
                  <Ionicons
                    name={connectedDevice?.id === device.id ? 'checkmark-circle' : 'bluetooth'}
                    size={24}
                    color={connectedDevice?.id === device.id ? '#4ECDC4' : '#666'}
                  />
                  <View>
                    <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                    <Text style={styles.deviceId}>{device.id.substring(0, 17)}...</Text>
                  </View>
                </View>
                
                {isConnecting ? (
                  <ActivityIndicator size="small" color="#FF6B35" />
                ) : connectedDevice?.id === device.id ? (
                  <Text style={styles.connectedLabel}>Connected</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={24} color="#999" />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Instructions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Setup Instructions</Text>
          <View style={styles.instructionCard}>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>1</Text>
              <Text style={styles.instructionText}>Turn on your 80mm thermal printer</Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>2</Text>
              <Text style={styles.instructionText}>Enable Bluetooth on your printer (usually by holding power button)</Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>3</Text>
              <Text style={styles.instructionText}>Tap "Scan" to find available printers</Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>4</Text>
              <Text style={styles.instructionText}>Select your printer from the list to connect</Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>5</Text>
              <Text style={styles.instructionText}>Use "Test Print" to verify the connection</Text>
            </View>
          </View>
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
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  connectedCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  connectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  connectedIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E0F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  connectedStatus: {
    fontSize: 14,
    color: '#4ECDC4',
    marginTop: 4,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: 12,
  },
  testButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  testButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  disconnectButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disconnectButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  noConnectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  noConnectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  noConnectionSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  scanButton: {
    flexDirection: 'row',
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 8,
  },
  scanButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#999',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stopButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFF5F0',
    borderRadius: 8,
    marginBottom: 12,
  },
  scanningText: {
    color: '#FF6B35',
    fontWeight: '500',
  },
  emptyDevices: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
  },
  emptyDevicesText: {
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  deviceCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  deviceId: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  connectedLabel: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  instructionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B35',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: 'bold',
    fontSize: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
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
