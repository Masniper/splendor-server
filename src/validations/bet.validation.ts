import { z } from "zod";

export const placeBetBodySchema = z.object({
  roomId: z.string().min(1),
  amount: z.number().int().positive().max(1_000_000),
});

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
