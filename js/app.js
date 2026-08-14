/**
 * ===================================
 * Mstkhby - Main Application
 * ===================================
 * 
 * Main app initialization and routing
 */

class MstkhbyApp {
    constructor() {
        // Only the home page (index.html) still uses hash routing, for
        // the public-profile-by-username links (index.html#username).
        // /inbox and /profile are real standalone pages now — see
        // inbox.html / profile.html and initInboxPage()/initProfilePage().
        this.routes = {
            '/': 'home',
            '/:username': 'publicProfile'
        };
        
        this.currentRoute = '/';
        this.currentUser = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('🚀 Initializing Mstkhby...');

        try {
            // Wait for Firebase and services to be ready
            await this.waitForServices();
            
            // Setup auth listener
            this.setupAuthListener();

            // Wait for Firebase to resolve whether there's a logged-in
            // session BEFORE routing — otherwise the router runs while
            // this.currentUser is still null (even for a returning,
            // logged-in user) and wrongly bounces them to the login page.
            await window.authService?.authReady;

            // Each real page (index.html / inbox.html / profile.html)
            // sets <body data-page="..."> so this one shared app.js can
            // do the right thing on each without hash routing.
            const page = document.body.dataset.page || 'home';

            if (page === 'inbox') {
                await this.initInboxPage();
            } else if (page === 'profile') {
                await this.initProfilePage();
            } else if (page === 'payment') {
                // payment.html only needs the shared navbar/auth-state
                // wiring done above (setupAuthListener) — it has its own
                // page-specific logic in js/payment-new.js.
            } else {
                // Home page keeps hash routing (only used now for
                // index.html#username public-profile links).
                this.setupRouter();
                this.checkPendingAuthRedirect();
            }
            
            // Register service worker for PWA
            this.registerServiceWorker();
            
            // Initialize notifications
            this.initNotifications();
            
            // Mark as initialized
            this.isInitialized = true;
            
            console.log('✅ Mstkhby initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Mstkhby:', error);
        }
    }

