<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';

$pdo = getDatabaseConnection();

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            $startDate = $_GET['start_date'] ?? date('Y-m-01'); // Default: awal bulan ini
            $endDate = $_GET['end_date'] ?? date('Y-m-d'); // Default: hari ini

            // Validasi tanggal
            if (!empty($startDate) && !DateTime::createFromFormat('Y-m-d', $startDate)) {
                throw new Exception('Format tanggal mulai tidak valid');
            }
            if (!empty($endDate) && !DateTime::createFromFormat('Y-m-d', $endDate)) {
                throw new Exception('Format tanggal akhir tidak valid');
            }

            // Query untuk laporan pembelian dengan detail items
            $query = "
                SELECT
                    p.id,
                    p.purchase_date,
                    p.total_price,
                    p.status,
                    s.name as supplier_name,
                    COUNT(pi.id) as item_count,
                    GROUP_CONCAT(
                        CONCAT(
                            pr.name, ' (', pi.quantity, 'x @ ', pi.buy_price, ')'
                        ) SEPARATOR ', '
                    ) as items
                FROM purchases p
                LEFT JOIN suppliers s ON p.supplier_id = s.id
                LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE p.purchase_date BETWEEN ? AND ? + INTERVAL 1 DAY
                GROUP BY p.id
                ORDER BY p.purchase_date DESC
            ";

            $stmt = $pdo->prepare($query);
            $stmt->execute([$startDate, $endDate]);
            $purchases = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Hitung total pembelian (HANYA yang SELESAI untuk laporan keuangan)
            $totalPurchases = 0; // Total pembelian yang selesai (benar-benar terjadi)
            $completedPurchases = 0; // Total pembelian selesai
            $pendingPurchases = 0;
            $cancelledPurchases = 0;

            foreach ($purchases as $purchase) {
                switch ($purchase['status']) {
                    case 'Selesai':
                        $completedPurchases += $purchase['total_price'];
                        break;
                    case 'Pending':
                        $pendingPurchases += $purchase['total_price'];
                        break;
                    case 'Dibatalkan':
                        $cancelledPurchases += $purchase['total_price'];
                        break;
                }
            }

            // Total pembelian aktual = hanya yang selesai
            $actualTotalPurchases = $completedPurchases;

            // Query tambahan untuk mendapatkan statistik supplier
            $supplierStatsQuery = "
                SELECT
                    s.name as supplier_name,
                    COUNT(DISTINCT p.id) as purchase_count,
                    SUM(p.total_price) as total_spent
                FROM purchases p
                JOIN suppliers s ON p.supplier_id = s.id
                WHERE p.purchase_date BETWEEN ? AND ? + INTERVAL 1 DAY
                AND p.status = 'Selesai'
                GROUP BY s.id, s.name
                ORDER BY total_spent DESC
                LIMIT 5
            ";

            $supplierStmt = $pdo->prepare($supplierStatsQuery);
            $supplierStmt->execute([$startDate, $endDate]);
            $topSuppliers = $supplierStmt->fetchAll(PDO::FETCH_ASSOC);

            // Count unique suppliers
            $supplierCountQuery = "
                SELECT COUNT(DISTINCT supplier_id) as supplier_count
                FROM purchases
                WHERE purchase_date BETWEEN ? AND ? + INTERVAL 1 DAY
                AND status = 'Selesai'
            ";
            $supplierCountStmt = $pdo->prepare($supplierCountQuery);
            $supplierCountStmt->execute([$startDate, $endDate]);
            $supplierCountResult = $supplierCountStmt->fetch(PDO::FETCH_ASSOC);

            // Query untuk produk yang paling banyak dibeli
            $topProductsQuery = "
                SELECT
                    pr.name as product_name,
                    SUM(pi.quantity) as total_quantity,
                    SUM(pi.subtotal) as total_cost
                FROM purchase_items pi
                JOIN products pr ON pi.product_id = pr.id
                JOIN purchases p ON pi.purchase_id = p.id
                WHERE p.purchase_date BETWEEN ? AND ? + INTERVAL 1 DAY
                AND p.status = 'Selesai'
                GROUP BY pr.id, pr.name
                ORDER BY total_quantity DESC
                LIMIT 5
            ";

            $productStmt = $pdo->prepare($topProductsQuery);
            $productStmt->execute([$startDate, $endDate]);
            $topProducts = $productStmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'success' => true,
                'data' => [
                    'purchases' => $purchases,
                    'summary' => [
                        'total_purchases' => $actualTotalPurchases, // Hanya pembelian selesai
                        'completed_purchases' => $completedPurchases,
                        'pending_purchases' => $pendingPurchases,
                        'cancelled_purchases' => $cancelledPurchases,
                        'purchase_count' => count($purchases),
                        'completed_count' => count(array_filter($purchases, function($p) { return $p['status'] === 'Selesai'; })),
                        'pending_count' => count(array_filter($purchases, function($p) { return $p['status'] === 'Pending'; })),
                        'cancelled_count' => count(array_filter($purchases, function($p) { return $p['status'] === 'Dibatalkan'; })),
                        'supplier_count' => $supplierCountResult['supplier_count'] ?? 0
                    ],
                    'period' => [
                        'start_date' => $startDate,
                        'end_date' => $endDate
                    ],
                    'top_suppliers' => $topSuppliers,
                    'top_products' => $topProducts
                ]
            ]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>