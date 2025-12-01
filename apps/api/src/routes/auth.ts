import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, sessions } from '@apartments/db/schema';
import type { Bindings, Variables } from '../index';

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Generate a simple ID
function generateId(): string {
  return crypto.randomUUID();
}

// Password hashing using PBKDF2 (available in Web Crypto API)
// Uses salt and iterations for security
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordData = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const saltArray = Array.from(salt);
  
  // Return salt:hash format
  const saltHex = saltArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  
  const encoder = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
  const passwordData = encoder.encode(password);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  
  const computedHash = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return computedHash === hashHex;
}

// Register
authRoutes.post('/register', async (c) => {
  const db = c.get('db');
  const { email, password, name } = await c.req.json<{
    email: string;
    password: string;
    name: string;
  }>();

  if (!email || !password || !name) {
    return c.json({ error: 'Email, password, and name are required' }, 400);
  }

  // Check if user exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser) {
    return c.json({ error: 'User already exists' }, 400);
  }

  const passwordHash = await hashPassword(password);
  const userId = generateId();

  await db.insert(users).values({
    id: userId,
    email,
    name,
    passwordHash,
    role: 'guest',
  });

  // Create session
  const sessionId = generateId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return c.json({
    user: { id: userId, email, name, role: 'guest' },
    sessionId,
  });
});

// Login
authRoutes.post('/login', async (c) => {
  const db = c.get('db');
  const { email, password } = await c.req.json<{
    email: string;
    password: string;
  }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user || !user.passwordHash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Create session
  const sessionId = generateId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    expiresAt,
  });

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    sessionId,
  });
});

// Logout
authRoutes.post('/logout', async (c) => {
  const db = c.get('db');
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  return c.json({ success: true });
});

// Get current user
authRoutes.get('/me', async (c) => {
  const db = c.get('db');
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });

  if (!session || session.expiresAt < new Date()) {
    return c.json({ error: 'Session expired' }, 401);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
    },
  });

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user });
});
