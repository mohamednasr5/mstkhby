/**
 * ===================================
 * Mstkhby - Verification System
 * ===================================
 * 
 * Handles:
 * - Account verification for influencers
 * - Verification requests
 * - Badge management
 * - Verification tiers
 *
 * Data model (Realtime Database):
 *   verifications/{userId} -> application object
 *   users/{userId}/profile -> isVerified, verificationTier, badge fields
 */

class VerificationService {
    constructor() {
        this.database = window.MstkhbyFirebase?.database;
        this.auth = window.MstkhbyFirebase?.auth;
        
        // description = tooltip shown when hovering the small badge next to the
        // display name (window.UserBadges renders it). name = the short label
        // used on the tier/application cards.
        this.verificationTiers = {
            basic: {
                id: 'basic',
                name: 'متفاعل',
                icon: '✓',
                color: '#94a3b8',
                description: 'هذا المستخدم متفاعل دائم على مستخبي',
                requirements: [
                    'حساب نشط لمدة 30 يوم على الأقل',
                    '50 رسالة مستلمة على الأقل',
                    'صورة شخصية واضحة',
                    'معلومات مكتملة في الملف الشخصي'
                ],
                benefits: [
                    'شارة متفاعل رمادية',
                    'أولوية في البحث',
                    'دعم فني متقدم'
                ],
                reviewTime: '3-5 أيام عمل'
            },
            influencer: {
                id: 'influencer',
                name: 'مؤثر',
                icon: '✓',
                color: '#f59e0b',
                description: 'هذا المستخدم لديه الكثير من المتابعين على السوشيال ميديا',
                requirements: [
                    'حساب متفاعل موثق',
                    '1000+ متابعي على منصة اجتماعية واحدة',
                    'محتوى أصلي ومناسب',
                    'تفاعل حقيقي مع المتابعين'
                ],
                benefits: [
                    'شارة مؤثر ذهبية',
                    'رابط مخصص قصير (mstkh.by/اسمك)',
                    'Analytics API مجاني',
                    'Story Cards غير محدودة',
                    'حماية Spam متقدمة',
                    'مدير حساب خاص'
                ],
                reviewTime: '5-7 أيام عمل'
            },
            celebrity: {
                id: 'celebrity',
                name: 'مشهور',
                icon: '✓',
                color: '#0ea5e9',
                description: 'هذا المستخدم شخصية عامة',
                requirements: [
                    'مستوى مؤثر موثق مسبقاً',
                    '10000+ متابعي على منصتين أو أكثر',
                    'شهرة معترف بها إعلامياً',
                    'محتوى يؤثر إيجابياً في المجتمع'
                ],
                benefits: [
                    'شارة مشهور زرقاء',
                    'جميع مميزات المؤثر',
                    'إيرادات من الرسائل (Tips)',
                    'تخصيص كامل للملف الشخصي',
                    'دعم VIP على مدار الساعة',
                    'شراكات وتعاونات مع المنصة'
                ],
                reviewTime: '7-14 يوم عمل'
            }
        };
        
        this.verificationStatuses = {
            pending: { label: 'قيد المراجعة', color: '#f59e0b', icon: '⏳' },
            approved: { label: 'موثق', color: '#10b981', icon: '✅' },
            rejected: { label: 'مرفوض', color: '#ef4444', icon: '❌' },
            none: { label: 'غير موثق', color: '#64748b', icon: '○' }
        };

        this.init();
    }

    async init() {
        if (window.authService) {
            window.authService.subscribe(async (user) => {
                if (user) {
                    await this.loadVerificationStatus(user.uid);
                }
            });
        }

        document.getElementById('closeVerificationModal')?.addEventListener('click', () => {
            window.uiManager?.closeModal(document.getElementById('verificationModal'));
        });
    }

