import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, onSnapshot, addDoc, doc,
  updateDoc, deleteDoc, serverTimestamp, query, where, getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';

// ─── Groups Tab ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const [groups, setGroups] = useState([]);
  const [codes, setCodes] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    departmentName: '', displayDurationSeconds: 30,
    code: '', teacherNames: '',
  });
  const [editForm, setEditForm] = useState({
    departmentName: '', displayDurationSeconds: 30, code: '', addTeacherNames: '',
  });

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'displayGroups'), snap =>
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'accessCodes'), snap =>
      setCodes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(collection(db, 'teachers'), snap =>
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  function parseNames(str) {
    return str.split(/\s+/).map(s => s.trim()).filter(Boolean);
  }

  async function addGroup() {
    const trimCode = form.code.trim().toUpperCase();
    if (!trimCode) return;
    if (codes.some(c => c.code === trimCode)) { alert('이미 사용 중인 코드입니다.'); return; }
    setLoading(true);
    try {
      const deptName = form.departmentName.trim() || trimCode;
      const groupRef = await addDoc(collection(db, 'displayGroups'), {
        groupName: trimCode,
        departmentName: deptName,
        displayDurationSeconds: Number(form.displayDurationSeconds) || 30,
        allowStudentNameInput: true, allowAnonymousCall: true, useSound: true,
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'accessCodes'), {
        code: trimCode,
        label: deptName,
        groupId: groupRef.id, isEnabled: true,
        createdAt: serverTimestamp(),
      });
      const names = parseNames(form.teacherNames);
      for (let i = 0; i < names.length; i++) {
        await addDoc(collection(db, 'teachers'), {
          teacherName: names[i], groupId: groupRef.id,
          status: 'available', order: i + 1, isActive: true,
          createdAt: serverTimestamp(),
        });
      }
      setForm({ departmentName: '', displayDurationSeconds: 30, code: '', teacherNames: '' });
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  function startEdit(g) {
    const groupCode = codes.find(c => c.groupId === g.id);
    setEditingId(g.id);
    setEditForm({
      departmentName: g.departmentName || g.groupName,
      displayDurationSeconds: g.displayDurationSeconds || 30,
      code: groupCode?.code || '',
      addTeacherNames: '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ departmentName: '', displayDurationSeconds: 30, code: '', addTeacherNames: '' });
  }

  async function saveEdit(g) {
    const trimCode = editForm.code.trim().toUpperCase();
    if (!trimCode) { alert('코드를 입력하세요.'); return; }
    const groupCode = codes.find(c => c.groupId === g.id);
    if (codes.some(c => c.code === trimCode && c.groupId !== g.id)) {
      alert('이미 사용 중인 코드입니다.'); return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'displayGroups', g.id), {
        departmentName: editForm.departmentName.trim() || g.groupName,
        displayDurationSeconds: Number(editForm.displayDurationSeconds) || 30,
      });
      if (groupCode) {
        await updateDoc(doc(db, 'accessCodes', groupCode.id), {
          code: trimCode, label: editForm.departmentName.trim() || g.groupName,
        });
      }
      const newNames = parseNames(editForm.addTeacherNames);
      const groupTeachers = teachers.filter(t => t.groupId === g.id);
      for (let i = 0; i < newNames.length; i++) {
        await addDoc(collection(db, 'teachers'), {
          teacherName: newNames[i], groupId: g.id,
          status: 'available', order: groupTeachers.length + i + 1,
          isActive: true, createdAt: serverTimestamp(),
        });
      }
      cancelEdit();
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function deleteGroup(id) {
    if (!confirm('그룹, 연결된 코드, 선생님이 모두 삭제됩니다. 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'displayGroups', id));
    const cs = await getDocs(query(collection(db, 'accessCodes'), where('groupId', '==', id)));
    for (const d of cs.docs) await deleteDoc(d.ref);
    const ts = await getDocs(query(collection(db, 'teachers'), where('groupId', '==', id)));
    for (const d of ts.docs) await deleteDoc(d.ref);
  }

  async function deleteTeacher(id) {
    if (!confirm('선생님을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'teachers', id));
  }

  async function toggleCode(codeId, current) {
    await updateDoc(doc(db, 'accessCodes', codeId), { isEnabled: !current });
  }

  return (
    <div className="admin-section">
      <div className="admin-card">
        <h3>그룹 추가</h3>
        <div className="form-group">
          <label>입장 코드 — 그룹 식별자 (학생·교사 공용, 중복 불가)</label>
          <input className="form-input" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="A102" maxLength={20} style={{ letterSpacing: '0.15em', fontWeight: 700, textTransform: 'uppercase' }} />
        </div>
        <div className="form-group">
          <label>부서명 (화면 표시용, 비우면 코드로 표시)</label>
          <input className="form-input" value={form.departmentName} onChange={e => setForm(p => ({ ...p, departmentName: e.target.value }))} placeholder="1학년 교무실" maxLength={30} />
        </div>
        <div className="form-group">
          <label>호출 표시 시간 (초)</label>
          <select className="form-select" value={form.displayDurationSeconds} onChange={e => setForm(p => ({ ...p, displayDurationSeconds: e.target.value }))}>
            <option value={10}>10초</option><option value={30}>30초</option>
            <option value={60}>60초</option><option value={120}>120초</option>
            <option value={300}>300초 (5분)</option>
          </select>
        </div>
        <div className="form-group">
          <label>선생님 이름 (공백으로 구분, 여러 명 가능)</label>
          <input className="form-input" value={form.teacherNames} onChange={e => setForm(p => ({ ...p, teacherNames: e.target.value }))} placeholder="홍길동 김철수 이영희" />
          {form.teacherNames.trim() && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text3)' }}>
              추가될 선생님: {parseNames(form.teacherNames).map((n, i) => (
                <span key={i} style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 4, background: 'var(--surface)', color: 'var(--text2)' }}>{n}</span>
              ))}
            </div>
          )}
        </div>
        <button className="btn-add" onClick={addGroup} disabled={loading || !form.code.trim()}>
          + 그룹 추가
        </button>
      </div>

      <div className="admin-card">
        <h3>그룹 목록 ({groups.length})</h3>
        {groups.length === 0 ? (
          <div className="empty-list">등록된 그룹이 없습니다</div>
        ) : groups.map(g => {
          const groupCode = codes.find(c => c.groupId === g.id);
          const groupTeachers = teachers.filter(t => t.groupId === g.id && t.isActive !== false);
          const isEditing = editingId === g.id;
          return (
            <div key={g.id} style={{ marginBottom: 10 }}>
              <div className="list-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="list-item-info">
                  <div className="list-item-name">
                    {g.departmentName || g.groupName}
                    <span style={{ marginLeft: 8, fontSize: '0.88rem', color: 'var(--accent2)', fontWeight: 700, background: 'rgba(59,130,246,0.1)', padding: '1px 8px', borderRadius: 6 }}>
                      {groupTeachers.length}명
                    </span>
                    {groupCode && (
                      <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--accent2)', background: 'rgba(59,130,246,0.1)', padding: '2px 10px', borderRadius: 6, letterSpacing: '0.1em' }}>
                        {groupCode.code}
                      </span>
                    )}
                    {groupCode && (
                      <span className={`badge ${groupCode.isEnabled ? 'badge-enabled' : 'badge-disabled'}`} style={{ marginLeft: 6 }}>
                        {groupCode.isEnabled ? '활성' : '비활성'}
                      </span>
                    )}
                  </div>
                  <div className="list-item-meta" style={{ marginTop: 4 }}>
                    표시 {g.displayDurationSeconds || 30}초
                    {groupTeachers.length > 0 && <span style={{ marginLeft: 8 }}>· {groupTeachers.map(t => t.teacherName).join(', ')}</span>}
                  </div>
                </div>
                <div className="list-item-actions">
                  {groupCode && (
                    <button className="btn-sm btn-ghost" onClick={() => toggleCode(groupCode.id, groupCode.isEnabled)}>
                      {groupCode.isEnabled ? '비활성화' : '활성화'}
                    </button>
                  )}
                  <button className="btn-sm btn-ghost" onClick={() => isEditing ? cancelEdit() : startEdit(g)}>
                    {isEditing ? '취소' : '수정'}
                  </button>
                  <button className="btn-sm btn-danger" onClick={() => deleteGroup(g.id)}>삭제</button>
                </div>
              </div>

              {isEditing && (
                <div style={{ background: 'var(--bg3)', border: '1.5px solid var(--accent)', borderRadius: 'var(--radius-sm)', padding: '20px 20px 16px', marginTop: -2, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>부서명</label>
                      <input className="form-input" value={editForm.departmentName} onChange={e => setEditForm(p => ({ ...p, departmentName: e.target.value }))} maxLength={30} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>입장 코드</label>
                      <input className="form-input" value={editForm.code} onChange={e => setEditForm(p => ({ ...p, code: e.target.value }))} maxLength={20} style={{ letterSpacing: '0.15em', fontWeight: 700, textTransform: 'uppercase' }} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>표시 시간 (초)</label>
                      <select className="form-select" value={editForm.displayDurationSeconds} onChange={e => setEditForm(p => ({ ...p, displayDurationSeconds: e.target.value }))}>
                        <option value={10}>10초</option><option value={30}>30초</option>
                        <option value={60}>60초</option><option value={120}>120초</option>
                        <option value={300}>300초</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>선생님 추가 (공백 구분)</label>
                      <input className="form-input" value={editForm.addTeacherNames} onChange={e => setEditForm(p => ({ ...p, addTeacherNames: e.target.value }))} placeholder="박민준 최서연" />
                    </div>
                  </div>

                  {teachers.filter(t => t.groupId === g.id).length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em' }}>현재 선생님</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {teachers.filter(t => t.groupId === g.id).map(t => (
                          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text2)' }}>
                            {t.teacherName}
                            <button onClick={() => deleteTeacher(t.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn-sm btn-ghost" onClick={cancelEdit}>취소</button>
                    <button className="btn-sm" onClick={() => saveEdit(g)} disabled={loading} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 18px' }}>저장</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Layout Tab ───────────────────────────────────────────────────────────────
function LayoutTab() {
  const [groups, setGroups] = useState([]);
  const [allTeachers, setAllTeachers] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [gridCols, setGridCols] = useState(3);
  const [gridRows, setGridRows] = useState(4);
  const [positions, setPositions] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragSource, setDragSource] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'displayGroups'), snap =>
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(collection(db, 'teachers'), snap =>
      setAllTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0))));
    return () => { u1(); u2(); };
  }, []);

  // 그룹 변경 시 초기화
  useEffect(() => {
    if (!selectedGroupId) return;
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return;
    setGridCols(group.gridCols || 4);
    setGridRows(3); // 행은 3으로 고정
    const groupTs = allTeachers.filter(t => t.groupId === selectedGroupId);
    const pos = {};
    for (const t of groupTs) {
      pos[t.id] = (t.gridCol != null && t.gridRow != null) ? { col: t.gridCol, row: t.gridRow } : null;
    }
    setPositions(pos);
    setDirty(false);
  }, [selectedGroupId]); // eslint-disable-line

  // 새 선생님 추가/삭제 시 positions 동기화
  useEffect(() => {
    if (!selectedGroupId) return;
    const groupTs = allTeachers.filter(t => t.groupId === selectedGroupId);
    setPositions(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const t of groupTs) {
        if (!(t.id in updated)) { updated[t.id] = null; changed = true; }
      }
      for (const id of Object.keys(updated)) {
        if (!groupTs.find(t => t.id === id)) { delete updated[id]; changed = true; }
      }
      return changed ? updated : prev;
    });
  }, [allTeachers, selectedGroupId]);

  const groupTeachers = allTeachers.filter(t => t.groupId === selectedGroupId);

  // cellMap: "col,row" → teacherId
  const cellMap = {};
  const assignedIds = new Set();
  for (const [tid, pos] of Object.entries(positions)) {
    if (pos && pos.col < gridCols && pos.row < gridRows) {
      cellMap[`${pos.col},${pos.row}`] = tid;
      assignedIds.add(tid);
    }
  }
  const unassigned = groupTeachers.filter(t => !assignedIds.has(t.id));

  function handleDragStart(source) { setDragSource(source); }

  function handleDropOnCell(col, row) {
    if (!dragSource) return;
    const newPos = { ...positions };
    const existingId = cellMap[`${col},${row}`];
    if (dragSource.type === 'cell') {
      const { teacherId, fromCol, fromRow } = dragSource;
      if (existingId && existingId !== teacherId) {
        newPos[existingId] = { col: fromCol, row: fromRow };
      }
      newPos[teacherId] = { col, row };
    } else {
      const { teacherId } = dragSource;
      if (existingId) newPos[existingId] = null;
      newPos[teacherId] = { col, row };
    }
    setPositions(newPos);
    setDragSource(null);
    setDragOverCell(null);
    setDirty(true);
  }

  function handleDropOnUnassigned(e) {
    e.preventDefault();
    if (!dragSource || dragSource.type === 'unassigned') return;
    const newPos = { ...positions };
    newPos[dragSource.teacherId] = null;
    setPositions(newPos);
    setDragSource(null);
    setDragOverCell(null);
    setDirty(true);
  }

  function changeGridSize(newCols, newRows) {
    setGridCols(newCols);
    setGridRows(newRows);
    const newPos = { ...positions };
    for (const [tid, pos] of Object.entries(newPos)) {
      if (pos && (pos.col >= newCols || pos.row >= newRows)) newPos[tid] = null;
    }
    setPositions(newPos);
    setDirty(true);
  }

  async function saveLayout() {
    if (!selectedGroupId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'displayGroups', selectedGroupId), { gridCols, gridRows: 3 });
      for (const t of groupTeachers) {
        const pos = positions[t.id];
        await updateDoc(doc(db, 'teachers', t.id), {
          gridCol: pos ? pos.col : null,
          gridRow: pos ? pos.row : null,
        });
      }
      setDirty(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  }

  const colPresets = [3, 4, 5, 6, 7, 8];

  // 그리드 셀 목록
  const cells = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      cells.push({ col, row });
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* 그룹 선택 */}
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h3>그룹 선택</h3>
        {groups.length === 0 ? (
          <div className="empty-list">먼저 그룹 관리 탭에서 그룹을 추가하세요</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {groups.map(g => {
              const gc = allTeachers.filter(t => t.groupId === g.id && t.isActive !== false).length;
              const isSelected = selectedGroupId === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  style={{
                    padding: '16px 18px', borderRadius: 12, textAlign: 'left',
                    background: isSelected ? 'rgba(59,130,246,0.15)' : 'var(--bg3)',
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    color: 'var(--text)', cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isSelected ? '0 0 0 3px rgba(59,130,246,0.2)' : 'none',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6, color: isSelected ? 'var(--text)' : 'var(--text)' }}>
                    {g.departmentName || g.groupName}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--accent2)', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: 5, letterSpacing: '0.1em' }}>
                      {g.groupName}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent2)', fontWeight: 700 }}>
                      {gc}명
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedGroupId && (
        <>
          {/* 그리드 크기 */}
          <div className="admin-card" style={{ marginBottom: 20 }}>
            <h3>그리드 크기</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.06em' }}>행</span>
                  <div style={{ width: 56, background: 'var(--bg3)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px', color: 'var(--text3)', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center' }}>
                    3
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>고정</span>
                </div>
                <span style={{ color: 'var(--text3)', fontWeight: 700, fontSize: '1.3rem', marginTop: 2 }}>×</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text2)', fontWeight: 600, letterSpacing: '0.06em' }}>열</span>
                  <input
                    type="number" min={1} max={12} value={gridCols}
                    onChange={e => changeGridSize(Math.max(1, Math.min(12, Number(e.target.value))), gridRows)}
                    style={{ width: 56, background: 'var(--bg3)', border: '1.5px solid var(--accent)', borderRadius: 8, padding: '8px', color: 'var(--text)', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent2)' }}>직접 입력</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {colPresets.map(c => (
                  <button
                    key={c}
                    onClick={() => changeGridSize(c, gridRows)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                      background: gridCols === c ? 'var(--accent)' : 'var(--surface)',
                      color: gridCols === c ? 'white' : 'var(--text2)',
                      border: `1px solid ${gridCols === c ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {c}열
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 배치 편집 */}
          <div className="admin-card" style={{ marginBottom: 20 }}>
            <h3>배치 편집 — 드래그로 이동</h3>

            {/* 그리드 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: 8,
              marginBottom: 16,
            }}>
              {cells.map(({ col, row }) => {
                const tid = cellMap[`${col},${row}`];
                const teacher = tid ? groupTeachers.find(t => t.id === tid) : null;
                const isOver = dragOverCell === `${col},${row}`;
                return (
                  <div
                    key={`${col},${row}`}
                    onDragOver={e => { e.preventDefault(); setDragOverCell(`${col},${row}`); }}
                    onDragLeave={() => setDragOverCell(null)}
                    onDrop={() => handleDropOnCell(col, row)}
                    style={{
                      border: `2px ${teacher ? 'solid' : 'dashed'} ${isOver ? 'var(--accent2)' : teacher ? 'var(--accent)' : 'rgba(99,130,180,0.25)'}`,
                      borderRadius: 10,
                      minHeight: 72,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isOver ? 'rgba(59,130,246,0.15)' : teacher ? 'rgba(59,130,246,0.08)' : 'var(--bg3)',
                      transition: 'all 0.15s',
                      position: 'relative',
                      cursor: teacher ? 'default' : 'copy',
                    }}
                  >
                    <span style={{ position: 'absolute', top: 4, left: 7, fontSize: '0.6rem', color: 'var(--text3)', fontFamily: 'monospace' }}>
                      {col + 1},{row + 1}
                    </span>
                    {teacher ? (
                      <div
                        draggable
                        onDragStart={e => { e.stopPropagation(); handleDragStart({ type: 'cell', teacherId: tid, fromCol: col, fromRow: row }); }}
                        style={{
                          padding: '8px 14px', borderRadius: 8,
                          background: 'var(--accent)', color: 'white',
                          fontWeight: 700, fontSize: '0.95rem',
                          cursor: 'grab', userSelect: 'none',
                        }}
                      >
                        {teacher.teacherName}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>빈 칸</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 미배치 선생님 */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOverCell('unassigned'); }}
              onDragLeave={() => setDragOverCell(null)}
              onDrop={handleDropOnUnassigned}
              style={{
                border: `2px dashed ${dragOverCell === 'unassigned' ? 'var(--warning)' : 'var(--border)'}`,
                borderRadius: 12, padding: '14px 16px',
                background: dragOverCell === 'unassigned' ? 'rgba(245,158,11,0.08)' : 'var(--bg2)',
                transition: 'all 0.15s', minHeight: 56,
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginBottom: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                미배치 선생님 — 여기로 드래그하면 배치 해제
              </div>
              {unassigned.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--success)' }}>✓ 모두 배치됨</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {unassigned.map(t => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => handleDragStart({ type: 'unassigned', teacherId: t.id })}
                      style={{
                        padding: '8px 16px', borderRadius: 8,
                        background: 'var(--surface)', border: '1.5px solid var(--border)',
                        color: 'var(--text)', fontWeight: 700, fontSize: '0.9rem',
                        cursor: 'grab', userSelect: 'none',
                      }}
                    >
                      {t.teacherName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            className="btn-add"
            onClick={saveLayout}
            disabled={!dirty || saving}
            style={{ maxWidth: 220, opacity: dirty ? 1 : 0.5 }}
          >
            {saving ? '저장 중...' : dirty ? '💾 변경사항 저장' : '저장됨'}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState('groups');
  const navigate = useNavigate();

  const tabs = [
    { id: 'groups', label: '🏢 그룹 관리' },
    { id: 'layout', label: '📐 교사 화면 배치 관리' },
  ];

  return (
    <div className="admin-screen">
      <div className="admin-header">
        <h1>관리자 대시보드</h1>
        <button className="btn-exit" onClick={() => navigate('/')}>← 나가기</button>
      </div>
      <div className="admin-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`admin-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="admin-content">
        {tab === 'groups' && <GroupsTab />}
        {tab === 'layout' && <LayoutTab />}
      </div>
    </div>
  );
}
