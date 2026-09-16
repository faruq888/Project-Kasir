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

            // Query untuk laporan penjualan (semua transaksi untuk referensi)
            $query = "
                SELECT
                    t.id,
                    t.date,
                    t.customer,
                    t.total,
                    t.status,
                    COUNT(ti.id) as item_count,
                    GROUP_CONCAT(CONCAT(ti.product_name, ' (', ti.quantity, 'x)') SEPARATOR ', ') as items
                FROM transactions t
                LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
                WHERE t.date BETWEEN ? AND ? + INTERVAL 1 DAY
                GROUP BY t.id
                ORDER BY t.date DESC
            ";

            $stmt = $pdo->prepare($query);
            $stmt->execute([$startDate, $endDate]);
            $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Hitung total penjualan (HANYA yang SELESAI)
            $totalSales = 0; // Total semua transaksi (untuk referensi historical)
            $completedSales = 0; // Total transaksi selesai (yang benar-benar terjual)
            $pendingSales = 0;
            $cancelledSales = 0; // Total transaksi yang dibatalkan

            foreach ($transactions as $transaction) {
                switch ($transaction['status']) {
                    case 'Selesai':
                        $completedSales += $transaction['total'];
                        break;
                    case 'Pending':
                        $pendingSales += $transaction['total'];
                        break;
                    case 'Dibatalkan':
                        $cancelledSales += $transaction['total'];
                        break;
                }
            }

            // Total penjualan aktual = hanya transaksi yang selesai
            // (tidak termasuk yang pending atau dibatalkan)
            $actualTotalSales = $completedSales;

            // Query tambahan untuk mendapatkan statistik produk terlaris (hanya dari transaksi selesai)
            $productStatsQuery = "
                SELECT
                    ti.product_name,
                    SUM(ti.quantity) as total_sold,
                    SUM(ti.price * ti.quantity) as total_revenue
                FROM transaction_items ti
                JOIN transactions t ON ti.transaction_id = t.id
                WHERE t.date BETWEEN ? AND ? + INTERVAL 1 DAY
                AND t.status = 'Selesai'
                GROUP BY ti.product_name
                ORDER BY total_sold DESC
                LIMIT 5
            ";

            $productStmt = $pdo->prepare($productStatsQuery);
            $productStmt->execute([$startDate, $endDate]);
            $topProducts = $productStmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'success' => true,
                'data' => [
                    'transactions' => $transactions,
                    'summary' => [
                        'total_sales' => $actualTotalSales, // Hanya transaksi selesai
                        'completed_sales' => $completedSales,
                        'pending_sales' => $pendingSales,
                        'cancelled_sales' => $cancelledSales,
                        'transaction_count' => count($transactions),
                        'completed_count' => count(array_filter($transactions, function($t) { return $t['status'] === 'Selesai'; })),
                        'pending_count' => count(array_filter($transactions, function($t) { return $t['status'] === 'Pending'; })),
                        'cancelled_count' => count(array_filter($transactions, function($t) { return $t['status'] === 'Dibatalkan'; }))
                    ],
                    'period' => [
                        'start_date' => $startDate,
                        'end_date' => $endDate
                    ],
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