import { z } from "zod";

export const feedbackCategories = [
  "service",
  "content",
  "accessibility",
  "privacy",
  "bug",
  "other",
] as const;

export type FeedbackCategory = (typeof feedbackCategories)[number];

export const feedbackCategoryLabels: Record<FeedbackCategory, string> = {
  service: "服务办理",
  content: "排班或内容",
  accessibility: "老人使用体验",
  privacy: "隐私与授权",
  bug: "功能异常",
  other: "其他建议",
};

export const feedbackInput = z.object({
  category: z.enum(feedbackCategories),
  content: z.string().trim().min(8, "请至少描述 8 个字。").max(1000),
  contactAllowed: z.boolean().default(false),
  residentId: z.string().uuid().nullable().optional(),
  pagePath: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9_./-]+$/)
    .max(160)
    .nullable()
    .optional(),
});

export function parseIdempotencyKey(value: string | null) {
  const key = value?.trim() ?? "";
  return /^[A-Za-z0-9._:-]{8,120}$/.test(key) ? key : null;
}
