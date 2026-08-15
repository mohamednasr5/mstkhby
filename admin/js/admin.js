/**
 * ===================================
 * Mstkhby - Admin Dashboard JavaScript
 * ===================================
 *
 * Everything on this page reads from the real Firebase Realtime Database.
 * There is NO mock/demo data anywhere in this file.
 *
 * ACCESS CONTROL
 * Only these Google accounts may enter the dashboard:
 *   - elfannanm@gmail.com
 *   - mohamednasrofficial@gmail.com
 * Enforced here (client gate) AND in database.rules.json (server-side —
 * the client gate alone is NOT security, it's UX; the real DB rules are
 * what actually stop anyone else from reading/writing admin data).
 */

const ADMIN_ALLOWED_EMAILS = [
    'elfannanm@gmail.com',
    'mohamednasrofficial@gmail.com'
];

class AdminAuthGate {
    constructor(onAuthorized) {
        this.onAuthorized = onAuthorized;
        this.auth = window.MstkhbyFirebase?.auth || firebase.auth();
        this.els = {
            gate: document.getElementById('adminAuthGate'),
            layout: document.getElementById('adminLayout'),
            loginBtn: document.getElementById('adminGoogleLoginBtn'),
            error: document.getElementById('adminAuthError'),
            message: document.getElementById('adminAuthMessage')
        };
        this.bind();
        this.listen();
    }

    bind() {
        this.els.loginBtn?.addEventListener('click', () => this.signIn());
    }

    listen() {
        this.auth.onAuthStateChanged((user) => {
            if (!user) {
                this.showGate();
                return;
            }

            const email = (user.email || '').toLowerCase();
            if (!ADMIN_ALLOWED_EMAILS.includes(email)) {
                this.showError('هذا الحساب غير مصرح له بالدخول إلى لوحة التحكم.');
                this.auth.signOut();
                return;
            }

            this.showDashboard(user);
        });
    }

    async signIn() {
        this.setLoading(true);
        this.hideError();
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await this.auth.signInWithPopup(provider);
            // onAuthStateChanged above handles the rest.
        } catch (error) {
            console.error('Admin sign-in error:', error);
            if (error?.code !== 'auth/popup-closed-by-user') {
                this.showError('تعذر تسجيل الدخول. حاول مرة أخرى.');
            }
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        if (this.els.loginBtn) {
            this.els.loginBtn.disabled = loading;
            this.els.loginBtn.querySelector('span').textContent = loading
                ? 'جاري تسجيل الدخول...'
                : 'الدخول بحساب جوجل';
        }
    }

    showError(msg) {
        if (this.els.error) {
            this.els.error.textContent = msg;
            this.els.error.hidden = false;
        }
    }

    hideError() {
        if (this.els.error) this.els.error.hidden = true;
    }

    showGate() {
        if (this.els.gate) this.els.gate.hidden = false;
        if (this.els.layout) this.els.layout.hidden = true;
    }

