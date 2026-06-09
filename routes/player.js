import { Router } from "express";
import { MatchHistoryService } from "../services/MatchHistoryService.js";
import pool from "../db/db.js";
const router = Router();
router.get("/recent/:playfabId", async (req, res) => {
    try {
        const { playfabId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        if (!playfabId) {
            res.status(400).json({ error: "playfabId is required" });
            return;
        }
        const players = await MatchHistoryService.getRecentPlayers(playfabId, Math.min(limit, 100));
        res.json({ success: true, players });
    }
    catch (error) {
        console.error("[PLAYER] Recent players error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch recent players" });
    }
});
router.get("/profile/:playfabId", async (req, res) => {
    try {
        const { playfabId } = req.params;
        if (!playfabId) {
            res.status(400).json({ error: "playfabId is required" });
            return;
        }
        const player = await MatchHistoryService.getPlayerProfile(playfabId);
        if (!player) {
            res.status(404).json({ error: "Player not found" });
            return;
        }
        res.json({ success: true, player });
    }
    catch (error) {
        console.error("[PLAYER] Profile error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch player profile" });
    }
});
router.delete("/:playfabId", async (req, res) => {
    try {
        const { playfabId } = req.params;
        if (!playfabId) {
            res.status(400).json({ error: "playfabId is required" });
            return;
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("DELETE FROM fcm_tokens WHERE playfab_id = $1", [playfabId]);
            await client.query("DELETE FROM invitations WHERE sender_playfab_id = $1 OR recipient_playfab_id = $1", [playfabId]);
            await client.query("DELETE FROM matches WHERE player1_playfab_id = $1 OR player2_playfab_id = $1", [playfabId]);
            const result = await client.query("DELETE FROM players WHERE playfab_id = $1", [playfabId]);
            await client.query("COMMIT");
            if (result.rowCount === 0) {
                res.status(404).json({ error: "Player not found" });
                return;
            }
            res.json({ success: true });
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error("[PLAYER] Delete error:", error);
        res.status(500).json({ error: error.message || "Failed to delete player" });
    }
});
export default router;
