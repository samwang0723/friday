# AgentCore Voice Realtime Architecture Design

## Overview

This document outlines the architecture for extending the Swift AI voice assistant with realtime voice streaming capabilities. The design integrates bidirectional voice communication through AgentCore while maintaining consistency with existing patterns.

## 1. Core Architecture Components

### 1.1 AgentCore Service Extensions

**New Methods Added to `AgentCoreService`:**

```typescript
// Send voice packet for realtime processing
async sendVoicePacket(
  audioData: ArrayBuffer,
  token: string,
  metadata: VoiceMetadata,
  context?: ClientContext
): Promise<void>

// Start realtime voice streaming
async *voiceRealtimeStream(
  token: string,
  context?: ClientContext,
  externalAbort?: AbortSignal
): AsyncGenerator<RealtimeVoiceResponse>
```

### 1.2 TypeScript Interfaces

**Voice Metadata Structure:**

```typescript
interface VoiceMetadata {
  sessionId?: string;
  timestamp: number;
  audioFormat: "webm" | "wav" | "pcm";
  sampleRate: number;
  channels: number;
  encoding?: string;
  sequenceNumber?: number;
  endOfInput?: boolean;
}
```

**Realtime Voice Response:**

```typescript
interface RealtimeVoiceResponse {
  type: "transcription" | "text" | "audio" | "control" | "error" | "complete";
  data:
    | VoiceTranscriptionData
    | VoiceTextData
    | VoiceAudioData
    | VoiceControlData
    | VoiceErrorData
    | VoiceCompleteData;
  timestamp: number;
  sessionId?: string;
}
```

## 2. SSE Streaming Architecture

### 2.1 Event Types and Structure

**Event Types:**

- `transcription` - Real-time speech-to-text results
- `text` - AI assistant text responses
- `audio` - Audio chunks from TTS
- `control` - Session management commands
- `error` - Error handling
- `complete` - Session completion

**SSE Message Format:**

```
event: transcription
data: {"content": "Hello", "isFinal": false, "confidence": 0.95}

event: audio
data: {"chunk": "base64data", "format": "pcm_s16le", "sampleRate": 24000}

event: complete
data: {"sessionId": "sess_123", "finalTranscript": "Complete message"}
```

### 2.2 Streaming Flow

1. **Session Initialization**: Client opens SSE connection to `/voice/realtime`
2. **Audio Upload**: Client sends audio chunks via `sendVoicePacket()`
3. **Bidirectional Streaming**:
   - Transcription events stream user speech
   - Text events stream AI responses
   - Audio events stream TTS output
4. **Session Management**: Control events handle session lifecycle

## 3. API Endpoint Specification

### 3.1 POST /api/v1/voice/realtime

**Purpose**: Establish realtime voice streaming session

**Request:**

```json
{
  "sessionConfig": {
    "audioFormat": "pcm_s16le",
    "sampleRate": 24000,
    "channels": 1,
    "enableTranscription": true,
    "enableTTS": true
  }
}
```

**Response**: SSE stream with event types listed above

**Headers:**

- `Authorization: Bearer <token>`
- `Accept: text/event-stream`
- `X-Client-Timezone: America/New_York`
- `X-Locale: en`

### 3.2 POST /api/v1/voice/packet

**Purpose**: Send audio chunks for processing

**Request**: Multipart form data

- `audio`: Audio blob with appropriate MIME type
- `metadata`: JSON metadata object

**Response**: 200 OK on successful upload

## 4. Integration Patterns

### 4.1 Authentication Integration

**Consistent with Existing Patterns:**

- Bearer token authentication via `Authorization` header
- Automatic logout on 401 responses
- Context headers (`X-Client-Timezone`, `X-Locale`, `X-Client-Datetime`)

```typescript
// Reuses existing header generation
const headers = this.getHeaders(
  token,
  context?.timezone,
  context?.clientDatetime,
  context?.locale
);
```

### 4.2 Request Lifecycle Management

**Timeout Management:**

- Inherits `streamTimeout` from existing config
- Uses same AbortController patterns
- External abort signal support

