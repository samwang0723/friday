import React, { useCallback, useRef, useState } from 'react';

export interface WebMRecorderConfig {
  mimeType?: string;
  audioBitsPerSecond?: number;
}

export interface WebMRecorderState {
  isRecording: boolean;
  isAvailable: boolean;
  error: string | null;
}

export interface WebMRecorder {
  state: WebMRecorderState;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

/**
 * Hook for direct WebM recording from microphone
 * Provides real-time WebM encoding without Float32Array conversion
 */
export function useWebMRecorder(
  stream: MediaStream | undefined,
  config: WebMRecorderConfig = {}
): WebMRecorder {
  const [state, setState] = useState<WebMRecorderState>({
    isRecording: false,
    isAvailable: false,
    error: null
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Default configuration
  const mimeType = config.mimeType || 'audio/webm;codecs=opus';
  const audioBitsPerSecond = config.audioBitsPerSecond || 128000;

  // Check if MediaRecorder and WebM are supported
  const isSupported = useCallback(() => {
    if (!window.MediaRecorder) {
      return false;
    }
    return MediaRecorder.isTypeSupported(mimeType);
  }, [mimeType]);

  // Initialize MediaRecorder when stream becomes available
  const initializeRecorder = useCallback(() => {
    if (!stream || !isSupported()) {
      setState(prev => ({
        ...prev,
        isAvailable: false,
        error: !stream ? 'No audio stream available' : 'WebM format not supported'
      }));
      return;
    }

    try {
      const options = {
        mimeType,
        audioBitsPerSecond
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setState(prev => ({
          ...prev,
          error: 'Recording error occurred',
          isRecording: false
        }));
      };

      setState(prev => ({
        ...prev,
        isAvailable: true,
        error: null
      }));

      console.log('WebM MediaRecorder initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaRecorder:', error);
      setState(prev => ({
        ...prev,
        isAvailable: false,
        error: 'Failed to initialize recorder'
      }));
    }
  }, [stream, isSupported, mimeType, audioBitsPerSecond]);

  // Initialize recorder when stream changes
  React.useEffect(() => {
    initializeRecorder();
    
    return () => {
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
      }
    };
  }, [initializeRecorder]);

  const startRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    
    if (!recorder || !state.isAvailable) {
      console.warn('Cannot start recording: recorder not available');
      return;
    }

    if (recorder.state === 'recording') {
      console.warn('Recording already in progress');
      return;
    }

    try {
      // Clear previous chunks
      chunksRef.current = [];
      
      // Start recording
      recorder.start();
      
      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null
      }));
      
      console.log('WebM recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to start recording'
      }));
    }
  }, [state.isAvailable]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      
      if (!recorder || recorder.state !== 'recording') {
        console.warn('Cannot stop recording: not currently recording');
        resolve(null);
        return;
      }

      // Set up stop handler
      const handleStop = () => {
        try {
          // Create WebM blob from chunks
          const webmBlob = new Blob(chunksRef.current, { type: mimeType });
          
          setState(prev => ({
            ...prev,
            isRecording: false
          }));
          
          console.log('WebM recording stopped, blob size:', webmBlob.size);
          resolve(webmBlob);
        } catch (error) {
          console.error('Error creating WebM blob:', error);
          setState(prev => ({
            ...prev,
            isRecording: false,
            error: 'Failed to create recording'
          }));
          resolve(null);
        }
        
        // Cleanup listener
        recorder.removeEventListener('stop', handleStop);
      };

      // Add stop event listener
      recorder.addEventListener('stop', handleStop);
      
      // Stop recording
      try {
        recorder.stop();
      } catch (error) {
        console.error('Error stopping recorder:', error);
        recorder.removeEventListener('stop', handleStop);
        setState(prev => ({
          ...prev,
          isRecording: false,
          error: 'Failed to stop recording'
        }));
        resolve(null);
      }
    });
  }, [mimeType]);

  return {
    state,
    startRecording,
    stopRecording
  };
}