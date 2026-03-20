import { NextFunction, Request, Response } from "express";
import { getTopUsers } from "../services/leaderboard.service";
import { leaderboardQuerySchema } from "../validations/bet.validation";

export const getLeaderboard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = leaderboardQuerySchema.parse(req.query);
    const limit = parsed.limit ?? 10;
    const leaderboard = await getTopUsers(limit);
    res.status(200).json({ success: true, data: leaderboard });
  } catch (error) {
    next(error);
  }
};
