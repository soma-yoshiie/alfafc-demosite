/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 仲間共有用：静的HTML書き出し（out/ に index.html＋アセット一式）
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
