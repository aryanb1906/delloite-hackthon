import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDb } from './db';

export interface User {
  _id?: ObjectId;
  email: string;
  name: string;
  password?: string; // Hashed, only for credentials auth
  provider: 'credentials' | 'google' | 'github';
  providerId?: string; // OAuth provider user ID
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password?: string;
  provider: 'credentials' | 'google' | 'github';
  providerId?: string;
  avatar?: string;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  return db.collection<User>('users').findOne({ email: email.toLowerCase() });
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  return db.collection<User>('users').findOne({ _id: new ObjectId(id) });
}

export async function getUserByProvider(
  provider: 'credentials' | 'google' | 'github',
  providerId: string
): Promise<User | null> {
  const db = await getDb();
  return db.collection<User>('users').findOne({ provider, providerId });
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const db = await getDb();

  const user: Omit<User, '_id'> = {
    email: input.email.toLowerCase(),
    name: input.name,
    provider: input.provider,
    providerId: input.providerId,
    avatar: input.avatar,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Hash password for credentials auth
  if (input.password) {
    user.password = await bcrypt.hash(input.password, 12);
  }

  const result = await db.collection<User>('users').insertOne(user as User);
  return { ...user, _id: result.insertedId };
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, 'name' | 'avatar'>>
): Promise<void> {
  const db = await getDb();
  await db.collection<User>('users').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
}
