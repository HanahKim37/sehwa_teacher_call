import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useFullscreen } from '../hooks/useFullscreen.js';

// 딩동 + TTS 안내
function playChimeAndAnnounce(teacherNames = []) {
  // 딩동 차임
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const times = [0, 0.35, 0.65];
    const freqs = [659, 784, 880];
    times.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freqs[i];
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.35, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.55);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.6);
    });
  } catch (e) {
    console.warn('오디오 재생 실패:', e);
  }

  // 차임 끝난 직후 TTS (차임 마지막 음 ~1.25초)
  if (teacherNames.length > 0 && 'speechSynthesis' in window) {
    setTimeout(() => {
      const text = `${teacherNames.join(', ')} 선생님 호출이 있습니다`;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = 0.95;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      window.speechSynthesis.speak(utter);
    }, 1250);
  }
}

// Timer bar component
function CallCard({ call, displayDuration }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const left = Math.max(0, call.expireAt.toMillis() - Date.now());
      setRemaining(left);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [call.expireAt]);

  const pct = displayDuration > 0 ? (remaining / (displayDuration * 1000)) * 100 : 0;
  const elapsed = call.createdAt?.toDate ? call.createdAt.toDate() : new Date();
  const timeStr = elapsed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="call-card">
      <div className="teacher-name">{call.teacherName}</div>
      {call.studentName && (
        <div className="student-name">👤 {call.studentName} 학생</div>
      )}
      <div className="call-time">⏰ {timeStr} 호출</div>
      <div
        className="timer-bar"
        style={{ width: `${pct}%`, opacity: pct < 20 ? 0.4 : 1 }}
      />
    </div>
  );
}

export default function TeacherPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state;

  const { supported: wlSupported, active: wlActive } = useWakeLock();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const [teachers, setTeachers] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [groupConfig, setGroupConfig] = useState(null);
  const prevCallIdsRef = useRef(new Set());
  const now = useRef(Date.now());

  useEffect(() => {
    if (!state?.groupId) navigate('/');
  }, [state, navigate]);

  // Group config
  useEffect(() => {
    if (!state?.groupId) return;
    const unsub = onSnapshot(
      query(collection(db, 'displayGroups')),
      snap => {
        const found = snap.docs.find(d => d.id === state.groupId);
        if (found) setGroupConfig({ id: found.id, ...found.data() });
      }
    );
    return unsub;
  }, [state?.groupId]);

  // Teachers
  useEffect(() => {
    if (!state?.groupId) return;
    const q = query(
      collection(db, 'teachers'),
      where('groupId', '==', state.groupId),
      where('isActive', '==', true)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      setTeachers(list);
    });
    return unsub;
  }, [state?.groupId]);

  // Active calls with sound notification
  useEffect(() => {
    if (!state?.groupId) return;
    const q = query(
      collection(db, 'activeCalls'),
      where('groupId', '==', state.groupId)
    );
    const unsub = onSnapshot(q, snap => {
      const calls = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.expireAt && c.expireAt.toMillis() > Date.now());

      // 새 호출 감지 → 딩동 + TTS
      const currentIds = new Set(calls.map(c => c.id));
      const newCalls = calls.filter(c =>
        !prevCallIdsRef.current.has(c.id) &&
        c.createdAt?.toMillis &&
        c.createdAt.toMillis() > now.current - 5000
      );
      if (newCalls.length > 0) {
        const names = [...new Set(newCalls.map(c => c.teacherName))];
        playChimeAndAnnounce(names);
      }
      prevCallIdsRef.current = currentIds;

      setActiveCalls(calls);
    });
    return unsub;
  }, [state?.groupId]);

  // Prune expired calls
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCalls(prev => prev.filter(c => c.expireAt && c.expireAt.toMillis() > Date.now()));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleStatus = useCallback(async (teacher) => {
    const newStatus = teacher.status === 'available' ? 'away' : 'available';
    try {
      await updateDoc(doc(db, 'teachers', teacher.id), { status: newStatus });
    } catch (err) {
      console.error('Status update failed:', err);
    }
  }, []);

  if (!state?.groupId) return null;

  const displayDuration = groupConfig?.displayDurationSeconds || 30;

  return (
    <div className="teacher-screen">
      <div className="teacher-header">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="title">교무실 호출 전광판</span>
          <span className="meta">{groupConfig?.departmentName || state.label || state.groupId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`wl-badge ${wlActive ? 'active' : 'inactive'}`}>
            {wlActive ? '🔆 화면 유지 중' : '💡 화면 유지 불가'}
          </span>
          <button
            onClick={toggleFullscreen}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '5px 12px', borderRadius: 8, transition: 'all 0.15s' }}
          >
            {isFullscreen ? '⊡ 창모드' : '⛶ 전체모드'}
          </button>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '0.82rem', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            나가기
          </button>
        </div>
      </div>

      <div className="teacher-main">
        {/* Main calls area */}
        <div className="calls-area">
          <div className="calls-area-header">
            <h2>📢 활성 호출</h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--text3)' }}>
              {activeCalls.length > 0 ? `${activeCalls.length}건` : '없음'} · 표시 {displayDuration}초
            </span>
          </div>

          {activeCalls.length === 0 ? (
            <div className="empty-state">
              <span className="icon">🔔</span>
              <p>현재 호출이 없습니다</p>
            </div>
          ) : (
            <div className="call-cards-grid">
              {activeCalls.map(call => (
                <CallCard key={call.id} call={call} displayDuration={displayDuration} />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar - teacher status */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>선생님 상태판</h3>
          </div>
          <div className="sidebar-body">
            {teachers.length === 0 ? (
              <div className="empty-list">등록된 선생님 없음</div>
            ) : (
              teachers.map(t => (
                <div key={t.id} className={`status-item ${t.status === 'away' ? 'away' : ''}`}>
                  <span className="status-item-name">{t.teacherName} 선생님</span>
                  <button
                    className={`status-toggle ${t.status === 'away' ? 'away' : 'available'}`}
                    onClick={() => toggleStatus(t)}
                    type="button"
                  >
                    {t.status === 'away' ? '부재중' : '가능'}
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: '0.72rem',
            color: 'var(--text3)',
            lineHeight: 1.6
          }}>
            버튼을 눌러 상태를 전환할 수 있습니다.<br />
            부재중 시 학생 호출이 차단됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}
