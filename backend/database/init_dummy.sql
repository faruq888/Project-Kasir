-- ================================================================
-- KASIR SYSTEM - COMPLETE DATABASE INITIALIZATION
-- Version: 2.0 (Complete with all features)
-- Date: 2025-10-18
-- Description: Complete database schema with dummy data for testing
-- ================================================================

-- Drop existing database and recreate (WARNING: This will delete all data!)
-- Comment these lines if you want to preserve data
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

INSERT INTO categories (code, name) VALUES
('CAT001', 'Minuman'),
('CAT002', 'Makanan Ringan'),
('CAT003', 'Sembako'),
('CAT004', 'Perlengkapan Rumah Tangga'),
('CAT005', 'Alat Tulis Kantor'),
('CAT006', 'Elektronik');

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

INSERT INTO suppliers (id, name, contact, address) VALUES
('SUP001', 'PT Sumber Jaya Abadi', '081234567890', 'Jl. Raya Tlogomas No. 23, Malang'),
('SUP002', 'CV Indo Snack', '081298765432', 'Jl. Soekarno Hatta No. 17, Malang'),
('SUP003', 'UD Bumi Rejeki', '081333224455', 'Jl. MT Haryono No. 45, Malang'),
('SUP004', 'PT Berkah Makmur', '081456789012', 'Jl. Veteran No. 88, Malang'),
('SUP005', 'CV Sejahtera', '081567890123', 'Jl. Bandung No. 12, Malang'),
('SUP006', 'PT Maju Jaya Elektronik', '081678901234', 'Jl. Diponegoro No. 67, Malang'),
('SUP007', 'CV Aneka Rasa', '081789012345', 'Jl. Gatot Subroto No. 34, Malang'),
('SUP008', 'UD Mitra Sejahtera', '081890123456', 'Jl. Ahmad Yani No. 56, Malang'),
('SUP009', 'PT Cahaya Terang', '081901234567', 'Jl. Pahlawan No. 78, Malang'),
('SUP010', 'CV Harapan Baru', '081012345678', 'Jl. Sudirman No. 45, Malang'),
('SUP011', 'PT Wijaya Kusuma', '081123456789', 'Jl. Kartini No. 23, Malang'),
('SUP012', 'UD Sari Rasa', '081234567891', 'Jl. Cut Nyak Dien No. 12, Malang'),
('SUP013', 'CV Barokah Makmur', '081345678902', 'Jl. Dewi Sartika No. 34, Malang'),
('SUP014', 'PT Indo Makmur', '081456789013', 'Jl. Jendral Sudirman No. 89, Malang'),
('SUP015', 'CV Sumber Berkah', '081567890124', 'Jl. RA Kartini No. 56, Malang'),
('SUP016', 'UD Rizki Abadi', '081678901235', 'Jl. Patimura No. 67, Malang'),
('SUP017', 'PT Global Trade', '081789012346', 'Jl. Hayam Wuruk No. 78, Malang'),
('SUP018', 'CV Sentosa Jaya', '081890123457', 'Jl. Gajah Mada No. 45, Malang'),
('SUP019', 'UD Mandiri Sejahtera', '081901234568', 'Jl. Majapahit No. 23, Malang'),
('SUP020', 'PT Nusantara Sejahtera', '081012345679', 'Jl. Brawijaya No. 90, Malang');

-- ========================
-- 4. PRODUCTS TABLE (with barcode)
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

INSERT INTO products (id, name, price, stock, category_code, supplier_id, barcode) VALUES
('PRD001', 'Aqua Botol 600ml', 5000, 100, 'CAT001', 'SUP001', '8991002101204'),
('PRD002', 'Indomie Goreng', 3500, 200, 'CAT002', 'SUP002', '8992771123456'),
('PRD003', 'Gula Pasir 1kg', 14500, 50, 'CAT003', 'SUP003', '8991234567890'),
('PRD004', 'Rinso 800g', 21000, 40, 'CAT004', 'SUP001', '8995432109876'),
('PRD005', 'Teh Pucuk Harum 350ml', 4000, 150, 'CAT001', 'SUP002', '8998009010101'),
('PRD006', 'Chitato Rasa Sapi Panggang', 11000, 80, 'CAT002', 'SUP002', '8996001300015'),
('PRD007', 'Beras Premium 5kg', 75000, 25, 'CAT003', 'SUP003', '8991100112233'),
('PRD008', 'Molto Pelembut 800ml', 18500, 5, 'CAT004', 'SUP004', '8998899001122'),
('PRD009', 'Pulpen Standard', 2500, 8, 'CAT005', 'SUP005', '8887776665544'),
('PRD010', 'Baterai AA Alkaline', 12000, 60, 'CAT006', 'SUP004', '8889990001122'),
('PRD011', 'Coca Cola 390ml', 6000, 120, 'CAT001', 'SUP007', '8992761213459'),
('PRD012', 'Mie Sedaap Soto', 3500, 180, 'CAT002', 'SUP002', '8998009990012'),
('PRD013', 'Kopi Kapal Api Special Mix', 13000, 90, 'CAT001', 'SUP012', '8992696211124'),
('PRD014', 'Susu Indomilk UHT 1L', 17500, 70, 'CAT001', 'SUP001', '8992753610014'),
('PRD015', 'Minyak Goreng Bimoli 2L', 35000, 45, 'CAT003', 'SUP003', '8996001600207'),
('PRD016', 'Shampo Pantene 170ml', 22000, 55, 'CAT004', 'SUP006', '4902430634229'),
('PRD017', 'Sabun Mandi Lifebuoy 85g', 4500, 95, 'CAT004', 'SUP001', '8999999047405'),
('PRD018', 'Tissue Nice 250s', 8500, 75, 'CAT004', 'SUP008', '8997008880138'),
('PRD019', 'Pensil 2B Set isi 12', 15000, 40, 'CAT005', 'SUP005', '8887000112234'),
('PRD020', 'Kabel USB Type-C 1m', 25000, 35, 'CAT006', 'SUP006', '8889991112223'),
('PRD021', 'Sikat Gigi Pepsodent', 7000, 100, 'CAT004', 'SUP009', '8999999544522'),
('PRD022', 'Roti Tawar Sari Roti', 12000, 20, 'CAT002', 'SUP012', '8996001301005'),
('PRD023', 'Air Mineral Vit 600ml', 3500, 150, 'CAT001', 'SUP001', '8996006855008'),
('PRD024', 'Tepung Terigu Segitiga Biru 1kg', 11500, 60, 'CAT003', 'SUP003', '8992741101004'),
('PRD025', 'Sabun Cuci Piring Sunlight 750ml', 16000, 48, 'CAT004', 'SUP009', '8999999020453');

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

