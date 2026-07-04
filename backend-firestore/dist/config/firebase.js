"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.db = exports.firebaseApp = void 0;
const admin = __importStar(require("firebase-admin"));
const env_1 = require("./env");
class FirebaseAdminSingleton {
    static instance;
    constructor() { }
    static getInstance() {
        if (!FirebaseAdminSingleton.instance) {
            if (admin.apps.length > 0) {
                FirebaseAdminSingleton.instance = admin.app();
            }
            else {
                const adminConfig = {};
                // Use explicit credentials if provided, otherwise fallback to GOOGLE_APPLICATION_CREDENTIALS or default ADC
                if (env_1.env.FIREBASE_PROJECT_ID && env_1.env.FIREBASE_CLIENT_EMAIL && env_1.env.FIREBASE_PRIVATE_KEY) {
                    // Replace escaped newlines if they are passed in via string
                    const privateKey = env_1.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
                    adminConfig.credential = admin.credential.cert({
                        projectId: env_1.env.FIREBASE_PROJECT_ID,
                        clientEmail: env_1.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: privateKey,
                    });
                    adminConfig.projectId = env_1.env.FIREBASE_PROJECT_ID;
                }
                try {
                    FirebaseAdminSingleton.instance = admin.initializeApp(adminConfig);
                    console.log(`✅ Firebase Admin initialized successfully [Project: ${FirebaseAdminSingleton.instance.options.projectId || 'Default/ADC'}]`);
                }
                catch (error) {
                    console.error('❌ Firebase Admin initialization failed:', error);
                    throw error;
                }
            }
        }
        return FirebaseAdminSingleton.instance;
    }
}
// Export the initialized app and commonly used services
exports.firebaseApp = FirebaseAdminSingleton.getInstance();
exports.db = exports.firebaseApp.firestore();
exports.auth = exports.firebaseApp.auth();
// Configure firestore settings if needed
exports.db.settings({ databaseId: 'default', ignoreUndefinedProperties: true });
