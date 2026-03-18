import { Router } from 'express';
import { getMe, updateProfile } from '../controllers/user.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/user/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/me', verifyToken, getMe);

/**
 * @swagger
 * /api/user/profile:
 *   put:
 *     summary: Update user profile (username, bio, profile picture)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               bio:
 *                 type: string
 *               profile_picture:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Username already in use
 *       401:
 *         description: Unauthorized
 */
router.put('/profile', verifyToken, updateProfile);

export default router;
