import express from "express";
import "dotenv/config";
import { db } from "./prisma/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check route — also verifies database connectivity
app.get("/health", async (_req, res) => {
  try {
    // Use a simple query to verify DB connectivity
    await db.orm.public.User.where({}).first();
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    // Even if the table doesn't exist yet, a connection error is distinct
    const message = error instanceof Error ? error.message : String(error);
    const isConnectionError =
      message.includes("connect") || message.includes("ECONNREFUSED");

    if (isConnectionError) {
      console.error("Database connection failed:", error);
      res.status(500).json({ status: "error", database: "disconnected" });
    } else {
      // Table might not exist yet, but DB is reachable
      res.json({ status: "ok", database: "connected" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

