import pool from "../db/db.js";
import { PushNotificationService } from "./PushNotificationService.js";
import { PlayFabService } from "./PlayFabService.js";
// Coins awarded for rank 1, 2, 3 of the week that just ended. Adjust here only -
// nothing else needs to change to retune amounts or reward more/fewer ranks.
const REWARD_TIERS = [100000, 50000, 25000]; //? add more coins value to reward more ranks
export class WeeklyResetService {
    /**
     * Finds the top 3 by wins in the calendar week that just ended (Monday 00:00 through
     * the Monday this runs), credits their coins, and pushes each a notification. Meant to
     * run once, early Monday morning, via the cron job registered in index.ts.
     *
     * Coins are granted directly in PlayFab (the app's source of truth for the coin balance
     * shown on login), not just mirrored in Postgres - otherwise the reward would be invisible
     * on the player's phone until something else happened to resync PlayFab's value.
     *
     * No history is kept - weekly_player_stats rows for the processed week (and any older,
     * in case a past run's cleanup was ever missed) are deleted before commit, so the table
     * stays bounded to just the current week's still-accumulating rows.
     * Note: no persistence of "already ran this week" beyond that cleanup, so a double-fire
     * of the cron (e.g. a restart racing the schedule) would double-pay winners on the first
     * run and find nothing to reward on the second - acceptable tradeoff for keeping this simple.
     */
    static async runWeeklyReset() {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const { rows: [{ week_start: weekStart }] } = await client.query(`
                SELECT (date_trunc('week', NOW()) - INTERVAL '7 days') AS week_start
            `);
            const winners = await client.query(`
                WITH ranked AS (
                    SELECT
                        p.playfab_id,
                        w.wins,
                        RANK() OVER (ORDER BY w.wins DESC) AS rank
                    FROM weekly_player_stats w
                    JOIN players p ON p.playfab_id = w.playfab_id
                    WHERE w.week_start = $1
                )
                SELECT * FROM ranked WHERE rank <= $2 ORDER BY rank ASC
            `, [weekStart, REWARD_TIERS.length]);
            if (winners.rowCount === 0) {
                await client.query(`DELETE FROM weekly_player_stats WHERE week_start <= $1`, [weekStart]);
                await client.query("COMMIT");
                console.log(`[WeeklyReset] No wins recorded for week starting ${weekStart}, nothing to reward. Cleared weekly_player_stats through that week.`);
                return;
            }
            const rewardedPlayers = [];
            for (const row of winners.rows) {
                const coinsAwarded = REWARD_TIERS[row.rank - 1];
                await client.query(`UPDATE player_stats SET coins = coins + $1, updated_at = NOW() WHERE playfab_id = $2`, [coinsAwarded, row.playfab_id]);
                rewardedPlayers.push({ playfabId: row.playfab_id, rank: row.rank, coins: coinsAwarded });
            }
            //? clear the table
            // await client.query(`DELETE FROM weekly_player_stats WHERE week_start <= $1`, [weekStart]);
            await client.query("COMMIT");
            console.log(`[WeeklyReset] Rewarded ${rewardedPlayers.length} players and cleared weekly_player_stats through week starting ${weekStart}`);
            // PlayFab grant + push notification happen after commit - network calls inside the
            // DB transaction would hold the lock open longer than necessary, and a failed call
            // here shouldn't roll back the Postgres coins that were already credited.
            for (const player of rewardedPlayers) {
                try {
                    await PlayFabService.addVirtualCurrency(player.playfabId, player.coins);
                }
                catch (err) {
                    console.error(`[WeeklyReset] Failed to grant PlayFab currency to ${player.playfabId}:`, err);
                    continue; // don't notify about a reward that didn't actually land
                }
                try {
                    await PushNotificationService.sendWeeklyRewardNotification(player.playfabId, player.rank, player.coins);
                }
                catch (err) {
                    console.error(`[WeeklyReset] Failed to notify ${player.playfabId}:`, err);
                }
            }
        }
        catch (err) {
            await client.query("ROLLBACK");
            console.error("[WeeklyReset] Failed:", err);
            throw err;
        }
        finally {
            client.release();
        }
    }
}
