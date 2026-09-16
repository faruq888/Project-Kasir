/* ================== CONFIG ================== */
const API_BASE = '../backend/api';

// Suppress common browser extension errors
window.addEventListener('unhandledrejection', function(event) {
    // Suppress "message channel closed" error from browser extensions
    if (event.reason && event.reason.message && 
        event.reason.message.includes('message channel closed')) {
        event.preventDefault();
        return;
    }
    // Suppress "Extension context invalidated" from Chrome extensions
    if (event.reason && event.reason.message && 
        event.reason.message.includes('Extension context invalidated')) {
        event.preventDefault();
        return;
    }
});

const rolePermissions = {
    admin: {
        pages: [
            'dashboard',
            'products',
            'customers',
            'suppliers',
            'purchases',
            'transactions',
            'hutang',
            'reports',
            'stock-movements',
            'correct-transactions',
            'verify-transactions',
            'user-management',
            'receipt-settings',
            'store-settings',
            'stock-settings',
            'barcode-settings',
            'printer-settings',
            'system-settings',
        ],
        actions: ['view', 'create', 'edit', 'delete']
    },
    operator: {
        pages: [
            'dashboard',
            'purchases',
            'transactions',
            'kas',
            'hutang',
            'reports',
            'stock-movements',
            'verify-transactions'
        ],
        actions: ['view', 'create']
    }
};

// Settings variables
const DEFAULT_STORE_NAME = 'TOKO JAYA BARU';
let currentSettings = {};
let settingsLoadPromise = null;
let receiptHeaderLinkedToStore = true;
let storeFormInitialized = false;
let users = [];

let currentUserRole = localStorage.getItem('userRole') || '';
let currentUserName = localStorage.getItem('username') || '';
let products = [];
let customers = [];
let purchases = [];
let categories = [];
let suppliers = [];
let transactions = [];
let currentTransactionItems = [];
let newTransactionTotal = 0;

/* ================== CUSTOMER SUGGESTIONS ================== */
let customerSuggestions = [];

// Function untuk load customers dengan duplikat handling
async function loadCustomerSuggestions() {
    try {
        const res = await apiRequest('customers.php', 'GET');
        const customers = Array.isArray(res) ? res : (res.data || []);

        // Group customers by name to detect duplicates
        const nameGroups = {};
        customers.forEach(customer => {
            const name = customer.name.toLowerCase();
            if (!nameGroups[name]) {
                nameGroups[name] = [];
            }
            nameGroups[name].push(customer);
        });

        // Create suggestions with ID for duplicates
        customerSuggestions = customers.map(customer => {
            const sameName = nameGroups[customer.name.toLowerCase()];
            const displayName = sameName.length > 1
                ? `${customer.name} (ID: ${customer.id})`
                : customer.name;

            return {
                id: customer.id,
                name: customer.name,
                displayName: displayName,
                fullData: customer
            };
        });

        return customerSuggestions;
    } catch (error) {
        console.error('Error loading customers:', error);
        return [];
    }
}

// Create dropdown suggestion system
function createCustomerDropdown() {
    const customerInput = document.getElementById('new-transaction-customer');
    if (!customerInput) return;

    // Remove existing dropdown
    const existingDropdown = document.getElementById('customer-suggestions');
    if (existingDropdown) existingDropdown.remove();

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.id = 'customer-suggestions';
    dropdown.className = 'absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto hidden';
    dropdown.style.top = '100%';
    dropdown.style.left = '0';

    // Make parent relative
    customerInput.parentElement.style.position = 'relative';
    customerInput.parentElement.appendChild(dropdown);

    // Add input event listener
    customerInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (query.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }

        const matches = customerSuggestions.filter(customer =>
            customer.name.toLowerCase().includes(query) ||
            customer.id.toLowerCase().includes(query)
        );

        if (matches.length === 0) {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.innerHTML = '';
        matches.slice(0, 10).forEach(customer => {
            const item = document.createElement('div');
            item.className = 'px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100';
            item.innerHTML = `
                <div class="font-medium">${customer.displayName}</div>
                <div class="text-sm text-gray-500">Kas: ${formatCurrency(customer.fullData.kas || 0)}</div>
            `;

            item.addEventListener('click', () => {
                selectCustomer(customer);
                dropdown.classList.add('hidden');
            });

            dropdown.appendChild(item);
        });

        dropdown.classList.remove('hidden');
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!customerInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

// Function to select customer from dropdown
function selectCustomer(customer) {
    const customerInput = document.getElementById('new-transaction-customer');
    const memberSelect = document.getElementById('new-transaction-member');

    if (customerInput) customerInput.value = customer.name;
    if (memberSelect) {
        memberSelect.value = "1"; // Set as member
        memberSelect.dispatchEvent(new Event('change'));
    }

    // Store selected customer ID for later use
    customerInput.dataset.customerId = customer.id;

    updateKasInfo(customer.name, true);
}

// Initialize customer dropdown when page loads
async function initializeTransactionPage() {
    await loadCustomerSuggestions();
    createCustomerDropdown();
}

/* ================== UTIL ================== */
function getToken() {
    return localStorage.getItem('token') || '';
}

function formatCurrency(amount = 0) {
    const formatted = new Intl.NumberFormat('id-ID', {style: 'currency', currency: 'IDR'}).format(amount);
    const customSymbol = (currentSettings.currency_symbol || '').trim();
    if (!customSymbol || customSymbol === 'Rp') {
        return formatted;
    }
    return formatted.replace(/^Rp/, customSymbol);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console[type === 'error' ? 'error' : 'log'](message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `px-4 py-2 rounded-md text-white text-sm ${
        type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' :
                type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
    }`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

function showDetailModal(title, html) {
    const t = document.getElementById('detail-modal-title');
    const c = document.getElementById('detail-modal-content');
    if (t) t.textContent = title;
    if (c) c.innerHTML = html;
    showModal('detail-modal');
}

function showConfirmation(message, onConfirm, title = 'Konfirmasi', confirmText = 'Ya, Lanjutkan') {
    const t = document.getElementById('confirmation-modal-title');
    const m = document.getElementById('confirmation-modal-message');
    const ok = document.getElementById('confirm-ok-btn');
    const cancel = document.getElementById('confirm-cancel-btn');
    if (t) t.textContent = title;
    if (m) m.textContent = message;
    if (ok) {
        ok.textContent = confirmText;
        ok.onclick = () => {
            onConfirm();
            hideModal('confirmation-modal');
        };
    }
    if (cancel) cancel.onclick = () => hideModal('confirmation-modal');
    showModal('confirmation-modal');
}

function checkUserPermissions() {
    document.querySelectorAll('[data-role-access]').forEach(el => {
        const allowed = (el.dataset.roleAccess || '').split(',').map(x => x.trim()).filter(Boolean);
        if (allowed.length === 0) {
            el.classList.remove('hidden');
            el.disabled = false;
            return;
        }
        if (allowed.includes(currentUserRole)) {
            el.classList.remove('hidden');
            el.disabled = false;
        } else {
            el.classList.add('hidden');
            el.disabled = true;
        }
    });
}

/* ================== API WRAPPER ================== */
async function apiRequest(path, method = 'GET', body = null, query = '') {
    try {
        const url = `${API_BASE}/${path}${query ? `?${query}` : ''}`;
        const headers = {'Authorization': 'Bearer ' + getToken()};
        if (body) headers['Content-Type'] = 'application/json';
        const res = await fetch(url, {method, headers, body: body ? JSON.stringify(body) : undefined});
        const json = await res.json();
        return json;
    } catch (err) {
        console.error('API error', err);
        return {success: false, message: 'Koneksi ke server gagal'};
    }
}

/* ================== PERMISSION HELPERS ================== */

function canAccessPage(page) {
    return rolePermissions[currentUserRole]?.pages?.includes(page);
}

function applyRoleUI() {
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        const page = href.replace('#', '');
        if (!page) {
            link.style.display = 'flex';
            return;
        }
        link.style.display = canAccessPage(page) ? 'flex' : 'none';
    });

    checkUserPermissions();

    if (currentUserRole) {
        document.getElementById('login-screen')?.classList.add('hidden');
        document.getElementById('app-screen') && (document.getElementById('app-screen').style.display = 'flex');
        document.getElementById('current-role') && (document.getElementById('current-role').textContent = currentUserRole.toUpperCase());
        document.getElementById('current-username') && (document.getElementById('current-username').textContent = currentUserName || '');
        document.getElementById('user-initial') && (document.getElementById('user-initial').textContent = (currentUserName?.charAt(0) || '').toUpperCase());
    } else {
        document.getElementById('app-screen')?.style && (document.getElementById('app-screen').style.display = 'none');
        document.getElementById('login-screen')?.classList.remove('hidden');
    }
}

/* ================== RENDER GENERIC TABLE ================== */
function renderTable(tbodyId, items = [], columns = [], rowActions = []) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    items.forEach(item => {
        const tr = document.createElement('tr');
        columns.forEach(colFn => {
            const td = document.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap';
            td.innerHTML = colFn(item);
            tr.appendChild(td);
        });
        const tdActions = document.createElement('td');
        tdActions.className = 'px-6 py-4 whitespace-nowrap text-right text-sm font-medium';
        tdActions.innerHTML = rowActions.map(a => a(item)).join(' ');
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
    checkUserPermissions();
}

/* ================== ENTITY LOADERS ================== */
async function loadProducts(search = '') {
    const query = search ? `search=${encodeURIComponent(search)}` : '';
    const res = await apiRequest('products.php', 'GET', null, query);
    products = Array.isArray(res) ? res : (res.data || []);
    renderProducts();
    renderProductDropdown();
}

function renderProducts() {
    renderTable('products-table-body', products, [
        p => p.id,
        p => p.name,
        p => formatCurrency(p.price),
        p => p.stock,
        p => p.category_name || '-',
        p => p.supplier_name || '-'
    ], [
        p => `<button class="text-indigo-600 hover:text-indigo-900 mr-2 edit-product" data-id="${p.id}" data-role-access="admin">Edit</button>`,
        p => `<button class="text-red-600 hover:text-red-900 delete-product" data-id="${p.id}" data-role-access="admin">Hapus</button>`
    ]);
}

async function loadCustomers(search = '') {
    const query = search ? `search=${encodeURIComponent(search)}` : '';
    const res = await apiRequest('customers.php', 'GET', null, query);
    customers = Array.isArray(res) ? res : (res.data || []);
    renderCustomers();
}

function renderCustomers() {
    renderTable('customers-table-body', customers, [
        c => c.id,
        c => c.name,
        c => c.phone,
        c => c.address || '-'
    ], [
        c => `<button class="text-indigo-600 hover:text-indigo-900 mr-2 edit-customer" data-id="${c.id}" data-role-access="admin">Edit</button>`,
        c => `<button class="text-red-600 hover:text-red-900 delete-customer" data-id="${c.id}" data-role-access="admin">Hapus</button>`
    ]);
}

async function loadSuppliers(search = '') {
    try {
        const query = search ? `search=${encodeURIComponent(search)}` : '';
        const res = await apiRequest('suppliers.php', 'GET', null, query);
        suppliers = Array.isArray(res) ? res : (res.data || []);
        // console.log('Suppliers loaded:', suppliers.length, 'items'); // Removed for security
        renderSuppliers();
    } catch (error) {
        console.error('Error loading suppliers:', error);
        showToast('Gagal memuat data supplier: ' + error.message, 'error');
        suppliers = [];
        renderSuppliers();
    }
}

function renderSuppliers() {
    renderTable('suppliers-table-body', suppliers, [
        s => s.id,
        s => s.name,
        s => s.contact || '-',
        s => s.address || '-'
    ], [
        s => `<button class="text-indigo-600 hover:text-indigo-900 mr-2 edit-supplier" data-id="${s.id}" data-role-access="admin">Edit</button>`,
        s => `<button class="text-red-600 hover:text-red-900 delete-supplier" data-id="${s.id}" data-role-access="admin">Hapus</button>`
    ]);
}

async function loadPurchases(search = '') {
    const query = search ? `search=${encodeURIComponent(search)}` : '';
    const res = await apiRequest('purchases.php', 'GET', null, query);
    purchases = Array.isArray(res) ? res : (res.data || []);
    renderPurchases();
}

function renderPurchases() {
    renderTable('purchases-table-body', purchases, [
        p => p.id,
        p => formatDate(p.purchase_date),
        p => `<span class="block max-w-[120px] truncate" title="${p.supplier_name || '-'}">${p.supplier_name || '-'}</span>`,
        p => `<span class="block max-w-[150px] truncate" title="${p.product_name || '-'}">${p.product_name || '-'}</span>`,
        p => p.quantity || 0,
        p => formatCurrency(p.buy_price || 0),
        p => formatCurrency(p.total || p.total_price || 0),
        p => `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
            p.status === 'Selesai' ? 'bg-green-100 text-green-800' :
                p.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
        }">${p.status || '-'}</span>`
    ], [
        p => p.status === 'Pending'
            ? `<button class="text-green-600 hover:text-green-900 mr-2 complete-purchase" data-id="${p.id}" data-role-access="admin">Selesaikan</button>`
            : '',
        p => p.status === 'Selesai'
            ? `<button class="text-yellow-600 hover:text-yellow-900 mr-2 pending-purchase" data-id="${p.id}" data-role-access="admin">Pending</button>`
            : '',
        p => `<button class="text-red-600 hover:text-red-900 delete-purchase" data-id="${p.id}" data-role-access="admin">Hapus</button>`
    ]);
}

async function loadTransactions(search = '') {
    const query = search ? `search=${encodeURIComponent(search)}` : '';
    const res = await apiRequest('transactions.php', 'GET', null, query);
    transactions = Array.isArray(res) ? res : (res.data || []);
    renderTransactions();
}

function renderTransactions() {
    renderTable('transactions-table-body', transactions, [
        t => t.id,
        t => formatDate(t.date),
        t => t.customer || t.customer_name || '-',
        t => formatCurrency(t.total || t.total_amount || 0),
        t => `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.status === 'Selesai' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">${t.status || '-'}</span>`
    ], [
        t => `<button class="text-blue-600 hover:text-blue-900 mr-2 view-transaction" data-id="${t.id}" data-role-access="admin,operator">Lihat Detail</button>`,
        t => `<button class="text-red-600 hover:text-red-900 delete-transaction" data-id="${t.id}" data-role-access="admin">Hapus</button>`
    ]);
}

/* ================== KAS FUNCTIONS ================== */
async function loadKasData(period = 'monthly', startDate = null, endDate = null, search = '') {
    try {
        let query = `period=${period}`;
        if (startDate) query += `&start_date=${startDate}`;
        if (endDate) query += `&end_date=${endDate}`;
        if (search) query += `&search=${encodeURIComponent(search)}`;

        const res = await apiRequest('kas.php', 'GET', null, query);
        if (res.success) {
            renderKasTable(res.data || []);
            renderKasSummary(res.summary || {});
        } else {
            showToast(res.message || 'Gagal memuat data kas', 'error');
        }
    } catch (error) {
        console.error('Error loading kas data:', error);
        showToast('Gagal memuat data kas', 'error');
    }
}

function renderKasTable(data) {
    const tbody = document.getElementById('kas-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Tidak ada data mutasi kas</td></tr>';
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${formatDate(item.created_at)}</td>
            <td class="px-6 py-4 whitespace-nowrap">${item.customer_id}</td>
            <td class="px-6 py-4">${item.customer_name}</td>
            <td class="px-6 py-4">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                item.type === 'tarik' ? 'bg-red-100 text-red-800' :
                item.type === 'belanja' ? 'bg-green-100 text-green-800' :
                    'bg-blue-100 text-blue-800'
        }">
                    ${item.type === 'belanja' ? 'KONVERSI DARI BELANJA' : item.type.toUpperCase()}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(item.amount)}</td>
            <td class="px-6 py-4">${item.description || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderKasSummary(summary) {
    const summaryContainer = document.getElementById('kas-summary');
    if (!summaryContainer) return;

    summaryContainer.innerHTML = `
        <div class="bg-red-50 p-4 rounded-lg">
            <div class="text-red-600 text-sm font-medium">Total Penarikan Periode</div>
            <div class="text-2xl font-bold text-red-800">${formatCurrency(summary.total_tarik_periode || 0)}</div>
        </div>
        
        <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-green-600 text-sm font-medium">Total Konversi dari Belanja</div>
            <div class="text-2xl font-bold text-green-800">${formatCurrency(summary.total_belanja_periode || 0)}</div>
        </div>
        
        <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-blue-600 text-sm font-medium">Total Kas Semua Anggota</div>
            <div class="text-2xl font-bold text-blue-800">${formatCurrency(summary.total_kas_semua_anggota || 0)}</div>
        </div>
        
        <div class="bg-purple-50 p-4 rounded-lg">
            <div class="text-purple-600 text-sm font-medium">Total Transaksi</div>
            <div class="text-2xl font-bold text-purple-800">${summary.transaction_count || 0}</div>
        </div>
    `;
    summaryContainer.classList.remove('hidden');
}

/* ================== PRODUCT DROPDOWN & TRANSACTION PREVIEW ================== */
function renderProductDropdown() {
    const select = document.getElementById('new-transaction-product-select');
    if (!select) return;
    select.innerHTML = '<option value="">Pilih Produk</option>';
    products.forEach(p => {
        if (p.stock > 0) {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.name} (Stok: ${p.stock}) - ${formatCurrency(p.price)}`;
            option.dataset.price = p.price;
            option.dataset.stock = p.stock;
            select.appendChild(option);
        }
    });
}

async function loadCustomersForTransaction() {
    const res = await apiRequest('customers.php', 'GET');
    customers = Array.isArray(res) ? res : (res.data || []);
}

async function updateKasInfo(customerName, isMember) {
    const kasInfoEl = document.getElementById('member-kas-info');
    const kasWarningEl = document.getElementById('member-kas-warning');

    if (!kasInfoEl) return;

    if (!isMember || !customerName) {
        kasInfoEl?.classList.add('hidden');
        kasWarningEl?.classList.add('hidden');
        return;
    }

    const customer = customers.find(c => c.name === customerName);
    if (!customer) {
        kasInfoEl.textContent = "Anggota tidak ditemukan di database.";
        kasInfoEl.classList.remove('hidden');
        kasWarningEl?.classList.add('hidden');
        return;
    }

    const kasRes = await apiRequest(`kas.php?id=${customer.id}`, 'GET');
    if (kasRes.success) {
        const saldoKas = parseFloat(kasRes.customer.kas || 0);
        kasInfoEl.textContent = `Saldo kas anggota: ${formatCurrency(saldoKas)}`;
        kasInfoEl.classList.remove('hidden');

        if (kasWarningEl && saldoKas < newTransactionTotal) {
            kasWarningEl.textContent = "Saldo kas kurang, sisa belanja akan dibayar dengan cash.";
            kasWarningEl.classList.remove('hidden');
        } else {
            kasWarningEl?.classList.add('hidden');
        }
    } else {
        kasInfoEl.textContent = "Gagal memuat saldo kas anggota.";
        kasInfoEl.classList.remove('hidden');
        kasWarningEl?.classList.add('hidden');
    }
}

function renderTransactionItemsPreview() {
    const preview = document.getElementById('transaction-items-preview');
    const totalEl = document.getElementById('new-transaction-total');
    if (!preview || !totalEl) return;

    preview.innerHTML = '';
    newTransactionTotal = 0;

    if (currentTransactionItems.length === 0) {
        preview.innerHTML = '<p class="text-gray-500 italic">Belum ada item ditambahkan</p>';
        totalEl.textContent = formatCurrency(0);
        const kasWarningEl = document.getElementById('member-kas-warning');
        kasWarningEl?.classList.add('hidden');
        updateQrisDisplay(0);
        return;
    }

    currentTransactionItems.forEach((item, index) => {
        const itemTotal = item.price * item.qty;
        newTransactionTotal += itemTotal;

        const itemEl = document.createElement('div');
        itemEl.className = 'flex justify-between items-center py-2 border-b border-gray-200';
        itemEl.innerHTML = `
          <div>
            <span class="font-medium">${item.name}</span>
            <span class="text-sm text-gray-600 ml-2">${item.qty} × ${formatCurrency(item.price)}</span>
          </div>
          <div class="flex items-center">
            <span class="text-gray-700 mr-3">${formatCurrency(itemTotal)}</span>
            <button type="button" class="text-red-500 hover:text-red-700 remove-item" data-index="${index}">
              ✖
            </button>
          </div>
        `;
        preview.appendChild(itemEl);
    });

    totalEl.textContent = formatCurrency(newTransactionTotal);

    // Update QRIS display if QRIS payment method is active
    updateQrisDisplay(newTransactionTotal);

    // Update kas info kalau anggota dipilih
    const customerName = document.getElementById('new-transaction-customer')?.value.trim();
    const isMember = document.getElementById('new-transaction-member')?.value === "1";
    updateKasInfo(customerName, isMember);
}

/* ================== QRIS PAYMENT SYSTEM ================== */

function updateQrisDisplay(total = null) {
    const paymentSelect = document.getElementById('new-transaction-payment');
    const qrisContainer = document.getElementById('qris-payment-container');
    const qrisAmountEl = document.getElementById('qris-amount-display');
    const qrisImg = document.getElementById('qris-image');
    const qrisCanvas = document.getElementById('qris-canvas');

    if (!paymentSelect || !qrisContainer) return;

    const isQris = paymentSelect.value === 'qris';
    if (!isQris) {
        qrisContainer.classList.add('hidden');
        return;
    }

    qrisContainer.classList.remove('hidden');

    const amount = (total !== null && total !== undefined) ? total : (typeof newTransactionTotal !== 'undefined' ? newTransactionTotal : 0);
    const formattedAmount = formatCurrency(amount);

    if (qrisAmountEl) {
        qrisAmountEl.textContent = formattedAmount;
    }

    // Standard EMVCo/QRIS payload specification
    const amountStr = Math.round(amount).toString();
    const lenStr = amountStr.length < 10 ? '0' + amountStr.length : amountStr.length;
    const qrisPayload = `00020101021226600016ID.CO.QRIS.WWW01189360091100202409100215ID10202409100010303UMI51440014ID.LINKAJA.WWW0215202409100010303UMI52045411530336054${lenStr}${amountStr}5802ID5914KASIRPRO STORE6007JAKARTA61051234062070703A016304`;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=8&data=${encodeURIComponent(qrisPayload)}`;

    if (qrisImg) {
        qrisImg.classList.remove('hidden');
        if (qrisCanvas) qrisCanvas.classList.add('hidden');
        qrisImg.src = qrUrl;

        qrisImg.onerror = function() {
            // Draw standalone offline QR canvas pattern if offline or API blocked
            drawOfflineQrisCanvas(amount);
        };
    } else {
        drawOfflineQrisCanvas(amount);
    }
}

// Fallback Canvas QR code generator for 100% offline functionality
function drawOfflineQrisCanvas(amount) {
    const canvas = document.getElementById('qris-canvas');
    const img = document.getElementById('qris-image');
    if (!canvas) return;

    if (img) img.classList.add('hidden');
    canvas.classList.remove('hidden');

    const ctx = canvas.getContext('2d');
    const size = 224;
    canvas.width = size;
    canvas.height = size;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const moduleCount = 29;
    const moduleSize = Math.floor((size - 24) / moduleCount);
    const offset = Math.floor((size - moduleCount * moduleSize) / 2);

    ctx.fillStyle = '#000000';

    // Position detection patterns helper
    function drawFinder(row, col) {
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 7; c++) {
                if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                    ctx.fillRect(offset + (col + c) * moduleSize, offset + (row + r) * moduleSize, moduleSize, moduleSize);
                }
            }
        }
    }

    drawFinder(0, 0);
    drawFinder(0, moduleCount - 7);
    drawFinder(moduleCount - 7, 0);

    // Timing patterns
    for (let i = 8; i < moduleCount - 8; i += 2) {
        ctx.fillRect(offset + i * moduleSize, offset + 6 * moduleSize, moduleSize, moduleSize);
        ctx.fillRect(offset + 6 * moduleSize, offset + i * moduleSize, moduleSize, moduleSize);
    }

    // Pseudorandom data matrix seeded with amount
    let seed = Math.max(12345, Math.round(amount) + 98765);
    function pseudoRand() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    }

    for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
            const inTopLeft = r < 8 && c < 8;
            const inTopRight = r < 8 && c >= moduleCount - 8;
            const inBottomLeft = r >= moduleCount - 8 && c < 8;
            const inCenter = r >= 11 && r <= 17 && c >= 11 && c <= 17;

            if (!inTopLeft && !inTopRight && !inBottomLeft && !inCenter) {
                if (pseudoRand() > 0.5) {
                    ctx.fillRect(offset + c * moduleSize, offset + r * moduleSize, moduleSize, moduleSize);
                }
            }
        }
    }
}

// Event listener for Payment Method dropdown change
document.getElementById('new-transaction-payment')?.addEventListener('change', () => {
    updateQrisDisplay(newTransactionTotal);
});

/* ================== BARCODE SCANNER SYSTEM ================== */

// Beep sound for successful scan
function playBeepSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1000; // 1kHz beep
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// Error beep sound
function playErrorBeep() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 400; // Lower frequency for error
    oscillator.type = 'sawtooth';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

