import pool from "../db/db.js";
function mapRow(row) {
    return {
        category: row.category,
        label: row.label,
        coverImageUrl: row.cover_image_url,
        isoCode: row.iso_code,
        requiredLevel: row.required_level,
        requiredCoins: row.required_coins,
        maxClients: row.max_clients,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        isVip: row.is_vip,
    };
}
export class ChatRoomConfigService {
    static async getAllRoomConfigs(activeOnly = false) {
        const result = await pool.query(`SELECT * FROM chatroom_config ${activeOnly ? "WHERE is_active = true" : ""} ORDER BY sort_order ASC`);
        return result.rows.map(mapRow);
    }
    static async getRoomConfig(category) {
        const result = await pool.query(`SELECT * FROM chatroom_config WHERE category = $1`, [category]);
        return result.rowCount ? mapRow(result.rows[0]) : null;
    }
    static async upsertRoomConfig(category, fields) {
        const updates = [];
        const values = [];
        let idx = 1;
        const columns = {
            label: "label",
            cover_image_url: "coverImageUrl",
            iso_code: "isoCode",
            required_level: "requiredLevel",
            required_coins: "requiredCoins",
            is_active: "isActive",
            is_vip: "isVip",
        };
        for (const [col, key] of Object.entries(columns)) {
            if (fields[key] !== undefined) {
                updates.push(`${col} = $${idx}`);
                values.push(fields[key]);
                idx++;
            }
        }
        if (updates.length === 0) {
            const existing = await this.getRoomConfig(category);
            if (!existing)
                throw new Error(`Unknown chat room category: ${category}`);
            return existing;
        }
        updates.push("updated_at = CURRENT_TIMESTAMP");
        values.push(category);
        const result = await pool.query(`UPDATE chatroom_config SET ${updates.join(", ")} WHERE category = $${idx} RETURNING *`, values);
        if (result.rowCount === 0) {
            throw new Error(`Unknown chat room category: ${category}`);
        }
        return mapRow(result.rows[0]);
    }
    static async createRoomConfig(fields) {
        const existing = await this.getRoomConfig(fields.category);
        if (existing) {
            throw new Error(`Chat room category already exists: ${fields.category}`);
        }
        const result = await pool.query(`INSERT INTO chatroom_config
                (category, label, iso_code, required_level, required_coins, max_clients, sort_order, is_active, is_vip)
             VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM chatroom_config), true, $7)
             RETURNING *`, [
            fields.category,
            fields.label,
            fields.isoCode ?? null,
            fields.requiredLevel ?? 0,
            fields.requiredCoins ?? 0,
            fields.maxClients ?? 100,
            fields.isVip ?? false,
        ]);
        return mapRow(result.rows[0]);
    }
}
