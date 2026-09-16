<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/neraca_helper.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

/**
 * Record hutang payment mutation
 */
function recordPaymentMutation($pdo, $supplierId, $amount, $purchaseId, $description = '') {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO hutang_mutations (supplier_id, type, amount, description, purchase_id)
            VALUES (?, 'bayar', ?, ?, ?)
        ");
        $stmt->execute([$supplierId, $amount, $description, $purchaseId]);
        return true;
    } catch (Exception $e) {
        error_log("Error recording payment mutation: " . $e->getMessage());
        return false;
    }
}

/**
 * Calculate supplier total hutang (from purchases remaining_amount)
 */
function getSupplierHutang($pdo, $supplierId) {
    try {
        $stmt = $pdo->prepare("
            SELECT COALESCE(SUM(remaining_amount), 0) as total_hutang
            FROM purchases
            WHERE supplier_id = ? AND payment_status != 'Lunas'
        ");
        $stmt->execute([$supplierId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        return max(0, $result['total_hutang'] ?? 0);
    } catch (Exception $e) {
        error_log("Error calculating supplier hutang: " . $e->getMessage());
        return 0;
    }
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            // Get payment history for a purchase
            if (isset($_GET['purchase_id'])) {
                $stmt = $pdo->prepare("
                    SELECT pp.*, u.username as created_by_name
                    FROM purchase_payments pp
                    LEFT JOIN users u ON pp.created_by = u.username
                    WHERE pp.purchase_id = ?
                    ORDER BY pp.payment_date DESC
                ");
                $stmt->execute([$_GET['purchase_id']]);
                echo json_encode([
                    'success' => true,
                    'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)
                ]);
            }
            // Get overdue purchases
            elseif (isset($_GET['overdue'])) {
                $stmt = $pdo->query("
                    SELECT 
                        p.*,
                        s.name as supplier_name, 
                        s.contact,
                        COALESCE(p.remaining_amount, p.total_price - COALESCE(p.paid_amount, 0)) as remaining_amount,
                        COALESCE(p.paid_amount, 0) as paid_amount
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.payment_method = 'tempo'
                    AND p.payment_status != 'Lunas'
                    AND p.due_date <= CURDATE()
                    AND p.status IN ('Selesai', 'Pending')
                    AND COALESCE(p.remaining_amount, p.total_price - COALESCE(p.paid_amount, 0)) > 0
                    ORDER BY p.due_date ASC
                ");
                echo json_encode([
                    'success' => true,
                    'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)
                ]);
            }
            // Get upcoming due dates (next 7 days)
            elseif (isset($_GET['upcoming'])) {
                $stmt = $pdo->query("
                    SELECT 
                        p.*,
                        s.name as supplier_name, 
                        s.contact,
                        COALESCE(p.remaining_amount, p.total_price - COALESCE(p.paid_amount, 0)) as remaining_amount,
                        COALESCE(p.paid_amount, 0) as paid_amount
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.payment_method = 'tempo'
                    AND p.payment_status != 'Lunas'
                    AND p.due_date > CURDATE()
                    AND p.due_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                    AND p.status IN ('Selesai', 'Pending')
                    AND COALESCE(p.remaining_amount, p.total_price - COALESCE(p.paid_amount, 0)) > 0
                    ORDER BY p.due_date ASC
                ");
                echo json_encode([
                    'success' => true,
                    'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)
                ]);
            }
            // Get all tempo purchases with filters
            else {
                $search = $_GET['search'] ?? '';
                $paymentStatus = $_GET['payment_status'] ?? '';

                $query = "
                    SELECT 
                        p.*, 
                        s.name as supplier_name, 
                        s.contact,
                        COALESCE(p.remaining_amount, p.total_price - COALESCE(p.paid_amount, 0)) as remaining_amount,
                        COALESCE(p.paid_amount, 0) as paid_amount
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.payment_method = 'tempo'
                    AND p.status IN ('Selesai', 'Pending')
                ";
                $params = [];

                if ($search !== '') {
                    $query .= " AND (s.name LIKE ? OR p.id LIKE ?)";
                    $params[] = "%$search%";
                    $params[] = "%$search%";
                }

                if ($paymentStatus !== '') {
                    $query .= " AND p.payment_status = ?";
                    $params[] = $paymentStatus;
                }

                $query .= " ORDER BY p.due_date ASC";

                $stmt = $pdo->prepare($query);
                $stmt->execute($params);

                echo json_encode([
                    'success' => true,
                    'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)
                ]);
            }
            break;

        case 'POST':
            // Record payment for tempo purchase
            $input = json_decode(file_get_contents('php://input'), true);

            $purchaseId = $input['purchase_id'] ?? '';
            $paymentAmount = (float)($input['amount'] ?? 0);
            $paymentMethod = $input['payment_method'] ?? 'cash';
            $paymentDate = $input['payment_date'] ?? date('Y-m-d H:i:s');
            $notes = $input['notes'] ?? '';
            $createdBy = $input['created_by'] ?? 'System';

            if (empty($purchaseId) || $paymentAmount <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Data pembayaran tidak valid']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                // Get purchase data
                $stmt = $pdo->prepare("
                    SELECT p.*, s.name as supplier_name
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.id = ? FOR UPDATE
                ");
                $stmt->execute([$purchaseId]);
                $purchase = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$purchase) {
                    throw new Exception('Pembelian tidak ditemukan');
                }

                if ($purchase['payment_method'] !== 'tempo') {
                    throw new Exception('Pembelian ini bukan pembelian tempo');
                }

                $remainingAmount = (float)$purchase['remaining_amount'];
                $paidAmount = (float)$purchase['paid_amount'];

                if ($paymentAmount > $remainingAmount) {
                    throw new Exception("Jumlah pembayaran melebihi sisa hutang. Sisa: " . number_format($remainingAmount, 0, ',', '.'));
                }

                // Calculate new amounts
                $newPaidAmount = $paidAmount + $paymentAmount;
                $newRemainingAmount = $remainingAmount - $paymentAmount;

                // Determine payment status
                $paymentStatus = 'Belum Lunas';
                if ($newRemainingAmount <= 0) {
                    $paymentStatus = 'Lunas';
                } elseif ($newPaidAmount > 0 && $newRemainingAmount < $purchase['total_price']) {
                    $paymentStatus = 'Sebagian';
                }

                // Record payment
                $stmt = $pdo->prepare("
                    INSERT INTO purchase_payments (purchase_id, payment_date, amount, payment_method, notes, created_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([$purchaseId, $paymentDate, $paymentAmount, $paymentMethod, $notes, $createdBy]);

                // Update purchase
                $stmt = $pdo->prepare("
                    UPDATE purchases
                    SET paid_amount = ?, remaining_amount = ?, payment_status = ?
                    WHERE id = ?
                ");
                $stmt->execute([$newPaidAmount, $newRemainingAmount, $paymentStatus, $purchaseId]);

                // Record hutang mutation (payment)
                $description = "Pembayaran hutang pembelian {$purchase['supplier_name']} - " . ($notes ?: 'Pembayaran tempo');
                recordPaymentMutation(
                    $pdo,
                    $purchase['supplier_id'],
                    $paymentAmount,
                    $purchaseId,
                    $description
                );

                // Get supplier total hutang
                $newTotalHutang = getSupplierHutang($pdo, $purchase['supplier_id']);

                // Record neraca for hutang payment
                try {
                    $paymentId = $pdo->lastInsertId();
                    recordNeracaPaymentHutang(
                        $pdo,
                        $paymentId,
                        $paymentDate,
                        $paymentAmount,
                        $purchase['supplier_name'],
                        $createdBy
                    );
                } catch (Exception $e) {
                    error_log("Warning: Failed to record neraca for payment: " . $e->getMessage());
                }

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'message' => 'Pembayaran berhasil dicatat',
                    'data' => [
                        'paid_amount' => $newPaidAmount,
                        'remaining_amount' => $newRemainingAmount,
                        'payment_status' => $paymentStatus,
                        'supplier_total_hutang' => $newTotalHutang
                    ]
                ]);

            } catch (Exception $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            }
            break;

        case 'DELETE':
            // Delete payment record
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'ID pembayaran diperlukan']);
                exit;
            }

            $paymentId = $_GET['id'];

            $pdo->beginTransaction();
            try {
                // Get payment data
                $stmt = $pdo->prepare("
                    SELECT pp.*, p.supplier_id, p.total_price
                    FROM purchase_payments pp
                    LEFT JOIN purchases p ON pp.purchase_id = p.id
                    WHERE pp.id = ? FOR UPDATE
                ");
                $stmt->execute([$paymentId]);
                $payment = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$payment) {
                    throw new Exception('Data pembayaran tidak ditemukan');
                }

                $purchaseId = $payment['purchase_id'];
                $amount = (float)$payment['amount'];
                $supplierId = $payment['supplier_id'];

                // Get current purchase data
                $stmt = $pdo->prepare("SELECT paid_amount, remaining_amount FROM purchases WHERE id = ? FOR UPDATE");
                $stmt->execute([$purchaseId]);
                $purchase = $stmt->fetch(PDO::FETCH_ASSOC);

                // Reverse the payment
                $newPaidAmount = (float)$purchase['paid_amount'] - $amount;
                $newRemainingAmount = (float)$purchase['remaining_amount'] + $amount;

                // Determine new payment status
                $paymentStatus = 'Belum Lunas';
                if ($newRemainingAmount <= 0) {
                    $paymentStatus = 'Lunas';
                } elseif ($newPaidAmount > 0) {
                    $paymentStatus = 'Sebagian';
                }

                // Update purchase
                $stmt = $pdo->prepare("
                    UPDATE purchases
                    SET paid_amount = ?, remaining_amount = ?, payment_status = ?
                    WHERE id = ?
                ");
                $stmt->execute([$newPaidAmount, $newRemainingAmount, $paymentStatus, $purchaseId]);

                // Reverse hutang mutation
                $description = "Pembatalan pembayaran (ID: {$paymentId})";
                $stmt = $pdo->prepare("
                    INSERT INTO hutang_mutations (supplier_id, type, amount, description, purchase_id)
                    VALUES (?, 'hutang', ?, ?, ?)
                ");
                $stmt->execute([$supplierId, $amount, $description, $purchaseId]);

                // Hapus pencatatan neraca untuk pembayaran ini
                try {
                    deleteNeracaByReference($pdo, 'payment', $paymentId);
                } catch (Exception $e) {
                    error_log("Warning: Failed to delete neraca for payment {$paymentId}: " . $e->getMessage());
                }

                // Delete payment record
                $pdo->prepare("DELETE FROM purchase_payments WHERE id = ?")->execute([$paymentId]);

                // Get supplier total hutang
                $newTotalHutang = getSupplierHutang($pdo, $supplierId);

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'message' => 'Pembayaran berhasil dihapus',
                    'data' => [
                        'paid_amount' => $newPaidAmount,
                        'remaining_amount' => $newRemainingAmount,
                        'payment_status' => $paymentStatus,
                        'supplier_total_hutang' => $newTotalHutang
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
