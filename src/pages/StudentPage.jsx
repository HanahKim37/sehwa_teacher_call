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
  const [groupConfig, setGroupConfig] = useState(null);

  // 모달 상태
  const [modalTeacher, setModalTeacher] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [calling, setCalling] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState('');

  useEffect(() => {
    if (!state?.groupId) navigate('/');
  }, [state, navigate]);

  // 그룹 설정
  useEffect(() => {
    if (!state?.groupId) return;
    const unsub = onSnapshot(collection(db, 'displayGroups'), snap => {
      const found = snap.docs.find(d => d.id === state.groupId);
      if (found) setGroupConfig({ id: found.id, ...found.data() });
    });
    return unsub;
  }, [state?.groupId]);

  // 선생님 목록
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
      // 모달 열린 선생님이 부재중으로 바뀌면 닫기
      setModalTeacher(prev => {
        if (!prev) return null;
        const updated = list.find(t => t.id === prev.id);
        return (!updated || updated.status === 'away') ? null : updated;
      });
    });
    return unsub;
  }, [state?.groupId]);

  // 활성 호출
  useEffect(() => {
    if (!state?.groupId) return;
    const q = query(collection(db, 'activeCalls'), where('groupId', '==', state.groupId));
    const unsub = onSnapshot(q, snap => {
      const calls = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.expireAt && c.expireAt.toMillis() > Date.now());
      setActiveCalls(calls);
    });
    return unsub;
  }, [state?.groupId]);

  // 만료된 호출 주기적 제거
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCalls(prev => prev.filter(c => c.expireAt && c.expireAt.toMillis() > Date.now()));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCall = useCallback(async () => {
    if (!modalTeacher || modalTeacher.status === 'away') return;
    setCalling(true);
    try {
      const displayDuration = groupConfig?.displayDurationSeconds || 30;
      const expireAt = Timestamp.fromMillis(Date.now() + displayDuration * 1000);
      await addDoc(collection(db, 'activeCalls'), {
        groupId: state.groupId,
        teacherId: modalTeacher.id,
        teacherName: modalTeacher.teacherName,
        studentName: studentName.trim() || '',
        createdAt: serverTimestamp(),
        expireAt,
      });
      setSuccessName(modalTeacher.teacherName);
      setModalTeacher(null);
      setStudentName('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2500);
    } catch (err) {
      console.error('Call failed:', err);
    }
    setCalling(false);
  }, [modalTeacher, studentName, state?.groupId, groupConfig]);

  function openModal(teacher) {
    if (teacher.status === 'away') return;
    setStudentName('');
    setModalTeacher(teacher);
  }

  function closeModal() {
    setModalTeacher(null);
    setStudentName('');
  }

  if (!state?.groupId) return null;

  const hasLayout = groupConfig?.gridCols && groupConfig?.gridRows;
  const gridCols = groupConfig?.gridCols || null;
  const gridRows = groupConfig?.gridRows || null;
  const callingTeacherNames = [...new Set(activeCalls.map(c => c.teacherName))];

  // 레이아웃 배치된 교사 그리드 계산
  let cells = [];
  let unpositioned = [...teachers];
  if (hasLayout) {
    const positioned = {};
    unpositioned = [];
    for (const t of teachers) {
      if (t.gridCol != null && t.gridRow != null && t.gridCol < gridCols && t.gridRow < gridRows) {
        positioned[`${t.gridCol},${t.gridRow}`] = t;
      } else {
        unpositioned.push(t);
      }
    }
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        cells.push({ col, row, teacher: positioned[`${col},${row}`] || null });
      }
    }
  }

  return (
    <div className="student-screen" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
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
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '5px 12px', borderRadius: 8 }}
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

      {/* 본문: 좌우 분할 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 왼쪽: 교사 버튼 그리드 */}
        <div style={{ flex: 1, padding: '20px 20px 20px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label" style={{ marginBottom: 0 }}>선생님 선택</div>

          {teachers.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: '0.9rem' }}>등록된 선생님이 없습니다.</p>
          ) : hasLayout ? (
            // 배치 레이아웃 있음 — 화면 꽉 채움
            <div style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridTemplateRows: `repeat(${gridRows}, 1fr)`,
              gap: 10,
              overflow: 'hidden',
            }}>
              {cells.map(({ col, row, teacher }) =>
                teacher ? (
                  <button
                    key={teacher.id}
                    className={`teacher-btn ${teacher.status === 'away' ? 'away' : 'available'}`}
                    onClick={() => openModal(teacher)}
                    disabled={teacher.status === 'away'}
                    type="button"
                    style={{ height: '100%', minHeight: 0, padding: '8px 6px' }}
                  >
                    <span style={{ fontSize: '1.3rem' }}>{teacher.status === 'away' ? '🚫' : '👨‍🏫'}</span>
                    <span style={{ fontWeight: 700 }}>{teacher.teacherName}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 400 }}>선생님</span>
                    {teacher.status === 'away' && <span className="away-badge">부재중</span>}
                  </button>
                ) : (
                  <div key={`e-${col}-${row}`} style={{ visibility: 'hidden' }} />
                )
              )}
              {unpositioned.map(t => (
                <button
                  key={t.id}
                  className={`teacher-btn ${t.status === 'away' ? 'away' : 'available'}`}
                  onClick={() => openModal(t)}
                  disabled={t.status === 'away'}
                  type="button"
                  style={{ height: '100%', minHeight: 0, padding: '8px 6px' }}
                >
                  <span style={{ fontSize: '1.3rem' }}>{t.status === 'away' ? '🚫' : '👨‍🏫'}</span>
                  <span style={{ fontWeight: 700 }}>{t.teacherName}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 400 }}>선생님</span>
                  {t.status === 'away' && <span className="away-badge">부재중</span>}
                </button>
              ))}
            </div>
          ) : (
            // 배치 레이아웃 없음 — auto-fill
            <div className="teacher-grid">
              {teachers.map(t => (
                <button
                  key={t.id}
                  className={`teacher-btn ${t.status === 'away' ? 'away' : 'available'}`}
                  onClick={() => openModal(t)}
                  disabled={t.status === 'away'}
                  type="button"
                >
                  <span style={{ fontSize: '1.5rem' }}>{t.status === 'away' ? '🚫' : '👨‍🏫'}</span>
                  <span style={{ fontWeight: 700 }}>{t.teacherName}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 400 }}>선생님</span>
                  {t.status === 'away' && <span className="away-badge">부재중</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽: 호출 현황 사이드바 */}
        <div style={{
          width: 200,
          flexShrink: 0,
          background: 'var(--bg2)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>지금 호출 중</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {callingTeacherNames.length === 0 ? (
              <p style={{ color: 'var(--text3)', fontSize: '0.82rem', textAlign: 'center', marginTop: 16 }}>
                현재 호출 없음
              </p>
            ) : (
              callingTeacherNames.map(name => (
                <div key={name} className="call-chip" style={{ justifyContent: 'flex-start' }}>
                  {name} 선생님
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 호출 모달 */}
      {modalTeacher && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: 'var(--bg2)',
              border: '1.5px solid var(--border)',
              borderRadius: 24,
              padding: '40px 40px 32px',
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 닫기 버튼 */}
            <button
              onClick={closeModal}
              style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 'none', color: 'var(--text3)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}
            >×</button>

            {/* 선생님 이름 */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 6, letterSpacing: '0.1em' }}>호출할 선생님</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                {modalTeacher.teacherName} 선생님
              </div>
            </div>

            {/* 학생 이름 입력 */}
            <input
              className="name-input"
              type="text"
              placeholder="학생 이름 (선택 입력)"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              maxLength={20}
              onKeyDown={e => e.key === 'Enter' && handleCall()}
              autoFocus
            />

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1, padding: '14px', borderRadius: 10,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  color: 'var(--text2)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                className="btn-call"
                onClick={handleCall}
                disabled={calling}
                type="button"
                style={{ flex: 2 }}
              >
                {calling ? '호출 중...' : `📢 호출하기`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성공 토스트 */}
      <div className={`success-toast ${showSuccess ? 'show' : ''}`}>
        <span className="icon">✅</span>
        <p>{successName} 선생님</p>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>호출되었습니다!</p>
        <small>잠시 후 초기화됩니다</small>
      </div>
    </div>
  );
}
