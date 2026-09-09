import { Request, Response, NextFunction } from 'express';
import { bookLibraryService } from '../services/bookLibrary.service';
import { SourceService } from '../services/source.service';

export class BookLibraryController {
  /** GET /documents/books — the full public catalog (any authenticated student). */
  public listBooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const books = await bookLibraryService.listBooks();
      res.json(books);
    } catch (error) {
      next(error);
    }
  };

  /** GET /documents/books/:notebookId — chapter breakdown for one book. */
  public getBookDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { notebookId } = req.params;
      const detail = await bookLibraryService.getBookDetail(notebookId);
      if (!detail) return res.status(404).json({ error: 'Book not found' });
      res.json(detail);
    } catch (error) {
      next(error);
    }
  };

  /** GET /documents/books/:notebookId/cover — page-1 PDF bytes of the book's first chapter. */
  public getCover = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { notebookId } = req.params;
      await bookLibraryService.streamCover(notebookId, req, res);
    } catch (error) {
      next(error);
    }
  };

  /** GET /documents/books/:notebookId/chapters/:sourceId/pdf — full chapter PDF for the in-app reader. */
  public getChapterPdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { notebookId, sourceId } = req.params;
      await bookLibraryService.streamChapterPdf(notebookId, sourceId, res);
    } catch (error) {
      next(error);
    }
  };

  /** GET /documents/books/:notebookId/chapters/:sourceId/cover — page-1 PDF bytes of a chapter. */
  public getChapterCover = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { notebookId, sourceId } = req.params;
      await bookLibraryService.streamChapterCover(notebookId, sourceId, res);
    } catch (error) {
      next(error);
    }
  };

  /** POST /documents/books/:notebookId/chapters/:sourceId/generate — trigger async asset generation. */
  public generateChapterAssets = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { notebookId, sourceId } = req.params;
      const sourceService = new SourceService();
      // force=true means the caller is deliberately regenerating (the reader's Retry button).
      // Without it, generation skips assets this chapter already has — the reader fires this
      // endpoint automatically for any chapter that is not READY, so an unguarded call would
      // repeat all eight Gemini requests every time anyone opened it.
      const force = req.body?.force === true || req.query?.force === 'true';
      // Fire and forget: the client polls /status for progress.
      sourceService.asyncGenerateAssets(notebookId, sourceId, { force }).catch(console.error);
      res.status(202).json({ message: force ? 'Regeneration started' : 'Generation started', force });
    } catch (error) {
      next(error);
    }
  };

  /** GET /documents/books/:notebookId/chapters/:sourceId/status — fetch the generation status and generated article if READY. */
  public getChapterStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { notebookId, sourceId } = req.params;
      const { firebaseApp } = require('../config/firebase');
      const db = firebaseApp.firestore();
      
      const sourceDoc = await db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId).get();
      if (!sourceDoc.exists) {
        return res.status(404).json({ error: 'Source not found' });
      }
      
      const sourceData = sourceDoc.data();
      const status = sourceData.status || '';
      const chapterTitle = sourceData.title || '';
      
      console.log(`[bookLibrary.getChapterStatus] Fetching status for chapter: "${chapterTitle}" (sourceId: ${sourceId})`);
      
      let article = null;
      let youtubeVideos = [];
      /** Exam Mode's questions. Absent until asyncGenerateAssets has run for this chapter. */
      let examQuestions: any[] = [];
      if (status === 'READY' || status === 'READY_DEGRADED') {
        // Filter by the specific chapter's article title
        const expectedArticleTitle = `${chapterTitle} - Documentary Article`;
        console.log(`[bookLibrary.getChapterStatus] Looking for article with title: "${expectedArticleTitle}"`);
        
        const assetsSnap = await db.collection('notebooks').doc(notebookId).collection('assets')
          .where('type', '==', 'DOCUMENTARY_ARTICLE')
          .where('title', '==', expectedArticleTitle)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
          
        if (!assetsSnap.empty) {
          console.log(`[bookLibrary.getChapterStatus] Found DOCUMENTARY_ARTICLE for "${chapterTitle}"`);
          const assetData = assetsSnap.docs[0].data();
          if (assetData.content && assetData.content.article) {
            const art = assetData.content.article;
            const hasConcepts = art.sections && art.sections.some((s: any) => 
              s.concepts && s.concepts.some((c: any) => c.body && c.body.length > 0)
            );
            if (hasConcepts) {
              article = art;
            }
          }
        } else {
          console.log(`[bookLibrary.getChapterStatus] No DOCUMENTARY_ARTICLE found for "${expectedArticleTitle}"`);
        }
        
        if (!article) {
          console.log(`[bookLibrary.getChapterStatus] Trying SUMMARY fallback for "${chapterTitle}"`);
          // Fallback to SUMMARY if DOCUMENTARY_ARTICLE doesn't exist or is empty
          // Also filter by chapter title to avoid wrong summary
          const expectedSummaryTitle = `${chapterTitle} - Summary`;
          const sumSnap = await db.collection('notebooks').doc(notebookId).collection('assets')
            .where('type', '==', 'SUMMARY')
            .where('title', '==', expectedSummaryTitle)
            .limit(1)
            .get();
          if (!sumSnap.empty) {
            console.log(`[bookLibrary.getChapterStatus] Found SUMMARY for "${chapterTitle}", synthesizing article`);
            const sumData = sumSnap.docs[0].data();
            const summaryText = typeof sumData.content === 'string' 
              ? sumData.content 
              : (sumData.content?.body || sumData.content?.summary || sumData.title || '');
            
            const paragraphs = summaryText.split('\n\n').map((p: string) => p.trim()).filter((p: string) => p.length > 20);
            const lead = paragraphs[0] || `An editorial overview for ${sourceData.title || 'this chapter'}.`;
            const bodyParas = paragraphs.slice(1);
            
            article = {
              id: `fallback-${Date.now()}`,
              title: sourceData.title || 'Chapter Article',
              bookTitle: 'NCERT Textbook',
              subject: 'General',
              estimatedReadingTime: '15 mins',
              difficulty: 'Intermediate',
              leadParagraph: lead,
              sections: [
                {
                  id: 'sec-1',
                  title: `${sourceData.title || 'Chapter'} - Core Editorial Overview`,
                  ncertPageRef: 1,
                  intro: 'Comprehensive overview extracted from the official NCERT text.',
                  concepts: [
                    {
                      id: 'c-1',
                      heading: 'Key Concepts & Findings',
                      ncertPageRef: 1,
                      body: bodyParas.length > 0 ? bodyParas : [lead],
                      highlights: [],
                    }
                  ]
                }
              ],
              summary: {
                body: lead,
                keyPoints: []
              },
              flashcards: [],
              podcast: { episodeTitle: '', duration: '', tracks: [] }
            };
          } else {
            console.log(`[bookLibrary.getChapterStatus] No SUMMARY found for "${expectedSummaryTitle}"`);
          }
        }
        
        // Also fetch YOUTUBE_LINKS for THIS specific chapter
        const expectedTitle = `${sourceData.title} - Verified Videos`;
        console.log(`[bookLibrary] Searching for YouTube videos with title: "${expectedTitle}"`);
        const ytSnap = await db.collection('notebooks').doc(notebookId).collection('assets')
          .where('type', '==', 'YOUTUBE_LINKS')
          .where('title', '==', expectedTitle)
          .limit(1)
          .get();
        if (!ytSnap.empty) {
          const ytData = ytSnap.docs[0].data();
          if (ytData.content && ytData.content.videos) {
            youtubeVideos = ytData.content.videos;
            console.log(`[bookLibrary] Found ${youtubeVideos.length} YouTube videos for ${sourceData.title}`);
          }
        } else {
          console.log(`[bookLibrary] No YouTube videos found for "${sourceData.title}" (expected title: "${expectedTitle}")`);
          // Try to find any YOUTUBE_LINKS to see what titles exist
          const allYtSnap = await db.collection('notebooks').doc(notebookId).collection('assets')
            .where('type', '==', 'YOUTUBE_LINKS')
            .limit(5)
            .get();
          if (!allYtSnap.empty) {
            console.log(`[bookLibrary] Available YouTube asset titles in this notebook:`);
            allYtSnap.docs.forEach((doc: any) => {
              console.log(`  - "${doc.data().title}"`);
            });
          } else {
            console.log(`[bookLibrary] No YOUTUBE_LINKS assets found in notebook ${notebookId}`);
          }
        }
        // Exam Mode questions, written by asyncGenerateAssets under the EXAM_QUESTIONS spec.
        // Same title convention as every other asset: "<chapter> - <titleSuffix>".
        const expectedQuestionsTitle = `${sourceData.title} - Exam Questions`;
        const eqSnap = await db.collection('notebooks').doc(notebookId).collection('assets')
          .where('type', '==', 'EXAM_QUESTIONS')
          .where('title', '==', expectedQuestionsTitle)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        if (!eqSnap.empty) {
          const eqData = eqSnap.docs[0].data();
          if (Array.isArray(eqData?.content?.questions)) {
            examQuestions = eqData.content.questions;
            console.log(`[bookLibrary] Found ${examQuestions.length} exam questions for "${sourceData.title}"`);
          }
        } else {
          console.log(`[bookLibrary] No EXAM_QUESTIONS asset for "${expectedQuestionsTitle}"`);
        }
      }
      
      res.json({
        status,
        failureReason: sourceData.failureReason || null,
        errorDetails: sourceData.errorDetails || null,
        article,
        youtubeVideos,
        examQuestions
      });
    } catch (error) {
      next(error);
    }
  };
}

export const bookLibraryController = new BookLibraryController();