INSERT INTO customers (id, name, phone, address, is_member, kas, saldo_wajib_beli) VALUES
('CUST001', 'Budi Santoso', '081278945621', 'Jl. Mawar No. 9, Malang', 1, 50000, 20000),
('CUST002', 'Siti Aminah', '081239874561', 'Jl. Melati No. 21, Malang', 1, 100000, 50000),
('CUST003', 'Ahmad Dahlan', '081345678912', 'Jl. Kenanga No. 15, Malang', 1, 75000, 30000),
('CUST004', 'Rina Wati', '081456789123', 'Jl. Anggrek No. 7, Malang', 1, 120000, 40000),
('CUST005', 'Joko Widodo', '081567890234', 'Jl. Teratai No. 33, Malang', 1, 0, 0),
('CUST006', 'Dewi Sartika', '081678901345', 'Jl. Cempaka No. 12, Malang', 1, 85000, 35000),
('CUST007', 'Bambang Prasetyo', '081789012456', 'Jl. Dahlia No. 18, Malang', 1, 150000, 60000),
('CUST008', 'Fitri Handayani', '081890123567', 'Jl. Flamboyan No. 24, Malang', 1, 95000, 45000),
('CUST009', 'Hendra Gunawan', '081901234678', 'Jl. Sakura No. 31, Malang', 1, 110000, 50000),
('CUST010', 'Nurul Hidayah', '081012345789', 'Jl. Tulip No. 8, Malang', 1, 65000, 25000),
('CUST011', 'Agus Setiawan', '081123456890', 'Jl. Kamboja No. 14, Malang', 1, 200000, 80000),
('CUST012', 'Linda Kusuma', '081234567901', 'Jl. Orchid No. 19, Malang', 1, 40000, 15000),
('CUST013', 'Hadi Wijaya', '081345679012', 'Jl. Matahari No. 27, Malang', 1, 130000, 55000),
('CUST014', 'Sri Wahyuni', '081456790123', 'Jl. Bulan No. 36, Malang', 1, 90000, 38000),
('CUST015', 'Rahmat Hidayat', '081567901234', 'Jl. Bintang No. 5, Malang', 1, 175000, 70000),
('CUST016', 'Yuni Astuti', '081679012345', 'Jl. Pelangi No. 22, Malang', 1, 55000, 22000),
('CUST017', 'Dedi Kurniawan', '081790123456', 'Jl. Surya No. 41, Malang', 1, 105000, 42000),
('CUST018', 'Eka Putri', '081901234567', 'Jl. Mentari No. 16, Malang', 1, 80000, 33000),
('CUST019', 'Fajar Ramadhan', '081012345678', 'Jl. Senja No. 29, Malang', 1, 125000, 48000),
('CUST020', 'Sari Dewi', '081123456789', 'Jl. Fajar No. 11, Malang', 1, 70000, 28000),
('CUST021', 'Andi Pratama', '081234567890', 'Jl. Cemara No. 20, Malang', 1, 160000, 65000),
('CUST022', 'Maya Sari', '081345678901', 'Jl. Pinus No. 38, Malang', 1, 45000, 18000),
('CUST023', 'Bima Sakti', '081456789012', 'Jl. Beringin No. 44, Malang', 1, 95000, 40000),
('CUST024', 'Citra Lestari', '081567890123', 'Jl. Akasia No. 13, Malang', 1, 135000, 52000),
('CUST025', 'Rizki Ramadhan', '081678901234', 'Jl. Palem No. 25, Malang', 1, 85000, 34000);

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

