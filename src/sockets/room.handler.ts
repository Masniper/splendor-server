import { Server, Socket } from "socket.io";
import { GameState } from "../game/models";
import { initializeGame } from "../game/setup";
import {
  level1Cards,
  level2Cards,
  level3Cards,
  noblesData,
} from "../game/data";
import type { PublicRoomListItem } from "../types/room";
import { parseBetAmountForSocket } from "../utils/roomInput";
import {
  addMemberToRoom,
  createRoomForUser,
  deleteRoom,
  removeMemberFromRoom,
  updateRoomHost,
} from "../services/room.service";
import {
  assertUserHasCoins,
  initializeRoomBets,
  settleRoomBets,
} from "../services/bet.service";
import { prisma } from "../services/prisma.service";

export interface Room {
  id: string;
  hostId: string;
  originalHostId: string;
  players: { userId: string; socketId: string | null; username: string }[];
  gameState: GameState | null;
  status: "waiting" | "playing" | "finished";
  rematchRequests: string[];
  rematchEnabled: boolean;
  isPublic: boolean;
  waitingForReconnection: boolean;
  /** Display name — mirrors persisted Room.name */
  name: string;
  betAmount: number;
  disconnectTimeouts: Map<string, NodeJS.Timeout>;
  disconnectDeadlines: Record<string, number>;
}

export const activeRooms = new Map<string, Room>();
export const playerSessions = new Map<string, string>();

const DISCONNECT_TIMEOUT_MS = 120000; // 2 minutes

function cleanupPlayerSession(userId: string, roomId: string) {
  playerSessions.delete(userId);
  const room = activeRooms.get(roomId);
  if (room) {
    const timeout = room.disconnectTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      room.disconnectTimeouts.delete(userId);
    }
    delete room.disconnectDeadlines[userId];
  }
}

