import { useEffect, useState } from "react";
import type { Platform } from "../lib/state";

type PlatformSpec = {
  brand: string; // header bar text (e.g. "facebook")
  color: string; // primary brand color
  onColor: string; // foreground on brand color
  handlePlaceholder: string;
  handleLabel: string;
  permissionsTitle: string;
  permissions: string[];
  continueLabel: string;
  disclaimer?: string;
};

const SPECS: Record<Platform, PlatformSpec> = {
  facebook: {
    brand: "facebook",
    color: "#1877F2",
    onColor: "#ffffff",
    handlePlaceholder: "Your Facebook Page",
    handleLabel: "Which Page do you want to connect?",
    permissionsTitle: "Posta is asking to:",
    permissions: [
      "Manage and publish content as your Page",
      "Read engagement on posts (reach, clicks)",
      "Read your Page profile and name",
    ],
    continueLabel: "Continue as",
  },
  instagram: {
    brand: "Instagram",
    color: "#E4405F",
    onColor: "#ffffff",
    handlePlaceholder: "@your_ig_handle",
    handleLabel: "Which Instagram Business account?",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Publish photos, carousels and Reels to your IG Business account",
      "Read profile info and insights",
    ],
    continueLabel: "Authorize",
    disclaimer:
      "Only Business or Creator accounts linked to a Facebook Page can be connected.",
  },
  x: {
    brand: "X",
    color: "#0f1419",
    onColor: "#ffffff",
    handlePlaceholder: "@yourhandle",
    handleLabel: "Authorize this app",
    permissionsTitle: "This app will be able to:",
    permissions: [
      "Post tweets on your behalf",
      "Read your profile and followers count",
    ],
    continueLabel: "Authorize app",
  },
  linkedin: {
    brand: "LinkedIn",
    color: "#0A66C2",
    onColor: "#ffffff",
    handlePlaceholder: "Company Page or your name",
    handleLabel: "Connect your profile or Company Page",
    permissionsTitle: "Posta would like to:",
    permissions: [
      "Share posts on your behalf",
      "Read your profile and company affiliations",
    ],
    continueLabel: "Allow",
  },
  tiktok: {
    brand: "TikTok",
    color: "#000000",
    onColor: "#ffffff",
    handlePlaceholder: "@yourhandle",
    handleLabel: "Log in to TikTok",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Post videos to your TikTok Business account",
      "Read public stats on your videos",
    ],
    continueLabel: "Authorize",
    disclaimer: "Requires a TikTok Business account.",
  },
  youtube: {
    brand: "Google",
    color: "#4285F4",
    onColor: "#ffffff",
    handlePlaceholder: "Channel name",
    handleLabel: "Sign in with Google",
    permissionsTitle: "Posta would like to:",
    permissions: [
      "Upload videos to your YouTube channel",
      "See your YouTube account info",
    ],
    continueLabel: "Allow",
  },
  whatsapp: {
    brand: "WhatsApp",
    color: "#25D366",
    onColor: "#ffffff",
    handlePlaceholder: "Business number e.g. +256…",
    handleLabel: "Connect a WhatsApp Business number",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Send approved template messages to opted-in contacts",
      "Read delivery and read receipts",
    ],
    continueLabel: "Connect",
    disclaimer:
      "WhatsApp Channels broadcast posts aren't supported by Meta's API yet — we'll copy your post to the clipboard for you to paste in.",
  },
  telegram: {
    brand: "Telegram",
    color: "#229ED9",
    onColor: "#ffffff",
    handlePlaceholder: "Channel @username",
    handleLabel: "Add PostaBot to your channel",
    permissionsTitle: "To connect Telegram:",
    permissions: [
      "Add @PostaPublishBot as an admin on your channel",
      "Give it permission to Post messages",
      "Return here and paste the channel @handle",
    ],
    continueLabel: "I've added the bot",
  },
  pinterest: {
    brand: "Pinterest",
    color: "#E60023",
    onColor: "#ffffff",
    handlePlaceholder: "Your Pinterest business account",
    handleLabel: "Connect a Pinterest business account",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Publish Pins to your boards",
      "Read profile + pin engagement",
    ],
    continueLabel: "Authorize",
    disclaimer:
      "Requires a Pinterest business account; converting from a personal account is free.",
  },
  threads: {
    brand: "Threads",
    color: "#000000",
    onColor: "#ffffff",
    handlePlaceholder: "@your_threads_handle",
    handleLabel: "Connect your Threads account",
    permissionsTitle: "Posta would like to:",
    permissions: [
      "Publish Threads posts on your behalf",
      "Read profile + insights",
    ],
    continueLabel: "Authorize",
    disclaimer:
      "Threads accounts are linked through Instagram. Connecting Threads also connects the matching IG account.",
  },
  reddit: {
    brand: "Reddit",
    color: "#FF4500",
    onColor: "#ffffff",
    handlePlaceholder: "u/yourname or r/yoursubreddit",
    handleLabel: "Authorize this app",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Submit posts to subreddits you moderate",
      "Read your profile + karma",
    ],
    continueLabel: "Allow",
  },
  bluesky: {
    brand: "Bluesky",
    color: "#0085FF",
    onColor: "#ffffff",
    handlePlaceholder: "yourhandle.bsky.social",
    handleLabel: "Sign in with an app password",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Post on your Bluesky account using an app password",
      "Read your profile",
    ],
    continueLabel: "Connect",
    disclaimer:
      "Bluesky uses app passwords (not OAuth). Generate one in Bluesky settings → App Passwords, then paste it here.",
  },
  snapchat: {
    brand: "Snapchat",
    color: "#FFFC00",
    onColor: "#000000",
    handlePlaceholder: "Your Snapchat username",
    handleLabel: "Sign in to Snapchat",
    permissionsTitle: "Posta would like to:",
    permissions: [
      "Publish Stories and Spotlight content on your behalf",
      "Read profile + view counts",
    ],
    continueLabel: "Authorize",
    disclaimer:
      "Snapchat publishing uses the Creator Kit. Some content types (paid Spotlight) need a verified Creator account.",
  },
  discord: {
    brand: "Discord",
    color: "#5865F2",
    onColor: "#ffffff",
    handlePlaceholder: "#channel-name",
    handleLabel: "Add Posta to a Discord server",
    permissionsTitle: "Posta will need:",
    permissions: [
      "Send Messages permission in the target channel",
      "Embed Links + Attach Files (for media posts)",
    ],
    continueLabel: "Authorize",
    disclaimer:
      "Discord posts go to a specific channel in a server you administer. Pick the channel after authorizing.",
  },
  gmb: {
    brand: "Google Business",
    color: "#4285F4",
    onColor: "#ffffff",
    handlePlaceholder: "Your business name",
    handleLabel: "Sign in with Google",
    permissionsTitle: "Posta will be able to:",
    permissions: [
      "Publish Updates and Offers on your Business Profile",
      "Read insights for your locations",
    ],
    continueLabel: "Continue",
    disclaimer:
      "Google Business posts are tied to a specific location. If you manage multiple locations you'll pick which one Posta posts to.",
  },
};

