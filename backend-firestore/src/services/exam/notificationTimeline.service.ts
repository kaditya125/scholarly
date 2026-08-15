/**
 * Official Notification & Timeline Service
 * Extracts notification details from official notices and computes exam timeline countdowns.
 */

import * as crypto from 'crypto';
import { db } from '../../config/firebase';
import { callStructuredLLM } from '../ai/structuredLlm';
import {
  ExamMaster,
  ExamOfficialNotification,
  ExamTimelineCountdown,
} from '../../types/exam.types';

export class NotificationTimelineService {
  /**
   * Normalizes raw official notification text into structured notification model using structured LLM.
   */
  async extractNotificationData(
    exam: ExamMaster,
    cycleId: string,
    rawText: string,
    sourceUrl: string
  ): Promise<Partial<ExamOfficialNotification> & { contentHash: string }> {
    const contentHash = crypto.createHash('sha256').update(rawText).digest('hex');

    const systemPrompt = `You are an expert official notification parser for Indian competitive examinations.
Given the official notice text for ${exam.name} (${exam.shortName}) ${cycleId}, extract all important dates, vacancies, eligibility criteria, and fee structure into strict JSON.
Adhere strictly to this schema:
{
  "title": "string (Official Notification Title)",
  "advtNumber": "string or null",
  "importantDates": {
    "notificationReleaseDate": "YYYY-MM-DD or null",
    "applicationStartDate": "YYYY-MM-DD or null",
    "applicationEndDate": "YYYY-MM-DD or null",
    "feePaymentDeadline": "YYYY-MM-DD or null",
    "correctionWindow": { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" },
    "admitCardDate": "YYYY-MM-DD or null",
    "examStagesDates": [
      { "stageId": "tier_1", "stageName": "Tier I", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
    ],
    "resultDate": "YYYY-MM-DD or null"
  },
  "vacancies": {
    "total": number,
    "isTentative": boolean,
    "breakdownByCategory": { "UR": number, "OBC": number, "SC": number, "ST": number, "EWS": number },
    "breakdownByPost": [
      {
        "postCode": "string",
        "postName": "string",
        "department": "string",
        "vacancies": number,
        "ageLimit": { "min": number, "max": number },
        "qualifications": "string"
      }
    ]
  },
  "eligibility": {
    "ageLimit": {
      "min": number,
      "max": number,
      "asOnDate": "YYYY-MM-DD",
      "relaxations": [
        { "category": "OBC", "years": 3 },
        { "category": "SC", "years": 5 },
        { "category": "ST", "years": 5 },
        { "category": "PwD", "years": 10 }
      ]
    },
    "educationalQualifications": {
      "minimumDegree": "string",
      "cutoffDate": "YYYY-MM-DD"
    }
  },
  "feeStructure": {
    "general": number,
    "reserved": number,
    "female": number
  }
}
IMPORTANT: Use official numbers and exact dates mentioned in the text. If a date is not stated, set it to null.`;

    const prompt = `Official Notice Text for ${exam.shortName} ${cycleId}:\n\n${rawText.slice(0, 50000)}`;

    const result = await callStructuredLLM<Partial<ExamOfficialNotification>>({
      prompt,
      system: systemPrompt,
      validate: (data) =>
        data?.title && data?.importantDates
          ? { ok: true }
          : { ok: false, error: 'Missing title or importantDates in extracted notification' },
      label: `extract_notif_${exam.examId}_${cycleId}`,
    });

    if (!result.ok || !result.data) {
      throw new Error(`Failed to extract notification data: ${result.error || 'LLM parsing failed'}`);
    }

    return {
      ...result.data,
      examId: exam.examId,
      cycleId,
      sourceUrl,
      contentHash,
    };
  }

