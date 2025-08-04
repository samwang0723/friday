import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./app/lib/i18n.ts");
const CopyPlugin = require("copy-webpack-plugin");

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
            value: "cross-origin"
          }
        ]
      }
    ];
  },
  webpack: (config, {}) => {
    config.resolve.extensions.push(".ts", ".tsx");
    config.resolve.fallback = { fs: false };

    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: "node_modules/onnxruntime-web/dist/*.wasm",
            to: "../public/[name][ext]"
          },
          {
            from: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
            to: "../public/[name][ext]"
          },
          {
            from: "node_modules/@ricky0123/vad-web/dist/*.onnx",
            to: "../public/[name][ext]"
          }
        ]
      })
    );

    return config;
  }
};

export default withNextIntl(nextConfig);
