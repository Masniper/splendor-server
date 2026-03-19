import { prisma } from "./prisma.service";

function toWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Number(((wins / total) * 100).toFixed(2));
}

export async function getTopUsers(limit = 10) {
  const users = await prisma.user.findMany({
    where: { role: "USER" },
    orderBy: [{ xp: "desc" }, { coins: "desc" }],
    take: limit,
    select: {
      id: true,
      username: true,
      profile_picture: true,
      xp: true,
      coins: true,
      wins: true,
      losses: true,
    },
  });

  return users.map((user, index) => ({
    rank: index + 1,
    ...user,
    winRate: toWinRate(user.wins, user.losses),
  }));
}
