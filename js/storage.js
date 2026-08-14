/**
 * ===================================
 * Mstkhby - Storage Service
 * ===================================
 * 
 * Handles file storage operations:
 * - Upload to R2/Cloud Storage
 * - Image optimization
 * - File validation
 * - CDN URL generation
 */

class StorageService {
    constructor() {
        this.storage = window.MstkhbyFirebase?.storage;
        this.db = window.MstkhbyFirebase?.db;
        
        // Configuration
        this.config = {
            maxFileSize: 50 * 1024 * 1024, // 50MB
            allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            allowedVideoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
            maxImageDimensions: 4096,
            thumbnailSize: 200,
            compressionQuality: 0.8
        };

        // Cloudflare Worker API base URL (see api/workers/api.js + wrangler.toml,
        // bound to the "mstkhby" R2 bucket). Media currently uploads through
        // Firebase Storage above; this is available for switching a given
        // upload to the R2-backed Worker instead via uploadMediaViaWorker().
        this.workerApiUrl = window.MstkhbyConfig?.API_BASE_URL || null;
    }

    /**
     * Upload a file to R2 through the Cloudflare Worker
     * (POST {workerApiUrl}/api/media/upload) instead of Firebase Storage.
     * Requires the user to be authenticated (Bearer token).
     */
    async uploadMediaViaWorker(file, messageId, authToken) {
        if (!this.workerApiUrl) {
            throw new Error('Worker API URL غير مهيأ (window.MstkhbyConfig.API_BASE_URL)');
        }

        const formData = new FormData();
        formData.append('file', file);
        if (messageId) formData.append('messageId', messageId);

        const response = await fetch(`${this.workerApiUrl}/api/media/upload`, {
            method: 'POST',
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
            body: formData
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'فشل رفع الملف عبر الـ Worker');
        }
        return data; // { success, key, url, type, size }
    }

    /**
     * Upload user avatar/profile image
     */
    async uploadAvatar(file, userId) {
        try {
            // Validate file
            this.validateImageFile(file);

            // Process and compress image
            const processedImage = await this.processImage(file, 400, 400);

            // Generate unique filename
            const extension = file.name.split('.').pop();
            const fileName = `avatars/${userId}_${Date.now()}.${extension}`;
            
            // Upload to storage
            const ref = this.storage.ref(fileName);
            const snapshot = await ref.put(processedImage);
            const url = await snapshot.ref.getDownloadURL();

            console.log('✅ Avatar uploaded successfully');
            return { success: true, url };

        } catch (error) {
            console.error('❌ Avatar upload error:', error);
            throw error;
        }
    }

    /**
     * Upload message media (image/video)
     */
    async uploadMessageMedia(file, messageId, senderId) {
        try {
            // Validate based on type
            if (file.type.startsWith('image/')) {
                this.validateImageFile(file);
            } else if (file.type.startsWith('video/')) {
                this.validateVideoFile(file);
            } else {
                throw new Error('نوع الملف غير مدعوم');
            }

            let uploadFile = file;

            // Process images
            if (file.type.startsWith('image/')) {
                uploadFile = await this.processImage(file);
                
                // Create thumbnail
                const thumbnail = await this.createThumbnail(file);
                const thumbnailUrl = await this.uploadThumbnail(thumbnail, messageId);
            }

            // Generate filename with random string for security
            const extension = file.name.split('.').pop();
            const randomString = this.generateRandomString(12);
            const fileName = `messages/${messageId}/${randomString}.${extension}`;

            // Upload main file
            const ref = this.storage.ref(fileName);
            const snapshot = await ref.put(uploadFile);
            const url = await snapshot.ref.getDownloadURL();

            // Store metadata in Firestore
            await this.storeMediaMetadata(messageId, {
                url,
                type: file.type.startsWith('image/') ? 'image' : 'video',
                originalName: file.name,
                size: file.size,
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
                uploaderId: senderId
            });

            console.log('✅ Media uploaded successfully');
            return { success: true, url, type: file.type.startsWith('image/') ? 'image' : 'video' };

        } catch (error) {
            console.error('❌ Media upload error:', error);
            throw error;
        }
    }

    /**
     * Upload share card image
     */
    async uploadShareCard(canvasData, cardId) {
        try {
            // Convert canvas to blob
            const blob = await new Promise(resolve => canvasData.toBlob(resolve, 'image/png'));
            
            const fileName = `share-cards/${cardId}.png`;
            const ref = this.storage.ref(fileName);
            
            const snapshot = await ref.put(blob);
            const url = await snapshot.ref.getDownloadURL();

            return { success: true, url };

        } catch (error) {
            console.error('❌ Share card upload error:', error);
            throw error;
        }
    }

    /**
     * Delete file from storage
     */
    async deleteFile(url) {
        try {
            const ref = this.storage.refFromURL(url);
            await ref.delete();
            
            console.log('✅ File deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ File deletion error:', error);
            throw error;
        }
    }

    /**
     * Get download URL for a file
     */
    async getDownloadURL(filePath) {
        try {
            const ref = this.storage.ref(filePath);
            const url = await ref.getDownloadURL();
            return url;
        } catch (error) {
            console.error('❌ Error getting download URL:', error);
            throw error;
        }
    }

