import pool from "../db/db.js";
import { DEFAULT_ENTRY_FEE } from "../rooms/Constants/Global.js";
import { getFirebaseMessaging } from "./firebase.js";
const NOTIFICATION_ICON_URL = "https://firebasestorage.googleapis.com/v0/b/fiverr-retrive-project.firebasestorage.app/o/rsz_icon%20(1).png?alt=media&token=711c6ded-1119-494d-85fa-b74bc352e1b2";
export class PushNotificationService {
    static async registerToken(playfabId, token, platform) {
        const query = `
            INSERT INTO fcm_tokens (playfab_id, token, platform)
            VALUES ($1, $2, $3)
            ON CONFLICT (token) DO UPDATE SET
                playfab_id = EXCLUDED.playfab_id,
                platform = EXCLUDED.platform,
                updated_at = CURRENT_TIMESTAMP;
        `;
        await pool.query(query, [playfabId, token, platform || null]);
        console.log(`[PUSH] Registered FCM token for player ${playfabId}`);
    }
    static async unregisterToken(playfabId, token) {
        const query = `
            DELETE FROM fcm_tokens
            WHERE playfab_id = $1 AND token = $2;
        `;
        await pool.query(query, [playfabId, token]);
        console.log(`[PUSH] Unregistered FCM token for player ${playfabId}`);
    }
    static async sendMessageNotification(recipientPlayfabId, senderName, senderPlayfabId, type = PushNotificationType.MessageNotification, roomCode, entryFee) {
        const data = {
            type: String(type),
            senderPlayfabId,
            senderName,
        };
        if (type === PushNotificationType.RoomInvite && roomCode) {
            data.roomCode = roomCode;
            data.entryFee = String(entryFee ?? DEFAULT_ENTRY_FEE);
        }
        return PushNotificationService.deliver(recipientPlayfabId, senderName, getNotificationBody(type, senderName), data);
    }
    /**
     * Notifies a weekly-leaderboard winner that their reward coins have already been
     * credited to their account. Called by WeeklyResetService after the Monday reset
     * commits - not sender-based like sendMessageNotification, so it builds its own
     * title/body instead of going through getNotificationBody.
     */
    static async sendWeeklyRewardNotification(playfabId, rank, coins) {
        return PushNotificationService.deliver(playfabId, "Collect 🏆 Weekly League Reward! 🎁", `You finished #${rank} this, collect ${coins} coins!`, {
            type: String(PushNotificationType.WeeklyReward),
            rank: String(rank),
            coins: String(coins),
        });
    }
    /**
     * Same as sendWeeklyRewardNotification, but for the weekly supports leaderboard - kept
     * as a separate method (rather than a flag) so the copy can call out "supports"
     * explicitly. Called by WeeklyResetService.runWeeklySupportsReset after its Monday
     * reset commits.
     */
    static async sendWeeklySupportsRewardNotification(playfabId, rank, coins) {
        return PushNotificationService.deliver(playfabId, "Collect ❤️ Weekly Support Reward! 🎁", `You finished #${rank} in supports this week, collect ${coins} coins!`, {
            type: String(PushNotificationType.WeeklySupportsReward),
            rank: String(rank),
            coins: String(coins),
        });
    }
    /**
     * Notifies a tracked top-100 player that their weekly rank got worse because
     * other players won matches while they were away. Called by RankDropService's
     * periodic scan - not sender-based like sendMessageNotification, so it builds
     * its own title/body instead of going through getNotificationBody.
     */
    static async sendRankDroppedNotification(playfabId, oldRank, newRank) {
        return PushNotificationService.deliver(playfabId, "Your rank dropped ! 😭", `You dropped from #${oldRank} to #${newRank} in the Weekly League.`, {
            type: String(PushNotificationType.RankDropped),
            oldRank: String(oldRank),
            newRank: String(newRank),
        });
    }
    static async deliver(recipientPlayfabId, title, body, data) {
        const messaging = getFirebaseMessaging();
        if (!messaging) {
            console.error("[PUSH] Firebase Messaging not initialized");
            return { success: false, sentCount: 0, error: "Firebase not initialized" };
        }
        const result = await pool.query("SELECT token FROM fcm_tokens WHERE playfab_id = $1", [recipientPlayfabId]);
        if (result.rows.length === 0) {
            console.log(`[PUSH] No FCM tokens found for player ${recipientPlayfabId}`);
            return { success: true, sentCount: 0 };
        }
        const tokens = result.rows.map(row => row.token);
        const androidNotification = {
            icon: "ic_notification",
            sound: "default",
            defaultSound: true,
        };
        const message = {
            notification: {
                title,
                body,
            },
            android: {
                notification: androidNotification,
            },
            data,
            tokens,
        };
        try {
            const response = await messaging.sendEachForMulticast(message);
            console.log(`[PUSH] Sent ${response.successCount}/${tokens.length} notifications to ${recipientPlayfabId}`);
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(tokens[idx]);
                    }
                });
                await PushNotificationService.removeInvalidTokens(failedTokens);
            }
            return { success: true, sentCount: response.successCount };
        }
        catch (error) {
            console.error("[PUSH] Error sending notification:", error);
            return { success: false, sentCount: 0, error: error.message };
        }
    }
    static async removeInvalidTokens(tokens) {
        if (tokens.length === 0)
            return;
        await pool.query("DELETE FROM fcm_tokens WHERE token = ANY($1)", [tokens]);
        console.log(`[PUSH] Removed ${tokens.length} invalid FCM tokens`);
    }
}
export var PushNotificationType;
(function (PushNotificationType) {
    PushNotificationType[PushNotificationType["MessageNotification"] = 0] = "MessageNotification";
    PushNotificationType[PushNotificationType["FriendRequest"] = 1] = "FriendRequest";
    PushNotificationType[PushNotificationType["RoomInvite"] = 2] = "RoomInvite";
    PushNotificationType[PushNotificationType["WeeklyReward"] = 3] = "WeeklyReward";
    PushNotificationType[PushNotificationType["RankDropped"] = 4] = "RankDropped";
    PushNotificationType[PushNotificationType["WeeklySupportsReward"] = 5] = "WeeklySupportsReward";
})(PushNotificationType || (PushNotificationType = {}));
export function getNotificationBody(type, senderName) {
    switch (type) {
        case PushNotificationType.FriendRequest:
            return `${senderName} sent you a friend request`;
        case PushNotificationType.RoomInvite:
            return `${senderName} invited you to a match`;
        default:
            return `You received a new message from ${senderName}`;
    }
}
