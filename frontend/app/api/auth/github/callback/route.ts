import { NextRequest, NextResponse } from 'next/server';
import { signToken, createAuthCookie } from '@/lib/auth';

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
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

    // Exchange code for token
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=token_exchange_failed`
      );
    }

    const tokens: GitHubTokenResponse = await tokenResponse.json();

    if (!tokens.access_token) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_access_token`
      );
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=userinfo_failed`
      );
    }

    const githubUser: GitHubUser = await userResponse.json();

    // Get user email if not public
    let email = githubUser.email;
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (emailsResponse.ok) {
        const emails: GitHubEmail[] = await emailsResponse.json();
        const primaryEmail = emails.find((e) => e.primary && e.verified);
        email = primaryEmail?.email || emails[0]?.email;
      }
    }

    if (!email) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_email`
      );
    }

    // Try to login with existing account
    const loginResponse = await fetch(`${API_BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: `github_oauth_${githubUser.id}`, // Special password for OAuth users
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
      const baseUsername = (githubUser.name || githubUser.login).replace(/[^a-zA-Z0-9]/g, '');
      const uniqueUsername = `${baseUsername}_${Date.now().toString(36)}`;
      
      const registerResponse = await fetch(`${API_BASE}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          username: uniqueUsername,
          password: `github_oauth_${githubUser.id}`, // Special password for OAuth users
        }),
      });

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json().catch(() => ({}));
        console.error('GitHub OAuth registration failed:', errorData);
        
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
      provider: 'github',
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
    console.error('GitHub OAuth error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=oauth_failed`
    );
  }
}
