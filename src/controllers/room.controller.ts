import { NextFunction, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { settleRoomBets } from "../services/bet.service";
import { createRoomForUser } from "../services/room.service";

export const createRoom = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    const room = await createRoomForUser({
      hostId: req.userId,
      name: req.body.name,
      isPublic: req.body.isPublic,
      betAmount: req.body.betAmount,
    });
    res.status(201).json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
};

export const settleRoom = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const roomId = String(req.params.roomId);
    const { winnerUserId, xpReward } = req.body;
    const result = await settleRoomBets(roomId, winnerUserId, xpReward);
    res.status(200).json({
      success: true,
      message: "Room bets settled successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
