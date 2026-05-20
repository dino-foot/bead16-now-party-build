import { QueueRoom, matchMaker } from "@colyseus/core";
export class Bead16QueueRoom extends QueueRoom {
    constructor() {
        super(...arguments);
        this.maxClients = 200;
    }
    async onCreate(options) {
        await super.onCreate(options);
        console.log("[QUEUE] Bead16QueueRoom created");
        this.compare = () => true;
        this.onGroupReady = async (group) => {
            if (group.clients.length < this.maxPlayers) {
                console.log(`[QUEUE] Incomplete group (${group.clients.length}/${this.maxPlayers}), starting dummy match`);
                for (const client of group.clients) {
                    client.send("START_DUMMY_MATCH", { reason: "timeout" });
                    this.clock.setTimeout(() => {
                        if (this.clients.includes(client)) {
                            client.leave();
                        }
                    }, 2000);
                }
                throw new Error("dummy_match"); //? fk we need this for graceful handling of dummy matches in the client
            }
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
    }
}
