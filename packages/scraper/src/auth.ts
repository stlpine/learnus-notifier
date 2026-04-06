import fs from "node:fs/promises";
import path from "node:path";
import { type BrowserContext, chromium } from "playwright";

const LEARNUS_BASE = "https://ys.learnus.org";
const YONSEI_PORTAL_PATTERN = /yonsei\.ac\.kr/;

export type SerializedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export type BrowserSession = {
  context: BrowserContext;
  close: () => Promise<void>;
};

/**
 * Opens an authenticated Playwright browser session.
 * Reuses cached cookies if the session is still valid; otherwise re-authenticates.
 * Caller is responsible for calling session.close() when done.
 */
export async function openSession(
  username: string,
  password: string,
  cookiesPath: string,
): Promise<BrowserSession> {
  const saved = await tryLoadCookies(cookiesPath);

  if (saved) {
    const session = await buildSession(saved);
    if (await isSessionValid(session.context)) {
      console.log("[auth] Reusing cached session.");
      return session;
    }
    await session.close();
    console.log("[auth] Cached session expired — logging in again.");
  } else {
    console.log("[auth] No cached session — logging in via Playwright...");
  }

  const { cookies, session } = await playwrightLogin(username, password);
  await saveCookies(cookiesPath, cookies);
  console.log("[auth] Login successful, session cookies saved.");
  return session;
}

async function buildSession(cookies: SerializedCookie[]): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    })),
  );
  return { context, close: () => browser.close() };
}

async function isSessionValid(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto(`${LEARNUS_BASE}/local/ubion/user/index.php`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    return !page.url().includes("login.php");
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function playwrightLogin(
  username: string,
  password: string,
): Promise<{ cookies: SerializedCookie[]; session: BrowserSession }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LEARNUS_BASE);
  await page.click('a:has-text("연세포털 로그인"), button:has-text("연세포털 로그인")');
  await page.waitForURL(YONSEI_PORTAL_PATTERN, { timeout: 15_000 });
  console.log(`[auth] Reached portal login page: ${page.url()}`);

  // Yonsei portal login page (infra.yonsei.ac.kr/sso/PmSSOService)
  await page.fill('input[name="loginId"]', username);
  await page.fill('input[name="loginPasswd"]', password);
  await page.click("#loginBtn");

  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  if (!page.url().includes("ys.learnus.org")) {
    await browser.close();
    throw new Error(`[auth] Login failed — ended up at: ${page.url()}`);
  }
  console.log("[auth] Redirected back to LearnUS successfully.");
  await page.close();

  const rawCookies = await context.cookies();
  const cookies: SerializedCookie[] = rawCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: (c.sameSite ?? "Lax") as SerializedCookie["sameSite"],
  }));

  return { cookies, session: { context, close: () => browser.close() } };
}

async function tryLoadCookies(cookiesPath: string): Promise<SerializedCookie[] | null> {
  try {
    const data = await fs.readFile(cookiesPath, "utf-8");
    return JSON.parse(data) as SerializedCookie[];
  } catch {
    return null;
  }
}

async function saveCookies(cookiesPath: string, cookies: SerializedCookie[]): Promise<void> {
  await fs.mkdir(path.dirname(path.resolve(cookiesPath)), { recursive: true });
  await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
}
