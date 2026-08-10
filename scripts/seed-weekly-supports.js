import pool from "../db/db.js";
// npx tsx src/scripts/seed-weekly-supports.ts
const YOUR_PLAYFAB_ID = "1FF85D56C0DE7EC8";
const DEBUG_PLAYER_IDS = [
    "EF9092DD4426FBD1",
    "4B415D0ACB4DB0C",
    "3F610EE7630EE5E1",
    "26AE6BCCF86F26C1",
    "15D4107AE7C5E421",
    "716AC5D2DB572DBB",
    "91C57C62DD20E5AB",
    "F789950ADF5EFC90",
    "157A68ED62E588F4"
];
// Descending spread (not all equal) so the seeded weekly-supports leaderboard has a clear,
// distinct rank order to test pagination/rank display against instead of a tie.
const SUPPORT_COUNTS = {
    [YOUR_PLAYFAB_ID]: 9,
    "EF9092DD4426FBD1": 8,
    "4B415D0ACB4DB0C": 7,
    "3F610EE7630EE5E1": 6,
    "26AE6BCCF86F26C1": 5,
    "15D4107AE7C5E421": 4,
    "716AC5D2DB572DBB": 3,
    "91C57C62DD20E5AB": 2,
    "F789950ADF5EFC90": 1,
    "157A68ED62E588F4": 5,
};
async function seed() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows: [{ week_start: weekStart }] } = await client.query(`SELECT date_trunc('week', NOW()) AS week_start`);
        for (const [playfabId, supports] of Object.entries(SUPPORT_COUNTS)) {
            // weekly_player_stats/player_stats both FK to players - skip ids that were
            // never actually logged in (PlayerService.handleLogin is what creates that row).
            const playerExists = await client.query(`SELECT 1 FROM players WHERE playfab_id = $1`, [playfabId]);
            if (playerExists.rowCount === 0) {
                console.log(`Skipped ${playfabId} - no players row (never logged in).`);
                continue;
            }
            // Sets (not increments) the weekly counter - re-running this script always
            // lands on the same seeded value instead of growing it every run. Only
            // touches supports/updated_at so an existing row's real wins aren't clobbered.
            await client.query(`INSERT INTO weekly_player_stats (playfab_id, week_start, supports)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (playfab_id, week_start)
                 DO UPDATE SET supports = $3, updated_at = NOW()`, [playfabId, weekStart, supports]);
            // Mirror onto the lifetime counter too (same column MatchSupportService.setSupport increments).
            await client.query(`UPDATE player_stats SET supports = $2, updated_at = NOW() WHERE playfab_id = $1`, [playfabId, supports]);
            console.log(`Seeded ${playfabId}: ${supports} supports (week starting ${weekStart.toISOString()})`);
        }
        await client.query("COMMIT");
        console.log("Done — weekly supports leaderboard seeded.");
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("Failed to seed weekly supports:", err);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
seed();
