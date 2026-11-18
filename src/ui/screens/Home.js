/* Home (UI_SPEC 5.1, v5 Jirani): greeting, bell and sync pill; the hero card; quick actions; four stat cards; the red
   "need attention" card; Overdue payments; Out now; Next 7 days; Latest payments; By car (Summary / Full list).
   All figures come from homeData.js, which reads the phone's records with the app's existing rules. */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSession } from '../session.js';
import { useLook, useUI } from '../look.js';
import { AppReady } from '../ready.js';
import Icon from '../Icon.js';
import Skeleton from '../Skeleton.js';
import { Avatar, Badge, Card, CountText, CountValue, Eyebrow, IconCircle, NumBadge, PrivacyToggle, PrivacyValue, Progress, Row, Section, T, TableCard, ViewButton, AlertCard, usePullRefresh, useReducedMotion } from '../kit.js';
import { FIXED, carColour } from '../theme.js';
import { HOME_LISTS, buildHome, buildProgressReport, greeting, progressReportSchedule } from '../homeData.js';
import { ksh0, kshShort } from '../money.js';
import { syncPill, waitingCount } from '../syncState.js';
import { todayISO } from '../forms.js';
import { plural } from '../dates.js';
import { openAccount } from '../Pages.js';
import { targetRef } from '../Tour.js';
import { openRecord } from '../RecordPage.js';
import { dsh } from '../dates.js';

const LOGO = require('../../../assets/logo.png');
const QUICK = [['key', 'Rental', 'rentals'], ['wallet', 'Payment', 'payments'], ['bk', 'Booking', 'bookings'], ['receipt', 'Expense', 'expenses']];
const humanName = name => String(name || '').trim().split(/\s+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(' ');

function Pill({ pill, onPress }) {
  const { t, s: sc } = useUI();
  const [bg, fg] = pill.red ? [t.redbg, t.red] : pill.kind === 'wait' ? [t.orangebg, t.orange] : pill.kind === 'busy' ? [t.goldbg, t.goldt] : [t.greenbg, t.green];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={pill.a11y} onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: sc(5), minHeight: sc(28), paddingHorizontal: sc(9), paddingVertical: sc(5), borderRadius: sc(16), backgroundColor: bg }}>
      <View style={{ width: sc(6), height: sc(6), borderRadius: sc(3), backgroundColor: fg }} />
      <T size={11} weight="600" tone={fg}>{pill.label}</T>
      {pill.red ? <View style={{ position: 'absolute', right: -2, top: -3, width: sc(7), height: sc(7), borderRadius: sc(4), backgroundColor: '#D64541', borderWidth: 1.5, borderColor: t.bg }} /> : null}
    </Pressable>
  );
}

function BellButton({ onPress }) {
  const { t, s: sc } = useUI(), reduced = useReducedMotion(), swing = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { swing.setValue(0); return undefined; }
    const native = Platform.OS !== 'web';
    const animation = Animated.sequence([
      Animated.delay(500),
      Animated.timing(swing, { toValue: 1, duration: 100, useNativeDriver: native }),
      Animated.timing(swing, { toValue: -1, duration: 180, useNativeDriver: native }),
      Animated.timing(swing, { toValue: 0, duration: 120, useNativeDriver: native })
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduced, swing]);
  const rotation = swing.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-8deg', '0deg', '8deg'] });
  return (
    <Pressable ref={targetRef('bell')} accessibilityRole="button" accessibilityLabel="Notifications" onPress={onPress}
      style={{ width: Math.max(48, sc(42)), height: Math.max(48, sc(42)), borderRadius: 30, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ transform: [{ rotate: rotation }] }}><Icon name="bell" size={19} /></Animated.View>
      <NumBadge n={0} />
    </Pressable>
  );
}

function comparisonText(value) {
  if (!value) return '';
  if (value.percent === null) return 'New vs last month';
  return `${value.direction === 'up' ? '↑ ' : value.direction === 'down' ? '↓ ' : ''}${value.percent}% vs last month`;
}

