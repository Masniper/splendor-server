import { NextFunction, Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import {
  createGuestUserSession,
  loginUserSession,
  registerUserSession,
  upgradeGuestUserSession,
} from "../services/auth.service";

export const createGuestUser = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await createGuestUserSession();
    res.status(201).json({
      success: true,
      message: "Guest user created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const upgradeAccount = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    const result = await upgradeGuestUserSession({
      userId: req.userId,
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await loginUserSession({
      email: req.body.email,
      password: req.body.password,
    });
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await registerUserSession({
      email: req.body.email,
      password: req.body.password,
      username: req.body.username,
    });
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};