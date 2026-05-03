---
name: remotion
description: Use when creating, editing, or rendering programmatic videos with Remotion (React-based video framework). Triggers on requests involving <Composition>, useCurrentFrame, video rendering, or .tsx files in remotion/ directories.
---

# Remotion

## When to use
- User wants to build/edit a Remotion video composition
- Working with files under `remotion/` or `src/remotion/`
- Rendering videos via `npx remotion render` or `@remotion/renderer`

## Setup
- `npm i remotion @remotion/cli @remotion/player`
- Entry: `src/index.ts` calling `registerRoot(RemotionRoot)`
- Compositions defined with `<Composition id="..." component={...} durationInFrames={...} fps={30} width={1920} height={1080} />`

## Key APIs
- `useCurrentFrame()` — current frame number
- `useVideoConfig()` — { fps, width, height, durationInFrames }
- `interpolate(frame, [0, 30], [0, 1])` for animations
- `spring({ frame, fps })` for physics-based motion
- `<Sequence from={30} durationInFrames={60}>` to time-shift children

## Rendering
- Preview: `npx remotion studio`
- Render: `npx remotion render src/index.ts CompId out/video.mp4`

## Gotchas
- All animation must be deterministic per frame — no timers, no random without seed
- Assets must be in `public/` and referenced via `staticFile()`
- Don't use `setTimeout`/`setInterval` — use frame math instead
