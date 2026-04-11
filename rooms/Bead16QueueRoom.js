import { QueueRoom } from "@colyseus/core";
export class Bead16QueueRoom extends QueueRoom {
    constructor() {
        super(...arguments);
        this.maxClients = 2; // Only 2 players allowed per queue group
        // async onJoin(client: Client, options: any) {
        //     console.log(`${options.playfabId} joined the queue.`);
        // }
    }
}
