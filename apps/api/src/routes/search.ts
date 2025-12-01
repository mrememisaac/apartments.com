import { Hono } from 'hono';
import { eq, like, and, gte, lte, desc, or, sql } from 'drizzle-orm';
import { properties, propertyImages } from '@apartments/db/schema';
import type { Bindings, Variables } from '../index';

export const searchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper function to escape SQL LIKE wildcards
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

// Helper function to validate and parse number
function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function parseInt10(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

// Search properties
searchRoutes.get('/', async (c) => {
  const db = c.get('db');
  const {
    query,
    city,
    country,
    propertyType,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    maxGuests,
    amenities,
    checkIn,
    checkOut,
    sortBy = 'createdAt',
    order = 'desc',
    limit = '20',
    offset = '0',
  } = c.req.query();

  const conditions: any[] = [eq(properties.status, 'active')];

  if (query) {
    const escapedQuery = escapeLikePattern(query);
    conditions.push(
      or(
        like(properties.title, `%${escapedQuery}%`),
        like(properties.description, `%${escapedQuery}%`),
        like(properties.city, `%${escapedQuery}%`),
        like(properties.country, `%${escapedQuery}%`)
      )
    );
  }

  if (city) {
    conditions.push(like(properties.city, `%${escapeLikePattern(city)}%`));
  }

  if (country) {
    conditions.push(like(properties.country, `%${escapeLikePattern(country)}%`));
  }

  if (propertyType) {
    conditions.push(eq(properties.propertyType, propertyType as any));
  }

  const minPriceNum = parseNumber(minPrice);
  if (minPriceNum !== null && minPriceNum >= 0) {
    conditions.push(gte(properties.pricePerNight, minPriceNum));
  }

  const maxPriceNum = parseNumber(maxPrice);
  if (maxPriceNum !== null && maxPriceNum >= 0) {
    conditions.push(lte(properties.pricePerNight, maxPriceNum));
  }

  const bedroomsNum = parseInt10(bedrooms);
  if (bedroomsNum !== null && bedroomsNum >= 0) {
    conditions.push(gte(properties.bedrooms, bedroomsNum));
  }

  const bathroomsNum = parseNumber(bathrooms);
  if (bathroomsNum !== null && bathroomsNum >= 0) {
    conditions.push(gte(properties.bathrooms, bathroomsNum));
  }

  const maxGuestsNum = parseInt10(maxGuests);
  if (maxGuestsNum !== null && maxGuestsNum >= 0) {
    conditions.push(gte(properties.maxGuests, maxGuestsNum));
  }

  const propertyList = await db
    .select()
    .from(properties)
    .where(and(...conditions))
    .orderBy(order === 'desc' ? desc(properties.createdAt) : properties.createdAt)
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  // Get images for results
  const propertyIds = propertyList.map(p => p.id);
  const images = propertyIds.length > 0 ? await db
    .select()
    .from(propertyImages)
    .where(sql`${propertyImages.propertyId} IN (${sql.join(propertyIds.map(id => sql`${id}`), sql`, `)})`) : [];

  const results = propertyList.map(property => ({
    ...property,
    amenities: property.amenities ? JSON.parse(property.amenities) : [],
    images: images.filter(img => img.propertyId === property.id),
  }));

  return c.json({
    properties: results,
    total: results.length,
    hasMore: results.length === parseInt(limit),
  });
});

// Get popular destinations
searchRoutes.get('/destinations', async (c) => {
  const db = c.get('db');

  // Get unique cities with property counts
  const destinations = await db
    .select({
      city: properties.city,
      country: properties.country,
    })
    .from(properties)
    .where(eq(properties.status, 'active'))
    .groupBy(properties.city, properties.country)
    .limit(10);

  return c.json({ destinations });
});

// Get property types
searchRoutes.get('/property-types', async (c) => {
  return c.json({
    propertyTypes: [
      { value: 'apartment', label: 'Apartment', icon: '🏢' },
      { value: 'house', label: 'House', icon: '🏠' },
      { value: 'villa', label: 'Villa', icon: '🏡' },
      { value: 'condo', label: 'Condo', icon: '🏬' },
      { value: 'cabin', label: 'Cabin', icon: '🛖' },
      { value: 'studio', label: 'Studio', icon: '🏨' },
    ],
  });
});

// Get common amenities
searchRoutes.get('/amenities', async (c) => {
  return c.json({
    amenities: [
      { value: 'wifi', label: 'WiFi', icon: '📶' },
      { value: 'parking', label: 'Free Parking', icon: '🅿️' },
      { value: 'pool', label: 'Pool', icon: '🏊' },
      { value: 'ac', label: 'Air Conditioning', icon: '❄️' },
      { value: 'kitchen', label: 'Kitchen', icon: '🍳' },
      { value: 'washer', label: 'Washer', icon: '🧺' },
      { value: 'dryer', label: 'Dryer', icon: '👕' },
      { value: 'tv', label: 'TV', icon: '📺' },
      { value: 'gym', label: 'Gym', icon: '💪' },
      { value: 'hot_tub', label: 'Hot Tub', icon: '♨️' },
      { value: 'bbq', label: 'BBQ Grill', icon: '🍖' },
      { value: 'fireplace', label: 'Fireplace', icon: '🔥' },
      { value: 'balcony', label: 'Balcony', icon: '🌅' },
      { value: 'beach_access', label: 'Beach Access', icon: '🏖️' },
      { value: 'pet_friendly', label: 'Pet Friendly', icon: '🐕' },
    ],
  });
});
