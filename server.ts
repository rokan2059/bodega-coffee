import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Redirect console logs to server.log for debugging
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const logToFile = (level: string, ...args: any[]) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  const logLine = `[${level}] ${new Date().toISOString()} | ${message}\n`;
  try {
    fs.appendFileSync(path.resolve(process.cwd(), "server.log"), logLine);
  } catch (e) {}
};

console.log = (...args) => { originalLog(...args); logToFile('LOG', ...args); };
console.error = (...args) => { originalError(...args); logToFile('ERROR', ...args); };
console.warn = (...args) => { originalWarn(...args); logToFile('WARN', ...args); };

console.log("[SERVER] Module loading...");
console.log("[SERVER] __dirname:", __dirname);
console.log("[SERVER] process.cwd():", process.cwd());

const dbPath = path.resolve(process.cwd(), "menu.db");
const menuDataPath = path.resolve(process.cwd(), "menu-data.json");
console.log(`Initializing database at: ${dbPath}`);
let db: any;
try {
  db = new Database(dbPath);
  console.log("Database initialized successfully");
} catch (err) {
  console.error("FAILED TO INITIALIZE DATABASE:", err);
  // Fallback to in-memory if file fails (though this shouldn't happen in this env)
  db = new Database(":memory:");
}

// Helper to sync database to JSON file for "code permanence"
const syncMenuToFile = () => {
  try {
    const categories = db.prepare("SELECT * FROM categories").all();
    const menu = categories.map((cat: any) => {
      const items = db.prepare("SELECT * FROM items WHERE category_id = ?").all(cat.id);
      return { ...cat, items };
    });
    fs.writeFileSync(menuDataPath, JSON.stringify({ categories: menu }, null, 2));
    console.log("[SERVER] Menu synced to menu-data.json");
  } catch (err) {
    console.error("[SERVER] Error syncing menu to file:", err);
  }
};

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price_hot INTEGER,
    price_cold INTEGER,
    price_fixed INTEGER,
    description TEXT,
    available INTEGER DEFAULT 1,
    image TEXT,
    addons TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    is_paid INTEGER DEFAULT 0,
    payment_method TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    menu_item_id INTEGER,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    type TEXT NOT NULL,
    selected_addons TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );
