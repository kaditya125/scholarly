/**
 * Eligibility Checker Service
 * Evaluates student eligibility against official examination criteria, post-wise requirements,
 * cutoff dates, category relaxations, and fee rules.
 */

import {
  ExamOfficialNotification,
  StudentEligibilityInput,
  StudentEligibilityEvaluation,
  PostVacancy,
} from '../../types/exam.types';

export class EligibilityCheckerService {
  /**
   * Computes age in fractional years as on a given reference date string (YYYY-MM-DD).
   */
  public calculateAgeAsOn(dobStr: string, asOnDateStr: string): number {
    const dob = new Date(dobStr);
    const asOn = new Date(asOnDateStr);

    if (isNaN(dob.getTime()) || isNaN(asOn.getTime())) {
      throw new Error(`Invalid date format for DOB (${dobStr}) or Cutoff Date (${asOnDateStr})`);
    }

    let years = asOn.getFullYear() - dob.getFullYear();
    const m = asOn.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && asOn.getDate() < dob.getDate())) {
      years--;
    }

    return years;
  }

  /**
   * Evaluates student profile against an official exam notification's eligibility criteria.
   */
  public evaluateEligibility(
    notification: ExamOfficialNotification,
    student: StudentEligibilityInput
  ): StudentEligibilityEvaluation {
    const reasons: string[] = [];
    const eligiblePosts: string[] = [];
    const ineligiblePosts: { postName: string; reason: string }[] = [];

    const eligibility = notification.eligibility;
    if (!eligibility) {
      return {
        isEligible: true,
        reasons: ['No explicit eligibility constraints registered in this notification.'],
        calculatedAge: 0,
        cutoffDate: '',
        categoryRelaxationYears: 0,
        applicableMaxAge: 0,
        feeAmount: 0,
        eligiblePosts: [],
        ineligiblePosts: [],
      };
    }

    // 1. Calculate Age
    const cutoffDate = eligibility.ageLimit.asOnDate || '2026-08-01';
    const calculatedAge = this.calculateAgeAsOn(student.dob, cutoffDate);

    // 2. Category Age Relaxation
    let categoryRelaxationYears = 0;
    const studentCategory = (student.category || 'UR').toUpperCase();

    if (eligibility.ageLimit.relaxations) {
      const matchedRule = eligibility.ageLimit.relaxations.find(
        (r) => r.category.toUpperCase() === studentCategory
      );
      if (matchedRule) {
        categoryRelaxationYears = matchedRule.years;
      }
    } else {
      // Standard Government of India Default Relaxations
      if (studentCategory === 'OBC') categoryRelaxationYears = 3;
      else if (studentCategory === 'SC' || studentCategory === 'ST') categoryRelaxationYears = 5;
      else if (studentCategory === 'PWD' || studentCategory === 'PWBD') categoryRelaxationYears = 10;
    }

    const applicableMinAge = eligibility.ageLimit.min;
    const applicableMaxAge = eligibility.ageLimit.max + categoryRelaxationYears;

    let ageEligible = true;
    if (calculatedAge < applicableMinAge) {
      ageEligible = false;
      reasons.push(
        `Underage: Age as on ${cutoffDate} is ${calculatedAge} years, which is less than the minimum required age of ${applicableMinAge} years.`
      );
    } else if (calculatedAge > applicableMaxAge) {
      ageEligible = false;
      reasons.push(
        `Overage: Age as on ${cutoffDate} is ${calculatedAge} years, exceeding the maximum permissible age of ${applicableMaxAge} years (including ${categoryRelaxationYears} yrs category relaxation).`
      );
    }

    // 3. Education Qualification Check
    let eduEligible = true;
    const minDegree = eligibility.educationalQualifications.minimumDegree.toLowerCase();

    if (minDegree.includes('bachelor') || minDegree.includes('graduate') || minDegree.includes('degree')) {
      if (!student.hasDegreeCompleted) {
        eduEligible = false;
        reasons.push(
          `Educational qualification requirement: Bachelor's degree from a recognized university is mandatory.`
        );
      }
    }

    // 4. Fee Calculation
    let feeAmount = notification.feeStructure?.general ?? 100;
    const gender = (student.gender || 'MALE').toUpperCase();

    if (gender === 'FEMALE') {
      feeAmount = notification.feeStructure?.female ?? 0;
    } else if (['SC', 'ST', 'PWD', 'PWBD', 'ESM'].includes(studentCategory)) {
      feeAmount = notification.feeStructure?.reserved ?? 0;
    }

    // 5. Post-wise Evaluation
    const posts: PostVacancy[] = notification.vacancies?.breakdownByPost || [];
    for (const post of posts) {
      const postMinAge = post.ageLimit?.min ?? applicableMinAge;
      const postMaxAge = (post.ageLimit?.max ?? eligibility.ageLimit.max) + categoryRelaxationYears;

      if (calculatedAge < postMinAge) {
        ineligiblePosts.push({
          postName: post.postName,
          reason: `Underage for post: requires minimum ${postMinAge} years (candidate is ${calculatedAge} yrs).`,
        });
      } else if (calculatedAge > postMaxAge) {
        ineligiblePosts.push({
          postName: post.postName,
          reason: `Overage for post: maximum allowed is ${postMaxAge} years with relaxation (candidate is ${calculatedAge} yrs).`,
        });
      } else if (!eduEligible) {
        ineligiblePosts.push({
          postName: post.postName,
          reason: `Degree qualification criteria not satisfied.`,
        });
      } else {
        eligiblePosts.push(post.postName);
      }
    }

    const overallEligible = ageEligible && eduEligible;
    if (overallEligible && reasons.length === 0) {
      reasons.push(
        `Eligible: Age ${calculatedAge} yrs satisfies age bracket [${applicableMinAge}-${applicableMaxAge}] as on ${cutoffDate}. Qualifications satisfied.`
      );
    }

    return {
      isEligible: overallEligible,
      reasons,
      calculatedAge,
      cutoffDate,
      categoryRelaxationYears,
      applicableMaxAge,
      feeAmount,
      eligiblePosts,
      ineligiblePosts,
    };
  }
}

export const eligibilityCheckerService = new EligibilityCheckerService();
