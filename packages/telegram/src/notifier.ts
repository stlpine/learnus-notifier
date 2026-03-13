import { Bot } from "grammy";
import type { PendingNotification } from "@learnus-notifier/db";
import { buildNotificationMessage, type Language } from "./messages.js";

let _bot: Bot | undefined;

export function initBot(token: string): Bot {
  _bot = new Bot(token);
  return _bot;
}

export function getBot(): Bot {
  if (!_bot) throw new Error("Bot not initialized. Call initBot() first.");
  return _bot;
}

/**
 * Sends a deadline notification to the given chat.
 */
export async function sendNotification(
  chatId: string,
  item: PendingNotification,
  lang: Language,
): Promise<void> {
  const bot = getBot();
  const text = buildNotificationMessage(item, lang);
  await bot.api.sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
}
