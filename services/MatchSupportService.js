import pool from "../db/db.js";
export class MatchSupportService {
    /**
     * Sets (or clears) a spectator's support (like/thumbs-up) target for this match.
     * match_supports holds at most one row per (match_id, supporter_playfab_id) - it
     * represents the supporter's CURRENT pick for this match, not an immutable log, so this
     * is a toggle/switch rather than a one-shot action:
     *   - no existing row + a target                -> first support (insert, +1 target)
     *   - existing row, same target requested again  -> un-support (delete, -1 old target)
     *   - existing row, different target requested   -> switch (update, -1 old / +1 new)
     * The `FOR UPDATE` row lock serializes concurrent duplicate clicks from the same
     * supporter once a row exists. Before that (the very first support), there's nothing
     * yet to lock, so two near-simultaneous first-time taps can both read "no row" and both
     * attempt to INSERT - the loser hits the UNIQUE constraint and is retried once (see
     * isRetry below), by which point the winner's row exists and it correctly falls into
     * the switch/toggle-off branch instead of being dropped.
     *
     * Returns null if the operation failed (caller should not touch the live schema).
     */
    static async setSupport(matchId, supporterPlayfabId, targetPlayfabId, isRetry = false) {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query(`SELECT target_playfab_id FROM match_supports
                 WHERE match_id = $1 AND supporter_playfab_id = $2
                 FOR UPDATE`, [matchId, supporterPlayfabId]);
            const previousTarget = existing.rows[0]?.target_playfab_id ?? null;
            let result;
            if (previousTarget === null) {
                // First support this match.
                await client.query(`INSERT INTO match_supports (match_id, supporter_playfab_id, target_playfab_id)
                     VALUES ($1, $2, $3)`, [matchId, supporterPlayfabId, targetPlayfabId]);
                await MatchSupportService.bumpSupportCounters(client, targetPlayfabId, 1);
                result = { previousTarget: null, newTarget: targetPlayfabId };
            }
            else if (previousTarget === targetPlayfabId) {
                // Tapped their current pick again - un-support.
                await client.query(`DELETE FROM match_supports WHERE match_id = $1 AND supporter_playfab_id = $2`, [matchId, supporterPlayfabId]);
                await MatchSupportService.bumpSupportCounters(client, previousTarget, -1);
                result = { previousTarget, newTarget: null };
            }
            else {
                // Switching to a different target.
                await client.query(`UPDATE match_supports SET target_playfab_id = $3
                     WHERE match_id = $1 AND supporter_playfab_id = $2`, [matchId, supporterPlayfabId, targetPlayfabId]);
                await MatchSupportService.bumpSupportCounters(client, previousTarget, -1);
                await MatchSupportService.bumpSupportCounters(client, targetPlayfabId, 1);
                result = { previousTarget, newTarget: targetPlayfabId };
            }
            await client.query("COMMIT");
            return result;
        }
        catch (err) {
            await client.query("ROLLBACK");
            // 23505 = unique_violation - two near-simultaneous first-time supports from the
            // same supporter both read "no row" before either committed. Retry once now that
            // the winner's row is visible; isRetry guards against retrying forever.
            if (!isRetry && err?.code === "23505") {
                return MatchSupportService.setSupport(matchId, supporterPlayfabId, targetPlayfabId, true);
            }
            console.error(`[MatchSupport] Failed to set support (${matchId}, ${supporterPlayfabId} -> ${targetPlayfabId}):`, err);
            return null;
        }
        finally {
            client.release();
        }
    }
    // delta is +1 (support gained) or -1 (support removed/moved away). GREATEST floors the
    // decrement at 0 so a rare double-decrement race can't push a counter negative.
    static async bumpSupportCounters(client, targetPlayfabId, delta) {
        await client.query(`UPDATE player_stats SET supports = GREATEST(supports + $1, 0), updated_at = NOW() WHERE playfab_id = $2`, [delta, targetPlayfabId]);
        if (delta > 0) {
            // Bump this week's counter so the weekly supports leaderboard is a direct read,
            // same idea as the wins counter bumped in PlayerService.updateStats.
            await client.query(`INSERT INTO weekly_player_stats (playfab_id, week_start, supports, updated_at)
                 VALUES ($1, date_trunc('week', NOW()), 1, NOW())
                 ON CONFLICT (playfab_id, week_start)
                 DO UPDATE SET supports = weekly_player_stats.supports + 1, updated_at = NOW()`, [targetPlayfabId]);
        }
        else {
            await client.query(`UPDATE weekly_player_stats SET supports = GREATEST(supports - 1, 0), updated_at = NOW()
                 WHERE playfab_id = $1 AND week_start = date_trunc('week', NOW())`, [targetPlayfabId]);
        }
    }
}
