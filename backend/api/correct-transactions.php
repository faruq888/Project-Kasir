<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

function insertKasMutation($pdo, $customerId, $type, $amount, $note, $transactionId) {
    $stmt = $pdo->prepare("
        INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$customerId, $type, $amount, $note, $transactionId]);
}

function insertWajibBeliMutation($pdo, $customerId, $amount, $note, $transactionId) {
    $stmt = $pdo->prepare("
        INSERT INTO wajib_beli_mutations (customer_id, amount, description, transaction_id)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$customerId, $amount, $note, $transactionId]);
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
                exit;
            }
            $transactionId = $_GET['id'];

            $stmt = $pdo->prepare("
                SELECT t.*, c.id AS customer_id, c.phone, c.address, c.kas
                FROM transactions t
                LEFT JOIN customers c ON t.customer = c.name
                WHERE t.id = ?
            ");
            $stmt->execute([$transactionId]);
            $transaction = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$transaction) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Transaction not found']);
                exit;
            }

            // **PERBAIKAN 2: Blokir akses jika status sudah 'Dibatalkan'**
            if ($transaction['status'] === 'Dibatalkan') {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Transaksi sudah dibatalkan dan tidak bisa dikoreksi lagi']);
                exit;
            }

            $stmt = $pdo->prepare("
                SELECT ti.*, p.stock, p.category_code, p.supplier_id
                FROM transaction_items ti
                LEFT JOIN products p ON ti.product_id = p.id
                WHERE ti.transaction_id = ?
            ");
            $stmt->execute([$transactionId]);
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $transaction['items'] = $items;

            echo json_encode(['success' => true, 'data' => $transaction]);
            break;

        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
                exit;
            }
            $transactionId = $_GET['id'];

            $pdo->beginTransaction();
            try {
                // Ambil transaksi dan coba dapatkan customer_id via join name
                $stmt = $pdo->prepare("
                    SELECT t.*, c.id AS customer_id, c.kas, c.saldo_wajib_beli, t.payment_method
                    FROM transactions t
                    LEFT JOIN customers c ON t.customer = c.name
                    WHERE t.id = ?
                ");
                $stmt->execute([$transactionId]);
                $trx = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$trx) throw new Exception("Transaction not found");

                $oldStatus = $trx['status'];
                $newStatus = $input['status'] ?? $oldStatus;
                $paymentMethod = $trx['payment_method'] ?? 'cash';
                $cusId = $trx['customer_id'] ?? null;

                // Jika cusId null, coba cari dari kas_mutations / wajib_beli_mutations
                if (!$cusId) {
                    $s = $pdo->prepare("SELECT customer_id FROM kas_mutations WHERE transaction_id = ? LIMIT 1");
                    $s->execute([$transactionId]);
                    $r = $s->fetch(PDO::FETCH_ASSOC);
                    if ($r && !empty($r['customer_id'])) $cusId = $r['customer_id'];
                }
                if (!$cusId) {
                    $s = $pdo->prepare("SELECT customer_id FROM wajib_beli_mutations WHERE transaction_id = ? LIMIT 1");
                    $s->execute([$transactionId]);
                    $r = $s->fetch(PDO::FETCH_ASSOC);
                    if ($r && !empty($r['customer_id'])) $cusId = $r['customer_id'];
                }

                // Update status (jika dikirim)
                if (isset($input['status'])) {
                    // hanya update kolom jika ada di schema
                    $colsStmt = $pdo->query("DESCRIBE transactions");
                    $existing = [];
                    while ($c = $colsStmt->fetch(PDO::FETCH_ASSOC)) $existing[] = $c['Field'];

                    if (in_array('status', $existing, true)) {
                        $pdo->prepare("UPDATE transactions SET status = ? WHERE id = ?")->execute([$input['status'], $transactionId]);
                    }
                }

                // === PERBAIKAN: LOGIKA STOK YANG KONSISTEN ===
                // Ambil items transaksi untuk rollback stok
                $stmt = $pdo->prepare("SELECT product_id, quantity FROM transaction_items WHERE transaction_id = ?");
                $stmt->execute([$transactionId]);
                $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Handle stock changes berdasarkan perubahan status
                if ($oldStatus !== $newStatus && !empty($items)) {
                    foreach ($items as $item) {
                        $productId = $item['product_id'];
                        $quantity = $item['quantity'];

                        // Logika rollback stok:
                        // 1. Jika dari 'Selesai' ke status apapun (Pending/Dibatalkan) → kembalikan stok
                        if ($oldStatus === 'Selesai' && $newStatus !== 'Selesai') {
                            $stmt = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                            $stmt->execute([$quantity, $productId]);
                        }

                        // 2. Jika dari status apapun (Pending/Dibatalkan) ke 'Selesai' → kurangi stok
                        elseif ($oldStatus !== 'Selesai' && $newStatus === 'Selesai') {
                            // Cek stok cukup terlebih dahulu
                            $stockCheck = $pdo->prepare("SELECT stock FROM products WHERE id = ?");
                            $stockCheck->execute([$productId]);
                            $currentStock = $stockCheck->fetchColumn();

                            if ($currentStock >= $quantity) {
                                $stmt = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
                                $stmt->execute([$quantity, $productId]);
                            } else {
                                throw new Exception("Stok tidak mencukupi untuk produk ID: {$productId}. Stok tersedia: {$currentStock}, dibutuhkan: {$quantity}");
                            }
                        }
                    }
                }

                // **PERBAIKAN 1: Optimasi Rollback Kas/Wajib Beli saat Dibatalkan**
                // Hanya lakukan jika berubah ke 'Dibatalkan' dan status sebelumnya bukan 'Dibatalkan'
                if ($newStatus === 'Dibatalkan' && $oldStatus !== 'Dibatalkan' && $cusId) {
                    // Hindari double-rollback: cek apakah sudah ada rollback record
                    $chk = $pdo->prepare("SELECT COUNT(*) FROM kas_mutations WHERE transaction_id = ? AND description LIKE ?");
                    $chk->execute([$transactionId, '%Rollback%']);
                    $kasRollbackExists = (bool)$chk->fetchColumn();

                    $chk2 = $pdo->prepare("SELECT COUNT(*) FROM wajib_beli_mutations WHERE transaction_id = ? AND description LIKE ?");
                    $chk2->execute([$transactionId, '%Rollback%']);
                    $wbRollbackExists = (bool)$chk2->fetchColumn();

                    // Ambil original kas mutasi untuk trx
                    $km = $pdo->prepare("SELECT id, type, amount FROM kas_mutations WHERE transaction_id = ?");
                    $km->execute([$transactionId]);
                    $kasMut = $km->fetchAll(PDO::FETCH_ASSOC);

                    $totalKasDelta = 0.0;
                    if (!empty($kasMut) && !$kasRollbackExists) {
                        foreach ($kasMut as $m) {
                            $type = $m['type']; $amt = (float)$m['amount'];
                            if ($type === 'setor' || $type === 'belanja') $totalKasDelta -= $amt;
                            elseif ($type === 'tarik') $totalKasDelta += $amt;
                            // Insert audit rollback
                            $note = 'Rollback kas dari pembatalan transaksi ' . $transactionId . ' (reverse of kas_mutation id ' . $m['id'] . ')';
                            insertKasMutation($pdo, $cusId, ($type === 'tarik') ? 'setor' : 'tarik', $amt, $note, $transactionId);
                        }
                    }

                    // Ambil wajib_beli mutasi
                    $wb = $pdo->prepare("SELECT id, amount FROM wajib_beli_mutations WHERE transaction_id = ?");
                    $wb->execute([$transactionId]);
                    $wbMut = $wb->fetchAll(PDO::FETCH_ASSOC);

                    $totalWbDelta = 0.0;
                    if (!empty($wbMut) && !$wbRollbackExists) {
                        foreach ($wbMut as $m) {
                            $amt = (float)$m['amount']; // bisa negatif (pemakaian)
                            $reverseAmt = -$amt;
                            $totalWbDelta += $reverseAmt;
                            $note = 'Rollback saldo wajib beli dari pembatalan transaksi ' . $transactionId . ' (reverse of wb id ' . $m['id'] . ')';
                            insertWajibBeliMutation($pdo, $cusId, $reverseAmt, $note, $transactionId);
                        }
                    }

                    // **Tambahan: Handle pembayaran campur jika payment_method mengandung 'campur'**
                    if (strpos($paymentMethod, 'campur') !== false && !$kasRollbackExists && !$wbRollbackExists) {
                        // Parse: misal "campur:kas=20000,saldo_wajib_beli=30000"
                        $parts = explode(',', str_replace('campur:', '', $paymentMethod));
                        foreach ($parts as $part) {
                            [$type, $amtStr] = explode('=', $part);
                            $amt = (float)$amtStr;
                            if ($type === 'kas' && $amt > 0) {
                                $totalKasDelta += $amt; // Kembalikan ke kas
                                $noteKas = 'Rollback kas campur dari pembatalan transaksi ' . $transactionId;
                                insertKasMutation($pdo, $cusId, 'setor', $amt, $noteKas, $transactionId);
                            } elseif ($type === 'saldo_wajib_beli' && $amt > 0) {
                                $totalWbDelta += $amt; // Kembalikan ke wajib beli
                                $noteWb = 'Rollback saldo wajib beli campur dari pembatalan transaksi ' . $transactionId;
                                insertWajibBeliMutation($pdo, $cusId, $amt, $noteWb, $transactionId);
                            }
                        }
                    }

                    // Terapkan delta ke customers secara atomic
                    if (($totalKasDelta != 0.0) || ($totalWbDelta != 0.0)) {
                // Lock customer row
                $cstmt = $pdo->prepare("SELECT kas, saldo_wajib_beli FROM customers WHERE id = ? FOR UPDATE");
                $cstmt->execute([$cusId]);
                $crow = $cstmt->fetch(PDO::FETCH_ASSOC);
                if ($crow) {
                    $curKas = (float)($crow['kas'] ?? 0);
                    $curWb = (float)($crow['saldo_wajib_beli'] ?? 0);
                    $newKas = max(0, $curKas + $totalKasDelta); // Pastikan tidak negatif
                    $newWb = max(0, $curWb + $totalWbDelta); // Pastikan tidak negatif
                    $pdo->prepare("UPDATE customers SET kas = ?, saldo_wajib_beli = ? WHERE id = ?")
                        ->execute([$newKas, $newWb, $cusId]);
                }
            }
        }

                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Transaction updated and stock/saldo properly handled']);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("Correct transactions error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(['success' => false, 'message' => $e->getMessage()]); // Ubah 'error' ke 'message' untuk konsistensi
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
            break;
    }
} catch (Exception $e) {
    error_log("Correct transactions API error (outer): " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]); // Ubah 'error' ke 'message' untuk konsistensi
}
?>
