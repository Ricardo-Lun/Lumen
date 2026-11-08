-- ==========================================================
-- LUMEN - Esquema completo de la base de datos (MariaDB)
-- Para crear todo desde cero: mysql -u root -p < schema.sql
-- Despues crea el administrador con: node server/scripts/seed-admin.js
-- ==========================================================

CREATE DATABASE IF NOT EXISTS lumen_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE lumen_db;

-- ----------------------------------------------------------
-- users: credenciales, rol y estado de la cuenta.
-- Roles: 1 = Admin, 2 = Programmer, 3 = User_Test, 4 = Cliente
-- Los roles 2 y 3 son solo de consulta.
-- is_active = 0 impide iniciar sesion.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id TINYINT UNSIGNED NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_users_role
        CHECK (role_id IN (1, 2, 3, 4))
) ENGINE = InnoDB;

-- ----------------------------------------------------------
-- user_details: datos personales de cada usuario (1 a 1 con users).
-- ----------------------------------------------------------
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

-- ----------------------------------------------------------
-- clients: perfil de cliente, solo para usuarios con rol 4.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,

    CONSTRAINT fk_clients_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ----------------------------------------------------------
-- sessions: sesiones de inicio de sesion (express-mysql-session).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128)
        COLLATE utf8mb4_bin NOT NULL,
    expires INT UNSIGNED NOT NULL,
    data MEDIUMTEXT
        COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id),
    INDEX idx_sessions_expires (expires)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- services: catalogo de servicios que administra el admin.
-- features es un arreglo JSON de caracteristicas.
-- is_active = 0 oculta el servicio de la galeria.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    price DECIMAL(10, 2) UNSIGNED DEFAULT NULL,
    features JSON NOT NULL,
    icon VARCHAR(100) DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_services_active (is_active)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- client_services: servicios asignados a cada cliente por el admin
-- (relacion muchos a muchos entre clients y services).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_services (
    client_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,

    PRIMARY KEY (client_id, service_id),

    CONSTRAINT fk_client_services_client
        FOREIGN KEY (client_id)
        REFERENCES clients(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_client_services_service
        FOREIGN KEY (service_id)
        REFERENCES services(id)
        ON DELETE CASCADE
) ENGINE = InnoDB;

-- ----------------------------------------------------------
-- service_requests: solicitudes de los clientes.
-- status inicia en 'Solicitado' y solo el admin lo cambia.
-- El cliente solo puede modificar/borrar si sigue 'Solicitado'.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    event_date DATE DEFAULT NULL,
    message TEXT DEFAULT NULL,
    status ENUM('Solicitado', 'En proceso', 'Finalizado')
        NOT NULL DEFAULT 'Solicitado',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_requests_client
        FOREIGN KEY (client_id)
        REFERENCES clients(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_requests_service
        FOREIGN KEY (service_id)
        REFERENCES services(id)
        ON DELETE CASCADE,

    INDEX idx_requests_status (status)
) ENGINE = InnoDB;