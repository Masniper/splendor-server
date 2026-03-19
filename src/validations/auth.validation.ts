import { z } from "zod";

export const upgradeAccountBodySchema = z.object({
  username: z.string().trim().min(3).max(32),
  email: z.string().trim().email(),
  password: z.string().min(6).max(128),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const registerBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(128),
  username: z.string().trim().min(3).max(32).optional(),
});
