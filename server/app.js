import express from "express";
import cors from "cors";

import { pool } from "./config/database.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        credentials: true
    })
);

app.use(express.json());

app.get("/api/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        message: "Lumen API is running."
    });
});

app.get("/api/health/db", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            "SELECT DATABASE() AS database_name"
        );

        res.status(200).json({
            status: "ok",
            message: "Database connection successful.",
            database: rows[0].database_name
        });
    } catch (error) {
        console.error("Database health check failed:", error.message);

        res.status(503).json({
            status: "error",
            message: "Database connection failed."
        });
    }
});

app.listen(port, () => {
    console.log(`Lumen API listening on port ${port}`);
});