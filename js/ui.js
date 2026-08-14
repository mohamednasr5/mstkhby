/**
 * ===================================
 * Mstkhby - UI Module
 * ===================================
 * 
 * Handles UI interactions:
 * - Navigation
 * - Modals
 * - Theme toggle
 * - Toast notifications
 * - Animations
 */

class UIManager {
    constructor() {
        this.elements = {};
        this.theme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    // Initialize UI
    init() {
        this.cacheElements();
        this.bindEvents();
        this.initTheme();
        this.initAnimations();
        this.hidePreloader();
    }

    // Cache DOM elements
    cacheElements() {
        this.elements = {
            // Navigation
            navbar: document.getElementById('navbar'),
            navMenu: document.getElementById('navMenu'),
            mobileToggle: document.getElementById('mobileToggle'),
            themeToggle: document.getElementById('themeToggle'),
            
            // Auth Modal
            authModal: document.getElementById('authModal'),
            loginBtn: document.getElementById('loginBtn'),
            signupBtn: document.getElementById('signupBtn'),
            getStartedBtn: document.getElementById('getStartedBtn'),
            ctaSignupBtn: document.getElementById('ctaSignupBtn'),
            closeAuthModal: document.getElementById('closeAuthModal'),
            
            // Auth Forms
            loginForm: document.getElementById('loginForm'),
            signupForm: document.getElementById('signupForm'),
            authTabs: document.querySelectorAll('.auth-tab'),
            googleLoginBtn: document.getElementById('googleLoginBtn'),
            googleSignupBtn: document.getElementById('googleSignupBtn'),
            
            // Send Message Modal
            sendMessageModal: document.getElementById('sendMessageModal'),
            sendMessageForm: document.getElementById('sendMessageForm'),
            
            // Forms
            aliasInput: document.getElementById('aliasInput'),
            messageTypeInputs: document.querySelectorAll('input[name="messageType"]'),
            identityInputs: document.querySelectorAll('input[name="identity"]'),
            
            // Toast Container
            toastContainer: document.getElementById('toastContainer'),
            
            // Preloader
            preloader: document.getElementById('preloader')
        };
    }

    // Bind event listeners
    bindEvents() {
        // Mobile menu toggle
        if (this.elements.mobileToggle) {
            this.elements.mobileToggle.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }

        // Theme toggle
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // Auth modal triggers
        [this.elements.loginBtn, this.elements.signupBtn, 
         this.elements.getStartedBtn, this.elements.ctaSignupBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', () => {
                    this.openAuthModal(btn.id === 'signupBtn' || btn.id === 'getStartedBtn' || btn.id === 'ctaSignupBtn');
                });
            }
        });

        // Close modals
        if (this.elements.closeAuthModal) {
            this.elements.closeAuthModal.addEventListener('click', () => {
                this.closeModal(this.elements.authModal);
            });
        }

        // Auth tabs
        this.elements.authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchAuthTab(tab.dataset.tab);
            });
        });

        // Message type selection
        this.elements.messageTypeInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.handleMessageTypeChange(e.target.value);
            });
        });

        // Identity selection
        this.elements.identityInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.handleIdentityChange(e.target.value);
            });
        });

        // Form submissions
        if (this.elements.loginForm) {
            this.elements.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin(e.target);
            });
        }

        if (this.elements.signupForm) {
            this.elements.signupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSignup(e.target);
            });
        }

        // Google sign-in / sign-up
        if (this.elements.googleLoginBtn) {
            this.elements.googleLoginBtn.addEventListener('click', () => {
                this.handleGoogleAuth(this.elements.googleLoginBtn);
            });
        }

        if (this.elements.googleSignupBtn) {
            this.elements.googleSignupBtn.addEventListener('click', () => {
                this.handleGoogleAuth(this.elements.googleSignupBtn);
            });
        }

        if (this.elements.sendMessageForm) {
            this.elements.sendMessageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSendMessage(e.target);
            });
        }

        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            this.handleScroll();
        });

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeModal(overlay);
                }
            });
        });

        // Close modals on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    this.closeModal(modal);
                });
            }
        });

        // Password strength indicator
        const passwordInput = document.getElementById('signupPassword');
        if (passwordInput) {
            passwordInput.addEventListener('input', (e) => {
                this.updatePasswordStrength(e.target.value);
            });
        }

        // Username validation
        const usernameInput = document.getElementById('signupUsername');
        if (usernameInput) {
            usernameInput.addEventListener('blur', (e) => {
                this.validateUsernameAvailability(e.target.value);
            });
        }
    }

    // Initialize theme
    initTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        
        // Check system preference if no saved preference
        if (!localStorage.getItem('theme')) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.theme = prefersDark ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', this.theme);
        }
    }

    // Toggle theme
    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('theme', this.theme);
        
        this.showToast(
            'تم تغيير الوضع',
            `الوضع ${this.theme === 'dark' ? 'ليلي' : 'نهاري'} مفعل`,
            'info'
        );
    }

    // Toggle mobile menu
    toggleMobileMenu() {
        this.elements.navMenu.classList.toggle('active');
        this.elements.mobileToggle.classList.toggle('active');
    }

    // Handle scroll for navbar
    handleScroll() {
        if (window.scrollY > 50) {
            this.elements.navbar?.classList.add('scrolled');
        } else {
            this.elements.navbar?.classList.remove('scrolled');
        }
    }

    // Initialize animations
    initAnimations() {
        // Intersection Observer for scroll animations
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe elements with scroll-reveal class
        document.querySelectorAll('.scroll-reveal').forEach(el => {
            observer.observe(el);
        });

        // Animate stat numbers
        this.animateStats();
    }

    // Animate statistics numbers
    animateStats() {
        const stats = document.querySelectorAll('.stat-number[data-count]');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = parseInt(entry.target.dataset.count);
                    this.countUp(entry.target, target);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        stats.forEach(stat => observer.observe(stat));
    }

    // Count up animation
    countUp(element, target) {
        const duration = 2000;
        const start = 0;
        const startTime = performance.now();

        const updateCount = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + (target - start) * easeOutQuart);
            
            element.textContent = current.toLocaleString('ar-EG');

            if (progress < 1) {
                requestAnimationFrame(updateCount);
            }
        };

        requestAnimationFrame(updateCount);
    }

    // Hide preloader
    hidePreloader() {
        setTimeout(() => {
            this.elements.preloader?.classList.add('hidden');
            setTimeout(() => {
                this.elements.preloader?.remove();
            }, 500);
        }, 1000);
    }

    // Open auth modal
    openAuthModal(isSignup = false) {
        this.switchAuthTab(isSignup ? 'signup' : 'login');
        this.openModal(this.elements.authModal);
    }

    // Switch between login/signup tabs
    switchAuthTab(tab) {
        // Update tab buttons
        this.elements.authTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        // Show/hide forms
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');

        if (tab === 'login') {
            loginForm?.classList.remove('hidden');
            signupForm?.classList.add('hidden');
        } else {
            loginForm?.classList.add('hidden');
            signupForm?.classList.remove('hidden');
        }
    }

    // Open send message modal
    openSendMessageModal(recipientData) {
        if (recipientData) {
            const recipientName = document.getElementById('recipientName');
            const recipientAvatar = document.getElementById('recipientAvatar');
            
            if (recipientName) recipientName.textContent = `@${recipientData.username}`;
            if (recipientAvatar) recipientAvatar.textContent = recipientData.displayName?.[0] || '👤';
        }
        
        this.openModal(this.elements.sendMessageModal);
    }

    // Generic modal functions
    openModal(modal) {
        if (!modal) return;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Handle message type change
    handleMessageTypeChange(type) {
        const mediaUpload = document.getElementById('mediaUpload');
        const typeOptions = document.querySelectorAll('.type-option');
        
        typeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.querySelector('input').checked);
        });

        if (mediaUpload) {
            mediaUpload.classList.toggle('hidden', type === 'text');
        }
    }

    // Handle identity change
    handleIdentityChange(identity) {
        const identityOptions = document.querySelectorAll('.identity-option');
        const aliasInput = this.elements.aliasInput;
        
        identityOptions.forEach(opt => {
            opt.classList.toggle('active', opt.querySelector('input').checked);
        });

        if (aliasInput) {
            aliasInput.classList.toggle('hidden', identity !== 'alias');
            if (identity === 'alias') {
                aliasInput.focus();
            }
        }
    }

    // Update password strength indicator
    updatePasswordStrength(password) {
        const strengthEl = document.getElementById('passwordStrength');
        if (!strengthEl) return;

        let strength = 0;
        let label = '';
        let color = '';

        if (password.length >= 8) strength++;
        if (password.match(/[a-z]/)) strength++;
        if (password.match(/[A-Z]/)) strength++;
        if (password.match(/[0-9]/)) strength++;
        if (password.match(/[^a-zA-Z0-9]/)) strength++;

        if (strength <= 2) {
            label = 'ضعيف';
            color = '#ef4444';
        } else if (strength <= 3) {
            label = 'متوسط';
            color = '#f97316';
        } else if (strength <= 4) {
            label = 'قوي';
            color = '#10b981';
        } else {
            label = 'قوي جداً';
            color = '#059669';
        }

        strengthEl.innerHTML = `
            <div style="display: flex; gap: 4px;">
                ${[1,2,3,4,5].map(i => `
                    <div style="flex: 1; height: 3px; background: ${i <= strength ? color : '#d1d5db'}; border-radius: 2px;"></div>
                `).join('')}
            </div>
            <span style="font-size: 12px; color: ${color}; margin-top: 4px;">${label}</span>
        `;
    }

    // Validate username availability
    async validateUsernameAvailability(username) {
        const input = document.getElementById('signupUsername');
        const hint = input?.nextElementSibling;
        
        if (!username || username.length < 3) return;

        try {
            const isAvailable = await window.authService?.isUsernameAvailable(username);
            
            if (hint) {
                hint.textContent = isAvailable 
                    ? '✅ اسم المستخدم متاح' 
                    : '❌ اسم المستخدم مستخدم بالفعل';
                hint.style.color = isAvailable ? '#10b981' : '#ef4444';
            }
            
            input.style.borderColor = isAvailable ? '#10b981' : '#ef4444';
        } catch (error) {
            console.error('Username validation error:', error);
        }
    }

    // Handle Google sign-in / sign-up (same flow for both — Firebase
    // creates the account automatically on first Google sign-in)
    async handleGoogleAuth(button) {
        const originalHTML = button.innerHTML;

        try {
            button.disabled = true;
            button.innerHTML = '<span class="spinner"></span> جاري التسجيل عبر Google...';

            await window.authService?.signInWithGoogle();

            this.showToast(
                'تم بنجاح',
                'مرحباً بك! تم تسجيل الدخول عبر Google 🎉',
                'success'
            );

            this.closeModal(this.elements.authModal);

            setTimeout(() => {
                window.location.hash = '/inbox';
            }, 500);

        } catch (error) {
            // Popup closed by the user is not a real error — no toast needed
            if (error?.code !== 'CANCELLED') {
                this.showToast(
                    'خطأ في تسجيل الدخول عبر Google',
                    error.message || 'حدث خطأ غير متوقع',
                    'error'
                );
            }
        } finally {
            button.disabled = false;
            button.innerHTML = originalHTML;
        }
    }

    // Handle login form submission
    async handleLogin(form) {
        const email = form.querySelector('#loginEmail').value;
        const password = form.querySelector('#loginPassword').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> جاري تسجيل الدخول...';

            await window.authService?.login(email, password);

            this.showToast(
                'تم بنجاح',
                'مرحباً بعودتك! 🎉',
                'success'
            );

            this.closeModal(this.elements.authModal);
            
            // Redirect to inbox or profile
            setTimeout(() => {
                window.location.hash = '/inbox';
            }, 500);

        } catch (error) {
            this.showToast(
                'خطأ في تسجيل الدخول',
                error.message,
                'error'
            );
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'تسجيل الدخول';
        }
    }

    // Handle signup form submission
    async handleSignup(form) {
        const name = form.querySelector('#signupName').value;
        const username = form.querySelector('#signupUsername').value;
        const email = form.querySelector('#signupEmail').value;
        const password = form.querySelector('#signupPassword').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> جاري إنشاء الحساب...';

            await window.authService?.register(email, password, name, username);

            this.showToast(
                'تم إنشاء الحساب',
                'يرجى تفعيل بريدك الإلكتروني ✉️',
                'success'
            );

            this.closeModal(this.elements.authModal);

        } catch (error) {
            this.showToast(
                'خطأ في التسجيل',
                error.message,
                'error'
            );
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'إنشاء حساب';
        }
    }

    // Handle send message form submission
    async handleSendMessage(form) {
        const content = form.querySelector('#messageContent').value;
        const messageType = form.querySelector('input[name="messageType"]:checked')?.value || 'text';
        const identity = form.querySelector('input[name="identity"]:checked')?.value || 'anonymous';
        const destructOption = form.querySelector('#destructOption')?.value || 'normal';
        const alias = this.elements.aliasInput?.value || '';
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> جاري الإرسال...';

            // Prepare message data
            const messageData = {
                content,
                messageType,
                identity,
                alias: identity === 'alias' ? alias : null,
                destructOption,
                createdAt: new Date().toISOString(),
                // Recipient info would be set from URL params or context
                recipientId: new URLSearchParams(window.location.search).get('to')
            };

            // Send via messages service
            await window.messagesService?.sendMessage(messageData);

            this.showToast(
                'تم الإرسال بنجاح',
                'رسالتك وصلت بسلام 🤫',
                'success'
            );

            this.closeModal(this.elements.sendMessageModal);
            form.reset();

        } catch (error) {
            this.showToast(
                'خطأ في الإرسال',
                error.message,
                'error'
            );
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>🔐 إرسال رسالة سرية</span>';
        }
    }

    // Toast notification system
    showToast(title, message, type = 'info', duration = 4000) {
        const container = this.elements.toastContainer;
        if (!container) return;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        // Auto remove after duration
        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Confirm dialog
    showConfirm(title, message, confirmText = 'تأكيد', cancelText = 'إلغاء') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay active';
            overlay.innerHTML = `
                <div class="modal" style="max-width: 400px;">
                    <h3 style="margin-bottom: 16px;">${title}</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">${message}</p>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn btn-outline" id="confirmCancel">${cancelText}</button>
                        <button class="btn btn-primary" id="confirmOk">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';

            const cleanup = () => {
                overlay.remove();
                document.body.style.overflow = '';
            };

            overlay.querySelector('#confirmCancel').addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            overlay.querySelector('#confirmOk').addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            });
        });
    }

    // Loading state
    setLoading(element, isLoading) {
        if (isLoading) {
            element.dataset.originalText = element.textContent;
            element.disabled = true;
            element.innerHTML = '<span class="spinner"></span> جاري التحميل...';
        } else {
            element.disabled = false;
            element.innerHTML = element.dataset.originalText || 'إرسال';
        }
    }

    // Format date relative to now
    formatRelativeDate(date) {
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'الآن';
        if (minutes < 60) return `منذ ${minutes} دقيقة`;
        if (hours < 24) return `منذ ${hours} ساعة`;
        if (days < 7) return `منذ ${days} يوم`;
        
        return new Date(date).toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Truncate text
    truncateText(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(
                'تم النسخ',
                'تم نسخ الرابط إلى الحافظة',
                'success'
            );
        } catch (error) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            this.showToast(
                'تم النسخ',
                'تم نسخ الرابط إلى الحافظة',
                'success'
            );
        }
    }

    // Generate share card image (placeholder)
    generateShareCard(messageData) {
        // This would typically use a canvas or API to generate an image
        // For now, return a data structure that could be used
        return {
            template: 'default',
            data: {
                platform: 'مستخبي',
                message: this.truncateText(messageData.content, 80),
                senderType: messageData.identity === 'anonymous' ? '🤫 مجهول' : '👤 معروف',
                url: `mstkhby.com/${messageData.recipientUsername}`,
                cta: 'أرسل لي رسالة سرية'
            }
        };
    }
}

// Initialize and export
window.uiManager = new UIManager();
console.log('🎨 UI Manager initialized');
