import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'db/migrations',
    seed: 'tsx db/seeds/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
