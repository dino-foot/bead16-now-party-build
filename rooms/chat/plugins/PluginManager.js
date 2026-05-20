export class PluginManager {
    constructor() {
        this.plugins = new Map();
    }
    register(plugin) {
        if (this.plugins.has(plugin.name)) {
            console.warn(`[PLUGIN] Overwriting existing plugin: ${plugin.name}`);
        }
        this.plugins.set(plugin.name, plugin);
        console.log(`[PLUGIN] Registered: ${plugin.name}`);
    }
    unregister(name) {
        return this.plugins.delete(name);
    }
    get(name) {
        return this.plugins.get(name);
    }
    onRoomCreate(room, options) {
        for (const plugin of this.plugins.values()) {
            plugin.onRoomCreate?.(room, options);
        }
    }
    onUserJoin(room, client, options) {
        for (const plugin of this.plugins.values()) {
            plugin.onUserJoin?.(room, client, options);
        }
    }
    onUserLeave(room, client, code) {
        for (const plugin of this.plugins.values()) {
            plugin.onUserLeave?.(room, client, code);
        }
    }
    onMessage(room, client, type, data) {
        for (const plugin of this.plugins.values()) {
            const result = plugin.onMessage?.(room, client, type, data);
            if (result === false)
                return false;
        }
        return true;
    }
    onRoomDispose(room) {
        for (const plugin of this.plugins.values()) {
            plugin.onRoomDispose?.(room);
        }
    }
}
