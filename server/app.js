import "dotenv/config";

import express from "express";
import cors from "cors";
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
import bcrypt from "bcrypt";

import { pool } from "./config/database.js";

const app = express();
const port = Number(process.env.PORT || 3000);

const requiredVariables = ["SESSION_SECRET"];

for (const variable of requiredVariables) {
    if (!process.env[variable]) {
        throw new Error(
            `Missing required environment variable: ${variable}`
        );
    }
}

const MySQLStore = MySQLStoreFactory(session);

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    createDatabaseTable: false,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 8 * 60 * 60 * 1000,
    schema: {
        tableName: "sessions",
        columnNames: {
            session_id: "session_id",
            expires: "expires",
            data: "data"
        }
    }
});

app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        credentials: true
    })
);

app.use(express.json());

app.use(
    session({
        name: "lumen.sid",
        secret: process.env.SESSION_SECRET,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000
        }
    })
);

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            status: "error",
            message: "Authentication required."
        });
    }

    next();
}

function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({
                status: "error",
                message: "Authentication required."
            });
        }

        const userRole = Number(req.session.user.role_id);

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                status: "error",
                message: "You do not have permission to access this resource."
            });
        }

        next();
    };
}

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

app.post("/api/auth/register", async (req, res) => {
    const body = req.body;

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        return res.status(400).json({
            status: "error",
            message: "A valid JSON object is required."
        });
    }

    const {
        full_name,
        email,
        phone,
        username,
        password
    } = body;

    if (
        typeof full_name !== "string" ||
        typeof email !== "string" ||
        typeof phone !== "string" ||
        typeof username !== "string" ||
        typeof password !== "string"
    ) {
        return res.status(400).json({
            status: "error",
            message: "All registration fields are required."
        });
    }

    const fullName = full_name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();
    const normalizedPhone = phone.trim();

    if (
        !fullName ||
        !normalizedEmail ||
        !normalizedUsername ||
        !normalizedPhone ||
        !password
    ) {
        return res.status(400).json({
            status: "error",
            message: "All registration fields are required."
        });
    }

    if (fullName.length > 100) {
        return res.status(400).json({
            status: "error",
            message: "Full name cannot exceed 100 characters."
        });
    }

    if (
        normalizedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
        return res.status(400).json({
            status: "error",
            message: "A valid email address is required."
        });
    }

    if (normalizedPhone.length > 20) {
        return res.status(400).json({
            status: "error",
            message: "Phone cannot exceed 20 characters."
        });
    }

    if (
        normalizedUsername.length > 50 ||
        !/^[a-zA-Z0-9_.-]+$/.test(normalizedUsername)
    ) {
        return res.status(400).json({
            status: "error",
            message:
                "Username must be at most 50 characters and contain only letters, numbers, dots, underscores or hyphens."
        });
    }

    if (
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return res.status(400).json({
            status: "error",
            message:
                "Password must contain at least 8 characters and no more than 72 UTF-8 bytes."
        });
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        const [existingUsers] = await connection.execute(
            `SELECT id
             FROM users
             WHERE username = ?
             LIMIT 1`,
            [normalizedUsername]
        );

        if (existingUsers.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                status: "error",
                message: "Username or email is already in use."
            });
        }

        const [existingEmails] = await connection.execute(
            `SELECT email
             FROM user_details
             WHERE email = ?
             LIMIT 1`,
            [normalizedEmail]
        );

        const [existingClientEmails] = await connection.execute(
            `SELECT id
             FROM clients
             WHERE email = ?
             LIMIT 1`,
            [normalizedEmail]
        );

        if (
            existingEmails.length > 0 ||
            existingClientEmails.length > 0
        ) {
            await connection.rollback();

            return res.status(409).json({
                status: "error",
                message: "Username or email is already in use."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [userResult] = await connection.execute(
            `INSERT INTO users (
                username,
                password_hash,
                role_id
            )
            VALUES (?, ?, ?)`,
            [
                normalizedUsername,
                passwordHash,
                4
            ]
        );

        await connection.execute(
            `INSERT INTO user_details (
                user_id,
                full_name,
                email,
                phone
            )
            VALUES (?, ?, ?, ?)`,
            [
                userResult.insertId,
                fullName,
                normalizedEmail,
                normalizedPhone
            ]
        );

        await connection.execute(
            `INSERT INTO clients (
                full_name,
                email,
                phone
            )
            VALUES (?, ?, ?)`,
            [
                fullName,
                normalizedEmail,
                normalizedPhone
            ]
        );

        await connection.commit();

        return res.status(201).json({
            status: "ok",
            message:
                "Account created successfully. You can now log in.",
            user: {
                id: userResult.insertId,
                username: normalizedUsername,
                role_id: 4,
                full_name: fullName,
                email: normalizedEmail,
                phone: normalizedPhone
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => { });
        }

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                status: "error",
                message: "Username or email is already in use."
            });
        }

        console.error("Registration failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to create the account."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body ?? {};

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                status: "error",
                message: "Username and password are required."
            });
        }

        const [rows] = await pool.execute(
            `SELECT
                u.id,
                u.username,
                u.password_hash,
                u.role_id,
                d.full_name,
                d.email,
                d.phone
             FROM users AS u
             INNER JOIN user_details AS d
                ON d.user_id = u.id
             WHERE u.username = ?
             LIMIT 1`,
            [username.trim()]
        );

        const user = rows[0];

        if (
            !user ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            return res.status(401).json({
                status: "error",
                message: "Invalid username or password."
            });
        }

        req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error("Session regeneration failed.");

                return res.status(500).json({
                    status: "error",
                    message: "Unable to create a session."
                });
            }

            req.session.user = {
                id: user.id,
                username: user.username,
                role_id: user.role_id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone
            };

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Session save failed.");

                    return res.status(500).json({
                        status: "error",
                        message: "Unable to save the session."
                    });
                }

                return res.status(200).json({
                    status: "ok",
                    message: "Login successful.",
                    user: req.session.user
                });
            });
        });
    } catch (error) {
        console.error("Login failed:", error.message);

        res.status(500).json({
            status: "error",
            message: "An internal server error occurred."
        });
    }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
    res.status(200).json({
        status: "ok",
        user: req.session.user
    });
});

