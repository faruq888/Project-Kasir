<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/neraca_helper.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
$tzName = kasir_apply_system_timezone($pdo);

/**
 * Insert kas mutation record
 */
function insertKasMutation($pdo, $customerId, $type, $amount, $description, $transactionId) {
    $stmt = $pdo->prepare("
        INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$customerId, $type, $amount, $description, $transactionId]);
    error_log("Inserted kas mutation: type=$type, amount=$amount, desc=$description, trx=$transactionId");
}

/**
 * Insert wajib beli mutation record
 */
function insertWajibBeliMutation($pdo, $customerId, $amount, $description, $transactionId) {
    $stmt = $pdo->prepare("
        INSERT INTO wajib_beli_mutations (customer_id, amount, description, transaction_id)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$customerId, $amount, $description, $transactionId]);
    $mutationId = $pdo->lastInsertId();
    error_log("Inserted wajib beli mutation: amount=$amount, desc=$description, trx=$transactionId");
    return $mutationId;
}

/**
 * Record stock movement
 */
function recordStockMovement($pdo, $productId, $movementType, $quantity, $referenceType, $referenceId = null, $notes = '', $createdBy = null) {
    try {
        // Get current stock before movement
        $stmt = $pdo->prepare("SELECT stock, name FROM products WHERE id = ?");
        $stmt->execute([$productId]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$product) {
            return false;
        }

        // Products table already reflects the latest change when this helper is called,
        // so the snapshot we read is the stock AFTER the movement.
        $stockSnapshot = (int)$product['stock'];
        $stockAfter = $stockSnapshot;
        $stockBefore = $stockSnapshot;

        switch ($movementType) {
            case 'in':
                $stockBefore = max(0, $stockSnapshot - $quantity);
                break;
            case 'out':
                $stockBefore = max(0, $stockSnapshot + $quantity);
                break;
            case 'adjustment':
                $stockBefore = max(0, $stockSnapshot - $quantity);
                break;
        }

        // Insert stock movement record
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

        return true;
    } catch (Exception $e) {
        error_log("Error recording stock movement: " . $e->getMessage());
        return false;
    }
}

/**
 * Get net stock movement (out - in) per product for a transaction
 */
function getTransactionStockNet($pdo, $transactionId) {
    try {
        $stmt = $pdo->prepare("
            SELECT product_id, movement_type, quantity
            FROM stock_movements
            WHERE reference_type = 'transaction' AND reference_id = ?
        ");
        $stmt->execute([$transactionId]);

        $net = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $productId = $row['product_id'];
            if (!isset($net[$productId])) {
                $net[$productId] = 0;
            }

            $qty = (float)$row['quantity'];
            if ($row['movement_type'] === 'out') {
                $net[$productId] += $qty;
            } elseif ($row['movement_type'] === 'in') {
                $net[$productId] -= $qty;
            }
        }

        return $net;
    } catch (Exception $e) {
        error_log("Error reading stock movement net for transaction {$transactionId}: " . $e->getMessage());
        return [];
    }
}

/**
 * Handles transaction items (insert/update)
 */
