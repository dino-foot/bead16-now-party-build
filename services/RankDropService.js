import pool from "../db/db.js";
import { PushNotificationService } from "./PushNotificationService.js";
export class RankDropService {
    /**
     * Scans the top 100 of the *current* weekly leaderboard - plus anyone whose
     * last recorded rank was still top 100 even if they've since fallen further
     * out (the `last_known_rank <= 100` half of the WHERE) - and pushes a
     * "you got passed" notification to anyone whose rank got numerically worse
     * since the last scan. Runs every ~15-20 min via the cron in index.ts, NOT
     * on match end, since a rank drop is usually caused by someone else's win,
     * not the affected player's own action - matching the periodic-scan pattern
     * used by WeeklyResetService rather than a write-path hook in PlayerService.
     *
     * First-time-seen players (last_known_rank IS NULL) only get their baseline
     * rank recorded here, never a notification - there's nothing to compare
     * against yet, and firing on first sight would be a false "drop".
     *
     * Debounce: at most one notification per player per UTC calendar day. Once
     * last_notified_date is today, further drops the same day just refresh
     * last_known_rank silently so the next comparison uses the freshest
     * position, without re-notifying.
     */
    static async checkRankDrops() {
        const client = await pool.connect();
        const toNotify = [];
        try {
            await client.query("BEGIN");
            // The RANK()::int cast matters: RANK() returns bigint, which node-pg
            // hands back as a string - comparing those with `>` in JS would be a
            // lexicographic string compare (e.g. "9" > "100"), not numeric.
            const { rows } = await client.query(`
                WITH ranked AS (
                    SELECT
                        w.playfab_id,
                        w.last_known_rank,
                        w.last_notified_date = (NOW() AT TIME ZONE 'UTC')::date AS already_notified_today,
                        (RANK() OVER (ORDER BY w.wins DESC))::int AS current_rank
                    FROM weekly_player_stats w
                    WHERE w.week_start = date_trunc('week', NOW())
                )
                SELECT * FROM ranked
                WHERE current_rank <= 100 OR last_known_rank <= 100
            `);
            for (const row of rows) {
                const { playfab_id: playfabId, current_rank: currentRank, last_known_rank: lastKnownRank } = row;
                if (lastKnownRank === null) {
                    // First time we've ever scanned this player this week - seed the
                    // baseline only, no notification (nothing to compare against yet).
                    await client.query(`UPDATE weekly_player_stats
                         SET last_known_rank = $1
                         WHERE playfab_id = $2 AND week_start = date_trunc('week', NOW())`, [currentRank, playfabId]);
                    continue;
                }
                const droppedSinceLastScan = currentRank > lastKnownRank;
                if (droppedSinceLastScan && !row.already_notified_today) {
                    toNotify.push({ playfabId, oldRank: lastKnownRank, newRank: currentRank });
                    await client.query(`UPDATE weekly_player_stats
                         SET last_known_rank = $1, last_notified_date = (NOW() AT TIME ZONE 'UTC')::date
                         WHERE playfab_id = $2 AND week_start = date_trunc('week', NOW())`, [currentRank, playfabId]);
                }
                else {
                    // Either improved/unchanged, or dropped again but already notified
                    // today - still refresh last_known_rank so the next comparison is
                    // against the latest position, not a stale one from before the
                    // debounce kicked in.
                    await client.query(`UPDATE weekly_player_stats
                         SET last_known_rank = $1
                         WHERE playfab_id = $2 AND week_start = date_trunc('week', NOW())`, [currentRank, playfabId]);
                }
            }
            await client.query("COMMIT");
        }
        catch (err) {
            await client.query("ROLLBACK");
            console.error("[RankDrop] Scan failed:", err);
            throw err;
        }
        finally {
            client.release();
        }
        if (toNotify.length === 0) {
            console.log("[RankDrop] Scan complete, no drops to notify.");
            return;
        }
        console.log(`[RankDrop] Notifying ${toNotify.length} player(s) of a weekly rank drop.`);
        // Push sends happen after commit - same reasoning as WeeklyResetService: a
        // slow/failed network call shouldn't hold the transaction/lock open, and the
        // last_known_rank/last_notified_date bookkeeping above is already durable
        // either way. Tradeoff: if a send fails here, that player is still marked
        // notified for today and won't be retried until tomorrow's first drop -
        // acceptable for a retention nudge.
        for (const player of toNotify) {
            try {
                await PushNotificationService.sendRankDroppedNotification(player.playfabId, player.oldRank, player.newRank);
            }
            catch (err) {
                console.error(`[RankDrop] Failed to notify ${player.playfabId}:`, err);
            }
        }
    }
}
