export function formatMessageTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function parseDurationLabel(label: string) {
  const minuteMatch = label.match(/(\d+)\s*分钟/);
  const secondMatch = label.match(/(\d+)\s*秒/);

  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const seconds = secondMatch ? Number(secondMatch[1]) : 0;

  if (minutes === 0 && seconds === 0) {
    return 180;
  }

  return minutes * 60 + seconds;
}

export function getNextFollowupLabel() {
  const now = new Date();
  const day = now.getDay();
  let daysUntilWed = (3 - day + 7) % 7;

  if (daysUntilWed === 0) {
    const hour = now.getHours();

    if (hour >= 10) {
      daysUntilWed = 7;
    }
  }

  if (daysUntilWed === 0) return "今天上午 9:30";
  if (daysUntilWed === 1) return "明天上午 9:30";
  if (daysUntilWed === 2) return "后天上午 9:30";

  return "本周三上午 9:30";
}

export function formatPlaybackTime(seconds: number) {
  const safeValue = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeValue / 60);
  const remainSeconds = safeValue % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}
