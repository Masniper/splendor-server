import { Router } from "express";
import {
  getMe,
  getPublicProfile,
  updateProfile,
} from "../controllers/user.controller";
import { verifyToken } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  updateProfileBodySchema,
  userIdParamSchema,
} from "../validations/user.validation";

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
router.get("/me", verifyToken, getMe);

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
router.put(
  "/profile",
  verifyToken,
  validate({ body: updateProfileBodySchema }),
  updateProfile,
);

/**
 * @swagger
 * /api/user/{userId}/public:
 *   get:
 *     summary: Get public profile by user id
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Public profile data
 *       404:
 *         description: User not found
 */
router.get(
  "/:userId/public",
  validate({ params: userIdParamSchema }),
  getPublicProfile,
);

export default router;
