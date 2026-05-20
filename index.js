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
// Import Colyseus config
import app from "./app.config.js";
import { precreateChatRooms } from "./rooms/chat/startup.js";
import { ENABLE_CHATROOM } from "./rooms/Constants/Global.js";
import { initializeFirebase } from "./services/firebase.js";
initializeFirebase();
// create database tables on startup (fcm_tokens, players, player_stats, invitations)
// ensureTablesExist().catch(err => console.error("[DB] Table creation error:", err));
// Create and listen on 2567 (or PORT environment variable.)
listen(app).then(() => {
    if (ENABLE_CHATROOM) {
        precreateChatRooms();
    }
});
