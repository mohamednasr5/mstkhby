/**
 * ===================================
 * Mstkhby - Authentication Module
 * ===================================
 * 
 * Handles user authentication:
 * - Sign up / Login
 * - Social auth (Google, Apple)
 * - Session management
 * - Password reset
 *
 * NOTE: This project uses Firebase Realtime Database (not Firestore).
 * All data access below goes through `database.ref(...)`.
 */

class AuthService {
    constructor() {
        this.auth = window.MstkhbyFirebase?.auth;
        this.database = window.MstkhbyFirebase?.database;
        this.currentUser = null;
        this.listeners = [];
        
        if (this.auth) {
            this.initAuthListener();
        }
    }

    // Initialize auth state listener
    initAuthListener() {
        // Resolves once after Firebase restores (or confirms there's no)
        // session, so other code (like the router) can wait for the real
        // auth state instead of racing it.
        this.authReady = new Promise((resolve) => {
            const unsubscribe = this.auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                this.notifyListeners(user);

                if (user) {
                    console.log('✅ User logged in:', user.uid);
                    this.updateLastActive(user.uid);
                    this.watchWarnings(user.uid);
                } else {
                    console.log('👤 User logged out');
                    this.unwatchWarnings();
                }

                resolve(user);
            });
        });
    }

    /**
     * Surface admin warnings (admin/js/admin.js warnUser()) to the user.
     * Previously these were only ever written to users/{uid}/warnings —
     * nothing on this side read them, so they never reached the customer.
     * child_added also fires for existing children on first attach, which
     * is what shows a warning that was sent while the user was offline.
     */
    watchWarnings(userId) {
        this.unwatchWarnings();
        this.warningsRef = this.database.ref(`users/${userId}/warnings`);
        this.warningsHandler = this.warningsRef.on('child_added', (snap) => {
            const warning = snap.val();
            if (!warning || warning.acknowledged === true) return;

            window.uiManager?.showToast(
                '⚠️ تحذير من إدارة المنصة',
                warning.reason || 'مخالفة قواعد المنصة',
                'warning',
                8000
            );

            snap.ref.update({ acknowledged: true }).catch((err) => {
                console.warn('Could not mark warning as acknowledged:', err);
            });
        });
    }

    unwatchWarnings() {
        if (this.warningsRef && this.warningsHandler) {
            this.warningsRef.off('child_added', this.warningsHandler);
        }
        this.warningsRef = null;
        this.warningsHandler = null;
    }

    // Subscribe to auth changes
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    // Notify all listeners
    notifyListeners(user) {
        this.listeners.forEach(callback => callback(user));
    }

    // Register new user
    async register(email, password, displayName, username) {
        try {
            if (!this.validateEmail(email)) {
                throw new Error('البريد الإلكتروني غير صالح');
            }
            
            if (password.length < 8) {
                throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            }

            if (!this.validateUsername(username)) {
                throw new Error('اسم المستخدم يجب أن يكون 3-20 حرف/رقم');
            }

            const usernameAvailable = await this.isUsernameAvailable(username);
            if (!usernameAvailable) {
                throw new Error('اسم المستخدم مستخدم بالفعل');
            }

            const credential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = credential.user;

            await user.updateProfile({ displayName });
            await user.sendEmailVerification();
            await this.createUserDocument(user, displayName, username);

            console.log('✅ Registration successful');
            return { success: true, user };
            
        } catch (error) {
            console.error('❌ Registration error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Login with email/password
    async login(email, password) {
        try {
            const credential = await this.auth.signInWithEmailAndPassword(email, password);
            const user = credential.user;

            if (!user.emailVerified) {
                // Don't auto-resend here — repeated login attempts before
                // verifying would otherwise re-trigger sendEmailVerification()
                // every time, which Firebase flags as abuse and blocks the
                // device entirely (auth/too-many-requests) for ALL auth
                // operations, not just email sending. Let the UI offer an
                // explicit "resend" action instead — see resendVerificationEmail().
                throw new Error('يرجى تفعيل بريدك الإلكتروني أولاً. يمكنك طلب إعادة إرسال رابط التفعيل.');
            }

            console.log('✅ Login successful');
            await this.recordLogin(user, 'password');
            return { success: true, user };
            
        } catch (error) {
            console.error('❌ Login error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Appends a login event to users/{uid}/loginHistory, keeping only the
    // most recent 20 entries. Used by the admin dashboard's "تسجيلات الدخول" view.
    async recordLogin(user, method) {
        try {
            const ref = this.database.ref(`users/${user.uid}/loginHistory`);
            const snap = await ref.once('value');
            const entries = snap.exists() ? Object.entries(snap.val()) : [];
            entries.sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0));
            while (entries.length >= 20) {
                const [oldestKey] = entries.shift();
                await ref.child(oldestKey).remove();
            }
            await ref.push({
                method,
                at: firebase.database.ServerValue.TIMESTAMP,
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || 'unknown'
            });
        } catch (e) {
            // Never let login tracking break the actual sign-in flow.
            console.warn('recordLogin failed:', e);
        }
    }

    // Explicitly resend the verification email (call from a "resend" button,
    // never automatically on every login attempt)
    async resendVerificationEmail(email, password) {
        try {
            // Must be signed in to call sendEmailVerification, so sign in
            // first (this also naturally rate-limits via Firebase's own
            // signIn throttling rather than uncontrolled repeats).
            const credential = await this.auth.signInWithEmailAndPassword(email, password);
            const user = credential.user;

            if (user.emailVerified) {
                return { success: true, alreadyVerified: true };
            }

            await user.sendEmailVerification();
            console.log('✅ Verification email resent');
            return { success: true, alreadyVerified: false };

        } catch (error) {
            console.error('❌ Resend verification error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Google Sign-In
    async signInWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            
            const result = await this.auth.signInWithPopup(provider);
            const user = result.user;

            const snapshot = await this.database.ref(`users/${user.uid}/profile`).once('value');
            
            if (!snapshot.exists()) {
                const baseUsername = user.displayName
                    ?.replace(/\s+/g, '_')
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '') || 'user';
                
                let username = baseUsername.length >= 3 ? baseUsername : `${baseUsername}user`;
                let counter = 1;
                
                while (!(await this.isUsernameAvailable(username))) {
                    username = `${baseUsername}${counter}`;
                    counter++;
                }

                await this.createUserDocument(user, user.displayName, username);
            }

            console.log('✅ Google sign-in successful');
            await this.recordLogin(user, 'google');
            return { success: true, user };
            
        } catch (error) {
            console.error('❌ Google sign-in error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Apple Sign-In (basic implementation)
    async signInWithApple() {
        try {
            const provider = new firebase.auth.OAuthProvider('apple.com');
            provider.setCustomParameters({ locale: 'ar' });
            
            const result = await this.auth.signInWithPopup(provider);
            const user = result.user;

            const snapshot = await this.database.ref(`users/${user.uid}/profile`).once('value');

            if (!snapshot.exists()) {
                const baseUsername = (user.displayName || 'user')
                    .replace(/\s+/g, '_')
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '') || 'user';

                let username = baseUsername.length >= 3 ? baseUsername : `${baseUsername}user`;
                let counter = 1;

                while (!(await this.isUsernameAvailable(username))) {
                    username = `${baseUsername}${counter}`;
                    counter++;
                }

                await this.createUserDocument(user, user.displayName, username);
            }

            console.log('✅ Apple sign-in successful');
            await this.recordLogin(user, 'apple');
            return { success: true, user };
            
        } catch (error) {
            console.error('❌ Apple sign-in error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Logout
    async logout() {
        try {
            await this.auth.signOut();
            console.log('✅ Logged out successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Logout error:', error);
            throw error;
        }
    }

    // Password reset
    async resetPassword(email) {
        try {
            await this.auth.sendPasswordResetEmail(email);
            console.log('✅ Password reset email sent');
            return { success: true };
        } catch (error) {
            console.error('❌ Password reset error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Update password
    async updatePassword(currentPassword, newPassword) {
        try {
            const user = this.auth.currentUser;
            
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
            await user.reauthenticateWithCredential(credential);
            await user.updatePassword(newPassword);
            
            console.log('✅ Password updated successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Update password error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Delete account
    async deleteAccount(password) {
        try {
            const user = this.auth.currentUser;
            
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
            await user.reauthenticateWithCredential(credential);

            const profileSnap = await this.database.ref(`users/${user.uid}/profile`).once('value');
            const profile = profileSnap.val();

            await this.database.ref(`users/${user.uid}`).remove();

            if (profile?.username) {
                await this.database.ref(`usernames/${profile.username.toLowerCase()}`).remove();
            }
            
            await user.delete();
            
            console.log('✅ Account deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Delete account error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Create user record in Realtime Database
    async createUserDocument(user, displayName, username) {
        const timestamp = firebase.database.ServerValue.TIMESTAMP;

        const profileData = {
            uid: user.uid,
            email: user.email,
            displayName,
            username: username.toLowerCase(),
            photoURL: user.photoURL || null,
            profileUrl: `mstkhby.com/${username.toLowerCase()}`,
            createdAt: timestamp,
            lastActiveAt: timestamp,
            settings: {
                privacyLevel: 'medium',
                allowMessages: true,
                allowMedia: true,
                autoDeleteReadMessages: false,
                autoDeleteDays: 30,
                notifications: { push: true, email: false }
            },
            stats: {
                totalMessagesReceived: 0,
                totalReactions: 0
            }
        };

        // Plan / verification / ban status live in a separate "entitlements"
        // node that only an admin can write to after this initial creation
        // (see database.rules.json) — this is the only write a regular
        // account is ever allowed to make there, and only once, and only
        // with these exact "nothing granted yet" defaults.
        const entitlementsData = {
            plan: 'free',
            isVerified: false,
            status: 'active'
        };

        // Write profile + entitlements under users/$uid (matches the security rules)
        await this.database.ref().update({
            [`users/${user.uid}/profile`]: profileData,
            [`users/${user.uid}/entitlements`]: entitlementsData
        });

        // Create username index for uniqueness
        await this.database.ref(`usernames/${username.toLowerCase()}`).set({
            uid: user.uid,
            createdAt: timestamp
        });
    }

    // Check username availability
    async isUsernameAvailable(username) {
        const normalizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
        
        if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
            return false;
        }

        const snapshot = await this.database.ref(`usernames/${normalizedUsername}`).once('value');
        return !snapshot.exists();
    }

    // Update last active timestamp
    async updateLastActive(uid) {
        try {
            await this.database.ref(`users/${uid}/profile/lastActiveAt`)
                .set(firebase.database.ServerValue.TIMESTAMP);
        } catch (error) {
            console.warn('Failed to update last active:', error);
        }
    }

    // Get current user data (profile + entitlements merged into one object,
    // so every existing call site that reads userData.plan / .isVerified /
    // .status keeps working unchanged even though they now live separately)
    async getCurrentUserData() {
        if (!this.currentUser) return null;
        
        try {
            const uid = this.currentUser.uid;
            const [profileSnap, entitlementsSnap] = await Promise.all([
                this.database.ref(`users/${uid}/profile`).once('value'),
                this.database.ref(`users/${uid}/entitlements`).once('value')
            ]);

            if (!profileSnap.exists()) return null;
            return { ...profileSnap.val(), ...(entitlementsSnap.val() || {}) };
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }

    // Update user profile
    async updateProfile(updates) {
        if (!this.currentUser) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }

        try {
            await this.database.ref(`users/${this.currentUser.uid}/profile`).update({
                ...updates,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
            
            console.log('✅ Profile updated successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Profile update error:', error);
            throw error;
        }
    }

    // Change username (allowed once per account)
    async changeUsername(newUsername) {
        if (!this.currentUser) {
            throw new Error('يجب تسجيل الدخول أولاً');
        }

        if (!this.validateUsername(newUsername)) {
            throw new Error('اسم المستخدم يجب أن يكون 3-20 حرف/رقم إنجليزي');
        }

        const normalized = newUsername.toLowerCase();

        const userData = await this.getCurrentUserData();
        if (!userData) {
            throw new Error('تعذر تحميل بيانات الحساب');
        }

        if (userData.usernameChanged) {
            throw new Error('لقد قمت بتغيير رابطك من قبل، هذا الخيار متاح مرة واحدة فقط');
        }

        if (userData.username && normalized === userData.username.toLowerCase()) {
            throw new Error('هذا هو رابطك الحالي بالفعل');
        }

        const available = await this.isUsernameAvailable(normalized);
        if (!available) {
            throw new Error('اسم المستخدم مستخدم بالفعل');
        }

        const timestamp = firebase.database.ServerValue.TIMESTAMP;

        // Reserve the new username, release the old one
        await this.database.ref(`usernames/${normalized}`).set({
            uid: this.currentUser.uid,
            createdAt: timestamp
        });

        if (userData.username) {
            await this.database.ref(`usernames/${userData.username.toLowerCase()}`).remove();
        }

        await this.database.ref(`users/${this.currentUser.uid}/profile`).update({
            username: normalized,
            profileUrl: `mstkhby.com/${normalized}`,
            usernameChanged: true,
            usernameChangedAt: timestamp,
            updatedAt: timestamp
        });

        console.log('✅ Username changed successfully');
        return { success: true, username: normalized };
    }

    // Validate email format
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Validate username format
    validateUsername(username) {
        const re = /^[a-zA-Z0-9_]{3,20}$/;
        return re.test(username);
    }

    // Handle authentication errors
    handleAuthError(error) {
        const errorMap = {
            'auth/user-not-found': { message: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' },
            'auth/wrong-password': { message: 'كلمة المرور غير صحيحة', code: 'WRONG_PASSWORD' },
            'auth/email-already-in-use': { message: 'البريد الإلكتروني مسجل بالفعل', code: 'EMAIL_IN_USE' },
            'auth/weak-password': { message: 'كلمة المرور ضعيفة جداً', code: 'WEAK_PASSWORD' },
            'auth/invalid-email': { message: 'البريد الإلكتروني غير صالح', code: 'INVALID_EMAIL' },
            'auth/too-many-requests': { message: 'محاولات كثيرة جداً، حاول لاحقاً', code: 'TOO_MANY_REQUESTS' },
            'auth/network-request-failed': { message: 'مشكلة في الاتصال بالإنترنت', code: 'NETWORK_ERROR' },
            'auth/popup-closed-by-user': { message: 'تم إلغاء تسجيل الدخول', code: 'CANCELLED' },
            'auth/invalid-credential': { message: 'بيانات الدخول غير صحيحة', code: 'INVALID_CREDENTIAL' }
        };

        const mappedError = errorMap[error.code] || {
            message: error.message || 'حدث خطأ غير متوقع',
            code: 'UNKNOWN_ERROR'
        };

        return new Error(mappedError.message);
    }

    // Get user by username (for public profiles)
    //
    // IMPORTANT: this must read each public field directly (not the parent
    // `profile`/`entitlements` node in one call). RTDB per-field `.read: true`
    // overrides (see database.rules.json) only grant access when that exact
    // child path is requested — they do NOT open up a read of the parent
    // node. Reading the parent as a logged-out visitor was being rejected
    // outright (auth != null required on `profile`/`entitlements`), so
    // every anonymous visit to someone's link returned null and looked like
    // "the page doesn't work."
    async getUserByUsername(username) {
        try {
            const normalizedUsername = username.toLowerCase();
            const usernameSnap = await this.database.ref(`usernames/${normalizedUsername}`).once('value');

            if (!usernameSnap.exists()) {
                return null;
            }

            const uid = usernameSnap.val().uid;

            const publicProfileFields = ['displayName', 'username', 'photoURL', 'profileUrl'];
            const publicEntitlementFields = ['plan', 'isVerified', 'verificationTier', 'badgeIcon', 'badgeColor'];

            const [profileSnaps, entitlementSnaps] = await Promise.all([
                Promise.all(publicProfileFields.map(field =>
                    this.database.ref(`users/${uid}/profile/${field}`).once('value')
                )),
                Promise.all(publicEntitlementFields.map(field =>
                    this.database.ref(`users/${uid}/entitlements/${field}`).once('value')
                ))
            ]);

            const profile = {};
            publicProfileFields.forEach((field, i) => {
                if (profileSnaps[i].exists()) profile[field] = profileSnaps[i].val();
            });

            const entitlements = {};
            publicEntitlementFields.forEach((field, i) => {
                if (entitlementSnaps[i].exists()) entitlements[field] = entitlementSnaps[i].val();
            });

            if (!profile.displayName) return null;
            return { id: uid, ...profile, ...entitlements };
        } catch (error) {
            console.error('Error getting user by username:', error);
            return null;
        }
    }
}

// Initialize and export
window.authService = new AuthService();
console.log('🔐 Auth service initialized');