**Error Handling:**

- Consistent with existing `handleResponse()` method
- 401 triggers logout callback
- AbortError handling for graceful cancellation

### 4.3 Audio Format Support

**Input Formats:**

- WebM (existing pipeline compatibility)
- WAV (standard format)
- PCM (raw audio data)

**Output Format:**

- PCM S16LE at 24kHz (consistent with existing TTS)
- Base64 encoded chunks for SSE transmission

## 5. Implementation Guidelines

### 5.1 Code Organization

**File Structure:**

```
app/lib/agentCore.ts          # Extended with voice methods
app/api/voice/
  realtime/route.ts           # SSE streaming endpoint
  packet/route.ts             # Audio upload endpoint
app/types/voiceRealtime.ts    # New voice interfaces
```

### 5.2 Error Handling Patterns

**Follow Existing Conventions:**

```typescript
// Network errors
if (!response.ok) {
  if (response.status === 401) {
    this.onLogout?.();
  }
  await this.handleResponse(response);
}

// Abort handling
if (err.name === "AbortError") {
  console.info("Stream cancelled");
  return; // Graceful exit
}
```

### 5.3 Testing Considerations

**Unit Tests:**

- Mock AgentCore voice methods
- Test SSE event parsing
- Validate audio packet handling

**Integration Tests:**

- End-to-end voice streaming
- Session management
- Error recovery scenarios

## 6. Performance Optimizations

### 6.1 Audio Streaming

**Buffering Strategy:**

- 16KB audio chunks (consistent with existing pipeline)
- Sequence numbering for ordered delivery
- Base64 encoding for SSE compatibility

**Memory Management:**

- Stream processing to avoid large buffers
- Proper cleanup of AbortControllers
- Reader lock management

### 6.2 Network Efficiency

**Connection Management:**

- Keep-alive for SSE connections
- Multipart uploads for audio efficiency
- Compression for text events

## 7. Security Considerations

### 7.1 Authentication

**Token Validation:**

- Bearer token required for all endpoints
- Session-based access control
- Token expiration handling

### 7.2 Audio Data Security

**Transport Security:**

- HTTPS required for audio transmission
- Temporary audio data (no persistent storage)
- Secure multipart handling

## 8. Backward Compatibility

### 8.1 Existing API Preservation

**No Breaking Changes:**

- Existing `/api` endpoint unchanged
- Current voice pipeline remains functional
- Settings compatibility maintained

### 8.2 Progressive Enhancement

**Gradual Adoption:**

- New realtime features are additive
- Fallback to existing pipeline if needed
- Feature detection for client capabilities

## 9. Usage Examples

### 9.1 Basic Realtime Session

```typescript
const agentCore = new AgentCoreService();

// Start streaming session
const voiceStream = agentCore.voiceRealtimeStream(
  accessToken,
  clientContext,
  abortSignal
);

// Process events
for await (const event of voiceStream) {
  switch (event.type) {
    case "transcription":
      handleTranscription(event.data);
      break;
    case "audio":
      playAudioChunk(event.data);
      break;
    case "complete":
      handleSessionComplete(event.data);
      break;
  }
}
```

### 9.2 Audio Upload

```typescript
// Send audio chunk
await agentCore.sendVoicePacket(
  audioBuffer,
  accessToken,
  {
    timestamp: Date.now(),
    audioFormat: "webm",
    sampleRate: 48000,
    channels: 1,
    sequenceNumber: chunkIndex
  },
  clientContext
);
```

## 10. Deployment Considerations

### 10.1 Environment Variables

**New Configuration:**

```env
AGENT_CORE_VOICE_TIMEOUT=60000
VOICE_BUFFER_SIZE=16384
MAX_VOICE_SESSION_DURATION=300000
```

### 10.2 Monitoring

**Metrics to Track:**

- Voice session duration
- Audio packet loss rates
- SSE connection stability
- Transcription accuracy
- End-to-end latency

This architecture provides a robust foundation for realtime voice capabilities while maintaining consistency with the existing Swift codebase patterns and conventions.
