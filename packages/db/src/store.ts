import { createClient } from "@libsql/client";
import { and, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { assignments, lectures } from "./schema.js";
import type { NewAssignment, NewLecture } from "./schema.js";

export type { DbAssignment, DbLecture, NewAssignment, NewLecture } from "./schema.js";

export type NotificationTier = "72h" | "24h" | "3h";

export type PendingNotification = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  url: string;
  deadlineAt: Date;
  type: "assignment" | "lecture";
  tier: NotificationTier;
};

const TIER_HOURS: Record<NotificationTier, number> = {
  "72h": 72,
  "24h": 24,
  "3h": 3,
};

let _db: ReturnType<typeof drizzle> | undefined;

function getDb(): ReturnType<typeof drizzle> {
  if (!_db) throw new Error("Database not initialized. Call initDb() first.");
  return _db;
}

/**
 * Initializes the libsql client and creates tables if they don't exist.
 * Must be called once before any other store function.
 */
export async function initDb(dbPath: string): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` });

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      course_name TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      due_at INTEGER,
      is_submitted INTEGER NOT NULL DEFAULT 0,
      notified_at_72h INTEGER,
      notified_at_24h INTEGER,
      notified_at_3h INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lectures (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      course_name TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      closes_at INTEGER,
      is_completed INTEGER NOT NULL DEFAULT 0,
      notified_at_72h INTEGER,
      notified_at_24h INTEGER,
      notified_at_3h INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);

  _db = drizzle(client, { schema: { assignments, lectures } });
}

export async function upsertAssignment(item: NewAssignment): Promise<void> {
  await getDb()
    .insert(assignments)
    .values(item)
    .onConflictDoUpdate({
      target: assignments.id,
      set: {
        courseName: item.courseName,
        title: item.title,
        url: item.url,
        dueAt: item.dueAt,
        isSubmitted: item.isSubmitted,
        updatedAt: item.updatedAt,
      },
    });
}

export async function upsertLecture(item: NewLecture): Promise<void> {
  await getDb()
    .insert(lectures)
    .values(item)
    .onConflictDoUpdate({
      target: lectures.id,
      set: {
        courseName: item.courseName,
        title: item.title,
        url: item.url,
        closesAt: item.closesAt,
        isCompleted: item.isCompleted,
        updatedAt: item.updatedAt,
      },
    });
}

export async function getPendingNotifications(): Promise<PendingNotification[]> {
  const db = getDb();
  const now = new Date();
  const pending: PendingNotification[] = [];

  for (const tier of ["72h", "24h", "3h"] as NotificationTier[]) {
    const cutoff = new Date(now.getTime() + TIER_HOURS[tier] * 60 * 60 * 1000);

    const notifiedAssignCol =
      tier === "72h"
        ? assignments.notifiedAt72h
        : tier === "24h"
          ? assignments.notifiedAt24h
          : assignments.notifiedAt3h;

    const pendingAssignments = await db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.isSubmitted, false),
          isNotNull(assignments.dueAt),
          lte(assignments.dueAt, cutoff),
          gt(assignments.dueAt, now),
          isNull(notifiedAssignCol),
        ),
      );

    for (const a of pendingAssignments) {
      pending.push({
        id: a.id,
        courseId: a.courseId,
        courseName: a.courseName,
        title: a.title,
        url: a.url,
        deadlineAt: a.dueAt as Date,
        type: "assignment",
        tier,
      });
    }

    const notifiedLectureCol =
      tier === "72h"
        ? lectures.notifiedAt72h
        : tier === "24h"
          ? lectures.notifiedAt24h
          : lectures.notifiedAt3h;

    const pendingLectures = await db
      .select()
      .from(lectures)
      .where(
        and(
          eq(lectures.isCompleted, false),
          isNotNull(lectures.closesAt),
          lte(lectures.closesAt, cutoff),
          gt(lectures.closesAt, now),
          isNull(notifiedLectureCol),
        ),
      );

    for (const l of pendingLectures) {
      pending.push({
        id: l.id,
        courseId: l.courseId,
        courseName: l.courseName,
        title: l.title,
        url: l.url,
        deadlineAt: l.closesAt as Date,
        type: "lecture",
        tier,
      });
    }
  }

  return pending;
}

export async function markNotified(
  id: string,
  type: "assignment" | "lecture",
  tier: NotificationTier,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  if (type === "assignment") {
    if (tier === "72h") {
      await db.update(assignments).set({ notifiedAt72h: now }).where(eq(assignments.id, id));
    } else if (tier === "24h") {
      await db.update(assignments).set({ notifiedAt24h: now }).where(eq(assignments.id, id));
    } else {
      await db.update(assignments).set({ notifiedAt3h: now }).where(eq(assignments.id, id));
    }
  } else {
    if (tier === "72h") {
      await db.update(lectures).set({ notifiedAt72h: now }).where(eq(lectures.id, id));
    } else if (tier === "24h") {
      await db.update(lectures).set({ notifiedAt24h: now }).where(eq(lectures.id, id));
    } else {
      await db.update(lectures).set({ notifiedAt3h: now }).where(eq(lectures.id, id));
    }
  }
}

export async function getUpcoming(limitHours = 168): Promise<
  Array<{
    type: "assignment" | "lecture";
    courseName: string;
    title: string;
    url: string;
    deadlineAt: Date;
  }>
> {
  const db = getDb();
  const now = new Date();
  const cutoff = new Date(now.getTime() + limitHours * 60 * 60 * 1000);
  const results = [];

  const upcomingAssignments = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.isSubmitted, false),
        isNotNull(assignments.dueAt),
        lte(assignments.dueAt, cutoff),
        gt(assignments.dueAt, now),
      ),
    );

  for (const a of upcomingAssignments) {
    results.push({
      type: "assignment" as const,
      courseName: a.courseName,
      title: a.title,
      url: a.url,
      deadlineAt: a.dueAt as Date,
    });
  }

  const upcomingLectures = await db
    .select()
    .from(lectures)
    .where(
      and(
        eq(lectures.isCompleted, false),
        isNotNull(lectures.closesAt),
        lte(lectures.closesAt, cutoff),
        gt(lectures.closesAt, now),
      ),
    );

  for (const l of upcomingLectures) {
    results.push({
      type: "lecture" as const,
      courseName: l.courseName,
      title: l.title,
      url: l.url,
      deadlineAt: l.closesAt as Date,
    });
  }

  return results.sort((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime());
}
