import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected successfully');
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('❌ PostgreSQL connection error:', err.message);
    } else {
      console.error('❌ Unknown PostgreSQL connection error');
    }
    process.exit(1);
  } finally {
    if (client) client.release();
  }
};

testConnection();

export default pool;