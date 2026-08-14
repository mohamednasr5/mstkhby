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
 */

class AuthService {
    constructor() {
        this.auth = window.MstkhbyFirebase?.auth;
        this.db = window.MstkhbyFirebase?.db;
        this.currentUser = null;
        this.listeners = [];
        
        if (this.auth) {
            this.initAuthListener();
        }
    }

    // Initialize auth state listener
    initAuthListener() {
        this.auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            this.notifyListeners(user);
            
            if (user) {
                console.log('✅ User logged in:', user.uid);
                this.updateLastActive(user.uid);
            } else {
                console.log('👤 User logged out');
            }
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
            // Validate inputs
            if (!this.validateEmail(email)) {
                throw new Error('البريد الإلكتروني غير صالح');
            }
            
            if (password.length < 8) {
                throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            }

            // Check username availability
            const usernameAvailable = await this.isUsernameAvailable(username);
            if (!usernameAvailable) {
                throw new Error('اسم المستخدم مستخدم بالفعل');
            }

            // Create auth account
            const credential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = credential.user;

            // Update profile
            await user.updateProfile({ displayName });

            // Send verification email
            await user.sendEmailVerification();

            // Create user document in Firestore
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

            // Check email verification
            if (!user.emailVerified) {
                await user.sendEmailVerification();
                throw new Error('يرجى تفعيل بريدك الإلكتروني أولاً. تم إرسال رابط التفعيل مرة أخرى.');
            }

            console.log('✅ Login successful');
            return { success: true, user };
            
        } catch (error) {
            console.error('❌ Login error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Google Sign-In
    async signInWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: 'select_account'
            });
            
            const result = await this.auth.signInWithPopup(provider);
            const user = result.user;

            // Check if user document exists, create if not
            const userDoc = await this.db.collection(collections.users).doc(user.uid).get();
            
            if (!userDoc.exists) {
                // Generate unique username from display name
                const baseUsername = user.displayName
                    ?.replace(/\s+/g, '_')
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '') || 'user';
                
                let username = baseUsername;
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
            provider.setCustomParameters({
                locale: 'ar'
            });
            
            const result = await this.auth.signInWithPopup(provider);
            console.log('✅ Apple sign-in successful');
            return { success: true, user: result.user };
            
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
            
            // Re-authenticate first
            const credential = firebase.auth.EmailAuthProvider.credential(
                user.email,
                currentPassword
            );
            await user.reauthenticateWithCredential(credential);
            
            // Update password
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
            
            // Re-authenticate
            const credential = firebase.auth.EmailAuthProvider.credential(
                user.email,
                password
            );
            await user.reauthenticateWithCredential(credential);
            
            // Delete user data from Firestore
            await this.db.collection(collections.users).doc(user.uid).delete();
            
            // Delete auth account
            await user.delete();
            
            console.log('✅ Account deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Delete account error:', error);
            throw this.handleAuthError(error);
        }
    }

    // Create user document in Firestore
    async createUserDocument(user, displayName, username) {
        const userData = {
            uid: user.uid,
            email: user.email,
            displayName,
            username: username.toLowerCase(),
            photoURL: user.photoURL || null,
            profileUrl: `mstkhby.com/${username.toLowerCase()}`,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: firebase.firestore.FieldValue.serverTimestamp(),
            isVerified: false,
            plan: 'free',
            settings: {
                privacyLevel: 'medium', // low, medium, high
                allowMessages: true,
                allowMedia: true,
                autoDeleteReadMessages: false,
                autoDeleteDays: 30,
                notifications: {
                    push: true,
                    email: false
                }
            },
            stats: {
                totalMessagesReceived: 0,
                totalReactions: 0
            },
            status: 'active'
        };

        await this.db.collection(collections.users).doc(user.uid).set(userData);
        
        // Create username index for uniqueness
        await this.db.collection('usernames').doc(username.toLowerCase()).set({
            uid: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // Check username availability
    async isUsernameAvailable(username) {
        const normalizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
        
        if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
            return false;
        }

        const doc = await this.db.collection('usernames').doc(normalizedUsername).get();
        return !doc.exists;
    }

    // Update last active timestamp
    async updateLastActive(uid) {
        try {
            await this.db.collection(collections.users).doc(uid).update({
                lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.warn('Failed to update last active:', error);
        }
    }

    // Get current user data
    async getCurrentUserData() {
        if (!this.currentUser) return null;
        
        try {
            const doc = await this.db.collection(collections.users)
                .doc(this.currentUser.uid)
                .get();
            
            return doc.exists ? doc.data() : null;
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
            await this.db.collection(collections.users)
                .doc(this.currentUser.uid)
                .update({
                    ...updates,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            console.log('✅ Profile updated successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Profile update error:', error);
            throw error;
        }
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
            const usernameDoc = await this.db.collection('usernames')
                .doc(normalizedUsername)
                .get();

            if (!usernameDoc.exists) {
                return null;
            }

            const uid = usernameDoc.data().uid;
            const userDoc = await this.db.collection(collections.users)
                .doc(uid)
                .get();

            return userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
        } catch (error) {
            console.error('Error getting user by username:', error);
            return null;
        }
    }
}

// Initialize and export
window.authService = new AuthService();
console.log('🔐 Auth service initialized');
