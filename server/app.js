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
    return async (req, res, next) => {
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

        // Check the current status of general users.
        if (userRole === 4) {
            try {
                const [rows] = await pool.execute(
                    `SELECT is_active
                     FROM users
                     WHERE id = ?
                     LIMIT 1`,
                    [req.session.user.id]
                );

                if (!rows.length || !Boolean(rows[0].is_active)) {
                    req.session.destroy(() => { });

                    res.clearCookie("lumen.sid", {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === "production",
                        sameSite: "lax",
                        path: "/"
                    });

                    return res.status(403).json({
                        status: "error",
                        message: "Your account is inactive. Contact the administrator."
                    });
                }
            } catch (error) {
                return next(error);
            }
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

        if (
            existingEmails.length > 0
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
            `INSERT INTO clients (user_id)
            VALUES (?)`,
            [userResult.insertId]
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
                u.is_active,
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

        if (user && !Boolean(user.is_active)) {
            return res.status(403).json({
                status: "error",
                message: "Your account is inactive. Contact the administrator."
            });
        }

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


app.get("/api/admin/users", requireRoles(1, 2, 3), async (req, res) => {
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
             ORDER BY u.id ASC`
        );

        const roleNames = {
            1: "Admin",
            2: "Programmer",
            3: "User_Test",
            4: "User_General"
        };

        const users = rows.map((user) => ({
            ...user,
            role_name: roleNames[user.role_id] ?? "Unknown"
        }));

        return res.status(200).json({
            status: "ok",
            users
        });
    } catch (error) {
        console.error("User listing failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve users."
        });
    }
});


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

// Get active services.
app.get("/api/services", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                id,
                name,
                description,
                price,
                features,
                icon
             FROM services
             WHERE is_active = TRUE
             ORDER BY id ASC`
        );

        return res.status(200).json({
            status: "ok",
            services: rows
        });
    } catch (error) {
        console.error("Service listing failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve services."
        });
    }
});

