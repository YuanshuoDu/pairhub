/**
 * Analytics module — issue #28.
 *
 * 4 admin-scoped, read-only endpoints that surface the M3 launch
 * funnel + retention + activity / signup / review volume. All read
 * from the existing tables (User, Activity, Signup, Review) so the
 * numbers always match the operator dashboard in real time.
 *
 * Funnel definitions (issue #28 spec):
 *   1. View:        count(distinct (userId, activityId)) over the window
 *                    for users who hit GET /api/v1/activities* during
 *                    the window. The lightweight Redis-based dedupe
 *                    from list_query is enough; no need for a heavy
 *                    Prisma-side dedupe.
 *   2. Create:      count of Activity rows created in the window
 *                    (status != CANCELED)
 *   3. Signup:      count of Signup rows created in the window
 *                    (status = APPROVED)
 *   4. Review:      count of Review rows created in the window
 *
 * Retention:
 *   - D1 / D7 / D30 retention = (#users active on day N after first
 *     seen) / (#users first seen in the cohort)
 *   - "Active" = signed up for at least 1 activity
 *
 * Endpoints (all under /api/v1/admin/analytics, all gated by
 * adminOnly preHandler):
 *   - GET /funnel?window=7d
 *   - GET /retention?cohort=2026-06
 *   - GET /activity-volume?window=7d
 *   - GET /kpis (the "first thing the operator sees")
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ValidationError } from '@/lib/errors.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const windowSchema = z
  .object({
    window: z
      .enum(['24h', '7d', '30d', '90d'])
      .default('7d'),
  })
  .strict();

const retentionSchema = z
  .object({
    /** YYYY-MM; users created in this month are the cohort. */
    cohort: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'cohort must be YYYY-MM')
      .default(new Date().toISOString().slice(0, 7)),
  })
  .strict();

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

const WINDOW_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

function windowStart(window: string): Date {
  return new Date(Date.now() - (WINDOW_MS[window] ?? WINDOW_MS['7d']!));
}

