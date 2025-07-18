# Friday

Friday is a fast, multilingual AI voice assistant with real-time speech processing and intelligent audio synthesis.

## ✨ Key Features

### 🗣️ **Advanced Voice Processing**

- **Real-time Speech-to-Text**: [Groq](https://groq.com) powers fast inference of [OpenAI Whisper](https://github.com/openai/whisper) for accurate transcription
- **Intelligent Text Generation**: [Meta Llama 3](https://llama.meta.com/llama3/) provides smart conversational responses
- **Voice Activity Detection**: [VAD](https://www.vad.ricky0123.com/) detects speech with echo cancellation and interruption support

### 🔊 **Multi-Engine Audio Synthesis**

- **[Cartesia Sonic](https://cartesia.ai/sonic)**: High-quality streaming speech synthesis
- **[ElevenLabs](https://elevenlabs.io)**: Premium voice generation with multilingual support
- **Smart Engine Selection**: Automatic TTS engine switching based on language requirements

### 🌍 **Multilingual Support**

- **7 Languages**: English, Chinese (Simplified & Traditional), Japanese, Korean, Spanish, French
- **Locale-Aware Processing**: Automatic language detection and appropriate service routing
- **Intelligent TTS Routing**: ElevenLabs for non-English languages, flexible options for English

### ⚡ **Real-Time Performance**

- **Streaming Responses**: Character-by-character text display with smooth typing animation
- **Low-Latency Audio**: Buffered audio streaming for seamless playback
- **Smart Caching**: Optimized request handling with automatic cancellation

### 🔧 **Customizable Experience**

- **Persistent Settings**: User preferences saved across sessions (STT/TTS engines, streaming)
- **OAuth Authentication**: Secure Google Sign-In integration
- **Responsive Design**: Optimized for desktop and mobile devices
- **Accessibility**: Full keyboard navigation and screen reader support

### 🛠️ **Modern Architecture**

- **Next.js 15**: App Router with TypeScript and server-side rendering
- **Component Architecture**: Modular, reusable UI components
- **External Agent Integration**: Configurable AgentCore service with streaming support
- **Production Ready**: Deployed on [Vercel](https://vercel.com) with analytics

Thank you to the teams at Groq, Cartesia, and ElevenLabs for providing access to their APIs!

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- API keys for Groq, Cartesia, and ElevenLabs
- Optional: AgentCore service URL for external AI integration

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/samwang0723/friday.git
   cd friday
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in the required environment variables:

   ```env
   # Required APIs
   GROQ_API_KEY=your_groq_api_key
   CARTESIA_API_KEY=your_cartesia_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key

   # Optional: External Agent Service
   AGENT_CORE_API_URL=your_agent_core_url

   # OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

4. **Start development server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Development Commands

```bash
# Development
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server

# Code Quality
pnpm lint             # Run ESLint
pnpm typecheck        # Run TypeScript checks

# Testing
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
```

## 🏗️ Architecture

### Core Components

- **`app/page.tsx`**: Main voice assistant interface
- **`app/components/`**: Reusable UI components (ChatForm, Settings, VoiceOrb)
- **`app/lib/`**: Core services and utilities
  - **`agentCore.ts`**: External AI service integration
  - **`hooks/`**: Custom React hooks (useAuth, usePlayer, useVAD)
  - **`audio/`**: Speech processing utilities

### Key Features Implementation

- **Locale Support**: `app/lib/i18n.ts` + cookie-based persistence
- **Settings Persistence**: localStorage with graceful fallbacks
- **Real-time Streaming**: SSE-based text and audio streaming
- **Voice Processing**: VAD with echo cancellation and interruption handling

### API Routes

- **`/api/route.ts`**: Main voice processing pipeline
- **Streaming Support**: Server-Sent Events for real-time responses
- **Request Management**: Token-based cancellation and cleanup

## 🌐 Internationalization

The app supports 7 languages with complete UI translations:

- English (`en`)
- Chinese Simplified (`zh`)
- Chinese Traditional (`zh-TW`)
- Japanese (`ja`)
- Korean (`ko`)
- Spanish (`es`)
- French (`fr`)

### Adding New Languages

1. Add locale to `app/lib/i18n-client.ts`
2. Create translation file in `app/messages/{locale}.json`
3. Update AgentCore locale mapping if needed

## 🔧 Configuration

### TTS Engine Selection

- **English**: User can choose between Cartesia and ElevenLabs
- **Non-English**: Automatically uses ElevenLabs for best quality
- **Override**: Configurable via settings with locale-aware restrictions

### Voice Activity Detection

- **Threshold**: Configurable speech detection sensitivity
- **Echo Cancellation**: Prevents false detection during TTS playback
- **Interruption**: Allows users to interrupt AI responses

### External Agent Integration

Configure `AGENT_CORE_API_URL` to connect with external AI services:

- Supports streaming responses with X-Locale headers
- Includes timezone and datetime context
- Handles authentication and request cancellation
