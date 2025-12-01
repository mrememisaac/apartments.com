import { Hono } from 'hono';
import { eq, and, desc, avg } from 'drizzle-orm';
import { reviews, bookings, properties, users, sessions } from '@apartments/db/schema';
import type { Bindings, Variables } from '../index';

export const reviewsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

// Get reviews for a property
reviewsRoutes.get('/property/:propertyId', async (c) => {
  const db = c.get('db');
  const propertyId = c.req.param('propertyId');

  const reviewList = await db
    .select({
      review: reviews,
      guest: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.guestId, users.id))
    .where(eq(reviews.propertyId, propertyId))
    .orderBy(desc(reviews.createdAt));

  return c.json({
    reviews: reviewList.map(r => ({
      ...r.review,
      guest: r.guest,
    })),
  });
});

// Create review
reviewsRoutes.post('/', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const body = await c.req.json<{
    bookingId: string;
    rating: number;
    comment?: string;
    cleanlinessRating?: number;
    communicationRating?: number;
    checkInRating?: number;
    accuracyRating?: number;
    locationRating?: number;
    valueRating?: number;
  }>();

  // Verify booking exists and belongs to user
  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.id, body.bookingId),
      eq(bookings.guestId, user.id),
      eq(bookings.status, 'completed')
    ),
  });

  if (!booking) {
    return c.json({ error: 'Booking not found or not eligible for review' }, 400);
  }

  // Check if already reviewed
  const existingReview = await db.query.reviews.findFirst({
    where: eq(reviews.bookingId, body.bookingId),
  });

  if (existingReview) {
    return c.json({ error: 'Already reviewed this booking' }, 400);
  }

  const reviewId = generateId();

  await db.insert(reviews).values({
    id: reviewId,
    propertyId: booking.propertyId,
    bookingId: body.bookingId,
    guestId: user.id,
    rating: body.rating,
    comment: body.comment,
    cleanlinessRating: body.cleanlinessRating,
    communicationRating: body.communicationRating,
    checkInRating: body.checkInRating,
    accuracyRating: body.accuracyRating,
    locationRating: body.locationRating,
    valueRating: body.valueRating,
  });

  // Update property rating
  const allReviews = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.propertyId, booking.propertyId));

  const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

  await db.update(properties).set({
    rating: Math.round(avgRating * 10) / 10,
    reviewCount: allReviews.length,
    updatedAt: new Date(),
  }).where(eq(properties.id, booking.propertyId));

  return c.json({ reviewId }, 201);
});

// Delete review
reviewsRoutes.delete('/:id', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.get('db');
  const id = c.req.param('id');

  const review = await db.query.reviews.findFirst({
    where: eq(reviews.id, id),
  });

  if (!review) {
    return c.json({ error: 'Review not found' }, 404);
  }

  if (review.guestId !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const propertyId = review.propertyId;

  await db.delete(reviews).where(eq(reviews.id, id));

  // Update property rating
  const allReviews = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.propertyId, propertyId));

  const avgRating = allReviews.length > 0
    ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    : 0;

  await db.update(properties).set({
    rating: Math.round(avgRating * 10) / 10,
    reviewCount: allReviews.length,
    updatedAt: new Date(),
  }).where(eq(properties.id, propertyId));

  return c.json({ success: true });
});
