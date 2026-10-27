import "dotenv/config";
import bcrypt from "bcrypt";

import { pool } from "../config/database.js";
import { ROLES } from "../config/roles.js";

const requiredVariables = [
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "ADMIN_NAME",
    "ADMIN_EMAIL",
    "ADMIN_PHONE"
];

async function seedAdmin() {
    for (const variable of requiredVariables) {
        if (!process.env[variable]) {
            throw new Error(
                `Missing required environment variable: ${variable}`
            );
        }
    }

    const username = process.env.ADMIN_USERNAME.trim();
    const password = process.env.ADMIN_PASSWORD;
    const fullName = process.env.ADMIN_NAME.trim();
    const email = process.env.ADMIN_EMAIL.trim();
    const phone = process.env.ADMIN_PHONE.trim();

    if (Buffer.byteLength(password, "utf8") > 72) {
        throw new Error(
            "The administrator password must not exceed 72 UTF-8 bytes."
        );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [existingUsers] = await connection.execute(
            "SELECT id FROM users WHERE username = ?",
            [username]
        );

        const [existingDetails] = await connection.execute(
            "SELECT id FROM user_details WHERE email = ?",
            [email]
        );

        const [existingClients] = await connection.execute(
            "SELECT id FROM clients WHERE email = ?",
            [email]
        );

        if (
            existingUsers.length > 0 ||
            existingDetails.length > 0 ||
            existingClients.length > 0
        ) {
            throw new Error(
                "The administrator username or email already exists."
            );
        }

        const [userResult] = await connection.execute(
            `INSERT INTO users (username, password_hash, role_id)
             VALUES (?, ?, ?)`,
            [username, passwordHash, ROLES.ADMIN]
        );

        await connection.execute(
            `INSERT INTO user_details (user_id, full_name, email, phone)
             VALUES (?, ?, ?, ?)`,
            [userResult.insertId, fullName, email, phone]
        );

        await connection.execute(
            `INSERT INTO clients (full_name, email, phone)
             VALUES (?, ?, ?)`,
            [fullName, email, phone]
        );

        await connection.commit();

        console.log("Administrator account created successfully.");
        console.log(`Username: ${username}`);
        console.log(`Role ID: ${ROLES.ADMIN}`);
        console.log("Password stored as a bcrypt hash.");
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

try {
    await seedAdmin();
} catch (error) {
    console.error("Administrator initialization failed:", error.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