INSERT INTO purchases (id, purchase_date, supplier_id, total_price, status, payment_method, due_date, paid_amount, remaining_amount, payment_status) VALUES
('PUR001', '2025-10-01 10:00:00', 'SUP001', 250000, 'Selesai', 'cash', NULL, 250000, 0, 'Lunas'),
('PUR002', '2025-10-05 15:30:00', 'SUP003', 1200000, 'Pending', 'tempo', '2025-11-05', 0, 1200000, 'Belum Lunas'),
('PUR003', '2025-10-10 09:00:00', 'SUP002', 500000, 'Selesai', 'cash', NULL, 500000, 0, 'Lunas'),
('PUR004', '2025-10-15 14:20:00', 'SUP004', 800000, 'Pending', 'tempo', '2025-11-15', 300000, 500000, 'Sebagian'),
('PUR005', '2025-10-02 11:30:00', 'SUP006', 350000, 'Selesai', 'cash', NULL, 350000, 0, 'Lunas'),
('PUR006', '2025-10-03 08:45:00', 'SUP007', 680000, 'Selesai', 'cash', NULL, 680000, 0, 'Lunas'),
('PUR007', '2025-10-04 14:00:00', 'SUP008', 920000, 'Pending', 'tempo', '2025-11-04', 400000, 520000, 'Sebagian'),
('PUR008', '2025-10-06 09:15:00', 'SUP009', 475000, 'Selesai', 'cash', NULL, 475000, 0, 'Lunas'),
('PUR009', '2025-10-07 16:20:00', 'SUP010', 1500000, 'Pending', 'tempo', '2025-11-07', 0, 1500000, 'Belum Lunas'),
('PUR010', '2025-10-08 10:30:00', 'SUP011', 635000, 'Selesai', 'cash', NULL, 635000, 0, 'Lunas'),
('PUR011', '2025-10-09 13:45:00', 'SUP012', 890000, 'Selesai', 'cash', NULL, 890000, 0, 'Lunas'),
('PUR012', '2025-10-11 15:10:00', 'SUP013', 1100000, 'Pending', 'tempo', '2025-11-11', 500000, 600000, 'Sebagian'),
('PUR013', '2025-10-12 08:25:00', 'SUP014', 725000, 'Selesai', 'cash', NULL, 725000, 0, 'Lunas'),
('PUR014', '2025-10-13 11:40:00', 'SUP015', 980000, 'Selesai', 'cash', NULL, 980000, 0, 'Lunas'),
('PUR015', '2025-10-14 14:55:00', 'SUP016', 1350000, 'Pending', 'tempo', '2025-11-14', 0, 1350000, 'Belum Lunas'),
('PUR016', '2025-10-16 09:30:00', 'SUP017', 565000, 'Selesai', 'cash', NULL, 565000, 0, 'Lunas'),
('PUR017', '2025-10-17 12:15:00', 'SUP018', 835000, 'Pending', 'tempo', '2025-11-17', 300000, 535000, 'Sebagian'),
('PUR018', '2025-10-18 15:40:00', 'SUP019', 1250000, 'Selesai', 'cash', NULL, 1250000, 0, 'Lunas'),
('PUR019', '2025-10-19 10:20:00', 'SUP020', 790000, 'Selesai', 'cash', NULL, 790000, 0, 'Lunas'),
('PUR020', '2025-10-20 13:50:00', 'SUP001', 1425000, 'Pending', 'tempo', '2025-11-20', 600000, 825000, 'Sebagian'),
('PUR021', '2025-10-21 08:00:00', 'SUP005', 695000, 'Selesai', 'cash', NULL, 695000, 0, 'Lunas'),
('PUR022', '2025-10-22 16:30:00', 'SUP010', 1180000, 'Pending', 'tempo', '2025-11-22', 0, 1180000, 'Belum Lunas');

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

INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, buy_price, subtotal) VALUES
('PUR001', 'PRD001', 'Aqua Botol 600ml', 50, 4000, 200000),
('PUR001', 'PRD002', 'Indomie Goreng', 20, 2500, 50000),
('PUR002', 'PRD003', 'Gula Pasir 1kg', 80, 15000, 1200000),
('PUR003', 'PRD005', 'Teh Pucuk Harum 350ml', 100, 3000, 300000),
('PUR003', 'PRD006', 'Chitato Rasa Sapi Panggang', 20, 10000, 200000),
('PUR004', 'PRD007', 'Beras Premium 5kg', 10, 70000, 700000),
('PUR004', 'PRD008', 'Molto Pelembut 800ml', 5, 16000, 80000),
('PUR005', 'PRD016', 'Shampo Pantene 170ml', 15, 20000, 300000),
('PUR005', 'PRD017', 'Sabun Mandi Lifebuoy 85g', 20, 3500, 70000),
('PUR006', 'PRD011', 'Coca Cola 390ml', 80, 5000, 400000),
('PUR006', 'PRD014', 'Susu Indomilk UHT 1L', 20, 16000, 320000),
('PUR007', 'PRD018', 'Tissue Nice 250s', 40, 7500, 300000),
('PUR007', 'PRD025', 'Sabun Cuci Piring Sunlight 750ml', 50, 14000, 700000),
('PUR008', 'PRD021', 'Sikat Gigi Pepsodent', 40, 6000, 240000),
('PUR008', 'PRD022', 'Roti Tawar Sari Roti', 25, 10500, 262500),
('PUR009', 'PRD015', 'Minyak Goreng Bimoli 2L', 30, 32000, 960000),
('PUR009', 'PRD024', 'Tepung Terigu Segitiga Biru 1kg', 60, 10000, 600000),
('PUR010', 'PRD012', 'Mie Sedaap Soto', 100, 2800, 280000),
('PUR010', 'PRD013', 'Kopi Kapal Api Special Mix', 30, 12000, 360000),
('PUR011', 'PRD022', 'Roti Tawar Sari Roti', 50, 10500, 525000),
('PUR011', 'PRD023', 'Air Mineral Vit 600ml', 120, 2800, 336000),
('PUR012', 'PRD003', 'Gula Pasir 1kg', 50, 13000, 650000),
('PUR012', 'PRD007', 'Beras Premium 5kg', 8, 72000, 576000),
('PUR013', 'PRD019', 'Pensil 2B Set isi 12', 30, 13000, 390000),
('PUR013', 'PRD020', 'Kabel USB Type-C 1m', 15, 22000, 330000),
('PUR014', 'PRD004', 'Rinso 800g', 30, 19000, 570000),
('PUR014', 'PRD008', 'Molto Pelembut 800ml', 25, 17000, 425000),
('PUR015', 'PRD015', 'Minyak Goreng Bimoli 2L', 25, 32000, 800000),
('PUR015', 'PRD017', 'Sabun Mandi Lifebuoy 85g', 80, 3500, 280000),
('PUR015', 'PRD021', 'Sikat Gigi Pepsodent', 45, 6000, 270000),
('PUR016', 'PRD011', 'Coca Cola 390ml', 60, 5000, 300000),
('PUR016', 'PRD023', 'Air Mineral Vit 600ml', 90, 2800, 252000),
('PUR017', 'PRD006', 'Chitato Rasa Sapi Panggang', 35, 10000, 350000),
('PUR017', 'PRD013', 'Kopi Kapal Api Special Mix', 40, 12000, 480000),
('PUR018', 'PRD007', 'Beras Premium 5kg', 15, 72000, 1080000),
('PUR018', 'PRD024', 'Tepung Terigu Segitiga Biru 1kg', 20, 10000, 200000),
('PUR019', 'PRD016', 'Shampo Pantene 170ml', 25, 20000, 500000),
('PUR019', 'PRD018', 'Tissue Nice 250s', 40, 7500, 300000),
('PUR020', 'PRD002', 'Indomie Goreng', 200, 2800, 560000),
('PUR020', 'PRD012', 'Mie Sedaap Soto', 150, 2800, 420000),
('PUR020', 'PRD005', 'Teh Pucuk Harum 350ml', 100, 3200, 320000),
('PUR021', 'PRD010', 'Baterai AA Alkaline', 40, 10500, 420000),
('PUR021', 'PRD020', 'Kabel USB Type-C 1m', 12, 22000, 264000),
('PUR022', 'PRD003', 'Gula Pasir 1kg', 60, 13000, 780000),
('PUR022', 'PRD015', 'Minyak Goreng Bimoli 2L', 15, 32000, 480000);

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

INSERT INTO purchase_payments (purchase_id, payment_date, amount, payment_method, notes, created_by) VALUES
('PUR001', '2025-10-01 10:30:00', 250000, 'cash', 'Lunas di tempat', 'admin'),
('PUR003', '2025-10-10 09:15:00', 500000, 'cash', 'Pembayaran full', 'admin'),
('PUR004', '2025-10-16 11:00:00', 300000, 'cash', 'Cicilan pertama', 'admin');

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

INSERT INTO transactions (id, date, customer, customer_id, total, payment_method, status, note) VALUES
('TRX001', '2025-10-12 12:00:00', 'Budi Santoso', 'CUST001', 20000, 'cash', 'Selesai', 'Pembelian harian'),
('TRX002', '2025-10-13 09:30:00', 'Siti Aminah', 'CUST002', 35000, 'kas', 'Selesai', 'Gunakan kas anggota'),
('TRX003', '2025-10-14 15:20:00', 'Ahmad Dahlan', 'CUST003', 50000, 'cash', 'Selesai', NULL),
('TRX004', '2025-10-15 10:45:00', 'Walk-in Customer', NULL, 15000, 'cash', 'Selesai', 'Customer umum'),
('TRX005', '2025-10-16 14:00:00', 'Rina Wati', 'CUST004', 75000, 'transfer', 'Selesai', 'Transfer BCA'),
('TRX006', '2025-10-16 10:15:00', 'Dewi Sartika', 'CUST006', 45000, 'kas', 'Selesai', 'Belanja bulanan'),
('TRX007', '2025-10-17 08:30:00', 'Bambang Prasetyo', 'CUST007', 87000, 'cash', 'Selesai', NULL),
('TRX008', '2025-10-17 11:45:00', 'Walk-in Customer', NULL, 23500, 'cash', 'Selesai', 'Customer umum'),
('TRX009', '2025-10-17 14:20:00', 'Fitri Handayani', 'CUST008', 62000, 'saldo_wajib_beli', 'Selesai', 'Pakai saldo wajib beli'),
('TRX010', '2025-10-18 09:00:00', 'Hendra Gunawan', 'CUST009', 95000, 'transfer', 'Selesai', 'Transfer Mandiri'),
('TRX011', '2025-10-18 13:15:00', 'Nurul Hidayah', 'CUST010', 38000, 'kas', 'Selesai', 'Belanja kebutuhan'),
('TRX012', '2025-10-19 10:30:00', 'Agus Setiawan', 'CUST011', 125000, 'cash', 'Selesai', 'Belanja besar'),
('TRX013', '2025-10-19 15:45:00', 'Linda Kusuma', 'CUST012', 27000, 'kas', 'Selesai', NULL),
('TRX014', '2025-10-20 08:20:00', 'Walk-in Customer', NULL, 18000, 'cash', 'Selesai', 'Customer umum'),
('TRX015', '2025-10-20 11:50:00', 'Hadi Wijaya', 'CUST013', 67500, 'debit', 'Selesai', 'BCA Debit'),
('TRX016', '2025-10-20 16:10:00', 'Sri Wahyuni', 'CUST014', 52000, 'kas', 'Selesai', NULL),
('TRX017', '2025-10-21 09:40:00', 'Rahmat Hidayat', 'CUST015', 98000, 'transfer', 'Selesai', 'Transfer BRI'),
('TRX018', '2025-10-21 12:25:00', 'Yuni Astuti', 'CUST016', 41000, 'kas', 'Selesai', 'Belanja mingguan'),
('TRX019', '2025-10-21 15:00:00', 'Walk-in Customer', NULL, 30000, 'cash', 'Selesai', 'Customer umum'),
('TRX020', '2025-10-22 08:50:00', 'Dedi Kurniawan', 'CUST017', 73500, 'cash', 'Selesai', NULL),
('TRX021', '2025-10-22 11:30:00', 'Eka Putri', 'CUST018', 56000, 'saldo_wajib_beli', 'Selesai', 'Pakai saldo wajib beli'),
('TRX022', '2025-10-22 14:40:00', 'Fajar Ramadhan', 'CUST019', 84000, 'kas', 'Selesai', NULL),
('TRX023', '2025-10-23 09:20:00', 'Sari Dewi', 'CUST020', 49500, 'cash', 'Selesai', 'Belanja pagi'),
('TRX024', '2025-10-23 13:10:00', 'Andi Pratama', 'CUST021', 110000, 'transfer', 'Selesai', 'Transfer BNI'),
('TRX025', '2025-10-23 16:35:00', 'Walk-in Customer', NULL, 21500, 'cash', 'Selesai', 'Customer umum');

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

