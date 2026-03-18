import { Server } from 'socket.io';
import { socketAuthMiddleware } from '../middlewares/socketAuth.middleware';
import { registerRoomHandlers } from './room.handler';

export const initializeSockets = (io: Server) => {
  // Use the auth middleware from the middlewares folder
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    console.log(`User connected: SocketID: ${socket.id} | UserID: ${socket.data.userId}`);

    // Register room events
    registerRoomHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`User disconnected: SocketID: ${socket.id}`);
    });
  });
};
