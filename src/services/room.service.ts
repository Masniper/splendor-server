import { Prisma, RoomStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "./prisma.service";

const MAX_ROOM_ID_ATTEMPTS = 12;

const roomCreateInclude = {
  host: { select: { id: true, username: true } },
  members: { select: { id: true, username: true } },
} as const;

export type CreatedRoomRecord = Prisma.RoomGetPayload<{
  include: typeof roomCreateInclude;
}>;

function generateDefaultRoomName() {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `Room-${suffix}`;
}

export function generateShortRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export type CreateRoomParams = {
  roomId?: string;
  hostId: string;
  name?: string;
  isPublic?: boolean;
  betAmount?: number;
};

/**
 * Creates a room in the database. Retries on primary-key collision when roomId is auto-generated.
 * When betAmount > 0, validates host coin balance inside the same transaction as insert.
 */
export async function createRoomForUser(
  params: CreateRoomParams,
): Promise<CreatedRoomRecord> {
  const { hostId, name, isPublic = true, betAmount = 0 } = params;
  const finalName = name?.trim() || generateDefaultRoomName();

  for (let attempt = 0; attempt < MAX_ROOM_ID_ATTEMPTS; attempt += 1) {
    const roomId = params.roomId ?? generateShortRoomCode();
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (betAmount > 0) {
          const user = await tx.user.findUnique({ where: { id: hostId } });
          if (!user) throw new Error("User not found.");
          if (user.coins < betAmount) throw new Error("Insufficient coins.");
        }

        return tx.room.create({
          data: {
            id: roomId,
            name: finalName,
            status: RoomStatus.WAITING,
            hostId,
            isPublic,
            betAmount,
            members: { connect: [{ id: hostId }] },
          },
          include: roomCreateInclude,
        });
      });
    } catch (e: unknown) {
      if (
        e instanceof PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        if (params.roomId) {
          throw new Error("Room code already exists.");
        }
        continue;
      }
      throw e;
    }
  }

  throw new Error("Could not create room: unable to allocate a unique code.");
}

export async function addMemberToRoom(roomId: string, userId: string) {
  await prisma.room.update({
    where: { id: roomId },
    data: { members: { connect: [{ id: userId }] } },
  });
}

export async function removeMemberFromRoom(roomId: string, userId: string) {
  await prisma.room.update({
    where: { id: roomId },
    data: { members: { disconnect: [{ id: userId }] } },
  });
}

export async function setRoomStatus(roomId: string, status: RoomStatus) {
  await prisma.room.update({
    where: { id: roomId },
    data: { status },
  });
}

export async function deleteRoom(roomId: string) {
  await prisma.room.delete({ where: { id: roomId } });
}

export async function updateRoomHost(roomId: string, newHostId: string) {
  await prisma.room.update({
    where: { id: roomId },
    data: { hostId: newHostId },
  });
}
