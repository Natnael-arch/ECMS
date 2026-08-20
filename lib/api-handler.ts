import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => Promise<NextResponse>;

export function withErrorHandling<T extends AnyFunction>(handler: T): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const req = args[0] as Request;
      if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
        throw error;
      }
      if (error instanceof Error && error.message.includes('NEXT_NOT_FOUND')) {
        throw error;
      }
      console.error(`[API Error] ${req?.method} ${new URL(req?.url ?? 'http://localhost').pathname}:`, error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }) as T;
}
