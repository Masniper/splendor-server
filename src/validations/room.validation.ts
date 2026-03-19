import { z } from "zod";

export const createRoomBodySchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
});

export const settleRoomParamsSchema = z.object({
  roomId: z.string().min(1),
});

export const settleRoomBodySchema = z.object({
  winnerUserId: z.string().min(1),
  xpReward: z.number().int().min(0).max(10000).optional(),
});
