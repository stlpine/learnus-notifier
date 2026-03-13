import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function toCronExpression(minutes: number): string {
  if (minutes < 60 && 60 % minutes === 0) {
    return `*/${minutes} * * * *`;
  }
  const hours = Math.max(1, Math.floor(minutes / 60));
  return `0 */${hours} * * *`;
}

export const config = {
  learnus: {
    username: required("LEARNUS_USERNAME"),
    password: required("LEARNUS_PASSWORD"),
  },
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    chatId: required("TELEGRAM_CHAT_ID"),
  },
  db: {
    path: optional("DB_PATH", "./data/state.db"),
  },
  cookies: {
    path: optional("COOKIES_PATH", "./data/cookies.json"),
  },
  notification: {
    language: optional("NOTIFICATION_LANGUAGE", "ko") as "ko" | "en",
  },
  scheduler: {
    pollIntervalMinutes: parseInt(optional("POLL_INTERVAL_MINUTES", "120"), 10),
    get cronExpression() {
      return toCronExpression(this.pollIntervalMinutes);
    },
  },
} as const;
