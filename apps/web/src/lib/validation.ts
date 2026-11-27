import { z } from "zod";

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const name = z
  .string()
  .transform(collapse)
  .pipe(z.string().min(1, "Полето е задължително").max(100, "Максимум 100 символа"));

export const identitySchema = z.object({
  firstName: name,
  lastName: name,
  employeeId: z
    .string()
    .transform(collapse)
    .pipe(z.string().min(1, "Полето е задължително").max(64, "Максимум 64 символа")),
});
export type Identity = z.infer<typeof identitySchema>;

export const COMMENT_MAX = 2000;
export const commentSchema = z
  .string()
  .max(COMMENT_MAX, `Коментарът е до ${COMMENT_MAX} символа`)
  .transform((s) => s.trim());

export const chatSchema = identitySchema.extend({
  message: z.string().trim().min(1).max(2000),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});
