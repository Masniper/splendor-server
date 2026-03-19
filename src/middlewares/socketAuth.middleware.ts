import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

// Keep default aligned with auth.controller.ts to avoid env mismatch issues
const JWT_SECRET =
  process.env.JWT_SECRET || 'super_secret_key_for_splendor_game_123!';
const prisma = new PrismaClient();

export const socketAuthMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  // Extract token from auth payload or headers
  const token = socket.handshake.auth?.token || socket.handshake.headers['authorization'];

  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  try {
    const tokenString = typeof token === 'string' && token.startsWith('Bearer ')
      ? token.slice(7)
      : (token as string);

    const decoded = jwt.verify(tokenString, JWT_SECRET) as { userId: string };

    // Store userId in socket object for later use
    socket.data.userId = decoded.userId;

    // اگر کلاینت نام نمایشی را در auth فرستاده باشد، همان را استفاده می‌کنیم
    const handshakeUsername = socket.handshake.auth?.username;

    if (typeof handshakeUsername === 'string' && handshakeUsername.trim().length > 0) {
      socket.data.username = handshakeUsername.trim();
    } else {
      // در غیر این صورت، از پروفایل دیتابیس یا fallback استفاده می‌کنیم
      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { username: true, is_guest: true },
        });

        if (user?.username) {
          socket.data.username = user.username;
        } else {
          socket.data.username = `Guest_${decoded.userId.substring(0, 4)}`;
        }
      } catch (dbError) {
        socket.data.username = `Player_${decoded.userId.substring(0, 4)}`;
      }
    }

    next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid token'));
  }
};
