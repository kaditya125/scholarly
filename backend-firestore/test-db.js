const admin = require('firebase-admin');
const fs = require('fs');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    })
  });
}
const db = admin.firestore();

async function run() {
  const sessions = await db.collection('chat_sessions').get();
  console.log("Sessions count:", sessions.docs.length);
  for (const session of sessions.docs) {
    const msgs = await db.collection('chat_sessions').doc(session.id).collection('messages').get();
    console.log(`Session ${session.id} (model: ${session.data().selectedModel}): ${msgs.docs.length} messages`);
    msgs.docs.forEach(m => console.log(' -', m.data().role, ':', m.data().content.substring(0, 50).replace(/\n/g, ' ')));
  }
}
run().catch(console.error);