// Get all services for the administrative panel.
app.get("/api/admin/services", requireRoles(1, 2, 3), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT *
             FROM services
             ORDER BY id ASC`
        );

        return res.status(200).json({
            status: "ok",
            services: rows
        });
    } catch (error) {
        console.error("Administrative service listing failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve administrative services."
        });
    }
});

app.post("/api/admin/services", requireRoles(1), async (req, res) => {
    try {
        const { name, description, price, features, icon } = req.body ?? {};

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof description !== "string" ||
            !description.trim() ||
            !Array.isArray(features)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Name, description and features are required."
            });
        }

        const normalizedPrice =
            price === null || price === "" || price === undefined
                ? null
                : Number(price);

        if (
            normalizedPrice !== null &&
            (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Price must be a valid non-negative number."
            });
        }

        const [result] = await pool.execute(
            `INSERT INTO services (
                name,
                description,
                price,
                features,
                icon
            )
            VALUES (?, ?, ?, ?, ?)`,
            [
                name.trim(),
                description.trim(),
                normalizedPrice,
                JSON.stringify(features),
                typeof icon === "string" && icon.trim()
                    ? icon.trim()
                    : null
            ]
        );

        return res.status(201).json({
            status: "ok",
            message: "Service created successfully.",
            service_id: result.insertId
        });
    } catch (error) {
        console.error("Service creation failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to create the service."
        });
    }
});

app.put("/api/admin/services/:id", requireRoles(1), async (req, res) => {
    try {
        const serviceId = Number(req.params.id);
        const { name, description, price, features, icon } = req.body ?? {};

        if (!Number.isInteger(serviceId) || serviceId <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid service ID."
            });
        }

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof description !== "string" ||
            !description.trim() ||
            !Array.isArray(features)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Name, description and features are required."
            });
        }

        const normalizedPrice =
            price === null || price === "" || price === undefined
                ? null
                : Number(price);

        if (
            normalizedPrice !== null &&
            (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Price must be a valid non-negative number."
            });
        }

        const [result] = await pool.execute(
            `UPDATE services
             SET name = ?,
                 description = ?,
                 price = ?,
                 features = ?,
                 icon = ?
             WHERE id = ?`,
            [
                name.trim(),
                description.trim(),
                normalizedPrice,
                JSON.stringify(features),
                typeof icon === "string" && icon.trim()
                    ? icon.trim()
                    : null,
                serviceId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Service not found."
            });
        }

        return res.status(200).json({
            status: "ok",
            message: "Service updated successfully."
        });
    } catch (error) {
        console.error("Service update failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update the service."
        });
    }
});

app.patch("/api/admin/services/:id/status", requireRoles(1), async (req, res) => {
    try {
        const serviceId = Number(req.params.id);
        const { is_active } = req.body ?? {};

        if (
            !Number.isInteger(serviceId) ||
            serviceId <= 0 ||
            typeof is_active !== "boolean"
        ) {
            return res.status(400).json({
                status: "error",
                message: "A valid service ID and status are required."
            });
        }

        const [result] = await pool.execute(
            `UPDATE services
             SET is_active = ?
             WHERE id = ?`,
            [is_active, serviceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Service not found."
            });
        }

        return res.status(200).json({
            status: "ok",
            message: is_active
                ? "Service activated successfully."
                : "Service deactivated successfully."
        });
    } catch (error) {
        console.error("Service status update failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update the service status."
        });
    }
});

app.get("/api/admin/clients", requireRoles(1, 2, 3), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                c.id AS client_id,
                u.id AS user_id,
                u.username,
                u.is_active,
                u.created_at,
                d.full_name,
                d.email,
                d.phone,
                s.id AS service_id,
                s.name AS service_name
             FROM clients AS c
             INNER JOIN users AS u
                ON u.id = c.user_id
             INNER JOIN user_details AS d
                ON d.user_id = u.id
             LEFT JOIN client_services AS cs
                ON cs.client_id = c.id
             LEFT JOIN services AS s
                ON s.id = cs.service_id
             WHERE u.role_id = 4
             ORDER BY c.id ASC`
        );

        const clientsMap = new Map();

        for (const row of rows) {
            if (!clientsMap.has(row.client_id)) {
                clientsMap.set(row.client_id, {
                    client_id: row.client_id,
                    user_id: row.user_id,
                    username: row.username,
                    is_active: Boolean(row.is_active),
                    created_at: row.created_at,
                    full_name: row.full_name,
                    email: row.email,
                    phone: row.phone,
                    services: []
                });
            }

            if (row.service_id !== null) {
                clientsMap.get(row.client_id).services.push({
                    id: row.service_id,
                    name: row.service_name
                });
            }
        }

        return res.status(200).json({
            status: "ok",
            clients: Array.from(clientsMap.values())
        });
    } catch (error) {
        console.error("Client listing failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve clients."
        });
    }
});

app.get("/api/admin/clients/:id", requireRoles(1, 2, 3), async (req, res) => {
    try {
        const clientId = Number(req.params.id);

        if (!Number.isInteger(clientId) || clientId <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid client ID."
            });
        }

        const [rows] = await pool.execute(
            `SELECT
                c.id AS client_id,
                u.id AS user_id,
                u.username,
                u.is_active,
                d.full_name,
                d.email,
                d.phone,
                s.id AS service_id,
                s.name AS service_name
             FROM clients AS c
             INNER JOIN users AS u
                ON u.id = c.user_id
             INNER JOIN user_details AS d
                ON d.user_id = u.id
             LEFT JOIN client_services AS cs
                ON cs.client_id = c.id
             LEFT JOIN services AS s
                ON s.id = cs.service_id
             WHERE c.id = ?
               AND u.role_id = 4`,
            [clientId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Client not found."
            });
        }

        const client = {
            client_id: rows[0].client_id,
            user_id: rows[0].user_id,
            username: rows[0].username,
            is_active: Boolean(rows[0].is_active),
            full_name: rows[0].full_name,
            email: rows[0].email,
            phone: rows[0].phone,
            services: rows
                .filter((row) => row.service_id !== null)
                .map((row) => ({
                    id: row.service_id,
                    name: row.service_name
                }))
        };

        return res.status(200).json({
            status: "ok",
            client
        });
    } catch (error) {
        console.error("Client retrieval failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve client details."
        });
    }
});

