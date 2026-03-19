import { z } from "zod";

export const updateProfileBodySchema = z.object({
  username: z.string().trim().min(3).max(32).optional(),
  bio: z.string().max(300).optional(),
  profile_picture: z.string().url().optional().or(z.literal("")),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});
