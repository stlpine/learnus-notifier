/**
 * Inspects the individual VOD view page to find completion/watch status indicators.
 * Visits a sample of VODs (past-deadline ones are likely watched) and dumps relevant HTML.
 *
 * Usage: pnpm --filter @learnus-notifier/scheduler run inspect-vod-page
 */
import { openSession, getCourses } from "@learnus-notifier/scraper";

const username = process.env.LEARNUS_USERNAME;
const password = process.env.LEARNUS_PASSWORD;

if (!username || !password) {
  console.error("Missing LEARNUS_USERNAME or LEARNUS_PASSWORD");
  process.exit(1);
}

const LECTURE_MODULE_TYPES = ["vod", "xncompass", "ubcoll", "zoom", "video"];

async function main() {
  const session = await openSession(username, password, "./data/cookies.json");

  try {
    const courses = await getCourses(session.context);

    for (const course of courses) {
      const coursePage = await session.context.newPage();
      let lectureUrls: { title: string; url: string }[] = [];

      try {
        await coursePage.goto(course.url, { waitUntil: "domcontentloaded" });

        lectureUrls = await coursePage.$$eval(
          "li.activity",
          (items, moduleTypes) =>
            items.flatMap((item) => {
              const classes = (item.getAttribute("class") ?? "").toLowerCase();
              if (!moduleTypes.some((t: string) => classes.includes(t))) return [];
              const link = item.querySelector<HTMLAnchorElement>("a");
              const href = link?.getAttribute("href") ?? "";
              if (!href) return [];
              const title =
                item.querySelector(".instancename, .activityname")?.textContent?.trim() ?? "";
              return [{ title, url: href }];
            }),
          LECTURE_MODULE_TYPES,
        );
      } finally {
        await coursePage.close();
      }

      if (lectureUrls.length === 0) continue;

      console.log(`\n=== Course: ${course.name} (${lectureUrls.length} VODs) ===`);

      // Check the Online-Attendance page (온라인출석부) for this course
      const attendancePage = await session.context.newPage();
      try {
        // First navigate to course page to find the online attendance link
        await attendancePage.goto(course.url, { waitUntil: "domcontentloaded" });

        const attendanceUrl = await attendancePage.evaluate(() => {
          // Look for 온라인출석부 or Online-Attendance link (must be on learnus.org)
          const links = Array.from(document.querySelectorAll("a"));
          const candidates: { text: string; href: string }[] = [];
          for (const link of links) {
            const text = link.textContent?.trim() ?? "";
            const href = link.getAttribute("href") ?? "";
            if (!href.includes("ys.learnus.org") && !href.startsWith("/")) continue;
            if (
              text.includes("온라인출석부") ||
              text.includes("Online-Attendance") ||
              href.includes("ubattendance") ||
              href.includes("onlineattendance")
            ) {
              candidates.push({ text, href });
            }
          }
          return candidates;
        });

        console.log(`\n  Online attendance links: ${JSON.stringify(attendanceUrl)}`);

        const firstLink = attendanceUrl?.[0];
        if (firstLink?.href) {
          const fullUrl = firstLink.href.startsWith("http")
            ? firstLink.href
            : `https://ys.learnus.org${firstLink.href}`;
          await attendancePage.goto(fullUrl, { waitUntil: "domcontentloaded" });

          const bodyText = await attendancePage.evaluate(() =>
            (document.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 2000)
          );
          console.log(`  Attendance page URL: ${attendancePage.url()}`);
          console.log(`  Attendance page body (2000 chars): "${bodyText}"`);

          // Also dump the full HTML
          const html = await attendancePage.content();
          const safeName = course.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          const fs = await import("node:fs");
          fs.writeFileSync(`./data/inspect-attendance-${course.id}-${safeName}.html`, html);
          console.log(`  Full HTML saved to ./data/inspect-attendance-${course.id}-${safeName}.html`);
        }
      } finally {
        await attendancePage.close();
      }
    }
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
