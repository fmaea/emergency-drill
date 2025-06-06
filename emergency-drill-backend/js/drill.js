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
    // let socket = null; // WebSocket 实例 (当前版本未启用) - Will be initialized
    window.drillMap = null; // 高德地图实例 (如果案例需要)

    let teamsData = []; // 存储队伍信息，将从localStorage加载
    // 【修改】假设教师端操作的是第一个实际队伍的视角进行答题和计分模拟
    let currentOperatingTeamId = null; 

    // At the top with other state variables:
     let socket; 
     let currentStudentTeamId = null;
     let currentLobbyId = null;
     let dbCaseId = null; // To avoid confusion with urlParams.get('caseId') which might be just 'caseId' string
     let isTeacher = false; // We need a way to determine if the user is a teacher
     let currentSelections = {}; // To store selections before confirmation
     let confirmedQuestions = {}; // To track { lobbyId_caseId_teamId_questionKey: true }
     let notifiedStageCompletion = {}; // To track { stageIndex: true } for the current team

    // --- 3. 页面启动逻辑 ---
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');

    if (!caseId) {
        handleFatalError("错误：URL中未找到caseId，请从案例库进入。");
        return;
    }

    try {
        // Inside the main DOMContentLoaded try block, after fetching caseId from URL:
        dbCaseId = caseId; // Store the actual caseId from URL params
        currentStudentTeamId = localStorage.getItem('currentStudentTeamId');
        currentLobbyId = localStorage.getItem('currentLobbyId');
        
        const userRole = localStorage.getItem('userRoleForDrill');
        if (userRole === 'teacher') {
            isTeacher = true;
            console.log('[DRILL.JS] Running as Teacher (identified by userRoleForDrill flag).');
            localStorage.removeItem('userRoleForDrill'); // Clean up the flag after use
            // currentStudentTeamId will remain null or as previously set for teacher if they were also a student (unlikely)
        } else {
            isTeacher = false; 
            // currentStudentTeamId should have been loaded earlier from localStorage.
            // If not, it means this is a student who somehow skipped the join localStorage setup.
            if (!currentStudentTeamId) {
                console.warn('[DRILL.JS] Running as Student, but currentStudentTeamId is not found in localStorage. UI might not function correctly for student-specific actions.');
            }
            console.log(`[DRILL.JS] Running as Student. Team ID: ${currentStudentTeamId}, Lobby ID: ${currentLobbyId}`);
        }
        // The old logic `!currentStudentTeamId && localStorage.getItem('token')` is now superseded by the explicit flag for teachers.

        socket = io(window.location.protocol + '//' + window.location.hostname + ':7890', { transports: ['websocket'] });

        socket.on('connect', () => {
            console.log('[DRILL.JS] Connected to WebSocket server:', socket.id);
            if (currentLobbyId) {
                socket.emit('clientJoinsDrillRoom', { lobbyId: currentLobbyId });
                console.log(`[DRILL.JS] Sent clientJoinsDrillRoom for lobby: ${currentLobbyId}`);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('[DRILL.JS] WebSocket connection error:', error);
        });

        // Placeholder for future listeners like 'advanceToStage', 'scoresUpdated'
        socket.on('advanceToStage', (data) => {
           console.log('[DRILL.JS] Received advanceToStage event:', data);
           if (!isTeacher) { // Students advance based on server command
               setActiveStage(data.nextStageIndex);
           }
        });

        socket.on('scoresUpdated', (updatedTeamsData) => {
            console.log('[DRILL.JS] Received scoresUpdated event:', updatedTeamsData);
            teamsData = updatedTeamsData; // Update local teamsData with server's authoritative state
            updateLeaderboard(); // Re-render the leaderboard
        });

        socket.on('drillCompleted', (data) => {
            console.log('[DRILL.JS] Received drillCompleted event:', data);
            // Update local teamsData one last time
            if (data.finalTeamsData) {
                teamsData = data.finalTeamsData;
                updateLeaderboard();
            }
            
            // Display a message and prepare for results page
            alert('本次推演已正式结束！点击“确定”查看最终结果。');
            
            localStorage.setItem('userRoleForResults', isTeacher ? 'teacher' : 'student');
            // Save final data for results page (teacher might have already done part of this)
            localStorage.setItem('drillResults', JSON.stringify(teamsData));
            if (currentCaseData && currentCaseData.title) { // currentCaseData should be loaded
                localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim());
            } else if (dbCaseId) { // Fallback if currentCaseData is not fully loaded but we have the ID
                // Attempt to get title from existing lobby data if available, or just use ID
                const storedCaseTitle = teamsData.length > 0 ? (teamsData[0].caseTitle || dbCaseId) : dbCaseId;
                localStorage.setItem('currentCaseTitle', storedCaseTitle);
            }

            // Navigate to results page
            // Ensure forceEndBtn is available or construct the URL
            if (forceEndBtn && forceEndBtn.href && isTeacher) { // Teachers might use their existing button's URL
                 window.location.href = forceEndBtn.href;
            } else { // Students or fallback
                 window.location.href = `results.html?caseId=${dbCaseId}`;
            }
        });

        // 从localStorage加载队伍信息
        const storedTeams = localStorage.getItem('drillTeams');

        if (isTeacher) {
            socket.on('teamStageProgressUpdate', (data) => {
                console.log('[DRILL.JS] Teacher received teamStageProgressUpdate:', data);
                const { teamName, teamId, stageNumber, status } = data;

                if (status === 'completed') {
                    // Display a notification to the teacher.
                    // Option 1: Simple alert
                    // alert(`队伍 "${teamName}" 已完成阶段 ${stageNumber}！`);

                    // Option 2: Update a dedicated status area in the UI (preferred for less disruption)
                    // This requires an HTML element, e.g., <div id="teacher-notifications"></div>
                    const notificationsArea = document.getElementById('teacher-notifications');
                    if (notificationsArea) {
                        const messageElement = document.createElement('p');
                        messageElement.className = 'text-sm text-green-400 bg-gray-700 p-2 rounded-md mb-2';
                        messageElement.textContent = `通知: 队伍 "${teamName}" 已完成阶段 ${stageNumber}。`;
                        notificationsArea.prepend(messageElement); // Add new messages at the top
                        // Optional: Limit the number of messages or make them disappear after a while
                        setTimeout(() => {
                            if (messageElement.parentNode === notificationsArea) { // Check if still in DOM
                                notificationsArea.removeChild(messageElement);
                            }
                        }, 15000); // Remove after 15 seconds
                    } else {
                        // Fallback to alert if the dedicated area isn't found
                        alert(`队伍 "${teamName}" 已完成阶段 ${stageNumber}！`);
                    }

                    // Option 3: Update the leaderboard entry for that team
                    // This requires being able to find the team's specific element in the leaderboard.
                    // For example, if leaderboard items have an ID like `leaderboard-team-${teamId}`
                    const teamLeaderboardEntry = document.querySelector(`.leaderboard-item[data-team-id="${teamId}"]`); // Requires adding data-team-id to leaderboard items
                    if (teamLeaderboardEntry) {
                        let stageCompletionDisplay = teamLeaderboardEntry.querySelector('.stage-completion-status');
                        if (!stageCompletionDisplay) {
                            stageCompletionDisplay = document.createElement('span');
                            stageCompletionDisplay.className = 'text-xs text-cyan-400 ml-2 stage-completion-status';
                            // Find a place to append it, e.g., after team name
                            const nameSpan = teamLeaderboardEntry.querySelector('.truncate'); // Assuming team name span has 'truncate'
                            if (nameSpan && nameSpan.parentNode) {
                                nameSpan.parentNode.insertBefore(stageCompletionDisplay, nameSpan.nextSibling);
                            }
                        }
                        // Append or update stage completion status
                        const currentStatus = stageCompletionDisplay.textContent;
                        stageCompletionDisplay.textContent = currentStatus + ` S${stageNumber}✔ `;
                    }
                }
            });
        }

        if (storedTeams) {
            teamsData = JSON.parse(storedTeams);
            teamsData.forEach(team => { // 确保每个队伍对象都有score和answers属性
                if (team.score === undefined) team.score = 0;
                if (team.answers === undefined) team.answers = {};
            });
            // 【修改】如果队伍存在，默认操作第一个队伍 (如果不是占位符)
            const firstActualTeam = teamsData.find(t => t.id !== 'placeholder' && t.id !== 'no-teams');
            if (firstActualTeam) {
                currentOperatingTeamId = firstActualTeam.id;
            }
            console.log('[DRILL] 从localStorage加载的队伍数据:', JSON.parse(JSON.stringify(teamsData)));
        } else {
            teamsData = [{id: 'placeholder', name: "等待队伍加入...", score: 0, answers: {}}];
            console.warn("[DRILL] 未能从localStorage加载队伍信息。");
        }
        if (teamsData.filter(t => t.id !== 'placeholder' && t.id !== 'no-teams').length === 0) { 
             // 如果过滤后没有真实队伍，可以添加一个默认的教师操作队伍
            if (!teamsData.find(t => t.id === 'teacher_ops_team')) { // 避免重复添加
                const teacherTeam = {id: 'teacher_ops_team', name: "教师演示", score: 0, answers: {}};
                teamsData.push(teacherTeam);
                if (!currentOperatingTeamId) currentOperatingTeamId = teacherTeam.id;
            }
        }

        const apiUrlBase = `${window.location.protocol}//${window.location.hostname}:7890`;
        const response = await fetch(`${apiUrlBase}/api/cases/${dbCaseId}`);
        if (!response.ok) throw new Error(`获取案例数据失败，状态: ${response.status}`);
        currentCaseData = await response.json();
        console.log('成功获取案例数据:', JSON.parse(JSON.stringify(currentCaseData)));
        
        initializeDrillUI(currentCaseData);
        // initializeWebSocket(); // WebSocket相关功能，待后续集成

        // Conditional UI for Teacher/Student (placed after DOM elements are defined, but functionally here)
        if (!isTeacher) {
            if (nextStageBtn) nextStageBtn.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'none';
            // forceEndBtn might also be hidden for students, or re-purposed to "Exit"
            if (forceEndBtn) forceEndBtn.style.display = 'none'; 
        }
        
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

    // --- 4. UI和计时器初始化 ---
    function initializeDrillUI(caseData) {
        if (!caseData || !caseData.title) {
            handleFatalError("错误：传入的案例数据无效。");
            return;
        }
        if (headerCaseTitleElement) headerCaseTitleElement.textContent = `案例: ${caseData.title.replace(/\[cite: \d+\]/g, '').trim()}`;
        if (forceEndBtn) forceEndBtn.href = `results.html?caseId=${caseId}`;
        
        startTimer(caseData.estimatedTime ? caseData.estimatedTime * 60 : 180 * 60); // 默认180分钟
        updateLeaderboard(); // 初始化排行榜显示
        
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
                    // 可选：时间到自动提交并进入下一阶段
                    // calculateScoresAndProceed(); 
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
            if (panel) { // 确保panel元素存在
                panel.classList.toggle('stage-active', index === stageIndex);
            }
        });

        // 确保只对当前激活的面板进行渲染
        if (stagePanels[stageIndex]) {
            renderStageContent(stagePanels[stageIndex], stageData);
        } else {
            console.error(`错误：找不到阶段 ${stageIndex} 的面板元素 (stagePanels[${stageIndex}])`);
        }

        if (nextStageBtn) {
            nextStageBtn.innerHTML = (stageIndex >= currentCaseData.stages.length - 1) ? "完成推演" : "提交并进入下一阶段";
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

        // 图片渲染逻辑
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
                } else if (stageData.questions && stageData.questions[0] && stageData.questions[0].assetUrl && stageData.stageNumber === 3) {
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
                                button.innerHTML = `<i class="fas ${optIndex === 0 ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>${opt.text.replace(/\[cite: \d+\]/g, '').trim()}`;
                                button.dataset.value = opt.text.replace(/"/g, '&quot;');
                                button.addEventListener('click', (event) => {
                                    const buttonsInQuestion = event.target.closest('.question-item').querySelectorAll('button');
                                    buttonsInQuestion.forEach(btn => btn.classList.remove('ring-2', 'ring-offset-2', 'ring-cyan-500'));
                                    event.target.classList.add('ring-2', 'ring-offset-2', 'ring-cyan-500');
                                    handleAnswerSelection(currentOperatingTeamId, stageData.stageNumber, qIndex, question.questionType, event.target);
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
                                inputElement.value = opt.text.replace(/"/g, '&quot;');
                                inputElement.className = 'mr-3 accent-cyan-500 align-middle';
                                inputElement.addEventListener('change', (event) => {
                                    handleAnswerSelection(currentOperatingTeamId, stageData.stageNumber, qIndex, question.questionType, event.target);
                                });

                                label.appendChild(inputElement);
                                label.appendChild(document.createTextNode(` ${opt.text.replace(/\[cite: \d+\]/g, '').trim()}`));
                                optionsDiv.appendChild(label);
                            }
                        });
                    }
                    questionWrapper.appendChild(optionsDiv);

                    // Add Confirm Answer button for students
                    if (!isTeacher) {
                        const confirmButton = document.createElement('button');
                        confirmButton.textContent = '确认答案';
                        confirmButton.className = 'confirm-answer-btn mt-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800';
                        confirmButton.dataset.questionKey = questionId; // questionId is s<stageNum>-q<qIndex>
                        confirmButton.dataset.stageNum = stageData.stageNumber;
                        confirmButton.dataset.qIndex = qIndex;
                        confirmButton.dataset.questionType = question.questionType;
                        
                        // Check if this question was already confirmed by this team in this session
                        const confirmationKey = `${currentLobbyId}_${dbCaseId}_${currentStudentTeamId}_${questionId}`;
                        if (confirmedQuestions[confirmationKey]) {
                            confirmButton.disabled = true;
                            confirmButton.textContent = '已确认';
                            // Also disable inputs for this question if confirmed (done by lockQuestionInputs)
                        }
                        questionWrapper.appendChild(confirmButton);
                        if (confirmedQuestions[confirmationKey]) {
                            // confirmButton.disabled = true; // Already set above
                            // confirmButton.textContent = '已确认'; // Already set above
                            lockQuestionInputs(questionId, confirmButton); // Call to disable options too
                        }
                    }

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
    
    
    function handleAnswerSelection(operatingTeamIdForTeacher, stageNum, questionIndex, questionType, targetElement) {
        const questionKey = `s${stageNum}-q${questionIndex}`; // questionKey is s<stageNum>-q<qIndex>
        let selectedValue = targetElement.value;
        if (targetElement.tagName === 'BUTTON' && targetElement.dataset.value) {
            selectedValue = targetElement.dataset.value;
        }

        if (!isTeacher) {
            // Student is selecting, store temporarily
            if (questionType === 'MultipleChoice-Multi') {
                if (!currentSelections[questionKey] || !Array.isArray(currentSelections[questionKey])) {
                    currentSelections[questionKey] = [];
                }
                const currentValueIndex = currentSelections[questionKey].indexOf(selectedValue);
                if (targetElement.checked) {
                    if (currentValueIndex === -1) currentSelections[questionKey].push(selectedValue);
                } else {
                    if (currentValueIndex > -1) currentSelections[questionKey].splice(currentValueIndex, 1);
                }
            } else { // Radio, Binary-Decision (where value is on button)
                currentSelections[questionKey] = [selectedValue];
            }
            console.log(`[DRILL.JS] Student temp selection for ${questionKey}:`, currentSelections[questionKey]);
        } else if (isTeacher && operatingTeamIdForTeacher) {
            // Teacher's existing simulation logic (can remain as is for now)
            const team = teamsData.find(t => t.id === operatingTeamIdForTeacher);
            if (team) {
                if (!team.answers) team.answers = {}; // Ensure answers object exists
                if (questionType === 'MultipleChoice-Multi') {
                    if (!team.answers[questionKey] || !Array.isArray(team.answers[questionKey])) {
                        team.answers[questionKey] = [];
                    }
                    const currentValueIndex = team.answers[questionKey].indexOf(selectedValue);
                    if (targetElement.checked) {
                        if (currentValueIndex === -1) team.answers[questionKey].push(selectedValue);
                    } else {
                        if (currentValueIndex > -1) team.answers[questionKey].splice(currentValueIndex, 1);
                    }
                } else {
                    team.answers[questionKey] = [selectedValue];
                }
                console.log(`[DRILL.JS] Teacher operating for team ${team.name} (${team.id}) on ${questionKey}, answers:`, team.answers[questionKey]);
            }
        }
    }

    function lockQuestionInputs(questionKey, confirmButtonElement) {
        // Find the question container. Assuming questions are in elements with class 'question-item'
        // and we can find it by finding an element that contains an input with name=questionKey or a button with data-question-key
        let questionWrapper = null;
        if (confirmButtonElement) {
            questionWrapper = confirmButtonElement.closest('.question-item');
        }
        // Fallback or alternative: document.querySelector(`.question-item [name="${questionKey}"]`)?.closest('.question-item');
        // This part needs robust targeting of the question's inputs.

        if (questionWrapper) {
            const inputs = questionWrapper.querySelectorAll('input[type="radio"], input[type="checkbox"], .question-item button'); // Include answer buttons if they are part of options
            inputs.forEach(input => {
                // Don't disable the already clicked confirm button again if it's part of 'inputs'
                if (input !== confirmButtonElement && !input.classList.contains('confirm-answer-btn')) {
                   input.disabled = true;
                }
            });
            // Style the wrapper to indicate it's locked
            questionWrapper.classList.add('opacity-70', 'pointer-events-none'); // Example styling
        } else {
            console.warn(`[DRILL.JS] Could not find question wrapper for ${questionKey} to lock inputs.`);
        }
        
        if (confirmButtonElement) {
            confirmButtonElement.disabled = true;
            confirmButtonElement.textContent = '已确认';
            confirmButtonElement.classList.remove('bg-green-600', 'hover:bg-green-700');
            confirmButtonElement.classList.add('bg-gray-500');
        }
        console.log(`[DRILL.JS] Inputs locked for question ${questionKey}`);
    }

    function calculateScoresAndProceed() {
        const stageData = currentCaseData.stages[currentStageIndex];
        if (!stageData || !stageData.questions) {
            console.warn("无法计分：当前阶段数据或问题数据缺失。");
            proceedToNextStageOrEnd();
            return;
        }

        teamsData.forEach(team => {
            if(team.id === 'placeholder' || team.id === 'no-teams') return; 
            // 【修改】确保只为当前操作的队伍（或所有队伍，如果需要）计分
            if (!currentOperatingTeamId || team.id !== currentOperatingTeamId) {
                 // 如果您希望所有队伍都根据教师端的选择（或一个预设答案）计分，
                 // 您需要修改这里的逻辑，或者从服务器获取每个队伍的答案。
                 // 当前，只有 currentOperatingTeamId 的答案会被记录和计分。
                 // 为了演示，我们也可以让所有队伍都获得分数。
                 // return; // 如果只想为操作的队伍计分，取消此注释
            }


            let stageScoreForTeam = 0;
            stageData.questions.forEach((question, qIndex) => {
                const questionKey = `s${stageData.stageNumber}-q${qIndex}`;
                const correctOptions = (question.answerOptions || [])
                                        .filter(opt => opt.isCorrect === true) 
                                        .map(opt => opt.text.replace(/"/g, '&quot;'));
                
                // 【修改】确保team.answers存在才访问
                const teamAnswersForQuestion = team.answers && team.answers[questionKey] ? team.answers[questionKey] : [];


                let isCorrectForThisQuestion = false;
                if (correctOptions.length > 0) { 
                    if (question.questionType === 'MultipleChoice-Multi') {
                        isCorrectForThisQuestion = teamAnswersForQuestion.length === correctOptions.length && 
                                               correctOptions.every(co => teamAnswersForQuestion.includes(co)) &&
                                               teamAnswersForQuestion.every(ta => correctOptions.includes(ta));
                    } else { 
                        isCorrectForThisQuestion = teamAnswersForQuestion.length === 1 && correctOptions.includes(teamAnswersForQuestion[0]);
                    }
                }

                if (isCorrectForThisQuestion) {
                    stageScoreForTeam += (question.points || 0);
                }
            });
            team.score += stageScoreForTeam;
            console.log(`团队 ${team.name} 在阶段 ${stageData.stageNumber} 获得 ${stageScoreForTeam} 分，总分: ${team.score}`);
            
            stageData.questions.forEach((_, qIndex) => {
                const questionKeyToClear = `s${stageData.stageNumber}-q${qIndex}`;
                if (team.answers) { // 确保answers对象存在
                    delete team.answers[questionKeyToClear];
                }
            });
        });

        updateLeaderboard();
        proceedToNextStageOrEnd();
    }

    function proceedToNextStageOrEnd() {
        if (currentStageIndex >= currentCaseData.stages.length - 1) {
            if (confirm('所有阶段已完成！确认结束本次推演吗？')) {
                if (forceEndBtn && forceEndBtn.href) window.location.href = forceEndBtn.href;
            }
        } else {
            const nextStage = currentStageIndex + 1;
            setActiveStage(nextStage);
        }
    }
    
    function updateLeaderboard() {
        if (!leaderboardElement) {
            console.warn("排行榜元素未找到，无法更新。");
            return;
        }
        leaderboardElement.innerHTML = ''; 
        if (teamsData.length === 1 && (teamsData[0].id === 'placeholder' || teamsData[0].id === 'no-teams')) {
            const li = document.createElement('li');
            li.className = 'text-center text-gray-500 p-2';
            li.textContent = teamsData[0].name; 
            leaderboardElement.appendChild(li);
            return;
        }
        const actualTeams = teamsData.filter(team => team.id !== 'placeholder' && team.id !== 'no-teams');
        const sortedTeams = [...actualTeams].sort((a, b) => b.score - a.score);
        if (sortedTeams.length === 0) {
             leaderboardElement.innerHTML = '<li class="text-center text-gray-500 p-2">暂无队伍参与排名</li>';
             return;
        }
        sortedTeams.forEach((team, index) => {
            const li = document.createElement('li');
            li.className = 'leaderboard-item flex justify-between items-center p-2 rounded-md transition-all duration-300 ease-in-out text-sm';
            li.dataset.teamId = team.id; // Add this line
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
    document.body.addEventListener('click', function(event) {
        if (event.target.classList.contains('confirm-answer-btn')) {
            if (isTeacher || event.target.disabled) return; // Only students, and only if not already confirmed

            const button = event.target;
            const questionKey = button.dataset.questionKey;
            const stageNum = parseInt(button.dataset.stageNum, 10);
            const qIndex = parseInt(button.dataset.qIndex, 10);
            // const questionType = button.dataset.questionType; // Already available from question object

            const selectedAnswer = currentSelections[questionKey];

            if (!selectedAnswer || selectedAnswer.length === 0) {
                alert('请先选择一个答案，然后再确认。');
                return;
            }

            if (confirm(`确认提交问题 "${questionKey}" 的答案吗？一旦确认，将无法修改。`)) {
                console.log(`[DRILL.JS] Student confirmed answer for ${questionKey}:`, selectedAnswer);
                
                if (socket && currentStudentTeamId && currentLobbyId && dbCaseId) {
                    socket.emit('studentSubmitAnswer', {
                        lobbyId: currentLobbyId,
                        caseId: dbCaseId,
                        questionKey: questionKey,
                        answerData: selectedAnswer, // Send the stored selection
                        teamId: currentStudentTeamId,
                        stageNumber: stageNum,
                        questionIndex: qIndex
                    });
                }
                lockQuestionInputs(questionKey, button); // Pass the button itself
                
                // Track confirmed questions for this session to persist disabled state on re-renders (e.g. if stage reloaded)
                const sessionConfirmKey = `${currentLobbyId}_${dbCaseId}_${currentStudentTeamId}_${questionKey}`; // Use a different var name to avoid conflict
                confirmedQuestions[sessionConfirmKey] = true;

                // Call to check for stage completion using the 0-based currentStageIndex
                checkAndNotifyStageCompletion(currentStageIndex); 
            }
        }
    });

    function checkAndNotifyStageCompletion(stageIndex) {
        if (isTeacher || !currentCaseData || !currentCaseData.stages[stageIndex]) {
            return;
        }

        // Check if notification for this stage has already been sent for this team
        const notificationKey = `${currentLobbyId}_${dbCaseId}_${currentStudentTeamId}_stage_${stageIndex}`;
        if (notifiedStageCompletion[notificationKey]) {
            // console.log(`[DRILL.JS] Stage ${stageIndex} completion already notified for team ${currentStudentTeamId}.`);
            return;
        }

        const stageData = currentCaseData.stages[stageIndex];
        const stagePanel = stagePanels[stageIndex]; // Assuming stagePanels array is accessible

        if (!stagePanel || !stageData.questions || stageData.questions.length === 0) {
            return; // No questions or panel found for this stage
        }

        const totalQuestionsInStage = stageData.questions.length;
        let confirmedCount = 0;

        // Iterate through questions of the current stage to check their confirmed status
        // This relies on the `confirmedQuestions` object which tracks client-side confirmations
        // or by checking if all confirm buttons in that stage are disabled.
        // Let's use the `confirmedQuestions` state for a more direct check.
        for (let i = 0; i < totalQuestionsInStage; i++) {
            const questionKeyToCheck = `s${stageData.stageNumber}-q${i}`; // questionKey is s<stageNum>-q<qIndex>
            const sessionConfirmationKeyToCheck = `${currentLobbyId}_${dbCaseId}_${currentStudentTeamId}_${questionKeyToCheck}`;
            if (confirmedQuestions[sessionConfirmationKeyToCheck]) {
                confirmedCount++;
            }
        }
        
        console.log(`[DRILL.JS] Stage ${stageIndex} check: ${confirmedCount}/${totalQuestionsInStage} questions confirmed by team ${currentStudentTeamId}.`);

        if (confirmedCount === totalQuestionsInStage) {
            console.log(`[DRILL.JS] All questions in stage ${stageIndex} completed by team ${currentStudentTeamId}. Emitting studentStageComplete.`);
            if (socket && currentLobbyId && currentStudentTeamId) {
                socket.emit('studentStageComplete', {
                    lobbyId: currentLobbyId,
                    teamId: currentStudentTeamId,
                    stageNumber: stageData.stageNumber, // Send actual stage number
                    stageIndex: stageIndex // Send zero-based index if useful for server/teacher
                });
                notifiedStageCompletion[notificationKey] = true; // Mark as notified for this session
            }
        }
    }

    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            if (isTeacher) {
                console.log('[DRILL.JS] Teacher clicked Next Stage/Complete Drill.');
                // Server will advance stage for students. Teacher UI might also listen to 'advanceToStage'.
                // Teacher no longer calculates scores locally for all teams this way.
                // Scores are updated via 'scoresUpdated' event from server.
                
                if (currentStageIndex >= currentCaseData.stages.length - 1) {
                    if (confirm('所有阶段已完成！确认结束本次推演吗？教师将结束所有学生的推演。')) {
                        // Notify server that drill is ending
                        if (socket && currentLobbyId) {
                             socket.emit('teacherEndsDrill', { lobbyId: currentLobbyId });
                        }
                        // Teacher specific: save their view of teamsData for results (or rely on server's final version)
                        localStorage.setItem('drillResults', JSON.stringify(teamsData));
                        localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim());
                        if (forceEndBtn && forceEndBtn.href) {
                            window.location.href = forceEndBtn.href;
                        } else {
                            window.location.href = `results.html?caseId=${dbCaseId}`;
                        }
                    }
                } else {
                    // Teacher requests server to advance stage
                    if (socket && currentLobbyId && dbCaseId) {
                        // Pass current teamsData as a snapshot if server needs it for any reason before advancing
                        // Or rely on server having the latest scores.
                        socket.emit('teacherRequestsNextStage', {
                            lobbyId: currentLobbyId,
                            caseId: dbCaseId,
                            currentStageIndex: currentStageIndex,
                            teamsDataSnapshot: teamsData // Teacher's view of teamsData
                        });
                        // Teacher's own UI advances. Students will advance via 'advanceToStage' event.
                        setActiveStage(currentStageIndex + 1);
                    }
                }
            } else {
                // Student view: Next stage button should ideally be disabled or not present.
                // Stage progression for students is handled by 'advanceToStage' event from server.
                // If it's visible and clickable, it should do nothing or show a message.
                alert('请等待教师进入下一阶段。');
            }
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', (event) => {
            // event.preventDefault(); // 如果 forceEndBtn 是 <a> 标签，阻止其默认跳转
            if (confirm('确定要强制结束本次推演并查看结果吗？')) {
                // 【新增】在强制结束时保存团队分数
                if (currentCaseData && teamsData) {
                    localStorage.setItem('userRoleForResults', 'teacher'); 
                    localStorage.setItem('drillResults', JSON.stringify(teamsData));
                    localStorage.setItem('currentCaseTitle', currentCaseData.title); // 【新增】同时保存案例标题
                    console.log('推演强制结束，团队分数已保存到localStorage:', teamsData);
                }
                // 确保href属性已在HTML中正确设置，或者在此处用JS跳转
                // window.location.href = `results.html?caseId=${caseId}`; // 如果 forceEndBtn 不是 a 标签，或需要动态 caseId
            } else {
                 event.preventDefault(); // 如果用户取消，则阻止跳转
            }
        });
    }
    
    function proceedToNextStageOrEnd() {
        if (currentStageIndex >= currentCaseData.stages.length - 1) {
            if (confirm('所有阶段已完成！确认结束本次推演并查看结果吗？')) {
                // 【新增】在推演自然完成时保存团队分数
                if (currentCaseData && teamsData) {
                    localStorage.setItem('drillResults', JSON.stringify(teamsData));
                    localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim()); // 保存清理后的案例标题
                    console.log('推演完成，团队分数已保存到localStorage:', teamsData);
                }
                if (forceEndBtn && forceEndBtn.href) { // forceEndBtn 通常就是结果页的链接
                    window.location.href = forceEndBtn.href; // 使用已有的跳转逻辑
                } else {
                    window.location.href = `results.html?caseId=${caseId}`; // 备用跳转
                }
            }
        } else {
            const nextStage = currentStageIndex + 1;
            setActiveStage(nextStage);
        }
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
