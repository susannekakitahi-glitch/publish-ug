/**
 * Per-platform "what will this look like after publish?" previews.
 *
 * Compose renders one <PlatformPreview /> per selected platform inside a
 * horizontally-scrollable row so the user can eyeball how their caption +
 * media will frame up on each destination before scheduling.
 *
 * These are NOT pixel-perfect mocks of the real apps — the point is to
 * surface per-platform quirks (character limits, image aspect ratios,
 * caption placement) so mistakes are caught before the post ships. Each
 * card is deliberately small (~280-320px wide) so several fit on one
 * mobile screen at once.
 */

import type { MediaItem, Platform, ScheduledPost } from "../lib/state";

type Kind = ScheduledPost["kind"];

export interface PlatformPreviewProps {
  platform: Platform;
  text: string;
  media: MediaItem[];
  kind: Kind;
  /** Display name shown in the preview header (page name / handle). Falls
   *  back to a generic "Your Page" label when the account isn't connected
   *  yet — the preview should still work during first-draft flows. */
  handle?: string;
  /** YouTube-share kind uses a pasted URL instead of local media. */
  youtubeUrl?: string;
}

/** Platform-specific caption limits. Used to slice the caption preview
 *  and surface an "N chars over" warning pill. These are the documented
 *  public limits; Postiz / Zernio enforce them server-side as well. */
const CAPTION_LIMIT: Partial<Record<Platform, number>> = {
  x: 280,
  linkedin: 3000,
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
  whatsapp: 4096,
  telegram: 4096,
  youtube: 5000,
};

function firstImage(media: MediaItem[]): MediaItem | undefined {
  return media.find((m) => m.kind === "image");
}

function firstVideo(media: MediaItem[]): MediaItem | undefined {
  return media.find((m) => m.kind === "video");
}

function overflow(platform: Platform, text: string): number {
  const lim = CAPTION_LIMIT[platform];
  if (!lim) return 0;
  return Math.max(0, text.length - lim);
}

function displayHandle(p: Platform, handle?: string): string {
  if (handle) return handle;
  // Pleasant fallback — the preview is still useful during signup / before
  // any account is linked. Tweaked per-platform so the placeholder reads
  // like something the user might recognise on that surface.
  switch (p) {
    case "facebook":
      return "Your Page";
    case "instagram":
      return "yourhandle";
    case "x":
      return "yourhandle";
    case "linkedin":
      return "Your Profile";
    case "tiktok":
      return "yourhandle";
    case "youtube":
      return "Your Channel";
    case "whatsapp":
      return "Status";
    case "telegram":
      return "Your Channel";
  }
}

export function PlatformPreview(props: PlatformPreviewProps) {
  const { platform } = props;
  return (
    <div className={`pp pp-${platform}`}>
      <div className="pp-tag">{platform.toUpperCase()}</div>
      {platform === "facebook" && <FacebookCard {...props} />}
      {platform === "instagram" && <InstagramCard {...props} />}
      {platform === "x" && <XCard {...props} />}
      {platform === "linkedin" && <LinkedInCard {...props} />}
      {platform === "tiktok" && <TikTokCard {...props} />}
      {platform === "youtube" && <YouTubeCard {...props} />}
      {platform === "whatsapp" && <WhatsAppCard {...props} />}
      {platform === "telegram" && <TelegramCard {...props} />}
      <OverflowPill platform={platform} text={props.text} />
    </div>
  );
}

function OverflowPill({ platform, text }: { platform: Platform; text: string }) {
  const over = overflow(platform, text);
  if (over === 0) return null;
  return (
    <div className="pp-over" role="status">
      {over} character{over === 1 ? "" : "s"} over {platform.toUpperCase()} limit
    </div>
  );
}

function Avatar({ letter }: { letter: string }) {
  return <div className="pp-avatar">{letter.toUpperCase()}</div>;
}

function MediaSlot({
  media,
  kind,
  aspect = "4/3",
}: {
  media: MediaItem[];
  kind: Kind;
  aspect?: string;
}) {
  const img = firstImage(media);
  const vid = firstVideo(media);
  if (!img && !vid && kind !== "youtube") return null;
  const src = img?.dataUrl ?? vid?.dataUrl;
  return (
    <div className="pp-media" style={{ aspectRatio: aspect }}>
      {src ? (
        <img src={src} alt="" />
      ) : (
        <div className="pp-media-placeholder">Media placeholder</div>
      )}
      {vid && <div className="pp-play">▶</div>}
    </div>
  );
}

function FacebookCard({ text, handle, media, kind }: PlatformPreviewProps) {
  return (
    <div className="pp-card pp-fb">
      <div className="pp-header">
        <Avatar letter={(handle ?? "P")[0]} />
        <div className="pp-header-text">
          <div className="pp-name">{displayHandle("facebook", handle)}</div>
          <div className="pp-sub">Just now · 🌐</div>
        </div>
      </div>
      {text && <div className="pp-body">{text}</div>}
      <MediaSlot media={media} kind={kind} aspect="16/9" />
      <div className="pp-actions">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↗ Share</span>
      </div>
    </div>
  );
}

