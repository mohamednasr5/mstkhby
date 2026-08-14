/**
 * ===================================
 * Mstkhby - Firebase Configuration
 * ===================================
 * 
 * Firebase SDK Configuration
 * Initialize Firebase services
 */

// Firebase Configuration - Replace with your actual config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "mstkhby-app.firebaseapp.com",
    projectId: "mstkhby-app",
    storageBucket: "mstkhby-app.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence for Firestore
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Firestore persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.warn('Firestore persistence not available in this browser');
        }
    });

// Collections References
const collections = {
    users: 'users',
    messages: 'messages',
    conversations: 'conversations',
    reports: 'reports',
    blocks: 'blocks',
    reactions: 'reactions'
};

// Sub-collections
const subCollections = {
    messageReplies: 'replies',
    messageReactions: 'reactions'
};

// Export for use in other modules
window.MstkhbyFirebase = {
    config: firebaseConfig,
    auth,
    db,
    storage,
    collections,
    subCollections
};

console.log('🔥 Firebase initialized successfully');