    /**
     * Entry point for the "اطلب التحقق الآن" buttons — opens the modal with
     * the application form for the requested tier. Requires login.
     */
    showApplicationForm(tierId) {
        if (!this.auth?.currentUser) {
            window.uiManager?.showToast('سجّل الدخول أولاً', 'يجب تسجيل الدخول لتقديم طلب التحقق', 'warning');
            window.uiManager?.openModal(window.uiManager?.elements?.authModal);
            return;
        }

        if (!this.canApplyForVerification()) {
            const msg = this.currentStatus === 'pending'
                ? 'لديك طلب تحقق قيد المراجعة بالفعل'
                : 'لا يمكنك التقديم الآن، حاول مرة أخرى لاحقاً';
            window.uiManager?.showToast('تعذر التقديم', msg, 'warning');
            return;
        }

        const body = document.getElementById('verificationModalBody');
        if (!body) return;
        body.innerHTML = this.createApplicationForm(tierId);
        window.uiManager?.openModal(document.getElementById('verificationModal'));
    }

    /**
     * Load user's verification status
     */
    async loadVerificationStatus(userId) {
        try {
            const snap = await this.database.ref(`verifications/${userId}`).once('value');
            
            if (snap.exists()) {
                const data = snap.val();
                this.currentStatus = data.status || 'none';
                this.currentTier = data.tier || null;
                this.verificationData = data;
                
                console.log('✅ Verification status loaded:', this.currentStatus);
            } else {
                this.currentStatus = 'none';
                this.currentTier = null;
                this.verificationData = null;
            }

            return this.getVerificationInfo();

        } catch (error) {
            console.error('❌ Error loading verification:', error);
            return null;
        }
    }

    /**
     * Get current verification info
     */
    getVerificationInfo() {
        return {
            status: this.currentStatus,
            tier: this.currentTier,
            statusInfo: this.verificationStatuses[this.currentStatus],
            tierInfo: this.currentTier ? this.verificationTiers[this.currentTier] : null,
            canApply: this.canApplyForVerification(),
            nextEligibleTier: this.getNextEligibleTier()
        };
    }

    /**
     * Check if user can apply for verification
     */
    canApplyForVerification() {
        if (this.currentStatus === 'pending') return false;

        // Can't re-apply if recently rejected (7 day cooldown)
        if (this.currentStatus === 'rejected' && this.verificationData) {
            const rejectedAt = this.verificationData.rejectedAt; // ms timestamp
            if (rejectedAt) {
                const daysSinceRejection = (Date.now() - rejectedAt) / (1000 * 60 * 60 * 24);
                if (daysSinceRejection < 7) return false;
            }
        }

        return true;
    }

    /**
     * Get next eligible verification tier
     */
    getNextEligibleTier() {
        if (!this.currentTier) return this.verificationTiers.basic;
        if (this.currentTier === 'basic') return this.verificationTiers.influencer;
        if (this.currentTier === 'influencer') return this.verificationTiers.celebrity;
        return null;
    }

