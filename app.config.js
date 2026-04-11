import {
    defineServer, defineRoom, monitor, playground, createRouter, createEndpoint, LobbyRoom,
    // QueueRoom,
    auth, matchMaker,
} from "colyseus";
import { Bead16QueueRoom } from "./rooms/Bead16QueueRoom.js";
import basicAuth from "express-basic-auth";
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
                version: "0.1.0",
                timestamp: new Date().toISOString(),
                versionInfo: {
                    "releaseNote": "dummy match improved \n reconnect logic added"
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
            server.simulateLatency(200);
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
                // Query for rooms that aren't private
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
