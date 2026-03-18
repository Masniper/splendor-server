import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { AuthRequest } from '../middlewares/auth.middleware';

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_for_splendor_game_123!";

const prisma = new PrismaClient();

// 1. Create a Guest User
export const createGuestUser = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Explicitly set is_guest to true since the default in schema is false
    const guestUser = await prisma.user.create({
      data: {
        is_guest: true,
        // Optional: generate a random guest username if you want
        // username: `Guest_${Math.floor(Math.random() * 10000)}`
      },
    });

    const token = jwt.sign(
      { userId: guestUser.id },
      JWT_SECRET,
      { expiresIn: "7d" }, // Token valid for 7 days
    );

    res.status(201).json({
      success: true,
      message: "Guest user created successfully",
      token,
      user: {
        id: guestUser.id,
        is_guest: guestUser.is_guest,
        coins: guestUser.coins,
        mmr: guestUser.mmr,
      },
    });
  } catch (error) {
    console.error("Error creating guest user:", error);
    res
      .status(500)
      .json({
        success: false,
        error: "Internal server error while creating guest user",
      });
  }
};

// 2. Upgrade Guest to Regular Account
export const upgradeAccount = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.userId;
    const { email, password, username } = req.body;

    if (!userId) {
      res
        .status(401)
        .json({ success: false, error: "Unauthorized: User ID is missing" });
      return;
    }

    if (!email || !password || !username) {
      res
        .status(400)
        .json({
          success: false,
          error: "Email, password, and username are required",
        });
      return;
    }

    // Check if email or username is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: email.toLowerCase() }, { username: username.trim() }],
      },
    });

    if (existingUser) {
      res
        .status(400)
        .json({ success: false, error: "Email or Username is already in use" });
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update the guest user with new credentials
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        username: username.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        is_guest: false, // No longer a guest
      },
      select: {
        id: true,
        username: true,
        email: true,
        is_guest: true,
        coins: true,
        mmr: true,
        profile_picture: true,
        bio: true,
      }, // Exclude password from the response
    });

    res.json({
      success: true,
      message: "Account upgraded successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error upgrading account:", error);
    res
      .status(500)
      .json({
        success: false,
        error: "Internal server error during account upgrade",
      });
  }
};

// 3. Login for Regular Users
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res
        .status(400)
        .json({ success: false, error: "Email and password are required" });
      return;
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Check if user exists and has a password
    if (!user || !user.password) {
      res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
      return;
    }

    // Compare provided password with hashed password in database
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
      return;
    }

    // Generate new JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_guest: user.is_guest,
        coins: user.coins,
        mmr: user.mmr,
        profile_picture: user.profile_picture,
        bio: user.bio,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    res
      .status(500)
      .json({ success: false, error: "Internal server error during login" });
  }
};
