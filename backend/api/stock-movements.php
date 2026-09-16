<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

/**
 * Helper function to record stock movement
 */
function recordStockMovement($pdo, $productId, $movementType, $quantity, $referenceType, $referenceId = null, $notes = '', $createdBy = null) {
    try {
        // Get current stock
        $stmt = $pdo->prepare("SELECT stock FROM products WHERE id = ? FOR UPDATE");
        $stmt->execute([$productId]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$product) {
            throw new Exception("Product not found");
        }

        $stockBefore = (int)$product['stock'];
        $stockAfter = $stockBefore;

        // Calculate new stock
        if ($movementType === 'in') {
            $stockAfter = $stockBefore + $quantity;
        } elseif ($movementType === 'out') {
            $stockAfter = max(0, $stockBefore - $quantity);
        } elseif ($movementType === 'adjustment') {
            // For adjustment, quantity can be positive or negative
            $stockAfter = max(0, $stockBefore + $quantity);
        }

        // Record movement
        $stmt = $pdo->prepare("
            INSERT INTO stock_movements
            (product_id, movement_type, quantity, reference_type, reference_id, notes, stock_before, stock_after, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $productId,
            $movementType,
            abs($quantity),
            $referenceType,
            $referenceId,
            $notes,
            $stockBefore,
            $stockAfter,
            $createdBy
        ]);

        return $pdo->lastInsertId();
    } catch (Exception $e) {
        error_log("Error recording stock movement: " . $e->getMessage());
        throw $e;
    }
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            $startDate = $_GET['start_date'] ?? date('Y-m-01');
            $endDate = $_GET['end_date'] ?? date('Y-m-d');
            $productId = $_GET['product_id'] ?? '';
            $movementType = $_GET['movement_type'] ?? '';
            $search = $_GET['search'] ?? '';

            // Build query
            $query = "
                SELECT
                    sm.id,
                    sm.product_id,
                    p.name as product_name,
                    sm.movement_type,
                    sm.quantity,
                    sm.reference_type,
                    sm.reference_id,
                    sm.notes,
                    sm.stock_before,
                    sm.stock_after,
                    sm.created_by,
                    sm.created_at
                FROM stock_movements sm
                LEFT JOIN products p ON sm.product_id = p.id
                WHERE DATE(sm.created_at) BETWEEN ? AND ?
            ";
            $params = [$startDate, $endDate];

            if (!empty($productId)) {
                $query .= " AND sm.product_id = ?";
                $params[] = $productId;
            }

            if (!empty($movementType)) {
                $query .= " AND sm.movement_type = ?";
                $params[] = $movementType;
            }

            if (!empty($search)) {
                $query .= " AND (p.name LIKE ? OR sm.product_id LIKE ? OR sm.notes LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }

            $query .= " ORDER BY sm.created_at DESC";

            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $movements = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Calculate summary
            $totalIn = 0;
            $totalOut = 0;
            $totalAdjustment = 0;

            foreach ($movements as $movement) {
                switch ($movement['movement_type']) {
                    case 'in':
                        $totalIn += $movement['quantity'];
                        break;
                    case 'out':
                        $totalOut += $movement['quantity'];
                        break;
                    case 'adjustment':
                        $totalAdjustment += $movement['quantity'];
                        break;
                }
            }

            // Get low stock threshold from settings (default: 10)
            $thresholdStmt = $pdo->query("SELECT setting_value FROM settings WHERE setting_key = 'low_stock_threshold' LIMIT 1");
            $thresholdRow = $thresholdStmt->fetch(PDO::FETCH_ASSOC);
            $lowStockThreshold = $thresholdRow ? (int)$thresholdRow['setting_value'] : 10;
            
            // Get current low stock products using dynamic threshold
            $lowStockStmt = $pdo->prepare("
                SELECT id, name, stock
                FROM products
                WHERE stock < ?
                ORDER BY stock ASC
                LIMIT 10
            ");
            $lowStockStmt->execute([$lowStockThreshold]);
            $lowStockProducts = $lowStockStmt->fetchAll(PDO::FETCH_ASSOC);

            // Get products with most movements
            $activeProductsQuery = "
                SELECT
                    p.id,
                    p.name,
                    COUNT(sm.id) as movement_count,
                    SUM(CASE WHEN sm.movement_type = 'in' THEN sm.quantity ELSE 0 END) as total_in,
                    SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) as total_out
                FROM products p
                LEFT JOIN stock_movements sm ON p.id = sm.product_id
                WHERE DATE(sm.created_at) BETWEEN ? AND ?
                GROUP BY p.id, p.name
                ORDER BY movement_count DESC
                LIMIT 10
            ";
            $activeStmt = $pdo->prepare($activeProductsQuery);
            $activeStmt->execute([$startDate, $endDate]);
            $activeProducts = $activeStmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'success' => true,
                'data' => [
                    'movements' => $movements,
                    'summary' => [
                        'total_in' => $totalIn,
                        'total_out' => $totalOut,
                        'total_adjustment' => $totalAdjustment,
                        'movement_count' => count($movements),
                        'in_count' => count(array_filter($movements, function($m) { return $m['movement_type'] === 'in'; })),
                        'out_count' => count(array_filter($movements, function($m) { return $m['movement_type'] === 'out'; })),
                        'adjustment_count' => count(array_filter($movements, function($m) { return $m['movement_type'] === 'adjustment'; }))
                    ],
                    'period' => [
                        'start_date' => $startDate,
                        'end_date' => $endDate
                    ],
                    'low_stock_products' => $lowStockProducts,
                    'active_products' => $activeProducts
                ]
            ]);
            break;

        case 'POST':
            // Manual stock adjustment
            $input = json_decode(file_get_contents('php://input'), true);

            $productId = $input['product_id'] ?? '';
            $adjustmentType = $input['adjustment_type'] ?? ''; // 'increase' or 'decrease'
            $quantity = abs((int)($input['quantity'] ?? 0));
            $notes = $input['notes'] ?? 'Manual stock adjustment';
            $createdBy = $input['created_by'] ?? 'System';

            if (empty($productId) || $quantity <= 0 || empty($adjustmentType)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Data tidak valid']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                // Get current stock
                $stmt = $pdo->prepare("SELECT stock, name FROM products WHERE id = ? FOR UPDATE");
                $stmt->execute([$productId]);
                $product = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$product) {
                    throw new Exception('Produk tidak ditemukan');
                }

                $stockBefore = (int)$product['stock'];
                $movementType = 'adjustment';
                $actualQuantity = ($adjustmentType === 'increase') ? $quantity : -$quantity;
                $stockAfter = max(0, $stockBefore + $actualQuantity);

                // Update stock
                $updateStmt = $pdo->prepare("UPDATE products SET stock = ? WHERE id = ?");
                $updateStmt->execute([$stockAfter, $productId]);

                // Record movement
                $movementStmt = $pdo->prepare("
                    INSERT INTO stock_movements
                    (product_id, movement_type, quantity, reference_type, reference_id, notes, stock_before, stock_after, created_by)
                    VALUES (?, ?, ?, 'manual', NULL, ?, ?, ?, ?)
                ");
                $movementStmt->execute([
                    $productId,
                    $movementType,
                    $quantity,
                    $notes,
                    $stockBefore,
                    $stockAfter,
                    $createdBy
                ]);

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'message' => 'Penyesuaian stok berhasil',
                    'data' => [
                        'product_name' => $product['name'],
                        'stock_before' => $stockBefore,
                        'stock_after' => $stockAfter,
                        'adjustment' => $actualQuantity
                    ]
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method tidak diizinkan']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
?>
