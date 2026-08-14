/**
 * ===================================
 * Mstkhby - Internationalization (i18n)
 * ===================================
 * 
 * Handles:
 * - Multi-language support
 * - RTL/LTR switching
 * - Date/number localization
 * - Dynamic content translation
 */

class I18nService {
    constructor() {
        this.currentLanguage = 'ar';
        this.fallbackLanguage = 'ar';
        this.supportedLanguages = {
            ar: { name: 'العربية', dir: 'rtl', flag: '🇸🇦' },
            en: { name: 'English', dir: 'ltr', flag: '🇬🇧' },
            fr: { name: 'Français', dir: 'ltr', flag: '🇫🇷' }
        };
        
        this.translations = {};
        
        this.init();
    }

    async init() {
        // Load saved language preference
        const savedLang = localStorage.getItem('mstkhby_language');
        
        if (savedLang && this.supportedLanguages[savedLang]) {
            await this.setLanguage(savedLang);
        } else {
            // Detect browser language
            const browserLang = navigator.language.split('-')[0];
            
            if (this.supportedLanguages[browserLang]) {
                await this.setLanguage(browserLang);
            } else {
                await this.loadTranslations(this.currentLanguage);
                this.applyLanguage();
            }
        }

        console.log(`🌐 i18n initialized with language: ${this.currentLanguage}`);
    }

    /**
     * Set active language
     */
    async setLanguage(langCode) {
        if (!this.supportedLanguages[langCode]) {
            console.warn(`Unsupported language: ${langCode}`);
            return false;
        }

        try {
            await this.loadTranslations(langCode);
            this.currentLanguage = langCode;
            localStorage.setItem('mstkhby_language', langCode);
            
            this.applyLanguage();
            
            return true;
        } catch (error) {
            console.error('Failed to load language:', error);
            return false;
        }
    }

    /**
     * Load translations for a language
     */
    async loadTranslations(langCode) {
        // Check if already loaded
        if (this.translations[langCode]) return;

        try {
            // In production, fetch from /locales/{lang}.json
            // For now, use inline translations
            
            this.translations[langCode] = this.getTranslations(langCode);
            
        } catch (error) {
            console.error(`Failed to load translations for ${langCode}:`, error);
            this.translations[langCode] = this.getTranslations(this.fallbackLanguage);
        }
    }

