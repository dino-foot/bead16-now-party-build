import { defineServer, defineRoom, monitor, playground, createRouter, createEndpoint, LobbyRoom, auth, matchMaker, } from "colyseus";
import { Bead16QueueRoom } from "./rooms/Bead16QueueRoom.js";
import { ChatRoom } from "./rooms/chat/ChatRoom.js";
import basicAuth from "express-basic-auth";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { reservePrivateRoom, joinPrivateRoom, getPrivateRoomStatus, } from "./routes/privateRoom.js";
import { dashboardHandler } from "./routes/dashboard.js";
import { playgroundPage } from "./routes/playground.js";
import playerRoutes from "./routes/player.js";
import leaderboardRoutes from "./routes/leaderboard.js";
/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
import { MAX_CLIENTS, MAX_PLAYERS, ENABLE_CHATROOM } from "./rooms/Constants/Global.js";
import { CHAT_ROOM_NAME } from "./rooms/chat/ChatRoomConfig.js";
import { ChatRoomConfigService } from "./services/ChatRoomConfigService.js";
import express from "express";
import { PlayerService } from "./services/PlayerService.js";
import { generateAvatarUploadUrl, confirmAvatar, generateAvatarReadUrl } from "./services/AvatarService.js";
import { uploadChatRoomCover, generateChatRoomCoverReadUrl } from "./services/ChatRoomCoverService.js";
import { PushNotificationService, PushNotificationType } from "./services/PushNotificationService.js";
import { InviteService } from "./services/InviteService.js";
const basicAuthMiddleware = basicAuth({
    // list of users and passwords
    users: {
        "shohan": "shohan4556",
    },
    // sends WWW-Authenticate header, which will prompt the user to fill
    // credentials in
    challenge: true
});
const server = defineServer({
    transport: new WebSocketTransport({
        pingInterval: 5000,
        pingMaxRetries: 6,
        maxPayload: 1024 * 10, // 10KB Max Payload
    }),
    //? note
    // When you call setPrivate(true), the room is removed from the "Joinable" pool used by joinOrCreate. 
    // Only players who have the specific Room ID (the 4-digit code) can enter using joinById
    /**
     * Define your room handlers:
     */
    rooms: {
        my_room: defineRoom(MyRoom)
            .enableRealtimeListing()
            .filterBy(['entryFee', 'gameId', 'isFull']),
        lobby: defineRoom(LobbyRoom),
        queue: defineRoom(Bead16QueueRoom, {
            matchRoomName: "my_room",
            maxPlayers: 2,
            maxWaitingCycles: 10,
            allowIncompleteGroups: true,
        }).filterBy(['entryFee', 'gameId']),
        ...(ENABLE_CHATROOM ? {
            chat: defineRoom(ChatRoom)
                .enableRealtimeListing()
                .filterBy(['roomCategory']),
        } : {}),
    },
    /**
     * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
     *
     * Usage from SDK:
     *   client.http.get("/api/hello").then((response) => {})
     *
     */
    routes: createRouter({
        version: createEndpoint("/version", { method: "GET" }, async (ctx) => {
            return {
                version: "0.2.4",
                timestamp: new Date().toISOString(),
                versionInfo: {
                    "releaseNote": "chatroom"
                }
            };
        }),
        login: createEndpoint("/login", { method: "POST" }, async (ctx) => {
            try {
                const playerData = await PlayerService.handleLogin(ctx.body);
                return { success: true, player: playerData };
            }
            catch (error) {
                return { success: false, error: "Login failed" };
            }
        }),
    }),
    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        app.use(express.json());
        app.use(auth.prefix, auth.routes());
        //? ========== PRIVATE ROOM API (REST Polling) ==========
        // POST /api/private-room/reserve - P1 reserves a room code
        app.post("/api/private-room/reserve", async (req, res) => {
            try {
                console.log('reserver private room ', req.body);
                const { entryFee, gameId, player } = req.body;
                const roomData = await reservePrivateRoom(matchMaker.presence, { entryFee, gameId, player });
                res.json(roomData);
            }
            catch (error) {
                console.error("[PRIVATE ROOM] Reserve error:", error);
                res.status(500).json({ error: error.message || "Failed to reserve room" });
            }
        });
        // POST /api/private-room/join - P2 joins with room code and player data
        app.post("/api/private-room/join", async (req, res) => {
            try {
                const { roomCode, player } = req.body;
                const roomData = await joinPrivateRoom(matchMaker.presence, { roomCode, player });
                res.json(roomData);
            }
            catch (error) {
                console.error("[PRIVATE ROOM] Join error:", error);
                res.status(400).json({ error: error.message || "Failed to join room" });
            }
        });
        // GET /api/private-room/status/:roomCode - Poll room status (for P1/P2 to get colyseusRoomId)
        app.get("/api/private-room/status/:roomCode", async (req, res) => {
            try {
                const { roomCode } = req.params;
                const roomData = await getPrivateRoomStatus(matchMaker.presence, roomCode);
                if (!roomData) {
                    res.status(404).json({ error: "Room not found or expired" });
                    return;
                }
                res.json(roomData);
            }
            catch (error) {
                console.error("[PRIVATE ROOM] Status error:", error);
                res.status(500).json({ error: error.message || "Failed to get room status" });
            }
        });
        //? ========== GAME STATS API ==========
        // POST /api/stats/update - Update player stats
        app.post("/api/stats/update", async (req, res) => {
            try {
                const data = req.body;
                if (!data.playfab_id) {
                    res.status(400).json({ error: "playfab_id is required" });
                    return;
                }
                const updated = await PlayerService.updateStats(data);
                res.json({ success: true, stats: updated });
            }
            catch (error) {
                console.error("[STATS] Update error:", error);
                res.status(500).json({ error: error.message || "Failed to update stats" });
            }
        });
        //? ========== AVATAR UPLOAD API ==========
        // GET /api/avatar/upload-url?playfab_id=xxx&content_type=image/png
        app.get("/api/avatar/upload-url", async (req, res) => {
            try {
                const { playfab_id, content_type } = req.query;
                if (!playfab_id || typeof playfab_id !== "string") {
                    res.status(400).json({ error: "playfab_id query param is required" });
                    return;
                }
                const ct = (typeof content_type === "string" && content_type.startsWith("image/"))
                    ? content_type
                    : "image/png";
                const result = await generateAvatarUploadUrl(playfab_id, ct);
                // const baseUrl = `${req.protocol}://${req.get("host")}`;
                // res.json({ ...result, avatarUrl: `${baseUrl}${result.avatarUrl}` });
                res.json(result);
            }
            catch (error) {
                console.error("[AVATAR] Upload URL error:", error);
                res.status(500).json({ error: error.message || "Failed to generate upload URL" });
            }
        });
        // POST /api/avatar/confirm { playfab_id: "xxx" }
        app.post("/api/avatar/confirm", async (req, res) => {
            try {
                const { playfab_id } = req.body;
                if (!playfab_id) {
                    res.status(400).json({ error: "playfab_id is required" });
                    return;
                }
                const avatarUrl = await confirmAvatar(playfab_id);
                // const baseUrl = `${req.protocol}://${req.get("host")}`;
                // res.json({ success: true, avatar_url: `${baseUrl}${avatarUrl}` });
                res.json({ success: true, avatar_url: avatarUrl });
            }
            catch (error) {
                console.error("[AVATAR] Confirm error:", error);
                res.status(500).json({ error: error.message || "Failed to confirm avatar" });
            }
        });
        // GET /api/avatar/:playfabId — redirect to presigned S3 URL
        app.get("/api/avatar/:playfabId", async (req, res) => {
            try {
                const { playfabId } = req.params;
                if (!playfabId) {
                    res.status(400).json({ error: "playfabId is required" });
                    return;
                }
                const signedUrl = await generateAvatarReadUrl(playfabId);
                res.redirect(302, signedUrl);
            }
            catch (error) {
                console.error("[AVATAR] Read URL error:", error);
                res.status(500).json({ error: error.message || "Failed to serve avatar" });
            }
        });
        //? ========== FCM TOKEN API ==========
        // POST /api/fcm-token - Register or update an FCM device token
        app.post("/api/fcm-token", async (req, res) => {
            try {
                const { playfabId, token, platform } = req.body;
                if (!playfabId || !token) {
                    res.status(400).json({ error: "playfabId and token are required" });
                    return;
                }
                await PushNotificationService.registerToken(playfabId, token, platform);
                res.json({ success: true });
            }
            catch (error) {
                console.error("[FCM] Token registration error:", error);
                res.status(500).json({ error: error.message || "Failed to register token" });
            }
        });
        // DELETE /api/fcm-token - Remove an FCM device token (logout)
        // app.delete("/api/fcm-token", async (req, res) => {
        //     try {
        //         const { playfabId, token } = req.body;
        //         if (!playfabId || !token) {
        //             res.status(400).json({ error: "playfabId and token are required" });
        //             return;
        //         }
        //         await PushNotificationService.unregisterToken(playfabId, token);
        //         res.json({ success: true });
        //     } catch (error: any) {
        //         console.error("[FCM] Token removal error:", error);
        //         res.status(500).json({ error: error.message || "Failed to remove token" });
        //     }
        // });
        //? ========== PUSH NOTIFICATION API ==========
        // POST /api/push/message-notification - Send push notification for new message
        app.post("/api/push/message-notification", async (req, res) => {
            try {
                const { recipientPlayfabId, senderName, senderPlayfabId, type, roomCode, entryFee } = req.body;
                if (!recipientPlayfabId || !senderName || !senderPlayfabId) {
                    res.status(400).json({ error: "recipientPlayfabId, senderName, and senderPlayfabId are required" });
                    return;
                }
                const notificationType = typeof type === "number" ? type : (type ? parseInt(type, 10) : PushNotificationType.MessageNotification);
                const result = await PushNotificationService.sendMessageNotification(recipientPlayfabId, senderName, senderPlayfabId, notificationType, roomCode, entryFee !== undefined ? (typeof entryFee === "number" ? entryFee : parseInt(entryFee, 10)) : undefined);
                res.json(result);
            }
            catch (error) {
                console.error("[PUSH] Message notification error:", error);
                res.status(500).json({ error: error.message || "Failed to send notification" });
            }
        });
        //? ========== INVITATION API ==========
        // POST /api/invite - Create a private match invitation and send push notification
        app.post("/api/invite", async (req, res) => {
            try {
                const { senderPlayfabId, senderName, recipientPlayfabId, roomCode, entryFee } = req.body;
                // validate required fields
                if (!senderPlayfabId || !senderName || !recipientPlayfabId || !roomCode || entryFee === undefined) {
                    res.status(400).json({ error: "senderPlayfabId, senderName, recipientPlayfabId, roomCode, and entryFee are required" });
                    return;
                }
                const result = await InviteService.createInvite(senderPlayfabId, senderName, recipientPlayfabId, roomCode, entryFee);
                res.json(result);
            }
            catch (error) {
                console.error("[INVITE] Create invite error:", error);
                res.status(500).json({ error: error.message || "Failed to create invitation" });
            }
        });
        // GET /api/invite - Fetch pending invitations for a player (auto-deletes expired)
        app.get("/api/invite", async (req, res) => {
            try {
                const playfabId = req.query.playfabId;
                if (!playfabId) {
                    res.status(400).json({ error: "playfabId query parameter is required" });
                    return;
                }
                const result = await InviteService.getPendingInvitations(playfabId);
                res.json(result);
            }
            catch (error) {
                console.error("[INVITE] Fetch invitations error:", error);
                res.status(500).json({ error: error.message || "Failed to fetch invitations" });
            }
        });
        // POST /api/invite/:id/accept - Accept an invitation
        app.post("/api/invite/:id/accept", async (req, res) => {
            try {
                const id = parseInt(req.params.id, 10);
                const { playfabId } = req.body;
                if (!playfabId) {
                    res.status(400).json({ error: "playfabId is required" });
                    return;
                }
                const result = await InviteService.acceptInvite(id, playfabId);
                res.json(result);
            }
            catch (error) {
                console.error("[INVITE] Accept invite error:", error);
                res.status(500).json({ error: error.message || "Failed to accept invitation" });
            }
        });
        // POST /api/invite/:id/decline - Decline an invitation
        app.post("/api/invite/:id/decline", async (req, res) => {
            try {
                const id = parseInt(req.params.id, 10);
                const { playfabId } = req.body;
                if (!playfabId) {
                    res.status(400).json({ error: "playfabId is required" });
                    return;
                }
                const result = await InviteService.declineInvite(id, playfabId);
                res.json(result);
            }
            catch (error) {
                console.error("[INVITE] Decline invite error:", error);
                res.status(500).json({ error: error.message || "Failed to decline invitation" });
            }
        });
        //? ========== PLAYER ROUTES (Recent Players, Profile) ==========
        app.use("/api/player", playerRoutes);
        //? ========== LEADERBOARD ROUTES (Country dropdown + country-wise rankings) ==========
        app.use("/api/leaderboard", leaderboardRoutes);
        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.SAMPLE !== "production") {
            app.use("/colyseus", playground());
            app.get("/", playgroundPage);
        }
        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());
        /**
         * Player Dashboard - password-protected visual dashboard for DB data
         */
        app.get("/dashboard", basicAuthMiddleware, dashboardHandler);
        //? get spectator available rooms
        app.get("/viewers", async (req, res) => {
            try {
                //? Query for rooms that aren't private
                const rooms = await matchMaker.query({
                    name: "my_room", // Only show your game rooms
                    // private: false // Remove the 'private: true' constraint to get ALL rooms under this name
                });
                // Filter out rooms where clients >= 8 (2 players + 6 spectators)
                // we cant set 1 player as spectators cause we will run dummy multiplayer for them
                const joinableRooms = rooms.filter(room => room.clients >= MAX_PLAYERS &&
                    room.clients < MAX_CLIENTS &&
                    room.metadata?.isGameOver !== true);
                // Map to a clean JSON response for Unity
                const response = joinableRooms.map(room => ({
                    roomId: room.roomId,
                    clients: room.clients,
                    maxClients: room.maxClients,
                    title: "Welcome !",
                    metadata: room.metadata // Includes your entryFee and gameId
                }));
                res.json(response);
            }
            catch (e) {
                res.status(500).json({ error: "error 500" });
            }
        });
        //? predefined lobby chat rooms - public listing (category, label, cover image,
        //? lock thresholds, live online count) for the client's room-selection screen
        app.get("/api/chatrooms", async (req, res) => {
            try {
                const configs = await ChatRoomConfigService.getAllRoomConfigs(true);
                const liveRooms = await matchMaker.query({ name: CHAT_ROOM_NAME });
                const baseUrl = `${req.protocol}://${req.get("host")}`;
                const response = configs.map(config => {
                    const liveRoom = liveRooms.find(r => r.metadata?.roomCategory === config.category);
                    return {
                        category: config.category,
                        label: config.label,
                        coverImageUrl: config.coverImageUrl ? `${baseUrl}/api/chatrooms/${config.category}/cover` : null,
                        isoCode: config.isoCode,
                        requiredLevel: config.requiredLevel,
                        requiredCoins: config.requiredCoins,
                        maxClients: config.maxClients,
                        onlineCount: liveRoom?.clients ?? 0,
                        isVip: config.isVip,
                    };
                });
                res.json(response);
            }
            catch (e) {
                console.error("[CHAT] Failed to list chatrooms:", e);
                res.status(500).json({ error: "error 500" });
            }
        });
        //? admin-only: create a new predefined chat room. The single "chat" room type
        //? already handles any category via the roomCategory option/filter, so this is
        //? just a config row - no room-type registration needed for new categories.
        app.post("/api/chatrooms", basicAuthMiddleware, async (req, res) => {
            try {
                const { category, label, isoCode, requiredLevel, requiredCoins, maxClients, isVip } = req.body || {};
                if (!category || !label) {
                    res.status(400).json({ error: "category and label are required" });
                    return;
                }
                const created = await ChatRoomConfigService.createRoomConfig({
                    category: String(category),
                    label: String(label),
                    isoCode,
                    requiredLevel,
                    requiredCoins,
                    maxClients,
                    isVip,
                });
                res.json({ success: true, room: created });
            }
            catch (e) {
                console.error("[CHAT] Failed to create chatroom:", e);
                res.status(400).json({ error: e.message || "Failed to create chat room" });
            }
        });
        //? admin-only: edit a predefined chat room's label/cover image/lock thresholds
        //? without a redeploy. Reuses the same basic-auth credentials as /dashboard.
        app.patch("/api/chatrooms/:category", basicAuthMiddleware, async (req, res) => {
            try {
                const category = String(req.params.category);
                const { label, coverImageUrl, isoCode, requiredLevel, requiredCoins, isActive, isVip } = req.body || {};
                const updated = await ChatRoomConfigService.upsertRoomConfig(category, {
                    label,
                    coverImageUrl,
                    isoCode,
                    requiredLevel,
                    requiredCoins,
                    isActive,
                    isVip,
                });
                res.json({ success: true, room: updated });
            }
            catch (e) {
                console.error(`[CHAT] Failed to update chatroom ${req.params.category}:`, e);
                res.status(400).json({ error: e.message || "Failed to update chat room" });
            }
        });
        //? admin-only: upload a chat room's cover image directly (raw image bytes in the
        //? request body, e.g. `curl --data-binary @cover.jpg -H "Content-Type: image/jpeg"`).
        //? Resizes/compresses via sharp, stores it in the shared S3 bucket, and saves the
        //? resulting public URL onto the room's coverImageUrl in one call.
        app.post("/api/chatrooms/:category/cover", basicAuthMiddleware, express.raw({ type: "image/*", limit: "10mb" }), async (req, res) => {
            try {
                const category = String(req.params.category);
                if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                    res.status(400).json({ error: "Request body must be raw image bytes with an image/* Content-Type header" });
                    return;
                }
                const coverImageUrl = await uploadChatRoomCover(category, req.body);
                const updated = await ChatRoomConfigService.upsertRoomConfig(category, { coverImageUrl });
                res.json({ success: true, room: updated });
            }
            catch (e) {
                console.error(`[CHAT] Failed to upload cover for ${req.params.category}:`, e);
                res.status(400).json({ error: e.message || "Failed to upload chat room cover" });
            }
        });
        // GET /api/chatrooms/:category/cover — redirect to a presigned S3 read URL.
        // Public (no auth) since this just serves an image, same as /api/avatar/:playfabId.
        app.get("/api/chatrooms/:category/cover", async (req, res) => {
            try {
                const category = String(req.params.category);
                const signedUrl = await generateChatRoomCoverReadUrl(category);
                res.redirect(302, signedUrl);
            }
            catch (e) {
                console.error(`[CHAT] Failed to serve cover for ${req.params.category}:`, e);
                res.status(500).json({ error: "Failed to serve chat room cover" });
            }
        });
    }
});
export default server;
