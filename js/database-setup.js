/**
 * ===================================
 * Mstkhby - Database Setup Script
 * ===================================
 * 
 * Run this script once to initialize the database structure
 * for the payment and subscription system.
 * 
 * Usage: Open browser console on payment.html and run:
 * setupDatabase()
 */

async function setupDatabase() {
    const db = MstkhbyFirebase.database;
    
    console.log('🔧 Setting up Mstkhby Database Structure...');
    
    try {
        // 1. Main structure
        const mainStructure = {
            // Users collection
            users: {
                // Template for new user
                _template: {
                    profile: {
                        uid: '',
                        email: '',
                        displayName: '',
                        username: '',
                        photoURL: '',
                        phone: '',
                        createdAt: null,
                        updatedAt: null,
                        
                        // Subscription info
                        plan: 'free',
                        planName: 'مجاني',
                        subscriptionStatus: 'inactive'
                    },
                    
                    // Subscriptions
                    subscriptions: {
                        current: null, // Active subscription object
                        history: {} // Past subscriptions
                    },
                    
                    // Payment history
                    payments: {
                        history: {}
                    },
                    
                    // Settings
                    settings: {
                        notifications: true,
                        privacyLevel: 'anonymous',
                        language: 'ar',
                        theme: 'dark'
                    }
                }
            },
            
            // Payments collection (all payments)
            payments: {
                _readme: 'All payment records are stored here with auto-generated IDs'
            },
            
            // Promo codes
            promoCodes: {
                'WELCOME10': {
                    discount: 10,
                    type: 'percent', // or 'fixed'
                    maxUses: 100,
                    usedCount: 0,
                    planType: null, // null = all plans, or 'premium', 'creator'
                    expiresAt: null, // null = no expiry, or ISO date
                    createdBy: 'admin',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    active: true
                },
                'PREMIUM20': {
                    discount: 20,
                    type: 'fixed',
                    maxUses: 50,
                    usedCount: 0,
                    planType: 'premium',
                    expiresAt: null,
                    createdBy: 'admin',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    active: true
                },
                'LAUNCH50': {
                    discount: 50,
                    type: 'percent',
                    maxUses: 20,
                    usedCount: 0,
                    planType: null,
                    expiresAt: '2024-12-31T23:59:59Z',
                    createdBy: 'admin',
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    active: true
                }
            },
            
            // Subscription plans configuration
            subscriptionPlans: {
                free: {
                    id: 'free',
                    name: 'مجاني',
                    nameEn: 'Free',
                    price: 0,
                    currency: 'SAR',
                    period: 'month',
                    features: [
                        'رابط شخصي واحد',
                        'رسائل نصية غير محدودة',
                        'صور (حد أقصى 5/يوم)',
                        'وضع مجهول',
                        'حذف وحظر'
                    ],
                    limits: {
                        messagesPerDay: 50,
                        imagesPerDay: 5,
                        storageMB: 100,
                        videoEnabled: false,
                        analyticsEnabled: false,
                        apiAccess: false
                    }
                },
                premium: {
                    id: 'premium',
                    name: 'بريميوم',
                    nameEn: 'Premium',
                    price: 29,
                    currency: 'SAR',
                    annualPrice: 278, // 20% discount
                    period: 'month',
                    features: [
                        'كل مميزات المجاني',
                        'فيديو حتى 30 ثانية',
                        'روابط متعددة',
                        'تحليلات متقدمة',
                        'رسائل مؤقتة',
                        'themes مخصصة',
                        'بدون إعلانات',
                        'دعم أولوية'
                    ],
                    limits: {
                        messagesPerDay: 500,
                        imagesPerDay: 50,
                        storageMB: 2048,
                        videoMaxSeconds: 30,
                        analyticsEnabled: true,
                        apiAccess: false
                    }
                },
                creator: {
                    id: 'creator',
                    name: 'منشئ محتوى',
                    nameEn: 'Creator Pro',
                    price: 79,
                    currency: 'SAR',
                    annualPrice: 758, // 20% discount
                    period: 'month',
                    features: [
                        'كل مميزات البريميوم',
                        'شارة موثق ✓',
                        'inbox غير محدود',
                        'AI moderation متقدم',
                        'Story Cards',
                        'Analytics API',
                        'حماية Spam قوية',
                        'مدير حساب خاص'
                    ],
                    limits: {
                        messagesPerDay: -1, // unlimited
                        imagesPerDay: -1,
                        storageMB: 20480,
                        videoMaxSeconds: 60,
                        analyticsEnabled: true,
                        apiAccess: true,
                        webhookAccess: true
                    }
                }
            },
            
            // System settings
            settings: {
                payments: {
                    enabled: true,
                    currencies: ['SAR'],
                    methods: ['stc_pay', 'apple_pay', 'bank_transfer', 'card'],
                    bankDetails: {
                        bankName: 'البنك الأهلي',
                        accountName: 'شركة تقنية المستقبل',
                        iban: 'SA0380000000608010167519',
                        accountNumber: '60810167519'
                    },
                    taxRate: 0, // 0 = no tax (15% if needed)
                    refundPolicyDays: 7
                },
                maintenance: {
                    mode: false, // Set to true for maintenance
                    message: 'نحن نقوم بتحديث النظام. نعود قريباً!'
                }
            },
            
            // Reports & Analytics
            reports: {},
            analytics: {
                daily: {},
                monthly: {},
                yearly: {}
            }
        };
        
        // Write main structure
        await db.ref('/').set(mainStructure);
        
        console.log('✅ Main database structure created');
        
        // 2. Create indexes metadata (for reference)
        const indexes = {
            payments: ['userId', 'status', 'createdAt'],
            users: ['email', 'username', 'profile.plan'],
            promoCodes: ['code', 'active']
        };
        
        await db.ref('_indexes').set(indexes);
        console.log('✅ Indexes metadata created');
        
        console.log('\n🎉 Database setup completed successfully!');
        console.log('\n📋 Created collections:');
        console.log('   - users/{uid}/profile');
        console.log('   - users/{uid}/subscriptions');
        console.log('   - users/{uid}/payments');
        console.log('   - payments');
        console.log('   - promoCodes');
        console.log('   - subscriptionPlans');
        console.log('   - settings');
        console.log('   - reports');
        console.log('   - analytics');
        
        return true;
        
    } catch (error) {
        console.error('❌ Error setting up database:', error);
        return false;
    }
}

