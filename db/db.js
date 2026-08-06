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
            is_vip BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );
    `);
    // Backfills is_vip on databases where players already existed before this was added.
    await pool.query(`
        ALTER TABLE players ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;
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
    // Cumulative lifetime support (like/thumbs-up) count, credited to a match's target
    // player whenever a spectator supports them (see match_supports below). Backfilled on
    // top of the existing table the same way is_vip was, since CREATE TABLE IF NOT EXISTS
    // is a no-op on databases that already have player_stats.
    await pool.query(`
        ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS supports INTEGER NOT NULL DEFAULT 0;
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
    // Same per-player-per-week counter idea as wins above, but for supports received -
    // piggybacks on this table (rather than a new one) so it gets the same free
    // weekly reset with no extra cleanup code, and the same (playfab_id, week_start)
    // row is reused for both counters.
    await pool.query(`
        ALTER TABLE weekly_player_stats ADD COLUMN IF NOT EXISTS supports INTEGER NOT NULL DEFAULT 0;
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_weekly_player_stats_week_supports
        ON weekly_player_stats(week_start, supports DESC);
    `);
    console.log("[DB] Ensured weekly_player_stats table exists");
    // Rank-drop tracking columns, added on top of the existing weekly_player_stats
    // table rather than a new one - rank only ever needs comparing within the
    // *current* week, and this table already gets fresh rows each week, so piggy-
    // backing here gives the tracker a free weekly reset with no extra cleanup code.
    //
    // last_known_rank: the rank RankDropService saw this player at on its last scan.
    // NULL means "never scanned yet" - used to seed a baseline silently instead of
    // firing a false "drop" the first time a player is picked up.
    //
    // last_notified_date: UTC calendar date of the last rank-drop push sent to this
    // player, used to enforce the once-per-day debounce.
    await pool.query(`
        ALTER TABLE weekly_player_stats ADD COLUMN IF NOT EXISTS last_known_rank INTEGER;
    `);
    await pool.query(`
        ALTER TABLE weekly_player_stats ADD COLUMN IF NOT EXISTS last_notified_date DATE;
    `);
    console.log("[DB] Ensured weekly_player_stats rank-drop tracking columns exist");
    // chatroom_config: admin-editable metadata for the predefined lobby chat
    // rooms (cover image, join-lock thresholds) - lets these change without a
    // server redeploy, unlike the old hardcoded CHAT_ROOMS array.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chatroom_config (
            category VARCHAR(50) PRIMARY KEY,
            label VARCHAR(100) NOT NULL,
            cover_image_url TEXT,
            iso_code VARCHAR(10),
            required_level INTEGER NOT NULL DEFAULT 0,
            required_coins INTEGER NOT NULL DEFAULT 0,
            max_clients INTEGER NOT NULL DEFAULT 100,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_vip BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    // Backfills columns on databases where chatroom_config already existed
    // before these were added (CREATE TABLE IF NOT EXISTS above is a no-op there).
    await pool.query(`
        ALTER TABLE chatroom_config ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;
    `);
    await pool.query(`
        ALTER TABLE chatroom_config ADD COLUMN IF NOT EXISTS iso_code VARCHAR(10);
    `);
    console.log("[DB] Ensured chatroom_config table exists");
    // match_supports: durable record of a spectator supporting (liking/thumbs-up) a player
    // during a match. A spectator gets exactly one support *per match* (not per target),
    // which is what the UNIQUE constraint on (match_id, supporter_playfab_id) enforces -
    // it's the backstop behind the room's in-memory Set check (MyRoom's
    // setupSupportHandler), covering reconnects or a room restart where the in-memory
    // state would otherwise be lost.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS match_supports (
            id SERIAL PRIMARY KEY,
            match_id VARCHAR(50) NOT NULL,
            supporter_playfab_id VARCHAR(50) NOT NULL,
            target_playfab_id VARCHAR(50) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (match_id, supporter_playfab_id)
        );
    `);
    console.log("[DB] Ensured match_supports table exists");
    // match_transactions: ledger of currency movements MatchWalletService applies for a
    // match (ENTRY_FEE at match start, PAYOUT to the winner, REFUND split on a draw). The
    // UNIQUE constraint on (match_id, playfab_id, type) is what makes applyLedgerEntry
    // idempotent - a crash/retry after the row is COMPLETE short-circuits instead of
    // double-charging or double-paying the same player for the same match.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS match_transactions (
            id SERIAL PRIMARY KEY,
            match_id VARCHAR(50) NOT NULL,
            playfab_id VARCHAR(50) NOT NULL,
            type VARCHAR(20) NOT NULL,
            amount INTEGER NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            UNIQUE (match_id, playfab_id, type)
        );
    `);
    console.log("[DB] Ensured match_transactions table exists");
    await pool.query(`
        INSERT INTO chatroom_config (category, label, iso_code, required_level, required_coins, max_clients, sort_order)
        VALUES
            ('NEW_COMER', 'New Comer', NULL, 0, 0, 100, 0),
            ('PK', 'Pakistan', 'PAK', 0, 0, 100, 1),
            ('BD', 'Bangladesh', 'BGD', 0, 0, 100, 2),
            ('VIP', 'VIP', 'GL', 0, 0, 200, 3),
            ('INDIA', 'India', 'IND', 0, 0, 100, 4),
            ('SAUDI ARABIA', 'SAUDI ARABIA', 'SA', 0, 0, 100, 5)
        ON CONFLICT (category) DO NOTHING;
    `);
    console.log("[DB] Seeded default chatroom_config rows");
}
export default pool;
// postgresql://postgres:IYEHQTZzGipzGSVGnSJiqAHfNKFgiRNI@roundhouse.proxy.rlwy.net:27562/railway
// If your Colyseus server is also on Railway, use the Internal URL (it's faster and free).
//  If you are testing from your local PC, make sure you use the Public URL.
