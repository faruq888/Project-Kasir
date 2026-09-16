-- ================================================================
-- KASIR SYSTEM - DATABASE INITIALIZATION (NO DUMMY DATA)
-- Version: 2.0
-- ================================================================

DROP DATABASE IF EXISTS kasir;
CREATE DATABASE kasir CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kasir;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_username (username),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO users (username, password, role, status) VALUES
('admin', 'admin123', 'admin', 'active'),
('operator', 'operator123', 'operator', 'active'),
('kasir1', 'kasir123', 'operator', 'active');

-- ========================
-- 2. CATEGORIES TABLE
-- ========================
CREATE TABLE categories (
    code VARCHAR(15) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 3. SUPPLIERS TABLE
-- ========================
CREATE TABLE suppliers (
    id VARCHAR(15) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact VARCHAR(255),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_suppliers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 4. PRODUCTS TABLE
-- ========================
CREATE TABLE products (
    id VARCHAR(15) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    category_code VARCHAR(15),
    supplier_id VARCHAR(15),
    barcode VARCHAR(50) UNIQUE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_code) REFERENCES categories(code) ON DELETE SET NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    INDEX idx_products_name (name),
    INDEX idx_products_barcode (barcode),
    INDEX idx_products_category (category_code),
    INDEX idx_products_stock (stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 5. CUSTOMERS TABLE
-- ========================
CREATE TABLE customers (
    id VARCHAR(15) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    is_member TINYINT(1) DEFAULT 1,
    kas DECIMAL(10,2) DEFAULT 0,
    saldo_wajib_beli DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customers_name (name),
    INDEX idx_customers_phone (phone),
    INDEX idx_customers_member (is_member)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 6. PURCHASES TABLE
-- ========================
CREATE TABLE purchases (
    id VARCHAR(15) PRIMARY KEY,
    purchase_date DATETIME NOT NULL,
    supplier_id VARCHAR(15) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status ENUM('Selesai', 'Pending', 'Dibatalkan') NOT NULL DEFAULT 'Pending',
    payment_method ENUM('cash', 'tempo') NOT NULL DEFAULT 'cash',
    due_date DATE NULL,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    remaining_amount DECIMAL(10,2) DEFAULT 0,
    payment_status ENUM('Lunas', 'Belum Lunas', 'Sebagian') DEFAULT 'Lunas',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    INDEX idx_purchases_date (purchase_date),
    INDEX idx_purchases_supplier (supplier_id),
    INDEX idx_purchases_due_date (due_date),
    INDEX idx_purchases_payment_status (payment_status),
    INDEX idx_purchases_payment_method (payment_method),
    INDEX idx_purchases_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 7. PURCHASE_ITEMS TABLE
-- ========================
CREATE TABLE purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id VARCHAR(15) NOT NULL,
    product_id VARCHAR(15) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    buy_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_purchase_items_purchase (purchase_id),
    INDEX idx_purchase_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 8. PURCHASE_PAYMENTS TABLE
-- ========================
CREATE TABLE purchase_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id VARCHAR(15) NOT NULL,
    payment_date DATETIME NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash','transfer','debit') NOT NULL DEFAULT 'cash',
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    INDEX idx_payments_purchase (purchase_id),
    INDEX idx_payments_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 9. TRANSACTIONS TABLE
-- ========================
CREATE TABLE transactions (
    id VARCHAR(15) PRIMARY KEY,
    date DATETIME NOT NULL,
    customer VARCHAR(255) NOT NULL,
    customer_id VARCHAR(15) NULL,
    total DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash','transfer','debit','kas','saldo_wajib_beli') NOT NULL DEFAULT 'cash',
    status ENUM('Selesai', 'Pending', 'Dibatalkan') NOT NULL DEFAULT 'Selesai',
    note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transactions_customer_id (customer_id),
    INDEX idx_transactions_date (date),
    INDEX idx_transactions_customer (customer),
    CONSTRAINT fk_transactions_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 10. TRANSACTION_ITEMS TABLE
-- ========================
CREATE TABLE transaction_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(15) NOT NULL,
    product_id VARCHAR(15) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    INDEX idx_transaction_items_transaction (transaction_id),
    INDEX idx_transaction_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 11. STOCK_MOVEMENTS TABLE
-- ========================
CREATE TABLE stock_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id VARCHAR(15) NOT NULL,
    movement_type ENUM('in', 'out', 'adjustment') NOT NULL,
    quantity INT NOT NULL,
    reference_type ENUM('purchase', 'transaction', 'manual') NOT NULL,
    reference_id VARCHAR(15) NULL,
    notes TEXT NULL,
    stock_before INT NOT NULL DEFAULT 0,
    stock_after INT NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_stock_movements_product (product_id),
    INDEX idx_stock_movements_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 12. KAS_MUTATIONS TABLE
-- ========================
CREATE TABLE kas_mutations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id VARCHAR(15) NOT NULL,
    type ENUM('setor','tarik','belanja') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    transaction_id VARCHAR(15) NULL,
    is_rollback TINYINT(1) NOT NULL DEFAULT 0,
    origin VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 13. WAJIB_BELI_MUTATIONS TABLE
-- ========================
CREATE TABLE wajib_beli_mutations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id VARCHAR(15) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    transaction_id VARCHAR(15) NULL,
    is_rollback TINYINT(1) NOT NULL DEFAULT 0,
    origin VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 14. HUTANG_MUTATIONS TABLE
-- ========================
CREATE TABLE hutang_mutations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id VARCHAR(15) NOT NULL,
    type ENUM('hutang','bayar') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    purchase_id VARCHAR(15) NULL,
    due_date DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 15. SUPPLIER_RECEIVABLES TABLE
-- ========================
CREATE TABLE supplier_receivables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id VARCHAR(15) NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    remaining_amount DECIMAL(15,2) NOT NULL,
    due_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Belum Lunas',
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE supplier_receivable_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receivable_id INT NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
    notes TEXT NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receivable_id) REFERENCES supplier_receivables(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 15. NERACA TABLE
-- ========================
CREATE TABLE neraca (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATETIME NOT NULL,
    category ENUM(
        'saldo_awal',
        'penjualan',
        'piutang',
        'pembelian_cash',
        'pembelian_tempo',
        'pembayaran_hutang',
        'simpanan_wajib_beli',
        'pengeluaran_wajib_beli',
        'simpanan_barang',
        'setoran_kas',
        'penarikan_kas',
        'pengembalian_supplier',
        'pembayaran_listrik',
        'pembelian_atk',
        'operasional_lain'
    ) NOT NULL,
    type ENUM('pemasukan', 'pengeluaran') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    reference_type ENUM('transaction', 'purchase', 'payment', 'kas_mutation', 'wajib_beli_mutation', 'manual') NOT NULL,
    reference_id VARCHAR(50) NULL,
    created_by VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 16. SETTINGS TABLE
-- ========================
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================
-- 17. UPLOADS TABLE
-- ========================
CREATE TABLE uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size INT NOT NULL,
    upload_type VARCHAR(50) NOT NULL COMMENT 'logo, document, image, other',
    uploaded_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- DATABASE INITIALIZATION COMPLETED
-- ================================================================
SELECT 'Database structure created successfully (no dummy data)' AS status;
