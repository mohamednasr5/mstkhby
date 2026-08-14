/**
 * ===================================
 * Mstkhby - Messages Service
 * ===================================
 * 
 * Handles all message operations:
 * - Send messages
 * - Receive messages
 * - Inbox management
 * - Message reactions
 * - Self-destruct messages
 */

class MessagesService {
    constructor() {
        this.db = window.MstkhbyFirebase?.db;
        this.storage = window.MstkhbyFirebase?.storage;
        this.auth = window.MstkhbyFirebase?.auth;
        this.collections = window.MstkhbyFirebase?.collections;
        
        // Real-time listeners
        this.messageListeners = new Map();
    }

    /**
     * Send a new message
     */
    async sendMessage(messageData) {
        try {
            const { content, messageType, identity, alias, destructOption, recipientId } = messageData;

            // AI Moderation check
            const moderationResult = await this.moderateContent(content);
            if (!moderationResult.allowed) {
                throw new Error(moderationResult.reason || 'المحتوى غير مسموح به');
            }

            // Prepare message document
            const messageId = this.generateId();
            const now = firebase.firestore.FieldValue.serverTimestamp();

            let mediaUrl = null;
            let mediaType = null;

            // Handle media upload if present
            if (messageType !== 'text' && messageData.mediaFile) {
                const uploadResult = await this.uploadMedia(messageData.mediaFile, recipientId);
                mediaUrl = uploadResult.url;
                mediaType = uploadResult.type;
            }

            const messageDoc = {
                id: messageId,
                recipientId,
                senderId: this.auth?.currentUser?.uid || null, // null for anonymous
                content: this.sanitizeContent(content),
                messageType: messageType || 'text',
                mediaUrl,
                mediaType,
                identity: identity || 'anonymous',
                alias: identity === 'alias' ? alias : null,
                destructOption: destructOption || 'normal',
                status: 'delivered',
                isRead: false,
                isOpened: false,
                moderationResult,
                createdAt: now,
                expiresAt: this.calculateExpiry(destructOption)
            };

            // Save to Firestore
            await this.db.collection(this.collections.messages).doc(messageId).set(messageDoc);

            // Update recipient's stats
            await this.updateRecipientStats(recipientId);

            // Send notification (if enabled)
            await this.sendPushNotification(recipientId, {
                type: 'new_message',
                title: '🤫 لديك رسالة سرية جديدة',
                body: 'لديك رسالة جديدة تنتظرك'
            });

            console.log('✅ Message sent successfully');
            return { success: true, messageId };

        } catch (error) {
            console.error('❌ Error sending message:', error);
            throw error;
        }
    }

