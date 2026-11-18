import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Tag, Txt } from '../parts.js';
import { useSession, useTheme } from '../session.js';
import { heldReason, recordName } from '../logic.js';
import RecordEditor from './RecordEditor.js';

export default function SyncOverview() {
  const s = useSession(), t = useTheme();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const result = s.syncResult || {};
  const held = Number(result.held) || 0;

  const load = useCallback(async () => {
    const open = await s.app.review.open();
    setItems(open.filter(item => item.kind === 'held'));
  }, [s.app]);

  useEffect(() => {
    load().catch(error => s.notify(error, 'The sync overview could not be loaded'));
  }, [load, s.version, s.notify]);

  const edit = async item => {
    try {
      const record = await s.app.records.get(item.list, item.recId);
      if (!record) {
        s.notify(new Error('That record is no longer on the phone. Nothing was changed.'), 'Record unavailable');
        return;
      }
      setEditing({ item, list: item.list, record });
    } catch (error) {
      s.notify(error, 'The record could not be opened');
    }
  };

  const saved = async () => {
    setEditing(null);
    await s.refresh();
    await load();
  };

  const title = held ? 'Sync needs attention' : result.totalsOk ? 'Sync complete' : 'Sync finished with differences';
  const description = held
    ? 'The records below are still on this phone. Fix the missing links, save, then sync again.'
    : result.totalsOk
      ? 'The phone and computer have finished exchanging records.'
      : 'Some totals differ. Check the Review list before continuing.';

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
      <Card style={{ borderColor: held ? t.orange : result.totalsOk ? t.green : t.line }}>
        <Tag text={held ? 'Needs attention' : result.totalsOk ? 'Complete' : 'Check review'} />
        <Txt bold size={18} style={{ marginTop: 8 }}>{title}</Txt>
        <Txt tone="dim" style={{ marginTop: 5 }}>{description}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Tag text={`Sent ${Number(result.pushed) || 0}`} />
          <Tag text={`Received ${Number(result.pulled) || 0}`} />
          {held ? <Tag text={`Waiting ${held}`} /> : null}
        </View>
      </Card>

      {held ? (
        <>
          <Txt bold size={16} style={{ marginTop: 8, marginBottom: 8 }}>Waiting for the computer</Txt>
          {items === null ? (
            <Card><Txt tone="dim">Loading records that need changes…</Txt></Card>
          ) : items.length ? items.map(item => (
            <Card key={item.id}>
              <Tag text={recordName(item.list, item.recId)} />
              <Txt tone="amber" size={13} style={{ marginTop: 4 }}>{heldReason(item)}</Txt>
              <Button label="Edit record" kind="go" onPress={() => edit(item)} style={{ marginTop: 10 }} />
            </Card>
          )) : (
            <Card><Txt tone="dim">{held} record{held === 1 ? ' is' : 's are'} waiting. Open the Review list for details.</Txt></Card>
          )}
          <Button label="Sync corrected records" kind="go" disabled={!s.canSync} onPress={s.sync} style={{ marginTop: 8 }} />
        </>
      ) : null}

      {!result.totalsOk && !held ? <Button label="Open Review list" onPress={() => s.go('review')} style={{ marginTop: 8 }} /> : null}
      <RecordEditor editing={editing} onClose={() => setEditing(null)} onSaved={saved} />
    </ScrollView>
  );
}
