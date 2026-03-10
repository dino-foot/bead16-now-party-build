import { QueueRoom } from "@colyseus/core";
export class Bead16QueueRoom extends QueueRoom {
    constructor() {
        super(...arguments);
        this.maxClients = 1000;
    }
}
