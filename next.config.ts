import type { NextConfig } from "next";
import pkg from "./package.json";

const basePath = '/rsvp';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
