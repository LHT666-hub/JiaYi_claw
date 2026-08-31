import { createHash } from "node:crypto";
import type { KnowledgeChunkDraft } from "@/lib/rag/types";

const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSource(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeading(line: string) {
  const value = line.trim();
  if (!value || value.length > 80) return false;
  return /^(?:#{1,6}\s+|第[一二三四五六七八九十百\d]+[章节部分]|[一二三四五六七八九十]+[、.]|\d+(?:\.\d+)*[、.\s]|(?:问|Q)[：:])/iu.test(value);
}

function splitSections(source: string) {
  const lines = normalizeSource(source).split("\n");
  const sections: Array<{ heading: string | null; body: string }> = [];
  let heading: string | null = null;
  let body: string[] = [];

  const flush = () => {
    const content = body.join("\n").trim();
    if (content) sections.push({ heading, body: content });
    body = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      heading = line.replace(/^#{1,6}\s+/, "").trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ heading: null, body: normalizeSource(source) }];
}

function splitLongSection(value: string, maxChars: number, overlapChars: number) {
  const paragraphs = value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    const normalized = current.trim();
    if (!normalized) return;
    chunks.push(normalized);
    current = normalized.slice(Math.max(0, normalized.length - overlapChars));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current.trim()) push();
      for (let start = 0; start < paragraph.length; start += maxChars - overlapChars) {
        chunks.push(paragraph.slice(start, start + maxChars).trim());
      }
      current = "";
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) push();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current.trim()) chunks.push(current.trim());
  return [...new Set(chunks.filter(Boolean))];
}

export function chunkChineseDocument(
  source: string,
  options: { maxChars?: number; overlapChars?: number } = {},
): KnowledgeChunkDraft[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(options.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 3));
  if (maxChars < 200) throw new Error("RAG_CHUNK_SIZE_TOO_SMALL");

  const result: KnowledgeChunkDraft[] = [];
  for (const section of splitSections(source)) {
    for (const content of splitLongSection(section.body, maxChars, overlapChars)) {
      const normalized = content.replace(/\n{3,}/g, "\n\n").trim();
      if (!normalized) continue;
      result.push({
        ordinal: result.length,
        heading: section.heading,
        content: normalized,
        charCount: normalized.length,
        contentHash: digest(`${section.heading ?? ""}\n${normalized}`),
      });
    }
  }
  return result;
}

