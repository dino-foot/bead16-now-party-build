import pool from "../db/db.js";
// npx tsx src/scripts/backfill-weekly-stats.ts
//
// Seeds weekly_player_stats for the current calendar week using 20 real players
// pulled from player_stats (highest games_won first), so the weekly leaderboard has
// data to render while testing - no fake players/accounts involved.
const PLAYER_COUNT = 10;
async function backfill() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows: players } = await client.query(`SELECT playfab_id FROM player_stats ORDER BY games_won DESC LIMIT $1`, [PLAYER_COUNT]);
        if (players.length === 0) {
            console.log("No players found in player_stats - nothing to backfill.");
            await client.query("ROLLBACK");
            return;
        }
        for (const { playfab_id } of players) {
            const wins = Math.floor(Math.random() * 30) + 1; // 1-30 wins this week
            await client.query(`INSERT INTO weekly_player_stats (playfab_id, week_start, wins, updated_at)
                 VALUES ($1, date_trunc('week', NOW()), $2, NOW())
                 ON CONFLICT (playfab_id, week_start) DO UPDATE SET
                     wins = EXCLUDED.wins,
                     updated_at = NOW()`, [playfab_id, wins]);
            console.log(`Backfilled ${playfab_id} — ${wins} wins this week`);
        }
        await client.query("COMMIT");
        console.log(`Done — ${players.length} weekly_player_stats rows backfilled for the current week.`);
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("Failed to backfill weekly stats:", err);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
backfill();
