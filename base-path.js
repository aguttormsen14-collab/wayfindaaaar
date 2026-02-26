/**
 * base-path.js — GitHub Pages deterministic path resolution
 * 
 * Detects the base path prefix for GitHub Pages deployments where the site
 * may be served from a subdirectory like /repo-name/ instead of root.
 * 
 * Usage:
 *   asset("supabase-config.js")  // → "/repo-name/supabase-config.js" (or "/supabase-config.js" if root)
 *   asset("admin/dashboard.html") // → "/repo-name/admin/dashboard.html"
 */

(function () {
    // Detect base path by looking at the current pathname
    // If deployed at root: location.pathname = "/index.html" → basePath = "/"
    // If deployed at /repo-name: location.pathname = "/repo-name/index.html" → basePath = "/repo-name/"

    function detectBasePath() {
        const pathname = location.pathname;

        // If pathname is just "/" → deployed at root, base path is "/"
        if (pathname === '/' || pathname === '/index.html') {
            return '/';
        }

        // If we detect a .html file or trailing slash, extract the directory part
        // Examples:
        //  "/wayfinding/" → "/wayfinding"
        //  "/repo-name/index.html" → "/repo-name"
        //  "/repo-name/admin/dashboard.html" → "/repo-name"

        let parts = pathname.split('/').filter(Boolean);

        // Remove filename if it exists (index.html, dashboard.html, etc.)
        if (parts[parts.length - 1] && parts[parts.length - 1].includes('.')) {
            parts.pop();
        }

        // The base path is everything except the last part (which is current page directory)
        // For /repo-name/admin/dashboard.html → we want /repo-name
        // For /repo-name/index.html → we want /repo-name
        // For /repo-name/ → we want /repo-name

        if (parts.length === 0) return '/';

        // If only one part and we're in admin (dashboard/login), take it
        // If multiple parts, take all but the last (which is the current page dir)
        let basePath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/' + parts[0];

        return basePath.endsWith('/') ? basePath : basePath + '/';
    }

    window.SX_BASE_PATH = detectBasePath();

    /**
     * Resolve a relative asset path to a full URL using the detected base path.
     * @param {string} path - Relative path like "supabase-config.js" or "assets/logo.png"
     * @returns {string} Full path including base
     */
    window.asset = function (path) {
        if (!path) return window.SX_BASE_PATH;

        // Remove leading slash if present
        const clean = path.startsWith('/') ? path.slice(1) : path;

        // Combine base path with asset path, avoiding double slashes
        const base = window.SX_BASE_PATH.endsWith('/')
            ? window.SX_BASE_PATH
            : window.SX_BASE_PATH + '/';

        return base + clean;
    };

    // Debug logging (can be disabled)
    if (typeof console !== 'undefined' && window.DEBUG !== false) {
        console.log('[BASE-PATH] SX_BASE_PATH:', window.SX_BASE_PATH);
    }
})();