    /**
     * Get user's inbox messages
     */
    async getInboxMessages(userId, options = {}) {
        try {
            const {
                limit = 50,
                startAfter = null,
                filter = 'all', // all, unread, reactions, media
                orderBy = 'createdAt',
                orderDirection = 'desc'
            } = options;

            let query = this.db.collection(this.collections.messages)
                .where('recipientId', '==', userId);

            // Apply filters
            if (filter === 'unread') {
                query = query.where('isRead', '==', false);
            } else if (filter === 'media') {
                query = query.where('messageType', 'in', ['image', 'video']);
            }

            // Apply ordering and pagination
            query = query.orderBy(orderBy, orderDirection);
            query = query.limit(limit);

            if (startAfter) {
                query = query.startAfter(startAfter);
            }

            const snapshot = await query.get();
            
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate(),
                expiresAt: doc.data().expiresAt?.toDate()
            }));

            // Check for expired messages and mark them
            await this.checkExpiredMessages(messages);

            return {
                success: true,
                messages,
                hasMore: snapshot.docs.length === limit,
                lastDoc: snapshot.docs[snapshot.docs.length - 1]
            };

        } catch (error) {
            console.error('❌ Error getting inbox:', error);
            throw error;
        }
    }

    /**
     * Listen to real-time inbox updates
     */
    subscribeToInbox(userId, callback) {
        const unsubscribe = this.db.collection(this.collections.messages)
            .where('recipientId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .onSnapshot(
                async (snapshot) => {
                    const messages = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        createdAt: doc.data().createdAt?.toDate()
                    }));
                    
                    callback(messages);
                },
                (error) => {
                    console.error('❌ Inbox subscription error:', error);
                }
            );

        this.messageListeners.set(userId, unsubscribe);
        return unsubscribe;
    }

    /**
     * Get single message details
     */
    async getMessage(messageId, userId) {
        try {
            const doc = await this.db.collection(this.collections.messages).doc(messageId).get();
            
            if (!doc.exists) {
                throw new Error('الرسالة غير موجودة');
            }

            const message = { id: doc.id, ...doc.data() };

            // Verify user owns this message
            if (message.recipientId !== userId) {
                throw new Error('غير مصرح بعرض هذه الرسالة');
            }

            // Check if expired
            if (message.expiresAt && new Date() > message.expiresAt.toDate()) {
                await this.deleteMessage(messageId);
                throw new Error('هذه الرسالة منتهية الصلاحية');
            }

            // Mark as read/opened
            if (!message.isRead) {
                await this.markAsRead(messageId);
                
                // Handle self-destruct on open
                if (message.destructOption === 'one-view') {
                    // Start destruction timer
                    setTimeout(() => this.deleteMessage(messageId), 5000); // 5 seconds to read
                }
            }

            return { success: true, message };

        } catch (error) {
            console.error('❌ Error getting message:', error);
            throw error;
        }
    }

    /**
     * Mark message as read
     */
    async markAsRead(messageId) {
        try {
            await this.db.collection(this.collections.messages).doc(messageId).update({
                isRead: true,
                openedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    }

    /**
     * Delete a message
     */
    async deleteMessage(messageId) {
        try {
            const doc = await this.db.collection(this.collections.messages).doc(messageId).get();
            
            if (doc.exists) {
                const data = doc.data();
                
                // Delete media from storage if exists
                if (data.mediaUrl) {
                    try {
                        await this.storage.refFromURL(data.mediaUrl).delete();
                    } catch (e) {
                        console.warn('Failed to delete media:', e);
                    }
                }

                // Delete the document
                await doc.ref.delete();

                // Delete associated reactions
                const reactionsSnapshot = await doc.ref.collection('reactions').get();
                const batch = this.db.batch();
                reactionsSnapshot.docs.forEach(reactionDoc => {
                    batch.delete(reactionDoc.ref);
                });
                await batch.commit();
            }

            console.log('✅ Message deleted');
            return { success: true };

        } catch (error) {
            console.error('❌ Error deleting message:', error);
            throw error;
        }
    }

    /**
     * Add reaction to message
     */
    async addReaction(messageId, reactionType, userId) {
        try {
            const allowedReactions = ['love', 'funny', 'shocking', 'sad', 'fire', 'agree'];
            
            if (!allowedReactions.includes(reactionType)) {
                throw new Error('نوع التفاعل غير صالح');
            }

            // Check if user already reacted
            const existingReaction = await this.db
                .collection(this.collections.messages)
                .doc(messageId)
                .collection('reactions')
                .where('userId', '==', userId)
                .get();

            const batch = this.db.batch();

            // Remove previous reaction if exists
            existingReaction.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            // Add new reaction
            const reactionRef = this.db
                .collection(this.collections.messages)
                .doc(messageId)
                .collection('reactions')
                .doc();

            batch.set(reactionRef, {
                id: reactionRef.id,
                userId,
                reactionType,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await batch.commit();

            console.log('✅ Reaction added');
            return { success: true };

        } catch (error) {
            console.error('❌ Error adding reaction:', error);
            throw error;
        }
    }

    /**
     * Remove reaction from message
     */
    async removeReaction(messageId, userId) {
        try {
            const reactions = await this.db
                .collection(this.collections.messages)
                .doc(messageId)
                .collection('reactions')
                .where('userId', '==', userId)
                .get();

            const batch = this.db.batch();
            reactions.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            return { success: true };
        } catch (error) {
            console.error('❌ Error removing reaction:', error);
            throw error;
        }
    }

    /**
     * Reply to a message
     */
    async replyToMessage(messageId, replyData) {
        try {
            const originalMessage = await this.getMessage(messageId, replyData.recipientId);
            
            const replyDoc = {
                id: this.generateId(),
                originalMessageId: messageId,
                senderId: replyData.senderId || null,
                recipientId: originalMessage.message.senderId,
                content: this.sanitizeContent(replyData.content),
                identity: replyData.identity || 'anonymous',
                alias: replyData.identity === 'alias' ? replyData.alias : null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Save reply
            await this.db
                .collection(this.collections.messages)
                .doc(messageId)
                .collection('replies')
                .doc(replyDoc.id)
                .set(replyDoc);

            // Create or update conversation
            await this.updateConversation(originalMessage.message, replyDoc);

            console.log('✅ Reply sent');
            return { success: true, replyId: replyDoc.id };

        } catch (error) {
            console.error('❌ Error replying:', error);
            throw error;
        }
    }

    /**
     * Block a sender (by fingerprint)
     */
    async blockSender(senderFingerprint, userId) {
        try {
            await this.db.collection(this.collections.blocks).add({
                blockerId: userId,
                blockedFingerprint: senderFingerprint,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('❌ Error blocking sender:', error);
            throw error;
        }
    }

    /**
     * Report a message
     */
    async reportMessage(messageId, reason, userId) {
        try {
            await this.db.collection(this.collections.reports).add({
                reporterId: userId,
                messageId,
                reason,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            window.uiManager?.showToast(
                'تم الإبلاغ',
                'شكراً على إبلاغك، سنراجع هذا المحتوى',
                'success'
            );

            return { success: true };
        } catch (error) {
            console.error('❌ Error reporting message:', error);
            throw error;
        }
    }

    /**
     * Reveal sender identity (if they chose "reveal later")
     */
    async revealIdentity(messageId, userId) {
        try {
            const messageDoc = await this.db.collection(this.collections.messages).doc(messageId).get();
            
            if (!messageDoc.exists) {
                throw new Error('الرسالة غير موجودة');
            }

            const message = messageDoc.data();

            // Verify ownership
            if (message.recipientId !== userId) {
                throw new Error('غير مصرح');
            }

            // Check if reveal option was chosen
            if (message.identity !== 'reveal') {
                throw new Error('هذه الرسالة لا تدعم كشف الهوية');
            }

            // Update message to show identity
            await messageDoc.ref.update({
                identityRevealed: true,
                revealedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { 
                success: true, 
                senderInfo: {
                    displayName: message.senderDisplayName,
                    photoURL: message.senderPhotoURL
                }
            };

        } catch (error) {
            console.error('❌ Error revealing identity:', error);
            throw error;
        }
    }

    /**
     * Share a message card
     */
    async shareMessageCard(messageId, userId) {
        try {
            const { message } = await this.getMessage(messageId, userId);
            
            const cardData = window.uiManager?.generateShareCard({
                content: message.content,
                identity: message.identity,
                recipientUsername: message.recipientUsername
            });

            // Generate share URL or image
            const shareUrl = `${window.location.origin}/share/${messageId}`;
            
            if (navigator.share) {
                await navigator.share({
                    title: 'رسالة سرية من مستخبي 🤫',
                    text: cardData?.data?.message || 'استلمت رسالة سرية!',
                    url: shareUrl
                });
            } else {
                await window.uiManager?.copyToClipboard(shareUrl);
            }

            return { success: true };

        } catch (error) {
            console.error('❌ Error sharing:', error);
            throw error;
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Generate unique ID
     */
    generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sanitize content (basic XSS prevention)
     */
    sanitizeContent(content) {
        const div = document.createElement('div');
        div.textContent = content;
        return div.innerHTML.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Calculate expiry time based on destruct option
     */
    calculateExpiry(option) {
        const now = new Date();
        
        switch (option) {
            case '10sec':
                return firebase.firestore.Timestamp.fromDate(new Date(now.getTime() + 10 * 1000));
            case '30sec':
                return firebase.firestore.Timestamp.fromDate(new Date(now.getTime() + 30 * 1000));
            case '1hour':
                return firebase.firestore.Timestamp.fromDate(new Date(now.getTime() + 60 * 60 * 1000));
            case '24hours':
                return firebase.firestore.Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
            default:
                return null; // No expiry for normal messages
        }
    }

    /**
     * Upload media to storage
     */
    async uploadMedia(file, recipientId) {
        try {
            // Validate file
            const validation = this.validateMediaFile(file);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const fileName = `${Date.now()}_${this.generateRandomString(8)}${file.name.substring(file.name.lastIndexOf('.'))}`;
            const filePath = `messages/${recipientId}/${fileName}`;
            const ref = this.storage.ref(filePath);

            // Upload file
            const snapshot = await ref.put(file);
            const url = await snapshot.ref.getDownloadURL();

            return {
                url,
                type: file.type.startsWith('image/') ? 'image' : 'video'
            };

        } catch (error) {
            console.error('❌ Media upload error:', error);
            throw error;
        }
    }

    /**
     * Validate media file
     */
    validateMediaFile(file) {
        const maxSize = 50 * 1024 * 1024; // 50MB
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/webm'
        ];

        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: 'نوع الملف غير مدعوم' };
        }

        if (file.size > maxSize) {
            return { valid: false, error: 'حجم الملف كبير جداً (الحد الأقصى 50 ميجابايت)' };
        }

        return { valid: true };
    }

    /**
     * Generate random string
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
     * Update recipient stats
     */
    async updateRecipientStats(recipientId) {
        try {
            await this.db.collection(collections.users).doc(recipientId).update({
                'stats.totalMessagesReceived': firebase.firestore.FieldValue.increment(1),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.warn('Failed to update stats:', error);
        }
    }

    /**
     * Update conversation thread
     */
    async updateConversation(originalMessage, reply) {
        try {
            const conversationId = [originalMessage.recipientId, originalMessage.senderId]
                .filter(Boolean)
                .sort()
                .join('_');

            await this.db.collection(this.collections.conversations)
                .doc(conversationId)
                .set({
                    participants: [originalMessage.recipientId, reply.senderId].filter(Boolean),
                    lastMessage: reply.content,
                    lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                    messageCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

        } catch (error) {
            console.warn('Failed to update conversation:', error);
        }
    }

    /**
     * Check and handle expired messages
     */
    async checkExpiredMessages(messages) {
        const now = new Date();
        
        for (const message of messages) {
            if (message.expiresAt && now > message.expiresAt) {
                try {
                    await this.deleteMessage(message.id);
                } catch (e) {
                    console.warn('Failed to delete expired message:', e);
                }
            }
        }
    }

    /**
     * AI Content Moderation
     */
    async moderateContent(content) {
        try {
            // This would typically call an API endpoint with AI moderation
            // For now, basic client-side checks
            
            const toxicWords = ['سب', 'غبي', 'حقير', 'قذر']; // Example list
            
            const containsToxic = toxicWords.some(word => 
                content.toLowerCase().includes(word)
            );

            if (containsToxic) {
                return {
                    allowed: false,
                    reason: 'يحتوي المحتوى على كلمات غير لائقة',
                    severity: 'medium'
                };
            }

            // Check for spam patterns
            const spamPatterns = [/http[s]?:\/\/\S+/gi, /\b\d{5,}\b/g];
            const containsSpam = spamPatterns.some(pattern => pattern.test(content));

            if (containsSpam) {
                return {
                    allowed: false,
                    reason: 'يحتوي المحتوى على روابط أو أنماط مشبوهة',
                    severity: 'low'
                };
            }

            return {
                allowed: true,
                severity: 'safe'
            };

        } catch (error) {
            console.error('Moderation error:', error);
            // Allow by default if moderation fails
            return { allowed: true, severity: 'unknown' };
        }
    }

    /**
     * Send push notification (placeholder)
     */
    async sendPushNotification(userId, notificationData) {
        // This would integrate with Firebase Cloud Messaging
        // For now, just log it
        console.log('📬 Push notification:', notificationData);
    }

    /**
     * Unsubscribe from inbox updates
     */
    unsubscribeFromInbox(userId) {
        const listener = this.messageListeners.get(userId);
        if (listener) {
            listener();
            this.messageListeners.delete(userId);
        }
    }
}

// Initialize and export
window.messagesService = new MessagesService();
console.log('✉️ Messages service initialized');
