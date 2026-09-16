<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/neraca_helper.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
    if (!empty($_GET['id'])) {
        // Get specific customer's kas data and mutations
        $id = $_GET['id'];

        $stmt = $pdo->prepare("SELECT id, name, kas, saldo_wajib_beli FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$customer) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Anggota tidak ditemukan']);
            exit;
        }

        // PERBAIKAN: Get recent mutations excluding cancelled transactions
        $stmt = $pdo->prepare("
            SELECT km.id, km.type, km.amount, km.description, km.created_at, km.transaction_id
            FROM kas_mutations km
            LEFT JOIN transactions t ON km.transaction_id = t.id
            WHERE km.customer_id = ?
            AND (km.transaction_id IS NULL OR t.status != 'Dibatalkan' OR t.status IS NULL)
            ORDER BY km.created_at DESC LIMIT 20
        ");
        $stmt->execute([$id]);
        $mutations = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['success' => true, 'customer' => $customer, 'mutations' => $mutations]);
    } else {
        // Get all kas mutations with filters
        $startDate = $_GET['start_date'] ?? date('Y-m-01');
        $endDate = $_GET['end_date'] ?? date('Y-m-d');
        $search = $_GET['search'] ?? '';
        $period = $_GET['period'] ?? 'monthly';

        // Adjust date range based on period
        $today = new DateTime();
        switch ($period) {
            case 'daily':
                $startDate = date('Y-m-d');
                $endDate = date('Y-m-d');
                break;
            case 'weekly':
                $startDate = $today->modify('-1 week')->format('Y-m-d');
                $endDate = date('Y-m-d');
                break;
            case 'monthly':
                $startDate = date('Y-m-01');
                $endDate = date('Y-m-d');
                break;
            case 'yearly':
                $startDate = date('Y-01-01');
                $endDate = date('Y-m-d');
                break;
            // 'custom' period will use provided start_date and end_date
        }

        // PERBAIKAN: Query yang mengecualikan mutasi dari transaksi dibatalkan
        $query = "
            SELECT km.id, km.customer_id, c.name as customer_name,
                   km.type, km.amount, km.description, km.created_at, km.transaction_id
            FROM kas_mutations km
            JOIN customers c ON km.customer_id = c.id
            LEFT JOIN transactions t ON km.transaction_id = t.id
            WHERE DATE(km.created_at) BETWEEN ? AND ?
            AND (km.transaction_id IS NULL OR t.status != 'Dibatalkan' OR t.status IS NULL)
        ";
        $params = [$startDate, $endDate];

        if ($search !== '') {
            $query .= " AND (c.name LIKE ? OR c.id LIKE ? OR km.description LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $query .= " ORDER BY km.created_at DESC";

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $mutations = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Calculate summary - Hanya hitung mutasi yang valid (tarik dan belanja/konversi)
        $totalTarikPeriode = 0;
        $totalBelanjaPeriode = 0;

        foreach ($mutations as $mutation) {
            switch ($mutation['type']) {
                case 'tarik':
                    $totalTarikPeriode += $mutation['amount'];
                    break;
                case 'belanja':
                    $totalBelanjaPeriode += $mutation['amount'];
                    break;
            }
        }

        // Get current total kas from all customers (ini tetap benar)
        $totalKasStmt = $pdo->query("SELECT SUM(kas) as total_kas FROM customers");
        $totalKas = $totalKasStmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'data' => $mutations,
            'summary' => [
                'total_tarik_periode' => $totalTarikPeriode,
                'total_belanja_periode' => $totalBelanjaPeriode,
                'total_kas_semua_anggota' => $totalKas['total_kas'] ?? 0,
                'transaction_count' => count($mutations),
                'period' => ['start_date' => $startDate, 'end_date' => $endDate, 'period_type' => $period]
            ]
        ]);
    }
    break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            $customer_id = $input['customer_id'] ?? '';
            $type = $input['type'] ?? '';
            $amount = (float)($input['amount'] ?? 0);
            $description = $input['description'] ?? '';
            $transaction_id = $input['transaction_id'] ?? null;

            if (empty($customer_id) || empty($type) || $amount <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Data tidak valid']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                // Lock and get customer data
                $stmt = $pdo->prepare("SELECT id, kas FROM customers WHERE id = ? FOR UPDATE");
                $stmt->execute([$customer_id]);
                $customer = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$customer) {
                    throw new Exception('Anggota tidak ditemukan');
                }

                $currentKas = (float)$customer['kas'];
                $newKas = $currentKas;

                switch ($type) {
                    case 'tarik':
                        if ($currentKas < $amount) {
                            throw new Exception('Saldo kas tidak mencukupi');
                        }
                        $newKas = $currentKas - $amount;
                        break;
                    case 'belanja':
                        // For belanja from wajib beli conversion - always add to kas
                        $newKas = $currentKas + $amount;
                        break;
                    default:
                        throw new Exception('Tipe mutasi tidak valid. Hanya tarik dan konversi dari belanja yang diizinkan');
                }

                // Update kas
                $stmt = $pdo->prepare("UPDATE customers SET kas = ? WHERE id = ?");
                $stmt->execute([$newKas, $customer_id]);

                // Record mutation
                $stmt = $pdo->prepare("
                    INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id)
                    VALUES (?, ?, ?, ?, ?)
                ");
                $stmt->execute([$customer_id, $type, $amount, $description, $transaction_id]);
                $mutationId = $pdo->lastInsertId();

                // Record neraca entry for kas mutations (only for 'tarik', exclude 'belanja' as it's already recorded via transaction)
                if ($type === 'tarik') {
                    try {
                        $customerName = $pdo->prepare("SELECT name FROM customers WHERE id = ?");
                        $customerName->execute([$customer_id]);
                        $custData = $customerName->fetch(PDO::FETCH_ASSOC);
                        $custName = $custData['name'] ?? 'Unknown';

                        recordNeracaKasWithdrawal($pdo, $mutationId, date('Y-m-d H:i:s'), $amount, $custName, 'System');
                    } catch (Exception $e) {
                        error_log("Warning: Failed to record neraca for kas mutation: " . $e->getMessage());
                    }
                }

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'message' => 'Mutasi kas berhasil',
                    'saldo_baru' => $newKas
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(400);
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
