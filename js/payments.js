/**
 * ===================================
 * Mstkhby - Payment System
 * ===================================
 * Custom payment processing with Firebase Realtime Database
 * No Stripe dependency - direct payment handling
 */

// Payment Configuration
const PaymentConfig = {
    plans: {
        free: {
            id: 'free',
            name: 'مجاني',
            price: 0,
            currency: 'SAR',
            period: 'month',
            features: [
                '50 رسالة يومياً',
                'رسائل نصية وصور',
                'مستوى خصوصية واحد',
                'تخزين 100 ميجا'
            ]
        },
        premium: {
            id: 'premium',
            name: 'بريميوم',
            price: 29,
            currency: 'SAR',
            period: 'month',
            annualPrice: 278, // 29 * 12 * 0.8 (20% discount)
            features: [
                '500 رسالة يومياً',
                'فيديو حتى 15 ثانية',
                'كل مستويات الخصوصية',
                'تخزين 2 جيجا',
                'تحليلات أساسية',
                'Story Cards متقدمة',
                'بدون إعلانات',
                'دعم أولوية'
            ]
        },
        creator: {
            id: 'creator',
            name: 'منشئ محتوى',
            price: 79,
            currency: 'SAR',
            period: 'month',
            annualPrice: 758, // 79 * 12 * 0.8 (20% discount)
            features: [
                'رسائل غير محدودة',
                'فيديو حتى 30 ثانية',
                'تخزين 20 جيجا',
                'تحليلات متقدمة',
                'API كامل',
                'Webhooks',
                'شارة موثقة',
                'مدير حساب خاص'
            ]
        }
    },
    
    // Bank details for bank transfer
    bankDetails: {
        bankName: 'البنك الأهلي',
        accountName: 'شركة تقنية المستقبل',
        iban: 'SA0380000000608010167519',
        accountNumber: '60810167519'
    },
    
    // Promo codes (can be loaded from database)
    promoCodes: {
        'WELCOME10': { discount: 10, type: 'percent', maxUses: 100 },
        'PREMIUM20': { discount: 20, type: 'fixed', maxUses: 50, planType: 'premium' },
        'LAUNCH50': { discount: 50, type: 'percent', maxUses: 20, expiresAt: '2024-12-31' }
    }
};

// Global State
let selectedPlan = null;
let isAnnual = false;
let appliedPromo = null;

/**
 * Initialize Payment Page
 */
document.addEventListener('DOMContentLoaded', function() {
    initializePaymentPage();
});

function initializePaymentPage() {
    // Check URL params for pre-selected plan
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    
    if (planParam && PaymentConfig.plans[planParam]) {
        selectPlan(planParam);
    }
    
    // Setup payment method listeners
    setupPaymentMethodListeners();
    
    // Check if user is logged in
    checkAuthState();
}

/**
 * Select a subscription plan
 */
function selectPlan(planId) {
    const plan = PaymentConfig.plans[planId];
    if (!plan) return;
    
    selectedPlan = planId;
    
    // Update UI - highlight selected plan
    document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = document.getElementById(planId === 'premium' ? 'premiumPlan' : 
                           planId === 'creator' ? 'creatorPlan' : '');
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    // Show checkout section
    document.getElementById('checkoutSection').style.display = 'block';
    
    // Scroll to checkout
    setTimeout(() => {
        document.getElementById('checkoutSection').scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }, 300);
    
    // Update order summary
    updateOrderSummary();
}

/**
 * Update order summary based on selection
 */
function updateOrderSummary() {
    const plan = PaymentConfig.plans[selectedPlan];
    if (!plan) return;
    
    let price = plan.price;
    let discount = 0;
    
    // Calculate annual pricing
    if (isAnnual && plan.annualPrice) {
        const monthlyPrice = plan.price * 12;
        discount = monthlyPrice - plan.annualPrice;
        price = plan.annualPrice / 12; // Show monthly equivalent
    }
    
    // Apply promo code
    if (appliedPromo) {
        if (appliedPromo.type === 'percent') {
            discount += (price * appliedPromo.discount) / 100;
        } else {
            discount += appliedPromo.discount;
        }
    }
    
    const total = Math.max(0, price - discount);
    
    // Update DOM
    document.getElementById('summaryPlanName').textContent = plan.name;
    document.getElementById('summaryPlanBadge').textContent = isAnnual ? 'سنوي' : 'شهري';
    document.getElementById('summaryPrice').textContent = `${plan.price} ر.س`;
    
    // Discount row
    const discountRow = document.getElementById('discountRow');
    if (discount > 0 || isAnnual) {
        discountRow.style.display = 'flex';
        document.getElementById('discountValue').textContent = `-${discount.toFixed(2)} ر.س`;
    } else {
        discountRow.style.display = 'none';
    }
    
    // Total
    document.getElementById('totalPrice').textContent = `${total.toFixed(2)} ر.س`;
    document.getElementById('submitPrice').textContent = `${total.toFixed(2)} ر.س`;
    
    // Update included features list
    const featuresList = document.getElementById('includedFeaturesList');
    featuresList.innerHTML = plan.features.map(f => `<li>✅ ${f}</li>`).join('');
    featuresList.innerHTML += '<li>✅ تفعيل فوري بعد الدفع</li><li>✅ إلغاء أي وقت</li>';
}

