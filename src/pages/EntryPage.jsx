import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

const MODES = [
  {
    id: 'student',
    label: '학생용 호출 모드',
    desc: '선생님을 호출할 때 사용합니다',
    icon: '🧑‍🎓',
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.25)',
  },
  {
    id: 'teacher',
    label: '교사용 전광판 모드',
    desc: '호출 현황을 실시간으로 확인합니다',
    icon: '📺',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.25)',
  },
  {
    id: 'admin',
    label: '관리자 모드',
    desc: '그룹·코드·선생님을 관리합니다',
    icon: '⚙️',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.25)',
  },
];

export default function EntryPage() {
  const [selectedMode, setSelectedMode] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin1234';

  function handleSelectMode(modeId) {
    setSelectedMode(modeId);
    setCode('');
    setError('');
  }

  function handleBack() {
    setSelectedMode(null);
    setCode('');
    setError('');
  }

  async function handleEnter(e) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError('코드를 입력하세요.');
      return;
    }
    setError('');
    setLoading(true);

    if (selectedMode === 'admin') {
      if (trimmed === adminPassword) {
        navigate('/admin');
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'accessCodes'),
        where('code', '==', trimmed.toUpperCase()),
        where('isEnabled', '==', true)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('유효하지 않은 코드입니다.');
        setLoading(false);
        return;
      }
      const docData = snap.docs[0].data();

      if (selectedMode === 'student') {
        navigate('/student', { state: { code: trimmed.toUpperCase(), groupId: docData.groupId, label: docData.label } });
      } else if (selectedMode === 'teacher') {
        navigate('/teacher', { state: { code: trimmed.toUpperCase(), groupId: docData.groupId, label: docData.label } });
      }
    } catch (err) {
      console.error(err);
      setError('오류가 발생했습니다. 다시 시도하세요.');
    }
    setLoading(false);
  }

  const currentMode = MODES.find(m => m.id === selectedMode);

  return (
    <div className="code-screen">
      <div className="code-card">
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text3)', letterSpacing: '0.18em', marginBottom: 10, fontWeight: 500 }}>
            시험기간
          </div>
          <div style={{
            fontSize: '2.2rem',
            fontWeight: 900,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            fontFamily: "'Noto Sans KR', sans-serif",
          }}>
            교무실 호출 시스템
          </div>
        </div>

        {/* Step 1: Mode selection */}
        {!selectedMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => handleSelectMode(mode.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '18px 22px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg3)',
                  border: `1.5px solid var(--border)`,
                  color: 'var(--text)',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = mode.color;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${mode.glow}`;
                  e.currentTarget.style.background = 'var(--surface)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.background = 'var(--bg3)';
                }}
              >
                <span style={{ fontSize: '2rem', lineHeight: 1 }}>{mode.icon}</span>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 3, color: 'var(--text)' }}>
                    {mode.label}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
                    {mode.desc}
                  </div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: '1.1rem' }}>›</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Code input */}
        {selectedMode && (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 24,
              padding: '14px 18px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg3)',
              border: `1.5px solid ${currentMode.color}`,
              boxShadow: `0 0 0 3px ${currentMode.glow}`,
            }}>
              <span style={{ fontSize: '1.6rem' }}>{currentMode.icon}</span>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>{currentMode.label}</div>
              </div>
              <button
                onClick={handleBack}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                }}
              >
                ← 변경
              </button>
            </div>

            <form onSubmit={handleEnter}>
              <div className="code-input-wrap">
                <input
                  className={`code-input ${error ? 'error' : ''}`}
                  type={selectedMode === 'admin' ? 'password' : 'text'}
                  placeholder={selectedMode === 'admin' ? '관리자 비밀번호' : '코드 입력'}
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(''); }}
                  maxLength={30}
                  autoFocus
                  autoComplete="off"
                  style={selectedMode !== 'admin' ? { textTransform: 'uppercase' } : {}}
                />
              </div>
              {error && <div className="error-msg">{error}</div>}
              <button
                className="btn-primary"
                type="submit"
                disabled={loading}
                style={{ background: currentMode.color }}
              >
                {loading ? '확인 중...' : '입장하기'}
              </button>
            </form>
          </>
        )}

        <div className="wakelock-notice" style={{ marginTop: 24 }}>
          학생용·교사용 화면에서는 화면 꺼짐 방지가 자동 적용됩니다.<br />
          태블릿은 자동 절전 해제 설정 및 상시 충전을 권장합니다.
        </div>
      </div>
    </div>
  );
}
