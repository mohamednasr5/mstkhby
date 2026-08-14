/**
 * ===================================
 * Mstkhby - Admin Dashboard JavaScript
 * ===================================
 */

class AdminDashboard {
    constructor() {
        this.currentPage = 'dashboard';
        this.selectedUsers = new Set();
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
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
            reportsList: document.getElementById('reportsList')
        };
    }

    bindEvents() {
        // Sidebar toggle
        if (this.elements.sidebarToggle) {
            this.elements.sidebarToggle.addEventListener('click', () => {
                this.elements.sidebar.classList.toggle('open');
            });
        }

        // Navigation
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });

        // Users page events
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

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal(overlay.id);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    this.closeModal(modal.id);
                });
            }
        });
    }

    // ==================== NAVIGATION ====================

    navigateTo(page) {
        this.currentPage = page;

        // Update nav items
        this.elements.navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Show/hide pages
        this.elements.pages.forEach(p => {
            p.classList.toggle('active', p.id === `page-${page}`);
        });

        // Load page data
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
            case 'moderation':
                this.loadModerationQueue();
                break;
            case 'analytics':
                this.loadAnalytics();
                break;
        }
    }

    // ==================== DASHBOARD ====================

    async loadDashboardData() {
        try {
            // In production, fetch from API
            // const response = await fetch('/api/admin/stats');
            // const data = await response.json();

            // Mock data for demo
            const stats = {
                totalUsers: 150000,
                totalMessages: 2000000,
                activeUsersToday: 12500,
                premiumUsers: 2500,
                growthRate: 12.5
            };

            // Animate numbers
            this.animateNumber(this.elements.totalUsers, stats.totalUsers);
            this.animateNumber(this.elements.totalMessages, stats.totalMessages);
            this.animateNumber(this.elements.activeUsers, stats.activeUsersToday);
            this.animateNumber(this.elements.premiumUsers, stats.premiumUsers);

            // Load charts
            this.renderCharts();

        } catch (error) {
            console.error('Error loading dashboard:', error);
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

    renderCharts() {
        // Simple chart rendering with CSS/SVG
        // In production, use Chart.js or similar library
        
        const userGrowthChart = document.getElementById('userGrowthChart');
        if (userGrowthChart) {
            userGrowthChart.innerHTML = this.createLineChart([
                { label: 'يناير', value: 80000 },
                { label: 'فبراير', value: 95000 },
                { label: 'مارس', value: 110000 },
                { label: 'أبريل', value: 125000 },
                { label: 'مايو', value: 140000 },
                { label: 'يونيو', value: 150000 }
            ], '#0ea5e9');
        }

        const dailyMessagesChart = document.getElementById('dailyMessagesChart');
        if (dailyMessagesChart) {
            dailyMessagesChart.innerHTML = this.createBarChart([
                { label: 'السبت', value: 45000 },
                { label: 'الأحد', value: 52000 },
                { label: 'الإثنين', value: 48000 },
                { label: 'الثلاثاء', value: 55000 },
                { label: 'الأربعاء', value: 50000 },
                { label: 'الخميس', value: 58000 },
                { label: 'الجمعة', value: 42000 }
            ], '#8b5cf6');
        }
    }

    createLineChart(data, color) {
        const maxVal = Math.max(...data.map(d => d.value));
        const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - (d.value / maxVal) * 80;
            return `${x},${y}`;
        }).join(' ');

        return `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;">
                <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>
                ${data.map((d, i) => `
                    <circle cx="${(i / (data.length - 1)) * 100}" cy="${100 - (d.value / maxVal) * 80}" r="2" fill="${color}"/>
                `).join('')}
            </svg>
            <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:11px;color:#64748b;">
                ${data.map(d => `<span>${d.label}</span>`).join('')}
            </div>
        `;
    }

    createBarChart(data, color) {
        const maxVal = Math.max(...data.map(d => d.value));
        
        return `
            <div style="display:flex;align-items:flex-end;justify-content:space-between;height:180px;gap:8px;padding-top:20px;">
                ${data.map(d => `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                        <div style="width:100%;background:${color};border-radius:4px 4px 0 0;height:${(d.value / maxVal) * 160}px;opacity:0.8;"></div>
                        <span style="font-size:10px;color:#64748b;">${d.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ==================== USERS MANAGEMENT ====================

    async loadUsers() {
        if (!this.elements.usersTableBody) return;

        try {
            // Show loading state
            this.elements.usersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;">
                        <div class="spinner"></div>
                        <p style="margin-top:16px;color:#64748b;">جاري تحميل المستخدمين...</p>
                    </td>
                </tr>
            `;

            // Fetch from API
            // const search = this.elements.userSearch?.value || '';
            // const filter = this.elements.userFilter?.value || 'all';
            // const response = await fetch(`/api/admin/users?search=${search}&filter=${filter}&limit=20`);
            // const data = await response.json();

            // Mock data
            const users = this.generateMockUsers(20);

            this.renderUsersTable(users);

        } catch (error) {
            console.error('Error loading users:', error);
            this.elements.usersTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center;padding:40px;color:#ef4444;">
                        ❌ حدث خطأ في تحميل المستخدمين
                    </td>
                </tr>
            `;
        }
    }

    generateMockUsers(count) {
        const names = ['أحمد محمد', 'سارة علي', 'خالد عبدالله', 'نورة حسام', 'محمد سعيد'];
        const plans = ['free', 'free', 'premium', 'free', 'free'];
        const statuses = ['active', 'active', 'banned', 'active', 'active'];

        return Array.from({ length: count }, (_, i) => ({
            id: `user_${i + 1}`,
            name: names[i % names.length],
            email: `user${i + 1}@example.com`,
            username: `username_${i + 1}`,
            plan: plans[i % plans.length],
            status: statuses[i % statuses.length],
            messagesCount: Math.floor(Math.random() * 500),
            joinDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }));
    }

    renderUsersTable(users) {
        this.elements.usersTableBody.innerHTML = users.map(user => `
            <tr data-user-id="${user.id}">
                <td><input type="checkbox" class="user-checkbox" value="${user.id}"></td>
                <td>
                    <div class="user-cell">
                        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0ea5e9&color=fff" alt="${user.name}">
                        <div>
                            <strong>${user.name}</strong>
                            <small>@${user.username}</small>
                        </div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td><span class="status-badge ${user.status}">${user.status === 'active' ? 'نشط' : 'محظور'}</span></td>
                <td><span class="plan-badge ${user.plan}">${user.plan === 'premium' ? 'بريميوم' : 'مجاني'}</span></td>
                <td>${user.messagesCount.toLocaleString()}</td>
                <td>${user.joinDate}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn" onclick="adminDashboard.viewUser('${user.id}')" title="عرض">👁️</button>
                        <button class="action-btn" onclick="adminDashboard.editUser('${user.id}')" title="تعديل">✏️</button>
                        <button class="action-btn danger" onclick="adminDashboard.banUser('${user.id}')" title="حظر">🚫</button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Bind checkbox events
        this.elements.usersTableBody.querySelectorAll('.user-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateSelectAllState());
        });
    }

    toggleAllUsers(checked) {
        this.elements.usersTableBody.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.checked = checked;
            if (checked) {
                this.selectedUsers.add(cb.value);
            } else {
                this.selectedUsers.delete(cb.value);
            }
        });
    }

    updateSelectAllState() {
        const checkboxes = this.elements.usersTableBody.querySelectorAll('.user-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        this.elements.selectAll.checked = allChecked && checkboxes.length > 0;
    }

    viewUser(userId) {
        // Open user detail modal
        this.openModal('userDetailModal');
        // Load user details...
    }

    editUser(userId) {
        alert(`تعديل المستخدم: ${userId}`);
    }

    banUser(userId) {
        this.showConfirm(
            'حظر مستخدم',
            'هل أنت متأكد من حظر هذا المستخدم؟',
            async () => {
                // await fetch(`/api/admin/users/${userId}/ban`, { method: 'POST' });
                this.showToast('تم الحظر', 'تم حظر المستخدم بنجاح', 'success');
                this.loadUsers();
            }
        );
    }

    exportUsers() {
        this.showToast('جاري التصدير', 'جاري تصدير بيانات المستخدمين...', 'info');
        // Implement CSV/Excel export
    }

    // ==================== MESSAGES MANAGEMENT ====================

    loadMessages() {
        const messagesList = document.getElementById('adminMessagesList');
        if (!messagesList) return;

        messagesList.innerHTML = `
            <div style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); display: grid; gap: 16px;">
                ${Array.from({ length: 12 }, (_, i) => `
                    <div class="message-card-admin" onclick="adminDashboard.viewMessage('msg_${i}')">
                        <div class="msg-header">
                            <span class="identity-badge anonymous">🤫 مجهول</span>
                            <span class="msg-time">منذ ${Math.floor(Math.random() * 60)} دقيقة</span>
                        </div>
                        <p class="msg-content">${['رسالة تجريبية', 'هذا نص رسالة', 'مرحباً بك'][i % 3]}...</p>
                        <div class="msg-meta">
                            <span>📝 نص</span>
                            <span class="status-badge delivered">تم التسليم</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    setMessagesView(view) {
        document.querySelectorAll('.messages-view-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.includes(view === 'list' ? 'قائمة' : 'شبكة'));
        });
        this.loadMessages();
    }

    viewMessage(messageId) {
        this.openModal('messageDetailModal');
    }

    // ==================== REPORTS MANAGEMENT ====================

    loadReports() {
        // Reports are already in HTML for demo
        // In production, fetch from API
    }

    handleReport(action, reportId) {
        const actions = {
            resolve: 'حل البلاغ',
            ban: 'حظر المرسل',
            dismiss: 'رفض البلاغ'
        };

        this.showConfirm(
            actions[action],
            `هل تريد ${actions[action].toLowerCase()} #${reportId}؟`,
            async () => {
                // await fetch(`/api/admin/reports/${reportId}/action`, {
                //     method: 'POST',
                //     body: JSON.stringify({ action })
                // });
                
                this.showToast('تم بنجاح', `${actions[action]} بنجاح`, 'success');
                
                // Remove report card from DOM
                const reportCard = document.querySelector(`[onclick*="${reportId}"]`)?.closest('.report-card');
                if (reportCard) {
                    reportCard.style.animation = 'fadeOutUp 0.3s ease forwards';
                    setTimeout(() => reportCard.remove(), 300);
                }
            }
        );
    }

    // ==================== MODERATION QUEUE ====================

    loadModerationQueue() {
        // Moderation queue is in HTML for demo
        // In production, fetch from API
    }

    // ==================== ANALYTICS ====================

    loadAnalytics() {
        // Analytics charts would be rendered here
        // Using Chart.js or similar library
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
        if (confirmed && onConfirm) {
            onConfirm();
        }
    }

    showToast(title, message, type = 'info') {
        // Create toast notification
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
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    startAutoRefresh() {
        // Refresh dashboard data every 5 minutes
        setInterval(() => {
            if (this.currentPage === 'dashboard') {
                this.loadDashboardData();
            }
        }, 5 * 60 * 1000);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    formatNumber(num) {
        return num.toLocaleString('ar-EG');
    }
}

// Initialize admin dashboard
const adminDashboard = new AdminDashboard();

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

console.log('🛡️ Admin Dashboard initialized');
