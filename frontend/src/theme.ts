// Theme tokens for Corn Club
export const colors = {
  surface: "#121214",
  surfaceSecondary: "#1C1C1F",
  surfaceTertiary: "#27272A",
  onSurface: "#FFFFFF",
  onSurfaceSecondary: "#E4E4E7",
  onSurfaceTertiary: "#A1A1AA",
  brand: "#00E5A0",
  brandSecondary: "#00B37E",
  brandTertiary: "#004D36",
  onBrand: "#093021",
  border: "#27272A",
  borderStrong: "#3F3F46",
  success: "#00E5A0",
  warning: "#FFB020",
  error: "#FF4D4D",
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const fonts = {
  display: "BebasNeue_400Regular",
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodyBold: "DMSans_700Bold",
};

export const categoryMeta: Record<string, { icon: string; color: string }> = {
  Food: { icon: "fast-food-outline", color: "#FF6B6B" },
  Entertainment: { icon: "game-controller-outline", color: "#A78BFA" },
  Transport: { icon: "car-outline", color: "#60A5FA" },
  Income: { icon: "trending-up-outline", color: "#00E5A0" },
  Subscriptions: { icon: "repeat-outline", color: "#FFB020" },
  Other: { icon: "ellipsis-horizontal", color: "#A1A1AA" },
};
