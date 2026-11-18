/* The Home tour: the screen darkens, a gold ring marks the thing being explained, a card says what it is.
   Targets register their View with targetRef(name); the tour measures them on screen. */
import { createRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { useUI } from './look.js';
import { Btn, T, useReducedMotion } from './kit.js';
import { useSession } from './session.js';
import { TOUR } from './tourSteps.js';

const refs = {};
export const targetRef = name => refs[name] || (refs[name] = createRef());

function Dave() {
  const { t, s: sc } = useUI(), reduced = useReducedMotion(), bob = useRef(new Animated.Value(0)).current, wave = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { bob.setValue(0); wave.setValue(0); return undefined; }
    const native = Platform.OS !== 'web';
    const bobMotion = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(bob, { toValue: 0, duration: 560, easing: Easing.inOut(Easing.sin), useNativeDriver: native })
    ]));
    const waveMotion = Animated.loop(Animated.sequence([
      Animated.timing(wave, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(wave, { toValue: 0, duration: 360, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.delay(650)
    ]));
    bobMotion.start(); waveMotion.start();
    return () => { bobMotion.stop(); waveMotion.stop(); };
  }, [bob, reduced, wave]);
  const armRotation = wave.interpolate({ inputRange: [0, 1], outputRange: ['-42deg', '-4deg'] });
  return (
    <Animated.View accessibilityLabel="Dave, your FleetPilot guide" style={{ width: sc(42), height: sc(48), alignItems: 'center', justifyContent: 'center', transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -sc(3)] }) }] }}>
      <View style={{ width: sc(38), height: sc(46) }}>
        <View style={{ position: 'absolute', top: sc(2), left: sc(13), width: sc(12), height: sc(12), borderRadius: sc(6), backgroundColor: t.gold, borderWidth: 1, borderColor: t.ink }} />
        <View style={{ position: 'absolute', top: sc(15), left: sc(18), width: sc(2), height: sc(14), borderRadius: sc(1), backgroundColor: t.ink }} />
        <View style={{ position: 'absolute', top: sc(18), left: sc(4), width: sc(15), height: sc(2), borderRadius: sc(1), backgroundColor: t.ink, transform: [{ rotate: '24deg' }] }} />
        <Animated.View style={{ position: 'absolute', top: sc(18), left: sc(19), width: sc(15), height: sc(2), borderRadius: sc(1), backgroundColor: t.ink, transform: [{ rotate: armRotation }] }} />
        <View style={{ position: 'absolute', top: sc(30), left: sc(8), width: sc(14), height: sc(2), borderRadius: sc(1), backgroundColor: t.ink, transform: [{ rotate: '-48deg' }] }} />
        <View style={{ position: 'absolute', top: sc(30), left: sc(18), width: sc(14), height: sc(2), borderRadius: sc(1), backgroundColor: t.ink, transform: [{ rotate: '48deg' }] }} />
      </View>
    </Animated.View>
  );
}

export default function Tour({ onDone }) {
  const { t, s: sc } = useUI(), { width: W, height: H } = useWindowDimensions(), session = useSession();
  const [i, setI] = useState(0), [rect, setRect] = useState(null), st = TOUR[i], last = i === TOUR.length - 1;
  useEffect(() => {
    setRect(null);
    if (session.screen !== st.screen) session.go(st.screen, true);
    if (!st.target) return undefined;
    const id = setTimeout(() => { const n = targetRef(st.target).current; if (n && n.measureInWindow) n.measureInWindow((x, y, w, h) => { if (w > 0 && h > 0) setRect({ x, y, w, h }); }); }, 320);
    return () => clearTimeout(id);
  }, [i, st.target, st.screen]); // eslint-disable-line react-hooks/exhaustive-deps
  const pad = 6, pos = rect ? (rect.y > H / 2 ? { bottom: H - rect.y + pad + 16 } : { top: rect.y + rect.h + pad + 16 }) : { top: H * 0.3 };
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={{ flex: 1 }}>
        <Svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Defs><Mask id="tourHole"><Rect width={W} height={H} fill="white" />{rect ? <Rect x={rect.x - pad} y={rect.y - pad} width={rect.w + pad * 2} height={rect.h + pad * 2} rx={20} fill="black" /> : null}</Mask></Defs>
          <Rect width={W} height={H} fill="rgba(8,10,14,0.66)" mask="url(#tourHole)" />
          {rect ? <Rect x={rect.x - pad} y={rect.y - pad} width={rect.w + pad * 2} height={rect.h + pad * 2} rx={20} fill="none" stroke={t.gold} strokeWidth={2} /> : null}
        </Svg>
        <View accessibilityViewIsModal style={[{ position: 'absolute', left: sc(16), right: sc(16), backgroundColor: t.card, borderRadius: sc(20), padding: sc(18) }, pos]}>
          <T size={12} weight="600" tone="dim" upper spacing={0.7}>{`Step ${i + 1} of ${TOUR.length}`}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(10), marginTop: sc(4), marginBottom: sc(4) }}>
            <Dave />
            <View style={{ flex: 1 }}>
              <T size={11} weight="700" tone="gold" upper spacing={0.5}>Dave · your guide</T>
              <T size={19} weight="700">{st.title}</T>
            </View>
          </View>
          <T size={14.5} style={{ marginBottom: sc(14) }}>{st.body}</T>
          <View style={{ flexDirection: 'row', gap: sc(10) }}>
            <Btn label={last ? 'Close tour' : 'Skip'} onPress={onDone} />
            <Btn go label={last ? 'Finish' : 'Next'} onPress={() => (last ? onDone() : setI(i + 1))} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