    /**
     * Get translations object
     */
    getTranslations(lang) {
        const translations = {
            ar: {
                // App name & branding
                appName: 'مستخبي',
                appTagline: 'أرسل ما تريد قوله، بالطريقة التي تريدها',

                // Navigation
                nav_home: 'الرئيسية',
                nav_features: 'المميزات',
                nav_howItWorks: 'كيف يعمل',
                nav_pricing: 'الأسعار',
                nav_inbox: 'صندوق الوارد',
                nav_profile: 'حسابي',
                nav_settings: 'الإعدادات',

                // Hero section
                hero_title: 'أرسل ما تريد قوله',
                hero_subtitle: 'بالطريقة التي تريدها',
                hero_cta: 'ابدأ الآن مجاناً',
                hero_demo: 'شاهد الفيديو',
                
                hero_stats_users: 'مستخدم نشط',
                hero_stats_messages: 'رسالة مرسلة',
                hero_stats_countries: 'دولة عربية',

                // Features
                features_title: 'لماذا مستخبي؟',
                features_subtitle: 'منصة متكاملة بكل ما تحتاجه للتواصل السري والآمن',

                feature_send_without_account: {
                    title: 'إرسال بدون حساب',
                    desc: 'المرسل لا يحتاج لتسجيل حساب. فقط افتح الرابط وأرسل رسالتك سراً.'
                },
                feature_privacy_levels: {
                    title: 'مستويات السرية',
                    desc: 'اختر بين مجهول تماماً، اسم مستعار، أو إظهار هويتك. أنت تتحكم.'
                },
                feature_self_destruct: {
                    title: 'رسائل ذاتية التدمير',
                    desc: 'رسائل تختفي بعد فتحها أو بعد وقت محدد. خصوصية تامة.'
                },
                feature_multimedia: {
                    title: 'وسائط متعددة',
                    desc: 'أرسل نص، صور، فيديو، وصوت. لا حدود للإبداع.'
                },
                feature_replies: {
                    title: 'ردود مجهولة',
                    desc: 'رد على المرسل مع الحفاظ على هويتك أو إظهارها. اختيارك.'
                },
                feature_ai_moderation: {
                    title: 'حماية AI',
                    desc: 'نظام ذكي لفحص المحتوى ومنع التنمر والإساءة.'
                },
                feature_analytics: {
                    title: 'تحليلات ذكية',
                    desc: 'اعرف تفاعل رسائلك دون كشف هوية المرسلين.'
                },
                feature_pwa: {
                    title: 'PWA متوافق',
                    desc: 'استخدم المنصة كتطبيق على هاتفك. تجربة سلسة.'
                },

                // How it works
                how_it_works_title: 'بخطوات بسيطة',
                step_1_register: 'أنشئ حسابك',
                step_1_desc: 'سجل باسم المستخدم الخاص واحصل على رابطك الفريد',
                step_2_share: 'شارك رابطك',
                step_2_desc: 'انشر رابطك في السوشيال ميديا ولي receive رسائل',
                step_3_receive: 'استقبل الرسائل',
                step_3_desc: 'اقرأ رسائلك السرية وتفاعل معها بأمان',

                demo_link_text: 'هذا هو رابطك الشخصي الذي ستشاركه مع الجميع',

                // Privacy levels
                privacy_levels_title: 'اختر مستوى سريتك',
                level_anonymous: 'مجهول تماماً',
                level_anonymous_desc: 'المستلم لا يرى أي معلومات تعريفية',
                level_alias: 'اسم مستعار',
                level_alias_desc: 'يظهر الاسم المستعار فقط للمستلم',
                level_known: 'معروف',
                level_known_desc: 'يظهر اسم حسابك وصورتك للمستلم',
                level_reveal_later: 'اكشف لاحقاً',
                level_reveal_later_desc: 'مجهول الآن، واختر كشف هويتك لاحقاً',

                // Pricing
                pricing_title: 'اختر خطتك',
                pricing_free: 'مجاني',
                pricing_premium: 'بريميوم',
                pricing_creator: 'منشئ محتوى',

                plan_feature_link: 'رابط شخصي واحد',
                plan_feature_messages_unlimited: 'رسائل نصية غير محدودة',
                plan_feature_images: 'صور (حد أقصى 5/يوم)',
                plan_feature_anonymous: 'وضع مجهول',
                plan_feature_delete_block: 'حذف وحظر',
                plan_feature_video: 'فيديو',
                plan_feature_multiple_links: 'روابط متعددة',
                plan_feature_analytics: 'تحليلات متقدمة',
                plan_feature_timed_messages: 'رسائل مؤقتة متقدمة',
                plan_feature_themes: 'Themes مخصصة',
                plan_feature_no_ads: 'بدون إعلانات',
                plan_feature_priority_support: 'دعم أولوية',
                plan_feature_verified_badge: 'شارة موثق ✓',
                plan_feature_unlimited_inbox: 'Inbox غير محدود',
                plan_feature_ai_moderation: 'AI moderation متقدم',
                plan_feature_story_cards: 'Story Cards',
                plan_feature_analytics_api: 'Analytics API',
                plan_feature_spam_protection: 'حماية Spam قوية',
                plan_feature_account_manager: 'مدير حساب خاص',

                // Auth
                login_title: 'تسجيل الدخول',
                signup_title: 'حساب جديد',
                email_placeholder: 'example@email.com',
                password_placeholder: '••••••••',
                name_placeholder: 'محمد أحمد',
                username_placeholder: 'mohamed_123',
                forgot_password: 'نسيت كلمة المرور؟',
                or_separator: 'أو',
                login_with_google: 'Google',
                login_with_apple: 'Apple',
                terms_agreement: 'بإنشاء حساب، أنت توافق على شروط الاستخدام وسياسة الخصوصية',

                // Send message modal
                send_message_title: 'أرسل رسالة سرية لـ',
                select_type: 'نوع الرسالة',
                type_text: 'نص',
                type_image: 'صورة',
                type_video: 'فيديو',
                your_identity: 'هويتك',
                identity_anonymous: 'مجهول',
                identity_alias: 'اسم مستعار',
                identity_reveal: 'إظهار اسمي',
                alias_placeholder: 'ادخل اسمك المستعار...',
                message_type: 'نوع الرسالة',
                option_normal: 'عادية',
                option_one_view: '👁️ مشاهدة واحدة فقط',
                option_10sec: '⏱️ تختفي بعد 10 ثوانٍ',
                option_30sec: '⏱️ تختفي بعد 30 ثانية',
                option_1hour: '⏱️ تختفي بعد ساعة',
                option_24hours: '📅 تختفي بعد 24 ساعة',
                message_placeholder: 'اكتب رسالتك هنا... 🤫',
                attach_file: '📎 ارفق ملف',
                send_button: '🔐 إرسال رسالة سرية',
                safety_notice: 'رسائلك يتم فحصها بواسطة AI لضمان سلامة المنصة. نحترم خصوصيتك.',

                // Inbox
                inbox_title: '📬 صندوق الوارد',
                filter_all: 'الكل',
                filter_unread: 'غير مقروءة',
                filter_media: 'وسائط',
                no_messages_title: 'لا توجد رسائل',
                no_messages_desc: 'شارك رابطك لاستقبال رسائل سرية!',
                copy_link: 'نسخ الرابط',
                loading_messages: 'جاري تحميل الرسائل...',
                error_loading: 'حدث خطأ في تحميل الرسائل',
                retry: 'إعادة المحاولة',

                // Message actions
                delete: 'حذف',
                block: 'حظر',
                reply: 'رد',
                share: 'مشاركة',
                report: 'إبلاغ',
                reveal_identity: 'كشف الهوية',
                reaction_love: '❤️ أحببتها',
                reaction_funny: '😂 مضحكة',
                reaction_shocking: '😮 صادمة',
                reaction_sad: '😢 مؤثرة',
                reaction_fire: '🔥 قوية',
                reaction_agree: '👍 أتفق',

                // Reactions
                reply_anonymous: '🔐 رد مجهول',
                reply_with_name: '👤 رد باسمي',
                reply_placeholder: 'اكتب ردك هنا...',
                send_reply: 'إرسال الرد',

                // Toast notifications
                success: 'تم بنجاح',
                error: 'خطأ',
                warning: 'تنبيه',
                info: 'معلومات',
                copied_to_clipboard: 'تم نسخ الرابط إلى الحافظة',
                message_sent_successfully: 'رسالتك وصلت بسلام 🤫',
                message_sent_error: 'خطأ في الإرسال',
                logged_in_successfully: 'مرحباً بعودتك! 🎉',
                account_created: 'تم إنشاء الحساب',
                verify_email: 'يرجى تفعيل بريدك الإلكتروني ✉️',

                // Admin dashboard
                admin_dashboard: 'لوحة التحكم',
                admin_users: 'المستخدمون',
                admin_messages: 'الرسائل',
                admin_reports: 'البلاغات',
                admin_moderation: 'المراجعة',
                admin_analytics: 'التحليلات',
                admin_settings: 'الإعدادات',
                total_users: 'إجمالي المستخدمين',
                messages_sent: 'رسالة مرسلة',
                active_today: 'مستخدم نشط اليوم',
                premium_subscribers: 'مشترك بريميوم',

                // Common buttons
                button_login: 'تسجيل الدخول',
                button_signup: 'ابدأ مجاناً',
                button_get_started: 'ابدء الآن مجاناً',
                button_upgrade: 'ترقية الآن',
                button_contact_us: 'تواصل معنا',
                button_learn_more: 'اعرف المزيد',
                button_close: 'إغلاق',
                button_cancel: 'إلغاء',
                button_confirm: 'تأكيد',
                button_save: 'حفظ',
                button_delete: 'حذف',
                button_edit: 'تعديل',
                button_view: 'عرض',
                button_download: 'تحميل',
                button_share: 'مشاركة',
                button_copy: 'نسخ',
                button_next: 'التالي',
                button_back: 'السابق',
                button_submit: 'إرسال',
                button_loading: 'جاري التحميل...',

                // Time relative
                time_now: 'الآن',
                time_ago: 'منذ',
                time_minutes: '{count} دقيقة',
                time_hours: '{count} ساعة',
                time_days: '{count} يوم',
                time_weeks: '{count} أسبوع',

                // Errors
                error_required: 'هذا الحقل مطلوب',
                error_invalid_email: 'البريد الإلكتروني غير صالح',
                error_weak_password: 'كلمة المرور ضعيفة جداً',
                error_username_taken: 'اسم المستخدم مستخدم بالفعل',
                error_network: 'مشكلة في الاتصال بالإنترنت',
                error_unauthorized: 'غير مصرح',
                error_not_found: 'غير موجود',
                error_server_error: 'حدث خطأ في الخادم',
                error_try_again: 'حاول مرة أخرى'
            },

            en: {
                appName: 'Mstkhby',
                appTagline: 'Say what you want, the way you want',

                nav_home: 'Home',
                nav_features: 'Features',
                nav_howItWorks: 'How It Works',
                nav_pricing: 'Pricing',
                nav_inbox: 'Inbox',
                nav_profile: 'Profile',
                nav_settings: 'Settings',

                hero_title: 'Say what you want to say',
                hero_subtitle: 'The way you want',
                hero_cta: 'Get Started Free',
                hero_demo: 'Watch Video',

                hero_stats_users: 'Active Users',
                hero_stats_messages: 'Messages Sent',
                hero_stats_countries: 'Arab Countries',

                features_title: 'Why Mstkhby?',
                features_subtitle: 'A complete platform for secure and private communication',

                feature_send_without_account: {
                    title: 'Send Without Account',
                    desc: 'Sender doesn\'t need to register. Just open the link and send your secret message.'
                },
                // ... more English translations would go here
            },

            fr: {
                appName: 'Mstkhby',
                appTagline: 'Dites ce que vous voulez, de la manière que vous voulez',

                nav_home: 'Accueil',
                nav_features: 'Fonctionnalités',
                // ... more French translations would go here
            }
        };

        return translations[lang] || translations[this.fallbackLanguage];
    }

