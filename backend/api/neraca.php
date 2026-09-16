<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/timezone.php';

$pdo = getDatabaseConnection();
kasir_apply_system_timezone($pdo);

/**
 * Record neraca entry
 */
function recordNeraca($pdo, $transactionDate, $category, $type, $amount, $description, $referenceType, $referenceId = null, $createdBy = null) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO neraca (transaction_date, category, type, amount, description, reference_type, reference_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $transactionDate,
            $category,
            $type,
            $amount,
            $description,
            $referenceType,
            $referenceId,
            $createdBy
        ]);
        return $pdo->lastInsertId();
    } catch (Exception $e) {
        error_log("Error recording neraca: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Normalize piutang to display as pengeluaran (without changing accounting totals)
 */
function mapPiutangDisplay($rows) {
    return array_map(function($row) {
        $row['original_type'] = $row['type'] ?? null;
        if (($row['category'] ?? '') === 'piutang') {
            $row['type'] = 'pengeluaran';
            $row['display_type'] = 'pengeluaran';
        } else {
            $row['display_type'] = $row['type'] ?? null;
        }
        return $row;
    }, $rows ?? []);
}

try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            if (isset($_GET['action'])) {
                switch ($_GET['action']) {
                    case 'summary':
                        // Get summary report
                        $startDate = $_GET['start_date'] ?? null;
                        $endDate = $_GET['end_date'] ?? null;
                        $typeFilter = $_GET['type'] ?? null;
                        $categoryFilter = $_GET['category'] ?? null;
                        $wajibBeliCategories = ['simpanan_wajib_beli', 'pengeluaran_wajib_beli'];

                        $query = "
                            SELECT 
                                type,
                                category,
                                SUM(amount) as total_amount,
                                COUNT(*) as transaction_count
                            FROM neraca
                            WHERE 1=1
                        ";
                        $params = [];

                        if ($startDate) {
                            $query .= " AND transaction_date >= ?";
                            $params[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $query .= " AND transaction_date <= ?";
                            $params[] = $endDate . ' 23:59:59';
                        }
                        if ($typeFilter) {
                            if ($typeFilter === 'pengeluaran') {
                                // Tampilkan piutang di sisi pengeluaran (tampilan) tanpa mengubah akuntansi
                                $query .= " AND (type = 'pengeluaran' OR category = 'piutang')";
                            } elseif ($typeFilter === 'pemasukan') {
                                // Saat filter pemasukan, piutang tidak ikut agar tidak dianggap pendapatan
                                if ($categoryFilter === 'piutang') {
                                    $query .= " AND type = 'pemasukan'";
                                } else {
                                    $query .= " AND type = 'pemasukan' AND category != 'piutang'";
                                }
                            } else {
                                $query .= " AND type = ?";
                                $params[] = $typeFilter;
                            }
                        }
                        if ($categoryFilter) {
                            $query .= " AND category = ?";
                            $params[] = $categoryFilter;
                        }

                        $query .= " GROUP BY type, category ORDER BY type DESC, category";

                        $stmt = $pdo->prepare($query);
                        $stmt->execute($params);
                        $details = $stmt->fetchAll(PDO::FETCH_ASSOC);

                        // Calculate totals
                        $totalPemasukan = 0;
                        $totalPengeluaran = 0;
                        $totalPiutang = 0;
                        $wajibBeliSetoran = 0;
                        $wajibBeliPenggunaan = 0;

                        foreach ($details as $detail) {
                            // Skip wajib beli categories (handled separately)
                            if ($detail['category'] === 'simpanan_wajib_beli') {
                                $wajibBeliSetoran += $detail['total_amount'];
                                continue;
                            }
                            if ($detail['category'] === 'pengeluaran_wajib_beli') {
                                $wajibBeliPenggunaan += $detail['total_amount'];
                                continue;
                            }

                            // PENTING: Piutang BUKAN pemasukan (masih pending verifikasi)
                            if ($detail['category'] === 'piutang') {
                                $totalPiutang += $detail['total_amount'];
                                continue;
                            }

                            // Calculate actual income and expenses
                            if ($detail['type'] === 'pemasukan') {
                                $totalPemasukan += $detail['total_amount'];
                            } else {
                                $totalPengeluaran += $detail['total_amount'];
                            }
                        }

                        $saldo = $totalPemasukan - $totalPengeluaran;

                        // Current saldo wajib beli (liability balance)
                        $wajibBeliSaldoStmt = $pdo->query("SELECT COALESCE(SUM(saldo_wajib_beli), 0) as saldo_wajib_beli FROM customers");
                        $currentSaldoWajibBeli = $wajibBeliSaldoStmt->fetch(PDO::FETCH_ASSOC)['saldo_wajib_beli'] ?? 0;

                        // Normalize piutang display type
                        $details = mapPiutangDisplay($details);

                        echo json_encode([
                            'success' => true,
                            'data' => [
                                'total_pemasukan' => $totalPemasukan,
                                'total_pengeluaran' => $totalPengeluaran,
                                'total_piutang' => $totalPiutang,
                                'saldo' => $saldo,
                                'details' => $details,
                                'wajib_beli_summary' => [
                                    'total_setoran' => $wajibBeliSetoran,
                                    'total_penggunaan' => $wajibBeliPenggunaan,
                                    'saldo' => $currentSaldoWajibBeli
                                ]
                            ]
                        ]);
                        break;

                    case 'export':
                        // Export data for reports
                        $startDate = $_GET['start_date'] ?? null;
                        $endDate = $_GET['end_date'] ?? null;
                        $type = $_GET['type'] ?? null;
                        $categoryFilter = $_GET['category'] ?? null;

                        $query = "SELECT * FROM neraca WHERE 1=1";
                        $params = [];

                        if ($startDate) {
                            $query .= " AND transaction_date >= ?";
                            $params[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $query .= " AND transaction_date <= ?";
                            $params[] = $endDate . ' 23:59:59';
                        }
                        if ($type) {
                            if ($type === 'pengeluaran') {
                                $query .= " AND (type = 'pengeluaran' OR category = 'piutang')";
                            } elseif ($type === 'pemasukan') {
                                if ($categoryFilter === 'piutang') {
                                    $query .= " AND type = 'pemasukan'";
                                } else {
                                    $query .= " AND type = 'pemasukan' AND category != 'piutang'";
                                }
                            } else {
                                $query .= " AND type = ?";
                                $params[] = $type;
                            }
                        }
                        if ($categoryFilter) {
                            $query .= " AND category = ?";
                            $params[] = $categoryFilter;
                        }

                        $query .= " ORDER BY transaction_date DESC, id DESC";

                        $stmt = $pdo->prepare($query);
                        $stmt->execute($params);
                        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                        // Normalize piutang display type
                        $data = mapPiutangDisplay($data);

                        echo json_encode([
                            'success' => true,
                            'data' => $data
                        ]);
                        break;

                    case 'kas_summary':
                        // Get kas summary data
                        $startDate = $_GET['start_date'] ?? null;
                        $endDate = $_GET['end_date'] ?? null;

                        // Get modal (saldo awal) from neraca
                        $modalQuery = "
                            SELECT COALESCE(SUM(amount), 0) as total_modal
                            FROM neraca 
                            WHERE category = 'saldo_awal' AND type = 'pemasukan'
                        ";
                        $modalParams = [];
                        if ($startDate) {
                            $modalQuery .= " AND transaction_date >= ?";
                            $modalParams[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $modalQuery .= " AND transaction_date <= ?";
                            $modalParams[] = $endDate . ' 23:59:59';
                        }
                        $modalStmt = $pdo->prepare($modalQuery);
                        $modalStmt->execute($modalParams);
                        $modal = $modalStmt->fetch(PDO::FETCH_ASSOC)['total_modal'];

                        // Get total pemasukan (all income EXCLUDING piutang)
                        $pemasukanQuery = "
                            SELECT COALESCE(SUM(amount), 0) as total_pemasukan
                            FROM neraca 
                            WHERE type = 'pemasukan' 
                            AND category NOT IN ('simpanan_wajib_beli', 'piutang')
                        ";
                        $pemasukanParams = [];
                        if ($startDate) {
                            $pemasukanQuery .= " AND transaction_date >= ?";
                            $pemasukanParams[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $pemasukanQuery .= " AND transaction_date <= ?";
                            $pemasukanParams[] = $endDate . ' 23:59:59';
                        }
                        $pemasukanStmt = $pdo->prepare($pemasukanQuery);
                        $pemasukanStmt->execute($pemasukanParams);
                        $totalPemasukan = $pemasukanStmt->fetch(PDO::FETCH_ASSOC)['total_pemasukan'];

                        // Get total penjualan
                        $penjualanQuery = "
                            SELECT COALESCE(SUM(amount), 0) as total_penjualan
                            FROM neraca 
                            WHERE category = 'penjualan' AND type = 'pemasukan'
                        ";
                        $penjualanParams = [];
                        if ($startDate) {
                            $penjualanQuery .= " AND transaction_date >= ?";
                            $penjualanParams[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $penjualanQuery .= " AND transaction_date <= ?";
                            $penjualanParams[] = $endDate . ' 23:59:59';
                        }
                        $penjualanStmt = $pdo->prepare($penjualanQuery);
                        $penjualanStmt->execute($penjualanParams);
                        $totalPenjualan = $penjualanStmt->fetch(PDO::FETCH_ASSOC)['total_penjualan'];

                        // Get total pengeluaran
                        $pengeluaranQuery = "
                            SELECT COALESCE(SUM(amount), 0) as total_pengeluaran
                            FROM neraca 
                            WHERE type = 'pengeluaran' AND category != 'pengeluaran_wajib_beli'
                        ";
                        $pengeluaranParams = [];
                        if ($startDate) {
                            $pengeluaranQuery .= " AND transaction_date >= ?";
                            $pengeluaranParams[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $pengeluaranQuery .= " AND transaction_date <= ?";
                            $pengeluaranParams[] = $endDate . ' 23:59:59';
                        }
                        $pengeluaranStmt = $pdo->prepare($pengeluaranQuery);
                        $pengeluaranStmt->execute($pengeluaranParams);
                        $totalPengeluaran = $pengeluaranStmt->fetch(PDO::FETCH_ASSOC)['total_pengeluaran'];

                        // Get hutang supplier (outstanding debts)
                        $hutangQuery = "
                            SELECT s.id, s.name, COALESCE(SUM(
                                CASE 
                                    WHEN hm.type = 'hutang' THEN hm.amount 
                                    WHEN hm.type = 'bayar' THEN -hm.amount 
                                END
                            ), 0) as saldo_hutang
                            FROM suppliers s
                            LEFT JOIN hutang_mutations hm ON s.id = hm.supplier_id
                            WHERE 1=1
                        ";
                        $hutangParams = [];
                        if ($startDate) {
                            $hutangQuery .= " AND hm.created_at >= ?";
                            $hutangParams[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $hutangQuery .= " AND hm.created_at <= ?";
                            $hutangParams[] = $endDate . ' 23:59:59';
                        }
                        $hutangQuery .= " GROUP BY s.id, s.name HAVING saldo_hutang > 0";
                        
                        $hutangStmt = $pdo->prepare($hutangQuery);
                        $hutangStmt->execute($hutangParams);
                        $hutangList = $hutangStmt->fetchAll(PDO::FETCH_ASSOC);
                        
                        $totalHutang = array_sum(array_column($hutangList, 'saldo_hutang'));

                        // Get kas anggota (member cash)
                        $kasAnggotaQuery = "
                            SELECT COALESCE(SUM(kas), 0) as total_kas_anggota
                            FROM customers
                        ";
                        $kasAnggotaStmt = $pdo->query($kasAnggotaQuery);
                        $totalKasAnggota = $kasAnggotaStmt->fetch(PDO::FETCH_ASSOC)['total_kas_anggota'];

                        // Get saldo wajib beli (member wajib beli balance)
                        $wajibBeliQuery = "
                            SELECT COALESCE(SUM(saldo_wajib_beli), 0) as total_wajib_beli
                            FROM customers
                        ";
                        $wajibBeliStmt = $pdo->query($wajibBeliQuery);
                        $totalWajibBeli = $wajibBeliStmt->fetch(PDO::FETCH_ASSOC)['total_wajib_beli'];

                        // Get wajib beli mutations for the period
                        $wajibBeliMutationsQuery = "
                            SELECT wbm.*, c.name as customer_name
                            FROM wajib_beli_mutations wbm
                            JOIN customers c ON wbm.customer_id = c.id
                            LEFT JOIN transactions t ON wbm.transaction_id = t.id
                            WHERE (wbm.transaction_id IS NULL OR t.status != 'Dibatalkan' OR t.status IS NULL)
                        ";
                        $wajibBeliMutationsParams = [];
                        if ($startDate) {
                            $wajibBeliMutationsQuery .= " AND DATE(wbm.created_at) >= ?";
                            $wajibBeliMutationsParams[] = $startDate;
                        }
                        if ($endDate) {
                            $wajibBeliMutationsQuery .= " AND DATE(wbm.created_at) <= ?";
                            $wajibBeliMutationsParams[] = $endDate;
                        }
                        $wajibBeliMutationsQuery .= " ORDER BY wbm.created_at DESC";

                        $wajibBeliMutationsStmt = $pdo->prepare($wajibBeliMutationsQuery);
                        $wajibBeliMutationsStmt->execute($wajibBeliMutationsParams);
                        $wajibBeliMutations = $wajibBeliMutationsStmt->fetchAll(PDO::FETCH_ASSOC);

                        // Calculate wajib beli summary
                        $totalWajibBeliSetor = 0;
                        $totalWajibBeliPengeluaran = 0;
                        foreach ($wajibBeliMutations as $mutation) {
                            if ($mutation['amount'] > 0) {
                                $totalWajibBeliSetor += $mutation['amount'];
                            } else {
                                $totalWajibBeliPengeluaran += abs($mutation['amount']);
                            }
                        }

                        // Get kas mutations for the period
                        $kasMutationsQuery = "
                            SELECT km.*, c.name as customer_name
                            FROM kas_mutations km
                            JOIN customers c ON km.customer_id = c.id
                            LEFT JOIN transactions t ON km.transaction_id = t.id
                            WHERE (km.transaction_id IS NULL OR t.status != 'Dibatalkan' OR t.status IS NULL)
                        ";
                        $kasMutationsParams = [];
                        if ($startDate) {
                            $kasMutationsQuery .= " AND DATE(km.created_at) >= ?";
                            $kasMutationsParams[] = $startDate;
                        }
                        if ($endDate) {
                            $kasMutationsQuery .= " AND DATE(km.created_at) <= ?";
                            $kasMutationsParams[] = $endDate;
                        }
                        $kasMutationsQuery .= " ORDER BY km.created_at DESC";

                        $kasMutationsStmt = $pdo->prepare($kasMutationsQuery);
                        $kasMutationsStmt->execute($kasMutationsParams);
                        $kasMutations = $kasMutationsStmt->fetchAll(PDO::FETCH_ASSOC);

                        // Calculate kas mutations summary
                        $totalSetor = 0;
                        $totalTarik = 0;
                        $totalBelanja = 0;
                        foreach ($kasMutations as $mutation) {
                            switch ($mutation['type']) {
                                case 'setor':
                                    $totalSetor += $mutation['amount'];
                                    break;
                                case 'tarik':
                                    $totalTarik += $mutation['amount'];
                                    break;
                                case 'belanja':
                                    $totalBelanja += $mutation['amount'];
                                    break;
                            }
                        }

                        // Get total piutang (pending receivables)
                        $piutangQuery = "
                            SELECT COALESCE(SUM(amount), 0) as total_piutang
                            FROM neraca 
                            WHERE category = 'piutang' AND type = 'pemasukan'
                        ";
                        $piutangParams = [];
                        if ($startDate) {
                            $piutangQuery .= " AND transaction_date >= ?";
                            $piutangParams[] = $startDate . ' 00:00:00';
                        }
                        if ($endDate) {
                            $piutangQuery .= " AND transaction_date <= ?";
                            $piutangParams[] = $endDate . ' 23:59:59';
                        }
                        $piutangStmt = $pdo->prepare($piutangQuery);
                        $piutangStmt->execute($piutangParams);
                        $totalPiutang = $piutangStmt->fetch(PDO::FETCH_ASSOC)['total_piutang'];

                        $kasOperasional = (float)$totalKasAnggota;
                        $wajibBeliLiability = (float)$totalWajibBeli;
                        $supplierLiability = (float)$totalHutang;
                        $assetTotal = $kasOperasional;
                        $liabilityTotal = $wajibBeliLiability + $supplierLiability;
                        $netPosition = $assetTotal - $liabilityTotal;

                        echo json_encode([
                            'success' => true,
                            'data' => [
                                'modal' => $modal,
                                'total_pemasukan' => $totalPemasukan,
                                'total_penjualan' => $totalPenjualan,
                                'total_piutang' => $totalPiutang,
                                'total_pengeluaran' => $totalPengeluaran,
                                'total_hutang' => $totalHutang,
                                'hutang_list' => $hutangList,
                                'kas_operasional' => $kasOperasional,
                                'wajib_beli_liability' => $wajibBeliLiability,
                                'supplier_liability' => $supplierLiability,
                                'asset_total' => $assetTotal,
                                'liability_total' => $liabilityTotal,
                                'net_position' => $netPosition,
                                'kas_mutations' => $kasMutations,
                                'kas_summary' => [
                                    'total_setor' => $totalSetor,
                                    'total_tarik' => $totalTarik,
                                    'total_konversi_wajib_beli' => $totalBelanja
                                ],
                                'wajib_beli_mutations' => $wajibBeliMutations,
                                'wajib_beli_summary' => [
                                    'total_setor' => $totalWajibBeliSetor,
                                    'total_penggunaan' => $totalWajibBeliPengeluaran,
                                    'saldo' => $totalWajibBeli
                                ],
                                'saldo_kas_bersih' => $totalPemasukan - $totalPengeluaran
                            ]
                        ]);
                        break;

                    default:
                        http_response_code(400);
                        echo json_encode(['success' => false, 'message' => 'Invalid action']);
                }
            } else {
                // Get all neraca entries with filters
                $startDate = $_GET['start_date'] ?? null;
                $endDate = $_GET['end_date'] ?? null;
                $type = $_GET['type'] ?? null;
                $category = $_GET['category'] ?? null;
                $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
                $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

                $query = "SELECT * FROM neraca WHERE 1=1";
                $params = [];

                if ($startDate) {
                    $query .= " AND transaction_date >= ?";
                    $params[] = $startDate . ' 00:00:00';
                }
                if ($endDate) {
                    $query .= " AND transaction_date <= ?";
                    $params[] = $endDate . ' 23:59:59';
                }
                if ($type) {
                    if ($type === 'pengeluaran') {
                        $query .= " AND (type = 'pengeluaran' OR category = 'piutang')";
                    } elseif ($type === 'pemasukan') {
                        if ($category === 'piutang') {
                            $query .= " AND type = 'pemasukan'";
                        } else {
                            $query .= " AND type = 'pemasukan' AND category != 'piutang'";
                        }
                    } else {
                        $query .= " AND type = ?";
                        $params[] = $type;
                    }
                }
                if ($category) {
                    $query .= " AND category = ?";
                    $params[] = $category;
                }

                $query .= " ORDER BY transaction_date DESC, id DESC LIMIT ? OFFSET ?";
                $params[] = $limit;
                $params[] = $offset;

                $stmt = $pdo->prepare($query);
                $stmt->execute($params);
                $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // Normalize piutang display type
                $data = mapPiutangDisplay($data);

                // Get total count
                $countQuery = str_replace('SELECT *', 'SELECT COUNT(*) as total', explode('ORDER BY', $query)[0]);
                $countStmt = $pdo->prepare($countQuery);
                $countStmt->execute(array_slice($params, 0, -2)); // Remove LIMIT and OFFSET params
                $total = $countStmt->fetch(PDO::FETCH_ASSOC)['total'];

                echo json_encode([
                    'success' => true,
                    'data' => $data,
                    'total' => $total,
                    'limit' => $limit,
                    'offset' => $offset
                ]);
            }
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);

            // Validate required fields
            $required = ['transaction_date', 'category', 'type', 'amount', 'description'];
            foreach ($required as $field) {
                if (!isset($input[$field])) {
                    http_response_code(400);
                    echo json_encode([
                        'success' => false,
                        'message' => "Missing required field: $field"
                    ]);
                    exit;
                }
            }

            // Validate type
            if (!in_array($input['type'], ['pemasukan', 'pengeluaran'])) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'Invalid type. Must be pemasukan or pengeluaran'
                ]);
                exit;
            }

            // Validate amount
            if ($input['amount'] <= 0) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'message' => 'Amount must be greater than 0'
                ]);
                exit;
            }

            $pdo->beginTransaction();
            try {
                $id = recordNeraca(
                    $pdo,
                    $input['transaction_date'],
                    $input['category'],
                    $input['type'],
                    $input['amount'],
                    $input['description'],
                    $input['reference_type'] ?? 'manual',
                    $input['reference_id'] ?? null,
                    $input['created_by'] ?? null
                );

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'id' => $id,
                    'message' => 'Neraca entry created successfully'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("POST Neraca error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage()
                ]);
            }
            break;

        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);

            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Neraca ID required']);
                exit;
            }

            $id = $_GET['id'];

            // Only allow updating manual entries
            $stmt = $pdo->prepare("SELECT reference_type FROM neraca WHERE id = ?");
            $stmt->execute([$id]);
            $entry = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$entry) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Neraca entry not found']);
                exit;
            }

            if ($entry['reference_type'] !== 'manual') {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'message' => 'Can only update manual entries. System-generated entries cannot be modified.'
                ]);
                exit;
            }

            $allowedFields = ['transaction_date', 'category', 'type', 'amount', 'description'];
            $updateData = array_intersect_key($input ?? [], array_flip($allowedFields));

            if (empty($updateData)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'No valid fields to update']);
                exit;
            }

            $pdo->beginTransaction();
            try {
                $setClauses = [];
                $params = [];

                foreach ($updateData as $field => $value) {
                    $setClauses[] = "$field = ?";
                    $params[] = $value;
                }
                $params[] = $id;

                $query = "UPDATE neraca SET " . implode(', ', $setClauses) . " WHERE id = ?";
                $stmt = $pdo->prepare($query);
                $stmt->execute($params);

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'id' => $id,
                    'message' => 'Neraca entry updated successfully'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("PUT Neraca error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage()
                ]);
            }
            break;

        case 'DELETE':
            if (empty($_GET['id'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Neraca ID required']);
                exit;
            }

            $id = $_GET['id'];

            // Only allow deleting manual entries
            $stmt = $pdo->prepare("SELECT reference_type FROM neraca WHERE id = ?");
            $stmt->execute([$id]);
            $entry = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$entry) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Neraca entry not found']);
                exit;
            }

            if ($entry['reference_type'] !== 'manual') {
                http_response_code(403);
                echo json_encode([
                    'success' => false,
                    'message' => 'Can only delete manual entries. System-generated entries cannot be deleted.'
                ]);
                exit;
            }

            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("DELETE FROM neraca WHERE id = ?");
                $stmt->execute([$id]);

                $pdo->commit();

                echo json_encode([
                    'success' => true,
                    'id' => $id,
                    'message' => 'Neraca entry deleted successfully'
                ]);
            } catch (Exception $e) {
                $pdo->rollBack();
                error_log("DELETE Neraca error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'error' => $e->getMessage()
                ]);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'Method not allowed']);
            break;
    }
} catch (Exception $e) {
    error_log("General neraca error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error: ' . $e->getMessage()
    ]);
}
?>
