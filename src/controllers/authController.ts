import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createGuestUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const randomNum = Math.floor(Math.random() * 10000);
    const guestUsername = `Guest_${randomNum}`;

    const guestUser = await prisma.user.create({
      data: {
        is_guest: true,
        username: guestUsername,
        coins: 0,
        mmr: 1000,
      },
    });
    
    res.json({ 
      success: true, 
      message: 'Guest user created',
      user: guestUser 
    });
  } catch (error) {
    console.error('Error creating guest user:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
};
