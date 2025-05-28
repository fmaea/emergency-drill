// 文件路径: js/lobby.js

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. 获取所有需要的DOM元素 ---
  const titleElement = document.getElementById('case-title');
  const teamListContainer = document.getElementById('team-list-container');
  const teamCountElement = document.getElementById('team-count');
  const waitingPlaceholder = document.getElementById('waiting-placeholder');
  const startDrillButton = document.getElementById('start-drill-btn');
  const joinLinkInput = document.getElementById('join-link');
  const copyLinkButton = document.getElementById('copy-link-btn');
  const copyFeedbackElement = document.getElementById('copy-feedback');
  const qrCanvasElement = document.getElementById('qr-code-canvas');

  // --- 2. 初始化变量 ---
  let teamCount = 0;
  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('caseId');

  // --- 3. 页面初始化和错误处理 ---
  if (!caseId) {
    titleElement.textContent = '错误：未选择任何案例';
    if (startDrillButton) {
      startDrillButton.classList.add('pointer-events-none', 'opacity-50');
      startDrillButton.removeAttribute('href');
    }
    joinLinkInput.value = '无效的案例ID';
    return; 
  }

  // 初始时禁用开始按钮
  startDrillButton.classList.add('pointer-events-none', 'opacity-50');

  // --- 4. 生成加入链接和二维码 ---
  // 注意：在实际部署时，请将 'http://127.0.0.1:5500' 替换为您的实际访问地址
  const joinUrl = `${window.location.origin}/join.html?caseId=${caseId}`;
  joinLinkInput.value = joinUrl;

  if (qrCanvasElement && typeof QRious !== 'undefined') {
    new QRious({
      element: qrCanvasElement,
      value: joinUrl,
      size: 208, // 尺寸 w-56 (224px) - p-4 (16px*2)
      padding: 0,
      level: 'H', // 高容错率
    });
  } else {
    console.error('QRious库未加载或Canvas元素不存在');
  }

  // --- 5. 设置 "复制链接" 按钮功能 ---
  copyLinkButton.addEventListener('click', () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      copyFeedbackElement.textContent = '复制成功!';
      setTimeout(() => { copyFeedbackElement.textContent = ''; }, 2000);
    }).catch(err => {
      console.error('复制失败: ', err);
      copyFeedbackElement.textContent = '复制失败';
    });
  });

  // --- 6. 获取案例详情 ---
  fetchCaseDetails(caseId, titleElement);

  // --- 7. 设置WebSocket连接和事件监听 ---
  const socket = io('http://localhost:7890'); 

  socket.on('connect', () => {
    console.log('[LOBBY] 成功连接到 WebSocket 服务器');
    socket.emit('joinLobby', { caseId: caseId, studentName: '教师端监控' }); 
  });

  socket.on('studentJoined', (data) => {
    console.log('[LOBBY] 新成员加入:', data);
    
    // 移除“等待中”的占位符
    if (waitingPlaceholder) {
      waitingPlaceholder.remove();
    }
    
    // 更新队伍数量
    teamCount++;
    teamCountElement.textContent = teamCount;
    
    // 添加新队伍到列表
    const newTeamLi = document.createElement('li');
    newTeamLi.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between animate-fade-in-down';
    newTeamLi.innerHTML = `
      <span class="font-semibold text-lg flex items-center">
        <i class="fas fa-users-cog mr-3 text-gray-400"></i>${data.teamName || '未知队伍'}
      </span>
      <span class="text-sm text-gray-400">${data.studentName || '未知学生'}</span>
    `;
    teamListContainer.appendChild(newTeamLi);
    
    // 如果有队伍加入，则激活“开始推演”按钮
    if (teamCount > 0) {
      startDrillButton.classList.remove('pointer-events-none', 'opacity-50');
    }
  });

  socket.on('drillStarted', (data) => {
    if (data.caseId && data.caseId === caseId) { 
        console.log(`[LOBBY] 收到开始指令，跳转到: drill_main.html?caseId=${data.caseId}`);
        window.location.href = `drill_main.html?caseId=${data.caseId}`;
    }
  });

  socket.on('disconnect', () => console.log('[LOBBY] 与 WebSocket 服务器的连接已断开'));
  socket.on('connect_error', (error) => console.error('[LOBBY] WebSocket 连接错误:', error));

  // --- 8. 为 "开始推演" 按钮绑定最终的点击事件 ---
  startDrillButton.addEventListener('click', (event) => {
    event.preventDefault(); 
    if (teamCount === 0) {
      alert('还没有任何队伍加入，无法开始推演！');
      return;
    }
    if (socket && socket.connected) {
      console.log(`[LOBBY] 发送 "startDrill" 事件，案例ID: ${caseId}`);
      socket.emit('startDrill', { caseId: caseId }); 
    } else {
      alert('错误：与服务器的实时连接已断开，请刷新页面重试。');
    }
  });
});

/**
 * 异步获取并显示案例标题
 * @param {string} caseId - 案例ID
 * @param {HTMLElement} titleElement - 用于显示标题的DOM元素
 */
async function fetchCaseDetails(caseId, titleElement) {
  try {
    const response = await fetch(`http://localhost:7890/api/cases/${caseId}`); 
    if (!response.ok) throw new Error(`获取案例详情失败，状态码: ${response.status}`);
    
    const caseData = await response.json();
    if (titleElement) {
      titleElement.textContent = caseData.title || '案例标题加载失败';
    }
  } catch (error) {
    console.error('获取案例详情时发生错误:', error.message);
    if (titleElement) {
      titleElement.textContent = '加载案例标题失败';
    }
  }
}