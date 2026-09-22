import type { Metadata } from "next";
import { Ubuntu } from "next/font/google";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Toaster } from "@/components/ui/sonner";
import AppProvider from "@/providers/app-provider";
import { AppQueryClientProvider } from "@/providers/query-client-provider";
import Theme from "@/providers/theme-provider";
import "./css/style.css";

const ubuntu = Ubuntu({
  weight: ["300", "400", "500", "700"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-ubuntu",
});

export const metadata: Metadata = {
  title: "Lab Trxckin",
  description: "Convex + AuthKit + NestJS",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { accessToken } = await withAuth();
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${ubuntu.className} ${ubuntu.variable} font-ubuntu antialiased bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400`}
      >
        <Theme>
          <ConvexClientProvider expectAuth={!!accessToken}>
            <AppQueryClientProvider>
              <AppProvider>
                {children}
                <Toaster />
              </AppProvider>
            </AppQueryClientProvider>
          </ConvexClientProvider>
        </Theme>
      </body>
    </html>
  );
}
