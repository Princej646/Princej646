import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

const BACKUP_VERSION = '1.0';
const ENCRYPTION_ALGORITHM = 'AES-256-GCM';

interface BackupData {
  version: string;
  timestamp: string;
  data: {
    categories: any[];
    menuItems: any[];
    addons: any[];
    tables: any[];
    orders: any[];
    orderItems: any[];
    bills: any[];
    kotPrints: any[];
  };
}

interface EncryptedBackup {
  version: string;
  encrypted: boolean;
  iv: string;
  data: string;
  hash: string;
}

// Derive encryption key from password
async function deriveKey(password: string, salt: string): Promise<string> {
  // Use SHA-256 to derive a key from password + salt
  const combined = password + salt;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
  return hash;
}

// Simple XOR encryption (for compatibility - expo-crypto has limited encryption support)
function xorEncrypt(data: string, key: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(
      data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

// Convert string to base64
function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

// Convert base64 to string
function fromBase64(base64: string): string {
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return atob(base64);
  }
}

export async function createBackup(
  db: any,
  password: string
): Promise<{ filePath: string; fileName: string }> {
  if (Platform.OS === 'web') {
    throw new Error('Backup is not available on web');
  }

  try {
    // Collect all data from database
    const categories = await db.getAllAsync('SELECT * FROM categories');
    const menuItems = await db.getAllAsync('SELECT * FROM menu_items');
    const addons = await db.getAllAsync('SELECT * FROM item_addons');
    const tables = await db.getAllAsync('SELECT * FROM tables');
    const orders = await db.getAllAsync('SELECT * FROM orders');
    const orderItems = await db.getAllAsync('SELECT * FROM order_items');
    const bills = await db.getAllAsync('SELECT * FROM bills');
    const kotPrints = await db.getAllAsync('SELECT * FROM kot_prints');

    const backupData: BackupData = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      data: {
        categories,
        menuItems,
        addons,
        tables,
        orders,
        orderItems,
        bills,
        kotPrints,
      },
    };

    // Convert to JSON string
    const jsonData = JSON.stringify(backupData);

    // Generate salt and IV
    const salt = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      Date.now().toString() + Math.random().toString()
    );
    const iv = salt.substring(0, 32);

    // Derive encryption key
    const key = await deriveKey(password, salt);

    // Encrypt data
    const encryptedData = xorEncrypt(jsonData, key);
    const base64Data = toBase64(encryptedData);

    // Create hash for integrity check
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      jsonData
    );

    const encryptedBackup: EncryptedBackup = {
      version: BACKUP_VERSION,
      encrypted: true,
      iv: iv,
      data: base64Data,
      hash: hash,
    };

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `pos_backup_${timestamp}.json`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;

    // Write to file
    await FileSystem.writeAsStringAsync(
      filePath,
      JSON.stringify(encryptedBackup),
      { encoding: FileSystem.EncodingType.UTF8 }
    );

    return { filePath, fileName };
  } catch (error) {
    console.error('Backup creation error:', error);
    throw error;
  }
}

