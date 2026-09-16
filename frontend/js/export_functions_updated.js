// ====================================================================================
// UPDATED EXPORT FUNCTIONS - TO REPLACE IN app.js
// All CSV exports converted to Excel with auto width/height
// ====================================================================================

/* ================== EXPORT STOCK REPORT TO EXCEL ================== */
function exportStockToCSV() {
    if (!currentStockReportData || !currentStockReportData.movements || currentStockReportData.movements.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        
        currentStockReportData.movements.forEach(movement => {
            data.push([
                no++,
                formatDate(movement.created_at),
                movement.product_name || '-',
                movement.movement_type === 'in' ? 'MASUK' : (movement.movement_type === 'out' ? 'KELUAR' : 'PENYESUAIAN'),
                parseInt(movement.quantity),
                movement.reference_type || '-',
                parseInt(movement.stock_before),
                parseInt(movement.stock_after),
                movement.created_by || '-',
                movement.notes || '-'
            ]);
        });

        const headers = ['No', 'Tanggal', 'Produk', 'Jenis', 'Jumlah', 'Referensi', 'Stok Sebelum', 'Stok Sesudah', 'Dibuat Oleh', 'Catatan'];
        const title = 'LAPORAN PERGERAKAN STOK';
        const subtitle = `Periode: ${formatDate(currentStockReportData.period.start_date)} s/d ${formatDate(currentStockReportData.period.end_date)}`;
        
        const summary = {
            'Total Stok Masuk': parseInt(currentStockReportData.summary.total_in || 0),
            'Total Stok Keluar': parseInt(currentStockReportData.summary.total_out || 0),
            'Total Transaksi': currentStockReportData.summary.movement_count || 0
        };

        const filename = `Laporan_Stok_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Laporan Stok', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/* ================== EXPORT TEMPO PURCHASES TO EXCEL ================== */
function exportTempoPurchasesToCSV() {
    if (!tempoPurchasesData || tempoPurchasesData.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        let totalPembelian = 0;
        let totalTerbayar = 0;
        let totalSisa = 0;
        
        tempoPurchasesData.forEach(purchase => {
            const total = parseFloat(purchase.total || 0);
            const terbayar = parseFloat(purchase.paid_amount || 0);
            const sisa = parseFloat(purchase.remaining_amount || 0);
            
            totalPembelian += total;
            totalTerbayar += terbayar;
            totalSisa += sisa;
            
            data.push([
                no++,
                purchase.id,
                formatDate(purchase.purchase_date),
                purchase.supplier_name || '-',
                total,
                terbayar,
                sisa,
                purchase.payment_status || '-',
                purchase.due_date ? formatDate(purchase.due_date) : '-'
            ]);
        });

        const headers = ['No', 'ID Pembelian', 'Tanggal', 'Supplier', 'Total', 'Terbayar', 'Sisa', 'Status', 'Jatuh Tempo'];
        const title = 'LAPORAN PEMBELIAN TEMPO';
        const subtitle = `Total: ${tempoPurchasesData.length} transaksi`;
        
        const summary = {
            'Total Pembelian': totalPembelian,
            'Total Terbayar': totalTerbayar,
            'Total Sisa Hutang': totalSisa
        };

        const filename = `Laporan_Pembelian_Tempo_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Pembelian Tempo', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting tempo purchases:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/* ================== EXPORT OVERDUE PURCHASES TO EXCEL ================== */
function exportOverduePurchasesToCSV() {
    if (!overduePurchasesData || overduePurchasesData.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        let totalHutang = 0;
        
        overduePurchasesData.forEach(purchase => {
            const sisa = parseFloat(purchase.remaining_amount || 0);
            totalHutang += sisa;
            
            // Calculate days overdue
            const dueDate = new Date(purchase.due_date);
            const today = new Date();
            const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
            
            data.push([
                no++,
                purchase.id,
                formatDate(purchase.purchase_date),
                purchase.supplier_name || '-',
                parseFloat(purchase.total || 0),
                parseFloat(purchase.paid_amount || 0),
                sisa,
                formatDate(purchase.due_date),
                daysOverdue
            ]);
        });

        const headers = ['No', 'ID Pembelian', 'Tanggal', 'Supplier', 'Total', 'Terbayar', 'Sisa', 'Jatuh Tempo', 'Hari Terlambat'];
        const title = 'LAPORAN HUTANG JATUH TEMPO';
        const subtitle = `Per Tanggal: ${new Date().toLocaleDateString('id-ID')}`;
        
        const summary = {
            'Total Hutang Jatuh Tempo': totalHutang,
            'Jumlah Transaksi': overduePurchasesData.length
        };

        const filename = `Laporan_Hutang_Jatuh_Tempo_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Hutang Jatuh Tempo', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting overdue purchases:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}

/* ================== EXPORT SUPPLIERS HUTANG TO EXCEL ================== */
function exportSuppliersHutangToCSV() {
    if (!suppliersHutangData || suppliersHutangData.length === 0) {
        showToast('Tidak ada data untuk diexport', 'warning');
        return;
    }

    try {
        const data = [];
        let no = 1;
        let totalHutang = 0;
        
        suppliersHutangData.forEach(supplier => {
            const hutang = parseFloat(supplier.total_hutang || 0);
            totalHutang += hutang;
            
            data.push([
                no++,
                supplier.name || '-',
                hutang,
                supplier.contact || '-',
                supplier.address || '-'
            ]);
        });

        const headers = ['No', 'Supplier', 'Total Hutang', 'Kontak', 'Alamat'];
        const title = 'LAPORAN HUTANG PER SUPPLIER';
        const subtitle = `Per Tanggal: ${new Date().toLocaleDateString('id-ID')}`;
        
        const summary = {
            'Total Hutang Semua Supplier': totalHutang,
            'Jumlah Supplier': suppliersHutangData.length
        };

        const filename = `Laporan_Hutang_Supplier_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        if (downloadExcel(data, headers, 'Hutang Supplier', title, subtitle, summary, filename)) {
            showToast('Laporan berhasil diexport ke Excel', 'success');
        }
    } catch (error) {
        console.error('Error exporting suppliers hutang:', error);
        showToast('Gagal mengexport laporan', 'error');
    }
}
