import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  dueAt: integer("due_at", { mode: "timestamp" }),
  isSubmitted: integer("is_submitted", { mode: "boolean" }).notNull().default(false),
  notifiedAt72h: integer("notified_at_72h", { mode: "timestamp" }),
  notifiedAt24h: integer("notified_at_24h", { mode: "timestamp" }),
  notifiedAt3h: integer("notified_at_3h", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const lectures = sqliteTable("lectures", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull(),
  courseName: text("course_name").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  closesAt: integer("closes_at", { mode: "timestamp" }),
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull().default(false),
  notifiedAt72h: integer("notified_at_72h", { mode: "timestamp" }),
  notifiedAt24h: integer("notified_at_24h", { mode: "timestamp" }),
  notifiedAt3h: integer("notified_at_3h", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type DbAssignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type DbLecture = typeof lectures.$inferSelect;
export type NewLecture = typeof lectures.$inferInsert;
