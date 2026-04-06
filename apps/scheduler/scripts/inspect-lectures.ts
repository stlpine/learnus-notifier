/**
 * Dumps the raw HTML structure of lecture activity items on course pages.
 * Use this to identify the correct CSS selectors and date format for getLectures().
 *
 * Usage: pnpm --filter @learnus-notifier/scheduler run inspect-lectures
 */

import * as fs from "node:fs";
import { getCourses, openSession } from "@learnus-notifier/scraper";

const username = process.env.LEARNUS_USERNAME;
const password = process.env.LEARNUS_PASSWORD;

if (!username || !password) {
  console.error("Missing LEARNUS_USERNAME or LEARNUS_PASSWORD in .env");
  process.exit(1);
}

const LECTURE_MODULE_TYPES = ["vod", "xncompass", "ubcoll", "zoom", "video"];

async function main() {
  const session = await openSession(username, password, "./data/cookies.json");

  try {
    const courses = await getCourses(session.context);
    console.log(`Found ${courses.length} courses.\n`);

    for (const course of courses) {
      const page = await session.context.newPage();
      try {
        await page.goto(course.url, { waitUntil: "domcontentloaded" });
        console.log(`\n=== Course: ${course.name} ===`);
        console.log(`URL: ${course.url}`);

        // Count all li.activity items and their module types
        const allActivities = await page.$$eval("li.activity", (items) =>
          items.map((item) => ({
            classes: item.getAttribute("class") ?? "",
            id: item.getAttribute("id") ?? "",
          })),
        );

        const moduleTypeCounts: Record<string, number> = {};
        for (const act of allActivities) {
          const cls = act.classes.toLowerCase();
          for (const t of [
            "vod",
            "xncompass",
            "ubcoll",
            "zoom",
            "video",
            "assign",
            "resource",
            "forum",
            "quiz",
            "page",
            "url",
          ]) {
            if (cls.includes(t)) {
              moduleTypeCounts[t] = (moduleTypeCounts[t] ?? 0) + 1;
            }
          }
        }
        console.log(`Total li.activity items: ${allActivities.length}`);
        console.log("Module type counts:", moduleTypeCounts);

        // Dump details of lecture-type activities
        const lectureItems = await page.$$eval(
          "li.activity",
          (items, moduleTypes) =>
            items.flatMap((item) => {
              const classes = (item.getAttribute("class") ?? "").toLowerCase();
              const isLecture = moduleTypes.some((t: string) => classes.includes(t));
              if (!isLecture) return [];

              const linkEl = item.querySelector<HTMLAnchorElement>("a");
              const href = linkEl?.getAttribute("href") ?? "";
              const instancename =
                item.querySelector(".instancename, .activityname")?.textContent?.trim() ?? "";
              const availabilityinfo =
                item.querySelector(".availabilityinfo")?.textContent?.trim() ?? "";
              const contentafterlink =
                item.querySelector(".contentafterlink")?.textContent?.trim() ?? "";
              const textinfo = item.querySelector(".text-info")?.textContent?.trim() ?? "";

              // Grab outerHTML of the completion element
              const completionEl = item.querySelector("[data-completionstate]");
              const completionState = completionEl?.getAttribute("data-completionstate") ?? "none";

              // Look for any date-like text in all descendant text
              const allText = item.textContent?.replace(/\s+/g, " ").trim() ?? "";

              return [
                {
                  classes,
                  href,
                  instancename,
                  availabilityinfo,
                  contentafterlink,
                  textinfo,
                  completionState,
                  // First 300 chars of all text to spot date patterns
                  allText: allText.slice(0, 300),
                },
              ];
            }),
          LECTURE_MODULE_TYPES,
        );

        if (lectureItems.length === 0) {
          console.log("(no lecture-type activities found with current module types)");
        } else {
          console.log(`\nLecture activities (${lectureItems.length}):`);
          for (const [i, item] of lectureItems.entries()) {
            console.log(`\n  [${i}] classes: ${item.classes}`);
            console.log(`       instancename: "${item.instancename}"`);
            console.log(`       href: ${item.href}`);
            console.log(`       availabilityinfo: "${item.availabilityinfo}"`);
            console.log(`       contentafterlink: "${item.contentafterlink}"`);
            console.log(`       text-info: "${item.textinfo}"`);
            console.log(`       completionState: ${item.completionState}`);
            console.log(`       allText: "${item.allText}"`);
          }
        }

        // Save full HTML for manual inspection
        const html = await page.content();
        const safeName = course.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
        const outPath = `./data/inspect-lectures-${course.id}-${safeName}.html`;
        fs.writeFileSync(outPath, html);
        console.log(`\nFull HTML saved to ${outPath}`);
      } finally {
        await page.close();
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
