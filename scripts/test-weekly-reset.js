import pool from "../db/db.js";
import { WeeklyResetService } from "../services/WeeklyResetService.js";
// SELECT
//     p.playfab_id,
//     p.player_name,
//     p.country,
//     ps.level,
//     ps.exp,
//     ps.coins,
//     ps.games_played,
//     ps.games_won,
//     w.week_start,
//     w.wins AS weekly_wins
// FROM players p
// JOIN player_stats ps ON ps.playfab_id = p.playfab_id
// LEFT JOIN weekly_player_stats w ON w.playfab_id = p.playfab_id
// WHERE p.playfab_id = 'FE6D3140B2D35A30'
// ORDER BY w.week_start DESC;
//? require pre-existing players data in the table
//? SELECT * FROM player_stats WHERE playfab_id = 'FE6D3140B2D35A30';
//? npx tsx src/scripts/test-weekly-reset.ts
//
// Exercises WeeklyResetService.runWeeklyReset() on demand, without waiting for the
// real Monday 00:05 cron in index.ts. runWeeklyReset() always rewards the week that
// ended (week_start = date_trunc('week', NOW()) - 7 days), so this backfills these
// players into THAT week first, then runs the reset immediately.
//
// Edit DEBUG_PLAYER_IDS below to point at whichever accounts you want to test with -
// these get real coins credited in Postgres, real currency granted via PlayFab (see
// PlayFabService, called inside runWeeklyReset - PlayFab is the app's source of truth
// for the balance shown on login), and a real push notification sent. Players must
// already exist (this script doesn't create players/player_stats rows).
const DEBUG_PLAYER_IDS = [
    "FE6D3140B2D35A30"
];
async function testReset() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const [i, playfabId] of DEBUG_PLAYER_IDS.entries()) {
            const wins = DEBUG_PLAYER_IDS.length - i; // distinct win counts so rank 1/2/3 are unambiguous
            await client.query(`INSERT INTO weekly_player_stats (playfab_id, week_start, wins, updated_at)
                 VALUES ($1, date_trunc('week', NOW()) - INTERVAL '7 days', $2, NOW())
                 ON CONFLICT (playfab_id, week_start) DO UPDATE SET
                     wins = EXCLUDED.wins,
                     updated_at = NOW()`, [playfabId, wins]);
            console.log(`Seeded last week's stats for ${playfabId} — ${wins} wins`);
        }
        await client.query("COMMIT");
        console.log("\nRunning WeeklyResetService.runWeeklyReset()...\n");
        await WeeklyResetService.runWeeklyReset();
        console.log("\nDone - check player_stats.coins AND the players' PlayFab balance (Game Manager or in-app login) for the debug players above, and server logs for PlayFab grant / push notification attempts.");
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("Failed to seed test data:", err);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
testReset();
