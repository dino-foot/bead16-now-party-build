import { randomUUID } from "crypto";
const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;',
};
const HTML_ESCAPE_REGEX = /[&<>"'`/]/g;
function escapeHtml(str) {
    return str.replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_MAP[match]);
}
function sanitizeInput(str, maxLength) {
    return escapeHtml(str.trim().slice(0, maxLength));
}
function isValidMessageType(type) {
    return type === "TEXT" || type === "EMOJI";
}
const COOLDOWN_MS = 1000;
export class ChatHandler {
    constructor(room) {
        this.chatHistory = [];
        this.MAX_HISTORY = 25;
        this.MAX_CONTENT_LENGTH = 60;
        this.MAX_NAME_LENGTH = 25;
        this.MAX_AVATAR_LENGTH = 999;
        this.lastMessageTime = new Map();
        this.room = room;
        this.chatHistory = [];
    }
    setup() {
        this.room.onMessage("SEND_CHAT", (client, message) => {
            if (!message || typeof message !== "object")
                return;
            const msg = message;
            if (!msg.content || typeof msg.content !== "string")
                return;
            const now = Date.now();
            const lastTime = this.lastMessageTime.get(client.sessionId) || 0;
            if (now - lastTime < COOLDOWN_MS)
                return;
            const sanitizedContent = sanitizeInput(msg.content, this.MAX_CONTENT_LENGTH);
            if (sanitizedContent.length === 0)
                return;
            const sanitizedType = isValidMessageType(msg.type) ? msg.type : "TEXT";
            const chatData = {
                messageId: (typeof msg.messageId === "string" && msg.messageId.length > 0)
                    ? msg.messageId
                    : randomUUID(),
                senderId: typeof msg.senderId === "string" ? sanitizeInput(msg.senderId, 64) : client.sessionId,
                senderName: typeof msg.senderName === "string"
                    ? sanitizeInput(msg.senderName, this.MAX_NAME_LENGTH)
                    : `Guest_${client.sessionId.substring(0, 4)}`,
                avatarUrl: typeof msg.avatarUrl === "string"
                    ? sanitizeInput(msg.avatarUrl, this.MAX_AVATAR_LENGTH)
                    : "0",
                content: sanitizedContent,
                type: sanitizedType,
            };
            this.lastMessageTime.set(client.sessionId, now);
            if (chatData.type === "TEXT") {
                this.chatHistory.push(chatData);
                if (this.chatHistory.length > this.MAX_HISTORY)
                    this.chatHistory.shift();
            }
            console.log(`[ON SEND_CHAT] chat message : ${chatData.senderName} `, chatData.content);
            this.room.broadcast("RECEIVE_CHAT", chatData);
        });
    }
    sendHistory(client) {
        if (this.chatHistory.length > 0) {
            client.send("CHAT_HISTORY", this.chatHistory);
            // this.room.broadcast("CHAT_HISTORY", this.chatHistory); //? [wrong] it brodcast all the client duplicates history
        }
    }
    addChatMessage() {
        const chatData = {
            messageId: randomUUID(),
            senderId: 'p1',
            senderName: 'manox lx',
            avatarUrl: "2",
            content: "kiss",
            type: 'EMOJI',
        };
        this.chatHistory.push(chatData);
        this.room.broadcast("RECEIVE_CHAT", chatData);
        console.log('add-debug-chat ', chatData);
    }
}
