import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const roleHome: Record<string, string> = {
  pm: '/dashboard',
  supervisor: '/planning',
  storekeeper: '/materials'
};

const roleAccess: Record<string, string[]> = {
  pm: ['/dashboard', '/projects', '/planning', '/cost', '/materials', '/documents'],
  supervisor: ['/planning', '/materials'],
  storekeeper: ['/materials']
};

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  if (!isLoggedIn && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isLoggedIn) {
    const role = (req.auth?.user as any)?.role as string;
    const home = roleHome[role] || '/dashboard';

    if (pathname === '/login' || pathname === '/') {
      return NextResponse.redirect(new URL(home, req.url));
    }

    const allowedRoutes = roleAccess[role] || [];
    const isAllowed = allowedRoutes.some(route => pathname.startsWith(route));
    
    if (!isAllowed) {
      return NextResponse.redirect(new URL(home, req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
