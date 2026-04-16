import { randomUUID } from "crypto";
export class ChatHandler {
    constructor(room) {
        this.chatHistory = [];
        this.MAX_HISTORY = 25;
        this.MAX_CONTENT_LENGTH = 50; //? can be moved to config
        this.room = room;
        this.chatHistory = [];
    }
    // Call this inside onCreate
    setup() {
        this.room.onMessage("SEND_CHAT", (client, message) => {
            const player = this.room.state.players.get(client.sessionId);
            const chatData = {
                messageId: message.messageId ?? randomUUID(),
                senderId: message.senderId ?? client.sessionId,
                senderName: message?.senderName || `Guest_${client.sessionId.substring(0, 4)}`,
                avatarUrl: message.avatarUrl ?? "0", // default avatar
                content: message.content.length > this.MAX_CONTENT_LENGTH ? message.content.substring(0, this.MAX_CONTENT_LENGTH) : message.content || "Hi !", // default content if missing
                type: message.type,
            };
            // Only save text history
            if (chatData.type === "TEXT") {
                this.chatHistory.push(chatData);
                if (this.chatHistory.length > this.MAX_HISTORY)
                    this.chatHistory.shift();
            }
            console.log(`[ON SEND_CHAT] chat message :`, message.content);
            // Broadcast to everyone so they see the text in the ui immediately
            this.room.broadcast("RECEIVE_CHAT", chatData);
        });
    }
    // Call this inside onJoin
    sendHistory(client) {
        if (this.chatHistory.length > 0) {
            client.send("CHAT_HISTORY", this.chatHistory);
        }
    }
    //? for debug purpose
    addChatMessage() {
        // const chatData: ChatMessage = {
        //     messageId: randomUUID(),
        //     senderId: `seesionId_${randomUUID()}`,
        //     senderName: `Server_${randomUUID()}`,
        //     avatarUrl: "6",
        //     content: "Hello from server !", // default content if missing
        //     type: 'TEXT',
        // };
        const chatData = {
            messageId: randomUUID(),
            senderId: 'p1',
            senderName: 'manox lx',
            avatarUrl: "2",
            content: "kiss", // default content if missing
            type: 'EMOJI',
        };
        this.chatHistory.push(chatData);
        this.room.broadcast("RECEIVE_CHAT", chatData);
        console.log('add-debug-chat ', chatData);
    }
}
