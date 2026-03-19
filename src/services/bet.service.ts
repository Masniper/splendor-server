import { BetStatus } from "@prisma/client";
import { prisma } from "./prisma.service";

const DEFAULT_XP_REWARD = 25;

export async function placeBetForUser(userId: string, roomId: string, amount: number) {
  return prisma.$transaction(async (tx) => {
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

export async function settleRoomBets(
  roomId: string,
  winnerUserId: string,
  xpReward = DEFAULT_XP_REWARD,
) {
  return prisma.$transaction(async (tx) => {
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

    const totalPool = pendingBets.reduce((acc, bet) => acc + bet.amount, 0);
    const winners = pendingBets.filter((bet) => bet.userId === winnerUserId);
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
          coins: { increment: payout },
          wins: { increment: 1 },
          xp: { increment: xpReward },
        },
      });
    }

    const losers = pendingBets.filter((bet) => bet.userId !== winnerUserId);
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
    }

    await tx.room.update({
      where: { id: roomId },
      data: { status: "FINISHED" },
    });

    return {
      roomId,
      totalPool,
      winnerUserId,
      winnersCount: winners.length,
      payoutPerWinner,
      payoutRemainder,
    };
  });
}
