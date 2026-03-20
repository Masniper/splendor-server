import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocs } from './config/swagger';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roomRoutes from './routes/room.routes';
import betRoutes from './routes/bet.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import { initializeSockets } from './sockets';
import { prisma } from './services/prisma.service';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error?.message || "Internal server error";
  const statusCode = message.toLowerCase().includes("not found") ? 404 : 400;
  res.status(statusCode).json({ success: false, error: message });
});

// Initialize Socket.io
initializeSockets(io);

let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received, closing HTTP, Socket.IO, and database...`);

  io.close(() => {
    server.close(async () => {
      try {
        await prisma.$disconnect();
        console.log('Database connection closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during Prisma $disconnect:', err);
        process.exit(1);
      }
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
