import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth.middleware';

const prisma = new PrismaClient();

// 1. Get Current User Profile
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        is_guest: true,
        coins: true,
        mmr: true,
        profile_picture: true,
        bio: true,
        created_at: true,
      } // Exclude password
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// 2. Update User Profile (Username, Bio, Profile Picture)
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { username, bio, profile_picture } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // If username is being updated, check if it's already taken
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: username.trim(),
          NOT: { id: userId } // Exclude current user from the check
        }
      });

      if (existingUser) {
        res.status(400).json({ success: false, error: 'Username is already in use' });
        return;
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username: username.trim() }),
        ...(bio !== undefined && { bio }),
        ...(profile_picture !== undefined && { profile_picture })
      },
      select: {
        id: true,
        username: true,
        bio: true,
        profile_picture: true,
        updated_at: true
      }
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