/**
 * Toggle between monthly and annual billing
 */
function toggleAnnual() {
    isAnnual = !isAnnual;
    
    const bannerBtn = document.querySelector('.banner-btn');
    bannerBtn.textContent = isAnnual ? 'تحول للشهري' : 'تحول للسنوي';
    
    // Update prices display
    Object.keys(PaymentConfig.plans).forEach(planId => {
        if (planId === 'free') return;
        
        const plan = PaymentConfig.plans[planId];
        const priceEl = document.querySelector(`#${planId === 'premium' ? 'premiumPlan' : 'creatorPlan'} .price`);
        
        if (isAnnual && plan.annualPrice) {
            const monthlyEquivalent = (plan.annualPrice / 12).toFixed(0);
            priceEl.textContent = monthlyEquivalent;
        } else {
            priceEl.textContent = plan.price;
        }
    });
    
    // Update summary if plan is selected
    if (selectedPlan) {
        updateOrderSummary();
    }
}

/**
 * Setup payment method change listeners
 */
function setupPaymentMethodListeners() {
    const paymentOptions = document.querySelectorAll('.payment-option');
    
    paymentOptions.forEach(option => {
        option.addEventListener('change', function() {
            // Remove selected class from all
            paymentOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected to this one
            this.closest('.payment-option').classList.add('selected');
            
            // Show/hide relevant fields
            const method = this.value;
            document.getElementById('cardDetails').style.display = 
                method === 'card' ? 'block' : 'none';
            document.getElementById('bankDetails').style.display = 
                method === 'bank_transfer' ? 'block' : 'none';
        });
    });
}

/**
 * Apply promo code
 */
async function applyPromoCode() {
    const codeInput = document.getElementById('promoCode');
    const messageEl = document.getElementById('promoMessage');
    const code = codeInput.value.trim().toUpperCase();
    
    if (!code) {
        messageEl.textContent = 'أدخل كود الخصم';
        messageEl.className = 'promo-message error';
        return;
    }
    
    // Check local promo codes first
    let promo = PaymentConfig.promoCodes[code];
    
    // If not found locally, check Firebase
    if (!promo) {
        try {
            const snapshot = await MstkhbyFirebase.database
                .ref(`promoCodes/${code}`)
                .once('value');
            promo = snapshot.val();
        } catch (error) {
            console.error('Error fetching promo:', error);
        }
    }
    
    if (!promo) {
        messageEl.textContent = 'كود الخصم غير صالح';
        messageEl.className = 'promo-message error';
        return;
    }
    
    // Validate promo
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
        messageEl.textContent = 'انتهت صلاحية هذا الكود';
        messageEl.className = 'promo-message error';
        return;
    }
    
    if (promo.planType && promo.planType !== selectedPlan) {
        messageEl.textContent = `هذا الكود لخطة ${PaymentConfig.plans[promo.planType]?.name || ''} فقط`;
        messageEl.className = 'promo-message error';
        return;
    }
    
    // Apply promo
    appliedPromo = promo;
    messageEl.textContent = `تم تطبيق الخصم: ${promo.type === 'percent' ? promo.discount + '%' : promo.discount + ' ر.س'}`;
    messageEl.className = 'promo-message success';
    
    // Update summary
    if (selectedPlan) {
        updateOrderSummary();
    }
}

/**
 * Copy IBAN to clipboard
 */
