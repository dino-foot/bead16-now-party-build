import pool from "../db/db.js";
function rowToEntry(row, rank) {
    const gamesPlayed = row.games_played || 0;
    const gamesWon = row.games_won || 0;
    return {
        rank,
        playfabId: row.playfab_id,
        playerName: row.player_name || "Guest",
        country: row.country,
        avatarId: row.avatar_id || 0,
        avatarUrl: row.avatar_url || null,
        level: row.level,
        gamesPlayed,
        gamesWon,
        winRate: gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
        coins: row.coins || 0,
        supports: row.supports || 0,
    };
}
export class LeaderboardService {
    /**
     * Distinct list of countries that have at least one player, with a player count each.
     * Used to populate the client-side country dropdown.
     */
    static async getAvailableCountries() {
        const result = await pool.query(`
            SELECT country, COUNT(*)::int AS player_count
            FROM players
            WHERE country IS NOT NULL AND country <> ''
            GROUP BY country
            ORDER BY country ASC
        `);
        return result.rows.map(row => ({
            country: row.country,
            playerCount: row.player_count,
        }));
    }
    /**
     * Ranked leaderboard for a single country, sorted by lifetime games_won or coins.
     */
    static async getCountryLeaderboard(country, metric = "wins", limit = 50, offset = 0) {
        const orderBy = metric === "coins"
            ? `COALESCE(s.coins, 0) DESC`
            : `COALESCE(s.games_won, 0) DESC,
               CASE WHEN COALESCE(s.games_played, 0) > 0
                    THEN COALESCE(s.games_won, 0)::float / s.games_played
                    ELSE 0 END DESC`;
        const result = await pool.query(`
            SELECT
                p.playfab_id,
                p.player_name,
                p.country,
                p.avatar_id,
                p.avatar_url,
                COALESCE(s.level, 1) AS level,
                COALESCE(s.games_played, 0) AS games_played,
                COALESCE(s.games_won, 0) AS games_won,
                COALESCE(s.coins, 0) AS coins,
                COALESCE(s.supports, 0) AS supports
            FROM players p
            LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
            WHERE p.country = $1
            ORDER BY ${orderBy}
            LIMIT $2 OFFSET $3
        `, [country, limit, offset]);
        return result.rows.map((row, index) => rowToEntry(row, offset + index + 1));
    }
    /**
     * Ranked leaderboard across all players (no country filter), sorted by
     * lifetime games_won or coins.
     */
    static async getGlobalLeaderboard(metric = "wins", limit = 50, offset = 0) {
        const orderBy = metric === "coins"
            ? `COALESCE(s.coins, 0) DESC`
            : `COALESCE(s.games_won, 0) DESC,
               CASE WHEN COALESCE(s.games_played, 0) > 0
                    THEN COALESCE(s.games_won, 0)::float / s.games_played
                    ELSE 0 END DESC`;
        const result = await pool.query(`
            SELECT
                p.playfab_id,
                p.player_name,
                p.country,
                p.avatar_id,
                p.avatar_url,
                COALESCE(s.level, 1) AS level,
                COALESCE(s.games_played, 0) AS games_played,
                COALESCE(s.games_won, 0) AS games_won,
                COALESCE(s.coins, 0) AS coins,
                COALESCE(s.supports, 0) AS supports
            FROM players p
            LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
            ORDER BY ${orderBy}
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        return result.rows.map((row, index) => rowToEntry(row, offset + index + 1));
    }
    /**
     * Ranked leaderboard of wins in the current calendar week, sourced from
     * weekly_player_stats - a real per-player-per-week counter (incremented in
     * PlayerService.updateStats), not a derived COUNT over an event log. Since
     * date_trunc('week', ...) is Monday-anchored, each new week's rows simply don't
     * exist yet, so this self-resets at each week boundary with no cron needed for
     * the live view - see WeeklyResetService for the separate Monday reward job that
     * runs against the week that just ended.
     */
    static async getWeeklyWinsLeaderboard(limit = 50, offset = 0) {
        const result = await pool.query(`
            SELECT
                p.playfab_id,
                p.player_name,
                p.country,
                p.avatar_id,
                p.avatar_url,
                COALESCE(s.level, 1) AS level,
                COALESCE(s.games_played, 0) AS games_played,
                COALESCE(s.games_won, 0) AS games_won,
                COALESCE(s.coins, 0) AS coins,
                COALESCE(s.supports, 0) AS supports,
                w.wins AS period_wins
            FROM weekly_player_stats w
            JOIN players p ON p.playfab_id = w.playfab_id
            LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
            WHERE w.week_start = date_trunc('week', NOW())
            ORDER BY w.wins DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        return result.rows.map((row, index) => ({
            ...rowToEntry(row, offset + index + 1),
            periodWins: row.period_wins || 0,
        }));
    }
    /**
     * Ranked leaderboard of supports (likes/thumbs-up) received in the current calendar
     * week, sourced from weekly_player_stats.supports - same self-resetting-per-week
     * mechanism as getWeeklyWinsLeaderboard, just ordered by supports instead of wins.
     * See WeeklyResetService.runWeeklySupportsReset for the Monday reward job.
     */
    static async getWeeklySupportsLeaderboard(limit = 50, offset = 0) {
        const result = await pool.query(`
            SELECT
                p.playfab_id,
                p.player_name,
                p.country,
                p.avatar_id,
                p.avatar_url,
                COALESCE(s.level, 1) AS level,
                COALESCE(s.games_played, 0) AS games_played,
                COALESCE(s.games_won, 0) AS games_won,
                COALESCE(s.coins, 0) AS coins,
                COALESCE(s.supports, 0) AS supports,
                w.supports AS period_supports
            FROM weekly_player_stats w
            JOIN players p ON p.playfab_id = w.playfab_id
            LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
            WHERE w.week_start = date_trunc('week', NOW())
            ORDER BY w.supports DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        return result.rows.map((row, index) => ({
            ...rowToEntry(row, offset + index + 1),
            periodSupports: row.period_supports || 0,
        }));
    }
    /**
     * A single player's rank among all players, for the "you are #—" pinned row.
     * Same base set/ordering as getGlobalLeaderboard, so ranks line up with that list.
     */
    static async getPlayerGlobalRank(playfabId, metric = "wins") {
        const orderBy = metric === "coins"
            ? `COALESCE(s.coins, 0) DESC`
            : `COALESCE(s.games_won, 0) DESC,
               CASE WHEN COALESCE(s.games_played, 0) > 0
                    THEN COALESCE(s.games_won, 0)::float / s.games_played
                    ELSE 0 END DESC`;
        const result = await pool.query(`
            WITH ranked AS (
                SELECT
                    p.playfab_id,
                    p.player_name,
                    p.country,
                    p.avatar_id,
                    p.avatar_url,
                    COALESCE(s.level, 1) AS level,
                    COALESCE(s.games_played, 0) AS games_played,
                    COALESCE(s.games_won, 0) AS games_won,
                    COALESCE(s.coins, 0) AS coins,
                    COALESCE(s.supports, 0) AS supports,
                    RANK() OVER (ORDER BY ${orderBy}) AS rank
                FROM players p
                LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
            )
            SELECT * FROM ranked WHERE playfab_id = $1
        `, [playfabId]);
        if (result.rowCount === 0)
            return null;
        return rowToEntry(result.rows[0], result.rows[0].rank);
    }
    /**
     * A single player's rank within their own country, for the "you are #—" pinned row.
     * Same base set/ordering as getCountryLeaderboard.
     */
    static async getPlayerCountryRank(playfabId, country, metric = "wins") {
        const orderBy = metric === "coins"
            ? `COALESCE(s.coins, 0) DESC`
            : `COALESCE(s.games_won, 0) DESC,
               CASE WHEN COALESCE(s.games_played, 0) > 0
                    THEN COALESCE(s.games_won, 0)::float / s.games_played
                    ELSE 0 END DESC`;
        const result = await pool.query(`
            WITH ranked AS (
                SELECT
                    p.playfab_id,
                    p.player_name,
                    p.country,
                    p.avatar_id,
                    p.avatar_url,
                    COALESCE(s.level, 1) AS level,
                    COALESCE(s.games_played, 0) AS games_played,
                    COALESCE(s.games_won, 0) AS games_won,
                    COALESCE(s.coins, 0) AS coins,
                    COALESCE(s.supports, 0) AS supports,
                    RANK() OVER (ORDER BY ${orderBy}) AS rank
                FROM players p
                LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
                WHERE p.country = $2
            )
            SELECT * FROM ranked WHERE playfab_id = $1
        `, [playfabId, country]);
        if (result.rowCount === 0)
            return null;
        return rowToEntry(result.rows[0], result.rows[0].rank);
    }
    /**
     * A single player's rank among players with >=1 win in the current calendar week, for the
     * "you are #—" pinned row. Same base set/ordering as getWeeklyWinsLeaderboard -
     * returns null if the player has no wins this week (no meaningful rank).
     */
    static async getPlayerWeeklyRank(playfabId) {
        const result = await pool.query(`
            WITH ranked AS (
                SELECT
                    p.playfab_id,
                    p.player_name,
                    p.country,
                    p.avatar_id,
                    p.avatar_url,
                    COALESCE(s.level, 1) AS level,
                    COALESCE(s.games_played, 0) AS games_played,
                    COALESCE(s.games_won, 0) AS games_won,
                    COALESCE(s.coins, 0) AS coins,
                    COALESCE(s.supports, 0) AS supports,
                    w.wins AS period_wins,
                    RANK() OVER (ORDER BY w.wins DESC) AS rank
                FROM weekly_player_stats w
                JOIN players p ON p.playfab_id = w.playfab_id
                LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
                WHERE w.week_start = date_trunc('week', NOW())
            )
            SELECT * FROM ranked WHERE playfab_id = $1
        `, [playfabId]);
        if (result.rowCount === 0)
            return null;
        const row = result.rows[0];
        return { ...rowToEntry(row, row.rank), periodWins: row.period_wins || 0 };
    }
    /**
     * A single player's rank among players with >=1 support received in the current
     * calendar week, for the "you are #—" pinned row. Same base set/ordering as
     * getWeeklySupportsLeaderboard - returns null if the player has received no
     * supports this week.
     */
    static async getPlayerWeeklySupportsRank(playfabId) {
        const result = await pool.query(`
            WITH ranked AS (
                SELECT
                    p.playfab_id,
                    p.player_name,
                    p.country,
                    p.avatar_id,
                    p.avatar_url,
                    COALESCE(s.level, 1) AS level,
                    COALESCE(s.games_played, 0) AS games_played,
                    COALESCE(s.games_won, 0) AS games_won,
                    COALESCE(s.coins, 0) AS coins,
                    COALESCE(s.supports, 0) AS supports,
                    w.supports AS period_supports,
                    RANK() OVER (ORDER BY w.supports DESC) AS rank
                FROM weekly_player_stats w
                JOIN players p ON p.playfab_id = w.playfab_id
                LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
                WHERE w.week_start = date_trunc('week', NOW())
            )
            SELECT * FROM ranked WHERE playfab_id = $1
        `, [playfabId]);
        if (result.rowCount === 0)
            return null;
        const row = result.rows[0];
        return { ...rowToEntry(row, row.rank), periodSupports: row.period_supports || 0 };
    }
}
