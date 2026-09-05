// @ts-expect-error - next-pwa belum nyediain type declaration
import withPWA from "next-pwa";

const pwaConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig = {
  // konfigurasi kamu yang udah ada, kalau ada
};

export default pwaConfig(nextConfig);
