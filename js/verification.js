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
 */

class VerificationService {
    constructor() {
        this.db = window.MstkhbyFirebase?.db;
        this.auth = window.MstkhbyFirebase?.auth;
        
        this.verificationTiers = {
            basic: {
                id: 'basic',
                name: 'موثق أساسي',
                icon: '✓',
                color: '#0ea5e9',
                requirements: [
                    'حساب نشط لمدة 30 يوم على الأقل',
                    '50 رسالة مستلمة على الأقل',
                    'صورة شخصية واضحة',
                    'معلومات مكتملة في الملف الشخصي'
                ],
                benefits: [
                    'شارة موثق ✓ زرقاء',
                    'أولوية في البحث',
                    'دعم فني متقدم'
                ],
                reviewTime: '3-5 أيام عمل'
            },
            influencer: {
                id: 'influencer',
                name: 'مؤثر موثق',
                icon: '⭐',
                color: '#8b5cf6',
                requirements: [
                    'حساب أساسي موثق',
                    '1000+ متابعي على منصة اجتماعية واحدة',
                    'محتوى أصلي ومناسب',
                    'تفاعل حقيقي مع المتابعين'
                ],
                benefits: [
                    'شارة مؤثر ⭐ بنفسجية',
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
                name: 'مشهور موثق',
                icon: '👑',
                color: '#f59e0b',
                requirements: [
                    'مستوى مؤثر موثق',
                    '10000+ متابعي على منصتين أو أكثر',
                    'شهرة معترف بها إعلامياً',
                    'محتوى يؤثر إيجابياً في المجتمع'
                ],
                benefits: [
                    'شارة مشهور 👑 ذهبية',
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
        // Listen for auth changes
        if (window.authService) {
            window.authService.subscribe(async (user) => {
                if (user) {
                    await this.loadVerificationStatus(user.uid);
                }
            });
        }
    }

    /**
     * Load user's verification status
     */
    async loadVerificationStatus(userId) {
        try {
            const doc = await this.db.collection('verifications').doc(userId).get();
            
            if (doc.exists) {
                const data = doc.data();
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
        // Can't apply if already has a pending request
        if (this.currentStatus === 'pending') return false;

        // Can't re-apply if recently rejected (7 day cooldown)
        if (this.currentStatus === 'rejected' && this.verificationData) {
            const rejectedAt = this.verificationData.rejectedAt?.toDate();
            if (rejectedAt) {
                const daysSinceRejection = (Date.now() - rejectedAt.getTime()) / (1000 * 60 * 60 * 24);
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
        return null; // Already at highest tier
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

            // Validate required fields
            const requiredFields = ['fullName', 'bio', 'socialLinks', 'reason'];
            for (const field of requiredFields) {
                if (!applicationData[field]) {
                    throw new Error(`الحقل ${field} مطلوب`);
                }
            }

            // Create verification document
            const application = {
                userId,
                tier: tierId,
                status: 'pending',
                data: {
                    fullName: applicationData.fullName,
                    bio: applicationData.bio,
                    socialLinks: applicationData.socialLinks, // Array of {platform, url, followers}
                    reason: applicationData.reason, // Why should they be verified?
                    audienceType: applicationData.audienceType, // e.g., 'entertainment', 'education', 'business'
                    contentExamples: applicationData.contentExamples || [], // URLs to content samples
                    additionalNotes: applicationData.additionalNotes || ''
                },
                documents: {
                    idDocument: applicationData.idDocument || null, // For identity verification
                    profilePhoto: applicationData.profilePhoto || null,
                    socialProof: applicationData.socialProof || [] // Screenshots of social accounts
                },
                submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                reviewedBy: null,
                reviewedAt: null,
                rejectionReason: null,
                rejectionDetails: null
            };

            // Save to Firestore
            await this.db.collection('verifications').doc(userId).set(application);

            // Update user document with verification request info
            await this.db.collection('users').doc(userId).update({
                verificationRequested: true,
                verificationRequestTier: tierId,
                verificationRequestDate: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Send notification to admins
            await this.notifyAdminsOfNewApplication(userId, tier);

            window.uiManager?.showToast(
                'تم التقديم!',
                `تم إرسال طلب التحقق "${tier.name}". ${tier.reviewTime}`,
                'success'
            );

            await this.loadVerificationStatus(userId);
            return { success: true, application };

        } catch (error) {
            console.error('❌ Application error:', error);
            throw error;
        }
    }

    /**
     * Get verification applications (Admin)
     */
    async getApplications(filters = {}) {
        try {
            let query = this.db.collection('verifications')
                .where('status', '==', filters.status || 'pending');

            const snapshot = await query.get();

            const applications = await Promise.all(snapshot.docs.map(async (doc) => {
                const appData = doc.data();
                const userData = await this.db.collection('users').doc(doc.id).get();

                return {
                    id: doc.id,
                    ...appData,
                    submittedAt: appData.submittedAt?.toDate(),
                    user: userData.exists ? userData.data() : null
                };
            }));

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
            const appDoc = await this.db.collection('verifications').doc(userId).get();
            
            if (!appDoc.exists) throw new Error('طلب غير موجود');
            
            const appData = appDoc.data();
            const tier = this.verificationTiers[appData.tier];

            // Update verification document
            await appDoc.ref.update({
                status: 'approved',
                reviewedBy: 'admin_current_user_id', // Would get from auth
                reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                adminNotes
            });

            // Update user with verified badge
            await this.db.collection('users').doc(userId).update({
                isVerified: true,
                verificationTier: appData.tier,
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                badgeColor: tier.color,
                badgeIcon: tier.icon,
                customShortLink: appData.tier !== 'basic' 
                    ? `mstkh.by/${(await this.db.collection('users').doc(userId).get()).data()?.username}` 
                    : null
            });

            // Send notification to user
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
            const appDoc = await this.db.collection('verifications').doc(userId).get();
            
            if (!appDoc.exists) throw new Error('طلب غير موجود');

            const appData = appDoc.data();

            // Update verification document
            await appDoc.ref.update({
                status: 'rejected',
                reviewedBy: 'admin_current_user_id',
                reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectionReason: reason,
                rejectionDetails: details,
                canReapplyAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });

            // Reset user verification flags
            await this.db.collection('users').doc(userId).update({
                verificationRequested: false,
                isVerified: false
            });

            // Send notification to user
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

        // Collect social links
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
        // Would send email/push notification to admin team
        console.log(`🔔 New verification application from ${userId} for ${tier.name}`);
    }

    async sendVerificationNotification(userId, status, tier, reason = '') {
        // Would send notification to user
        const messages = {
            approved: `🎉 مبروك! تم قبول طلب التحقق "${tier.name}". شارة التحقق ظهرت الآن على ملفك الشخصي!`,
            rejected: `😔 نأسف، تم رفض طلب التحقيق الخاص بك. السبب: ${reason}. يمكنك التقديم مرة أخرى بعد 7 أيام.`
        };

        // Send push notification or email
        console.log(`📧 Notification sent to ${userId}:`, messages[status]);
    }
}

// Initialize and export
window.verificationService = new VerificationService();
console.log('✅ Verification service initialized');
