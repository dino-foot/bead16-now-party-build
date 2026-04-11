export class ChatHandler {
    constructor(room) {
        this.chatHistory = [];
        this.MAX_HISTORY = 25;
        this.room = room;
    }
    // Call this inside onCreate
    setup() {
        this.room.onMessage("SEND_CHAT", (client, message) => {
            const player = this.room.state.players.get(client.sessionId);
            const chatData = {
                senderId: client.sessionId,
                senderName: player?.name || `Guest_${client.sessionId.substring(0, 4)}`,
                avatarUrl: player?.avatarUrl || "0",
                content: message.content ?? "hello!", // default content if missing
                type: message.type,
                isPlayer: player ? !player.isSpectator : false
            };
            // Only save text history
            if (chatData.type === "text") {
                this.chatHistory.push(chatData);
                if (this.chatHistory.length > this.MAX_HISTORY)
                    this.chatHistory.shift();
            }
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
}
