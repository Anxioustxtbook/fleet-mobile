import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSession } from '../session.js';
import { useUI } from '../look.js';
import { Badge, Card, PageHead, Row, T, usePullRefresh } from '../kit.js';
import Skeleton from '../Skeleton.js';
import { buildAttention } from '../attention.js';
import { todayISO } from '../forms.js';

const LEVEL_KIND = { r: 'bad', o: 'am', b: 'bl' };

export default function NeedsAttention() {
  const S = useSession(), { s: sc } = useUI();
  const refreshControl = usePullRefresh(S, 'Needs attention could not be refreshed');
  const [data, setData] = useState(null);
  const stamp = S.status ? `${S.status.lastSyncAt || ''}|${JSON.stringify(S.status.counts || {})}|${S.version}` : String(S.version);

  const load = useCallback(async () => {
    const next = {};
    for (const list of ['vehicles', 'clients', 'drivers', 'rentals', 'bookings', 'payments', 'expenses', 'insurance', 'fuelAccount']) {
      next[list] = await S.app.records.all(list);
    }
    setData(next);
  }, [S.app]);

  useEffect(() => { load().catch(e => S.notify(e, 'Needs attention could not be read')); }, [load, stamp]);

  const attention = useMemo(() => data ? buildAttention(data, todayISO()) : null, [data]);
  if (!attention) return <Skeleton kind="list" />;

  const open = item => {
    if (item.to === 'overdue') S.go('overdue');
    else if (item.to === 'rentals') S.go('rentals');
    else if (item.to === 'bookings') S.go('bookings');
    else if (item.to === 'vehicles') S.go('vehicles');
    else if (item.to === 'subhire') S.go('subhire');
    else if (item.to === 'audit') S.go('audit');
    else S.go(item.to);
  };

  return (
    <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: sc(16), paddingBottom: sc(28) }}>
      <PageHead eyebrow={`${attention.total} ITEMS`} title="Needs attention" />
      {attention.items.length ? (
        <Card flush>
          {attention.items.map((item, index) => (
            <Row key={item.t} last={index === attention.items.length - 1}
              onPress={() => open(item)} title={item.t} sub={item.s || 'Check this item'}
              right={<Badge text={String(item.n)} kind={LEVEL_KIND[item.lv] || 'nt'} />} />
          ))}
        </Card>
      ) : (
        <Card><T size={15} tone="dim">Nothing needs attention. Records and account checks are clear.</T></Card>
      )}
    </ScrollView>
  );
}
