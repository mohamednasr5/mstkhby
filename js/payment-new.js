/**
 * ===================================
 * Mstkhby - New Payment Page JavaScript
 * ===================================
 * Handles payment methods, form submission, and Firebase integration
 */

// Payment Configuration
const paymentConfig = {
    instapayLink: 'https://ipn.eg/S/engmohamednasr/instapay/8NShbl',
    instapayPhone: '01279934735',
    vodafonePhone: '01279934735',
    bankIBAN: 'SA7630609031909112576',
    bankAccountName: 'أحمد نصر محمد السيد',
    bankSaudiNumber: '01279934735',
    
    plans: {
        free: { name: 'مجاني', price: 0, currency: 'ر.س' },
        premium: { name: 'بريميوم', price: 29, currency: 'ر.س' },
        creator: { name: 'منشئ محتوى', price: 79, currency: 'ر.س' }
    },
    
    currentPlan: 'premium'
};

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
    checkURLParams();
});

/**
 * Initialize page components
 */
function initializePage() {
    console.log('💳 Payment page initialized');
    
    // Update plan display based on current selection
    updatePlanDisplay(paymentConfig.currentPlan);
}

/**
 * Check URL parameters for pre-selected plan
 */
function checkURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const plan = urlParams.get('plan');
    
    if (plan && paymentConfig.plans[plan]) {
        selectPlan(plan);
    }
}

/**
 * Open InstaPay payment link
 */
function openInstapayLink() {
    console.log('🔗 Opening InstaPay link...');
    window.open(paymentConfig.instapayLink, '_blank');
    
    // Show toast notification
    showToast('جاري فتح رابط الإنستاباي...');
}

/**
 * Copy text to clipboard with visual feedback
 */
