import { Server, Socket } from "socket.io";
import { GameState } from "../game/models";
import { initializeGame } from "../game/setup";
import {
  level1Cards,
  level2Cards,
  level3Cards,
  noblesData,
} from "../game/data";

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
  const username = socket.data.username;

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
    room.gameState = null;
    room.rematchEnabled = false;
    room.rematchRequests = [];
    io.to(room.id).emit("game:error", { message: reason });
    io.to(room.id).emit("game:ended");
    broadcastRematchUpdate(room, reason);
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

    // Host migration (transfers host to the first remaining player)
    if (room.hostId === userId) {
      room.hostId = room.players[0].userId;
      console.log(`[Room] Host migrated to ${room.players[0].username} in room ${roomId}`);
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

  socket.on("room:create", (isPublic: boolean = false) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    const newRoom: Room = {
      id: roomId,
      hostId: userId,
      originalHostId: userId,
      players: [{ userId, socketId: socket.id, username }],
      gameState: null,
      status: "waiting",
      rematchRequests: [],
      rematchEnabled: true,
      isPublic,
      waitingForReconnection: false,
      disconnectTimeouts: new Map(),
      disconnectDeadlines: {},
    };

    activeRooms.set(roomId, newRoom);
    playerSessions.set(userId, roomId);
    socket.join(roomId);

    socket.emit("room:created", { roomId, room: newRoom });
    console.log(`[Room] User ${username} created room ${roomId}`);
  });

  socket.on("room:join", (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) {
      return socket.emit("error", { message: "Room not found" });
    }
    if (room.status !== "waiting") {
      return socket.emit("error", { message: "Game already started" });
    }
    if (room.players.length >= 4) {
      return socket.emit("error", { message: "Room is full" });
    }

    // Idempotency: if the same user joins twice (e.g., StrictMode/reconnect edge cases),
    // update socketId instead of creating a duplicate player entry.
    const existing = room.players.find((p) => p.userId === userId);
    if (existing) {
      existing.socketId = socket.id;
      existing.username = username;
      playerSessions.set(userId, roomId);
      socket.join(roomId);
      io.to(roomId).emit("room:updated", { room });
      return;
    }

    room.players.push({ userId, socketId: socket.id, username });
    playerSessions.set(userId, roomId);
    socket.join(roomId);

    io.to(roomId).emit("room:updated", { room });
    console.log(`[Room] User ${username} joined room ${roomId}`);
  });

  socket.on("room:reconnect", (roomId: string) => {
    console.log(
      `[Room] Reconnect attempt for room ${roomId} by ${username} (${userId})`,
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

    io.to(roomId).emit("player:reconnected", { userId, username });
    io.to(roomId).emit("room:updated", { room });
    emitDisconnectStatus(room);
    console.log(`[Room] User ${username} reconnected to room ${roomId}`);
  });

  socket.on("room:listPublic", () => {
    const publicRooms = Array.from(activeRooms.values())
      .filter((room) => room.isPublic && room.status !== "finished")
      .map((room) => ({
        id: room.id,
        hostName:
          room.players.find((p) => p.userId === room.hostId)?.username ||
          "Unknown",
        playerCount: room.players.length,
        status: room.status,
        canJoin: room.status === "waiting" && room.players.length < 4,
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

  socket.on("leaveRoom", (data: { roomCode: string }) => {
    const room = activeRooms.get(data.roomCode);
    if (!room) return;

    socket.leave(data.roomCode);
    
    const roomDeleted = removePlayerFromRoom(room, userId, data.roomCode);
    
    if (!roomDeleted) {
      io.to(data.roomCode).emit("room:updated", { room });
    } else {
      io.to(data.roomCode).emit("room:terminated");
    }

    console.log(`[Room] User ${username} left room ${data.roomCode}`);
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
    console.log(`[Socket] User ${username} (${userId}) disconnected`);

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
      }
      return;
    }

    // If game is in progress or finished, initiate a disconnect timeout
    room.waitingForReconnection = true;
    const expiresAt = Date.now() + DISCONNECT_TIMEOUT_MS;
    room.disconnectDeadlines[userId] = expiresAt;
    io.to(roomId).emit("player:disconnected", { 
      userId, 
      username,
      timeoutMs: DISCONNECT_TIMEOUT_MS,
      expiresAt,
      isHost: room.hostId === userId
    });
    emitDisconnectStatus(room);

    const timeoutId = setTimeout(() => {
      console.log(
        `[Room] Timeout reached for ${username} in room ${roomId}. Removing player.`,
      );

      const currentRoom = activeRooms.get(roomId);
      if (!currentRoom) return;

      const currentPlayer = currentRoom.players.find(
        (p) => p.userId === userId,
      );
      
      // Safety check: Don't remove if they reconnected in the meantime
      if (!currentPlayer || currentPlayer.socketId !== null) return;

      delete currentRoom.disconnectDeadlines[userId];
      const roomDeleted = removePlayerFromRoom(currentRoom, userId, roomId);

      if (!roomDeleted) {
        io.to(roomId).emit("room:updated", { room: currentRoom });
        io.to(roomId).emit("player:timeout", { userId, username });
        emitDisconnectStatus(currentRoom);
      } else {
        io.to(roomId).emit("room:terminated");
      }
    }, DISCONNECT_TIMEOUT_MS);

    room.disconnectTimeouts.set(userId, timeoutId);
  });
}
