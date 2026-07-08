import "./globals.css";

export const metadata = {
  title: "AXdea · 아이디어 놀이터",
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#080a14",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
