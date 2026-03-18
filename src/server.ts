import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*', 
    methods: ['GET', 'POST']
  }
});

app.get('/api', (req, res) => {
  res.json({ message: 'Welcome to the Game API' });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
