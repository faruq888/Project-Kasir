/**
 * Application Configuration
 * Set PRODUCTION = true before deploying to production
 */

// Environment configuration
const CONFIG = {
    // Set to true in production to disable debug logs
    PRODUCTION: true,
    
    // API Base URL
    API_BASE: '../backend/api',
    
    // Debug mode (set to false in production)
    DEBUG: false,
    
    // Version
    VERSION: '2.0.0'
};

/**
 * Safe console wrapper
 * Automatically disabled in production mode
 */
const safeConsole = {
    log: function(...args) {
        if (CONFIG.DEBUG && !CONFIG.PRODUCTION) {
            console.log(...args);
        }
    },
    warn: function(...args) {
        if (CONFIG.DEBUG && !CONFIG.PRODUCTION) {
            console.warn(...args);
        }
    },
    error: function(...args) {
        // Always log errors, even in production
        console.error(...args);
    },
    info: function(...args) {
        if (CONFIG.DEBUG && !CONFIG.PRODUCTION) {
            console.info(...args);
        }
    }
};

// Export for use in app.js
window.CONFIG = CONFIG;
window.safeConsole = safeConsole;
