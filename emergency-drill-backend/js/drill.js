// 文件路径: js/drill.js

document.addEventListener('DOMContentLoaded', async function () {
    // HTML 元素获取
    const stagePanels = [
        document.getElementById('stage-1'),
        document.getElementById('stage-2'),
        document.getElementById('stage-3'),
        document.getElementById('stage-4'),
    ];
    const headerStageTitleElement = document.getElementById('stage-title'); 
    const headerCaseTitleElement = document.getElementById('header-case-title'); 
    
    const nextStageBtn = document.getElementById('next-stage-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const timerElement = document.getElementById('stage-timer');
    const leaderboardElement = document.getElementById('leaderboard');
    const forceEndBtn = document.getElementById('force-end-btn');
    
    let currentStageIndex = 0; 
    let currentCaseData = null;  
    let timerInterval;
    let isPaused = false;
    let socket = null; // Socket.IO 实例
    
    const teams = [ /* ... 模拟排行榜数据 ... */ ];

    // --- 1. 从URL获取caseId并加载案例数据 ---
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');

    if (caseId) {
        try {
            const response = await fetch(`http://localhost:7890/api/cases/${caseId}`);
            if (!response.ok) {
                let errorMsg = `获取案例数据失败，状态: ${response.status}`;
                try { const errData = await response.json(); errorMsg = errData.message || errorMsg; } catch (e) { /* 忽略 */ }
                throw new Error(errorMsg);
            }
            currentCaseData = await response.json();
            console.log('成功获取案例数据:', currentCaseData);
            if (forceEndBtn) forceEndBtn.href = `results.html?caseId=${caseId}`;
            
            initializeDrillUI(currentCaseData);
            initializeWebSocket(); // 初始化 WebSocket 连接

        } catch (error) {
            console.error('加载案例数据时出错:', error);
            if (headerStageTitleElement) headerStageTitleElement.textContent = '案例加载失败';
            if (headerCaseTitleElement) headerCaseTitleElement.textContent = error.message;
            if (nextStageBtn) nextStageBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = true;
            return; 
        }
    } else {
        console.error('URL中未找到 caseId');
        if (headerStageTitleElement) headerStageTitleElement.textContent = '未指定案例';
        if (headerCaseTitleElement) headerCaseTitleElement.textContent = '请通过案例列表进入';
        if (nextStageBtn) nextStageBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = true;
        return;
    }

    // --- 新增：初始化 WebSocket ---
    function initializeWebSocket() {
        socket = io('http://localhost:7890'); // 请确保端口正确

        socket.on('connect', () => {
            console.log('Drill Page: 成功连接到 WebSocket 服务器，ID:', socket.id);
            // 客户端（教师或学生）加入指定案例的房间
            // 注意：这里也需要区分是教师还是学生，以便服务器做不同处理或统计
            // 简单起见，我们先都加入，后端可以用socket.id区分，或前端传递角色
            socket.emit('joinLobby', { caseId: caseId, studentName: `演练者-${socket.id.substring(0,5)}` }); 
            console.log(`演练页面已加入案例 ${caseId} 的大厅`);
        });

        // 监听服务器广播的“进入新阶段”事件
        socket.on('advanceToStage', (data) => {
            if (data.caseId === caseId && typeof data.nextStageIndex === 'number') {
                console.log(`接收到服务器指令：进入阶段 ${data.nextStageIndex}`);
                setActiveStage(data.nextStageIndex);
            }
        });

        socket.on('drillEnded', (data) => {
            if (data.caseId === caseId) {
                alert('演练已由教师结束或已到达最后阶段！即将跳转到复盘页面。');
                window.location.href = `results.html?caseId=${caseId}`;
            }
        });
        
        socket.on('disconnect', () => {
            console.log('Drill Page: 与 WebSocket 服务器的连接已断开');
        });

        socket.on('connect_error', (error) => {
            console.error('Drill Page: WebSocket 连接错误:', error);
        });
    }


    // --- 2. 初始化演练界面 ---
    function initializeDrillUI(caseData) {
        // ... (与上一版本相同) ...
        if (!caseData || !caseData.title) {
            console.error('无效的案例数据传入 initializeDrillUI');
            if (headerStageTitleElement) headerStageTitleElement.textContent = '案例数据错误';
            return;
        }
        if (headerCaseTitleElement) {
            headerCaseTitleElement.textContent = `案例: ${caseData.title}`;
        }
        updateLeaderboard(); 
        startTimer(caseData.estimatedTime ? caseData.estimatedTime * 60 : 10 * 60);

        if (caseData.stages && caseData.stages.length > 0) {
            setActiveStage(0); 
        } else {
            console.error('案例数据中没有有效的阶段信息');
            if (headerStageTitleElement) headerStageTitleElement.textContent = '案例阶段数据错误';
        }
    }

    // --- 3. 设置并激活指定阶段 ---
    function setActiveStage(stageIndex) {
        // ... (与上一版本相同，确保 currentStageIndex 被更新) ...
        if (!currentCaseData || !currentCaseData.stages || !currentCaseData.stages[stageIndex]) {
            console.error(`无法设置阶段 ${stageIndex}: 案例数据不完整或阶段不存在`);
            if (headerStageTitleElement) headerStageTitleElement.textContent = '阶段加载错误';
            return;
        }
        currentStageIndex = stageIndex; // <--- 确保这里更新了全局的 currentStageIndex
        const stageData = currentCaseData.stages[stageIndex];
        if (headerStageTitleElement) {
            headerStageTitleElement.textContent = stageData.title || `阶段 ${stageData.stageNumber}`;
        }
        stagePanels.forEach((panel, index) => {
            if (index === stageIndex) {
                panel.classList.add('stage-active');
                renderStageContent(panel, stageData); 
            } else {
                panel.classList.remove('stage-active');
            }
        });
        if (nextStageBtn) {
            if (currentStageIndex === currentCaseData.stages.length - 1) {
                nextStageBtn.innerHTML = '<i class="fas fa-flag-checkered mr-2"></i>完成推演，查看复盘';
            } else {
                nextStageBtn.textContent = '提交本阶段决策';
            }
        }
    }

    // --- 4. 渲染指定阶段的内容到对应的HTML面板 ---
    function renderStageContent(panelElement, stageData) {
        // ... (与上一版本相同，包含渲染各个阶段的逻辑) ...
        // 请确保您已根据需要完善了所有阶段的渲染逻辑
        if (!panelElement || !stageData || !stageData.questions) {
            console.warn('渲染阶段内容失败：缺少面板元素、阶段数据或问题数据', panelElement, stageData);
            return;
        }
        const dynamicContentArea = panelElement.querySelector('.dynamic-content-area');
        if (dynamicContentArea) {
            dynamicContentArea.innerHTML = ''; 
        }
        if (panelElement.id === `stage-${stageData.stageNumber}`) {
            const stageInternalTitle = panelElement.querySelector('h2.text-2xl.font-bold.mb-4.text-yellow-400, h2.text-4xl.font-extrabold.mb-4');
            if (stageInternalTitle && stageData.description) { 
                stageInternalTitle.textContent = stageData.description;
            } else if (stageInternalTitle && stageData.title) { 
                 stageInternalTitle.textContent = stageData.title;
            }
            if (stageData.stageNumber === 1) { /* ... stage 1 render logic ... */ }
            else if (stageData.stageNumber === 2) { /* ... stage 2 render logic ... */ }
            else if (stageData.stageNumber === 3) { /* ... stage 3 render logic ... */ }
            else if (stageData.stageNumber === 4) { /* ... stage 4 render logic ... */ }
        }
    }

    // --- 辅助函数 (排行榜和计时器) ---
    function updateLeaderboard() { /* ... 与之前相同 ... */ }
    function startTimer(duration) { /* ... 与之前相同 ... */ }
    
    // --- 事件监听器 ---
    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            if (!socket || !currentCaseData) return; // 确保 socket 和案例数据已加载

            // TODO: 收集当前阶段答案并发送到后端 (如果需要教师也提交决策)

            if (currentStageIndex < currentCaseData.stages.length - 1) {
                // 教师点击下一阶段，通过 WebSocket 通知服务器
                console.log(`教师请求进入下一阶段，当前阶段: ${currentStageIndex}, 案例ID: ${caseId}`);
                socket.emit('requestNextStage', {
                    caseId: caseId,
                    currentStageIndex: currentStageIndex,
                    teacherId: 'current_teacher_id_placeholder' // 后续应替换为真实教师ID
                });
            } else {
                // 所有阶段完成，跳转到复盘页面
                console.log("所有阶段已完成，准备跳转到复盘页面。");
                alert("演练已完成！即将跳转到复盘中心。");
                if (caseId) window.location.href = `results.html?caseId=${caseId}`;
                else window.location.href = 'results.html';
            }
        });
    }
    if (pauseBtn) { /* ... 与之前相同 ... */ }
});