export function OAuthMock({
  platform,
  onSuccess,
  onClose,
}: {
  platform: Platform;
  onSuccess: (handle: string) => void;
  onClose: () => void;
}) {
  const spec = SPECS[platform];
  const [handle, setHandle] = useState("");
  const [stage, setStage] = useState<"consent" | "redirecting">("consent");

  useEffect(() => {
    if (stage !== "redirecting") return;
    const t = setTimeout(() => {
      onSuccess(handle.trim());
    }, 900);
    return () => clearTimeout(t);
  }, [stage, handle, onSuccess]);

  return (
    <div
      className="oauth-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="oauth-window"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="oauth-header"
          style={{ background: spec.color, color: spec.onColor }}
        >
          <span className="oauth-lock" aria-hidden>
            🔒
          </span>
          <span className="oauth-url small">
            {spec.brand.toLowerCase()}.com/oauth/authorize
          </span>
          <button
            className="oauth-x"
            onClick={onClose}
            aria-label="close"
            style={{ color: spec.onColor }}
          >
            ×
          </button>
        </div>

        {stage === "consent" ? (
          <div className="oauth-body">
            <div className="oauth-appline">
              <span
                className="oauth-badge"
                style={{ background: spec.color, color: spec.onColor }}
              >
                {spec.brand[0].toUpperCase()}
              </span>
              <div>
                <div className="oauth-title">
                  Connect your {spec.brand} account to <b>Posta</b>
                </div>
                <div className="small muted">posta.ug</div>
              </div>
            </div>

            <div className="oauth-section">
              <div className="small" style={{ fontWeight: 600 }}>
                {spec.permissionsTitle}
              </div>
              <ul className="oauth-perm-list">
                {spec.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>

            <div className="oauth-section">
              <label className="small muted">{spec.handleLabel}</label>
              <input
                className="input"
                placeholder={spec.handlePlaceholder}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoFocus
              />
            </div>

            {spec.disclaimer && (
              <p className="small muted oauth-disclaimer">{spec.disclaimer}</p>
            )}

            <div className="oauth-actions">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn"
                style={{
                  background: spec.color,
                  color: spec.onColor,
                  borderColor: spec.color,
                }}
                disabled={!handle.trim()}
                onClick={() => setStage("redirecting")}
              >
                {spec.continueLabel}
                {spec.continueLabel === "Continue as" && handle.trim()
                  ? ` ${handle.trim()}`
                  : ""}
              </button>
            </div>

            <p className="oauth-footnote small muted">
              Mock OAuth — no real {spec.brand} API call is made yet.
            </p>
          </div>
        ) : (
          <div className="oauth-body oauth-redirect">
            <div className="oauth-spinner" aria-hidden />
            <div className="oauth-title" style={{ textAlign: "center" }}>
              Redirecting back to Posta…
            </div>
            <div className="small muted" style={{ textAlign: "center" }}>
              Exchanging authorization code for access token
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
