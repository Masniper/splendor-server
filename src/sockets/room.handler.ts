import { Server, Socket } from 'socket.io';

// Simple in-memory storage for rooms
export const rooms: Record<string, any> = {};

// Generate a 6-character random room code
const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

export const registerRoomHandlers = (io: Server, socket: Socket) => {
  const userId = socket.data.userId;

  // 1. Create a new room
  socket.on('create_room', (callback) => {
    const roomId = generateRoomCode();
    
    rooms[roomId] = {
      id: roomId,
      players: [{ userId, socketId: socket.id, isReady: false }],
      status: 'waiting', // waiting, playing, finished
    };

    socket.join(roomId);
    console.log(`User ${userId} created and joined room ${roomId}`);

    if (callback) callback({ success: true, roomId, room: rooms[roomId] });
  });

  // 2. Join an existing room
  socket.on('join_room', ({ roomId }, callback) => {
    const room = rooms[roomId];

    if (!room) {
      if (callback) callback({ success: false, error: 'Room not found' });
      return;
    }

    if (room.players.length >= 4) { // Assuming max capacity is 4
      if (callback) callback({ success: false, error: 'Room is full' });
      return;
    }

    const existingPlayer = room.players.find((p: any) => p.userId === userId);
    if (!existingPlayer) {
      room.players.push({ userId, socketId: socket.id, isReady: false });
      socket.join(roomId);
    }

    console.log(`User ${userId} joined room ${roomId}`);

    // Notify other players in the room
    socket.to(roomId).emit('player_joined', { room });

    if (callback) callback({ success: true, roomId, room });
  });

  // 3. Handle disconnect
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p: any) => p.socketId === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          delete rooms[roomId]; // Delete empty rooms
        } else {
          // Notify others that this player left
          io.to(roomId).emit('player_left', { userId, room });
        }
      }
    }
  });
};