    /**
     * Apply current language to DOM
     */
    applyLanguage() {
        const langConfig = this.supportedLanguages[this.currentLanguage];
        
        // Set document direction and language
        document.documentElement.dir = langConfig.dir;
        document.documentElement.lang = this.currentLanguage;

        // Translate all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (translation) {
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.placeholder = translation;
                } else {
                    element.textContent = translation;
                }
            }
        });

        // Translate elements with data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation) {
                element.placeholder = translation;
            }
        });

        // Translate elements with data-i18n-title
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const translation = this.t(key);
            if (translation) {
                element.title = translation;
            }
        });

        // Dispatch custom event for other scripts to react
        window.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: this.currentLanguage, config: langConfig }
        }));
    }

    /**
     * Get translation for key
     */
    t(key, params = {}) {
        let translation = key.split('.').reduce((obj, k) => obj?.[k], this.translations[this.currentLanguage]);

        if (!translation) {
            // Try fallback language
            translation = key.split('.').reduce((obj, k) => obj?.[k], this.translations[this.fallbackLanguage]);
        }

        if (!translation) {
            return key; // Return key if no translation found
        }

        // Replace parameters
        Object.entries(params).forEach(([paramKey, paramValue]) => {
            translation = translation.replace(`{${paramKey}}`, paramValue);
        });

        return translation;
    }

    /**
     * Get current language config
     */
    getCurrentLanguage() {
        return {
            code: this.currentLanguage,
            ...this.supportedLanguages[this.currentLanguage]
        };
    }

    /**
     * Get supported languages list
     */
    getSupportedLanguages() {
        return Object.entries(this.supportedLanguages).map(([code, config]) => ({
            code,
            ...config,
            isActive: code === this.currentLanguage
        }));
    }

    /**
     * Format date according to current locale
     */
    formatDate(date, options = {}) {
        const locale = this.currentLanguage === 'ar' ? 'ar-SA' : this.currentLanguage;
        
        const defaultOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            ...options
        };

        return new Intl.DateTimeFormat(locale, defaultOptions).format(new Date(date));
    }

    /**
     * Format relative time
     */
    formatRelativeTime(date) {
        const now = new Date();
        const diff = now - new Date(date);
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        const rtf = new Intl.RelativeTimeFormat(this.currentLanguage === 'ar' ? 'ar-SA' : this.currentLanguage, {
            numeric: 'auto'
        });

        if (days > 7) {
            return this.formatDate(date);
        } else if (days > 0) {
            return rtf.format(-days, 'day');
        } else if (hours > 0) {
            return rtf.format(-hours, 'hour');
        } else if (minutes > 0) {
            return rtf.format(-minutes, 'minute');
        } else {
            return this.t('time_now');
        }
    }

    /**
     * Format number according to current locale
     */
    formatNumber(number, options = {}) {
        const locale = this.currentLanguage === 'ar' ? 'ar-SA' : this.currentLanguage;
        return new Intl.NumberFormat(locale, options).format(number);
    }

    /**
     * Format currency
     */
    formatCurrency(amount, currency = 'SAR') {
        const locale = this.currentLanguage === 'ar' ? 'ar-SA' : this.currentLanguage;
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency
        }).format(amount);
    }

    /**
     * Create language switcher UI
     */
    createLanguageSwitcher() {
        const container = document.createElement('div');
        container.className = 'language-switcher';
        container.innerHTML = `
            <button class="language-toggle" id="languageToggle">
                <span class="current-flag">${this.supportedLanguages[this.currentLanguage].flag}</span>
                <span class="current-lang">${this.supportedLanguages[this.currentLanguage].name}</span>
                <span class="toggle-icon">▼</span>
            </button>
            <div class="language-dropdown" id="languageDropdown">
                ${Object.entries(this.supportedLanguages).map(([code, config]) => `
                    <button class="language-option ${code === this.currentLanguage ? 'active' : ''}" data-lang="${code}">
                        <span class="flag">${config.flag}</span>
                        <span class="name">${config.name}</span>
                        ${code === this.currentLanguage ? '<span class="check">✓</span>' : ''}
                    </button>
                `).join('')}
            </div>
        `;

        // Bind events
        container.querySelector('#languageToggle').addEventListener('click', () => {
            container.querySelector('#languageDropdown').classList.toggle('show');
        });

        container.querySelectorAll('.language-option').forEach(option => {
            option.addEventListener('click', async () => {
                const langCode = option.dataset.lang;
                await this.setLanguage(langCode);
                container.querySelector('#languageDropdown').classList.remove('show');
                this.updateSwitcherUI(container);
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.querySelector('#languageDropdown')?.classList.remove('show');
            }
        });

        return container;
    }

    /**
     * Update switcher UI after language change
     */
    updateSwitcherUI(container) {
        const toggle = container.querySelector('#languageToggle');
        toggle.querySelector('.current-flag').textContent = this.supportedLanguages[this.currentLanguage].flag;
        toggle.querySelector('.current-lang').textContent = this.supportedLanguages[this.currentLanguage].name;

        container.querySelectorAll('.language-option').forEach(option => {
            option.classList.toggle('active', option.dataset.lang === this.currentLanguage);
            const check = option.querySelector('.check');
            if (check) {
                check.style.display = option.dataset.lang === this.currentLanguage ? 'inline' : 'none';
            }
        });
    }

    /**
     * Add language switcher to navigation
     */
    addToNavigation(navElement) {
        const switcher = this.createLanguageSwitcher();
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .language-switcher {
                position: relative;
                display: inline-block;
            }
            
            .language-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--surface);
                border: 1px solid var(--border-light);
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                color: var(--text-primary);
                transition: all 0.2s ease;
            }
            
            .language-toggle:hover {
                border-color: var(--border-medium);
            }
            
            .toggle-icon {
                font-size: 10px;
                transition: transform 0.2s ease;
            }
            
            .language-switcher.open .toggle-icon {
                transform: rotate(180deg);
            }
            
            .language-dropdown {
                position: absolute;
                top: calc(100% + 8px);
                left: 0;
                background: var(--surface);
                border: 1px solid var(--border-light);
                border-radius: 10px;
                box-shadow: var(--shadow-lg);
                min-width: 180px;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-10px);
                transition: all 0.2s ease;
                z-index: 1000;
            }
            
            .language-dropdown.show {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .language-option {
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                padding: 12px 16px;
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                color: var(--text-primary);
                transition: background 0.15s ease;
            }
            
            .language-option:hover {
                background: var(--surface-hover);
            }
            
            .language-option.active {
                background: rgba(14, 165, 233, 0.1);
                color: var(--primary-600);
            }
            
            .flag {
                font-size: 18px;
            }
            
            .name {
                flex: 1;
                text-align: right;
            }
            
            .check {
                color: var(--primary-600);
                font-weight: bold;
            }
        `;

        document.head.appendChild(style);
        navElement.appendChild(switcher);
    }
}

// Initialize and export
window.i18nService = new I18nService();
console.log('🌐 Internationalization service initialized');

// Auto-add data-i18n attributes to static content
document.addEventListener('DOMContentLoaded', () => {
    // Add i18n keys to common elements that might not have them
    const autoTranslateMap = {
        '[class*="hero-title"]': 'hero_title',
        '[class*="hero-subtitle"]': 'hero_subtitle',
        '[class*="btn-primary"]:has([id*="getStarted"])': 'hero_cta',
        '[class*="section-title"]': 'features_title',
        '[class*="section-subtitle"]': 'features_subtitle'
    };

    // This would be expanded based on actual HTML structure
});
