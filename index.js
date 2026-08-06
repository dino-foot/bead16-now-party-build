/**
 * IMPORTANT:
 * ---------
 * Do not manually edit this file if you'd like to host your server on Colyseus Cloud
 *
 * If you're self-hosting, you can see "Raw usage" from the documentation.
 *
 * See: https://docs.colyseus.io/server
 */
import { listen } from "@colyseus/tools";
import cron from "node-cron";
// Import Colyseus config
import app from "./app.config.js";
import { precreateChatRooms } from "./rooms/chat/startup.js";
import { ENABLE_CHATROOM } from "./rooms/Constants/Global.js";
import { initializeFirebase } from "./services/firebase.js";
import { WeeklyResetService } from "./services/WeeklyResetService.js";
import { RankDropService } from "./services/RankDropService.js";
initializeFirebase();
//? create database tables on startup (fcm_tokens, players, player_stats, invitations)
// ensureTablesExist().catch(err => console.error("[DB] Table creation error:", err));
// Pays out the top 3 winners of the week that just ended (see WeeklyResetService for
// amounts) and pushes them a notification. Runs Monday 00:05 UTC - the 5-minute buffer
// avoids any race with the date_trunc('week', ...) boundary that getWeeklyWinsLeaderboard's
// live query rolls over on.
cron.schedule("5 0 * * 1", () => {
    WeeklyResetService.runWeeklyReset().catch(err => console.error("[WeeklyReset] Scheduled run failed:", err));
}, { timezone: "UTC" });
// Same idea as the wins reset above, but for the weekly supports leaderboard - offset by 10
// minutes so the two jobs don't race against each other over the same weekly_player_stats
// rows.
cron.schedule("15 0 * * 1", () => {
    WeeklyResetService.runWeeklySupportsReset().catch(err => console.error("[WeeklySupportsReset] Scheduled run failed:", err));
}, { timezone: "UTC" });
// Scans the top 100 of the live weekly leaderboard for players whose rank got
// worse since the last scan (because other players won matches) and nudges them
// back with a push - runs every 3 hours rather than on match end, matching the
// periodic-scan pattern used by the weekly reset job above. UTC keeps the cron's
// notion of "today" aligned with the DATE-typed last_notified_date column, which
// is also computed in UTC (see RankDropService).
cron.schedule("0 */6 * * *", () => {
    RankDropService.checkRankDrops().catch(err => console.error("[RankDrop] Scheduled run failed:", err));
}, { timezone: "UTC" });
// Create and listen on 2567 (or PORT environment variable.)
listen(app).then(() => {
    if (ENABLE_CHATROOM) {
        precreateChatRooms();
    }
});
