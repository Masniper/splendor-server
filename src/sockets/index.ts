import { Server } from 'socket.io';
import { registerRoomHandlers } from './room.handler';
import { registerGameHandlers } from './game.handler';
import { socketAuthMiddleware } from '../middlewares/socketAuth.middleware';

export function setupSockets(io: Server) {
  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id} - User ID: ${socket.data.user.id}`);

    // Register all socket event listeners
    registerRoomHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
