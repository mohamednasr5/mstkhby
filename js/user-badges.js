/**
 * ===================================
 * Mstkhby - User Badges
 * ===================================
 * Renders the small badges shown next to a display name:
 *   - 👑 an animated gold crown for paid-plan users (premium / creator)
 *   - a verification badge (✓ / ⭐ / 👑) for accounts approved through the
 *     existing tier system in js/verification.js (users/{uid}/profile:
 *     isVerified, verificationTier, badgeIcon, badgeColor)
 *
 * Usage: append `window.UserBadges.render(profile)` next to any name,
 * where `profile` is a user profile object (or the denormalized sender
 * info stored on a message) that may contain `plan`, `isVerified`,
 * `verificationTier`, `badgeIcon`, `badgeColor`.
 */
(function () {
    // Kept in sync with paymentConfig.plans in js/payment-new.js
    const PLAN_LABELS = { premium: 'بريميوم', creator: 'منشئ محتوى' };

    // Kept in sync with VerificationService.verificationTiers in js/verification.js
    const VERIFICATION_TIERS = {
        basic: { name: 'موثق أساسي', icon: '✓', color: '#0ea5e9' },
        influencer: { name: 'مؤثر موثق', icon: '⭐', color: '#8b5cf6' },
        celebrity: { name: 'مشهور موثق', icon: '👑', color: '#f59e0b' }
    };

    const CROWN_SVG = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="mstkhbyCrownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#fde68a"/>
                    <stop offset="50%" stop-color="#f5b301"/>
                    <stop offset="100%" stop-color="#d97706"/>
                </linearGradient>
            </defs>
            <path d="M3 8L7 11L12 4L17 11L21 8L19.5 18H4.5L3 8Z" fill="url(#mstkhbyCrownGrad)" stroke="#b45309" stroke-width="0.6" stroke-linejoin="round"/>
            <rect x="4.5" y="18" width="15" height="2" rx="0.6" fill="#b45309"/>
        </svg>`;

    function escapeAttr(str) {
        return String(str || '').replace(/"/g, '&quot;');
    }

    /** True if this profile/sender-info object is on a paid plan. */
    function isPremium(profile) {
        return !!(profile && profile.plan && profile.plan !== 'free');
    }

    function planLabel(plan) {
        return PLAN_LABELS[plan] || 'بريميوم';
    }

    function crownBadge(profile) {
        if (!isPremium(profile)) return '';
        const title = `هذا المستخدم مميز بخطة ${planLabel(profile.plan)}`;
        return `<span class="user-badge user-badge--crown" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${CROWN_SVG}</span>`;
    }

    /** Circular verification badge — icon/color come from the tier, falling back to a plain blue check if a tier isn't set. */
    function verifiedBadge(profile) {
        if (!profile || !profile.isVerified) return '';
        const tier = VERIFICATION_TIERS[profile.verificationTier];
        const icon = profile.badgeIcon || tier?.icon || '✓';
        const color = profile.badgeColor || tier?.color || '#0ea5e9';
        const title = tier ? `${tier.name} — مستخدم مشهور` : 'مستخدم مشهور';
        return `<span class="user-badge user-badge--verified" style="background:${escapeAttr(color)}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${icon}</span>`;
    }

    /** Full badge group (crown + verified, in that order) as an HTML string. Safe to inject even when profile is null/undefined — returns ''. */
    function render(profile) {
        const badges = crownBadge(profile) + verifiedBadge(profile);
        return badges ? `<span class="user-badge-group">${badges}</span>` : '';
    }

    window.UserBadges = { render, isPremium, planLabel, verificationTiers: VERIFICATION_TIERS };
})();
