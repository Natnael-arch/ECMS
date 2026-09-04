import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/ecms?schema=ecms';

const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db = globalForDb.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForDb.prisma = db;

export * from '@/lib/generated/prisma/enums';
