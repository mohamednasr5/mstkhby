/**
 * ===================================
 * Mstkhby - Media API Client
 * ===================================
 *
 * Thin client for the Worker API's media endpoints, which store
 * files in Cloudflare R2 (see api/workers/api.js). All file/media
 * uploads in this app go through here — never through Firebase
 * Storage.
 */

class MediaApiClient {
    constructor() {
        this.apiBase = window.MstkhbyFirebase?.apiBaseUrl || '';
    }

    /**
     * Upload a file to R2 via the Worker.
     * @param {File|Blob} file
     * @param {Object} options
     * @param {string} [options.messageId] - namespaces the object under messages/{messageId}/...
     * @param {string} [options.category] - e.g. 'avatars', 'share-cards', 'messages', 'documents'
     * @returns {Promise<{url: string, key: string, type: string, size: number}>}
     */
    async upload(file, options = {}) {
        const idToken = await window.MstkhbyFirebase?.helpers.getIdToken();
        if (!idToken) {
            throw new Error('يجب تسجيل الدخول لرفع الملفات');
        }

        const formData = new FormData();
        formData.append('file', file, file.name || 'upload');
        if (options.messageId) formData.append('messageId', options.messageId);
        if (options.category) formData.append('category', options.category);

        const response = await fetch(`${this.apiBase}/api/media/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'فشل رفع الملف');
        }

        return data; // { success, url, key, type, size }
    }

    /**
     * Delete a previously uploaded file by its R2 object key
     * (returned as `key` from upload(), or derived from the stored URL).
     */
    async remove(key) {
        const idToken = await window.MstkhbyFirebase?.helpers.getIdToken();
        if (!idToken) {
            throw new Error('يجب تسجيل الدخول');
        }

        const response = await fetch(`${this.apiBase}/api/media/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${idToken}` }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'فشل حذف الملف');
        }

        return data;
    }

    /**
     * Extract the R2 object key from a full public URL
     * (e.g. "https://pub-xxx.r2.dev/messages/abc/file.png" -> "messages/abc/file.png")
     */
    keyFromUrl(url) {
        if (!url) return null;
        try {
            const u = new URL(url);
            return u.pathname.replace(/^\/+/, '');
        } catch {
            return null;
        }
    }
}

// Initialize and export
window.mediaApi = new MediaApiClient();
console.log('📦 Media API client initialized (R2)');
