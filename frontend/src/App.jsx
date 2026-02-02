import React, { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = {
  async fetch(endpoint, options = {}) {
    const res = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  get: (endpoint) => api.fetch(endpoint),
  post: (endpoint, data) => api.fetch(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  delete: (endpoint) => api.fetch(endpoint, { method: 'DELETE' }),
};

function App() {
  const [user, setUser] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
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

  // Initialize
  useEffect(() => {
    const stored = localStorage.getItem('patience-lion-user');
    if (stored) {
      const userData = JSON.parse(stored);
      setUser(userData);
      loadUserData(userData.id);
    } else {
      setShowSetup(true);
      setIsLoading(false);
    }
  }, []);

  const loadUserData = async (userId) => {
    try {
      const userItems = await api.get(`/items/${userId}`);
      setItems(userItems.map(item => ({
        ...item,
        date: item.created_at
      })));
    } catch (e) {
      console.error('Failed to load items:', e);
    }
    setIsLoading(false);
  };

  // Load rankings
  const loadRankings = useCallback(async () => {
    try {
      const data = await api.get(`/rankings?period=${rankingTab}`);
      setRankings(data);
    } catch (e) {
      console.error('Failed to load rankings:', e);
    }
  }, [rankingTab]);

  useEffect(() => {
    if (user && currentView === 'ranking') {
      loadRankings();
    }
  }, [user, currentView, rankingTab, loadRankings]);

  // Load groups
  const loadGroups = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.get(`/groups/user/${user.id}`);
      setMyGroups(data);
    } catch (e) {
      console.error('Failed to load groups:', e);
    }
  }, [user]);

  useEffect(() => {
    if (user && currentView === 'groups') {
      loadGroups();
    }
  }, [user, currentView, loadGroups]);

  // Load group details
  const loadGroupDetails = async (groupId) => {
    try {
      const data = await api.get(`/groups/${groupId}`);
      setSelectedGroup(data);
    } catch (e) {
      console.error('Failed to load group:', e);
    }
  };

  // Setup user
  const handleSetup = async () => {
    if (!setupName.trim()) return;
    
    const newUser = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: setupName.trim()
    };
    
    try {
      await api.post('/users', newUser);
      localStorage.setItem('patience-lion-user', JSON.stringify(newUser));
      setUser(newUser);
      setShowSetup(false);
    } catch (e) {
      alert('가입 실패: ' + e.message);
    }
  };

  // Add item
  const addItem = async () => {
    if (!newItem.name || !newItem.price) return;
    
    try {
      const item = await api.post('/items', {
        user_id: user.id,
        name: newItem.name,
        price: parseInt(newItem.price)
      });
      
      setItems([{ ...item, date: item.created_at }, ...items]);
      setNewItem({ name: '', price: '' });
      setShowModal(false);
    } catch (e) {
      alert('추가 실패: ' + e.message);
    }
  };

  // Delete item
  const deleteItem = async (id) => {
    try {
      await api.delete(`/items/${id}`);
      setItems(items.filter(item => item.id !== id));
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  };

  // Create group
  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    
    try {
      const group = await api.post('/groups', {
        name: newGroupName.trim(),
        created_by: user.id
      });
      
      setMyGroups([...myGroups, group]);
      setShowCreateGroup(false);
      setNewGroupName('');
      loadGroupDetails(group.id);
    } catch (e) {
      alert('그룹 생성 실패: ' + e.message);
    }
  };

  // Join group
  const joinGroup = async () => {
    if (!joinCode.trim()) return;
    
    try {
      const group = await api.post('/groups/join', {
        code: joinCode.toUpperCase(),
        user_id: user.id
      });
      
      await loadGroups();
      setShowJoinGroup(false);
      setJoinCode('');
      loadGroupDetails(group.id);
    } catch (e) {
      alert('참여 실패: 코드를 확인해주세요');
    }
  };

  // Leave group
  const leaveGroup = async (groupId) => {
    if (!confirm('정말 이 그룹을 나가시겠어요?')) return;
    
    try {
      await api.delete(`/groups/${groupId}/members/${user.id}`);
      setMyGroups(myGroups.filter(g => g.id !== groupId));
      setSelectedGroup(null);
    } catch (e) {
      alert('나가기 실패: ' + e.message);
    }
  };

  // Filters
  const getFilteredItems = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return items.filter(item => {
      const itemDate = new Date(item.date);
      if (activeTab === 'today') return itemDate >= today;
      if (activeTab === 'week') return itemDate >= weekStart;
      return itemDate >= monthStart;
    });
  };

  const filteredItems = getFilteredItems();
  const totalSaved = filteredItems.reduce((sum, item) => sum + item.price, 0);

  const stocks = [
    { name: '삼성전자', price: 55000, emoji: '📱' },
    { name: 'KODEX 200', price: 35000, emoji: '📈' },
    { name: '카카오', price: 40000, emoji: '💬' },
    { name: '네이버', price: 180000, emoji: '🌐' },
  ];

  const getAffordableStocks = () => {
    return stocks
      .map(stock => ({ ...stock, shares: Math.floor(totalSaved / stock.price) }))
      .filter(stock => stock.shares > 0);
  };

  const formatPrice = (price) => (price || 0).toLocaleString('ko-KR');
  const tabLabels = { today: '오늘', week: '이번 주', month: '이번 달' };

  const getMyRank = () => {
    const idx = rankings.findIndex(r => r.id === user?.id);
    return idx >= 0 ? idx + 1 : null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4 animate-bounce">🦁</span>
          <p className="text-amber-600 font-medium">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
          <span className="text-7xl block mb-4">🦁</span>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">참고 사자</h1>
          <p className="text-gray-500 mb-6">참고, 아낀 돈으로 주식 사자!</p>
          
          <input
            type="text"
            value={setupName}
            onChange={(e) => setSetupName(e.target.value)}
            placeholder="닉네임을 입력하세요"
            className="w-full p-4 border-2 border-gray-200 rounded-xl text-center text-lg focus:outline-none focus:border-amber-500 mb-4"
            onKeyPress={(e) => e.key === 'Enter' && handleSetup()}
          />
          
          <button
            onClick={handleSetup}
            disabled={!setupName.trim()}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-lg disabled:opacity-50"
          >
            시작하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🦁</span>
            <div>
              <h1 className="text-lg font-bold">참고 사자</h1>
              <p className="text-amber-100 text-xs">{user?.name}</p>
            </div>
          </div>
          {getMyRank() && (
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
              🏆 전체 {getMyRank()}위
            </div>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {/* HOME VIEW */}
        {currentView === 'home' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <div className="flex gap-2 mb-4">
                {['today', 'week', 'month'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 px-2 rounded-full text-sm font-medium transition-all ${
                      activeTab === tab ? 'bg-amber-500 text-white shadow-md' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tabLabels[tab]}
                  </button>
                ))}
              </div>

              <div className="text-center py-3">
                <p className="text-gray-500 text-sm mb-1">{tabLabels[activeTab]} 참은 금액</p>
                <p className="text-4xl font-bold text-amber-600">₩{formatPrice(totalSaved)}</p>
                <p className="text-gray-400 text-sm mt-1">{filteredItems.length}번 참았어요!</p>
              </div>

              {totalSaved > 0 && getAffordableStocks().length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-2">살 수 있는 주식</p>
                  <div className="flex flex-wrap gap-2">
                    {getAffordableStocks().slice(0, 3).map(stock => (
                      <div key={stock.name} className="bg-green-50 px-3 py-1 rounded-full text-sm">
                        {stock.emoji} {stock.name} <span className="font-bold text-green-600">{stock.shares}주</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowModal(true)}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span className="text-2xl">🦁</span> 참았다!
            </button>

            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3">📝 {tabLabels[activeTab]} 참은 목록</h2>
              
              {filteredItems.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <span className="text-3xl block mb-2">🦁</span>
                  <p className="text-sm">아직 참은 게 없어요</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {filteredItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl group">
                      <div>
                        <p className="font-medium text-gray-700 text-sm">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(item.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-600 text-sm">₩{formatPrice(item.price)}</span>
                        <button onClick={() => deleteItem(item.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RANKING VIEW */}
        {currentView === 'ranking' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3 flex items-center gap-2">🏆 전체 랭킹</h2>
              
              <div className="flex gap-2 mb-4">
                {[
                  { key: 'week', label: '주간' },
                  { key: 'month', label: '월간' },
                  { key: 'all', label: '전체' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setRankingTab(tab.key)}
                    className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
                      rankingTab === tab.key ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {rankings.length === 0 ? (
                  <p className="text-center text-gray-400 py-6">아직 참가자가 없어요</p>
                ) : (
                  rankings.slice(0, 20).map((entry, idx) => {
                    const isMe = entry.id === user?.id;
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between p-3 rounded-xl ${
                          isMe ? 'bg-amber-100 border-2 border-amber-400' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            idx === 0 ? 'bg-yellow-400 text-white' :
                            idx === 1 ? 'bg-gray-300 text-white' :
                            idx === 2 ? 'bg-amber-600 text-white' :
                            'bg-gray-200 text-gray-600'
                          }`}>
                            {idx + 1}
                          </span>
                          <span className={`font-medium ${isMe ? 'text-amber-700' : 'text-gray-700'}`}>
                            {entry.name} {isMe && '(나)'}
                          </span>
                        </div>
                        <span className="font-bold text-amber-600">₩{formatPrice(entry.total)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* GROUPS VIEW */}
        {currentView === 'groups' && !selectedGroup && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <h2 className="font-bold text-gray-700 mb-3 flex items-center gap-2">👥 내 그룹</h2>
              
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-medium text-sm"
                >
                  ➕ 그룹 만들기
                </button>
                <button
                  onClick={() => setShowJoinGroup(true)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm"
                >
                  🔗 코드로 참여
                </button>
              </div>

              {myGroups.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <span className="text-3xl block mb-2">👥</span>
                  <p className="text-sm">참여 중인 그룹이 없어요</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myGroups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => loadGroupDetails(group.id)}
                      className="w-full flex items-center justify-between bg-gray-50 p-4 rounded-xl hover:bg-gray-100 transition-colors text-left"
                    >
                      <div>
                        <p className="font-bold text-gray-700">{group.name}</p>
                        <p className="text-xs text-gray-400">{group.member_count}명 참여 중</p>
                      </div>
                      <span className="text-gray-400">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GROUP DETAIL */}
        {currentView === 'groups' && selectedGroup && (
          <div className="space-y-4">
            <button onClick={() => setSelectedGroup(null)} className="text-gray-500 flex items-center gap-1 text-sm">
              ← 그룹 목록
            </button>
            
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-gray-700 text-lg">{selectedGroup.name}</h2>
                  <p className="text-xs text-gray-400">참여 코드: {selectedGroup.code}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(selectedGroup.code);
                    alert('코드가 복사되었어요!');
                  }}
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm"
                >
                  📋 복사
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-3">🏆 이번 주 순위</p>
              <div className="space-y-2">
                {(selectedGroup.members || []).map((member, idx) => {
                  const isMe = member.id === user.id;
                  return (
                    <div
                      key={member.id}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        isMe ? 'bg-amber-100 border-2 border-amber-400' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-yellow-400 text-white' :
                          idx === 1 ? 'bg-gray-300 text-white' :
                          idx === 2 ? 'bg-amber-600 text-white' :
                          'bg-gray-200 text-gray-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className={`font-medium ${isMe ? 'text-amber-700' : 'text-gray-700'}`}>
                          {member.name} {isMe && '(나)'}
                        </span>
                      </div>
                      <span className="font-bold text-amber-600">₩{formatPrice(member.weekly_total)}</span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => leaveGroup(selectedGroup.id)}
                className="w-full mt-4 py-2 text-red-500 text-sm"
              >
                그룹 나가기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-md mx-auto flex">
          {[
            { key: 'home', icon: '🏠', label: '홈' },
            { key: 'ranking', icon: '🏆', label: '랭킹' },
            { key: 'groups', icon: '👥', label: '그룹' }
          ].map(nav => (
            <button
              key={nav.key}
              onClick={() => { setCurrentView(nav.key); setSelectedGroup(null); }}
              className={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors ${
                currentView === nav.key ? 'text-amber-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">{nav.icon}</span>
              <span className="text-xs font-medium">{nav.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <span className="text-5xl">🦁</span>
              <h2 className="text-xl font-bold text-gray-700 mt-2">뭘 참았어?</h2>
            </div>
            
            <div className="space-y-4">
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                placeholder="예: 스타벅스 라떼"
                className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
              
              <input
                type="number"
                value={newItem.price}
                onChange={(e) => setNewItem({...newItem, price: e.target.value})}
                placeholder="가격"
                className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              <div className="flex flex-wrap gap-2">
                {[5000, 10000, 15000, 30000].map(price => (
                  <button
                    key={price}
                    onClick={() => setNewItem({...newItem, price: price.toString()})}
                    className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600 hover:bg-amber-100"
                  >
                    ₩{formatPrice(price)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setShowModal(false); setNewItem({ name: '', price: '' }); }}
                className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-600"
              >
                취소
              </button>
              <button
                onClick={addItem}
                disabled={!newItem.name || !newItem.price}
                className="flex-1 py-3 rounded-xl font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50"
              >
                참았다! 🦁
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold text-gray-700 mb-4 text-center">👥 그룹 만들기</h2>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="그룹 이름"
              className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowCreateGroup(false); setNewGroupName(''); }} className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-600">취소</button>
              <button onClick={createGroup} disabled={!newGroupName.trim()} className="flex-1 py-3 rounded-xl font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50">만들기</button>
            </div>
          </div>
        </div>
      )}

      {showJoinGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold text-gray-700 mb-4 text-center">🔗 그룹 참여</h2>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="참여 코드"
              className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4 text-center text-lg tracking-widest"
              maxLength={6}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowJoinGroup(false); setJoinCode(''); }} className="flex-1 py-3 rounded-xl font-medium bg-gray-100 text-gray-600">취소</button>
              <button onClick={joinGroup} disabled={joinCode.length < 6} className="flex-1 py-3 rounded-xl font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white disabled:opacity-50">참여하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