function copyIBAN() {
    const iban = PaymentConfig.bankDetails.iban;
    
    navigator.clipboard.writeText(iban).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'تم النسخ!';
        btn.style.background = '#00D26A';
        btn.style.color = '#fff';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

/**
 * Process payment submission
 */
async function processPayment(event) {
    event.preventDefault();
    
    // Validate form
    if (!validateForm()) return;
    
    // Get form data
    const formData = getFormData();
    
    // Show processing overlay
    showProcessing(true);
    
    try {
        // Create payment record in Firebase
        const paymentData = await createPaymentRecord(formData);
        
        // Simulate payment processing (replace with actual payment gateway)
        const paymentResult = await processPaymentWithGateway(formData, paymentData.id);
        
        if (paymentResult.success) {
            // Activate subscription
            await activateSubscription(paymentData);
            
            // Show success modal
            showSuccessModal(paymentData);
            
            // Save to user's payment history
            await saveToUserHistory(paymentData);
            
        } else {
            throw new Error(paymentResult.message || 'فشل معالجة الدفع');
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        showError(error.message || 'حدث خطأ أثناء معالجة الدفع. يرجى المحاولة مرة أخرى.');
    } finally {
        showProcessing(false);
    }
}

/**
 * Validate payment form
 */
function validateForm() {
    const requiredFields = ['fullName', 'email', 'phone'];
    
    for (const field of requiredFields) {
        const input = document.getElementById(field);
        if (!input.value.trim()) {
            input.focus();
            input.style.borderColor = '#FF4757';
            setTimeout(() => input.style.borderColor = '', 3000);
            return false;
        }
    }
    
    // Validate terms checkbox
    const termsCheckbox = document.getElementById('agreeTerms');
    if (!termsCheckbox.checked) {
        alert('يرجى الموافقة على الشروط والأحكام');
        termsCheckbox.focus();
        return false;
    }
    
    // Validate card details if card payment selected
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    if (paymentMethod === 'card') {
        const cardNumber = document.getElementById('cardNumber').value;
        const expiryDate = document.getElementById('expiryDate').value;
        const cvv = document.getElementById('cvv').value;
        
        if (cardNumber.replace(/\s/g, '').length < 16) {
            alert('رقم البطاقة غير صحيح');
            return false;
        }
        
        if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
            alert('تاريخ الانتهاء غير صحيح (MM/YY)');
            return false;
        }
        
        if (cvv.length < 3) {
            alert('رمز CVV غير صحيح');
            return false;
        }
    }
    
    // Validate bank transfer details if selected
    if (paymentMethod === 'bank_transfer') {
        const transferRef = document.getElementById('transferRef').value;
        const transferDate = document.getElementById('transferDate').value;
        
        if (!transferRef.trim()) {
            alert('يرجى إدخال رقم مرجع التحويل');
            return false;
        }
        
        if (!transferDate) {
            alert('يرجى إدخال تاريخ التحويل');
            return false;
        }
    }
    
    return true;
}

/**
 * Get form data
 */
function getFormData() {
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    
    return {
        userId: MstkhbyFirebase.auth.currentUser?.uid || 'anonymous',
        email: document.getElementById('email').value,
        fullName: document.getElementById('fullName').value,
        phone: document.getElementById('phone').value,
        planId: selectedPlan,
        planName: PaymentConfig.plans[selectedPlan].name,
        amount: calculateTotal(),
        currency: 'SAR',
        paymentMethod: paymentMethod,
        isAnnual: isAnnual,
        promoCode: document.getElementById('promoCode').value || null,
        autoRenew: document.getElementById('autoRenew').checked,
        cardLast4: paymentMethod === 'card' ? 
            document.getElementById('cardNumber').value.slice(-4) : null,
        transferRef: paymentMethod === 'bank_transfer' ? 
            document.getElementById('transferRef').value : null,
        transferDate: paymentMethod === 'bank_transfer' ? 
            document.getElementById('transferDate').value : null,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        status: 'pending'
    };
}

/**
 * Calculate total amount
 */
function calculateTotal() {
    const plan = PaymentConfig.plans[selectedPlan];
    if (!plan) return 0;
    
    let total = isAnnual && plan.annualPrice ? plan.annualPrice : plan.price * (isAnnual ? 12 : 1);
    
    if (appliedPromo) {
        if (appliedPromo.type === 'percent') {
            total -= (total * appliedPromo.discount) / 100;
        } else {
            total -= appliedPromo.discount;
        }
    }
    
    return Math.max(0, total);
}

/**
 * Create payment record in Firebase
 */
async function createPaymentRecord(paymentData) {
    const paymentsRef = MstkhbyFirebase.database.ref('payments');
    const newPaymentRef = paymentsRef.push();
    
    const record = {
        ...paymentData,
        id: newPaymentRef.key,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        ip: await getClientIP(), // Would need server-side implementation
        userAgent: navigator.userAgent
    };
    
    await newPaymentRef.set(record);
    
    return record;
}

/**
 * Process payment with gateway (mock implementation)
 * Replace this with actual payment gateway integration
 */
async function processPaymentWithGateway(paymentData, paymentId) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // For demo purposes, always succeed
    // In production, integrate with:
    // - STC Pay API
    // - Apple Pay API
    // - Payment gateway (Tap, PayMob, etc.)
    
    return {
        success: true,
        transactionId: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message: 'تمت معالجة الدفع بنجاح'
    };
}

