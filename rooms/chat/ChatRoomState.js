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
        this.userId = "";
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
], ChatUser.prototype, "userId", void 0);
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
export class ChatRoomState extends Schema {
    constructor() {
        super(...arguments);
        this.roomCategory = "";
        this.roomLabel = "";
        this.users = new ArraySchema();
        this.userCount = 0;
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
], ChatRoomState.prototype, "users", void 0);
__decorate([
    type("int32")
], ChatRoomState.prototype, "userCount", void 0);
