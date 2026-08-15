/**
 * ===================================
 * Mstkhby - Stripe Payment System
 * ===================================
 * 
 * Handles:
 * - Subscription management
 * - Payment processing
 * - Plan upgrades/downgrades
 * - Invoices
 * - Webhooks
 */

class StripeService {
    constructor() {
        this.database = window.MstkhbyFirebase?.database;
        this.auth = window.MstkhbyFirebase?.auth;
        
        // Stripe Configuration (would be set from environment)
        this.config = {
            publishableKey: 'pk_test_your_stripe_key', // Test key
            prices: {
                monthly: 'price_monthly_premium_id',
                yearly: 'price_yearly_premium_id',
                creator: 'price_creator_pro_id'
            },
            plans: {
                free: {
                    id: 'free',
                    name: 'مجاني',
                    price: 0,
                    currency: 'SAR',
                    interval: null,
                    features: [
                        'رابط شخصي واحد',
                        'رسائل نصية غير محدودة',
                        'صور (5/يوم)',
                        'وضع مجهول',
                        'حذف وحظر'
                    ],
                    limits: {
                        messagesPerDay: Infinity,
                        imagesPerDay: 5,
                        videoDuration: 0,
                        customLinks: 1,
                        analytics: false,
                        verifiedBadge: false,
                        prioritySupport: false
                    }
                },
                premium: {
                    id: 'premium',
                    name: 'بريميوم',
                    price: 29,
                    currency: 'SAR',
                    interval: 'month',
                    features: [
                        'كل مميزات المجاني',
                        'فيديو حتى 30 ثانية',
                        'روابط متعددة (5)',
                        'تحليلات متقدمة',
                        'رسائل مؤقتة متقدمة',
                        'Themes مخصصة',
                        'بدون إعلانات',
                        'دعم أولوية'
                    ],
                    limits: {
                        messagesPerDay: Infinity,
                        imagesPerDay: 50,
                        videoDuration: 30,
                        customLinks: 5,
                        analytics: true,
                        verifiedBadge: false,
                        prioritySupport: true
                    }
                },
                creator: {
                    id: 'creator',
                    name: 'منشئ محتوى',
                    price: 79,
                    currency: 'SAR',
                    interval: 'month',
                    features: [
                        'كل مميزات البريميوم',
                        'شارة موثق ✓',
                        'Inbox غير محدود',
                        'AI moderation متقدم',
                        'Story Cards',
                        'Analytics API',
                        'حماية Spam قوية',
                        'مدير حساب خاص'
                    ],
                    limits: {
                        messagesPerDay: Infinity,
                        imagesPerDay: Infinity,
                        videoDuration: 120,
                        customLinks: 20,
                        analytics: true,
                        verifiedBadge: true,
                        prioritySupport: true,
                        apiAccess: true
                    }
                }
            }
        };
            
            this.currentPlan = null;
            this.subscription = null;
            this.init();
        }

    async init() {
        if (this.auth?.currentUser) {
            await this.loadSubscriptionStatus();
        }

        // Listen for auth changes
        if (window.authService) {
            window.authService.subscribe(async (user) => {
                if (user) {
                    await this.loadSubscriptionStatus();
                } else {
                    this.currentPlan = this.plans.free;
                    this.subscription = null;
                }
            });
        }
    }

    /**
     * Load current subscription status
     */
    async loadSubscriptionStatus() {
        try {
            const userId = this.auth.currentUser?.uid;
            if (!userId) return;

            const [profileSnap, entitlementsSnap] = await Promise.all([
                this.database.ref(`users/${userId}/profile`).once('value'),
                this.database.ref(`users/${userId}/entitlements`).once('value')
            ]);
            const userData = { ...(profileSnap.val() || {}), ...(entitlementsSnap.val() || {}) };

            this.currentPlan = this.plans[userData.plan] || this.plans.free;

            if (userData.subscriptionId) {
                // Fetch subscription details from server
                // const sub = await fetch(`/api/payments/subscription/${userData.subscriptionId}`);
                // this.subscription = await sub.json();
                
                this.subscription = {
                    id: userData.subscriptionId,
                    status: userData.subscriptionStatus || 'active',
                    currentPeriodEnd: userData.subscriptionEndDate ? new Date(userData.subscriptionEndDate) : null,
                    plan: userData.plan,
                    cancelAtPeriodEnd: userData.cancelAtPeriodEnd || false
                };
            }

            console.log('✅ Subscription loaded:', this.currentPlan.name);
            return this.currentPlan;

        } catch (error) {
            console.error('❌ Error loading subscription:', error);
            this.currentPlan = this.plans.free;
            return this.currentPlan;
        }
    }

