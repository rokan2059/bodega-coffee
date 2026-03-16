import fs from 'fs';
import path from 'path';

const menuDataPath = path.resolve(process.cwd(), 'menu-data.json');

let menuData = {
  categories: [
    {
      name: "Specialty Espresso",
      items: [
        { name: "Brewed Coffee", price: { hot: 100, cold: 120 } },
        { name: "White Chocolate Mocha", price: { cold: 180 } },
        { name: "Caramel Macchiato", price: { cold: 180 } },
        { name: "Classic Spanish Latte", price: { hot: 175, cold: 200 } },
        { name: "Seasalt Caramel Latte", price: { hot: 175, cold: 200 } },
        { name: "Hazelnut Latte", price: { hot: 175, cold: 200 } }
      ]
    },
    {
      name: "Juices & Fruit Teas",
      items: [
        { name: "Green Apple Fruit Tea", price: 150 },
        { name: "Melon Fruit Tea", price: 150 },
        { name: "Hibiscus Lemonade", price: 150 },
        { name: "Green Apple Yakult", price: 190 },
        { name: "Melon Yakult", price: 190 }
      ]
    },
    {
      name: "Coffee Roasters",
      items: [
        { name: "Filtered Coffee", price: 100 },
        { name: "Espresso / Black", price: 100 },
        { name: "White", price: 100 },
        { name: "White Brew", price: 120 },
        { name: "Cold Brew", price: 120 }
      ]
    },
    {
      name: "Smoothies & Frappes",
      items: [
        { name: "Blueberry Smoothie", price: 160 },
        { name: "Strawberry Smoothie", price: 160 },
        { name: "Java Chip Frappe", price: 200 }
      ]
    },
    {
      name: "Non-Espresso",
      items: [
        { name: "Matcha Latte", price: 180 },
        { name: "Ube Latte", price: 180 },
        { name: "Strawberry Matcha Latte", price: 200 },
        { name: "Ube Matcha Latte", price: 200 }
      ]
    },
    {
      name: "Soda Pop",
      items: [
        { name: "Strawberry Soda", price: 160 },
        { name: "Blueberry Soda", price: 160 },
        { name: "Butterfly Pea Peach Soda", price: 200 }
      ]
    },
    {
      name: "Hot Tea",
      items: [
        { name: "Pure Chamomile", price: 120 },
        { name: "English Breakfast", price: 120 },
        { name: "Green Tea", price: 120 }
      ]
    },
    {
      name: "Comfort Food",
      items: [
        { name: "Siomai Rice Bowl", price: 149 },
        { name: "Longganisa with Egg", price: 179 },
        { name: "Bistek Tagalog", price: 199 },
        { name: "Burger Steak", price: 249 },
        { name: "Chicken Torikatsu", price: 249 },
        { name: "Spam with Egg", price: 249 }
      ]
    },
    {
      name: "Quick Bites",
      items: [
        { name: "Siopao", price: 59 },
        { name: "Fries (BBQ / Sour Cream)", price: 159 },
        { name: "Chicken Nuggets", price: 179 },
        { name: "Korean Ramen with Egg", price: 199 },
        { name: "Mama's Lasagna with Bread", price: 199 }
      ]
    },
    {
      name: "Sweet Treats",
      items: [
        { name: "Chocolate Chip Cookie", price: 90 },
        { name: "Red Velvet Cookie", price: 90 },
        { name: "Biscoff Cookie", price: 90 },
        { name: "Mango Graham", price: 170 },
        { name: "Tiramisu", price: 190 },
        { name: "Basque Burnt Cheesecake", price: 190 }
      ]
    }
  ]
};

// Try to load from menu-data.json if it exists
if (fs.existsSync(menuDataPath)) {
  try {
    const fileData = JSON.parse(fs.readFileSync(menuDataPath, 'utf-8'));
    if (fileData.categories) {
      menuData = fileData;
      console.log('Using data from menu-data.json for seeding');
    }
  } catch (e) {
    console.error('Error reading menu-data.json, falling back to defaults');
  }
}

async function seed() {
  try {
    const response = await fetch('http://localhost:3000/api/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(menuData)
    });
    const result = await response.json();
    console.log('Seed result:', result);
  } catch (error) {
    console.error('Seed failed:', error);
  }
}

seed();

