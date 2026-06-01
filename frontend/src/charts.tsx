import React from "react";
import { View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { colors } from "./theme";

type Slice = { value: number; color: string; label?: string };

export function PieChart({ data, size = 180, strokeWidth = 28 }: { data: Slice[]; size?: number; strokeWidth?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total <= 0) {
    return (
      <View>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={radius} stroke={colors.surfaceTertiary} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      </View>
    );
  }

  return (
    <Svg width={size} height={size}>
      <G rotation={-90} originX={cx} originY={cy}>
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const el = (
            <Circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              stroke={d.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </G>
    </Svg>
  );
}

export function BarChart({ data, height = 160 }: { data: { label: string; value: number; color: string }[]; height?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 8, paddingVertical: 8 }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          <View
            style={{
              width: "70%",
              height: `${Math.max(4, (d.value / max) * 100)}%`,
              backgroundColor: d.color,
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
            }}
          />
        </View>
      ))}
    </View>
  );
}