app.patch("/api/admin/clients/:id", requireRoles(1), async (req, res) => {
    let connection;

    try {
        const clientId = Number(req.params.id);
        const { full_name, email, phone } = req.body ?? {};

        if (!Number.isInteger(clientId) || clientId <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid client ID."
            });
        }

        if (
            typeof full_name !== "string" ||
            typeof email !== "string" ||
            typeof phone !== "string" ||
            !full_name.trim() ||
            !email.trim() ||
            !phone.trim()
        ) {
            return res.status(400).json({
                status: "error",
                message: "Full name, email and phone are required."
            });
        }

        const normalizedFullName = full_name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPhone = phone.trim();

        if (normalizedFullName.length > 100) {
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
                message: "Invalid email address."
            });
        }

        if (normalizedPhone.length > 20) {
            return res.status(400).json({
                status: "error",
                message: "Phone cannot exceed 20 characters."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [clients] = await connection.execute(
            `SELECT c.user_id
             FROM clients AS c
             INNER JOIN users AS u
                ON u.id = c.user_id
             WHERE c.id = ?
               AND u.role_id = 4
             FOR UPDATE`,
            [clientId]
        );

        if (clients.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                status: "error",
                message: "Client not found."
            });
        }

        await connection.execute(
            `UPDATE user_details
             SET full_name = ?, email = ?, phone = ?
             WHERE user_id = ?`,
            [
                normalizedFullName,
                normalizedEmail,
                normalizedPhone,
                clients[0].user_id
            ]
        );

        await connection.commit();

        return res.status(200).json({
            status: "ok",
            message: "Client information updated successfully."
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => { });
        }

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                status: "error",
                message: "The email is already in use."
            });
        }

        console.error("Client update failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update client information."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.patch("/api/admin/clients/:id/status", requireRoles(1), async (req, res) => {
    try {
        const clientId = Number(req.params.id);
        const { is_active } = req.body ?? {};

        if (
            !Number.isInteger(clientId) ||
            clientId <= 0 ||
            typeof is_active !== "boolean"
        ) {
            return res.status(400).json({
                status: "error",
                message: "A valid client ID and status are required."
            });
        }

        const [result] = await pool.execute(
            `UPDATE users AS u
             INNER JOIN clients AS c
                ON c.user_id = u.id
             SET u.is_active = ?
             WHERE c.id = ?
               AND u.role_id = 4`,
            [is_active, clientId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Client not found."
            });
        }

        return res.status(200).json({
            status: "ok",
            message: is_active
                ? "Client activated successfully."
                : "Client deactivated successfully."
        });
    } catch (error) {
        console.error("Client status update failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update client status."
        });
    }
});

