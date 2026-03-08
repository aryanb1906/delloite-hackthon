import { NextRequest, NextResponse } from 'next/server';
import { signToken, createAuthCookie } from '@/lib/auth';

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const error = req.nextUrl.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=oauth_cancelled`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_code`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Google token error:', await tokenResponse.text());
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=token_exchange_failed`
      );
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=userinfo_failed`
      );
    }

    const googleUser: GoogleUserInfo = await userInfoResponse.json();

    // Try to login with existing account
    const loginResponse = await fetch(`${API_BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: googleUser.email,
        password: `google_oauth_${googleUser.id}`, // Special password for OAuth users
      }),
    });

    let user;
    if (loginResponse.ok) {
      // User exists, login successful
      const data = await loginResponse.json();
      user = data.user;
    } else {
      // User doesn't exist with OAuth password, try to create new account
      // Generate a unique username
      const baseUsername = googleUser.name?.replace(/[^a-zA-Z0-9]/g, '') || googleUser.email.split('@')[0];
      const uniqueUsername = `${baseUsername}_${Date.now().toString(36)}`;
      
      const registerResponse = await fetch(`${API_BASE}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: googleUser.email,
          username: uniqueUsername,
          password: `google_oauth_${googleUser.id}`, // Special password for OAuth users
        }),
      });

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json().catch(() => ({}));
        console.error('Google OAuth registration failed:', errorData);
        
        // Check if email already exists (registered with password)
        if (errorData.detail?.includes('Email already registered')) {
          return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL}/login?error=email_exists&provider=email%2Fpassword`
          );
        }
        
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/login?error=registration_failed`
        );
      }

      const data = await registerResponse.json();
      user = data.user;
    }

    // Generate JWT token
    const token = await signToken({
      userId: user.id,
      email: user.email,
      name: user.username,
      provider: 'google',
    });

    // Check if user has a complete profile
    let redirectPath = '/profile-setup'; // Default to profile setup for new users
    try {
      const profileResponse = await fetch(`${API_BASE}/api/users/${user.id}/profile`);
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        // If profile has all required fields, redirect to chat
        if (profileData.income && profileData.taxRegime && profileData.age) {
          redirectPath = '/chat';
        }
      }
    } catch (error) {
      console.error('Failed to check profile:', error);
      // If check fails, default to profile-setup
    }

    // Create redirect response with auth cookie
    const redirectUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}${redirectPath}`);
    if (redirectPath === '/profile-setup') {
      // Pass OAuth data only if going to profile-setup
      redirectUrl.searchParams.set('oauth_success', 'true');
      redirectUrl.searchParams.set('user_data', JSON.stringify(user));
    }

    const response = NextResponse.redirect(redirectUrl.toString());
    response.headers.set('Set-Cookie', createAuthCookie(token));
    return response;
  } catch (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=oauth_failed`
    );
  }
}
