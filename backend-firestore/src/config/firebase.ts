import * as admin from 'firebase-admin';
import { env } from './env';

class FirebaseAdminSingleton {
  private static instance: admin.app.App;

  private constructor() {}

  public static getInstance(): admin.app.App {
    if (!FirebaseAdminSingleton.instance) {
      if (admin.apps.length > 0) {
        FirebaseAdminSingleton.instance = admin.app();
      } else {
        const adminConfig: admin.AppOptions = {};

        // Use explicit credentials if provided, otherwise fallback to GOOGLE_APPLICATION_CREDENTIALS or default ADC
        if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
          // Replace escaped newlines if they are passed in via string
          const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
          adminConfig.credential = admin.credential.cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          });
          adminConfig.projectId = env.FIREBASE_PROJECT_ID;
        }  
        
        try {
          FirebaseAdminSingleton.instance = admin.initializeApp(adminConfig);
          console.log(`✅ Firebase Admin initialized successfully [Project: ${FirebaseAdminSingleton.instance.options.projectId || 'Default/ADC'}]`);
        } catch (error) {
          console.error('❌ Firebase Admin initialization failed:', error);
          throw error;
        }
      }
    }
    return FirebaseAdminSingleton.instance;
  }
}

// Export the initialized app and commonly used services
export const firebaseApp = FirebaseAdminSingleton.getInstance();
export const db = firebaseApp.firestore();
export const auth = firebaseApp.auth();

// Configure firestore settings if needed
db.settings({ databaseId: 'default', ignoreUndefinedProperties: true });