app.put("/api/admin/clients/:id/services", requireRoles(1), async (req, res) => {
    let connection;

    try {
        const clientId = Number(req.params.id);
        const { service_ids } = req.body ?? {};

        if (
            !Number.isInteger(clientId) ||
            clientId <= 0 ||
            !Array.isArray(service_ids) ||
            !service_ids.every(
                (id) => Number.isInteger(id) && id > 0
            ) ||
            new Set(service_ids).size !== service_ids.length
        ) {
            return res.status(400).json({
                status: "error",
                message: "A valid client ID and service ID array are required."
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [clients] = await connection.execute(
            `SELECT c.id
             FROM clients AS c
             INNER JOIN users AS u
                ON u.id = c.user_id
             WHERE c.id = ?
               AND u.role_id = 4
             FOR UPDATE`,
            [clientId]
        );

        if (clients.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                status: "error",
                message: "Client not found."
            });
        }

        if (service_ids.length > 0) {
            const placeholders = service_ids.map(() => "?").join(", ");

            const [services] = await connection.execute(
                `SELECT id
                 FROM services
                 WHERE is_active = TRUE
                   AND id IN (${placeholders})`,
                service_ids
            );

            if (services.length !== service_ids.length) {
                await connection.rollback();

                return res.status(400).json({
                    status: "error",
                    message: "One or more services do not exist or are inactive."
                });
            }
        }

        await connection.execute(
            `DELETE FROM client_services
             WHERE client_id = ?`,
            [clientId]
        );

        for (const serviceId of service_ids) {
            await connection.execute(
                `INSERT INTO client_services (
                    client_id,
                    service_id
                )
                VALUES (?, ?)`,
                [clientId, serviceId]
            );
        }

        await connection.commit();

        return res.status(200).json({
            status: "ok",
            message: "Client services updated successfully."
        });
    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => { });
        }

        console.error("Client service assignment failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update client services."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get("/api/requests/me", requireRoles(4), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                sr.id,
                sr.service_id,
                sr.quantity,
                s.price,
                s.name AS service_name,
                sr.message,
                sr.status,
                sr.event_date,
                sr.created_at,
                sr.updated_at
             FROM service_requests AS sr
             INNER JOIN clients AS c
                ON c.id = sr.client_id
             INNER JOIN services AS s
                ON s.id = sr.service_id
             WHERE c.user_id = ?
             ORDER BY sr.created_at DESC`,
            [req.session.user.id]
        );

        return res.status(200).json({
            status: "ok",
            requests: rows
        });
    } catch (error) {
        console.error("Client request listing failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve your requests."
        });
    }
});

app.post("/api/requests", requireRoles(4), async (req, res) => {
    let connection;

    try {
        const { items, message, event_date } = req.body ?? {};

        let normalizedEventDate = null;

        if (event_date !== undefined && event_date !== null && event_date !== "") {
            if (
                typeof event_date !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(event_date) ||
                Number.isNaN(new Date(event_date).getTime())
            ) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid event date."
                });
            }

            normalizedEventDate = event_date;
        }

        if (
            !Array.isArray(items) ||
            items.length === 0 ||
            items.length > 20 ||
            !items.every(
                (item) =>
                    Number.isInteger(item?.service_id) &&
                    item.service_id > 0 &&
                    Number.isInteger(item?.quantity) &&
                    item.quantity >= 1 &&
                    item.quantity <= 99
            ) ||
            new Set(items.map((item) => item.service_id)).size !== items.length ||
            (message != null && typeof message !== "string")
        ) {
            return res.status(400).json({
                status: "error",
                message: "Select at least one service with a valid quantity (1-99)."
            });
        }

        const normalizedMessage =
            typeof message === "string" && message.trim()
                ? message.trim().slice(0, 1000)
                : null;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [clients] = await connection.execute(
            "SELECT id FROM clients WHERE user_id = ? LIMIT 1",
            [req.session.user.id]
        );

        if (clients.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                status: "error",
                message: "Client profile not found."
            });
        }

        const serviceIds = items.map((item) => item.service_id);
        const placeholders = serviceIds.map(() => "?").join(", ");

        const [activeServices] = await connection.execute(
            `SELECT id FROM services
             WHERE is_active = TRUE AND id IN (${placeholders})`,
            serviceIds
        );

        if (activeServices.length !== serviceIds.length) {
            await connection.rollback();
            return res.status(400).json({
                status: "error",
                message: "One or more services do not exist or are inactive."
            });
        }

        for (const item of items) {
            await connection.execute(
                `INSERT INTO service_requests
                    (client_id, service_id, quantity, event_date, message)
                VALUES (?, ?, ?, ?, ?)`,
                [clients[0].id, item.service_id, item.quantity, normalizedEventDate, normalizedMessage]
            );
        }

        await connection.commit();

        return res.status(201).json({
            status: "ok",
            message: "Request created successfully."
        });
    } catch (error) {
        if (connection) await connection.rollback().catch(() => { });
        console.error("Request creation failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to create the request."
        });
    } finally {
        if (connection) connection.release();
    }
});

app.get("/api/admin/requests", requireRoles(1, 2, 3), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                sr.id,
                sr.client_id,
                sr.service_id,
                sr.quantity,
                sr.message,
                sr.status,
                sr.event_date,
                sr.created_at,
                sr.updated_at,
                u.username,
                d.full_name,
                d.email,
                d.phone,
                s.name AS service_name
             FROM service_requests AS sr
             INNER JOIN clients AS c
                ON c.id = sr.client_id
             INNER JOIN users AS u
                ON u.id = c.user_id
             INNER JOIN user_details AS d
                ON d.user_id = u.id
             INNER JOIN services AS s
                ON s.id = sr.service_id
             ORDER BY sr.created_at DESC`
        );

        return res.status(200).json({
            status: "ok",
            requests: rows
        });
    } catch (error) {
        console.error("Administrative request listing failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to retrieve requests."
        });
    }
});

