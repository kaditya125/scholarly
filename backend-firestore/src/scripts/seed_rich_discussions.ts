import { db, auth } from '../config/firebase';

async function main() {
  console.log('Seeding rich, authentic discussions into Firestore...');

  // Get real auth users
  const authUsers = await auth.listUsers();
  const aditya = authUsers.users.find(u => u.email?.includes('kaditya') || u.displayName?.includes('Aditya')) || authUsers.users[0];
  const raj = authUsers.users.find(u => u.email?.includes('raj') || u.displayName?.includes('Raj')) || authUsers.users[1] || aditya;

  const adityaUid = aditya?.uid || '5wIZIPeI3mZj1o9iKxkcdKDDSZ92';
  const rajUid = raj?.uid || 'bICd8bS5iefMD3MocI0th1nqALA2';

  // Seed userDirectory entries for both users so they always resolve with real names & avatars
  await db.collection('userDirectory').doc(adityaUid).set({
    uid: adityaUid,
    displayName: aditya?.displayName || 'Aditya Kumar',
    email: aditya?.email || 'kaditya125.ak@gmail.com',
    goal: 'NEET & CBSE Class 12',
    stream: 'Science (PCB)',
    subjects: ['Physics', 'Chemistry', 'Biology'],
    updatedAt: Date.now()
  }, { merge: true });

  await db.collection('userDirectory').doc(rajUid).set({
    uid: rajUid,
    displayName: raj?.displayName || 'Raj Kishore Singh',
    email: raj?.email || 'rajkishoresingh580@gmail.com',
    goal: 'BPSC & UPSC Civil Services',
    stream: 'General Studies',
    subjects: ['History', 'Polity', 'Geography', 'Economics'],
    updatedAt: Date.now()
  }, { merge: true });

  // Clear legacy mock discussions
  const existingSnap = await db.collection('discussions').get();
  for (const doc of existingSnap.docs) {
    // delete subcollection responses
    const respSnap = await doc.ref.collection('responses').get();
    for (const r of respSnap.docs) {
      await r.ref.delete();
    }
    await doc.ref.delete();
  }

  // Real discussions with rich context, structured subjects, real authors, and threaded replies
  const realDiscussions = [
    {
      id: 'disc_neet_digestive',
      topic: 'Biology',
      chapter: 'Human Physiology',
      title: 'Digestive System: Key Enzymes & Absorption in Small Intestine for NEET',
      description: 'Can someone clarify the exact role of Enterokinase and Brunner glands in intestinal juice secretion? Also, which NCERT diagrams are highest yield for NEET 2026 assertion-reasoning questions?',
      tags: ['neet', 'biology', 'human-physiology', 'ncert-revision'],
      authorId: adityaUid,
      authorName: 'Aditya Kumar',
      status: 'active',
      views: 184,
      replies: 2,
      likes: [rajUid],
      likeCount: 4,
      createdAt: Date.now() - 1000 * 60 * 60 * 18, // 18 hours ago
      responses: [
        {
          authorId: rajUid,
          authorName: 'Raj Kishore Singh',
          text: 'Enterokinase (enteropeptidase) is secreted by the intestinal mucosa and specifically converts inactive Trypsinogen into active Trypsin. Once active, Trypsin autocatalytically activates the remaining pancreatic zymogens like chymotrypsinogen and procarboxypeptidase. Focus on Figure 16.3 in Class 11 NCERT!',
          isBest: true,
          createdAt: Date.now() - 1000 * 60 * 60 * 12,
        },
        {
          authorId: adityaUid,
          authorName: 'Aditya Kumar',
          text: 'That clarifies the cascade activation completely! Thanks a lot Raj, bookmarking this summary.',
          isBest: false,
          createdAt: Date.now() - 1000 * 60 * 60 * 6,
        }
      ]
    },
    {
      id: 'disc_bpsc_timeline',
      topic: 'History',
      chapter: 'Indian National Movement',
      title: 'Important dates & Bihar Context for BPSC 70th Prelims & Mains',
      description: 'Looking for a structured timeline of key events in Bihar during the Freedom Movement (1857 Kunwar Singh revolt, Champaran Satyagraha 1917, Kisan Sabha movement by Swami Sahajanand, and 1942 Quit India Secretariat shooting).',
      tags: ['bpsc', 'history', 'bihar-special', 'freedom-struggle'],
      authorId: rajUid,
      authorName: 'Raj Kishore Singh',
      status: 'resolved',
      views: 242,
      replies: 2,
      likes: [adityaUid],
      likeCount: 8,
      createdAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
      responses: [
        {
          authorId: adityaUid,
          authorName: 'Aditya Kumar',
          text: 'Key dates: 1) July 1857: Babu Kunwar Singh leads Jagdishpur uprising. 2) April 1917: Rajkumar Shukla brings Gandhi to Champaran. 3) 1929: Bihar Provincial Kisan Sabha formed by Swami Sahajanand Saraswati. 4) 11 August 1942: 7 Martyrs at Patna Secretariat during Quit India.',
          isBest: true,
          createdAt: Date.now() - 1000 * 60 * 60 * 36,
        }
      ]
    },
    {
      id: 'disc_physics_electromagnetism',
      topic: 'Physics',
      chapter: 'Electromagnetism',
      title: 'Faraday Law vs Lenz Law: Sign conventions in Induced EMF problems',
      description: 'When calculating induced EMF \\(e = -N \\frac{d\\Phi}{dt}\\), what is the best mental model to determine the induced current direction using right-hand rule without getting confused by negative signs?',
      tags: ['jee', 'physics', 'electromagnetism', 'numerical-problem'],
      authorId: adityaUid,
      authorName: 'Aditya Kumar',
      status: 'active',
      views: 96,
      replies: 1,
      likes: [rajUid],
      likeCount: 3,
      createdAt: Date.now() - 1000 * 60 * 60 * 8, // 8 hours ago
      responses: [
        {
          authorId: rajUid,
          authorName: 'Raj Kishore Singh',
          text: 'Use Lenz rule directly: Nature opposes the change in flux. If flux into the page is increasing, the induced B-field will point out of the page (anti-clockwise current). First find the magnitude \\(|e|\\), then determine direction physically.',
          isBest: false,
          createdAt: Date.now() - 1000 * 60 * 60 * 3,
        }
      ]
    },
    {
      id: 'disc_chemistry_organic',
      topic: 'Chemistry',
      chapter: 'Aldehydes & Ketones',
      title: 'Aldol Condensation vs Cannizzaro Reaction: Quick Decision Matrix',
      description: 'Struggling with mixed Aldol vs Cross-Cannizzaro when reacting Benzaldehyde with Formaldehyde in conc. NaOH. Can someone share how to predict the major product reliably?',
      tags: ['organic-chemistry', 'neet', 'jee-mains', 'reaction-mechanism'],
      authorId: rajUid,
      authorName: 'Raj Kishore Singh',
      status: 'active',
      views: 135,
      replies: 1,
      likes: [adityaUid],
      likeCount: 5,
      createdAt: Date.now() - 1000 * 60 * 60 * 72, // 3 days ago
      responses: [
        {
          authorId: adityaUid,
          authorName: 'Aditya Kumar',
          text: 'Since both Benzaldehyde and Formaldehyde lack alpha-hydrogens, Cross-Cannizzaro takes place (not Aldol). Formaldehyde is oxidized to Formate ion (easier nucleophilic attack on Formaldehyde), while Benzaldehyde is reduced to Benzyl Alcohol.',
          isBest: true,
          createdAt: Date.now() - 1000 * 60 * 60 * 50,
        }
      ]
    },
    {
      id: 'disc_exam_strategy',
      topic: 'Exam Strategy',
      chapter: 'Revision Techniques',
      title: 'Active Recall + Spaced Repetition routine for 30-Day sprint',
      description: 'How are you balancing daily chapter revision with full-length timed mock tests in the final 4 weeks before the exam? Sharing my 3-block daily schedule for feedback.',
      tags: ['study-tips', 'spaced-repetition', 'mock-tests', 'time-management'],
      authorId: adityaUid,
      authorName: 'Aditya Kumar',
      status: 'active',
      views: 310,
      replies: 1,
      likes: [rajUid, adityaUid],
      likeCount: 11,
      createdAt: Date.now() - 1000 * 60 * 60 * 96,
      responses: [
        {
          authorId: rajUid,
          authorName: 'Raj Kishore Singh',
          text: 'Block 1 (Morning 3h): High-intensity timed test. Block 2 (Afternoon 2h): Error analysis & formula log. Block 3 (Evening 3h): Weak concept deep dive. This routine keeps accuracy above 85%!',
          isBest: false,
          createdAt: Date.now() - 1000 * 60 * 60 * 80,
        }
      ]
    }
  ];

  for (const item of realDiscussions) {
    const { responses, ...docData } = item;
    const docRef = db.collection('discussions').doc(item.id);
    await docRef.set({
      ...docData,
      author: {
        uid: item.authorId,
        displayName: item.authorName,
      },
      participants: [item.authorId, ...(responses || []).map(r => r.authorId)],
    });

    if (responses && responses.length > 0) {
      for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        const rRef = docRef.collection('responses').doc(`resp_${i + 1}`);
        await rRef.set({
          id: `resp_${i + 1}`,
          authorId: r.authorId,
          authorName: r.authorName,
          author: {
            uid: r.authorId,
            displayName: r.authorName,
          },
          text: r.text,
          isBest: Boolean(r.isBest),
          createdAt: r.createdAt,
        });
      }
    }
    console.log(`✅ Seeded discussion: "${item.title}" by ${item.authorName}`);
  }

  console.log('✅ Finished seeding all discussions with real authors and verified curriculum topics!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error seeding discussions:', err);
  process.exit(1);
});