INSERT INTO transaction_items (transaction_id, product_id, product_name, price, quantity) VALUES
('TRX001', 'PRD002', 'Indomie Goreng', 3500, 5),
('TRX001', 'PRD001', 'Aqua Botol 600ml', 5000, 1),
('TRX002', 'PRD001', 'Aqua Botol 600ml', 5000, 3),
('TRX002', 'PRD004', 'Rinso 800g', 21000, 1),
('TRX003', 'PRD005', 'Teh Pucuk Harum 350ml', 4000, 5),
('TRX003', 'PRD006', 'Chitato Rasa Sapi Panggang', 11000, 3),
('TRX004', 'PRD002', 'Indomie Goreng', 3500, 3),
('TRX004', 'PRD001', 'Aqua Botol 600ml', 5000, 1),
('TRX005', 'PRD007', 'Beras Premium 5kg', 75000, 1),
('TRX006', 'PRD011', 'Coca Cola 390ml', 6000, 5),
('TRX006', 'PRD022', 'Roti Tawar Sari Roti', 12000, 1),
('TRX006', 'PRD009', 'Pulpen Standard', 2500, 2),
('TRX007', 'PRD003', 'Gula Pasir 1kg', 14500, 2),
('TRX007', 'PRD014', 'Susu Indomilk UHT 1L', 17500, 2),
('TRX007', 'PRD023', 'Air Mineral Vit 600ml', 3500, 4),
('TRX008', 'PRD012', 'Mie Sedaap Soto', 3500, 4),
('TRX008', 'PRD005', 'Teh Pucuk Harum 350ml', 4000, 2),
('TRX009', 'PRD016', 'Shampo Pantene 170ml', 22000, 1),
('TRX009', 'PRD017', 'Sabun Mandi Lifebuoy 85g', 4500, 4),
('TRX009', 'PRD021', 'Sikat Gigi Pepsodent', 7000, 3),
('TRX010', 'PRD015', 'Minyak Goreng Bimoli 2L', 35000, 2),
('TRX010', 'PRD024', 'Tepung Terigu Segitiga Biru 1kg', 11500, 2),
('TRX010', 'PRD003', 'Gula Pasir 1kg', 14500, 1),
('TRX011', 'PRD002', 'Indomie Goreng', 3500, 6),
('TRX011', 'PRD023', 'Air Mineral Vit 600ml', 3500, 4),
('TRX011', 'PRD009', 'Pulpen Standard', 2500, 2),
('TRX012', 'PRD007', 'Beras Premium 5kg', 75000, 1),
('TRX012', 'PRD015', 'Minyak Goreng Bimoli 2L', 35000, 1),
('TRX012', 'PRD003', 'Gula Pasir 1kg', 14500, 1),
('TRX013', 'PRD006', 'Chitato Rasa Sapi Panggang', 11000, 1),
('TRX013', 'PRD011', 'Coca Cola 390ml', 6000, 2),
('TRX013', 'PRD009', 'Pulpen Standard', 2500, 2),
('TRX014', 'PRD012', 'Mie Sedaap Soto', 3500, 2),
('TRX014', 'PRD002', 'Indomie Goreng', 3500, 2),
('TRX014', 'PRD001', 'Aqua Botol 600ml', 5000, 1),
('TRX015', 'PRD004', 'Rinso 800g', 21000, 1),
('TRX015', 'PRD008', 'Molto Pelembut 800ml', 18500, 1),
('TRX015', 'PRD018', 'Tissue Nice 250s', 8500, 3),
('TRX016', 'PRD013', 'Kopi Kapal Api Special Mix', 13000, 4),
('TRX017', 'PRD025', 'Sabun Cuci Piring Sunlight 750ml', 16000, 2),
('TRX017', 'PRD004', 'Rinso 800g', 21000, 1),
('TRX017', 'PRD022', 'Roti Tawar Sari Roti', 12000, 3),
('TRX017', 'PRD014', 'Susu Indomilk UHT 1L', 17500, 1),
('TRX018', 'PRD005', 'Teh Pucuk Harum 350ml', 4000, 5),
('TRX018', 'PRD021', 'Sikat Gigi Pepsodent', 7000, 3),
('TRX019', 'PRD023', 'Air Mineral Vit 600ml', 3500, 4),
('TRX019', 'PRD011', 'Coca Cola 390ml', 6000, 2),
('TRX019', 'PRD002', 'Indomie Goreng', 3500, 2),
('TRX020', 'PRD019', 'Pensil 2B Set isi 12', 15000, 2),
('TRX020', 'PRD020', 'Kabel USB Type-C 1m', 25000, 1),
('TRX020', 'PRD010', 'Baterai AA Alkaline', 12000, 2),
('TRX020', 'PRD009', 'Pulpen Standard', 2500, 3),
('TRX021', 'PRD016', 'Shampo Pantene 170ml', 22000, 2),
('TRX021', 'PRD017', 'Sabun Mandi Lifebuoy 85g', 4500, 2),
('TRX021', 'PRD021', 'Sikat Gigi Pepsodent', 7000, 1),
('TRX022', 'PRD024', 'Tepung Terigu Segitiga Biru 1kg', 11500, 3),
('TRX022', 'PRD003', 'Gula Pasir 1kg', 14500, 3),
('TRX022', 'PRD001', 'Aqua Botol 600ml', 5000, 3),
('TRX023', 'PRD022', 'Roti Tawar Sari Roti', 12000, 2),
('TRX023', 'PRD014', 'Susu Indomilk UHT 1L', 17500, 1),
('TRX023', 'PRD005', 'Teh Pucuk Harum 350ml', 4000, 1),
('TRX024', 'PRD007', 'Beras Premium 5kg', 75000, 1),
('TRX024', 'PRD015', 'Minyak Goreng Bimoli 2L', 35000, 1),
('TRX025', 'PRD018', 'Tissue Nice 250s', 8500, 1),
('TRX025', 'PRD013', 'Kopi Kapal Api Special Mix', 13000, 1);

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
    INDEX idx_stock_movements_date (created_at),
    INDEX idx_stock_movements_type (movement_type),
    INDEX idx_stock_movements_reference (reference_type, reference_id),
    INDEX idx_stock_movements_product_date (product_id, created_at),
    INDEX idx_stock_movements_type_date (movement_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, stock_before, stock_after, created_by) VALUES