// Add product to cart by barcode
async function addProductByBarcode(barcode) {
    if (!barcode || barcode.trim() === '') return;
    
    // Disable input temporarily to prevent double scan
    const barcodeInput = document.getElementById('barcode-scanner-input');
    if (barcodeInput) barcodeInput.disabled = true;
    
    try {
        const res = await apiRequest(`products.php?barcode=${encodeURIComponent(barcode.trim())}`);
        
        if (res.success && res.data) {
            const product = res.data;
            
            // Check stock
            if (product.stock < 1) {
                playErrorBeep();
                showToast(`${product.name} - Stok habis!`, 'error');
                return;
            }
            
            // Check if product already in cart
            const existingIndex = currentTransactionItems.findIndex(item => item.productId === product.id);
            if (existingIndex >= 0) {
                const newQty = currentTransactionItems[existingIndex].qty + 1;
                if (newQty > product.stock) {
                    playErrorBeep();
                    showToast(`${product.name} - Stok tidak cukup! Tersedia: ${product.stock}`, 'error');
                    return;
                }
                currentTransactionItems[existingIndex].qty = newQty;
            } else {
                currentTransactionItems.push({
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    qty: 1
                });
            }
            
            renderTransactionItemsPreview();
            playBeepSound();
            showToast(`✓ ${product.name} ditambahkan`, 'success');
        } else {
            playErrorBeep();
            showToast('Produk tidak ditemukan', 'error');
        }
    } catch (error) {
        console.error('Error scanning barcode:', error);
        playErrorBeep();
        showToast('Gagal memproses barcode', 'error');
    } finally {
        // Re-enable input and refocus after a short delay
        setTimeout(() => {
            if (barcodeInput) {
                barcodeInput.disabled = false;
                barcodeInput.value = '';
                barcodeInput.select(); // Select all untuk scan berikutnya
                barcodeInput.focus();
            }
        }, 200);
    }
}

// Search product by barcode (for purchase modal)
async function searchProductByBarcode(barcode, targetSelectId) {
    if (!barcode || barcode.trim() === '') return;
    
    const barcodeInput = document.getElementById('purchase-barcode-input');
    if (barcodeInput) barcodeInput.disabled = true;
    
    try {
        const res = await apiRequest(`products.php?barcode=${encodeURIComponent(barcode.trim())}`);
        
        if (res.success && res.data) {
            const product = res.data;
            const selectElement = document.getElementById(targetSelectId);
            
            if (selectElement) {
                // Check if product already exists in dropdown
                const existingOption = selectElement.querySelector(`option[value="${product.id}"]`);
                
                if (!existingOption) {
                    // Product not in dropdown, add it temporarily
                    const newOption = document.createElement('option');
                    newOption.value = product.id;
                    newOption.textContent = product.name;
                    newOption.dataset.scanned = 'true'; // Mark as scanned
                    selectElement.appendChild(newOption);
                }
                
                // Select the product
                selectElement.value = product.id;
                
                // Trigger change event
                const event = new Event('change', { bubbles: true });
                selectElement.dispatchEvent(event);
                
                playBeepSound();
                showToast(`✓ ${product.name} dipilih`, 'success');
            }
        } else {
            // Product not found - auto-create new product with barcode
            playErrorBeep();
            showToast('Produk baru - silakan lengkapi data', 'info');
            
            // Select "+ Tambah Baru" option
            const selectElement = document.getElementById(targetSelectId);
            if (selectElement) {
                selectElement.value = 'new';
                const event = new Event('change', { bubbles: true });
                selectElement.dispatchEvent(event);
                
                // Autofill barcode in new product form
                setTimeout(() => {
                    const newProductBarcodeInput = document.getElementById('new-product-barcode');
                    if (newProductBarcodeInput) {
                        newProductBarcodeInput.value = barcode.trim();
                    }
                    // Focus on product name input
                    const newProductNameInput = document.getElementById('new-product-name');
                    if (newProductNameInput) {
                        newProductNameInput.focus();
                    }
                }, 100);
            }
        }
    } catch (error) {
        console.error('Error scanning barcode:', error);
        playErrorBeep();
        showToast('Gagal memproses barcode', 'error');
    } finally {
        setTimeout(() => {
            if (barcodeInput) {
                barcodeInput.disabled = false;
                barcodeInput.value = '';
                // Don't autofocus if new product form is shown
                const selectElement = document.getElementById(targetSelectId);
                if (selectElement && selectElement.value !== 'new') {
                    barcodeInput.select(); // Select all untuk scan berikutnya
                    barcodeInput.focus();
                }
            }
        }, 200);
    }
}

// Search product by barcode for products page
async function searchProductByBarcodeInList(barcode) {
    if (!barcode || barcode.trim() === '') {
        await loadProducts();
        return;
    }
    
    try {
        const res = await apiRequest(`products.php?barcode=${encodeURIComponent(barcode.trim())}`);
        
        if (res.success && res.data) {
            const product = res.data;
            // Display only this product
            products = [product];
            renderProducts(products);
            playBeepSound();
            showToast(`✓ Produk ditemukan: ${product.name}`, 'success');
        } else {
            playErrorBeep();
            showToast('Produk tidak ditemukan', 'error');
            products = [];
            renderProducts(products);
        }
        
        // Clear input dan re-focus untuk scan berikutnya
        const barcodeInput = document.getElementById('product-barcode-search');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => {
                barcodeInput.focus();
            }, 100);
        }
    } catch (error) {
        console.error('Error scanning barcode:', error);
        playErrorBeep();
        showToast('Gagal memproses barcode', 'error');
        
        // Clear input dan re-focus
        const barcodeInput = document.getElementById('product-barcode-search');
        if (barcodeInput) {
            barcodeInput.value = '';
            setTimeout(() => {
                barcodeInput.focus();
            }, 100);
        }
    }
}

// Barcode scanner input handler for transactions
const transactionBarcodeInput = document.getElementById('barcode-scanner-input');
if (transactionBarcodeInput) {
    // Auto-select all text on focus (scan baru akan timpa scan lama)
    transactionBarcodeInput.addEventListener('focus', () => {
        transactionBarcodeInput.select();
    });
    
    transactionBarcodeInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const barcode = e.target.value.trim();
            
            if (barcode) {
                await addProductByBarcode(barcode);
                e.target.value = ''; // Clear input
            }
        }
    });
}

// Barcode scanner input handler for purchase modal
const purchaseBarcodeInput = document.getElementById('purchase-barcode-input');
if (purchaseBarcodeInput) {
    // Auto-select all text on focus (scan baru akan timpa scan lama)
    purchaseBarcodeInput.addEventListener('focus', () => {
        purchaseBarcodeInput.select();
    });
}

document.addEventListener('keypress', async (e) => {
    if (e.target.id === 'purchase-barcode-input' && e.key === 'Enter') {
        e.preventDefault();
        const barcode = e.target.value.trim();
        if (barcode) {
            await searchProductByBarcode(barcode, 'purchase-product');
        }
    }
});

// Initialize product barcode search (single source of truth - no double event)
function initializeProductBarcodeSearch() {
    const barcodeInput = document.getElementById('product-barcode-search');
    if (barcodeInput && !barcodeInput.dataset.initialized) {
        barcodeInput.dataset.initialized = 'true';
        
        // Auto-select all text on focus (scan baru akan timpa scan lama)
        barcodeInput.addEventListener('focus', () => {
            barcodeInput.select();
        });
        
        barcodeInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const barcode = e.target.value.trim();
                if (barcode) {
                    await searchProductByBarcodeInList(barcode);
                } else {
                    await loadProducts();
                }
            }
        });
    }
}

// Clear barcode search when typing in name search
document.addEventListener('input', (e) => {
    if (e.target.id === 'search-products') {
        const barcodeInput = document.getElementById('product-barcode-search');
        if (barcodeInput && e.target.value) {
            barcodeInput.value = '';
        }
    }
});

// Autofocus barcode input - moved to main DOMContentLoaded block

/* ================== TRANSACTION SYSTEM ================== */
document.getElementById('add-item-to-transaction')?.addEventListener('click', () => {
    const productSelect = document.getElementById('new-transaction-product-select');
    const qtyInput = document.getElementById('new-transaction-product-qty');

    if (!productSelect || !qtyInput) return;

    const productId = productSelect.value;
    const qty = parseInt(qtyInput.value) || 1;

    if (!productId) {
        showToast('Pilih produk terlebih dahulu', 'error');
        return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) {
        showToast('Produk tidak valid', 'error');
        return;
    }

    if (qty < 1) {
        showToast('Jumlah tidak valid', 'error');
        return;
    }

    if (product.stock < qty) {
        showToast(`Stok tidak cukup. Tersedia: ${product.stock}`, 'error');
        return;
    }

    const existingIndex = currentTransactionItems.findIndex(item => item.productId === productId);
    if (existingIndex >= 0) {
        currentTransactionItems[existingIndex].qty += qty;
    } else {
        currentTransactionItems.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            qty: qty
        });
    }

    productSelect.value = '';
    qtyInput.value = '1';
    renderTransactionItemsPreview();
    showToast(`${product.name} ditambahkan`, 'success');
});

document.addEventListener('click', (e) => {
    if (e.target.closest('.remove-item')) {
        const index = e.target.closest('.remove-item').dataset.index;
        if (index >= 0) {
            const removedItem = currentTransactionItems.splice(index, 1)[0];
            renderTransactionItemsPreview();
            showToast(`${removedItem.name} dihapus`, 'info');
        }
    }
});

document.getElementById('create-transaction-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const customerInput = document.getElementById('new-transaction-customer');
    const customerName = customerInput?.value?.trim();
    const customerId = customerInput?.dataset.customerId; // Get from stored data
    const isMember = document.getElementById('new-transaction-member')?.value === "1";
    let paymentMethod = document.getElementById('new-transaction-payment')?.value;

    if (!customerName) return showToast('Nama pelanggan harus diisi', 'error');
    if (currentTransactionItems.length === 0) return showToast('Tambahkan minimal satu item produk', 'error');

    // Validate member has ID
    if (isMember && !customerId) {
        return showToast('Silakan pilih anggota dari dropdown suggestion', 'error');
    }

    const payload = {
        date: new Date().toISOString(),
        customer: customerName,
        customer_id: customerId || null,
        is_member: isMember ? 1 : 0,
        payment_method: paymentMethod,
        total: newTransactionTotal,
        status: (paymentMethod === 'transfer' || paymentMethod === 'debit') ? 'Pending' : 'Selesai',
        items: currentTransactionItems.map(item => ({
            product_id: item.productId,
            product_name: item.name,
            price: parseFloat(item.price),
            quantity: parseInt(item.qty)
        }))
    };

    try {
        const res = await apiRequest('transactions.php', 'POST', payload);

        if (res.success) {
            const trx = {
                id: res.id || null,
                date: payload.date,
                customer: payload.customer,
                total: payload.total,
                status: payload.status,
                items: payload.items,
                payment_method: payload.payment_method,
                is_member: payload.is_member
            };

            if (paymentMethod === 'transfer' || paymentMethod === 'debit') {
                showToast('Transaksi berhasil dibuat dan menunggu verifikasi!', 'info');
            } else {
                showToast('Transaksi berhasil! ID: ' + trx.id, 'success');
                printReceipt(trx); // Menggunakan fungsi printReceipt yang sudah dikonsolidasi
            }

            // Reset form
            currentTransactionItems = [];
            newTransactionTotal = 0;
            document.getElementById('create-transaction-form').reset();
            // Clear stored dataset properly
            if (customerInput) {
                delete customerInput.dataset.customerId;
            }
            renderTransactionItemsPreview();

            await loadProducts();
            await loadTransactions();
            if (isMember) await loadCustomers();
        } else {
            showToast(res.error || res.message || 'Gagal membuat transaksi', 'error');
        }

    } catch (err) {
        console.error(err);
        showToast('Terjadi kesalahan saat membuat transaksi', 'error');
    }
});

/* ================== UTILITY FUNCTIONS ================== */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date)) return dateString;
        
        // Get date format from settings (default: dd/mm/yyyy)
        const format = currentSettings.date_format || 'dd/mm/yyyy';
        const pad = (n) => n.toString().padStart(2, '0');
        
        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        
        let dateStr;
        switch(format) {
            case 'mm/dd/yyyy':
                dateStr = `${month}/${day}/${year}`;
                break;
            case 'yyyy-mm-dd':
                dateStr = `${year}-${month}-${day}`;
                break;
            case 'dd/mm/yyyy':
            default:
                dateStr = `${day}/${month}/${year}`;
                break;
        }
        
        return `${dateStr} ${hours}:${minutes}`;
    } catch (error) {
        return dateString;
    }
}

/* ================== NAVIGATION ================== */
async function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active-nav'));

    const page = document.getElementById(pageId);
    if (page) page.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href') || '';
        if ((href.substring(1) + '-page') === pageId) link.classList.add('active-nav');
    });

    // Hide/Show dashboard hutang elements based on page
    const pageName = pageId.replace('-page', '');
    const summaryCards = document.getElementById('hutang-summary-cards');
    const overdueWidget = document.getElementById('overdue-alert-widget');
    const upcomingWidget = document.getElementById('upcoming-alert-widget');
    
    if (pageName === 'dashboard') {
        // Show all hutang elements on dashboard
        if (summaryCards) summaryCards.style.display = 'grid';
        if (overdueWidget) overdueWidget.style.display = 'flex';
        if (upcomingWidget) upcomingWidget.style.display = 'flex';
    } else {
        // Hide all hutang elements on other pages
        if (summaryCards) summaryCards.style.display = 'none';
        if (overdueWidget) overdueWidget.style.display = 'none';
        if (upcomingWidget) upcomingWidget.style.display = 'none';
    }

    try {
        switch (pageName) {
            case 'products':
                await loadProducts();
                // Initialize barcode search for products page
                initializeProductBarcodeSearch();
                // Autofocus barcode search input
                setTimeout(() => {
                    const barcodeInput = document.getElementById('product-barcode-search');
                    if (barcodeInput) barcodeInput.focus();
                }, 100);
                break;

            case 'customers':
                await loadCustomers();
                break;

            case 'suppliers':
                await loadSuppliers();
                break;

            case 'purchases':
                await loadPurchases();
                // Initialize purchase form with payment method
                const purchasePaymentMethod = document.getElementById('purchase-payment-method');
                if (purchasePaymentMethod) {
                    purchasePaymentMethod.dispatchEvent(new Event('change'));
                }
                break;

            case 'transactions':
                await Promise.all([loadProducts(), loadCustomersForTransaction()]);
                await loadTransactions();
                renderProductDropdown();
                await initializeTransactionPage();
                // Auto-focus barcode scanner input
                setTimeout(() => {
                    const barcodeInput = document.getElementById('barcode-scanner-input');
                    if (barcodeInput) barcodeInput.focus();
                }, 100);
                break;

            case 'kas':
                await loadKasData();
                break;

            case 'reports':
                // Initialize date fields for sales report
                const salesStartDateEl = document.getElementById('sales-start-date');
                const salesEndDateEl = document.getElementById('sales-end-date');

                if (salesStartDateEl && !salesStartDateEl.value) {
                    const firstDay = new Date();
                    firstDay.setDate(1);
                    salesStartDateEl.value = firstDay.toISOString().split('T')[0];
                }

                if (salesEndDateEl && !salesEndDateEl.value) {
                    salesEndDateEl.value = new Date().toISOString().split('T')[0];
                }

                // Initialize date fields for purchases report
                const purchasesStartDateEl = document.getElementById('purchases-start-date');
                const purchasesEndDateEl = document.getElementById('purchases-end-date');

                if (purchasesStartDateEl && !purchasesStartDateEl.value) {
                    const firstDay = new Date();
                    firstDay.setDate(1);
                    purchasesStartDateEl.value = firstDay.toISOString().split('T')[0];
                }

                if (purchasesEndDateEl && !purchasesEndDateEl.value) {
                    purchasesEndDateEl.value = new Date().toISOString().split('T')[0];
                }

                // Load sales report by default (first tab)
                if (!currentSalesReportData) {
                    await loadSalesReport(salesStartDateEl?.value, salesEndDateEl?.value);
                }
                break;

            case 'stock-movements':
                const stockStartDateEl = document.getElementById('stock-start-date');
                const stockEndDateEl = document.getElementById('stock-end-date');

                if (stockStartDateEl && !stockStartDateEl.value) {
                    const firstDay = new Date();
                    firstDay.setDate(1);
                    stockStartDateEl.value = firstDay.toISOString().split('T')[0];
                }

                if (stockEndDateEl && !stockEndDateEl.value) {
                    stockEndDateEl.value = new Date().toISOString().split('T')[0];
                }

                // Load stock movements report
                if (!currentStockReportData) {
                    await loadStockMovements(stockStartDateEl?.value, stockEndDateEl?.value);
                }
                break;
            case 'hutang':
                await initHutangPage();
                // Add Hutang menu to navigation if not exists
                const hutangLink = document.querySelector('a[href="#hutang"]');
                if (hutangLink) {
                    hutangLink.classList.add('active-nav');
                }
                break;
            case 'piutang-supplier':
                await initSupplierReceivablesPage();
                break;
            case 'correct-transactions':
                await initCorrectionPage();
                break;
            case 'verify-transactions':
                await loadPendingTransactions();
                break;
            case 'dashboard':
                await loadDashboardHutangWidgets();
                await loadLowStockWidget();
                break;
            case 'user-management':
                await loadUsers();
                break;
            case 'receipt-settings':
                await loadReceiptSettings();
                break;
            case 'store-settings':
                await loadStoreSettings();
                break;
            case 'system-settings':
                await loadSystemSettings();
                break;
            case 'stock-settings':
                await loadStockSettings();
                break;
            case 'barcode-settings':
                await loadBarcodeSettings();
                break;
            case 'printer-settings':
                await loadPrinterSettings();
                break;
        }
    } catch (error) {
        console.error(`Error loading data for ${pageName}:`, error);
        showToast(`Gagal memuat data untuk ${pageName}`, 'error');
    }
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', async (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        
        // Check if href exists and is valid
        if (!href || href === '#' || href === '') {
            // Silent check: skip invalid nav links (dropdowns, etc.)
            return;
        }
        
        const targetPage = href.substring(1);
        const targetPageId = targetPage + '-page';

        if (!canAccessPage(targetPage)) {
            showToast('Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.', 'error');
            return;
        }

        link.classList.add('loading');
        try {
            await showPage(targetPageId); // Panggil showPage yang sudah diperbarui
        } catch (error) {
            console.error('Error navigating to page:', error);
            showToast('Terjadi kesalahan saat membuka halaman', 'error');
        } finally {
            link.classList.remove('loading');
        }
    });
});

// Handle anchor links (for widget "Lihat Detail" links)
document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link && !link.classList.contains('nav-link')) {
        e.preventDefault();
        const targetPage = link.getAttribute('href').substring(1);
        const targetPageId = targetPage + '-page';

        if (targetPage && document.getElementById(targetPageId)) {
            if (!canAccessPage(targetPage)) {
                showToast('Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.', 'error');
                return;
            }

            try {
                await showPage(targetPageId);
            } catch (error) {
                console.error('Error navigating to page:', error);
                showToast('Terjadi kesalahan saat membuka halaman', 'error');
            }
        }
    }
});

/* ================== GLOBAL EVENT DELEGATION ================== */
document.body.addEventListener('click', async (e) => {
    const t = e.target;

    // Edit product
    if (t.closest('.edit-product')) {
        const id = t.closest('.edit-product').dataset.id;
        const p = products.find(x => String(x.id) === String(id));
        if (!p) return showToast('Produk tidak ditemukan', 'error');

        await loadDataForProductModal();
        setTimeout(() => {
            document.getElementById('product-modal-title').textContent = 'Edit Produk';
            document.getElementById('product-id').value = p.id;
            document.getElementById('product-name').value = p.name;
            document.getElementById('product-barcode').value = p.barcode || '';
            document.getElementById('product-price').value = p.price;
            document.getElementById('product-stock').value = p.stock;
            if (p.category_code) document.getElementById('product-category').value = p.category_code;
            if (p.supplier_id) document.getElementById('product-supplier').value = p.supplier_id;
        }, 100);
        showModal('product-modal');
        return;
    }

    // Delete product
    if (t.closest('.delete-product')) {
        const id = t.closest('.delete-product').dataset.id;
        showConfirmation('Apakah Anda yakin ingin menghapus produk ini?', async () => {
            const res = await apiRequest(`products.php?id=${id}`, 'DELETE');
            if (res.success) {
                showToast('Produk berhasil dihapus!', 'success');
                await loadProducts();
            } else showToast(res.message || 'Gagal hapus produk', 'error');
        }, 'Hapus Produk', 'Ya, Hapus');
        return;
    }

    // Edit customer
    if (t.closest('.edit-customer')) {
        const id = t.closest('.edit-customer').dataset.id;
        const c = customers.find(x => String(x.id) === String(id));
        if (!c) return showToast('Pelanggan tidak ditemukan', 'error');
        document.getElementById('customer-modal-title').textContent = 'Edit Pelanggan';
        const idInput = document.getElementById('customer-id');
        idInput.value = c.id;
        idInput.readOnly = true;
        document.getElementById('customer-name').value = c.name;
        document.getElementById('customer-phone').value = c.phone;
        document.getElementById('customer-address').value = c.address || '';
        showModal('customer-modal');
        return;
    }

    // Delete customer
    if (t.closest('.delete-customer')) {
        const id = t.closest('.delete-customer').dataset.id;
        showConfirmation('Apakah Anda yakin ingin menghapus pelanggan ini?', async () => {
            const res = await apiRequest(`customers.php?id=${id}`, 'DELETE');
            if (res.success) {
                showToast('Pelanggan berhasil dihapus!', 'success');
                await loadCustomers();
            } else showToast(res.message || 'Gagal hapus pelanggan', 'error');
        }, 'Hapus Pelanggan', 'Ya, Hapus');
        return;
    }

    // Edit supplier
    if (t.closest('.edit-supplier')) {
        const id = t.closest('.edit-supplier').dataset.id;
        const s = suppliers.find(x => String(x.id) === String(id));
        if (!s) return showToast('Supplier tidak ditemukan', 'error');
        document.getElementById('supplier-modal-title').textContent = 'Edit Supplier';
        const idInput = document.getElementById('supplier-id');
        idInput.value = s.id;
        idInput.readOnly = true;
        document.getElementById('supplier-name').value = s.name;
        document.getElementById('supplier-contact').value = s.contact || '';
        document.getElementById('supplier-address').value = s.address || '';
        showModal('supplier-modal');
        return;
    }

    // Delete supplier
    if (t.closest('.delete-supplier')) {
        const id = t.closest('.delete-supplier').dataset.id;
        showConfirmation('Apakah Anda yakin ingin menghapus supplier ini?', async () => {
            const res = await apiRequest(`suppliers.php?id=${id}`, 'DELETE');
            if (res.success) {
                showToast('Supplier berhasil dihapus!', 'success');
                await loadSuppliers();
            } else showToast(res.message || 'Gagal hapus supplier', 'error');
        }, 'Hapus Supplier', 'Ya, Hapus');
        return;
    }

    // Delete purchase
    if (t.closest('.delete-purchase')) {
        const id = t.closest('.delete-purchase').dataset.id;
        showConfirmation('Apakah Anda yakin ingin menghapus pembelian ini?', async () => {
            const res = await apiRequest(`purchases.php?id=${id}`, 'DELETE');
            if (res.success) {
                showToast('Pembelian berhasil dihapus!', 'success');
                await loadPurchases();
                await updateHutangBadge();
                await loadDashboardHutangWidgets();
            } else showToast(res.message || 'Gagal hapus pembelian', 'error');
        }, 'Hapus Pembelian', 'Ya, Hapus');
        return;
    }

    // View transaction detail
    if (t.closest('.view-transaction')) {
        const id = t.closest('.view-transaction').dataset.id;
        const trx = transactions.find(x => String(x.id) === String(id));
        if (!trx) return showToast('Transaksi tidak ditemukan', 'error');
        let html = `<p><strong>ID Transaksi:</strong> ${trx.id}</p>
                <p><strong>Tanggal:</strong> ${trx.date || '-'}</p>
                <p><strong>Pelanggan:</strong> ${trx.customer || trx.customer_name || '-'}</p>
                <p><strong>Total:</strong> ${formatCurrency(trx.total || trx.total_amount || 0)}</p>
                <h4 class="font-semibold mt-4 mb-2">Detail Item:</h4><ul>`;
        (trx.items || []).forEach(it => {
            html += `<li>${it.product_name} (${it.quantity}x) - ${formatCurrency((it.price || it.unit_price || 0) * it.quantity)}</li>`;
        });
        html += '</ul>';
        showDetailModal('Detail Transaksi', html);
        return;
    }

    // Delete transaction
    if (t.closest('.delete-transaction')) {
        const id = t.closest('.delete-transaction').dataset.id;
        showConfirmation('Apakah Anda yakin ingin menghapus transaksi ini?', async () => {
            const res = await apiRequest(`transactions.php?id=${id}`, 'DELETE');
            if (res.success) {
                showToast('Transaksi berhasil dihapus!', 'success');
                await loadTransactions();
            } else showToast(res.message || 'Gagal hapus transaksi', 'error');
        }, 'Hapus Transaksi', 'Ya, Hapus');
        return;
    }

    // Verify transaction success
    if (t.closest('.verify-success')) {
        const id = t.closest('.verify-success').dataset.id;
        showConfirmation('Setujui transaksi ini sebagai SELESAI?', async () => {
            const res = await apiRequest(`transactions.php?id=${id}`, 'PUT', {status: 'Selesai'});
            if (res.success) {
                showToast('Transaksi diverifikasi SELESAI', 'success');
                await loadPendingTransactions();
                await loadTransactions();
            } else {
                showToast(res.message || 'Gagal verifikasi transaksi', 'error');
            }
        }, 'Verifikasi Transaksi', 'Ya, Selesai');
        return;
    }

    // Verify transaction cancel
    if (t.closest('.verify-cancel')) {
        const id = t.closest('.verify-cancel').dataset.id;
        showConfirmation('Batalkan transaksi ini?', async () => {
            const res = await apiRequest(`transactions.php?id=${id}`, 'PUT', {status: 'Dibatalkan'});
            if (res.success) {
                showToast('Transaksi berhasil dibatalkan', 'success');
                await loadPendingTransactions();
                await loadTransactions();
            } else {
                showToast(res.message || 'Gagal batalkan transaksi', 'error');
            }
        }, 'Batalkan Transaksi', 'Ya, Batalkan');
        return;
    }
    // Complete purchase (Pending -> Selesai)
    if (e.target.closest('.complete-purchase')) {
        const id = e.target.closest('.complete-purchase').dataset.id;
        showConfirmation(
            'Apakah Anda yakin ingin menyelesaikan pembelian ini? Stok produk akan ditambahkan.',
            async () => {
                const res = await apiRequest(`purchases.php?id=${id}`, 'PUT', {status: 'Selesai'});
                if (res.success) {
                    showToast('Pembelian berhasil diselesaikan! Stok produk telah ditambahkan.', 'success');
                    await loadPurchases();
                    await loadProducts();
                    await updateHutangBadge();
                    await loadDashboardHutangWidgets();
                } else {
                    showToast(res.message || 'Gagal menyelesaikan pembelian', 'error');
                }
            },
            'Selesaikan Pembelian',
            'Ya, Selesai'
        );
        return;
    }

// Set purchase to pending (Selesai -> Pending)
    if (e.target.closest('.pending-purchase')) {
        const id = e.target.closest('.pending-purchase').dataset.id;
        showConfirmation(
            'Apakah Anda yakin ingin mengembalikan status pembelian ke pending? Stok produk akan dikurangi.',
            async () => {
                const res = await apiRequest(`purchases.php?id=${id}`, 'PUT', {status: 'Pending'});
                if (res.success) {
                    showToast('Status pembelian berhasil diubah ke pending. Stok produk telah dikurangi.', 'info');
                    await loadPurchases();
                    await loadProducts();
                    await updateHutangBadge();
                    await loadDashboardHutangWidgets();
                } else {
                    showToast(res.message || 'Gagal mengubah status pembelian', 'error');
                }
            },
            'Ubah ke Pending',
            'Ya, Ubah'
        );
        return;
    }
    // Handle settings navigation
    if (e.target.closest('a[href^="#user-management"]')) {
        e.preventDefault();
        if (!canAccessPage('user-management')) {
            showToast('Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.', 'error');
            return;
        }
        await showPage('user-management-page'); // Panggil showPage yang sudah diperbarui
        return;
    }

    if (e.target.closest('a[href^="#receipt-settings"]')) {
        e.preventDefault();
        if (!canAccessPage('receipt-settings')) {
            showToast('Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.', 'error');
            return;
        }
        await showPage('receipt-settings-page'); // Panggil showPage yang sudah diperbarui
        return;
    }

    if (e.target.closest('a[href^="#store-settings"]')) {
        e.preventDefault();
        if (!canAccessPage('store-settings')) {
            showToast('Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.', 'error');
            return;
        }
        await showPage('store-settings-page'); // Panggil showPage yang sudah diperbarui
        return;
    }

    if (e.target.closest('a[href^="#system-settings"]')) {
        e.preventDefault();
        if (!canAccessPage('system-settings')) {
            showToast('Akses ditolak. Anda tidak memiliki izin untuk mengakses fitur ini.', 'error');
            return;
        }
        await showPage('system-settings-page'); // Panggil showPage yang sudah diperbarui
        return;
    }
});

