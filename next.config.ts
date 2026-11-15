import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only libraries loaded at runtime instead of bundled (read-excel-file pulls in unzipper's optional deps).
  serverExternalPackages: ["read-excel-file", "sharp", "pdfkit"],
};

export default nextConfig;
