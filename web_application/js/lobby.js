// 文件路径: js/lobby.js

document.addEventListener('DOMContentLoaded', () => {
    const titleElement = document.getElementById('case-title');
    const teamListContainer = document.getElementById('team-list-container'); // 获取队伍列表的容器
  
    // 1. 从URL获取caseId并加载案例详情
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');
  
    if (caseId) {
      fetchCaseDetails(caseId, titleElement);
    } else {
      titleElement.textContent = '错误：未选择任何案例';
      console.error('URL中未找到 caseId');
      // 如果没有caseId，可能不需要初始化socket或进行其他操作
      return; 
    }
  
    // 2. 初始化 Socket.IO 连接
    // 请确保这里的URL和端口与您的后端服务器一致
    const socket = io('http://localhost:7890'); 
  
    socket.on('connect', () => {
      console.log('成功连接到 WebSocket 服务器，ID:', socket.id);
      
      // 只有成功获取 caseId 后才发送 joinLobby 事件
      if (caseId) {
        // 教师端加入房间，以便接收该案例大厅的更新
        socket.emit('joinLobby', { caseId: caseId, studentName: '教师端监控' }); 
        console.log(`教师端已加入案例 ${caseId} 的大厅进行监控`);
      }
    });
  
    // 3. 监听服务器广播的“新成员加入”事件
    socket.on('studentJoined', (data) => {
      console.log('有新成员加入了大厅!', data);
  
      if (teamListContainer) {
        // 创建一个新的列表项来显示加入的队伍/学生
        const newTeamLi = document.createElement('li');
        newTeamLi.className = 'bg-gray-700 p-3 rounded-lg flex items-center justify-between animate-fade-in-down';
        // 根据后端发送的 data 结构来填充内容
        // 假设 data 包含 teamName 和 studentName
        newTeamLi.innerHTML = `
          <span class="font-semibold text-lg">${data.teamName || '未知队伍'}</span>
          <span class="text-sm text-gray-400">${data.studentName || '未知学生'} 刚刚加入</span>
        `;
        teamListContainer.appendChild(newTeamLi);
      } else {
        console.warn('未找到 ID 为 "team-list-container" 的队伍列表容器。');
      }
    });
  
    socket.on('disconnect', () => {
      console.log('与 WebSocket 服务器的连接已断开');
      // 可以在这里添加一些用户提示，例如 “与服务器断开连接，实时更新可能不可用”
    });
  
    socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error);
      // 可以在这里提示用户连接失败
      if (titleElement && !caseId) { // 避免覆盖已有的错误信息
          // titleElement.textContent += ' (实时服务连接失败)';
      }
    });
  
  });
  
  /**
   * 根据案例ID从后端获取案例详情并更新标题
   * @param {string} caseId - 案例的ID
   * @param {HTMLElement} titleElement - 用于显示案例标题的HTML元素
   */
  async function fetchCaseDetails(caseId, titleElement) {
    try {
      // 请确保这里的URL和端口与您的后端服务器一致
      const response = await fetch(`http://localhost:7890/api/cases/${caseId}`);
  
      if (!response.ok) {
        // 如果获取失败，尝试解析错误信息（如果后端返回了JSON格式的错误）
        let errorData = { message: `获取案例详情失败，状态码: ${response.status}` };
        try {
          const errJson = await response.json();
          errorData.message = errJson.message || errorData.message;
        } catch (e) {
          // 响应体不是JSON，或解析失败
        }
        throw new Error(errorData.message);
      }
  
      const caseData = await response.json();
  
      if (titleElement) {
        titleElement.textContent = caseData.title || '案例标题加载失败';
      } else {
        console.warn('未找到 ID 为 "case-title" 的标题元素。');
      }
  
      // 可以在这里存储 caseData 或其部分信息，供页面其他部分使用
      // window.currentCaseData = caseData; 
  
    } catch (error) {
      console.error('获取案例详情时发生错误:', error.message);
      if (titleElement) {
        titleElement.textContent = '加载案例标题失败';
      }
    }
  }