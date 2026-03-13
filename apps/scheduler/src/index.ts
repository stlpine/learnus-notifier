import cron from "node-cron";
import { openSession, getCourses, getAssignments, getLectures } from "@learnus-notifier/scraper";
import {
  getPendingNotifications,
  initDb,
  markNotified,
  upsertAssignment,
  upsertLecture,
} from "@learnus-notifier/db";
import { initBot, registerCommands, sendNotification } from "@learnus-notifier/telegram";
import { config } from "./config.js";

async function scrapeAndNotify(): Promise<void> {
  console.log(`[scheduler] Starting scrape at ${new Date().toISOString()}`);

  const session = await openSession(
    config.learnus.username,
    config.learnus.password,
    config.cookies.path,
  );

  try {
    const courses = await getCourses(session.context);
    if (courses.length === 0) {
      console.warn("[scheduler] No courses found — check login and scraper selectors.");
      return;
    }

    const [scrapedAssignments, scrapedLectures] = await Promise.all([
      getAssignments(session.context, courses),
      getLectures(session.context, courses),
    ]);

    console.log(
      `[scheduler] Scraped ${scrapedAssignments.length} assignments, ${scrapedLectures.length} lectures.`,
    );

    const now = new Date();
    await Promise.all([
      ...scrapedAssignments.map((a) =>
        upsertAssignment({
          id: a.id,
          courseId: a.courseId,
          courseName: a.courseName,
          title: a.title,
          url: a.url,
          dueAt: a.dueAt,
          isSubmitted: a.isSubmitted,
          updatedAt: now,
        }),
      ),
      ...scrapedLectures.map((l) =>
        upsertLecture({
          id: l.id,
          courseId: l.courseId,
          courseName: l.courseName,
          title: l.title,
          url: l.url,
          closesAt: l.closesAt,
          isCompleted: l.isCompleted,
          updatedAt: now,
        }),
      ),
    ]);

    const pending = await getPendingNotifications();
    console.log(`[scheduler] Sending ${pending.length} notifications.`);

    for (const item of pending) {
      try {
        await sendNotification(config.telegram.chatId, item, config.notification.language);
        await markNotified(item.id, item.type, item.tier);
      } catch (err) {
        console.error(`[scheduler] Failed to send notification for "${item.title}":`, err);
      }
    }

    console.log("[scheduler] Scrape complete.");
  } catch (err) {
    console.error("[scheduler] Scrape failed:", err);
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  console.log("[scheduler] Starting LearnUS notifier...");

  await initDb(config.db.path);
  console.log(`[scheduler] Database ready at ${config.db.path}`);

  const bot = initBot(config.telegram.botToken);
  registerCommands(bot, config.notification.language);
  void bot.start({ onStart: () => console.log("[scheduler] Telegram bot is running.") });

  await scrapeAndNotify();

  cron.schedule(config.scheduler.cronExpression, scrapeAndNotify);
  console.log(
    `[scheduler] Cron scheduled: "${config.scheduler.cronExpression}" ` +
      `(every ~${config.scheduler.pollIntervalMinutes} minutes)`,
  );
}

main().catch((err) => {
  console.error("[scheduler] Fatal error:", err);
  process.exit(1);
});
