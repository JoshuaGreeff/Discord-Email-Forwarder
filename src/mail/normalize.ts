const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
};

function decodeEntities(input: string): string {
  return input.replace(/&([a-zA-Z]+);/g, (_match, key) => ENTITY_MAP[key] ?? _match);
}

function stripHtml(raw: string): string {
  const withoutStyles = raw.replace(/<style[\s\S]*?<\/style>/gi, "");
  const withoutScripts = withoutStyles.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withBreaks = withoutScripts
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");
  return decodeEntities(withoutTags);
}

export function cleanBodyPreview(body: string, bodyType: string, maxLength: number): string {
  const normalized =
    bodyType?.toLowerCase() === "html"
      ? stripHtml(body)
      : body;

  const compact = normalized.replace(/\r?\n\s*\r?\n/g, "\n\n").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}…`;
}