`);

// Migration: Add image column if it doesn't exist (for existing databases)
try {
  db.exec("ALTER TABLE items ADD COLUMN image TEXT");
} catch (e) {}

// Migration: Add addons column if it doesn't exist
try {
  db.exec("ALTER TABLE items ADD COLUMN addons TEXT");
} catch (e) {}

// Migration: Add selected_addons column if it doesn't exist
try {
  db.exec("ALTER TABLE order_items ADD COLUMN selected_addons TEXT");
} catch (e) {}

// Migration: Add payment_method column if it doesn't exist
try {
  db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT");
} catch (e) {}

// Migration: Populate default addons for items that have none
try {
  const beverageAddons = JSON.stringify([
    { name: "Hazelnut", price: 30, available: true },
    { name: "Vanilla", price: 30, available: true },
    { name: "White chocolate", price: 30, available: true },
    { name: "Espresso Shot", price: 80, available: true }
  ]);
  const foodAddons = JSON.stringify([
    { name: "Rice", price: 30, available: true }
  ]);

  // Update items in categories that are NOT QUICK BITES or COMFORT FOOD
  db.prepare(`
    UPDATE items SET addons = ? 
    WHERE category_id NOT IN (SELECT id FROM categories WHERE name IN ('QUICK BITES', 'COMFORT FOOD'))
  `).run(beverageAddons);

  // Update QUICK BITES and COMFORT FOOD items
  db.prepare(`
    UPDATE items SET addons = ? 
    WHERE category_id IN (SELECT id FROM categories WHERE name IN ('QUICK BITES', 'COMFORT FOOD'))
  `).run(foodAddons);

  // Remove addons for SWEET TREATS
  db.prepare(`
    UPDATE items SET addons = NULL 
    WHERE category_id IN (SELECT id FROM categories WHERE name = 'SWEET TREATS')
  `).run();
} catch (e) {
  console.error("Migration error (addons):", e);
}

// Seed initial data if empty
const categoryCount = db.prepare("SELECT COUNT(*) as count FROM categories").get() as { count: number };
if (categoryCount.count === 0) {
  let seedData: any;
  
  if (fs.existsSync(menuDataPath)) {
    console.log("[SERVER] Loading seed data from menu-data.json");
    try {
      const fileData = JSON.parse(fs.readFileSync(menuDataPath, 'utf-8'));
      seedData = fileData.categories;
    } catch (e) {
      console.error("[SERVER] Error reading menu-data.json:", e);
    }
  }

  if (!seedData) {
    console.log("[SERVER] Using hardcoded seed data");
    const beverageAddons = JSON.stringify([
      { name: "Hazelnut", price: 30, available: true },
      { name: "Vanilla", price: 30, available: true },
      { name: "White chocolate", price: 30, available: true },
      { name: "Espresso Shot", price: 80, available: true }
    ]);
    const foodAddons = JSON.stringify([
      { name: "Rice", price: 30, available: true }
    ]);

    seedData = [
      {
        name: "SPECIALTY ESPRESSO BEVERAGES",
        items: [
          { name: "Brewed Coffee", price_hot: 100, price_cold: 120, image: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&auto=format&fit=crop" },
          { name: "White Chocolate Mocha", price_cold: 180, image: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&auto=format&fit=crop" },
          { name: "Caramel Macchiato", price_cold: 180, image: "https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=800&auto=format&fit=crop" },
          { name: "Classic Spanish Latte", price_hot: 175, price_cold: 200, image: "https://images.unsplash.com/photo-1551030173-122adba81f3a?w=800&auto=format&fit=crop" },
          { name: "Seasalt Caramel Latte", price_hot: 175, price_cold: 200, image: "https://images.unsplash.com/photo-1594133282413-62006396771f?w=800&auto=format&fit=crop" },
          { name: "Hazelnut Latte", price_hot: 175, price_cold: 200, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "BODEGA X LINEAR COFFEE ROASTERS",
        items: [
          { name: "Filtered Coffee", price_fixed: 100, image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&auto=format&fit=crop" },
          { name: "Espresso / Black", price_fixed: 100, image: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=800&auto=format&fit=crop" },
          { name: "White", price_fixed: 100, image: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=800&auto=format&fit=crop" },
          { name: "White Brew", price_fixed: 120, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&auto=format&fit=crop" },
          { name: "Cold Brew", price_fixed: 120, image: "https://images.unsplash.com/photo-1517701553060-0a3405d58280?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "NON-ESPRESSO BEVERAGES",
        items: [
          { name: "Matcha Latte", price_fixed: 180, image: "https://images.unsplash.com/photo-1515823662273-ad9525e58846?w=800&auto=format&fit=crop" },
          { name: "Ube Latte", price_fixed: 180, image: "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=800&auto=format&fit=crop" },
          { name: "Strawberry Matcha Latte", price_fixed: 200, image: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=800&auto=format&fit=crop" },
          { name: "Ube Matcha Latte", price_fixed: 200, image: "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "HOT TEA",
        items: [
          { name: "Pure Chamomile", price_fixed: 120, image: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=800&auto=format&fit=crop" },
          { name: "English Breakfast", price_fixed: 120, image: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=800&auto=format&fit=crop" },
          { name: "Green Tea", price_fixed: 120, image: "https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "COMFORT FOOD",
        items: [
          { name: "Siomai Rice Bowl", price_fixed: 149, image: "https://images.unsplash.com/photo-1563379091339-03b21bc4a4f8?w=800&auto=format&fit=crop" },
          { name: "Longganisa with Egg", price_fixed: 179, image: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=800&auto=format&fit=crop" },
          { name: "Bistek Tagalog", price_fixed: 199, image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop" },
          { name: "Burger Steak", price_fixed: 249, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&auto=format&fit=crop" },
          { name: "Chicken Torikatsu", price_fixed: 249, image: "https://images.unsplash.com/photo-1562607378-27b956467629?w=800&auto=format&fit=crop" },
          { name: "Spam with Egg", price_fixed: 249, image: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "SWEET TREATS",
        items: [
          { name: "Chocolate Chip Cookie", price_fixed: 90, image: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=800&auto=format&fit=crop" },
          { name: "Red Velvet Cookie", price_fixed: 90, image: "https://images.unsplash.com/photo-1616733148914-29d97a5da3c1?w=800&auto=format&fit=crop" },
          { name: "Biscoff Cookie", price_fixed: 90, image: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=800&auto=format&fit=crop" },
          { name: "Mango Graham", price_fixed: 170, image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800&auto=format&fit=crop" },
          { name: "Tiramisu", price_fixed: 190, image: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&auto=format&fit=crop" },
          { name: "Basque Burnt Cheesecake", price_fixed: 190, image: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "JUICES & FRUIT TEAS",
        items: [
          { name: "Green Apple Fruit Tea", price_fixed: 150, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" },
          { name: "Melon Fruit Tea", price_fixed: 150, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" },
          { name: "Hibiscus Lemonade", price_fixed: 150, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" },
          { name: "Green Apple Yakult", price_fixed: 190, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" },
          { name: "Melon Yakult", price_fixed: 190, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "SMOOTHIES & FRAPPES",
        items: [
          { name: "Blueberry Smoothie", price_fixed: 160, image: "https://images.unsplash.com/photo-1553530209-92264097c64b?w=800&auto=format&fit=crop" },
          { name: "Strawberry Smoothie", price_fixed: 160, image: "https://images.unsplash.com/photo-1553530209-92264097c64b?w=800&auto=format&fit=crop" },
          { name: "Java Chip Frappe", price_fixed: 200, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "SODA POP",
        items: [
          { name: "Strawberry Soda", price_fixed: 160, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" },
          { name: "Blueberry Soda", price_fixed: 160, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" },
          { name: "Butterfly Pea Peach Soda", price_fixed: 200, image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=800&auto=format&fit=crop" }
        ]
      },
      {
        name: "QUICK BITES",
        items: [
          { name: "Siopao", price_fixed: 59, image: "https://images.unsplash.com/photo-1563379091339-03b21bc4a4f8?w=800&auto=format&fit=crop" },
          { name: "Fries (BBQ / Sour Cream)", price_fixed: 159, image: "https://images.unsplash.com/photo-1573016608294-d447906a3a29?w=800&auto=format&fit=crop" },
          { name: "Chicken Nuggets", price_fixed: 179, image: "https://images.unsplash.com/photo-1562607378-27b956467629?w=800&auto=format&fit=crop" },
          { name: "Korean Ramen with Egg", price_fixed: 199, image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop" },
          { name: "Mama's Lasagna with Bread", price_fixed: 199, image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&auto=format&fit=crop" }
        ]
      }
    ];
  }

  const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const insertItem = db.prepare(`
    INSERT INTO items (category_id, name, price_hot, price_cold, price_fixed, image, addons)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    const beverageAddons = JSON.stringify([
      { name: "Hazelnut", price: 30, available: true },
      { name: "Vanilla", price: 30, available: true },
      { name: "White chocolate", price: 30, available: true },
      { name: "Espresso Shot", price: 80, available: true }
    ]);
    const foodAddons = JSON.stringify([
      { name: "Rice", price: 30, available: true }
    ]);

    for (const cat of seedData) {
      const catInfo = insertCategory.run(cat.name);
      for (const item of cat.items) {
        const i = item as any;
        // Use foodAddons for QUICK BITES and COMFORT FOOD, beverageAddons for others, null for SWEET TREATS
        let itemAddons = i.addons || ((cat.name === "QUICK BITES" || cat.name === "COMFORT FOOD") ? foodAddons : beverageAddons);
        if (cat.name === "SWEET TREATS") {
          itemAddons = null;
        }
        
        insertItem.run(
          catInfo.lastInsertRowid,
          i.name,
          i.price_hot || null,
          i.price_cold || null,
          i.price_fixed || null,
          i.image || null,
          itemAddons
        );
      }
    }
  })();
  
  // Sync to file after seeding
  syncMenuToFile();
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Helper to notify all clients of updates
  const notifyUpdate = (type: string, data?: any) => {
    console.log(`[SOCKET] Notifying update: ${type}`);
    io.emit(type, data);
  };

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);
  });

  console.log(`--- Server Starting ---`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`isProd: ${isProd}`);
  console.log(`Port: ${PORT}`);
  console.log(`Working Directory: ${process.cwd()}`);
  console.log(`-----------------------`);

  // Global Request Logger - MUST BE FIRST
  app.use((req, res, next) => {
    const logLine = `[GLOBAL LOG] ${new Date().toISOString()} | ${req.method} ${req.url} | Origin: ${req.headers.origin}\n`;
    console.log(logLine.trim());
    try {
      fs.appendFileSync(path.resolve(process.cwd(), "server.log"), logLine);
    } catch (e) {}
    next();
  });

  // API Cache Control and Content Type
  app.use("/api", (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('json'); // Ensure all /api responses are JSON
    next();
  });

  // API Routes - GET routes first (no body parsing needed)
  app.get("/api/health", (req, res) => {
    console.log(`[API] Health check: ${req.method} ${req.url}`);
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  const getMenu = (req: any, res: any) => {
    console.log(`[API] HIT: getMenu | Method: ${req.method} | URL: ${req.url}`);
    try {
      const categories = db.prepare("SELECT * FROM categories").all();
      const menu = categories.map((cat: any) => {
        const items = db.prepare("SELECT * FROM items WHERE category_id = ?").all(cat.id);
        return { ...cat, items };
      });
      console.log(`[API] /menu returning ${menu.length} categories`);
      res.json(menu);
    } catch (err) {
      console.error("[API] Error /menu:", err);
      res.status(500).json({ error: "Internal server error", details: err instanceof Error ? err.message : String(err) });
    }
  };

  app.get("/api/menu", getMenu);
  app.get("/api/menu/", getMenu);

  app.get("/api/orders", (req, res) => {
    const { email, customerId } = req.query;
    const identifier = customerId || email;
    console.log(`[API] Get orders for: ${identifier}`);
    
    if (!identifier) return res.status(400).json({ error: "Identifier required" });

    try {
      const orders = db.prepare("SELECT * FROM orders WHERE user_email = ? ORDER BY created_at DESC").all(identifier);
      const ordersWithItems = orders.map((order: any) => {
        const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
        const itemsWithAddons = items.map((item: any) => ({
          ...item,
          selected_addons: item.selected_addons ? JSON.parse(item.selected_addons) : []
        }));
        return { ...order, items: itemsWithAddons };
      });
      res.json(ordersWithItems);
    } catch (err) {
      console.error("[API] Error fetching orders:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/orders", (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    const ordersWithItems = orders.map((order: any) => {
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
      const itemsWithAddons = items.map((item: any) => ({
        ...item,
        selected_addons: item.selected_addons ? JSON.parse(item.selected_addons) : []
      }));
      return { ...order, items: itemsWithAddons };
    });
    res.json(ordersWithItems);
  });

  // Body Parsing Middleware - ONLY AFTER GET ROUTES
  app.use(express.json({ limit: '10mb' }));

  app.post("/api/categories", (req, res) => {
    const { name } = req.body;
    console.log(`[API] Create category: ${name}`);
    try {
      const info = db.prepare("INSERT INTO categories (name) VALUES (?)").run(name);
      notifyUpdate("menu_updated");
      syncMenuToFile();
      res.json({ id: info.lastInsertRowid, name });
    } catch (e) {
      console.error("[API] Error creating category:", e);
      res.status(400).json({ error: "Category already exists or invalid data" });
    }
  });

  app.post("/api/items", (req, res) => {
    const { category_id, name, price_hot, price_cold, price_fixed, description, image } = req.body;
    let { addons } = req.body;

    // Default addons if not provided
    if (!addons) {
      const category = db.prepare("SELECT name FROM categories WHERE id = ?").get(category_id);
      if (category) {
        if (category.name === "QUICK BITES" || category.name === "COMFORT FOOD") {
          addons = JSON.stringify([{ name: "Rice", price: 30, available: true }]);
        } else if (category.name === "SWEET TREATS") {
          addons = null;
        } else {
          addons = JSON.stringify([
            { name: "Hazelnut", price: 30, available: true },
            { name: "Vanilla", price: 30, available: true },
            { name: "White chocolate", price: 30, available: true },
            { name: "Espresso Shot", price: 80, available: true }
          ]);
        }
      }
    }

    const info = db.prepare(`
      INSERT INTO items (category_id, name, price_hot, price_cold, price_fixed, description, image, addons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(category_id, name, price_hot, price_cold, price_fixed, description, image, addons);
    notifyUpdate("menu_updated");
    syncMenuToFile();
    res.json({ id: info.lastInsertRowid, ...req.body, addons });
  });

  app.put("/api/items/:id", (req, res) => {
    const { id } = req.params;
    const { name, price_hot, price_cold, price_fixed, description, available, image, addons } = req.body;
    db.prepare(`
      UPDATE items 
      SET name = ?, price_hot = ?, price_cold = ?, price_fixed = ?, description = ?, available = ?, image = ?, addons = ?
      WHERE id = ?
    `).run(name, price_hot, price_cold, price_fixed, description, available, image, addons, id);
    notifyUpdate("menu_updated");
    syncMenuToFile();
    res.json({ success: true });
  });

  app.delete("/api/items/:id", (req, res) => {
    db.prepare("DELETE FROM items WHERE id = ?").run(req.params.id);
    notifyUpdate("menu_updated");
    syncMenuToFile();
    res.json({ success: true });
  });

  // Order Routes
  app.post("/api/orders", (req, res) => {
    const { user_email, total, items, payment_method } = req.body;
    
    const insertOrder = db.prepare("INSERT INTO orders (user_email, total, payment_method) VALUES (?, ?, ?)");
    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, name, price, quantity, type, selected_addons)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((orderData) => {
      const info = insertOrder.run(orderData.user_email, orderData.total, orderData.payment_method);
      const orderId = info.lastInsertRowid;
      for (const item of orderData.items) {
        const selectedAddonsJson = item.selectedAddons ? JSON.stringify(item.selectedAddons) : null;
        insertOrderItem.run(orderId, item.id, item.name, item.price, item.quantity, item.type, selectedAddonsJson);
      }
      return orderId;
    });

    const orderId = transaction({ user_email, total, items, payment_method });
    notifyUpdate("order_created", { id: orderId, user_email });
    res.json({ id: orderId, success: true });
  });

  app.put("/api/orders/:id/pay", (req, res) => {
    db.prepare("UPDATE orders SET is_paid = 1, status = 'completed' WHERE id = ?").run(req.params.id);
    notifyUpdate("order_updated", { id: req.params.id, status: 'completed', is_paid: 1 });
    res.json({ success: true });
  });

  app.put("/api/admin/orders/:id", (req, res) => {
    const { id } = req.params;
    const { status, is_paid } = req.body;
    db.prepare("UPDATE orders SET status = ?, is_paid = ? WHERE id = ?").run(status, is_paid, id);
    notifyUpdate("order_updated", { id, status, is_paid });
    res.json({ success: true });
  });

  app.post("/api/seed", (req, res) => {
    const { categories } = req.body;
    
    const deleteItems = db.prepare("DELETE FROM items");
    const deleteCats = db.prepare("DELETE FROM categories");
    
    const insertCat = db.prepare("INSERT INTO categories (name) VALUES (?)");
    const insertItem = db.prepare(`
      INSERT INTO items (category_id, name, price_hot, price_cold, price_fixed, description, addons)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((data) => {
      deleteItems.run();
      deleteCats.run();
      
      const beverageAddons = JSON.stringify([
        { name: "Hazelnut", price: 30, available: true },
        { name: "Vanilla", price: 30, available: true },
        { name: "White chocolate", price: 30, available: true },
        { name: "Espresso Shot", price: 80, available: true }
      ]);
      const foodAddons = JSON.stringify([
        { name: "Rice", price: 30, available: true }
      ]);

      for (const cat of data) {
        const catInfo = insertCat.run(cat.name);
        const catId = catInfo.lastInsertRowid;
        for (const item of cat.items) {
          const hot = item.prices?.hot || (typeof item.price === 'object' ? item.price.hot : null);
          const cold = item.prices?.cold || (typeof item.price === 'object' ? item.price.cold : null);
          const fixed = typeof item.price === 'number' ? item.price : null;
          
          let itemAddons = (cat.name === "QUICK BITES" || cat.name === "COMFORT FOOD") ? foodAddons : beverageAddons;
          if (cat.name === "SWEET TREATS") {
            itemAddons = null;
          }

          insertItem.run(catId, item.name, hot, cold, fixed, item.description || "", itemAddons);
        }
      }
    });

    transaction(categories);
    notifyUpdate("menu_updated");
    syncMenuToFile();
    res.json({ success: true });
  });

  // Catch-all for API routes to prevent falling through to Vite/SPA fallback
  app.all("/api/*", (req, res) => {
    console.log(`API 404: ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: "API route not found", 
      method: req.method, 
      url: req.url 
    });
  });

  // Vite middleware for development
  if (!isProd) {
    console.log("Using Vite middleware for development...");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: {
          // AI Studio specific: watch is often restricted
          usePolling: true,
          interval: 100
        }
      },
      appType: "spa",
    });
    
    // Log requests that reach Vite
    app.use((req, res, next) => {
      if (req.url.startsWith('/api')) {
        console.warn(`[WARN] API request reached Vite middleware: ${req.method} ${req.url}`);
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    console.log(`Serving static files from: ${distPath}`);
    
    if (!fs.existsSync(distPath)) {
      console.error("CRITICAL: 'dist' folder not found! Did you run 'npm run build'?");
    }

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      console.log(`[SPA FALLBACK] ${req.method} ${req.url}`);
      const indexPath = path.resolve(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("index.html not found in dist folder. Please check your build.");
      }
    });
  }

  console.log("Vite middleware and API routes configured. Starting listener...");
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

console.log("[SERVER] Initializing startServer()...");
startServer().catch(err => {
  console.error("[SERVER] FATAL ERROR DURING STARTUP:", err);
  process.exit(1);
});
