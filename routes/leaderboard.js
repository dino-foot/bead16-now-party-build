import { Router } from "express";
import { LeaderboardService } from "../services/LeaderboardService.js";
const router = Router();
function parseMetric(value) {
    return value === "coins" ? "coins" : "wins";
}
// GET /api/leaderboard/countries - list of countries with at least one player,
// used to populate the client-side country picker dropdown.
router.get("/countries", async (req, res) => {
    try {
        const countries = await LeaderboardService.getAvailableCountries();
        res.json({ success: true, countries });
    }
    catch (error) {
        console.error("[LEADERBOARD] Countries error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch country list" });
    }
});
// GET /api/leaderboard/global?type=wins|coins&limit=&offset=&playfabId= - ranked leaderboard
// across all players, optionally including the requesting player's own rank.
router.get("/global", async (req, res) => {
    try {
        const metric = parseMetric(req.query.type);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const playfabId = req.query.playfabId;
        const [leaderboard, currentPlayer] = await Promise.all([
            LeaderboardService.getGlobalLeaderboard(metric, Math.min(limit, 100), Math.max(offset, 0)),
            playfabId ? LeaderboardService.getPlayerGlobalRank(playfabId, metric) : Promise.resolve(null),
        ]);
        res.json({ success: true, type: metric, leaderboard, currentPlayer });
    }
    catch (error) {
        console.error("[LEADERBOARD] Global leaderboard error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch leaderboard" });
    }
});
// GET /api/leaderboard/weekly?limit=&offset=&playfabId= - ranked leaderboard of wins in the
// last 7 days, optionally including the requesting player's own rank (null if they have no
// wins in that window).
router.get("/weekly", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const playfabId = req.query.playfabId;
        const [leaderboard, currentPlayer] = await Promise.all([
            LeaderboardService.getWeeklyWinsLeaderboard(Math.min(limit, 100), Math.max(offset, 0)),
            playfabId ? LeaderboardService.getPlayerWeeklyRank(playfabId) : Promise.resolve(null),
        ]);
        res.json({ success: true, type: "wins", leaderboard, currentPlayer });
    }
    catch (error) {
        console.error("[LEADERBOARD] Weekly leaderboard error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch leaderboard" });
    }
});
// GET /api/leaderboard/country/:countryCode?type=wins|coins&limit=&offset=&playfabId= - ranked
// leaderboard for one country, optionally including the requesting player's own rank.
router.get("/country/:countryCode", async (req, res) => {
    try {
        const { countryCode } = req.params;
        const metric = parseMetric(req.query.type);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const playfabId = req.query.playfabId;
        if (!countryCode) {
            res.status(400).json({ error: "countryCode is required" });
            return;
        }
        const code = countryCode.toUpperCase();
        const [leaderboard, currentPlayer] = await Promise.all([
            LeaderboardService.getCountryLeaderboard(code, metric, Math.min(limit, 100), Math.max(offset, 0)),
            playfabId ? LeaderboardService.getPlayerCountryRank(playfabId, code, metric) : Promise.resolve(null),
        ]);
        res.json({ success: true, country: code, type: metric, leaderboard, currentPlayer });
    }
    catch (error) {
        console.error("[LEADERBOARD] Country leaderboard error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch leaderboard" });
    }
});
export default router;
