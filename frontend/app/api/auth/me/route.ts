import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET() {
  try {
    const payload = await getCurrentUser();

    if (!payload) {
      return NextResponse.json(
        { user: null },
        { status: 200 }
      );
    }

    // Get fresh user data from backend API
    const profileRes = await fetch(`${API_BASE}/api/users/${payload.userId}/profile`, {
      cache: 'no-store',
    });

    if (!profileRes.ok) {
      return NextResponse.json(
        { user: null },
        { status: 200 }
      );
    }

    const profileData = await profileRes.json();

    return NextResponse.json({
      user: {
        id: payload.userId,
        email: payload.email,
        name: payload.name,
        provider: payload.provider || 'credentials',
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { user: null },
      { status: 200 }
    );
  }
}
