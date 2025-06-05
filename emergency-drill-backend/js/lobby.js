// 文件路径: js/lobby.js

document.addEventListener('DOMContentLoaded', async () => {
    const caseTitleElement = document.getElementById('lobby-case-title');
    const qrCodeContainer = document.getElementById('qrcode-container');
    const joinCodeElement = document.getElementById('join-code'); // 用于显示 lobbyId
    const teamsListElement = document.getElementById('teams-list');
    const teamCountElement = document.getElementById('team-count');
    const startDrillBtn = document.getElementById('start-drill-btn');
    const statusMessageLobby = document.getElementById('status-message-lobby');
    const joinLinkDisplayInput = document.getElementById('join-link-display');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const copyFeedbackElement = document.getElementById('copy-feedback');


    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');
    let currentLobbyId = null; // 教师端持有的、由后端生成的唯一大厅ID
    let currentTeamsData = []; // 从服务器同步的队伍数据
    let studentJoinUrlForQRCode = ''; // 学生扫码用的URL，只含caseId

    if (!caseId) {
        if(caseTitleElement) caseTitleElement.textContent = '错误：案例ID未提供';
        if(statusMessageLobby) {
            statusMessageLobby.textContent = '无法加载大厅，URL中缺少案例ID。';
            statusMessageLobby.className = 'text-red-500 text-sm mt-2 text-center';
        }
        if(startDrillBtn) startDrillBtn.disabled = true;
        console.error("[LOBBY.JS] URL中缺少caseId参数。");
        return;
    }

    // 1. 连接 WebSocket
    const socket = io(window.location.protocol + '//' + window.location.hostname + ':7890', { // 确保后端地址和端口正确
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('[LOBBY.JS] 教师端成功连接到 WebSocket 服务器:', socket.id);
        if(statusMessageLobby) {
            statusMessageLobby.textContent = '已连接到服务器，正在创建推演大厅...';
            statusMessageLobby.className = 'text-blue-400 text-sm mt-2 text-center';
        }
        createLobbyAndSetup(); 
    });

    socket.on('connect_error', (error) => {
        console.error('[LOBBY.JS] 教师端 WebSocket 连接错误:', error);
        if(statusMessageLobby) {
            statusMessageLobby.textContent = '无法连接到实时服务器。请检查网络或确认服务器正在运行。';
            statusMessageLobby.className = 'text-red-500 text-sm mt-2 text-center';
        }
        if(startDrillBtn) startDrillBtn.disabled = true;
        if(qrCodeContainer) qrCodeContainer.innerHTML = '<p class="text-red-400 text-center">无法连接服务器</p>';
    });

    socket.on('teamsUpdated', (teams) => {
        console.log('[LOBBY.JS] 收到队伍更新:', teams);
        currentTeamsData = teams; 
        if(teamsListElement && teamCountElement) {
            teamsListElement.innerHTML = ''; 
            teamCountElement.textContent = teams.length;
            if (teams.length === 0) {
                teamsListElement.innerHTML = '<li class="text-gray-500 text-center py-4">暂无队伍加入，等待学生扫码...</li>';
                if(startDrillBtn) startDrillBtn.disabled = true;
            } else {
                teams.forEach(team => {
                    const li = document.createElement('li');
                    li.className = 'bg-gray-700 p-3 rounded-md shadow text-gray-200 animate-fade-in-down';
                    li.textContent = `${team.name} (成员: ${team.students && team.students.length > 0 ? team.students.join(', ') : '等待成员'})`;
                    teamsListElement.appendChild(li);
                });
                if(startDrillBtn) startDrillBtn.disabled = false;
            }
        }
    });
    
    socket.on('lobbyError', (data) => { 
        console.error('[LOBBY.JS] 大厅错误:', data.message);
        if(statusMessageLobby) {
            statusMessageLobby.textContent = `大厅错误: ${data.message}`;
            statusMessageLobby.className = 'text-red-500 text-sm mt-2 text-center';
        }
    });

    socket.on('drillHasStarted', (data) => {
        console.log('[LOBBY.JS] 服务器确认推演已开始:', data);
        // 此时教师端应该已经跳转，如果还在这个页面，可以给出提示
        if (statusMessageLobby) {
            statusMessageLobby.textContent = '推演已在另一窗口开始。';
            statusMessageLobby.className = 'text-green-500 text-sm mt-2 text-center';
        }
    });

    async function createLobbyAndSetup() {
        try {
            if(statusMessageLobby && !statusMessageLobby.textContent.includes('已连接')) {
                 if(statusMessageLobby) statusMessageLobby.textContent = '正在创建推演大厅...';
            }
            const response = await fetch('http://localhost:7890/api/lobbies/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseId })
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); } catch (e) { errorData = { message: response.statusText }; }
                throw new Error(`创建大厅失败: ${response.status} - ${errorData.message || '未知错误'}`);
            }
            const data = await response.json();
            
            currentLobbyId = data.lobbyId; // 后端生成的唯一大厅ID
            studentJoinUrlForQRCode = data.joinUrl; // 学生扫码的URL (只含caseId)
            const returnedCaseId = data.caseId;
            let returnedCaseTitle = data.caseTitle;

            if (!currentLobbyId || !studentJoinUrlForQRCode) {
                throw new Error('服务器返回数据不完整：缺少 lobbyId 或 joinUrl。');
            }
            if (returnedCaseId !== caseId) {
                 console.warn(`[LOBBY.JS] 服务器返回的caseId (${returnedCaseId}) 与请求的不符 (${caseId})`);
            }

            if (caseTitleElement) {
                caseTitleElement.textContent = returnedCaseTitle && returnedCaseTitle !== "案例加载中..." ? `案例: ${returnedCaseTitle}` : `案例加载中 (ID: ${caseId})...`;
                if (!returnedCaseTitle || returnedCaseTitle === "案例加载中...") {
                    fetch(`http://localhost:7890/api/cases/${caseId}`)
                        .then(res => res.json())
                        .then(caseData => {
                            if (caseData && caseData.title) {
                                caseTitleElement.textContent = `案例: ${caseData.title.replace(/\[cite: \d+\]/g, '').trim()}`;
                            } else {
                                caseTitleElement.textContent = `案例 (ID: ${caseId})`;
                            }
                        }).catch(err => console.error('[LOBBY.JS] 二次获取案例标题失败:', err));
                }
            }
            if (joinCodeElement) { // 显示 lobbyId 作为加入码
                joinCodeElement.textContent = currentLobbyId;
            }
            if (joinLinkDisplayInput) { // 显示学生加入链接
                joinLinkDisplayInput.value = studentJoinUrlForQRCode;
            }


            if (qrCodeContainer && typeof QRCode !== 'undefined') {
                qrCodeContainer.innerHTML = ''; 
                new QRCode(qrCodeContainer, {
                    text: studentJoinUrlForQRCode, // 使用只包含 caseId 的 URL 生成二维码
                    width: qrCodeContainer.offsetWidth > 150 ? qrCodeContainer.offsetWidth - 16 : 184, // 动态调整二维码大小
                    height: qrCodeContainer.offsetHeight > 150 ? qrCodeContainer.offsetHeight - 16 : 184,
                    colorDark: "#000000", // 二维码颜色改为黑色，背景是白色
                    colorLight: "#ffffff", 
                    correctLevel: QRCode.CorrectLevel.H
                });
                console.log('[LOBBY.JS] 二维码已生成，内容:', studentJoinUrlForQRCode);
                if(statusMessageLobby) {
                    statusMessageLobby.textContent = '大厅已创建，请学生扫描二维码或输入加入码加入。';
                    statusMessageLobby.className = 'text-green-400 text-sm mt-2 text-center';
                }
            } else {
                if (!qrCodeContainer) console.error('[LOBBY.JS] 错误：未找到二维码容器元素 (qrcode-container)。');
                if (typeof QRCode === 'undefined') {
                    console.error('[LOBBY.JS] 错误：QRCode 库未加载。请确保在 lobby.html 中已正确引入 qrcode.min.js。');
                    if(qrCodeContainer) qrCodeContainer.innerHTML = '<p class="text-red-500 text-center">QRCode库未加载</p>';
                }
                if(statusMessageLobby) {
                    statusMessageLobby.textContent = '二维码生成失败，请检查控制台。';
                    statusMessageLobby.className = 'text-red-500 text-sm mt-2 text-center';
                }
            }

            // 教师端使用 lobbyId 加入自己的 WebSocket 房间
            socket.emit('teacherJoinsLobby', currentLobbyId);

        } catch (error) {
            console.error('[LOBBY.JS] 初始化大厅失败:', error);
            if(caseTitleElement) caseTitleElement.textContent = '创建大厅失败';
            if(qrCodeContainer) qrCodeContainer.innerHTML = `<p class="text-red-400 text-center">无法生成二维码或加载大厅信息: ${error.message}</p>`;
            if(statusMessageLobby) {
                statusMessageLobby.textContent = `初始化大厅时发生错误: ${error.message}`;
                statusMessageLobby.className = 'text-red-500 text-sm mt-2 text-center';
            }
            if(startDrillBtn) startDrillBtn.disabled = true;
        }
    }
    
    if (startDrillBtn) {
        startDrillBtn.addEventListener('click', () => {
            if (currentTeamsData.length > 0 && currentLobbyId && caseId) {
                const drillTeams = currentTeamsData.map(team => ({
                    id: team.id, // 队伍ID应由服务器在学生加入时分配
                    name: team.name,
                    students: team.students || [],
                    score: team.score || 0,
                    answers: team.answers || {} 
                }));

                localStorage.setItem('drillTeams', JSON.stringify(drillTeams));
                localStorage.setItem('currentDrillCaseId', caseId); 
                localStorage.setItem('currentLobbyId', currentLobbyId); // 保存LobbyId
                
                localStorage.setItem('userRoleForDrill', 'teacher');
                
                console.log('[LOBBY.JS] 存储到localStorage的队伍数据:', JSON.parse(JSON.stringify(drillTeams)));
                console.log(`[LOBBY.JS] 准备跳转到 drill_main.html?caseId=${caseId}&lobbyId=${currentLobbyId}`);
                
                socket.emit('teacherStartsDrill', { lobbyId: currentLobbyId, caseId: caseId, teamsData: drillTeams });
                window.location.href = `drill_main.html?caseId=${caseId}&lobbyId=${currentLobbyId}`; // 跳转时带上lobbyId
            } else {
                let alertMsg = "无法开始推演：";
                if (currentTeamsData.length === 0) alertMsg += "至少需要一个队伍加入。 ";
                if (!currentLobbyId) alertMsg += "大厅ID无效或未成功创建。 ";
                if (!caseId) alertMsg += "案例ID无效。 ";
                alert(alertMsg);
                if(statusMessageLobby) {
                    statusMessageLobby.textContent = alertMsg;
                    statusMessageLobby.className = 'text-yellow-500 text-sm mt-2 text-center';
                }
            }
        });
    } else {
        console.error("[LOBBY.JS] 错误：未找到开始推演按钮元素 (start-drill-btn)");
    }

    if (copyLinkBtn && joinLinkDisplayInput) {
        copyLinkBtn.addEventListener('click', () => {
            joinLinkDisplayInput.select();
            joinLinkDisplayInput.setSelectionRange(0, 99999); // For mobile devices
            try {
                // 使用 Clipboard API (推荐，但需要HTTPS或localhost)
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(joinLinkDisplayInput.value)
                        .then(() => {
                            if(copyFeedbackElement) copyFeedbackElement.textContent = '链接已复制!';
                            setTimeout(() => { if(copyFeedbackElement) copyFeedbackElement.textContent = ''; }, 2000);
                        })
                        .catch(err => {
                            console.warn('[LOBBY.JS] 使用 Clipboard API 复制失败, 尝试 execCommand:', err);
                            fallbackCopyTextToClipboard(joinLinkDisplayInput.value);
                        });
                } else {
                    fallbackCopyTextToClipboard(joinLinkDisplayInput.value);
                }
            } catch (err) {
                console.error('[LOBBY.JS] 复制链接失败:', err);
                if(copyFeedbackElement) {
                     copyFeedbackElement.textContent = '复制失败!';
                     copyFeedbackElement.className = 'text-red-400 text-sm mt-1 h-4';
                }
                setTimeout(() => { if(copyFeedbackElement) {copyFeedbackElement.textContent = ''; copyFeedbackElement.className = 'text-green-400 text-sm mt-1 h-4';} }, 2000);
            }
        });
    }

    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // 避免在屏幕上闪烁
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            const msg = successful ? '链接已复制!' : '复制失败!';
            if(copyFeedbackElement) copyFeedbackElement.textContent = msg;
        } catch (err) {
            console.error('[LOBBY.JS] Fallback复制失败:', err);
            if(copyFeedbackElement) copyFeedbackElement.textContent = '复制失败!';
        }
        document.body.removeChild(textArea);
        setTimeout(() => { if(copyFeedbackElement) copyFeedbackElement.textContent = ''; }, 2000);
    }

});
