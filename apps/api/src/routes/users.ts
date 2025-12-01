import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, sessions, properties, bookings, favorites } from '@apartments/db/schema';
import type { Bindings, Variables } from '../index';

export const usersRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Get auth user helper
async function getAuthUser(c: any) {
  const db = c.get('db');
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!sessionId) return null;
  
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  
  if (!session || session.expiresAt < new Date()) return null;
  
  return await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
}

// Get user profile
usersRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      name: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get host properties if they're a host
  let propertyCount = 0;
  if (user.role === 'host' || user.role === 'admin') {
    const props = await db
      .select()
      .from(properties)
      .where(eq(properties.hostId, id));
    propertyCount = props.length;
  }

  return c.json({
    user: {
      ...user,
      propertyCount,
    },
  });
});

// Update user profile
usersRoutes.put('/me', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const body = await c.req.json<{
    name?: string;
    avatarUrl?: string;
  }>();

  await db.update(users).set({
    name: body.name ?? user.name,
    avatarUrl: body.avatarUrl ?? user.avatarUrl,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));

  return c.json({ success: true });
});

// Get user favorites
usersRoutes.get('/me/favorites', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');

  const favoriteList = await db
    .select({
      favorite: favorites,
      property: {
        id: properties.id,
        title: properties.title,
        city: properties.city,
        country: properties.country,
        pricePerNight: properties.pricePerNight,
        bedrooms: properties.bedrooms,
        rating: properties.rating,
      },
    })
    .from(favorites)
    .innerJoin(properties, eq(favorites.propertyId, properties.id))
    .where(eq(favorites.userId, user.id));

  return c.json({
    favorites: favoriteList.map(f => ({
      id: f.favorite.id,
      property: f.property,
      createdAt: f.favorite.createdAt,
    })),
  });
});

// Add to favorites
usersRoutes.post('/me/favorites', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const { propertyId } = await c.req.json<{ propertyId: string }>();

  // Check if property exists
  const property = await db.query.properties.findFirst({
    where: eq(properties.id, propertyId),
  });

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  // Check if already favorited
  const existing = await db.query.favorites.findFirst({
    where: eq(favorites.propertyId, propertyId),
  });

  if (existing) {
    return c.json({ error: 'Already in favorites' }, 400);
  }

  await db.insert(favorites).values({
    id: crypto.randomUUID(),
    userId: user.id,
    propertyId,
  });

  return c.json({ success: true }, 201);
});

// Remove from favorites
usersRoutes.delete('/me/favorites/:propertyId', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const propertyId = c.req.param('propertyId');

  await db.delete(favorites).where(eq(favorites.propertyId, propertyId));

  return c.json({ success: true });
});
