export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  price_hot: number | null;
  price_cold: number | null;
  price_fixed: number | null;
  description: string;
  available: boolean;
  image?: string;
  addons?: string; // JSON string of { name: string, price: number, available?: boolean }[]
}

export interface OrderItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
  type: 'hot' | 'cold' | 'fixed';
  selected_addons?: { name: string, price: number }[];
}

export interface Order {
  id: string;
  user_email: string;
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
  is_paid: boolean;
  payment_method?: string;
  created_at: any; // Firestore Timestamp
  items: OrderItem[];
}

export interface Category {
  id: string;
  name: string;
  image?: string;
  items: MenuItem[];
}