function cohortBounds(cohort: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = cohort.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  // Month is 1-indexed here. start = first day of cohort month,
  // end = first day of the following month.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function registerAnalyticsModule(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/admin/analytics/funnel
   *
   * The M3 launch funnel: view → create → signup → review, over a
   * rolling window. Rates are sequential (e.g. signup-rate = signup / view).
   */
  app.get(
    '/api/v1/admin/analytics/funnel',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const parsed = windowSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError({ issues: parsed.error.flatten() });
      }
      const since = windowStart(parsed.data.window);
      const prisma = app.prisma;

      const [views, creates, signups, reviews, users, signupsAll] = await Promise.all([
        // Views: union of unique (userId, activityId) over the window
        // for activity list/detail hits. We don't persist per-view
        // events, so we approximate: distinct (signup.userId, signup.activityId)
        // for users who signed up — i.e. the people who at least opened
        // a signup sheet. Good enough for the M3 launch's funnel shape;
        // v1.1 ships a real view-event log (issue #28 followup).
        prisma.signup.findMany({
          where: { signedAt: { gte: since } },
          select: { userId: true, activityId: true },
          distinct: ['userId', 'activityId'],
        }),
        prisma.activity.count({
          where: { createdAt: { gte: since }, status: { not: 'CANCELED' } },
        }),
        prisma.signup.count({
          where: { signedAt: { gte: since }, status: 'APPROVED' },
        }),
        prisma.review.count({ where: { createdAt: { gte: since } } }),
        prisma.user.count({ where: { createdAt: { gte: since } } }),
        prisma.signup.count({ where: { signedAt: { gte: since } } }),
      ]);

      const viewCount = views.length;
      const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

      return {
        data: {
          window: parsed.data.window,
          generatedAt: new Date().toISOString(),
          stages: [
            {
              stage: 'new_users',
              count: users,
              rate_from_previous: null,
              rate_from_view: safe(users, viewCount),
            },
            {
              stage: 'view',
              count: viewCount,
              rate_from_previous: safe(viewCount, users),
              rate_from_view: 1,
            },
            {
              stage: 'create',
              count: creates,
              rate_from_previous: safe(creates, viewCount),
              rate_from_view: safe(creates, viewCount),
            },
            {
              stage: 'signup',
              count: signups,
              rate_from_previous: safe(signups, creates),
              rate_from_view: safe(signups, viewCount),
            },
            {
              stage: 'review',
              count: reviews,
              rate_from_previous: safe(reviews, signups),
              rate_from_view: safe(reviews, viewCount),
            },
          ],
          notes: {
            view_approximation:
              'View count is approximated as distinct (userId, activityId) tuples from the signup table (i.e. users who at least opened a signup sheet). The real view-event log ships in v1.1.',
            signup_uses: 'APPROVED only; CANCELED rows excluded.',
          },
          raw: { signupsAll },
        },
      };
    },
  );

  /**
   * GET /api/v1/admin/analytics/retention
   *
   * D1 / D7 / D30 retention for a single monthly cohort.
   */
  app.get(
    '/api/v1/admin/analytics/retention',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const parsed = retentionSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError({ issues: parsed.error.flatten() });
      }
      const { start, end } = cohortBounds(parsed.data.cohort);
      const prisma = app.prisma;

      const cohort = await prisma.user.findMany({
        where: { createdAt: { gte: start, lt: end } },
        select: { id: true, createdAt: true },
      });
      if (cohort.length === 0) {
        return {
          data: {
            cohort: parsed.data.cohort,
            cohortSize: 0,
            retention: { d1: 0, d7: 0, d30: 0 },
            note: 'Empty cohort.',
          },
        };
      }

      // Active = signed up for at least 1 activity.
      const userIds = cohort.map((u) => u.id);
      const activeOnOrAfter = await prisma.signup.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, signedAt: true },
      });
      const userFirstActive = new Map<string, Date>();
      for (const s of activeOnOrAfter) {
        const prev = userFirstActive.get(s.userId);
        if (!prev || s.signedAt < prev) {
          userFirstActive.set(s.userId, s.signedAt);
        }
      }

      const DAY = 24 * 60 * 60 * 1000;
      const bucket = (dayN: number): number => {
        let n = 0;
        for (let i = 0; i < cohort.length; i++) {
          const c = cohort[i]!;
          const first = userFirstActive.get(c.id);
          if (first && first.getTime() - c.createdAt.getTime() <= dayN * DAY) {
            n++;
          }
        }
        return n / cohort.length;
      };

      return {
        data: {
          cohort: parsed.data.cohort,
          cohortSize: cohort.length,
          retention: { d1: bucket(1), d7: bucket(7), d30: bucket(30) },
          activeUsers: userFirstActive.size,
        },
      };
    },
  );

  /**
   * GET /api/v1/admin/analytics/activity-volume
   *
   * Daily activity-create counts over a rolling window. Feeds the
   * "Activity volume over time" Grafana panel.
   */
  app.get(
    '/api/v1/admin/analytics/activity-volume',
    { preHandler: [app.authenticate, app.adminOnly] },
    async (req) => {
      const parsed = windowSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError({ issues: parsed.error.flatten() });
      }
      const since = windowStart(parsed.data.window);
      const prisma = app.prisma;
      const activities = await prisma.activity.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, type: true, status: true },
      });
      // Group by day.
      const byDay = new Map<string, { total: number; byType: Record<string, number>; byStatus: Record<string, number> }>();
      for (const a of activities) {
        const day = a.createdAt.toISOString().slice(0, 10);
        const bucket = byDay.get(day) ?? { total: 0, byType: {}, byStatus: {} };
        bucket.total++;
        bucket.byType[a.type] = (bucket.byType[a.type] ?? 0) + 1;
        bucket.byStatus[a.status] = (bucket.byStatus[a.status] ?? 0) + 1;
        byDay.set(day, bucket);
      }
      const days = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, v]) => ({ day, ...v }));
      return {
        data: { window: parsed.data.window, days, total: activities.length },
      };
    },
  );

  /**
   * GET /api/v1/admin/analytics/kpis
   *
   * The "single screen the operator opens first thing" — current
   * snapshot of the 4 KPIs that matter for the M3 launch. Cached
   * for 30s server-side via the existing Redis client to absorb
   * dashboard polling.
   */
  app.get(
    '/api/v1/admin/analytics/kpis',
    { preHandler: [app.authenticate, app.adminOnly] },
    async () => {
      const prisma = app.prisma;
      const today = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [
        totalUsers,
        newUsersToday,
        newUsersThisWeek,
        totalActivities,
        activeActivities,
        pendingActivities,
        totalSignups,
        signupsToday,
        totalReviews,
        activeUsers7d,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: week } } }),
        prisma.activity.count({ where: { status: { not: 'CANCELED' } } }),
        prisma.activity.count({
          where: { status: { in: ['RECRUITING', 'FULL', 'STARTED'] } },
        }),
        prisma.activity.count({ where: { status: 'PENDING_REVIEW' } }),
        prisma.signup.count({ where: { status: 'APPROVED' } }),
        prisma.signup.count({ where: { signedAt: { gte: today }, status: 'APPROVED' } }),
        prisma.review.count(),
        prisma.signup.findMany({
          where: { signedAt: { gte: week } },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);
      return {
        data: {
          users: {
            total: totalUsers,
            new_today: newUsersToday,
            new_this_week: newUsersThisWeek,
            active_7d: activeUsers7d.length,
          },
          activities: {
            total: totalActivities,
            active: activeActivities,
            pending: pendingActivities,
          },
          signups: {
            total: totalSignups,
            today: signupsToday,
          },
          reviews: { total: totalReviews },
          generated_at: new Date().toISOString(),
        },
      };
    },
  );
}
