import React, { useMemo, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet, useWindowDimensions, Text } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { colors } from '@/src/theme/colors';

export default function MeshPreview({ triangles }: { triangles: number[][][] }) {
  const { width } = useWindowDimensions();
  const [angle, setAngle] = useState({ yaw: 0.5, pitch: 0.3 });
  const origin = useRef(angle);
  const pan = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { origin.current = angle; },
    onPanResponderMove: (_, g) => setAngle({ yaw: origin.current.yaw + g.dx / 100, pitch: origin.current.pitch + g.dy / 100 }),
  }), [angle]);
  const size = Math.min(width - 48, 520);
  const polygons = useMemo(() => {
    const points = triangles.flat();
    if (!points.length) return [];
    const center = [0, 1, 2].map((axis) => (Math.min(...points.map((p) => p[axis])) + Math.max(...points.map((p) => p[axis]))) / 2);
    const radius = Math.max(...points.map((p) => Math.hypot(...p.map((v, i) => v - center[i]))), 0.01);
    return triangles.map((triangle) => {
      const rotated = triangle.map((p) => {
        const [x, y, z] = p.map((v, i) => (v - center[i]) / radius);
        const u = x * Math.cos(angle.yaw) - z * Math.sin(angle.yaw);
        const d = x * Math.sin(angle.yaw) + z * Math.cos(angle.yaw);
        return [u, y * Math.cos(angle.pitch) - d * Math.sin(angle.pitch), y * Math.sin(angle.pitch) + d * Math.cos(angle.pitch)];
      });
      return { depth: rotated.reduce((sum, p) => sum + p[2], 0), points: rotated.map((p) => `${size / 2 + p[0] * size * 0.4},${140 - p[1] * 110}`).join(' ') };
    }).sort((a, b) => a.depth - b.depth);
  }, [triangles, angle, size]);
  return <View testID="mesh-preview" style={s.root} {...pan.panHandlers}>
    <Svg width={size} height={280}>{polygons.map((p, i) => <Polygon key={i} points={p.points} fill={colors.cyan + '33'} stroke={colors.cyan + '88'} strokeWidth={0.5} />)}</Svg>
    <Text testID="mesh-preview-help" style={s.help}>Drag to rotate · preview samples the mesh</Text>
  </View>;
}
const s = StyleSheet.create({ root: { alignItems: 'center', borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden', paddingBottom: 15 }, help: { color: colors.textDim, fontSize: 12 } });