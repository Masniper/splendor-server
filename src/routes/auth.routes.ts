import { Router } from "express";
import {
  createGuestUser,
  login,
  registerUser,
  upgradeAccount,
} from "../controllers/auth.controller";
import { verifyToken } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  loginBodySchema,
  registerBodySchema,
  upgradeAccountBodySchema,
} from "../validations/auth.validation";

const router = Router();

/**
 * @swagger
 * /api/auth/guest:
 *   post:
 *     summary: Create a new guest user
 *     tags: [Auth]
 *     responses:
 *       201:
 *         description: Guest user created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 */
router.post("/guest", createGuestUser);

/**
 * @swagger
 * /api/auth/upgrade:
 *   post:
 *     summary: Upgrade guest account to regular account
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account upgraded successfully
 *       400:
 *         description: Invalid input or email/username already taken
 *       401:
 *         description: Unauthorized (Token missing or invalid)
 */
router.post(
  "/upgrade",
  verifyToken,
  validate({ body: upgradeAccountBodySchema }),
  upgradeAccount,
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login for regular users
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns token
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", validate({ body: loginBodySchema }), login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user directly
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error (e.g., email already in use)
 */
router.post("/register", validate({ body: registerBodySchema }), registerUser);

export default router;
