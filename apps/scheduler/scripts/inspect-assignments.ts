/**
 * Dumps the raw HTML table structure of the assignment list page for each course.
 * Use this to identify the correct column indices and date format for parseMoodleDate().
 *
 * Usage: pnpm --filter @learnus-notifier/scheduler run inspect-assignments
 */
import { openSession, getCourses } from "@learnus-notifier/scraper";
import * as fs from "node:fs";

const username = process.env.LEARNUS_USERNAME;
const password = process.env.LEARNUS_PASSWORD;

if (!username || !password) {
  console.error("Missing LEARNUS_USERNAME or LEARNUS_PASSWORD in .env");
  process.exit(1);
}

async function main() {
  const session = await openSession(username, password, "./data/cookies.json");

  try {
    const courses = await getCourses(session.context);
    console.log(`Found ${courses.length} courses.\n`);

    for (const course of courses) {
      const page = await session.context.newPage();
      try {
        const url = `https://ys.learnus.org/mod/assign/index.php?id=${course.id}`;
        await page.goto(url, { waitUntil: "domcontentloaded" });
        console.log(`\n=== Course: ${course.name} (id=${course.id}) ===`);
        console.log(`URL: ${url}`);

        // Dump table headers
        const headers = await page.$$eval(
          "table.generaltable thead th, table thead th",
          (ths) => ths.map((th) => th.textContent?.trim() ?? ""),
        );
        console.log("Table headers:", headers);

        // Dump first 3 rows with all cell texts
        const rows = await page.$$eval(
          "table.generaltable tbody tr, table tbody tr",
          (trs) =>
            trs.slice(0, 5).map((tr) => {
              const cells = tr.querySelectorAll("td");
              const link = tr.querySelector<HTMLAnchorElement>('a[href*="mod/assign/view.php"]');
              return {
                cellCount: cells.length,
                cells: Array.from(cells).map((td) => td.textContent?.trim() ?? ""),
                link: link?.getAttribute("href") ?? null,
                linkText: link?.textContent?.trim() ?? null,
              };
            }),
        );

        if (rows.length === 0) {
          console.log("(no assignment rows found)");
        } else {
          for (const [i, row] of rows.entries()) {
            console.log(`\nRow ${i}: ${row.cellCount} cells`);
            for (const [j, cell] of row.cells.entries()) {
              console.log(`  [${j}] "${cell}"`);
            }
            if (row.link) console.log(`  link: ${row.link}`);
          }
        }

        // Save full page HTML for manual inspection
        const html = await page.content();
        const outPath = `./data/inspect-assignments-${course.id}.html`;
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
