# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "Swift" - a fast AI voice assistant built with Next.js, featuring real-time speech-to-text, AI-powered responses, and text-to-speech synthesis. The app supports multiple AI providers and includes advanced features like streaming responses, authentication, and internationalization.

## Key Technologies

- **Next.js 15** with App Router and TypeScript
- **AI Services**: Groq (Whisper transcription + Llama), Cartesia (TTS), ElevenLabs, Azure, MiniMax
- **Audio Processing**: Web Audio API, VAD (Voice Activity Detection)
- **Authentication**: OAuth 2.0 with Google integration
- **Internationalization**: next-intl for multi-language support
- **Testing**: Jest with React Testing Library

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

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Architecture Overview

### Core Components

1. **AgentCore Service** (`app/lib/agentCore.ts`): HTTP client for external AI agent API with streaming support, retry logic, and error handling
2. **Audio Player** (`app/lib/usePlayer.ts`): Web Audio API wrapper for queued audio playback with proper cleanup
3. **Authentication Module** (`app/lib/auth.ts`): OAuth 2.0 implementation with secure token management and refresh logic
4. **Audio Providers** (`app/lib/audio/`): Abstracted transcription and TTS services supporting multiple providers

### API Architecture

- **Main API Route** (`app/api/route.ts`): Handles voice processing pipeline with request cancellation, streaming support, and provider switching
- **Request Management**: Token-based request cancellation to prevent overlapping requests
- **Streaming Pipeline**: SSE-based real-time text and audio streaming

### Configuration System

- **Provider Configs** (`app/config/index.ts`): Centralized configuration for AI providers with environment variable support
- **Multi-Provider Support**: Groq, Cartesia, Deepgram, ElevenLabs, Azure, MiniMax

## Environment Variables

Required environment variables (see `.env.example`):
- `GROQ_API_KEY`: For Whisper transcription and Llama responses
- `CARTESIA_API_KEY`: For Sonic TTS (primary TTS provider)
- `AGENT_CORE_API_URL`: External AI agent service URL
- Additional provider keys for ElevenLabs, Azure, MiniMax, etc.

## Development Guidelines

### Testing

- Tests are located in `app/lib/__tests__/`
- Use Jest configuration with jsdom environment
- Test files follow pattern: `*.test.ts`
- Run single test: `pnpm test -- --testNamePattern="test name"`

### Code Organization

- **Component Structure**: React components in `app/components/`
- **Business Logic**: Custom hooks and services in `app/lib/`
- **Internationalization**: Message files in `app/messages/`
- **API Logic**: Server-side code in `app/api/`

### Audio Processing

- Audio is streamed and queued for seamless playback
- Supports multiple audio formats (WAV, WebM)
- Implements proper cleanup and error handling for Web Audio API
- Voice Activity Detection (VAD) for user speech detection

### Authentication Flow

- OAuth 2.0 with Google integration
- Secure token storage with automatic refresh
- CSRF protection with state validation
- Event-driven architecture for auth state changes

### Streaming Implementation

- Server-Sent Events (SSE) for real-time responses
- Separate text and audio streaming channels
- Request cancellation support for improved UX
- Buffered audio streaming for performance

## Common Development Tasks

### Adding New AI Providers

1. Add provider configuration to `app/config/index.ts`
2. Implement provider-specific logic in `app/lib/audio/`
3. Update environment variables and types
4. Add provider to the settings UI

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
- `app/lib/agentCore.ts`: External AI service integration
- `app/lib/usePlayer.ts`: Audio playback management
- `app/lib/auth.ts`: Authentication and token management
- `app/config/index.ts`: Provider configurations
- `jest.config.js`: Testing configuration