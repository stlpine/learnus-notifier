/**
 * Captures a screenshot and the HTML of the Yonsei portal login page
 * so we can identify the correct input field selectors.
 *
 * Usage: pnpm --filter @learnus-notifier/scheduler run inspect-login
 */
import fs from "node:fs/promises";
import { chromium } from "playwright";

const LEARNUS_BASE = "https://ys.learnus.org";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

console.log("Navigating to LearnUS...");
await page.goto(LEARNUS_BASE);

console.log(`Current URL: ${page.url()}`);
await page.screenshot({ path: "scripts/debug-learnus.png" });

console.log("Clicking portal login button...");
await page.click('a:has-text("연세포털 로그인"), button:has-text("연세포털 로그인")');
await page.waitForURL(/yonsei\.ac\.kr/, { timeout: 15_000 });

console.log(`Portal URL: ${page.url()}`);
await page.screenshot({ path: "scripts/debug-portal.png" });

// Save the HTML so we can inspect the form fields
const html = await page.content();
await fs.writeFile("scripts/debug-portal.html", html);

// Print all input fields found on the page
const inputs = await page.$$eval("input", (els) =>
  els.map((el) => ({
    type: el.getAttribute("type"),
    name: el.getAttribute("name"),
    id: el.getAttribute("id"),
    placeholder: el.getAttribute("placeholder"),
  })),
);
console.log("\nInput fields found on portal login page:");
console.log(JSON.stringify(inputs, null, 2));

const buttons = await page.$$eval("button, input[type='submit'], a.btn", (els) =>
  els.map((el) => ({
    tag: el.tagName,
    type: el.getAttribute("type"),
    id: el.getAttribute("id"),
    class: el.getAttribute("class"),
    text: el.textContent?.trim().slice(0, 50),
  })),
);
console.log("\nButtons/submit elements found:");
console.log(JSON.stringify(buttons, null, 2));

await browser.close();
console.log("\nScreenshots saved to scripts/debug-portal.png and scripts/debug-learnus.png");
