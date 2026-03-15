import type { BrowserContext } from "playwright";
import type { Course } from "./courses.js";
import type { Lecture } from "./types.js";

const LEARNUS_BASE = "https://ys.learnus.org";
const LECTURE_MODULE_TYPES = ["vod", "xncompass", "ubcoll", "zoom", "video"];

/**
 * Scrapes online lecture items from all enrolled course pages.
 * Processes courses sequentially (2 pages per course: listing + attendance report).
 * Deduplicates by module ID (same lecture can appear in multiple course sections).
 */
export async function getLectures(
  context: BrowserContext,
  courses: Course[],
): Promise<Lecture[]> {
  const seen = new Set<string>();
  const all: Lecture[] = [];

  for (const course of courses) {
    try {
      const lectures = await getLecturesForCourse(context, course);
      for (const lecture of lectures) {
        if (!seen.has(lecture.id)) {
          seen.add(lecture.id);
          all.push(lecture);
        }
      }
    } catch (err) {
      console.warn("[lectures] Failed to scrape course:", course.name, err);
    }
  }

  return all;
}

async function getLecturesForCourse(
  context: BrowserContext,
  course: Course,
): Promise<Lecture[]> {
  // Run sequentially to avoid opening too many concurrent pages across all courses
  const rawItems = await scrapeCourseLectures(context, course);
  const completionMap = await scrapeAttendanceStatus(context, course);

  return rawItems.map((item) => ({
    id: `${course.id}_lecture_${item.moduleId}`,
    courseId: course.id,
    courseName: course.name,
    title: item.title,
    url: item.href
      ? item.href.startsWith("http")
        ? item.href
        : `${LEARNUS_BASE}${item.href}`
      : course.url,
    closesAt: parseAttendancePeriod(item.allText),
    isCompleted: completionMap.get(normalizeTitle(item.title)) ?? false,
    type: "lecture" as const,
  }));
}

/**
 * Strips VOD/video type suffixes added by professors or Moodle to lecture titles.
 * Used to match course page titles (e.g. "Intro VOD", "Intro 동영상") against
 * the attendance page which shows plain titles (e.g. "Intro").
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/\s*(VOD|동영상|video|vod)\s*$/i, "")
    .replace(/\s*\(.*?\)\s*$/, "")
    .trim()
    .toLowerCase();
}

/**
 * Scrapes the list of lecture activity items from the course page.
 */
async function scrapeCourseLectures(
  context: BrowserContext,
  course: Course,
): Promise<{ href: string; moduleId: string; title: string; allText: string }[]> {
  const page = await context.newPage();
  try {
    await page.goto(course.url, { waitUntil: "domcontentloaded" });

    if (page.url().includes("login.php")) {
      console.warn(`[lectures] Session invalid for course ${course.name}`);
      return [];
    }

    // LearnUS VOD plugin structure (confirmed via inspection):
    // - li.activity with class "vod modtype_vod" (also: xncompass, ubcoll, zoom, video)
    // - Title in .instancename or .activityname (may include "VOD"/"동영상" suffix set by professor)
    // - Attendance window in item.textContent: "YYYY-MM-DD HH:MM:SS ~ YYYY-MM-DD HH:MM:SS (Late/지각 : ...)"
    //   NOT in .availabilityinfo or .contentafterlink
    // - No data-completionstate attribute on VOD items (completion checked via attendance report)
    // - Future locked lectures have no <a> href; module ID comes from li#module-XXXX instead
    return await page.$$eval(
      "li.activity",
      (items, moduleTypes) =>
        items.flatMap((item) => {
          const classes = (item.getAttribute("class") ?? "").toLowerCase();
          const isLecture = moduleTypes.some((t: string) => classes.includes(t));
          if (!isLecture) return [];

          // Module ID: prefer href param, fall back to li element id="module-XXXX"
          const linkEl = item.querySelector<HTMLAnchorElement>("a");
          const href = linkEl?.getAttribute("href") ?? "";
          const moduleIdFromHref = href.match(/[?&]id=(\d+)/)?.[1] ?? null;
          const moduleIdFromEl = (item.getAttribute("id") ?? "").replace(/^module-/, "");
          const moduleId = moduleIdFromHref ?? (moduleIdFromEl || null);
          if (!moduleId) return [];

          const rawTitle =
            item.querySelector(".instancename, .activityname")?.textContent ?? "";
          // Strip Moodle-appended module type label in parens (e.g. "(VOD)")
          const title = rawTitle.replace(/\s*\(.*?\)\s*$/, "").trim();
          if (!title) return [];

          // Attendance period is in the raw text content of the entire activity item
          const allText = item.textContent?.replace(/\s+/g, " ").trim() ?? "";

          return [{ href, moduleId, title, allText }];
        }),
      LECTURE_MODULE_TYPES,
    );
  } finally {
    await page.close();
  }
}

