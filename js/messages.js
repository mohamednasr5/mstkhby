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
 *
 * Data model (Realtime Database):
 *   messages/{messageId}                     -> full message object
 *   messagesByRecipient/{recipientId}/{id}    -> true  (index for inbox queries)
 *   messagesBySender/{senderId}/{id}          -> true  (index for sent/usage queries)
 *   messages/{messageId}/reactions/{id}       -> { userId, reactionType, createdAt }
 *   messages/{messageId}/replies/{id}         -> reply object
 *   conversations/{conversationId}            -> thread summary
 *   blocks/{id}                               -> { blockerId, blockedFingerprint, createdAt }
 *   reports/{id}                              -> { reporterId, messageId, reason, status, createdAt }
 *
 * Media (images/video) is stored in Cloudflare R2 via js/media-api.js,
 * never in Firebase Storage.
 */

class MessagesService {
    constructor() {
        this.database = window.MstkhbyFirebase?.database;
        // NOTE: media-api.js may load after this file, so window.mediaApi
        // can still be undefined at construction time. Use a lazy getter
        // instead of capturing the (possibly undefined) reference now.
        Object.defineProperty(this, 'media', {
            get() { return window.mediaApi; },
            configurable: true
        });
        this.auth = window.MstkhbyFirebase?.auth;

        // Real-time listeners
        this.messageListeners = new Map();
    }

