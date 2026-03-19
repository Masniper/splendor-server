import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { UserRole } from "@prisma/client";
import { prisma } from "./prisma.service";
import { upgradeGuestAccount } from "./user.service";

dotenv.config();
const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_key_for_splendor_game_123!";

function signToken(userId: string) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export async function createGuestUserSession() {
  const guestUser = await prisma.user.create({
    data: {
      is_guest: true,
      role: UserRole.GUEST,
    },
  });

  return {
    token: signToken(guestUser.id),
    user: {
      id: guestUser.id,
      is_guest: guestUser.is_guest,
      role: guestUser.role,
      coins: guestUser.coins,
      xp: guestUser.xp,
      wins: guestUser.wins,
      losses: guestUser.losses,
      mmr: guestUser.mmr,
    },
  };
}

export async function upgradeGuestUserSession(payload: {
  userId: string;
  username: string;
  email: string;
  password: string;
}) {
  return upgradeGuestAccount(payload);
}

export async function loginUserSession(payload: {
  email: string;
  password: string;
}) {
  const email = payload.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    throw new Error("Invalid email or password.");
  }

  const validPassword = await bcrypt.compare(payload.password, user.password);
  if (!validPassword) {
    throw new Error("Invalid email or password.");
  }

  return {
    token: signToken(user.id),
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      is_guest: user.is_guest,
      role: user.role,
      coins: user.coins,
      xp: user.xp,
      wins: user.wins,
      losses: user.losses,
      mmr: user.mmr,
      profile_picture: user.profile_picture,
      bio: user.bio,
    },
  };
}

export async function registerUserSession(payload: {
  email: string;
  password: string;
  username?: string;
}) {
  const email = payload.email.trim().toLowerCase();
  const username = payload.username?.trim();

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new Error("Email is already in use.");
  }
  if (username) {
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      throw new Error("Username is already taken.");
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(payload.password, salt);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      username,
      is_guest: false,
      role: UserRole.USER,
    },
  });

  return {
    token: signToken(user.id),
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      is_guest: user.is_guest,
      role: user.role,
      coins: user.coins,
      xp: user.xp,
      wins: user.wins,
      losses: user.losses,
      mmr: user.mmr,
    },
  };
}
