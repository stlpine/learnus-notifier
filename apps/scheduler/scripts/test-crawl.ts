/**
 * Test script for the LearnUS crawling mechanism.
 * Runs login → courses → assignments → lectures and prints results.
 *
 * Usage: pnpm test:crawl (from monorepo root)
 */
import { openSession, getCourses, getAssignments, getLectures } from "@learnus-notifier/scraper";

const username = process.env.LEARNUS_USERNAME;
const password = process.env.LEARNUS_PASSWORD;

if (!username || !password) {
  console.error("Missing LEARNUS_USERNAME or LEARNUS_PASSWORD in .env");
  process.exit(1);
}

async function main() {
  console.log("=== LearnUS Crawl Test ===\n");

  console.log("Step 1: Opening authenticated browser session...");
  const session = await openSession(username, password, "./data/cookies.json");
  console.log("✓ Session ready\n");

  try {
    console.log("Step 2: Fetching enrolled courses...");
    const courses = await getCourses(session.context);
    if (courses.length === 0) {
      console.error("✗ No courses found. The course selector likely needs adjustment.");
      process.exit(1);
    }
    console.log(`✓ Found ${courses.length} courses:`);
    for (const c of courses) {
      console.log(`  [${c.id}] ${c.name}`);
    }
    console.log();

    console.log("Step 3: Scraping assignments...");
    const assignments = await getAssignments(session.context, courses);
    console.log(`✓ Found ${assignments.length} assignments:`);
    for (const a of assignments) {
      const due = a.dueAt
        ? a.dueAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        : "no due date";
      const status = a.isSubmitted ? "✓ submitted" : "✗ not submitted";
      console.log(`  [${a.courseId}] ${a.title}`);
      console.log(`    Due: ${due} | ${status}`);
    }
    if (assignments.length === 0) {
      console.log("  (none found — selector may need adjustment or no assignments exist)");
    }
    console.log();

    console.log("Step 4: Scraping online lectures...");
    const lectures = await getLectures(session.context, courses);
    console.log(`✓ Found ${lectures.length} online lectures:`);
    for (const l of lectures) {
      const closes = l.closesAt
        ? l.closesAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        : "no close date";
      const status = l.isCompleted ? "✓ completed" : "✗ not completed";
      console.log(`  [${l.courseId}] ${l.title}`);
      console.log(`    Closes: ${closes} | ${status}`);
    }
    if (lectures.length === 0) {
      console.log("  (none found — selector may need adjustment or no online lectures exist)");
    }

    console.log("\n=== Done ===");
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
