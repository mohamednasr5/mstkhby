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
                } else {
                    console.log('👤 User logged out');
                }

                resolve(user);
            });
        });
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
            return { success: true, user };
            
        } catch (error) {
            console.error('❌ Login error:', error);
            throw this.handleAuthError(error);
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

        const userData = {
            uid: user.uid,
            email: user.email,
            displayName,
            username: username.toLowerCase(),
            photoURL: user.photoURL || null,
            profileUrl: `mstkhby.com/${username.toLowerCase()}`,
            createdAt: timestamp,
            lastActiveAt: timestamp,
            isVerified: false,
            plan: 'free',
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
            },
            status: 'active'
        };

        // Write profile under users/$uid/profile (matches the security rules)
        await this.database.ref(`users/${user.uid}/profile`).set(userData);

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

    // Get current user data
    async getCurrentUserData() {
        if (!this.currentUser) return null;
        
        try {
            const snapshot = await this.database
                .ref(`users/${this.currentUser.uid}/profile`)
                .once('value');
            
            return snapshot.exists() ? snapshot.val() : null;
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
    async getUserByUsername(username) {
        try {
            const normalizedUsername = username.toLowerCase();
            const usernameSnap = await this.database.ref(`usernames/${normalizedUsername}`).once('value');

            if (!usernameSnap.exists()) {
                return null;
            }

            const uid = usernameSnap.val().uid;
            const userSnap = await this.database.ref(`users/${uid}/profile`).once('value');

            return userSnap.exists() ? { id: uid, ...userSnap.val() } : null;
        } catch (error) {
            console.error('Error getting user by username:', error);
            return null;
        }
    }
}

// Initialize and export
window.authService = new AuthService();
console.log('🔐 Auth service initialized');
