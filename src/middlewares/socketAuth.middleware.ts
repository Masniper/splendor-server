import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  // Extract token from auth payload or headers
  const token = socket.handshake.auth?.token || socket.handshake.headers['authorization'];

  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  try {
    const tokenString = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(tokenString, JWT_SECRET) as { userId: string };

    // Store userId in socket object for later use
    socket.data.userId = decoded.userId;
    next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid token'));
  }
};
