import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // vinext checks origin hostnames before API route CORS runs.
  allowedDevOrigins: ["fjflmeaiboafcffacfmlaopangaedjho"],
};

export default nextConfig;