    /**
     * Get signed URL for temporary access
     */
    async getSignedURL(filePath, expiresIn = 3600) {
        try {
            const ref = this.storage.ref(filePath);
            
            // Note: Firebase Storage doesn't support signed URLs directly
            // This would typically use Cloud Functions or R2 for signed URLs
            const url = await ref.getDownloadURL({
                customMetadata: {
                    expiresAt: Date.now() + expiresIn * 1000
                }
            });

            return url;
        } catch (error) {
            console.error('❌ Error getting signed URL:', error);
            throw error;
        }
    }

    // ==================== IMAGE PROCESSING ====================

    /**
     * Process and compress image
     */
    async processImage(file, maxWidth = null, maxHeight = null) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    
                    let width = img.width;
                    let height = img.height;

                    // Resize if dimensions provided
                    if (maxWidth && maxWidth < width) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                    
                    if (maxHeight && maxHeight < height) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    
                    // Enable image smoothing for better quality
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // Draw image
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to blob with compression
                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(new File([blob], file.name, { type: file.type }));
                            } else {
                                reject(new Error('فشل معالجة الصورة'));
                            }
                        },
                        file.type || 'image/jpeg',
                        this.config.compressionQuality
                    );
                };

                img.onerror = () => reject(new Error('فشل تحميل الصورة'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('فشل قراءة الملف'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Create thumbnail for images
     */
    async createThumbnail(file) {
        return this.processImage(file, this.config.thumbnailSize, this.config.thumbnailSize);
    }

    /**
     * Upload thumbnail separately
     */
    async uploadThumbnail(thumbnailBlob, messageId) {
        try {
            const fileName = `messages/${messageId}/thumbnail.png`;
            const ref = this.storage.ref(fileName);
            
            await ref.put(thumbnailBlob);
            const url = await ref.getDownloadURL();
            
            return url;
        } catch (error) {
            console.warn('Failed to upload thumbnail:', error);
            return null;
        }
    }

    // ==================== VALIDATION ====================

    /**
     * Validate image file
     */
    validateImageFile(file) {
        if (!this.config.allowedImageTypes.includes(file.type)) {
            throw new Error(`نوع الصورة غير مدعوم. الأنواع المسموحة: ${this.config.allowedImageTypes.join(', ')}`);
        }

        if (file.size > this.config.maxFileSize) {
            throw new Error(`حجم الصورة كبير جداً. الحد الأقصى ${this.formatFileSize(this.config.maxFileSize)}`);
        }

        return true;
    }

    /**
     * Validate video file
     */
    validateVideoFile(file) {
        if (!this.config.allowedVideoTypes.includes(file.type)) {
            throw new Error(`نوع الفيديو غير مدعوم. الأنواع المسموحة: ${this.config.allowedVideoTypes.join(', ')}`);
        }

        if (file.size > this.config.maxFileSize) {
            throw new Error(`حجم الفيديو كبير جداً. الحد الأقصى ${this.formatFileSize(this.config.maxFileSize)}`);
        }

        return true;
    }

    /**
     * Validate any file type
     */
    validateFile(file) {
        const allAllowedTypes = [...this.config.allowedImageTypes, ...this.config.allowedVideoTypes];
        
        if (!allAllowedTypes.includes(file.type)) {
            throw new Error('نوع الملف غير مدعوم');
        }

        if (file.size > this.config.maxFileSize) {
            throw new Error(`حجم الملف كبير جداً. الحد الأقصى ${this.formatFileSize(this.config.maxFileSize)}`);
        }

        return true;
    }

    // ==================== METADATA ====================

    /**
     * Store media metadata in Firestore
     */
    async storeMediaMetadata(messageId, metadata) {
        try {
            await this.db.collection(collections.messages)
                .doc(messageId)
                .collection('media')
                .add(metadata);
        } catch (error) {
            console.warn('Failed to store media metadata:', error);
        }
    }

    /**
     * Get media metadata
     */
    async getMediaMetadata(messageId) {
        try {
            const snapshot = await this.db.collection(collections.messages)
                .doc(messageId)
                .collection('media')
                .get();

            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting media metadata:', error);
            return [];
        }
    }

    // ==================== UTILITIES ====================

    /**
     * Format file size to human readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get file type icon
     */
    getFileTypeIcon(type) {
        if (type?.startsWith('image/')) return '🖼️';
        if (type?.startsWith('video/')) return '🎥';
        if (type?.startsWith('audio/')) return '🎵';
        return '📎';
    }

    /**
     * Generate random string for filenames
     */
    generateRandomString(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Extract file extension
     */
    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
    }

    /**
     * Check if file is an image
     */
    isImage(file) {
        return file?.type?.startsWith('image/');
    }

    /**
     * Check if file is a video
     */
    isVideo(file) {
        return file?.type?.startsWith('video/');
    }

    /**
     * Get image dimensions before upload
     */
    getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.width, height: img.height });
                img.onerror = () => reject(new Error('فشل تحميل الصورة'));
                img.src = e.target.result;
            };
            
            reader.onerror = () => reject(new Error('فشل قراءة الملف'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Get video duration before upload
     */
    getVideoDuration(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => resolve(video.duration);
            video.onerror = () => reject(new Error('فشل تحميل الفيديو'));
            
            video.src = URL.createObjectURL(file);
        });
    }

    /**
     * Cleanup temporary URLs
     */
    revokeObjectURL(url) {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
}

// Initialize and export
window.storageService = new StorageService();
console.log('💾 Storage service initialized');