    /**
     * Submit verification application
     */
    async submitApplication(tierId, applicationData) {
        try {
            const userId = this.auth.currentUser?.uid;
            if (!userId) throw new Error('يجب تسجيل الدخول أولاً');

            if (!this.canApplyForVerification()) {
                throw new Error('لا يمكنك التقديم الآن');
            }

            const tier = this.verificationTiers[tierId];
            if (!tier) throw new Error('مستوى تحقق غير صالح');

            const requiredFields = ['fullName', 'bio', 'socialLinks', 'reason'];
            for (const field of requiredFields) {
                if (!applicationData[field]) {
                    throw new Error(`الحقل ${field} مطلوب`);
                }
            }

            const timestamp = firebase.database.ServerValue.TIMESTAMP;

            const application = {
                userId,
                tier: tierId,
                status: 'pending',
                data: {
                    fullName: applicationData.fullName,
                    bio: applicationData.bio,
                    socialLinks: applicationData.socialLinks,
                    reason: applicationData.reason,
                    audienceType: applicationData.audienceType || null,
                    contentExamples: applicationData.contentExamples || [],
                    additionalNotes: applicationData.additionalNotes || ''
                },
                documents: {
                    idDocument: applicationData.idDocument || null,
                    profilePhoto: applicationData.profilePhoto || null,
                    socialProof: applicationData.socialProof || []
                },
                submittedAt: timestamp,
                reviewedBy: null,
                reviewedAt: null,
                rejectionReason: null,
                rejectionDetails: null
            };

            // Save application + flag on the user's profile in one multi-path update
            const updates = {};
            updates[`verifications/${userId}`] = application;
            updates[`users/${userId}/profile/verificationRequested`] = true;
            updates[`users/${userId}/profile/verificationRequestTier`] = tierId;
            updates[`users/${userId}/profile/verificationRequestDate`] = timestamp;

            await this.database.ref().update(updates);

            await this.notifyAdminsOfNewApplication(userId, tier);

            window.uiManager?.showToast(
                'تم التقديم!',
                `تم إرسال طلب التحقق "${tier.name}". ${tier.reviewTime}`,
                'success'
            );
            window.uiManager?.closeModal(document.getElementById('verificationModal'));

            await this.loadVerificationStatus(userId);
            return { success: true, application };

        } catch (error) {
            console.error('❌ Application error:', error);
            window.uiManager?.showToast('تعذر إرسال الطلب', error.message || 'حدث خطأ، حاول مرة أخرى', 'error');
            throw error;
        }
    }

    /**
     * Get verification applications (Admin)
     */
    async getApplications(filters = {}) {
        try {
            const status = filters.status || 'pending';

            const snap = await this.database.ref('verifications')
                .orderByChild('status')
                .equalTo(status)
                .once('value');

            const val = snap.val() || {};

            const applications = await Promise.all(
                Object.entries(val).map(async ([userId, appData]) => {
                    const userSnap = await this.database.ref(`users/${userId}/profile`).once('value');

                    return {
                        id: userId,
                        ...appData,
                        user: userSnap.exists() ? userSnap.val() : null
                    };
                })
            );

            return { success: true, applications };

        } catch (error) {
            console.error('❌ Error getting applications:', error);
            throw error;
        }
    }

    /**
     * Approve verification application (Admin)
     */
    async approveApplication(userId, adminNotes = '') {
        try {
            const appSnap = await this.database.ref(`verifications/${userId}`).once('value');
            
            if (!appSnap.exists()) throw new Error('طلب غير موجود');
            
            const appData = appSnap.val();
            const tier = this.verificationTiers[appData.tier];
            const adminId = this.auth.currentUser?.uid || null;
            const timestamp = firebase.database.ServerValue.TIMESTAMP;

            const profileSnap = await this.database.ref(`users/${userId}/profile`).once('value');
            const username = profileSnap.val()?.username;

            const updates = {};
            updates[`verifications/${userId}/status`] = 'approved';
            updates[`verifications/${userId}/reviewedBy`] = adminId;
            updates[`verifications/${userId}/reviewedAt`] = timestamp;
            updates[`verifications/${userId}/adminNotes`] = adminNotes;

            updates[`users/${userId}/entitlements/isVerified`] = true;
            updates[`users/${userId}/entitlements/verificationTier`] = appData.tier;
            updates[`users/${userId}/entitlements/verifiedAt`] = timestamp;
            updates[`users/${userId}/entitlements/badgeColor`] = tier.color;
            updates[`users/${userId}/entitlements/badgeIcon`] = tier.icon;
            updates[`users/${userId}/profile/customShortLink`] =
                appData.tier !== 'basic' && username ? `mstkh.by/${username}` : null;

            await this.database.ref().update(updates);

            await this.sendVerificationNotification(userId, 'approved', tier);

            return { success: true };

        } catch (error) {
            console.error('❌ Approval error:', error);
            throw error;
        }
    }

