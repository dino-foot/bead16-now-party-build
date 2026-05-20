import pool from "../db/db.js";
import { PushNotificationService, PushNotificationType } from "./PushNotificationService.js";
// invitation expiry time matches private room TTL (7 minutes)
const INVITE_EXPIRY_SECONDS = 420;
export class InviteService {
    /**
     * Create a new invitation and send a push notification to the recipient.
     * Validates that the sender is not inviting themselves.
     * Sets expiry time to 7 minutes from now (matching private room TTL).
     */
    static async createInvite(senderPlayfabId, senderName, recipientPlayfabId, roomCode, entryFee) {
        // prevent inviting yourself
        if (senderPlayfabId === recipientPlayfabId) {
            return { success: false, error: "Cannot invite yourself" };
        }
        const expiresAt = new Date(Date.now() + INVITE_EXPIRY_SECONDS * 1000);
        const result = await pool.query(`INSERT INTO invitations (sender_playfab_id, sender_name, recipient_playfab_id, room_code, entry_fee, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`, [senderPlayfabId, senderName, recipientPlayfabId, roomCode, entryFee, expiresAt]);
        const invitation = result.rows[0];
        // send push notification to the recipient about the room invite
        await PushNotificationService.sendMessageNotification(recipientPlayfabId, senderName, senderPlayfabId, PushNotificationType.RoomInvite, roomCode, entryFee);
        console.log(`[INVITE] Created invite #${invitation.id} from ${senderName} (${senderPlayfabId}) to ${recipientPlayfabId}, room=${roomCode}`);
        return { success: true, invitation };
    }
    /**
     * Get all pending invitations for a player.
     * Auto-deletes expired invitations before returning results.
     */
    static async getPendingInvitations(playfabId) {
        // clean up expired invitations first
        await pool.query(`DELETE FROM invitations WHERE expires_at < NOW()`);
        const result = await pool.query(`SELECT * FROM invitations WHERE recipient_playfab_id = $1 AND status = 'pending' ORDER BY created_at DESC`, [playfabId]);
        return { success: true, invitations: result.rows };
    }
    /**
     * Accept an invitation.
     * Validates that the invitation belongs to the player and is still pending.
     * Returns the room code and entry fee so the client can join the room.
     */
    static async acceptInvite(id, playfabId) {
        // fetch the invitation
        const result = await pool.query(`SELECT * FROM invitations WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return { success: false, error: "Invitation not found" };
        }
        const invite = result.rows[0];
        // validate ownership
        if (invite.recipient_playfab_id !== playfabId) {
            return { success: false, error: "Not your invitation" };
        }
        // validate status
        if (invite.status !== "pending") {
            return { success: false, error: "Invitation already " + invite.status };
        }
        // check if invitation has expired
        if (new Date(invite.expires_at) < new Date()) {
            // delete expired invitation
            await pool.query(`DELETE FROM invitations WHERE id = $1`, [id]);
            return { success: false, error: "Invitation has expired" };
        }
        // mark as accepted
        await pool.query(`UPDATE invitations SET status = 'accepted' WHERE id = $1`, [id]);
        console.log(`[INVITE] Player ${playfabId} accepted invite #${id}, room=${invite.room_code}`);
        return { success: true, roomCode: invite.room_code, entryFee: invite.entry_fee };
    }
    /**
     * Decline an invitation.
     * Validates that the invitation belongs to the player.
     */
    static async declineInvite(id, playfabId) {
        const result = await pool.query(`SELECT * FROM invitations WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return { success: false, error: "Invitation not found" };
        }
        const invite = result.rows[0];
        // validate ownership
        if (invite.recipient_playfab_id !== playfabId) {
            return { success: false, error: "Not your invitation" };
        }
        // mark as declined (or delete, same effect)
        await pool.query(`UPDATE invitations SET status = 'declined' WHERE id = $1`, [id]);
        console.log(`[INVITE] Player ${playfabId} declined invite #${id}`);
        return { success: true };
    }
}