/**
 * Add a new user template when they sign up
 */
async function createUserRecord(uid, userData) {
    const db = MstkhbyFirebase.database;
    
    const userTemplate = {
        profile: {
            uid: uid,
            email: userData.email || '',
            displayName: userData.displayName || '',
            username: userData.username || '',
            photoURL: userData.photoURL || '',
            phone: userData.phone || '',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            plan: 'free',
            planName: 'مجاني',
            subscriptionStatus: 'inactive'
        },
        subscriptions: {
            current: null,
            history: {}
        },
        payments: {
            history: {}
        },
        settings: {
            notifications: true,
            privacyLevel: 'anonymous',
            language: 'ar',
            theme: 'dark'
        }
    };
    
    await db.ref(`users/${uid}`).set(userTemplate);
    
    console.log(`✅ User record created for ${uid}`);
    return userTemplate;
}

/**
 * Get user's current subscription
 */
async function getUserSubscription(uid) {
    const snapshot = await MstkhbyFirebase.database
        .ref(`users/${uid}/subscriptions/current`)
        .once('value');
    
    return snapshot.val();
}

/**
 * Check if user has active subscription
 */
async function checkSubscriptionStatus(uid) {
    const subscription = await getUserSubscription(uid);
    
    if (!subscription) {
        return { active: false, plan: 'free' };
    }
    
    const now = new Date();
    const endDate = new Date(subscription.endDate);
    
    if (now > endDate || subscription.status !== 'active') {
        // Subscription expired, update status
        await MstkhbyFirebase.database
            .ref(`users/${uid}/subscriptions/current/status`)
            .set('expired');
        
        await MstkhbyFirebase.database
            .ref(`users/${uid}/profile/subscriptionStatus`)
            .set('expired');
        
        return { active: false, plan: 'free', reason: 'expired' };
    }
    
    return { 
        active: true, 
        plan: subscription.planId,
        planName: subscription.planName,
        endDate: subscription.endDate,
        features: subscription.features
    };
}

/**
 * Validate promo code
 */
async function validatePromoCode(code, planId) {
    const snapshot = await MstkhbyFirebase.database
        .ref(`promoCodes/${code}`)
        .once('value');
    
    const promo = snapshot.val();
    
    if (!promo) {
        return { valid: false, error: 'كود الخصم غير موجود' };
    }
    
    if (!promo.active) {
        return { valid: false, error: 'هذا الكود غير نشط' };
    }
    
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        return { valid: false, error: 'انتهت صلاحية هذا الكود' };
    }
    
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
        return { valid: false, error: 'تم استخدام هذا الكود الحد الأقصى من المرات' };
    }
    
    if (promo.planType && promo.planType !== planId) {
        return { valid: false, error: `هذا الكود لخطة ${promo.planType} فقط` };
    }
    
    return { valid: true, promo };
}

/**
 * Increment promo code usage
 */
async function usePromoCode(code) {
    const ref = MstkhbyFirebase.database.ref(`promoCodes/${code}/usedCount`);
    const snapshot = await ref.once('value');
    const currentCount = snapshot.val() || 0;
    
    await ref.set(currentCount + 1);
}

// Export functions
window.DatabaseSetup = {
    setupDatabase,
    createUserRecord,
    getUserSubscription,
    checkSubscriptionStatus,
    validatePromoCode,
    usePromoCode
};

console.log('📦 Database setup module loaded. Run setupDatabase() to initialize.');
