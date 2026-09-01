import { Request, Response } from 'express';
import { adminStudentsService, StudentSort, SortDir } from '../services/adminStudents.service';
import { logger } from '../../utils/logger';

/**
 * Student administration endpoints.
 *
 * AUTHORISATION. None is performed here, deliberately. These handlers are mounted behind
 * `requireAdmin` in admin.routes.ts, which verifies the Firebase ID token's signature and
 * its role claim before any handler runs. Repeating the check here would create a second
 * place for the rule to live and drift from. What this file must never do is trust
 * anything in the request body or query about who the caller is.
 */
export class StudentsController {
  /**
   * GET /api/admin/students
   *
   * Query: cursor, limit, search, plan, subscriptionStatus, sort, dir, includeUsage
   *
   * Unknown or malformed values are rejected rather than coerced, so a typo in a filter
   * surfaces as an error instead of silently returning an unfiltered directory — which
   * would look like working software while showing the wrong thing.
   */
  list = async (req: Request, res: Response) => {
    try {
      const { cursor, search, plan, subscriptionStatus, sort, dir, includeUsage, limit } = req.query;

      if (plan && plan !== 'free' && plan !== 'pro') {
        return res.status(400).json({ error: "plan must be 'free' or 'pro'" });
      }
      const allowedSorts: StudentSort[] = ['createdAt', 'email', 'displayName'];
      if (sort && !allowedSorts.includes(String(sort) as StudentSort)) {
        return res.status(400).json({ error: `sort must be one of ${allowedSorts.join(', ')}` });
      }
      if (dir && dir !== 'asc' && dir !== 'desc') {
        return res.status(400).json({ error: "dir must be 'asc' or 'desc'" });
      }

      const result = await adminStudentsService.listStudents({
        cursor: cursor ? String(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        plan: plan as 'free' | 'pro' | undefined,
        subscriptionStatus: subscriptionStatus ? String(subscriptionStatus) : undefined,
        sort: sort as StudentSort | undefined,
        dir: dir as SortDir | undefined,
        includeUsage: includeUsage === 'true' || includeUsage === '1',
      });

      res.json(result);
    } catch (error) {
      const message = (error as Error).message;
      logger.error('admin.students.list failed', { message });

      /**
       * A missing composite index is the one failure an operator can act on directly, and
       * Firestore puts a one-click console URL in the message. Surfacing it beats a
       * generic 500 that sends them to the server logs to find the same string.
       */
      if (/FAILED_PRECONDITION|requires an index/i.test(message)) {
        return res.status(503).json({
          error: 'This combination of filter and sort needs a Firestore composite index that does not exist yet.',
          detail: message,
        });
      }
      res.status(500).json({ error: 'Failed to load students' });
    }
  };

  /**
   * GET /api/admin/students/stats
   *
   * Directory totals via Firestore COUNT aggregations. Separate from `list` so the table
   * can paginate without recomputing totals on every page turn.
   */
  stats = async (_req: Request, res: Response) => {
    try {
      res.json(await adminStudentsService.getStats());
    } catch (error) {
      const message = (error as Error).message;
      logger.error('admin.students.stats failed', { message });
      if (/FAILED_PRECONDITION|requires an index/i.test(message)) {
        return res.status(503).json({
          error: 'Student totals need a Firestore index that does not exist yet.',
          detail: message,
        });
      }
      res.status(500).json({ error: 'Failed to load student totals' });
    }
  };
}
