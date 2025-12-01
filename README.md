# Apartments.com

A full-fledged apartment management system like Airbnb built using Hono + Astro + Drizzle for Cloudflare. Features a beautiful responsive UI and a complete backend for property management.

## Tech Stack

- **Frontend**: [Astro](https://astro.build/) - Fast, modern static site generator
- **Backend**: [Hono](https://hono.dev/) - Ultrafast web framework for Cloudflare Workers
- **Database**: [Drizzle ORM](https://orm.drizzle.team/) with Cloudflare D1 (SQLite)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Deployment**: Cloudflare Pages + Workers

## Project Structure

```
apartments/
├── apps/
│   ├── api/          # Hono backend API (Cloudflare Workers)
│   │   └── src/
│   │       ├── routes/     # API route handlers
│   │       └── index.ts    # Main app entry
│   └── web/          # Astro frontend
│       └── src/
│           ├── components/ # Reusable UI components
│           ├── layouts/    # Page layouts
│           └── pages/      # Route pages
├── packages/
│   └── db/           # Drizzle ORM schema and database utilities
└── package.json      # Root package.json with workspace scripts
```

## Features

### For Guests
- 🔍 Search properties by location, dates, and guests
- 🏠 Browse properties by category (beach, mountains, city, etc.)
- 📷 View detailed property listings with image galleries
- ⭐ Read reviews and ratings from other guests
- ❤️ Save favorite properties to wishlist
- 📅 Book properties with secure checkout
- 💬 Message hosts directly

### For Hosts
- 📝 Create and manage property listings
- 📸 Upload property photos
- 💰 Set pricing and availability
- 📊 View booking calendar
- ✅ Accept or decline booking requests
- 💬 Communicate with guests
- 📈 Track earnings and reviews

### Admin Features
- 👥 User management
- 🏠 Property moderation
- 📊 Platform analytics
- 🛡️ Content moderation

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm 8+

### Installation

```bash
# Install dependencies
pnpm install

# Generate database migrations
pnpm db:generate

# Run development servers
pnpm dev
```

### Development URLs

- Frontend: http://localhost:4321
- API: http://localhost:8787

### Environment Variables

Create a `.env` file in the root:

```env
PUBLIC_API_URL=http://localhost:8787
```

For the API (`apps/api/.dev.vars`):

```env
JWT_SECRET=your-secret-key
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Properties
- `GET /api/properties` - List properties
- `GET /api/properties/:id` - Get property details
- `POST /api/properties` - Create property (auth required)
- `PUT /api/properties/:id` - Update property (auth required)
- `DELETE /api/properties/:id` - Delete property (auth required)

### Bookings
- `GET /api/bookings` - Get user bookings (auth required)
- `GET /api/bookings/:id` - Get booking details (auth required)
- `POST /api/bookings` - Create booking (auth required)
- `PATCH /api/bookings/:id/status` - Update booking status (auth required)

### Search
- `GET /api/search` - Search properties with filters
- `GET /api/search/destinations` - Get popular destinations
- `GET /api/search/amenities` - Get available amenities

### Reviews
- `GET /api/reviews/property/:propertyId` - Get property reviews
- `POST /api/reviews` - Create review (auth required)

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/me` - Update user profile (auth required)
- `GET /api/users/me/favorites` - Get user favorites (auth required)
- `POST /api/users/me/favorites` - Add to favorites (auth required)
- `DELETE /api/users/me/favorites/:propertyId` - Remove from favorites (auth required)

## Database Schema

The database includes the following tables:

- **users** - User accounts and profiles
- **properties** - Property listings
- **property_images** - Property photos
- **bookings** - Reservation records
- **reviews** - Guest reviews
- **favorites** - User wishlists
- **messages** - Host-guest communication
- **sessions** - Authentication sessions

## Deployment

### Cloudflare Pages (Frontend)

```bash
cd apps/web
pnpm build
# Deploy the `dist` folder to Cloudflare Pages
```

### Cloudflare Workers (API)

```bash
cd apps/api
wrangler deploy
```

### D1 Database

```bash
# Create D1 database
wrangler d1 create apartments-db

# Update wrangler.toml with the database ID
# Run migrations
wrangler d1 execute apartments-db --file=./packages/db/migrations/0001_initial.sql
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.
