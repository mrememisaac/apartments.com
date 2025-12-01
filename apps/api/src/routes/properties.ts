import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { properties, propertyImages, users, sessions } from '@apartments/db/schema';
import type { Bindings, Variables } from '../index';

export const propertiesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function generateId(): string {
  return crypto.randomUUID();
}

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

// List all properties
propertiesRoutes.get('/', async (c) => {
  const db = c.get('db');
  const { city, minPrice, maxPrice, bedrooms, propertyType, limit = '20', offset = '0' } = c.req.query();

  let query = db
    .select({
      id: properties.id,
      title: properties.title,
      description: properties.description,
      propertyType: properties.propertyType,
      city: properties.city,
      state: properties.state,
      country: properties.country,
      pricePerNight: properties.pricePerNight,
      bedrooms: properties.bedrooms,
      bathrooms: properties.bathrooms,
      maxGuests: properties.maxGuests,
      rating: properties.rating,
      reviewCount: properties.reviewCount,
      amenities: properties.amenities,
      hostId: properties.hostId,
    })
    .from(properties)
    .where(eq(properties.status, 'active'))
    .orderBy(desc(properties.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  const propertyList = await query;

  // Get primary images for each property
  const propertyIds = propertyList.map(p => p.id);
  const images = propertyIds.length > 0 ? await db
    .select()
    .from(propertyImages)
    .where(sql`${propertyImages.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`) : [];

  const propertiesWithImages = propertyList.map(property => ({
    ...property,
    amenities: property.amenities ? JSON.parse(property.amenities) : [],
    images: images.filter(img => img.propertyId === property.id),
  }));

  return c.json({ properties: propertiesWithImages });
});

// Get single property
propertiesRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, id),
  });

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  const images = await db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.propertyId, id))
    .orderBy(propertyImages.sortOrder);

  const host = await db.query.users.findFirst({
    where: eq(users.id, property.hostId),
    columns: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  });

  return c.json({
    property: {
      ...property,
      amenities: property.amenities ? JSON.parse(property.amenities) : [],
      rules: property.rules ? JSON.parse(property.rules) : [],
      images,
      host,
    },
  });
});

// Create property (requires auth)
propertiesRoutes.post('/', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const body = await c.req.json();

  const propertyId = generateId();

  await db.insert(properties).values({
    id: propertyId,
    hostId: user.id,
    title: body.title,
    description: body.description,
    propertyType: body.propertyType,
    address: body.address,
    city: body.city,
    state: body.state,
    country: body.country,
    zipCode: body.zipCode,
    latitude: body.latitude,
    longitude: body.longitude,
    pricePerNight: body.pricePerNight,
    bedrooms: body.bedrooms,
    bathrooms: body.bathrooms,
    maxGuests: body.maxGuests,
    amenities: JSON.stringify(body.amenities || []),
    rules: JSON.stringify(body.rules || []),
    status: 'pending',
  });

  // Add images if provided
  if (body.images && body.images.length > 0) {
    const imageValues = body.images.map((img: { url: string; caption?: string }, index: number) => ({
      id: generateId(),
      propertyId,
      url: img.url,
      caption: img.caption,
      isPrimary: index === 0,
      sortOrder: index,
    }));

    await db.insert(propertyImages).values(imageValues);
  }

  // Update user role to host if not already
  if (user.role === 'guest') {
    await db.update(users).set({ role: 'host' }).where(eq(users.id, user.id));
  }

  return c.json({ propertyId }, 201);
});

// Update property
propertiesRoutes.put('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, id),
  });

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  if (property.hostId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(properties).set({
    title: body.title ?? property.title,
    description: body.description ?? property.description,
    propertyType: body.propertyType ?? property.propertyType,
    address: body.address ?? property.address,
    city: body.city ?? property.city,
    state: body.state ?? property.state,
    country: body.country ?? property.country,
    zipCode: body.zipCode ?? property.zipCode,
    latitude: body.latitude ?? property.latitude,
    longitude: body.longitude ?? property.longitude,
    pricePerNight: body.pricePerNight ?? property.pricePerNight,
    bedrooms: body.bedrooms ?? property.bedrooms,
    bathrooms: body.bathrooms ?? property.bathrooms,
    maxGuests: body.maxGuests ?? property.maxGuests,
    amenities: body.amenities ? JSON.stringify(body.amenities) : property.amenities,
    rules: body.rules ? JSON.stringify(body.rules) : property.rules,
    status: body.status ?? property.status,
    updatedAt: new Date(),
  }).where(eq(properties.id, id));

  return c.json({ success: true });
});

// Delete property
propertiesRoutes.delete('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const id = c.req.param('id');

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, id),
  });

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  if (property.hostId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Delete images first
  await db.delete(propertyImages).where(eq(propertyImages.propertyId, id));
  // Delete property
  await db.delete(properties).where(eq(properties.id, id));

  return c.json({ success: true });
});

// Get host's properties
propertiesRoutes.get('/host/:hostId', async (c) => {
  const db = c.get('db');
  const hostId = c.req.param('hostId');

  const propertyList = await db
    .select()
    .from(properties)
    .where(eq(properties.hostId, hostId))
    .orderBy(desc(properties.createdAt));

  return c.json({ properties: propertyList });
});