/**
 * Activate subscription after successful payment
 */
async function activateSubscription(paymentData) {
    const uid = paymentData.userId;
    const now = new Date();
    const expiryDate = new Date(now);
    
    // Add period (monthly or annual)
    if (isAnnual) {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    }
    
    const subscriptionData = {
        planId: paymentData.planId,
        planName: paymentData.planName,
        status: 'active',
        startDate: now.toISOString(),
        endDate: expiryDate.toISOString(),
        isAnnual: isAnnual,
        autoRenew: paymentData.autoRenew,
        paymentId: paymentData.id,
        activatedAt: firebase.database.ServerValue.TIMESTAMP,
        features: PaymentConfig.plans[paymentData.planId].features
    };
    
    // Save to user's subscriptions
    if (uid !== 'anonymous') {
        await MstkhbyFirebase.database
            .ref(`users/${uid}/subscriptions/current`)
            .set(subscriptionData);
        
        // Add to subscription history
        await MstkhbyFirebase.database
            .ref(`users/${uid}/subscriptions/history`)
            .push(subscriptionData);
        
        // Update user's plan in profile
        await MstkhbyFirebase.database
            .ref(`users/${uid}/profile`)
            .update({
                plan: paymentData.planId,
                planName: paymentData.planName,
                subscriptionStatus: 'active',
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
    }
    
    return subscriptionData;
}

/**
 * Save payment to user's history
 */
async function saveToUserHistory(paymentData) {
    const uid = paymentData.userId;
    
    if (uid !== 'anonymous') {
        await MstkhbyFirebase.database
            .ref(`users/${uid}/payments/history`)
            .push({
                ...paymentData,
                processedAt: firebase.database.ServerValue.TIMESTAMP
            });
    }
}

/**
 * Show/hide processing overlay
 */
function showProcessing(show) {
    document.getElementById('processingOverlay').style.display = show ? 'flex' : 'none';
}

/**
 * Show success modal
 */
function showSuccessModal(paymentData) {
    const modal = document.getElementById('successModal');
    
    // Update success content
    document.getElementById('successMessage').textContent = 
        `تم تفعيل اشتراك ${paymentData.planName} بنجاح!`;
    document.getElementById('successPlanName').textContent = paymentData.planName;
    document.getElementById('successPeriod').textContent = 
        isAnnual ? 'سنة واحدة' : 'شهر واحد';
    
    // Calculate expiry date
    const now = new Date();
    const expiry = new Date(now);
    if (isAnnual) {
        expiry.setFullYear(expiry.getFullYear() + 1);
    } else {
        expiry.setMonth(expiry.getMonth() + 1);
    }
    document.getElementById('successExpiry').textContent = 
        expiry.toLocaleDateString('ar-SA', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    
    modal.style.display = 'flex';
}

/**
 * Show error message
 */
function showError(message) {
    alert(message); // Replace with better UI
}

/**
 * Get client IP (placeholder)
 */
async function getClientIP() {
    // In production, this would be obtained from server
    return 'unknown';
}

/**
 * Check authentication state
 */
function checkAuthState() {
    MstkhbyFirebase.auth.onAuthStateChanged(user => {
        const loginBtn = document.getElementById('loginBtn');
        
        if (user) {
            loginBtn.textContent = 'مرحباً، ' + (user.displayName || user.email?.split('@')[0] || 'مستخدم');
            loginBtn.href = '#';
            
            // Pre-fill form with user data
            if (user.email) {
                document.getElementById('email').value = user.email;
            }
            if (user.displayName) {
                document.getElementById('fullName').value = user.displayName;
            }
            if (user.phoneNumber) {
                document.getElementById('phone').value = user.phoneNumber;
            }
        } else {
            loginBtn.textContent = 'تسجيل الدخول';
            loginBtn.href = '#'; // Could link to login modal
        }
    });
}

/**
 * Format card number input
 */
document.addEventListener('DOMContentLoaded', function() {
    const cardInput = document.getElementById('cardNumber');
    if (cardInput) {
        cardInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
            value = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = value;
        });
    }
    
    const expiryInput = document.getElementById('expiryDate');
    if (expiryInput) {
        expiryInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2);
            }
            e.target.value = value;
        });
    }
});

// Export functions for global access
window.selectPlan = selectPlan;
window.toggleAnnual = toggleAnnual;
window.applyPromoCode = applyPromoCode;
window.copyIBAN = copyIBAN;
window.processPayment = processPayment;

console.log('💳 Payment system initialized');
