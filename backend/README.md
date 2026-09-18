# Royalty Backend

Backend service built with **Express**, **TypeScript**, and **Prisma ORM** connected to a cloud **Supabase PostgreSQL** database.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (version 20+ or 22+ recommended)
- `npm` (bundled with Node.js)
- Access / connection credentials to the project's **Supabase** database

---

## 1. Quick Start Guide

### Step 1: Navigate to the Backend Directory
```bash
cd backend
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create your local `.env` file by copying the template:
```bash
cp .env.example .env
```
Open `.env` and set your `DATABASE_URL`:
```env
DATABASE_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[YOUR-REGION].pooler.supabase.com:5432/postgres"
```
> **Where to find this in Supabase:**
> 1. Open your project on [Supabase Dashboard](https://supabase.com/dashboard).
> 2. Click the **Connect** button at the top header.
> 3. Go to the **URI** tab, copy the connection string, and replace `[YOUR-PASSWORD]` with your real database password.

---

## 2. Working with Prisma ORM (Prisma 8)

> [!NOTE]
> **Important for team members familiar with Classic Prisma:**
> This repository uses **Prisma 8**. The commands and workflow differ slightly from Prisma 5/6:
> - **Schema Location:** Models are defined in `src/prisma/contract.prisma` (not `prisma/schema.prisma`).
> - **Generating Types:** Instead of `npx prisma generate`, run `npm run contract:emit`.
> - **Syncing Database:** Instead of `npx prisma migrate dev` / `db push`, run `npm run db:init` or `npm run db:update`.

### Prisma Commands Summary

| Task | Command | What It Does |
| :--- | :--- | :--- |
| **Emit Contract / Types** | `npm run contract:emit` | Regenerates `contract.json` and `contract.d.ts` from `contract.prisma` |
| **First-time DB Setup** | `npm run db:init` | Bootstraps and signs the database to match your contract |
| **Push Schema Updates** | `npm run db:update` | Updates your database schema with changes made in `contract.prisma` |
| **Verify DB Connection** | `npm run db:verify` | Checks if the database is reachable and matches your contract |

### Typical Workflow When Changing the Database:
1. Edit models in `src/prisma/contract.prisma`.
2. Run `npm run contract:emit` to update the TypeScript types.
3. Run `npm run db:update` to apply the changes to your Supabase PostgreSQL database.

---

## 3. Running the Server

### Development Mode (with hot-reloading via `tsx`)
```bash
npm run dev
```
The server will start at `http://localhost:3000`.

### Verify Database Connectivity
Send a request to the health check endpoint:
```bash
curl http://localhost:3000/health
```
Expected response if connected:
```json
{ "status": "ok", "database": "connected" }
```

### Production Build
```bash
# 1. Compile TypeScript to dist/
npm run build

# 2. Run the compiled server
npm start
```

---

## 4. Project Structure

```text
backend/
├── src/
│   ├── prisma/
│   │   ├── contract.prisma   # Your Prisma data models (schema)
│   │   ├── contract.d.ts     # Generated TypeScript definitions
│   │   ├── contract.json     # Compiled contract manifest
│   │   └── db.ts             # Initialized database client instance
│   └── server.ts             # Express application & routes
├── .env.example              # Template environment variables
├── package.json              # Scripts and dependencies
├── prisma.config.ts          # Prisma ORM configuration
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

---

## 5. Troubleshooting

- **Error: `Database not signed / Marker missing`**
  - Run `npm run db:init` to register and sign the database against your contract.
- **Error: `Database connection failed` / `DRIVER.CONNECTION_FAILED`**
  - Verify that your `DATABASE_URL` in `.env` is accurate.
  - Check that your database password does not have unescaped special characters (e.g. `@` should be `%40`).
  - Make sure your IP is not blocked by Supabase network restrictions.
- **Prisma types not updating in your editor?**
  - Run `npm run contract:emit` and restart your TypeScript language server in VS Code / IDE.

