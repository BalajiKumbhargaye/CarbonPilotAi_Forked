/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@carbonpilot/shared', '@carbonpilot/validation', '@carbonpilot/config'],
};

export default nextConfig;
