import { BetStatus, Prisma, RoomStatus } from "@prisma/client";
import type { Bet } from "@prisma/client";
import { prisma } from "./prisma.service";

const DEFAULT_XP_REWARD = 25;
/** Extra coins awarded to the winner on each match win, on top of the bet pool payout. */
export const WIN_BONUS_COINS = 25;

/**
 * Refund policy for abandoned mid-game matches (future: call when a player is removed
 * after disconnect timeout). Not enforced with user restrictions yet.
 */
export async function refundPendingBetForUser(roomId: string, userId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const bet = await tx.bet.findFirst({
      where: { roomId, userId, status: BetStatus.PENDING },
    });
    if (!bet) return { refunded: 0 };

    await tx.bet.update({
      where: { id: bet.id },
      data: { status: BetStatus.REFUNDED, payout: 0, settledAt: new Date() },
    });
    if (bet.amount > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: bet.amount } },
      });
    }
    return { refunded: bet.amount };
  });
}

export function computeWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Number(((wins / total) * 100).toFixed(2));
}

export async function assertUserHasCoins(userId: string, amount: number) {
  if (amount <= 0) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");
  if (user.coins < amount) throw new Error("Insufficient coins.");
}

export async function placeBetForUser(userId: string, roomId: string, amount: number) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error("Room not found.");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found.");
    if (user.coins < amount) throw new Error("Insufficient coins.");

    const existingPending = await tx.bet.findFirst({
      where: { roomId, userId, status: BetStatus.PENDING },
    });
    if (existingPending) {
      throw new Error("You already have a pending bet for this room.");
    }

    await tx.user.update({
      where: { id: userId },
      data: { coins: { decrement: amount } },
    });

    const bet = await tx.bet.create({
      data: { roomId, userId, amount, status: BetStatus.PENDING },
    });

    return bet;
  });
}

export async function initializeRoomBets(
  roomId: string,
  userIds: string[],
  amount: number,
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const room = await tx.room.findUnique({ where: { id: roomId } });
    if (!room) throw new Error("Room not found.");

    await tx.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.PLAYING },
    });

    const existingPending = await tx.bet.findMany({
      where: { roomId, status: BetStatus.PENDING },
      select: { userId: true },
    });
    const existingSet = new Set(
      existingPending.map((b: { userId: string }) => b.userId),
    );

    for (const userId of userIds) {
      if (existingSet.has(userId)) continue;

      if (amount > 0) {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("User not found.");
        if (user.coins < amount) throw new Error("Insufficient coins.");
        await tx.user.update({
          where: { id: userId },
          data: { coins: { decrement: amount } },
        });
      }

      await tx.bet.create({
        data: {
          roomId,
          userId,
          amount,
          status: BetStatus.PENDING,
        },
      });
    }

    return { roomId, created: userIds.length - existingSet.size };
  });
}

export async function settleRoomBets(
  roomId: string,
  winnerUserId: string,
  xpReward = DEFAULT_XP_REWARD,
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      include: { members: { select: { id: true } } },
    });
    if (!room) throw new Error("Room not found.");

    const pendingBets = await tx.bet.findMany({
      where: { roomId, status: BetStatus.PENDING },
    });
    if (pendingBets.length === 0) {
      throw new Error("No pending bets found for this room.");
    }

    const totalPool = pendingBets.reduce(
      (acc: number, bet: Bet) => acc + bet.amount,
      0,
    );
    const winners = pendingBets.filter((bet: Bet) => bet.userId === winnerUserId);
    if (winners.length === 0) {
      throw new Error("Winner does not have any pending bet in this room.");
    }

    const payoutPerWinner = Math.floor(totalPool / winners.length);
    const payoutRemainder = totalPool % winners.length;

    for (let i = 0; i < winners.length; i += 1) {
      const payout = payoutPerWinner + (i === 0 ? payoutRemainder : 0);
      await tx.bet.update({
        where: { id: winners[i].id },
        data: {
          status: BetStatus.WON,
          payout,
          settledAt: new Date(),
        },
      });
      await tx.user.update({
        where: { id: winners[i].userId },
        data: {
          coins: { increment: payout + WIN_BONUS_COINS },
          wins: { increment: 1 },
          xp: { increment: xpReward },
        },
      });
    }

    const losers = pendingBets.filter((bet: Bet) => bet.userId !== winnerUserId);
    const loserStats: Array<{
      userId: string;
      coinsLost: number;
      coins: number;
      xp: number;
      wins: number;
      losses: number;
      winRate: number;
    }> = [];

    for (const loser of losers) {
      await tx.bet.update({
        where: { id: loser.id },
        data: { status: BetStatus.LOST, payout: 0, settledAt: new Date() },
      });
      await tx.user.update({
        where: { id: loser.userId },
        data: {
          losses: { increment: 1 },
          xp: { increment: Math.max(5, Math.floor(xpReward / 3)) },
        },
      });
      const loserUser = await tx.user.findUnique({
        where: { id: loser.userId },
        select: { coins: true, xp: true, wins: true, losses: true },
      });
      if (loserUser) {
        loserStats.push({
          userId: loser.userId,
          coinsLost: loser.amount,
          coins: loserUser.coins,
          xp: loserUser.xp,
          wins: loserUser.wins,
          losses: loserUser.losses,
          winRate: Math.round(computeWinRate(loserUser.wins, loserUser.losses)),
        });
      }
    }

    await tx.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.FINISHED },
    });

    const winnerUser = await tx.user.findUnique({
      where: { id: winnerUserId },
      select: { coins: true, xp: true, wins: true, losses: true },
    });
    if (!winnerUser) throw new Error("Winner user not found.");

    return {
      roomId,
      totalPool,
      winnerUserId,
      winnersCount: winners.length,
      payoutPerWinner,
      payoutRemainder,
      loserStats,
      winnerStats: {
        coins: winnerUser.coins,
        xp: winnerUser.xp,
        wins: winnerUser.wins,
        losses: winnerUser.losses,
        winRate: Math.round(
          computeWinRate(winnerUser.wins, winnerUser.losses),
        ),
      },
    };
  });
}

export type SettleRoomBetsResult = Awaited<
  ReturnType<typeof settleRoomBets>
>;
