import express from 'express';
import 'dotenv/config';
import { db } from './prisma/db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authenticate, AuthenticatedRequest } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { accountsRouter } from './routes/accounts.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.get('/health', async (_req, res) => {
  try {
    // Use a simple query to verify DB connectivity
    await db.orm.public.Account.where({}).first();
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isConnectionError =
      message.includes('connect') || message.includes('ECONNREFUSED');

    if (isConnectionError) {
      console.error('Database connection failed:', error);
      res.status(500).json({ status: 'error', database: 'disconnected' });
    } else {
      // Table might not exist yet, but DB is reachable
      res.json({ status: 'ok', database: 'connected' });
    }
  }
});

app.use('/auth', authRouter);
app.use('/accounts', accountsRouter);

// Protected test route (to verify auth works)
app.get('/api/me', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };
