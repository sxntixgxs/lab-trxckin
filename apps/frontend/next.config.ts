import type { NextConfig } from 'next';

// Set only by apps/frontend/Dockerfile: the image runs the self-contained standalone server, and
// types are already checked by the CI job that gates the deploy, so the image build skips them.
const dockerBuild = process.env.NEXT_DOCKER_BUILD === 'true';

const nextConfig: NextConfig = {
  agentRules: false,
  output: dockerBuild ? 'standalone' : undefined,
  typescript: { ignoreBuildErrors: dockerBuild },
  // RUT extraction renders PDFs server-side for the image-only fallback model (lib/rut/pdf-image.ts):
  // keep the native canvas out of the bundle so the standalone output traces its binary as a file.
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