    showDashboard(user) {
        if (this.els.gate) this.els.gate.hidden = true;
        if (this.els.layout) this.els.layout.hidden = false;

        const nameEl = document.querySelector('.admin-profile span');
        const imgEl = document.querySelector('.admin-profile img');
        if (nameEl) nameEl.textContent = user.displayName || user.email;
        if (imgEl) imgEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=0ea5e9&color=fff`;

        this.onAuthorized(user);
    }
}

class AdminDashboard {
    constructor() {
        this.currentPage = 'dashboard';
        this.selectedUsers = new Set();
        this.database = window.MstkhbyFirebase?.database || firebase.database();
        this.allUsersCache = null; // { uid: profile } — refreshed on demand
        this.initialized = false;
        // Kept in sync with paymentConfig.plans in js/payment-new.js
        this.planLabels = { free: 'مجاني', premium: 'بريميوم', creator: 'منشئ محتوى' };
    }

    /** Human-readable label for a plan key, falling back to the raw key for unknown values. */
    planLabel(plan) {
        if (!plan || plan === 'free') return 'مجاني';
        return this.planLabels[plan] || plan;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.cacheElements();
        this.bindEvents();
        this.bindLogout();
        this.loadDashboardData();
        this.startAutoRefresh();
    }

    cacheElements() {
        this.elements = {
            sidebar: document.getElementById('adminSidebar'),
            sidebarToggle: document.getElementById('sidebarToggle'),
            navItems: document.querySelectorAll('.nav-item'),
            pages: document.querySelectorAll('.admin-page'),

            // Dashboard
            totalUsers: document.getElementById('totalUsers'),
            totalMessages: document.getElementById('totalMessages'),
            activeUsers: document.getElementById('activeUsers'),
            premiumUsers: document.getElementById('premiumUsers'),

            // Users
            userSearch: document.getElementById('userSearch'),
            userFilter: document.getElementById('userFilter'),
            usersTableBody: document.getElementById('usersTableBody'),
            selectAll: document.getElementById('selectAll'),

            // Reports
            reportsList: document.getElementById('reportsList'),

            // Sidebar badges (real counts, filled in by loadDashboardData)
            sidebarUsersBadge: document.getElementById('sidebarUsersBadge'),
            sidebarMessagesBadge: document.getElementById('sidebarMessagesBadge'),
            sidebarReportsBadge: document.getElementById('sidebarReportsBadge')
        };
    }

    /** Formats a count for a compact badge, e.g. 1234 -> "1.2K", 2500000 -> "2.5M". */
    formatBadgeCount(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M+';
        if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K+';
        return String(n);
    }

    /** Shows a sidebar badge with a real count, or hides it entirely when there's nothing to show. */
    setSidebarBadge(el, count) {
        if (!el) return;
        if (!count) {
            el.hidden = true;
            return;
        }
        el.textContent = this.formatBadgeCount(count);
        el.hidden = false;
    }

    bindEvents() {
        if (this.elements.sidebarToggle) {
            this.elements.sidebarToggle.addEventListener('click', () => {
                this.elements.sidebar.classList.toggle('open');
            });
        }

        this.elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });

        if (this.elements.userSearch) {
            this.elements.userSearch.addEventListener('input',
                this.debounce(() => this.loadUsers(), 300)
            );
        }

        if (this.elements.userFilter) {
            this.elements.userFilter.addEventListener('change', () => this.loadUsers());
        }

        if (this.elements.selectAll) {
            this.elements.selectAll.addEventListener('change', (e) => {
                this.toggleAllUsers(e.target.checked);
            });
        }

        document.getElementById('reportStatusFilter')?.addEventListener('change', () => this.loadReports());
        document.getElementById('reportTypeFilter')?.addEventListener('change', () => this.loadReports());

        document.getElementById('saveGeneralSettingsBtn')?.addEventListener('click', () => this.saveGeneralSettings());
        document.getElementById('saveNotifSettingsBtn')?.addEventListener('click', () => this.saveNotifSettings());
        document.getElementById('saveSecuritySettingsBtn')?.addEventListener('click', () => this.saveSecuritySettings());

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal(overlay.id);
                }
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    this.closeModal(modal.id);
                });
            }
        });
    }

    bindLogout() {
        const profile = document.querySelector('.admin-profile');
        if (!profile || profile.dataset.logoutBound) return;
        profile.dataset.logoutBound = 'true';
        profile.style.cursor = 'pointer';
        profile.title = 'تسجيل الخروج';
        profile.addEventListener('click', () => {
            this.showConfirm('تسجيل الخروج', 'هل تريد تسجيل الخروج من لوحة التحكم؟', () => {
                (window.MstkhbyFirebase?.auth || firebase.auth()).signOut();
            });
        });
    }

    // ==================== NAVIGATION ====================

    navigateTo(page) {
        this.currentPage = page;

        this.elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        this.elements.pages.forEach(p => {
            p.classList.toggle('active', p.id === `page-${page}`);
        });

        switch (page) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'users':
                this.loadUsers();
                break;
            case 'messages':
                this.loadMessages();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'verifications':
                this.loadVerifications();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
            case 'settings':
                this.loadPlatformSettings();
                break;
        }
    }

    // ==================== PLATFORM SETTINGS ====================

    async loadPlatformSettings() {
        try {
            const snap = await this.database.ref('platformSettings').once('value');
            const s = snap.val() || {};

            const setSel = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
            const setToggle = (id, on) => { const el = document.getElementById(id); if (el && on !== undefined) el.classList.toggle('active', !!on); };
            const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };

            setSel('setRegistrationStatus', s.registrationStatus);
            setVal('setMaxFileSize', s.maxFileSizeMb);
            setToggle('setAiModeration', s.aiModerationStrict ?? true);

            setToggle('setNotifAdminEmail', s.notifications?.adminEmail ?? true);
            setToggle('setNotifUrgentReports', s.notifications?.urgentReports ?? true);
            setToggle('setNotifDailyReport', s.notifications?.dailyReport ?? false);

            setToggle('setTwoFactor', s.security?.twoFactor ?? true);
            const ipsEl = document.getElementById('setAllowedIps');
            if (ipsEl) ipsEl.value = (s.security?.allowedIps || []).join('\n');
            setVal('setRateLimit', s.security?.rateLimitPerMinute ?? 60);
        } catch (error) {
            console.error('loadPlatformSettings error:', error);
        }
    }

    async saveGeneralSettings() {
        try {
            await this.database.ref('platformSettings').update({
                registrationStatus: document.getElementById('setRegistrationStatus')?.value,
                maxFileSizeMb: Number(document.getElementById('setMaxFileSize')?.value) || 50,
                aiModerationStrict: document.getElementById('setAiModeration')?.classList.contains('active') ?? true
            });
            this.showToast('تم الحفظ', 'تم حفظ الإعدادات العامة', 'success');
        } catch (error) {
            console.error('saveGeneralSettings error:', error);
            this.showToast('خطأ', 'تعذر حفظ الإعدادات', 'error');
        }
    }

    async saveNotifSettings() {
        try {
            await this.database.ref('platformSettings/notifications').set({
                adminEmail: document.getElementById('setNotifAdminEmail')?.classList.contains('active') ?? true,
                urgentReports: document.getElementById('setNotifUrgentReports')?.classList.contains('active') ?? true,
                dailyReport: document.getElementById('setNotifDailyReport')?.classList.contains('active') ?? false
            });
            this.showToast('تم الحفظ', 'تم حفظ إعدادات الإشعارات', 'success');
        } catch (error) {
            console.error('saveNotifSettings error:', error);
            this.showToast('خطأ', 'تعذر حفظ إعدادات الإشعارات', 'error');
        }
    }

    async saveSecuritySettings() {
        try {
            const ips = (document.getElementById('setAllowedIps')?.value || '')
                .split('\n').map(s => s.trim()).filter(Boolean);
            await this.database.ref('platformSettings/security').set({
                twoFactor: document.getElementById('setTwoFactor')?.classList.contains('active') ?? true,
                allowedIps: ips,
                rateLimitPerMinute: Number(document.getElementById('setRateLimit')?.value) || 60
            });
            this.showToast('تم الحفظ', 'تم حفظ إعدادات الأمان (سياسة مرجعية — تفعيلها الفعلي يتطلب طبقة سيرفر)', 'success');
        } catch (error) {
            console.error('saveSecuritySettings error:', error);
            this.showToast('خطأ', 'تعذر حفظ إعدادات الأمان', 'error');
        }
    }

    // ==================== DATA HELPERS (real DB reads) ====================

    /** Fetches every user profile once and caches it in memory for this session. */
    async fetchAllUsers(forceRefresh = false) {
        if (this.allUsersCache && !forceRefresh) return this.allUsersCache;

        const snap = await this.database.ref('users').once('value');
        const usersById = {};
        snap.forEach(child => {
            const profile = child.val()?.profile;
            const entitlements = child.val()?.entitlements;
            if (profile) usersById[child.key] = { ...profile, ...entitlements };
        });
        this.allUsersCache = usersById;
        return usersById;
    }

    async fetchMessages(limit = 200) {
        const snap = await this.database.ref('messages').limitToLast(limit).once('value');
        const messages = [];
        snap.forEach(child => messages.push({ id: child.key, ...child.val() }));
        return messages.reverse(); // newest first
    }

    async fetchReports(limit = 100) {
        const snap = await this.database.ref('reports').limitToLast(limit).once('value');
        const reports = [];
        snap.forEach(child => reports.push({ id: child.key, ...child.val() }));
        return reports.reverse();
    }

    // ==================== DASHBOARD ====================

    async loadDashboardData() {
        try {
            const [usersById, messages, reports] = await Promise.all([
                this.fetchAllUsers(),
                this.fetchMessages(500),
                this.fetchReports(500)
            ]);

            const users = Object.values(usersById);
            const now = Date.now();
            const dayMs = 24 * 60 * 60 * 1000;

            const totalUsers = users.length;
            const premiumUsers = users.filter(u => u.plan && u.plan !== 'free').length;
            const activeUsersToday = users.filter(u => u.lastActiveAt && (now - u.lastActiveAt) < dayMs).length;

            // total messages: prefer the exact count from the messages index;
            // fall back to summing per-user stats if the index is large/未 sampled.
            const totalMessagesSnap = await this.database.ref('messages').once('value');
            const totalMessages = totalMessagesSnap.numChildren();

            this.animateNumber(this.elements.totalUsers, totalUsers);
            this.animateNumber(this.elements.totalMessages, totalMessages);
            this.animateNumber(this.elements.activeUsers, activeUsersToday);
            this.animateNumber(this.elements.premiumUsers, premiumUsers);

            this.renderCharts(users, messages);
            this.renderRecentActivity(users, messages, reports);

            const pendingCount = reports.filter(r => (r.status || 'pending') === 'pending').length;
            const notifBadge = document.querySelector('.notif-count');
            if (notifBadge) notifBadge.textContent = pendingCount.toLocaleString('ar-EG');

            // Real sidebar badges — replaces the old hardcoded "150K+ / 2M+ / 15"
            // placeholders that never reflected actual data.
            this.setSidebarBadge(this.elements.sidebarUsersBadge, totalUsers);
            this.setSidebarBadge(this.elements.sidebarMessagesBadge, totalMessages);
            this.setSidebarBadge(this.elements.sidebarReportsBadge, pendingCount);

<<<<<<< HEAD
            // Pending verification requests were previously invisible — there
            // was no admin UI at all for the applications js/verification.js
            // already collects. Surface a live count in the sidebar.
            this.database.ref('verifications').orderByChild('status').equalTo('pending').once('value')
                .then(snap => this.updateVerificationsBadge(snap.numChildren()))
                .catch(err => console.warn('verifications count failed:', err));

=======
>>>>>>> 34786a97004692c0d2790a5c115ae43efb25225d
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showToast('خطأ', 'تعذر تحميل بيانات لوحة المعلومات من قاعدة البيانات', 'error');
        }
    }

    animateNumber(element, target) {
        if (!element) return;

        const duration = 1000;
        const start = 0;
        const startTime = performance.now();

        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + (target - start) * easeOutQuart);

            element.textContent = current.toLocaleString('ar-EG');

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };

        requestAnimationFrame(update);
    }

    /** Builds real growth/daily-volume series from actual createdAt timestamps. */
    renderCharts(users, messages) {
        const userGrowthChart = document.getElementById('userGrowthChart');
        if (userGrowthChart) {
            const months = this.bucketByMonth(users.map(u => u.createdAt).filter(Boolean), 6);
            userGrowthChart.innerHTML = months.every(m => m.value === 0)
                ? this.emptyState('لا توجد بيانات مستخدمين كافية بعد')
                : this.createLineChart(months, '#0ea5e9');
        }

        const dailyMessagesChart = document.getElementById('dailyMessagesChart');
        if (dailyMessagesChart) {
            const days = this.bucketByDay(messages.map(m => m.createdAt).filter(Boolean), 7);
            dailyMessagesChart.innerHTML = days.every(d => d.value === 0)
                ? this.emptyState('لا توجد رسائل كافية بعد')
                : this.createBarChart(days, '#8b5cf6');
        }
    }

    bucketByMonth(timestamps, count) {
        const labels = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const now = new Date();
        const buckets = [];
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: labels[d.getMonth()], value: 0 });
        }
        const index = Object.fromEntries(buckets.map(b => [b.key, b]));
        timestamps.forEach(ts => {
            const d = new Date(ts);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (index[key]) index[key].value++;
        });
        // Cumulative growth reads better for a "user growth" chart
        let running = 0;
        return buckets.map(b => {
            running += b.value;
            return { label: b.label, value: running };
        });
    }

    bucketByDay(timestamps, count) {
        const labels = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const now = new Date();
        const buckets = [];
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            buckets.push({ key: d.toDateString(), label: labels[d.getDay()], value: 0 });
        }
        const index = Object.fromEntries(buckets.map(b => [b.key, b]));
        timestamps.forEach(ts => {
            const key = new Date(ts).toDateString();
            if (index[key]) index[key].value++;
        });
        return buckets.map(b => ({ label: b.label, value: b.value }));
    }

    emptyState(text) {
        return `<div style="display:flex;align-items:center;justify-content:center;height:180px;color:#64748b;font-size:13px;">${text}</div>`;
    }

    createLineChart(data, color) {
        const maxVal = Math.max(1, ...data.map(d => d.value));
        const points = data.map((d, i) => {
            const x = (i / Math.max(1, data.length - 1)) * 100;
            const y = 100 - (d.value / maxVal) * 80;
            return `${x},${y}`;
        }).join(' ');

        return `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">
                <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>
                ${data.map((d, i) => `
                    <circle cx="${(i / Math.max(1, data.length - 1)) * 100}" cy="${100 - (d.value / maxVal) * 80}" r="2" fill="${color}"/>
                `).join('')}
            </svg>
            <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:11px;color:#64748b;">
                ${data.map(d => `<span title="${d.value.toLocaleString('ar-EG')}">${d.label}</span>`).join('')}
            </div>
        `;
    }

    createBarChart(data, color) {
        const maxVal = Math.max(1, ...data.map(d => d.value));

        return `
            <div style="display:flex;align-items:flex-end;justify-content:space-between;height:180px;gap:8px;padding-top:20px;">
                ${data.map(d => `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;" title="${d.value.toLocaleString('ar-EG')}">
                        <div style="width:100%;background:${color};border-radius:4px 4px 0 0;height:${(d.value / maxVal) * 160}px;opacity:0.8;"></div>
                        <span style="font-size:10px;color:#64748b;">${d.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderRecentActivity(users, messages, reports) {
        const container = document.querySelector('.activity-list');
        if (!container) return;

        const events = [];

        Object.values(users)
            .filter(u => u.createdAt)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5)
            .forEach(u => events.push({
                icon: '👤', cls: 'new-user', ts: u.createdAt,
                title: 'مستخدم جديد مسجل',
                detail: `@${u.username || u.displayName || 'مستخدم'} انضم للمنصة`
            }));

        messages.slice(0, 5).forEach(m => events.push({
            icon: '📩', cls: 'new-message', ts: m.createdAt,
            title: 'رسالة جديدة',
            detail: m.identity === 'anonymous' ? 'رسالة مجهولة جديدة' : 'رسالة جديدة وصلت'
        }));

        reports.slice(0, 5).forEach(r => events.push({
            icon: '🚩', cls: 'report', ts: r.createdAt,
            title: 'بلاغ جديد',
            detail: r.reason || 'محتوى يحتاج مراجعة'
        }));

        events.sort((a, b) => (b.ts || 0) - (a.ts || 0));

        if (events.length === 0) {
            container.innerHTML = this.emptyState('لا يوجد نشاط بعد');
            return;
        }

        container.innerHTML = events.slice(0, 8).map(e => `
            <div class="activity-item">
                <span class="activity-icon ${e.cls}">${e.icon}</span>
                <div class="activity-details">
                    <strong>${e.title}</strong>
                    <p>${this.escapeHtml(e.detail)}</p>
                </div>
                <span class="activity-time">${this.timeAgo(e.ts)}</span>
            </div>
        `).join('');
    }

    // ==================== USERS MANAGEMENT ====================

    async loadUsers() {
        if (!this.elements.usersTableBody) return;

        this.elements.usersTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;padding:40px;">
                    <div class="spinner"></div>
                    <p style="margin-top:16px;color:#64748b;">جاري تحميل المستخدمين...</p>
                </td>
            </tr>
        `;

        try {
            const usersById = await this.fetchAllUsers();
            const search = (this.elements.userSearch?.value || '').trim().toLowerCase();
            const filter = this.elements.userFilter?.value || 'all';
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

            let list = Object.entries(usersById).map(([uid, profile]) => ({ uid, ...profile }));

            if (search) {
                list = list.filter(u =>
                    (u.displayName || '').toLowerCase().includes(search) ||
                    (u.email || '').toLowerCase().includes(search) ||
                    (u.username || '').toLowerCase().includes(search)
                );
            }

            if (filter === 'active') list = list.filter(u => u.status === 'active');
            else if (filter === 'banned') list = list.filter(u => u.status === 'banned');
            else if (filter === 'premium') list = list.filter(u => u.plan && u.plan !== 'free');
            else if (filter === 'new') list = list.filter(u => u.createdAt && u.createdAt >= sevenDaysAgo);

            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            this.renderUsersTable(list.slice(0, 100));

        } catch (error) {
            console.error('Error loading users:', error);
            this.elements.usersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:#ef4444;">
                        ❌ حدث خطأ في تحميل المستخدمين من قاعدة البيانات
                    </td>
                </tr>
            `;
        }
    }

    renderUsersTable(users) {
        if (users.length === 0) {
            this.elements.usersTableBody.innerHTML = `
                <tr><td colspan="8" style="text-align:center;padding:40px;color:#64748b;">لا يوجد مستخدمون مطابقون</td></tr>
            `;
            return;
        }

        this.elements.usersTableBody.innerHTML = users.map(user => `
            <tr data-user-id="${user.uid}">
                <td><input type="checkbox" class="user-checkbox" value="${user.uid}"></td>
                <td>
                    <div class="user-cell">
                        <img src="${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.username || '?')}&background=0ea5e9&color=fff`}" alt="${this.escapeHtml(user.displayName || '')}">
                        <div>
                            <strong>${this.escapeHtml(user.displayName || 'بدون اسم')}${user.isVerified ? ` <span title="${this.escapeHtml(window.verificationService?.verificationTiers?.[user.verificationTier]?.name || 'موثّق')}" style="color:${user.badgeColor || '#1d9bf0'};">${user.badgeIcon || '✔️'}</span>` : ''}</strong>
                            <small>@${this.escapeHtml(user.username || '')}</small>
                        </div>
                    </div>
                </td>
                <td>${this.escapeHtml(user.email || '')}</td>
                <td><span class="status-badge ${user.status === 'banned' ? 'banned' : 'active'}">${user.status === 'banned' ? 'محظور' : 'نشط'}</span></td>
                <td><span class="plan-badge ${user.plan && user.plan !== 'free' ? 'premium' : 'free'}">${this.planLabel(user.plan)}</span></td>
                <td>${(user.stats?.totalMessagesReceived || 0).toLocaleString('ar-EG')}</td>
                <td>${user.createdAt ? this.formatDate(new Date(user.createdAt).toISOString()) : '—'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn" onclick="adminDashboard.viewUser('${user.uid}')" title="عرض">👁️</button>
                        <button class="action-btn danger" onclick="adminDashboard.banUser('${user.uid}')" title="${user.status === 'banned' ? 'إلغاء الحظر' : 'حظر'}">${user.status === 'banned' ? '♻️' : '🚫'}</button>
                    </div>
                </td>
            </tr>
        `).join('');

        this.elements.usersTableBody.querySelectorAll('.user-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSelectAllState());
        });
    }

    toggleAllUsers(checked) {
        this.elements.usersTableBody.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.checked = checked;
            if (checked) this.selectedUsers.add(cb.value);
            else this.selectedUsers.delete(cb.value);
        });
    }

    updateSelectAllState() {
        const checkboxes = this.elements.usersTableBody.querySelectorAll('.user-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        this.elements.selectAll.checked = allChecked && checkboxes.length > 0;
    }

    async viewUser(userId) {
        const usersById = await this.fetchAllUsers();
        const user = usersById[userId];
        if (!user) return;

        this.currentViewedUserId = userId;

        const els = {
            avatar: document.getElementById('udUserAvatar'),
            name: document.getElementById('udDisplayName'),
            username: document.getElementById('udUsername'),
            link: document.getElementById('udProfileLink'),
            planBadge: document.getElementById('udPlanBadge'),
            verifiedBadge: document.getElementById('udVerifiedBadge'),
            verificationSelect: document.getElementById('udVerificationSelect'),
            email: document.getElementById('udEmail'),
            createdAt: document.getElementById('udCreatedAt'),
            lastActive: document.getElementById('udLastActive'),
            status: document.getElementById('udStatus'),
            planSelect: document.getElementById('udPlanSelect'),
            msgsReceived: document.getElementById('udMsgsReceived'),
            msgsSent: document.getElementById('udMsgsSent'),
            msgsDeleted: document.getElementById('udMsgsDeleted'),
            loginHistory: document.getElementById('udLoginHistory')
        };

        const displayName = user.displayName || user.username || 'مستخدم';
        const username = user.username || '—';
        const profileUrl = user.profileUrl || `mstkhby.com/${user.username || ''}`;

        if (els.avatar) els.avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=100&background=8b5cf6&color=fff`;
        if (els.name) els.name.textContent = displayName;
        if (els.username) els.username.textContent = username;
        if (els.link) { els.link.textContent = profileUrl; els.link.href = profileUrl.startsWith('http') ? profileUrl : `https://${profileUrl}`; }
        if (els.planBadge) {
            const isPremium = user.plan && user.plan !== 'free';
            els.planBadge.textContent = this.planLabel(user.plan);
            els.planBadge.className = `badge ${isPremium ? 'premium' : ''}`;
            els.planBadge.hidden = !isPremium;
        }
        if (els.verifiedBadge) {
            els.verifiedBadge.hidden = !user.isVerified;
            if (user.isVerified) {
                const tier = window.verificationService?.verificationTiers?.[user.verificationTier];
                els.verifiedBadge.textContent = `${user.badgeIcon || tier?.icon || '✔️'} ${tier?.name || 'موثّق'}`;
                els.verifiedBadge.style.background = user.badgeColor || tier?.color || '#1d9bf0';
            }
        }
        if (els.email) els.email.textContent = user.email || '—';
        if (els.createdAt) els.createdAt.textContent = user.createdAt ? this.formatDate(new Date(user.createdAt).toISOString()) : '—';
        if (els.lastActive) els.lastActive.textContent = user.lastActiveAt ? this.timeAgo(user.lastActiveAt) : '—';
        if (els.status) {
            const banned = user.status === 'banned';
            els.status.textContent = banned ? 'محظور 🚫' : 'نشط ✅';
            els.status.className = banned ? 'status-banned' : 'status-active';
        }
        if (els.planSelect) els.planSelect.value = user.plan || 'free';
        if (els.verificationSelect) els.verificationSelect.value = user.isVerified ? (user.verificationTier || 'basic') : 'none';
        if (els.loginHistory) { els.loginHistory.style.display = 'none'; els.loginHistory.innerHTML = ''; }

        // Message counts (sent / received / deleted-archived), fetched from the indexes
        Promise.all([
            this.database.ref(`messagesByRecipient/${userId}`).once('value'),
            this.database.ref(`messagesBySender/${userId}`).once('value'),
            this.database.ref('deletedMessages').orderByChild('senderId').equalTo(userId).once('value'),
            this.database.ref('deletedMessages').orderByChild('recipientId').equalTo(userId).once('value')
        ]).then(([recvSnap, sentSnap, delBySenderSnap, delByRecipientSnap]) => {
            if (els.msgsReceived) els.msgsReceived.textContent = this.formatNumber(recvSnap.numChildren());
            if (els.msgsSent) els.msgsSent.textContent = this.formatNumber(sentSnap.numChildren());
            const deletedIds = new Set();
            delBySenderSnap.forEach(c => deletedIds.add(c.key));
            delByRecipientSnap.forEach(c => deletedIds.add(c.key));
            if (els.msgsDeleted) els.msgsDeleted.textContent = this.formatNumber(deletedIds.size);
        }).catch(err => console.warn('message counts failed:', err));

        // Wire the action buttons for this specific user (re-bound every open)
        const warnBtn = document.getElementById('udWarnBtn');
        if (warnBtn) warnBtn.onclick = () => this.warnUser(userId);

        const banBtn = document.getElementById('udBanBtn');
        if (banBtn) { banBtn.textContent = user.status === 'banned' ? '♻️ إلغاء الحظر' : '🚫 حظر'; banBtn.onclick = () => { this.banUser(userId); this.closeModal('userDetailModal'); }; }

        const emailBtn = document.getElementById('udEmailBtn');
        if (emailBtn) emailBtn.onclick = () => this.emailUser(userId);

        const loginBtn = document.getElementById('udLoginHistoryBtn');
        if (loginBtn) loginBtn.onclick = () => this.toggleLoginHistory(userId);

        const msgsBtn = document.getElementById('udMessagesBtn');
        if (msgsBtn) msgsBtn.onclick = () => { this.closeModal('userDetailModal'); this.viewUserMessages(userId); };

        const saveBtn = document.getElementById('udSavePlanBtn');
        if (saveBtn) saveBtn.onclick = () => this.changeUserPlan(userId, els.planSelect?.value || 'free');

        const saveVerificationBtn = document.getElementById('udSaveVerificationBtn');
        if (saveVerificationBtn) saveVerificationBtn.onclick = () => this.setUserVerificationTier(userId, els.verificationSelect?.value || 'none');

        this.openModal('userDetailModal');
    }

    /** Change a user's plan/subscription from the admin panel. */
    async changeUserPlan(userId, newPlan) {
        try {
            const now = Date.now();
            const updates = {
                [`users/${userId}/entitlements/plan`]: newPlan,
                [`users/${userId}/entitlements/subscriptionStatus`]: newPlan === 'free' ? 'inactive' : 'active'
            };
            if (newPlan !== 'free') {
                updates[`users/${userId}/subscriptions/current`] = {
                    plan: newPlan,
                    status: 'active',
                    source: 'admin',
                    startDate: now,
                    // 30-day admin grant by default; adjust as needed for your billing flow.
                    endDate: now + 30 * 24 * 60 * 60 * 1000
                };
            } else {
                updates[`users/${userId}/subscriptions/current`] = null;
            }
            await this.database.ref().update(updates);
            await this.fetchAllUsers(true);
            this.showToast('تم التحديث', 'تم تغيير باقة المستخدم بنجاح', 'success');
            this.loadUsers();
        } catch (error) {
            console.error('changeUserPlan error:', error);
            this.showToast('خطأ', 'تعذر تغيير باقة المستخدم', 'error');
        }
    }

    /**
     * Directly grant or clear a verification tier from the admin panel,
     * independent of the public application flow in js/verification.js
     * (useful when the admin wants to badge someone who never applied).
     * Writes the same profile fields approveApplication() would.
     */
    async setUserVerificationTier(userId, tierKey) {
        try {
            const tiers = window.verificationService?.verificationTiers || {
                basic: { name: 'موثق أساسي', icon: '✓', color: '#0ea5e9' },
                influencer: { name: 'مؤثر موثق', icon: '⭐', color: '#8b5cf6' },
                celebrity: { name: 'مشهور موثق', icon: '👑', color: '#f59e0b' }
            };
            const now = Date.now();
            let updates;

            if (tierKey === 'none') {
                updates = {
                    [`users/${userId}/entitlements/isVerified`]: false,
                    [`users/${userId}/entitlements/verificationTier`]: null,
                    [`users/${userId}/entitlements/badgeIcon`]: null,
                    [`users/${userId}/entitlements/badgeColor`]: null
                };
            } else {
                const tier = tiers[tierKey];
                if (!tier) throw new Error('مستوى توثيق غير صالح');
                updates = {
                    [`users/${userId}/entitlements/isVerified`]: true,
                    [`users/${userId}/entitlements/verificationTier`]: tierKey,
                    [`users/${userId}/entitlements/verifiedAt`]: now,
                    [`users/${userId}/entitlements/badgeIcon`]: tier.icon,
                    [`users/${userId}/entitlements/badgeColor`]: tier.color
                };
            }

            await this.database.ref().update(updates);
            await this.fetchAllUsers(true);
            this.showToast('تم التحديث', tierKey === 'none' ? 'تم سحب علامة التوثيق' : 'تم منح علامة التوثيق', 'success');
            this.viewUser(userId);
            this.loadUsers();
        } catch (error) {
            console.error('setUserVerificationTier error:', error);
            this.showToast('خطأ', 'تعذر تحديث علامة التوثيق', 'error');
        }
    }

    /** Send a warning notice, logged under the user's record. */
    async warnUser(userId) {
        const reason = prompt('سبب التحذير (سيظهر للمستخدم):');
        if (reason === null) return; // cancelled
        try {
            await this.database.ref(`users/${userId}/warnings`).push({
                reason: reason || 'مخالفة قواعد المنصة',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                by: (window.MstkhbyFirebase?.auth || firebase.auth()).currentUser?.email || 'admin'
            });
            this.showToast('تم الإرسال', 'تم تسجيل التحذير للمستخدم', 'success');
        } catch (error) {
            console.error('warnUser error:', error);
            this.showToast('خطأ', 'تعذر إرسال التحذير', 'error');
        }
    }

    /** Opens the admin's mail client pre-addressed to the user. */
    async emailUser(userId) {
        const usersById = await this.fetchAllUsers();
        const user = usersById[userId];
        if (!user?.email) { this.showToast('تعذر', 'لا يوجد بريد إلكتروني مسجل لهذا المستخدم', 'error'); return; }
        window.location.href = `mailto:${user.email}`;
    }

    /** Toggle inline display of the user's recent login history. */
    async toggleLoginHistory(userId) {
        const box = document.getElementById('udLoginHistory');
        if (!box) return;
        if (box.style.display !== 'none' && box.innerHTML) { box.style.display = 'none'; return; }
        box.innerHTML = '<div class="detail-row"><span>جاري التحميل...</span></div>';
        box.style.display = 'block';
        try {
            const snap = await this.database.ref(`users/${userId}/loginHistory`).once('value');
            if (!snap.exists()) {
                box.innerHTML = '<div class="detail-row"><span>لا توجد سجلات تسجيل دخول متاحة لهذا المستخدم (بدأ التتبع حديثًا، فالحسابات القديمة قد لا تملك سجلات سابقة).</span></div>';
                return;
            }
            const entries = Object.values(snap.val()).sort((a, b) => (b.at || 0) - (a.at || 0));
            box.innerHTML = entries.map(e => `
                <div class="detail-row">
                    <span>${e.method === 'google' ? '🔵 جوجل' : e.method === 'apple' ? '⚫ آبل' : '✉️ بريد وكلمة مرور'}</span>
                    <span>${e.at ? this.timeAgo(e.at) : '—'}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('toggleLoginHistory error:', error);
            box.innerHTML = '<div class="detail-row"><span>تعذر تحميل سجل الدخول</span></div>';
        }
    }

    /** Shows every message (sent + received), including deleted/archived ones, for one user. */
    async viewUserMessages(userId) {
        this.navigateTo('messages');
        const messagesList = document.getElementById('adminMessagesList');
        if (!messagesList) return;
        messagesList.innerHTML = this.emptyState('جاري تحميل رسائل المستخدم...');

        try {
            const [recvIdx, sentIdx, delBySender, delByRecipient] = await Promise.all([
                this.database.ref(`messagesByRecipient/${userId}`).once('value'),
                this.database.ref(`messagesBySender/${userId}`).once('value'),
                this.database.ref('deletedMessages').orderByChild('senderId').equalTo(userId).once('value'),
                this.database.ref('deletedMessages').orderByChild('recipientId').equalTo(userId).once('value')
            ]);

            const liveIds = new Set();
            recvIdx.forEach(c => liveIds.add(c.key));
            sentIdx.forEach(c => liveIds.add(c.key));

            const liveMessages = (await Promise.all(
                Array.from(liveIds).map(id => this.database.ref(`messages/${id}`).once('value'))
            )).filter(s => s.exists()).map(s => ({ id: s.key, ...s.val(), _deleted: false }));

            const deletedMap = new Map();
            delBySender.forEach(c => deletedMap.set(c.key, { id: c.key, ...c.val(), _deleted: true }));
            delByRecipient.forEach(c => deletedMap.set(c.key, { id: c.key, ...c.val(), _deleted: true }));

            const all = [...liveMessages, ...deletedMap.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            const header = `
                <div class="page-header" style="margin-bottom:16px;">
                    <span>عرض رسائل المستخدم: <strong>${userId}</strong> (${all.length} رسالة، منها ${deletedMap.size} محذوفة ومؤرشفة)</span>
                    <button class="btn btn-outline btn-sm" onclick="adminDashboard.loadMessages()">✖ مسح الفلتر — عرض كل الرسائل</button>
                </div>`;

            if (all.length === 0) {
                messagesList.innerHTML = header + this.emptyState('لا توجد رسائل لهذا المستخدم');
                return;
            }

            messagesList.innerHTML = header + `
                <div style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); display: grid; gap: 16px;">
                    ${all.map(m => `
                        <div class="message-card-admin" style="${m._deleted ? 'opacity:0.7;border:1px dashed #ef4444;' : ''}">
                            <div class="msg-header">
                                <span class="identity-badge ${m.identity || 'anonymous'}">${m.identity === 'alias' ? '🎭 مستعار' : m.identity === 'known' ? '👤 معروف' : '🤫 مجهول'}</span>
                                <span class="msg-time">${this.timeAgo(m.createdAt)}</span>
                            </div>
                            ${m._deleted ? '<div style="color:#ef4444;font-size:12px;margin-bottom:4px;">🗑️ محذوفة — أرشيف للمراجعة فقط</div>' : ''}
                            <p class="msg-content">${this.escapeHtml((m.content || '').slice(0, 160))}${(m.content || '').length > 160 ? '…' : ''}</p>
                            ${m.mediaUrl ? `<a href="${m.mediaUrl}" target="_blank" rel="noopener" style="font-size:12px;color:#0ea5e9;">📎 عرض الوسائط</a>` : ''}
                            <div class="msg-meta">
                                <span>${m.senderId === userId ? '⬅️ مرسلة' : '➡️ مستلمة'}</span>
                                <span>${m.messageType === 'text' ? '📝 نص' : m.messageType === 'image' ? '🖼️ صورة' : m.messageType === 'video' ? '🎬 فيديو' : '📎 وسائط'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('viewUserMessages error:', error);
            messagesList.innerHTML = this.emptyState('❌ تعذر تحميل رسائل المستخدم');
        }
    }

    async banUser(userId) {
        const usersById = await this.fetchAllUsers();
        const user = usersById[userId];
        const isBanned = user?.status === 'banned';

        this.showConfirm(
            isBanned ? 'إلغاء حظر مستخدم' : 'حظر مستخدم',
            isBanned ? 'هل تريد إلغاء حظر هذا المستخدم؟' : 'هل أنت متأكد من حظر هذا المستخدم؟',
            async () => {
                try {
                    await this.database.ref(`users/${userId}/entitlements/status`).set(isBanned ? 'active' : 'banned');
                    this.showToast(isBanned ? 'تم إلغاء الحظر' : 'تم الحظر', 'تم تحديث حالة المستخدم في قاعدة البيانات', 'success');
                    await this.fetchAllUsers(true);
                    this.loadUsers();
                } catch (error) {
                    console.error('Ban error:', error);
                    this.showToast('خطأ', 'تعذر تحديث حالة المستخدم', 'error');
                }
            }
        );
    }

    exportUsers() {
        this.fetchAllUsers().then(usersById => {
            const rows = Object.entries(usersById).map(([uid, u]) => ({
                uid, name: u.displayName || '', username: u.username || '', email: u.email || '',
                plan: u.plan || 'free', status: u.status || 'active',
                messages: u.stats?.totalMessagesReceived || 0,
                joined: u.createdAt ? new Date(u.createdAt).toISOString() : ''
            }));
            const header = Object.keys(rows[0] || { uid: '' });
            const csv = [header.join(',')].concat(
                rows.map(r => header.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
            ).join('\n');

            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mstkhby-users-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // ==================== MESSAGES MANAGEMENT ====================

    async loadMessages() {
        const messagesList = document.getElementById('adminMessagesList');
        if (!messagesList) return;

        messagesList.innerHTML = this.emptyState('جاري التحميل...');

        try {
            const messages = await this.fetchMessages(60);

            if (messages.length === 0) {
                messagesList.innerHTML = this.emptyState('لا توجد رسائل بعد');
                return;
            }

            messagesList.innerHTML = `
                <div style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); display: grid; gap: 16px;">
                    ${messages.map(m => `
                        <div class="message-card-admin" onclick="adminDashboard.viewMessage('${m.id}')">
                            <div class="msg-header">
                                <span class="identity-badge ${m.identity || 'anonymous'}">${m.identity === 'alias' ? '🎭 مستعار' : m.identity === 'known' ? '👤 معروف' : '🤫 مجهول'}</span>
                                <span class="msg-time">${this.timeAgo(m.createdAt)}</span>
                            </div>
                            <p class="msg-content">${this.escapeHtml((m.content || '').slice(0, 80))}${(m.content || '').length > 80 ? '…' : ''}</p>
                            <div class="msg-meta">
                                <span>${m.messageType === 'text' ? '📝 نص' : m.messageType === 'image' ? '🖼️ صورة' : m.messageType === 'video' ? '🎬 فيديو' : '📎 وسائط'}</span>
                                <span class="status-badge ${m.status === 'delivered' ? 'delivered' : m.status}">${m.status === 'delivered' ? 'تم التسليم' : (m.status || '—')}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('Error loading messages:', error);
            messagesList.innerHTML = this.emptyState('❌ تعذر تحميل الرسائل');
        }
    }

    setMessagesView(view) {
        document.querySelectorAll('.messages-view-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(view === 'list' ? 'قائمة' : 'شبكة'));
        });
        this.loadMessages();
    }

    async viewMessage(messageId) {
        const snap = await this.database.ref(`messages/${messageId}`).once('value');
        const msg = snap.val();
        if (msg) console.log('message detail', msg);
        this.openModal('messageDetailModal');
    }

    // ==================== REPORTS MANAGEMENT ====================

    async loadReports() {
        if (!this.elements.reportsList) return;

        this.elements.reportsList.innerHTML = this.emptyState('جاري تحميل البلاغات...');

        try {
            const reports = await this.fetchReports(100);
            const statusFilter = document.getElementById('reportStatusFilter')?.value || 'pending';
            const filtered = reports.filter(r => (r.status || 'pending') === statusFilter);

            if (filtered.length === 0) {
                this.elements.reportsList.innerHTML = this.emptyState('لا توجد بلاغات في هذا التصنيف');
                return;
            }

            this.elements.reportsList.innerHTML = filtered.map(r => `
                <div class="report-card" data-report-id="${r.id}">
                    <div class="report-header">
                        <span class="report-id">#${r.id}</span>
                        <span class="report-status ${r.status || 'pending'}">${r.status === 'resolved' ? 'تم الحل' : r.status === 'dismissed' ? 'مرفوض' : 'قيد الانتظار'}</span>
                    </div>
                    <div class="report-content">
                        <p><strong>نوع البلاغ:</strong> ${this.escapeHtml(r.reason || 'غير محدد')}</p>
                        <p><strong>المُبلغ:</strong> ${this.escapeHtml(r.reporterId || 'مجهول')}</p>
                        <p><strong>الرسالة:</strong> ${this.escapeHtml(r.messageId || '—')}</p>
                        <p><strong>التاريخ:</strong> ${r.createdAt ? this.timeAgo(r.createdAt) : '—'}</p>
                    </div>
                    <div class="report-actions">
                        <button class="btn btn-success btn-sm" onclick="handleReport('resolve', '${r.id}')">✅ حل</button>
                        <button class="btn btn-danger btn-sm" onclick="handleReport('ban', '${r.id}')">🚫 حظر المرسل</button>
                        <button class="btn btn-outline btn-sm" onclick="handleReport('dismiss', '${r.id}')">❌ رفض</button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading reports:', error);
            this.elements.reportsList.innerHTML = this.emptyState('❌ تعذر تحميل البلاغات');
        }
    }

    /**
     * Verification requests — reviews applications submitted through the
     * public "طلب توثيق" form (js/verification.js) and approves/rejects
     * them using that same service, so the tier definitions (icon/color)
     * stay in one place.
     */
    async loadVerifications() {
        const container = document.getElementById('verificationsList');
        if (!container) return;

        container.innerHTML = this.emptyState('جاري تحميل الطلبات...');

        try {
            const snap = await this.database.ref('verifications').orderByChild('status').equalTo('pending').once('value');
            const applications = [];
            snap.forEach(child => { applications.push({ id: child.key, ...child.val() }); });

            this.updateVerificationsBadge(applications.length);

            if (applications.length === 0) {
                container.innerHTML = this.emptyState('لا توجد طلبات توثيق قيد الانتظار');
                return;
            }

            const tiers = window.verificationService?.verificationTiers || {};
            container.innerHTML = applications.map(app => {
                const tier = tiers[app.tier] || { name: app.tier, icon: '✓', color: '#0ea5e9' };
                const data = app.data || {};
                return `
                <div class="report-card" data-user-id="${app.userId}">
                    <div class="report-header">
                        <span class="report-id">${tier.icon} ${this.escapeHtml(tier.name)}</span>
                        <span class="report-status pending">قيد الانتظار</span>
                    </div>
                    <div class="report-content">
                        <p><strong>المستخدم:</strong> ${this.escapeHtml(data.fullName || app.userId)}</p>
                        <p><strong>نبذة:</strong> ${this.escapeHtml(data.bio || '—')}</p>
                        <p><strong>سبب الطلب:</strong> ${this.escapeHtml(data.reason || '—')}</p>
                        <p><strong>حسابات التواصل:</strong> ${(data.socialLinks || []).map(l => `${this.escapeHtml(l.platform)}: ${this.escapeHtml(l.url || '')} (${this.formatNumber(l.followers || 0)})`).join('، ') || '—'}</p>
                        <p><strong>تاريخ الطلب:</strong> ${app.createdAt ? this.timeAgo(app.createdAt) : '—'}</p>
                    </div>
                    <div class="report-actions">
                        <button class="btn btn-success btn-sm" onclick="adminDashboard.approveVerification('${app.userId}')">✅ موافقة</button>
                        <button class="btn btn-danger btn-sm" onclick="adminDashboard.rejectVerification('${app.userId}')">❌ رفض</button>
                        <button class="btn btn-outline btn-sm" onclick="adminDashboard.viewUser('${app.userId}')">👁️ عرض الحساب</button>
                    </div>
                </div>`;
            }).join('');
        } catch (error) {
            console.error('Error loading verification requests:', error);
            container.innerHTML = this.emptyState('❌ تعذر تحميل طلبات التوثيق');
        }
    }

    updateVerificationsBadge(count) {
        const el = document.getElementById('sidebarVerificationsBadge');
        if (!el) return;
        if (!count) { el.hidden = true; return; }
        el.textContent = String(count);
        el.hidden = false;
    }

    async approveVerification(userId) {
        if (!window.verificationService) {
            this.showToast('خطأ', 'خدمة التوثيق غير محمّلة', 'error');
            return;
        }
        try {
            await window.verificationService.approveApplication(userId);
            this.showToast('تم', 'تم قبول طلب التوثيق ومنح الشارة', 'success');
            await this.fetchAllUsers(true);
            this.loadVerifications();
        } catch (error) {
            console.error('approveVerification error:', error);
            this.showToast('خطأ', 'تعذر قبول الطلب', 'error');
        }
    }

    async rejectVerification(userId) {
        const reason = prompt('سبب الرفض (سيظهر للمستخدم):');
        if (reason === null) return;
        if (!window.verificationService) {
            this.showToast('خطأ', 'خدمة التوثيق غير محمّلة', 'error');
            return;
        }
        try {
            await window.verificationService.rejectApplication(userId, reason);
            this.showToast('تم', 'تم رفض طلب التوثيق', 'success');
            this.loadVerifications();
        } catch (error) {
            console.error('rejectVerification error:', error);
            this.showToast('خطأ', 'تعذر رفض الطلب', 'error');
        }
    }

    handleReport(action, reportId) {
        const actions = {
            resolve: 'حل البلاغ',
            ban: 'حظر المرسل',
            dismiss: 'رفض البلاغ'
        };

        this.showConfirm(
            actions[action],
            `هل تريد ${actions[action]} #${reportId}؟`,
            async () => {
                try {
                    const newStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
                    const updates = { [`reports/${reportId}/status`]: newStatus };

                    if (action === 'ban') {
                        const reportSnap = await this.database.ref(`reports/${reportId}`).once('value');
                        const report = reportSnap.val();
                        const msgSnap = report?.messageId
                            ? await this.database.ref(`messages/${report.messageId}`).once('value')
                            : null;
                        const senderId = msgSnap?.val()?.senderId;
                        if (senderId) updates[`users/${senderId}/entitlements/status`] = 'banned';
                    }

                    await this.database.ref().update(updates);
                    this.showToast('تم بنجاح', `${actions[action]} بنجاح`, 'success');

                    const reportCard = document.querySelector(`[data-report-id="${reportId}"]`);
                    if (reportCard) {
                        reportCard.style.animation = 'fadeOutUp 0.3s ease forwards';
                        setTimeout(() => reportCard.remove(), 300);
                    }
                } catch (error) {
                    console.error('Report action error:', error);
                    this.showToast('خطأ', 'تعذر تنفيذ الإجراء', 'error');
                }
            }
        );
    }

    // ==================== ANALYTICS ====================

    async loadAnalytics() {
        try {
            const messages = await this.fetchMessages(500);

            const typesEl = document.getElementById('messageTypesChart');
            if (typesEl) {
                const counts = {};
                messages.forEach(m => { const t = m.messageType || 'text'; counts[t] = (counts[t] || 0) + 1; });
                const data = Object.entries(counts).map(([label, value]) => ({ label, value }));
                typesEl.innerHTML = data.length ? this.createBarChart(data, '#0ea5e9') : this.emptyState('لا توجد بيانات بعد');
            }

            const levelsContainer = document.querySelector('.privacy-levels-stats');
            if (levelsContainer && messages.length) {
                const counts = { anonymous: 0, alias: 0, known: 0 };
                messages.forEach(m => { const id = m.identity || 'anonymous'; if (counts[id] !== undefined) counts[id]++; });
                const total = messages.length;
                const rows = [
                    { key: 'anonymous', name: '🔐 مجهول' },
                    { key: 'alias', name: '🎭 مستعار' },
                    { key: 'known', name: '👤 معروف' }
                ];
                levelsContainer.innerHTML = rows.map(r => {
                    const pct = total ? Math.round((counts[r.key] / total) * 100) : 0;
                    return `
                        <div class="level-stat">
                            <span class="level-name">${r.name}</span>
                            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
                            <span class="level-percent">${pct}%</span>
                        </div>
                    `;
                }).join('');
            }

            const growthEl = document.getElementById('platformGrowthChart');
            if (growthEl) {
                const usersById = await this.fetchAllUsers();
                const months = this.bucketByMonth(Object.values(usersById).map(u => u.createdAt).filter(Boolean), 6);
                growthEl.innerHTML = this.createLineChart(months, '#0ea5e9');
            }

            // Country-level breakdown requires IP/geo data we don't collect —
            // rather than invent numbers, we leave that card out entirely.
            const countriesEl = document.getElementById('countriesChart');
            if (countriesEl) {
                countriesEl.innerHTML = this.emptyState('لا تتوفر بيانات جغرافية للمستخدمين حالياً');
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    // ==================== UTILITY METHODS ====================

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    showConfirm(title, message, onConfirm) {
        const confirmed = confirm(`${title}\n\n${message}`);
        if (confirmed && onConfirm) onConfirm();
    }

    showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <div class="toast-content">
                <strong>${title}</strong>
                <p>${message}</p>
            </div>
            <button onclick="this.parentElement.remove()">×</button>
        `;

        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: #1e293b;
            border: 1px solid #334155;
            border-right: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#0ea5e9'};
            padding: 16px 20px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 9999;
            animation: slideInRight 0.3s ease;
            min-width: 320px;
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    startAutoRefresh() {
        setInterval(() => {
            if (this.currentPage === 'dashboard') {
                this.fetchAllUsers(true).then(() => this.loadDashboardData());
            }
        }, 5 * 60 * 1000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    }

    timeAgo(ts) {
        if (!ts) return '—';
        const diff = Date.now() - ts;
        const min = Math.floor(diff / 60000);
        if (min < 1) return 'الآن';
        if (min < 60) return `منذ ${min} دقيقة`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `منذ ${hr} ساعة`;
        const day = Math.floor(hr / 24);
        return `منذ ${day} يوم`;
    }

    formatNumber(num) {
        return num.toLocaleString('ar-EG');
    }
}

// ==================== BOOTSTRAP ====================

let adminDashboard;

document.addEventListener('DOMContentLoaded', () => {
    adminDashboard = new AdminDashboard();
    new AdminAuthGate((user) => {
        console.log('🛡️ Admin authorized:', user.email);
        adminDashboard.init();
    });
});

// Global functions for inline handlers
function closeModal(id) {
    adminDashboard.closeModal(id);
}

function handleReport(action, reportId) {
    adminDashboard.handleReport(action, reportId);
}

function setMessagesView(view) {
    adminDashboard.setMessagesView(view);
}

function exportUsers() {
    adminDashboard.exportUsers();
}

function confirmDangerAction(action) {
    const actionNames = {
        'clear-cache': 'مسح الـ Cache',
        'reset-rates': 'إعادة تعيين Rate Limits',
        'maintenance': 'تفعيل وضع الصيانة'
    };

    adminDashboard.showConfirm(
        `⚠️ ${actionNames[action]}`,
        'هذا الإجراء قد يؤثر على أداء المنصة. هل أنت متأكد؟',
        () => {
            adminDashboard.showToast('تم التنفيذ', `${actionNames[action]} بنجاح`, 'success');
        }
    );
}

console.log('🛡️ Admin Dashboard script loaded — waiting for authorized sign-in');
