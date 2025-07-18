import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./app/lib/i18n.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
        port: "",
        pathname: "/**"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin"
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp"
          }
        ]
      }
    ];
  },
  webpack: (config, { isServer }) => {
    // Handle VAD worker files properly
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false
      };

      // Add proper handling for worker files
      config.module.rules.push({
        test: /\.worker\.js$/,
        use: { loader: "worker-loader" }
      });
    }

    return config;
  }
};

export default withNextIntl(nextConfig);
