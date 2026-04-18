import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server as HTTPServer } from 'node:http';

export function setupWebSockets(server: HTTPServer) {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';
  const pubClient = new Redis(redisUrl);
  const subClient = pubClient.duplicate();

  // Use Redis adapter to allow scaling if there are multiple gateway instances
  io.adapter(createAdapter(pubClient, subClient));

  // The subscriber for handling background worker events (e.g. from Python BullMQ worker)
  const eventSubscriber = pubClient.duplicate();
  
  eventSubscriber.subscribe(
    'ws:job:completed',
    'ws:job:failed',
    'ws:resume:completed',
    'ws:resume:failed',
    'ws:roadmap:completed',
    'ws:roadmap:failed',
    'ws:jobs:completed',
    'ws:jobs:failed',
    'ws:notification:created',
    (err) => {
    if (err) {
      console.error('Failed to subscribe to Redis events:', err);
    }
    }
  );

  eventSubscriber.on('message', (channel, message) => {
    try {
      const payload = JSON.parse(message);
      // Expected payload: { jobId, status, result?, error?, userId }
      if (payload.userId) {
        // Broadcast the update to the specific user's room
        io.of('/ws/dashboard').to(payload.userId).emit(channel.replace('ws:', ''), payload);
      }
    } catch (err) {
      console.error('Socket message parse error:', err);
    }
  });

  const dashboardNs = io.of('/ws/dashboard');

  dashboardNs.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    
    // Simplistic handling for demonstration
    // In production, you would verify the JWT signature here and extract the userId
    try {
      // For now we assume the token IS the userId or can be mapped this way
      socket.data.userId = token; 
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid Token'));
    }
  });

  dashboardNs.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`Socket connected for userId: ${userId}`);
    // Subscribe user to their own personal room
    socket.join(userId);
    
    socket.on('disconnect', () => {
      console.log(`Socket disconnected for userId: ${userId}`);
    });
  });
}
