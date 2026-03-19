import { NextFunction, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import {
  getCurrentUserProfile,
  getPublicUserById,
  updateCurrentUserProfile,
} from "../services/user.service";

export const getMe = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    const user = await getCurrentUserProfile(req.userId);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    const user = await updateCurrentUserProfile(req.userId, req.body);
    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await getPublicUserById(String(req.params.userId));
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};
