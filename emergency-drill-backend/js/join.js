// 文件路径: js/join.js

document.addEventListener('DOMContentLoaded', () => {
    const caseTitleElement = document.getElementById('case-title-join');
    const teamNameInput = document.getElementById('team-name');
    const studentNameInput = document.getElementById('student-name');
    const joinButton = document.getElementById('join-button');
    const statusMessage = document.getElementById('status-message');

    // 1. 从 URL 获取 caseId
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');

    if (!caseId) {
        caseTitleElement.textContent = '错误：无效的加入链接';
        joinButton.disabled = true;
        joinButton.classList.add('cursor-not-allowed', 'bg-gray-600');
        return;
    }

    // （可选）加载并显示案例标题，给学生更好的体验
    fetch(`http://localhost:7890/api/cases/${caseId}`)
        .then(res => res.json())
        .then(data => {
            if (data.title) {
                caseTitleElement.textContent = `案例: ${data.title}`;
            }
        })
        .catch(err => console.error('获取案例标题失败:', err));


    // 2. 设置 WebSocket 连接
    const socket = io('http://localhost:7890');

    socket.on('connect', () => {
        console.log('成功连接到 WebSocket 服务器');
    });

    socket.on('connect_error', (error) => {
        console.error('WebSocket 连接错误:', error);
        statusMessage.textContent = '无法连接到服务器';
        statusMessage.classList.add('text-red-400');
    });

    // 3. 处理“确认加入”按钮的点击事件
    joinButton.addEventListener('click', () => {
        const teamName = teamNameInput.value.trim();
        const studentName = studentNameInput.value.trim();

        if (!teamName || !studentName) {
            alert('队伍名称和你的名字都不能为空！');
            return;
        }

        // 构造要发送的数据
        const joinData = {
            caseId: caseId,
            teamName: teamName,
            studentName: studentName
        };

        // 通过 WebSocket 发送 'joinLobby' 事件到服务器
        socket.emit('joinLobby', joinData);
        console.log('已发送加入请求:', joinData);

        // 更新UI，给用户反馈
        joinButton.disabled = true;
        joinButton.textContent = '已加入成功！';
        joinButton.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
        joinButton.classList.add('bg-green-600', 'cursor-not-allowed');
        statusMessage.textContent = '请等待教师开始推演...';
        teamNameInput.disabled = true;
        studentNameInput.disabled = true;
    });
});