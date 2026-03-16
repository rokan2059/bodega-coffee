import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Category, MenuItem, Order } from '../types';
import { Coffee, Info, ChevronRight, ShoppingBag, X, Plus, Minus, Trash2, History, CreditCard, RefreshCw, ClipboardList, Clock, Edit3, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl border-2 border-red-500 max-w-md w-full text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-6">The application encountered an error. Please try refreshing the page.</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-black text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-gray-800 transition-all"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CartItem extends MenuItem {
  quantity: number;
  selectedType: 'hot' | 'cold' | 'fixed';
  selectedPrice: number;
  selectedAddons: { name: string, price: number, quantity: number }[];
}

export default function CustomerMenu() {
  return (
    <ErrorBoundary>
      <CustomerMenuContent />
    </ErrorBoundary>
  );
}

function CustomerMenuContent() {
  const [menu, setMenu] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [logoClicks, setLogoClicks] = useState(0);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState(false);
  
  // Cart & Order State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showOrderTracker, setShowOrderTracker] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'GCash' | 'Card' | 'Counter'>('Counter');
  const [pendingItem, setPendingItem] = useState<{ 
    item: MenuItem, 
    type: 'hot' | 'cold' | 'fixed', 
    price: number,
    selectedAddons: { name: string, price: number, quantity: number }[]
  } | null>(null);
  
  const [customerId] = useState(() => {
    const saved = localStorage.getItem('cafe_customer_id');
    if (saved) return saved;
    const newId = `CUST-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    localStorage.setItem('cafe_customer_id', newId);
    return newId;
  });

  const navigate = useNavigate();

  useEffect(() => {
    let itemsUnsub: (() => void) | undefined;

    // Real-time categories and items
    const categoriesUnsub = onSnapshot(collection(db, 'categories'), (catSnap) => {
      const categoriesData = catSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), items: [] } as Category));
      
      if (itemsUnsub) {
        itemsUnsub();
      }

      itemsUnsub = onSnapshot(collection(db, 'items'), (itemSnap) => {
        const itemsData = itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
        
        const fullMenu = categoriesData.map(cat => ({
          ...cat,
          items: itemsData.filter(item => item.category_id === cat.id)
        }));
        
        setMenu(fullMenu);
        setLoading(false);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'items'));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'categories'));

    // Real-time orders for this customer
    const ordersQuery = query(
      collection(db, 'orders'), 
      where('user_email', '==', customerId),
      orderBy('created_at', 'desc')
    );
    const ordersUnsub = onSnapshot(ordersQuery, (snap) => {
      const ordersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    return () => {
      categoriesUnsub();
      if (itemsUnsub) itemsUnsub();
      ordersUnsub();
    };
  }, [customerId]);

  const addToCart = (item: MenuItem, type: 'hot' | 'cold' | 'fixed', price: number) => {
    setCart(prev => {
      // We check for same item, same type, AND same addons (empty for new items) to group them
      const existing = prev.find(i => 
        i.id === item.id && 
        i.selectedType === type && 
        i.selectedAddons.length === 0
      );
      if (existing) {
        return prev.map(i => 
          i.id === item.id && 
          i.selectedType === type && 
          i.selectedAddons.length === 0
            ? { ...i, quantity: i.quantity + 1 } 
            : i
        );
      }
      return [...prev, { ...item, quantity: 1, selectedType: type, selectedPrice: price, selectedAddons: [] }];
    });
    // Show cart automatically so they can add add-ons
    setShowCart(true);
  };

  const updateCartQuantity = (id: string, type: string, addons: any[], delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id && i.selectedType === type && JSON.stringify(i.selectedAddons) === JSON.stringify(addons)) {
        const newQty = Math.max(0, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const cartTotal = cart.reduce((sum, item) => {
    const addonsTotal = item.selectedAddons.reduce((s, a) => s + (a.price * a.quantity), 0);
    return sum + (item.selectedPrice * item.quantity) + addonsTotal;
  }, 0);

  const finalizeOrder = async () => {
    if (cart.length === 0) return;
    setIsSubmittingOrder(true);
    try {
      await addDoc(collection(db, 'orders'), {
        user_email: customerId,
        total: cartTotal,
        payment_method: paymentMethod,
        status: 'pending',
        is_paid: false,
        created_at: serverTimestamp(),
        items: cart.map(i => ({
          menu_item_id: i.id,
          name: i.name,
          price: i.selectedPrice,
          quantity: i.quantity,
          type: i.selectedType,
          selected_addons: i.selectedAddons
        }))
      });
      
      setCart([]);
      setShowCart(false);
      setShowPaymentModal(false);
      setShowOrderTracker(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      const next = prev + 1;
      if (next >= 3) {
        setShowAdminModal(true);
        return 0;
      }
      return next;
    });
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'bodega2024') {
      navigate('/admin');
      setShowAdminModal(false);
      setAdminPassword('');
      setAdminError(false);
    } else {
      setAdminError(true);
      setTimeout(() => setAdminError(false), 2000);
    }
  };

  const handlePay = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { is_paid: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse flex flex-col items-center">
          <Coffee className="w-12 h-12 text-black mb-4" />
          <p className="text-black font-medium uppercase tracking-widest">Loading Menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 font-sans text-black">
      {/* Black Navbar */}
      <header className="bg-black sticky top-0 z-20 shadow-2xl">
        {/* Main Brand Bar */}
        <div className="px-6 py-4 border-b border-white/10">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            {/* Logo Space - Triple click for Admin */}
            <div 
              onClick={handleLogoClick}
              className="w-12 h-12 bg-black rounded-full flex items-center justify-center shrink-0 shadow-lg cursor-pointer active:scale-95 border-2 border-white/20 hover:border-white transition-all overflow-hidden"
            >
              <img 
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdH0i179miZPzF_jDEwbvpE4KEjrK83VO2HA&s" 
                alt="Bodega Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-left flex-1">
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase leading-none">BODEGA</h1>
              <p className="text-[8px] text-white/80 font-bold tracking-[0.2em] uppercase mt-1">COWORKING CAFE</p>
            </div>

            {/* Cart & Tracker Buttons */}
            <div className="flex gap-3">
              <button 
                onClick={() => setShowOrderTracker(true)}
                className="relative w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all group"
              >
                <ClipboardList className="text-black w-6 h-6" />
                {orders.some(o => !o.is_paid || o.status !== 'completed') && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-black">
                    {orders.filter(o => !o.is_paid || o.status !== 'completed').length}
                  </span>
                )}
              </button>

              <button 
                onClick={() => setShowCart(true)}
                className="relative w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all group"
              >
                <ShoppingBag className="text-black w-6 h-6" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
                    {cart.reduce((sum, i) => sum + i.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sub Navbar for Categories - Black Background */}
        <div className="bg-black px-6 py-3 overflow-x-auto no-scrollbar border-b border-white/10">
          <nav className="max-w-4xl mx-auto flex gap-3 min-w-max">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all whitespace-nowrap uppercase tracking-widest border-2 ${
                activeCategory === null
                  ? 'bg-white text-black border-white'
                  : 'bg-black text-white border-white hover:bg-white hover:text-black'
              }`}
            >
              All
            </button>
            {menu.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all whitespace-nowrap uppercase tracking-widest border-2 ${
                  activeCategory === cat.id
                    ? 'bg-white text-black border-white'
                    : 'bg-black text-white border-white hover:bg-white hover:text-black'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Menu Items */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {menu.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <Coffee className="w-16 h-16 text-gray-200 mx-auto mb-6" />
              <h3 className="text-2xl font-black uppercase tracking-tight text-gray-400">Menu is empty</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-300 mt-2">Check back later for our latest offerings</p>
            </motion.div>
          ) : (
            <motion.div
              key={activeCategory ?? 'all'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-16"
            >
              {menu
                .filter(cat => activeCategory === null || cat.id === activeCategory)
                .map(cat => (
                <section key={cat.id}>
                  {activeCategory === null ? (
                    <div className="flex items-center gap-6 mb-8">
                      {cat.image && (
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-black shrink-0">
                          <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <h3 className="text-2xl font-black text-black uppercase tracking-tight">{cat.name}</h3>
                      <div className="h-1 flex-1 bg-black/5 rounded-full"></div>
                    </div>
                  ) : (
                    <div className="mb-12">
                      {cat.image && (
                        <div className="w-full h-48 rounded-[2.5rem] overflow-hidden border-4 border-black mb-6 shadow-xl">
                          <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <h2 className="text-4xl font-black text-black uppercase tracking-tighter">{cat.name}</h2>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mt-2">Discover our {cat.name.toLowerCase()} selection</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {cat.items.map(item => (
                      <div 
                        key={item.id} 
                        className={`group bg-white border-2 border-black p-6 rounded-2xl flex flex-col justify-between transition-all duration-300 ${!item.available ? 'opacity-60' : ''}`}
                      >
                        {/* Decorative background element */}
                        <div className="absolute -right-4 -top-4 w-16 h-16 bg-black/5 rounded-full group-hover:bg-white/10 transition-colors" />
                        
                        {item.image && (
                          <div className="relative w-full aspect-video rounded-xl overflow-hidden mb-4 border border-black/10 group-hover:border-white/20 transition-colors">
                            <img 
                              src={item.image} 
                              alt={item.name} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer" 
                              loading="lazy"
                            />
                          </div>
                        )}

                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-3">
                            <h3 className="text-xl font-black uppercase tracking-tight leading-tight">
                              {item.name}
                            </h3>
                            <div className="flex gap-2 items-center">
                              {item.available ? (
                                <span className="bg-green-500 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest">Available</span>
                              ) : (
                                <span className="bg-red-500 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest">Sold Out</span>
                              )}
                                {item.addons && (() => {
                                  try {
                                    const addons = JSON.parse(item.addons);
                                    return Array.isArray(addons) && addons.length > 0 && cat.name !== "SWEET TREATS";
                                  } catch (e) {
                                    return false;
                                  }
                                })() && (
                                  <span className={`text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 shadow-sm ${
                                    (() => {
                                      try {
                                        const addons = JSON.parse(item.addons);
                                        return addons.some((a: any) => a.available !== false);
                                      } catch (e) {
                                        return false;
                                      }
                                    })() 
                                      ? 'bg-orange-500' 
                                      : 'bg-gray-400'
                                  }`}>
                                    <Plus size={8} strokeWidth={4} />
                                    {(() => {
                                      try {
                                        const addons = JSON.parse(item.addons);
                                        return addons.some((a: any) => a.available !== false);
                                      } catch (e) {
                                        return false;
                                      }
                                    })() ? 'Add-ons' : 'Add-ons Unavailable'}
                                  </span>
                                )}
                            </div>
                          </div>
                          
                          {item.description && (
                            <p className="text-xs text-gray-500 font-medium leading-relaxed mb-4 italic">
                              {item.description}
                            </p>
                          )}

                          {item.addons && (() => {
                            try {
                              const addons = JSON.parse(item.addons);
                              return Array.isArray(addons) && addons.length > 0 && cat.name !== "SWEET TREATS";
                            } catch (e) {
                              return false;
                            }
                          })() && (
                            <div className="mb-6">
                              <p className="text-[8px] font-black uppercase tracking-widest text-orange-500 mb-2">Available Add-ons</p>
                              <div className="flex flex-wrap gap-2">
                                {(() => {
                                  try {
                                    return JSON.parse(item.addons);
                                  } catch (e) {
                                    return [];
                                  }
                                })().map((addon: any, idx: number) => (
                                  <span 
                                    key={idx} 
                                    className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                                      addon.available !== false 
                                        ? 'text-orange-500 bg-orange-500/5 border-orange-500/20' 
                                        : 'text-gray-300 bg-gray-50 border-gray-100 line-through'
                                    }`}
                                  >
                                    +{addon.name} (₱{addon.price})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-end justify-between mt-auto relative z-10">
                          <div className="flex gap-4">
                            {item.price_fixed !== null && (
                              <button 
                                disabled={!item.available}
                                onClick={() => addToCart(item, 'fixed', item.price_fixed!)}
                                className="flex flex-col items-start group/btn disabled:opacity-50"
                              >
                                <span className="text-[8px] uppercase font-black opacity-40 mb-1 group-hover/btn:opacity-100">Price</span>
                                <div className="flex items-center gap-2 bg-[#4A3728]/10 px-3 py-2 rounded-xl group-hover/btn:bg-[#4A3728] group-hover/btn:text-white transition-all">
                                  <span className="text-lg font-black">₱{item.price_fixed}</span>
                                  <Plus size={14} />
                                </div>
                              </button>
                            )}
                            {item.price_hot !== null && (
                              <button 
                                disabled={!item.available}
                                onClick={() => addToCart(item, 'hot', item.price_hot!)}
                                className="flex flex-col items-start group/btn disabled:opacity-50"
                              >
                                <span className="text-[8px] uppercase font-black opacity-40 mb-1 group-hover/btn:opacity-100">Hot</span>
                                <div className="flex items-center gap-2 bg-orange-500/10 px-3 py-2 rounded-xl group-hover/btn:bg-orange-500 group-hover/btn:text-white transition-all">
                                  <span className="text-lg font-black">₱{item.price_hot}</span>
                                  <Plus size={14} />
                                </div>
                              </button>
                            )}
                            {item.price_cold !== null && (
                              <button 
                                disabled={!item.available}
                                onClick={() => addToCart(item, 'cold', item.price_cold!)}
                                className="flex flex-col items-start group/btn disabled:opacity-50"
                              >
                                <span className="text-[8px] uppercase font-black opacity-40 mb-1 group-hover/btn:opacity-100">Cold</span>
                                <div className="flex items-center gap-2 bg-orange-500/10 px-3 py-2 rounded-xl group-hover/btn:bg-orange-500 group-hover/btn:text-white transition-all">
                                  <span className="text-lg font-black">₱{item.price_cold}</span>
                                  <Plus size={14} />
                                </div>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
          </motion.div>
        )}
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="h-px bg-black/20 mb-12" />
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center">
              <Info className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">Mandaue City • Bodega Coffee</p>
            <p className="text-[9px] text-gray-400 font-medium uppercase mt-2">© 2026 Bodega Coffee Roasters</p>
          </div>
          
          <button 
            onClick={() => setShowAdminModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-full border-2 border-black text-black text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all active:scale-95"
          >
            <Edit3 className="w-4 h-4" />
            Switch to Editor
          </button>
        </div>
      </footer>

      {/* Order Tracker Modal */}
      <AnimatePresence>
        {showOrderTracker && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-6"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] p-8 sm:p-10 border-t-4 sm:border-4 border-black shadow-2xl flex flex-col max-h-[95vh] h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tighter">Order Tracker</h2>
                  <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-1">Customer ID: {customerId}</p>
                </div>
                <button 
                  onClick={() => setShowOrderTracker(false)}
                  className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-10 pr-2 no-scrollbar">
                {/* Active Orders Section */}
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <Clock size={18} className="text-orange-500" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Active Orders</h3>
                  </div>
                  {orders.filter(o => !o.is_paid || o.status !== 'completed').length === 0 ? (
                    <p className="text-center py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">No active orders</p>
                  ) : (
                    <div className="space-y-4">
                      {orders.filter(o => !o.is_paid || o.status !== 'completed').map(order => (
                        <div key={order.id} className="bg-white border-2 border-black p-5 rounded-2xl shadow-md">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Order #{order.id}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-[10px] font-bold text-gray-500">
                                  {order.created_at?.toDate 
                                    ? order.created_at.toDate().toLocaleTimeString() 
                                    : new Date(order.created_at).toLocaleTimeString()}
                                </p>
                                {order.payment_method && (
                                  <span className="bg-black text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-white/20">
                                    {order.payment_method}
                                  </span>
                                )}
                                <p className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                  order.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                                }`}>
                                  {order.status === 'completed' ? 'Complete' : 'Preparing'}
                                </p>
                              </div>
                            </div>
                            {!order.is_paid ? (
                              <button 
                                onClick={() => handlePay(order.id)}
                                className="bg-orange-500 text-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all"
                              >
                                Pay ₱{order.total}
                              </button>
                            ) : (
                              <div className="bg-emerald-100 text-emerald-600 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">
                                Paid
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex flex-col">
                                <div className="flex justify-between text-[11px]">
                                  <span className="font-bold">{item.quantity}x {item.name}</span>
                                  <span className="font-black">₱{item.price * item.quantity}</span>
                                </div>
                                {item.selected_addons && item.selected_addons.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {item.selected_addons.map((addon, aIdx) => (
                                      <span key={aIdx} className="text-[7px] font-black uppercase tracking-tighter text-gray-400">
                                        +{addon.name} (₱{addon.price})
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Order History Section */}
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <History size={18} className="text-black" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Order History</h3>
                  </div>
                  {orders.filter(o => o.is_paid && o.status === 'completed').length === 0 ? (
                    <p className="text-center py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">No past orders</p>
                  ) : (
                    <div className="space-y-8">
                      {Object.entries(
                        orders
                          .filter(o => o.is_paid && o.status === 'completed')
                          .reduce((groups, order) => {
                            const dateObj = order.created_at?.toDate ? order.created_at.toDate() : new Date(order.created_at);
                            const date = dateObj.toLocaleDateString(undefined, { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            });
                            if (!groups[date]) groups[date] = [];
                            groups[date].push(order);
                            return groups;
                          }, {} as Record<string, Order[]>)
                      ).map(([date, dateOrders]) => (
                        <div key={date} className="space-y-4">
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-black/40">{date}</span>
                            <div className="h-px flex-1 bg-black/5" />
                          </div>
                          <div className="space-y-4">
                            {dateOrders.map(order => (
                              <div key={order.id} className="bg-gray-50 border border-black/5 p-5 rounded-2xl opacity-80">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Order #{order.id}</p>
                                    <div className="flex items-center gap-2">
                                      <p className="text-[10px] font-bold text-gray-500">
                                        {order.created_at?.toDate ? order.created_at.toDate().toLocaleTimeString() : new Date(order.created_at).toLocaleTimeString()}
                                      </p>
                                      {order.payment_method && (
                                        <span className="bg-gray-200 text-black text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-black/5">
                                          {order.payment_method}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-emerald-600 text-[8px] font-black uppercase tracking-widest">Completed</span>
                                </div>
                                <div className="space-y-2 mb-3">
                                  {order.items.map((item, idx) => (
                                    <div key={idx} className="flex flex-col">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="font-bold">{item.quantity}x {item.name}</span>
                                        <span className="font-black">₱{item.price * item.quantity}</span>
                                      </div>
                                      {item.selected_addons && item.selected_addons.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                          {item.selected_addons.map((addon, aIdx) => (
                                            <span key={aIdx} className="text-[7px] font-black uppercase tracking-tighter text-gray-400">
                                              +{addon.name} (₱{addon.price})
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-between items-center pt-3 border-t border-black/5">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase">Total Amount</span>
                                  <span className="font-black text-sm">₱{order.total}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Modal */}
      <AnimatePresence>
        {showCart && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-6"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] p-8 sm:p-10 border-t-4 sm:border-4 border-black shadow-2xl flex flex-col max-h-[95vh] h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tighter">Your Cart</h2>
                  <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-1">Review your selection</p>
                </div>
                <div className="flex items-center gap-3">
                  {cart.length > 0 && (
                    <button 
                      onClick={() => setCart([])}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-red-500 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 size={14} />
                      Clear All
                    </button>
                  )}
                  <button 
                    onClick={() => setShowCart(false)}
                    className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-2 no-scrollbar">
                {cart.length === 0 ? (
                  <div className="text-center py-20">
                    <ShoppingBag size={48} className="mx-auto text-gray-200 mb-4" />
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Your cart is empty</p>
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div key={`${item.id}-${item.selectedType}-${idx}`} className="flex gap-4 items-center bg-gray-50 p-4 rounded-2xl border-2 border-black/5">
                      {item.image && (
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-black/10 shrink-0">
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2 pr-2">
                          <div>
                            <h4 className="font-black uppercase text-sm tracking-tight">{item.name}</h4>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{item.selectedType} • ₱{item.selectedPrice}</p>
                          </div>
                          
                          {/* Main Item Quantity Editor moved here */}
                          <div className="flex items-center gap-3 bg-white border-2 border-black rounded-xl p-1 shrink-0">
                            <button 
                              onClick={() => updateCartQuantity(item.id, item.selectedType, item.selectedAddons, -1)}
                              className="p-1 hover:bg-black hover:text-white rounded-lg transition-all"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="font-black text-sm w-4 text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateCartQuantity(item.id, item.selectedType, item.selectedAddons, 1)}
                              className="p-1 hover:bg-black hover:text-white rounded-lg transition-all"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        
                        {/* Add-ons selection in cart */}
                        {item.addons && (() => {
                          try {
                            const addons = JSON.parse(item.addons);
                            return Array.isArray(addons) && addons.length > 0;
                          } catch (e) {
                            return false;
                          }
                        })() && (
                          <div className="mt-3 space-y-3">
                            <p className="text-[8px] font-black uppercase tracking-widest text-black/40">Customize Add-ons</p>
                            <div className="space-y-2">
                              {(() => {
                                try {
                                  return JSON.parse(item.addons);
                                } catch (e) {
                                  return [];
                                }
                              })().map((addon: { name: string, price: number, available?: boolean }) => {
                                const selectedAddon = item.selectedAddons.find(a => a.name === addon.name);
                                const quantity = selectedAddon ? selectedAddon.quantity : 0;
                                const isAvailable = addon.available !== false;
                                
                                if (!isAvailable && quantity === 0) return null;

                                return (
                                  <div key={addon.name} className="flex items-center justify-between bg-white p-2 rounded-xl border border-black/5">
                                    <div className="flex flex-col">
                                      <span className="text-[9px] font-black uppercase tracking-tight">{addon.name}</span>
                                      <span className="text-[8px] font-bold text-gray-400">₱{addon.price}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button 
                                        disabled={!isAvailable && quantity === 0}
                                        onClick={() => {
                                          setCart(prev => prev.map((i, idx2) => {
                                            if (idx === idx2) {
                                              const existing = i.selectedAddons.find(a => a.name === addon.name);
                                              let newAddons;
                                              if (existing) {
                                                if (existing.quantity <= 1) {
                                                  newAddons = i.selectedAddons.filter(a => a.name !== addon.name);
                                                } else {
                                                  newAddons = i.selectedAddons.map(a => a.name === addon.name ? { ...a, quantity: a.quantity - 1 } : a);
                                                }
                                              } else {
                                                return i;
                                              }
                                              return { ...i, selectedAddons: newAddons };
                                            }
                                            return i;
                                          }));
                                        }}
                                        className="w-6 h-6 rounded-lg border border-black/10 flex items-center justify-center hover:bg-black hover:text-white transition-all disabled:opacity-30"
                                      >
                                        <Minus size={10} />
                                      </button>
                                      <span className="text-[10px] font-black w-4 text-center">{quantity}</span>
                                      <button 
                                        disabled={!isAvailable}
                                        onClick={() => {
                                          setCart(prev => prev.map((i, idx2) => {
                                            if (idx === idx2) {
                                              const existing = i.selectedAddons.find(a => a.name === addon.name);
                                              let newAddons;
                                              if (existing) {
                                                newAddons = i.selectedAddons.map(a => a.name === addon.name ? { ...a, quantity: a.quantity + 1 } : a);
                                              } else {
                                                newAddons = [...i.selectedAddons, { name: addon.name, price: addon.price, quantity: 1 }];
                                              }
                                              return { ...i, selectedAddons: newAddons };
                                            }
                                            return i;
                                          }));
                                        }}
                                        className="w-6 h-6 rounded-lg border border-black/10 flex items-center justify-center hover:bg-black hover:text-white transition-all disabled:opacity-30"
                                      >
                                        <Plus size={10} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => setCart(prev => prev.filter(i => 
                          !(i.id === item.id && i.selectedType === item.selectedType && JSON.stringify(i.selectedAddons) === JSON.stringify(item.selectedAddons))
                        ))}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Remove from cart"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {cart.length > 0 && (
                <div className="mt-8 pt-8 border-t-4 border-black space-y-6">
                  <div className="flex justify-between items-end">
                    <span className="text-gray-400 font-black uppercase tracking-widest text-xs">Total Amount</span>
                    <span className="text-4xl font-black tracking-tighter">₱{cartTotal}</span>
                  </div>
                  <button 
                    onClick={() => setShowPaymentModal(true)}
                    disabled={isSubmittingOrder}
                    className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-900 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    <ShoppingBag size={20} />
                    Finalize Order
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Password Modal */}
      <AnimatePresence>
        {showAdminModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 border-4 border-black shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Admin Access</h2>
                <button 
                  onClick={() => setShowAdminModal(false)}
                  className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors"
                >
                  <span className="font-bold">×</span>
                </button>
              </div>
              
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-2">Password</label>
                  <input 
                    autoFocus
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all outline-none ${adminError ? 'border-red-500 bg-red-50' : 'border-black focus:ring-4 focus:ring-black/5'}`}
                    placeholder="••••••••"
                  />
                  {adminError && (
                    <p className="text-red-500 text-[9px] font-black uppercase mt-2 tracking-widest">Access Denied</p>
                  )}
                </div>
                <button 
                  type="submit"
                  className="w-full bg-black text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-gray-900 active:scale-95 transition-all shadow-lg"
                >
                  Login
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Method Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[3rem] p-8 border-4 border-black shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black uppercase tracking-tighter">Payment</h2>
                <button 
                  onClick={() => setShowPaymentModal(false)}
                  className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Select Payment Method</p>
                  <div className="grid grid-cols-1 gap-3">
                    {(['GCash', 'Card', 'Counter'] as const).map(method => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`py-4 rounded-2xl font-black uppercase text-xs tracking-widest border-2 transition-all flex items-center justify-center gap-3 ${
                          paymentMethod === method 
                            ? 'bg-black text-white border-black shadow-lg scale-[1.02]' 
                            : 'bg-white text-gray-400 border-gray-200 hover:border-black hover:text-black'
                        }`}
                      >
                        <CreditCard size={16} />
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-6 border-t-2 border-black/5">
                  <div className="flex justify-between items-end mb-6">
                    <span className="text-gray-400 font-black uppercase tracking-widest text-[10px]">Total to Pay</span>
                    <span className="text-3xl font-black tracking-tighter">₱{cartTotal}</span>
                  </div>
                  
                  <button 
                    onClick={finalizeOrder}
                    disabled={isSubmittingOrder}
                    className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-900 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSubmittingOrder ? <RefreshCw className="animate-spin" size={20} /> : <ShoppingBag size={20} />}
                    Confirm Order
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
