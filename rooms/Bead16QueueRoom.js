import { QueueRoom, matchMaker } from "@colyseus/core";
import { DUMMY_PLAYER_TIME_MS } from "./Constants/Global.js";
export class Bead16QueueRoom extends QueueRoom {
    constructor() {
        super(...arguments);
        this.maxClients = 200;
        this.dummyTimers = new Map();
    }
    async onCreate(options) {
        await super.onCreate(options);
        console.log("[QUEUE] Bead16QueueRoom created");
        this.compare = () => true;
        this.onGroupReady = async (group) => {
            const firstClientOptions = group.clients[0].userData.options;
            console.log(`[QUEUE] Match found! Group size: ${group.clients.length}`);
            return matchMaker.createRoom(this.matchRoomName, {
                entryFee: firstClientOptions?.entryFee,
                gameId: firstClientOptions?.gameId,
            });
        };
    }
    onJoin(client, options) {
        options.rank = options.rank ?? 0;
        super.onJoin(client, options, undefined);
        const playfabId = options?.playfabId ?? "Unknown";
        console.log(`[QUEUE] ${playfabId} joined (fee: ${options?.entryFee}, game: ${options?.gameId})`);
        const timer = this.clock.setTimeout(() => {
            const queueData = client.userData;
            if (queueData?.group?.ready)
                return;
            if (this.clients.includes(client)) {
                console.log(`[QUEUE] ${playfabId} timeout, starting dummy match`);
                client.send("START_DUMMY_MATCH", { reason: "timeout" });
                this.dummyTimers.delete(client.sessionId);
                this.clock.setTimeout(() => {
                    if (this.clients.includes(client)) {
                        client.leave();
                    }
                }, 2000);
            }
        }, DUMMY_PLAYER_TIME_MS);
        this.dummyTimers.set(client.sessionId, timer);
    }
    onLeave(client, code) {
        const timer = this.dummyTimers.get(client.sessionId);
        if (timer) {
            timer.clear();
            this.dummyTimers.delete(client.sessionId);
        }
    }
    onDispose() {
        this.dummyTimers.forEach((timer) => timer.clear());
        this.dummyTimers.clear();
    }
}
