# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "Swift" - a fast AI voice assistant built with Next.js, featuring real-time speech-to-text, AI-powered responses, and text-to-speech synthesis. The app supports multiple AI providers and includes advanced features like streaming responses, authentication, and internationalization.

## Key Technologies

- **Next.js 15.3.0** with App Router and TypeScript
- **React 19.1.0** with modern concurrent features
- **AI Services**: Groq (Whisper transcription), Cartesia (TTS), ElevenLabs, Azure, MiniMax
- **Audio Processing**: Web Audio API, VAD (Voice Activity Detection) with @ricky0123/vad-react
- **Authentication**: OAuth 2.0 with Google integration
- **Internationalization**: next-intl for multi-language support (en, es, fr, ja, ko, zh-TW, zh)
- **Testing**: Jest with React Testing Library and jsdom environment
- **Styling**: Tailwind CSS 4.1.3 with PostCSS
- **Logging**: Winston for structured logging
- **Validation**: Zod for runtime type checking

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check

# Type check
pnpm type-check

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Architecture Overview

### Core Components

1. **AgentCore Service** (`app/lib/agentCore.ts`): HTTP client for external AI agent API with streaming support, timeout management, and error handling
2. **Audio Player** (`app/lib/hooks/usePlayer.ts`): Web Audio API wrapper for queued audio playback with proper cleanup
3. **Authentication Module** (`app/lib/auth.ts`): OAuth 2.0 implementation with secure token management and refresh logic
4. **Audio Services** (`app/lib/audio.ts`): Direct provider integrations for transcription and TTS without complex abstractions

### API Architecture

- **Main API Route** (`app/api/route.ts`): Handles voice processing pipeline with request cancellation, streaming support, and provider switching
- **Request Management**: Token-based request cancellation to prevent overlapping requests
- **Streaming Pipeline**: SSE-based real-time text and audio streaming

### Configuration System

- **Provider Configs** (`app/config/index.ts`): Centralized configuration for AI providers with environment variable support
- **Multi-Provider Support**: Groq, Cartesia, Deepgram, ElevenLabs, Azure, MiniMax
- **AgentCore Config**: Base URL, stream timeout, retry settings

## Environment Variables

Required environment variables:

- `GROQ_API_KEY`: For Whisper transcription
- `CARTESIA_API_KEY`: For Sonic TTS (primary TTS provider)
- `NEXT_PUBLIC_AGENT_CORE_API`: External AI agent service URL
- `ELEVENLABS_API_KEY`: For ElevenLabs TTS
- `AZURE_SPEECH_API_KEY`: For Azure TTS
- `MINIMAX_API_KEY`: For MiniMax TTS
- `MINIMAX_GROUP_ID`: Required for MiniMax API calls
- Voice ID configuration for each TTS provider

## Development Guidelines

### Testing

- Jest configuration with jsdom environment for React components
- Test setup with `jest.setup.js` for testing-library extensions
- Module path mapping with `@/` alias support
- Test files follow pattern: `*.test.ts` or `*.test.tsx`
- Run single test: `pnpm test -- --testNamePattern="test name"`

### Code Organization

- **Component Structure**: React components in `app/components/`
- **Business Logic**: Custom hooks in `app/lib/hooks/`, services in `app/lib/`
- **Internationalization**: Message files in `app/messages/` (7 languages supported)
- **API Logic**: Server-side code in `app/api/`
- **Configuration**: Provider configs in `app/config/`

### Audio Processing

- Audio is streamed and queued for seamless playback
- Supports multiple audio formats (WAV, WebM) with PCM conversion
- Implements proper cleanup and error handling for Web Audio API
- Voice Activity Detection (VAD) for user speech detection with @ricky0123/vad-react
- Text sanitization for TTS to prevent API issues

### Authentication Flow

- OAuth 2.0 with Google integration
- Secure token storage with automatic refresh
- CSRF protection with state validation
- Event-driven architecture for auth state changes

### Streaming Implementation

- Server-Sent Events (SSE) for real-time responses
- Separate text and audio streaming channels
- Request cancellation support with AbortController
- Buffered audio streaming for performance
- Timeout management and error handling

## Common Development Tasks

### Adding New AI Providers

1. Add provider configuration to `app/config/index.ts`
2. Implement provider-specific logic in `app/lib/audio.ts`
3. Update environment variables and types
4. Add provider to the settings UI
5. Update locale mapping for AgentCore if needed

### Debugging Audio Issues

- Check Web Audio API context state
- Monitor audio buffer queue status
- Verify provider API responses
- Test with different audio formats

### Testing Authentication

- Mock OAuth responses in tests
- Test token refresh scenarios
- Verify state validation logic
- Test cleanup and logout flows

## Key Files to Understand

- `app/api/route.ts`: Main voice processing pipeline
- `app/lib/agentCore.ts`: External AI service integration with streaming
- `app/lib/hooks/usePlayer.ts`: Audio playback management
- `app/lib/audio.ts`: Direct provider integrations for transcription and TTS
- `app/lib/auth.ts`: Authentication and token management
- `app/config/index.ts`: Provider configurations and environment mapping
- `jest.config.js`: Testing configuration with Next.js integration
