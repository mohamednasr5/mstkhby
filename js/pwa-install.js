/**
 * ===================================
 * Mstkhby - PWA Install Handler
 * ===================================
 *
 * Captures the browser's native `beforeinstallprompt` event and drives a
 * custom banner/button so the user gets the REAL "Install app" flow
 * (creates an actual installed app with its own window/icon on
 * Chrome/Edge/Android/desktop) rather than a plain bookmark.
 *
 * iOS Safari has no `beforeinstallprompt` API at all — Apple only exposes
 * manual "Share -> Add to Home Screen". When we detect iOS Safari without
 * an installed context, we show instructions instead of a fake button,
 * since faking a one-tap install there would be misleading.
 */
(function () {
    'use strict';

    let deferredPrompt = null;
    const STORAGE_KEY = 'mstkhby_pwa_install_dismissed_at';
    const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    function isStandalone() {
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: window-controls-overlay)').matches ||
            window.navigator.standalone === true // iOS PWA already added
        );
    }

    function isIos() {
        return /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
            !window.MSStream;
    }

    function isSafari() {
        const ua = window.navigator.userAgent;
        return /safari/i.test(ua) && !/crios|fxios|chrome|android/i.test(ua);
    }

    function recentlyDismissed() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        return (Date.now() - parseInt(raw, 10)) < DISMISS_COOLDOWN_MS;
    }

    function markDismissed() {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }

    function getBanner() {
        return document.getElementById('pwaInstallBanner');
    }

    function showBanner() {
        const banner = getBanner();
        if (!banner || isStandalone() || recentlyDismissed()) return;
        banner.hidden = false;
    }

    function hideBanner() {
        const banner = getBanner();
        if (banner) banner.hidden = true;
    }

    function wireBanner() {
        const installBtn = document.getElementById('pwaInstallBtn');
        const dismissBtn = document.getElementById('pwaInstallDismiss');

        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('📲 PWA install choice:', outcome);
                deferredPrompt = null;
                hideBanner();
            });
        }

        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                markDismissed();
                hideBanner();
            });
        }
    }

    // Chrome / Edge / Android / most Chromium browsers + desktop Chrome/Edge
    window.addEventListener('beforeinstallprompt', (event) => {
        // Prevent the mini-infobar and hold on to the event so we can
        // trigger the REAL install flow from our own button.
        event.preventDefault();
        deferredPrompt = event;
        showBanner();
    });

    window.addEventListener('appinstalled', () => {
        console.log('✅ Mstkhby installed as a standalone app');
        deferredPrompt = null;
        hideBanner();
        try {
            window.MstkhbyFirebase?.analytics?.logEvent?.('pwa_installed');
        } catch (e) { /* analytics optional */ }
    });

    function initIosFallback() {
        if (!isIos() || !isSafari() || isStandalone() || recentlyDismissed()) return;
        const banner = getBanner();
        if (!banner) return;

        const textEl = banner.querySelector('.pwa-install-banner__text');
        const installBtn = document.getElementById('pwaInstallBtn');
        if (textEl) {
            textEl.innerHTML = '<strong>ثبّت تطبيق مستخبي</strong><span>اضغط زر المشاركة ⬆️ ثم "إضافة إلى الشاشة الرئيسية"</span>';
        }
        if (installBtn) installBtn.hidden = true;
        banner.hidden = false;
    }

    document.addEventListener('DOMContentLoaded', () => {
        wireBanner();
        initIosFallback();
    });
})();
