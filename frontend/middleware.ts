import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Demo bypass token
const DEMO_TOKEN = process.env.DEMO_ACCESS_TOKEN;

// Routes that require authentication
const protectedRoutes = ['/settings'];

// Routes that should redirect to /chat if already logged in
const authRoutes = ['/login', '/register'];

// Routes that do NOT require authentication (open to all)
const publicRoutes = ['/profile-setup'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('auth-token')?.value;

  // Check for demo bypass
  const demoParam = req.nextUrl.searchParams.get('demo');
  if (DEMO_TOKEN && demoParam === DEMO_TOKEN) {
    return NextResponse.next();
  }

  const isAuthenticated = !!token;

  // Protect routes
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth routes
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/chat', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
