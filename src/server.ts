import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocs } from './config/swagger';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
// Create an HTTP server to attach Socket.io
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your frontend URL (e.g., 'http://localhost:5173')
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Swagger Documentation Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// Basic Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log(`User connected via WebSocket: ${socket.id}`);

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Use server.listen instead of app.listen for WebSockets
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