('PRD001', 'in', 50, 'purchase', 'PUR001', 'Restock Aqua', 50, 100, 'admin'),
('PRD002', 'in', 20, 'purchase', 'PUR001', 'Restock Indomie', 180, 200, 'admin'),
('PRD002', 'out', 5, 'transaction', 'TRX001', 'Penjualan', 200, 195, 'kasir1'),
('PRD001', 'out', 1, 'transaction', 'TRX001', 'Penjualan', 100, 99, 'kasir1'),
('PRD003', 'in', 80, 'purchase', 'PUR002', 'Restock Gula', 0, 80, 'admin');

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
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    INDEX idx_kas_mutations_customer (customer_id),
    INDEX idx_kas_mutations_date (created_at),
    INDEX idx_kas_mutations_transaction (transaction_id),
    INDEX idx_kas_mutations_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id, origin) VALUES
('CUST001', 'setor', 50000, 'Setor kas awal bulan', NULL, 'manual'),
('CUST002', 'setor', 100000, 'Setor kas Oktober', NULL, 'manual'),
('CUST002', 'belanja', 35000, 'Pembelian barang dari kas', 'TRX002', 'system'),
('CUST003', 'setor', 75000, 'Setor kas', NULL, 'manual'),
('CUST004', 'setor', 120000, 'Setor kas bulanan', NULL, 'manual'),
('CUST006', 'setor', 85000, 'Setor kas Oktober', NULL, 'manual'),
('CUST006', 'belanja', 45000, 'Pembelian barang dari kas', 'TRX006', 'system'),
('CUST007', 'setor', 150000, 'Setor kas bulanan', NULL, 'manual'),
('CUST008', 'setor', 95000, 'Setor kas Oktober', NULL, 'manual'),
('CUST009', 'setor', 110000, 'Setor kas', NULL, 'manual'),
('CUST010', 'setor', 65000, 'Setor kas awal bulan', NULL, 'manual'),
('CUST010', 'belanja', 38000, 'Pembelian dari kas', 'TRX011', 'system'),
('CUST011', 'setor', 200000, 'Setor kas besar', NULL, 'manual'),
('CUST012', 'setor', 40000, 'Setor kas', NULL, 'manual'),
('CUST012', 'belanja', 27000, 'Belanja dari kas', 'TRX013', 'system'),
('CUST013', 'setor', 130000, 'Setor kas Oktober', NULL, 'manual'),
('CUST014', 'setor', 90000, 'Setor kas bulanan', NULL, 'manual'),
('CUST014', 'belanja', 52000, 'Belanja dari kas', 'TRX016', 'system'),
('CUST015', 'setor', 175000, 'Setor kas', NULL, 'manual'),
('CUST016', 'setor', 55000, 'Setor kas Oktober', NULL, 'manual'),
('CUST016', 'belanja', 41000, 'Belanja mingguan dari kas', 'TRX018', 'system'),
('CUST017', 'setor', 105000, 'Setor kas bulanan', NULL, 'manual'),
('CUST018', 'setor', 80000, 'Setor kas Oktober', NULL, 'manual'),
('CUST019', 'setor', 125000, 'Setor kas', NULL, 'manual'),
('CUST019', 'belanja', 84000, 'Belanja dari kas', 'TRX022', 'system'),
('CUST020', 'setor', 70000, 'Setor kas awal bulan', NULL, 'manual'),
('CUST021', 'setor', 160000, 'Setor kas besar', NULL, 'manual'),
('CUST022', 'setor', 45000, 'Setor kas Oktober', NULL, 'manual'),
('CUST023', 'setor', 95000, 'Setor kas bulanan', NULL, 'manual'),
('CUST024', 'setor', 135000, 'Setor kas', NULL, 'manual'),
('CUST025', 'setor', 85000, 'Setor kas Oktober', NULL, 'manual');

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
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    INDEX idx_wajib_beli_customer (customer_id),
    INDEX idx_wajib_beli_date (created_at),
    INDEX idx_wajib_beli_transaction (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO wajib_beli_mutations (customer_id, amount, description, transaction_id, origin) VALUES
('CUST001', 20000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST002', 50000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST003', 30000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST004', 40000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST006', 35000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST007', 60000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST008', 45000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST008', -62000, 'Penggunaan saldo wajib beli', 'TRX009', 'system'),
('CUST009', 50000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST010', 25000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST011', 80000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST012', 15000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST013', 55000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST014', 38000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST015', 70000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST016', 22000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST017', 42000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST018', 33000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST018', -56000, 'Penggunaan saldo wajib beli', 'TRX021', 'system'),
('CUST019', 48000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST020', 28000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST021', 65000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST022', 18000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST023', 40000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST024', 52000, 'Wajib beli bulan Oktober', NULL, 'system'),
('CUST025', 34000, 'Wajib beli bulan Oktober', NULL, 'system');

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
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
    INDEX idx_hutang_supplier (supplier_id),
    INDEX idx_hutang_date (created_at),
    INDEX idx_hutang_due_date (due_date),
    INDEX idx_hutang_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO hutang_mutations (supplier_id, type, amount, description, purchase_id, due_date) VALUES
('SUP001', 'bayar', 250000, 'Pembayaran cash PUR001', 'PUR001', NULL),
('SUP003', 'hutang', 1200000, 'Pembelian tempo PUR002', 'PUR002', '2025-11-05'),
('SUP002', 'bayar', 500000, 'Pembayaran cash PUR003', 'PUR003', NULL),
('SUP004', 'hutang', 800000, 'Pembelian tempo PUR004', 'PUR004', '2025-11-15'),
('SUP004', 'bayar', 300000, 'Cicilan pertama PUR004', 'PUR004', NULL);

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
-- 15. NERACA TABLE (Balance Sheet)
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_neraca_date (transaction_date),
    INDEX idx_neraca_category (category),
    INDEX idx_neraca_type (type),
    INDEX idx_neraca_reference (reference_type, reference_id),
    INDEX idx_neraca_date_type (transaction_date, type),
    INDEX idx_neraca_date_category (transaction_date, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO neraca (transaction_date, category, type, amount, description, reference_type, reference_id, created_by) VALUES
('2025-10-01 00:00:00', 'saldo_awal', 'pemasukan', 5000000, 'Saldo awal bulan Oktober', 'manual', NULL, 'admin'),
('2025-10-12 12:00:00', 'penjualan', 'pemasukan', 20000, 'Penjualan TRX001', 'transaction', 'TRX001', 'system'),
('2025-10-13 09:30:00', 'penjualan', 'pemasukan', 35000, 'Penjualan TRX002', 'transaction', 'TRX002', 'system'),
('2025-10-01 10:00:00', 'pembelian_cash', 'pengeluaran', 250000, 'Pembelian PUR001', 'purchase', 'PUR001', 'system'),
('2025-10-05 15:30:00', 'pembelian_tempo', 'pengeluaran', 1200000, 'Pembelian tempo PUR002', 'purchase', 'PUR002', 'system');

-- ========================
-- 16. SETTINGS TABLE
-- ========================
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO settings (setting_key, setting_value, description) VALUES
-- Store Information
('store_name', 'TOKO JAYA BARU', 'Nama toko untuk struk'),
('store_address', 'Jl. Kenanga No. 242, Malang', 'Alamat toko untuk struk'),
('store_phone', '08123456789', 'Nomor telepon toko'),

-- Receipt Settings
('receipt_header', 'TOKO JAYA BARU', 'Header struk'),
('receipt_footer', 'Terima kasih atas pembelian Anda!', 'Footer struk'),
('receipt_width', '230', 'Lebar struk dalam pixel'),
('receipt_font_size', '12', 'Ukuran font struk'),
('receipt_copies', '1', 'Jumlah copy struk yang dicetak'),
('show_customer_info', '1', 'Tampilkan info pelanggan di struk (1=ya, 0=tidak)'),
('show_cashier_name', '1', 'Tampilkan nama kasir di struk (1=ya, 0=tidak)'),
('show_item_code', '0', 'Tampilkan kode produk di struk (1=ya, 0=tidak)'),

-- System Settings
('tax_rate', '0', 'Persentase pajak (0-100)'),
('currency_symbol', 'Rp', 'Simbol mata uang'),
('date_format', 'dd/mm/yyyy', 'Format tanggal (dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd)'),
('auto_print_receipt', '0', 'Auto print struk setelah transaksi (1=ya, 0=tidak)'),

-- Stock Settings
('low_stock_threshold', '10', 'Minimum stock quantity before low stock alert'),
('allow_negative_stock', '0', 'Allow stock to go negative (1=yes, 0=no)'),
('stock_alert_enabled', '1', 'Enable low stock alerts (1=yes, 0=no)'),

-- Barcode Settings
('barcode_prefix', 'PRD', 'Prefix for auto-generated barcodes'),
('barcode_format', 'CODE128', 'Barcode format (CODE128, EAN13, CODE39, UPCA)'),
('barcode_auto_generate', '0', 'Auto generate barcode on product creation (1=yes, 0=no)'),
('barcode_start_number', '1001', 'Starting number for barcode generation'),

-- Printer Settings
('printer_name', '', 'Selected printer name'),
('printer_type', 'thermal', 'Printer type (thermal, inkjet, laser)'),
('printer_paper_size', '80mm', 'Paper size (80mm, 58mm, A4, Letter)'),
('printer_auto_print', '0', 'Auto print after transaction (1=yes, 0=no)'),

-- Logo Settings
('store_logo', '', 'Filename of store logo'),
('logo_position', 'center', 'Logo position in receipt (left, center, right)'),
('logo_width', '150', 'Logo width in pixels'),
('show_logo_receipt', '1', 'Show logo in receipt (1=yes, 0=no)'),

-- Security Settings
('session_timeout', '30', 'Session timeout in minutes'),
('auto_logout_enabled', '1', 'Enable auto logout on inactivity (1=yes, 0=no)'),
('password_min_length', '6', 'Minimum password length'),
('login_attempt_limit', '5', 'Maximum login attempts before lockout');

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_upload_type (upload_type),
    INDEX idx_uploaded_by (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ================================================================
-- DATABASE INITIALIZATION COMPLETED
-- ================================================================

-- Summary
SELECT 'Database initialized successfully!' as status,
       (SELECT COUNT(*) FROM users) as users_count,
       (SELECT COUNT(*) FROM categories) as categories_count,
       (SELECT COUNT(*) FROM suppliers) as suppliers_count,
       (SELECT COUNT(*) FROM products) as products_count,
       (SELECT COUNT(*) FROM customers) as customers_count,
       (SELECT COUNT(*) FROM purchases) as purchases_count,
       (SELECT COUNT(*) FROM transactions) as transactions_count,
       (SELECT COUNT(*) FROM settings) as settings_count;

-- Display summary of each table
SELECT 'Users:' as table_name, COUNT(*) as records FROM users
UNION ALL SELECT 'Categories:', COUNT(*) FROM categories
UNION ALL SELECT 'Suppliers:', COUNT(*) FROM suppliers
UNION ALL SELECT 'Products:', COUNT(*) FROM products
UNION ALL SELECT 'Customers:', COUNT(*) FROM customers
UNION ALL SELECT 'Purchases:', COUNT(*) FROM purchases
UNION ALL SELECT 'Purchase Items:', COUNT(*) FROM purchase_items
UNION ALL SELECT 'Transactions:', COUNT(*) FROM transactions
UNION ALL SELECT 'Transaction Items:', COUNT(*) FROM transaction_items
UNION ALL SELECT 'Stock Movements:', COUNT(*) FROM stock_movements
UNION ALL SELECT 'Kas Mutations:', COUNT(*) FROM kas_mutations
UNION ALL SELECT 'Wajib Beli:', COUNT(*) FROM wajib_beli_mutations
UNION ALL SELECT 'Hutang:', COUNT(*) FROM hutang_mutations
UNION ALL SELECT 'Neraca:', COUNT(*) FROM neraca
UNION ALL SELECT 'Settings:', COUNT(*) FROM settings
UNION ALL SELECT 'Uploads:', COUNT(*) FROM uploads;

-- ============================================================================
-- DATABASE INITIALIZATION COMPLETED
-- ============================================================================
-- 
-- FITUR BARU: Piutang untuk Transaksi Debit
-- -----------------------------------------
-- Table 'neraca' sudah include category 'piutang' untuk:
-- - Transaksi dengan payment_method = 'debit' dan status = 'Pending'
-- - Akan muncul sebagai Piutang di Neraca
-- - Setelah verifikasi (status = 'Selesai'), piutang akan dihapus dan
--   dicatat sebagai Penjualan (Pemasukan)
-- 
-- Alur Proses:
-- 1. Transaksi Debit + Pending → Masuk ke Neraca sebagai Piutang
-- 2. Verifikasi Manual → Status berubah ke Selesai
-- 3. Piutang dihapus → Dicatat sebagai Penjualan (Pemasukan)
--
-- ============================================================================

SELECT '' AS '';
SELECT '========================================' AS '';
SELECT '✅ DATABASE BERHASIL DIINISIALISASI!' AS '';
SELECT '========================================' AS '';
SELECT '' AS '';
SELECT 'Fitur Piutang Debit: AKTIF ✅' AS '';
SELECT 'Category "piutang" sudah tersedia di table neraca' AS '';
SELECT '' AS '';
SELECT '========================================' AS '';
