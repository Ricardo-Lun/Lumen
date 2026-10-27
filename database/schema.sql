-- Create the application database.
CREATE DATABASE IF NOT EXISTS lumen_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE lumen_db;


-- Store user credentials and role assignments.
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_users_role
        CHECK (role_id IN (1, 2, 3, 4))
) ENGINE = InnoDB;


-- Store personal information associated with each user.
CREATE TABLE IF NOT EXISTS user_details (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,

    CONSTRAINT fk_user_details_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;


-- Store client information independently from login accounts.
CREATE TABLE IF NOT EXISTS clients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL
) ENGINE = InnoDB;