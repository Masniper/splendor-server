import { Router } from "express";
import { createRoom, settleRoom } from "../controllers/room.controller";
import { verifyToken } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  createRoomBodySchema,
  settleRoomBodySchema,
  settleRoomParamsSchema,
} from "../validations/room.validation";

const router = Router();

/**
 * @swagger
 * /api/rooms:
 *   post:
 *     summary: Create a persistent room with optional custom name
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Optional custom room name
 *     responses:
 *       201:
 *         description: Room created successfully
 */
router.post(
  "/",
  verifyToken,
  validate({ body: createRoomBodySchema }),
  createRoom,
);

/**
 * @swagger
 * /api/rooms/{roomId}/settle:
 *   post:
 *     summary: Settle bets for a room and distribute winnings
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - winnerUserId
 *             properties:
 *               winnerUserId:
 *                 type: string
 *               xpReward:
 *                 type: integer
 *                 description: Optional XP reward for winners
 *     responses:
 *       200:
 *         description: Bets settled and winnings distributed
 */
router.post(
  "/:roomId/settle",
  verifyToken,
  validate({ params: settleRoomParamsSchema, body: settleRoomBodySchema }),
  settleRoom,
);

export default router;

