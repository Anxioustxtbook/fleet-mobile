/* The entry form in the new look: a full page for a vehicle, driver, client, booking, rental, payment, expense or fuel top-up.
   Made for fast typing: Enter moves to the next field, picking from a list or tapping a choice moves on by itself,
   dates and times are typed loosely ("1011", "10/11", "930") and shown back in full, and the last Enter saves.
   All the rules (what is required, what is checked, what is saved) are in ../forms.js; this file only draws them.
   Save gives feedback: a spinner and "Saving", then a green tick and "Saved", a toast, and the page closes. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../session.js';
import { useLook, useUI } from '../look.js';
import Icon from '../Icon.js';
import { Btn, Chip, Field, FieldPick, FieldSwitch, FieldText, FormPage, GradientBox, T, useToast } from '../kit.js';
import { FORMS, FORM_NEEDS, applyChange, blankValues, checkForm, choicesOf, dateWords, formTitle, parseDate, parseTime, matches, pickLabel, pickOptions, planSave, suggestions, recordMonth, rentalPreview, todayISO, valuesFromRecord, visibleFields } from '../forms.js';
import { monthName } from '../tables.js';
import { layoutFields } from '../formLayout.js';
import { FIXED, SIZE } from '../theme.js';

const TEXTY = new Set(['text', 'phone', 'number', 'money', 'int', 'date', 'time']);
export const SAVED_SHOW_MS = 650, SAVED_CLOSE_MS = 420;

function FloatingAddButton({ onPress, hasFooter }) {
  const look = useLook(), { t, s, tap } = useUI(), insets = useSafeAreaInsets(), { width, height } = useWindowDimensions();
  const size = tap(56), corner = look.prefs.floatingAddCorner, enabled = look.prefs.floatingAddEnabled;
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false), interaction = useRef({ at: 0, moved: false, longPressed: false, movingAtStart: false }), timer = useRef(null);
  const drag = useRef(new Animated.ValueXY()).current;
  movingRef.current = moving;
  const anchorStyle = value => {
    const top = value.startsWith('top-');
    const left = value.endsWith('-left');
    return {
      position: 'absolute',
      top: top ? s(SIZE.pageHead + 12) : undefined,
      bottom: top ? undefined : insets.bottom + (hasFooter ? s(88) : s(16)),
      left: left ? s(16) : undefined,
      right: left ? undefined : s(16)
    };
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      interaction.current = { at: Date.now(), moved: false, longPressed: false, movingAtStart: movingRef.current };
      drag.setValue({ x: 0, y: 0 });
      timer.current = setTimeout(() => {
        interaction.current.longPressed = true;
        movingRef.current = true;
        setMoving(true);
      }, 450);
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10) {
        interaction.current.moved = true;
        if (!interaction.current.longPressed && !interaction.current.movingAtStart && timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      }
      if (movingRef.current) drag.setValue({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: (_, gesture) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const state = interaction.current;
      if ((state.movingAtStart || state.longPressed) && state.moved) {
        const vertical = gesture.moveY < height / 2 ? 'top' : 'bottom';
        const horizontal = gesture.moveX < width / 2 ? 'left' : 'right';
        look.setFloatingAddCorner(`${vertical}-${horizontal}`);
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: true, damping: 20, stiffness: 190, mass: 0.85 }).start();
        movingRef.current = false;
        setMoving(false);
      } else if (state.longPressed) {
        movingRef.current = true;
        setMoving(true);
      } else if (state.movingAtStart) {
        movingRef.current = false;
        setMoving(false);
        onPress();
      } else if (!state.moved) onPress();
    },
    onPanResponderTerminate: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!interaction.current.longPressed) {
        movingRef.current = false;
        setMoving(false);
      }
      drag.setValue({ x: 0, y: 0 });
    }
  }), [drag, height, look.setFloatingAddCorner, onPress, width]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!enabled) return null;
  const position = anchorStyle(corner);
  const transform = [{ translateX: drag.x }, { translateY: drag.y }];
  const remove = () => { look.setFloatingAddEnabled(false); movingRef.current = false; setMoving(false); };
  return (
    <>
      <Animated.View {...pan.panHandlers} accessibilityRole="button" accessibilityLabel="Add new" accessibilityHint="Tap to open Add new. Long-press to move or remove this button."
        accessibilityActions={[{ name: 'activate', label: 'Open Add new' }, { name: 'longpress', label: 'Move or remove' }]}
        onAccessibilityTap={onPress}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'activate') onPress();
          else if (nativeEvent.actionName === 'longpress') { movingRef.current = true; setMoving(true); }
        }}
        style={[position, { width: size, height: size, borderRadius: size / 2, zIndex: 20, transform }]}>
        <GradientBox colors={[FIXED.fab.from, FIXED.fab.to]} glow={FIXED.fab.glow}
          style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={26} color={t.onfab} />
        </GradientBox>
      </Animated.View>
      {moving ? (
        <View pointerEvents="box-none" style={[position, { width: size, height: size, zIndex: 21, transform }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Remove floating Add button" onPress={remove}
            style={{ position: 'absolute', top: -tap(5), right: -tap(5), width: tap(28), height: tap(28), borderRadius: tap(14), backgroundColor: t.red, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={15} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function Chips({ label, options, value, onPick, onCustomChange, error, allowCustom = false }) {
  const { t, s, tap } = useUI();
  const known = options.some(option => String(option.value) === String(value));
  const typed = allowCustom && !known ? String(value || '') : '';
  const categoryMatches = typed.trim() ? options.filter(option => matches(option.label, typed) && String(option.value) !== String(value)) : [];
  return (
    <Field label={label} grow={false}>
      {allowCustom ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: s(8) }}>
          {options.map(o => <Chip key={String(o.value)} label={o.label} on={String(o.value) === String(value)} onPress={() => onPick(o.value)} />)}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
          {options.map(o => <Chip key={String(o.value)} label={o.label} on={String(o.value) === String(value)} onPress={() => onPick(o.value)} />)}
        </View>
      )}
      {allowCustom ? (
        <View style={{ marginTop: s(10) }}>
          <View style={{ height: tap(52), borderRadius: s(14), borderWidth: 1, borderColor: t.line, backgroundColor: t.card2, paddingHorizontal: s(14), justifyContent: 'center' }}>
            <TextInput value={known ? '' : String(value || '')} onChangeText={onCustomChange} placeholder="Or type any expense category" placeholderTextColor={t.dim} accessibilityLabel="Custom expense category" autoCapitalize="sentences" style={{ color: t.ink, fontSize: s(15), padding: 0 }} />
          </View>
          {categoryMatches.length ? (
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: s(180), marginTop: s(4), borderWidth: 1, borderColor: t.line, borderRadius: s(12), backgroundColor: t.card }}>
              {categoryMatches.map((option, index) => (
                <Pressable key={String(option.value)} accessibilityRole="button" onPress={() => onPick(option.value)}
                  style={{ minHeight: tap(44), justifyContent: 'center', paddingHorizontal: s(12), borderBottomWidth: index === categoryMatches.length - 1 ? 0 : 1, borderBottomColor: t.line }}>
                  <T size={14.5}>{option.label}</T>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
      {error ? <T size={13.5} tone="red" style={{ marginTop: s(6) }}>{error}</T> : null}
    </Field>
  );
}

function LeaveConfirmation({ onStay, onLeave }) {
  const { t, s } = useUI();
  return (
    <View pointerEvents="auto" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, elevation: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: s(24) }}>
      <View accessibilityRole="alert" accessibilityLabel="Leave without saving confirmation" accessibilityViewIsModal
        style={{ width: '100%', maxWidth: s(400), padding: s(20), borderRadius: s(20), borderWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
        <T size={18} weight="700">Leave without saving?</T>
        <T size={14} tone="dim" style={{ marginTop: s(8), marginBottom: s(18) }}>What you typed will be lost.</T>
        <View style={{ flexDirection: 'row', gap: s(10) }}>
          <Btn label="Keep editing" onPress={onStay} />
          <Btn label="Leave" onPress={onLeave} style={{ backgroundColor: t.red }} />
        </View>
      </View>
    </View>
  );
}

/* request = { form, record (to change; omit to add), preset }.  onSaved(results) runs after a save. */
export default function EntryForm({ request, onClose, onSaved }) {
  const s = useSession(), { t, s: sc, tap } = useUI(), toast = useToast();
  const [data, setData] = useState(null), [values, setValues] = useState(null), [errors, setErrors] = useState({}), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const [pickKey, setPickKey] = useState(null), [pickQuery, setPickQuery] = useState(''), [flash, setFlash] = useState(''), [confirmLeave, setConfirmLeave] = useState(false);
  const refs = useRef({}), ys = useRef({}), scroll = useRef(null), auto = useRef({}), initial = useRef('');
  const today = useMemo(() => todayISO(), [request]);
  const [swap, setSwap] = useState(null);                                  // "already in the database": the form switches to that record
  useEffect(() => { setSwap(null); setConfirmLeave(false); setPickKey(null); setPickQuery(''); }, [request]);
  const req = swap || request;
  const form = req ? req.form : null, existing = req ? req.record || null : null;
  const ctx = useMemo(() => ({ data: data || {}, today, existing, preset: req ? req.preset : null }), [data, today, existing, req]);

  /* load what the form needs, then fill it */
  useEffect(() => {
    if (!req) return undefined;
    let alive = true; auto.current = {}; setErrors({}); setFlash(''); setSaved(false); setData(null); setValues(null);
    (async () => {
      const d = {}; for (const l of FORM_NEEDS(form)) d[l] = await s.app.records.all(l);
      if (!alive) return;
      const c = { data: d, today, existing, preset: req.preset };
      const v = existing ? valuesFromRecord(form, existing, c) : blankValues(form, c);
      initial.current = JSON.stringify(v); setData(d); setValues(v);
    })().catch(e => { s.notify(e, 'The form could not open'); onClose(); });
    return () => { alive = false; };
  }, [req]);                                                               // eslint-disable-line react-hooks/exhaustive-deps

  const fields = useMemo(() => (values ? visibleFields(form, values, ctx) : []), [form, values, ctx]);
  const set = (key, value) => setValues(v => applyChange(form, key, value, v, ctx, auto.current));

  /* Enter: on to the next field that is typed or picked (choices keep their value; tap them if they need changing). The last Enter saves. */
  const advance = useCallback((fromKey, vals) => {
    const list = layoutFields(form, visibleFields(form, vals || values, ctx)).flat(), i = list.findIndex(f => f.key === fromKey);
    for (let j = i + 1; j < list.length; j++) {
      const f = list[j];
      if (f.type === 'pick' || f.type === 'choice' && f.select) { setTimeout(() => setPickKey(f.key), 60); return; }
      if (TEXTY.has(f.type) && refs.current[f.key]) { setTimeout(() => refs.current[f.key] && refs.current[f.key].focus(), 60); return; }
    }
    Keyboard.dismiss();
  }, [form, values, ctx]);
  const isLastTyped = key => { const list = layoutFields(form, fields).flat().filter(f => TEXTY.has(f.type) || f.type === 'pick'); return list.length && list[list.length - 1].key === key; };

  const tidy = f => {                                                      // show a loosely typed date or time back in full
    const raw = values[f.key];
    if (f.type === 'date' && String(raw).trim()) { const d = parseDate(raw, today); if (d) set(f.key, d); }
    if (f.type === 'time' && String(raw).trim()) { const x = parseTime(raw); if (x) set(f.key, x); }
  };

  const finish = async (results, more, destination) => {
    if (more) { auto.current = {}; const c = { data, today, existing: null, preset: req.preset }; setValues(blankValues(form, c)); setErrors({}); setFlash('Saved. Next one:'); scroll.current && scroll.current.scrollTo({ y: 0, animated: true }); await onSaved(results, true); return; }
    await onSaved(results, false, destination);
  };
  const save = async more => {
    if (!values || saving || saved) return;
    const chk = checkForm(form, values, ctx);
    setErrors(chk.errors);
    if (!chk.ok) { const first = layoutFields(form, fields).flat().find(f => chk.errors[f.key]); if (first && ys.current[first.key] != null) scroll.current && scroll.current.scrollTo({ y: Math.max(0, ys.current[first.key] - 20), animated: true }); Keyboard.dismiss(); return; }
    const run = async () => {
      setSaving(true);
      try {
        const plan = planSave(form, values, ctx);
        const results = await s.app.records.saveBatch(plan.ops);
        setSaving(false); setSaved(true); toast(`\u2713 ${FORMS[form].noun[0].toUpperCase()}${FORMS[form].noun.slice(1)} saved`, 'ok');
        await new Promise(r => setTimeout(r, more ? SAVED_SHOW_MS : SAVED_CLOSE_MS));
        setSaved(false); await finish(results, more, plan.destination);
      } catch (e) { setSaving(false); s.notify(e, 'The change was not saved'); }
    };
    const steps = [];
    const old = existing ? recordMonth(form, existing, today) : '';
    if (old) steps.push(next => Alert.alert('This record is from an earlier month', `It is dated ${monthName(old)}. Change it?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Change it', onPress: next }]));
    if (chk.warnings.length) steps.push(next => Alert.alert('Check this first', chk.warnings.join('\n\n'), [{ text: 'Go back', style: 'cancel' }, { text: 'Save anyway', onPress: next }]));
    const go = i => (i < steps.length ? steps[i](() => go(i + 1)) : run());
    go(0);
  };

  const cancel = () => {
    if (confirmLeave) { setConfirmLeave(false); return; }
    const dirty = values && JSON.stringify(values) !== initial.current;
    if (!dirty) { onClose(); return; }
    setConfirmLeave(true);
  };

  if (!req) return null;
  /* what is typed is matched against what is already there, so a car, client or driver is not added twice */
  const tapSuggestion = sg => {
    if (sg.action === 'edit') { const rec = (data[sg.list] || []).find(r => String(r.id) === String(sg.id)); if (rec) setSwap({ form: sg.list, record: rec }); return; }
    if (sg.action === 'use') { const next = { ...values, [sg.field]: sg.value }; (sg.clear || []).forEach(k => { next[k] = ''; }); setValues(next); advance(sg.field, next); return; }
  };
  const tex = f => {
    const last = isLastTyped(f.key), kb = { money: 'decimal-pad', number: 'decimal-pad', int: 'number-pad', phone: 'phone-pad', time: 'numbers-and-punctuation', date: 'numbers-and-punctuation' }[f.type] || 'default';
    const label = typeof f.label === 'function' ? f.label(values, ctx) : f.label;
    const required = typeof f.required === 'function' ? f.required(values, ctx) : f.required;
    return (
      <View key={f.key} onLayout={e => { ys.current[f.key] = e.nativeEvent.layout.y; }}>
        <FieldText ref={r => { refs.current[f.key] = r; }} label={label} required={required} value={String(values[f.key] == null ? '' : values[f.key])} onChangeText={v => set(f.key, v)} onBlur={() => tidy(f)}
          onFocus={() => scroll.current && ys.current[f.key] != null && scroll.current.scrollTo({ y: Math.max(0, ys.current[f.key] - 90), animated: true })}
          onSubmitEditing={() => { tidy(f); if (last) save(false); else advance(f.key, values); }} returnKeyType={last ? 'done' : 'next'} submitBehavior={last ? 'blurAndSubmit' : 'submit'}
          keyboardType={kb} autoCapitalize={f.caps ? 'characters' : f.type === 'text' ? 'sentences' : 'none'} autoCorrect={false} placeholder={f.placeholder || ''}
          error={errors[f.key]} hint={f.hint ? f.hint(values, ctx) : ''} />
        {f.type === 'date' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(8), marginTop: -sc(6), marginBottom: sc(14) }}>
            {[['Today', today], ['Yesterday', parseDate('yesterday', today)]].map(([label, iso]) => <Chip key={label} label={label} on={values[f.key] === iso} onPress={() => set(f.key, iso)} />)}
            <T size={13} tone="dim" style={{ flex: 1 }} numberOfLines={1}>{dateWords(parseDate(values[f.key], today))}</T>
          </View>
        ) : null}
        {!!f.suggest && suggestions(f.suggest, values[f.key], data || {}, ctx).map(sg => (
          <Pressable key={sg.key} accessibilityRole="button" onPress={() => (sg.action === 'fill' ? setValues(v => ({ ...v, [f.key]: sg.value, ...(sg.also || {}) })) : tapSuggestion(sg))}
            style={{ marginTop: -sc(6), marginBottom: sc(14), padding: sc(12), minHeight: tap(48), borderRadius: sc(14), borderWidth: 1, borderColor: sg.action === 'edit' ? t.orange : t.line, backgroundColor: t.card2 }}>
            <T size={15} weight="700">{sg.label}</T>
            <T size={12.5} tone={sg.action === 'edit' ? 'orange' : 'dim'} style={{ marginTop: sc(1) }}>{sg.sub}{sg.action === 'edit' ? ' · tap to open it' : ''}</T>
          </Pressable>))}
      </View>
    );
  };
  const field = f => {
    if (TEXTY.has(f.type)) return tex(f);
    const choicePicker = f.type === 'choice' && f.select;
    const label = typeof f.label === 'function' ? f.label(values, ctx) : f.label;
    const required = typeof f.required === 'function' ? f.required(values, ctx) : f.required;
    const options = f.type === 'pick'
      ? pickOptions(f.pick, data || {}, values, { currentRentalId: values && values[f.key], exceptPaymentId: existing && existing.id })
      : choicePicker ? choicesOf(form, f, ctx, values).map(option => ({ id: option.value, label: option.label, sub: option.sub })) : [];
    const shown = pickQuery.trim() ? options.filter(option => matches(`${option.label} ${option.sub}`, pickQuery)) : options;
    const selected = options.find(option => String(option.id) === String(values[f.key]));
    const choose = id => {
      const key = f.key;
      setPickKey(null); setPickQuery('');
      const next = applyChange(form, key, id, values, ctx, auto.current);
      setValues(next); advance(key, next);
    };
    return (
      <View key={f.key} onLayout={e => { ys.current[f.key] = e.nativeEvent.layout.y; }}>
        {(f.type === 'pick' || choicePicker) && <FieldPick label={label} required={required} value={selected ? selected.label : f.type === 'pick' ? pickLabel(f.pick, data || {}, values[f.key]) : ''} placeholder={f.placeholder || (f.optional ? (f.blankLabel || 'None') : 'Tap to pick')} onPress={() => {
          setPickQuery(''); setPickKey(current => current === f.key ? null : f.key);
          if (ys.current[f.key] != null) scroll.current && scroll.current.scrollTo({ y: Math.max(0, ys.current[f.key] - 70), animated: true });
        }} />}
        {(f.type === 'pick' || choicePicker) && !!errors[f.key] && <T size={13.5} tone="red" style={{ marginTop: -sc(8), marginBottom: sc(12) }}>{errors[f.key]}</T>}
        {(f.type === 'pick' || choicePicker) && pickKey === f.key ? (
          <View style={{ marginTop: -sc(6), marginBottom: sc(14), borderWidth: 1, borderColor: t.dim, borderRadius: sc(14), backgroundColor: t.card, overflow: 'hidden' }}>
            <View style={{ height: tap(48), flexDirection: 'row', alignItems: 'center', gap: sc(8), paddingHorizontal: sc(12), borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: t.card2 }}>
              <Icon name="search" size={19} color={t.dim} />
              <TextInput value={pickQuery} onChangeText={setPickQuery} autoFocus placeholder={`Search ${String(label).toLowerCase()}`} placeholderTextColor={t.dim}
                autoCorrect={false} autoCapitalize="none" accessibilityLabel={`Search ${label}`} style={{ flex: 1, color: t.ink, fontSize: sc(15), padding: 0 }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Close choices" onPress={() => { setPickKey(null); setPickQuery(''); }} hitSlop={8}><Icon name="x" size={18} color={t.dim} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: sc(220) }} contentContainerStyle={{ padding: sc(6) }}>
              {f.optional ? (
                <Pressable accessibilityRole="button" onPress={() => choose(null)} style={{ minHeight: tap(48), justifyContent: 'center', paddingHorizontal: sc(10), borderBottomWidth: 1, borderBottomColor: t.line }}>
                  <T size={15} tone="dim">{f.blankLabel || 'None'}</T>
                </Pressable>
              ) : null}
              {shown.length ? shown.map(option => (
                <Pressable key={String(option.id)} accessibilityRole="button" onPress={() => choose(option.id)}
                  style={({ pressed }) => ({ minHeight: tap(48), justifyContent: 'center', paddingHorizontal: sc(10), paddingVertical: sc(8), borderBottomWidth: 1, borderBottomColor: t.line, backgroundColor: pressed ? t.card2 : t.card })}>
                  <T size={15.5} weight="600">{option.label}</T>
                  {option.sub ? <T size={12.5} tone="dim" style={{ marginTop: sc(2) }}>{option.sub}</T> : null}
                </Pressable>
              )) : <T size={14} tone="dim" align="center" style={{ padding: sc(18) }}>Nothing matches.</T>}
            </ScrollView>
          </View>
        ) : null}
        {f.type === 'choice' && !choicePicker && <Chips label={label} error={errors[f.key]} options={choicesOf(form, f, ctx, values)} value={values[f.key]} allowCustom={form === 'expenses' && f.key === 'category'}
          onCustomChange={v => set(f.key, v)}
          onPick={v => { set(f.key, v); advance(f.key, { ...values, [f.key]: v }); }} />}
        {f.type === 'bool' && <FieldSwitch label={f.label} on={!!values[f.key]} onChange={v => set(f.key, v)} />}
      </View>
    );
  };
  const fieldRows = layoutFields(form, fields);
  const preview = form === 'rentals' && values ? rentalPreview(values, ctx) : '';

  const label = saved ? 'Saved' : saving ? 'Saving' : existing ? 'Save changes' : 'Save';
  const footer = (
    <>
      {!existing ? <Btn label="Save and add another" disabled={saving || saved} onPress={() => save(true)} /> : <Btn label="Cancel" onPress={cancel} />}
      <Btn go disabled={saving || !values} onPress={() => save(false)} label={label}
        icon={saved ? 'check' : undefined} />
    </>
  );
  return (
    <>
      <FormPage visible title={formTitle(form, existing)} onBack={cancel} scrollRef={scroll} footer={values ? footer : null}
        floatingAction={values ? <FloatingAddButton onPress={() => s.openSheet('add')} hasFooter={!!values} /> : null}
        overlay={confirmLeave ? <LeaveConfirmation onStay={() => setConfirmLeave(false)} onLeave={onClose} /> : null}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {saving ? <View accessibilityLabel="Saving" style={{ alignItems: 'center', padding: sc(8) }}><ActivityIndicator color={t.goldt} /></View> : null}
          {!values ? null : (
            <View>
              {!!flash && <T size={15} weight="700" tone="green" style={{ marginBottom: sc(10) }}>{flash}</T>}
              {fieldRows.map((row, index) => row.length === 1
                ? field(row[0])
                : <View key={`row-${row.map(item => item.key).join('-')}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sc(12) }}>
                  {row.map(item => <View key={item.key} style={{ flex: 1, minWidth: 0 }}>{field(item)}</View>)}
                </View>)}
              {!!preview && <T size={15} weight="700" tone="orange" style={{ marginBottom: sc(12) }}>{preview}</T>}
            </View>
          )}
        </KeyboardAvoidingView>
      </FormPage>
    </>
  );
}