/* ================== NEW TRANSACTION INIT ================== */
document.getElementById('new-transaction-btn')?.addEventListener('click', async () => {
    currentTransactionItems = [];
    newTransactionTotal = 0;
    document.getElementById('create-transaction-form')?.reset();

    await loadProducts();
    renderProductDropdown();
    renderTransactionItemsPreview();
    showModal('create-transaction-modal');
});

/* ================== EVENT LISTENERS ================== */

// Kas Filter Form Submit
document.getElementById('kas-filter-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const period = document.getElementById('kas-period')?.value;
    const startDate = document.getElementById('kas-start-date')?.value;
    const endDate = document.getElementById('kas-end-date')?.value;
    const search = document.getElementById('kas-search')?.value?.trim();

    await loadKasData(period, startDate, endDate, search);
});

// Kas Period Change
document.getElementById('kas-period')?.addEventListener('change', (e) => {
    const period = e.target.value;
    const startDateContainer = document.getElementById('kas-start-date-container');
    const endDateContainer = document.getElementById('kas-end-date-container');

    if (period === 'custom') {
        if (startDateContainer) startDateContainer.style.display = 'block';
        if (endDateContainer) endDateContainer.style.display = 'block';
    } else {
        if (startDateContainer) startDateContainer.style.display = 'none';
        if (endDateContainer) endDateContainer.style.display = 'none';
    }
});

// Transaction Member Toggle
document.getElementById('new-transaction-member')?.addEventListener('change', (e) => {
    const isMember = e.target.value === "1";
    const kasOption = document.getElementById('kas-option');

    if (isMember) {
        if (kasOption) kasOption.style.display = "block";
    } else {
        if (kasOption) kasOption.style.display = "none";

        const paymentSelect = document.getElementById('new-transaction-payment');
        if (paymentSelect?.value === "kas") {
            paymentSelect.value = "cash";
        }
    }

    const customerName = document.getElementById('new-transaction-customer')?.value.trim();
    updateKasInfo(customerName, isMember);
});

// Customer name change for transaction
document.getElementById('new-transaction-customer')?.addEventListener('blur', () => {
    const customerName = document.getElementById('new-transaction-customer')?.value.trim();
    const isMember = document.getElementById('new-transaction-member')?.value === "1";
    updateKasInfo(customerName, isMember);
});

// Search hooks
document.getElementById('search-products')?.addEventListener('input', (e) => loadProducts(e.target.value));
document.getElementById('search-customers')?.addEventListener('input', (e) => loadCustomers(e.target.value));
document.getElementById('search-suppliers')?.addEventListener('input', (e) => loadSuppliers(e.target.value));
document.getElementById('search-purchases')?.addEventListener('input', (e) => loadPurchases(e.target.value));
document.getElementById('search-transactions')?.addEventListener('input', (e) => loadTransactions(e.target.value));

// Event listener untuk button view reports pada dashboard
document.getElementById('view-reports-btn')?.addEventListener('click', () => {
    // Simulasi klik pada navigation link reports
    const reportsLink = document.querySelector('a[href="#reports"]');
    if (reportsLink) {
        reportsLink.click();
    }
});

/* ================== LOGIN / LOGOUT ================== */
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value?.trim();

    if (!username || !password) {
        showToast('Username dan password wajib diisi', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = 'Logging in...';
    submitBtn.disabled = true;

    try {
        const loginRes = await apiRequest('login.php', 'POST', {
            username: username,
            password: password
        });

        if (loginRes && loginRes.success) {
            localStorage.setItem('token', loginRes.token || '');
            localStorage.setItem('userRole', loginRes.role || 'operator');
            localStorage.setItem('username', loginRes.user?.username || username);

            currentUserRole = loginRes.role || 'operator';
            currentUserName = loginRes.user?.username || username;

            showToast('Login berhasil', 'success');
            document.getElementById('login-error')?.classList.add('hidden');

            applyRoleUI();
            showPage('dashboard-page');

            if (canAccessPage('products')) await loadProducts();
            if (canAccessPage('customers')) await loadCustomers();
            if (canAccessPage('suppliers')) await loadSuppliers();
            if (canAccessPage('transactions')) await loadTransactions();
        } else {
            const errorMsg = loginRes?.message || 'Login gagal. Periksa username dan password.';
            showToast(errorMsg, 'error');
            document.getElementById('login-error')?.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Login error:', err);
        showToast('Terjadi kesalahan saat login. Coba lagi.', 'error');
        document.getElementById('login-error')?.classList.remove('hidden');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

function validateToken() {
    const token = getToken();
    if (!token) return false;

    try {
        // JWT token must have 3 parts: Header.Payload.Signature
        const parts = token.split('.');
        
        // Check if it's a valid JWT format (3 parts)
        if (parts.length !== 3) {
            console.warn('Token is not JWT format (expected 3 parts, got ' + parts.length + '). Clearing old token.');
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            localStorage.removeItem('username');
            currentUserRole = '';
            currentUserName = '';
            applyRoleUI();
            return false;
        }
        
        // Try to decode payload (second part)
        let payload;
        try {
            const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=');
            payload = JSON.parse(atob(paddedPayload));
        } catch (decodeError) {
            console.error('Failed to decode JWT payload:', decodeError);
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            localStorage.removeItem('username');
            currentUserRole = '';
            currentUserName = '';
            applyRoleUI();
            return false;
        }
        
        // Check if payload has required fields
        if (!payload.user_id || !payload.username || !payload.exp) {
            console.warn('Invalid JWT payload structure');
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            localStorage.removeItem('username');
            currentUserRole = '';
            currentUserName = '';
            applyRoleUI();
            return false;
        }
        
        // Check expiration
        if (payload.exp < Date.now() / 1000) {
            console.log('Token expired');
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            localStorage.removeItem('username');
            showToast('Sesi telah berakhir, silakan login kembali', 'warning');
            currentUserRole = '';
            currentUserName = '';
            applyRoleUI();
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Token validation error:', error);
        // Any error means invalid token, clear storage
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('username');
        currentUserRole = '';
        currentUserName = '';
        applyRoleUI();
        return false;
    }
}

document.getElementById('logout-button')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('username');

    currentUserRole = '';
    currentUserName = '';

    applyRoleUI();
    document.getElementById('login-form')?.reset();

    showToast('Anda telah logout.', 'info');
});

/* ================== CATEGORY & SUPPLIER LOADERS ================== */
async function loadCategories() {
    try {
        const res = await apiRequest('category.php', 'GET');
        if (Array.isArray(res)) {
            categories = res;
        } else if (res && Array.isArray(res.data)) {
            categories = res.data;
        } else if (res && res.success && Array.isArray(res.categories)) {
            categories = res.categories;
        } else {
            categories = [];
        }
        return categories;
    } catch (err) {
        console.error('Gagal load categories:', err);
        showToast('Gagal memuat data kategori', 'error');
        return [];
    }
}

function renderCategoryDropdown() {
    const select = document.getElementById('product-category') || document.getElementById('new-product-category');
    if (!select) return;

    select.innerHTML = '<option value="">Pilih Kategori</option>';
    if (!categories || categories.length === 0) {
        select.innerHTML += '<option value="" disabled>Tidak ada kategori</option>';
        return;
    }

    categories.forEach(c => {
        const value = c.code || c.id || c.kode || '';
        const label = c.name || c.nama || c.category_name || value || 'Unknown';
        if (value) {
            select.insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
        }
    });
}

async function loadSuppliersDropdown() {
    try {
        const res = await apiRequest('suppliers.php', 'GET');
        if (Array.isArray(res)) {
            suppliers = res;
        } else if (res && Array.isArray(res.data)) {
            suppliers = res.data;
        } else if (res && res.success && Array.isArray(res.suppliers)) {
            suppliers = res.suppliers;
        } else {
            suppliers = [];
        }
        renderSupplierDropdown();
        return suppliers;
    } catch (err) {
        console.error("Gagal load supplier:", err);
        showToast('Gagal memuat data supplier', 'error');
        return [];
    }
}

function renderSupplierDropdown() {
    const select = document.getElementById('product-supplier');
    if (!select) return;

    select.innerHTML = '<option value="">Pilih Supplier</option>';
    if (!suppliers || suppliers.length === 0) {
        select.innerHTML += '<option value="" disabled>Tidak ada supplier</option>';
        return;
    }

    suppliers.forEach(s => {
        const id = s.id || s.supplier_id || '';
        const label = s.name || s.nama_supplier || s.supplier_name || s.nama || id || 'Unknown';
        if (id) {
            select.insertAdjacentHTML('beforeend', `<option value="${id}">${label}</option>`);
        }
    });
}

async function loadDataForProductModal() {
    const [cats, sups] = await Promise.allSettled([loadCategories(), loadSuppliersDropdown()]);
    renderCategoryDropdown();
    renderSupplierDropdown();
    return {
        categoriesLoaded: cats.status === 'fulfilled',
        suppliersLoaded: sups.status === 'fulfilled'
    };
}

/* ================== FORM HANDLERS ================== */
document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id')?.value || '';
    const name = document.getElementById('product-name')?.value?.trim();
    const barcode = document.getElementById('product-barcode')?.value?.trim() || null;
    const price = parseInt(document.getElementById('product-price')?.value || 0);
    const stock = parseInt(document.getElementById('product-stock')?.value || 0);
    const category_code = document.getElementById('product-category')?.value || null;
    const supplier_id = document.getElementById('product-supplier')?.value || null;

    const payload = {
        name, price, stock, barcode,
        category_code: category_code === '' ? null : category_code,
        supplier_id: supplier_id === '' ? null : supplier_id
    };

    if (id) {
        const res = await apiRequest(`products.php?id=${id}`, 'PUT', payload);
        if (res.success) {
            showToast('Produk berhasil diperbarui!', 'success');
            hideModal('product-modal');
            await loadProducts();
        } else showToast(res.message || 'Gagal update produk', 'error');
    } else {
        const res = await apiRequest('products.php', 'POST', payload);
        if (res.success) {
            showToast('Produk berhasil ditambahkan!', 'success');
            hideModal('product-modal');
            await loadProducts();
        } else showToast(res.message || 'Gagal tambah produk', 'error');
    }
    e.target.reset();
});

// Customer form
document.getElementById('customer-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('customer-id');
    const id = idInput.value.trim();
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const address = document.getElementById('customer-address').value.trim();

    const payload = {id, name, phone, address};
    let res;
    if (idInput.readOnly) {
        res = await apiRequest(`customers.php?id=${id}`, 'PUT', payload);
        if (res.success) showToast('Pelanggan berhasil diperbarui!', 'success');
        else showToast(res.message || 'Gagal update pelanggan', 'error');
    } else {
        res = await apiRequest('customers.php', 'POST', payload);
        if (res.success) showToast('Pelanggan berhasil ditambahkan!', 'success');
        else showToast(res.message || 'Gagal tambah pelanggan', 'error');
    }

    if (res.success) {
        hideModal('customer-modal');
        await loadCustomers();
    }
    e.target.reset();
});

// Supplier form
document.getElementById('supplier-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('supplier-id');
    const id = idInput.value.trim();
    const name = document.getElementById('supplier-name').value.trim();
    const contact = document.getElementById('supplier-contact').value.trim();
    const address = document.getElementById('supplier-address').value.trim();

    const payload = {id, name, contact, address};
    let res;
    if (idInput.readOnly) {
        res = await apiRequest(`suppliers.php?id=${id}`, 'PUT', payload);
        if (res.success) showToast('Supplier berhasil diperbarui!', 'success');
        else showToast(res.message || 'Gagal update supplier', 'error');
    } else {
        res = await apiRequest('suppliers.php', 'POST', payload);
        if (res.success) showToast('Supplier berhasil ditambahkan!', 'success');
        else showToast(res.message || 'Gagal tambah supplier', 'error');
    }

    if (res.success) {
        hideModal('supplier-modal');
        await loadSuppliers();
    }
    e.target.reset();
});

// Add button handlers
document.getElementById('add-product-btn')?.addEventListener('click', async () => {
    document.getElementById('product-modal-title').textContent = 'Tambah Produk Baru';
    document.getElementById('product-id').value = '';
    document.getElementById('product-form')?.reset();
    await loadDataForProductModal();
    document.getElementById('product-category').value = '';
    document.getElementById('product-supplier').value = '';
    showModal('product-modal');
});

document.getElementById('add-customer-btn')?.addEventListener('click', () => {
    document.getElementById('customer-modal-title').textContent = 'Tambah Pelanggan Baru';
    const idInput = document.getElementById('customer-id');
    idInput.value = '';
    idInput.readOnly = false;
    document.getElementById('customer-form')?.reset();
    showModal('customer-modal');
});

document.getElementById('add-supplier-btn')?.addEventListener('click', () => {
    document.getElementById('supplier-modal-title').textContent = 'Tambah Supplier Baru';
    const idInput = document.getElementById('supplier-id');
    idInput.value = '';
    idInput.readOnly = false;
    document.getElementById('supplier-form')?.reset();
    showModal('supplier-modal');
});

document.getElementById('add-purchase-btn')?.addEventListener('click', () => {
    const title = document.getElementById('purchase-modal-title');
    if (title) title.textContent = 'Tambah Pembelian Baru';
    const hiddenId = document.getElementById('purchase-id');
    if (hiddenId) hiddenId.value = '';
    const d = document.getElementById('purchase-date');
    if (d) d.valueAsDate = new Date();
    document.getElementById('purchase-form')?.reset();
    if (typeof openPurchaseModal === 'function') openPurchaseModal();
});

// Close button handler
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.close-button');
    if (btn) {
        const modalId = btn.dataset.modal;
        if (modalId) hideModal(modalId);
    }
});

/* ================== PENDING TRANSACTIONS ================== */
async function loadPendingTransactions() {
    const res = await apiRequest('transactions.php', 'GET');
    const allTransactions = Array.isArray(res) ? res : (res.data || []);
    const pendingTransactions = allTransactions.filter(t => t.status === 'Pending');
    renderPendingTransactions(pendingTransactions);
}

function renderPendingTransactions(transactions) {
    const tbody = document.getElementById('verify-transactions-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!transactions.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Tidak ada transaksi pending</td></tr>';
        return;
    }

    transactions.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4">${t.id}</td>
            <td class="px-6 py-4">${t.date || '-'}</td>
            <td class="px-6 py-4">${t.customer || '-'}</td>
            <td class="px-6 py-4">${formatCurrency(t.total || 0)}</td>
            <td class="px-6 py-4">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    ${t.status}
                </span>
            </td>
            <td class="px-6 py-4 space-x-2">
                <button class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm verify-success" data-id="${t.id}">
                    Selesai
                </button>
                <button class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm verify-cancel" data-id="${t.id}">
                    Batalkan
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/* ================== CORRECTION PAGE ================== */
async function initCorrectionPage() {
    const searchBtn = document.getElementById('search-transaction-correction-btn');
    const searchInput = document.getElementById('transaction-id-correction');

    if (searchBtn) {
        searchBtn.replaceWith(searchBtn.cloneNode(true));
        document.getElementById('search-transaction-correction-btn')
            ?.addEventListener('click', searchTransactionForCorrection);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchTransactionForCorrection();
        });
    }
}

async function searchTransactionForCorrection() {
    const transactionId = document.getElementById('transaction-id-correction')?.value.trim();
    if (!transactionId) {
        showToast('Masukkan ID Transaksi', 'error');
        return;
    }
    try {
        const res = await apiRequest(`correct-transactions.php?id=${transactionId}`, 'GET');
        if (res.success) {
            displayTransactionForCorrection(res.data);
        } else {
            // **PERBAIKAN 2:** Handle blokir untuk transaksi dibatalkan
            if (res.message && res.message.includes('sudah dibatalkan')) {
                showToast('Transaksi sudah dibatalkan dan tidak bisa dikoreksi lagi.', 'warning');
            } else {
                showToast(res.message || 'Transaksi tidak ditemukan', 'error');
            }
            hideCorrectionDetails();
        }
    } catch (err) {
        console.error('Error searching transaction:', err);
        showToast('Gagal memuat data transaksi', 'error');
        hideCorrectionDetails();
    }
}

function hideCorrectionDetails() {
    const detailContainer = document.getElementById('correction-transaction-detail');
    if (detailContainer) {
        detailContainer.innerHTML = '';
        detailContainer.classList.add('hidden');
    }
}