/**
 * Loads the per-student attendance report for a course and returns a map of
 * normalized lecture title → isCompleted (true if status is O or ▲).
 *
 * URL: /report/ubcompletion/user_progress_a.php?id={courseId}
 *
 * Table structure (confirmed via inspection):
 *   <td>  watch-time  <button class="track_detail" data-modid="...">View: N</button> </td>
 *   <td class="text-center">  O | ▲ | X | &nbsp;  </td>
 */
async function scrapeAttendanceStatus(
  context: BrowserContext,
  course: Course,
): Promise<Map<string, boolean>> {
  const page = await context.newPage();
  try {
    const url = `${LEARNUS_BASE}/report/ubcompletion/user_progress_a.php?id=${course.id}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const entries = await page.$$eval("button.track_detail", (buttons) =>
      buttons.flatMap((btn) => {
        const td = btn.closest("td");
        if (!td) return [];
        // Next sibling td holds the per-item attendance status
        const statusTd = td.nextElementSibling;
        const status = statusTd?.textContent?.trim() ?? "";
        // Title is in the previous row's td.text-left (sibling tr, same table row)
        const row = td.closest("tr");
        if (!row) return [];
        const titleTd = row.querySelector("td.text-left");
        const rawTitle = titleTd?.textContent?.trim() ?? "";
        if (!rawTitle) return [];
        return [{ rawTitle, status }];
      }),
    );

    const map = new Map<string, boolean>();
    for (const { rawTitle, status } of entries) {
      // Strip icon alt text and normalize
      const title = rawTitle.replace(/^\s*\S+\s+/, "").trim(); // remove leading icon text
      const normalized = title
        .replace(/\s*(VOD|동영상|video|vod)\s*$/i, "")
        .replace(/\s*\(.*?\)\s*$/, "")
        .trim()
        .toLowerCase();
      // O = attended on time, ▲ = late but counted — both mean the student watched it
      const isCompleted = status === "O" || status === "▲";
      map.set(normalized, isCompleted);
    }
    return map;
  } catch (err) {
    console.warn(`[lectures] Failed to load attendance report for ${course.name}:`, err);
    return new Map();
  } finally {
    await page.close();
  }
}

/**
 * Parses the attendance period from the full text content of a VOD activity item.
 * Confirmed LearnUS format: "YYYY-MM-DD HH:MM:SS ~ YYYY-MM-DD HH:MM:SS (Late/지각 : ...)"
 * Returns the end of the primary attendance window (before the late period).
 */
function parseAttendancePeriod(text: string): Date | null {
  if (!text?.trim()) return null;

  // Primary format (confirmed): "2026-03-03 00:00:00 ~ 2026-03-16 23:59:59 (Late : ...)"
  // Skip the start date+time, capture the end date and time
  const isoRangeMatch = text.match(
    /\d{4}-\d{2}-\d{2}[\s\d:]*~\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
  );
  if (isoRangeMatch) {
    const [, year, month, day, h, m, s] = isoRangeMatch;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(h, 10), parseInt(m, 10), parseInt(s, 10));
  }

  // Fallback: older format "YYYY-MM-DD ~ YYYY-MM-DD HH:MM"
  const isoShortMatch = text.match(
    /\d{4}-\d{2}-\d{2}\s*~\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/,
  );
  if (isoShortMatch) {
    const [year, month, day] = isoShortMatch[1].split("-").map(Number);
    const [h, m] = isoShortMatch[2] ? isoShortMatch[2].split(":").map(Number) : [23, 59];
    return new Date(year, month - 1, day, h, m, 0);
  }

  // Fallback: Korean format "2025년 12월 7일 오후 11:59"
  const koreanMatch = text.match(
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*(오전|오후)?\s*(\d{1,2}):(\d{2}))?/,
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
