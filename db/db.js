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
    await pool.query(`
        CREATE TABLE IF NOT EXISTS matches (
            id SERIAL PRIMARY KEY,
            player1_playfab_id VARCHAR(50) NOT NULL,
            player2_playfab_id VARCHAR(50) NOT NULL,
            played_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_matches_player1 ON matches(player1_playfab_id);
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_matches_player2 ON matches(player2_playfab_id);
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(played_at DESC);
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique_pair
        ON matches (LEAST(player1_playfab_id, player2_playfab_id), GREATEST(player1_playfab_id, player2_playfab_id));
    `);
    console.log("[DB] Ensured matches table exists");
    // weekly_player_stats: one row per player per calendar week, incremented in place
    // on each win - same idea as player_stats.games_won (a real counter) but scoped
    // to the week, so weekly leaderboard reads are a direct indexed lookup/sort
    // instead of a COUNT/GROUP BY over an ever-growing event log.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS weekly_player_stats (
            playfab_id VARCHAR(50) NOT NULL REFERENCES players(playfab_id) ON DELETE CASCADE,
            week_start TIMESTAMPTZ NOT NULL,
            wins INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (playfab_id, week_start)
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_weekly_player_stats_week_wins
        ON weekly_player_stats(week_start, wins DESC);
    `);
    console.log("[DB] Ensured weekly_player_stats table exists");
}
export default pool;
// postgresql://postgres:IYEHQTZzGipzGSVGnSJiqAHfNKFgiRNI@roundhouse.proxy.rlwy.net:27562/railway
// If your Colyseus server is also on Railway, use the Internal URL (it's faster and free).
//  If you are testing from your local PC, make sure you use the Public URL.
