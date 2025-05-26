// 文件路径: js/lobby.js

document.addEventListener('DOMContentLoaded', () => {
  const titleElement = document.getElementById('case-title');
  const teamListContainer = document.getElementById('team-list-container');
  const startDrillButton = document.querySelector('a[href="drill_main.html"]'); 

  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('caseId');

  if (!caseId) {
    titleElement.textContent = '错误：未选择任何案例';
    console.error('URL中未找到 caseId');
    if(startDrillButton) startDrillButton.classList.add('pointer-events-none', 'opacity-50');
    return; 
  }

  fetchCaseDetails(caseId, titleElement);

  const socket = io('http://localhost:7890'); 

  socket.on('connect', () => {
    console.log('[LOBBY] 成功连接到 WebSocket 服务器，ID:', socket.id);
    if (caseId) {
      socket.emit('joinLobby', { caseId: caseId, studentName: '教师端监控' }); 
      console.log(`[LOBBY] 教师端已加入案例 ${caseId} 的大厅进行监控`);
    }
  });

  socket.on('studentJoined', (data) => {
    console.log('[LOBBY] 有新成员加入了大厅!', data);
    // ... (更新队伍列表的逻辑不变) ...
    if (teamListContainer) {
      const placeholder = teamListContainer.querySelector('li span.text-gray-500');
      if (placeholder && placeholder.textContent === '等待学生加入...') {
          placeholder.parentElement.remove(); 
      }
      const newTeamLi = document.createElement('li');
      newTeamLi.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between animate-fade-in-down';
      newTeamLi.innerHTML = `
        <span class="font-semibold text-lg">${data.teamName || '未知队伍'}</span>
        <span class="text-sm text-gray-400">${data.studentName || '未知学生'} 刚刚加入</span>
      `;
      teamListContainer.appendChild(newTeamLi);
    }
  });

  if (startDrillButton && caseId) {
    startDrillButton.addEventListener('click', (event) => {
      console.log('[LOBBY] "开始推演" 按钮被点击'); // --- 新增日志 ---
      event.preventDefault(); 
      console.log('[LOBBY] 阻止了默认跳转行为'); // --- 新增日志 ---
      
      if (socket && socket.connected) { // --- 新增检查 ---
        console.log(`[LOBBY] 正在向服务器发送 "startDrill" 事件，案例ID: ${caseId}`); // --- 新增日志 ---
        socket.emit('startDrill', { caseId: caseId, teacherId: 'current_teacher_id_placeholder' }); 
      } else {
        console.error('[LOBBY] WebSocket 未连接，无法发送 "startDrill" 事件'); // --- 新增日志 ---
        alert('错误：与服务器的实时连接已断开，请刷新页面重试。');
      }
    });
  } else {
    console.warn('[LOBBY] 未找到 "开始推演" 按钮或 caseId 无效，无法绑定点击事件。'); // --- 新增日志 ---
  }

  socket.on('drillStarted', (data) => {
    console.log('[LOBBY] 接收到服务器的 "drillStarted" 事件:', data); // --- 新增日志 ---
    if (data.caseId && data.caseId === caseId) { 
        console.log(`[LOBBY] 案例ID匹配，准备跳转到 drill_main.html?caseId=${data.caseId}`); // --- 新增日志 ---
        window.location.href = `drill_main.html?caseId=${data.caseId}`;
    } else {
        console.warn('[LOBBY] 接收到 "drillStarted" 事件，但 caseId 不匹配或无效:', data.caseId, '当前页面 caseId:', caseId); // --- 新增日志 ---
    }
  });

  socket.on('disconnect', () => {
    console.log('[LOBBY] 与 WebSocket 服务器的连接已断开');
    // ...
  });

  socket.on('connect_error', (error) => {
    console.error('[LOBBY] WebSocket 连接错误:', error);
    // ...
  });
});

async function fetchCaseDetails(caseId, titleElement) {
  // ... (此函数内容不变) ...
  try {
    const response = await fetch(`http://localhost:7890/api/cases/${caseId}`); 
    if (!response.ok) {
      let errorData = { message: `获取案例详情失败，状态码: ${response.status}` };
      try { const errJson = await response.json(); errorData.message = errJson.message || errorData.message; } catch (e) { /* 响应体不是JSON，或解析失败 */ }
      throw new Error(errorData.message);
    }
    const caseData = await response.json();
    if (titleElement) {
      titleElement.textContent = caseData.title || '案例标题加载失败';
    } else {
      console.warn('未找到 ID 为 "case-title" 的标题元素。');
    }
  } catch (error) {
    console.error('获取案例详情时发生错误:', error.message);
    if (titleElement) {
      titleElement.textContent = '加载案例标题失败';
    }
  }
}
