/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 SimpleCodec contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { MessageObject } from "@api/MessageEvents";
import { updateMessage } from "@api/MessageUpdater";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent } from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, closeModal, GuildStore, MessageStore, Modal, openModal, React, SelectedChannelStore, showToast, Toasts, useEffect, useStateFromStores } from "@webpack/common";

import { prepareOutgoing } from "./codec";
import { DecodedMessages } from "./decodedMessages";
import style from "./style.css?managed";

const modalKey = "vc-simple-codec";
const dmScope = "@dms";
const settings = definePluginSettings({}).withPrivateSettings<{
    enabledScopes?: Record<string, boolean>;
}>();
const listeners = new Set<() => void>();
let session = { active: false, encodeOutgoing: false, password: "" };
const originals = new DecodedMessages({
    get: (channelId, messageId) => MessageStore.getMessage(channelId, messageId),
    update: (channelId, messageId, content) => updateMessage(channelId, messageId, { content })
});

function scopeForChannel(channelId?: string) {
    const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;
    return channel ? (channel.guild_id || dmScope) : undefined;
}

function isEnabledHere(channelId: string) {
    const scope = scopeForChannel(channelId);
    return !!scope && settings.store.enabledScopes?.[scope] === true;
}

function changeScope(scope: string, enabled: boolean) {
    settings.store.enabledScopes = { ...settings.store.enabledScopes, [scope]: enabled };
    if (!enabled) originals.restoreWhere(channelId => scopeForChannel(channelId) === scope);
}

function changeSession(change: Partial<typeof session>) {
    if (change.password !== undefined && change.password !== session.password) originals.restoreAll();
    session = { ...session, ...change };
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function useSession() {
    return React.useSyncExternalStore(subscribe, () => session);
}

function CodecControls({ channelId }: { channelId?: string; } = {}) {
    const { active, password, encodeOutgoing } = useSession();
    const { enabledScopes } = settings.use(["enabledScopes"]);
    const selected = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId());
    const scope = scopeForChannel(channelId ?? selected);
    const enabledHere = !!scope && enabledScopes?.[scope] === true;
    const scopeName = scope === dmScope ? "Direct messages" : scope ? (GuildStore.getGuild(scope)?.name ?? "This server") : "No channel selected";
    return (
        <div className="vc-simple-codec-controls">
            <strong>{scopeName}</strong>
            <label className="vc-simple-codec-toggle">
                <input
                    type="checkbox"
                    name="scopeEnabled"
                    checked={enabledHere}
                    disabled={!active || !scope}
                    onChange={e => scope && changeScope(scope, e.currentTarget.checked)}
                />
                {scope === dmScope ? "Enable SimpleCodec in DMs" : "Enable SimpleCodec in this server"}
            </label>
            <label className="vc-simple-codec-toggle">
                <input
                    type="checkbox"
                    name="encodeOutgoing"
                    checked={encodeOutgoing}
                    disabled={!active || !enabledHere}
                    onChange={e => changeSession({ encodeOutgoing: e.currentTarget.checked })}
                />
                Encode outgoing text
            </label>
            <label className="vc-simple-codec-password">
                Shared password
                <input
                    type="password"
                    value={password}
                    disabled={!active}
                    placeholder="Same password for both participants"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={e => changeSession({ password: e.currentTarget.value })}
                    onKeyDown={e => e.stopPropagation()}
                />
            </label>
            <p>
                In enabled servers, matching DCE1 messages decode automatically, even with outgoing encoding off.
                Server and DM choices are remembered. The password and outgoing checkbox reset when Discord restarts.
            </p>
            <p>Simple obfuscation, not secure encryption. Files stay unchanged.</p>
            {!active && <p>Enable the SimpleCodec plugin to use these controls.</p>}
        </div>
    );
}

function openControls(channelId: string) {
    openModal(props => (
        <Modal {...props} title="SimpleCodec">
            <CodecControls channelId={channelId} />
        </Modal>
    ), { modalKey });
}

