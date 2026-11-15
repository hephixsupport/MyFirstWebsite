// 1. Initialize Supabase
const SUPABASE_URL = "https://kacxgveptrawqsxataly.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qFQGAK79ODKvJjsyJRnmjA_YXP5pPZ_";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Config
const TAX_RATE = 0.07; // 7% Iowa sales tax (adjust as needed)

// App State
let categories = [];
let subcategories = [];
let items = [];
let selectedCategory = null;
let selectedSubcategory = null;
let cart = []; // [{ id, name, price, qty }]

// DOM Elements
const categoryBar = document.getElementById("category-bar");
const subcategoryBar = document.getElementById("subcategory-bar");
const categoryNoteEl = document.getElementById("category-note");
const itemsGrid = document.getElementById("items-grid");
const cartItemsEl = document.getElementById("cart-items");
const subtotalEl = document.getElementById("subtotal-amount");
const taxEl = document.getElementById("tax-amount");
const totalEl = document.getElementById("total-amount");
const taxRateDisplayEl = document.getElementById("tax-rate-display");

// Load all menu data from Supabase on startup
async function initPOS() {
  taxRateDisplayEl.textContent = (TAX_RATE * 100).toFixed(0);

  const [catRes, subRes, itemRes] = await Promise.all([
    db.from("categories").select("*").order("code"),
    db.from("subcategories").select("*").order("code"),
    db.from("items").select("*").order("id"),
  ]);

  if (catRes.error || subRes.error || itemRes.error) {
    console.error("Supabase load error:", catRes.error || subRes.error || itemRes.error);
    itemsGrid.innerHTML = `<p>Error loading menu from Supabase. Check console & API keys.</p>`;
    return;
  }

  categories = catRes.data;
  subcategories = subRes.data;
  items = itemRes.data;

  if (categories.length > 0) {
    selectCategory(categories[0].code);
  }
}

// Select a Main Category (e.g., "A")
function selectCategory(categoryCode) {
  selectedCategory = categoryCode;
  const catObj = categories.find((c) => c.code === categoryCode);
  categoryNoteEl.textContent = catObj?.note || "";

  // Auto-select first subcategory belonging to this category
  const matchingSubs = subcategories.filter((s) => s.category_code === categoryCode);
  selectedSubcategory = matchingSubs.length > 0 ? matchingSubs[0].code : null;

  renderCategories();
  renderSubcategories();
  renderItems();
}

// Select a Subcategory (e.g., "A1")
function selectSubcategory(subcategoryCode) {
  selectedSubcategory = subcategoryCode;
  renderSubcategories();
  renderItems();
}

// Render Top Category Buttons
function renderCategories() {
  categoryBar.innerHTML = categories
    .map(
      (cat) => `
      <button
        type="button"
        class="tab-btn ${cat.code === selectedCategory ? "active" : ""}"
        onclick="selectCategory('${cat.code}')"
      >
        ${cat.name}
      </button>
    `
    )
    .join("");
}

// Render Subcategory Buttons for active Category
function renderSubcategories() {
  const filteredSubs = subcategories.filter((s) => s.category_code === selectedCategory);
  subcategoryBar.innerHTML = filteredSubs
    .map(
      (sub) => `
      <button
        type="button"
        class="tab-btn ${sub.code === selectedSubcategory ? "active" : ""}"
        onclick="selectSubcategory('${sub.code}')"
      >
        ${sub.name}
      </button>
    `
    )
    .join("");
}

// Render 2-Column Item Cards for active Subcategory
function renderItems() {
  const filteredItems = items.filter((item) => item.subcategory_code === selectedSubcategory);

  if (filteredItems.length === 0) {
    itemsGrid.innerHTML = `<p style="color:#6b7280;">No items assigned to this subcategory yet.</p>`;
    return;
  }

  itemsGrid.innerHTML = filteredItems
    .map(
      (item) => `
      <div class="item-card" onclick="addToCart(${item.id})">
        <img
          class="item-image"
          src="${item.image_url || "https://via.placeholder.com/300x150?text=Stamp+Item"}"
          alt="${item.name}"
        />
        <div class="item-info">
          <span class="item-name">${item.name}</span>
          <span class="item-price">$${Number(item.price).toFixed(2)}</span>
        </div>
      </div>
    `
    )
    .join("");
}

// Cart Management
function addToCart(itemId) {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;

  const existing = cart.find((c) => c.id === itemId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id: item.id, name: item.name, price: Number(item.price), qty: 1 });
  }
  renderCart();
}

function updateQty(itemId, delta) {
  const index = cart.findIndex((c) => c.id === itemId);
  if (index === -1) return;

  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  renderCart();
}

function renderCart() {
  if (cart.length === 0) {
    cartItemsEl.innerHTML = `<p class="empty-cart">No items added yet.</p>`;
    updateTotals(0);
    return;
  }

  let subtotal = 0;

  cartItemsEl.innerHTML = cart
    .map((line) => {
      const lineTotal = line.price * line.qty;
      subtotal += lineTotal;
      return `
        <div class="cart-line">
          <div class="cart-line-info">
            <div class="cart-line-title">${line.name}</div>
            <div class="cart-line-sub">$${line.price.toFixed(2)} each</div>
          </div>
          <div class="qty-controls">
            <button class="qty-btn" onclick="updateQty(${line.id}, -1)">-</button>
            <span>${line.qty}</span>
            <button class="qty-btn" onclick="updateQty(${line.id}, 1)">+</button>
          </div>
          <div style="font-weight:600; min-width:60px; text-align:right;">
            $${lineTotal.toFixed(2)}
          </div>
        </div>
      `;
    })
    .join("");

  updateTotals(subtotal);
}

function updateTotals(subtotal) {
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  taxEl.textContent = `$${tax.toFixed(2)}`;
  totalEl.textContent = `$${total.toFixed(2)}`;
}

// Clear Cart
document.getElementById("clear-btn").addEventListener("click", () => {
  cart = [];
  renderCart();
});

// Finalize Order -> Save to Supabase
document.getElementById("finalize-btn").addEventListener("click", async () => {
  if (cart.length === 0) {
    alert("Cart is empty.");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = Number((subtotal * TAX_RATE).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  const { error } = await db.from("orders").insert([
    {
      items: cart,
      subtotal: Number(subtotal.toFixed(2)),
      tax,
      total,
    },
  ]);

  if (error) {
    alert("Error saving order: " + error.message);
    return;
  }

  alert(`Order finalized! Total: $${total.toFixed(2)}`);
  cart = [];
  renderCart();
});

// Start POS
initPOS();
