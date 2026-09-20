/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 SimpleCodec contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PREFIX = "DCE1:";
export const MESSAGE_LIMIT = 2000;
const MARKER = "DCE1\0";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

// Intentionally the same byte addition + Base64 format as the console snippet.
export function encode(text: string, password: string): string {
    if (!password) throw new Error("Enter a shared password before sending encoded text.");
    const bytes = encoder.encode(MARKER + text);
    const key = encoder.encode(password);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode((bytes[i] + key[i % key.length]) & 255);
    }
    return PREFIX + btoa(binary);
}

export function decode(text: string, password: string): string | null {
    if (!password || !/^DCE1:[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
    try {
        const key = encoder.encode(password);
        const binary = atob(text.slice(PREFIX.length));
        const bytes = Uint8Array.from(binary, (c, i) =>
            (c.charCodeAt(0) - key[i % key.length] + 256) & 255);
        const plain = decoder.decode(bytes);
        return plain.startsWith(MARKER) ? plain.slice(MARKER.length) : null;
    } catch {
        return null;
    }
}

export function prepareOutgoing(text: string, password: string, enabled: boolean): string {
    if (!enabled || !text) return text;
    if (!password) throw new Error("Enter a shared password before sending encoded text.");
    const result = decode(text, password) !== null ? text : encode(text, password);
    if (result.length > MESSAGE_LIMIT) {
        throw new Error("Encoded text exceeds 2,000 characters. Shorten the message and try again.");
    }
    return result;
}
