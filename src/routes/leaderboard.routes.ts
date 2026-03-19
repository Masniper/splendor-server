import { Router } from "express";
import { getLeaderboard } from "../controllers/leaderboard.controller";

const router = Router();

/**
 * @swagger
 * /api/leaderboard:
 *   get:
 *     summary: Get top users ranked by XP and Coins
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Leaderboard data
 */
router.get("/", getLeaderboard);

export default router;

