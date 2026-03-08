import { NextRequest, NextResponse } from 'next/server';
import { signToken, createAuthCookie } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Call backend API to login
    const backendRes = await fetch(`${API_BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const backendData = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: backendData.message || 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = backendData.user;

    // Generate JWT
    const token = await signToken({
      userId: user.id,
      email: user.email,
      name: user.username || user.email,
      provider: 'credentials',
    });

    // Return response with cookie
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.username || user.email,
      },
    });

    response.headers.set('Set-Cookie', createAuthCookie(token));
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
