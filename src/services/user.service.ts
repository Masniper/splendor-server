import bcrypt from "bcryptjs";
import { Prisma, User, UserRole } from "@prisma/client";
import { prisma } from "./prisma.service";

const WELCOME_REWARD_COINS = 500;

type UpgradePayload = {
  userId: string;
  email: string;
  password: string;
  username: string;
};

function computeWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Number(((wins / total) * 100).toFixed(2));
}

function publicUserShape(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    is_guest: user.is_guest,
    coins: user.coins,
    xp: user.xp,
    wins: user.wins,
    losses: user.losses,
    winRate: computeWinRate(user.wins, user.losses),
    profile_picture: user.profile_picture,
    bio: user.bio,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export async function upgradeGuestAccount(payload: UpgradePayload) {
  const { userId, email, password, username } = payload;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      NOT: { id: userId },
    },
  });
  if (existingUser) {
    throw new Error("Email or username is already in use.");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const upgraded = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    return tx.user.update({
      where: { id: userId },
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        is_guest: false,
        role: UserRole.USER,
        coins: { increment: WELCOME_REWARD_COINS },
      },
    });
  });

  return {
    message: `Account upgraded successfully. Welcome reward: ${WELCOME_REWARD_COINS} coins.`,
    user: publicUserShape(upgraded),
  };
}

export async function getCurrentUserProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found.");
  }
  return publicUserShape(user);
}

export async function updateCurrentUserProfile(
  userId: string,
  payload: { username?: string; bio?: string; profile_picture?: string },
) {
  const incomingUsername = payload.username?.trim();
  if (incomingUsername) {
    const existing = await prisma.user.findFirst({
      where: { username: incomingUsername, NOT: { id: userId } },
    });
    if (existing) {
      throw new Error("Username is already in use.");
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(incomingUsername ? { username: incomingUsername } : {}),
      ...(payload.bio !== undefined ? { bio: payload.bio } : {}),
      ...(payload.profile_picture !== undefined
        ? { profile_picture: payload.profile_picture || null }
        : {}),
    },
  });

  return publicUserShape(user);
}

export async function getPublicUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found.");
  }
  return publicUserShape(user);
}
