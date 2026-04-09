import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot,
  addDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { useFullscreen } from '../hooks/useFullscreen.js';

export default function StudentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state;

  const { supported: wlSupported, active: wlActive } = useWakeLock();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const [teachers, setTeachers] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [calling, setCalling] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [groupConfig, setGroupConfig] = useState(null);

  useEffect(() => {
    if (!state?.groupId) {
      navigate('/');
      return;
    }
  }, [state, navigate]);

  // Load group config
  useEffect(() => {
    if (!state?.groupId) return;
    const q = query(
      collection(db, 'displayGroups'),
      where('__name__', '==', state.groupId)
    );
    // Actually just subscribe to all groups and find ours
    const unsub = onSnapshot(
      query(collection(db, 'displayGroups')),
      snap => {
        const found = snap.docs.find(d => d.id === state.groupId);
        if (found) setGroupConfig({ id: found.id, ...found.data() });
      }
    );
    return unsub;
  }, [state?.groupId]);

  // Realtime teachers
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
      // Deselect if selected teacher became away
      setSelectedTeacher(prev => {
        if (!prev) return null;
        const updated = list.find(t => t.id === prev.id);
        if (!updated || updated.status === 'away') return null;
        return updated;
      });
    });
    return unsub;
  }, [state?.groupId]);

  // Realtime active calls
  useEffect(() => {
    if (!state?.groupId) return;
    const now = Timestamp.now();
    const q = query(
      collection(db, 'activeCalls'),
      where('groupId', '==', state.groupId)
    );
    const unsub = onSnapshot(q, snap => {
      const calls = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.expireAt && c.expireAt.toMillis() > Date.now());
      setActiveCalls(calls);
    });
    return unsub;
  }, [state?.groupId]);

  // Periodically filter expired calls from local state
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCalls(prev => prev.filter(c => c.expireAt && c.expireAt.toMillis() > Date.now()));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCall = useCallback(async () => {
    if (!selectedTeacher) return;
    if (selectedTeacher.status === 'away') return;
    setCalling(true);
    try {
      const displayDuration = groupConfig?.displayDurationSeconds || 30;
      const expireAt = Timestamp.fromMillis(Date.now() + displayDuration * 1000);
      await addDoc(collection(db, 'activeCalls'), {
        groupId: state.groupId,
        teacherId: selectedTeacher.id,
        teacherName: selectedTeacher.teacherName,
        studentName: studentName.trim() || '',
        createdAt: serverTimestamp(),
        expireAt,
      });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setSelectedTeacher(null);
        setStudentName('');
      }, 2500);
    } catch (err) {
      console.error('Call failed:', err);
    }
    setCalling(false);
  }, [selectedTeacher, studentName, state?.groupId, groupConfig]);

  if (!state?.groupId) return null;

  // Unique teacher names currently being called
  const callingTeacherNames = [...new Set(activeCalls.map(c => c.teacherName))];

  return (
    <div className="student-screen">
      <div className="student-header">
        <div className="student-header-title">
          <span className="sub">교무실 호출</span>
          <span className="main">{groupConfig?.departmentName || state.label || state.groupId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className={`wl-badge ${wlActive ? 'active' : 'inactive'}`}
            title={wlSupported ? (wlActive ? '화면 꺼짐 방지 활성' : '화면 꺼짐 방지 비활성') : '미지원 브라우저'}
          >
            {wlActive ? '🔆 화면 유지 중' : '💡 화면 유지 불가'}
          </span>
          <button
            onClick={toggleFullscreen}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '5px 12px', borderRadius: 8, transition: 'all 0.15s' }}
          >
            {isFullscreen ? '⊡ 창모드' : '⛶ 전체모드'}
          </button>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '0.82rem', cursor: 'pointer', padding: '6px 10px' }}
            onClick={() => navigate('/')}
          >
            나가기
          </button>
        </div>
      </div>

      <div className="student-body">
        {/* Teacher selection */}
        <div>
          <div className="section-label">선생님 선택</div>
          {teachers.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: '0.9rem' }}>등록된 선생님이 없습니다.</p>
          ) : (() => {
            const gridCols = groupConfig?.gridCols;
            const gridRows = groupConfig?.gridRows;
            const hasLayout = gridCols && gridRows;

            if (hasLayout) {
              // 배치된 교사와 미배치 교사 분리
              const positioned = {};
              const unpositioned = [];
              for (const t of teachers) {
                if (t.gridCol != null && t.gridRow != null && t.gridCol < gridCols && t.gridRow < gridRows) {
                  positioned[`${t.gridCol},${t.gridRow}`] = t;
                } else {
                  unpositioned.push(t);
                }
              }
              const cells = [];
              for (let row = 0; row < gridRows; row++) {
                for (let col = 0; col < gridCols; col++) {
                  cells.push({ col, row, teacher: positioned[`${col},${row}`] || null });
                }
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 14 }}>
                  {cells.map(({ col, row, teacher }) =>
                    teacher ? (
                      <button
                        key={teacher.id}
                        className={`teacher-btn ${teacher.status === 'away' ? 'away' : 'available'} ${selectedTeacher?.id === teacher.id ? 'selected' : ''}`}
                        onClick={() => teacher.status !== 'away' && setSelectedTeacher(teacher)}
                        disabled={teacher.status === 'away'}
                        type="button"
                      >
                        <span style={{ fontSize: '1.5rem' }}>{teacher.status === 'away' ? '🚫' : '👨‍🏫'}</span>
                        <span>{teacher.teacherName} 선생님</span>
                        {teacher.status === 'away' && <span className="away-badge">부재중</span>}
                      </button>
                    ) : (
                      <div key={`empty-${col}-${row}`} style={{ visibility: 'hidden', minHeight: 80 }} />
                    )
                  )}
                  {unpositioned.map(t => (
                    <button
                      key={t.id}
                      className={`teacher-btn ${t.status === 'away' ? 'away' : 'available'} ${selectedTeacher?.id === t.id ? 'selected' : ''}`}
                      onClick={() => t.status !== 'away' && setSelectedTeacher(t)}
                      disabled={t.status === 'away'}
                      type="button"
                    >
                      <span style={{ fontSize: '1.5rem' }}>{t.status === 'away' ? '🚫' : '👨‍🏫'}</span>
                      <span>{t.teacherName} 선생님</span>
                      {t.status === 'away' && <span className="away-badge">부재중</span>}
                    </button>
                  ))}
                </div>
              );
            }

            // 레이아웃 미설정 시 기본 auto-fill
            return (
              <div className="teacher-grid">
                {teachers.map(t => (
                  <button
                    key={t.id}
                    className={`teacher-btn ${t.status === 'away' ? 'away' : 'available'} ${selectedTeacher?.id === t.id ? 'selected' : ''}`}
                    onClick={() => t.status !== 'away' && setSelectedTeacher(t)}
                    disabled={t.status === 'away'}
                    type="button"
                  >
                    <span style={{ fontSize: '1.5rem' }}>{t.status === 'away' ? '🚫' : '👨‍🏫'}</span>
                    <span>{t.teacherName} 선생님</span>
                    {t.status === 'away' && <span className="away-badge">부재중</span>}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Call panel - only when teacher selected */}
        {selectedTeacher && (
          <div className="call-panel">
            <div className="section-label" style={{ marginBottom: 16 }}>
              {selectedTeacher.teacherName} 선생님 호출
            </div>
            <input
              className="name-input"
              type="text"
              placeholder="학생 이름 (선택 입력)"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              maxLength={20}
              onKeyDown={e => e.key === 'Enter' && handleCall()}
            />
            <button
              className="btn-call"
              onClick={handleCall}
              disabled={calling}
              type="button"
            >
              {calling ? '호출 중...' : `📢 ${selectedTeacher.teacherName} 선생님 호출하기`}
            </button>
          </div>
        )}

        {/* Active calls */}
        <div className="active-calls-bar">
          <div className="section-label">지금 호출 중</div>
          {callingTeacherNames.length === 0 ? (
            <p className="no-calls">현재 호출 중인 선생님이 없습니다.</p>
          ) : (
            <div className="active-calls-chips">
              {callingTeacherNames.map(name => (
                <span key={name} className="call-chip">
                  {name} 선생님
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Success toast */}
      <div className={`success-toast ${showSuccess ? 'show' : ''}`}>
        <span className="icon">✅</span>
        <p>호출되었습니다!</p>
        <small>잠시 후 초기화됩니다</small>
      </div>
    </div>
  );
}
