import { BaseHandler } from "./BaseHandler.js";
export class EmojiHandler extends BaseHandler {
    constructor() {
        super(...arguments);
        this.reactions = new Map();
        this.MAX_REACTIONS_PER_MSG = 50;
    }
    setup() {
        this.room.onMessage("SEND_EMOJI_REACTION", (client, data) => {
            if (!data || typeof data !== "object")
                return;
            if (!data.messageId || !data.emoji || !data.userId)
                return;
            const reaction = {
                messageId: data.messageId,
                emoji: data.emoji.slice(0, 10),
                userId: data.userId.slice(0, 64),
                userName: data.userName?.slice(0, 25) || `Guest_${client.sessionId.substring(0, 4)}`,
            };
            if (!this.reactions.has(reaction.messageId)) {
                this.reactions.set(reaction.messageId, []);
            }
            const msgReactions = this.reactions.get(reaction.messageId);
            if (msgReactions.length >= this.MAX_REACTIONS_PER_MSG)
                return;
            msgReactions.push(reaction);
            if (msgReactions.length > this.MAX_REACTIONS_PER_MSG)
                msgReactions.shift();
            this.room.broadcast("EMOJI_REACTION", reaction);
        });
    }
    getReactions(messageId) {
        return this.reactions.get(messageId) || [];
    }
}