export function registerRoomHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;
  /** Always read current value (e.g. after auth:refresh updates socket.data). */
  const getUsername = () => (socket.data.username as string) || "";

  const emitDisconnectStatus = (room: Room) => {
    const pending = room.players
      .filter((p) => p.socketId === null)
      .map((p) => ({
        userId: p.userId,
        username: p.username,
        expiresAt: room.disconnectDeadlines[p.userId] ?? Date.now(),
        isHost: room.hostId === p.userId,
      }));

    io.to(room.id).emit("room:disconnectStatus", { pending });
  };

  // Helper to get usernames of players who requested a rematch
  const getRematchUsernames = (room: Room) =>
    room.rematchRequests
      .map((id) => room.players.find((p) => p.userId === id)?.username)
      .filter(Boolean) as string[];

  const broadcastRematchUpdate = (room: Room, message?: string) => {
    io.to(room.id).emit("game:rematch:update", {
      enabled: room.rematchEnabled,
      requestedBy: getRematchUsernames(room),
      totalPlayers: room.players.length,
      message,
    });
  };

  const endGameForRoom = (room: Room, reason: string) => {
    room.status = "finished";
    // Keep the latest gameState so the frontend can display a GameOver modal.
    room.rematchEnabled = false;
    room.rematchRequests = [];
    io.to(room.id).emit("game:error", { message: reason });
    io.to(room.id).emit("game:ended");
    broadcastRematchUpdate(room, reason);
  };

  const removePlayerFromRoomSilent = (
    room: Room,
    targetUserId: string,
    roomId: string,
  ) => {
    const playerIndex = room.players.findIndex(
      (p) => p.userId === targetUserId,
    );
    if (playerIndex === -1) return false;

    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    delete room.disconnectDeadlines[targetUserId];
    cleanupPlayerSession(targetUserId, roomId);

    if (room.players.length === 0) {
      activeRooms.delete(roomId);
      room.disconnectTimeouts.delete(targetUserId);
      return true;
    }

    void removeMemberFromRoom(roomId, targetUserId).catch((err) =>
      console.error("[Room] removeMemberFromRoom failed:", err),
    );

    // Host migration
    if (room.hostId === targetUserId && room.players.length > 0) {
      room.hostId = room.players[0].userId;
      void updateRoomHost(roomId, room.hostId).catch((err) =>
        console.error("[Room] updateRoomHost failed:", err),
      );
    }

    // If the original creator leaves, disable rematch (matches prior behavior)
    if (room.originalHostId === targetUserId) {
      room.rematchEnabled = false;
      broadcastRematchUpdate(room, "Host left. Rematch disabled.");
    }

    // If game hasn't started, keep memory consistent (no GameOver emitted here)
    if (room.status !== "playing") {
      io.to(roomId).emit("room:updated", { room });
    }

    return false;
  };

  const removePlayerFromRoom = (
    room: Room,
    userId: string,
    roomId: string,
  ): boolean => {
    const playerIndex = room.players.findIndex((p) => p.userId === userId);
    if (playerIndex === -1) return false;

    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    delete room.disconnectDeadlines[userId];
    cleanupPlayerSession(userId, roomId);

    // If room is empty after player leaves, delete it entirely
    if (room.players.length === 0) {
      activeRooms.delete(roomId);
      console.log(`[Room] Room ${roomId} deleted (empty)`);
      return true;
    }

    void removeMemberFromRoom(roomId, userId).catch((err) =>
      console.error("[Room] removeMemberFromRoom failed:", err),
    );

    // Host migration (transfers host to the first remaining player)
    if (room.hostId === userId) {
      room.hostId = room.players[0].userId;
      console.log(`[Room] Host migrated to ${room.players[0].username} in room ${roomId}`);
      void updateRoomHost(roomId, room.hostId).catch((err) =>
        console.error("[Room] updateRoomHost failed:", err),
      );
    }

    // If the original creator leaves, disable the rematch feature
    if (room.originalHostId === userId) {
      room.rematchEnabled = false;
      broadcastRematchUpdate(room, "Host left. Rematch disabled.");
    }

    // Handle leaving during an active game
    if (room.status === "playing") {
      if (room.players.length === 1) {
        endGameForRoom(
          room,
          `${player.username} left. Only one player remaining. Game ended.`,
        );
        cleanupPlayerSession(room.players[0].userId, roomId);
      } else {
        endGameForRoom(room, `${player.username} left. Game ended.`);
      }
    }

    return false;
  };

  socket.on(
    "room:create",
    async (
      data: {
        isPublic?: boolean;
        roomName?: string;
        betAmount?: number;
      } = {},
    ) => {
      const isPublic = data.isPublic ?? true;
      const customName = data.roomName?.trim() || undefined;
      const parsedBet = parseBetAmountForSocket(data.betAmount);
      if (!parsedBet.ok) {
        return socket.emit("error", { message: parsedBet.message });
      }
      const betAmount = parsedBet.value;

      try {
        const row = await createRoomForUser({
          hostId: userId,
          name: customName,
          isPublic,
          betAmount,
        });

        const roomId = row.id;
        const displayName = row.name?.trim() || roomId;

        const newRoom: Room = {
          id: roomId,
          hostId: userId,
          originalHostId: userId,
          players: [{ userId, socketId: socket.id, username: getUsername() }],
          gameState: null,
          status: "waiting",
          rematchRequests: [],
          rematchEnabled: true,
          isPublic: row.isPublic,
          waitingForReconnection: false,
          name: displayName,
          betAmount: row.betAmount,
          disconnectTimeouts: new Map(),
          disconnectDeadlines: {},
        };

        activeRooms.set(roomId, newRoom);
        playerSessions.set(userId, roomId);
        socket.join(roomId);

        socket.emit("room:created", { roomId, room: newRoom });
        console.log(`[Room] User ${getUsername()} created room ${roomId}`);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Failed to create room";
        console.error("[Room] createRoomForUser failed:", message);
        socket.emit("error", { message });
      }
    },
  );

  socket.on("room:join", async (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) {
      return socket.emit("error", { message: "Room not found" });
    }
    if (room.status !== "waiting") {
      return socket.emit("error", { message: "Game already started" });
    }
    const existing = room.players.find((p) => p.userId === userId);
    if (existing) {
      existing.socketId = socket.id;
      existing.username = getUsername();
      playerSessions.set(userId, roomId);
      socket.join(roomId);
      io.to(roomId).emit("room:updated", { room });
      return;
    }

    if (room.players.length >= 4) {
      return socket.emit("error", { message: "Room is full" });
    }

    if (room.betAmount > 0) {
      try {
        await assertUserHasCoins(userId, room.betAmount);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Insufficient coins to join this room.";
        return socket.emit("error", { message });
      }
    }

    try {
      await addMemberToRoom(roomId, userId);
    } catch (err) {
      console.error("[Room] addMemberToRoom failed:", err);
      return socket.emit("error", { message: "Failed to join room" });
    }

    room.players.push({ userId, socketId: socket.id, username: getUsername() });
    playerSessions.set(userId, roomId);
    socket.join(roomId);

    io.to(roomId).emit("room:updated", { room });
    console.log(`[Room] User ${getUsername()} joined room ${roomId}`);
  });

  socket.on("room:reconnect", (roomId: string) => {
    console.log(
      `[Room] Reconnect attempt for room ${roomId} by ${getUsername()} (${userId})`,
    );
    
    const room = activeRooms.get(roomId);
    if (!room) {
      console.log(`[Room] Room ${roomId} not found`);
      cleanupPlayerSession(userId, roomId);
      return socket.emit("error", { message: "Room not found" });
    }

    // Clear any pending disconnect timeout
    const timeoutId = room.disconnectTimeouts.get(userId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      room.disconnectTimeouts.delete(userId);
    }
    delete room.disconnectDeadlines[userId];

    const player = room.players.find((p) => p.userId === userId);
    if (!player) {
      console.log(`[Room] Player ${userId} not found in room ${roomId}`);
      cleanupPlayerSession(userId, roomId);
      return socket.emit("error", { message: "You were not in this room" });
    }

    // Restore player socket data
    player.socketId = socket.id;
    const freshName = getUsername();
    if (player.username !== freshName) {
      player.username = freshName;
      if (room.gameState) {
        const gp = room.gameState.players.find((p) => p.id === userId);
        if (gp) gp.name = freshName;
      }
    }
    playerSessions.set(userId, roomId);
    socket.join(roomId);

    // If no players have a null socketId, everyone is connected
    if (!room.players.some((p) => p.socketId === null)) {
      room.waitingForReconnection = false;
    }

    // Restore game state to the reconnected client
    if (room.status === "playing" && room.gameState) {
      socket.emit("game:updated", { gameState: room.gameState });
    } else if (room.status === "finished") {
      socket.emit("game:ended");
    }

    io.to(roomId).emit("player:reconnected", { userId, username: freshName });
    io.to(roomId).emit("room:updated", { room });
    if (room.status === "playing" && room.gameState) {
      io.to(roomId).emit("game:updated", { gameState: room.gameState });
    }
    emitDisconnectStatus(room);
    console.log(`[Room] User ${freshName} reconnected to room ${roomId}`);
  });

  socket.on("room:listPublic", () => {
    const publicRooms: PublicRoomListItem[] = Array.from(
      activeRooms.values(),
    )
      .filter((room) => room.isPublic && room.status !== "finished")
      .map((room) => ({
        id: room.id,
        name: room.name,
        hostName:
          room.players.find((p) => p.userId === room.hostId)?.username ||
          "Unknown",
        playerCount: room.players.length,
        status: room.status,
        canJoin: room.status === "waiting" && room.players.length < 4,
        betAmount: room.betAmount,
        isPublic: room.isPublic,
      }));

    socket.emit("room:publicList", publicRooms);
  });

  socket.on("room:getSession", () => {
    const roomId = playerSessions.get(userId);
    if (roomId) {
      const room = activeRooms.get(roomId);
      if (room) {
        socket.emit("room:sessionRestored", { roomId, room });
        emitDisconnectStatus(room);
      } else {
        cleanupPlayerSession(userId, roomId);
        socket.emit("room:sessionCleared");
      }
    } else {
      socket.emit("room:sessionCleared");
    }
  });

  /** Sync display name after guest → member upgrade without forcing a full reconnect. */
  socket.on("auth:refresh", async () => {
    try {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      const dbName = row?.username?.trim();
      if (!dbName) return;

      socket.data.username = dbName;

      const roomId = playerSessions.get(userId);
      if (!roomId) return;
      const room = activeRooms.get(roomId);
      if (!room) return;

      const roomPlayer = room.players.find((p) => p.userId === userId);
      if (!roomPlayer) return;

      let changed = false;
      if (roomPlayer.username !== dbName) {
        roomPlayer.username = dbName;
        changed = true;
      }
      if (room.gameState) {
        const gp = room.gameState.players.find((p) => p.id === userId);
        if (gp && gp.name !== dbName) {
          gp.name = dbName;
          changed = true;
        }
      }

      if (!changed) return;

      io.to(roomId).emit("room:updated", { room });
      if (room.gameState && room.status === "playing") {
        io.to(roomId).emit("game:updated", { gameState: room.gameState });
      }
    } catch (err) {
      console.error("[Room] auth:refresh failed:", err);
    }
  });

  socket.on("leaveRoom", (data: { roomCode: string }) => {
    const room = activeRooms.get(data.roomCode);
    if (!room) return;

    socket.leave(data.roomCode);
    
    const roomDeleted = removePlayerFromRoom(room, userId, data.roomCode);
    
    if (!roomDeleted) {
      io.to(data.roomCode).emit("room:updated", { room });
    } else {
      io.to(data.roomCode).emit("room:terminated");
      void deleteRoom(data.roomCode).catch(() => {});
    }

    console.log(`[Room] User ${getUsername()} left room ${data.roomCode}`);
  });

  socket.on("room:start", (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) return socket.emit("error", { message: "Room not found" });
    if (room.hostId !== userId)
      return socket.emit("error", { message: "Only host can start the game" });
    if (room.players.length < 2)
      return socket.emit("error", {
        message: "Need at least 2 players to start",
      });

    // Initialize bets + deduct coins (transaction-safe) before starting the game.
    // Even for free rooms (betAmount=0), we create pending bet records so settlement is unified.
    initializeRoomBets(roomId, room.players.map((p) => p.userId), room.betAmount)
      .then(() => {
    const playersInfo = room.players.map((p) => ({
      id: p.userId,
      name: p.username,
    }));

    const newGameState = initializeGame(
      roomId,
      playersInfo,
      level1Cards,
      level2Cards,
      level3Cards,
      noblesData,
    );

    room.gameState = newGameState;
    room.status = "playing";
    room.rematchRequests = [];
    room.rematchEnabled = true;

    io.to(roomId).emit("game:started", { gameState: newGameState });
    console.log(`[Room] Game started in room ${roomId}`);
      })
      .catch((e: any) => {
        console.error(`[Room] Failed to initialize bets for room ${roomId}:`, e?.message ?? e);
        socket.emit("error", { message: e?.message ?? "Failed to start game" });
      });
  });

  socket.on("game:rematch:request", (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) return socket.emit("error", { message: "Room not found" });
    if (room.status !== "finished")
      return socket.emit("error", { message: "Game is not finished yet" });
    if (!room.rematchEnabled)
      return socket.emit("error", { message: "Rematch is disabled" });
    if (!room.players.some((p) => p.userId === userId))
      return socket.emit("error", { message: "You are not in this room" });

    if (!room.rematchRequests.includes(userId)) {
      room.rematchRequests.push(userId);
    }

    broadcastRematchUpdate(room);

    // If everyone requested a rematch, start the game anew
    if (room.rematchRequests.length === room.players.length) {
      initializeRoomBets(
        roomId,
        room.players.map((p) => p.userId),
        room.betAmount,
      )
        .then(() => {
          const playersInfo = room.players.map((p) => ({
            id: p.userId,
            name: p.username,
          }));

          const newGameState = initializeGame(
            roomId,
            playersInfo,
            level1Cards,
            level2Cards,
            level3Cards,
            noblesData,
          );

          room.gameState = newGameState;
          room.status = "playing";
          room.rematchRequests = [];

          io.to(roomId).emit("game:started", { gameState: newGameState });
          console.log(`[Room] Rematch started in room ${roomId}`);
        })
        .catch((e: any) => {
          console.error(`[Room] Failed to init rematch bets:`, e?.message ?? e);
          socket.emit("error", {
            message: e?.message ?? "Failed to start rematch",
          });
        });
    }
  });

  socket.on("game:rematch:cancel", (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) return socket.emit("error", { message: "Room not found" });

    const index = room.rematchRequests.indexOf(userId);
    if (index > -1) {
      room.rematchRequests.splice(index, 1);
    }

    broadcastRematchUpdate(room);
  });

  socket.on("disconnect", () => {
    console.log(`[Socket] User ${getUsername()} (${userId}) disconnected`);

    const roomId = playerSessions.get(userId);
    if (!roomId) return;

    const room = activeRooms.get(roomId);
    if (!room) {
      cleanupPlayerSession(userId, roomId);
      return;
    }

    const player = room.players.find((p) => p.userId === userId);
    if (!player) return;

    player.socketId = null;

    // If the game hasn't started, remove the player immediately
    if (room.status === "waiting") {
      const roomDeleted = removePlayerFromRoom(room, userId, roomId);
      if (!roomDeleted) {
        io.to(roomId).emit("room:updated", { room });
      } else {
        io.to(roomId).emit("room:terminated");
        void deleteRoom(roomId).catch(() => {});
      }
      return;
    }

    // If game is in progress or finished, initiate a disconnect timeout
    room.waitingForReconnection = true;
    const expiresAt = Date.now() + DISCONNECT_TIMEOUT_MS;
    room.disconnectDeadlines[userId] = expiresAt;
    io.to(roomId).emit("player:disconnected", { 
      userId, 
      username: player.username,
      timeoutMs: DISCONNECT_TIMEOUT_MS,
      expiresAt,
      isHost: room.hostId === userId
    });
    emitDisconnectStatus(room);

    const timeoutId = setTimeout(() => {
      const currentRoom = activeRooms.get(roomId);
      if (!currentRoom) return;

      const currentPlayer = currentRoom.players.find(
        (p) => p.userId === userId,
      );

      console.log(
        `[Room] Timeout reached for ${currentPlayer?.username ?? userId} in room ${roomId}. Removing player.`,
      );

      // Safety check: Don't remove if they reconnected in the meantime
      if (!currentPlayer || currentPlayer.socketId !== null) return;

      delete currentRoom.disconnectDeadlines[userId];

      const playersAfterRemoval = currentRoom.players.filter(
        (p) => p.userId !== userId,
      );
      const remainingConnected = playersAfterRemoval.filter(
        (p) => p.socketId !== null,
      );

      if (
        currentRoom.status === "playing" &&
        remainingConnected.length === 1 &&
        currentRoom.gameState?.players?.length
      ) {
        const winnerUserId = remainingConnected[0].userId;
        const winnerPlayer = currentRoom.gameState?.players.find(
          (p) => p.id === winnerUserId,
        );

        if (winnerPlayer) {
          // Update in-memory game state for the UI modal.
          currentRoom.gameState = currentRoom.gameState || null;
          if (currentRoom.gameState) {
            currentRoom.gameState.winner = winnerPlayer;
          }
        }

        // Persist settlement and winnerStats.
        void settleRoomBets(roomId, winnerUserId)
          .then((settleResult: any) => {
            currentRoom.status = "finished";
            currentRoom.rematchEnabled = false;
            currentRoom.rematchRequests = [];

            io.to(roomId).emit("game:updated", {
              gameState: currentRoom.gameState,
            });
            broadcastRematchUpdate(
              currentRoom,
              "Opponent abandoned the match",
            );
            io.to(roomId).emit("game:over", {
              reason: "Opponent abandoned the match",
              winner: winnerPlayer,
              winnerStats: settleResult?.winnerStats,
              loserStats: settleResult?.loserStats ?? [],
              finalState: currentRoom.gameState,
            });
            emitDisconnectStatus(currentRoom);
          })
          .catch((e: any) => {
            console.error(
              `[Room] Failed to settle abandoned match in room ${roomId}:`,
              e?.message ?? e,
            );
            // Fallback: still finish the UI modal.
            currentRoom.status = "finished";
            currentRoom.rematchEnabled = false;
            currentRoom.rematchRequests = [];
            if (currentRoom.gameState) {
              currentRoom.gameState.winner = winnerPlayer || null;
            }
            io.to(roomId).emit("game:updated", {
              gameState: currentRoom.gameState,
            });
            broadcastRematchUpdate(
              currentRoom,
              "Opponent abandoned the match",
            );
            io.to(roomId).emit("game:over", {
              reason: "Opponent abandoned the match",
              winner: winnerPlayer,
              winnerStats: null,
              loserStats: [],
              finalState: currentRoom.gameState,
            });
            emitDisconnectStatus(currentRoom);
          });
      }

      // Remove the timed-out player from memory, but don't emit game:ended.
      const roomDeleted = removePlayerFromRoomSilent(
        currentRoom,
        userId,
        roomId,
      );
      if (!roomDeleted) {
        io.to(roomId).emit("room:updated", { room: currentRoom });
      } else {
        void deleteRoom(roomId).catch(() => {});
        io.to(roomId).emit("room:terminated");
      }
    }, DISCONNECT_TIMEOUT_MS);

    room.disconnectTimeouts.set(userId, timeoutId);
  });
}