function Hero({ h, ready, onPress, dashboardImage, privacyHidden }) {
  const { s: sc } = useUI();
  return (
    <Pressable ref={targetRef('hero')} accessibilityRole="button" accessibilityLabel="Open the full dashboard" onPress={onPress}
      style={{ borderRadius: sc(26), overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: '#1c222b', padding: sc(22), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: sc(10), elevation: 4 }}>
      {dashboardImage
        ? <Image source={{ uri: dashboardImage }} resizeMode="cover" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.62 }} accessibilityLabel="" />
        : <Image source={LOGO} resizeMode="contain" style={{ position: 'absolute', right: sc(6), top: '3%', height: '94%', aspectRatio: 284 / 281 }} accessibilityLabel="" />}
      <Svg style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} width="100%" height="100%" pointerEvents="none">
        <Defs><LinearGradient id="hf" x1="0" y1="0" x2="1" y2="0"><Stop offset="0.3" stopColor="#0c1016" stopOpacity="1" /><Stop offset="0.7" stopColor="#0c1016" stopOpacity="0" /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#hf)" />
      </Svg>
      <View style={{ position: 'absolute', right: sc(16), top: sc(16), flexDirection: 'row', alignItems: 'center', gap: sc(4), backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: sc(4), paddingHorizontal: sc(9), borderRadius: sc(10) }}>
        <T size={12} weight="700" tone="#F6B94A">Full dashboard</T><Icon name="r" size={14} color="#F6B94A" />
      </View>
      <T size={11} weight="600" tone={FIXED.hero.eyebrow} upper spacing={2}>{h.label}</T>
      <PrivacyValue hidden={privacyHidden}><CountText value={ready ? h.billed : 0} format={kshShort} size={40} weight="700" mono tone="white" style={{ marginTop: sc(6) }} /></PrivacyValue>
      <T size={16} tone={FIXED.hero.dim}>{`billed from ${plural(h.rentals, 'rental')}`}</T>
      <PrivacyValue hidden={privacyHidden}><T size={10} tone={FIXED.hero.dim}>{comparisonText(h.comparisons && h.comparisons.billed)}</T></PrivacyValue>
      <View style={{ flexDirection: 'row', gap: sc(26), marginTop: sc(22) }}>
        {[['Received', h.received, '#4BCB7C'], ['Spent', h.spent, '#FFFFFF'], ['Net', h.net, '#F6B94A']].map(([l, v, c]) => (
          <View key={l}><T size={13} tone={FIXED.hero.dim}>{l}</T><PrivacyValue hidden={privacyHidden}><CountText value={v} format={kshShort} size={16} weight="700" mono tone={c} /></PrivacyValue>
            <PrivacyValue hidden={privacyHidden}><T size={10} tone={FIXED.hero.dim}>{comparisonText(h.comparisons && h.comparisons[l.toLowerCase()])}</T></PrivacyValue></View>
        ))}
      </View>
    </Pressable>
  );
}

