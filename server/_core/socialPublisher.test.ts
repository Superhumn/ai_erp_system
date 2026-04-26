import { describe, expect, it } from "vitest";
import { pickBestCut, planPublish } from "./socialPublisher";

describe("socialPublisher.pickBestCut", () => {
  it("TikTok requires vertical and skips horizontal-only videos", () => {
    const r = pickBestCut("tiktok", { horizontalUrl: "h.mp4" });
    expect(r.pickedRatio).toBeNull();
    expect(r.pickedUrl).toBeNull();
    expect(r.skipReason).toMatch(/TikTok/);
  });

  it("TikTok picks vertical when available", () => {
    const r = pickBestCut("tiktok", { verticalUrl: "v.mp4", horizontalUrl: "h.mp4" });
    expect(r.pickedRatio).toBe("vertical");
    expect(r.pickedUrl).toBe("v.mp4");
  });

  it("YouTube prefers horizontal but falls back to square then vertical", () => {
    expect(pickBestCut("youtube", { horizontalUrl: "h.mp4", verticalUrl: "v.mp4" }).pickedRatio).toBe("horizontal");
    expect(pickBestCut("youtube", { squareUrl: "s.mp4", verticalUrl: "v.mp4" }).pickedRatio).toBe("square");
    expect(pickBestCut("youtube", { verticalUrl: "v.mp4" }).pickedRatio).toBe("vertical");
  });

  it("YouTube Shorts is vertical-only", () => {
    expect(pickBestCut("youtube_shorts", { horizontalUrl: "h.mp4" }).pickedRatio).toBeNull();
    expect(pickBestCut("youtube_shorts", { verticalUrl: "v.mp4" }).pickedRatio).toBe("vertical");
  });

  it("Instagram Reels prefers vertical, accepts square, never horizontal", () => {
    expect(pickBestCut("instagram_reels", { verticalUrl: "v.mp4", squareUrl: "s.mp4" }).pickedRatio).toBe("vertical");
    expect(pickBestCut("instagram_reels", { squareUrl: "s.mp4" }).pickedRatio).toBe("square");
    expect(pickBestCut("instagram_reels", { horizontalUrl: "h.mp4" }).pickedRatio).toBeNull();
  });

  it("Instagram Feed prefers square, then vertical, then horizontal", () => {
    expect(pickBestCut("instagram_feed", { squareUrl: "s.mp4", verticalUrl: "v.mp4", horizontalUrl: "h.mp4" }).pickedRatio).toBe("square");
    expect(pickBestCut("instagram_feed", { verticalUrl: "v.mp4", horizontalUrl: "h.mp4" }).pickedRatio).toBe("vertical");
    expect(pickBestCut("instagram_feed", { horizontalUrl: "h.mp4" }).pickedRatio).toBe("horizontal");
  });
});

describe("socialPublisher.planPublish", () => {
  it("plans the full fan-out with mixed skip + publish decisions", () => {
    const plan = planPublish(
      ["tiktok", "youtube", "youtube_shorts", "instagram_reels", "instagram_feed"],
      { horizontalUrl: "h.mp4" },
    );
    const byPlatform = Object.fromEntries(plan.map(p => [p.platform, p]));
    expect(byPlatform.tiktok.pickedRatio).toBeNull();
    expect(byPlatform.youtube.pickedRatio).toBe("horizontal");
    expect(byPlatform.youtube_shorts.pickedRatio).toBeNull();
    expect(byPlatform.instagram_reels.pickedRatio).toBeNull();
    expect(byPlatform.instagram_feed.pickedRatio).toBe("horizontal");
  });
});