app.get("/api/admin/dashboard", requireRoles(1, 2, 3), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                    u.id,
                    u.username,
                    u.role_id,
                    u.created_at,
                    d.full_name,
                    d.email,
                    d.phone
                 FROM users AS u
                 INNER JOIN user_details AS d
                    ON d.user_id = u.id
                 WHERE u.role_id = ?
                 ORDER BY u.id ASC
                 LIMIT 1`,
            [1]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Administrator account not found."
            });
        }

        return res.status(200).json({
            status: "ok",
            message: "Administrative dashboard loaded.",
            administrator: rows[0]
        });
    } catch (error) {
        console.error(
            "Administrative dashboard failed:",
            error.message
        );

        return res.status(500).json({
            status: "error",
            message: "Unable to load the administrative dashboard."
        });
    }
}
);

app.get("/api/profile", requireRoles(4), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                u.id,
                u.username,
                u.role_id,
                d.full_name,
                d.email,
                d.phone
             FROM users AS u
             INNER JOIN user_details AS d
                ON d.user_id = u.id
             WHERE u.id = ?
             LIMIT 1`,
            [req.session.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "User profile not found."
            });
        }

        return res.status(200).json({
            status: "ok",
            profile: rows[0]
        });
    } catch (error) {
        console.error("Profile retrieval failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve the user profile."
        });
    }
});

