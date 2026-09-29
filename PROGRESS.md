# Ondulo progress

Last updated: 2026-09-29

## Current milestone

M1 Engine

## Completed

- [x] Create the pnpm monorepo foundation and strict TypeScript configuration.
- [x] Create the `@ondulo/core` package with ESM output and declarations.
- [x] Implement an application-pushed Source with normalized waveform and spectrum frames.
- [x] Implement an Analyser with stable, reusable Features buffers.
- [x] Derive RMS level, logarithmic spectrum bands, bass, mid, and treble.
- [x] Validate Source data and configuration at the public boundary.
- [x] Make `Source` a discriminated union with overloaded `createSource`.
- [x] Implement a deterministic Demo Source: a pure function of seed and time (kick, hi-hat, chord per bar, melody per beat) that synthesises straight into the Analyser's buffers with no per-frame allocation.
- [x] Implement the media element Source (`kind: "element"`): AnalyserNode with smoothing off, float waveform read directly, byte spectrum normalized to 0 to 1, `resume()` and `dispose()`.
- [x] AudioContext handling: use the app's context or one shared context created lazily on first use; a clear error outside the browser.
- [x] Implement the MediaStream Source (`kind: "stream"`) for microphones and WebRTC, never connected to the destination. Shared AnalyserNode wiring, `resume()` and idempotent `dispose()` live in `web-audio.ts`.
- [x] Implement the existing Web Audio node Source (`kind: "node"`), deriving its AudioContext from `node.context` and reusing `createWebAudioParts` without changing playback routing. Reject OfflineAudioContext before wiring.
- [x] Report suspended AudioContexts at the shared Web Audio read boundary, directing the app to resume from a user gesture. Preserve the last Features frame on failure and recover after resume.
- [x] Report a MediaStream Source once all audio tracks captured at creation have ended. Keep silent live streams valid and preserve the last Features frame on failure.
- [x] Report an HTTP(S) media element resource whose origin differs from its document when no CORS mode is set. Check before wiring and when the selected resource changes, without treating ordinary silence as an error.
- [x] Create the `@ondulo/react` package and `useAnalyser`, with React 18.3 and 19 peer support and focused hook lifecycle tests.

## Current state

The React package foundation and `useAnalyser` slice is complete and verified. The local M1 commits are ahead of `origin/main` and have not been pushed.

Verification completed:

- `pnpm test`, 31 tests passed (Web Audio stubbed; Vitest runs in Node)
- `pnpm typecheck`
- `pnpm build`, passed with the broader filesystem access esbuild requires on this machine
- `git diff --check`
- Hook tests cover stable identity across rerenders with equivalent options, rebuilding when a frequency option or Source changes, and the package builds against React 19.3.
- Three parameterized tests cover element, stream, and node Sources: suspended reads fail before reading buffers, Features remain unchanged, resume restores reads, and suspension after a successful read is detected again.
- A focused MediaStream test covers a zero-valued frame while tracks are live, one ended track while another remains live, the transition to all tracks ended, and unchanged Features after the failure.
- Media-element tests cover rejection before graph wiring, same-origin and CORS-enabled silent resources, and a later unsafe resource selection that leaves Features unchanged.
- Live browser audio has not been tested for these slices.

Design notes:

- Demo time comes from a `clock` option returning seconds, defaulting to `Date.now()` measured from creation. Tests inject a clock; apps animate without a hook special-casing the Demo Source.
- The Demo Source spectrum is drawn in the log-frequency domain rather than computed by FFT from the waveform. Both share the same envelopes, so level and bands agree well enough for docs and tests.
- A media element can be attached to one AudioContext exactly once, so `media-element.ts` remembers the `MediaElementAudioSourceNode` per element in a WeakMap. Creating a second Source on the same element (React StrictMode remounts) reuses the node; a different context throws. The node is connected to `context.destination` so the element stays audible.
- A MediaStream can feed any number of source nodes, so nothing is cached per stream. The stream node never reaches the destination (no microphone echo, WebRTC audio is already played by the app). Only the first audio track is analysed, chosen at creation; a replaced track means dispose and create a new Source. The core rejects a stream with no audio track before any AudioContext is created, so the error is a consistent TypeError rather than the browser's DOMException.
- `web-audio.ts` owns everything the three Web Audio Sources share: `createWebAudioParts(context, input, fftSize)` returns context, the private frame reader, `resume`, and an idempotent `dispose` that only removes the Source's own AnalyserNode (a second disconnect of a missing edge would throw InvalidAccessError).
- The node Source reads the node's first output. The app owns playback routing and the context lifetime. `audio-node.ts` distinguishes AudioContext from OfflineAudioContext using `close()`, which only the former provides; both provide `resume()`. This avoids relying on a same-window global constructor.
- `analyserNode.smoothingTimeConstant` is set to 0 because smoothing is a Visualizer parameter; every Source kind hands over raw frames.
- `analyser.update()` checks for a suspended AudioContext on every Web Audio read, before any Features buffer is modified. Source creation still works while suspended. The app calls and awaits `source.resume()` from a user gesture before updating; Ondulo does not resume automatically. Closed and interrupted contexts are outside this slice.
- Features arrays are typed `Float32Array<ArrayBuffer>` so they can be passed straight to the DOM's `getFloatTimeDomainData`. The core tsconfig adds the `DOM` lib.
- A MediaStream Source retains the audio tracks present at creation. Each read fails only when every retained track has `readyState === "ended"`; replacing tracks still requires disposing the Source and creating another one.
- A media element Source compares `currentSrc` with its owning document's origin. A cross-origin HTTP(S) resource requires a non-null `crossOrigin` value set before `src`; the error also directs the app to configure `Access-Control-Allow-Origin`. The guard runs before graph wiring and only reparses the URL when `currentSrc` or `crossOrigin` changes, so ordinary frame reads do not allocate. Browser-internal CORS labeling after redirects and the success of response headers are not exposed to the library.
- `useAnalyser` takes the core analyser options and memoizes by Source identity and individual frequency option values, so recreating an options object does not reset Features. It has no Source cleanup; the application owns Source disposal.

## Next slice

Implement `useFeatures` as a frame callback hook. It should call `analyser.update()` before delivering the same reusable Features object to a caller each animation frame, stop its loop on unmount or Analyser change, and avoid React state updates per frame. Add focused loop lifecycle tests.

## Remaining M1 work

- `useFeatures`, the next slice above.
- Final M1 public API review

## Known issues or blockers

None.
