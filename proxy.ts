import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/server/session';

const publicPaths = ['/login', '/forbidden'];

export async function proxy(request: NextRequest) {
  const session = await getSession();
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const isLoggedIn = !!session;
  const isPublic = publicPaths.includes(pathname);

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isLoggedIn && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
