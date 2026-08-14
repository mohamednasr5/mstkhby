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
const database = firebase.database();  // Realtime Database (not Firestore)
const storage = firebase.storage();

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
    messages: database.ref('messages'),
    subscriptions: database.ref('subscriptions'),
    payments: database.ref('payments'),
    reports: database.ref('reports'),
    settings: database.ref('settings')
};

// Helper function to get user reference
function getUserRef(uid) {
    return database.ref(`users/${uid}`);
}

// Helper function to get user subscriptions
function getUserSubscriptionsRef(uid) {
    return database.ref(`users/${uid}/subscriptions`);
}

// Helper function to get user payments
function getUserPaymentsRef(uid) {
    return database.ref(`users/${uid}/payments`);
}

// Export for use in other modules
window.MstkhbyFirebase = {
    config: firebaseConfig,
    auth,
    database,      // Realtime Database instance
    dbRef,         // Database references
    storage,
    analytics,
    helpers: {
        getUserRef,
        getUserSubscriptionsRef,
        getUserPaymentsRef
    }
};

console.log('🔥 Firebase (Realtime DB) initialized successfully');
