<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            $startDate = $_GET['start_date'] ?? date('Y-m-01');
            $endDate = $_GET['end_date'] ?? date('Y-m-d');
            $supplierId = $_GET['supplier_id'] ?? '';
            $search = $_GET['search'] ?? '';

            // Build base query for hutang mutations
            $query = "
                SELECT
                    hm.id,
                    hm.supplier_id,
                    s.name as supplier_name,
                    s.contact as supplier_contact,
                    hm.type,
                    hm.amount,
                    hm.description,
                    hm.purchase_id,
                    hm.due_date,
                    hm.created_at,
                    p.payment_status,
                    p.remaining_amount
                FROM hutang_mutations hm
                LEFT JOIN suppliers s ON hm.supplier_id = s.id
                LEFT JOIN purchases p ON hm.purchase_id = p.id
                WHERE DATE(hm.created_at) BETWEEN ? AND ?
            ";
            $params = [$startDate, $endDate];

            if (!empty($supplierId)) {
                $query .= " AND hm.supplier_id = ?";
                $params[] = $supplierId;
            }

            if (!empty($search)) {
                $query .= " AND (s.name LIKE ? OR hm.description LIKE ? OR hm.purchase_id LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }

            $query .= " ORDER BY hm.created_at DESC";

            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $mutations = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Calculate summary
            $totalHutangBaru = 0;
            $totalPembayaran = 0;

            foreach ($mutations as $mutation) {
                if ($mutation['type'] === 'hutang') {
                    $totalHutangBaru += $mutation['amount'];
                } else {
                    $totalPembayaran += $mutation['amount'];
                }
            }

            // Get current total hutang from all suppliers (from purchases)
            $totalHutangStmt = $pdo->query("
                SELECT COALESCE(SUM(remaining_amount), 0) as total_hutang
                FROM purchases
                WHERE payment_status != 'Lunas'
            ");
            $totalHutangResult = $totalHutangStmt->fetch(PDO::FETCH_ASSOC);

            // Get suppliers with outstanding hutang
            $suppliersWithHutangStmt = $pdo->query("
                SELECT s.id, s.name, s.contact, 
                       COALESCE(SUM(p.remaining_amount), 0) as total_hutang
                FROM suppliers s
                LEFT JOIN purchases p ON s.id = p.supplier_id AND p.payment_status != 'Lunas'
                GROUP BY s.id, s.name, s.contact
                HAVING total_hutang > 0
                ORDER BY total_hutang DESC
            ");
            $suppliersWithHutang = $suppliersWithHutangStmt->fetchAll(PDO::FETCH_ASSOC);

            // Get overdue purchases count
            $overdueStmt = $pdo->query("
                SELECT COUNT(*) as overdue_count, SUM(COALESCE(remaining_amount, total_price - COALESCE(paid_amount, 0))) as overdue_amount
                FROM purchases
                WHERE payment_method = 'tempo'
                AND payment_status != 'Lunas'
                AND due_date <= CURDATE()
                AND status = 'Selesai'
                AND COALESCE(remaining_amount, total_price - COALESCE(paid_amount, 0)) > 0
            ");
            $overdueResult = $overdueStmt->fetch(PDO::FETCH_ASSOC);

            // Get upcoming due (next 7 days)
            $upcomingStmt = $pdo->query("
                SELECT COUNT(*) as upcoming_count, SUM(COALESCE(remaining_amount, total_price - COALESCE(paid_amount, 0))) as upcoming_amount
                FROM purchases
                WHERE payment_method = 'tempo'
                AND payment_status != 'Lunas'
                AND due_date > CURDATE()
                AND due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                AND status = 'Selesai'
                AND COALESCE(remaining_amount, total_price - COALESCE(paid_amount, 0)) > 0
            ");
            $upcomingResult = $upcomingStmt->fetch(PDO::FETCH_ASSOC);

            echo json_encode([
                'success' => true,
                'data' => [
                    'mutations' => $mutations,
                    'summary' => [
                        'total_hutang_periode' => $totalHutangBaru,
                        'total_pembayaran_periode' => $totalPembayaran,
                        'total_hutang_sekarang' => $totalHutangResult['total_hutang'] ?? 0,
                        'mutation_count' => count($mutations),
                        'overdue_count' => $overdueResult['overdue_count'] ?? 0,
                        'overdue_amount' => $overdueResult['overdue_amount'] ?? 0,
                        'upcoming_count' => $upcomingResult['upcoming_count'] ?? 0,
                        'upcoming_amount' => $upcomingResult['upcoming_amount'] ?? 0
                    ],
                    'period' => [
                        'start_date' => $startDate,
                        'end_date' => $endDate
                    ],
                    'suppliers_with_hutang' => $suppliersWithHutang
                ]
            ]);
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
