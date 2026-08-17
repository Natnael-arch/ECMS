# ECMS - Engineering & Construction Management System

A modern, role-based web application tailored for the construction industry. Designed for control and engineered for efficiency, ECMS allows teams to track projects, manage construction planning, monitor budgets, handle site inventory, and streamline document management.

## Features

- **Role-Based Access Control:** Secure authentication powered by NextAuth.js (v5). Access and functionalities are dynamically scoped for Project Managers, Site Supervisors, and Storekeepers.
- **Executive Dashboard:** Live KPI cards for active projects, budget tracking, completion rates, and recent notifications across the site.
- **Project Management:** Project registry with detailed profile cards, contract data, and a milestone tracker for granular timelines.
- **Planning & Progress:** High-level Gantt charts paired with S-Curve analysis. Allows site teams to submit daily progress reports directly.
- **Cost Control:** Budget vs. Actual tracking down to specific cost codes (Substructure, Superstructure, Masonry, etc.) with automated warnings.
- **Material & Warehouse:** Track site inventory in real-time and handle material requests with low-stock alerts.
- **Document Management:** Centralized drawing register that enforces version control and locks superseded drawings automatically.

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Database:** [PostgreSQL](https://www.postgresql.org/) via [Prisma](https://www.prisma.io/) ORM
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) with a fully custom dark-mode design system
- **Authentication:** [Better Auth](https://www.better-auth.com/) with Prisma adapter
- **Icons:** [Tabler Icons React](https://tabler.io/icons)
- **Language:** TypeScript

## Getting Started

First, run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Database Setup

`db/migrations/` is the **single source of truth** for the database schema. Migrations run in numeric order via:

```bash
npm run db:migrate
```

This executes `psql` against the `ecms` database, applying:
1. `0001_ecms_mvp_schema.sql` — core application tables
2. `0002_better_auth.sql` — Better Auth tables
3. `0003_ecms_ipc_paid_by.sql` — IPC paid_by column

`prisma/schema.prisma` is kept in sync with these SQL files **manually** (not via `prisma migrate`). When you change the schema, update both the Prisma file and the corresponding SQL migration.

### Demo Accounts

The application uses dummy data configured in `lib/data.ts`. You can log in using any of the following credentials without a database:

- **Project Manager:** `pm@ecms.app` / `demo1234`
- **Site Supervisor:** `supervisor@ecms.app` / `demo1234`
- **Storekeeper:** `store@ecms.app` / `demo1234`

## Project Structure

- `/app`: Next.js App Router endpoints, including layout shell and pages.
- `/components`: Reusable UI components (`Logo`, `StatusPill`, `ProgressBar`, etc.) and Layout elements (`Sidebar`, `Topbar`).
- `/lib`: Helper functions and mock data (`data.ts`).
- `/middleware.ts`: Secures routes globally and enforces role-based redirections.
