import { db } from '../config/firebase';
import { notebookRepository } from '../repositories/notebook.repository';
import { sourceService } from '../services/source.service';
import * as fs from 'fs';

async function main() {
  // Get the first user from the database to assign ownership
  const usersSnap = await db.collection('users').limit(1).get();
  let userId = 'admin-user';
  if (!usersSnap.empty) {
    userId = usersSnap.docs[0].id;
    console.log(`Using user ID: ${userId} (${usersSnap.docs[0].data().email})`);
  } else {
    console.log("No users found. Creating a generic owner ID.");
  }

  const filePath = 'D:\\A Modern Approach to Verbal and Non Verbal Reasoning.pdf';
  if (!fs.existsSync(filePath)) {
    console.error("File not found at:", filePath);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(filePath);
  console.log(`Read file: ${filePath} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const notebookId = 'reasoning-notebook-1';
  
  // Create or get notebook
  const existing = await notebookRepository.getByIdAdmin(notebookId);
  if (!existing) {
    const now = Date.now();
    const notebook: any = {
      id: notebookId,
      userId: userId,
      owner: userId,
      title: `A Modern Approach to Verbal and Non Verbal Reasoning`,
      color: 'bg-indigo-500',
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      isPinned: false,
      isFavorite: true,
      isArchived: false,
      stats: { documentCount: 0, conversationCount: 0, storageUsedBytes: 0, knowledgeGraphNodes: 0, flashcardsCount: 0, quizCount: 0, masteryPercentage: 0, completionPercentage: 0 },
      learningGoals: [], weakTopics: [], strongTopics: [], auditLogs: [],
      editors: [], viewers: [],
      description: `Complete book on Verbal and Non Verbal Reasoning.`,
    };
    await notebookRepository.createNotebook(notebook);
    console.log("Created new notebook:", notebookId);
  } else {
    console.log("Using existing notebook:", notebookId);
  }

  const file: any = { 
    originalname: 'A Modern Approach to Verbal and Non Verbal Reasoning.pdf', 
    mimetype: 'application/pdf', 
    size: pdfBuffer.length, 
    buffer: pdfBuffer 
  };
  
  console.log(`Starting upload and processing pipeline...`);
  
  // Mock notebookService.getNotebookById validation by running as the owner
  const source = await sourceService.processUpload(notebookId, userId, file);
  console.log(`Source created with ID: ${source.id}. Status is PENDING.`);
  
  console.log(`Polling status...`);
  const start = Date.now();
  const ref = db.collection('notebooks').doc(notebookId).collection('sources').doc(source.id);
  
  let lastStatus = '';
  while (Date.now() - start < 300000) { // 5 minutes timeout
    const doc = await ref.get();
    const status = (doc.data() as any)?.status || 'UNKNOWN';
    if (status !== lastStatus) {
      console.log(`Status changed to: ${status}`);
      lastStatus = status;
    }
    if (status === 'READY' || status === 'FAILED') break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  
  console.log(`Finished processing with status: ${lastStatus}`);
  process.exit(0);
}

main().catch((e) => { 
  console.error('Ingest error:', e); 
  process.exit(1); 
});
