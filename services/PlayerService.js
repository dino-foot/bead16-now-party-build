import pool from "../db/db.js";
// payload example
// {
//   "playfab_id": "001",
//   "player_name": "shohan-name3",
//   "avatar_id": 4,
//   "avatar_url": "my-updated-url3",
//   "country": "IN",
//   "level": 2,
//   "exp": 200,
//   "coins": 12000,
//   "games_played": 10,
//   "games_won": 5
// }
export class PlayerService {
    static async handleLogin(data) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 1. Upsert Identity
            // Don't overwrite avatar_url with null/empty to preserve uploads
            await client.query(`
                INSERT INTO players (playfab_id, player_name, country, avatar_id, avatar_url)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (playfab_id) DO UPDATE SET
                    player_name = COALESCE(NULLIF(EXCLUDED.player_name, ''), players.player_name),
                    country = COALESCE(NULLIF(EXCLUDED.country, ''), players.country),
                    avatar_url = CASE WHEN EXCLUDED.avatar_url IS NOT NULL AND EXCLUDED.avatar_url != ''
                                     THEN EXCLUDED.avatar_url ELSE players.avatar_url END,
                    avatar_id = COALESCE(EXCLUDED.avatar_id, players.avatar_id),
                    last_login = CURRENT_TIMESTAMP; 
            `, [data.playfab_id, data.player_name, data.country, data.avatar_id, data.avatar_url]);
            // 2. Ensure Stats exist
            // Matches columns: playfab_id, level, exp, coins, games_played, games_won
            await client.query(`
                INSERT INTO player_stats (playfab_id, level, exp, coins, games_played, games_won)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (playfab_id) DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP;
            `, [data.playfab_id, data.level, data.exp, data.coins, data.games_played, data.games_won]);
            await client.query('COMMIT');
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    static async updateStats(data) {
        const updates = [];
        const values = [];
        let idx = 1;
        const columns = {
            "level": "INTEGER",
            "exp": "INTEGER",
            "coins": "INTEGER",
            "games_played": "INTEGER",
            "games_won": "INTEGER",
        };
        for (const [col, colType] of Object.entries(columns)) {
            const hasAbsolute = data[col] !== undefined;
            const hasIncrement = data.increment && data.increment[col] !== undefined;
            if (hasAbsolute && hasIncrement) {
                // Cast both params so PostgreSQL can resolve the + operator
                updates.push(`${col} = $${idx}::${colType} + $${idx + 1}::${colType}`);
                values.push(data[col]);
                values.push(data.increment[col]);
                idx += 2;
            }
            else if (hasAbsolute) {
                updates.push(`${col} = $${idx}`);
                values.push(data[col]);
                idx++;
            }
            else if (hasIncrement) {
                updates.push(`${col} = ${col} + $${idx}`);
                values.push(data.increment[col]);
                idx++;
            }
        }
        if (updates.length === 0) {
            throw new Error("No fields to update");
        }
        updates.push("updated_at = CURRENT_TIMESTAMP");
        values.push(data.playfab_id);
        const result = await pool.query(`UPDATE player_stats SET ${updates.join(", ")} WHERE playfab_id = $${idx} RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new Error("Player stats not found");
        }
        return result.rows[0];
    }
}