    /**
     * Initialize Stripe.js
     */
    async initStripe() {
        if (!window.Stripe && this.config.publishableKey !== 'pk_test_your_stripe_key') {
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = () => {
                this.stripe = window.Stripe(this.config.publishableKey);
            };
            document.head.appendChild(script);
        } else if (window.Stripe) {
            this.stripe = window.Stripe(this.config.publishableKey);
        }
        
        return this.stripe;
    }

    /**
     * Create checkout session for subscription
     */
    async createCheckoutSession(planId, interval = 'month') {
        try {
            const userId = this.auth.currentUser?.uid;
            if (!userId) throw new Error('يجب تسجيل الدخول أولاً');

            const plan = this.plans[planId];
            if (!plan || plan.price === 0) throw new Error('خطة غير صالحة');

            // Create checkout session on server
            const response = await fetch('/api/payments/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    planId,
                    interval,
                    successUrl: `${window.location.origin}/#settings?payment=success`,
                    cancelUrl: `${window.location.origin}/#pricing?payment=canceled`
                })
            });

            const { sessionId, error } = await response.json();

            if (error) throw new Error(error);

            // Redirect to Stripe Checkout
            const stripe = await this.initStripe();
            await stripe.redirectToCheckout({ sessionId });

            return { success: true };

        } catch (error) {
            console.error('❌ Checkout error:', error);
            throw error;
        }
    }

    /**
     * Create portal session for managing subscription
     */
    async createPortalSession() {
        try {
            const userId = this.auth.currentUser?.uid;
            if (!userId) throw new Error('يجب تسجيل الدخول أولاً');

            const response = await fetch('/api/payments/create-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const { url, error } = await response.json();

            if (error) throw new Error(error);

            // Redirect to Stripe Customer Portal
            window.location.href = url;

            return { success: true };

        } catch (error) {
            console.error('❌ Portal error:', error);
            throw error;
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription() {
        try {
            const confirmed = await window.uiManager?.showConfirm(
                'إلغاء الاشتراك',
                'هل أنت متأكد من إلغاء اشتراكك؟ ستفقد الميزات المدفوعة في نهاية الفترة الحالية.'
            );

            if (!confirmed) return;

            const response = await fetch('/api/payments/cancel-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subscriptionId: this.subscription.id 
                })
            });

            const { success, error } = await response.json();

            if (error) throw new Error(error);

            window.uiManager?.showToast(
                'تم الإلغاء',
                'سيتم إلغاء اشتراكك في نهاية الفترة الحالية',
                'success'
            );

            await this.loadSubscriptionStatus();
            return { success: true };

        } catch (error) {
            console.error('❌ Cancellation error:', error);
            throw error;
        }
    }

    /**
     * Resume cancelled subscription
     */
    async resumeSubscription() {
        try {
            const response = await fetch('/api/payments/resume-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    subscriptionId: this.subscription.id 
                })
            });

            const { success, error } = await response.json();

            if (error) throw new Error(error);

            window.uiManager?.showToast(
                'تم التجديد',
                'تم تجديد اشتراكك بنجاح!',
                'success'
            );

            await this.loadSubscriptionStatus();
            return { success: true };

        } catch (error) {
            console.error('❌ Resume error:', error);
            throw error;
        }
    }

    /**
     * Change subscription plan
     */
    async changePlan(newPlanId) {
        try {
            const currentPlanId = this.currentPlan.id;

            if (currentPlanId === newPlanId) {
                throw new Error('أنت مشترك بالفعل في هذه الخطة');
            }

            const response = await fetch('/api/payments/change-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscriptionId: this.subscription.id,
                    newPlanId,
                    currentPlanId
                })
            });

            const { success, error, prorationAmount } = await response.json();

            if (error) throw new Error(error);

            if (prorationAmount > 0) {
                const confirmPayment = await window.uiManager?.showConfirm(
                    'تغيير الخطة',
                    `سيتم خصم ${this.formatPrice(prorationAmount)} للفرق في الأسعار. هل تريد المتابعة؟`
                );
                
                if (!confirmPayment) return;
            }

            window.uiManager?.showToast(
                'تم التغيير',
                'تم تغيير خطتك بنجاح!',
                'success'
            );

            await this.loadSubscriptionStatus();
            return { success: true };

        } catch (error) {
            console.error('❌ Plan change error:', error);
            throw error;
        }
    }

    /**
     * Check if feature is available
     */
    canUseFeature(feature) {
        if (!this.currentPlan) return false;
        const limits = this.currentPlan.limits;
        
        switch (feature) {
            case 'video':
                return limits.videoDuration > 0;
            case 'analytics':
                return limits.analytics;
            case 'customLinks':
                return limits.customLinks > 1;
            case 'verifiedBadge':
                return limits.verifiedBadge;
            case 'prioritySupport':
                return limits.prioritySupport;
            case 'apiAccess':
                return limits.apiAccess;
            default:
                return true;
        }
    }

    /**
     * Get usage stats for current period
     */
    async getUsageStats() {
        try {
            const userId = this.auth.currentUser?.uid;
            if (!userId) return null;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

            // Count today's usage via the sender index
            const indexSnap = await this.database.ref(`messagesBySender/${userId}`).once('value');
            const messageIds = Object.keys(indexSnap.val() || {});

            const todaysMessages = (await Promise.all(
                messageIds.map(async (id) => {
                    const snap = await this.database.ref(`messages/${id}`).once('value');
                    return snap.exists() ? snap.val() : null;
                })
            )).filter(m => m && (m.createdAt || 0) >= startOfDay);

            const imagesSent = todaysMessages.filter(m => m.messageType === 'image').length;

            return {
                messagesToday: todaysMessages.length,
                imagesToday: imagesSent,
                limit: {
                    messages: this.currentPlan.limits.messagesPerDay,
                    images: this.currentPlan.limits.imagesPerDay
                }
            };

        } catch (error) {
            console.error('Error getting usage:', error);
            return null;
        }
    }

    /**
     * Get invoice history
     */
    async getInvoiceHistory() {
        try {
            const response = await fetch(`/api/payments/invoices?userId=${this.auth.currentUser.uid}`);
            const { invoices, error } = await response.json();

            if (error) throw new Error(error);

            return invoices.map(invoice => ({
                id: invoice.id,
                amount: invoice.amount_paid / 100, // Convert from cents
                currency: invoice.currency.toUpperCase(),
                date: new Date(invoice.created * 1000),
                status: invoice.status,
                pdfUrl: invoice.invoice_pdf,
                number: invoice.number
            }));

        } catch (error) {
            console.error('Error getting invoices:', error);
            return [];
        }
    }

    /**
     * Apply promo/discount code
     */
    async applyPromoCode(code) {
        try {
            const response = await fetch('/api/payments/apply-promo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const { valid, discount, error } = await response.json();

            if (error) throw new Error(error);

            if (valid) {
                window.uiManager?.showToast(
                    'كود صالح!',
                    `خصم ${discount.percentOff || discount.amountOff}%`,
                    'success'
                );
            }

            return { valid, discount };

        } catch (error) {
            window.uiManager?.showToast('كود غير صالح', error.message, 'error');
            return { valid: false };
        }
    }

    // ==================== UTILITY METHODS ====================

    formatPrice(amount, currency = 'SAR') {
        return new Intl.NumberFormat('ar-SA', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0
        }).format(amount);
    }

    getPlanComparison() {
        return Object.values(this.plans).map(plan => ({
            ...plan,
            monthlyPrice: plan.interval === 'year' ? Math.floor(plan.price / 12) : plan.price,
            yearlyPrice: plan.interval === 'year' ? plan.price : plan.price * 12,
            yearlySavings: plan.interval === 'year' ? 17 : 0 // ~17% savings for yearly
        }));
    }

    getUpgradePath(currentPlanId, targetPlanId) {
        const currentPlan = this.plans[currentPlanId];
        const targetPlan = this.plans[targetPlanId];
        
        if (!currentPlan || !targetPlan) return null;
        
        const currentMonthlyValue = currentPlan.interval === 'year' 
            ? currentPlan.price / 12 
            : currentPlan.price;
        const targetMonthlyValue = targetPlan.interval === 'year' 
            ? targetPlan.price / 12 
            : targetPlan.price;

        return {
            currentPlan: currentPlan.name,
            targetPlan: targetPlan.name,
            priceDifference: targetMonthlyValue - currentMonthlyValue,
            upgradeFeatures: targetPlan.features.filter(f => !currentPlan.features.includes(f))
        };
    }
}

// Initialize and export
window.stripeService = new StripeService();
console.log('💳 Stripe service initialized');
