const LOG_ENABLED = process.env.DEV_LOGGING === "1";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

function formatContext(args: unknown[]): string {
  const ctx = args.find((a) => a && typeof a === "object" && !Array.isArray(a)) as Record<string, any> | undefined;
  const guild = ctx?.guildId ?? "-";
  const channel = ctx?.channelId ?? "-";
  const email = ctx?.emailId ?? ctx?.mailId ?? ctx?.mailbox ?? "-";
  return `${guild}/${channel}/${email}`;
}

function formatMessage(args: unknown[]): string {
  const parts = args.filter((a) => typeof a !== "object").map((a) => String(a));
  return parts.join(" ");
}

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  if (!LOG_ENABLED) return;
  const timestamp = new Date().toISOString();
  const ctx = formatContext(args);
  const msg = formatMessage(args);
  const line = `[${timestamp}] [${level}] [${scope}] ${ctx}: ${msg}`.trim();

  switch (level) {
    case "DEBUG":
    case "INFO":
      console.log(line);
      break;
    case "WARN":
      console.warn(line);
      break;
    case "ERROR":
      console.error(line);
      break;
  }
}

export function logger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit("DEBUG", scope, args),
    info: (...args: unknown[]) => emit("INFO", scope, args),
    warn: (...args: unknown[]) => emit("WARN", scope, args),
    error: (...args: unknown[]) => emit("ERROR", scope, args),
  };
}
