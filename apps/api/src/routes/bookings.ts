import { Hono } from 'hono';
import { eq, and, or, gte, lte, desc } from 'drizzle-orm';
import { bookings, properties, users, sessions } from '@apartments/db/schema';
import type { Bindings, Variables } from '../index';

export const bookingsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

// Get user's bookings
bookingsRoutes.get('/', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const { status } = c.req.query();

  let query = db
    .select({
      booking: bookings,
      property: {
        id: properties.id,
        title: properties.title,
        city: properties.city,
        country: properties.country,
        pricePerNight: properties.pricePerNight,
      },
    })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(bookings.guestId, user.id))
    .orderBy(desc(bookings.createdAt));

  const bookingList = await query;

  return c.json({
    bookings: bookingList.map(b => ({
      ...b.booking,
      property: b.property,
    })),
  });
});

// Get single booking
bookingsRoutes.get('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const id = c.req.param('id');

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, id),
  });

  if (!booking) {
    return c.json({ error: 'Booking not found' }, 404);
  }

  // Check if user is guest or host
  const property = await db.query.properties.findFirst({
    where: eq(properties.id, booking.propertyId),
  });

  if (booking.guestId !== user.id && property?.hostId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const guest = await db.query.users.findFirst({
    where: eq(users.id, booking.guestId),
    columns: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  });

  return c.json({
    booking: {
      ...booking,
      property,
      guest,
    },
  });
});

// Create booking
bookingsRoutes.post('/', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const body = await c.req.json<{
    propertyId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    specialRequests?: string;
  }>();

  // Validate required fields
  if (!body.propertyId || !body.checkIn || !body.checkOut || body.guests === undefined) {
    return c.json({ error: 'Missing required fields: propertyId, checkIn, checkOut, guests' }, 400);
  }

  // Validate guests is a positive integer
  if (!Number.isInteger(body.guests) || body.guests < 1) {
    return c.json({ error: 'Guests must be a positive integer' }, 400);
  }

  // Validate date format and validity
  const checkIn = new Date(body.checkIn);
  const checkOut = new Date(body.checkOut);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return c.json({ error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' }, 400);
  }

  // Validate dates are not in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (checkIn < today) {
    return c.json({ error: 'Check-in date cannot be in the past' }, 400);
  }

  if (checkIn >= checkOut) {
    return c.json({ error: 'Check-out must be after check-in' }, 400);
  }

  // Get property
  const property = await db.query.properties.findFirst({
    where: eq(properties.id, body.propertyId),
  });

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  if (property.status !== 'active') {
    return c.json({ error: 'Property is not available' }, 400);
  }

  if (body.guests > property.maxGuests) {
    return c.json({ error: `Maximum ${property.maxGuests} guests allowed` }, 400);
  }

  // Check for overlapping bookings
  const overlapping = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.propertyId, body.propertyId),
      eq(bookings.status, 'confirmed'),
      or(
        and(lte(bookings.checkIn, checkIn), gte(bookings.checkOut, checkIn)),
        and(lte(bookings.checkIn, checkOut), gte(bookings.checkOut, checkOut)),
        and(gte(bookings.checkIn, checkIn), lte(bookings.checkOut, checkOut))
      )
    ),
  });

  if (overlapping) {
    return c.json({ error: 'Property is not available for these dates' }, 400);
  }

  // Calculate pricing
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  const subtotal = property.pricePerNight * nights;
  const serviceFee = subtotal * 0.12; // 12% service fee
  const cleaningFee = 50; // Fixed cleaning fee
  const totalPrice = subtotal + serviceFee + cleaningFee;

  const bookingId = generateId();

  await db.insert(bookings).values({
    id: bookingId,
    propertyId: body.propertyId,
    guestId: user.id,
    checkIn,
    checkOut,
    guests: body.guests,
    totalPrice,
    serviceFee,
    cleaningFee,
    status: 'pending',
    specialRequests: body.specialRequests,
  });

  return c.json({
    bookingId,
    pricing: {
      nights,
      pricePerNight: property.pricePerNight,
      subtotal,
      serviceFee,
      cleaningFee,
      totalPrice,
    },
  }, 201);
});

// Update booking status (for hosts to confirm/cancel)
bookingsRoutes.patch('/:id/status', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const id = c.req.param('id');
  const { status } = await c.req.json<{ status: string }>();

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, id),
  });

  if (!booking) {
    return c.json({ error: 'Booking not found' }, 404);
  }

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, booking.propertyId),
  });

  // Only host can confirm, guest can cancel
  const isHost = property?.hostId === user.id;
  const isGuest = booking.guestId === user.id;

  if (status === 'confirmed' && !isHost && user.role !== 'admin') {
    return c.json({ error: 'Only host can confirm bookings' }, 403);
  }

  if (status === 'cancelled' && !isHost && !isGuest && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(bookings).set({
    status: status as any,
    updatedAt: new Date(),
  }).where(eq(bookings.id, id));

  return c.json({ success: true });
});

// Get bookings for a property (for hosts)
bookingsRoutes.get('/property/:propertyId', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const propertyId = c.req.param('propertyId');

  const property = await db.query.properties.findFirst({
    where: eq(properties.id, propertyId),
  });

  if (!property) {
    return c.json({ error: 'Property not found' }, 404);
  }

  if (property.hostId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const bookingList = await db
    .select({
      booking: bookings,
      guest: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.guestId, users.id))
    .where(eq(bookings.propertyId, propertyId))
    .orderBy(desc(bookings.checkIn));

  return c.json({
    bookings: bookingList.map(b => ({
      ...b.booking,
      guest: b.guest,
    })),
  });
});
