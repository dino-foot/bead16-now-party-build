import { Router } from "express";
import { MatchHistoryService } from "../services/MatchHistoryService.js";
import { PlayerService } from "../services/PlayerService.js";
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
// POST /api/player/:playfabId/vip - grant/revoke VIP chat-room access. Client calls this
// right after its own IAP purchase succeeds or its own rewarded-ad reward callback fires
// (same trust model as the existing /api/stats/update: client asserts, server persists).
router.post("/:playfabId/vip", async (req, res) => {
    try {
        const { playfabId } = req.params;
        const { isVip, source } = req.body || {};
        if (!playfabId) {
            res.status(400).json({ error: "playfabId is required" });
            return;
        }
        if (typeof isVip !== "boolean") {
            res.status(400).json({ error: "isVip (boolean) is required" });
            return;
        }
        const updated = await PlayerService.setVip(playfabId, isVip);
        if (!updated) {
            res.status(404).json({ error: "Player not found" });
            return;
        }
        console.log(`[PLAYER] VIP ${isVip ? "granted" : "revoked"} for ${playfabId} (source: ${source || "unknown"})`);
        res.json({ success: true, isVip });
    }
    catch (error) {
        console.error("[PLAYER] VIP update error:", error);
        res.status(500).json({ error: error.message || "Failed to update VIP status" });
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
