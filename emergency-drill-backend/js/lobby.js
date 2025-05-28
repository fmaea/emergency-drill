// 文件路径: js/lobby.js

document.addEventListener('DOMContentLoaded', () => {
  const titleElement = document.getElementById('case-title');
  const teamListContainer = document.getElementById('team-list-container');
  const startDrillButton = document.getElementById('start-drill-btn'); // 确保HTML中开始按钮有此ID
  const joinLinkInput = document.getElementById('join-link');
  const copyLinkButton = document.getElementById('copy-link-btn');
  const copyFeedbackElement = document.getElementById('copy-feedback');
  const qrCanvasElement = document.getElementById('qr-code-canvas');
  const teamCountElement = document.getElementById('team-count'); // 获取队伍数量显示元素

  let currentLobbyTeams = []; // 【新增】用于存储当前大厅的队伍信息
  let teamCounter = 0; // 【新增】用于队伍计数

  const urlParams = new URLSearchParams(window.location.search);
  const caseId = urlParams.get('caseId');

  if (!caseId) {
    if(titleElement) titleElement.textContent = '错误：未选择任何案例';
    if (startDrillButton) {
      startDrillButton.classList.add('pointer-events-none', 'opacity-50');
      startDrillButton.removeAttribute('href'); // 如果是<a>标签
    }
    if(joinLinkInput) joinLinkInput.value = '无效的案例ID';
    return; 
  }

  // 初始时禁用开始按钮 (如果需要，可以根据队伍数量来启用)
  if (startDrillButton) {
      startDrillButton.classList.add('pointer-events-none', 'opacity-50');
  }
  
  // 生成加入链接和二维码 (假设 qrious.min.js 已在 lobby.html 引入)
  if (joinLinkInput) {
    // 【修改】确保使用正确的origin，或者硬编码一个可访问的地址
    // 对于本地文件系统 (file://)，window.location.origin可能是null
    // 您可能需要一个本地服务器来测试，或者提供一个固定的基础URL
    let baseUrl = window.location.origin;
    if (baseUrl === "null" || baseUrl === null) { // 处理 file:// 协议的情况
        // 尝试从当前URL中提取基础路径，但这可能不可靠
        // 最好是在一个web服务器环境下运行
        const pathArray = window.location.pathname.split('/');
        pathArray.pop(); // 移除 lobby.html
        baseUrl = window.location.protocol + "//" + window.location.host + pathArray.join('/');
        if (!window.location.host) baseUrl = "http://localhost:PORT"; // 替换 PORT 为您的本地服务器端口
        console.warn("当前在file://协议下，生成的加入链接可能不准确。建议使用本地服务器。");
    }
    const joinUrl = `${baseUrl}/join.html?caseId=${caseId}`;
    joinLinkInput.value = joinUrl;

    if (qrCanvasElement && typeof QRious !== 'undefined') {
        new QRious({
            element: qrCanvasElement,
            value: joinUrl,
            size: 208, 
            padding: 0,
            level: 'H', 
        });
    }
  }
  if(copyLinkButton && joinLinkInput) {
    copyLinkButton.addEventListener('click', () => {
        navigator.clipboard.writeText(joinLinkInput.value).then(() => {
            if(copyFeedbackElement) copyFeedbackElement.textContent = '复制成功!';
            setTimeout(() => { if(copyFeedbackElement) copyFeedbackElement.textContent = ''; }, 2000);
        }).catch(err => {
            console.error('复制失败: ', err);
            if(copyFeedbackElement) copyFeedbackElement.textContent = '复制失败';
        });
    });
  }


  fetchCaseDetails(caseId, titleElement);

  const socket = io('http://localhost:7890'); 

  socket.on('connect', () => {
    console.log('[LOBBY] 成功连接到 WebSocket 服务器');
    socket.emit('joinLobby', { caseId: caseId, studentName: '教师端监控' }); 
  });

  socket.on('studentJoined', (data) => {
    console.log('[LOBBY] 新成员加入:', data);
    
    const waitingPlaceholder = document.getElementById('waiting-placeholder');
    if (waitingPlaceholder) {
      waitingPlaceholder.style.display = 'none'; // 隐藏“等待中”
    }
    
    teamCounter++; // 队伍计数增加
    if(teamCountElement) teamCountElement.textContent = teamCounter;
    
    if (teamListContainer) {
        const newTeamLi = document.createElement('li');
        newTeamLi.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between animate-fade-in-down';
        newTeamLi.innerHTML = `
        <span class="font-semibold text-lg flex items-center">
            <i class="fas fa-users-cog mr-3 text-gray-400"></i>${data.teamName || '未知队伍'}
        </span>
        <span class="text-sm text-gray-400">${data.studentName || '未知学生'}</span>
        `;
        teamListContainer.appendChild(newTeamLi);
    }
    
    // 【新增】将加入的队伍信息存储起来
    if (data.teamName) { // 确保队名存在
        const existingTeam = currentLobbyTeams.find(team => team.name === data.teamName);
        if (!existingTeam) { // 避免重复添加相同队名的队伍
            currentLobbyTeams.push({
                id: `team-${Date.now()}-${Math.random().toString(16).slice(2)}`, // 生成一个简单唯一ID
                name: data.teamName,
                score: 0,
                answers: {} // 为后续计分做准备
            });
            // 【新增】将更新后的队伍列表保存到 localStorage
            localStorage.setItem('drillTeams', JSON.stringify(currentLobbyTeams));
            console.log('[LOBBY] 更新队伍列表到 localStorage:', currentLobbyTeams);
        }
    }

    // 如果有队伍加入，则激活“开始推演”按钮
    if (teamCounter > 0 && startDrillButton) {
      startDrillButton.classList.remove('pointer-events-none', 'opacity-50');
      startDrillButton.href = `drill_main.html?caseId=${caseId}`; // 设置正确的跳转链接
    }
  });

  socket.on('drillStarted', (data) => {
    if (data.caseId && data.caseId === caseId) { 
        console.log(`[LOBBY] 收到开始指令，跳转到: drill_main.html?caseId=${data.caseId}`);
        // 在跳转前，确保最新的队伍列表已保存 (虽然studentJoined时已保存，这里再保存一次也无妨)
        localStorage.setItem('drillTeams', JSON.stringify(currentLobbyTeams));
        window.location.href = `drill_main.html?caseId=${data.caseId}`;
    }
  });
  
  // 【修改】确保教师点击“开始推演”按钮时，也保存队伍列表并携带caseId跳转
  if (startDrillButton) {
      startDrillButton.addEventListener('click', function(event) {
          event.preventDefault(); // 阻止默认的<a>标签跳转
          if (teamCounter === 0 && !confirm("当前没有队伍加入，确定要开始推演吗？")) {
              return;
          }
          localStorage.setItem('drillTeams', JSON.stringify(currentLobbyTeams));
          // 如果是通过socket.emit('startDrill')来触发服务器开始，则服务器的'drillStarted'事件会负责跳转
          // 如果是教师直接点击按钮跳转（无服务器强制开始），则需要在这里直接跳转
          // 为保持一致，我们假设教师点击按钮也是通过socket通知服务器，然后由服务器广播开始
          if (socket && socket.connected) {
              console.log(`[LOBBY] 教师点击开始推演，发送 "startDrill" 事件，案例ID: ${caseId}`);
              socket.emit('startDrill', { caseId: caseId });
          } else {
              alert('错误：与服务器的连接已断开，无法开始推演。请刷新页面。');
          }
      });
  }


  socket.on('disconnect', () => console.log('[LOBBY] 与 WebSocket 服务器的连接已断开'));
  socket.on('connect_error', (error) => console.error('[LOBBY] WebSocket 连接错误:', error));

});

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
