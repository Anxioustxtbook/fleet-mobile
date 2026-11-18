/* Analysis: reached from the Audit's Analysis button. Month by month (billed, spent, what was left, how much of it was collected),
   then the cars and the clients that matter most. For looking only; the figures come from the desktop's own summary and fuel code. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card, Txt } from '../parts.js';
import { CountText, CountValue, usePullRefresh } from '../kit.js';
import { useSession, useTheme } from '../session.js';
import Skeleton from '../Skeleton.js';
import { ANALYSIS_LISTS, buildAnalysis } from '../analysis.js';
import { fmt } from '../tables.js';

export default function Analysis() {
  const s = useSession(), t = useTheme();
  const refreshControl = usePullRefresh(s, 'Analysis could not be refreshed');
  const [data, setData] = useState(null);
  const stamp = s.status ? `${s.status.lastSyncAt || ''}|${JSON.stringify(s.status.counts || {})}|${s.version}` : String(s.version);
  const load = useCallback(async () => { const d = {}; for (const l of ANALYSIS_LISTS) d[l] = await s.app.records.all(l); setData(d); }, [s.app]);
  useEffect(() => { load().catch(e => s.notify(e, 'The analysis could not be read')); }, [load, stamp]);
  const a = useMemo(() => (data ? buildAnalysis(data) : null), [data]);
  if (!a) return <Skeleton kind="cards" />;
  if (a.empty) return <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: 14 }}><Card><Txt bold size={17}>Analysis</Txt><Txt tone="dim" style={{ marginTop: 6 }}>{a.message}</Txt></Card></ScrollView>;
  const line = (label, value, tone, bold, count = false) => <View key={label} style={{ flexDirection: 'row', paddingVertical: 4 }}><Txt tone="dim" style={{ flex: 1 }}>{label}</Txt>{count ? <CountValue value={value} tone={tone === 'bad' ? 'red' : tone === 'ok' ? 'green' : 'ink'} /> : <Txt bold={bold} tone={tone}>{value}</Txt>}</View>;
  const bar = (v, color) => <View style={{ height: 7, borderRadius: 4, backgroundColor: t.panel3, marginTop: 3, overflow: 'hidden' }}><View style={{ width: `${Math.max(1, Math.round(100 * Math.max(0, v) / a.maxBar))}%`, height: 7, backgroundColor: color }} /></View>;
  return (
    <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
      <Pressable accessibilityRole="button" onPress={() => s.go('audit')} style={{ marginBottom: 10 }}><Text style={{ color: t.amber, fontSize: 14.5, fontWeight: '700' }}>‹ Back to the Audit</Text></Pressable>
      <Card>
        <Txt bold size={17}>All months</Txt>
        <Txt tone="dim" size={13} style={{ marginBottom: 6 }}>{a.busyMonths} months with activity</Txt>
        {line('Billed', fmt(a.totals.billed), undefined, false, true)}{line('Spent', fmt(a.totals.spent), undefined, false, true)}{line('Billed less spent', fmt(a.totals.net), a.totals.net < 0 ? 'bad' : 'ok', true, true)}
        {line('Collected so far', fmt(a.totals.collected), undefined, false, true)}{line('Average per month', fmt(a.totals.avgNet), undefined, false, true)}
        {line('Rentals', String(a.totals.rentals), undefined, false, true)}{line('Days hired out', String(a.totals.days), undefined, false, true)}
        {!!a.best && line('Best month', `${a.best.label} (${fmt(a.best.net)})`, 'ok')}{!!a.worst && line('Weakest month', `${a.worst.label} (${fmt(a.worst.net)})`, a.worst.net < 0 ? 'bad' : undefined)}
      </Card>
      <Card>
        <Txt bold size={16} style={{ marginBottom: 6 }}>Month by month</Txt>
        {a.months.filter(m => m.rentals || m.spent).map(m => (
          <View key={m.month} style={{ paddingVertical: 8, borderTopColor: t.line, borderTopWidth: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: t.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>{m.label}</Text><CountText value={m.net} format={fmt} size={15} weight="700" tone={m.net < 0 ? 'red' : 'green'} /></View>
            {bar(m.billed, t.green)}{bar(m.spent, t.amber)}
            <Text style={{ color: t.inkDim, fontSize: 12.5, marginTop: 4 }}>Billed {fmt(m.billed)} · Spent {fmt(m.spent)} · {m.rentals} rentals{m.collectedPct != null ? ` · ${m.collectedPct}% collected` : ''}</Text>
          </View>
        ))}
        <Txt tone="faint" size={12} style={{ marginTop: 6 }}>Green bar: billed. Amber bar: spent. Rent shown is only what is entered; see the Audit for months without it.</Txt>
      </Card>
      {!!a.cars.length && <Card><Txt bold size={16} style={{ marginBottom: 6 }}>Cars that earned most</Txt>
        {a.cars.map(c => <View key={c.vehicleId} style={{ paddingVertical: 6, borderTopColor: t.line, borderTopWidth: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: t.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>{c.reg}</Text><CountText value={c.net} format={fmt} size={15} weight="700" tone={c.net < 0 ? 'red' : 'ink'} /></View><Text style={{ color: t.inkDim, fontSize: 12.5 }}>{c.rentals} rentals · {c.days} days · billed {fmt(c.billed)}</Text></View>)}</Card>}
      {!!a.clients.length && <Card><Txt bold size={16} style={{ marginBottom: 6 }}>Clients who billed most</Txt>
        {a.clients.map(c => <View key={String(c.clientId)} style={{ paddingVertical: 6, borderTopColor: t.line, borderTopWidth: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: t.ink, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>{c.name}</Text><CountText value={c.billed} format={fmt} size={15} weight="700" /></View><Text style={{ color: c.owed ? t.red : t.inkDim, fontSize: 12.5 }}>{c.rentals} rentals{c.owed ? ' · owes ' + fmt(c.owed) : ' · nothing owed'}</Text></View>)}</Card>}
    </ScrollView>
  );
}
