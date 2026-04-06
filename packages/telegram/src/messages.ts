export type Language = "ko" | "en";
type ItemType = "assignment" | "lecture";
type Tier = "72h" | "24h" | "3h";

const ITEM_LABEL: Record<ItemType, Record<Language, string>> = {
  assignment: { ko: "과제", en: "Assignment" },
  lecture: { ko: "온라인 강의", en: "Online Lecture" },
};

const TIER_LABEL: Record<Tier, Record<Language, string>> = {
  "72h": { ko: "72시간", en: "72 hours" },
  "24h": { ko: "24시간", en: "24 hours" },
  "3h": { ko: "3시간", en: "3 hours" },
};

const TIER_EMOJI: Record<Tier, string> = {
  "72h": "📅",
  "24h": "⚠️",
  "3h": "🚨",
};

/**
 * Builds a Telegram notification message for an upcoming deadline.
 * Supports Markdown formatting (parse_mode: "MarkdownV2" compatible).
 */
export function buildNotificationMessage(
  item: {
    type: ItemType;
    courseName: string;
    title: string;
    url: string;
    deadlineAt: Date;
    tier: Tier;
  },
  lang: Language,
): string {
  const emoji = TIER_EMOJI[item.tier];
  const itemLabel = ITEM_LABEL[item.type][lang];
  const tierLabel = TIER_LABEL[item.tier][lang];
  const deadline = formatDate(item.deadlineAt, lang);

  if (lang === "ko") {
    return [
      `${emoji} *\\[${escapeMarkdown(itemLabel)} 마감 ${escapeMarkdown(tierLabel)} 전\\]*`,
      `📚 강좌: ${escapeMarkdown(item.courseName)}`,
      `📝 ${escapeMarkdown(itemLabel)}: ${escapeMarkdown(item.title)}`,
      `⏰ 마감: ${escapeMarkdown(deadline)}`,
      `🔗 [바로가기](${item.url})`,
    ].join("\n");
  }

  return [
    `${emoji} *\\[${escapeMarkdown(itemLabel)} due in ${escapeMarkdown(tierLabel)}\\]*`,
    `📚 Course: ${escapeMarkdown(item.courseName)}`,
    `📝 ${escapeMarkdown(itemLabel)}: ${escapeMarkdown(item.title)}`,
    `⏰ Due: ${escapeMarkdown(deadline)}`,
    `🔗 [Open](${item.url})`,
  ].join("\n");
}

/**
 * Builds the response message for the /upcoming bot command.
 */
export function buildUpcomingMessage(
  items: Array<{
    type: ItemType;
    courseName: string;
    title: string;
    deadlineAt: Date;
  }>,
  lang: Language,
): string {
  if (items.length === 0) {
    return lang === "ko" ? "✅ 다가오는 마감이 없습니다\\." : "✅ No upcoming deadlines\\.";
  }

  const header = lang === "ko" ? "📋 *다가오는 마감 목록*" : "📋 *Upcoming Deadlines*";

  const lines = items.map((item) => {
    const label = ITEM_LABEL[item.type][lang];
    const deadline = formatDate(item.deadlineAt, lang);
    return `• \\[${escapeMarkdown(label)}\\] ${escapeMarkdown(item.courseName)} — ${escapeMarkdown(item.title)}\n  ⏰ ${escapeMarkdown(deadline)}`;
  });

  return [header, "", ...lines].join("\n");
}

export function buildWelcomeMessage(lang: Language): string {
  if (lang === "ko") {
    return [
      "👋 안녕하세요\\! LearnUS 알림 봇입니다\\.",
      "",
      "다가오는 과제 및 온라인 강의 마감을 자동으로 알려드립니다\\.",
      "",
      "*/upcoming* \\- 다가오는 마감 목록 \\(7일 이내\\)",
    ].join("\n");
  }

  return [
    "👋 Hello\\! I'm your LearnUS notifier bot\\.",
    "",
    "I'll automatically remind you of upcoming assignment and lecture deadlines\\.",
    "",
    "*/upcoming* \\- Show deadlines in the next 7 days",
  ].join("\n");
}

function formatDate(date: Date, lang: Language): string {
  return date.toLocaleString(lang === "ko" ? "ko-KR" : "en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Escape special characters for Telegram MarkdownV2
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