    /**
     * Wait for all services to be ready
     */
    async waitForServices() {
        const maxAttempts = 10;
        let attempts = 0;

        while (attempts < maxAttempts) {
            if (
                window.MstkhbyFirebase &&
                window.authService &&
                window.messagesService &&
                window.storageService &&
                window.uiManager
            ) {
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        throw new Error('Services not ready after maximum attempts');
    }

    /**
     * Setup authentication state listener
     */
    setupAuthListener() {
        if (!window.authService) return;

        window.authService.subscribe((user) => {
            this.currentUser = user;
            this.updateUIForAuthState(user);
        });
    }

    /**
     * Update UI based on auth state
     */
    updateUIForAuthState(user) {
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');

        if (user) {
            // User is logged in
            if (loginBtn) {
                loginBtn.textContent = 'الصندوق الوارد';
                loginBtn.onclick = () => { window.location.href = 'inbox.html'; };
            }
            
            if (signupBtn) {
                signupBtn.textContent = 'حسابي';
                signupBtn.onclick = () => { window.location.href = 'profile.html'; };
            }

            // Show user avatar in nav
            this.addUserAvatarToNav(user);
        } else {
            // User is logged out
            if (loginBtn) {
                loginBtn.textContent = 'تسجيل الدخول';
                loginBtn.onclick = () => window.uiManager?.openAuthModal(false);
            }
            
            if (signupBtn) {
                signupBtn.textContent = 'ابدأ مجاناً';
                signupBtn.onclick = () => window.uiManager?.openAuthModal(true);
            }
        }
    }

    /**
     * Add user avatar to navigation
     */
    addUserAvatarToNav(user) {
        const navActions = document.querySelector('.nav-actions');
        
        if (navActions && !navActions.querySelector('.nav-avatar')) {
            const avatar = document.createElement('div');
            avatar.className = 'nav-avatar';
            avatar.innerHTML = user.photoURL 
                ? `<img src="${user.photoURL}" alt="Avatar">`
                : user.displayName?.[0]?.toUpperCase() || '👤';
            avatar.onclick = () => { window.location.href = 'profile.html'; };
            avatar.style.cssText = `
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: linear-gradient(135deg, #0ea5e9, #8b5cf6);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 600;
                cursor: pointer;
                margin-right: 8px;
            `;
            
            if (user.photoURL) {
                avatar.querySelector('img').style.cssText = `
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                `;
            }

            navActions.insertBefore(avatar, navActions.firstChild);
        }
    }

    /**
     * Setup client-side router
     */
    setupRouter() {
        // Handle initial route
        this.handleRoute();

        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleRoute());

        // Intercept link clicks for SPA navigation
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (link) {
                e.preventDefault();
                const path = link.getAttribute('href').substring(1);
                this.navigateTo(path);
            }
        });
    }

    /**
     * If the user was bounced here from a protected page (inbox.html /
     * profile.html?login=1&next=...) either open the login modal, or —
     * if they're actually already logged in (e.g. came back via the
     * browser back button) — send them straight on to where they wanted.
     */
    checkPendingAuthRedirect() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') !== '1') return;

        const next = params.get('next') === 'profile' ? 'profile.html' : 'inbox.html';

        if (this.currentUser) {
            window.location.href = next;
            return;
        }

        window.uiManager?.openAuthModal(false);
    }

    /**
     * Navigate to a route
     */
    navigateTo(path) {
        window.location.hash = path;
    }

    /**
     * Handle current route
     */
    async handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        this.currentRoute = hash;

        // Parse route parameters (strip the leading '/' first — otherwise
        // '/inbox'.split('/') => ['', 'inbox'] and path is always '')
        const cleanHash = hash.startsWith('/') ? hash.slice(1) : hash;
        const [path, ...params] = cleanHash.split('/');
        
        switch (path) {
            case '':
                this.showHomePage();
                break;

            // Backward-compat: redirect any old #/inbox, #/profile,
            // #/settings links to the real standalone pages.
            case 'inbox':
                window.location.href = 'inbox.html';
                break;

            case 'profile':
            case 'settings':
                window.location.href = 'profile.html';
                break;

            default:
                // Check if it's a username (public profile)
                if (params.length === 0 && path.length > 2) {
                    await this.showPublicProfilePage(path);
                } else {
                    this.showNotFoundPage();
                }
        }

        // Update active nav link
        this.updateActiveNavLink(hash);
    }

    /**
     * Update active navigation link
     */
    updateActiveNavLink(hash) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            
            const href = link.getAttribute('href')?.substring(1) || '';
            if (href === hash || (hash === '/' && href === '#home')) {
                link.classList.add('active');
            }
        });
    }

    // ==================== PAGE RENDERERS ====================

    /**
     * Show home page
     */
    showHomePage() {
        // Home page is already in HTML, just ensure it's visible
        const mainContent = document.querySelector('main') || document.body;
        
        // Hide any dynamic pages
        this.hideDynamicPages();
    }

    /**
     * Init inbox page (inbox.html — markup is static in the page itself)
     */
    async initInboxPage() {
        if (!this.currentUser) {
            window.location.href = 'index.html?login=1&next=inbox';
            return;
        }

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadInboxMessages(btn.dataset.filter);
            });
        });

        await this.loadInboxMessages();
    }

    /**
     * Load inbox messages
     */
    async loadInboxMessages(filter = 'all') {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;

        try {
            messagesList.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner"></div>
                    <p style="margin-top: 16px; color: var(--text-secondary);">جاري تحميل الرسائل...</p>
                </div>
            `;

            const result = await window.messagesService?.getInboxMessages(
                this.currentUser.uid,
                { filter }
            );

            if (result.messages.length === 0) {
                messagesList.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px;">
                        <div style="font-size: 4rem; margin-bottom: 16px;">📭</div>
                        <h3 style="margin-bottom: 8px;">لا توجد رسائل</h3>
                        <p style="color: var(--text-secondary);">شارك رابطك لاستقبال رسائل سرية!</p>
                        <button class="btn btn-primary mt-md" onclick="window.uiManager?.copyToClipboard(window.location.origin + '/' + '${this.currentUser?.displayName}')">
                            نسخ الرابط
                        </button>
                    </div>
                `;
                return;
            }

            messagesList.innerHTML = result.messages.map(msg => this.renderMessageItem(msg)).join('');

            // Bind click events
            messagesList.querySelectorAll('.message-item').forEach(item => {
                item.addEventListener('click', () => this.openMessage(item.dataset.messageId));
            });

        } catch (error) {
            console.error('Error loading messages:', error);
            messagesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--accent-red);">
                    <p>❌ حدث خطأ في تحميل الرسائل</p>
                    <button class="btn btn-outline mt-sm" onclick="window.app.loadInboxMessages('${filter}')">
                        إعادة المحاولة
                    </button>
                </div>
            `;
        }
    }

    /**
     * Render message item
     */
    renderMessageItem(message) {
        const identityBadge = {
            anonymous: '<span class="sender-badge badge-anonymous">🤫 مجهول</span>',
            alias: `<span class="sender-badge badge-anonymous">🎭 ${message.alias || 'مستعار'}</span>`,
            reveal: '<span class="sender-badge badge-reveal">👤 معروف</span>'
        };

        const destructIndicator = {
            'one-view': '<span class="message-type-indicator">👁️ مشاهدة واحدة</span>',
            '10sec': '<span class="message-type-indicator">⏱️ 10 ثوانٍ</span>',
            '30sec': '<span class="message-type-indicator">⏱️ 30 ثانية</span>',
            '1hour': '<span class="message-type-indicator">⏱️ ساعة</span>',
            '24hours': '<span class="message-type-indicator">📅 24 ساعة</span>'
        };

        return `
            <div class="message-item ${!message.isRead ? 'unread' : ''}" data-message-id="${message.id}">
                <div class="message-item-header">
                    <div class="sender-info">
                        ${identityBadge[message.identity] || identityBadge.anonymous}
                    </div>
                    <span class="message-time">${window.uiManager?.formatRelativeDate(message.createdAt)}</span>
                </div>
                <p class="message-preview-text">${this.escapeHtml(message.content)}</p>
                <div class="message-meta">
                    ${message.destructOption && message.destructOption !== 'normal' ? (destructIndicator[message.destructOption] || '') : ''}
                    ${message.mediaUrl ? '<span class="message-type-indicator">' + window.storageService?.getFileTypeIcon(message.mediaType) + '</span>' : ''}
                    <div class="message-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); window.app.deleteMessage('${message.id}')" title="حذف">🗑️</button>
                        <button class="action-btn danger" onclick="event.stopPropagation(); window.app.blockSender('${message.id}')" title="حظر">🚫</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Open message detail view
     */
    async openMessage(messageId) {
        const detailContainer = document.getElementById('messageDetail');
        const messagesList = document.getElementById('messagesList');
        
        if (!detailContainer) return;

        try {
            detailContainer.classList.remove('hidden');
            messagesList.style.display = 'none';

            detailContainer.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner"></div>
                </div>
            `;

            const result = await window.messagesService?.getMessage(messageId, this.currentUser.uid);
            const message = result.message;

            detailContainer.innerHTML = `
                <div class="message-detail-header">
                    <button class="back-btn" onclick="window.app.closeMessageDetail()">
                        → عودة
                    </button>
                </div>

                <div class="message-detail-content">
                    ${message.destructOption === 'one-view' ? `
                        <div class="self-destruct-timer">
                            <span class="timer-icon">⏱️</span>
                            <span>هذه الرسالة ستختفي خلال:</span>
                            <span class="timer-countdown" id="countdownTimer">05:00</span>
                        </div>
                    ` : ''}

                    <div class="detail-sender">
                        <div class="detail-avatar">${message.identity === 'anonymous' ? '🤫' : '🎭'}</div>
                        <div class="detail-sender-info">
                            <h3>${message.identity === 'reveal' && message.identityRevealed ? message.senderDisplayName || 'معروف' : 
                                message.identity === 'anonymous' ? 'شخص مجهول' :
                                message.identity === 'alias' ? (message.alias || 'شخص مستعار') : 'شخص مجهول'}</h3>
                            <p>${window.uiManager?.formatRelativeDate(message.createdAt)}</p>
                        </div>
                    </div>

                    ${message.mediaUrl ? `
                        <div class="detail-media">
                            ${message.mediaType === 'video' 
                                ? `<video src="${message.mediaUrl}" controls></video>`
                                : `<img src="${message.mediaUrl}" alt="صورة مرفقة">`
                            }
                        </div>
                    ` : ''}

                    <div class="detail-message-body">${message.content}</div>

                    <div class="detail-actions">
                        <div class="reaction-buttons">
                            <button class="reaction-btn" onclick="window.app.addReaction('${messageId}', 'love')">❤️ أحببتها</button>
                            <button class="reaction-btn" onclick="window.app.addReaction('${messageId}', 'funny')">😂 مضحكة</button>
                            <button class="reaction-btn" onclick="window.app.addReaction('${messageId}', 'shocking')">😮 صادمة</button>
                            <button class="reaction-btn" onclick="window.app.addReaction('${messageId}', 'sad')">😢 مؤثرة</button>
                            <button class="reaction-btn" onclick="window.app.addReaction('${messageId}', 'fire')">🔥 قوية</button>
                            <button class="reaction-btn" onclick="window.app.addReaction('${messageId}', 'agree')">👍 أتفق</button>
                        </div>

                        <div style="display: flex; gap: 12px; margin-top: 16px;">
                            <button class="btn btn-outline btn-sm" onclick="window.app.replyToMessage('${messageId}')">
                                ↩️ رد
                            </button>
                            <button class="btn btn-outline btn-sm" onclick="window.app.shareMessage('${messageId}')">
                                📤 مشاركة
                            </button>
                            ${message.identity === 'reveal' && !message.identityRevealed ? `
                                <button class="btn btn-outline btn-sm" onclick="window.app.revealIdentity('${messageId}')">
                                    👤 كشف الهوية
                                </button>
                            ` : ''}
                            <button class="btn btn-outline btn-sm danger" onclick="window.app.reportMessage('${messageId}')">
                                🚩 إبلاغ
                            </button>
                        </div>
                    </div>

                    <div class="reply-section">
                        <h4 style="margin-bottom: 12px;">رد على هذه الرسالة</h4>
                        <form class="reply-form" onsubmit="event.preventDefault(); window.app.sendReply(this, '${messageId}')">
                            <div class="reply-identity-toggle">
                                <button type="button" class="active" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">🔐 رد مجهول</button>
                                <button type="button" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('active')); this.classList.add('active');">👤 رد باسمي</button>
                            </div>
                            <textarea placeholder="اكتب ردك هنا..." rows="3" required></textarea>
                            <button type="submit" class="btn btn-primary">إرسال الرد</button>
                        </form>
                    </div>
                </div>
            `;

            // Start countdown if self-destruct
            if (message.destructOption === 'one-view') {
                this.startCountdown(300); // 5 minutes
            }

        } catch (error) {
            console.error('Error opening message:', error);
            detailContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--accent-red);">
                    <p>❌ ${error.message}</p>
                    <button class="btn btn-outline mt-sm" onclick="window.app.closeMessageDetail()">عودة</button>
                </div>
            `;
        }
    }

    /**
     * Close message detail view
     */
    closeMessageDetail() {
        const detailContainer = document.getElementById('messageDetail');
        const messagesList = document.getElementById('messagesList');
        
        if (detailContainer) detailContainer.classList.add('hidden');
        if (messagesList) messagesList.style.display = '';
    }

    /**
     * Start countdown timer
     */
    startCountdown(seconds) {
        const timerEl = document.getElementById('countdownTimer');
        if (!timerEl) return;

        let remaining = seconds;
        
        const interval = setInterval(() => {
            remaining--;
            
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            if (remaining <= 0) {
                clearInterval(interval);
                timerEl.textContent = 'تم الحذف!';
                setTimeout(() => this.closeMessageDetail(), 2000);
            }
        }, 1000);
    }

    /**
     * Init profile page (profile.html — markup is static in the page itself,
     * tabs are: info / analytics / links / settings)
     */
    async initProfilePage() {
        if (!this.currentUser) {
            window.location.href = 'index.html?login=1&next=profile';
            return;
        }

        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadProfileTab(tab.dataset.tab);
            });
        });

        // Wire up avatar upload (camera icon over the avatar)
        const avatarInput = document.getElementById('profileAvatarInput');
        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => this.handleAvatarUpload(e));
        }

        await this.loadProfileData();
    }

    /**
     * Handle avatar upload: user picks an image, we upload it and
     * save the resulting URL on the user's profile.
     */
    async handleAvatarUpload(event) {
        const file = event.target.files?.[0];
        if (!file || !this.currentUser) return;

        const avatarEl = document.getElementById('profileAvatar');
        const previousContent = avatarEl?.innerHTML;

        try {
            if (avatarEl) {
                avatarEl.innerHTML = '<span class="spinner"></span>';
            }

            const result = await window.storageService?.uploadAvatar(file, this.currentUser.uid);
            if (!result?.url) {
                throw new Error('فشل رفع الصورة');
            }

            await window.authService?.updateProfile({ photoURL: result.url });

            if (avatarEl) {
                avatarEl.innerHTML = `<img src="${result.url}" alt="صورة البروفايل" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            }

            window.uiManager?.showToast('تم التحديث', 'تم تحديث صورة البروفايل بنجاح', 'success');

        } catch (error) {
            console.error('Error uploading avatar:', error);
            if (avatarEl) avatarEl.innerHTML = previousContent || '👤';
            window.uiManager?.showToast('خطأ', error.message || 'تعذر رفع الصورة، حاول مرة أخرى', 'error');
        } finally {
            event.target.value = '';
        }
    }

    /**
     * Generate + save a unique username for accounts that somehow ended up
     * without one, then return the patched user data.
     */
    async ensureUsername(userData) {
        try {
            const source = userData.displayName || this.currentUser?.email?.split('@')[0] || 'user';
            const base = source
                .toString()
                .replace(/\s+/g, '_')
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '') || 'user';

            let username = base.length >= 3 ? base : `${base}user`;
            let counter = 1;

            while (!(await window.authService?.isUsernameAvailable(username))) {
                username = `${base}${counter}`;
                counter++;
            }

            await window.authService?.updateProfile({
                username,
                profileUrl: `mstkhby.com/${username}`
            });

            // Also register the username index (createUserDocument normally
            // does this at signup time, so an older/broken account may be
            // missing it).
            await window.MstkhbyFirebase?.database
                ?.ref(`usernames/${username}`)
                .set({ uid: this.currentUser.uid, createdAt: firebase.database.ServerValue.TIMESTAMP });

            return { ...userData, username, profileUrl: `mstkhby.com/${username}` };
        } catch (error) {
            console.error('Error assigning username:', error);
            return userData;
        }
    }

    /**
     * Load profile data
     */
    async loadProfileData() {
        try {
            let userData = await window.authService?.getCurrentUserData();

            // Self-heal older/broken accounts that are missing a username
            // (shows up as "@undefined" / "mstkhby.com/undefined" otherwise).
            if (userData && !userData.username) {
                userData = await this.ensureUsername(userData);
            }

            if (userData) {
                document.getElementById('profileName').textContent = userData.displayName || 'مستخدم';
                document.getElementById('profileUsername').textContent = `@${userData.username || '—'}`;
                document.getElementById('profileLink').textContent = `mstkhby.com/${userData.username || ''}`;
                document.getElementById('statMessages').textContent = userData.stats?.totalMessagesReceived || 0;
                document.getElementById('statReactions').textContent = userData.stats?.totalReactions || 0;
                
                if (userData.photoURL) {
                    document.getElementById('profileAvatar').innerHTML = 
                        `<img src="${userData.photoURL}" alt="${userData.displayName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                } else {
                    document.getElementById('profileAvatar').textContent = 
                        userData.displayName?.[0]?.toUpperCase() || '👤';
                }

                // Calculate days active
                if (userData.createdAt) {
                    // Realtime Database stores ServerValue.TIMESTAMP as a
                    // plain millisecond number, not a Firestore Timestamp —
                    // there's no .toDate() to call here.
                    const createdDate = new Date(userData.createdAt);
                    const daysActive = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
                    document.getElementById('statDays').textContent = daysActive;
                }

                // Load initial tab
                this.loadProfileTab('info');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    /**
     * Handle the "change username" button in the links tab
     * (allowed once per account — enforced in authService.changeUsername).
     */
    async handleUsernameChange() {
        const input = document.getElementById('newUsernameInput');
        const btn = document.getElementById('changeUsernameBtn');
        const newUsername = input?.value?.trim();

        if (!newUsername) {
            window.uiManager?.showToast('خطأ', 'أدخل الرابط الجديد أولاً', 'error');
            return;
        }

        const confirmed = window.confirm(
            `هل أنت متأكد من تغيير رابطك إلى mstkhby.com/${newUsername.toLowerCase()}؟ لن تتمكن من تغييره مرة أخرى.`
        );
        if (!confirmed) return;

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="spinner"></span>';
            }

            await window.authService?.changeUsername(newUsername);

            window.uiManager?.showToast('تم التغيير', 'تم تحديث رابطك بنجاح', 'success');

            // Refresh the header (name/link) and re-render just this tab,
            // without bouncing the user back to the "info" tab.
            const userDataRefreshed = await window.authService?.getCurrentUserData();
            if (userDataRefreshed) {
                document.getElementById('profileLink').textContent = `mstkhby.com/${userDataRefreshed.username || ''}`;
            }
            await this.loadProfileTab('links');

        } catch (error) {
            console.error('Error changing username:', error);
            window.uiManager?.showToast('خطأ', error.message || 'تعذر تغيير الرابط', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'تغيير';
            }
        }
    }

    /**
     * Load profile tab content
     */
    async loadProfileTab(tabName) {
        const contentEl = document.getElementById('profileTabContent');
        if (!contentEl) return;

        switch (tabName) {
            case 'info':
                contentEl.innerHTML = `
                    <div class="settings-section">
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>البريد الإلكتروني</strong>
                                <span>${this.currentUser?.email}</span>
                            </div>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>حالتك</strong>
                                <span>نشط ✅</span>
                            </div>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>انضم في</strong>
                                <span>${new Date(this.currentUser?.metadata?.creationTime).toLocaleDateString('ar-EG')}</span>
                            </div>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>الخطة</strong>
                                <span>مجانية</span>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="window.location.href='payment.html'">ترقية</button>
                        </div>
                    </div>
                `;
                break;

            case 'analytics':
                contentEl.innerHTML = `
                    <div class="settings-section">
                        <h3 style="padding: 16px; border-bottom: 1px solid var(--border-light);">إحصائيات هذا الأسبوع</h3>
                        <div style="padding: 20px; text-align: center;">
                            <div style="font-size: 3rem; font-weight: 700; color: var(--primary-600);">--</div>
                            <div style="color: var(--text-secondary);">رسالة</div>
                        </div>
                        <p style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                            الإحصائيات المتقدمة متاحة لخطط البريميوم
                        </p>
                    </div>
                `;
                break;

            case 'links': {
                const userData = await window.authService?.getCurrentUserData();
                const profileLink = `mstkhby.com/${userData?.username || ''}`;
                const canChangeUsername = !userData?.usernameChanged;

                contentEl.innerHTML = `
                    <div class="settings-section">
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>رابطك الرئيسي</strong>
                                <span>${profileLink}</span>
                            </div>
                            <button class="btn btn-ghost btn-sm" onclick="window.uiManager?.copyToClipboard('${profileLink}')">نسخ</button>
                        </div>
                        <div class="settings-item" style="flex-direction: column; align-items: stretch; gap: 10px;">
                            <div class="settings-label">
                                <strong>تغيير الرابط</strong>
                                <span>${canChangeUsername
                                    ? 'يمكنك تغيير رابطك مرة واحدة فقط، اختر بعناية'
                                    : 'لقد استخدمت فرصة تغيير الرابط بالفعل'}</span>
                            </div>
                            ${canChangeUsername ? `
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <span style="color: var(--text-tertiary); white-space: nowrap;">mstkhby.com/</span>
                                    <input type="text" id="newUsernameInput" placeholder="mohamed_123"
                                        style="flex: 1; direction: ltr; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                                    <button class="btn btn-primary btn-sm" id="changeUsernameBtn">تغيير</button>
                                </div>
                            ` : ''}
                        </div>
                        <div style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                            روابط إضافية متاحة لخطط البريميوم
                        </div>
                    </div>
                `;

                if (canChangeUsername) {
                    document.getElementById('changeUsernameBtn')?.addEventListener('click', () => this.handleUsernameChange());
                }
                break;
            }

            case 'settings':
                contentEl.innerHTML = `
                    <div class="settings-section">
                        <div class="settings-section-header">
                            <span>🔒 الخصوصية</span>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>مستوى الحماية</strong>
                                <span>تحكم في صرامة فحص الرسائل</span>
                            </div>
                            <select id="privacyLevelSelect">
                                <option value="low">🟢 منخفض</option>
                                <option value="medium">🟡 متوسط</option>
                                <option value="high">🔴 صارم</option>
                            </select>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>الحذف التلقائي</strong>
                                <span>احذف الرسائل المقروءة تلقائياً</span>
                            </div>
                            <div class="toggle-switch" id="autoDeleteToggle"></div>
                        </div>
                    </div>

                    <div class="settings-section">
                        <div class="settings-section-header">
                            <span>🔔 الإشعارات</span>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>إشعارات الدفع</strong>
                                <span>استلم تنبيهات عند وصول رسائل جديدة</span>
                            </div>
                            <div class="toggle-switch" id="pushNotifToggle"></div>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>الإشعارات بالبريد</strong>
                                <span>تلخيص يومي للرسائل الجديدة</span>
                            </div>
                            <div class="toggle-switch" id="emailNotifToggle"></div>
                        </div>
                    </div>

                    <div class="settings-section">
                        <div class="settings-section-header">
                            <span>👤 الحساب</span>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>تغيير كلمة المرور</strong>
                                <span>سنرسل لك رابط إعادة تعيين على بريدك</span>
                            </div>
                            <button class="btn btn-outline btn-sm" id="changePasswordBtn">إرسال الرابط</button>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>تصدير بياناتي</strong>
                            </div>
                            <button class="btn btn-outline btn-sm" id="exportDataBtn">تصدير</button>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>تسجيل الخروج</strong>
                            </div>
                            <button class="btn btn-outline btn-sm" id="logoutBtn">خروج</button>
                        </div>
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong style="color: var(--accent-red);">حذف الحساب</strong>
                                <span>سيتم حذف جميع بياناتك نهائياً</span>
                            </div>
                            <button class="btn btn-danger btn-sm" id="deleteAccountBtn">حذف</button>
                        </div>
                    </div>
                `;

                await this.bindSettingsTab(contentEl);
                break;
        }
    }

    /**
     * Wire up the settings tab: prefill current values from the saved
     * profile and bind every control to a real action.
     */
    async bindSettingsTab(contentEl) {
        const userData = await window.authService?.getCurrentUserData();
        const settings = userData?.settings || {};

        const privacySelect = contentEl.querySelector('#privacyLevelSelect');
        if (privacySelect) {
            privacySelect.value = settings.privacyLevel || 'medium';
            privacySelect.addEventListener('change', async () => {
                try {
                    await window.authService?.updateProfile({ 'settings/privacyLevel': privacySelect.value });
                    window.uiManager?.showToast('تم الحفظ', 'تم تحديث مستوى الحماية', 'success');
                } catch (error) {
                    window.uiManager?.showToast('خطأ', error.message, 'error');
                }
            });
        }

        const bindToggle = (id, settingKey) => {
            const el = contentEl.querySelector(`#${id}`);
            if (!el) return;
            if (settings[settingKey]) el.classList.add('active');
            el.addEventListener('click', async () => {
                el.classList.toggle('active');
                const value = el.classList.contains('active');
                try {
                    await window.authService?.updateProfile({ [`settings/${settingKey}`]: value });
                } catch (error) {
                    el.classList.toggle('active'); // revert on failure
                    window.uiManager?.showToast('خطأ', error.message, 'error');
                }
            });
        };
        bindToggle('autoDeleteToggle', 'autoDeleteReadMessages');
        bindToggle('pushNotifToggle', 'notifications/push');
        bindToggle('emailNotifToggle', 'notifications/email');

        contentEl.querySelector('#changePasswordBtn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            try {
                btn.disabled = true;
                await window.authService?.resetPassword(this.currentUser.email);
                window.uiManager?.showToast('تم الإرسال', 'تفقّد بريدك الإلكتروني لإعادة تعيين كلمة المرور', 'success');
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });

        contentEl.querySelector('#exportDataBtn')?.addEventListener('click', async () => {
            try {
                const data = await window.authService?.getCurrentUserData();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'mstkhby-my-data.json';
                a.click();
                URL.revokeObjectURL(url);
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        });

        contentEl.querySelector('#logoutBtn')?.addEventListener('click', async () => {
            const confirmed = await window.uiManager?.showConfirm('تسجيل الخروج', 'هل تريد تسجيل الخروج من حسابك؟', 'خروج');
            if (!confirmed) return;
            try {
                await window.authService?.logout();
                window.location.href = 'index.html';
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        });

        contentEl.querySelector('#deleteAccountBtn')?.addEventListener('click', async () => {
            const confirmed = await window.uiManager?.showConfirm(
                'حذف الحساب',
                'هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.',
                'نعم، احذف حسابي'
            );
            if (!confirmed) return;

            const password = window.prompt('لتأكيد الحذف، ادخل كلمة المرور الخاصة بحسابك:');
            if (!password) return;

            try {
                await window.authService?.deleteAccount(password);
                window.uiManager?.showToast('تم الحذف', 'تم حذف حسابك بنجاح', 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        });
    }

    /**
     * Show public profile page (for receiving messages)
     */
    async showPublicProfilePage(username) {
        let publicPage = document.getElementById('public-profile-page');
        
        if (!publicPage) {
            publicPage = this.createPublicProfilePage();
            document.body.appendChild(publicPage);
        }

        this.hideDynamicPages();
        publicPage.classList.remove('hidden');
        publicPage.classList.add('page-enter');

        await this.loadPublicProfileData(username);

        // Auto-open send message modal
        setTimeout(() => {
            window.uiManager?.openSendMessageModal({ username });
        }, 500);
    }

    /**
     * Create public profile page
     */
    createPublicProfilePage() {
        const page = document.createElement('div');
        page.id = 'public-profile-page';
        page.className = 'dynamic-page hidden';
        page.innerHTML = `
            <div class="profile-container">
                <div class="profile-header" id="publicProfileHeader">
                    <div class="profile-avatar" id="publicProfileAvatar">👤</div>
                    <h2 class="profile-name" id="publicProfileName">تحميل...</h2>
                    <p style="opacity: 0.9; margin-top: 8px;">أرسل لي رسالة سرية 🤫</p>
                </div>

                <div style="text-align: center; padding: 40px 20px;">
                    <button class="btn btn-primary btn-lg" onclick="window.uiManager?.openSendMessageModal()">
                        🔐 أرسل رسالة سرية
                    </button>
                </div>
            </div>
        `;

        return page;
    }

    /**
     * Load public profile data
     */
    async loadPublicProfileData(username) {
        try {
            const userData = await window.authService?.getUserByUsername(username);
            
            if (userData) {
                document.getElementById('publicProfileName').textContent = userData.displayName;
                
                if (userData.photoURL) {
                    document.getElementById('publicProfileAvatar').innerHTML = 
                        `<img src="${userData.photoURL}" alt="${userData.displayName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                } else {
                    document.getElementById('publicProfileAvatar').textContent = 
                        userData.displayName?.[0]?.toUpperCase() || '👤';
                }
            } else {
                document.getElementById('publicProfileName').textContent = 'المستخدم غير موجود';
            }
        } catch (error) {
            console.error('Error loading public profile:', error);
        }
    }

    /**
     * Show 404 page
     */
    showNotFoundPage() {
        let notFoundPage = document.getElementById('not-found-page');
        
        if (!notFoundPage) {
            notFoundPage = document.createElement('div');
            notFoundPage.id = 'not-found-page';
            notFoundPage.className = 'dynamic-page hidden';
            notFoundPage.innerHTML = `
                <div style="min-height: 60vh; display: flex; align-items: center; justify-content: center; text-align: center;">
                    <div>
                        <div style="font-size: 6rem; margin-bottom: 16px;">🔍</div>
                        <h1 style="font-size: 2rem; margin-bottom: 8px;">الصفحة غير موجودة</h1>
                        <p style="color: var(--text-secondary); margin-bottom: 24px;">عذراً، الصفحة التي تبحث عنها غير موجودة</p>
                        <button class="btn btn-primary" onclick="window.app.navigateTo('/')">العودة للرئيسية</button>
                    </div>
                </div>
            `;
            document.body.appendChild(notFoundPage);
        }

        this.hideDynamicPages();
        notFoundPage.classList.remove('hidden');
    }

    // ==================== ACTION HANDLERS ====================

    /**
     * Delete a message
     */
    async deleteMessage(messageId) {
        const confirmed = await window.uiManager?.showConfirm(
            'حذف الرسالة',
            'هل أنت متأكد من حذف هذه الرسالة؟'
        );

        if (confirmed) {
            try {
                await window.messagesService?.deleteMessage(messageId);
                window.uiManager?.showToast('تم الحذف', 'تم حذف الرسالة بنجاح', 'success');
                this.loadInboxMessages();
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        }
    }

    /**
     * Block a sender
     */
    async blockSender(messageId) {
        const confirmed = await window.uiManager?.showConfirm(
            'حظر المرسل',
            'هل تريد حظر هذا المرسل؟ لن تستقبل منه رسائل أخرى.'
        );

        if (confirmed) {
            try {
                // Get sender fingerprint from message
                const messageSnap = await window.MstkhbyFirebase.database
                    .ref(`messages/${messageId}`)
                    .once('value');

                const fingerprint = messageSnap.val()?.senderFingerprint;
                await window.messagesService?.blockSender(fingerprint, this.currentUser.uid);
                
                window.uiManager?.showToast('تم الحظر', 'تم حظر المرسل بنجاح', 'success');
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        }
    }

    /**
     * Add reaction to message
     */
    async addReaction(messageId, reactionType) {
        try {
            await window.messagesService?.addReaction(messageId, reactionType, this.currentUser.uid);
            
            // Visual feedback
            event.target?.classList.toggle('active');
        } catch (error) {
            window.uiManager?.showToast('خطأ', error.message, 'error');
        }
    }

    /**
     * Reply to a message
     */
    replyToMessage(messageId) {
        // Scroll to reply section or focus textarea
        const replySection = document.querySelector('.reply-section');
        if (replySection) {
            replySection.scrollIntoView({ behavior: 'smooth' });
            replySection.querySelector('textarea')?.focus();
        }
    }

    /**
     * Send reply
     */
    async sendReply(form, messageId) {
        const textarea = form.querySelector('textarea');
        const identity = form.querySelector('.reply-identity-toggle button.active')?.classList.contains('active')
            ? 'anonymous' : 'known';

        if (!textarea.value.trim()) {
            window.uiManager?.showToast('خطأ', 'اكتب محتوى الرد أولاً', 'warning');
            return;
        }

        try {
            await window.messagesService?.replyToMessage(messageId, {
                content: textarea.value,
                identity,
                recipientId: this.currentUser.uid
            });

            textarea.value = '';
            window.uiManager?.showToast('تم الإرسال', 'تم إرسال الرد بنجاح 🎉', 'success');
        } catch (error) {
            window.uiManager?.showToast('خطأ', error.message, 'error');
        }
    }

    /**
     * Share a message
     */
    async shareMessage(messageId) {
        try {
            await window.messagesService?.shareMessageCard(messageId, this.currentUser.uid);
        } catch (error) {
            window.uiManager?.showToast('خطأ', error.message, 'error');
        }
    }

    /**
     * Reveal sender identity
     */
    async revealIdentity(messageId) {
        const confirmed = await window.uiManager?.showConfirm(
            'كشف الهوية',
            'هل تريد كشف هوية مرسل هذه الرسالة؟'
        );

        if (confirmed) {
            try {
                const result = await window.messagesService?.revealIdentity(messageId, this.currentUser.uid);
                
                if (result.success) {
                    window.uiManager?.showToast(
                        'تم الكشف',
                        `الهوية: ${result.senderInfo.displayName}`,
                        'info'
                    );
                    
                    // Reload message detail
                    this.openMessage(messageId);
                }
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        }
    }

    /**
     * Report a message
     */
    async reportMessage(messageId) {
        const confirmed = await window.uiManager?.showConfirm(
            'إبلاغ عن رسالة',
            'هل تريد الإبلاغ عن هذه الرسالة؟'
        );

        if (confirmed) {
            try {
                await window.messagesService?.reportMessage(messageId, 'inappropriate_content', this.currentUser.uid);
            } catch (error) {
                window.uiManager?.showToast('خطأ', error.message, 'error');
            }
        }
    }

    // ==================== UTILITIES ====================

    /**
     * Hide all dynamic pages
     */
    hideDynamicPages() {
        document.querySelectorAll('.dynamic-page').forEach(page => {
            page.classList.add('hidden');
        });
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Register service worker for PWA
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('✅ Service Worker registered:', registration.scope);
                })
                .catch(error => {
                    console.warn('⚠️ Service Worker registration failed:', error);
                });
        }
    }

    /**
     * Initialize push notifications
     */
    async initNotifications() {
        if ('Notification' in window && Notification.permission === 'default') {
            // Don't request immediately, wait for user interaction
            document.addEventListener('click', () => {
                if (Notification.permission === 'default') {
                    Notification.requestPermission();
                }
            }, { once: true });
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MstkhbyApp();
    window.app.init();
});

// Export for global access
window.MstkhbyApp = MstkhbyApp;
