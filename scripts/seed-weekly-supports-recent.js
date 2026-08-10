import pool from "../db/db.js";
// npx tsx src/scripts/seed-weekly-supports-recent.ts
// Seeds the weekly supports leaderboard using the 50 most recently logged-in real
// players (players.last_login), instead of a fixed debug id list - useful for testing
// the leaderboard/reward job against a realistic, currently-active player set.
const PLAYER_LIMIT = 50;
const MIN_SUPPORTS = 1;
const MAX_SUPPORTS = 100;
function randomSupportCount() {
    return Math.floor(Math.random() * (MAX_SUPPORTS - MIN_SUPPORTS + 1)) + MIN_SUPPORTS;
}
async function seed() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows: [{ week_start: weekStart }] } = await client.query(`SELECT date_trunc('week', NOW()) AS week_start`);
        const { rows: players } = await client.query(`SELECT playfab_id FROM players ORDER BY last_login DESC NULLS LAST LIMIT $1`, [PLAYER_LIMIT]);
        if (players.length === 0) {
            console.log("No players found - nothing to seed.");
            await client.query("COMMIT");
            return;
        }
        for (const { playfab_id: playfabId } of players) {
            const supports = randomSupportCount();
            // Sets (not increments) the weekly counter - re-running this script re-randomizes
            // rather than growing counts unboundedly. Only touches supports/updated_at so an
            // existing row's real wins aren't clobbered.
            await client.query(`INSERT INTO weekly_player_stats (playfab_id, week_start, supports)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (playfab_id, week_start)
                 DO UPDATE SET supports = $3, updated_at = NOW()`, [playfabId, weekStart, supports]);
            // Mirror onto the lifetime counter too (same column MatchSupportService.setSupport increments).
            await client.query(`UPDATE player_stats SET supports = $2, updated_at = NOW() WHERE playfab_id = $1`, [playfabId, supports]);
            console.log(`Seeded ${playfabId}: ${supports} supports (week starting ${weekStart.toISOString()})`);
        }
        await client.query("COMMIT");
        console.log(`Done — seeded weekly supports for ${players.length} recently logged-in players.`);
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
