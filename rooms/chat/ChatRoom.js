import { Room } from "@colyseus/core";
import { ChatRoomState, ChatUser, Seat } from "./ChatRoomState.js";
import { getChatRoomConfig } from "./ChatRoomConfig.js";
import { ChatRoomConfigService } from "../../services/ChatRoomConfigService.js";
import { PlayerService } from "../../services/PlayerService.js";
import { MessageHandler } from "./handlers/MessageHandler.js";
import { EmojiHandler } from "./handlers/EmojiHandler.js";
import { SeatHandler } from "./handlers/SeatHandler.js";
import { PluginManager } from "./plugins/PluginManager.js";
import { MiniGamePlugin } from "./plugins/MiniGamePlugin.js";
// import { VoicePartyPlugin } from "./plugins/VoicePartyPlugin.js";
export class ChatRoom extends Room {
    constructor() {
        super(...arguments);
        this.maxClients = 100;
        this.autoDispose = false;
        this.isVipRoom = false;
    }
    async onCreate(options) {
        const category = options.roomCategory;
        // DB-backed config (admin-editable) is the source of truth; fall back to
        // the static list, then to a bare "unknown category" room if neither has it.
        const dbConfig = await ChatRoomConfigService.getRoomConfig(category).catch((e) => {
            console.error(`[CHAT] Failed to load DB config for ${category}:`, e);
            return null;
        });
        const config = dbConfig || getChatRoomConfig(category);
        if (!config) {
            console.warn(`[CHAT] Unknown room category: ${category}`);
            this.state = new ChatRoomState();
            this.state.roomCategory = category || "UNKNOWN";
            this.state.roomLabel = options.roomLabel || category || "Unknown";
            this.maxClients = 50;
        }
        else {
            this.state = new ChatRoomState();
            this.state.roomCategory = config.category;
            this.state.roomLabel = config.label;
            this.maxClients = config.maxClients;
            this.isVipRoom = !!config.isVip;
        }
        // VIP rooms get 9 voice-party host/speaker seats, pre-seeded empty. Non-VIP
        // rooms keep `seats` empty - the client uses seats.length as its signal for
        // whether a room has a voice party at all.
        if (this.isVipRoom) {
            for (let i = 0; i < 9; i++) {
                const seat = new Seat();
                seat.seatIndex = i;
                this.state.seats.push(seat);
            }
        }
        this.setMetadata({ roomCategory: this.state.roomCategory });
        this.pluginManager = new PluginManager();
        this.messageHandler = new MessageHandler(this);
        this.emojiHandler = new EmojiHandler(this);
        this.seatHandler = new SeatHandler(this);
        this.messageHandler.setup();
        this.emojiHandler.setup();
        this.seatHandler.setup();
        this.pluginManager.register(new MiniGamePlugin());
        // this.pluginManager.register(new VoicePartyPlugin());
        this.onMessage("*", (client, type, data) => {
            if (typeof type !== "string")
                return;
            this.pluginManager.onMessage(this, client, type, data);
        });
        this.pluginManager.onRoomCreate(this, options);
        console.log(`[CHAT] Room created: ${this.state.roomLabel} (${this.state.roomCategory})`);
    }
    async onJoin(client, options) {
        if (this.state.roomPlayers.length >= this.maxClients) {
            client.send("ROOM_FULL", { message: "Room is full" });
            client.leave();
            return;
        }
        if (this.isVipRoom) {
            const hasVip = await PlayerService.isVip(options.userId).catch(() => false);
            if (!hasVip) {
                client.send("VIP_REQUIRED", { message: "VIP membership required to join this room" });
                client.leave();
                return;
            }
        }
        const user = new ChatUser();
        user.sessionId = client.sessionId;
        user.playfabId = options.userId || client.sessionId;
        user.name = options.name || `Guest_${client.sessionId.substring(0, 4)}`;
        user.country = options.country || "";
        user.avatarUrl = options.avatarUrl || "";
        user.isOnline = true;
        this.state.roomPlayers.push(user);
        this.state.userCount = this.state.roomPlayers.length;
        this.broadcast("USER_JOINED", {
            sessionId: user.sessionId,
            playfabId: user.playfabId,
            name: user.name,
            country: user.country,
            avatarUrl: user.avatarUrl,
        });
        this.messageHandler.sendHistory(client);
        this.pluginManager.onUserJoin(this, client, options);
        console.log(`[CHAT] ${user.name} joined ${this.state.roomLabel}`);
    }
    onLeave(client, code) {
        this.seatHandler.onLeave(client);
        const user = this.state.roomPlayers.find((u) => u.sessionId === client.sessionId);
        if (!user)
            return;
        const idx = this.state.roomPlayers.indexOf(user);
        user.isOnline = false;
        this.state.roomPlayers.splice(idx, 1);
        this.state.userCount = this.state.roomPlayers.length;
        this.broadcast("USER_LEFT", {
            sessionId: user.sessionId,
            playfabId: user.playfabId,
            name: user.name,
        });
        this.pluginManager.onUserLeave(this, client, code);
        console.log(`[CHAT] ${user.name} left ${this.state.roomLabel}`);
    }
    onDispose() {
        this.pluginManager.onRoomDispose(this);
        console.log(`[CHAT] Room disposed: ${this.state.roomLabel}`);
    }
}
