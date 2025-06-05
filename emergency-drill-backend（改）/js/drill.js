// 文件路径: js/drill.js

document.addEventListener('DOMContentLoaded', async function () {
    // --- 1. DOM元素获取 ---
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
    
    // --- 2. 状态变量初始化 ---
    let currentStageIndex = 0; 
    let currentCaseData = null;  
    let timerInterval;
    let isPaused = false;
    let socket = null; // WebSocket 实例
    window.drillMap = null; // 高德地图实例 (如果案例需要)

    let teamsData = []; // 存储队伍信息，将从localStorage加载，但最终以服务器同步为准
    let currentLobbyId = null; // 从URL获取的Lobby ID
    let myTeamId = null; // 当前客户端所属的队伍ID (主要用于学生端或教师端演示队伍)

    let isTeamsDataSynced = false; // 标记WebSocket是否已接收到首次teamsUpdated

    // --- 3. 页面启动逻辑 ---
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');
    currentLobbyId = urlParams.get('lobbyId'); // 获取 Lobby ID

    if (!caseId) {
        handleFatalError("错误：URL中未找到caseId，请从案例库进入。");
        return;
    }
    if (!currentLobbyId) {
        handleFatalError("错误：URL中未找到lobbyId，请通过正确流程加入。");
        return;
    }

    try {
        // 从localStorage加载teamsData作为初始值，但最终会由服务器同步覆盖
        const storedTeams = localStorage.getItem('drillTeams');
        if (storedTeams) {
            teamsData = JSON.parse(storedTeams);
            teamsData.forEach(team => { 
                if (team.score === undefined) team.score = 0;
                if (team.answers === undefined) team.answers = {};
            });
        } else {
            console.warn("[DRILL] 未能从localStorage加载队伍信息。");
        }
        
        // 【关键修改】: 确定 myTeamId 并确保其在 teamsData 中
        setupMyTeamIdForClient();

        const response = await fetch(`http://localhost:7890/api/cases/${caseId}`);
        if (!response.ok) throw new Error(`获取案例数据失败，状态: ${response.status}`);
        currentCaseData = await response.json();
        console.log('成功获取案例数据:', JSON.parse(JSON.stringify(currentCaseData)));
        
        initializeDrillUI(currentCaseData);
        initializeWebSocket(); // 初始化 WebSocket
        
    } catch (error) {
        handleFatalError(error.message);
    }

    function handleFatalError(message) {
        console.error("发生致命错误:", message);
        if (headerStageTitleElement) headerStageTitleElement.textContent = '加载失败';
        if (headerCaseTitleElement) headerCaseTitleElement.textContent = message;
        if (nextStageBtn) nextStageBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = true;
    }

    // 【关键修改】: 辅助函数：设置当前客户端的队伍ID
    function setupMyTeamIdForClient() {
        const storedMyTeamId = localStorage.getItem('myTeamId');
        const studentNameFromUrl = urlParams.get('studentName');
        const teamNameFromUrl = urlParams.get('teamName');

        let isTeacherClient = false;
        // 尝试通过URL参数判断是否为学生端，否则默认为教师端
        if (!studentNameFromUrl || !teamNameFromUrl) {
            isTeacherClient = true;
        }

        // 优先级1: 如果 myTeamId 已经设置且在当前 teamsData 中找到
        if (storedMyTeamId) {
            const foundTeam = teamsData.find(t => t.id === storedMyTeamId);
            if (foundTeam) {
                myTeamId = storedMyTeamId;
                console.log(`[DRILL] 从localStorage识别队伍ID: ${myTeamId}`);
                return; // 找到并验证成功，直接返回
            } else {
                console.warn(`[DRILL] localStorage中的myTeamId (${storedMyTeamId}) 未在当前teamsData中找到，可能数据已过期或队伍已解散。`);
            }
        }

        // 优先级2: 如果是学生端（通过URL参数判断），尝试在 teamsData 中查找
        if (!isTeacherClient) {
            const studentTeam = teamsData.find(t => t.name === teamNameFromUrl && t.students.includes(studentNameFromUrl));
            if (studentTeam) {
                myTeamId = studentTeam.id;
                localStorage.setItem('myTeamId', myTeamId);
                console.log(`[DRILL] 从URL参数识别为学生端，队伍ID: ${myTeamId}`);
                return;
            } else {
                console.warn("[DRILL] 无法通过URL参数找到匹配的队伍，这可能是由于teamsData尚未完全同步，或者URL参数不匹配。");
            }
        }

        // 优先级3: 默认处理为教师端（使用教师演示队伍ID）
        myTeamId = 'teacher_ops_team'; 
        localStorage.setItem('myTeamId', myTeamId); 
        console.log("[DRILL] 未识别到特定队伍，默认为教师端或新会话，使用教师演示队伍ID:", myTeamId);

        // 【新增逻辑】：确保无论 myTeamId 是什么，它对应的队伍对象在本地 `teamsData` 中存在
        // 这对于 `teacher_ops_team` 尤其重要，因为它可能在 `drillTeams` 第一次加载时不存在
        let currentMyTeamObject = teamsData.find(t => t.id === myTeamId);
        if (!currentMyTeamObject) {
            // 如果 myTeamId 是 'teacher_ops_team' 且它不在当前 teamsData 中，则添加
            if (myTeamId === 'teacher_ops_team') {
                const newTeacherTeam = {id: 'teacher_ops_team', name: "教师演示", students: [], score: 0, answers: {}};
                teamsData.push(newTeacherTeam); // 将新创建的教师演示队伍添加到本地的 teamsData 数组中
                console.log("[DRILL] 教师演示队伍未在本地teamsData中找到，已添加。");
            } else {
                // 如果 myTeamId 是一个学生队伍ID但找不到对象，这表示严重不一致
                console.error(`[DRILL] 严重错误：myTeamId (${myTeamId}) 无法在本地teamsData中找到对应队伍。可能需要重新加载。`);
                if (nextStageBtn) {
                    nextStageBtn.disabled = true;
                    nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                    nextStageBtn.classList.add('bg-red-500', 'cursor-not-allowed');
                    nextStageBtn.textContent = '队伍数据错误';
                }
            }
        }
    }


    // 【新增函数：初始化 WebSocket 连接和监听事件】
    function initializeWebSocket() {
        socket = io('http://localhost:7890', {
            transports: ['websocket']
        });

        socket.on('connect', () => {
            console.log('[DRILL.JS] 连接到 WebSocket 服务器:', socket.id);
            socket.emit('joinDrillRoom', currentLobbyId); 
        });

        socket.on('disconnect', (reason) => {
            console.warn('[DRILL.JS] WebSocket 连接断开:', reason);
        });

        socket.on('connect_error', (error) => {
            console.error('[DRILL.JS] WebSocket 连接错误:', error);
        });

        // 【关键修改】: 接收队伍数据更新
        socket.on('teamsUpdated', (updatedTeams) => {
            console.log('[DRILL.JS] 收到队伍数据更新:', updatedTeams);
            teamsData = updatedTeams; 
            updateLeaderboard();

            // 【重要】：在收到teamsUpdated后，检查myTeamId对应的队伍是否在更新后的teamsData中
            const myCurrentTeamInUpdatedData = teamsData.find(t => t.id === myTeamId);
            if (!myCurrentTeamInUpdatedData) {
                console.warn(`[DRILL.JS] 收到更新后，myTeamId (${myTeamId}) 对应的队伍在teamsData中仍未找到。尝试重新设置 myTeamId。`);
                // 再次调用 setupMyTeamIdForClient 来尝试修复 myTeamId
                setupMyTeamIdForClient(); 
            }

            // 首次同步后，启用提交按钮
            if (!isTeamsDataSynced) {
                isTeamsDataSynced = true;
                // 再次检查 myTeamId 对应的队伍是否在同步数据中存在
                const finalMyTeamCheck = teamsData.find(t => t.id === myTeamId);
                if (finalMyTeamCheck) {
                    if (nextStageBtn) {
                        nextStageBtn.disabled = false;
                        nextStageBtn.classList.remove('bg-gray-500', 'cursor-not-allowed');
                        nextStageBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
                        console.log("[DRILL.JS] 队伍数据已同步，提交按钮已启用。");
                    }
                } else {
                    console.error(`[DRILL.JS] 最终检查：myTeamId (${myTeamId}) 对应的队伍在teamsData中仍然不存在。提交按钮保持禁用。`);
                    if (nextStageBtn) {
                        nextStageBtn.disabled = true;
                        nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                        nextStageBtn.classList.add('bg-red-500', 'cursor-not-allowed');
                        nextStageBtn.textContent = '队伍加载失败';
                    }
                }
            }
        });

        // 【关键修改】: 接收下一阶段指令
        socket.on('advanceToStage', (data) => {
            const { nextStageIndex } = data;
            console.log(`[DRILL.JS] 收到进入下一阶段指令: ${nextStageIndex}`);
            if (currentStageIndex < currentCaseData.stages.length - 1) {
                setActiveStage(nextStageIndex);
                // 阶段推进后，重新启用提交按钮（对于学生端和教师端）
                if (nextStageBtn) { // 无论是教师端还是学生端，收到推进指令后都应启用按钮
                    nextStageBtn.disabled = false;
                    if (myTeamId === 'teacher_ops_team') {
                        nextStageBtn.textContent = (currentStageIndex >= currentCaseData.stages.length - 1) ? "完成推演" : "提交并进入下一阶段";
                    } else {
                        nextStageBtn.textContent = '提交本阶段决策';
                    }
                    nextStageBtn.classList.remove('bg-gray-500', 'cursor-not-allowed');
                    nextStageBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
                }
            } else {
                proceedToNextStageOrEnd();
            }
        });

        socket.on('answerSubmissionSuccess', (data) => {
            console.log('[DRILL.JS] 答案提交成功:', data.message);
            if (myTeamId !== 'teacher_ops_team' && nextStageBtn) { // 仅学生端显示此状态
                 nextStageBtn.textContent = '答案已提交，等待教师操作...';
                 nextStageBtn.disabled = true;
                 nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                 nextStageBtn.classList.add('bg-gray-500', 'cursor-not-allowed');
            }
        });

        socket.on('answerSubmissionFailed', (data) => {
            console.error('[DRILL.JS] 答案提交失败:', data.message);
            alert(`答案提交失败: ${data.message}`);
            if (myTeamId !== 'teacher_ops_team' && nextStageBtn) {
                nextStageBtn.disabled = false;
                nextStageBtn.textContent = '提交本阶段决策';
                nextStageBtn.classList.remove('bg-gray-500', 'cursor-not-allowed');
                nextStageBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
            }
        });
    }

    // --- 4. UI和计时器初始化 ---
    function initializeDrillUI(caseData) {
        if (!caseData || !caseData.title) {
            handleFatalError("错误：传入的案例数据无效。");
            return;
        }
        if (headerCaseTitleElement) headerCaseTitleElement.textContent = `案例: ${caseData.title.replace(/\[cite: \d+\]/g, '').trim()}`;
        if (forceEndBtn) forceEndBtn.href = `results.html?caseId=${caseId}`;
        
        startTimer(caseData.estimatedTime ? caseData.estimatedTime * 60 : 180 * 60); 
        updateLeaderboard(); 
        
        if (caseData.stages && caseData.stages.length > 0) {
            setActiveStage(0);
        } else {
            handleFatalError("案例数据不完整，缺少阶段信息。");
        }
    }

    function startTimer(durationInSeconds) {
        clearInterval(timerInterval);
        let timer = durationInSeconds;
        timerInterval = setInterval(() => {
            if (!isPaused) {
                if (timer < 0) {
                    clearInterval(timerInterval);
                    if (timerElement) timerElement.textContent = "时间到";
                } else {
                    const minutes = Math.floor(timer / 60);
                    const seconds = timer % 60;
                    if (timerElement) timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                    timer--;
                }
            }
        }, 1000);
    }

    // --- 5. 核心：设置和渲染指定阶段 ---
    function setActiveStage(stageIndex) {
        if (!currentCaseData || !currentCaseData.stages || !currentCaseData.stages[stageIndex]) {
            console.error(`无法设置阶段 ${stageIndex}：案例数据不完整或阶段索引无效。`);
            if (headerStageTitleElement) headerStageTitleElement.textContent = '阶段加载错误';
            return;
        }
        
        currentStageIndex = stageIndex;
        const stageData = currentCaseData.stages[stageIndex];

        if (headerStageTitleElement) {
            headerStageTitleElement.textContent = (stageData.title || `阶段 ${stageData.stageNumber}`).replace(/\[cite: \d+\]/g, '').trim();
        }

        stagePanels.forEach((panel, index) => {
            if (panel) {
                panel.classList.toggle('stage-active', index === stageIndex);
            }
        });

        if (stagePanels[stageIndex]) {
            renderStageContent(stagePanels[stageIndex], stageData);
        } else {
            console.error(`错误：找不到阶段 ${stageIndex} 的面板元素 (stagePanels[${stageIndex}])`);
        }

        if (nextStageBtn) {
            // 每次进入新阶段时，根据 isTeamsDataSynced 状态和客户端类型来设置按钮状态
            if (!isTeamsDataSynced) { // 如果队伍数据尚未同步，按钮保持禁用
                nextStageBtn.disabled = true; 
                nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                nextStageBtn.classList.add('bg-gray-500', 'cursor-not-allowed');
            } else { // 队伍数据已同步，根据客户端类型设置按钮文本和启用状态
                nextStageBtn.disabled = false;
                nextStageBtn.classList.remove('bg-gray-500', 'cursor-not-allowed');
                nextStageBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
            }
            
            if (myTeamId === 'teacher_ops_team') { 
                 nextStageBtn.style.display = 'block'; 
                 nextStageBtn.innerHTML = (stageIndex >= currentCaseData.stages.length - 1) ? "完成推演" : "提交并进入下一阶段";
            } else {
                 nextStageBtn.style.display = 'block'; 
                 nextStageBtn.innerHTML = '提交本阶段决策';
            }
        }
    }

    // --- 6. 核心：渲染每个阶段的动态内容 ---
    function renderStageContent(panelElement, stageData) {
        if (!panelElement || !stageData) {
            console.warn(`[渲染错误] 阶段 ${stageData ? stageData.stageNumber : '未知'}：缺少面板元素或阶段数据`);
            return;
        }
        console.log(`[渲染开始] 阶段 ${stageData.stageNumber}`, JSON.parse(JSON.stringify(stageData)));

        const taskTitleElement = panelElement.querySelector('.stage-task-title');
        if (taskTitleElement) {
            taskTitleElement.textContent = (stageData.description || stageData.title || `阶段 ${stageData.stageNumber} 任务`).replace(/\[cite: \d+\]/g, '').trim();
        } else {
            if (stageData.stageNumber !== 1) { 
                console.warn(`[阶段${stageData.stageNumber}] 未找到 .stage-task-title 元素用于显示阶段描述。`);
            }
        }

        const questionsContainer = panelElement.querySelector('.stage-questions-container');
        if (questionsContainer) {
            questionsContainer.innerHTML = '';
        } else {
            if (stageData.stageNumber !== 2) { 
                console.warn(`[阶段${stageData.stageNumber}] 未找到 .stage-questions-container 元素。`);
            }
        }
        
        const imageUrl = stageData.stageBackgroundImageUrl || stageData.overlayImageUrl; 

        // 图片渲染逻辑 (保持不变)
        if (stageData.stageNumber === 1) {
            const eventTitle = panelElement.querySelector('.stage-event-title');
            if (eventTitle && currentCaseData) eventTitle.textContent = `事件：${currentCaseData.title.replace(/\[cite: \d+\]/g, '').trim()}`;
            const eventDesc = panelElement.querySelector('.stage-event-description');
            if (eventDesc && currentCaseData) eventDesc.textContent = currentCaseData.description.replace(/\[cite: \d+\]/g, '').trim();

            const backgroundHostStage1 = panelElement.querySelector('.stage-background-host');
            if (backgroundHostStage1) {
                backgroundHostStage1.style.backgroundImage = imageUrl ? `url('${imageUrl}')` : 'none';
            }
        }
        else if (stageData.stageNumber === 2) {
            const imageElementStage2 = panelElement.querySelector('#stage2-image-display');
            if (imageElementStage2) {
                imageElementStage2.src = imageUrl || '';
                imageElementStage2.alt = imageUrl ? (stageData.description || stageData.title || "阶段示意图").replace(/\[cite: \d+\]/g, '').trim() : '（此阶段无指定图片）';
            }
        }
        else if (stageData.stageNumber === 3 || stageData.stageNumber === 4) {
            const backgroundHost = panelElement.querySelector('.stage-background-host');
            if (backgroundHost) {
                if (imageUrl) {
                    backgroundHost.style.backgroundImage = `url('${imageUrl}')`;
                } else if (stageData.questions && stageData.questions[0] && stageData.questions[0].assetUrl && stageData.questions[0].assetUrl.includes('chart.png')) { // Check for chart.png specifically
                    backgroundHost.style.backgroundImage = `url('${stageData.questions[0].assetUrl}')`;
                } else {
                    backgroundHost.style.backgroundImage = 'none';
                }
            }
            if (stageData.stageNumber === 4) {
                const stage4ImageContainer = panelElement.querySelector('#stage4-image-container');
                if (stage4ImageContainer && imageUrl) {
                    stage4ImageContainer.style.backgroundImage = `url('${imageUrl}')`;
                    if (backgroundHost) backgroundHost.style.backgroundImage = 'none';
                }
                const overlayText = panelElement.querySelector('.stage-overlay-text');
                if (overlayText) {
                    overlayText.textContent = (stageData.questions && stageData.questions[0] && stageData.questions[0].hint) ? 
                                              stageData.questions[0].hint.replace(/\[cite: \d+\]/g, '').trim() :
                                              (stageData.description ? stageData.description.replace(/\[cite: \d+\]/g, '').trim() : '');
                }
            }
        }
        
        // --- 问题渲染逻辑 ---
        if (stageData.questions && Array.isArray(stageData.questions)) {
            const targetQuestionContainer = (stageData.stageNumber === 2) ? panelElement.querySelector('.stage-questions-container') : questionsContainer;
            
            if (targetQuestionContainer) {
                 if (stageData.stageNumber !== 2) targetQuestionContainer.innerHTML = '';

                stageData.questions.forEach((question, qIndex) => {
                    const questionId = `s${stageData.stageNumber}-q${qIndex}`;
                    const questionWrapper = document.createElement('div');
                    questionWrapper.className = 'question-item mb-6 p-3 bg-gray-800/50 rounded-lg';
                    questionWrapper.innerHTML = `<p class="font-semibold text-gray-200 mb-2">${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}</p>`;
                    
                    const optionsDiv = document.createElement('div');
                    optionsDiv.className = 'space-y-2 question-options';

                    if (question.answerOptions) {
                        question.answerOptions.forEach((opt, optIndex) => {
                            const optionFullId = `opt-${questionId}-${optIndex}`;
                            
                            if (question.questionType === 'Binary-Decision' && stageData.stageNumber === 4) {
                                const button = document.createElement('button');
                                button.className = `px-8 md:px-12 py-3 md:py-4 text-md md:text-lg font-bold text-white rounded-lg shadow-lg transform hover:scale-105 transition-all ${optIndex === 0 ? 'bg-green-600 hover:bg-green-700' : 'ml-4 bg-red-600 hover:bg-red-700'}`;
                                button.innerHTML = `<i class="fas ${optIndex === 0 ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>${opt.text.replace(/"/g, '&quot;').trim()}`; // Trim here too
                                button.dataset.value = opt.text.replace(/"/g, '&quot;').trim(); // Trim here too
                                button.addEventListener('click', (event) => {
                                    const buttonsInQuestion = event.target.closest('.question-item').querySelectorAll('button');
                                    buttonsInQuestion.forEach(btn => btn.classList.remove('ring-2', 'ring-offset-2', 'ring-cyan-500'));
                                    event.target.classList.add('ring-2', 'ring-offset-2', 'ring-cyan-500');
                                    // 传递 myTeamId 
                                    handleAnswerSelection(myTeamId, stageData.stageNumber, qIndex, question.questionType, event.target);
                                });
                                optionsDiv.appendChild(button);
                            } else {
                                const inputType = question.questionType === 'MultipleChoice-Multi' ? 'checkbox' : 'radio';
                                const label = document.createElement('label');
                                label.className = 'block w-full text-left p-3 bg-gray-700 rounded-lg hover:bg-cyan-800 cursor-pointer transition-all';
                                label.setAttribute('for', optionFullId);

                                const inputElement = document.createElement('input');
                                inputElement.type = inputType;
                                inputElement.name = questionId; 
                                inputElement.id = optionFullId;
                                inputElement.value = opt.text.replace(/"/g, '&quot;').trim(); // Trim here too
                                inputElement.className = 'mr-3 accent-cyan-500 align-middle';
                                inputElement.addEventListener('change', (event) => {
                                    // 传递 myTeamId
                                    handleAnswerSelection(myTeamId, stageData.stageNumber, qIndex, question.questionType, event.target);
                                });

                                label.appendChild(inputElement);
                                label.appendChild(document.createTextNode(` ${opt.text.replace(/\[cite: \d+\]/g, '').trim()}`));
                                optionsDiv.appendChild(label);
                            }
                        });
                    }
                    questionWrapper.appendChild(optionsDiv);
                    if (question.hint) { 
                        const hintP = document.createElement('p');
                        hintP.className = 'text-xs text-gray-500 mt-2';
                        hintP.textContent = `提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}`;
                        questionWrapper.appendChild(hintP);
                    }
                    
                    if (stageData.stageNumber === 2) {
                        let specificContainerFound = false;
                        if (qIndex === 0 && panelElement.querySelector('#s2-q1-title')) {
                            panelElement.querySelector('#s2-q1-title').textContent = `${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}`;
                            const s2q1Opt = panelElement.querySelector('#s2-q1-options');
                            if(s2q1Opt) { s2q1Opt.innerHTML = ''; s2q1Opt.appendChild(optionsDiv); }
                             if(question.hint && s2q1Opt && s2q1Opt.parentElement) { 
                                let hintElement = s2q1Opt.parentElement.querySelector('.question-hint-s2-1');
                                if(!hintElement) {
                                   hintElement = document.createElement('p');
                                   hintElement.className = `text-sm text-gray-500 mt-1 question-hint-s2-1`;
                                   s2q1Opt.insertAdjacentElement('afterend', hintElement);
                                }
                                hintElement.textContent = `提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}`;
                            }
                            specificContainerFound = true;
                        } else if (qIndex === 1 && panelElement.querySelector('#s2-q2-title')) {
                             panelElement.querySelector('#s2-q2-title').textContent = `${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}`;
                            const s2q2Opt = panelElement.querySelector('#s2-q2-options');
                            if(s2q2Opt) { s2q2Opt.innerHTML = ''; s2q2Opt.appendChild(optionsDiv); }
                            if(question.hint && s2q2Opt && s2q2Opt.parentElement) { 
                                let hintElement = s2q2Opt.parentElement.querySelector('.question-hint-s2-2');
                                if(!hintElement) {
                                   hintElement = document.createElement('p');
                                   hintElement.className = `text-sm text-gray-500 mt-1 question-hint-s2-2`;
                                   s2q2Opt.insertAdjacentElement('afterend', hintElement);
                                }
                                hintElement.textContent = `提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}`;
                            }
                            specificContainerFound = true;
                        }
                        
                        if (!specificContainerFound && targetQuestionContainer) { 
                             // For 3rd question onwards in stage 2, append to the main question container for stage 2
                             questionWrapper.className = 'mt-6 dynamic-question-block p-3 bg-gray-800/50 rounded-lg'; // Add some top margin
                             targetQuestionContainer.appendChild(questionWrapper);
                        }
                    } else { 
                         if(targetQuestionContainer) targetQuestionContainer.appendChild(questionWrapper);
                    }
                });
            }
        } else { 
            console.log(`[阶段${stageData.stageNumber}] 无问题数据 (questions 数组不存在或为空)。`);
        }
    }
    
    function handleAnswerSelection(teamId, stageNum, questionIndex, questionType, targetElement) {
        if (!teamId) {
            console.warn("无法记录答案：当前操作的队伍ID未设定。");
            return;
        }
        // 直接在 teamsData 中找到对应的 team 对象
        const team = teamsData.find(t => t.id === teamId);
        if (!team) {
            console.warn(`未找到团队ID: ${teamId}，无法记录答案。`);
            return;
        }

        const questionKey = `s${stageNum}-q${questionIndex}`;
        let selectedValue = targetElement.value;
        // 确保值是字符串，并且去除首尾空格
        if (typeof selectedValue === 'string') {
            selectedValue = selectedValue.trim();
        }

        if (questionType === 'MultipleChoice-Multi') {
            if (!team.answers[questionKey] || !Array.isArray(team.answers[questionKey])) {
                team.answers[questionKey] = [];
            }
            const currentValueIndex = team.answers[questionKey].indexOf(selectedValue);
            if (targetElement.checked) { 
                if (currentValueIndex === -1) { 
                    team.answers[questionKey].push(selectedValue);
                }
            } else { 
                if (currentValueIndex > -1) {
                    team.answers[questionKey].splice(currentValueIndex, 1);
                }
            }
        } else { 
            team.answers[questionKey] = [selectedValue]; 
        }
        console.log(`团队 ${team.name} (${team.id}) 在 ${questionKey} 的答案更新为:`, team.answers[questionKey]);
    }

    // 【关键修改点：calculateScoresAndProceed 函数现在负责发送答案到服务器】
    function calculateScoresAndProceed() {
        const stageData = currentCaseData.stages[currentStageIndex];
        if (!stageData || !stageData.questions) {
            console.warn("无法计分：当前阶段数据或问题数据缺失。");
            return;
        }

        const myCurrentTeam = teamsData.find(t => t.id === myTeamId);
        if (!myCurrentTeam) {
            console.error("当前客户端所属队伍未找到！无法提交答案或计算分数。请刷新页面或重新加入大厅。");
            alert("错误：您的队伍信息丢失，请重新加入！"); // 使用 alert 进行提示
            if (nextStageBtn) { // 禁用按钮防止重复点击
                nextStageBtn.disabled = true;
                nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                nextStageBtn.classList.add('bg-red-500', 'cursor-not-allowed');
            }
            return;
        }

        // 收集当前阶段的所有答案
        const currentStageAnswers = {}; 
        stageData.questions.forEach((question, qIndex) => {
            const questionKey = `s${stageData.stageNumber}-q${qIndex}`;
            const teamAnswersForQuestion = myCurrentTeam.answers && myCurrentTeam.answers[questionKey] ? myCurrentTeam.answers[questionKey] : [];
            currentStageAnswers[questionKey] = teamAnswersForQuestion; // 记录到要发送的答案中
        });

        // 清除当前阶段的本地答案，因为答案已经收集并即将发送到服务器
        if (myCurrentTeam.answers) { 
            stageData.questions.forEach((_, qIndex) => {
                const questionKeyToClear = `s${stageData.stageNumber}-q${qIndex}`;
                delete myCurrentTeam.answers[questionKeyToClear];
            });
        }
        
        // 【将答案发送给服务器】
        console.log(`[DRILL.JS] 正在向服务器提交团队 ${myTeamId} 阶段 ${stageData.stageNumber} 的答案...`, currentStageAnswers);
        socket.emit('submitStageAnswers', {
            lobbyId: currentLobbyId,
            teamId: myTeamId,
            stageNumber: stageData.stageNumber,
            answers: currentStageAnswers // 发送本阶段收集的所有答案
        });

        // 【区分教师端和学生端的后续行为】
        if (myTeamId === 'teacher_ops_team') { // 假设 'teacher_ops_team' 是教师端的唯一标识
             // 教师端在提交答案后，向服务器请求进入下一阶段
             socket.emit('requestNextStage', { 
                lobbyId: currentLobbyId, 
                caseId: caseId, 
                currentStageIndex: currentStageIndex,
                teamsDataSnapshot: teamsData // 可以把当前所有队伍的快照也发给服务器，以便服务器核对
             });
             console.log(`[DRILL.JS] 教师端请求进入下一阶段: ${currentStageIndex + 1}`);
        } else {
             // 学生端提交答案后，将按钮状态改为等待教师操作
             if (nextStageBtn) {
                 nextStageBtn.textContent = '答案已提交，等待教师操作...';
                 nextStageBtn.disabled = true;
                 nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
                 nextStageBtn.classList.add('bg-gray-500', 'cursor-not-allowed');
             }
        }
    }

    // 【修改 proceedToNextStageOrEnd 函数】
    function proceedToNextStageOrEnd() {
        if (currentStageIndex >= currentCaseData.stages.length - 1) {
            // 所有阶段已完成，跳转到结果页
            if (confirm('所有阶段已完成！确认结束本次推演并查看结果吗？')) {
                if (currentCaseData && teamsData) {
                    localStorage.setItem('drillResults', JSON.stringify(teamsData)); // 保存最终团队数据
                    localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim()); 
                    console.log('推演完成，团队分数已保存到localStorage:', teamsData);
                }
                // 确保href属性已在HTML中正确设置，或者在此处用JS跳转
                if (forceEndBtn && forceEndBtn.href) { 
                    window.location.href = forceEndBtn.href; 
                } else {
                    window.location.href = `results.html?caseId=${caseId}`; 
                }
            }
        } else {
            // 正常进入下一阶段 (这个分支现在主要由教师端触发，或由服务器指令触发)
            const nextStage = currentStageIndex + 1;
            setActiveStage(nextStage);
        }
    }
    
    // 【修改 updateLeaderboard 函数】
    function updateLeaderboard() {
        if (!leaderboardElement) {
            console.warn("排行榜元素未找到，无法更新。");
            return;
        }
        leaderboardElement.innerHTML = ''; 
        
        // 【关键修改点】：调整过滤逻辑，只有当存在真实学生队伍时才过滤掉教师演示队伍
        let teamsToDisplay = [...teamsData]; // 复制一份，避免修改原始数组

        // 检查是否存在至少一个非占位符、非教师演示的队伍，且有实际学生成员
        const hasActualStudentTeams = teamsData.some(team => 
            team.id !== 'placeholder' && 
            team.id !== 'no-teams' && 
            team.id !== 'teacher_ops_team' && 
            team.students && team.students.length > 0
        );

        if (hasActualStudentTeams) {
            // 如果有真实学生队伍，则从显示中过滤掉教师演示队伍
            teamsToDisplay = teamsToDisplay.filter(team => team.id !== 'placeholder' && team.id !== 'no-teams' && team.id !== 'teacher_ops_team');
        } else {
            // 如果没有真实学生队伍，确保教师演示队伍在显示列表中（如果它存在的话）
            // 并且过滤掉其他占位符
            teamsToDisplay = teamsToDisplay.filter(team => team.id !== 'placeholder' && team.id !== 'no-teams');
        }

        const sortedTeams = [...teamsToDisplay].sort((a, b) => b.score - a.score);

        if (sortedTeams.length === 0) {
             leaderboardElement.innerHTML = '<li class="text-center text-gray-500 p-2">暂无队伍参与排名</li>';
             return;
        }
        sortedTeams.forEach((team, index) => {
            const li = document.createElement('li');
            li.className = 'leaderboard-item flex justify-between items-center p-2 rounded-md transition-all duration-300 ease-in-out text-sm';
            if (index === 0) li.classList.add('bg-yellow-500/30', 'border', 'border-yellow-500', 'text-yellow-300');
            else if (index === 1) li.classList.add('bg-gray-400/30', 'border', 'border-gray-400', 'text-gray-200');
            else if (index === 2) li.classList.add('bg-orange-600/30', 'border', 'border-orange-600', 'text-orange-300');
            else li.classList.add('bg-gray-700/50', 'text-gray-300');
            const rankSpan = document.createElement('span');
            rankSpan.className = 'w-8 text-center font-semibold';
            if (index < 3) {
                const icons = ['fa-trophy text-yellow-400', 'fa-medal text-gray-300', 'fa-award text-orange-400'];
                rankSpan.innerHTML = `<i class="fas ${icons[index]} text-lg"></i>`;
            } else {
                rankSpan.textContent = `${index + 1}.`;
            }
            const nameSpan = document.createElement('span');
            nameSpan.className = 'flex-grow px-2 font-semibold truncate';
            nameSpan.textContent = team.name;
            nameSpan.title = team.name;
            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'font-bold';
            scoreSpan.textContent = `${team.score}分`;
             if (index === 0) scoreSpan.classList.add('text-yellow-400');
             else if (index === 1) scoreSpan.classList.add('text-gray-200');
             else if (index === 2) scoreSpan.classList.add('text-orange-300');
             else scoreSpan.classList.add('text-gray-300');
            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(scoreSpan);
            leaderboardElement.appendChild(li);
        });
    }

    // --- 7. 事件监听器 ---
    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            calculateScoresAndProceed(); 
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', (event) => {
            if (confirm('确定要强制结束本次推演并查看结果吗？')) {
                if (currentCaseData && teamsData) {
                    localStorage.setItem('drillResults', JSON.stringify(teamsData));
                    localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim()); 
                    console.log('推演强制结束，团队分数已保存到localStorage:', teamsData);
                }
                if (forceEndBtn && forceEndBtn.href) { 
                    window.location.href = forceEndBtn.href; 
                } else {
                    window.location.href = `results.html?caseId=${caseId}`; 
                }
            } else {
                 event.preventDefault(); 
            }
        });
    }
    
    if(pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            isPaused = !isPaused;
            if (pauseBtn) {
                if (isPaused) {
                    pauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>继续';
                    pauseBtn.classList.replace('bg-yellow-600', 'bg-green-600');
                    pauseBtn.classList.replace('hover:bg-yellow-700', 'hover:bg-green-700');
                } else {
                    pauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>暂停';
                    pauseBtn.classList.replace('bg-green-600', 'bg-yellow-600');
                    pauseBtn.classList.replace('hover:bg-green-700', 'hover:bg-yellow-700');
                }
            }
        });
    }
});