async function copyToClipboard(text, button) {
    try {
        await navigator.clipboard.writeText(text);
        
        // Update button state
        if (button) {
            const originalHTML = button.innerHTML;
            button.classList.add('copied');
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17L4 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                تم النسخ!
            `;
            
            // Reset after 2 seconds
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerHTML = originalHTML;
            }, 2000);
        }
        
        // Show toast
        showCopyToast();
        
        console.log(`📋 Copied to clipboard: ${text}`);
        
    } catch (err) {
        console.error('❌ Failed to copy:', err);
        
        // Fallback method
        fallbackCopy(text);
    }
}

/**
 * Fallback copy method for older browsers
 */
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        showCopyToast();
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('فشل نسخ النص. يرجى النسخ يدوياً: ' + text);
    }
    
    document.body.removeChild(textarea);
}

/**
 * Show copy success toast
 */
function showCopyToast() {
    const toast = document.getElementById('copyToast');
    if (toast) {
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }
}

/**
 * Show general toast notification
 */
function showToast(message) {
    let toast = document.getElementById('copyToast');
    if (toast) {
        toast.querySelector('span').textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            toast.querySelector('span').textContent = 'تم النسخ بنجاح!';
        }, 2500);
    }
}

/**
 * Select a subscription plan
 */
function selectPlan(planId) {
    if (!paymentConfig.plans[planId]) {
        console.error('Invalid plan:', planId);
        return;
    }
    
    paymentConfig.currentPlan = planId;
    
    // Update UI
    updatePlanDisplay(planId);
    updatePlanButtons(planId);
    
    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('plan', planId);
    window.history.replaceState({}, '', url);
    
    console.log(`✅ Selected plan: ${paymentConfig.plans[planId].name}`);
}

/**
 * Update plan display header
 */
function updatePlanDisplay(planId) {
    const plan = paymentConfig.plans[planId];
    
    const nameEl = document.getElementById('planNameDisplay');
    const priceEl = document.getElementById('planPriceDisplay');
    
    if (nameEl) nameEl.textContent = plan.name;
    if (priceEl) priceEl.textContent = `${plan.price} ${plan.currency} / شهرياً`;
    
    // Update bank amount display for D360
    const bankAmountEl = document.getElementById('bankAmountD360');
    if (bankAmountEl && plan.price > 0) {
        bankAmountEl.textContent = `D${plan.price}`;
    }
}

/**
 * Update plan button states
 */
function updatePlanButtons(planId) {
    const buttons = document.querySelectorAll('.plan-select-btn');
    
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and activate the selected button
    if (planId === 'premium') {
        document.getElementById('premiumBtn')?.classList.add('active');
    } else if (planId === 'creator') {
        document.getElementById('creatorBtn')?.classList.add('active');
    } else if (planId === 'free') {
        // Find free button by index or add ID
        buttons[0]?.classList.add('active');
    }
}

/**
 * Submit payment proof form
 */
async function submitProof(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('submitProofBtn');
    const originalBtnContent = submitBtn.innerHTML;
    
    try {
        // Disable button and show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <div class="btn-spinner"></div>
            جاري الإرسال...
        `;
        
        // Gather form data
        const formData = {
            userName: document.getElementById('userName').value.trim(),
            userEmail: document.getElementById('userEmail').value.trim(),
            userPhone: document.getElementById('userPhone').value.trim(),
            paymentMethod: document.getElementById('paymentMethodSelect').value,
            transactionId: document.getElementById('transactionId').value.trim(),
            notes: document.getElementById('notes').value.trim(),
            
            // Plan info
            planId: paymentConfig.currentPlan,
            planName: paymentConfig.plans[paymentConfig.currentPlan].name,
            planPrice: paymentConfig.plans[paymentConfig.currentPlan].price,
            
            // Metadata
            timestamp: Date.now,
            status: 'pending',
            orderId: generateOrderId()
        };
        
        // Validate required fields
        if (!formData.userName || !formData.userEmail || !formData.userPhone || !formData.paymentMethod) {
            throw new Error('يرجى ملء جميع الحقول المطلوبة');
        }
        
        console.log('📤 Submitting proof:', formData);
        
        // Save to Firebase Realtime Database
        await saveToFirebase(formData);
        
        // Show success modal
        showSuccessModal(formData);
        
        // Reset form
        document.getElementById('proofForm').reset();
        
    } catch (error) {
        console.error('❌ Submission error:', error);
        alert('حدث خطأ: ' + error.message);
    } finally {
        // Restore button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
    }
}

/**
 * Save payment proof to Firebase
 */
async function saveToFirebase(data) {
    return new Promise((resolve, reject) => {
        if (typeof firebase === 'undefined' || !window.MstkhbyFirebase) {
            console.warn('⚠️ Firebase not available, saving locally');
            saveLocalStorage(data);
            resolve();
            return;
        }
        
        const dbRef = window.MstkhbyFirebase.dbRef.payments;
        const newPaymentRef = dbRef.push();
        
        newPaymentRef.set(data)
            .then(() => {
                console.log('✅ Saved to Firebase successfully');
                resolve();
            })
            .catch(error => {
                console.error('❌ Firebase save error:', error);
                // Fallback to localStorage
                saveLocalStorage(data);
                resolve();
            });
    });
}

/**
 * Save to localStorage as fallback
 */
function saveLocalStorage(data) {
    const payments = JSON.parse(localStorage.getItem('mstkhby_payments') || '[]');
    payments.push(data);
    localStorage.setItem('mstkhby_payments', JSON.stringify(payments));
    console.log('💾 Saved to localStorage');
}

/**
 * Generate unique order ID
 */
function generateOrderId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MSK-${timestamp}-${random}`;
}

/**
 * Show success modal
 */
function showSuccessModal(data) {
    const modal = document.getElementById('successModalNew');
    
    // Update modal content
    const planNameEl = document.getElementById('successPlanNameNew');
    const amountEl = document.getElementById('successAmountNew');
    const orderIdEl = document.getElementById('successOrderIdNew');
    
    if (planNameEl) planNameEl.textContent = data.planName;
    if (amountEl) amountEl.textContent = `${data.planPrice} ر.س`;
    if (orderIdEl) orderIdEl.textContent = `#${data.orderId}`;
    
    // Show modal
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    console.log(`🎉 Success! Order ID: ${data.orderId}`);
}

/**
 * Close success modal
 */
function closeModal() {
    const modal = document.getElementById('successModalNew');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// Close modal on outside click
document.addEventListener('click', function(e) {
    const modal = document.getElementById('successModalNew');
    if (e.target === modal) {
        closeModal();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// Add spinner style dynamically
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
    .btn-spinner {
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        display: inline-block;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(spinnerStyle);

console.log('💳 Payment module loaded successfully');
