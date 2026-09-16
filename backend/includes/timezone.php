<?php
/**
 * Timezone helper
 * Menyesuaikan timezone dengan setting komputer/server
 */

function kasir_get_system_timezone() {
    $systemTz = @date_default_timezone_get();
    if (!$systemTz || ($systemTz === 'UTC' && ini_get('date.timezone') === '')) {
        return 'Asia/Jakarta'; // Default GMT+7 fallback
    }

    // Pastikan kompatibel dengan daftar timezone PHP
    try {
        new DateTimeZone($systemTz);
        return $systemTz;
    } catch (Exception $e) {
        return 'Asia/Jakarta'; // Fallback to GMT+7 if OS TZ invalid
    }
}

function kasir_apply_system_timezone(PDO $pdo = null) {
    $tzName = kasir_get_system_timezone();
    date_default_timezone_set($tzName);
    $effectiveTz = $tzName;

    // Sinkronkan timezone MySQL ke offset lokal, fallback aman jika gagal
    try {
        $tzObj = new DateTimeZone($tzName);
        $offsetSeconds = (new DateTime('now', $tzObj))->getOffset();
        $sign = $offsetSeconds >= 0 ? '+' : '-';
        $offsetSeconds = abs($offsetSeconds);
        $hours = floor($offsetSeconds / 3600);
        $minutes = floor(($offsetSeconds % 3600) / 60);
        $mysqlOffset = sprintf('%s%02d:%02d', $sign, $hours, $minutes);

        if ($pdo) {
            $pdo->exec("SET time_zone = '{$mysqlOffset}'");
        }
    } catch (Exception $e) {
        // Jika timezone dari OS tidak dikenali, fallback ke GMT+7
        $effectiveTz = 'Asia/Jakarta';
        date_default_timezone_set($effectiveTz);
        if ($pdo) {
            try {
                $pdo->exec("SET time_zone = '+07:00'");
            } catch (Exception $ignored) {
                // abaikan
            }
        }
        error_log('Timezone sync error, fallback to GMT+7: ' . $e->getMessage());
    }

    return $effectiveTz;
}