const CodecIcon: IconComponent = ({ width = 24, height = 24, className }) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
        <rect x="5" y="10" width="14" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 14v3" stroke="currentColor" strokeWidth="2" />
    </svg>
);

const CodecButton: ChatBarButtonFactory = ({ isAnyChat, channel }) => {
    const { encodeOutgoing, password } = useSession();
    settings.use(["enabledScopes"]);
    if (!isAnyChat) return null;
    const enabledHere = isEnabledHere(channel.id);
    const label = !enabledHere ? "disabled here" : encodeOutgoing ? (password ? "ON" : "password required") : "outgoing OFF";
    return (
        <ChatBarButton
            tooltip={"SimpleCodec: " + label + " - click to configure"}
            onClick={() => openControls(channel.id)}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <CodecIcon className={enabledHere && encodeOutgoing ? "vc-simple-codec-on" : undefined} />
        </ChatBarButton>
    );
};

// The accessory renders nothing. Its effect updates Discord's cached message,
// so the ordinary message body and edit box show the decoded content.
function DecodeMessage({ message }: { message: Message; }) {
    const { active, password } = useSession();
    const { enabledScopes } = settings.use(["enabledScopes"]);
    useEffect(() => {
        if (active && session.active) {
            originals.apply(message.channel_id, message.id, isEnabledHere(message.channel_id) ? session.password : "");
        }
    }, [active, password, enabledScopes, message.channel_id, message.id, message.content, message.editedTimestamp]);
    return null;
}

function MessageMarker({ message }: { message: Message; }) {
    const { active } = useSession();
    settings.use(["enabledScopes"]);
    if (!active || !isEnabledHere(message.channel_id) || !message.content) return null;
    const status = originals.status(message.channel_id, message.id, message);
    const label = status === "decoded" ? "DCE1 decoded" : status === "encoded" ? "DCE1 encoded" : "Plain text";
    const title = status === "decoded" ? "Sent in DCE1 format; decoded locally."
        : status === "encoded" ? "DCE1 text; a matching password is needed to read it."
            : "Message text was not sent in DCE1 format.";
    return <span className={"vc-simple-codec-badge vc-simple-codec-" + status} title={title}>{label}</span>;
}

function beforeSend(channelId: string, message: MessageObject) {
    if (!session.active || !isEnabledHere(channelId)) return;
    try {
        message.content = prepareOutgoing(message.content, session.password, session.encodeOutgoing);
    } catch (error) {
        // Vencord catches listener exceptions and continues sending. Explicitly
        // cancel, even if displaying the error itself fails.
        try {
            showToast(error instanceof Error ? error.message : "SimpleCodec could not encode this message.", Toasts.Type.FAILURE);
        } catch { /* Do not let a toast error turn into a plaintext send. */ }
        return { cancel: true };
    }
}

export default definePlugin({
    name: "SimpleCodec",
    description: "Password-based DCE1 message obfuscation with an outgoing checkbox and automatic chat decoding.",
    authors: [],
    tags: ["Chat", "Utility"],
    dependencies: ["MessageUpdaterAPI"],
    settings,
    managedStyle: style,
    settingsAboutComponent: CodecControls,
    chatBarButton: { icon: CodecIcon, render: CodecButton },
    renderMessageAccessory: ({ message }) => <DecodeMessage message={message} />,
    renderMessageDecoration: ({ message }) => <MessageMarker message={message} />,
    onBeforeMessageSend: (channelId, message) => beforeSend(channelId, message),
    onBeforeMessageEdit: (channelId, _, message) => beforeSend(channelId, message),

    start() {
        // Remove the earlier console snippet if it is still installed.
        (window as Window & { discordCodec?: { stop(): void; }; }).discordCodec?.stop();
        changeSession({ active: true, encodeOutgoing: false, password: "" });
    },

    stop() {
        changeSession({ active: false, encodeOutgoing: false, password: "" });
        originals.restoreAll();
        closeModal(modalKey);
    }
});
