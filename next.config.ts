import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only libraries loaded at runtime instead of bundled (read-excel-file pulls in unzipper's optional deps;
  // @libsql/client has native bindings for local files).
  serverExternalPackages: ["read-excel-file", "sharp", "pdfkit", "heic-convert", "@libsql/client", "libsql"],
  // the PDF report reads these fonts from disk; make sure serverless bundles include them
  outputFileTracingIncludes: {
    "/api/report": ["./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf", "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"],
  },
};

export default nextConfig;
