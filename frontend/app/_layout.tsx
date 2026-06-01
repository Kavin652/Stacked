import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts as useBebas, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { useFonts as useDmSans, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from "@expo-google-fonts/dm-sans";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";

SplashScreen.preventAutoHideAsync();

function RootNav() {
  const router = useRouter();
  const segments = useSegments();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const inTabs = segments[0] === "(tabs)";

    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && !user.onboarded && segments[1] !== "onboarding") {
      router.replace("/(auth)/onboarding");
    } else if (user && user.onboarded && !inTabs) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

  return <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "#121214" } }} />;
}

export default function RootLayout() {
  const [iconsLoaded, iconErr] = useIconFonts();
  const [bebasLoaded] = useBebas({ BebasNeue_400Regular });
  const [dmLoaded] = useDmSans({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  const ready = (iconsLoaded || iconErr) && bebasLoaded && dmLoaded;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNav />
    </AuthProvider>
  );
}
