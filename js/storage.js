/**
 * ===================================
 * Mstkhby - Storage Service
 * ===================================
 * 
 * Handles file storage operations:
 * - Upload to R2 (via the Worker API — see js/media-api.js)
 * - Image optimization (client-side, before upload)
 * - File validation
 * - CDN URL generation
 */

class StorageService {
    constructor() {
        this.database = window.MstkhbyFirebase?.database;
        this.media = window.mediaApi;

        // Configuration
        this.config = {
            maxFileSize: 50 * 1024 * 1024, // 50MB
            allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            allowedVideoTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
            maxImageDimensions: 4096,
            thumbnailSize: 200,
            compressionQuality: 0.8
        };
    }

    /**
     * Upload user avatar/profile image
     */
    async uploadAvatar(file, userId) {
        try {
            this.validateImageFile(file);

            const processedImage = await this.processImage(file, 400, 400);

            const result = await this.media.upload(processedImage, {
                category: 'avatars'
            });

            console.log('✅ Avatar uploaded successfully');
            return { success: true, url: result.url, key: result.key };

        } catch (error) {
            console.error('❌ Avatar upload error:', error);
            throw error;
        }
    }

    /**
     * Upload message media (image/video) to R2 and record metadata
     * under messages/{messageId}/media in the Realtime Database.
     */
    async uploadMessageMedia(file, messageId, senderId) {
        try {
            if (file.type.startsWith('image/')) {
                this.validateImageFile(file);
            } else if (file.type.startsWith('video/')) {
                this.validateVideoFile(file);
            } else {
                throw new Error('نوع الملف غير مدعوم');
            }

            let uploadFile = file;
            let thumbnailUrl = null;

            // Process + create a thumbnail for images
            if (file.type.startsWith('image/')) {
                uploadFile = await this.processImage(file);
                const thumbnail = await this.createThumbnail(file);
                thumbnailUrl = await this.uploadThumbnail(thumbnail, messageId);
            }

            const result = await this.media.upload(uploadFile, {
                messageId,
                category: 'messages'
            });

            const type = file.type.startsWith('image/') ? 'image' : 'video';

            await this.storeMediaMetadata(messageId, {
                url: result.url,
                key: result.key,
                thumbnailUrl,
                type,
                originalName: file.name,
                size: file.size,
                uploadedAt: firebase.database.ServerValue.TIMESTAMP,
                uploaderId: senderId || null
            });

            console.log('✅ Media uploaded successfully');
            return { success: true, url: result.url, key: result.key, type, thumbnailUrl };

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
            const blob = await new Promise(resolve => canvasData.toBlob(resolve, 'image/png'));
            const file = new File([blob], `${cardId}.png`, { type: 'image/png' });

            const result = await this.media.upload(file, {
                category: 'share-cards'
            });

            return { success: true, url: result.url, key: result.key };

        } catch (error) {
            console.error('❌ Share card upload error:', error);
            throw error;
        }
    }

    /**
     * Delete a file from R2 by its URL or object key
     */
    async deleteFile(urlOrKey) {
        try {
            const key = urlOrKey.startsWith('http')
                ? this.media.keyFromUrl(urlOrKey)
                : urlOrKey;

            if (!key) throw new Error('مسار الملف غير صالح');

            await this.media.remove(key);

            console.log('✅ File deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ File deletion error:', error);
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
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

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
    async uploadThumbnail(thumbnailFile, messageId) {
        try {
            const result = await this.media.upload(thumbnailFile, {
                messageId,
                category: 'thumbnails'
            });
            return result.url;
        } catch (error) {
            console.warn('Failed to upload thumbnail:', error);
            return null;
        }
    }

    // ==================== VALIDATION ====================

    validateImageFile(file) {
        if (!this.config.allowedImageTypes.includes(file.type)) {
            throw new Error(`نوع الصورة غير مدعوم. الأنواع المسموحة: ${this.config.allowedImageTypes.join(', ')}`);
        }

        if (file.size > this.config.maxFileSize) {
            throw new Error(`حجم الصورة كبير جداً. الحد الأقصى ${this.formatFileSize(this.config.maxFileSize)}`);
        }

        return true;
    }

    validateVideoFile(file) {
        if (!this.config.allowedVideoTypes.includes(file.type)) {
            throw new Error(`نوع الفيديو غير مدعوم. الأنواع المسموحة: ${this.config.allowedVideoTypes.join(', ')}`);
        }

        if (file.size > this.config.maxFileSize) {
            throw new Error(`حجم الفيديو كبير جداً. الحد الأقصى ${this.formatFileSize(this.config.maxFileSize)}`);
        }

        return true;
    }

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

    // ==================== METADATA (Realtime Database) ====================

    /**
     * Store media metadata under messages/{messageId}/media
     */
    async storeMediaMetadata(messageId, metadata) {
        try {
            await this.database.ref(`messages/${messageId}/media`).push(metadata);
        } catch (error) {
            console.warn('Failed to store media metadata:', error);
        }
    }

    /**
     * Get media metadata for a message
     */
    async getMediaMetadata(messageId) {
        try {
            const snapshot = await this.database.ref(`messages/${messageId}/media`).once('value');
            const val = snapshot.val() || {};
            return Object.values(val);
        } catch (error) {
            console.error('Error getting media metadata:', error);
            return [];
        }
    }

    // ==================== UTILITIES ====================

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileTypeIcon(type) {
        if (type?.startsWith('image/')) return '🖼️';
        if (type?.startsWith('video/')) return '🎥';
        if (type?.startsWith('audio/')) return '🎵';
        return '📎';
    }

    generateRandomString(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
    }

    isImage(file) {
        return file?.type?.startsWith('image/');
    }

    isVideo(file) {
        return file?.type?.startsWith('video/');
    }

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

    getVideoDuration(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => resolve(video.duration);
            video.onerror = () => reject(new Error('فشل تحميل الفيديو'));
            
            video.src = URL.createObjectURL(file);
        });
    }

    revokeObjectURL(url) {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
}

// Initialize and export
window.storageService = new StorageService();
console.log('💾 Storage service initialized');
