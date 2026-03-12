import { create } from 'zustand';
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

interface DBState {
  isInitialized: boolean;
  initDatabase: () => Promise<void>;
  getDatabase: () => SQLite.SQLiteDatabase | null;
}

export const useDBStore = create<DBState>((set) => ({
  isInitialized: false,
  initDatabase: async () => {
    if (db) return;

    try {
      db = await SQLite.openDatabaseAsync('restaurant_pos.db');
      
      // Create all tables
      await db.execAsync(`
        PRAGMA foreign_keys = ON;
        
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS menu_items (
          id TEXT PRIMARY KEY,
          category_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          base_price REAL NOT NULL,
          image_base64 TEXT,
          active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS item_addons (
          id TEXT PRIMARY KEY,
          item_id TEXT,
          addon_name TEXT NOT NULL,
          price REAL NOT NULL,
          FOREIGN KEY(item_id) REFERENCES menu_items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tables (
          id TEXT PRIMARY KEY,
          table_number TEXT NOT NULL UNIQUE,
          seats INTEGER DEFAULT 4,
          status TEXT DEFAULT 'available',
          current_order_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          table_id TEXT,
          created_by_user_id TEXT,
          created_by_username TEXT,
          status TEXT DEFAULT 'pending',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(table_id) REFERENCES tables(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT,
          item_id TEXT,
          item_name TEXT,
          quantity INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          addons_json TEXT,
          notes TEXT,
          FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY,
          order_id TEXT UNIQUE,
          table_number TEXT,
          subtotal REAL NOT NULL,
          cgst REAL NOT NULL,
          sgst REAL NOT NULL,
          total REAL NOT NULL,
          payment_method TEXT,
          billed_by_user_id TEXT,
          billed_by_username TEXT,
          billed_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(order_id) REFERENCES orders(id)
        );

        CREATE TABLE IF NOT EXISTS kot_prints (
          id TEXT PRIMARY KEY,
          order_id TEXT,
          table_number TEXT,
          items_json TEXT,
          printed_at TEXT DEFAULT CURRENT_TIMESTAMP,
          printed_by_username TEXT
        );
      `);

      // Insert demo data if tables are empty
      const categoriesCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM categories'
      );

      if (categoriesCount?.count === 0) {
        await insertDemoData(db);
      }

      set({ isInitialized: true });
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  },
  getDatabase: () => db,
}));

async function insertDemoData(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    INSERT INTO categories (id, name, display_order) VALUES
    ('cat1', 'Starters', 1),
    ('cat2', 'Main Course', 2),
    ('cat3', 'Beverages', 3),
    ('cat4', 'Desserts', 4);

    INSERT INTO menu_items (id, category_id, name, description, base_price, active) VALUES
    ('item1', 'cat1', 'Spring Rolls', 'Crispy vegetable spring rolls', 120.00, 1),
    ('item2', 'cat1', 'Paneer Tikka', 'Grilled cottage cheese cubes', 180.00, 1),
    ('item3', 'cat2', 'Butter Chicken', 'Creamy tomato-based chicken curry', 280.00, 1),
    ('item4', 'cat2', 'Palak Paneer', 'Cottage cheese in spinach gravy', 220.00, 1),
    ('item5', 'cat3', 'Fresh Lime Soda', 'Refreshing lime drink', 60.00, 1),
    ('item6', 'cat3', 'Mango Lassi', 'Sweet mango yogurt drink', 80.00, 1),
    ('item7', 'cat4', 'Gulab Jamun', 'Sweet milk dumplings', 90.00, 1),
    ('item8', 'cat4', 'Ice Cream', 'Vanilla ice cream', 100.00, 1);

    INSERT INTO item_addons (id, item_id, addon_name, price) VALUES
    ('addon1', 'item2', 'Extra Mint Chutney', 20.00),
    ('addon2', 'item3', 'Extra Gravy', 30.00),
    ('addon3', 'item5', 'Extra Sweet', 10.00),
    ('addon4', 'item8', 'Chocolate Sauce', 30.00);

    INSERT INTO tables (id, table_number, seats, status) VALUES
    ('table1', 'T1', 4, 'available'),
    ('table2', 'T2', 4, 'available'),
    ('table3', 'T3', 2, 'available'),
    ('table4', 'T4', 6, 'available'),
    ('table5', 'T5', 4, 'available'),
    ('table6', 'T6', 8, 'available');
  `);
}
