import { Router } from 'express';
import { createGuestUser } from '../controllers/authController';

const router = Router();

/**
 * @swagger
 * /api/auth/guest:
 *   post:
 *     summary: Create a guest user
 *     description: Creates a guest user with a random name in the database.
 *     responses:
 *       200:
 *         description: Guest user created successfully.
 *       500:
 *         description: Server or database error.
 */
router.post('/guest', createGuestUser);

export default router;
