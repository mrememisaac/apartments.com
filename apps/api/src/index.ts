import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { createDb } from '@apartments/db';
import { propertiesRoutes } from './routes/properties';
import { authRoutes } from './routes/auth';
import { bookingsRoutes } from './routes/bookings';
import { usersRoutes } from './routes/users';
import { reviewsRoutes } from './routes/reviews';
import { searchRoutes } from './routes/search';

export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

export type Variables = {
  db: ReturnType<typeof createDb>;
  userId?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:4321', 'https://apartments.pages.dev'],
  credentials: true,
}));

// Database middleware
app.use('*', async (c, next) => {
  c.set('db', createDb(c.env.DB));
  await next();
});

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/properties', propertiesRoutes);
app.route('/api/bookings', bookingsRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/reviews', reviewsRoutes);
app.route('/api/search', searchRoutes);

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
