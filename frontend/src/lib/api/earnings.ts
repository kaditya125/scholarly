import { api } from './client';

/** Mirrors backend-firestore/src/types/earnings.ts. */
export const EARNING_TYPES = ['sale', 'commission', 'tax', 'refund', 'adjustment'] as const;
export type EarningType = (typeof EARNING_TYPES)[number];

export const EARNING_STATES = ['pending', 'eligible', 'processing', 'paid', 'failed', 'reversed'] as const;
export type EarningState = (typeof EARNING_STATES)[number];

export interface TeacherEarningEntry {
  id: string;
  teacherUid: string;
  classId: string;
  orderId: string;
  type: EarningType;
  amountPaise: number;
  state: EarningState;
  createdAt: unknown;
}

export interface TeacherEarningsSummary {
  balancePaise: number;
  paidPaise: number;
  entries: TeacherEarningEntry[];
}

export const PAYOUT_METHODS = ['upi', 'bank_transfer', 'cash', 'other'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export interface TeacherPayoutRecord {
  id: string;
  teacherUid: string;
  entryIds: string[];
  netPaise: number;
  method: PayoutMethod;
  reference: string | null;
  note: string | null;
  paidBy: string;
  createdAt: unknown;
}

export const earningsApi = {
  async get(): Promise<TeacherEarningsSummary> {
    const { data } = await api.get('/teacher/earnings');
    return data;
  },

  async listPayouts(): Promise<TeacherPayoutRecord[]> {
    const { data } = await api.get('/teacher/payouts');
    return data.payouts ?? [];
  },
};