function InstagramCard({ text, handle, media, kind }: PlatformPreviewProps) {
  const h = displayHandle("instagram", handle);
  return (
    <div className="pp-card pp-ig">
      <div className="pp-header">
        <Avatar letter={h[0]} />
        <div className="pp-header-text">
          <div className="pp-name">{h}</div>
          <div className="pp-sub">Kampala, Uganda</div>
        </div>
      </div>
      <MediaSlot media={media} kind={kind} aspect="1/1" />
      <div className="pp-actions pp-ig-actions">
        <span>♡</span>
        <span>💬</span>
        <span>↗</span>
      </div>
      {text && (
        <div className="pp-body pp-ig-caption">
          <strong>{h}</strong> {text}
        </div>
      )}
    </div>
  );
}

function XCard({ text, handle, media, kind }: PlatformPreviewProps) {
  const h = displayHandle("x", handle);
  const sliced = text.length > 280 ? text.slice(0, 280) + "…" : text;
  return (
    <div className="pp-card pp-x">
      <div className="pp-header">
        <Avatar letter={h[0]} />
        <div className="pp-header-text">
          <div className="pp-name">
            {h} <span className="pp-sub">· @{h.replace(/\s+/g, "").toLowerCase()} · now</span>
          </div>
        </div>
      </div>
      {sliced && <div className="pp-body">{sliced}</div>}
      <MediaSlot media={media} kind={kind} aspect="16/9" />
      <div className="pp-actions pp-x-actions">
        <span>💬</span>
        <span>🔁</span>
        <span>♡</span>
        <span>📊</span>
      </div>
    </div>
  );
}

function LinkedInCard({ text, handle, media, kind }: PlatformPreviewProps) {
  return (
    <div className="pp-card pp-li">
      <div className="pp-header">
        <Avatar letter={(handle ?? "P")[0]} />
        <div className="pp-header-text">
          <div className="pp-name">{displayHandle("linkedin", handle)}</div>
          <div className="pp-sub">Founder · Now · 🌐</div>
        </div>
      </div>
      {text && <div className="pp-body">{text}</div>}
      <MediaSlot media={media} kind={kind} aspect="16/9" />
      <div className="pp-actions">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>🔁 Repost</span>
        <span>📨 Send</span>
      </div>
    </div>
  );
}

function TikTokCard({ text, handle, media, kind }: PlatformPreviewProps) {
  const h = displayHandle("tiktok", handle);
  return (
    <div className="pp-card pp-tt">
      <div className="pp-tt-frame" style={{ aspectRatio: "9/16" }}>
        <MediaSlot media={media} kind={kind} aspect="9/16" />
        <div className="pp-tt-overlay">
          <div className="pp-tt-handle">@{h.replace(/\s+/g, "").toLowerCase()}</div>
          {text && <div className="pp-tt-caption">{text}</div>}
        </div>
        <div className="pp-tt-rail">
          <span>♡</span>
          <span>💬</span>
          <span>↗</span>
        </div>
      </div>
    </div>
  );
}

function YouTubeCard({ text, handle, media, kind, youtubeUrl }: PlatformPreviewProps) {
  const h = displayHandle("youtube", handle);
  const title = text.split("\n")[0].slice(0, 100) || "Untitled video";
  const isShare = kind === "youtube";
  return (
    <div className="pp-card pp-yt">
      <div className="pp-media" style={{ aspectRatio: "16/9" }}>
        {firstVideo(media)?.dataUrl ? (
          <img src={firstVideo(media)!.dataUrl} alt="" />
        ) : firstImage(media)?.dataUrl ? (
          <img src={firstImage(media)!.dataUrl} alt="" />
        ) : (
          <div className="pp-media-placeholder">
            {isShare && youtubeUrl ? youtubeUrl : "Video placeholder"}
          </div>
        )}
        <div className="pp-play">▶</div>
      </div>
      <div className="pp-body">
        <div className="pp-name">{title}</div>
        <div className="pp-sub">{h} · 0 views · just now</div>
      </div>
    </div>
  );
}

function WhatsAppCard({ text, media, kind }: PlatformPreviewProps) {
  return (
    <div className="pp-card pp-wa">
      <div className="pp-wa-bubble">
        {firstImage(media) && (
          <MediaSlot media={media} kind={kind} aspect="4/3" />
        )}
        {text && <div className="pp-body">{text}</div>}
        <div className="pp-wa-time">now ✓✓</div>
      </div>
    </div>
  );
}

function TelegramCard({ text, handle, media, kind }: PlatformPreviewProps) {
  return (
    <div className="pp-card pp-tg">
      <div className="pp-header">
        <Avatar letter={(handle ?? "C")[0]} />
        <div className="pp-header-text">
          <div className="pp-name">{displayHandle("telegram", handle)}</div>
          <div className="pp-sub">just now · 1 view</div>
        </div>
      </div>
      {firstImage(media) && (
        <MediaSlot media={media} kind={kind} aspect="4/3" />
      )}
      {text && <div className="pp-body">{text}</div>}
    </div>
  );
}