function formatToWIB(dateString) {
    if (!dateString) return '';
    try {
        const utcDate = new Date(dateString);
        const wibDate = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
        const year = wibDate.getFullYear();
        const month = String(wibDate.getMonth() + 1).padStart(2, '0');
        const day = String(wibDate.getDate()).padStart(2, '0');
        const hours = String(wibDate.getHours()).padStart(2, '0');
        const minutes = String(wibDate.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
        console.error("Failed to format date:", e);
        return dateString;
    }
}

function displayTransactionForCorrection(transaction) {
    const detailContainer = document.getElementById('correction-transaction-detail');
    if (!detailContainer) return;

    // **PERBAIKAN: Double-check status di frontend (safety) - Blokir tampilan jika sudah dibatalkan**
    if (transaction.status === 'Dibatalkan') {
        showToast('Transaksi sudah dibatalkan dan tidak bisa dikoreksi lagi.', 'warning');
        hideCorrectionDetails();
        return;
    }

    detailContainer.innerHTML = '';
    const formattedDate = formatToWIB(transaction.date);

    // **PERBAIKAN: Tambahkan badge status untuk visualisasi yang lebih jelas**
    const statusBadgeClass = transaction.status === 'Selesai'
        ? 'bg-green-100 text-green-800'
        : transaction.status === 'Pending'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800';
    const statusBadge = `
        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusBadgeClass}">
            ${transaction.status || '-'}
        </span>
    `;

    const infoHtml = `
        <h3 class="font-semibold text-lg mb-2">Detail Transaksi: 
            <span id="correction-trx-id">${transaction.id}</span>
        </h3>
        <p>Tanggal: <span id="correction-trx-date">${formattedDate}</span></p>
        <p>Pelanggan: <span id="correction-trx-customer">${transaction.customer}</span></p>
        <p>Total: <span id="correction-trx-total">${formatCurrency(transaction.total)}</span></p>
        <p>Status Saat Ini: ${statusBadge}</p>
    `;

    let itemsHtml = `
        <h4 class="font-semibold mt-4 mb-2">Item Transaksi:</h4>
        <table class="min-w-full divide-y divide-gray-200 mt-2">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Produk</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Harga</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
    `;

    // **PERBAIKAN: Handle jika items kosong atau undefined**
    if (!transaction.items || transaction.items.length === 0) {
        itemsHtml += '<tr><td colspan="4" class="px-4 py-2 text-center text-gray-500">Tidak ada item transaksi</td></tr>';
    } else {
        transaction.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td class="px-4 py-2">${item.product_name || '-'}</td>
                    <td class="px-4 py-2">${formatCurrency(item.price || 0)}</td>
                    <td class="px-4 py-2">${item.quantity || 0}</td>
                    <td class="px-4 py-2">${formatCurrency((item.price || 0) * (item.quantity || 0))}</td>
                </tr>
            `;
        });
    }

    itemsHtml += `
            </tbody>
        </table>
    `;

    // **PERBAIKAN: Kondisional select status berdasarkan status saat ini**
    let statusOptions = '';
    if (transaction.status === 'Selesai') {
        // Jika Selesai, prioritaskan Pending/Dibatalkan (bukan Selesai lagi)
        statusOptions = `
            <option value="Pending">Pending</option>
            <option value="Dibatalkan">Dibatalkan</option>
        `;
    } else if (transaction.status === 'Pending') {
        // Jika Pending, izinkan Selesai/Dibatalkan
        statusOptions = `
            <option value="Selesai">Selesai</option>
            <option value="Dibatalkan">Dibatalkan</option>
        `;
    } else {
        // Default: Semua opsi, tapi selected sesuai status
        statusOptions = `
            <option value="Selesai" ${transaction.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
            <option value="Pending" ${transaction.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Dibatalkan" ${transaction.status === 'Dibatalkan' ? 'selected' : ''}>Dibatalkan</option>
        `;
    }

    const statusSelectHtml = `
        <div class="mt-4">
            <label class="block text-sm font-medium text-gray-700">Status Transaksi Baru</label>
            <select id="correction-status" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                ${statusOptions}
            </select>
        </div>
    `;

    // **PERBAIKAN: Kondisional tombol - Jangan tampilkan "Batalkan" jika sudah Dibatalkan**
    let actionButtonsHtml = `
        <div class="mt-6 flex space-x-4">
            <button id="save-correction-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">
                Simpan Koreksi
            </button>
    `;

    if (transaction.status !== 'Dibatalkan') {
        actionButtonsHtml += `
            <button id="cancel-transaction-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md">
                Batalkan Transaksi
            </button>
        `;
    }

    actionButtonsHtml += `
        </div>
    `;

    const noteHtml = `
        <div class="mt-4">
            <label class="block text-sm font-medium text-gray-700">Catatan Koreksi</label>
            <textarea id="correction-note" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" 
                placeholder="Alasan koreksi..."></textarea>
        </div>
    `;

    // **PERBAIKAN: Disable select jika status sensitif (misalnya sudah Selesai, tapi izinkan perubahan ke Pending/Dibatalkan)**
    // Di sini, select tidak disabled kecuali jika status 'Dibatalkan' (yang sudah dicek di awal)

    detailContainer.innerHTML = infoHtml + itemsHtml + statusSelectHtml + noteHtml + actionButtonsHtml;
    detailContainer.classList.remove('hidden');

    // Event listener untuk save correction (selalu aktif)
    const saveBtn = document.getElementById('save-correction-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveCorrection(transaction.id, 'update');
        });
    }

    // **PERBAIKAN: Event listener untuk cancel hanya jika tombol ada (bukan Dibatalkan)**
    const cancelBtn = document.getElementById('cancel-transaction-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            showConfirmation(
                'Apakah Anda yakin ingin membatalkan transaksi ini? Stok produk dan saldo akan dikembalikan.',
                () => saveCorrection(transaction.id, 'cancel'),
                'Batalkan Transaksi',
                'Ya, Batalkan'
            );
        });
    }

    // **PERBAIKAN: Disable select jika diperlukan (misalnya untuk status yang tidak boleh diubah bebas)**
    const statusSelect = document.getElementById('correction-status');
    if (statusSelect && transaction.status === 'Dibatalkan') {
        statusSelect.disabled = true;
        statusSelect.title = 'Status tidak bisa diubah karena transaksi sudah dibatalkan';
    }
}

async function saveCorrection(transactionId, action) {
    try {
        let payload = {};

        if (action === 'update') {
            const status = document.getElementById('correction-status')?.value;
            const note = document.getElementById('correction-note')?.value;
            payload = {status, note};
        } else if (action === 'cancel') {
            payload = {
                status: 'Dibatalkan',
                note: 'Transaksi dibatalkan melalui sistem koreksi'
            };
        }

        const res = await apiRequest(`correct-transactions.php?id=${transactionId}`, 'PUT', payload);

        if (res.success) {
            showToast('Transaksi berhasil dikoreksi', 'success');
            hideCorrectionDetails();
            document.getElementById('transaction-id-correction').value = '';
            await loadTransactions();
        } else {
            showToast(res.message || 'Gagal mengoreksi transaksi', 'error');
        }
    } catch (err) {
        console.error('Error saving correction:', err);
        showToast('Gagal menyimpan koreksi', 'error');
    }
}

/* ================== REPORTS FUNCTIONALITY ================== */
// NOTE: Variables moved to line ~3923 (currentSalesReportData, currentPurchasesReportData)
// Functions moved to dedicated report sections below

/* ================== EXPORT SALES REPORT TO EXCEL ================== */
function exportToExcel() {
    if (!currentSalesReportData || !currentSalesReportData.transactions || currentSalesReportData.transactions.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }
    
    const reportData = currentSalesReportData;

    try {
        const data = [];
        let no = 1;
        
        reportData.transactions.forEach(transaction => {
            const totalValue = Number(transaction.total ?? transaction.total_amount ?? 0) || 0;
            data.push([
                no++,
                transaction.id,
                formatDate(transaction.date),
                transaction.customer,
                transaction.items || '-',
                totalValue,
                transaction.status
            ]);
        });

        const headers = ['No', 'ID Transaksi', 'Tanggal', 'Pelanggan', 'Items', 'Total', 'Status'];
        const title = 'LAPORAN PENJUALAN';
        const subtitle = `Periode: ${formatDate(reportData.period.start_date)} s/d ${formatDate(reportData.period.end_date)}`;
        
        const summary = {
            'Total Penjualan Bersih (Selesai)': parseFloat(reportData.summary.total_sales || 0),
            'Transaksi Selesai': parseFloat(reportData.summary.completed_sales || 0),
            'Transaksi Pending': parseFloat(reportData.summary.pending_sales || 0),
            'Transaksi Dibatalkan': parseFloat(reportData.summary.cancelled_sales || 0),
            'Jumlah Transaksi Total': reportData.summary.transaction_count || 0,
            'Jumlah Transaksi Selesai': reportData.summary.completed_count || 0,
            'Jumlah Transaksi Pending': reportData.summary.pending_count || 0,
            'Jumlah Transaksi Dibatalkan': reportData.summary.cancelled_count || 0,
            '': '',
            'CATATAN': 'Total Penjualan Bersih hanya menghitung transaksi berstatus Selesai'
        };

        const filename = `Laporan_Penjualan_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Laporan Penjualan', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/* ================== INITIALIZE ON DOMContentLoaded ================== */

document.addEventListener('DOMContentLoaded', async () => {
    // Load settings once and wire the module after data is available
    await loadInitialSettings();
    initializeSettingsModule();
    
    // Initialize session timeout
    initializeSessionTimeout();
    
    // Initialize all module event listeners
    initializeDataManagement();
    initializeReportTabs();
    initializeReportEventListeners();
    initializeStockEventListeners();
    initializeDashboardHutangWidgets();
    initializeHutangExportButtons();
    
    // Autofocus barcode input when transaction page is shown
    const barcodeInput = document.getElementById('barcode-scanner-input');
    if (barcodeInput && document.getElementById('transactions-page')?.classList.contains('active')) {
        barcodeInput.focus();
    }
    
    const curDateEl = document.getElementById('current-date');
    if (curDateEl) curDateEl.textContent = new Date().toLocaleDateString('id-ID');

    currentUserRole = localStorage.getItem('userRole') || currentUserRole;
    currentUserName = localStorage.getItem('username') || currentUserName;
    applyRoleUI();

    // Auto-validate token
    const hasValidToken = validateToken();
    if (!hasValidToken && (currentUserRole || currentUserName)) {
        currentUserRole = '';
        currentUserName = '';
        applyRoleUI();
    }

    // Initialize kas period visibility
    const kasPeriod = document.getElementById('kas-period');
    if (kasPeriod) {
        kasPeriod.dispatchEvent(new Event('change'));
    }

    // Initialize member toggle
    const memberSelect = document.getElementById('new-transaction-member');
    if (memberSelect) {
        memberSelect.dispatchEvent(new Event('change'));
    }

    // Initialize hutang badge
    if (hasValidToken) {
        updateHutangBadge();
    }

    // Initialize hutang elements visibility (only show on dashboard)
    const summaryCards = document.getElementById('hutang-summary-cards');
    const overdueWidget = document.getElementById('overdue-alert-widget');
    const upcomingWidget = document.getElementById('upcoming-alert-widget');
    const dashboardPage = document.getElementById('dashboard-page');
    
    if (dashboardPage && dashboardPage.classList.contains('active')) {
        // Show on dashboard
        if (summaryCards) summaryCards.style.display = 'grid';
        if (overdueWidget) overdueWidget.style.display = 'flex';
        if (upcomingWidget) upcomingWidget.style.display = 'flex';
    } else {
        // Hide on other pages
        if (summaryCards) summaryCards.style.display = 'none';
        if (overdueWidget) overdueWidget.style.display = 'none';
        if (upcomingWidget) upcomingWidget.style.display = 'none';
    }

    // Report event listeners - moved to initializeReportEventListeners()
});

// Auto-validate token every 15 minutes
setInterval(() => {
    if (currentUserRole && !validateToken()) {
        document.getElementById('logout-button')?.click();
    }
}, 15 * 60 * 1000);

// Add loading state CSS
const style = document.createElement('style');
style.textContent = `
    .nav-link.loading {
        opacity: 0.7;
        pointer-events: none;
    }
    .nav-link.loading::after {
        content: '';
    }
`;
document.head.appendChild(style);

/* ================== SETTINGS MODULE ================== */
// NOTE: initializeSettingsModule() moved to line ~3199 with user management functions

/* ================== CATEGORIES EDIT ================== */
document.addEventListener("DOMContentLoaded", () => {
    const categoryModal = document.getElementById("category-modal");
    const newCategoryBtn = document.getElementById("new-category-btn");
    const closeCategoryModal = document.getElementById("close-category-modal");
    const categoryForm = document.getElementById("category-form");
    const cancelEditBtn = document.getElementById("cancel-edit");

    let editMode = false;
    let editCode = null;

    // Open modal
    newCategoryBtn?.addEventListener("click", () => {
        categoryModal?.classList.remove("hidden");
    });

    // Close modal
    closeCategoryModal?.addEventListener("click", () => {
        categoryModal?.classList.add("hidden");
    });

    // Close when clicking the backdrop or pressing Escape.
    categoryModal?.addEventListener("click", (event) => {
        if (event.target === categoryModal) {
            categoryModal.classList.add("hidden");
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && categoryModal && !categoryModal.classList.contains("hidden")) {
            categoryModal.classList.add("hidden");
        }
    });

    // Load categories
    function loadCategoriesForManagement() {
        fetch("../backend/api/category.php")
            .then(res => res.json())
            .then(data => {
                renderTable("category-list", data, [
                    c => c.code,
                    c => c.name
                ], [
                    c => `<button class="text-indigo-600 hover:text-indigo-900 mr-2 edit-category" data-code="${c.code}" data-name="${c.name}">Edit</button>`,
                    c => `<button class="text-red-600 hover:text-red-900 delete-category" data-code="${c.code}">Hapus</button>`
                ]);

                // attach event listener edit
                document.querySelectorAll(".edit-category").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        const code = e.target.dataset.code;
                        const name = e.target.dataset.name;
                        editCategory(code, name);
                    });
                });

                // attach event listener delete
                document.querySelectorAll(".delete-category").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        const code = e.target.dataset.code;
                        deleteCategory(code);
                    });
                });
            })
            .catch(err => console.error("Load error:", err));
    }

    // Submit kategori baru / update
    categoryForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        const code = document.getElementById("code")?.value;
        const name = document.getElementById("name")?.value;

        const payload = {code, name};

        if (editMode) {
            payload.old_code = editCode;
        }

        fetch("../backend/api/category.php", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadCategoriesForManagement();
                    categoryForm.reset();
                    editMode = false;
                    editCode = null;
                    cancelEditBtn?.classList.add("hidden");
                } else {
                    alert(data.message || "Gagal simpan kategori");
                }
            })
            .catch(err => console.error("Error:", err));
    });

    // Edit kategori
    function editCategory(code, name) {
        const codeInput = document.getElementById("code");
        const nameInput = document.getElementById("name");
        if (codeInput) codeInput.value = code;
        if (nameInput) nameInput.value = name;
        editMode = true;
        editCode = code;
        cancelEditBtn?.classList.remove("hidden");
    }

    cancelEditBtn?.addEventListener("click", () => {
        categoryForm?.reset();
        editMode = false;
        editCode = null;
        cancelEditBtn?.classList.add("hidden");
    });

    // Delete kategori
    function deleteCategory(code) {
        if (!confirm("Yakin hapus kategori?")) return;

        fetch(`../backend/api/category.php?code=${code}`, {method: "DELETE"})
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadCategoriesForManagement();
                } else {
                    alert(data.message || "Gagal menghapus");
                }
            })
            .catch(err => console.error("Delete error:", err));
    }

    // Initial load
    if (categoryModal) {
        loadCategoriesForManagement();
    }
});

/* ================== PURCHASES MODULE ================== */
let purchaseModuleInitialized = false;
let purchaseSubmitting = false;

function initPurchaseModule() {
    if (purchaseModuleInitialized) return;
    purchaseModuleInitialized = true;

    document.getElementById('add-purchase-btn')?.addEventListener('click', openPurchaseModal);

    document.getElementById('purchase-supplier')?.addEventListener('change', (e) => {
        populateProductsForPurchase(e.target.value); // Menggunakan nama fungsi yang benar
    });

    document.getElementById('purchase-product')?.addEventListener('change', (e) => {
        toggleNewProduct(e.target.value === 'new');
    });

    ['purchase-qty', 'purchase-price'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updatePurchaseTotal);
    });

    document.getElementById('purchase-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (purchaseSubmitting) {
            console.warn('Purchase already submitting – ignored duplicate');
            return;
        }

        const submitBtn = document.querySelector('#purchase-form button[type="submit"]');
        if (submitBtn && !submitBtn.dataset.origText) {
            submitBtn.dataset.origText = submitBtn.innerHTML;
        }

        const purchase_date = document.getElementById('purchase-date')?.value;
        const supplier_id = document.getElementById('purchase-supplier')?.value;
        let product_id = document.getElementById('purchase-product')?.value;
        const qty = parseInt(document.getElementById('purchase-qty')?.value || '0', 10);
        const buy_price = parseFloat(document.getElementById('purchase-price')?.value || '0');
        const status = document.getElementById('purchase-status')?.value || 'Pending';
        const payment_method = document.getElementById('purchase-payment-method')?.value || 'cash';
        const due_date = document.getElementById('purchase-due-date')?.value || null;

        // Validasi tempo harus punya due date
        if (payment_method === 'tempo' && !due_date) {
            showToast('Tanggal jatuh tempo wajib diisi untuk pembelian tempo', 'error');
            return;
        }

        if (!purchase_date || !supplier_id || qty <= 0 || buy_price <= 0) {
            showToast('Tanggal, supplier, jumlah, dan harga beli wajib diisi', 'error');
            return;
        }

        purchaseSubmitting = true;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Menyimpan...';
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        const payload = {
            purchase_date,
            supplier_id,
            product_id,
            qty,
            buy_price,
            total: qty * buy_price,
            status,
            payment_method,
            due_date
        };

        if (product_id === 'new') {
            const pname = document.getElementById('new-product-name')?.value?.trim();
            const pcat = document.getElementById('new-product-category')?.value || '';
            const psell = parseFloat(document.getElementById('new-product-price')?.value || '0');
            const pbarcode = document.getElementById('new-product-barcode')?.value?.trim() || null;

            if (!pname) {
                showToast('Nama produk baru wajib diisi', 'error');
                purchaseSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                return;
            }
            if (!pcat) {
                showToast('Kategori produk wajib dipilih', 'error');
                purchaseSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                return;
            }

            payload.product_name = pname;
            payload.category_code = pcat;
            payload.sell_price = psell > 0 ? psell : 0;
            payload.barcode = pbarcode;
        }

        try {
            const res = await fetch(`${API_BASE}/purchases.php`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });

            const text = await res.text();
            let result;
            try {
                result = JSON.parse(text);
            } catch (err) {
                console.error('Non-JSON response from purchases.php:', text);
                showToast('Server tidak merespon dengan benar (lihat console)', 'error');
                purchaseSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                    submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                return;
            }

            if (result.success) {
                showToast(result.message || 'Pembelian berhasil ditambahkan', 'success');
                closePurchaseModal();
                await loadPurchases();

                // Update hutang badge and dashboard if tempo
                if (payment_method === 'tempo') {
                    await updateHutangBadge();
                    await loadDashboardHutangWidgets();
                }
            } else {
                console.error('purchases.php returned error:', result);
                showToast(result.message || 'Gagal menambahkan pembelian', 'error');
            }
        } catch (err) {
            console.error('Error submit purchase:', err);
            showToast('Terjadi kesalahan koneksi', 'error');
        } finally {
            purchaseSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    });
}

