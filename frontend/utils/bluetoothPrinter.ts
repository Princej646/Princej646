import { Platform, PermissionsAndroid } from 'react-native';
import { buildKOTPrintData } from './escpos';
import * as SecureStore from 'expo-secure-store';

const SAVED_PRINTER_KEY = 'saved_printer_id';

// Device interface for typing
export interface PrinterDevice {
  id: string;
  name: string | null;
}

/**
 * Bluetooth Printer Service
 * 
 * NOTE: Bluetooth printing requires react-native-ble-plx package which is 
 * currently not installed to simplify the build process.
 * 
 * To enable Bluetooth printing:
 * 1. yarn add react-native-ble-plx
 * 2. Add the plugin to app.json
 * 3. Rebuild the app
 */
class BluetoothPrinterService {
  private bleAvailable: boolean = false;

  constructor() {
    // Bluetooth is not available without react-native-ble-plx
    this.bleAvailable = false;
  }

  isAvailable(): boolean {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    console.log('Bluetooth not available - react-native-ble-plx not installed');
    return false;
  }

  async startScan(onDeviceFound: (device: PrinterDevice) => void): Promise<void> {
    console.log('Bluetooth not available - react-native-ble-plx not installed');
    throw new Error('Bluetooth printing not available. Install react-native-ble-plx to enable.');
  }

  stopScan(): void {
    // No-op
  }

  async connectToDevice(deviceId: string): Promise<boolean> {
    console.log('Bluetooth not available - react-native-ble-plx not installed');
    return false;
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  async printKOT(kotData: {
    orderNumber: string;
    tableName: string;
    items: Array<{
      name: string;
      quantity: number;
      notes?: string;
    }>;
    timestamp: string;
  }): Promise<boolean> {
    console.log('Bluetooth not available - react-native-ble-plx not installed');
    return false;
  }

  async printRaw(data: Uint8Array): Promise<boolean> {
    console.log('Bluetooth not available - react-native-ble-plx not installed');
    return false;
  }

  isConnected(): boolean {
    return false;
  }

  getConnectedDevice(): PrinterDevice | null {
    return null;
  }

  async tryReconnectSavedPrinter(): Promise<boolean> {
    return false;
  }
}

export const bluetoothPrinter = new BluetoothPrinterService();
