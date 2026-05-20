import { Room } from "@colyseus/core";
import { ChatRoomState, ChatUser } from "./ChatRoomState.js";
import { getChatRoomConfig } from "./ChatRoomConfig.js";
import { MessageHandler } from "./handlers/MessageHandler.js";
import { EmojiHandler } from "./handlers/EmojiHandler.js";
import { PluginManager } from "./plugins/PluginManager.js";
import { MiniGamePlugin } from "./plugins/MiniGamePlugin.js";
// import { VoicePartyPlugin } from "./plugins/VoicePartyPlugin.js";
export class ChatRoom extends Room {
    constructor() {
        super(...arguments);
        this.maxClients = 100;
        this.autoDispose = false;
    }
    async onCreate(options) {
        const category = options.roomCategory;
        const config = getChatRoomConfig(category);
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
        }
        this.setMetadata({ roomCategory: this.state.roomCategory });
        this.pluginManager = new PluginManager();
        this.messageHandler = new MessageHandler(this);
        this.emojiHandler = new EmojiHandler(this);
        this.messageHandler.setup();
        this.emojiHandler.setup();
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
    onJoin(client, options) {
        if (this.state.users.length >= this.maxClients) {
            client.send("ROOM_FULL", { message: "Room is full" });
            client.leave();
            return;
        }
        const user = new ChatUser();
        user.sessionId = client.sessionId;
        user.userId = options.userId || client.sessionId;
        user.name = options.name || `Guest_${client.sessionId.substring(0, 4)}`;
        user.country = options.country || "";
        user.avatarUrl = options.avatarUrl || "";
        user.isOnline = true;
        this.state.users.push(user);
        this.state.userCount = this.state.users.length;
        this.broadcast("USER_JOINED", {
            sessionId: user.sessionId,
            userId: user.userId,
            name: user.name,
            country: user.country,
            avatarUrl: user.avatarUrl,
        });
        this.messageHandler.sendHistory(client);
        this.pluginManager.onUserJoin(this, client, options);
        console.log(`[CHAT] ${user.name} joined ${this.state.roomLabel}`);
    }
    onLeave(client, code) {
        const user = this.state.users.find((u) => u.sessionId === client.sessionId);
        if (!user)
            return;
        const idx = this.state.users.indexOf(user);
        user.isOnline = false;
        this.state.users.splice(idx, 1);
        this.state.userCount = this.state.users.length;
        this.broadcast("USER_LEFT", {
            sessionId: user.sessionId,
            userId: user.userId,
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
