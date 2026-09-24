import type { NextConfig } from 'next';

// Set only by apps/frontend/Dockerfile: the image runs the self-contained standalone server, and
// types are already checked by the CI job that gates the deploy, so the image build skips them.
const dockerBuild = process.env.NEXT_DOCKER_BUILD === 'true';

const nextConfig: NextConfig = {
  agentRules: false,
  output: dockerBuild ? 'standalone' : undefined,
  typescript: { ignoreBuildErrors: dockerBuild },
};

export default nextConfig;
