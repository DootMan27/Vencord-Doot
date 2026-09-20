/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 SimpleCodec contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { decode, PREFIX } from "./codec";

interface CachedMessage {
    content: string;
    editedTimestamp?: Date | null;
}

export interface MessageAccess {
    get(channelId: string, messageId: string): CachedMessage | undefined;
    update(channelId: string, messageId: string, content: string): void;
}

interface Original {
    channelId: string;
    messageId: string;
    encoded: string;
    plain: string;
    editVersion: number | null;
}

const editVersion = (message: CachedMessage) => message.editedTimestamp?.valueOf() ?? null;

/** Keep the server text so disabling the plugin or changing passwords is reversible. */
export class DecodedMessages {
    private originals = new Map<string, Original>();

    constructor(private access: MessageAccess) { }

    apply(channelId: string, messageId: string, password: string) {
        const id = channelId + ":" + messageId;
        const current = this.access.get(channelId, messageId);
        if (!current) {
            this.originals.delete(id);
            return;
        }

        let previous = this.originals.get(id);
        // An incoming edit takes precedence over our saved copy.
        if (previous && (editVersion(current) !== previous.editVersion
            || (current.content !== previous.plain && current.content !== previous.encoded))) {
            this.originals.delete(id);
            previous = undefined;
        }
        const encoded = previous?.encoded ?? current.content;
        const plain = decode(encoded, password);
        if (plain === null) {
            this.originals.delete(id);
            if (previous && current.content === previous.plain) {
                this.access.update(channelId, messageId, previous.encoded);
            }
            return;
        }

        this.originals.set(id, { channelId, messageId, encoded, plain, editVersion: editVersion(current) });
        // Updating a message triggers another render; don't update it a second time.
        if (current.content !== plain) this.access.update(channelId, messageId, plain);
    }

    status(channelId: string, messageId: string, fallback?: CachedMessage): "decoded" | "encoded" | "plain" {
        const current = this.access.get(channelId, messageId) ?? fallback;
        const original = this.originals.get(channelId + ":" + messageId);
        if (current && original && current.content === original.plain && editVersion(current) === original.editVersion) {
            return "decoded";
        }
        return current?.content.startsWith(PREFIX) ? "encoded" : "plain";
    }

    restoreWhere(accept: (channelId: string) => boolean) {
        for (const [id, original] of this.originals) {
            const { channelId, messageId, plain, encoded } = original;
            if (!accept(channelId)) continue;
            const current = this.access.get(channelId, messageId);
            if (current?.content === plain && editVersion(current) === original.editVersion) {
                this.access.update(channelId, messageId, encoded);
            }
            this.originals.delete(id);
        }
    }

    restoreAll() {
        this.restoreWhere(() => true);
    }
}
