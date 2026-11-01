import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, Text } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { donorPosition, pantryPosition } from '../data/places';
import { dash } from '../i18n/strings';
import { layoutLabels } from '../live/labelLayout';
import { project, FRAME, type PlaceRow, type RouteLeg } from '../live/schematic';
import { useTheme } from '../theme/theme';
import { SPACE, TYPE } from '../theme/tokens';

type MapView = 'map' | 'table';
const PAD = 28;
const MAX_H = 420;
/** Label priority on the map: donors first, then pantries, then drivers (the legend's order). Lower is placed first. */
const KIND_PRIORITY = { donor: 0, pantry: 1, driver: 2 } as const;

/**
 * The schematic map and its table alternative (DSH-06). Positions come from the bundled coordinates; no tile server,
 * no Maps key. The table lists the same places, so nothing depends on the map.
 */
export function MapPanel({ places, routes }: { places: readonly PlaceRow[]; routes: readonly RouteLeg[] }) {
  const { c } = useTheme();
  const [view, setView] = useState<MapView>('map');
  return (
    <View style={styles.wrap}>
      <View style={styles.switch} accessibilityRole="radiogroup">
        {(['map', 'table'] as const).map((v) => {
          const on = view === v;
          const label = dash.mapSwitch[v];
          return (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.segment,
                { borderColor: c.onTape, backgroundColor: on ? c.onTape : 'transparent', opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[TYPE.bodyStrong, { color: on ? c.tape : c.onTape }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {view === 'map' ? <SchematicMap places={places} routes={routes} /> : <PlacesTable places={places} />}
    </View>
  );
}

function SchematicMap({ places, routes }: { places: readonly PlaceRow[]; routes: readonly RouteLeg[] }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const W = Math.max(200, width - 2 * SPACE.l);
  const H = Math.min(Math.round(W * 0.8), MAX_H);
  const at = (p: { lat: number; lon: number }) => project(p, FRAME, W, H, PAD);
  // Labels are placed so they do not overlap each other or a marker (src/live/labelLayout.ts). A label that fits nowhere
  // is left off the map; the table lists every place.
  const labels = layoutLabels(
    places.map((row) => {
      const { x, y } = at(row.position);
      return { key: row.key, text: row.id, x, y, priority: KIND_PRIORITY[row.kind] };
    }),
    { width: W, height: H, fontSize: 12 },
  );
  const idByKey = new Map(places.map((row) => [row.key, row.id] as const));

  return (
    <ScrollView contentContainerStyle={styles.mapScroll}>
      <View accessible accessibilityRole="image" accessibilityLabel={dash.mapA11y} style={[styles.mapBox, { backgroundColor: c.tape, borderColor: c.onTape }]}>
        <Svg width={W} height={H}>
          <Rect x={0} y={0} width={W} height={H} fill={c.tape} />
          {routes.map((leg) => {
            const d = donorPosition(leg.donorId);
            const p = pantryPosition(leg.pantryId);
            if (!d || !p) return null;
            const a = at(d);
            const b = at(p);
            return (
              <Line
                key={`route-${leg.lotId}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={c.onTape}
                strokeWidth={2.5}
                strokeDasharray={leg.dashed ? '8 6' : undefined}
              />
            );
          })}
          {places.map((row) => {
            const { x, y } = at(row.position);
            if (row.kind === 'donor') {
              return (
                <Rect key={row.key} x={x - 7} y={y - 7} width={14} height={14} fill={c.kraft} stroke={c.kraftEdge} strokeWidth={2} />
              );
            }
            if (row.kind === 'pantry') {
              return <Circle key={row.key} cx={x} cy={y} r={7} fill={c.tape} stroke={c.onTape} strokeWidth={2.5} />;
            }
            return <Polygon key={row.key} points={`${x},${y - 8} ${x + 7},${y + 6} ${x - 7},${y + 6}`} fill={c.tarp} />;
          })}
          {labels.map((l) =>
            l.placement === null ? null : (
              <SvgText key={`label-${l.key}`} x={l.x} y={l.y} fontSize={12} fill={c.onTape}>
                {idByKey.get(l.key)}
              </SvgText>
            ),
          )}
          <SvgText x={PAD} y={H - 8} fontSize={12} fill={c.textMuted}>
            {dash.schematic}
          </SvgText>
        </Svg>
      </View>
      <Legend />
      {places.length === 0 ? <Text style={[TYPE.small, { color: c.onTape }]}>{dash.noPlaces}</Text> : null}
    </ScrollView>
  );
}

function Legend() {
  const { c } = useTheme();
  return (
    <View style={styles.legend}>
      <View style={styles.legendRow}>
        <Svg width={16} height={16} importantForAccessibility="no" accessibilityElementsHidden>
          <Rect x={2} y={2} width={12} height={12} fill={c.kraft} stroke={c.kraftEdge} strokeWidth={2} />
        </Svg>
        <Text style={[TYPE.small, { color: c.onTape }]}>{dash.legend.donor}</Text>
      </View>
      <View style={styles.legendRow}>
        <Svg width={16} height={16} importantForAccessibility="no" accessibilityElementsHidden>
          <Circle cx={8} cy={8} r={6} fill={c.tape} stroke={c.onTape} strokeWidth={2.5} />
        </Svg>
        <Text style={[TYPE.small, { color: c.onTape }]}>{dash.legend.pantry}</Text>
      </View>
      <View style={styles.legendRow}>
        <Svg width={16} height={16} importantForAccessibility="no" accessibilityElementsHidden>
          <Polygon points="8,2 14,14 2,14" fill={c.tarp} />
        </Svg>
        <Text style={[TYPE.small, { color: c.onTape }]}>{dash.legend.driver}</Text>
      </View>
      <View style={styles.legendRow}>
        <Svg width={28} height={16} importantForAccessibility="no" accessibilityElementsHidden>
          <Line x1={1} y1={8} x2={27} y2={8} stroke={c.onTape} strokeWidth={2.5} strokeDasharray="8 6" />
        </Svg>
        <Text style={[TYPE.small, { color: c.onTape }]}>{dash.legend.tentative}</Text>
      </View>
      <Text style={[TYPE.small, { color: c.onTape }]}>{dash.legendNote}</Text>
    </View>
  );
}

/** The places in words: Name, Role, Where, Right now, From. Stacked per place so it fits a phone without sideways scrolling. */
function PlacesTable({ places }: { places: readonly PlaceRow[] }) {
  const { c } = useTheme();
  const h = dash.tableHead;
  return (
    <ScrollView contentContainerStyle={styles.tableList}>
      {places.length === 0 ? <Text style={[TYPE.small, { color: c.onTape }]}>{dash.noPlaces}</Text> : null}
      {places.map((row) => {
        const role = dash.role[row.kind];
        const label = dash.rowA11y(row.name, role, row.street, row.rightNow, row.from);
        return (
          <View key={row.key} accessible accessibilityRole="text" accessibilityLabel={label} style={[styles.tableRow, { borderBottomColor: c.rule }]}>
            <Text style={[TYPE.bodyStrong, { color: c.onTape }]}>{row.name}</Text>
            <Field label={h.role} value={role} />
            <Field label={h.where} value={row.street} />
            <Field label={h.rightNow} value={row.rightNow || '-'} />
            {row.from ? <Field label={h.from} value={row.from} /> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <Text style={[TYPE.small, { color: c.onTape }]}>
      <Text style={{ fontWeight: '700' }}>{`${label}: `}</Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: SPACE.l, paddingTop: SPACE.s, gap: SPACE.s },
  switch: { flexDirection: 'row', gap: SPACE.s },
  segment: { minHeight: 48, minWidth: 96, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 4, paddingHorizontal: SPACE.m },
  mapScroll: { gap: SPACE.s, paddingBottom: SPACE.l },
  mapBox: { borderWidth: 1.5, borderRadius: 4, overflow: 'hidden', alignSelf: 'stretch' },
  legend: { gap: SPACE.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  tableList: { gap: SPACE.s, paddingBottom: SPACE.l },
  tableRow: { gap: 2, paddingBottom: SPACE.s, borderBottomWidth: StyleSheet.hairlineWidth },
});
