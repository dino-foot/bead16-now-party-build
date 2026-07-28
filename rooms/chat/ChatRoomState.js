var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type, ArraySchema } from "@colyseus/schema";
export class ChatUser extends Schema {
    constructor() {
        super(...arguments);
        this.sessionId = "";
        this.playfabId = "";
        this.name = "";
        this.country = "";
        this.avatarUrl = "";
        this.isOnline = true;
    }
}
__decorate([
    type("string")
], ChatUser.prototype, "sessionId", void 0);
__decorate([
    type("string")
], ChatUser.prototype, "playfabId", void 0);
__decorate([
    type("string")
], ChatUser.prototype, "name", void 0);
__decorate([
    type("string")
], ChatUser.prototype, "country", void 0);
__decorate([
    type("string")
], ChatUser.prototype, "avatarUrl", void 0);
__decorate([
    type("boolean")
], ChatUser.prototype, "isOnline", void 0);
// A voice-party host/speaker slot. VIP rooms are seeded with exactly 9 of
// these on creation (see ChatRoom.onCreate); non-VIP rooms leave `seats`
// empty, which the client also uses as its signal for "this room has voice".
export class Seat extends Schema {
    constructor() {
        super(...arguments);
        this.seatIndex = 0;
        this.occupied = false;
        this.sessionId = "";
        this.userId = "";
        this.name = "";
        this.avatarUrl = "";
    }
}
__decorate([
    type("int32")
], Seat.prototype, "seatIndex", void 0);
__decorate([
    type("boolean")
], Seat.prototype, "occupied", void 0);
__decorate([
    type("string")
], Seat.prototype, "sessionId", void 0);
__decorate([
    type("string")
], Seat.prototype, "userId", void 0);
__decorate([
    type("string")
], Seat.prototype, "name", void 0);
__decorate([
    type("string")
], Seat.prototype, "avatarUrl", void 0);
export class ChatRoomState extends Schema {
    constructor() {
        super(...arguments);
        this.roomCategory = "";
        this.roomLabel = "";
        this.roomPlayers = new ArraySchema();
        this.userCount = 0;
        this.seats = new ArraySchema();
    }
}
__decorate([
    type("string")
], ChatRoomState.prototype, "roomCategory", void 0);
__decorate([
    type("string")
], ChatRoomState.prototype, "roomLabel", void 0);
__decorate([
    type([ChatUser])
], ChatRoomState.prototype, "roomPlayers", void 0);
__decorate([
    type("int32")
], ChatRoomState.prototype, "userCount", void 0);
__decorate([
    type([Seat])
], ChatRoomState.prototype, "seats", void 0);
