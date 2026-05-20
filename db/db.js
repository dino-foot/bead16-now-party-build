import { Pool } from "pg";
const pool = new Pool({
    connectionString: "postgresql://postgres:IYEHQTZzGipzGSVGnSJiqAHfNKFgiRNI@roundhouse.proxy.rlwy.net:27562/railway",
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
export async function ensureTablesExist() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS fcm_tokens (
            id SERIAL PRIMARY KEY,
            playfab_id VARCHAR(50) NOT NULL,
            token TEXT NOT NULL UNIQUE,
            platform VARCHAR(10),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_fcm_tokens_playfab_id ON fcm_tokens(playfab_id);
    `);
    console.log("[DB] Ensured fcm_tokens table exists");
    await pool.query(`
        CREATE TABLE IF NOT EXISTS players (
            playfab_id VARCHAR(50) PRIMARY KEY,
            player_name VARCHAR(100),
            country VARCHAR(5),
            avatar_id INTEGER DEFAULT 0,
            avatar_url TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );
    `);
    console.log("[DB] Ensured players table exists");
    await pool.query(`
        CREATE TABLE IF NOT EXISTS player_stats (
            playfab_id VARCHAR(50) PRIMARY KEY REFERENCES players(playfab_id) ON DELETE CASCADE,
            level INTEGER DEFAULT 1,
            exp INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            games_won INTEGER DEFAULT 0,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_player_stats_playfab_id ON player_stats(playfab_id);
    `);
    console.log("[DB] Ensured player_stats table exists");
    // invitations table for private match invitations
    await pool.query(`
        CREATE TABLE IF NOT EXISTS invitations (
            id SERIAL PRIMARY KEY,
            sender_playfab_id VARCHAR(50) NOT NULL,
            sender_name VARCHAR(100) NOT NULL,
            recipient_playfab_id VARCHAR(50) NOT NULL,
            room_code VARCHAR(10) NOT NULL,
            entry_fee INTEGER NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_invitations_recipient ON invitations(recipient_playfab_id, status);
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_invitations_expires ON invitations(expires_at);
    `);
    console.log("[DB] Ensured invitations table exists");
}
export default pool;
// postgresql://postgres:IYEHQTZzGipzGSVGnSJiqAHfNKFgiRNI@roundhouse.proxy.rlwy.net:27562/railway
// If your Colyseus server is also on Railway, use the Internal URL (it's faster and free).
//  If you are testing from your local PC, make sure you use the Public URL.
