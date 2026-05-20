export class VoicePartyPlugin {
    constructor() {
        this.name = "voice_party";
    }
    onMessage(_room, client, type, data) {
        switch (type) {
            case "VOICE_OFFER":
            case "VOICE_ANSWER":
            case "VOICE_ICE_CANDIDATE":
                this.relaySignal(_room, client, type, data);
                return false;
        }
    }
    relaySignal(room, client, type, data) {
        if (!data?.targetSessionId)
            return;
        const targetClient = room.clients.find(c => c.sessionId === data.targetSessionId);
        if (!targetClient)
            return;
        targetClient.send(type, {
            senderSessionId: client.sessionId,
            sdp: data.sdp,
            candidate: data.candidate,
        });
    }
}
