import { resolveAudioContext } from "./audio-context.js";
import { createWebAudioParts, type WebAudioParts } from "./web-audio.js";

/**
 * Wires an AnalyserNode to a MediaStream (microphone or WebRTC) and returns
 * the Source's behaviour. The stream is never connected to the destination:
 * a microphone would feed back into the speakers, and WebRTC audio is already
 * played by the app. Unlike a media element, a stream can feed any number of
 * source nodes, so nothing is cached per stream.
 */
export function createMediaStreamParts(
  options: Readonly<{
    stream: MediaStream;
    context: AudioContext | undefined;
    fftSize: number;
  }>,
): WebAudioParts {
  // MediaStreamAudioSourceNode selects the creation-time audio track with the lowest id.
  const audioTracks = options.stream.getAudioTracks();
  if (audioTracks.length === 0) {
    throw new TypeError("MediaStream must have at least one audio track.");
  }
  const selectedTrack = audioTracks.reduce((selected, track) =>
    track.id < selected.id ? track : selected,
  );

  const context = resolveAudioContext(options.context);
  const streamNode = context.createMediaStreamSource(options.stream);
  const parts = createWebAudioParts(context, streamNode, options.fftSize);

  return {
    ...parts,
    read(waveform, spectrum) {
      if (selectedTrack.readyState === "ended") {
        throw new Error(
          "MediaStream's selected audio track has ended. Create a new Source for a replacement track.",
        );
      }
      parts.read(waveform, spectrum);
    },
  };
}