  /**
   * Saves or updates an official notification document in Firestore.
   */
  async saveNotification(
    examId: string,
    cycleId: string,
    notificationData: Partial<ExamOfficialNotification>,
    performedBy: string
  ): Promise<ExamOfficialNotification> {
    const notificationId =
      notificationData.notificationId ||
      `notif_${examId.toLowerCase()}_${cycleId}_${Date.now()}`;

    const now = Date.now();
    const docData: ExamOfficialNotification = {
      notificationId,
      examId,
      cycleId,
      notificationType: notificationData.notificationType || 'ADV_NOTIFICATION',
      advtNumber: notificationData.advtNumber,
      title: notificationData.title || `${examId} ${cycleId} Official Notification`,
      publishDate: notificationData.publishDate || now,
      sourceUrl: notificationData.sourceUrl || '',
      sourceDocumentHash: notificationData.sourceDocumentHash || '',
      importantDates: notificationData.importantDates || {},
      vacancies: notificationData.vacancies,
      eligibility: notificationData.eligibility,
      feeStructure: notificationData.feeStructure,
      status: notificationData.status || 'ACTIVE',
      createdAt: notificationData.createdAt || now,
      updatedAt: now,
    };

    await db.collection('exam_notifications').doc(notificationId).set(docData);
    return docData;
  }

  /**
   * Retrieves active official notification for an exam cycle.
   */
  async getActiveNotification(examId: string, cycleId?: string): Promise<ExamOfficialNotification | null> {
    const normalized = examId.trim().toUpperCase();
    let query: FirebaseFirestore.Query = db
      .collection('exam_notifications')
      .where('examId', '==', normalized)
      .where('status', '==', 'ACTIVE');

    if (cycleId) {
      query = query.where('cycleId', '==', cycleId);
    }

    try {
      const snapshot = await query.limit(1).get();
      if (!snapshot.empty) {
        return snapshot.docs[0].data() as ExamOfficialNotification;
      }
    } catch {
      // Fall through to seed fallback
    }

    const { CANONICAL_EXAM_SEEDS } = await import('./canonicalExamSeeds');
    const seed = CANONICAL_EXAM_SEEDS[normalized];
    if (seed && seed.notification) {
      return seed.notification;
    }
    return null;
  }

  /**
   * Computes countdown and timelines for an examination notification.
   */
  public computeTimeline(notification: ExamOfficialNotification): ExamTimelineCountdown[] {
    const timelines: ExamTimelineCountdown[] = [];
    const now = new Date();
    const nowMs = now.getTime();
    const dates = notification.importantDates || {};

    const evaluateDate = (
      targetDateStr: string | undefined,
      stageLabel: string,
      stageKey: string
    ) => {
      if (!targetDateStr) return;
      const target = new Date(targetDateStr);
      if (isNaN(target.getTime())) return;

      const diffMs = target.getTime() - nowMs;
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let status: 'UPCOMING' | 'ONGOING' | 'PASSED' = 'UPCOMING';
      if (daysRemaining < 0) status = 'PASSED';
      else if (daysRemaining === 0) status = 'ONGOING';

      let urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (daysRemaining >= 0 && daysRemaining <= 3) urgencyLevel = 'CRITICAL';
      else if (daysRemaining > 3 && daysRemaining <= 14) urgencyLevel = 'HIGH';
      else if (daysRemaining > 14 && daysRemaining <= 45) urgencyLevel = 'MEDIUM';

      timelines.push({
        examId: notification.examId,
        cycleId: notification.cycleId,
        currentStage: stageKey,
        daysRemaining: daysRemaining >= 0 ? daysRemaining : undefined,
        status,
        targetDate: targetDateStr,
        label: stageLabel,
        urgencyLevel,
      });
    };

    // 1. Application Window
    if (dates.applicationStartDate && dates.applicationEndDate) {
      evaluateDate(dates.applicationEndDate, 'Application Window Closes', 'APPLICATION_CLOSE');
    }

    // 2. Correction Window
    if (dates.correctionWindow?.endDate) {
      evaluateDate(dates.correctionWindow.endDate, 'Application Correction Closes', 'CORRECTION_CLOSE');
    }

    // 3. Admit Card Release
    if (dates.admitCardDate) {
      evaluateDate(dates.admitCardDate, 'Admit Card Release', 'ADMIT_CARD');
    }

    // 4. Exam Stages
    for (const stage of dates.examStagesDates || []) {
      evaluateDate(stage.startDate, `${stage.stageName} Examination`, stage.stageId);
    }

    // 5. Result Announcement
    if (dates.resultDate) {
      evaluateDate(dates.resultDate, 'Result Announcement', 'RESULT');
    }

    return timelines;
  }
}

export const notificationTimelineService = new NotificationTimelineService();
