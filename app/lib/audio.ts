export const startAudioPlayerWorklet = async (): Promise<
  [AudioWorkletNode, AudioContext]
> => {
  // 1. Create an AudioContext
  const audioPlayerContext = new AudioContext({
    sampleRate: 24000
  });

  // 2. Load your custom processor code
  await audioPlayerContext.audioWorklet.addModule(
    "/js/pcm-player-processor.js"
  );

  // 3. Create an AudioWorkletNode
  const audioPlayerNode = new AudioWorkletNode(
    audioPlayerContext,
    "pcm-player-processor"
  );

  // 4. Connect to the destination
  audioPlayerNode.connect(audioPlayerContext.destination);

  // The audioPlayerNode.port is how we send messages (audio data) to the processor
  return [audioPlayerNode, audioPlayerContext];
};
