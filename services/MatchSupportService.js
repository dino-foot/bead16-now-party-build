import pool from "../db/db.js";
export class MatchSupportService {
    /**
     * Records a spectator's support (like/thumbs-up) of a match participant, idempotently.
     * A spectator gets exactly one support per match (not per target) - the UNIQUE
     * constraint on (match_id, supporter_playfab_id) is what makes a duplicate call (e.g.
     * a retried message after a reconnect) a safe no-op instead of double-counting. This is
     * the durable backstop behind MyRoom's in-memory per-room Set check, which handles the
     * common case without a DB round trip but is lost if the room restarts.
     *
     * Returns false if the support was already recorded for this (match, supporter) pair.
     */
    static async recordSupport(matchId, supporterPlayfabId, targetPlayfabId) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const inserted = await client.query(`INSERT INTO match_supports (match_id, supporter_playfab_id, target_playfab_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (match_id, supporter_playfab_id) DO NOTHING
                 RETURNING id`, [matchId, supporterPlayfabId, targetPlayfabId]);
            if (inserted.rowCount === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            await client.query(`UPDATE player_stats SET supports = supports + 1, updated_at = NOW() WHERE playfab_id = $1`, [targetPlayfabId]);
            // Bump this week's counter so the weekly supports leaderboard is a direct read,
            // same idea as the wins counter bumped in PlayerService.updateStats.
            await client.query(`INSERT INTO weekly_player_stats (playfab_id, week_start, supports, updated_at)
                 VALUES ($1, date_trunc('week', NOW()), 1, NOW())
                 ON CONFLICT (playfab_id, week_start)
                 DO UPDATE SET supports = weekly_player_stats.supports + 1, updated_at = NOW()`, [targetPlayfabId]);
            await client.query("COMMIT");
            return true;
        }
        catch (err) {
            await client.query("ROLLBACK");
            console.error(`[MatchSupport] Failed to record support (${matchId}, ${supporterPlayfabId} -> ${targetPlayfabId}):`, err);
            return false;
        }
        finally {
            client.release();
        }
    }
}
