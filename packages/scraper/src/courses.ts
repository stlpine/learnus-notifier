import type { BrowserContext } from "playwright";

const LEARNUS_BASE = "https://ys.learnus.org";
const COURSE_LIST_URL = `${LEARNUS_BASE}/local/ubion/user/index.php`;

export type Course = {
  id: string;
  name: string;
  url: string;
};

/**
 * Fetches the list of enrolled courses from the LearnUS Ubion course listing page.
 * Requires a Playwright BrowserContext since the page uses custom JS rendering.
 */
export async function getCourses(context: BrowserContext): Promise<Course[]> {
  const page = await context.newPage();
  try {
    await page.goto(COURSE_LIST_URL, { waitUntil: "networkidle" });

    if (page.url().includes("login.php")) {
      throw new Error("[courses] Session invalid — redirected to login page");
    }

    const links = await page.$$eval(
      'a[href*="/course/view.php?id="]',
      (els) =>
        els.map((el) => ({
          href: el.getAttribute("href") ?? "",
          text: el.textContent?.trim() ?? "",
        })),
    );

    const courses: Course[] = [];
    const seen = new Set<string>();

    for (const link of links) {
      const match = link.href.match(/\/course\/view\.php\?id=(\d+)/);
      if (!match || !link.text || seen.has(match[1])) continue;
      seen.add(match[1]);
      courses.push({
        id: match[1],
        name: link.text,
        url: `${LEARNUS_BASE}/course/view.php?id=${match[1]}`,
      });
    }

    console.log(`[courses] Found ${courses.length} enrolled courses.`);
    return courses;
  } finally {
    await page.close();
  }
}
