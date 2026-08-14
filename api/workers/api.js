/**
 * ===================================
 * Mstkhby - Cloudflare Workers API
 * ===================================
 * 
 * API Backend for the Mstkhby platform
 * Handles: Authentication, Messages, Media, Admin
 */

// Import required modules (for Cloudflare Workers)
// Note: This would typically use ES modules syntax in production

const MstkhbyAPI = {
    // Static, non-secret defaults. Real secrets/bindings (JWT_SECRET, ADMIN_TOKEN,
    // R2_BUCKET binding, R2_PUBLIC_URL) come from the Worker's runtime `env`
    // (set via `wrangler secret put` / bindings in wrangler.toml), never hard-coded here.
    config: {
        FIREBASE_PROJECT_ID: 'mstkhby-app'
    },

    // CORS headers
    corsHeaders: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        'Access-Control-Max-Age': '86400',
    },

    /**
     * Main request handler
     */
    async handleRequest(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: this.corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;
        
        try {
            // Route handling
            if (path.startsWith('/api/auth/')) {
                return await this.handleAuth(request, path);
            }
            
            if (path.startsWith('/api/messages/')) {
                return await this.handleMessages(request, path);
            }
            
            if (path.startsWith('/api/media/')) {
                return await this.handleMedia(request, path, env);
            }
            
            if (path.startsWith('/api/admin/')) {
                return await this.handleAdmin(request, path, env);
            }

            if (path.startsWith('/api/users/')) {
                return await this.handleUsers(request, path);
            }

            // Default response
            return this.jsonResponse({ error: 'Not Found' }, 404);

        } catch (error) {
            console.error('API Error:', error);
            return this.jsonResponse({ 
                error: 'Internal Server Error', 
                message: error.message 
            }, 500);
        }
    },

    // ==================== AUTH ENDPOINTS ====================

    async handleAuth(request, path) {
        switch (path) {
            case '/api/auth/register':
                return await this.register(request);
            
            case '/api/auth/login':
                return await this.login(request);
            
            case '/api/auth/logout':
                return await this.logout(request);
            
            case '/api/auth/refresh':
                return await this.refreshToken(request);
            
            case '/api/auth/reset-password':
                return await this.resetPassword(request);
            
            default:
                return this.jsonResponse({ error: 'Auth endpoint not found' }, 404);
        }
    },

    async register(request) {
        const data = await request.json();
        const { email, password, displayName, username } = data;

        // Validation
        if (!email || !password || !displayName || !username) {
            return this.jsonResponse({ error: 'Missing required fields' }, 400);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return this.jsonResponse({ error: 'Invalid email format' }, 400);
        }

        // Validate password strength
        if (password.length < 8) {
            return this.jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
        }

        // Validate username format
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            return this.jsonResponse({ error: 'Username must be 3-20 alphanumeric characters' }, 400);
        }

        // Check username availability (would query database)
        // const usernameExists = await db.checkUsername(username);
        // if (usernameExists) {
        //     return this.jsonResponse({ error: 'Username already taken' }, 409);
        // }

        // Create user (would use Firebase Auth or similar)
        // const user = await auth.createUser(email, password);

        // Create user document
        const userData = {
            id: `user_${Date.now()}`,
            email,
            displayName,
            username: username.toLowerCase(),
            profileUrl: `mstkhby.com/${username.toLowerCase()}`,
            createdAt: new Date().toISOString(),
            plan: 'free',
            settings: {
                privacyLevel: 'medium',
                allowMessages: true,
                allowMedia: true,
                notifications: { push: true, email: false }
            },
            stats: {
                totalMessagesReceived: 0,
                totalReactions: 0
            },
            status: 'active'
        };

        // Generate JWT token
        const token = this.generateToken(userData);

        return this.jsonResponse({
            success: true,
            message: 'User registered successfully',
            user: {
                id: userData.id,
                email: userData.email,
                displayName: userData.displayName,
                username: userData.username,
                profileUrl: userData.profileUrl
            },
            token
        }, 201);
    },

    async login(request) {
        const data = await request.json();
        const { email, password } = data;

        if (!email || !password) {
            return this.jsonResponse({ error: 'Email and password required' }, 400);
        }

        // Authenticate user (would verify against database)
        // const user = await auth.verifyUser(email, password);

        // Mock successful login for demo
        const userData = {
            id: `user_${Date.now()}`,
            email,
            displayName: 'Demo User',
            username: email.split('@')[0],
            profileUrl: `mstkhby.com/${email.split('@')[0]}`,
            plan: 'free'
        };

        const token = this.generateToken(userData);

        return this.jsonResponse({
            success: true,
            message: 'Login successful',
            user: userData,
            token
        });
    },

    async logout(request) {
        // Invalidate token (would add to blacklist)
        return this.jsonResponse({
            success: true,
            message: 'Logged out successfully'
        });
    },

    async refreshToken(request) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return this.jsonResponse({ error: 'No token provided' }, 401);
        }

        const oldToken = authHeader.substring(7);
        // Verify and refresh token
        const payload = this.verifyToken(oldToken);
        
        if (!payload) {
            return this.jsonResponse({ error: 'Invalid token' }, 401);
        }

        const newToken = this.generateToken(payload);
        
        return this.jsonResponse({
            success: true,
            token: newToken
        });
    },

    async resetPassword(request) {
        const data = await request.json();
        const { email } = data;

        if (!email) {
            return this.jsonResponse({ error: 'Email required' }, 400);
        }

        // Send password reset email
        // await auth.sendPasswordResetEmail(email);

        return this.jsonResponse({
            success: true,
            message: 'Password reset email sent'
        });
    },

    // ==================== MESSAGES ENDPOINTS ====================

    async handleMessages(request, path) {
        // Verify authentication for most endpoints
        const user = await this.authenticateUser(request);
        
        if (!user && !path.includes('/public/')) {
            return this.jsonResponse({ error: 'Unauthorized' }, 401);
        }

        switch (true) {
            case path === '/api/messages/send' && request.method === 'POST':
                return await this.sendMessage(request, user);
            
            case path === '/api/messages/inbox' && request.method === 'GET':
                return await this.getInbox(user);
            
            case path.match(/^\/api\/messages\/[^\/]+$/) && request.method === 'GET':
                const messageId = path.split('/')[3];
                return await this.getMessage(messageId, user);
            
            case path.match(/^\/api\/messages\/[^\/]+$/) && request.method === 'DELETE':
                const deleteId = path.split('/')[3];
                return await this.deleteMessage(deleteId, user);
            
            case path.match(/^\/api\/messages\/[^\/]+\/react/) && request.method === 'POST':
                const reactMsgId = path.split('/')[3];
                return await this.addReaction(reactMsgId, request, user);
            
            case path.match(/^\/api\/messages\/[^\/]+\/reply/) && request.method === 'POST':
                const replyMsgId = path.split('/')[3];
                return await this.replyToMessage(replyMsgId, request, user);
            
            case path === '/api/messages/public/send' && request.method === 'POST':
                return await this.sendPublicMessage(request);
            
            default:
                return this.jsonResponse({ error: 'Messages endpoint not found' }, 404);
        }
    },

    async sendMessage(request, sender) {
        const data = await request.json();
        const { recipientId, content, messageType, identity, alias, destructOption } = data;

        // Validation
        if (!recipientId || !content) {
            return this.jsonResponse({ error: 'Recipient ID and content required' }, 400);
        }

        // AI Moderation
        const moderationResult = await this.moderateContent(content);
        if (!moderationResult.allowed) {
            return this.jsonResponse({
                error: 'Content not allowed',
                reason: moderationResult.reason
            }, 400);
        }

        // Create message
        const message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            recipientId,
            senderId: sender?.id || null,
            content: this.sanitizeContent(content),
            messageType: messageType || 'text',
            identity: identity || 'anonymous',
            alias: identity === 'alias' ? alias : null,
            destructOption: destructOption || 'normal',
            status: 'delivered',
            isRead: false,
            moderationResult,
            senderFingerprint: this.generateFingerprint(request),
            createdAt: new Date().toISOString(),
            expiresAt: this.calculateExpiry(destructOption)
        };

        // Save to database
        // await db.collection('messages').add(message);

        // Update recipient's unread count
        // await db.collection('users').doc(recipientId).update({
        //     unreadCount: firebase.firestore.FieldValue.increment(1)
        // });

        // Send push notification to recipient
        // await notifications.send(recipientId, {
        //     type: 'new_message',
        //     title: '🤫 لديك رسالة سرية جديدة',
        //     body: identity === 'anonymous' ? 'رسالة من شخص مجهول' : `رسالة من ${alias || 'شخص معروف'}`
        // });

        return this.jsonResponse({
            success: true,
            messageId: message.id,
            message: 'Message sent successfully'
        }, 201);
    },

    async getInbox(user) {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const filter = url.searchParams.get('filter') || 'all';
        const startAfter = url.searchParams.get('startAfter');

        // Query messages from database
        // let query = db.collection('messages')
        //     .where('recipientId', '==', user.id)
        //     .orderBy('createdAt', 'desc')
        //     .limit(limit);

        // Apply filters
        // if (filter === 'unread') {
        //     query = query.where('isRead', '==', false);
        // }

        // const snapshot = await query.get();
        // const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Mock response
        const messages = [];

        return this.jsonResponse({
            success: true,
            messages,
            hasMore: messages.length === limit,
            total: messages.length
        });
    },

    async getMessage(messageId, user) {
        // Get message from database
        // const doc = await db.collection('messages').doc(messageId).get();
        
        // if (!doc.exists) {
        //     return this.jsonResponse({ error: 'Message not found' }, 404);
        // }

        // const message = doc.data();

        // Verify ownership
        // if (message.recipientId !== user.id) {
        //     return this.jsonResponse({ error: 'Unauthorized' }, 403);
        // }

        // Check expiry
        // if (message.expiresAt && new Date() > new Date(message.expiresAt)) {
        //     await this.deleteMessage(messageId, user);
        //     return this.jsonResponse({ error: 'Message expired' }, 410);
        // }

        // Mark as read if not already
        // if (!message.isRead) {
        //     await db.collection('messages').doc(messageId).update({
        //         isRead: true,
        //         readAt: new Date().toISOString()
        //     });
        // }

        return this.jsonResponse({
            success: true,
            message: {} // Message data
        });
    },

    async deleteMessage(messageId, user) {
        // Verify ownership and delete
        // const doc = await db.collection('messages').doc(messageId).get();
        // if (doc.data().recipientId !== user.id) {
        //     return this.jsonResponse({ error: 'Unauthorized' }, 403);
        // }
        // await doc.ref.delete();

        return this.jsonResponse({
            success: true,
            message: 'Message deleted'
        });
    },

    async addReaction(messageId, request, user) {
        const data = await request.json();
        const { reactionType } = data;

        const allowedReactions = ['love', 'funny', 'shocking', 'sad', 'fire', 'agree'];
        if (!allowedReactions.includes(reactionType)) {
            return this.jsonResponse({ error: 'Invalid reaction type' }, 400);
        }

        // Add reaction to database
        // await db.collection('messages').doc(messageId)
        //     .collection('reactions')
        //     .add({
        //         userId: user.id,
        //         reactionType,
        //         createdAt: new Date().toISOString()
        //     });

        return this.jsonResponse({
            success: true,
            message: 'Reaction added'
        });
    },

    async replyToMessage(messageId, request, user) {
        const data = await request.json();
        const { content, identity } = data;

        // Create reply
        const reply = {
            id: `reply_${Date.now()}`,
            originalMessageId: messageId,
            senderId: user.id,
            content: this.sanitizeContent(content),
            identity: identity || 'anonymous',
            createdAt: new Date().toISOString()
        };

        // Save reply
        // await db.collection('messages').doc(messageId)
        //     .collection('replies')
        //     .add(reply);

        return this.jsonResponse({
            success: true,
            replyId: reply.id,
            message: 'Reply sent'
        }, 201);
    },

    async sendPublicMessage(request) {
        // Similar to sendMessage but without authentication
        // Uses recipient's public link identifier
        const data = await request.json();
        const { recipientUsername, content, identity, alias } = data;

        // Find recipient by username
        // const userDoc = await db.collection('usernames').doc(recipientUsername).get();
        // if (!userDoc.exists) {
        //     return this.jsonResponse({ error: 'Recipient not found' }, 404);
        // }

        // const recipientId = userDoc.data().uid;

        // Continue with normal message sending flow...
        return this.jsonResponse({
            success: true,
            message: 'Public message sent'
        }, 201);
    },

    // ==================== MEDIA ENDPOINTS ====================

    async handleMedia(request, path, env) {
        const user = await this.authenticateUser(request);
        if (!user) {
            return this.jsonResponse({ error: 'Unauthorized' }, 401);
        }

        switch (true) {
            case path === '/api/media/upload' && request.method === 'POST':
                return await this.uploadMedia(request, user, env);
            
            case path === '/api/media/presigned-url' && request.method === 'GET':
                return await this.generatePresignedUrl(request, user, env);
            
            case path.match(/^\/api\/media\/[^\/]+$/) && request.method === 'DELETE':
                const mediaId = path.split('/')[3];
                return await this.deleteMedia(mediaId, user, env);
            
            default:
                return this.jsonResponse({ error: 'Media endpoint not found' }, 404);
        }
    },

    async uploadMedia(request, user, env) {
        const formData = await request.formData();
        const file = formData.get('file');
        const messageId = formData.get('messageId');

        if (!file) {
            return this.jsonResponse({ error: 'No file provided' }, 400);
        }

        // Validate file
        const maxSize = 50 * 1024 * 1024; // 50MB
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm'
        ];

        if (!allowedTypes.includes(file.type)) {
            return this.jsonResponse({ error: 'File type not allowed' }, 400);
        }

        if (file.size > maxSize) {
            return this.jsonResponse({ error: 'File too large (max 50MB)' }, 400);
        }

        // Upload to R2 (binding name "R2_BUCKET" -> bucket "mstkhby", see wrangler.toml)
        const key = `messages/${messageId || 'general'}/${Date.now()}_${file.name}`;

        await env.R2_BUCKET.put(key, file.stream(), {
            httpMetadata: {
                contentType: file.type
            }
        });

        // env.R2_PUBLIC_URL is the bucket's Public Development URL
        // (https://pub-xxxx.r2.dev) or a custom domain, set in wrangler.toml [vars].
        const url = `${env.R2_PUBLIC_URL}/${key}`;

        return this.jsonResponse({
            success: true,
            key,
            url,
            type: file.type.startsWith('image/') ? 'image' : 'video',
            size: file.size
        }, 201);
    },

    async generatePresignedUrl(request, user, env) {
        const url = new URL(request.url);
        const fileName = url.searchParams.get('fileName');
        const fileType = url.searchParams.get('fileType');

        if (!fileName) {
            return this.jsonResponse({ error: 'fileName is required' }, 400);
        }

        // R2's S3-compatible API supports presigned URLs, but the R2 bucket
        // binding used elsewhere in this file (env.R2_BUCKET) does not expose
        // createPresignedUrl directly from a Worker. Presigned PUT URLs require
        // signing against the S3 API endpoint (see bucket Settings -> S3 API)
        // with an R2 Access Key ID/Secret, which should be stored as Worker
        // secrets (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) rather than here.
        // Until those secrets are configured, uploads go through
        // POST /api/media/upload instead, which streams the file straight to
        // the R2_BUCKET binding above.
        const key = `uploads/${user.id}/${Date.now()}_${fileName}`;

        return this.jsonResponse({
            success: false,
            error: 'Presigned uploads are not configured on this Worker. Use POST /api/media/upload instead.',
            key
        }, 501);
    },

    async deleteMedia(mediaId, user, env) {
        // mediaId is the R2 object key (e.g. "messages/<id>/<timestamp>_<name>")
        await env.R2_BUCKET.delete(mediaId);

        return this.jsonResponse({
            success: true,
            message: 'Media deleted'
        });
    },

    // ==================== ADMIN ENDPOINTS ====================

    async handleAdmin(request, path, env) {
        // Verify admin access
        const isAdmin = await this.authenticateAdmin(request, env);
        if (!isAdmin) {
            return this.jsonResponse({ error: 'Admin access required' }, 403);
        }

        switch (true) {
            case path === '/admin/users' && request.method === 'GET':
                return await this.adminGetUsers(request);
            
            case path === '/admin/users/stats' && request.method === 'GET':
                return await this.adminGetStats();
            
            case path === '/admin/messages' && request.method === 'GET':
                return await this.adminGetMessages(request);
            
            case path === '/admin/reports' && request.method === 'GET':
                return await this.adminGetReports(request);
            
            case path === '/admin/reports/:id/action' && request.method === 'POST':
                return await this.adminHandleReport(request);
            
            case path === '/admin/users/:id/ban' && request.method === 'POST':
                return await this.adminBanUser(request);
            
            case path === '/admin/content/moderate' && request.method === 'POST':
                return await this.adminModerateContent(request);
            
            default:
                return this.jsonResponse({ error: 'Admin endpoint not found' }, 404);
        }
    },

    async adminGetUsers(request) {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const search = url.searchParams.get('search');

        // Query users with pagination
        // const users = await db.collection('users')
        //     .orderBy('createdAt', 'desc')
        //     .offset((page - 1) * limit)
        //     .limit(limit)
        //     .get();

        return this.jsonResponse({
            success: true,
            users: [], // User list
            pagination: {
                page,
                limit,
                total: 0,
                totalPages: 0
            }
        });
    },

    async adminGetStats() {
        // Aggregate platform statistics
        const stats = {
            totalUsers: 150000,
            activeUsersToday: 12500,
            totalMessages: 2000000,
            messagesToday: 45000,
            premiumUsers: 2500,
            reportsPending: 15,
            averageMessagesPerUser: 13.3,
            topCountries: ['Saudi Arabia', 'Egypt', 'UAE', 'Kuwait', 'Iraq'],
            growthRate: '+12.5%'
        };

        return this.jsonResponse({
            success: true,
            stats
        });
    },

    async adminGetMessages(request) {
        const url = new URL(request.url);
        const filter = url.searchParams.get('filter'); // all, reported, flagged
        const page = parseInt(url.searchParams.get('page') || '1');

        // Query messages with optional filter
        return this.jsonResponse({
            success: true,
            messages: [],
            pagination: { page, total: 0 }
        });
    },

    async adminGetReports(request) {
        const url = new URL(request.url);
        const status = url.searchParams.get('status'); // pending, resolved, dismissed

        // Query reports
        return this.jsonResponse({
            success: true,
            reports: []
        });
    },

    async adminHandleReport(request) {
        const data = await request.json();
        const { reportId, action, notes } = data; // action: resolve, dismiss, ban_user

        // Handle report
        // await db.collection('reports').doc(reportId).update({
        //     status: action === 'dismiss' ? 'dismissed' : 'resolved',
        //     handledBy: admin.id,
        //     handledAt: new Date().toISOString(),
        //     notes
        // });

        // If ban_user, also ban the reported user
        // if (action === 'ban_user') {
        //     const report = await db.collection('reports').doc(reportId).get();
        //     await db.collection('users').doc(report.data().reportedUserId).update({
        //         status: 'banned',
        //         bannedAt: new Date().toISOString(),
        //         banReason: notes
        //     });
        // }

        return this.jsonResponse({
            success: true,
            message: `Report ${action}d`
        });
    },

    async adminBanUser(request) {
        const data = await request.json();
        const { userId, reason, duration } = data; // duration: permanent, 7d, 30d, 90d

        // Ban user
        // await db.collection('users').doc(userId).update({
        //     status: 'banned',
        //     bannedAt: new Date().toISOString(),
        //     banReason: reason,
        //     banUntil: duration === 'permanent' ? null : new Date(Date.now() + parseDuration(duration)).toISOString()
        // });

        return this.jsonResponse({
            success: true,
            message: 'User banned'
        });
    },

    async adminModerateContent(request) {
        const data = await request.json();
        const { messageId, action } = data; // action: approve, delete, blur

        // Moderate content
        // await db.collection('messages').doc(messageId).update({
        //     moderationStatus: action,
        //     moderatedAt: new Date().toISOString()
        // });

        return this.jsonResponse({
            success: true,
            message: `Content ${action}d`
        });
    },

    // ==================== USERS ENDPOINTS ====================

    async handleUsers(request, path) {
        switch (true) {
            case path.match(/^\/api\/users\/[^\/]+$/) && request.method === 'GET':
                const username = path.split('/')[3];
                return await this.getUserByUsername(username);
            
            case path === '/api/users/me' && request.method === 'GET':
                const user = await this.authenticateUser(request);
                return await this.getCurrentUser(user);
            
            case path === '/api/users/me' && request.method === 'PUT':
                const authUser = await this.authenticateUser(request);
                return await this.updateProfile(request, authUser);
            
            default:
                return this.jsonResponse({ error: 'Users endpoint not found' }, 404);
        }
    },

    async getUserByUsername(username) {
        // Look up user by username
        // const usernameDoc = await db.collection('usernames').doc(username).get();
        // if (!usernameDoc.exists) {
        //     return this.jsonResponse({ error: 'User not found' }, 404);
        // }

        // const userId = usernameDoc.data().uid;
        // const userDoc = await db.collection('users').doc(userId).get();

        return this.jsonResponse({
            success: true,
            user: {
                // Public user data only
                id: '',
                displayName: '',
                username: '',
                avatar: null,
                isVerified: false,
                joinDate: ''
            }
        });
    },

    async getCurrentUser(user) {
        return this.jsonResponse({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                username: user.username,
                photoURL: user.photoURL,
                plan: user.plan,
                settings: user.settings,
                stats: user.stats
            }
        });
    },

    async updateProfile(request, user) {
        const data = await request.json();
        const allowedUpdates = ['displayName', 'photoURL', 'settings'];

        // Filter allowed updates
        const updates = {};
        for (const field of allowedUpdates) {
            if (data[field] !== undefined) {
                updates[field] = data[field];
            }
        }

        // Update in database
        // await db.collection('users').doc(user.id).update({
        //     ...updates,
        //     updatedAt: new Date().toISOString()
        // });

        return this.jsonResponse({
            success: true,
            message: 'Profile updated',
            updates
        });
    },

    // ==================== AUTHENTICATION HELPERS ====================

    async authenticateUser(request) {
        const authHeader = request.headers.get('Authorization');
        
        if (!authHeader?.startsWith('Bearer ')) {
            return null;
        }

        const token = authHeader.substring(7);
        return this.verifyToken(token);
    },

    async authenticateAdmin(request, env) {
        const adminToken = request.headers.get('X-Admin-Token');

        if (adminToken && env?.ADMIN_TOKEN && adminToken === env.ADMIN_TOKEN) {
            return true;
        }

        // Also allow admins with valid JWT that has admin role
        const user = await this.authenticateUser(request);
        return user?.role === 'admin';
    },

    generateToken(payload) {
        // In production, use proper JWT library
        // For now, return a mock token
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const body = btoa(JSON.stringify({
            ...payload,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
        }));

        // In production, sign with secret
        return `${header}.${body}.signature`;
    },

    verifyToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const payload = JSON.parse(atob(parts[1]));

            // Check expiration
            if (payload.exp < Math.floor(Date.now() / 1000)) {
                return null;
            }

            return payload;
        } catch (error) {
            return null;
        }
    },

    // ==================== UTILITY METHODS ====================

    jsonResponse(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: {
                ...this.corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    },

    sanitizeContent(content) {
        // Basic XSS prevention
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    },

    moderateContent(content) {
        // AI-powered content moderation
        // In production, would call external AI service
        
        const toxicPatterns = [
            /سب|غبي|حقير|قذر/i, // Arabic toxic words
            /\b(idiot|stupid|damn)\b/i // English toxic words
        ];

        const spamPatterns = [
            /http[s]?:\/\/\S+/gi,
            /\b\d{5,}\b/g,
            /(buy|sell|free|click here)/gi
        ];

        for (const pattern of toxicPatterns) {
            if (pattern.test(content)) {
                return {
                    allowed: false,
                    reason: 'يحتوي المحتوى على كلمات غير لائقة',
                    severity: 'medium'
                };
            }
        }

        for (const pattern of spamPatterns) {
            if (pattern.test(content)) {
                return {
                    allowed: false,
                    reason: 'يحتوي المحتوى على روابط أو أنماط مشبوهة',
                    severity: 'low'
                };
            }
        }

        return { allowed: true, severity: 'safe' };
    },

    calculateExpiry(option) {
        const now = new Date();
        
        switch (option) {
            case '10sec':
                return new Date(now.getTime() + 10 * 1000).toISOString();
            case '30sec':
                return new Date(now.getTime() + 30 * 1000).toISOString();
            case '1hour':
                return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
            case '24hours':
                return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
            default:
                return null;
        }
    },

    generateFingerprint(request) {
        // Generate anonymous fingerprint for blocking (without storing PII)
        const ip = request.headers.get('CF-Connecting-IP') || '';
        const userAgent = request.headers.get('User-Agent') || '';
        const acceptLang = request.headers.get('Accept-Language') || '';

        // Simple hash (use proper hashing in production)
        const raw = `${ip}-${userAgent}-${acceptLang}`;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const char = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        return Math.abs(hash).toString(16);
    }
};

// Export for Cloudflare Workers
export default {
    async fetch(request, env, ctx) {
        return MstkhbyAPI.handleRequest(request, env);
    }
};