function handleTransactionItems($pdo, $transactionId, $items) {
    try {
        $pdo->prepare("DELETE FROM transaction_items WHERE transaction_id = ?")
            ->execute([$transactionId]);

        $stmt = $pdo->prepare("
            INSERT INTO transaction_items
            (transaction_id, product_id, product_name, price, quantity)
            VALUES (?, ?, ?, ?, ?)
        ");

        foreach ($items as $item) {
            $stmt->execute([
                $transactionId,
                $item['product_id'],
                $item['product_name'],
                $item['price'],
                $item['quantity']
            ]);
        }
        return true;
    } catch (Exception $e) {
        error_log("Error handling transaction items: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Generates a unique transaction ID
 */
function generateTransactionId($pdo) {
    global $tzName;
    $maxAttempts = 5;
    $attempt = 0;
    $tz = $tzName ?: date_default_timezone_get();

    do {
        $date = new DateTime('now', new DateTimeZone($tz));
        $id = 'TRX-' . $date->format('dmy-Hi');

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE id = ?");
        $stmt->execute([$id]);

        if (!$stmt->fetchColumn()) {
            return $id;
        }
        $attempt++;
        usleep(100000);
    } while ($attempt < $maxAttempts);

    throw new Exception("Failed to generate unique transaction ID after $maxAttempts attempts");
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            $search = $_GET['search'] ?? '';
            $query = "SELECT t.* FROM transactions t";
            $params = [];
            if ($search !== '') {
                $query .= " WHERE t.customer LIKE ?";
                $params[] = "%$search%";
            }
            $query .= " ORDER BY t.date DESC";

            $stmt = $pdo->prepare($query);
            $stmt->execute($params);
            $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($transactions as &$transaction) {
                $stmt = $pdo->prepare("
                    SELECT ti.* FROM transaction_items ti
                    WHERE ti.transaction_id = ?
                ");
                $stmt->execute([$transaction['id']]);
                $transaction['items'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
            }

            echo json_encode([
                'success' => true,
                'data' => $transactions
            ]);
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);

            $required = ['customer', 'total', 'status', 'items'];
            foreach ($required as $field) {
                if (!isset($input[$field])) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => "Missing required field: $field",
                        'received' => $input
                    ]);
                    exit;
                }
            }

            if (!is_array($input['items']) || count($input['items']) === 0) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'Transaction must contain at least one item'
                ]);
                exit;
            }

            $paymentMethod = $input['payment_method'] ?? 'cash';
            $customerId = $input['customer_id'] ?? null;
            $isMember = ($input['is_member'] ?? 0) == 1;

            if ($paymentMethod === 'saldo_wajib_beli') {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'Metode pembayaran Wajib Beli sudah tidak tersedia'
                ]);
                exit;
            }

            // Transaction time (without seconds)
            if (!empty($input['date'])) {
                try {
                    $dt = new DateTime($input['date'], new DateTimeZone($tzName));
                } catch (Exception $e) {
                    $dt = new DateTime('now', new DateTimeZone($tzName));
                }
            } else {
                $dt = new DateTime('now', new DateTimeZone($tzName));
            }
            $transactionDate = $dt->format('Y-m-d H:i:00');

            $pdo->beginTransaction();
            try {
                $transactionId = generateTransactionId($pdo);
                error_log("Generated transaction ID: $transactionId");

                $customerData = null;
                $totalAmount = (float)$input['total'];

                // Get customer data for member payments
                if ($isMember && $customerId) {
                    $stmt = $pdo->prepare("SELECT * FROM customers WHERE id = ? LIMIT 1");
                    $stmt->execute([$customerId]);
                    $customerData = $stmt->fetch(PDO::FETCH_ASSOC);

                    if (!$customerData) {
                        throw new Exception("Customer tidak ditemukan dalam database anggota");
                    }
                }

                // Include customer_id when inserting transaction
                $stmt = $pdo->prepare("
                    INSERT INTO transactions
                    (id, date, customer, customer_id, total, payment_method, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $transactionId,
                    $transactionDate,
                    $input['customer'],
                    $customerId ?? null,
                    $input['total'],
                    $paymentMethod,
                    $input['status']
                ]);

                // Insert items
                handleTransactionItems($pdo, $transactionId, $input['items']);

                // Handle payment mutations after transaction is saved
                if ($paymentMethod === 'saldo_wajib_beli' && $isMember && $customerData) {
                    $currentSaldoWajibBeli = (float)$customerData['saldo_wajib_beli'];

                    if ($currentSaldoWajibBeli < $totalAmount) {
                        throw new Exception("Saldo wajib beli tidak mencukupi. Saldo: " . number_format($currentSaldoWajibBeli, 0, ',', '.') . ", Total: " . number_format($totalAmount, 0, ',', '.'));
                    }

                    // Deduct from saldo wajib beli
                    $newSaldoWajibBeli = $currentSaldoWajibBeli - $totalAmount;
                    $pdo->prepare("UPDATE customers SET saldo_wajib_beli = ? WHERE id = ?")
                        ->execute([$newSaldoWajibBeli, $customerData['id']]);

                    // Record wajib beli mutation
                    $wajibMutationId = insertWajibBeliMutation(
                        $pdo,
                        $customerData['id'],
                        -$totalAmount, // Negative amount for deduction
                        'Belanja dengan saldo wajib beli - Transaksi ' . $transactionId,
                        $transactionId
                    );

                    try {
                        recordNeracaWajibBeliWithdrawal(
                            $pdo,
                            $wajibMutationId,
                            $transactionDate,
                            $totalAmount,
                            $customerData['name'] ?? 'Unknown',
                            $currentUserName ?? 'System'
                        );
                    } catch (Exception $e) {
                        error_log("Warning: Failed to record neraca wajib beli withdrawal: " . $e->getMessage());
                    }

                    // Add to kas (convert wajib beli to kas)
                    $currentKas = (float)$customerData['kas'];
                    $newKas = $currentKas + $totalAmount;
                    $pdo->prepare("UPDATE customers SET kas = ? WHERE id = ?")
                        ->execute([$newKas, $customerData['id']]);

                    // Record kas mutation
                    $pdo->prepare("
                        INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id)
                        VALUES (?, 'belanja', ?, ?, ?)
                    ")->execute([
                        $customerData['id'],
                        $totalAmount,
                        'Konversi dari saldo wajib beli - Transaksi ' . $transactionId,
                        $transactionId
                    ]);

                    error_log("Converted saldo wajib beli {$totalAmount} to kas for customer {$customerData['id']} (trx {$transactionId})");
                }

                // Handle kas payment
                if ($paymentMethod === 'kas' && $isMember && $customerData) {
                    $currentKas = (float)$customerData['kas'];

                    if ($currentKas >= $totalAmount) {
                        // Full payment with kas
                        $newKas = $currentKas - $totalAmount;
                        $pdo->prepare("UPDATE customers SET kas = ? WHERE id = ?")
                            ->execute([$newKas, $customerData['id']]);

                        $pdo->prepare("
                            INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id)
                            VALUES (?, 'tarik', ?, ?, ?)
                        ")->execute([
                            $customerData['id'],
                            $totalAmount,
                            'Belanja dengan kas anggota - Transaksi ' . $transactionId,
                            $transactionId
                        ]);
                    } else {
                        // Partial payment with kas, rest with cash
                        if ($currentKas > 0) {
                            $pdo->prepare("UPDATE customers SET kas = 0 WHERE id = ?")
                                ->execute([$customerData['id']]);

                            $pdo->prepare("
                                INSERT INTO kas_mutations (customer_id, type, amount, description, transaction_id)
                                VALUES (?, 'tarik', ?, ?, ?)
                            ")->execute([
                                $customerData['id'],
                                $currentKas,
                                'Belanja sebagian dengan kas (sisa cash) - Transaksi ' . $transactionId,
                                $transactionId
                            ]);
                        }

                        // Update payment method to cash for recording
                        $pdo->prepare("UPDATE transactions SET payment_method = 'cash' WHERE id = ?")
                            ->execute([$transactionId]);
                    }
                }

                // Update stock:
                // - Always for completed transactions
                // - Also for pending debit/transfer (hutang) so stok langsung berkurang
                $isDebitTransfer = ($input['payment_method'] === 'debit' || $input['payment_method'] === 'transfer');
                $shouldReduceStock = ($input['status'] === 'Selesai') || ($isDebitTransfer && $input['status'] === 'Pending');

                if ($shouldReduceStock) {
                    foreach ($input['items'] as $item) {
                        // Update stock
                        $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?")
                            ->execute([$item['quantity'], $item['product_id']]);

                        // Record stock movement
                        $movementNote = 'Penjualan - ' . $input['customer'];
                        if ($input['status'] === 'Pending' && $isDebitTransfer) {
                            $movementNote = 'Penjualan hutang (debit/transfer) - ' . $input['customer'];
                        }
                        recordStockMovement(
                            $pdo,
                            $item['product_id'],
                            'out',
                            $item['quantity'],
                            'transaction',
                            $transactionId,
                            $movementNote,
                            $currentUserName ?? 'System'
                        );
                    }
                }

                // Record neraca entry for sales
                // - Debit/Transfer + Pending = Piutang ONLY
                // - Debit/Transfer + Selesai (after verification via PUT) = handled in PUT method
                // - Other methods + Selesai = Pemasukan (langsung)
                try {
                    // Check if payment method is debit or transfer and status is pending
                    if (($input['payment_method'] === 'debit' || $input['payment_method'] === 'transfer') 
                        && $input['status'] === 'Pending') {
                        // Record as receivable (piutang) for pending debit/transfer transactions
                        recordNeracaReceivable(
                            $pdo,
                            $transactionId,
                            $transactionDate,
                            $totalAmount,
                            $input['customer'],
                            $input['payment_method'],
                            $currentUserName ?? 'System'
                        );
                    } else if ($input['status'] === 'Selesai' 
                               && $input['payment_method'] !== 'debit' 
                               && $input['payment_method'] !== 'transfer') {
                        // Record as income (pemasukan) for completed transactions with non-debit/transfer methods
                        // Note: Debit/Transfer yang di-verify akan di-handle di PUT method
                        recordNeracaSales(
                            $pdo,
                            $transactionId,
                            $transactionDate,
                            $totalAmount,
                            $input['customer'],
                            $currentUserName ?? 'System'
                        );
                    }
                    // Note: Debit/Transfer dengan status Selesai langsung (tanpa Pending) tidak dicatat
                    // Karena flow yang benar adalah: Pending dulu -> Verifikasi manual -> Selesai
                } catch (Exception $e) {
                    error_log("Warning: Failed to record neraca for transaction $transactionId: " . $e->getMessage());
                    // Don't fail the transaction if neraca recording fails
                }

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'id' => $transactionId,
                    'message' => 'Transaction created successfully'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("Transaction error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
            }
            break;

        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
                exit;
            }

            $transactionId = $_GET['id'];
            $allowedFields = ['status'];
            $updateData = array_intersect_key($input ?? [], array_flip($allowedFields));

            if (empty($updateData)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'No valid fields to update']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                // Get old transaction data
                $stmt = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
                $stmt->execute([$transactionId]);
                $oldTransaction = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$oldTransaction) {
                    throw new Exception("Transaction not found");
                }

                $oldStatus = $oldTransaction['status'];
                $newStatus = $updateData['status'] ?? $oldStatus;
                $paymentMethod = $oldTransaction['payment_method'] ?? 'cash';
                $cusId = $oldTransaction['customer_id'] ?? null;

                // Update transaction
                if (isset($updateData['status'])) {
                    $pdo->prepare("UPDATE transactions SET status = ? WHERE id = ?")
                        ->execute([$updateData['status'], $transactionId]);
                }

                // Handle stock updates based on status change
                if ($oldStatus !== $newStatus) {
                    $stmt = $pdo->prepare("SELECT product_id, quantity FROM transaction_items WHERE transaction_id = ?");
                    $stmt->execute([$transactionId]);
                    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

                    $increaseStmt = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                    $decreaseStmt = $pdo->prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
                    $stockNetMovements = getTransactionStockNet($pdo, $transactionId);

                    // Restore stock if going from Selesai to other status
                    if ($oldStatus === 'Selesai' && $newStatus !== 'Selesai' && !empty($items)) {
                        foreach ($items as $item) {
                            $netOut = max(0, $stockNetMovements[$item['product_id']] ?? $item['quantity']);
                            if ($netOut > 0) {
                                $increaseStmt->execute([$netOut, $item['product_id']]);

                                // Record stock movement (return/cancellation)
                                recordStockMovement(
                                    $pdo,
                                    $item['product_id'],
                                    'in',
                                    $netOut,
                                    'transaction',
                                    $transactionId,
                                    'Pembatalan/Pengembalian transaksi',
                                    $currentUserName ?? 'System'
                                );
                            }
                        }

                        // Delete neraca entry when transaction is cancelled
                        try {
                            deleteNeracaByReference($pdo, 'transaction', $transactionId);
                        } catch (Exception $e) {
                            error_log("Warning: Failed to delete neraca for cancelled transaction: " . $e->getMessage());
                        }
                    }

                    // Reduce stock if going from other status to Selesai
                    if ($oldStatus !== 'Selesai' && $newStatus === 'Selesai' && !empty($items)) {
                        foreach ($items as $item) {
                            $existingOut = max(0, $stockNetMovements[$item['product_id']] ?? 0);
                            $missingQty = max(0, $item['quantity'] - $existingOut);

                            if ($missingQty > 0) {
                                $decreaseStmt->execute([$missingQty, $item['product_id']]);

                                // Record stock movement
                                recordStockMovement(
                                    $pdo,
                                    $item['product_id'],
                                    'out',
                                    $missingQty,
                                    'transaction',
                                    $transactionId,
                                    'Penjualan - Verifikasi transaksi',
                                    $currentUserName ?? 'System'
                                );
                            }
                        }

                        // Record neraca entry when transaction is completed
                        // - If payment_method = debit/transfer and oldStatus = Pending, delete piutang first
                        // - Then record as pemasukan
                        try {
                            $totalAmount = (float)$oldTransaction['total'];
                            $customer = $oldTransaction['customer'];
                            $transactionDate = $oldTransaction['date'];
                            $paymentMethod = $oldTransaction['payment_method'] ?? '';
                            
                            // If this was a pending debit/transfer transaction, delete the receivable entry first
                            if (($paymentMethod === 'debit' || $paymentMethod === 'transfer') && $oldStatus === 'Pending') {
                                deleteNeracaByReference($pdo, 'transaction', $transactionId);
                            }
                            
                            // Now record as sales income
                            recordNeracaSales(
                                $pdo,
                                $transactionId,
                                $transactionDate,
                                $totalAmount,
                                $customer,
                                $currentUserName ?? 'System'
                            );
                        } catch (Exception $e) {
                            error_log("Warning: Failed to record neraca for completed transaction: " . $e->getMessage());
                        }
                    }

                    // Restore stock for pending debit/transfer that was already reduced when cancelled
                    if ($newStatus === 'Dibatalkan' && $oldStatus !== 'Selesai' && !empty($items)) {
                        foreach ($items as $item) {
                            $netOut = max(0, $stockNetMovements[$item['product_id']] ?? 0);
                            if ($netOut > 0) {
                                $increaseStmt->execute([$netOut, $item['product_id']]);

                                recordStockMovement(
                                    $pdo,
                                    $item['product_id'],
                                    'in',
                                    $netOut,
                                    'transaction',
                                    $transactionId,
                                    'Pembatalan transaksi sebelum selesai',
                                    $currentUserName ?? 'System'
                                );
                            }
                        }
                    }
                }

                // Rollback saldo kas, wajib beli, dan neraca saat dibatalkan
                // Hanya lakukan jika berubah ke 'Dibatalkan' dan status sebelumnya bukan 'Dibatalkan'
                if ($newStatus === 'Dibatalkan' && $oldStatus !== 'Dibatalkan') {
                    // Rollback neraca entry (hapus entry penjualan yang sudah tercatat)
                    try {
                        deleteNeracaByReference($pdo, 'transaction', $transactionId);
                        error_log("Deleted neraca entries for cancelled transaction $transactionId");
                    } catch (Exception $e) {
                        error_log("Warning: Failed to rollback neraca for transaction $transactionId: " . $e->getMessage());
                    }
                    
                    if ($cusId) {
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
                            $type = $m['type'];
                            $amt = (float)$m['amount'];
                            if ($type === 'setor' || $type === 'belanja') {
                                $totalKasDelta -= $amt;
                            } elseif ($type === 'tarik') {
                                $totalKasDelta += $amt;
                            }
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

                    // Handle pembayaran campur jika payment_method mengandung 'campur'
                    // (Tambahan: Parse dan reverse jika belum di-handle di mutasi utama)
                    if (strpos($paymentMethod, 'campur') !== false && !$kasRollbackExists && !$wbRollbackExists) {
                        // Parse format: "campur:kas=20000,saldo_wajib_beli=30000"
                        $campurParts = explode(':', $paymentMethod);
                        if (count($campurParts) >= 2) {
                            $components = explode(',', $campurParts[1]);
                            foreach ($components as $comp) {
                                [$type, $amtStr] = explode('=', trim($comp));
                                $amt = (float)$amtStr;
                                if ($type === 'kas' && $amt > 0) {
                                    // Kembalikan ke kas (reverse tarik)
                                    $noteKas = 'Rollback kas campur dari pembatalan transaksi ' . $transactionId;
                                    insertKasMutation($pdo, $cusId, 'setor', $amt, $noteKas, $transactionId);
                                    $totalKasDelta += $amt;
                                } elseif ($type === 'saldo_wajib_beli' && $amt > 0) {
                                    // Kembalikan ke wajib beli (reverse deduct)
                                    $noteWb = 'Rollback saldo wajib beli campur dari pembatalan transaksi ' . $transactionId;
                                    insertWajibBeliMutation($pdo, $cusId, $amt, $noteWb, $transactionId);
                                    $totalWbDelta += $amt;
                                }
                            }
                        }
                    }

                    // Atomic update saldo customers dengan lock FOR UPDATE
                    // Lock row customer untuk hindari race condition
                    $lockStmt = $pdo->prepare("SELECT kas, saldo_wajib_beli FROM customers WHERE id = ? FOR UPDATE");
                    $lockStmt->execute([$cusId]);
                    $currentBalances = $lockStmt->fetch(PDO::FETCH_ASSOC);

                    if ($currentBalances) {
                        $newKas = max(0, (float)$currentBalances['kas'] + $totalKasDelta); // Pastikan >=0
                        $newWb = max(0, (float)$currentBalances['saldo_wajib_beli'] + $totalWbDelta); // Pastikan >=0

                        // Update atomic
                        $updateStmt = $pdo->prepare("UPDATE customers SET kas = ?, saldo_wajib_beli = ? WHERE id = ?");
                        $updateStmt->execute([$newKas, $newWb, $cusId]);

                        error_log("Rollback balances updated: kas={$newKas}, wb={$newWb} for customer {$cusId} (trx {$transactionId})");
                    } else {
                        error_log("Warning: Customer {$cusId} not found during rollback for trx {$transactionId}");
                    }
                    } // Close if ($cusId)
                }

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'id' => $transactionId,
                    'message' => 'Transaction updated successfully'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("PUT Transaction error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
            }
            break;

        case 'DELETE':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Transaction ID required']);
                exit;
            }

            $transactionId = $_GET['id'];
            $pdo->beginTransaction();
            try {
                // Get transaction data before delete
                $stmt = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
                $stmt->execute([$transactionId]);
                $transaction = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$transaction) {
                    throw new Exception("Transaction not found");
                }

                $status = $transaction['status'];
                $cusId = $transaction['customer_id'] ?? null;

                $itemsStmt = $pdo->prepare("SELECT product_id, quantity FROM transaction_items WHERE transaction_id = ?");
                $itemsStmt->execute([$transactionId]);
                $items = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
                $stockNetMovements = getTransactionStockNet($pdo, $transactionId);

                $shouldRestoreStock = ($status === 'Selesai' || $status === 'Dibatalkan');
                if (!$shouldRestoreStock) {
                    foreach ($stockNetMovements as $qtyOut) {
                        if ($qtyOut > 0) {
                            $shouldRestoreStock = true;
                            break;
                        }
                    }
                }

                // Rollback saldo & stok jika status Selesai/Dibatalkan atau ada stok yang sudah keluar
                if ($shouldRestoreStock && !empty($items)) {
                    $increaseStmt = $pdo->prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
                    foreach ($items as $item) {
                        $restoreQty = max(0, $stockNetMovements[$item['product_id']] ?? 0);
                        if ($restoreQty === 0 && ($status === 'Selesai' || $status === 'Dibatalkan')) {
                            // Fallback ke qty transaksi jika tidak ada jejak movement (untuk menjaga perilaku lama)
                            $restoreQty = $item['quantity'];
                        }

                        if ($restoreQty > 0) {
                            $increaseStmt->execute([$restoreQty, $item['product_id']]);

                            // Record stock movement (return/cancellation)
                            recordStockMovement(
                                $pdo,
                                $item['product_id'],
                                'in',
                                $restoreQty,
                                'transaction',
                                $transactionId,
                                'Pembatalan/Pengembalian transaksi (delete)',
                                $currentUserName ?? 'System'
                            );
                        }
                    }
                }

                if ($status === 'Selesai' || $status === 'Dibatalkan') { // Asumsi: rollback kalau sudah processed
                    // Rollback mutations (mirip PUT, tapi full delete)
                    if ($cusId) {
                        // Cek dan reverse kas mutations
                        $kmStmt = $pdo->prepare("SELECT id, type, amount FROM kas_mutations WHERE transaction_id = ?");
                        $kmStmt->execute([$transactionId]);
                        $kasMut = $kmStmt->fetchAll(PDO::FETCH_ASSOC);

                        $kasDelta = 0.0;
                        if (!empty($kasMut)) {
                            foreach ($kasMut as $m) {
                                $type = $m['type'];
                                $amt = (float)$m['amount'];
                                $note = 'Rollback kas dari delete transaksi ' . $transactionId . ' (reverse of kas_mutation id ' . $m['id'] . ')';
                                insertKasMutation($pdo, $cusId, ($type === 'tarik') ? 'setor' : 'tarik', $amt, $note, $transactionId);

                                // Hitung delta
                                if ($type === 'setor' || $type === 'belanja') {
                                    $kasDelta -= $amt;
                                } elseif ($type === 'tarik') {
                                    $kasDelta += $amt;
                                }
                            }
                        }

                        // Cek dan reverse wajib beli mutations
                        $wbStmt = $pdo->prepare("SELECT id, amount FROM wajib_beli_mutations WHERE transaction_id = ?");
                        $wbStmt->execute([$transactionId]);
                        $wbMut = $wbStmt->fetchAll(PDO::FETCH_ASSOC);

                        $wbDelta = 0.0;
                        if (!empty($wbMut)) {
                            foreach ($wbMut as $m) {
                                $amt = (float)$m['amount'];
                                $reverseAmt = -$amt;
                                $note = 'Rollback wajib beli dari delete transaksi ' . $transactionId . ' (reverse of wb id ' . $m['id'] . ')';
                                insertWajibBeliMutation($pdo, $cusId, $reverseAmt, $note, $transactionId);

                                // Hitung delta
                                $wbDelta += $reverseAmt;
                            }
                        }

                        // Atomic update balances
                        $lockStmt = $pdo->prepare("SELECT kas, saldo_wajib_beli FROM customers WHERE id = ? FOR UPDATE");
                        $lockStmt->execute([$cusId]);
                        $currentBalances = $lockStmt->fetch(PDO::FETCH_ASSOC);

                        if ($currentBalances) {
                            $newKas = max(0, (float)$currentBalances['kas'] + $kasDelta);
                            $newWb = max(0, (float)$currentBalances['saldo_wajib_beli'] + $wbDelta);

                            $updateStmt = $pdo->prepare("UPDATE customers SET kas = ?, saldo_wajib_beli = ? WHERE id = ?");
                            $updateStmt->execute([$newKas, $newWb, $cusId]);

                            error_log("Delete rollback balances: kas={$newKas}, wb={$newWb} for customer {$cusId} (trx {$transactionId})");
                        }
                    }
                }

                // Delete items first
                $pdo->prepare("DELETE FROM transaction_items WHERE transaction_id = ?")->execute([$transactionId]);

                // Delete mutations (audit trail, optional: bisa biarkan untuk history)
                // Di sini kita delete untuk bersihkan, tapi rollback sudah direverse di atas
                $pdo->prepare("DELETE FROM kas_mutations WHERE transaction_id = ?")->execute([$transactionId]);
                $pdo->prepare("DELETE FROM wajib_beli_mutations WHERE transaction_id = ?")->execute([$transactionId]);

                // Delete neraca entries
                try {
                    deleteNeracaByReference($pdo, 'transaction', $transactionId);
                } catch (Exception $e) {
                    error_log("Warning: Failed to delete neraca entries: " . $e->getMessage());
                }

                // Delete transaction
                $pdo->prepare("DELETE FROM transactions WHERE id = ?")->execute([$transactionId]);

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'id' => $transactionId,
                    'message' => 'Transaction deleted successfully'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("DELETE Transaction error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString()
                ]);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
            break;
    }
} catch (Exception $e) {
    error_log("General error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error: ' . $e->getMessage()
    ]);
}
?>
