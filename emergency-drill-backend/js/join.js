// 文件路径: js/join.js

document.addEventListener('DOMContentLoaded', () => {
    const caseTitleElement = document.getElementById('case-title-join');
    const teamNameInput = document.getElementById('team-name');
    const studentNameInput = document.getElementById('student-name');
    const joinButton = document.getElementById('join-button');
    const statusMessage = document.getElementById('status-message');

    // 1. 从 URL 获取 caseId。不再强制要求 lobbyId。
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');

    if (!caseId) {
        if(caseTitleElement) caseTitleElement.textContent = '错误：无效的加入链接。';
        if(statusMessage) {
            statusMessage.textContent = '链接错误，缺少案例ID (Case ID)。';
            statusMessage.className = 'text-center text-red-400 mt-4 h-4';
        }
        if(joinButton) {
            joinButton.disabled = true;
            joinButton.classList.add('cursor-not-allowed', 'bg-gray-600');
        }
        if (teamNameInput) teamNameInput.disabled = true;
        if (studentNameInput) studentNameInput.disabled = true;
        console.error("[JOIN.JS] URL中缺少caseId参数。");
        return;
    }

    // 2. 加载并显示案例标题 (使用 caseId)
    if (caseTitleElement) {
        caseTitleElement.textContent = `案例加载中 (ID: ${caseId})...`;
    }
    fetch(`http://localhost:7890/api/cases/${caseId}`)
        .then(res => {
            if (!res.ok) {
                throw new Error(`获取案例信息失败: ${res.status} ${res.statusText}`);
            }
            return res.json();
        })
        .then(data => {
            if (caseTitleElement) {
                if (data && data.title) {
                    caseTitleElement.textContent = `案例: ${data.title.replace(/\[cite: \d+\]/g, '').trim()}`;
                } else {
                    caseTitleElement.textContent = `案例 (ID: ${caseId}) 信息已加载`;
                    console.warn("[JOIN.JS] 从API获取的案例数据中缺少标题:", data);
                }
            }
        })
        .catch(err => {
            console.error('[JOIN.JS] 获取案例标题失败:', err);
            if (caseTitleElement) caseTitleElement.textContent = '案例信息加载失败';
            if (statusMessage) {
                statusMessage.textContent = '无法加载案例详情，请检查网络或稍后重试。';
                statusMessage.className = 'text-center text-red-400 mt-4 h-4';
            }
        });

    // 3. 设置 WebSocket 连接
    const socket = io('http://localhost:7890', {
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('[JOIN.JS] 学生端成功连接到 WebSocket 服务器:', socket.id);
        if (statusMessage) {
            statusMessage.textContent = '已连接服务器，请输入信息加入。';
            statusMessage.className = 'text-center text-green-400 mt-4 h-4';
        }
        if (joinButton) joinButton.disabled = false;
    });

    socket.on('connect_error', (error) => {
        console.error('[JOIN.JS] 学生端 WebSocket 连接错误:', error);
        if (statusMessage) {
            statusMessage.textContent = '无法连接到服务器，请检查网络或刷新页面。';
            statusMessage.className = 'text-center text-red-400 mt-4 h-4';
        }
        if (joinButton) {
            joinButton.disabled = true;
            joinButton.textContent = '连接失败';
            joinButton.classList.add('bg-gray-600', 'cursor-not-allowed');
            joinButton.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('[JOIN.JS] 学生端与 WebSocket 服务器断开连接:', reason);
        if (joinButton && joinButton.textContent !== '已成功加入！') {
            if (statusMessage) {
                statusMessage.textContent = '与服务器连接断开，请刷新重试。';
                statusMessage.className = 'text-center text-red-400 mt-4 h-4';
            }
            joinButton.disabled = true;
        }
    });
    
    socket.on('joinSuccess', (data) => {
        console.log('[JOIN.JS] 成功加入大厅:', data);
        if (statusMessage) {
            statusMessage.textContent = data.message || '成功加入！请等待教师开始推演...';
            statusMessage.className = 'text-center text-green-400 mt-4 h-4';
        }
        if (joinButton) {
            joinButton.textContent = '已成功加入！';
            joinButton.disabled = true;
            joinButton.classList.remove('bg-cyan-600', 'hover:bg-cyan-700', 'bg-yellow-500');
            joinButton.classList.add('bg-green-600', 'cursor-not-allowed');
        }
        if (teamNameInput) teamNameInput.disabled = true;
        if (studentNameInput) studentNameInput.disabled = true;
    });

    socket.on('joinFailed', (data) => {
        console.error('[JOIN.JS] 加入大厅失败:', data.message);
        if (statusMessage) {
            statusMessage.textContent = `加入失败: ${data.message || '未知错误，请重试。'}`;
            statusMessage.className = 'text-center text-red-400 mt-4 h-4';
        }
        if (joinButton) {
            joinButton.disabled = false;
            joinButton.textContent = '确认加入';
            joinButton.classList.remove('bg-yellow-500', 'bg-green-600', 'cursor-not-allowed');
            joinButton.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
        }
    });

    socket.on('lobbyError', (data) => { // 通用大厅级别错误
        console.error('[JOIN.JS] 大厅错误:', data.message);
        if (statusMessage) {
            statusMessage.textContent = `错误: ${data.message}`;
            statusMessage.className = 'text-center text-red-400 mt-4 h-4';
        }
        if (joinButton) joinButton.disabled = true;
    });

    // 4. 处理“确认加入”按钮的点击事件
    if (joinButton) {
        joinButton.addEventListener('click', () => {
            const teamName = teamNameInput.value.trim();
            const studentName = studentNameInput.value.trim();

            if (!teamName || !studentName) {
                alert('队伍名称和你的名字都不能为空！');
                return;
            }

            joinButton.disabled = true;
            joinButton.textContent = '正在加入...';
            joinButton.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
            joinButton.classList.add('bg-yellow-500');
            if (statusMessage) {
                statusMessage.textContent = '正在尝试加入大厅...';
                statusMessage.className = 'text-center text-yellow-400 mt-4 h-4';
            }

            // 【修改】发送的数据中不再包含 lobbyId
            const joinData = {
                caseId: caseId,      // 从URL获取
                teamName: teamName,
                studentName: studentName
            };

            socket.emit('joinLobby', joinData);
            console.log('[JOIN.JS] 已发送加入请求:', joinData);
        });
    } else {
        console.error("[JOIN.JS] 错误：未找到加入按钮元素 (join-button)");
    }
});
