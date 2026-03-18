import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

export const createGuestUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const randomNum = Math.floor(Math.random() * 10000);
    const guestUsername = `Guest_${randomNum}`;

    // 1. Create user in database
    const guestUser = await prisma.user.create({
      data: {
        is_guest: true,
        username: guestUsername,
        coins: 0,
        mmr: 1000,
      },
    });
    
    // 2. Generate JWT Token
    // We store the user's ID inside the token payload
    const token = jwt.sign(
      { userId: guestUser.id },
      JWT_SECRET,
      { expiresIn: '7d' } // Token is valid for 7 days
    );

    res.json({ 
      success: true, 
      message: 'Guest user created successfully',
      user: guestUser,
      token: token // Sending token back to the client
    });
  } catch (error) {
    console.error('Error creating guest user:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
};
