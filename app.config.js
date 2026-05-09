import { defineServer, defineRoom, monitor, playground, createRouter, createEndpoint, LobbyRoom, auth, matchMaker, } from "colyseus";
import { Bead16QueueRoom } from "./rooms/Bead16QueueRoom.js";
import basicAuth from "express-basic-auth";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { reservePrivateRoom, joinPrivateRoom, getPrivateRoomStatus, } from "./routes/privateRoom.js";
/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
import { MAX_CLIENTS, MAX_PLAYERS } from "./rooms/Constants/Global.js";
import express from "express";
const basicAuthMiddleware = basicAuth({
    // list of users and passwords
    users: {
        "admin": "shohan4556",
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
            maxWaitingCycles: 20,
        }).filterBy(['entryFee', 'gameId']),
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
                version: "0.1.8",
                timestamp: new Date().toISOString(),
                versionInfo: {
                    "releaseNote": "Private Room | Queue Room"
                }
            };
        })
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
        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.SAMPLE !== "production") {
            app.use("/", playground());
            // simulate 200ms latency between server and client.
            // server.simulateLatency(200);
        }
        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());
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
    }
});
export default server;