function Stat({ label, icon, value, valueTone, count, children, sub, onPress, privacyHidden, comparison }) {
  const { s: sc } = useUI();
  return (
    <Card onPress={onPress} style={{ flex: 1, padding: sc(16) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T size={14} tone="dim">{label}</T><Icon name={icon} size={16} /></View>
      <PrivacyValue hidden={privacyHidden} style={{ marginTop: sc(10), marginBottom: sc(6) }}>{count != null ? <CountText value={count} format={kshShort} size={24} weight="700" mono tone={valueTone} /> : value != null ? <T size={24} weight="700" mono tone={valueTone}>{value}</T> : children}</PrivacyValue>
      {comparison ? <PrivacyValue hidden={privacyHidden}><T size={10.5} weight="600" tone={comparison.direction === 'down' ? 'red' : comparison.direction === 'up' ? 'green' : 'dim'}>{comparisonText(comparison)}</T></PrivacyValue> : null}
      {sub}
    </Card>
  );
}

function ProgressReport({ visible, home, report, privacyHidden, onClose }) {
  const { t, s: sc } = useUI();
  if (!home || !report) return null;
  const items = [
    ['Fleet in use', `${home.stats.fleet.out} of ${home.stats.fleet.total} vehicles`],
    ['Available now', `${home.stats.fleet.available} vehicles`],
    ['Owed to us', ksh0(home.stats.owed.total)],
    ['Rentals in period', String(report.rentals)],
    ['Billed in period', ksh0(report.billed)],
    ['Received in period', ksh0(report.received)],
    ['Expenses in period', ksh0(report.expenses)],
    ['Net in period', ksh0(report.net)],
    ['Fuel in period', ksh0(report.fuel)],
    ['Pickups / returns', `${report.pickups} / ${report.returns}`],
    ['Fuel account balance', ksh0(home.stats.fuelBalance)],
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'center', padding: sc(20) }}>
        <Card style={{ width: '100%', maxWidth: sc(420), alignSelf: 'center', padding: sc(20) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: sc(4) }}>
            <View style={{ flex: 1 }}><Eyebrow>{report.range}</Eyebrow><T size={22} weight="700">{`Progress Report (${report.title})`}</T></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Progress Report" onPress={onClose} style={{ padding: sc(8) }}><Icon name="x" size={20} /></Pressable>
          </View>
          <T size={13.5} tone="dim" style={{ marginBottom: sc(12) }}>{report.frequency === 'monthly' ? 'Current month to date · business standing now' : 'Previous full week · business standing now'}</T>
          {items.map(([label, value], index) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: sc(9), borderTopWidth: index ? 1 : 0, borderTopColor: t.line }}>
              <T size={14} tone="dim" style={{ flex: 1 }}>{label}</T>
              <PrivacyValue hidden={privacyHidden}><T size={14.5} weight="700" mono>{value}</T></PrivacyValue>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: sc(48), marginTop: sc(12), borderRadius: sc(16), alignItems: 'center', justifyContent: 'center', backgroundColor: t.gold }}>
            <T size={15} weight="700" tone="onfab">Continue</T>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

function ByCar({ b, privacyHidden }) {
  const { t, s: sc } = useUI(), [view, setView] = useState('sum');
  const mx = Math.max(1, ...b.cars.map(c => c.billed));
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: sc(22), marginBottom: sc(10), marginHorizontal: sc(4) }}>
        <Eyebrow>{`By car · ${b.label}`}</Eyebrow><ViewButton value={view} onChange={setView} />
      </View>
      {!b.cars.length ? <Card><T size={14.5} tone="dim">No rentals this month yet.</T></Card>
        : view === 'sum' ? (
          <Card flush>
            {b.cars.map(c => (
              <Row key={String(c.vehicleId)} dot={carColour(c.colour)} title={`${c.reg}${c.model ? ' · ' + c.model : ''}`} sub={`${plural(c.rentals, 'rental')} · ${plural(c.days, 'day')} · fuel ${ksh0(c.fuel)}`}
                extra={<Progress pct={Math.round(100 * c.billed / mx)} />}
                right={<><PrivacyValue hidden={privacyHidden}><CountValue value={c.billed} format={ksh0} /></PrivacyValue><PrivacyValue hidden={privacyHidden}><T size={12} tone={c.net < 0 ? 'red' : 'green'}>{`net ${ksh0(c.net)}`}</T></PrivacyValue></>} />
            ))}
            <View style={{ backgroundColor: t.card2 }}>
              <Row last title="All cars" sub={`${plural(b.total.rentals, 'rental')} · ${plural(b.total.days, 'day')} · fuel ${ksh0(b.total.fuel)}`}
                right={<><PrivacyValue hidden={privacyHidden}><CountText value={b.total.billed} format={ksh0} size={14.5} weight="700" mono /></PrivacyValue><PrivacyValue hidden={privacyHidden}><T size={12} tone={b.total.net < 0 ? 'red' : 'green'}>{`net ${ksh0(b.total.net)}`}</T></PrivacyValue></>} />
            </View>
          </Card>
        ) : (
          <TableCard total head={[['Vehicle'], ['Rentals', 1], ['Days', 1], ['Billed', 1], ['Fuel', 1], ['Other', 1], ['Net', 1]]}
            rows={[...b.cars.map(c => [c.reg, c.rentals, c.days, c.billed.toLocaleString('en-US'), c.fuel.toLocaleString('en-US'), c.other.toLocaleString('en-US'), c.net.toLocaleString('en-US')]),
              ['All cars', b.total.rentals, b.total.days, b.total.billed.toLocaleString('en-US'), b.total.fuel.toLocaleString('en-US'), b.total.other.toLocaleString('en-US'), b.total.net.toLocaleString('en-US')]]} />
        )}
    </View>
  );
}

