import pool from "../db/db.js";
// npx tsx src/scripts/seed-debug-players.ts
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
async function seed() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const debugId of DEBUG_PLAYER_IDS) {
            const result = await client.query(`INSERT INTO matches (player1_playfab_id, player2_playfab_id)
                 VALUES ($1, $2)
                 ON CONFLICT (LEAST(player1_playfab_id, player2_playfab_id), GREATEST(player1_playfab_id, player2_playfab_id))
                 DO UPDATE SET played_at = NOW()
                 RETURNING id`, [YOUR_PLAYFAB_ID, debugId]);
            if (result.rowCount && result.rowCount > 0) {
                console.log(`Inserted match (${YOUR_PLAYFAB_ID} vs ${debugId}) — id: ${result.rows[0].id}`);
            }
            else {
                console.log(`Match already exists (${YOUR_PLAYFAB_ID} vs ${debugId})`);
            }
        }
        await client.query("COMMIT");
        console.log("Done — all match records inserted.");
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("Failed to seed matches:", err);
        process.exit(1);
    }
    finally {
        client.release();
        await pool.end();
    }
}
seed();
