import pool from "../db/db.js";
import { PlayFabService } from "./PlayFabService.js";
import { CURRENCY_SERVER_AUTHORITATIVE } from "../rooms/Constants/Global.js";
export class MatchWalletService {
    /**
     * Applies one currency movement for a match, idempotently. Safe to call more than once
     * with the same (matchId, playfabId, type) - the UNIQUE constraint on match_transactions
     * means a crash/retry short-circuits once the row is COMPLETE instead of double-charging
     * or double-paying. Direction (subtract vs add) is inferred from `type` so callers don't
     * have to think about sign.
     */
    static async applyLedgerEntry(matchId, playfabId, type, amount) {
        const roundedAmount = Math.round(amount);
        let alreadyComplete = false;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const inserted = await client.query(`INSERT INTO match_transactions (match_id, playfab_id, type, amount, status)
                 VALUES ($1, $2, $3, $4, 'PENDING')
                 ON CONFLICT (match_id, playfab_id, type) DO NOTHING
                 RETURNING id`, [matchId, playfabId, type, roundedAmount]);
            if (inserted.rowCount === 0) {
                // Row already exists from a prior attempt - check what happened to it.
                const existing = await client.query(`SELECT status FROM match_transactions WHERE match_id = $1 AND playfab_id = $2 AND type = $3`, [matchId, playfabId, type]);
                if (existing.rows[0]?.status === "COMPLETE") {
                    alreadyComplete = true;
                }
                // PENDING or FAILED: fall through and retry just the PlayFab call below -
                // the player_stats mirror below only runs for a newly-inserted row, so it's
                // not re-applied here.
            }
            else {
                const sign = type === "ENTRY_FEE" ? -1 : 1;
                await client.query(`UPDATE player_stats SET coins = coins + $1, updated_at = NOW() WHERE playfab_id = $2`, [sign * roundedAmount, playfabId]);
            }
            await client.query("COMMIT");
        }
        catch (err) {
            await client.query("ROLLBACK");
            console.error(`[MatchWallet] Failed to write ledger entry (${matchId}, ${playfabId}, ${type}):`, err);
            return { ok: false };
        }
        finally {
            client.release();
        }
        if (alreadyComplete) {
            return { ok: true };
        }
        if (!CURRENCY_SERVER_AUTHORITATIVE) {
            // Dry-run: the ledger row and player_stats mirror above are real (for
            // verification), but the actual PlayFab balance is left untouched.
            await pool.query(`UPDATE match_transactions SET status = 'COMPLETE', completed_at = NOW() WHERE match_id = $1 AND playfab_id = $2 AND type = $3`, [matchId, playfabId, type]);
            console.log(`[MatchWallet][DRY-RUN] Would ${type} ${roundedAmount} coins for ${playfabId} (match ${matchId})`);
            return { ok: true };
        }
        try {
            if (type === "ENTRY_FEE") {
                await PlayFabService.subtractVirtualCurrency(playfabId, roundedAmount);
            }
            else {
                await PlayFabService.addVirtualCurrency(playfabId, roundedAmount);
            }
            await pool.query(`UPDATE match_transactions SET status = 'COMPLETE', completed_at = NOW() WHERE match_id = $1 AND playfab_id = $2 AND type = $3`, [matchId, playfabId, type]);
            return { ok: true };
        }
        catch (err) {
            console.error(`[MatchWallet] PlayFab call failed for (${matchId}, ${playfabId}, ${type}, ${roundedAmount}):`, err);
            await pool.query(`UPDATE match_transactions SET status = 'FAILED' WHERE match_id = $1 AND playfab_id = $2 AND type = $3`, [matchId, playfabId, type]);
            return { ok: false };
        }
    }
}
