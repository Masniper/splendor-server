import { RoomStatus } from "@prisma/client";
import { prisma } from "./prisma.service";

function generateDefaultRoomName() {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `Room-${suffix}`;
}

export async function createRoomForUser(userId: string, name?: string) {
  const finalName = name?.trim() || generateDefaultRoomName();

  return prisma.room.create({
    data: {
      name: finalName,
      status: RoomStatus.WAITING,
      hostId: userId,
      members: {
        connect: [{ id: userId }],
      },
    },
    include: {
      host: { select: { id: true, username: true } },
      members: { select: { id: true, username: true } },
    },
  });
}