export default function Home() {
  const S = useSession(), look = useLook(), { t, s: sc } = useUI(), ready = useContext(AppReady), st = S.status;
  const refreshControl = usePullRefresh(S, 'Home could not be refreshed');
  const profile = look.prefs.profile, profilePhoto = look.prefs.photos.profile;
  const name = humanName(profile.name);
  const privacyHidden = look.prefs.privacyHidden;
  const initials = profile.name.trim().split(/\s+/).map(part => part[0] || '').join('').slice(0, 2).toUpperCase() || 'MB';
  const [data, setData] = useState(null), [waiting, setWaiting] = useState(0), [todayOpen, setTodayOpen] = useState(false);
  const stamp = st ? `${st.lastSyncAt || ''}|${JSON.stringify(st.counts || {})}|${S.version}` : '';
  const load = useCallback(async () => {
    const d = {};
    for (const l of HOME_LISTS) d[l] = await S.app.records.all(l);
    setData(d); setWaiting(await waitingCount(S.app.records));
  }, [S.app]);
  useEffect(() => { load().catch(e => S.notify(e, 'Home could not be read')); }, [load, stamp]);          // again after a sync or any saved change
  const today = todayISO();
  const home = useMemo(() => (data ? buildHome(data, today) : null), [data, today]);
  const report = useMemo(() => (data ? buildProgressReport(data, today, look.prefs.todayPopup.frequency) : null), [data, today, look.prefs.todayPopup.frequency]);
  useEffect(() => {
    if (!home || S.todayPopupShown) return undefined;
    const scheduled = progressReportSchedule(look.prefs.todayPopup, today, new Date(), look.prefs.todayPopupLastShownKey);
    if (!scheduled) return undefined;
    const timer = setTimeout(() => {
      S.markTodayPopupShown();
      look.setTodayPopupLastShownKey(scheduled.key);
      setTodayOpen(true);
    }, scheduled.waitMs);
    return () => clearTimeout(timer);
  }, [home, S.todayPopupShown, S.markTodayPopupShown, look.prefs.todayPopup, look.prefs.todayPopupLastShownKey, look.setTodayPopupLastShownKey, today]);
  const pill = syncPill({ bar: S.bar, paired: !!(st && st.paired), lastSyncAt: st ? st.lastSyncAt : null, waiting });
  if (!home) return <Skeleton kind="cards" />;
  const { hero, stats, attention, overdue, out, next7, payments, byCar } = home, f = stats.fleet;
  const dim13 = { marginTop: sc(2) };
  return (
    <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: sc(16), paddingBottom: sc(28) }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(10), marginBottom: sc(14) }}>
        <Pressable ref={targetRef('home')} accessibilityRole="button" accessibilityLabel="Open account" onPress={() => openAccount(S)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: sc(12), minHeight: 48 }}>
          <Avatar size={44} initials={initials} source={profilePhoto} />
          <View style={{ flexShrink: 1 }}>
            <T size={13} tone="dim">{`Welcome, ${name}`}</T>
            <T size={19} weight="700" numberOfLines={1}>{`${greeting()} \uD83D\uDC4B`}</T>
          </View>
        </Pressable>
        <BellButton onPress={() => S.go('notifs')} />
        <PrivacyToggle />
        <Pill pill={pill} onPress={() => S.go('connect')} />
      </View>

      <Hero h={hero} ready={ready} privacyHidden={privacyHidden} dashboardImage={look.prefs.photos.dashboard} onPress={() => S.go('deskdash')} />

      <View style={{ flexDirection: 'row', gap: sc(9), marginVertical: sc(14) }}>
        {QUICK.map(([ic, label, form]) => (
          <Pressable key={label} accessibilityRole="button" accessibilityLabel={`New ${label.toLowerCase()}`} onPress={() => S.openForm({ form })}
            style={{ flex: 1, minHeight: 48, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: sc(20), paddingTop: sc(14), paddingBottom: sc(12), paddingHorizontal: sc(4), alignItems: 'center', gap: sc(8) }}>
            <View style={{ width: sc(40), height: sc(40), borderRadius: sc(20), backgroundColor: t.goldbg, alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={22} color={t.goldt} /></View>
            <T size={13} weight="600">{label}</T>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: sc(12) }}>
        <Stat label="Fleet in use" icon="up" privacyHidden={privacyHidden} onPress={() => S.go('vehicles')}
          sub={<T size={13.5} tone="dim">{`${plural(f.available, 'car')} available now`}</T>}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <CountText value={f.out} size={24} weight="700" mono />
            <T size={15} tone="dim">{` of ${f.total} out`}</T>
          </View>
          <Progress pct={f.pct} />
        </Stat>
        <Stat label="Owed to us" icon="up" count={stats.owed.total} valueTone="red" privacyHidden={privacyHidden} onPress={() => S.go('audit')} sub={<T size={13.5} tone="dim">{`across ${plural(stats.owed.rentals, 'rental')}`}</T>} />
      </View>
      <View style={{ flexDirection: 'row', gap: sc(12), marginTop: sc(12) }}>
        <Stat label="Fuel spent" icon="fuel" count={stats.fuelMonth} valueTone="orange" privacyHidden={privacyHidden} comparison={stats.fuelComparison} onPress={() => S.go('fuel')} sub={<T size={13.5} tone="dim">this month</T>} />
        <Stat label="Ola balance" icon="fuel" count={stats.fuelBalance} valueTone={stats.fuelBalance < 0 ? 'red' : 'ink'} privacyHidden={privacyHidden} onPress={() => S.go('fuel')} sub={<T size={13.5} tone="dim">{stats.fuelBalance < 0 ? 'owed to the station' : 'in the account'}</T>} />
      </View>

      {attention.total > 0 ? <AlertCard count={attention.total} title={`${attention.total} need attention`} sub={attention.top} onPress={() => S.go('alerts')} /> : null}

      <Section title="Overdue payments" action="View all" onAction={() => S.go('overdue')} />
      {overdue.count ? (
        <Card onPress={() => S.go('overdue')} style={{ padding: sc(16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(14) }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <PrivacyValue hidden={privacyHidden}><CountText value={overdue.total} format={ksh0} size={22} weight="700" mono tone="red" /></PrivacyValue>
              <T size={13.5} tone="dim" style={dim13}>{`${plural(overdue.count, 'rental')} unpaid · oldest ${plural(overdue.oldest, 'day')}`}</T>
            </View>
            <Badge text="View" kind="gd" />
          </View>
        </Card>
      ) : <Card><T size={14.5} tone="dim">Nothing is overdue. Every rental is paid up.</T></Card>}

      <Section title="Out now · returning" action="Rentals" onAction={() => S.go('rentals')} />
      {out.length ? (
        <Card flush>
          {out.slice(0, 8).map((o, i, a) => (
            <Row key={o.id} last={i === a.length - 1} dot={carColour(o.colour)} title={`${o.reg}${o.model ? ' · ' + o.model : ''}`}
              sub={`${o.client}${o.owed ? ' · owes ' + ksh0(o.owed) : ''}`} right={<Badge text={o.badge.text} kind={o.badge.kind} />}
              onPress={() => openRecord(S, { list: 'rentals', id: o.id, title: `${o.reg} · ${o.client}` })} />
          ))}
        </Card>
      ) : <Card><T size={14.5} tone="dim">No cars are out right now.</T></Card>}
      {out.length > 8 ? <T size={13} tone="dim" style={{ marginTop: sc(6), marginLeft: sc(4) }}>{`and ${out.length - 8} more in Rentals`}</T> : null}

      <Section title="Next 7 days" action="Calendar" onAction={() => S.go('calendar')} />
      {next7.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -sc(16) }} contentContainerStyle={{ paddingHorizontal: sc(16), gap: sc(10), paddingBottom: sc(4) }}>
          {next7.map(e => (
            <Pressable key={e.key} accessibilityRole="button" onPress={() => (e.kind === 'Pickup' ? S.go('bookings') : openRecord(S, { list: 'rentals', id: e.id, title: `${e.reg} · ${e.client}` }))}
              style={{ width: sc(178), minHeight: 48, padding: sc(14), borderRadius: sc(20), backgroundColor: t.card, borderWidth: 1, borderColor: t.line, alignItems: 'flex-start' }}>
              <T size={12.5} weight="700" tone="gold" upper spacing={0.5}>{e.when}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(7), marginTop: sc(8), marginBottom: sc(3) }}>
                <View style={{ width: sc(12), height: sc(12), borderRadius: sc(6), backgroundColor: carColour(e.colour) }} /><T size={16.5} weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{e.reg}</T>
              </View>
              <T size={13.5} tone="dim" numberOfLines={1}>{e.model}</T>
              <T size={13.5} weight="600" numberOfLines={1} style={{ marginBottom: sc(8) }}>{e.client}</T>
              <Badge kind={e.kind === 'Pickup' ? 'gd' : 'bl'} text={e.kind === 'Pickup' ? `Pickup${e.time ? ' · ' + e.time : ''}` : 'Return due'} />
              {e.pending ? <T size={12.5} tone="dim" style={{ marginTop: sc(8) }}>Booking still pending</T> : e.deposit ? <T size={12.5} tone="dim" style={{ marginTop: sc(8) }}>{`Deposit ${ksh0(e.deposit)}`}</T> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : <Card><T size={14.5} tone="dim">Nothing is due in the next 7 days.</T></Card>}

      <Section title="Latest payments" action="All payments" onAction={() => S.go('payments')} />
      {payments.length ? (
        <Card flush>
          {payments.map((p, i) => (
            <Row key={p.key} last={i === payments.length - 1} onPress={() => S.go('payments')} leading={<IconCircle name={p.amount < 0 ? 'receipt' : 'wallet'} tone={p.amount < 0 ? 'red' : 'green'} />}
              title={<T size={15.5} weight="700">{p.title}</T>} sub={p.sub}
              right={<><PrivacyValue hidden={privacyHidden}><T size={14.5} weight="700" mono tone={p.amount < 0 ? 'red' : 'green'}>{`${p.amount < 0 ? '-' : '+'}${ksh0(Math.abs(p.amount))}`}</T></PrivacyValue><Badge text={p.kind === 'in' ? 'Money in' : 'Money out'} kind={p.kind === 'in' ? 'ok' : 'bad'} /></>} />
          ))}
        </Card>
      ) : <Card><T size={14.5} tone="dim">No payments yet.</T></Card>}

      <ByCar b={byCar} privacyHidden={privacyHidden} />
      <ProgressReport visible={todayOpen} home={home} report={report} privacyHidden={privacyHidden} onClose={() => setTodayOpen(false)} />
    </ScrollView>
  );
}
