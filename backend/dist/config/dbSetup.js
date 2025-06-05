"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("./db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function setupDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = yield db_1.default.connect();
        try {
            yield client.query('BEGIN');
            // Create users table
            yield client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Create refresh_tokens table
            yield client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Create cctv_cameras table
            yield client.query(`
      CREATE TABLE IF NOT EXISTS cctv_cameras (
        camera_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(100),
        rtsp_url VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Create employee table
            yield client.query(`
      CREATE TABLE IF NOT EXISTS employee (
        employee_id SERIAL PRIMARY KEY,
        employee_name VARCHAR(100) NOT NULL,
        designation VARCHAR(100),
        face_encoding BYTEA,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Create attendance_logs table
            yield client.query(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        log_id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employee(employee_id) ON DELETE CASCADE,
        camera_id INTEGER REFERENCES cctv_cameras(camera_id) ON DELETE SET NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        gesture_detected VARCHAR(50)
      )
    `);
            // Create notifications table
            yield client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
            // Create admin user if it doesn't exist
            const adminExists = yield client.query('SELECT * FROM users WHERE username = $1', ['admin']);
            if (adminExists.rows.length === 0) {
                const salt = yield bcrypt_1.default.genSalt(10);
                const hashedPassword = yield bcrypt_1.default.hash('admin123', salt);
                yield client.query('INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4)', ['admin', hashedPassword, 'admin@example.com', 'admin']);
                console.log('Admin user created');
            }
            yield client.query('COMMIT');
            console.log('Database setup completed successfully');
        }
        catch (error) {
            yield client.query('ROLLBACK');
            console.error('Error setting up database:', error);
        }
        finally {
            client.release();
            process.exit(0);
        }
    });
}
setupDatabase();
