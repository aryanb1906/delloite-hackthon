import { NextRequest, NextResponse } from 'next/server';
import { signToken, createAuthCookie } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    // Validation
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Call backend API to register
    const backendRes = await fetch(`${API_BASE}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username: name, password }),
    });

    const backendData = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: backendData.message || 'Registration failed' },
        { status: 400 }
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
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
