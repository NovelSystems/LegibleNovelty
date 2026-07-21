/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting is run as its own check.sh step (pnpm run lint); don't duplicate it
  // during `next build`.
  eslint: { ignoreDuringBuilds: true },
  // Keep Prisma Client out of the bundler's server-component tracing.
  serverExternalPackages: ["@prisma/client", "@auth/prisma-adapter"],
};

export default nextConfig;
