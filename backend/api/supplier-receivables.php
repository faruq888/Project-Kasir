<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

function sendResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            $id = $_GET['id'] ?? '';
            if ($id !== '') {
                $stmt = $pdo->prepare("SELECT r.*, s.name AS supplier_name FROM supplier_receivables r JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = ?");
                $stmt->execute([$id]);
                $receivable = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$receivable) sendResponse(['success' => false, 'message' => 'Piutang tidak ditemukan'], 404);

                $paymentStmt = $pdo->prepare('SELECT * FROM supplier_receivable_payments WHERE receivable_id = ? ORDER BY payment_date DESC, id DESC');
                $paymentStmt->execute([$id]);
                sendResponse(['success' => true, 'data' => ['receivable' => $receivable, 'payments' => $paymentStmt->fetchAll(PDO::FETCH_ASSOC)]]);
            }

            $stmt = $pdo->query("SELECT r.*, s.name AS supplier_name, s.contact AS supplier_contact FROM supplier_receivables r JOIN suppliers s ON s.id = r.supplier_id ORDER BY r.status = 'Lunas', r.due_date IS NULL, r.due_date ASC, r.transaction_date DESC, r.id DESC");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $summaryStmt = $pdo->query("SELECT COUNT(*) AS total_count, COALESCE(SUM(amount), 0) AS total_amount, COALESCE(SUM(paid_amount), 0) AS total_paid, COALESCE(SUM(remaining_amount), 0) AS total_remaining FROM supplier_receivables WHERE status != 'Lunas'");
            sendResponse(['success' => true, 'data' => $rows, 'summary' => $summaryStmt->fetch(PDO::FETCH_ASSOC)]);

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            if (!is_array($input)) sendResponse(['success' => false, 'message' => 'JSON tidak valid'], 400);

            $action = $input['action'] ?? 'create';
            if ($action === 'create') {
                $supplierId = trim($input['supplier_id'] ?? '');
                $description = trim($input['description'] ?? '');
                $amount = (float)($input['amount'] ?? 0);
                $transactionDate = $input['transaction_date'] ?? date('Y-m-d');
                $dueDate = !empty($input['due_date']) ? $input['due_date'] : null;
                $createdBy = $input['created_by'] ?? 'System';

                if ($supplierId === '' || $description === '' || $amount <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $transactionDate)) {
                    sendResponse(['success' => false, 'message' => 'Supplier, keterangan, tanggal, dan jumlah wajib diisi dengan benar'], 400);
                }
                $supplierStmt = $pdo->prepare('SELECT id FROM suppliers WHERE id = ?');
                $supplierStmt->execute([$supplierId]);
                if (!$supplierStmt->fetch()) sendResponse(['success' => false, 'message' => 'Supplier tidak ditemukan'], 404);

                $stmt = $pdo->prepare("INSERT INTO supplier_receivables (supplier_id, transaction_date, description, amount, remaining_amount, due_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'Belum Lunas', ?)");
                $stmt->execute([$supplierId, $transactionDate, $description, $amount, $amount, $dueDate, $createdBy]);
                sendResponse(['success' => true, 'message' => 'Piutang supplier berhasil ditambahkan', 'id' => $pdo->lastInsertId()]);
            }

            if ($action === 'payment') {
                $receivableId = (int)($input['receivable_id'] ?? 0);
                $amount = (float)($input['amount'] ?? 0);
                $paymentDate = $input['payment_date'] ?? date('Y-m-d');
                $paymentMethod = $input['payment_method'] ?? 'cash';
                $notes = trim($input['notes'] ?? '');
                $createdBy = $input['created_by'] ?? 'System';
                if ($receivableId <= 0 || $amount <= 0) sendResponse(['success' => false, 'message' => 'Data pembayaran tidak valid'], 400);

                $pdo->beginTransaction();
                $stmt = $pdo->prepare('SELECT r.*, s.name AS supplier_name FROM supplier_receivables r JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = ? FOR UPDATE');
                $stmt->execute([$receivableId]);
                $receivable = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$receivable) throw new Exception('Piutang tidak ditemukan');
                $remaining = (float)$receivable['remaining_amount'];
                if ($amount > $remaining + 0.001) throw new Exception('Pembayaran melebihi sisa piutang');

                $newPaid = (float)$receivable['paid_amount'] + $amount;
                $newRemaining = max(0, $remaining - $amount);
                $status = $newRemaining <= 0.001 ? 'Lunas' : ($newPaid > 0 ? 'Sebagian' : 'Belum Lunas');
                $paymentStmt = $pdo->prepare('INSERT INTO supplier_receivable_payments (receivable_id, payment_date, amount, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)');
                $paymentStmt->execute([$receivableId, $paymentDate, $amount, $paymentMethod, $notes, $createdBy]);
                $updateStmt = $pdo->prepare('UPDATE supplier_receivables SET paid_amount = ?, remaining_amount = ?, status = ? WHERE id = ?');
                $updateStmt->execute([$newPaid, $newRemaining, $status, $receivableId]);

                $neracaStmt = $pdo->prepare("INSERT INTO neraca (transaction_date, category, type, amount, description, reference_type, reference_id, created_by) VALUES (?, 'pengembalian_supplier', 'pemasukan', ?, ?, 'payment', ?, ?)");
                $neracaStmt->execute([$paymentDate . ' 00:00:00', $amount, 'Pembayaran piutang dari supplier ' . $receivable['supplier_name'], $receivableId, $createdBy]);
                $pdo->commit();
                sendResponse(['success' => true, 'message' => 'Pembayaran piutang berhasil dicatat', 'data' => ['remaining_amount' => $newRemaining, 'status' => $status]]);
            }

            sendResponse(['success' => false, 'message' => 'Action tidak dikenal'], 400);

        default:
            sendResponse(['success' => false, 'message' => 'Method tidak diizinkan'], 405);
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    sendResponse(['success' => false, 'message' => 'Terjadi kesalahan server', 'error' => $e->getMessage()], 500);
}
