<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$pdo = getDatabaseConnection();

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
    // Search by barcode (prioritas utama untuk scanner)
    if (isset($_GET['barcode'])) {
        $stmt = $pdo->prepare("
            SELECT p.*, c.name AS category_name, s.name AS supplier_name
            FROM products p
            LEFT JOIN categories c ON p.category_code = c.code
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.barcode = ?
        ");
        $stmt->execute([$_GET['barcode']]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($product) {
            echo json_encode(['success' => true, 'data' => $product]);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Produk dengan barcode tersebut tidak ditemukan']);
        }
    }
    // Detail produk by ID
    elseif (isset($_GET['id'])) {
        $stmt = $pdo->prepare("
            SELECT p.*, c.name AS category_name, s.name AS supplier_name
            FROM products p
            LEFT JOIN categories c ON p.category_code = c.code
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            WHERE p.id = ?
        ");
        $stmt->execute([$_GET['id']]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($product) {
            echo json_encode($product);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Produk tidak ditemukan']);
        }
    }
    // Filter produk berdasarkan supplier
    elseif (isset($_GET['supplier_id'])) {
        // Include products yang:
        // 1. supplier_id-nya match ATAU
        // 2. Pernah dibeli dari supplier ini (purchase history)
        $stmt = $pdo->prepare("
            SELECT DISTINCT p.id, p.name, p.price, p.stock, p.barcode, 
                   p.category_code, p.supplier_id, p.created_at, p.updated_at,
                   c.name AS category_name, s.name AS supplier_name
            FROM products p
            LEFT JOIN categories c ON p.category_code = c.code
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.product_id
            LEFT JOIN purchases pur ON pi.purchase_id = pur.id
            WHERE p.supplier_id = ? OR pur.supplier_id = ?
            GROUP BY p.id, p.name, p.price, p.stock, p.barcode, 
                     p.category_code, p.supplier_id, p.created_at, p.updated_at,
                     c.name, s.name
            ORDER BY p.name ASC
        ");
        $stmt->execute([$_GET['supplier_id'], $_GET['supplier_id']]);
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    // Search produk
    else {
        $search = $_GET['search'] ?? '';
        $query = "
            SELECT p.*, c.name AS category_name, s.name AS supplier_name
            FROM products p
            LEFT JOIN categories c ON p.category_code = c.code
            LEFT JOIN suppliers s ON p.supplier_id = s.id
        ";
        $params = [];

        if (!empty($search)) {
            $query .= " WHERE p.name LIKE ?";
            $params[] = "%$search%";
        }

        $query .= " ORDER BY p.name ASC";
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);

        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    break;

    case 'POST':
        $input = json_decode(file_get_contents('php://input'), true);

        if (empty($input['name']) || empty($input['price'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nama dan harga produk wajib diisi']);
            exit;
        }

        $productId = 'PROD-' . str_pad(mt_rand(1, 99999), 5, '0', STR_PAD_LEFT);

        // Validate barcode uniqueness if provided
        if (!empty($input['barcode'])) {
            $checkStmt = $pdo->prepare("SELECT id FROM products WHERE barcode = ?");
            $checkStmt->execute([$input['barcode']]);
            if ($checkStmt->fetch()) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Barcode sudah digunakan produk lain']);
                exit;
            }
        }

        $stmt = $pdo->prepare("
            INSERT INTO products (id, name, price, stock, category_code, supplier_id, barcode)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $productId,
            $input['name'],
            $input['price'],
            $input['stock'] ?? 0,
            $input['category_code'] ?? null,
            $input['supplier_id'] ?? null,
            $input['barcode'] ?? null
        ]);

        echo json_encode(['success' => true, 'id' => $productId]);
        break;

case 'PUT':
    $input = json_decode(file_get_contents('php://input'), true);
    $productId = $_GET['id'] ?? null;

    if (!$productId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID produk diperlukan']);
        exit;
    }

    $updates = [];
    $params = [];

    if (!empty($input['name'])) {
        $updates[] = 'name = ?';
        $params[] = $input['name'];
    }
    if (isset($input['price'])) {
        $updates[] = 'price = ?';
        $params[] = $input['price'];
    }
    if (isset($input['stock'])) {
        $updates[] = 'stock = ?';
        $params[] = $input['stock'];
    }

    // PERBAIKAN: Ubah string kosong menjadi NULL untuk foreign keys
    if (isset($input['category_code'])) {
        $updates[] = 'category_code = ?';
        $params[] = ($input['category_code'] === '') ? null : $input['category_code'];
    }
    if (isset($input['supplier_id'])) {
        $updates[] = 'supplier_id = ?';
        $params[] = ($input['supplier_id'] === '') ? null : $input['supplier_id'];
    }
    
    // Add barcode update with uniqueness check
    if (isset($input['barcode'])) {
        // Check if barcode already used by another product
        if (!empty($input['barcode'])) {
            $checkStmt = $pdo->prepare("SELECT id FROM products WHERE barcode = ? AND id != ?");
            $checkStmt->execute([$input['barcode'], $productId]);
            if ($checkStmt->fetch()) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Barcode sudah digunakan produk lain']);
                exit;
            }
        }
        $updates[] = 'barcode = ?';
        $params[] = ($input['barcode'] === '') ? null : $input['barcode'];
    }

    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Tidak ada data yang diperbarui']);
        exit;
    }

    $params[] = $productId;
    $query = "UPDATE products SET " . implode(', ', $updates) . " WHERE id = ?";
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);

    echo json_encode(['success' => true]);
    break;

    case 'DELETE':
        $productId = trim($_GET['id'] ?? '');

        if (!$productId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'ID produk diperlukan']);
            exit;
        }

        $stmt = $pdo->prepare("DELETE FROM products WHERE id = ?");
        if (!$stmt->execute([$productId])) {
            $error = $stmt->errorInfo();
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Gagal menghapus produk',
                'error' => $error
            ]);
            exit;
        }

        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Produk tidak ditemukan'
            ]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Metode tidak diizinkan']);
}
?>