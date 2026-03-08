import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
);

const TOKEN_NAME = 'auth-token';
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  provider?: 'credentials' | 'google' | 'github';
  exp?: number;
}

export async function signToken(payload: Omit<JWTPayload, 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE}s`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_NAME)?.value || null;
}

export async function getTokenFromRequest(req: NextRequest): Promise<string | null> {
  // Check cookie first
  const cookieToken = req.cookies.get(TOKEN_NAME)?.value;
  if (cookieToken) return cookieToken;

  // Check Authorization header
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
  const token = await getTokenFromCookies();
  if (!token) return null;
  return verifyToken(token);
}

export function createAuthCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${TOKEN_NAME}=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_MAX_AGE}; SameSite=Lax${secure}`;
}

export function createLogoutCookie(): string {
  return `${TOKEN_NAME}=; HttpOnly; Path=/; Max-Age=0`;
}
