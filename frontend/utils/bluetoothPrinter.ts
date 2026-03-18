import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { buildKOTPrintData } from './escpos';
import * as SecureStore from 'expo-secure-store';

const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

// Alternative UUIDs for different printer brands
const PRINTER_UUIDS = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
];

const SAVED_PRINTER_KEY = 'saved_printer_id';

class BluetoothPrinterService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private isScanning: boolean = false;

  constructor() {
    if (Platform.OS !== 'web') {
      this.manager = new BleManager();
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        
        return Object.values(granted).every(
          (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (error) {
        console.error('Permission request error:', error);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  }

  async checkBluetoothState(): Promise<boolean> {
    if (!this.manager) return false;
    
    try {
      const state = await this.manager.state();
      return state === State.PoweredOn;
    } catch (error) {
      console.error('Bluetooth state check error:', error);
      return false;
    }
  }

  async scanForPrinters(
    onDeviceFound: (device: Device) => void,
    duration: number = 10000
  ): Promise<void> {
    if (!this.manager || this.isScanning) return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Bluetooth permissions not granted');
    }

    const isBluetoothOn = await this.checkBluetoothState();
    if (!isBluetoothOn) {
      throw new Error('Bluetooth is not enabled');
    }

    this.isScanning = true;
    const foundDevices = new Set<string>();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopScan();
        resolve();
      }, duration);

      this.manager!.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.isScanning = false;
            reject(error);
            return;
          }

          if (device && device.name && !foundDevices.has(device.id)) {
            // Filter for likely printer devices
            const deviceName = device.name.toLowerCase();
            if (
              deviceName.includes('printer') ||
              deviceName.includes('pos') ||
              deviceName.includes('bt') ||
              deviceName.includes('thermal') ||
              deviceName.includes('receipt')
            ) {
              foundDevices.add(device.id);
              onDeviceFound(device);
            }
          }
        }
      );
    });
  }

  stopScan(): void {
    if (this.manager && this.isScanning) {
      this.manager.stopDeviceScan();
      this.isScanning = false;
    }
  }

  async connectToPrinter(deviceId: string): Promise<Device> {
    if (!this.manager) {
      throw new Error('Bluetooth not available');
    }

    try {
      // Disconnect from current device if connected
      if (this.connectedDevice) {
        await this.disconnect();
      }

      const device = await this.manager.connectToDevice(deviceId, {
        timeout: 10000,
      });

      await device.discoverAllServicesAndCharacteristics();
      this.connectedDevice = device;

      // Save device ID for auto-reconnect
      await SecureStore.setItemAsync(SAVED_PRINTER_KEY, deviceId);

      return device;
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (error) {
        console.log('Disconnect error (may already be disconnected):', error);
      }
      this.connectedDevice = null;
    }
  }

  async getSavedPrinterId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SAVED_PRINTER_KEY);
    } catch {
      return null;
    }
  }

  async autoConnectToSavedPrinter(): Promise<Device | null> {
    const savedId = await this.getSavedPrinterId();
    if (savedId) {
      try {
        return await this.connectToPrinter(savedId);
      } catch (error) {
        console.log('Auto-connect failed:', error);
        return null;
      }
    }
    return null;
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getConnectedDevice(): Device | null {
    return this.connectedDevice;
  }

  async printData(data: number[]): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No printer connected');
    }

    const base64Data = btoa(String.fromCharCode(...data));

    // Try different service/characteristic combinations
    for (const uuids of PRINTER_UUIDS) {
      try {
        await this.connectedDevice.writeCharacteristicWithResponseForService(
          uuids.service,
          uuids.characteristic,
          base64Data
        );
        return;
      } catch (error) {
        // Try next UUID combination
        continue;
      }
    }

    // If none worked, try discovering and using available characteristics
    const services = await this.connectedDevice.services();
    for (const service of services) {
      const characteristics = await service.characteristics();
      for (const char of characteristics) {
        if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
          try {
            if (char.isWritableWithResponse) {
              await char.writeWithResponse(base64Data);
            } else {
              await char.writeWithoutResponse(base64Data);
            }
            return;
          } catch {
            continue;
          }
        }
      }
    }

    throw new Error('Could not find writable characteristic');
  }

  async printKOT(kot: {
    tableNumber: string;
    orderId: string;
    items: Array<{
      name: string;
      quantity: number;
      notes?: string;
      addons?: string[];
    }>;
    timestamp: string;
    printedBy: string;
  }): Promise<void> {
    const printData = buildKOTPrintData(kot);
    await this.printData(printData);
  }

  async clearSavedPrinter(): Promise<void> {
    await SecureStore.deleteItemAsync(SAVED_PRINTER_KEY);
    await this.disconnect();
  }

  destroy(): void {
    this.stopScan();
    this.disconnect();
    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
    }
  }
}

export const bluetoothPrinter = new BluetoothPrinterService();
export type { Device };