export async function restoreBackup(
  db: any,
  password: string,
  fileUri?: string
): Promise<{ success: boolean; message: string }> {
  if (Platform.OS === 'web') {
    throw new Error('Restore is not available on web');
  }

  try {
    let backupContent: string;

    if (fileUri) {
      // Read from provided file URI
      backupContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } else {
      // Pick file using document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return { success: false, message: 'No file selected' };
      }

      backupContent = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    // Parse encrypted backup
    const encryptedBackup: EncryptedBackup = JSON.parse(backupContent);

    if (!encryptedBackup.encrypted) {
      throw new Error('Invalid backup file format');
    }

    // Derive key from password
    const key = await deriveKey(password, encryptedBackup.iv + encryptedBackup.iv);

    // Decrypt data
    const encryptedData = fromBase64(encryptedBackup.data);
    const decryptedData = xorEncrypt(encryptedData, key);

    // Parse decrypted JSON
    let backupData: BackupData;
    try {
      backupData = JSON.parse(decryptedData);
    } catch {
      return { success: false, message: 'Invalid password or corrupted backup' };
    }

    // Verify hash
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      decryptedData
    );

    if (hash !== encryptedBackup.hash) {
      return { success: false, message: 'Invalid password or corrupted backup' };
    }

    // Clear existing data and restore
    await db.execAsync(`
      DELETE FROM kot_prints;
      DELETE FROM bills;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM tables;
      DELETE FROM item_addons;
      DELETE FROM menu_items;
      DELETE FROM categories;
    `);

    // Restore categories
    for (const cat of backupData.data.categories) {
      await db.runAsync(
        'INSERT INTO categories (id, name, display_order, active, created_at) VALUES (?, ?, ?, ?, ?)',
        [cat.id, cat.name, cat.display_order, cat.active, cat.created_at]
      );
    }

    // Restore menu items
    for (const item of backupData.data.menuItems) {
      await db.runAsync(
        'INSERT INTO menu_items (id, category_id, name, description, base_price, image_base64, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.category_id, item.name, item.description, item.base_price, item.image_base64, item.active, item.created_at]
      );
    }

    // Restore addons
    for (const addon of backupData.data.addons) {
      await db.runAsync(
        'INSERT INTO item_addons (id, item_id, addon_name, price) VALUES (?, ?, ?, ?)',
        [addon.id, addon.item_id, addon.addon_name, addon.price]
      );
    }

    // Restore tables
    for (const table of backupData.data.tables) {
      await db.runAsync(
        'INSERT INTO tables (id, table_number, seats, status, current_order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [table.id, table.table_number, table.seats, 'available', null, table.created_at]
      );
    }

    // Restore orders
    for (const order of backupData.data.orders) {
      await db.runAsync(
        'INSERT INTO orders (id, table_id, created_by_user_id, created_by_username, status, bill_printed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [order.id, order.table_id, order.created_by_user_id, order.created_by_username, order.status, order.bill_printed || 0, order.created_at, order.updated_at]
      );
    }

    // Restore order items
    for (const item of backupData.data.orderItems) {
      await db.runAsync(
        'INSERT INTO order_items (id, order_id, item_id, item_name, quantity, unit_price, addons_json, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, item.order_id, item.item_id, item.item_name, item.quantity, item.unit_price, item.addons_json, item.notes]
      );
    }

    // Restore bills
    for (const bill of backupData.data.bills) {
      await db.runAsync(
        'INSERT INTO bills (id, order_id, order_ids_json, table_number, subtotal, cgst, sgst, total, payment_method, billed_by_user_id, billed_by_username, billed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [bill.id, bill.order_id, bill.order_ids_json, bill.table_number, bill.subtotal, bill.cgst, bill.sgst, bill.total, bill.payment_method, bill.billed_by_user_id, bill.billed_by_username, bill.billed_at]
      );
    }

    // Restore KOT prints
    for (const kot of backupData.data.kotPrints) {
      await db.runAsync(
        'INSERT INTO kot_prints (id, order_id, table_number, items_json, printed_at, printed_by_username) VALUES (?, ?, ?, ?, ?, ?)',
        [kot.id, kot.order_id, kot.table_number, kot.items_json, kot.printed_at, kot.printed_by_username]
      );
    }

    return { 
      success: true, 
      message: `Backup restored successfully! Restored ${backupData.data.orders.length} orders, ${backupData.data.bills.length} bills.` 
    };
  } catch (error: any) {
    console.error('Restore error:', error);
    return { success: false, message: error.message || 'Failed to restore backup' };
  }
}

export async function shareBackup(filePath: string): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Sharing is not available on web');
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(filePath, {
    mimeType: 'application/json',
    dialogTitle: 'Share POS Backup',
  });
}

export async function listBackupFiles(): Promise<string[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  try {
    const files = await FileSystem.readDirectoryAsync(
      FileSystem.documentDirectory!
    );
    return files.filter((f) => f.startsWith('pos_backup_') && f.endsWith('.json'));
  } catch {
    return [];
  }
}

export async function deleteBackupFile(fileName: string): Promise<void> {
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.deleteAsync(filePath, { idempotent: true });
}
