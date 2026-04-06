import { getUpcoming } from "@learnus-notifier/db";
import type { Bot } from "grammy";
import { buildUpcomingMessage, buildWelcomeMessage, type Language } from "./messages.js";

/**
 * Registers bot command handlers.
 * Call this before bot.start().
 */
export function registerCommands(bot: Bot, lang: Language): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(buildWelcomeMessage(lang), { parse_mode: "MarkdownV2" });
  });

  bot.command("upcoming", async (ctx) => {
    const items = await getUpcoming(168); // next 7 days
    const text = buildUpcomingMessage(items, lang);
    await ctx.reply(text, { parse_mode: "MarkdownV2" });
  });

  // Log errors rather than crashing
  bot.catch((err) => {
    console.error("[bot] Error handling update:", err);
  });
}