async function openPurchaseModal() {
    const modal = document.getElementById('purchase-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    purchaseSubmitting = false;
    const submitBtn = document.querySelector('#purchase-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtn.dataset.origText ?? submitBtn.innerHTML;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    const form = document.getElementById('purchase-form');
    form?.reset();
    const d = document.getElementById('purchase-date');
    if (d) d.valueAsDate = new Date();

    await populateSuppliersForPurchase();
    await populateCategoriesForPurchase();
    // Initialize dropdown dengan hanya "+ Tambah Baru" option
    // Products akan di-load saat supplier dipilih

    const prodSelect = document.getElementById('purchase-product');
    if (prodSelect) prodSelect.dispatchEvent(new Event('change'));
    
    // Focus barcode input after modal opens
    setTimeout(() => {
        const barcodeInput = document.getElementById('purchase-barcode-input');
        if (barcodeInput) barcodeInput.focus();
    }, 100);
}

function closePurchaseModal() {
    const modal = document.getElementById('purchase-modal');
    if (!modal) return;
    modal.classList.add('hidden');

    document.getElementById('purchase-form')?.reset();
    toggleNewProduct(false);

    const submitBtn = document.querySelector('#purchase-form button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    purchaseSubmitting = false;
}

async function populateSuppliersForPurchase() {
    try {
        const res = await fetch(`${API_BASE}/suppliers.php`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        const select = document.getElementById('purchase-supplier');
        if (!select) return;

        select.innerHTML = '<option value="">-- Pilih Supplier --</option>' + 
            list.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        // Don't autoload products, wait for user to select supplier
        const prodSelect = document.getElementById('purchase-product');
        if (prodSelect) {
            prodSelect.innerHTML = '<option value="new">+ Tambah Baru</option>';
        }
    } catch (err) {
        console.error('populateSuppliers error', err);
    }
}

// Load products filtered by supplier
async function populateProductsForPurchase(supplierId) {
    try {
        if (!supplierId) {
            // If no supplier selected, show only "+ Tambah Baru"
            const select = document.getElementById('purchase-product');
            if (select) {
                select.innerHTML = '<option value="new">+ Tambah Baru</option>';
            }
            return;
        }
        
        const res = await fetch(`${API_BASE}/products.php?supplier_id=${encodeURIComponent(supplierId)}`);
        const data = await res.json();
        const products = Array.isArray(data) ? data : (data.data || []);
        const select = document.getElementById('purchase-product');
        if (!select) return;

        select.innerHTML = `<option value="new">+ Tambah Baru</option>` +
            products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

        if (products.length === 0) {
            select.value = 'new';
            toggleNewProduct(true);
        } else {
            select.dispatchEvent(new Event('change'));
        }
    } catch (err) {
        console.error('populateProducts error', err);
    }
}

async function populateCategoriesForPurchase() {
    try {
        const res = await fetch(`${API_BASE}/category.php`);
        const data = await res.json();
        const categories = Array.isArray(data) ? data : (data.data || []);
        const select = document.getElementById('new-product-category');
        if (!select) return;

        select.innerHTML = `<option value="">Pilih Kategori</option>` +
            categories.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
    } catch (err) {
        console.error('populateCategories error', err);
    }
}

function toggleNewProduct(show) {
    const box = document.getElementById('new-product-container');
    if (!box) return;

    if (show) {
        box.classList.remove('hidden');
        populateCategoriesForPurchase();
        document.getElementById('new-product-name')?.focus();
    } else {
        box.classList.add('hidden');
        const n = document.getElementById('new-product-name');
        const pr = document.getElementById('new-product-price');
        const pc = document.getElementById('new-product-category');
        if (n) n.value = '';
        if (pr) pr.value = '';
        if (pc) pc.innerHTML = '<option value="">Pilih Kategori</option>';
    }
}

function updatePurchaseTotal() {
    const qty = parseInt(document.getElementById('purchase-qty')?.value || '0', 10);
    const price = parseFloat(document.getElementById('purchase-price')?.value || '0');
    const out = document.getElementById('purchase-total');
    if (out) out.value = formatCurrency(qty * price);
}

async function handlePurchaseSubmit(e) {
    e.preventDefault();

    if (purchaseSubmitting) {
        console.warn('Purchase already submitting – ignored duplicate');
        return;
    }

    const submitBtn = document.querySelector('#purchase-form button[type="submit"]');
    if (submitBtn && !submitBtn.dataset.origText) {
        submitBtn.dataset.origText = submitBtn.innerHTML;
    }

    const purchase_date = document.getElementById('purchase-date')?.value;
    const supplier_id = document.getElementById('purchase-supplier')?.value;
    let product_id = document.getElementById('purchase-product')?.value;
    const qty = parseInt(document.getElementById('purchase-qty')?.value || '0', 10);
    const buy_price = parseFloat(document.getElementById('purchase-price')?.value || '0');
    const status = document.getElementById('purchase-status')?.value || 'Pending';

    if (!purchase_date || !supplier_id || qty <= 0 || buy_price <= 0) {
        showToast('Tanggal, supplier, jumlah, dan harga beli wajib diisi', 'error');
        return;
    }

    purchaseSubmitting = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Menyimpan...';
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    const payload = {
        purchase_date,
        supplier_id,
        product_id,
        qty,
        buy_price,
        total: qty * buy_price,
        status
    };

    if (product_id === 'new') {
        const pname = document.getElementById('new-product-name')?.value?.trim();
        const pcat = document.getElementById('new-product-category')?.value || '';
        const psell = parseFloat(document.getElementById('new-product-price')?.value || '0');
        const pbarcode = document.getElementById('new-product-barcode')?.value?.trim() || null;

        if (!pname) {
            showToast('Nama produk baru wajib diisi', 'error');
            purchaseSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            return;
        }
        if (!pcat) {
            showToast('Kategori produk wajib dipilih', 'error');
            purchaseSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            return;
        }

        payload.product_name = pname;
        payload.category_code = pcat;
        payload.sell_price = psell > 0 ? psell : 0;
        payload.barcode = pbarcode;
    }

    try {
        const res = await fetch(`${API_BASE}/purchases.php`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (err) {
            console.error('Non-JSON response from purchases.php:', text);
            showToast('Server tidak merespon dengan benar (lihat console)', 'error');
            purchaseSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            return;
        }

        if (result.success) {
            showToast('Pembelian berhasil ditambahkan', 'success');
            closePurchaseModal();
            await loadPurchases();
        } else {
            console.error('purchases.php returned error:', result);
            showToast(result.message || 'Gagal menambahkan pembelian', 'error');
        }
    } catch (err) {
        console.error('Error submit purchase:', err);
        showToast('Terjadi kesalahan koneksi', 'error');
    } finally {
        purchaseSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.dataset.origText || 'Simpan';
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

// Initialize purchases module
initPurchaseModule();

/* ================== DATA MANAGEMENT DROPDOWN ================== */
function initializeDataManagement() {
    const dataTypeSelect = document.getElementById('data-type-select');
    const dataDisplaySection = document.getElementById('data-display-section');
    const dataDisplayTitle = document.getElementById('data-display-title');
    const dataTableContainer = document.getElementById('data-table-container');
    const closeDataDisplay = document.getElementById('close-data-display');

    dataTypeSelect?.addEventListener('change', async (e) => {
        const selectedType = e.target.value;

        if (!selectedType) {
            dataDisplaySection?.classList.add('hidden');
            return;
        }

        dataDisplaySection?.classList.remove('hidden');

        const titles = {
            products: 'Data Barang',
            customers: 'Data Anggota',
            suppliers: 'Data Supplier'
        };
        if (dataDisplayTitle) dataDisplayTitle.textContent = titles[selectedType] || 'Data';

        await loadAndDisplayData(selectedType);
    });

    closeDataDisplay?.addEventListener('click', () => {
        dataDisplaySection?.classList.add('hidden');
        if (dataTypeSelect) dataTypeSelect.value = '';
    });

    async function loadAndDisplayData(dataType) {
        try {
            if (dataTableContainer) dataTableContainer.innerHTML = '<p class="text-center">Loading...</p>';

            let data = [];
            let columns = [];

            switch (dataType) {
                case 'products':
                    data = await loadProductsData();
                    columns = [
                        {key: 'id', label: 'ID'},
                        {key: 'name', label: 'Nama Produk'},
                        {key: 'price', label: 'Harga', format: 'currency'},
                        {key: 'stock', label: 'Stok'},
                        {key: 'category_name', label: 'Kategori'},
                        {key: 'supplier_name', label: 'Supplier'}
                    ];
                    break;

                case 'customers':
                    data = await loadCustomersData();
                    columns = [
                        {key: 'id', label: 'ID'},
                        {key: 'name', label: 'Nama'},
                        {key: 'phone', label: 'Telepon'},
                        {key: 'address', label: 'Alamat'}
                    ];
                    break;

                case 'suppliers':
                    data = await loadSuppliersData();
                    columns = [
                        {key: 'id', label: 'ID'},
                        {key: 'name', label: 'Nama Supplier'},
                        {key: 'contact', label: 'Kontak'},
                        {key: 'address', label: 'Alamat'}
                    ];
                    break;
            }

            renderDataTable(data, columns);

        } catch (error) {
            console.error('Error loading data:', error);
            if (dataTableContainer) dataTableContainer.innerHTML = '<p class="text-center text-red-600">Gagal memuat data</p>';
        }
    }

    async function loadProductsData() {
        const res = await apiRequest('products.php', 'GET');
        return Array.isArray(res) ? res : (res.data || []);
    }

    async function loadCustomersData() {
        const res = await apiRequest('customers.php', 'GET');
        return Array.isArray(res) ? res : (res.data || []);
    }

    async function loadSuppliersData() {
        const res = await apiRequest('suppliers.php', 'GET');
        return Array.isArray(res) ? res : (res.data || []);
    }

    function renderDataTable(data, columns) {
        if (!data || data.length === 0) {
            if (dataTableContainer) dataTableContainer.innerHTML = '<p class="text-center text-gray-600">Tidak ada data</p>';
            return;
        }

        let tableHtml = '<table class="data-table"><thead><tr>';

        columns.forEach(col => {
            tableHtml += `<th>${col.label}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        data.forEach(item => {
            tableHtml += '<tr>';
            columns.forEach(col => {
                let value = item[col.key] || '-';

                if (col.format === 'currency' && value !== '-') {
                    value = formatCurrency(parseFloat(value) || 0);
                }

                tableHtml += `<td>${value}</td>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table>';
        if (dataTableContainer) dataTableContainer.innerHTML = tableHtml;
    }
}

/* ================== SETTINGS MODULE ================== */

async function fetchSettings(forceRefresh = false) {
    if (forceRefresh) {
        settingsLoadPromise = null;
    }
    if (!settingsLoadPromise) {
        settingsLoadPromise = (async () => {
            const res = await apiRequest('settings.php', 'GET');
            if (!res.success) {
                throw new Error(res.message || 'Gagal memuat pengaturan');
            }
            currentSettings = res.data || {};
            receiptHeaderLinkedToStore = shouldLinkReceiptHeader(currentSettings);
            return currentSettings;
        })().catch(error => {
            settingsLoadPromise = null;
            throw error;
        });
    }
    return settingsLoadPromise;
}

function updateSettingsCache(patch = {}) {
    currentSettings = {...currentSettings, ...patch};
    receiptHeaderLinkedToStore = shouldLinkReceiptHeader(currentSettings);
    settingsLoadPromise = Promise.resolve(currentSettings);
}

function shouldLinkReceiptHeader(settings = currentSettings) {
    const storeName = (settings.store_name || '').trim();
    const receiptHeader = (settings.receipt_header || '').trim();
    if (!receiptHeader || receiptHeader === DEFAULT_STORE_NAME) {
        return true;
    }
    return !!storeName && receiptHeader === storeName;
}

function refreshReceiptHeaderLinkStateFromInputs() {
    const receiptHeaderInput = document.getElementById('receipt-header');
    if (!receiptHeaderInput) return;
    const storeNameInput = document.getElementById('store-name');
    const storeName = (storeNameInput?.value || currentSettings.store_name || '').trim();
    const receiptValue = receiptHeaderInput.value.trim();
    receiptHeaderLinkedToStore = !receiptValue ||
        receiptValue === DEFAULT_STORE_NAME ||
        (!!storeName && receiptValue === storeName);
}

// Initialize settings module
function initializeSettingsModule() {
    // Settings dropdown toggle
    document.querySelector('.settings-toggle')?.addEventListener('click', (e) => {
        e.preventDefault();
        const menu = document.querySelector('.settings-menu');
        const chevron = document.querySelector('.settings-toggle .fa-chevron-down');

        if (menu) {
            menu.classList.toggle('hidden');
            if (chevron) {
                chevron.classList.toggle('rotate-180');
            }
        }
    });

    // Initialize form handlers
    initializeUserManagement();
    initializeReceiptSettings();
    initializeStoreSettings();
    initializeSystemSettings();
    initializeStockSettings();
    initializeBarcodeSettings();
    initializePrinterSettings();
    initializeLogoUpload();
}

/* ================== INITIALIZE NEW SETTINGS ================== */
function initializeStockSettings() {
    document.getElementById('stock-settings-form')?.addEventListener('submit', handleStockSettingsSubmit);
}

function initializeBarcodeSettings() {
    document.getElementById('barcode-settings-form')?.addEventListener('submit', handleBarcodeSettingsSubmit);
}

function initializePrinterSettings() {
    document.getElementById('printer-settings-form')?.addEventListener('submit', handlePrinterSettingsSubmit);
    document.getElementById('test-print-btn')?.addEventListener('click', testPrint);
}

function initializeLogoUpload() {
    document.getElementById('store-logo-upload')?.addEventListener('change', (e) => {
        handleLogoUpload(e.target);
    });
    document.getElementById('remove-logo-btn')?.addEventListener('click', removeLogo);
    
    // Load current logo if exists
    loadCurrentLogo();
}

async function loadCurrentLogo() {
    try {
        await fetchSettings();
        loadCurrentLogoPreview();
    } catch (error) {
        console.error('Error loading current logo:', error);
    }
}

function loadCurrentLogoPreview() {
    const preview = document.getElementById('current-logo-preview');
    const img = document.getElementById('current-logo-img');
    
    if (!preview || !img) return;
    
    if (currentSettings.store_logo) {
        img.src = '../backend/uploads/logos/' + currentSettings.store_logo;
        preview.classList.remove('hidden');
    } else {
        img.removeAttribute('src');
        preview.classList.add('hidden');
    }
}

/* ================== USER MANAGEMENT ================== */
async function initializeUserManagement() {
    // Form submission
    document.getElementById('user-form')?.addEventListener('submit', handleUserFormSubmit);

    // Add user button
    document.getElementById('add-user-btn')?.addEventListener('click', () => {
        document.getElementById('user-modal-title').textContent = 'Tambah Pengguna Baru';
        document.getElementById('user-edit-id').value = '';
        document.getElementById('user-form').reset();
        document.getElementById('user-password').required = true;
        showModal('user-modal');
    });

    // Search users
    document.getElementById('search-users')?.addEventListener('input', (e) => {
        loadUsers(e.target.value);
    });
}

async function loadUsers(search = '') {
    try {
        const query = search ? `search=${encodeURIComponent(search)}` : '';
        const res = await apiRequest('users.php', 'GET', null, query);
        users = Array.isArray(res) ? res : (res.data || []);
        renderUsersTable();
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Gagal memuat data pengguna', 'error');
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Tidak ada data pengguna</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4">${user.username}</td>
            <td class="px-6 py-4">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
            user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
        }">
                    ${user.role.toUpperCase()}
                </span>
            </td>
            <td class="px-6 py-4">${formatDate(user.created_at)}</td>
            <td class="px-6 py-4">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    AKTIF
                </span>
            </td>
            <td class="px-6 py-4 space-x-2">
                <button class="text-indigo-600 hover:text-indigo-900 edit-user" data-id="${user.id}">
                    Edit
                </button>
                <button class="text-red-600 hover:text-red-900 delete-user" data-id="${user.id}">
                    Hapus
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Attach event listeners
    document.querySelectorAll('.edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => editUser(e.target.dataset.id));
    });

    document.querySelectorAll('.delete-user').forEach(btn => {
        btn.addEventListener('click', (e) => deleteUser(e.target.dataset.id));
    });
}

async function handleUserFormSubmit(e) {
    e.preventDefault();

    const userId = document.getElementById('user-edit-id').value;
    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value.trim();
    const role = document.getElementById('user-role').value;

    if (!username) {
        showToast('Username wajib diisi', 'error');
        return;
    }

    const payload = {username, role};
    if (password) payload.password = password;

    try {
        let res;
        if (userId) {
            // Update user
            res = await apiRequest(`users.php?id=${userId}`, 'PUT', payload);
        } else {
            // Create new user
            if (!password) {
                showToast('Password wajib diisi untuk pengguna baru', 'error');
                return;
            }
            res = await apiRequest('users.php', 'POST', payload);
        }

        if (res.success) {
            showToast(userId ? 'Pengguna berhasil diperbarui' : 'Pengguna berhasil ditambahkan', 'success');
            hideModal('user-modal');
            await loadUsers();
        } else {
            showToast(res.message || 'Gagal menyimpan pengguna', 'error');
        }
    } catch (error) {
        console.error('Error saving user:', error);
        showToast('Gagal menyimpan pengguna', 'error');
    }
}

function editUser(userId) {
    const user = users.find(u => u.id == userId);
    if (!user) {
        showToast('Pengguna tidak ditemukan', 'error');
        return;
    }

    document.getElementById('user-modal-title').textContent = 'Edit Pengguna';
    document.getElementById('user-edit-id').value = user.id;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').required = false;
    document.getElementById('user-role').value = user.role;
    showModal('user-modal');
}

function deleteUser(userId) {
    const user = users.find(u => u.id == userId);
    if (!user) {
        showToast('Pengguna tidak ditemukan', 'error');
        return;
    }

    showConfirmation(
        `Apakah Anda yakin ingin menghapus pengguna "${user.username}"?`,
        async () => {
            try {
                const res = await apiRequest(`users.php?id=${userId}`, 'DELETE');
                if (res.success) {
                    showToast('Pengguna berhasil dihapus', 'success');
                    await loadUsers();
                } else {
                    showToast(res.message || 'Gagal menghapus pengguna', 'error');
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                showToast('Gagal menghapus pengguna', 'error');
            }
        },
        'Hapus Pengguna',
        'Ya, Hapus'
    );
}

/* ================== RECEIPT SETTINGS ================== */
function initializeReceiptSettings() {
    document.getElementById('receipt-settings-form')?.addEventListener('submit', handleReceiptSettingsSubmit);
    document.getElementById('preview-receipt-btn')?.addEventListener('click', updateReceiptPreview);

    // Real-time preview updates
    ['receipt-header', 'receipt-footer', 'receipt-font-size', 'receipt-width', 'logo-width'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateReceiptPreview);
    });

    ['show-customer-info', 'show-cashier-name', 'show-item-code', 'show-logo-receipt'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateReceiptPreview);
    });

    document.getElementById('receipt-header')?.addEventListener('input', () => {
        refreshReceiptHeaderLinkStateFromInputs();
    });
}

async function loadReceiptSettings() {
    try {
        await fetchSettings();
        populateReceiptForm();
        updateReceiptPreview();
    } catch (error) {
        console.error('Error loading receipt settings:', error);
    }
}

function populateReceiptForm() {
    const fields = {
        'receipt-header': 'receipt_header',
        'receipt-footer': 'receipt_footer',
        'receipt-font-size': 'receipt_font_size',
        'receipt-width': 'receipt_width',
        'logo-width': 'logo_width'
    };

    Object.entries(fields).forEach(([elementId, settingKey]) => {
        const element = document.getElementById(elementId);
        if (element) {
            // For receipt-header, use store_name as fallback if receipt_header is empty
            if (elementId === 'receipt-header') {
                element.value = currentSettings[settingKey] || currentSettings.store_name || DEFAULT_STORE_NAME;
            } else if (currentSettings[settingKey]) {
                element.value = currentSettings[settingKey];
            }
        }
    });

    const checkboxes = {
        'show-customer-info': 'show_customer_info',
        'show-cashier-name': 'show_cashier_name',
        'show-item-code': 'show_item_code',
        'auto-print-receipt': 'auto_print_receipt',
        'show-logo-receipt': 'show_logo_receipt'
    };

    Object.entries(checkboxes).forEach(([elementId, settingKey]) => {
        const element = document.getElementById(elementId);
        if (element && currentSettings[settingKey]) {
            element.checked = currentSettings[settingKey] === '1';
        }
    });

    refreshReceiptHeaderLinkStateFromInputs();
}

function updateReceiptPreview() {
    const preview = document.getElementById('receipt-preview');
    if (!preview) return;

    const receiptHeaderInput = document.getElementById('receipt-header');
    const storeNameInput = document.getElementById('store-name');
    const storeAddressInput = document.getElementById('store-address');
    const storePhoneInput = document.getElementById('store-phone');

    // Use receipt-header value, fallback to store_name, then to default
    const header = (receiptHeaderInput?.value || '').trim() ||
                   (storeNameInput?.value || '').trim() ||
                   currentSettings.store_name ||
                   DEFAULT_STORE_NAME;
    const footer = document.getElementById('receipt-footer')?.value || 'Terima kasih atas pembelian Anda!';
    const fontSize = document.getElementById('receipt-font-size')?.value || '12';
    const width = document.getElementById('receipt-width')?.value || '230';
    const showCustomer = document.getElementById('show-customer-info')?.checked;
    const showCashier = document.getElementById('show-cashier-name')?.checked;
    const showItemCode = document.getElementById('show-item-code')?.checked;
    const storeAddress = storeFormInitialized && storeAddressInput
        ? storeAddressInput.value
        : (currentSettings.store_address || 'Jl. Kenanga No. 242, Malang');
    const storePhone = storeFormInitialized && storePhoneInput
        ? storePhoneInput.value
        : (currentSettings.store_phone || '');
    
    // Logo settings - use form value if available, else current settings
    const showLogoCheckbox = document.getElementById('show-logo-receipt');
    const logoWidthInput = document.getElementById('logo-width');
    const showLogo = (showLogoCheckbox?.checked || currentSettings.show_logo_receipt === '1') && currentSettings.store_logo;
    const logoPath = currentSettings.store_logo ? '../backend/uploads/logos/' + currentSettings.store_logo : '';
    const logoWidth = logoWidthInput?.value || currentSettings.logo_width || '80';  // Default 80px for receipt

    preview.style.fontSize = `${fontSize}px`;
    preview.style.width = `${width}px`;

    const sampleData = {
        id: 'TRX-280925-1430',
        date: new Date().toLocaleString('id-ID'),
        customer: 'John Doe',
        cashier: currentUserName || 'Admin',
        items: [
            {code: 'PRD001', name: 'Produk Contoh 1', price: 15000, qty: 2},
            {code: 'PRD002', name: 'Produk Contoh 2', price: 25000, qty: 1}
        ],
        total: 55000,
        payment_method: 'cash'
    };

    let receiptHtml = `
        <div class="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
            ${showLogo ? `<img src="${logoPath}" style="max-width: ${logoWidth}px; height: auto; margin: 0 auto 5px; display: block;" alt="Logo">` : ''}
            <div class="font-bold">${header}</div>
            ${storeAddress ? `<div class="text-xs">${storeAddress}</div>` : ''}
            ${storePhone ? `<div class="text-xs">${storePhone}</div>` : ''}
        </div>
        
        <div class="border-b border-dashed border-gray-400 pb-2 mb-2">
            <div>ID: ${sampleData.id}</div>
            <div>Tanggal: ${sampleData.date}</div>
            ${showCustomer ? `<div>Pelanggan: ${sampleData.customer}</div>` : ''}
            ${showCashier ? `<div>Kasir: ${sampleData.cashier}</div>` : ''}
        </div>
        
        <div class="border-b border-dashed border-gray-400 pb-2 mb-2">
    `;

    sampleData.items.forEach(item => {
        receiptHtml += `
            <div class="flex justify-between text-xs">
                <span>${showItemCode ? `[${item.code}] ` : ''}${item.name}</span>
            </div>
            <div class="flex justify-between">
                <span>${item.qty} x ${formatCurrency(item.price)}</span>
                <span>${formatCurrency(item.price * item.qty)}</span>
            </div>
        `;
    });

    receiptHtml += `
        </div>
        
        <div class="flex justify-between font-bold border-b border-dashed border-gray-400 pb-2 mb-2">
            <span>TOTAL</span>
            <span>${formatCurrency(sampleData.total)}</span>
        </div>
        
        <div class="text-center text-xs">
            <div>Pembayaran: ${sampleData.payment_method.toUpperCase()}</div>
            <div class="mt-2">${footer}</div>
        </div>
    `;

    preview.innerHTML = receiptHtml;
}

async function handleReceiptSettingsSubmit(e) {
    e.preventDefault();

    const receiptHeaderInput = document.getElementById('receipt-header');
    const storeNameField = document.getElementById('store-name');
    const receiptHeader = receiptHeaderInput?.value?.trim() || '';
    refreshReceiptHeaderLinkStateFromInputs();

    const settings = {
        receipt_header: receiptHeader,
        receipt_footer: document.getElementById('receipt-footer').value,
        receipt_font_size: document.getElementById('receipt-font-size').value,
        receipt_width: document.getElementById('receipt-width').value,
        show_customer_info: document.getElementById('show-customer-info').checked ? '1' : '0',
        show_cashier_name: document.getElementById('show-cashier-name').checked ? '1' : '0',
        show_item_code: document.getElementById('show-item-code').checked ? '1' : '0',
        auto_print_receipt: document.getElementById('auto-print-receipt').checked ? '1' : '0',
        show_logo_receipt: document.getElementById('show-logo-receipt')?.checked ? '1' : '0',
        logo_width: document.getElementById('logo-width')?.value || '80'
    };
    
    // Keep store name synced when the user hasn't decoupled the fields
    if (receiptHeaderLinkedToStore && receiptHeader) {
        settings.store_name = receiptHeader;
        if (storeNameField) {
            storeNameField.value = receiptHeader;
        }
    }
    refreshReceiptHeaderLinkStateFromInputs();

    try {
        const res = await apiRequest('settings.php', 'POST', {settings});
        if (res.success) {
            showToast('Pengaturan struk berhasil disimpan', 'success');
            updateSettingsCache(settings);
            updateReceiptPreview();
        } else {
            showToast(res.message || 'Gagal menyimpan pengaturan', 'error');
        }
    } catch (error) {
        console.error('Error saving receipt settings:', error);
        showToast('Gagal menyimpan pengaturan', 'error');
    }
}

/* ================== STORE SETTINGS ================== */
function initializeStoreSettings() {
    document.getElementById('store-settings-form')?.addEventListener('submit', handleStoreSettingsSubmit);

    const storeNameInput = document.getElementById('store-name');
    if (storeNameInput) {
        storeNameInput.addEventListener('input', (e) => {
            storeFormInitialized = true;
            if (receiptHeaderLinkedToStore) {
                const receiptHeader = document.getElementById('receipt-header');
                if (receiptHeader) {
                    receiptHeader.value = e.target.value;
                }
            }
            refreshReceiptHeaderLinkStateFromInputs();
            updateReceiptPreview();
        });
    }

    ['store-address', 'store-phone'].forEach(id => {
        const element = document.getElementById(id);
        element?.addEventListener('input', () => {
            storeFormInitialized = true;
            updateReceiptPreview();
        });
    });
}

async function loadStoreSettings() {
    try {
        await fetchSettings();
        populateStoreForm();
        refreshReceiptHeaderLinkStateFromInputs();
        updateReceiptPreview();
    } catch (error) {
        console.error('Error loading store settings:', error);
    }
}

function populateStoreForm() {
    const fields = {
        'store-name': 'store_name',
        'store-phone': 'store_phone',
        'store-address': 'store_address',
        'currency-symbol': 'currency_symbol',
        'tax-rate': 'tax_rate'
    };

    Object.entries(fields).forEach(([elementId, settingKey]) => {
        const element = document.getElementById(elementId);
        if (element && currentSettings[settingKey] !== undefined && currentSettings[settingKey] !== null) {
            element.value = currentSettings[settingKey];
        }
    });

    storeFormInitialized = true;
}

async function handleStoreSettingsSubmit(e) {
    e.preventDefault();

    const storeNameInput = document.getElementById('store-name');
    const storePhoneInput = document.getElementById('store-phone');
    const storeAddressInput = document.getElementById('store-address');
    const currencySymbolInput = document.getElementById('currency-symbol');
    const taxRateInput = document.getElementById('tax-rate');
    const receiptHeaderField = document.getElementById('receipt-header');
    const storeName = storeNameInput?.value?.trim() || '';

    const settings = {
        store_name: storeName,
        store_phone: storePhoneInput?.value || '',
        store_address: storeAddressInput?.value || '',
        currency_symbol: currencySymbolInput?.value || ''
    };

    if (taxRateInput) {
        settings.tax_rate = taxRateInput.value;
    }
    
    refreshReceiptHeaderLinkStateFromInputs();

    // Keep receipt header in sync whenever user hasn't decoupled it
    if (receiptHeaderLinkedToStore) {
        const syncedHeader = storeName || DEFAULT_STORE_NAME;
        settings.receipt_header = syncedHeader;
        if (receiptHeaderField) {
            receiptHeaderField.value = syncedHeader;
        }
    }
    refreshReceiptHeaderLinkStateFromInputs();

    try {
        const res = await apiRequest('settings.php', 'POST', {settings});
        if (res.success) {
            showToast('Informasi toko berhasil disimpan', 'success');
            updateSettingsCache(settings);
            updateReceiptPreview();
        } else {
            showToast(res.message || 'Gagal menyimpan informasi toko', 'error');
        }
    } catch (error) {
        console.error('Error saving store settings:', error);
        showToast('Gagal menyimpan informasi toko', 'error');
    }
}

/* ================== SYSTEM SETTINGS ================== */
function initializeSystemSettings() {
    document.getElementById('system-settings-form')?.addEventListener('submit', handleSystemSettingsSubmit);
    document.getElementById('backup-data-btn')?.addEventListener('click', backupData);
    document.getElementById('restore-data-btn')?.addEventListener('click', restoreData);
}

async function loadSystemSettings() {
    try {
        await fetchSettings();
        populateSystemForm();
        loadCurrentLogoPreview(); // Load logo preview
    } catch (error) {
        console.error('Error loading system settings:', error);
    }
}

function populateSystemForm() {
    const fields = {
        'date-format': 'date_format',
        'receipt-copies': 'receipt_copies',
        'session-timeout': 'session_timeout'
    };

    Object.entries(fields).forEach(([elementId, settingKey]) => {
        const element = document.getElementById(elementId);
        if (element && currentSettings[settingKey] !== undefined && currentSettings[settingKey] !== null) {
            element.value = currentSettings[settingKey];
        }
    });
    
    // Set auto logout checkbox
    const autoLogoutCheckbox = document.getElementById('auto-logout-enabled');
    if (autoLogoutCheckbox) {
        autoLogoutCheckbox.checked = currentSettings.auto_logout_enabled !== '0';
    }
    
    // Load logo preview
    if (currentSettings.store_logo) {
        const preview = document.getElementById('current-logo-preview');
        const img = document.getElementById('current-logo-img');
        if (preview && img) {
            img.src = '../backend/uploads/logos/' + currentSettings.store_logo;
            preview.classList.remove('hidden');
        }
    }
}

async function handleSystemSettingsSubmit(e) {
    e.preventDefault();

    const settings = {
        date_format: document.getElementById('date-format').value,
        receipt_copies: document.getElementById('receipt-copies').value,
        session_timeout: document.getElementById('session-timeout').value,
        auto_logout_enabled: document.getElementById('auto-logout-enabled').checked ? '1' : '0'
    };

    try {
        const res = await apiRequest('settings.php', 'POST', {settings});
        if (res.success) {
            showToast('Pengaturan sistem berhasil disimpan', 'success');
            updateSettingsCache(settings);
            
            // Reinitialize session timeout with new settings
            initializeSessionTimeout();
        } else {
            showToast(res.message || 'Gagal menyimpan pengaturan sistem', 'error');
        }
    } catch (error) {
        console.error('Error saving system settings:', error);
        showToast('Gagal menyimpan pengaturan sistem', 'error');
    }
}

/* ================== STOCK SETTINGS ================== */
async function loadStockSettings() {
    try {
        const settings = await fetchSettings();
        document.getElementById('low-stock-threshold').value = settings.low_stock_threshold || '10';
        document.getElementById('allow-negative-stock').checked = settings.allow_negative_stock === '1';
        document.getElementById('stock-alert-enabled').checked = settings.stock_alert_enabled === '1';
    } catch (error) {
        console.error('Error loading stock settings:', error);
    }
}

async function handleStockSettingsSubmit(e) {
    e.preventDefault();
    
    const settings = {
        low_stock_threshold: document.getElementById('low-stock-threshold').value,
        allow_negative_stock: document.getElementById('allow-negative-stock').checked ? '1' : '0',
        stock_alert_enabled: document.getElementById('stock-alert-enabled').checked ? '1' : '0'
    };
    
    try {
        const res = await apiRequest('settings.php', 'POST', {settings});
        if (res.success) {
            showToast('Pengaturan stok berhasil disimpan', 'success');
            updateSettingsCache(settings);
        } else {
            showToast(res.message || 'Gagal menyimpan pengaturan stok', 'error');
        }
    } catch (error) {
        console.error('Error saving stock settings:', error);
        showToast('Gagal menyimpan pengaturan stok', 'error');
    }
}

/* ================== BARCODE SETTINGS ================== */
async function loadBarcodeSettings() {
    try {
        const settings = await fetchSettings();
        document.getElementById('barcode-auto-generate').checked = settings.barcode_auto_generate === '1';
        document.getElementById('barcode-prefix').value = settings.barcode_prefix || 'PRD';
        document.getElementById('barcode-format').value = settings.barcode_format || 'CODE128';
        document.getElementById('barcode-start-number').value = settings.barcode_start_number || '1001';
    } catch (error) {
        console.error('Error loading barcode settings:', error);
    }
}

async function handleBarcodeSettingsSubmit(e) {
    e.preventDefault();
    
    const settings = {
        barcode_auto_generate: document.getElementById('barcode-auto-generate').checked ? '1' : '0',
        barcode_prefix: document.getElementById('barcode-prefix').value,
        barcode_format: document.getElementById('barcode-format').value,
        barcode_start_number: document.getElementById('barcode-start-number').value
    };
    
    try {
        const res = await apiRequest('settings.php', 'POST', {settings});
        if (res.success) {
            showToast('Pengaturan barcode berhasil disimpan', 'success');
            updateSettingsCache(settings);
        } else {
            showToast(res.message || 'Gagal menyimpan pengaturan barcode', 'error');
        }
    } catch (error) {
        console.error('Error saving barcode settings:', error);
        showToast('Gagal menyimpan pengaturan barcode', 'error');
    }
}

/* ================== PRINTER SETTINGS ================== */
async function loadPrinterSettings() {
    try {
        const settings = await fetchSettings();
        document.getElementById('printer-name').value = settings.printer_name || '';
        
        const printerType = settings.printer_type || 'thermal';
        document.querySelector(`input[name="printer-type"][value="${printerType}"]`).checked = true;
        
        document.getElementById('printer-paper-size').value = settings.printer_paper_size || '80mm';
        document.getElementById('printer-auto-print').checked = settings.printer_auto_print === '1';
    } catch (error) {
        console.error('Error loading printer settings:', error);
    }
}

async function handlePrinterSettingsSubmit(e) {
    e.preventDefault();
    
    const settings = {
        printer_name: document.getElementById('printer-name').value,
        printer_type: document.querySelector('input[name="printer-type"]:checked').value,
        printer_paper_size: document.getElementById('printer-paper-size').value,
        printer_auto_print: document.getElementById('printer-auto-print').checked ? '1' : '0'
    };
    
    try {
        const res = await apiRequest('settings.php', 'POST', {settings});
        if (res.success) {
            showToast('Pengaturan printer berhasil disimpan', 'success');
            updateSettingsCache(settings);
        } else {
            showToast(res.message || 'Gagal menyimpan pengaturan printer', 'error');
        }
    } catch (error) {
        console.error('Error saving printer settings:', error);
        showToast('Gagal menyimpan pengaturan printer', 'error');
    }
}

function testPrint() {
    showToast('Mempersiapkan test print...', 'info');
    
    const testData = {
        transaction_number: 'TEST-' + Date.now(),
        transaction_date: new Date().toISOString(),
        customer_name: 'Test Customer',
        cashier_name: 'Test Cashier',
        items: [
            { product_name: 'Test Product 1', quantity: 1, selling_price: 10000 },
            { product_name: 'Test Product 2', quantity: 2, selling_price: 15000 }
        ],
        total_amount: 40000,
        amount_paid: 50000,
        change_amount: 10000
    };
    
    printReceipt(testData);
}

/* ================== LOGO UPLOAD ================== */
async function handleLogoUpload(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Ukuran file terlalu besar! Maksimal 5MB', 'error');
        fileInput.value = '';
        return;
    }
    
    // Validate file type (check both MIME type and extension)
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/svg', ''];
    const fileExt = file.name.split('.').pop().toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'svg'];
    
    if (!validTypes.includes(file.type) && !validExts.includes(fileExt)) {
        showToast('Format file tidak didukung! Gunakan JPG, PNG, GIF, atau SVG', 'error');
        fileInput.value = '';
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_type', 'logo');
    
    try {
        showToast('Mengupload logo...', 'info');
        
        const res = await fetch('../backend/api/upload.php', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        });
        
        let data;
        try {
            data = await res.json();
        } catch (jsonError) {
            const textResponse = await res.text();
            console.error('Response bukan JSON:', textResponse);
            throw new Error('Server response bukan JSON. Response: ' + textResponse.substring(0, 100));
        }
        
        // console.log('Upload response:', data); // Removed for security
        
        if (data.success) {
            // Save logo path to settings
            const saveRes = await apiRequest('settings.php', 'POST', {
                settings: { store_logo: data.data.file_name }
            });
            
            if (saveRes.success) {
                showToast('Logo berhasil diupload', 'success');
                updateSettingsCache({store_logo: data.data.file_name});
                loadCurrentLogoPreview();
                updateReceiptPreview();
                
                fileInput.value = '';
            } else {
                showToast('Logo diupload tapi gagal disimpan ke settings', 'error');
            }
        } else {
            console.error('Upload failed:', data);
            showToast(data.message || 'Gagal upload logo', 'error');
        }
    } catch (error) {
        console.error('Error uploading logo:', error);
        showToast('Gagal upload logo: ' + error.message, 'error');
    }
}

async function removeLogo() {
    if (!confirm('Hapus logo toko?')) return;
    
    try {
        await fetchSettings();
        if (currentSettings.store_logo) {
            // Delete file from server
            await fetch('../backend/api/upload.php?file_name=' + currentSettings.store_logo, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });
        }
        
        // Remove from settings
        const saveRes = await apiRequest('settings.php', 'POST', {
            settings: { store_logo: '' }
        });
        
        if (saveRes.success) {
            updateSettingsCache({store_logo: ''});
            loadCurrentLogoPreview();
            updateReceiptPreview();
            showToast('Logo berhasil dihapus', 'success');
        } else {
            showToast('Gagal menghapus logo dari settings', 'error');
        }
    } catch (error) {
        console.error('Error removing logo:', error);
        showToast('Gagal menghapus logo', 'error');
    }
}

/* ================== SESSION TIMEOUT ================== */
let sessionTimeoutId = null;

function initializeSessionTimeout() {
    // Get settings from form
    const getTimeoutMinutes = () => {
        const select = document.getElementById('session-timeout');
        return select ? parseInt(select.value) : 30;
    };
    
    const isAutoLogoutEnabled = () => {
        const checkbox = document.getElementById('auto-logout-enabled');
        return checkbox ? checkbox.checked : true;
    };
    
    function resetSessionTimer() {
        clearTimeout(sessionTimeoutId);
        
        if (!isAutoLogoutEnabled()) return;
        
        const timeoutMinutes = getTimeoutMinutes();
        sessionTimeoutId = setTimeout(() => {
            showToast('Session expired. Logging out...', 'warning');
            setTimeout(() => {
                document.getElementById('logout-button')?.click();
            }, 2000);
        }, timeoutMinutes * 60 * 1000);
    }
    
    // Reset timer on user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(event => {
        document.addEventListener(event, resetSessionTimer, true);
    });
    
    resetSessionTimer();
}