app.patch("/api/admin/requests/:id/status", requireRoles(1), async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        const { status } = req.body ?? {};

        const allowedStatuses = [
            "Solicitado",
            "En proceso",
            "Finalizado"
        ];

        if (
            !Number.isInteger(requestId) ||
            requestId <= 0 ||
            !allowedStatuses.includes(status)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Invalid request ID or status."
            });
        }

        const [result] = await pool.execute(
            `UPDATE service_requests
             SET status = ?
             WHERE id = ?`,
            [status, requestId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "Request not found."
            });
        }

        return res.status(200).json({
            status: "ok",
            message: "Request status updated successfully."
        });
    } catch (error) {
        console.error("Request status update failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to update request status."
        });
    }
});

async function findOwnEditableRequest(requestId, userId) {
    const [rows] = await pool.execute(
        `SELECT sr.id, sr.status
         FROM service_requests AS sr
         INNER JOIN clients AS c ON c.id = sr.client_id
         WHERE sr.id = ? AND c.user_id = ?
         LIMIT 1`,
        [requestId, userId]
    );
    return rows[0] ?? null;
}

app.put("/api/requests/:id", requireRoles(4), async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        const quantity = req.body?.quantity;

        if (
            !Number.isInteger(requestId) || requestId <= 0 ||
            !Number.isInteger(quantity) || quantity < 1 || quantity > 99
        ) {
            return res.status(400).json({
                status: "error",
                message: "A valid request ID and quantity (1-99) are required."
            });
        }

        const request = await findOwnEditableRequest(requestId, req.session.user.id);

        if (!request) {
            return res.status(404).json({ status: "error", message: "Request not found." });
        }

        if (request.status !== "Solicitado") {
            return res.status(409).json({
                status: "error",
                message: "Only requests with status 'Solicitado' can be modified."
            });
        }

        await pool.execute(
            "UPDATE service_requests SET quantity = ? WHERE id = ?",
            [quantity, requestId]
        );

        return res.status(200).json({ status: "ok", message: "Request updated successfully." });
    } catch (error) {
        console.error("Request update failed:", error.message);
        return res.status(500).json({ status: "error", message: "Unable to update the request." });
    }
});

app.delete("/api/requests/:id", requireRoles(4), async (req, res) => {
    try {
        const requestId = Number(req.params.id);

        if (!Number.isInteger(requestId) || requestId <= 0) {
            return res.status(400).json({ status: "error", message: "Invalid request ID." });
        }

        const request = await findOwnEditableRequest(requestId, req.session.user.id);

        if (!request) {
            return res.status(404).json({ status: "error", message: "Request not found." });
        }

        if (request.status !== "Solicitado") {
            return res.status(409).json({
                status: "error",
                message: "Only requests with status 'Solicitado' can be deleted."
            });
        }

        await pool.execute("DELETE FROM service_requests WHERE id = ?", [requestId]);

        return res.status(200).json({ status: "ok", message: "Request deleted successfully." });
    } catch (error) {
        console.error("Request deletion failed:", error.message);
        return res.status(500).json({ status: "error", message: "Unable to delete the request." });
    }
});