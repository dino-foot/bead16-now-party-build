import pool from "../db/db.js";
export class MatchHistoryService {
    static async recordMatch(p1PlayfabId, p2PlayfabId) {
        const result = await pool.query(`
            INSERT INTO matches (player1_playfab_id, player2_playfab_id)
            VALUES ($1, $2)
            ON CONFLICT (LEAST(player1_playfab_id, player2_playfab_id), GREATEST(player1_playfab_id, player2_playfab_id))
            DO UPDATE SET played_at = NOW()
            RETURNING id
        `, [p1PlayfabId, p2PlayfabId]);
        return result.rows[0].id;
    }
    static async getRecentPlayers(playfabId, limit = 20) {
        const result = await pool.query(`
            SELECT
                CASE WHEN player1_playfab_id = $1 THEN player2_playfab_id ELSE player1_playfab_id END AS opponent_playfab_id,
                played_at
            FROM matches
            WHERE player1_playfab_id = $1 OR player2_playfab_id = $1
            ORDER BY played_at DESC
            LIMIT $2
        `, [playfabId, limit]);
        if (result.rows.length === 0)
            return [];
        const opponentIds = result.rows.map(r => r.opponent_playfab_id);
        const playersResult = await pool.query(`
            SELECT playfab_id, player_name AS name, avatar_id, avatar_url, country
            FROM players
            WHERE playfab_id = ANY($1::varchar[])
        `, [opponentIds]);
        const playerMap = new Map();
        for (const row of playersResult.rows) {
            playerMap.set(row.playfab_id, row);
        }
        return result.rows.map(row => {
            const p = playerMap.get(row.opponent_playfab_id) || {};
            return {
                playfabId: row.opponent_playfab_id,
                name: p.name || "Guest",
                avatarId: p.avatar_id || 0,
                avatarUrl: p.avatar_url || null,
                country: p.country || "GL",
                playedAt: row.played_at,
            };
        });
    }
    static async getPlayerProfile(playfabId) {
        const result = await pool.query(`
            SELECT
                p.playfab_id,
                p.player_name,
                p.country,
                p.avatar_id,
                p.avatar_url,
                p.is_vip,
                COALESCE(s.level, 1) AS level,
                COALESCE(s.exp, 0) AS exp,
                COALESCE(s.coins, 0) AS coins,
                COALESCE(s.games_played, 0) AS games_played,
                COALESCE(s.games_won, 0) AS games_won,
                COALESCE(s.supports, 0) AS supports
            FROM players p
            LEFT JOIN player_stats s ON p.playfab_id = s.playfab_id
            WHERE p.playfab_id = $1
        `, [playfabId]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        const gamesPlayed = row.games_played || 0;
        const gamesWon = row.games_won || 0;
        return {
            playfabId: row.playfab_id,
            playerName: row.player_name,
            country: row.country,
            avatarId: row.avatar_id,
            avatarUrl: row.avatar_url,
            isVip: row.is_vip,
            level: row.level,
            exp: row.exp,
            coins: row.coins,
            gamesPlayed,
            gamesWon,
            winRate: gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
            supports: row.supports || 0,
        };
    }
}
