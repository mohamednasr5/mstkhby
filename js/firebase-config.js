/**
 * ===================================
 * Mstkhby - Firebase Configuration
 * ===================================
 * 
 * Firebase SDK Configuration - Realtime Database
 * Initialize Firebase services with real credentials
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const storage = firebase.storage();

// Firestore — this is the database actually used by auth.js / messages.js
// (they call .collection().doc()...), so it must be initialized here.
const db = firebase.firestore();

// Realtime Database — used separately by payments.js / payment-new.js /
// database-setup.js. Guarded in try/catch: if the project has no RTDB
// instance configured, this must not stop Firestore-based auth from working.
let database = null;
try {
    database = firebase.database();
} catch (e) {
    console.warn('⚠️ Realtime Database not available:', e.message);
}

// Firestore collection names used across auth.js / messages.js
const collections = {
    users: 'users',
    usernames: 'usernames',
    messages: 'messages',
    reports: 'reports',
    settings: 'settings'
};

// Initialize Analytics if available
let analytics = null;
try {
    analytics = firebase.analytics();
} catch (e) {
    console.log('Analytics not available');
}

// Realtime Database References (only meaningful if `database` initialized)
const dbRef = database ? {
    users: database.ref('users'),
    messages: database.ref('messages'),
    subscriptions: database.ref('subscriptions'),
    payments: database.ref('payments'),
    reports: database.ref('reports'),
    settings: database.ref('settings')
} : null;

// Helper function to get user reference
function getUserRef(uid) {
    return database?.ref(`users/${uid}`);
}

// Helper function to get user subscriptions
function getUserSubscriptionsRef(uid) {
    return database?.ref(`users/${uid}/subscriptions`);
}

// Helper function to get user payments
function getUserPaymentsRef(uid) {
    return database?.ref(`users/${uid}/payments`);
}

// Cloudflare Worker API (api/workers/api.js), bound to the "mstkhby" R2
// bucket — see api/workers/wrangler.toml. Deployed at:
window.MstkhbyConfig = {
    API_BASE_URL: 'https://mstkhby.nonm1724.workers.dev'
};

// Export for use in other modules
window.MstkhbyFirebase = {
    config: firebaseConfig,
    auth,
    db,            // Firestore instance — used by auth.js / messages.js
    collections,   // Firestore collection names
    database,      // Realtime Database instance (may be null)
    dbRef,         // Realtime Database references (may be null)
    storage,
    analytics,
    helpers: {
        getUserRef,
        getUserSubscriptionsRef,
        getUserPaymentsRef
    }
};

console.log('🔥 Firebase initialized successfully (Firestore + Realtime DB)');