    /**
     * Reject verification application (Admin)
     */
    async rejectApplication(userId, reason, details = '') {
        try {
            const appSnap = await this.database.ref(`verifications/${userId}`).once('value');
            
            if (!appSnap.exists()) throw new Error('طلب غير موجود');

            const adminId = this.auth.currentUser?.uid || null;
            const timestamp = firebase.database.ServerValue.TIMESTAMP;

            const updates = {};
            updates[`verifications/${userId}/status`] = 'rejected';
            updates[`verifications/${userId}/reviewedBy`] = adminId;
            updates[`verifications/${userId}/reviewedAt`] = timestamp;
            updates[`verifications/${userId}/rejectionReason`] = reason;
            updates[`verifications/${userId}/rejectionDetails`] = details;
            updates[`verifications/${userId}/rejectedAt`] = Date.now();
            updates[`verifications/${userId}/canReapplyAfter`] = Date.now() + 7 * 24 * 60 * 60 * 1000;

            updates[`users/${userId}/profile/verificationRequested`] = false;
            updates[`users/${userId}/entitlements/isVerified`] = false;

            await this.database.ref().update(updates);

            await this.sendVerificationNotification(userId, 'rejected', null, reason);

            return { success: true };

        } catch (error) {
            console.error('❌ Rejection error:', error);
            throw error;
        }
    }

    /**
     * Render verification badge
     */
    renderBadge(userId, size = 'medium') {
        const sizes = {
            small: { width: 16, height: 16, fontSize: 10 },
            medium: { width: 20, height: 20, fontSize: 12 },
            large: { width: 28, height: 28, fontSize: 16 }
        };

        const s = sizes[size] || sizes.medium;

        return `
            <span class="verification-badge" style="
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: ${s.width}px;
                height: ${s.height}px;
                border-radius: 50%;
                font-size: ${s.fontSize}px;
                margin-right: 4px;
            ">${this.verificationTiers[userId]?.tier?.icon || ''}</span>
        `;
    }

    /**
     * Create verification application form HTML
     */
    createApplicationForm(tierId) {
        const tier = this.verificationTiers[tierId];
        if (!tier) return '';

        return `
            <div class="verification-form" id="verificationForm">
                <div class="form-header">
                    <h3>📋 طلب تحقق: ${tier.name}</h3>
                    <p>${tier.icon} ${tier.reviewTime} للمراجعة</p>
                </div>

                <div class="requirements-list">
                    <h4>المتطلبات:</h4>
                    <ul>
                        ${tier.requirements.map(req => `<li>✓ ${req}</li>`).join('')}
                    </ul>
                </div>

                <form onsubmit="window.verificationService.handleFormSubmit(event, '${tierId}')">
                    <div class="form-group">
                        <label>الاسم الكامل *</label>
                        <input type="text" name="fullName" placeholder="كما يظهر في الهوية" required>
                    </div>

                    <div class="form-group">
                        <label>نبذة عنك *</label>
                        <textarea name="bio" rows="3" placeholder="اخبرنا عن نفسك ومجالك..." required></textarea>
                    </div>

                    <div class="form-group">
                        <label>روابط حسابات التواصل الاجتماعي *</label>
                        <div class="social-links-input" id="socialLinksInput">
                            <div class="social-link-item">
                                <select name="platform[]">
                                    <option value="instagram">Instagram</option>
                                    <option value="tiktok">TikTok</option>
                                    <option value="twitter">Twitter/X</option>
                                    <option value="youtube">YouTube</option>
                                    <option value="snapchat">Snapchat</option>
                                    <option value="other">أخرى</option>
                                </select>
                                <input type="url" name="url[]" placeholder="رابط الحساب">
                                <input type="number" name="followers[]" placeholder="عدد المتابعين">
                            </div>
                        </div>
                        <button type="button" class="btn btn-ghost btn-sm" onclick="window.verificationService.addSocialLink()">
                            + إضافة حساب آخر
                        </button>
                    </div>

                    <div class="form-group">
                        <label>لماذا يجب أن تتحقق؟ *</label>
                        <textarea name="reason" rows="3" placeholder="اشرح لنا سبب رغبتك في الحصول على شارة التحقق..." required></textarea>
                    </div>

                    <div class="form-group">
                        <label>نوع جمهورك</label>
                        <select name="audienceType">
                            <option value="">اختر...</option>
                            <option value="entertainment">ترفيه</option>
                            <option value="education">تعليم</option>
                            <option value="business">أعمال</option>
                            <option value="lifestyle">نمط حياة</option>
                            <option value="technology">تكنولوجيا</option>
                            <option value="sports">رياضة</option>
                            <option value="art">فن</option>
                            <option value="other">أخرى</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>أمثلة على محتواك (اختياري)</label>
                        <textarea name="contentExamples" rows="2" placeholder="روابط لأمثلة على محتواك..."></textarea>
                    </div>

                    <div class="form-group">
                        <label>ملاحظات إضافية (اختياري)</label>
                        <textarea name="additionalNotes" rows="2" placeholder="أي معلومات إضافية تريد مشاركتها..."></textarea>
                    </div>

                    <div class="terms-agreement">
                        <p>بتقديم هذا الطلب، أنت توافق على:</p>
                        <ul>
                            <li>أن جميع المعلومات المقدمة صحيحة ودقيقة</li>
                            <li>أنك تلتزم بشروط الاستخدام وسياسة المجتمع</li>
                            <li>أن المنصة لها حق سحب الشارة في حال مخالفة القواعد</li>
                        </ul>
                    </div>

                    <button type="submit" class="btn btn-primary btn-block">
                        إرسال طلب التحقق 📤
                    </button>
                </form>
            </div>
        `;
    }