app.patch("/api/profile", requireRoles(4), async (req, res) => {
    const body = req.body;

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        return res.status(400).json({
            status: "error",
            message: "A valid JSON object is required."
        });
    }

    const allowedFields = [
        "username",
        "full_name",
        "email",
        "phone"
    ];

    const receivedFields = Object.keys(body);

    if (
        receivedFields.length === 0 ||
        receivedFields.some(
            (field) => !allowedFields.includes(field)
        )
    ) {
        return res.status(400).json({
            status: "error",
            message: "Invalid or missing profile fields."
        });
    }

    const updatedValues = {};

    for (const field of receivedFields) {
        if (
            typeof body[field] !== "string" ||
            !body[field].trim()
        ) {
            return res.status(400).json({
                status: "error",
                message: `Invalid value for ${field}.`
            });
        }

        updatedValues[field] = body[field].trim();
    }

    if (
        updatedValues.username &&
        updatedValues.username.length > 50
    ) {
        return res.status(400).json({
            status: "error",
            message: "Username cannot exceed 50 characters."
        });
    }

    if (
        updatedValues.full_name &&
        updatedValues.full_name.length > 100
    ) {
        return res.status(400).json({
            status: "error",
            message: "Full name cannot exceed 100 characters."
        });
    }

    if (
        updatedValues.email &&
        (
            updatedValues.email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                updatedValues.email
            )
        )
    ) {
        return res.status(400).json({
            status: "error",
            message: "A valid email address is required."
        });
    }

    if (
        updatedValues.phone &&
        updatedValues.phone.length > 20
    ) {
        return res.status(400).json({
            status: "error",
            message: "Phone cannot exceed 20 characters."
        });
    }

    if (updatedValues.email) {
        updatedValues.email =
            updatedValues.email.toLowerCase();
    }

    let connection;

    try {
        connection = await pool.getConnection();

        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT
                u.id,
                u.username,
                u.role_id,
                d.full_name,
                d.email,
                d.phone
             FROM users AS u
             INNER JOIN user_details AS d
                ON d.user_id = u.id
             WHERE u.id = ?
             FOR UPDATE`,
            [req.session.user.id]
        );

        if (rows.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                status: "error",
                message: "User profile not found."
            });
        }

        const currentProfile = rows[0];

        const nextProfile = {
            username:
                updatedValues.username ?? currentProfile.username,
            full_name:
                updatedValues.full_name ?? currentProfile.full_name,
            email:
                updatedValues.email ?? currentProfile.email,
            phone:
                updatedValues.phone ?? currentProfile.phone
        };

        await connection.execute(
            `UPDATE users
             SET username = ?
             WHERE id = ?`,
            [nextProfile.username, currentProfile.id]
        );

        await connection.execute(
            `UPDATE user_details
             SET full_name = ?, email = ?, phone = ?
             WHERE user_id = ?`,
            [
                nextProfile.full_name,
                nextProfile.email,
                nextProfile.phone,
                currentProfile.id
            ]
        );

        await connection.execute(
            `UPDATE clients
             SET full_name = ?, email = ?, phone = ?
             WHERE email = ?`,
            [
                nextProfile.full_name,
                nextProfile.email,
                nextProfile.phone,
                currentProfile.email
            ]
        );

        await connection.commit();

        const updatedSessionUser = {
            id: currentProfile.id,
            username: nextProfile.username,
            role_id: currentProfile.role_id,
            full_name: nextProfile.full_name,
            email: nextProfile.email,
            phone: nextProfile.phone
        };

        req.session.user = updatedSessionUser;

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error(
                    "Updated session could not be saved."
                );

                return res.status(500).json({
                    status: "error",
                    message:
                        "Profile updated, but the session could not be refreshed."
                });
            }

            return res.status(200).json({
                status: "ok",
                message: "Profile updated successfully.",
                profile: updatedSessionUser
            });
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => { });
        }

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                status: "error",
                message:
                    "The username or email is already in use."
            });
        }

        console.error("Profile update failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update the user profile."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Session destruction failed.");

            return res.status(500).json({
                status: "error",
                message: "Unable to log out."
            });
        }

        res.clearCookie("lumen.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/"
        });

        return res.status(200).json({
            status: "ok",
            message: "Logout successful."
        });
    });
});

app.listen(port, () => {
    console.log(`Lumen API listening on port ${port}`);
});