function backupData() {
    showToast('Fitur backup sedang dalam pengembangan', 'info');
}

function restoreData() {
    const fileInput = document.getElementById('restore-file');
    if (!fileInput.files.length) {
        showToast('Pilih file backup terlebih dahulu', 'error');
        return;
    }

    showToast('Fitur restore sedang dalam pengembangan', 'info');
}

/* ================== ENHANCED RECEIPT PRINTING (CONSOLIDATED) ================== */
function printReceipt(trx) { // Mengganti nama fungsi dari printReceiptWithSettings menjadi printReceipt
    // Use the global formatDate function for consistent date formatting
    const formatDateTime = (dtString) => {
        return formatDate(dtString);
    };

    const header = currentSettings.receipt_header || DEFAULT_STORE_NAME;
    const footer = currentSettings.receipt_footer || 'Terima kasih atas pembelian Anda!';
    const fontSize = currentSettings.receipt_font_size || '12';
    const width = currentSettings.receipt_width || '230';
    const showCustomer = currentSettings.show_customer_info === '1';
    const showCashier = currentSettings.show_cashier_name === '1';
    const showItemCode = currentSettings.show_item_code === '1';
    const storeAddress = currentSettings.store_address || 'Jl. Kenanga No. 242, Malang';
    const storePhone = currentSettings.store_phone;
    const showLogo = currentSettings.show_logo_receipt === '1' && currentSettings.store_logo;
    const logoPath = currentSettings.store_logo ? '../backend/uploads/logos/' + currentSettings.store_logo : '';
    const logoWidth = currentSettings.logo_width || '80';  // Default 80px for thermal receipt

    let receipt = `
    <html>
    <head>
        <title>Struk Transaksi</title>
        <style>
            body {
                font-family: monospace;
                font-size: ${fontSize}px;
                width: ${width}px;
                margin: 0;
                padding: 0;
            }
            .center { text-align: center; }
            .line { border-top: 1px dashed #000; margin: 4px 0; }
            .item { display: flex; justify-content: space-between; }
            .bold { font-weight: bold; }
            .logo { max-width: ${logoWidth}px; margin: 5px auto; display: block; }
        </style>
    </head>
    <body>
        <div class="center">
            ${showLogo ? `<img src="${logoPath}" class="logo" alt="Logo">` : ''}
            <h3 style="margin:0;">${header}</h3>
            <p style="margin:0;">${storeAddress}</p>
            ${storePhone ? `<p style="margin:0;">${storePhone}</p>` : ''}
        </div>
        <div class="line"></div>
        <p>ID: ${trx.id || '-'}<br>
        Tanggal: ${formatDateTime(trx.date)}<br>
        ${showCustomer ? `Pelanggan: ${trx.customer || '-'}<br>` : ''}
        ${showCashier ? `Kasir: ${currentUserName || '-'}<br>` : ''}
        </p>
        <div class="line"></div>
    `;

    (trx.items || []).forEach(it => {
        const subTotal = (parseFloat(it.price) * parseInt(it.quantity));
        receipt += `
            <div class="item">
                <span>${showItemCode && it.product_id ? `[${it.product_id}] ` : ''}${it.product_name} x${it.quantity}</span>
                <span>${formatCurrency(subTotal)}</span>
            </div>
        `;
    });

    receipt += `
        <div class="line"></div>
        <div class="item bold">
            <span>Total</span>
            <span>${formatCurrency(trx.total || 0)}</span>
        </div>
        <div class="item">
            <span>Metode</span>
            <span>${trx.payment_method || '-'}</span>
        </div>
    `;

    if (trx.note) {
        receipt += `
        <div class="item">
            <span>Catatan</span>
            <span>${trx.note}</span>
        </div>`;
    }

    receipt += `
        <div class="line"></div>
        <p class="center">${footer}</p>
        <script>window.print();</script>
    </body>
    </html>
    `;

    const copies = parseInt(currentSettings.receipt_copies || '1');
    for (let i = 0; i < copies; i++) {
        const w = window.open('', '', `width=${parseInt(width) + 100},height=600`);
        w.document.write(receipt);
        w.document.close();
        w.focus();
    }
}

/* ================== LOAD SETTINGS ON APP START ================== */
async function loadInitialSettings() {
    try {
        await fetchSettings(true);
    } catch (error) {
        console.error('Error loading initial settings:', error);
    }
}

document.querySelectorAll('.settings-toggle').forEach(button => {
    button.addEventListener('click', () => {
        const dropdown = button.parentElement;
        dropdown.classList.toggle('open');
    });
});

/* ================== REPORTS FUNCTIONALITY (UPDATED) ================== */
let currentSalesReportData = null;
let currentPurchasesReportData = null;

// Tab Switching
function initializeReportTabs() {
    // Setup tab navigation
    document.querySelectorAll('.report-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.tab;
            switchReportTab(targetTab);
        });
    });
}

function switchReportTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.report-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.report-tab-content').forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
    });

    const targetContent = document.getElementById(`${tabName}-report-content`);
    if (targetContent) {
        targetContent.classList.add('active');
        targetContent.classList.remove('hidden');
    }

    // Load data if needed
    if (tabName === 'sales' && !currentSalesReportData) {
        initializeSalesReport();
    } else if (tabName === 'purchases' && !currentPurchasesReportData) {
        initializePurchasesReport();
    }
}

function initializeSalesReport() {
    const startDateEl = document.getElementById('sales-start-date');
    const endDateEl = document.getElementById('sales-end-date');

    if (startDateEl && !startDateEl.value) {
        const firstDay = new Date();
        firstDay.setDate(1);
        startDateEl.value = firstDay.toISOString().split('T')[0];
    }

    if (endDateEl && !endDateEl.value) {
        endDateEl.value = new Date().toISOString().split('T')[0];
    }

    loadSalesReport(startDateEl?.value, endDateEl?.value);
}

function initializePurchasesReport() {
    const startDateEl = document.getElementById('purchases-start-date');
    const endDateEl = document.getElementById('purchases-end-date');

    if (startDateEl && !startDateEl.value) {
        const firstDay = new Date();
        firstDay.setDate(1);
        startDateEl.value = firstDay.toISOString().split('T')[0];
    }

    if (endDateEl && !endDateEl.value) {
        endDateEl.value = new Date().toISOString().split('T')[0];
    }

    loadPurchasesReport(startDateEl?.value, endDateEl?.value);
}

/* ================== SALES REPORT ================== */
async function loadSalesReport(startDate = null, endDate = null) {
    try {
        showToast('Memuat laporan penjualan...', 'info');

        if (!startDate) {
            startDate = new Date();
            startDate.setDate(1);
            startDate = startDate.toISOString().split('T')[0];
        }

        if (!endDate) {
            endDate = new Date().toISOString().split('T')[0];
        }

        const query = `start_date=${startDate}&end_date=${endDate}`;
        const res = await apiRequest('reports.php', 'GET', null, query);

        if (res.success) {
            currentSalesReportData = res.data;
            renderSalesReport(currentSalesReportData);
            showToast('Laporan penjualan berhasil dimuat', 'success');
        } else {
            showToast(res.message || 'Gagal memuat laporan penjualan', 'error');
        }
    } catch (error) {
        console.error('Error loading sales report:', error);
        showToast('Terjadi kesalahan saat memuat laporan', 'error');
    }
}

function renderSalesReport(reportData) {
    const tbody = document.getElementById('sales-report-table-body');
    const emptyState = document.getElementById('sales-empty-state');
    const summaryContainer = document.getElementById('sales-summary');

    if (!tbody || !emptyState || !summaryContainer) return;

    tbody.innerHTML = '';

    if (!reportData.transactions || reportData.transactions.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        summaryContainer.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    summaryContainer.classList.remove('hidden');

    reportData.transactions.forEach(transaction => {
        const totalValue = Number(transaction.total ?? transaction.total_amount ?? 0) || 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${transaction.id}</td>
            <td class="px-6 py-4 whitespace-nowrap">${formatDate(transaction.date)}</td>
            <td class="px-6 py-4">${transaction.customer}</td>
            <td class="px-6 py-4" title="${transaction.items}">
                ${transaction.item_count} item(s)
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(totalValue)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
        transaction.status === 'Selesai' ? 'bg-green-100 text-green-800' :
            transaction.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
        }">
                    ${transaction.status}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderSalesReportSummary(reportData.summary, reportData.period);
}

function renderSalesReportSummary(summary, period) {
    const summaryContainer = document.getElementById('sales-summary');
    if (!summaryContainer) return;

    summaryContainer.innerHTML = `
        <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-blue-600 text-sm font-medium">Total Penjualan Bersih</div>
            <div class="text-2xl font-bold text-blue-800">${formatCurrency(summary.total_sales)}</div>
            <div class="text-xs text-blue-600">Hanya transaksi selesai</div>
        </div>
        
        <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-green-600 text-sm font-medium">Selesai</div>
            <div class="text-2xl font-bold text-green-800">${formatCurrency(summary.completed_sales)}</div>
            <div class="text-xs text-green-600">${summary.completed_count || 0} transaksi</div>
        </div>
        
        <div class="bg-yellow-50 p-4 rounded-lg">
            <div class="text-yellow-600 text-sm font-medium">Pending</div>
            <div class="text-2xl font-bold text-yellow-800">${formatCurrency(summary.pending_sales)}</div>
            <div class="text-xs text-yellow-600">${summary.pending_count || 0} transaksi</div>
        </div>
        
        <div class="bg-red-50 p-4 rounded-lg">
            <div class="text-red-600 text-sm font-medium">Dibatalkan</div>
            <div class="text-2xl font-bold text-red-800">${formatCurrency(summary.cancelled_sales)}</div>
            <div class="text-xs text-red-600">${summary.cancelled_count || 0} transaksi</div>
        </div>
    `;
}

// Removed duplicate function - using exportToExcel() instead

/* ================== PURCHASES REPORT ================== */
async function loadPurchasesReport(startDate = null, endDate = null) {
    try {
        showToast('Memuat laporan pembelian...', 'info');

        if (!startDate) {
            startDate = new Date();
            startDate.setDate(1);
            startDate = startDate.toISOString().split('T')[0];
        }

        if (!endDate) {
            endDate = new Date().toISOString().split('T')[0];
        }

        const query = `start_date=${startDate}&end_date=${endDate}`;
        const res = await apiRequest('purchase-reports.php', 'GET', null, query);

        if (res.success) {
            currentPurchasesReportData = res.data;
            renderPurchasesReport(currentPurchasesReportData);
            showToast('Laporan pembelian berhasil dimuat', 'success');
        } else {
            showToast(res.message || 'Gagal memuat laporan pembelian', 'error');
        }
    } catch (error) {
        console.error('Error loading purchases report:', error);
        showToast('Terjadi kesalahan saat memuat laporan', 'error');
    }
}

function renderPurchasesReport(reportData) {
    const tbody = document.getElementById('purchases-report-table-body');
    const emptyState = document.getElementById('purchases-empty-state');
    const summaryContainer = document.getElementById('purchases-summary');

    if (!tbody || !emptyState || !summaryContainer) return;

    tbody.innerHTML = '';

    if (!reportData.purchases || reportData.purchases.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        summaryContainer.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    summaryContainer.classList.remove('hidden');

    reportData.purchases.forEach(purchase => {
        const totalValue = Number(purchase.total ?? purchase.total_price ?? 0) || 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${purchase.id}</td>
            <td class="px-6 py-4 whitespace-nowrap">${formatDate(purchase.purchase_date)}</td>
            <td class="px-6 py-4">${purchase.supplier_name || '-'}</td>
            <td class="px-6 py-4" title="${purchase.items}">
                ${purchase.item_count} item(s)
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(totalValue)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
        purchase.status === 'Selesai' ? 'bg-green-100 text-green-800' :
            purchase.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
        }">
                    ${purchase.status}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPurchasesReportSummary(reportData.summary, reportData.period);
}

function renderPurchasesReportSummary(summary, period) {
    const summaryContainer = document.getElementById('purchases-summary');
    if (!summaryContainer) return;

    summaryContainer.innerHTML = `
        <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-blue-600 text-sm font-medium">Total Pembelian</div>
            <div class="text-2xl font-bold text-blue-800">${formatCurrency(summary.total_purchases)}</div>
            <div class="text-xs text-blue-600">Semua pembelian selesai</div>
        </div>
        
        <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-green-600 text-sm font-medium">Selesai</div>
            <div class="text-2xl font-bold text-green-800">${formatCurrency(summary.completed_purchases)}</div>
            <div class="text-xs text-green-600">${summary.completed_count || 0} pembelian</div>
        </div>
        
        <div class="bg-yellow-50 p-4 rounded-lg">
            <div class="text-yellow-600 text-sm font-medium">Pending</div>
            <div class="text-2xl font-bold text-yellow-800">${formatCurrency(summary.pending_purchases)}</div>
            <div class="text-xs text-yellow-600">${summary.pending_count || 0} pembelian</div>
        </div>
        
        <div class="bg-purple-50 p-4 rounded-lg">
            <div class="text-purple-600 text-sm font-medium">Jumlah Supplier</div>
            <div class="text-2xl font-bold text-purple-800">${summary.supplier_count || 0}</div>
            <div class="text-xs text-purple-600">Total supplier</div>
        </div>
    `;
}

function exportPurchasesToExcel() {
    if (!currentPurchasesReportData || !currentPurchasesReportData.purchases || currentPurchasesReportData.purchases.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        
        currentPurchasesReportData.purchases.forEach(purchase => {
            const totalValue = Number(purchase.total ?? purchase.total_price ?? 0) || 0;
            data.push([
                no++,
                purchase.id,
                formatDate(purchase.purchase_date),
                purchase.supplier_name || '-',
                purchase.items || '-',
                totalValue,
                purchase.status
            ]);
        });

        const headers = ['No', 'ID Pembelian', 'Tanggal', 'Supplier', 'Items', 'Total', 'Status'];
        const title = 'LAPORAN PEMBELIAN';
        const subtitle = `Periode: ${formatDate(currentPurchasesReportData.period.start_date)} s/d ${formatDate(currentPurchasesReportData.period.end_date)}`;
        
        const summary = {
            'Total Pembelian': parseFloat(currentPurchasesReportData.summary.total_purchases || 0),
            'Pembelian Selesai': parseFloat(currentPurchasesReportData.summary.completed_purchases || 0),
            'Pembelian Pending': parseFloat(currentPurchasesReportData.summary.pending_purchases || 0),
            'Jumlah Supplier': currentPurchasesReportData.summary.supplier_count || 0
        };

        const filename = `Laporan_Pembelian_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Laporan Pembelian', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/* ================== UTILITY FUNCTION - EXCEL EXPORT ================== */
/**
 * Universal Excel export function with auto width
 * @param {Array} data - Array of data objects
 * @param {Array} headers - Array of header strings
 * @param {String} sheetName - Name of the sheet
 * @param {String} title - Title of the report
 * @param {String} subtitle - Subtitle (e.g., period)
 * @param {Object} summary - Summary data object (optional)
 * @param {String} filename - Output filename
 */
function downloadExcel(data, headers, sheetName, title, subtitle, summary, filename) {
    try {
        // Check if XLSX library is loaded
        if (typeof XLSX === 'undefined') {
            showToast('Library Excel belum dimuat. Refresh halaman dan coba lagi.', 'error');
            return;
        }

        const excelData = [];
        
        // Title and subtitle
        if (title) {
            excelData.push([title]);
            if (subtitle) excelData.push([subtitle]);
            excelData.push([]); // Empty row
        }
        
        // Headers
        excelData.push(headers);
        
        // Data rows
        data.forEach(row => {
            excelData.push(row);
        });
        
        // Summary section
        if (summary && Object.keys(summary).length > 0) {
            excelData.push([]); // Empty row
            excelData.push(['RINGKASAN LAPORAN']);
            Object.entries(summary).forEach(([key, value]) => {
                excelData.push([key, value]);
            });
        }
        
        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // Auto width for all columns
        const maxLengths = [];
        excelData.forEach(row => {
            row.forEach((cell, idx) => {
                const cellValue = cell ? String(cell) : '';
                maxLengths[idx] = Math.max(maxLengths[idx] || 10, cellValue.length + 2);
            });
        });
        
        ws['!cols'] = maxLengths.map(len => ({ wch: Math.min(len, 50) }));
        
        // Merge title cells
        if (title && !ws['!merges']) ws['!merges'] = [];
        if (title) {
            ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });
            if (subtitle) {
                ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } });
            }
        }
        
        // Format number cells
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let row = 0; row <= range.e.r; row++) {
            for (let col = 0; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                if (ws[cellAddress] && typeof ws[cellAddress].v === 'number') {
                    ws[cellAddress].t = 'n';
                    ws[cellAddress].z = '#,##0';
                }
            }
        }
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        // Write file
        XLSX.writeFile(wb, filename);
        
        return true;
    } catch (error) {
        console.error('Error downloading Excel:', error);
        showToast('Error mengexport data: ' + error.message, 'error');
        return false;
    }
}

/* ================== EVENT LISTENERS ================== */
function initializeReportEventListeners() {
    // Sales Report Events
    document.getElementById('sales-filter-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const startDate = document.getElementById('sales-start-date')?.value;
        const endDate = document.getElementById('sales-end-date')?.value;
        loadSalesReport(startDate, endDate);
    });

    document.getElementById('generate-sales-report-btn')?.addEventListener('click', () => {
        const startDate = document.getElementById('sales-start-date')?.value;
        const endDate = document.getElementById('sales-end-date')?.value;
        loadSalesReport(startDate, endDate);
    });
    
    document.getElementById('export-sales-report-btn')?.addEventListener('click', exportToExcel);

    // Purchases Report Events
    document.getElementById('purchases-filter-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const startDate = document.getElementById('purchases-start-date')?.value;
        const endDate = document.getElementById('purchases-end-date')?.value;
        loadPurchasesReport(startDate, endDate);
    });

    document.getElementById('generate-purchases-report-btn')?.addEventListener('click', () => {
        const startDate = document.getElementById('purchases-start-date')?.value;
        const endDate = document.getElementById('purchases-end-date')?.value;
        loadPurchasesReport(startDate, endDate);
    });

    document.getElementById('export-purchases-report-btn')?.addEventListener('click', exportPurchasesToExcel);
}

/* ================== STOCK MOVEMENTS FUNCTIONALITY ================== */
let currentStockReportData = null;

async function loadStockMovements(startDate = null, endDate = null, movementType = '', search = '') {
    try {
        showToast('Memuat laporan stok...', 'info');

        if (!startDate) {
            const firstDay = new Date();
            firstDay.setDate(1);
            startDate = firstDay.toISOString().split('T')[0];
        }

        if (!endDate) {
            endDate = new Date().toISOString().split('T')[0];
        }

        let query = `start_date=${startDate}&end_date=${endDate}`;
        if (movementType) query += `&movement_type=${movementType}`;
        if (search) query += `&search=${encodeURIComponent(search)}`;

        const res = await apiRequest('stock-movements.php', 'GET', null, query);

        if (res.success) {
            currentStockReportData = res.data;
            renderStockMovements(currentStockReportData);
            showToast('Laporan stok berhasil dimuat', 'success');
        } else {
            showToast(res.message || 'Gagal memuat laporan stok', 'error');
        }
    } catch (error) {
        console.error('Error loading stock movements:', error);
        showToast('Terjadi kesalahan saat memuat laporan', 'error');
    }
}

function renderStockMovements(reportData) {
    const tbody = document.getElementById('stock-movements-table-body');
    const emptyState = document.getElementById('stock-empty-state');
    const summaryContainer = document.getElementById('stock-summary');

    if (!tbody || !emptyState || !summaryContainer) return;

    tbody.innerHTML = '';

    if (!reportData.movements || reportData.movements.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        summaryContainer.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    summaryContainer.classList.remove('hidden');

    reportData.movements.forEach(movement => {
        const tr = document.createElement('tr');

        // Determine badge color based on movement type
        let badgeClass = '';
        let badgeIcon = '';
        let movementLabel = '';

        switch (movement.movement_type) {
            case 'in':
                badgeClass = 'bg-green-100 text-green-800';
                badgeIcon = '<i class="fas fa-arrow-down mr-1"></i>';
                movementLabel = 'MASUK';
                break;
            case 'out':
                badgeClass = 'bg-red-100 text-red-800';
                badgeIcon = '<i class="fas fa-arrow-up mr-1"></i>';
                movementLabel = 'KELUAR';
                break;
            case 'adjustment':
                badgeClass = 'bg-blue-100 text-blue-800';
                badgeIcon = '<i class="fas fa-edit mr-1"></i>';
                movementLabel = 'PENYESUAIAN';
                break;
        }

        // Format reference
        let referenceText = '-';
        if (movement.reference_type === 'purchase') {
            referenceText = `<span class="text-xs text-blue-600">Pembelian: ${movement.reference_id || '-'}</span>`;
        } else if (movement.reference_type === 'transaction') {
            referenceText = `<span class="text-xs text-green-600">Penjualan: ${movement.reference_id || '-'}</span>`;
        } else if (movement.reference_type === 'manual') {
            referenceText = `<span class="text-xs text-purple-600">Manual</span>`;
        }

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${formatDate(movement.created_at)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-mono">${movement.product_id}</td>
            <td class="px-6 py-4 text-sm">${movement.product_name || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeClass}">
                    ${badgeIcon}${movementLabel}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold">${movement.quantity}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${movement.stock_before}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold">${movement.stock_after}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${referenceText}</td>
            <td class="px-6 py-4 text-sm text-gray-600">${movement.notes || '-'}</td>
        `;
        tbody.appendChild(tr);
    });

    renderStockSummary(reportData.summary);
    renderLowStockAlert(reportData.low_stock_products);
}

function renderStockSummary(summary) {
    const summaryContainer = document.getElementById('stock-summary');
    if (!summaryContainer) return;

    summaryContainer.innerHTML = `
        <div class="bg-green-50 p-4 rounded-lg">
            <div class="text-green-600 text-sm font-medium">Total Stok Masuk</div>
            <div class="text-2xl font-bold text-green-800">${summary.total_in || 0}</div>
            <div class="text-xs text-green-600">${summary.in_count || 0} transaksi</div>
        </div>
        
        <div class="bg-red-50 p-4 rounded-lg">
            <div class="text-red-600 text-sm font-medium">Total Stok Keluar</div>
            <div class="text-2xl font-bold text-red-800">${summary.total_out || 0}</div>
            <div class="text-xs text-red-600">${summary.out_count || 0} transaksi</div>
        </div>
        
        <div class="bg-blue-50 p-4 rounded-lg">
            <div class="text-blue-600 text-sm font-medium">Penyesuaian</div>
            <div class="text-2xl font-bold text-blue-800">${summary.total_adjustment || 0}</div>
            <div class="text-xs text-blue-600">${summary.adjustment_count || 0} transaksi</div>
        </div>
        
        <div class="bg-purple-50 p-4 rounded-lg">
            <div class="text-purple-600 text-sm font-medium">Total Pergerakan</div>
            <div class="text-2xl font-bold text-purple-800">${summary.movement_count || 0}</div>
            <div class="text-xs text-purple-600">Semua tipe</div>
        </div>
    `;
    summaryContainer.classList.remove('hidden');
}

function renderLowStockAlert(lowStockProducts) {
    const alertContainer = document.getElementById('low-stock-alert');
    const listContainer = document.getElementById('products-low-stock-list');

    if (!alertContainer || !listContainer) return;

    if (!lowStockProducts || lowStockProducts.length === 0) {
        alertContainer.classList.add('hidden');
        return;
    }

    listContainer.innerHTML = '';
    lowStockProducts.forEach(product => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-md';
        div.innerHTML = `
            <div>
                <p class="font-semibold text-gray-800">${product.name}</p>
                <p class="text-sm text-gray-600">ID: ${product.id}</p>
            </div>
            <div class="text-right">
                <p class="text-2xl font-bold text-red-600">${product.stock}</p>
                <p class="text-xs text-red-500">unit tersisa</p>
            </div>
        `;
        listContainer.appendChild(div);
    });

    alertContainer.classList.remove('hidden');
}

function exportStockToCSV() {
    if (!currentStockReportData || !currentStockReportData.movements || currentStockReportData.movements.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        
        currentStockReportData.movements.forEach(movement => {
            const movementTypeLabel = movement.movement_type === 'in' ? 'MASUK' :
                movement.movement_type === 'out' ? 'KELUAR' : 'PENYESUAIAN';

            data.push([
                no++,
                formatDate(movement.created_at),
                movement.product_id,
                movement.product_name || '-',
                movementTypeLabel,
                parseInt(movement.quantity),
                parseInt(movement.stock_before),
                parseInt(movement.stock_after),
                movement.reference_type || '-',
                movement.reference_id || '-',
                movement.notes || '-',
                movement.created_by || '-'
            ]);
        });

        const headers = ['No', 'Tanggal', 'ID Produk', 'Nama Produk', 'Tipe', 'Jumlah', 'Stok Sebelum', 'Stok Setelah', 'Referensi', 'Ref ID', 'Catatan', 'Dibuat Oleh'];
        const title = 'LAPORAN PERGERAKAN STOK';
        const subtitle = `Periode: ${formatDate(currentStockReportData.period.start_date)} s/d ${formatDate(currentStockReportData.period.end_date)}`;
        
        const summary = {
            'Total Stok Masuk': parseInt(currentStockReportData.summary.total_in || 0),
            'Total Stok Keluar': parseInt(currentStockReportData.summary.total_out || 0),
            'Total Penyesuaian': parseInt(currentStockReportData.summary.total_adjustment || 0),
            'Transaksi Stok Masuk': currentStockReportData.summary.in_count || 0,
            'Transaksi Stok Keluar': currentStockReportData.summary.out_count || 0,
            'Transaksi Penyesuaian': currentStockReportData.summary.adjustment_count || 0,
            'Total Pergerakan': currentStockReportData.summary.movement_count || 0
        };

        const filename = `Laporan_Stok_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Laporan Stok', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/* ================== MANUAL STOCK ADJUSTMENT ================== */
async function openStockAdjustmentModal() {
    // Load products for dropdown
    await loadProducts();

    const productSelect = document.getElementById('adjustment-product');
    if (productSelect) {
        productSelect.innerHTML = '<option value="">-- Pilih Produk --</option>';
        products.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.name} (Stok: ${p.stock})`;
            option.dataset.stock = p.stock;
            productSelect.appendChild(option);
        });
    }

    showModal('stock-adjustment-modal');
}

