import React, { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = {
  async fetch(endpoint, options = {}) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API 오류');
    return data;
  },
  get: (endpoint) => api.fetch(endpoint),
  post: (endpoint, data) => api.fetch(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  delete: (endpoint) => api.fetch(endpoint, { method: 'DELETE' }),
};

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', nickname: '' });
  const [authError, setAuthError] = useState('');
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '' });
  const [currentView, setCurrentView] = useState('home');
  const [activeTab, setActiveTab] = useState('today');
  const [rankingTab, setRankingTab] = useState('week');
  const [rankings, setRankings] = useState([]);
  const [myGroups, setMyGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hallOfFame, setHallOfFame] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [stockIndex, setStockIndex] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('patience-lion-user');
    if (stored) {
      const userData = JSON.parse(stored);
      setUser(userData);
      loadUserData(userData.id);
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadUserData = async (userId) => {
    try {
      const userItems = await api.get(`/items/${userId}`);
      setItems(userItems.map(item => ({ ...item, date: item.created_at })));
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const handleLogin = async () => {
    setAuthError('');
    try {
      const userData = await api.post('/auth/login', { username: authForm.username, password: authForm.password });
      localStorage.setItem('patience-lion-user', JSON.stringify(userData));
      setUser(userData);
      loadUserData(userData.id);
    } catch (e) { setAuthError(e.message); }
  };

  const handleRegister = async () => {
    setAuthError('');
    try {
      const userData = await api.post('/auth/register', authForm);
      localStorage.setItem('patience-lion-user', JSON.stringify(userData));
      setUser(userData);
      setItems([]);
      setIsLoading(false);
    } catch (e) { setAuthError(e.message); }
  };

  const handleLogout = () => {
    localStorage.removeItem('patience-lion-user');
    setUser(null);
    setItems([]);
    setAuthForm({ username: '', password: '', nickname: '' });
  };

  const loadRankings = useCallback(async () => {
    try {
      const data = await api.get(`/rankings?period=${rankingTab}`);
      setRankings(data);
    } catch (e) { console.error(e); }
  }, [rankingTab]);

  useEffect(() => {
    if (user && currentView === 'ranking') loadRankings();
  }, [user, currentView, rankingTab, loadRankings]);

  const loadHallOfFame = useCallback(async () => {
    try {
      const data = await api.get('/hall-of-fame');
      setHallOfFame(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (user && currentView === 'ranking') loadHallOfFame();
  }, [user, currentView, loadHallOfFame]);

  useEffect(() => {
    api.get('/stocks').then(setStocks).catch(() => {});
  }, []);

  useEffect(() => {
    if (stocks.length <= 1) return;
    const timer = setInterval(() => setStockIndex(i => (i + 1) % stocks.length), 5000);
    return () => clearInterval(timer);
  }, [stocks.length]);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.get(`/groups/user/${user.id}`);
      setMyGroups(data);
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => {
    if (user && currentView === 'groups') loadGroups();
  }, [user, currentView, loadGroups]);

  const loadGroupDetails = async (groupId) => {
    try {
      const data = await api.get(`/groups/${groupId}`);
      setSelectedGroup(data);
    } catch (e) { console.error(e); }
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.price) return;
    try {
      const item = await api.post('/items', { user_id: user.id, name: newItem.name, price: parseInt(newItem.price) });
      setItems([{ ...item, date: item.created_at }, ...items]);
      setNewItem({ name: '', price: '' });
      setShowModal(false);
    } catch (e) { alert('추가 실패: ' + e.message); }
  };

  const deleteItem = async (id) => {
    try {
      await api.delete(`/items/${id}`);
      setItems(items.filter(item => item.id !== id));
    } catch (e) { alert('삭제 실패: ' + e.message); }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const group = await api.post('/groups', { name: newGroupName.trim(), created_by: user.id });
      setMyGroups([...myGroups, group]);
      setShowCreateGroup(false);
      setNewGroupName('');
      loadGroupDetails(group.id);
    } catch (e) { alert('그룹 생성 실패: ' + e.message); }
  };

  const joinGroup = async () => {
    if (!joinCode.trim()) return;
    try {
      const group = await api.post('/groups/join', { code: joinCode.toUpperCase(), user_id: user.id });
      await loadGroups();
      setShowJoinGroup(false);
      setJoinCode('');
      loadGroupDetails(group.id);
    } catch (e) { alert('참여 실패: 코드를 확인해주세요'); }
  };

  const leaveGroup = async (groupId) => {
    if (!confirm('정말 이 그룹을 나가시겠어요?')) return;
    try {
      await api.delete(`/groups/${groupId}/members/${user.id}`);
      setMyGroups(myGroups.filter(g => g.id !== groupId));
      setSelectedGroup(null);
    } catch (e) { alert('나가기 실패: ' + e.message); }
  };

  const deleteGroup = async (groupId) => {
    if (!confirm('정말 이 그룹을 삭제하시겠어요? 모든 멤버가 제거됩니다.')) return;
    try {
      await api.fetch(`/groups/${groupId}`, { method: 'DELETE', body: JSON.stringify({ user_id: user.id }) });
      setMyGroups(myGroups.filter(g => g.id !== groupId));
      setSelectedGroup(null);
    } catch (e) { alert('삭제 실패: ' + e.message); }
  };

  const shareGroup = async (code) => {
    const url = 'https://patience-lion-production-2a35.up.railway.app/';
    const text = `참고 사자에서 같이 절약 경쟁하자!\n\n그룹 참여 코드: ${code}\n접속: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: '참고 사자 그룹 초대', text, url }); } catch {}
    } else {
      navigator.clipboard?.writeText(text);
      alert('초대 메시지가 복사됨!');
    }
  };

  const getFilteredItems = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return items.filter(item => {
      const d = new Date(item.date);
      if (activeTab === 'today') return d >= today;
      if (activeTab === 'week') return d >= weekStart;
      return d >= monthStart;
    });
  };

  const filteredItems = getFilteredItems();
  const totalSaved = filteredItems.reduce((sum, item) => sum + item.price, 0);
  const currentStock = stocks[stockIndex];
  const formatPrice = (p) => (p || 0).toLocaleString('ko-KR');
  const tabLabels = { today: '오늘', week: '이번 주', month: '이번 달' };
  const getMyRank = () => { const idx = rankings.findIndex(r => r.id === user?.id); return idx >= 0 ? idx + 1 : null; };

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
      <div className="text-center"><span className="text-6xl block mb-4 animate-bounce">🦁</span><p className="text-amber-600">로딩 중...</p></div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-6xl block mb-2">🦁</span>
          <h1 className="text-2xl font-bold text-gray-800">참고 사자</h1>
          <p className="text-gray-500 text-sm">참고, 아낀 돈으로 주식 사자!</p>
        </div>
        <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
          <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className={`flex-1 py-2 rounded-lg text-sm font-medium ${authMode === 'login' ? 'bg-white shadow text-amber-600' : 'text-gray-500'}`}>로그인</button>
          <button onClick={() => { setAuthMode('register'); setAuthError(''); }} className={`flex-1 py-2 rounded-lg text-sm font-medium ${authMode === 'register' ? 'bg-white shadow text-amber-600' : 'text-gray-500'}`}>회원가입</button>
        </div>
        <div className="space-y-3">
          <input type="text" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} placeholder="아이디" className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} placeholder="비밀번호" className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" onKeyPress={(e) => e.key === 'Enter' && authMode === 'login' && handleLogin()} />
          {authMode === 'register' && <input type="text" value={authForm.nickname} onChange={(e) => setAuthForm({ ...authForm, nickname: e.target.value })} placeholder="닉네임 (랭킹에 표시)" className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" onKeyPress={(e) => e.key === 'Enter' && handleRegister()} />}
        </div>
        {authError && <p className="text-red-500 text-sm mt-3 text-center">{authError}</p>}
        <button onClick={authMode === 'login' ? handleLogin : handleRegister} className="w-full mt-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold">{authMode === 'login' ? '로그인' : '가입하기'}</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 pb-20">
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🦁</span>
            <div><h1 className="text-lg font-bold">참고 사자</h1><p className="text-amber-100 text-xs">{user?.nickname}</p></div>
          </div>
          <div className="flex items-center gap-2">
            {getMyRank() && <div className="bg-white/20 px-3 py-1 rounded-full text-sm">🏆 {getMyRank()}위</div>}
            <button onClick={handleLogout} className="bg-white/20 px-3 py-1 rounded-full text-sm">로그아웃</button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {currentView === 'home' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <div className="flex gap-2 mb-4">
                {['today', 'week', 'month'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-2 rounded-full text-sm font-medium ${activeTab === tab ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{tabLabels[tab]}</button>
                ))}
              </div>
              <div className="text-center py-3">
                <p className="text-gray-500 text-sm mb-1">{tabLabels[activeTab]} 참은 금액</p>
                <p className="text-4xl font-bold text-amber-600">₩{formatPrice(totalSaved)}</p>
                <p className="text-gray-400 text-sm mt-1">{filteredItems.length}번 참았어요!</p>
              </div>
              {totalSaved > 0 && currentStock && currentStock.price > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="bg-green-50 rounded-xl p-4 text-center transition-all">
                    <p className="text-xs text-gray-500 mb-1">
                      {currentStock.name} (현재가 {currentStock.currency === 'KRW' ? `₩${formatPrice(currentStock.price)}` : `$${currentStock.price.toFixed(2)}`})
                    </p>
                    <p className="text-xl font-bold text-green-600">
                      {(currentStock.currency === 'KRW' ? totalSaved / currentStock.price : totalSaved / (currentStock.price * 1450)).toFixed(3)}주
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{currentStock.name} 살 수 있어요!</p>
                    <div className="flex justify-center gap-1 mt-2">
                      {stocks.map((_, i) => (
                        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === stockIndex ? 'bg-green-500' : 'bg-gray-300'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setShowModal(true)} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-2"><span className="text-2xl">🦁</span> 참았다!</button>
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3">📝 {tabLabels[activeTab]} 참은 목록</h2>
              {filteredItems.length === 0 ? <div className="text-center py-6 text-gray-400"><span className="text-3xl block mb-2">🦁</span><p className="text-sm">아직 참은 게 없어요</p></div> : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl group">
                      <div><p className="font-medium text-gray-700 text-sm">{item.name}</p><p className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div>
                      <div className="flex items-center gap-2"><span className="font-bold text-amber-600 text-sm">₩{formatPrice(item.price)}</span><button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1">✕</button></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'ranking' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3">🏆 전체 랭킹</h2>
              <div className="flex gap-2 mb-4">
                {[{ key: 'day', label: '일간' }, { key: 'week', label: '주간' }, { key: 'month', label: '월간' }, { key: 'all', label: '전체' }].map(t => (
                  <button key={t.key} onClick={() => setRankingTab(t.key)} className={`flex-1 py-2 rounded-full text-sm font-medium ${rankingTab === t.key ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{t.label}</button>
                ))}
              </div>
              <div className="space-y-2">
                {rankings.length === 0 ? <p className="text-center text-gray-400 py-6">아직 참가자가 없어요</p> : rankings.slice(0, 20).map((entry, idx) => (
                  <div key={entry.id} className={`flex items-center justify-between p-3 rounded-xl ${entry.id === user?.id ? 'bg-amber-100 border-2 border-amber-400' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-yellow-400 text-white' : idx === 1 ? 'bg-gray-300 text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{idx + 1}</span>
                      <span className="font-medium">{entry.name} {entry.id === user?.id && '(나)'}</span>
                    </div>
                    <span className="font-bold text-amber-600">₩{formatPrice(entry.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hall of Fame */}
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3">🏆 명예의 전당</h2>
              {hallOfFame.length === 0 ? (
                <p className="text-center text-gray-400 py-6">아직 기록이 없어요</p>
              ) : (
                <div className="space-y-3">
                  {['week', 'month'].map(type => {
                    const records = hallOfFame.filter(r => r.period_type === type);
                    if (records.length === 0) return null;
                    return (
                      <div key={type} className="border-b border-gray-100 pb-3 last:border-0">
                        <h3 className="text-sm font-bold text-gray-600 mb-2">
                          {type === 'week' ? '🥇 주간 챔피언' : '👑 월간 챔피언'}
                        </h3>
                        <div className="space-y-2">
                          {records.slice(0, 3).map(record => (
                            <div key={record.id} className="bg-gradient-to-r from-yellow-50 to-orange-50 p-3 rounded-xl">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-bold text-amber-700">{record.user_name}</p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(record.period_start).toLocaleDateString('ko-KR')} ~ {new Date(record.period_end).toLocaleDateString('ko-KR')}
                                  </p>
                                </div>
                                <span className="text-lg font-bold text-amber-600">₩{formatPrice(record.total_amount)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'groups' && !selectedGroup && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3">👥 내 그룹</h2>
              <div className="flex gap-2 mb-4">
                <button onClick={() => setShowCreateGroup(true)} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium text-sm">➕ 그룹 만들기</button>
                <button onClick={() => setShowJoinGroup(true)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm">🔗 코드로 참여</button>
              </div>
              {myGroups.length === 0 ? <div className="text-center py-6 text-gray-400"><span className="text-3xl block mb-2">👥</span><p className="text-sm">참여 중인 그룹이 없어요</p></div> : (
                <div className="space-y-2">
                  {myGroups.map(g => (
                    <button key={g.id} onClick={() => loadGroupDetails(g.id)} className="w-full flex items-center justify-between bg-gray-50 p-4 rounded-xl text-left">
                      <div><p className="font-bold text-gray-700">{g.name}</p><p className="text-xs text-gray-400">{g.member_count}명</p></div>
                      <span className="text-gray-400">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'groups' && selectedGroup && (
          <div className="space-y-4">
            <button onClick={() => setSelectedGroup(null)} className="text-gray-500 text-sm">← 그룹 목록</button>
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 text-lg mb-3">{selectedGroup.name}</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-500 mb-1 text-center">초대 코드</p>
                <p className="text-2xl font-bold text-amber-600 text-center tracking-[0.3em]">{selectedGroup.code}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { navigator.clipboard?.writeText(selectedGroup.code); alert('코드 복사됨!'); }} className="flex-1 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700">📋 코드 복사</button>
                  <button onClick={() => shareGroup(selectedGroup.code)} className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium">📤 공유하기</button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-3">🏆 주간 대결 (월~일)</p>
              <div className="space-y-2">
                {(selectedGroup.members || []).map((m, idx) => (
                  <div key={m.id} className={`flex items-center justify-between p-3 rounded-xl ${m.id === user.id ? 'bg-amber-100 border-2 border-amber-400' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx === 0 ? 'bg-yellow-400 text-white' : idx === 1 ? 'bg-gray-300 text-white' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{idx + 1}</span>
                      <div>
                        <span className="font-medium">{m.name} {m.id === user.id && '(나)'}</span>
                        <p className="text-xs text-gray-400">{m.weekly_count || 0}번 참음</p>
                      </div>
                    </div>
                    <span className="font-bold text-amber-600">₩{formatPrice(m.weekly_total)}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => leaveGroup(selectedGroup.id)} className="flex-1 py-2 text-gray-500 text-sm border border-gray-200 rounded-lg">그룹 나가기</button>
                {selectedGroup.created_by === user.id && (
                  <button onClick={() => deleteGroup(selectedGroup.id)} className="flex-1 py-2 text-red-500 text-sm border border-red-200 rounded-lg">그룹 삭제</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-md mx-auto flex">
          {[{ key: 'home', icon: '🏠', label: '홈' }, { key: 'ranking', icon: '🏆', label: '랭킹' }, { key: 'groups', icon: '👥', label: '그룹' }].map(n => (
            <button key={n.key} onClick={() => { setCurrentView(n.key); setSelectedGroup(null); }} className={`flex-1 py-3 flex flex-col items-center gap-1 ${currentView === n.key ? 'text-amber-600' : 'text-gray-400'}`}>
              <span className="text-xl">{n.icon}</span><span className="text-xs">{n.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="text-center mb-4"><span className="text-5xl">🦁</span><h2 className="text-xl font-bold text-gray-700 mt-2">뭘 참았어?</h2></div>
            <div className="space-y-4">
              <input type="text" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} placeholder="예: 스타벅스 라떼" className="w-full p-3 border rounded-xl" autoFocus />
              <input type="number" value={newItem.price} onChange={(e) => setNewItem({...newItem, price: e.target.value})} placeholder="가격" className="w-full p-3 border rounded-xl" />
              <div className="flex flex-wrap gap-2">
                {[5000, 10000, 15000, 30000].map(p => <button key={p} onClick={() => setNewItem({...newItem, price: p.toString()})} className="px-3 py-1 bg-gray-100 rounded-full text-sm">₩{formatPrice(p)}</button>)}
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setShowModal(false); setNewItem({ name: '', price: '' }); }} className="flex-1 py-3 rounded-xl bg-gray-100">취소</button>
              <button onClick={addItem} disabled={!newItem.name || !newItem.price} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50">참았다! 🦁</button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-700 mb-4 text-center">👥 그룹 만들기</h2>
            <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="그룹 이름" className="w-full p-3 border rounded-xl mb-4" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { setShowCreateGroup(false); setNewGroupName(''); }} className="flex-1 py-3 rounded-xl bg-gray-100">취소</button>
              <button onClick={createGroup} disabled={!newGroupName.trim()} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50">만들기</button>
            </div>
          </div>
        </div>
      )}

      {showJoinGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-700 mb-4 text-center">🔗 그룹 참여</h2>
            <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="참여 코드" className="w-full p-3 border rounded-xl mb-4 text-center text-lg tracking-widest" maxLength={6} autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { setShowJoinGroup(false); setJoinCode(''); }} className="flex-1 py-3 rounded-xl bg-gray-100">취소</button>
              <button onClick={joinGroup} disabled={joinCode.length < 6} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50">참여하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
