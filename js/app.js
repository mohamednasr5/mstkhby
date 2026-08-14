/**
 * ===================================
 * Mstkhby - Main Application
 * ===================================
 * 
 * Main app initialization and routing
 */

class MstkhbyApp {
    constructor() {
        this.routes = {
            '/': 'home',
            '/inbox': 'inbox',
            '/profile': 'profile',
            '/settings': 'settings',
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
            
            // Setup router
            this.setupRouter();
            
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
                loginBtn.onclick = () => this.navigateTo('/inbox');
            }
            
            if (signupBtn) {
                signupBtn.textContent = 'حسابي';
                signupBtn.onclick = () => this.navigateTo('/profile');
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
            avatar.onclick = () => this.navigateTo('/profile');
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
                
            case 'inbox':
                await this.showInboxPage();
                break;
                
            case 'profile':
                await this.showProfilePage();
                break;
                
            case 'settings':
                await this.showSettingsPage();
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
     * Show inbox page
     */
    async showInboxPage() {
        if (!this.currentUser) {
            window.uiManager?.openAuthModal(false);
            this.navigateTo('/');
            return;
        }

        // Create inbox page if it doesn't exist
        let inboxPage = document.getElementById('inbox-page');
        
        if (!inboxPage) {
            inboxPage = this.createInboxPage();
            document.body.appendChild(inboxPage);
        }

        this.hideDynamicPages();
        inboxPage.classList.remove('hidden');
        inboxPage.classList.add('page-enter');

        // Load messages
        await this.loadInboxMessages();
    }

    /**
     * Create inbox page element
     */
    createInboxPage() {
        const page = document.createElement('div');
        page.id = 'inbox-page';
        page.className = 'dynamic-page hidden';
        page.innerHTML = `
            <div class="inbox-container">
                <div class="inbox-header">
                    <h1>📬 صندوق الوارد</h1>
                    <div class="inbox-filters">
                        <button class="filter-btn active" data-filter="all">الكل</button>
                        <button class="filter-btn" data-filter="unread">غير مقروءة</button>
                        <button class="filter-btn" data-filter="media">وسائط</button>
                    </div>
                </div>

                <div class="messages-list" id="messagesList">
                    <!-- Messages will be loaded here -->
                    <div class="loading-skeleton">
                        ${this.generateSkeletonLoaders(5)}
                    </div>
                </div>

                <!-- Message Detail View (hidden by default) -->
                <div class="message-detail hidden" id="messageDetail">
                    <!-- Will be populated dynamically -->
                </div>
            </div>
        `;

        // Bind filter buttons
        page.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                page.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadInboxMessages(btn.dataset.filter);
            });
        });

        return page;
    }

    /**
     * Generate skeleton loaders
     */
    generateSkeletonLoaders(count) {
        return Array(count).fill(0).map(() => `
            <div class="message-item skeleton" style="height: 100px; margin-bottom: 16px;"></div>
        `).join('');
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
                    ${destructOption !== 'normal' ? (destructIndicator[message.destructOption] || '') : ''}
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
     * Show profile page
     */
    async showProfilePage() {
        if (!this.currentUser) {
            window.uiManager?.openAuthModal(false);
            return;
        }

        let profilePage = document.getElementById('profile-page');
        
        if (!profilePage) {
            profilePage = this.createProfilePage();
            document.body.appendChild(profilePage);
        }

        this.hideDynamicPages();
        profilePage.classList.remove('hidden');
        profilePage.classList.add('page-enter');

        await this.loadProfileData();
    }

    /**
     * Create profile page
     */
    createProfilePage() {
        const page = document.createElement('div');
        page.id = 'profile-page';
        page.className = 'dynamic-page hidden';
        page.innerHTML = `
            <div class="profile-container">
                <div class="profile-header" id="profileHeader">
                    <div class="profile-avatar" id="profileAvatar">👤</div>
                    <h2 class="profile-name" id="profileName">تحميل...</h2>
                    <span class="profile-username" id="profileUsername">@username</span>
                    <div class="profile-link-card" id="profileLinkCard">
                        <span>🔗</span>
                        <span id="profileLink">mstkhby.com/username</span>
                        <button class="btn btn-sm btn-ghost" onclick="window.uiManager?.copyToClipboard(document.getElementById('profileLink').textContent)">نسخ</button>
                    </div>
                </div>

                <div class="profile-stats">
                    <div class="profile-stat">
                        <div class="profile-stat-value" id="statMessages">0</div>
                        <div class="profile-stat-label">رسالة مستلمة</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-value" id="statReactions">0</div>
                        <div class="profile-stat-label">تفاعل</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-value" id="statDays">0</div>
                        <div class="profile-stat-label">يوم نشط</div>
                    </div>
                </div>

                <div class="profile-tabs">
                    <button class="profile-tab active" data-tab="info">المعلومات</button>
                    <button class="profile-tab" data-tab="analytics">الإحصائيات</button>
                    <button class="profile-tab" data-tab="links">روابطي</button>
                </div>

                <div class="profile-tab-content" id="profileTabContent">
                    <!-- Tab content loaded dynamically -->
                </div>
            </div>
        `;

        // Bind tab clicks
        page.querySelectorAll('.profile-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                page.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadProfileTab(tab.dataset.tab);
            });
        });

        return page;
    }

    /**
     * Load profile data
     */
    async loadProfileData() {
        try {
            const userData = await window.authService?.getCurrentUserData();
            
            if (userData) {
                document.getElementById('profileName').textContent = userData.displayName;
                document.getElementById('profileUsername').textContent = `@${userData.username}`;
                document.getElementById('profileLink').textContent = `mstkhby.com/${userData.username}`;
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
                    const createdDate = userData.createdAt.toDate();
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
                            <button class="btn btn-primary btn-sm">ترقية</button>
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

            case 'links':
                contentEl.innerHTML = `
                    <div class="settings-section">
                        <div class="settings-item">
                            <div class="settings-label">
                                <strong>رابطك الرئيسي</strong>
                                <span>mstkhby.com/${await window.authService?.getCurrentUserData()?.then(u => u?.username)}</span>
                            </div>
                            <button class="btn btn-ghost btn-sm" onclick="window.uiManager?.copyToClipboard('mstkhby.com/${this.currentUser?.uid}')">نسخ</button>
                        </div>
                        <div style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                            روابط إضافية متاحة لخطط البريميوم
                        </div>
                    </div>
                `;
                break;
        }
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
     * Show settings page
     */
    async showSettingsPage() {
        if (!this.currentUser) {
            window.uiManager?.openAuthModal(false);
            return;
        }

        let settingsPage = document.getElementById('settings-page');
        
        if (!settingsPage) {
            settingsPage = this.createSettingsPage();
            document.body.appendChild(settingsPage);
        }

        this.hideDynamicPages();
        settingsPage.classList.remove('hidden');
        settingsPage.classList.add('page-enter');
    }

    /**
     * Create settings page
     */
    createSettingsPage() {
        const page = document.createElement('div');
        page.id = 'settings-page';
        page.className = 'dynamic-page hidden';
        page.innerHTML = `
            <div class="settings-container">
                <h1 style="margin-bottom: 24px;">⚙️ الإعدادات</h1>

                <div class="settings-section">
                    <div class="settings-section-header">
                        <span>🔒 الخصوصية</span>
                    </div>
                    <div class="settings-item">
                        <div class="settings-label">
                            <strong>مستوى الحماية</strong>
                            <span>تحكم في صرامة فحص الرسائل</span>
                        </div>
                        <select onchange="console.log('Privacy level changed')">
                            <option value="low">🟢 منخفض</option>
                            <option value="medium" selected>🟡 متوسط</option>
                            <option value="high">🔴 صارم</option>
                        </select>
                    </div>
                    <div class="settings-item">
                        <div class="settings-label">
                            <strong>الحذف التلقائي</strong>
                            <span>احذف الرسائل المقروءة تلقائياً</span>
                        </div>
                        <div class="toggle-switch" onclick="this.classList.toggle('active')"></div>
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
                        <div class="toggle-switch active" onclick="this.classList.toggle('active')"></div>
                    </div>
                    <div class="settings-item">
                        <div class="settings-label">
                            <strong>الإشعارات بالبريد</strong>
                            <span>تلخيص يومي للرسائل الجديدة</span>
                        </div>
                        <div class="toggle-switch" onclick="this.classList.toggle('active')"></div>
                    </div>
                </div>

                <div class="settings-section">
                    <div class="settings-section-header">
                        <span>👤 الحساب</span>
                    </div>
                    <div class="settings-item">
                        <div class="settings-label">
                            <strong>تغيير كلمة المرور</strong>
                        </div>
                        <button class="btn btn-outline btn-sm">تغيير</button>
                    </div>
                    <div class="settings-item">
                        <div class="settings-label">
                            <strong>تصدير بياناتي</strong>
                        </div>
                        <button class="btn btn-outline btn-sm">تصدير</button>
                    </div>
                    <div class="settings-item">
                        <div class="settings-label">
                            <strong style="color: var(--accent-red);">حذف الحساب</strong>
                            <span>سيتم حذف جميع بياناتك نهائياً</span>
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="window.uiManager?.showConfirm('حذف الحساب', 'هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.', 'نعم، احذف حسابي')">حذف</button>
                    </div>
                </div>
            </div>
        `;

        return page;
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
