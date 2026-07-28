import { BaseHandler } from "./BaseHandler.js";
export class SeatHandler extends BaseHandler {
    setup() {
        this.room.onMessage("TAKE_SEAT", (client, data) => {
            const seatIndex = data?.seatIndex;
            if (typeof seatIndex !== "number" || !Number.isInteger(seatIndex))
                return;
            if (seatIndex < 0 || seatIndex >= this.room.state.seats.length)
                return;
            const seat = this.room.state.seats[seatIndex];
            if (seat.occupied) {
                client.send("SEAT_TAKEN_ERROR", { seatIndex });
                return;
            }
            const user = this.room.state.roomPlayers.find((u) => u.sessionId === client.sessionId);
            if (!user)
                return;
            // Only one seat per client - free any seat this client already holds first.
            this.freeSeatFor(client.sessionId);
            seat.occupied = true;
            seat.sessionId = user.sessionId;
            seat.userId = user.playfabId;
            seat.name = user.name;
            seat.avatarUrl = user.avatarUrl;
        });
        this.room.onMessage("LEAVE_SEAT", (client) => {
            this.freeSeatFor(client.sessionId);
        });
    }
    onLeave(client) {
        this.freeSeatFor(client.sessionId);
    }
    freeSeatFor(sessionId) {
        const seat = this.room.state.seats.find((s) => s.sessionId === sessionId);
        if (!seat)
            return;
        seat.occupied = false;
        seat.sessionId = "";
        seat.userId = "";
        seat.name = "";
        seat.avatarUrl = "";
    }
}
