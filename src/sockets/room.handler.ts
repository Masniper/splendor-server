import { Server, Socket } from 'socket.io';
import { GameState } from '../game/models';
import { initializeGame } from '../game/setup';
import { 
  level1Cards, 
  level2Cards, 
  level3Cards, 
  noblesData 
} from '../game/data';

export interface Room {
  id: string;
  hostId: string;
  players: { userId: string; socketId: string; username: string }[];
  gameState: GameState | null;
  status: 'waiting' | 'playing' | 'finished';
}

export const activeRooms = new Map<string, Room>();

export function registerRoomHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;
  const username = socket.data.username;

  socket.on('room:create', () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newRoom: Room = {
      id: roomId,
      hostId: userId,
      players: [{ userId, socketId: socket.id, username }],
      gameState: null,
      status: 'waiting'
    };

    activeRooms.set(roomId, newRoom);
    socket.join(roomId);

    socket.emit('room:created', { roomId, room: newRoom });
    console.log(`[Room] User ${username} created room ${roomId}`);
  });

  socket.on('room:join', (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) {
      return socket.emit('error', { message: 'Room not found' });
    }
    if (room.status !== 'waiting') {
      return socket.emit('error', { message: 'Game already started' });
    }
    if (room.players.length >= 4) {
      return socket.emit('error', { message: 'Room is full' });
    }
    if (room.players.some(p => p.userId === userId)) {
      return socket.emit('error', { message: 'You are already in this room' });
    }

    room.players.push({ userId, socketId: socket.id, username });
    socket.join(roomId);

    io.to(roomId).emit('room:updated', { room });
    console.log(`[Room] User ${username} joined room ${roomId}`);
  });

  socket.on('room:start', (roomId: string) => {
    const room = activeRooms.get(roomId);

    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.hostId !== userId) return socket.emit('error', { message: 'Only host can start the game' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players to start' });

    const playersInfo = room.players.map(p => ({
      id: p.userId,
      name: p.username
    }));

    const newGameState = initializeGame(
      roomId,
      playersInfo,
      level1Cards,
      level2Cards,
      level3Cards,
      noblesData
    );

    room.gameState = newGameState;
    room.status = 'playing';

    io.to(roomId).emit('game:started', { gameState: newGameState });
    console.log(`[Game] Game started in room ${roomId}`);
  });

  socket.on('disconnect', () => {
    activeRooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          activeRooms.delete(roomId);
        } else {
          if (room.hostId === userId) {
            room.hostId = room.players[0].userId;
          }
          io.to(roomId).emit('room:updated', { room });
        }
      }
    });
  });
}
