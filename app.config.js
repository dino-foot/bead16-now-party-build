import {
    defineServer, defineRoom, monitor, playground, createRouter, createEndpoint, LobbyRoom,
    // QueueRoom,
    auth, matchMaker,
} from "colyseus";
import { Bead16QueueRoom } from "./rooms/Bead16QueueRoom.js";
import basicAuth from "express-basic-auth";
import { WebSocketTransport } from "@colyseus/ws-transport";
/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom.js";
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
            maxPlayers: 2
        }),
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
                version: "0.1.2",
                timestamp: new Date().toISOString(),
                versionInfo: {
                    "releaseNote": "chat and nodejs version 22.22"
                }
            };
        })
    }),
    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        app.use(auth.prefix, auth.routes());
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
                    private: false // Ensure they aren't hidden
                });
                // Filter out rooms where clients >= 8 (2 players + 6 spectators)
                // we cant set 1 player as spectators cause we will run dummy multiplayer for them
                const joinableRooms = rooms.filter(room => room.clients >= 2 &&
                    room.clients < 8 &&
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