    /**
     * Handle form submission
     */
    handleFormSubmit(event, tierId) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);

        const socialLinks = [];
        const platformInputs = form.querySelectorAll('[name="platform[]"]');
        platformInputs.forEach((input, index) => {
            socialLinks.push({
                platform: input.value,
                url: form.querySelectorAll('[name="url[]"]')[index]?.value,
                followers: parseInt(form.querySelectorAll('[name="followers[]"]')[index]?.value) || 0
            });
        });

        const applicationData = {
            fullName: formData.get('fullName'),
            bio: formData.get('bio'),
            socialLinks,
            reason: formData.get('reason'),
            audienceType: formData.get('audienceType'),
            contentExamples: formData.get('contentExamples')?.split('\n').filter(url => url.trim()),
            additionalNotes: formData.get('additionalNotes')
        };

        this.submitApplication(tierId, applicationData);
    }

    /**
     * Add social link field dynamically
     */
    addSocialLink() {
        const container = document.getElementById('socialLinksInput');
        if (!container) return;

        const newItem = document.createElement('div');
        newItem.className = 'social-link-item';
        newItem.innerHTML = `
            <select name="platform[]">
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="twitter">Twitter/X</option>
                <option value="youtube">YouTube</option>
                <option value="snapchat">Snapchat</option>
                <option value="other">أخرى</option>
            </select>
            <input type="url" name="url[]" placeholder="رابط الحساب">
            <input type="number" name="followers[]" placeholder="عدد المتابعين">
            <button type="button" onclick="this.parentElement.remove()">×</button>
        `;
        
        container.appendChild(newItem);
    }

    // ==================== NOTIFICATION METHODS ====================

    async notifyAdminsOfNewApplication(userId, tier) {
        console.log(`🔔 New verification application from ${userId} for ${tier.name}`);
    }

    async sendVerificationNotification(userId, status, tier, reason = '') {
        const messages = {
            approved: `🎉 مبروك! تم قبول طلب التحقق "${tier.name}". شارة التحقق ظهرت الآن على ملفك الشخصي!`,
            rejected: `😔 نأسف، تم رفض طلب التحقيق الخاص بك. السبب: ${reason}. يمكنك التقديم مرة أخرى بعد 7 أيام.`
        };

        console.log(`📧 Notification sent to ${userId}:`, messages[status]);
    }
}

// Initialize and export
window.verificationService = new VerificationService();
console.log('✅ Verification service initialized');
