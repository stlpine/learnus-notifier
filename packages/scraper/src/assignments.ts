import type { BrowserContext } from "playwright";
import type { Course } from "./courses.js";
import type { Assignment } from "./types.js";

const LEARNUS_BASE = "https://ys.learnus.org";

/**
 * Scrapes all assignments across all enrolled courses.
 * Opens a separate page per course for parallel fetching.
 */
export async function getAssignments(
  context: BrowserContext,
  courses: Course[],
): Promise<Assignment[]> {
  const results = await Promise.allSettled(
    courses.map((c) => getAssignmentsForCourse(context, c)),
  );

  const all: Assignment[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    } else {
      console.warn("[assignments] Failed to scrape a course:", result.reason);
    }
  }
  return all;
}

async function getAssignmentsForCourse(
  context: BrowserContext,
  course: Course,
): Promise<Assignment[]> {
  const page = await context.newPage();
  try {
    await page.goto(`${LEARNUS_BASE}/mod/assign/index.php?id=${course.id}`, {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login.php")) {
      console.warn(`[assignments] Session invalid for course ${course.name}`);
      return [];
    }

    // Extract raw row data from the assignment table.
    // page.$$eval can only return serializable values, so dates are returned as strings.
    const rawRows = await page.$$eval(
      "table.generaltable tbody tr, table tbody tr",
      (rows) =>
        rows.flatMap((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 2) return [];

          const linkEl = row.querySelector<HTMLAnchorElement>('a[href*="mod/assign/view.php"]');
          if (!linkEl) return [];

          const title = linkEl.textContent?.trim() ?? "";
          const href = linkEl.getAttribute("href") ?? "";
          const moduleMatch = href.match(/[?&]id=(\d+)/);
          if (!moduleMatch || !title) return [];

          // Column layout: [0] Week, [1] Title (with link), [2] Due date, [3] Status, [4] Grade
          const dueDateText = cells[2]?.textContent?.trim() ?? "";

          // Submission status is in column 3
          // "제출 완료" / "Submitted for grading" → submitted
          // "미제출" / "No submission" → not submitted
          // Note: "미제출" contains "제출" so we must check negatives first
          const statusText = cells[3]?.textContent?.trim() ?? "";
          const isSubmitted =
            !statusText.includes("미제출") &&
            !statusText.toLowerCase().includes("no submission") &&
            (statusText.includes("제출") ||
              statusText.toLowerCase().includes("submitted") ||
              statusText.includes("완료"));

          return [{ title, href, moduleId: moduleMatch[1], dueDateText, isSubmitted }];
        }),
    );

    return rawRows.map((row) => ({
      id: `${course.id}_assign_${row.moduleId}`,
      courseId: course.id,
      courseName: course.name,
      title: row.title,
      url: row.href.startsWith("http") ? row.href : `${LEARNUS_BASE}${row.href}`,
      dueAt: parseMoodleDate(row.dueDateText),
      isSubmitted: row.isSubmitted,
      type: "assignment" as const,
    }));
  } finally {
    await page.close();
  }
}

/**
 * Parses date strings from the LearnUS assignment table into Date objects.
 * Observed format: "2026-03-09 18:00" (local KST, no timezone suffix)
 * Also handles Korean format: "2025년 12월 31일 오후 11:59"
 */
function parseMoodleDate(text: string): Date | null {
  if (!text || text === "-") return null;

  // Primary format: "YYYY-MM-DD HH:MM" (local time, KST)
  const isoLikeMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (isoLikeMatch) {
    const [, year, month, day, hours, minutes] = isoLikeMatch;
    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hours, 10),
      parseInt(minutes, 10),
      0,
    );
  }

  // Fallback: Korean format "2025년 12월 31일 오후 11:59"
  const koreanMatch = text.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(오전|오후)\s*(\d{1,2}):(\d{2}))?/,
  );
  if (koreanMatch) {
    const [, year, month, day, ampm, hours, minutes] = koreanMatch;
    let h = hours ? parseInt(hours, 10) : 23;
    const m = minutes ? parseInt(minutes, 10) : 59;
    if (ampm === "오후" && h < 12) h += 12;
    if (ampm === "오전" && h === 12) h = 0;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), h, m, 0);
  }

  return null;
}
