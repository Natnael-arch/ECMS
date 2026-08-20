/**
 * Seed demo users using better-auth's signUpEmail API
 * so passwords are hashed in the format better-auth expects.
 *
 * Run: npx tsx db/seed-users.ts
 */
import { auth } from '../lib/auth';
import { db } from '../lib/db';

const users = [
  { email: 'pm@ecms.app', name: 'Project Manager', password: 'demo1234' },
  { email: 'supervisor@ecms.app', name: 'Site Supervisor', password: 'demo1234' },
  { email: 'store@ecms.app', name: 'Storekeeper', password: 'demo1234' },
];

async function main() {
  console.log('Seeding demo users via better-auth...\n');

  for (const u of users) {
    try {
      const result = await auth.api.signUpEmail({
        body: {
          email: u.email,
          password: u.password,
          name: u.name,
        },
      });
      const userId = result.user?.id;
      console.log(`  ✅ Created auth user: ${u.email} (${u.name}) — id: ${userId}`);

      // Also create the corresponding app_users record
      if (userId) {
        const existing = await db.app_users.findFirst({ where: { auth_subject: `email:${u.email}` } });
        if (!existing) {
          await db.app_users.create({
            data: {
              id: userId,
              auth_subject: `email:${u.email}`,
              email: u.email,
              display_name: u.name,
              locale: 'en',
              is_active: true,
            },
          });
          console.log(`  ✅ Created app_user for ${u.email}`);
        } else {
          console.log(`  ⏭️  app_user for ${u.email} already exists`);
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('already') || err?.message?.includes('exist')) {
        console.log(`  ⏭️  ${u.email} already exists, skipping.`);
      } else {
        console.error(`  ❌ Failed to create ${u.email}:`, err?.message ?? err);
      }
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