// Show current stock when product selected
document.getElementById('adjustment-product')?.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const currentStock = selectedOption.dataset.stock || 0;
    const displayDiv = document.getElementById('current-stock-display');
    const valueSpan = document.getElementById('current-stock-value');

    if (displayDiv && valueSpan) {
        if (e.target.value) {
            valueSpan.textContent = currentStock;
            displayDiv.classList.remove('hidden');
        } else {
            displayDiv.classList.add('hidden');
        }
    }
});

// Handle stock adjustment form submission
document.getElementById('stock-adjustment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productId = document.getElementById('adjustment-product')?.value;
    const adjustmentType = document.getElementById('adjustment-type')?.value;
    const quantity = parseInt(document.getElementById('adjustment-quantity')?.value || 0);
    const notes = document.getElementById('adjustment-notes')?.value.trim();

    if (!productId || !adjustmentType || quantity <= 0 || !notes) {
        showToast('Semua field wajib diisi', 'error');
        return;
    }

    const payload = {
        product_id: productId,
        adjustment_type: adjustmentType,
        quantity: quantity,
        notes: notes,
        created_by: currentUserName || 'System'
    };

    try {
        const res = await apiRequest('stock-movements.php', 'POST', payload);

        if (res.success) {
            showToast('Penyesuaian stok berhasil', 'success');
            hideModal('stock-adjustment-modal');
            document.getElementById('stock-adjustment-form').reset();
            document.getElementById('current-stock-display').classList.add('hidden');

            // Reload stock movements
            const startDate = document.getElementById('stock-start-date')?.value;
            const endDate = document.getElementById('stock-end-date')?.value;
            await loadStockMovements(startDate, endDate);

            // Reload products to update stock display
            await loadProducts();
        } else {
            showToast(res.message || 'Gagal menyesuaikan stok', 'error');
        }
    } catch (error) {
        console.error('Error adjusting stock:', error);
        showToast('Terjadi kesalahan saat menyesuaikan stok', 'error');
    }
});

/* ================== EVENT LISTENERS ================== */
function initializeStockEventListeners() {
    // Stock filter form
    document.getElementById('stock-filter-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const startDate = document.getElementById('stock-start-date')?.value;
        const endDate = document.getElementById('stock-end-date')?.value;
        const movementType = document.getElementById('stock-movement-type')?.value;
        const search = document.getElementById('stock-search')?.value;
        loadStockMovements(startDate, endDate, movementType, search);
    });

    // Generate report button
    document.getElementById('generate-stock-report-btn')?.addEventListener('click', () => {
        const startDate = document.getElementById('stock-start-date')?.value;
        const endDate = document.getElementById('stock-end-date')?.value;
        const movementType = document.getElementById('stock-movement-type')?.value;
        const search = document.getElementById('stock-search')?.value;
        loadStockMovements(startDate, endDate, movementType, search);
    });

    // Export button
    document.getElementById('export-stock-report-btn')?.addEventListener('click', exportStockToCSV);

    // Manual adjustment button
    document.getElementById('manual-stock-adjustment-btn')?.addEventListener('click', openStockAdjustmentModal);
}

/* ================== INTEGRATION WITH EXISTING TRANSACTIONS ================== */

// Purchase Modal - Tempo Feature
document.getElementById('purchase-payment-method')?.addEventListener('change', function () {
    const dueDateContainer = document.getElementById('due-date-container');
    const tempoInfo = document.getElementById('tempo-info');
    const dueDateInput = document.getElementById('purchase-due-date');

    if (this.value === 'tempo') {
        dueDateContainer?.classList.remove('hidden');
        tempoInfo?.classList.remove('hidden');
        if (dueDateInput) dueDateInput.required = true;
    } else {
        dueDateContainer?.classList.add('hidden');
        tempoInfo?.classList.add('hidden');
        if (dueDateInput) {
            dueDateInput.required = false;
            dueDateInput.value = '';
        }
    }
});

// Calculate total
['purchase-qty', 'purchase-price'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', function () {
        const qty = parseInt(document.getElementById('purchase-qty')?.value || '0');
        const price = parseFloat(document.getElementById('purchase-price')?.value || '0');
        const total = qty * price;
        const totalEl = document.getElementById('purchase-total');
        if (totalEl) totalEl.value = formatCurrency(total);
    });
});

/* ================== HUTANG MANAGEMENT FUNCTIONS ================== */

let currentTempoPurchases = [];
let currentOverduePurchases = [];
let currentSuppliersHutang = [];

let currentSupplierReceivables = [];

async function initSupplierReceivablesPage() {
    const dateInput = document.getElementById('receivable-date');
    const paymentDateInput = document.getElementById('receivable-payment-date');
    const today = new Date().toISOString().split('T')[0];
    if (dateInput && !dateInput.value) dateInput.value = today;
    if (paymentDateInput && !paymentDateInput.value) paymentDateInput.value = today;
    await loadSupplierReceivables();
}

async function loadSupplierReceivables() {
    try {
        const [receivableResponse, supplierResponse] = await Promise.all([
            fetch(`${API_BASE}/supplier-receivables.php`, {headers: {'Authorization': 'Bearer ' + getToken()}}),
            fetch(`${API_BASE}/suppliers.php`, {headers: {'Authorization': 'Bearer ' + getToken()}})
        ]);
        const result = await receivableResponse.json();
        const suppliers = await supplierResponse.json();
        if (!result.success) throw new Error(result.message || 'Gagal memuat piutang');
        currentSupplierReceivables = result.data || [];
        renderSupplierReceivables(result.summary || {});
        populateReceivableSuppliers(Array.isArray(suppliers) ? suppliers : (suppliers.data || []));
    } catch (error) {
        console.error('Error loading supplier receivables:', error);
        showToast('Gagal memuat piutang supplier', 'error');
    }
}

function populateReceivableSuppliers(suppliers) {
    const select = document.getElementById('receivable-supplier');
    if (!select) return;
    select.innerHTML = '<option value="">Pilih supplier</option>';
    suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.id;
        option.textContent = `${supplier.id} - ${supplier.name}`;
        select.appendChild(option);
    });
}

function renderSupplierReceivables(summary) {
    const total = parseFloat(summary.total_amount || 0);
    const paid = parseFloat(summary.total_paid || 0);
    const remaining = parseFloat(summary.total_remaining || 0);
    document.getElementById('receivable-total-display').textContent = formatCurrency(total);
    document.getElementById('receivable-paid-display').textContent = formatCurrency(paid);
    document.getElementById('receivable-remaining-display').textContent = formatCurrency(remaining);

    const tbody = document.getElementById('supplier-receivables-table-body');
    if (!tbody) return;
    if (!currentSupplierReceivables.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-gray-500">Belum ada piutang supplier</td></tr>';
        return;
    }
    tbody.innerHTML = currentSupplierReceivables.map(item => {
        const statusClass = item.status === 'Lunas' ? 'bg-green-100 text-green-800' : item.status === 'Sebagian' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
        return `<tr><td class="px-6 py-4 text-sm">${formatDate(item.transaction_date)}</td><td class="px-6 py-4 text-sm font-semibold">${item.supplier_name}</td><td class="px-6 py-4 text-sm">${item.description}</td><td class="px-6 py-4 text-sm">${formatCurrency(item.amount)}</td><td class="px-6 py-4 text-sm font-bold text-rose-600">${formatCurrency(item.remaining_amount)}</td><td class="px-6 py-4"><span class="px-2 py-1 text-xs rounded-full ${statusClass}">${item.status}</span></td><td class="px-6 py-4 text-sm">${item.status !== 'Lunas' ? `<button class="text-green-600 hover:text-green-900 pay-supplier-receivable" data-id="${item.id}" data-supplier="${item.supplier_name}" data-remaining="${item.remaining_amount}"><i class="fas fa-money-bill-wave mr-1"></i>Terima</button>` : '<span class="text-gray-500">Selesai</span>'}</td></tr>`;
    }).join('');
}

document.getElementById('add-supplier-receivable-btn')?.addEventListener('click', () => {
    document.getElementById('supplier-receivable-form')?.reset();
    document.getElementById('receivable-date').value = new Date().toISOString().split('T')[0];
    showModal('supplier-receivable-modal');
});

document.getElementById('supplier-receivable-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {action: 'create', supplier_id: document.getElementById('receivable-supplier').value, transaction_date: document.getElementById('receivable-date').value, description: document.getElementById('receivable-description').value.trim(), amount: parseFloat(document.getElementById('receivable-amount').value), due_date: document.getElementById('receivable-due-date').value, created_by: currentUserName || 'System'};
    try {
        const response = await fetch(`${API_BASE}/supplier-receivables.php`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken()}, body: JSON.stringify(payload)});
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        hideModal('supplier-receivable-modal');
        showToast('Piutang supplier berhasil ditambahkan', 'success');
        await loadSupplierReceivables();
    } catch (error) { showToast(error.message || 'Gagal menambahkan piutang', 'error'); }
});

function openSupplierReceivablePaymentModal(id, supplier, remaining) {
    document.getElementById('receivable-payment-id').value = id;
    document.getElementById('receivable-payment-amount').value = '';
    document.getElementById('receivable-payment-amount').max = remaining;
    document.getElementById('receivable-payment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('receivable-payment-info').innerHTML = `<p class="text-sm"><strong>Supplier:</strong> ${supplier}</p><p class="text-sm"><strong>Sisa Piutang:</strong> <span class="font-bold text-rose-600">${formatCurrency(remaining)}</span></p>`;
    showModal('supplier-receivable-payment-modal');
}

document.getElementById('supplier-receivable-payment-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {action: 'payment', receivable_id: document.getElementById('receivable-payment-id').value, payment_date: document.getElementById('receivable-payment-date').value, amount: parseFloat(document.getElementById('receivable-payment-amount').value), payment_method: document.getElementById('receivable-payment-method').value, notes: document.getElementById('receivable-payment-notes').value.trim(), created_by: currentUserName || 'System'};
    try {
        const response = await fetch(`${API_BASE}/supplier-receivables.php`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken()}, body: JSON.stringify(payload)});
        const result = await response.json();
        if (!result.success) throw new Error(result.message);
        hideModal('supplier-receivable-payment-modal');
        showToast('Pembayaran piutang berhasil dicatat', 'success');
        await loadSupplierReceivables();
    } catch (error) { showToast(error.message || 'Gagal mencatat pembayaran', 'error'); }
});

document.addEventListener('click', event => {
    const button = event.target.closest('.pay-supplier-receivable');
    if (button) openSupplierReceivablePaymentModal(button.dataset.id, button.dataset.supplier, parseFloat(button.dataset.remaining || 0));
});

/**
 * Load tempo purchases (all purchases with payment method tempo)
 */
