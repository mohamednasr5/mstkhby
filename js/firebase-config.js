/**
 * ===================================
 * Mstkhby - Firebase Configuration
 * ===================================
 * 
 * Firebase SDK Configuration - Realtime Database
 * Initialize Firebase services with real credentials
 *
 * Storage note: media/documents are NOT stored in Firebase Storage.
 * They're uploaded to Cloudflare R2 through the Worker API
 * (see js/media-api.js + api/workers/api.js). Only Auth and the
 * Realtime Database are Firebase services here.
 */

// Firebase Configuration - Real Credentials
const firebaseConfig = {
    apiKey: "AIzaSyB9Z_8Zk_bfAUvfFgvoXZ8oAjF9se1eE_Q",
    authDomain: "mstkhby-5687e.firebaseapp.com",
    projectId: "mstkhby-5687e",
    storageBucket: "mstkhby-5687e.firebasestorage.app",
    messagingSenderId: "729615485073",
    appId: "1:729615485073:web:37352838e88a9dba531730",
    measurementId: "G-VXZT987GQW"
};

// The Worker API base URL (Cloudflare Workers). Update this to your
// deployed Worker's URL (or custom domain) before going to production.
const API_BASE_URL = 'https://mstkhby.nonm1724.workers.dev';

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const database = firebase.database(); // Realtime Database (not Firestore)

// Initialize Analytics if available
let analytics = null;
try {
    analytics = firebase.analytics();
} catch (e) {
    console.log('Analytics not available');
}

// Realtime Database References
const dbRef = {
    users: database.ref('users'),
    usernames: database.ref('usernames'),
    messages: database.ref('messages'),
    messagesByRecipient: database.ref('messagesByRecipient'),
    messagesBySender: database.ref('messagesBySender'),
    conversations: database.ref('conversations'),
    verifications: database.ref('verifications'),
    blocks: database.ref('blocks'),
    reports: database.ref('reports'),
    analyticsEvents: database.ref('analyticsEvents'),
    subscriptions: database.ref('subscriptions'),
    payments: database.ref('payments'),
    settings: database.ref('settings')
};

// Helper function to get user reference
function getUserRef(uid) {
    return database.ref(`users/${uid}`);
}

// Helper function to get user profile reference
function getUserProfileRef(uid) {
    return database.ref(`users/${uid}/profile`);
}

// Helper function to get user subscriptions
function getUserSubscriptionsRef(uid) {
    return database.ref(`users/${uid}/subscriptions`);
}

// Helper function to get user payments
function getUserPaymentsRef(uid) {
    return database.ref(`users/${uid}/payments`);
}

// Get the current user's Firebase ID token, for calling the Worker API
async function getIdToken(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
}

// Export for use in other modules
window.MstkhbyFirebase = {
    config: firebaseConfig,
    apiBaseUrl: API_BASE_URL,
    auth,
    database,      // Realtime Database instance
    dbRef,         // Database references
    analytics,
    helpers: {
        getUserRef,
        getUserProfileRef,
        getUserSubscriptionsRef,
        getUserPaymentsRef,
        getIdToken
    }
};

console.log('🔥 Firebase (Realtime DB) initialized successfully');
