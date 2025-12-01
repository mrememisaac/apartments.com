import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  role: text('role', { enum: ['guest', 'host', 'admin'] }).notNull().default('guest'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Properties table
export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  hostId: text('host_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  propertyType: text('property_type', { 
    enum: ['apartment', 'house', 'villa', 'condo', 'cabin', 'studio'] 
  }).notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  country: text('country').notNull(),
  zipCode: text('zip_code'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  pricePerNight: real('price_per_night').notNull(),
  bedrooms: integer('bedrooms').notNull(),
  bathrooms: real('bathrooms').notNull(),
  maxGuests: integer('max_guests').notNull(),
  amenities: text('amenities'), // JSON array stored as text
  rules: text('rules'), // JSON array stored as text
  status: text('status', { enum: ['active', 'inactive', 'pending'] }).notNull().default('pending'),
  rating: real('rating').default(0),
  reviewCount: integer('review_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Property images table
export const propertyImages = sqliteTable('property_images', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  url: text('url').notNull(),
  caption: text('caption'),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Bookings table
export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  guestId: text('guest_id').notNull().references(() => users.id),
  checkIn: integer('check_in', { mode: 'timestamp' }).notNull(),
  checkOut: integer('check_out', { mode: 'timestamp' }).notNull(),
  guests: integer('guests').notNull(),
  totalPrice: real('total_price').notNull(),
  serviceFee: real('service_fee').notNull(),
  cleaningFee: real('cleaning_fee'),
  status: text('status', { 
    enum: ['pending', 'confirmed', 'cancelled', 'completed'] 
  }).notNull().default('pending'),
  specialRequests: text('special_requests'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Reviews table
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  bookingId: text('booking_id').notNull().references(() => bookings.id),
  guestId: text('guest_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  cleanlinessRating: integer('cleanliness_rating'),
  communicationRating: integer('communication_rating'),
  checkInRating: integer('check_in_rating'),
  accuracyRating: integer('accuracy_rating'),
  locationRating: integer('location_rating'),
  valueRating: integer('value_rating'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Favorites/Wishlists table
export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  propertyId: text('property_id').notNull().references(() => properties.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Messages table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull().references(() => users.id),
  receiverId: text('receiver_id').notNull().references(() => users.id),
  bookingId: text('booking_id').references(() => bookings.id),
  content: text('content').notNull(),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Sessions table for authentication
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Types for inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

export type PropertyImage = typeof propertyImages.$inferSelect;
export type NewPropertyImage = typeof propertyImages.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
