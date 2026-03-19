import { Router } from "express";
import { placeBet } from "../controllers/bet.controller";
import { verifyToken } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { placeBetBodySchema } from "../validations/bet.validation";

const router = Router();

/**
 * @swagger
 * /api/bets:
 *   post:
 *     summary: Place a bet for the current user in a room
 *     tags: [Bet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - amount
 *             properties:
 *               roomId:
 *                 type: string
 *               amount:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Bet placed successfully
 */
router.post(
  "/",
  verifyToken,
  validate({ body: placeBetBodySchema }),
  placeBet,
);

export default router;