    /**
     * Send a new message
     */
    async sendMessage(messageData) {
        try {
            const { content, messageType, identity, alias, destructOption, recipientId } = messageData;

            // Guard against a missing/unresolved recipient. Previously this
            // was allowed through silently, which wrote the message under
            // `messagesByRecipient/null/...` — invisible to any inbox query
            // (which is always scoped to a real uid) and effectively lost.
            if (!recipientId) {
                throw new Error('تعذر تحديد المستلم، أعد فتح رابط الملف الشخصي وحاول مرة أخرى');
            }

            // AI Moderation check
            const moderationResult = await this.moderateContent(content);
            if (!moderationResult.allowed) {
                throw new Error(moderationResult.reason || 'المحتوى غير مسموح به');
            }

            const messageId = this.generateId();
            const now = firebase.database.ServerValue.TIMESTAMP;

            let mediaUrl = null;
            let mediaType = null;

            // Handle media upload if present (goes to R2, not Firebase Storage)
            if (messageType !== 'text' && messageData.mediaFile) {
                const uploadResult = await this.uploadMedia(messageData.mediaFile, recipientId);
                mediaUrl = uploadResult.url;
                mediaType = uploadResult.type;
            }

            const senderId = this.auth?.currentUser?.uid || null; // null for anonymous

            // Denormalize a snapshot of the sender's own profile onto the
            // message itself. This is what powers:
            //   - "reveal identity later" (senderDisplayName/senderPhotoURL
            //     were never being written before, so a revealed message
            //     always showed a blank/generic name — fixed here)
            //   - the crown/verified badges next to the sender label, shown
            //     even while the sender stays anonymous or under an alias
            //     (only their plan/verified status is exposed, never who
            //     they are, unless they explicitly chose "reveal")
            // The sender can always read their own profile (auth.uid ===
            // their own uid), so this lookup is allowed by the DB rules.
            let senderDisplayName = null;
            let senderPhotoURL = null;
            let senderPlan = null;
            let senderIsVerified = false;
            let senderVerificationTier = null;
            let senderBadgeIcon = null;
            let senderBadgeColor = null;
            if (senderId) {
                try {
                    const [senderProfileSnap, senderEntitlementsSnap] = await Promise.all([
                        this.database.ref(`users/${senderId}/profile`).once('value'),
                        this.database.ref(`users/${senderId}/entitlements`).once('value')
                    ]);
                    const senderProfile = senderProfileSnap.val() || {};
                    const senderEntitlements = senderEntitlementsSnap.val() || {};
                    senderDisplayName = senderProfile.displayName || null;
                    senderPhotoURL = senderProfile.photoURL || null;
                    senderPlan = senderEntitlements.plan || 'free';
                    senderIsVerified = !!senderEntitlements.isVerified;
                    senderVerificationTier = senderEntitlements.verificationTier || null;
                    senderBadgeIcon = senderEntitlements.badgeIcon || null;
                    senderBadgeColor = senderEntitlements.badgeColor || null;
                } catch (e) {
                    console.warn('Could not load sender profile for denormalization:', e);
                }
            }

            const messageDoc = {
                id: messageId,
                recipientId,
                senderId,
                senderDisplayName,
                senderPhotoURL,
                senderPlan,
                senderIsVerified,
                senderVerificationTier,
                senderBadgeIcon,
                senderBadgeColor,
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

            // Write the message + both indexes atomically with a multi-path update
            const updates = {};
            updates[`messages/${messageId}`] = messageDoc;
            updates[`messagesByRecipient/${recipientId}/${messageId}`] = true;
            if (senderId) {
                updates[`messagesBySender/${senderId}/${messageId}`] = true;
            }

            await this.database.ref().update(updates);

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
                filter = 'all' // all, unread, media
            } = options;

            // Look up which message IDs belong to this recipient via the index,
            // newest first (message IDs are time-ordered — see generateId()).
            const indexSnapshot = await this.database
                .ref(`messagesByRecipient/${userId}`)
                .limitToLast(limit)
                .once('value');

            const indexVal = indexSnapshot.val() || {};
            const messageIds = Object.keys(indexVal).reverse(); // newest first

            // Fetch each message
            const messages = (await Promise.all(
                messageIds.map(async (id) => {
                    const snap = await this.database.ref(`messages/${id}`).once('value');
                    return snap.exists() ? { id, ...snap.val() } : null;
                })
            )).filter(Boolean);

            // Apply filters client-side (Realtime DB has no compound queries)
            let filtered = messages;
            if (filter === 'unread') {
                filtered = messages.filter(m => !m.isRead);
            } else if (filter === 'media') {
                filtered = messages.filter(m => m.messageType === 'image' || m.messageType === 'video');
            }

            // Check for expired messages and clean them up
            await this.checkExpiredMessages(filtered);

            return {
                success: true,
                messages: filtered,
                hasMore: messageIds.length === limit,
                total: filtered.length
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
        // Avoid leaking a duplicate Firebase listener if something already
        // subscribed for this user (e.g. re-subscribing after a hot auth
        // state change) — always tear down the old one first.
        this.unsubscribeFromInbox(userId);

        const indexRef = this.database.ref(`messagesByRecipient/${userId}`).limitToLast(100);

        const handler = async (snapshot) => {
            try {
                const indexVal = snapshot.val() || {};
                const messageIds = Object.keys(indexVal).reverse();

                const messages = (await Promise.all(
                    messageIds.map(async (id) => {
                        const snap = await this.database.ref(`messages/${id}`).once('value');
                        return snap.exists() ? { id, ...snap.val() } : null;
                    })
                )).filter(Boolean);

                callback(messages);
            } catch (error) {
                console.error('❌ Inbox subscription error:', error);
            }
        };

        indexRef.on('value', handler);

        const unsubscribe = () => indexRef.off('value', handler);
        this.messageListeners.set(userId, unsubscribe);
        return unsubscribe;
    }

    /**
     * Get single message details
     */
    async getMessage(messageId, userId) {
        try {
            const snap = await this.database.ref(`messages/${messageId}`).once('value');
            
            if (!snap.exists()) {
                throw new Error('الرسالة غير موجودة');
            }

            const message = { id: messageId, ...snap.val() };

            // Verify the caller is actually party to this message. This
            // used to only accept the recipient (message.recipientId ===
            // userId), which matched the original "open an inbox message"
            // use case but broke reply-to-a-reply: replies are nested
            // under the SAME top-level messageId, so when the original
            // SENDER replies back to a reply they received, they are
            // message.senderId, not message.recipientId, and got wrongly
            // rejected here even though the DB read rule (sender OR
            // recipient) had already allowed the read. Match that same
            // sender-or-recipient rule here instead of recipient-only.
            if (message.recipientId !== userId && message.senderId !== userId) {
                throw new Error('غير مصرح بعرض هذه الرسالة');
            }

            // Check if expired
            if (message.expiresAt && Date.now() > message.expiresAt) {
                await this.deleteMessage(messageId);
                throw new Error('هذه الرسالة منتهية الصلاحية');
            }

            // Mark as read/opened
            if (!message.isRead) {
                await this.markAsRead(messageId);
                
                if (message.destructOption === 'one-view') {
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
            await this.database.ref(`messages/${messageId}`).update({
                isRead: true,
                openedAt: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    }

    /**
     * Delete a message (and its reactions/replies/media)
     */
    async deleteMessage(messageId) {
        try {
            const snap = await this.database.ref(`messages/${messageId}`).once('value');
            
            if (snap.exists()) {
                const data = snap.val();
                const deleterId = this.auth?.currentUser?.uid || null;

                // Archive a full copy for moderation/audit purposes BEFORE removing it
                // from the live inbox. Media is intentionally kept in R2 (not erased)
                // so admins can still review it — the delete only removes it from the
                // user's own view.
                const archived = {
                    ...data,
                    id: messageId,
                    deletedAt: firebase.database.ServerValue.TIMESTAMP,
                    deletedBy: deleterId
                };

                // Remove the message from the live index and archive it, in one multi-path update
                const updates = {};
                updates[`messages/${messageId}`] = null;
                if (data.recipientId) {
                    updates[`messagesByRecipient/${data.recipientId}/${messageId}`] = null;
                }
                if (data.senderId) {
                    updates[`messagesBySender/${data.senderId}/${messageId}`] = null;
                }
                updates[`deletedMessages/${messageId}`] = archived;

                await this.database.ref().update(updates);
            }

            console.log('✅ Message deleted (archived for admin review)');
            return { success: true };

        } catch (error) {
            console.error('❌ Error deleting message:', error);
            throw error;
        }
    }

    /**
     * Add reaction to message (one reaction per user — replaces any previous one)
     */
    async addReaction(messageId, reactionType, userId) {
        try {
            const allowedReactions = ['love', 'funny', 'shocking', 'sad', 'fire', 'agree'];
            
            if (!allowedReactions.includes(reactionType)) {
                throw new Error('نوع التفاعل غير صالح');
            }

            const reactionsRef = this.database.ref(`messages/${messageId}/reactions`);

            // Remove any previous reaction from this user
            const existingSnap = await reactionsRef
                .orderByChild('userId')
                .equalTo(userId)
                .once('value');

            const removals = {};
            existingSnap.forEach(child => {
                removals[child.key] = null;
            });
            if (Object.keys(removals).length) {
                await reactionsRef.update(removals);
            }

            // Add the new reaction
            await reactionsRef.push({
                userId,
                reactionType,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

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
            const reactionsRef = this.database.ref(`messages/${messageId}/reactions`);
            const snap = await reactionsRef.orderByChild('userId').equalTo(userId).once('value');

            const removals = {};
            snap.forEach(child => { removals[child.key] = null; });
            if (Object.keys(removals).length) {
                await reactionsRef.update(removals);
            }

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
            const currentUserId = replyData.recipientId;
            const originalMessage = await this.getMessage(messageId, currentUserId);

            // Reply goes to whichever party in the original message is NOT
            // the current user — not always originalMessage.message.senderId.
            // That hardcoded assumption broke replying back to a reply: if
            // the current user IS the original senderId (replying to a
            // reply they received), it used to set recipientId back to
            // themselves instead of to the other party.
            const om = originalMessage.message;
            const replyTarget = om.recipientId === currentUserId ? om.senderId : om.recipientId;

            const replyRef = this.database.ref(`messages/${messageId}/replies`).push();
            const replyDoc = {
                id: replyRef.key,
                originalMessageId: messageId,
                senderId: replyData.senderId || null,
                recipientId: replyTarget,
                content: this.sanitizeContent(replyData.content),
                identity: replyData.identity || 'anonymous',
                alias: replyData.identity === 'alias' ? replyData.alias : null,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            await replyRef.set(replyDoc);

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
            await this.database.ref('blocks').push({
                blockerId: userId,
                blockedFingerprint: senderFingerprint,
                createdAt: firebase.database.ServerValue.TIMESTAMP
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
            await this.database.ref('reports').push({
                reporterId: userId,
                messageId,
                reason,
                status: 'pending',
                createdAt: firebase.database.ServerValue.TIMESTAMP
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
            const snap = await this.database.ref(`messages/${messageId}`).once('value');
            
            if (!snap.exists()) {
                throw new Error('الرسالة غير موجودة');
            }

            const message = snap.val();

            if (message.recipientId !== userId) {
                throw new Error('غير مصرح');
            }

            if (message.identity !== 'reveal') {
                throw new Error('هذه الرسالة لا تدعم كشف الهوية');
            }

            await this.database.ref(`messages/${messageId}`).update({
                identityRevealed: true,
                revealedAt: firebase.database.ServerValue.TIMESTAMP
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
     * Generate a time-ordered unique ID (so index keys sort chronologically)
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
     * Calculate expiry time (ms since epoch) based on destruct option
     */
    calculateExpiry(option) {
        const now = Date.now();
        
        switch (option) {
            case '10sec':
                return now + 10 * 1000;
            case '30sec':
                return now + 30 * 1000;
            case '1hour':
                return now + 60 * 60 * 1000;
            case '24hours':
                return now + 24 * 60 * 60 * 1000;
            default:
                return null; // No expiry for normal messages
        }
    }

    /**
     * Upload media to R2 (via the Worker API)
     */
    async uploadMedia(file, recipientId) {
        try {
            const validation = this.validateMediaFile(file);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const result = await this.media.upload(file, {
                category: 'messages',
                messageId: recipientId // namespaced by recipient until the real messageId exists
            });

            return {
                url: result.url,
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
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm'
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
            const statsRef = this.database.ref(`users/${recipientId}/profile/stats/totalMessagesReceived`);
            await statsRef.transaction(current => (current || 0) + 1);
            await this.database.ref(`users/${recipientId}/profile/updatedAt`)
                .set(firebase.database.ServerValue.TIMESTAMP);
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

            const convRef = this.database.ref(`conversations/${conversationId}`);

            await convRef.update({
                participants: [originalMessage.recipientId, reply.senderId].filter(Boolean),
                lastMessage: reply.content,
                lastMessageAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });

            await convRef.child('messageCount').transaction(current => (current || 0) + 1);

        } catch (error) {
            console.warn('Failed to update conversation:', error);
        }
    }

    /**
     * Check and handle expired messages
     */
    async checkExpiredMessages(messages) {
        const now = Date.now();
        
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
     * AI Content Moderation — delegates to the Worker's /api/moderate/text
     * endpoint, which calls NVIDIA's nemotron-3.5-content-safety model.
     * The NVIDIA API key never touches the client — it stays server-side.
     */
    async moderateContent(content) {
        try {
            const apiBase = window.MstkhbyFirebase?.apiBaseUrl;
            const response = await fetch(`${apiBase}/api/moderate/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const data = await response.json();

            if (!response.ok) {
                // Fail closed — don't publish content that couldn't be verified
                return {
                    allowed: false,
                    reason: data.reason || 'تعذر التحقق من المحتوى، حاول مرة أخرى',
                    severity: 'error'
                };
            }

            return {
                allowed: data.allowed,
                reason: data.reason,
                severity: data.severity
            };

        } catch (error) {
            console.error('Moderation request failed:', error);
            // Fail closed on network errors too
            return {
                allowed: false,
                reason: 'تعذر التحقق من المحتوى، تحقق من اتصالك بالإنترنت',
                severity: 'error'
            };
        }
    }

    /**
     * Send push notification (placeholder)
     */
    async sendPushNotification(userId, notificationData) {
        // This would integrate with Firebase Cloud Messaging
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