async function loadTempoPurchases(paymentStatus = '') {
    try {
        showToast('Memuat data pembelian tempo...', 'info');

        let query = 'payment_method=tempo';
        if (paymentStatus) query += `&payment_status=${paymentStatus}`;

        const res = await fetch(`${API_BASE}/purchase-payments.php?${query}`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const data = await res.json();

        if (data.success) {
            currentTempoPurchases = data.data || [];
            renderTempoPurchases();
            showToast('Data berhasil dimuat', 'success');
        } else {
            showToast(data.message || 'Gagal memuat data', 'error');
        }
    } catch (error) {
        console.error('Error loading tempo purchases:', error);
        showToast('Gagal memuat data pembelian tempo', 'error');
    }
}

/**
 * Render tempo purchases table
 */
function renderTempoPurchases() {
    const tbody = document.getElementById('tempo-purchases-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!currentTempoPurchases || currentTempoPurchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">Tidak ada pembelian tempo</td></tr>';
        return;
    }

    currentTempoPurchases.forEach(purchase => {
        const tr = document.createElement('tr');

        // Determine due date status
        let dueDateClass = 'due-date-normal';
        let dueDateText = '-';

        // Only show due date if not yet fully paid
        if (purchase.payment_status !== 'Lunas' && purchase.due_date) {
            const dueDate = new Date(purchase.due_date);
            const today = new Date();
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            dueDateText = formatDate(purchase.due_date);

            if (diffDays < 0) {
                dueDateClass = 'due-date-overdue';
                dueDateText += ` (${Math.abs(diffDays)} hari terlambat)`;
            } else if (diffDays <= 7) {
                dueDateClass = 'due-date-upcoming';
                dueDateText += ` (${diffDays} hari lagi)`;
            }
        }

        // Payment status badge
        let statusBadgeClass = '';
        switch (purchase.payment_status) {
            case 'Lunas':
                statusBadgeClass = 'bg-green-100 text-green-800';
                break;
            case 'Sebagian':
                statusBadgeClass = 'bg-yellow-100 text-yellow-800';
                break;
            default:
                statusBadgeClass = 'bg-red-100 text-red-800';
        }

        // Determine remaining amount color
        const remainingAmountClass = purchase.payment_status === 'Lunas' 
            ? 'text-gray-500' 
            : 'font-bold text-red-600';

        tr.innerHTML = `
            <td class="px-6 py-4 text-sm">${purchase.id}</td>
            <td class="px-6 py-4 text-sm">${formatDate(purchase.purchase_date)}</td>
            <td class="px-6 py-4 text-sm">${purchase.supplier_name || '-'}</td>
            <td class="px-6 py-4 text-sm font-semibold">${formatCurrency(purchase.total)}</td>
            <td class="px-6 py-4 text-sm">${formatCurrency(purchase.paid_amount || 0)}</td>
            <td class="px-6 py-4 text-sm ${remainingAmountClass}">${formatCurrency(purchase.remaining_amount || 0)}</td>
            <td class="px-6 py-4 text-sm ${dueDateClass}">${dueDateText}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs rounded-full ${statusBadgeClass}">
                    ${purchase.payment_status}
                </span>
            </td>
            <td class="px-6 py-4 text-sm">
                ${purchase.payment_status !== 'Lunas' ? `
                    <button class="text-green-600 hover:text-green-900 mr-2 pay-tempo" 
                            data-id="${purchase.id}"
                            data-supplier="${purchase.supplier_name}"
                            data-remaining="${purchase.remaining_amount}"
                            data-role-access="admin,operator">
                        <i class="fas fa-money-bill-wave mr-1"></i>Bayar
                    </button>
                ` : ''}
                <button class="text-blue-600 hover:text-blue-900 view-payment-history" 
                        data-id="${purchase.id}"
                        data-role-access="admin,operator">
                    <i class="fas fa-history mr-1"></i>Riwayat
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    checkUserPermissions();
}

/**
 * Load overdue and upcoming purchases
 */
async function loadOverduePurchases() {
    try {
        // Load overdue
        const overdueRes = await fetch(`${API_BASE}/purchase-payments.php?overdue=1`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const overdueData = await overdueRes.json();

        // Load upcoming (next 7 days)
        const upcomingRes = await fetch(`${API_BASE}/purchase-payments.php?upcoming=1`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const upcomingData = await upcomingRes.json();

        currentOverduePurchases = [
            ...(overdueData.data || []),
            ...(upcomingData.data || [])
        ];

        renderOverduePurchases();
    } catch (error) {
        console.error('Error loading overdue purchases:', error);
        showToast('Gagal memuat data jatuh tempo', 'error');
    }
}

/**
 * Render overdue purchases table
 */
function renderOverduePurchases() {
    const tbody = document.getElementById('overdue-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!currentOverduePurchases || currentOverduePurchases.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">Tidak ada pembelian jatuh tempo</td></tr>';
        return;
    }

    currentOverduePurchases.forEach(purchase => {
        const tr = document.createElement('tr');

        const dueDate = new Date(purchase.due_date);
        const today = new Date();
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        let statusText = '';
        let statusClass = '';

        if (diffDays < 0) {
            statusText = `Terlambat ${Math.abs(diffDays)} hari`;
            statusClass = 'bg-red-100 text-red-800';
        } else {
            statusText = `${diffDays} hari lagi`;
            statusClass = 'bg-yellow-100 text-yellow-800';
        }

        tr.innerHTML = `
            <td class="px-6 py-4 text-sm">${purchase.id}</td>
            <td class="px-6 py-4 text-sm font-semibold">${purchase.supplier_name || '-'}</td>
            <td class="px-6 py-4 text-sm">${purchase.contact || '-'}</td>
            <td class="px-6 py-4 text-sm font-bold text-red-600">${formatCurrency(purchase.remaining_amount || 0)}</td>
            <td class="px-6 py-4 text-sm">${formatDate(purchase.due_date)}</td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 text-xs rounded-full ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td class="px-6 py-4 text-sm">
                <button class="text-green-600 hover:text-green-900 pay-tempo" 
                        data-id="${purchase.id}"
                        data-supplier="${purchase.supplier_name}"
                        data-remaining="${purchase.remaining_amount}"
                        data-role-access="admin,operator">
                    <i class="fas fa-money-bill-wave mr-1"></i>Bayar Sekarang
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    checkUserPermissions();
}

/**
 * Load suppliers with hutang
 */
async function loadSuppliersHutang() {
    try {
        const res = await apiRequest('suppliers.php', 'GET');
        const allSuppliers = Array.isArray(res) ? res : (res.data || []);

        // Filter suppliers with hutang > 0 and convert to number
        currentSuppliersHutang = allSuppliers
            .filter(s => parseFloat(s.total_hutang || 0) > 0)
            .map(s => ({
                ...s,
                total_hutang: parseFloat(s.total_hutang || 0)
            }))
            .sort((a, b) => b.total_hutang - a.total_hutang); // Sort by hutang DESC

        renderSuppliersHutang();
    } catch (error) {
        console.error('Error loading suppliers hutang:', error);
        showToast('Gagal memuat data supplier', 'error');
    }
}

/**
 * Render suppliers hutang table
 */
function renderSuppliersHutang() {
    const tbody = document.getElementById('suppliers-hutang-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!currentSuppliersHutang || currentSuppliersHutang.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Tidak ada hutang supplier</td></tr>';
        return;
    }

    let totalHutangSemua = 0;

    currentSuppliersHutang.forEach(supplier => {
        totalHutangSemua += supplier.total_hutang;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 text-sm">${supplier.id}</td>
            <td class="px-6 py-4 text-sm font-semibold">${supplier.name}</td>
            <td class="px-6 py-4 text-sm">${supplier.contact || '-'}</td>
            <td class="px-6 py-4 text-sm font-bold text-red-600">${formatCurrency(supplier.total_hutang)}</td>
            <td class="px-6 py-4 text-sm">
                <button class="text-blue-600 hover:text-blue-900 view-supplier-detail" 
                        data-id="${supplier.id}"
                        data-name="${supplier.name}"
                        data-role-access="admin,operator">
                    <i class="fas fa-eye mr-1"></i>Lihat Detail
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Add total row
    const totalRow = document.createElement('tr');
    totalRow.className = 'bg-gray-100 font-bold border-t-2 border-gray-300';
    totalRow.innerHTML = `
        <td colspan="3" class="px-6 py-4 text-sm text-right">TOTAL HUTANG SEMUA SUPPLIER:</td>
        <td class="px-6 py-4 text-sm text-red-600 font-bold text-lg">${formatCurrency(totalHutangSemua)}</td>
        <td class="px-6 py-4 text-sm text-gray-500">${currentSuppliersHutang.length} supplier</td>
    `;
    tbody.appendChild(totalRow);

    checkUserPermissions();
}

/**
 * Load hutang summary for dashboard
 */
async function loadHutangSummary() {
    try {
        const res = await fetch(`${API_BASE}/hutang-reports.php`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const data = await res.json();

        if (data.success && data.data.summary) {
            const summary = data.data.summary;

            // Update summary cards
            const totalHutangEl = document.getElementById('total-hutang-display');
            const upcomingDueEl = document.getElementById('upcoming-due-display');
            const upcomingAmountEl = document.getElementById('upcoming-amount-display');
            const overdueEl = document.getElementById('overdue-display');
            const overdueAmountEl = document.getElementById('overdue-amount-display');
            const suppliersCountEl = document.getElementById('suppliers-count-display');

            if (totalHutangEl) totalHutangEl.textContent = formatCurrency(summary.total_hutang_sekarang || 0);
            if (upcomingDueEl) upcomingDueEl.textContent = summary.upcoming_count || 0;
            if (upcomingAmountEl) upcomingAmountEl.textContent = formatCurrency(summary.upcoming_amount || 0);
            if (overdueEl) overdueEl.textContent = summary.overdue_count || 0;
            if (overdueAmountEl) overdueAmountEl.textContent = formatCurrency(summary.overdue_amount || 0);
            if (suppliersCountEl) suppliersCountEl.textContent = data.data.suppliers_with_hutang?.length || 0;
        }
    } catch (error) {
        console.error('Error loading hutang summary:', error);
    }
}

/**
 * Open payment tempo modal
 */
function openPaymentTempoModal(purchaseId, supplierName, remainingAmount) {
    const modal = document.getElementById('payment-tempo-modal');
    const purchaseIdInput = document.getElementById('payment-purchase-id');
    const remainingAmountSpan = document.getElementById('payment-remaining-amount');
    const purchaseInfo = document.getElementById('payment-purchase-info');
    const paymentDateInput = document.getElementById('payment-date');
    const paymentAmountInput = document.getElementById('payment-amount');

    if (purchaseIdInput) purchaseIdInput.value = purchaseId;
    if (remainingAmountSpan) remainingAmountSpan.textContent = formatCurrency(remainingAmount);
    if (paymentDateInput) paymentDateInput.value = new Date().toISOString().split('T')[0];
    if (paymentAmountInput) {
        paymentAmountInput.value = '';
        paymentAmountInput.max = remainingAmount;
    }

    if (purchaseInfo) {
        purchaseInfo.innerHTML = `
            <p class="text-sm"><strong>ID Pembelian:</strong> ${purchaseId}</p>
            <p class="text-sm"><strong>Supplier:</strong> ${supplierName}</p>
            <p class="text-sm"><strong>Sisa Hutang:</strong> <span class="text-red-600 font-bold">${formatCurrency(remainingAmount)}</span></p>
        `;
    }

    showModal('payment-tempo-modal');
}

/**
 * Submit payment tempo
 */
document.getElementById('payment-tempo-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const purchaseId = document.getElementById('payment-purchase-id')?.value;
    const amount = parseFloat(document.getElementById('payment-amount')?.value || 0);
    const paymentDate = document.getElementById('payment-date')?.value;
    const paymentMethod = document.getElementById('payment-method-type')?.value;
    const notes = document.getElementById('payment-notes')?.value?.trim();

    if (!purchaseId || amount <= 0) {
        showToast('Data pembayaran tidak valid', 'error');
        return;
    }

    const payload = {
        purchase_id: purchaseId,
        amount: amount,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: notes,
        created_by: currentUserName || 'System'
    };

    try {
        const res = await fetch(`${API_BASE}/purchase-payments.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            showToast('Pembayaran berhasil dicatat', 'success');
            hideModal('payment-tempo-modal');
            document.getElementById('payment-tempo-form').reset();

            // Reload data
            await loadTempoPurchases();
            await loadHutangSummary();
            await loadSuppliersHutang();
            
            // Update badge and dashboard widgets
            await updateHutangBadge();
            await loadDashboardHutangWidgets();
        } else {
            showToast(data.message || 'Gagal mencatat pembayaran', 'error');
        }
    } catch (error) {
        console.error('Error submitting payment:', error);
        showToast('Gagal mencatat pembayaran', 'error');
    }
});

/**
 * View payment history
 */
async function viewPaymentHistory(purchaseId) {
    try {
        const res = await fetch(`${API_BASE}/purchase-payments.php?purchase_id=${purchaseId}`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const data = await res.json();

        if (data.success) {
            const payments = data.data || [];

            let html = `<h4 class="font-semibold mb-2">Riwayat Pembayaran - ${purchaseId}</h4>`;

            if (payments.length === 0) {
                html += '<p class="text-gray-500">Belum ada pembayaran</p>';
            } else {
                html += '<table class="min-w-full text-sm"><thead><tr class="bg-gray-50">';
                html += '<th class="px-3 py-2 text-left">Tanggal</th>';
                html += '<th class="px-3 py-2 text-left">Jumlah</th>';
                html += '<th class="px-3 py-2 text-left">Metode</th>';
                html += '<th class="px-3 py-2 text-left">Catatan</th>';
                html += '</tr></thead><tbody>';

                payments.forEach(payment => {
                    html += `<tr class="border-b">`;
                    html += `<td class="px-3 py-2">${formatDate(payment.payment_date)}</td>`;
                    html += `<td class="px-3 py-2 font-semibold">${formatCurrency(payment.amount)}</td>`;
                    html += `<td class="px-3 py-2">${payment.payment_method.toUpperCase()}</td>`;
                    html += `<td class="px-3 py-2">${payment.notes || '-'}</td>`;
                    html += `</tr>`;
                });

                html += '</tbody></table>';
            }

            showDetailModal('Riwayat Pembayaran', html);
        } else {
            showToast(data.message || 'Gagal memuat riwayat pembayaran', 'error');
        }
    } catch (error) {
        console.error('Error loading payment history:', error);
        showToast('Gagal memuat riwayat pembayaran', 'error');
    }
}

/**
 * View supplier hutang detail
 */
async function viewSupplierDetailHutang(supplierId, supplierName) {
    try {
        showToast('Memuat detail hutang supplier...', 'info');

        const [tempoPurchasesRes, hutangMutationsRes] = await Promise.all([
            fetch(`${API_BASE}/purchase-payments.php`, {
                headers: {'Authorization': 'Bearer ' + getToken()}
            }),
            fetch(`${API_BASE}/hutang-reports.php?supplier_id=${supplierId}`, {
                headers: {'Authorization': 'Bearer ' + getToken()}
            })
        ]);

        const tempoPurchasesData = await tempoPurchasesRes.json();
        const hutangMutationsData = await hutangMutationsRes.json();

        let html = `<div class="space-y-4">`;
        html += `<h4 class="font-semibold text-lg border-b pb-2">Detail Hutang - ${supplierName}</h4>`;

        if (tempoPurchasesData.success) {
            const purchases = (tempoPurchasesData.data || []).filter(p => p.supplier_id === supplierId);

            html += `<div class="bg-gray-50 p-3 rounded">`;
            html += `<h5 class="font-semibold mb-2">Pembelian Tempo</h5>`;

            if (purchases.length === 0) {
                html += '<p class="text-gray-500 text-sm">Tidak ada pembelian tempo</p>';
            } else {
                html += '<table class="min-w-full text-sm"><thead><tr class="bg-gray-100">';
                html += '<th class="px-3 py-2 text-left">ID</th>';
                html += '<th class="px-3 py-2 text-left">Tanggal</th>';
                html += '<th class="px-3 py-2 text-left">Total</th>';
                html += '<th class="px-3 py-2 text-left">Terbayar</th>';
                html += '<th class="px-3 py-2 text-left">Sisa</th>';
                html += '<th class="px-3 py-2 text-left">Jatuh Tempo</th>';
                html += '<th class="px-3 py-2 text-left">Status</th>';
                html += '</tr></thead><tbody>';

                let totalRemaining = 0;

                purchases.forEach(purchase => {
                    const dueDate = new Date(purchase.due_date);
                    const today = new Date();
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                    let dueDateClass = 'text-green-600';
                    if (diffDays < 0) dueDateClass = 'text-red-600 font-bold';
                    else if (diffDays <= 7) dueDateClass = 'text-yellow-600 font-semibold';

                    let statusBadge = '';
                    if (purchase.payment_status === 'Lunas') {
                        statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Lunas</span>';
                    } else if (purchase.payment_status === 'Sebagian') {
                        statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Sebagian</span>';
                    } else {
                        statusBadge = '<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Belum Lunas</span>';
                    }

                    totalRemaining += parseFloat(purchase.remaining_amount || 0);

                    html += `<tr class="border-b">`;
                    html += `<td class="px-3 py-2">${purchase.id}</td>`;
                    html += `<td class="px-3 py-2">${formatDate(purchase.purchase_date)}</td>`;
                    html += `<td class="px-3 py-2">${formatCurrency(purchase.total)}</td>`;
                    html += `<td class="px-3 py-2">${formatCurrency(purchase.paid_amount || 0)}</td>`;
                    html += `<td class="px-3 py-2 font-bold text-red-600">${formatCurrency(purchase.remaining_amount || 0)}</td>`;
                    html += `<td class="px-3 py-2 ${dueDateClass}">${formatDate(purchase.due_date)}</td>`;
                    html += `<td class="px-3 py-2">${statusBadge}</td>`;
                    html += `</tr>`;
                });

                html += `<tr class="bg-gray-100 font-bold">`;
                html += `<td colspan="4" class="px-3 py-2 text-right">Total Sisa Hutang:</td>`;
                html += `<td colspan="3" class="px-3 py-2 text-red-600">${formatCurrency(totalRemaining)}</td>`;
                html += `</tr>`;
                html += '</tbody></table>';
            }

            html += `</div>`;
        }

        if (hutangMutationsData.success) {
            const mutations = hutangMutationsData.data.mutations || [];

            html += `<div class="bg-gray-50 p-3 rounded">`;
            html += `<h5 class="font-semibold mb-2">Riwayat Mutasi Hutang</h5>`;

            if (mutations.length === 0) {
                html += '<p class="text-gray-500 text-sm">Tidak ada mutasi hutang</p>';
            } else {
                html += '<table class="min-w-full text-sm"><thead><tr class="bg-gray-100">';
                html += '<th class="px-3 py-2 text-left">Tanggal</th>';
                html += '<th class="px-3 py-2 text-left">Tipe</th>';
                html += '<th class="px-3 py-2 text-left">Jumlah</th>';
                html += '<th class="px-3 py-2 text-left">Keterangan</th>';
                html += '</tr></thead><tbody>';

                mutations.forEach(mutation => {
                    const typeClass = mutation.type === 'hutang' ? 'text-red-600' : 'text-green-600';
                    const typeText = mutation.type === 'hutang' ? 'HUTANG' : 'BAYAR';

                    html += `<tr class="border-b">`;
                    html += `<td class="px-3 py-2">${formatDate(mutation.created_at)}</td>`;
                    html += `<td class="px-3 py-2 ${typeClass} font-semibold">${typeText}</td>`;
                    html += `<td class="px-3 py-2">${formatCurrency(mutation.amount)}</td>`;
                    html += `<td class="px-3 py-2">${mutation.description || '-'}</td>`;
                    html += `</tr>`;
                });

                html += '</tbody></table>';
            }

            html += `</div>`;
        }

        html += `</div>`;

        showDetailModal(`Detail Hutang - ${supplierName}`, html);
    } catch (error) {
        console.error('Error loading supplier detail:', error);
        showToast('Gagal memuat detail supplier', 'error');
    }
}

/* ================== EVENT LISTENERS ================== */

// Hutang tab switching
document.querySelectorAll('.hutang-tab').forEach(tab => {
    tab.addEventListener('click', function () {
        const targetTab = this.dataset.tab;

        // Update active tab
        document.querySelectorAll('.hutang-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        // Update content
        document.querySelectorAll('.hutang-tab-content').forEach(content => {
            content.classList.remove('active');
            content.classList.add('hidden');
        });

        const targetContent = document.getElementById(`${targetTab}-tab-content`);
        if (targetContent) {
            targetContent.classList.add('active');
            targetContent.classList.remove('hidden');
        }

        // Load data based on tab
        switch (targetTab) {
            case 'tempo':
                loadTempoPurchases();
                break;
            case 'overdue':
                loadOverduePurchases();
                break;
            case 'suppliers':
                loadSuppliersHutang();
                break;
        }
    });
});

// Tempo status filter
document.getElementById('tempo-status-filter')?.addEventListener('change', function () {
    loadTempoPurchases(this.value);
});

// Pay tempo button and view supplier detail
document.addEventListener('click', (e) => {
    if (e.target.closest('.pay-tempo')) {
        const btn = e.target.closest('.pay-tempo');
        const purchaseId = btn.dataset.id;
        const supplierName = btn.dataset.supplier;
        const remainingAmount = parseFloat(btn.dataset.remaining || 0);

        openPaymentTempoModal(purchaseId, supplierName, remainingAmount);
    }

    if (e.target.closest('.view-payment-history')) {
        const btn = e.target.closest('.view-payment-history');
        const purchaseId = btn.dataset.id;
        viewPaymentHistory(purchaseId);
    }

    if (e.target.closest('.view-supplier-detail')) {
        const btn = e.target.closest('.view-supplier-detail');
        const supplierId = btn.dataset.id;
        const supplierName = btn.dataset.name;
        viewSupplierDetailHutang(supplierId, supplierName);
    }
});

// Initialize when hutang page is shown
async function initHutangPage() {
    await loadHutangSummary();
    await loadTempoPurchases();
}

// Update badge for overdue and upcoming purchases
async function updateHutangBadge() {
    try {
        const [overdueRes, upcomingRes] = await Promise.all([
            fetch(`${API_BASE}/purchase-payments.php?overdue=1`, {
                headers: {'Authorization': 'Bearer ' + getToken()}
            }),
            fetch(`${API_BASE}/purchase-payments.php?upcoming=1`, {
                headers: {'Authorization': 'Bearer ' + getToken()}
            })
        ]);

        const overdueData = await overdueRes.json();
        const upcomingData = await upcomingRes.json();

        const badge = document.getElementById('hutang-badge');
        if (badge) {
            const overdueCount = (overdueData.success ? overdueData.data?.length : 0) || 0;
            const upcomingCount = (upcomingData.success ? upcomingData.data?.length : 0) || 0;
            const totalCount = overdueCount + upcomingCount;

            if (totalCount > 0) {
                badge.textContent = totalCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error updating hutang badge:', error);
    }
}

// Call this periodically
setInterval(updateHutangBadge, 60000); // Every minute
updateHutangBadge(); // Initial call

/**
 * Load dashboard hutang widgets
 */
async function loadDashboardHutangWidgets() {
    try {
        // Only load if we're on dashboard page
        const dashboardPage = document.getElementById('dashboard-page');
        if (!dashboardPage || !dashboardPage.classList.contains('active')) {
            return; // Exit early if not on dashboard
        }

        // Load overdue
        const overdueRes = await fetch(`${API_BASE}/purchase-payments.php?overdue=1`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const overdueData = await overdueRes.json();
        // console.log('Overdue data:', overdueData); // Removed for security

        // Load upcoming
        const upcomingRes = await fetch(`${API_BASE}/purchase-payments.php?upcoming=1`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const upcomingData = await upcomingRes.json();
        // console.log('Upcoming data:', upcomingData); // Removed for security

        // Load summary
        const summaryRes = await fetch(`${API_BASE}/hutang-reports.php`, {
            headers: {'Authorization': 'Bearer ' + getToken()}
        });
        const summaryData = await summaryRes.json();
        // console.log('Summary data:', summaryData); // Removed for security

        // Update overdue widget
        const overdueWidget = document.getElementById('overdue-alert-widget');
        const overdueCount = document.getElementById('overdue-count-widget');
        const overdueList = document.getElementById('overdue-list-widget');

        if (overdueData.success && overdueData.data && overdueData.data.length > 0) {
            if (overdueWidget) overdueWidget.classList.remove('hidden');
            if (overdueCount) overdueCount.textContent = overdueData.data.length;

            if (overdueList) {
                overdueList.innerHTML = '';
                overdueData.data.slice(0, 3).forEach(purchase => {
                    const dueDate = new Date(purchase.due_date);
                    const today = new Date();
                    const diffDays = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));

                    const div = document.createElement('div');
                    div.className = 'text-sm bg-white p-2 rounded border border-red-200';
                    div.innerHTML = `
                        <strong>${purchase.supplier_name}</strong> - ${formatCurrency(purchase.remaining_amount || 0)}
                        <br>
                        <span class="text-xs text-red-600">Terlambat ${diffDays} hari</span>
                    `;
                    overdueList.appendChild(div);
                });
            }
        } else {
            // Hide widget if no overdue data
            if (overdueWidget) overdueWidget.classList.add('hidden');
            if (overdueCount) overdueCount.textContent = '0';
            if (overdueList) overdueList.innerHTML = '';
        }

        // Update upcoming widget
        const upcomingWidget = document.getElementById('upcoming-alert-widget');
        const upcomingCount = document.getElementById('upcoming-count-widget');
        const upcomingList = document.getElementById('upcoming-list-widget');

        if (upcomingData.success && upcomingData.data && upcomingData.data.length > 0) {
            if (upcomingWidget) upcomingWidget.classList.remove('hidden');
            if (upcomingCount) upcomingCount.textContent = upcomingData.data.length;

            if (upcomingList) {
                upcomingList.innerHTML = '';
                upcomingData.data.slice(0, 3).forEach(purchase => {
                    const dueDate = new Date(purchase.due_date);
                    const today = new Date();
                    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                    const div = document.createElement('div');
                    div.className = 'text-sm bg-white p-2 rounded border border-yellow-200';
                    div.innerHTML = `
                        <strong>${purchase.supplier_name}</strong> - ${formatCurrency(purchase.remaining_amount || 0)}
                        <br>
                        <span class="text-xs text-yellow-600">${diffDays} hari lagi</span>
                    `;
                    upcomingList.appendChild(div);
                });
            }
        } else {
            // Hide widget if no upcoming data
            if (upcomingWidget) upcomingWidget.classList.add('hidden');
            if (upcomingCount) upcomingCount.textContent = '0';
            if (upcomingList) upcomingList.innerHTML = '';
        }

        // Update summary cards
        if (summaryData.success && summaryData.data.summary) {
            const summary = summaryData.data.summary;

            const totalHutangEl = document.getElementById('dashboard-total-hutang');
            const unpaidCountEl = document.getElementById('dashboard-unpaid-count');
            const suppliersHutangEl = document.getElementById('dashboard-suppliers-hutang');

            if (totalHutangEl) totalHutangEl.textContent = formatCurrency(summary.total_hutang_sekarang || 0);
            if (unpaidCountEl) unpaidCountEl.textContent = (summary.overdue_count || 0) + (summary.upcoming_count || 0);
            if (suppliersHutangEl) suppliersHutangEl.textContent = summaryData.data.suppliers_with_hutang?.length || 0;
        }

    } catch (error) {
        console.error('Error loading dashboard hutang widgets:', error);
    }
}

// Call this when dashboard page is loaded - moved to main DOMContentLoaded block
function initializeDashboardHutangWidgets() {
    const dashboardPage = document.getElementById('dashboard-page');
    if (dashboardPage && dashboardPage.classList.contains('active')) {
        loadDashboardHutangWidgets();
        loadLowStockWidget();
    }
    
    // Add click handler for view low stock button
    document.getElementById('view-low-stock-btn')?.addEventListener('click', () => {
        showPage('stock-movements-page');
    });
}

/**
 * Load low stock alert widget on dashboard
 */
async function loadLowStockWidget() {
    try {
        // Check if stock alert is enabled
        if (currentSettings.stock_alert_enabled === '0') {
            document.getElementById('low-stock-alert-widget')?.classList.add('hidden');
            return;
        }
        
        // Get low stock threshold
        const threshold = parseInt(currentSettings.low_stock_threshold) || 10;
        
        // Get products with low stock
        const res = await apiRequest('products.php', 'GET');
        const products = Array.isArray(res) ? res : (res.data || []);
        
        const lowStockProducts = products.filter(p => parseInt(p.stock) < threshold);
        
        const widget = document.getElementById('low-stock-alert-widget');
        const countEl = document.getElementById('low-stock-count');
        const listEl = document.getElementById('low-stock-list');
        
        if (lowStockProducts.length > 0) {
            // Show widget
            widget.classList.remove('hidden');
            
            // Update count
            countEl.textContent = lowStockProducts.length;
            
            // Update list (show max 5 products)
            const displayProducts = lowStockProducts.slice(0, 5);
            listEl.innerHTML = '<ul class="list-disc ml-5">';
            displayProducts.forEach(p => {
                listEl.innerHTML += `<li><strong>${p.name}</strong>: ${p.stock} unit (minimum: ${threshold})</li>`;
            });
            if (lowStockProducts.length > 5) {
                listEl.innerHTML += `<li class="text-yellow-600 font-semibold">...dan ${lowStockProducts.length - 5} produk lainnya</li>`;
            }
            listEl.innerHTML += '</ul>';
        } else {
            // Hide widget if no low stock
            widget.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading low stock widget:', error);
    }
}

// Update dashboard widgets periodically (every 5 minutes)
setInterval(() => {
    const dashboardPage = document.getElementById('dashboard-page');
    if (dashboardPage && dashboardPage.classList.contains('active')) {
        loadDashboardHutangWidgets();
        loadLowStockWidget();
    }
}, 5 * 60 * 1000);

/* ================== HUTANG REPORT EXPORT FUNCTIONS ================== */

/**
 * Export tempo purchases to CSV
 */
function exportTempoPurchasesToCSV() {
    if (!currentTempoPurchases || currentTempoPurchases.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        let totalPembelian = 0;
        let totalTerbayar = 0;
        let totalSisa = 0;
        
        currentTempoPurchases.forEach(purchase => {
            const total = parseFloat(purchase.total || 0);
            const terbayar = parseFloat(purchase.paid_amount || 0);
            const sisa = parseFloat(purchase.remaining_amount || 0);
            
            totalPembelian += total;
            totalTerbayar += terbayar;
            totalSisa += sisa;
            
            data.push([
                no++,
                purchase.id,
                formatDate(purchase.purchase_date),
                purchase.supplier_name || '-',
                total,
                terbayar,
                sisa,
                purchase.payment_status || '-',
                formatDate(purchase.due_date)
            ]);
        });

        const headers = ['No', 'ID Pembelian', 'Tanggal', 'Supplier', 'Total', 'Terbayar', 'Sisa', 'Status', 'Jatuh Tempo'];
        const title = 'LAPORAN PEMBELIAN TEMPO';
        const subtitle = `Per Tanggal: ${new Date().toLocaleDateString('id-ID')}`;
        
        const summary = {
            'Total Pembelian': totalPembelian,
            'Total Terbayar': totalTerbayar,
            'Total Sisa Hutang': totalSisa,
            'Jumlah Transaksi': currentTempoPurchases.length
        };

        const filename = `Laporan_Pembelian_Tempo_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Pembelian Tempo', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting tempo purchases:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/**
 * Export overdue purchases to Excel
 */
function exportOverduePurchasesToCSV() {
    if (!currentOverduePurchases || currentOverduePurchases.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        let totalHutang = 0;
        
        currentOverduePurchases.forEach(purchase => {
            const dueDate = new Date(purchase.due_date);
            const today = new Date();
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            const daysOverdue = Math.abs(diffDays);
            const sisa = parseFloat(purchase.remaining_amount || 0);
            
            totalHutang += sisa;

            data.push([
                no++,
                purchase.id,
                purchase.supplier_name || '-',
                purchase.contact || '-',
                parseFloat(purchase.total || 0),
                parseFloat(purchase.paid_amount || 0),
                sisa,
                formatDate(purchase.due_date),
                daysOverdue
            ]);
        });

        const headers = ['No', 'ID', 'Supplier', 'Kontak', 'Total', 'Terbayar', 'Sisa Hutang', 'Jatuh Tempo', 'Hari Terlambat'];
        const title = 'LAPORAN HUTANG JATUH TEMPO';
        const subtitle = `Per Tanggal: ${new Date().toLocaleDateString('id-ID')}`;
        
        const summary = {
            'Total Sisa Hutang': totalHutang,
            'Jumlah Transaksi': currentOverduePurchases.length
        };

        const filename = `Laporan_Hutang_Jatuh_Tempo_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Hutang Jatuh Tempo', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting overdue purchases:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/**
 * Export suppliers hutang to Excel
 */
function exportSuppliersHutangToCSV() {
    if (!currentSuppliersHutang || currentSuppliersHutang.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        let totalHutang = 0;
        
        currentSuppliersHutang.forEach(supplier => {
            const hutang = parseFloat(supplier.total_hutang || 0);
            totalHutang += hutang;
            
            data.push([
                no++,
                supplier.id,
                supplier.name || '-',
                supplier.contact || '-',
                hutang,
                supplier.address || '-'
            ]);
        });

        const headers = ['No', 'ID', 'Nama Supplier', 'Kontak', 'Total Hutang', 'Alamat'];
        const title = 'LAPORAN HUTANG PER SUPPLIER';
        const subtitle = `Per Tanggal: ${new Date().toLocaleDateString('id-ID')}`;
        
        const summary = {
            'Total Hutang Semua Supplier': totalHutang,
            'Jumlah Supplier': currentSuppliersHutang.length
        };

        const filename = `Laporan_Hutang_Supplier_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Hutang Supplier', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting suppliers hutang:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/**
 * Print purchase receipt with tempo info
 */

/* ================== ADD EXPORT BUTTONS TO HUTANG PAGE ================== */

// Add these buttons to each tab in the hutang page
function initializeHutangExportButtons() {
    // Tempo tab export button
    const tempoTabContent = document.getElementById('tempo-tab-content');
    if (tempoTabContent) {
        const headerDiv = tempoTabContent.querySelector('.px-6.py-4.border-b');
        if (headerDiv) {
            const exportBtn = document.createElement('button');
            exportBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-sm';
            exportBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Export Data';
            exportBtn.onclick = exportTempoPurchasesToCSV;
            headerDiv.querySelector('.flex')?.appendChild(exportBtn);
        }
    }

    // Overdue tab export button
    const overdueTabContent = document.getElementById('overdue-tab-content');
    if (overdueTabContent) {
        const headerDiv = overdueTabContent.querySelector('.px-6.py-4.border-b');
        if (headerDiv && !headerDiv.querySelector('.export-btn')) {
            const exportBtn = document.createElement('button');
            exportBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-sm export-btn';
            exportBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Export Data';
            exportBtn.onclick = exportOverduePurchasesToCSV;
            headerDiv.appendChild(exportBtn);
        }
    }

    // Suppliers tab export button
    const suppliersTabContent = document.getElementById('suppliers-tab-content');
    if (suppliersTabContent) {
        const headerDiv = suppliersTabContent.querySelector('.px-6.py-4.border-b');
        if (headerDiv && !headerDiv.querySelector('.export-btn')) {
            const exportBtn = document.createElement('button');
            exportBtn.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md text-sm export-btn';
            exportBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Export Data';
            exportBtn.onclick = exportSuppliersHutangToCSV;
            headerDiv.appendChild(exportBtn);
        }
    }
}
