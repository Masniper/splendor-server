import { NextFunction, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { placeBetForUser } from "../services/bet.service";

export const placeBet = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const bet = await placeBetForUser(req.userId, req.body.roomId, req.body.amount);
    res.status(201).json({ success: true, data: bet });
  } catch (error) {
    next(error);
  }
};
