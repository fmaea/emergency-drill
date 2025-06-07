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

    // Volume Control DOM Elements
    const volumeControlsContainer = document.getElementById('volume-controls-container');
    const volumeDownBtn = document.getElementById('volume-down-btn');
    const volumeUpBtn = document.getElementById('volume-up-btn');
    const muteBtn = document.getElementById('mute-btn');
    
    // --- Sound Effect Variables ---
    let currentAmbientSound = null;
    const caseBSoundPaths = { // These paths are generic, the trigger ID changes
        stage1: 'assets/caseB/sounds/风雪声.mp3',
        stage2: 'assets/caseB/sounds/风雪声.mp3',
        stage3: 'assets/caseB/sounds/river.mp3',
        stage4: 'assets/caseB/sounds/施工声音.mp3',
    };
    let currentDrillCaseId = null; // To store the specific case ID like 'caseA', '68332aee004ada38db5cfd38'
    let userInteracted = false; // To help with autoplay policies

    // Volume Control State Variables
    let currentVolume = 0.7;
    let isMuted = false;
    const VOLUME_STEP = 0.1;


    // --- 2. 状态变量初始化 ---
    let currentStageIndex = 0; 
    let currentCaseData = null;  
    let timerInterval;
    let isPaused = false; // Drill pause state, not sound mute state
    window.drillMap = null;

    let teamsData = [];
    let currentOperatingTeamId = null; 

     let socket; 
     let currentStudentTeamId = null;
     let currentLobbyId = null;
     let dbCaseId = null;
     let isTeacher = false;
     let currentSelections = {};
     let confirmedQuestions = {};

    // --- 3. 页面启动逻辑 ---
    const urlParams = new URLSearchParams(window.location.search);
    const caseIdFromUrl = urlParams.get('caseId');

    if (!caseIdFromUrl) {
        handleFatalError("错误：URL中未找到caseId，请从案例库进入。");
        return;
    }
    currentDrillCaseId = caseIdFromUrl;
    // console.log('[SOUND DEBUG] currentDrillCaseId set to:', currentDrillCaseId); // Keep this one for initial check

    try {
        dbCaseId = caseIdFromUrl;
        currentStudentTeamId = localStorage.getItem('currentStudentTeamId');
        currentLobbyId = localStorage.getItem('currentLobbyId');
        
        const userRoleForDrill = localStorage.getItem('userRoleForDrill');
        if (userRoleForDrill === 'teacher') {
            isTeacher = true;
            console.log('[DRILL.JS] Running as Teacher (identified by userRoleForDrill flag).');
            localStorage.removeItem('userRoleForDrill');
            if (volumeControlsContainer) volumeControlsContainer.style.display = 'flex';
            initializeVolumeControls();
            updateMuteButtonUI();
        } else {
            isTeacher = false; 
            if (!currentStudentTeamId) {
                console.warn('[DRILL.JS] Running as Student, but currentStudentTeamId is not found in localStorage. UI might not function correctly for student-specific actions.');
            }
            console.log(`[DRILL.JS] Running as Student. Team ID: ${currentStudentTeamId}, Lobby ID: ${currentLobbyId}`);
            if (volumeControlsContainer) volumeControlsContainer.style.display = 'none';
        }

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

        socket.on('advanceToStage', (data) => {
           console.log('[DRILL.JS] Received advanceToStage event:', data);
           if (!isTeacher) {
               setActiveStage(data.nextStageIndex);
           }
        });

        socket.on('scoresUpdated', (updatedTeamsData) => {
            console.log('[DRILL.JS] Received scoresUpdated event:', updatedTeamsData);
            teamsData = updatedTeamsData;
            updateLeaderboard();
        });

        socket.on('drillCompleted', (data) => {
            console.log('[DRILL.JS] Received drillCompleted event:', data);
            if (currentAmbientSound) {
                // console.log('[SOUND DEBUG] Drill completed, stopping sound.');
                currentAmbientSound.pause();
                currentAmbientSound = null;
            }
            if (data.finalTeamsData) {
                teamsData = data.finalTeamsData;
                updateLeaderboard();
            }
            alert('本次推演已正式结束！点击“确定”查看最终结果。');
            localStorage.setItem('userRoleForResults', isTeacher ? 'teacher' : 'student');
            localStorage.setItem('drillResults', JSON.stringify(teamsData));
            if (currentCaseData && currentCaseData.title) {
                localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim());
            } else if (dbCaseId) {
                const storedCaseTitle = teamsData.length > 0 ? (teamsData[0].caseTitle || dbCaseId) : dbCaseId;
                localStorage.setItem('currentCaseTitle', storedCaseTitle);
            }
            if (forceEndBtn && forceEndBtn.href && isTeacher) {
                 window.location.href = forceEndBtn.href;
            } else {
                 window.location.href = `results.html?caseId=${currentDrillCaseId}`;
            }
        });

        socket.on('drillPausedByTeacher', (data) => {
            if (!isTeacher) {
                isPaused = data.isPaused;
                if (isPaused) {
                    // console.log('[SOUND DEBUG] Teacher pause event: Pausing sound.', currentAmbientSound ? currentAmbientSound.src : 'No current sound');
                    if (currentAmbientSound) currentAmbientSound.pause();
                    if(pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>教师已暂停';
                    if(timerElement) timerElement.classList.add('animate-pulse');
                } else {
                    // console.log('[SOUND DEBUG] Teacher resume event: Attempting to resume sound.', currentAmbientSound ? currentAmbientSound.src : 'No current sound');
                    if (currentAmbientSound && currentDrillCaseId === '68332aee004ada38db5cfd38' && userInteracted) {
                        currentAmbientSound.play().catch(error => console.error('[SOUND ERROR] Error resuming sound via teacher event:', error));
                    }
                     if(pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>推演进行中';
                     if(timerElement) timerElement.classList.remove('animate-pulse');
                }
            }
        });

        const storedTeams = localStorage.getItem('drillTeams');
        if (storedTeams) {
            teamsData = JSON.parse(storedTeams);
            teamsData.forEach(team => {
                if (team.score === undefined) team.score = 0;
                if (team.answers === undefined) team.answers = {};
            });
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
            if (!teamsData.find(t => t.id === 'teacher_ops_team')) {
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

        if (!isTeacher) {
            if (nextStageBtn) nextStageBtn.style.display = 'none';
            if (pauseBtn) pauseBtn.style.display = 'none';
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

    function initializeDrillUI(caseData) {
        if (!caseData || !caseData.title) {
            handleFatalError("错误：传入的案例数据无效。");
            return;
        }
        if (headerCaseTitleElement) headerCaseTitleElement.textContent = `案例: ${caseData.title.replace(/\[cite: \d+\]/g, '').trim()}`;
        if (forceEndBtn) forceEndBtn.href = `results.html?caseId=${currentDrillCaseId}`;
        
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
            nextStageBtn.innerHTML = (stageIndex >= currentCaseData.stages.length - 1) ? "完成推演" : "提交并进入下一阶段";
        }
        playCaseBSound(stageIndex + 1);
    }

    // --- Volume Control Functions ---
    function initializeVolumeControls() {
        if (!volumeUpBtn || !volumeDownBtn || !muteBtn) {
            console.warn('[SOUND WARN] Volume control buttons not all found.'); // Changed prefix
            return;
        }

        volumeUpBtn.addEventListener('click', () => {
            isMuted = false;
            currentVolume = Math.min(1.0, parseFloat((currentVolume + VOLUME_STEP).toFixed(1)));
            applyVolumeChange();
            // console.log('[SOUND DEBUG] Volume Up clicked. New volume:', currentVolume);
        });

        volumeDownBtn.addEventListener('click', () => {
            isMuted = false;
            currentVolume = Math.max(0.0, parseFloat((currentVolume - VOLUME_STEP).toFixed(1)));
            applyVolumeChange();
            // console.log('[SOUND DEBUG] Volume Down clicked. New volume:', currentVolume);
        });

        muteBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            applyVolumeChange();
            // console.log('[SOUND DEBUG] Mute button clicked. isMuted:', isMuted);
        });
    }

    function applyVolumeChange() {
        if (currentAmbientSound) {
            currentAmbientSound.volume = isMuted ? 0 : currentVolume;
        }
        updateMuteButtonUI();
        // console.log('[SOUND DEBUG] Applying volume. Actual sound volume set to:', isMuted ? 0 : currentVolume);
    }

    function updateMuteButtonUI() {
        if (!muteBtn) return;
        const icon = muteBtn.querySelector('i');
        if (!icon) return;

        if (isMuted || currentVolume === 0) {
            muteBtn.title = '取消静音 (Unmute)';
            icon.className = 'fas fa-volume-off';
        } else {
            muteBtn.title = '静音 (Mute)';
            icon.className = 'fas fa-volume-mute';
        }
    }

    // --- Sound Control Function ---
    function playCaseBSound(stageNumber) {
        // console.log('[SOUND DEBUG] playCaseBSound called for stage:', stageNumber);
        // console.log('[SOUND DEBUG] currentDrillCaseId inside playCaseBSound:', currentDrillCaseId);
        // console.log('[SOUND DEBUG] userInteracted state:', userInteracted);
        // console.log('[SOUND DEBUG] isPaused state:', isPaused);

        if (currentAmbientSound) {
            // console.log('[SOUND DEBUG] Pausing previous sound:', currentAmbientSound ? currentAmbientSound.src : 'null');
            currentAmbientSound.pause();
            currentAmbientSound.oncanplaythrough = null;
            currentAmbientSound.onerror = null;
            currentAmbientSound = null;
        }

        // console.log(`[SOUND DEBUG] Evaluating conditions: (currentDrillCaseId === "68332aee004ada38db5cfd38": ${currentDrillCaseId === "68332aee004ada38db5cfd38"}), (userInteracted: ${userInteracted}), (!isPaused: ${!isPaused})`);
        if (currentDrillCaseId !== '68332aee004ada38db5cfd38' || !userInteracted || isPaused) {
            // console.log('[SOUND DEBUG] Conditions for sound play NOT MET. Returning from playCaseBSound.');
            return;
        }

        const soundPath = caseBSoundPaths['stage' + stageNumber];
        // console.log('[SOUND DEBUG] Sound path determined:', soundPath);

        if (soundPath) {
            // console.log('[SOUND DEBUG] Creating new Audio object with path:', soundPath);
            currentAmbientSound = new Audio(soundPath);
            currentAmbientSound.loop = true;
            currentAmbientSound.volume = isMuted ? 0 : currentVolume;

            currentAmbientSound.oncanplaythrough = () => {
                // console.log('[SOUND DEBUG] Audio oncanplaythrough event for path:', soundPath);
                currentAmbientSound.play()
                    .then(() => {
                        // console.log('[SOUND DEBUG] audio.play() initiated for:', soundPath);
                    })
                    .catch(error => {
                        console.error(`[SOUND ERROR] Play promise failed for stage ${stageNumber} (${soundPath}):`, error); // Keep and adjust
                        if (error.name === 'NotAllowedError') {
                            console.warn('[SOUND WARN] Playback prevented by browser policy. User interaction might be required again.'); // Keep and adjust
                            userInteracted = false;
                            currentAmbientSound = null;
                        }
                    });
            };
            currentAmbientSound.onerror = (e) => {
                console.error(`[SOUND ERROR] Audio onerror for stage ${stageNumber} (${soundPath}). Code:`, currentAmbientSound.error ? currentAmbientSound.error.code : 'N/A', 'Message:', currentAmbientSound.error ? currentAmbientSound.error.message : 'N/A'); // Keep and adjust
                currentAmbientSound = null;
            };
            currentAmbientSound.load();
        } else {
            // console.log(`[SOUND DEBUG] No sound defined for sound set linked to this case, stage ${stageNumber}`);
        }
    }


    // --- 6. 核心：渲染每个阶段的动态内容 ---
    function renderStageContent(panelElement, stageData) {
        if (!panelElement || !stageData) {
            console.warn(`[渲染错误] 阶段 ${stageData ? stageData.stageNumber : '未知'}：缺少面板元素或阶段数据`);
            return;
        }
        // console.log(`[渲染开始] 阶段 ${stageData.stageNumber}`, JSON.parse(JSON.stringify(stageData))); // Commented out

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
                        confirmButton.dataset.questionKey = questionId;
                        confirmButton.dataset.stageNum = stageData.stageNumber;
                        confirmButton.dataset.qIndex = qIndex;
                        confirmButton.dataset.questionType = question.questionType;
                        
                        const confirmationKey = `${currentLobbyId}_${dbCaseId}_${currentStudentTeamId}_${questionId}`;
                        if (confirmedQuestions[confirmationKey]) {
                            confirmButton.disabled = true;
                            confirmButton.textContent = '已确认';
                        }
                        questionWrapper.appendChild(confirmButton);
                        if (confirmedQuestions[confirmationKey]) {
                            lockQuestionInputs(questionId, confirmButton);
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
                             questionWrapper.className = 'mt-6 dynamic-question-block p-3 bg-gray-800/50 rounded-lg';
                             targetQuestionContainer.appendChild(questionWrapper);
                        }
                    } else { 
                         if(targetQuestionContainer) targetQuestionContainer.appendChild(questionWrapper);
                    }
                });
            }
        } else { 
            // console.log(`[阶段${stageData.stageNumber}] 无问题数据 (questions 数组不存在或为空)。`); // Commented out
        }
    }
    
    function handleAnswerSelection(operatingTeamIdForTeacher, stageNum, questionIndex, questionType, targetElement) {
        const questionKey = `s${stageNum}-q${questionIndex}`;
        let selectedValue = targetElement.value;
        if (targetElement.tagName === 'BUTTON' && targetElement.dataset.value) {
            selectedValue = targetElement.dataset.value;
        }
        if (!isTeacher) {
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
            } else {
                currentSelections[questionKey] = [selectedValue];
            }
            // console.log(`[DRILL.JS] Student temp selection for ${questionKey}:`, currentSelections[questionKey]); // Commented out
        } else if (isTeacher && operatingTeamIdForTeacher) {
            const team = teamsData.find(t => t.id === operatingTeamIdForTeacher);
            if (team) {
                if (!team.answers) team.answers = {};
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
                // console.log(`[DRILL.JS] Teacher operating for team ${team.name} (${team.id}) on ${questionKey}, answers:`, team.answers[questionKey]); // Commented out
            }
        }
    }

    function lockQuestionInputs(questionKey, confirmButtonElement) {
        let questionWrapper = null;
        if (confirmButtonElement) {
            questionWrapper = confirmButtonElement.closest('.question-item');
        }
        if (questionWrapper) {
            const inputs = questionWrapper.querySelectorAll('input[type="radio"], input[type="checkbox"], .question-item button');
            inputs.forEach(input => {
                if (input !== confirmButtonElement && !input.classList.contains('confirm-answer-btn')) {
                   input.disabled = true;
                }
            });
            questionWrapper.classList.add('opacity-70', 'pointer-events-none');
        } else {
            console.warn(`[DRILL.JS] Could not find question wrapper for ${questionKey} to lock inputs.`);
        }
        if (confirmButtonElement) {
            confirmButtonElement.disabled = true;
            confirmButtonElement.textContent = '已确认';
            confirmButtonElement.classList.remove('bg-green-600', 'hover:bg-green-700');
            confirmButtonElement.classList.add('bg-gray-500');
        }
        // console.log(`[DRILL.JS] Inputs locked for question ${questionKey}`); // Commented out
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
            if (!currentOperatingTeamId || team.id !== currentOperatingTeamId) {
            }
            let stageScoreForTeam = 0;
            stageData.questions.forEach((question, qIndex) => {
                const questionKey = `s${stageData.stageNumber}-q${qIndex}`;
                const correctOptions = (question.answerOptions || [])
                                        .filter(opt => opt.isCorrect === true) 
                                        .map(opt => opt.text.replace(/"/g, '&quot;'));
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
                if (team.answers) {
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
            if (isTeacher || event.target.disabled) return;
            const button = event.target;
            const questionKey = button.dataset.questionKey;
            const stageNum = parseInt(button.dataset.stageNum, 10);
            const qIndex = parseInt(button.dataset.qIndex, 10);
            const selectedAnswer = currentSelections[questionKey];
            if (!selectedAnswer || selectedAnswer.length === 0) {
                alert('请先选择一个答案，然后再确认。');
                return;
            }
            if (confirm(`确认提交问题 "${questionKey}" 的答案吗？一旦确认，将无法修改。`)) {
                // console.log(`[DRILL.JS] Student confirmed answer for ${questionKey}:`, selectedAnswer); // Commented out
                if (socket && currentStudentTeamId && currentLobbyId && dbCaseId) {
                    socket.emit('studentSubmitAnswer', {
                        lobbyId: currentLobbyId,
                        caseId: dbCaseId,
                        questionKey: questionKey,
                        answerData: selectedAnswer,
                        teamId: currentStudentTeamId,
                        stageNumber: stageNum,
                        questionIndex: qIndex
                    });
                }
                lockQuestionInputs(questionKey, button);
                const confirmationKey = `${currentLobbyId}_${dbCaseId}_${currentStudentTeamId}_${questionKey}`;
                confirmedQuestions[confirmationKey] = true;
            }
        }
    });

    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            if (!userInteracted) {
                userInteracted = true;
                // console.log('[SOUND DEBUG] nextStageBtn clicked, userInteracted being set to true.');
                if (currentDrillCaseId === '68332aee004ada38db5cfd38' && currentCaseData && currentCaseData.stages[currentStageIndex] && !isPaused) {
                    // console.log('[SOUND DEBUG] nextStageBtn attempting to call playCaseBSound for stage:', currentStageIndex + 1);
                     playCaseBSound(currentStageIndex + 1);
                }
            }
            if (isTeacher) {
                // console.log('[DRILL.JS] Teacher clicked Next Stage/Complete Drill.'); // Commented out
                if (currentStageIndex >= currentCaseData.stages.length - 1) {
                    if (confirm('所有阶段已完成！确认结束本次推演吗？教师将结束所有学生的推演。')) {
                        if (currentAmbientSound) { currentAmbientSound.pause(); currentAmbientSound = null; }
                        if (socket && currentLobbyId) {
                             socket.emit('teacherEndsDrill', { lobbyId: currentLobbyId });
                        }
                        localStorage.setItem('drillResults', JSON.stringify(teamsData));
                        localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim());
                        if (forceEndBtn && forceEndBtn.href) {
                            window.location.href = forceEndBtn.href;
                        } else {
                            window.location.href = `results.html?caseId=${currentDrillCaseId}`;
                        }
                    }
                } else {
                    if (socket && currentLobbyId && dbCaseId) {
                        socket.emit('teacherRequestsNextStage', {
                            lobbyId: currentLobbyId,
                            caseId: dbCaseId,
                            currentStageIndex: currentStageIndex,
                            teamsDataSnapshot: teamsData
                        });
                        setActiveStage(currentStageIndex + 1);
                    }
                }
            } else {
                alert('请等待教师进入下一阶段。');
            }
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', (event) => {
            if (confirm('确定要强制结束本次推演并查看结果吗？')) {
                if (currentAmbientSound) {
                    // console.log('[SOUND DEBUG] Force end: Stopping sound.');
                    currentAmbientSound.pause();
                    currentAmbientSound = null;
                }
                if (currentCaseData && teamsData) {
                    localStorage.setItem('userRoleForResults', 'teacher'); 
                    localStorage.setItem('drillResults', JSON.stringify(teamsData));
                    localStorage.setItem('currentCaseTitle', currentCaseData.title);
                    console.log('推演强制结束，团队分数已保存到localStorage:', teamsData);
                }
            } else {
                 event.preventDefault();
            }
        });
    }
    
    function proceedToNextStageOrEnd() {
        if (currentStageIndex >= currentCaseData.stages.length - 1) {
            if (confirm('所有阶段已完成！确认结束本次推演并查看结果吗？')) {
                if (currentAmbientSound) {
                    // console.log('[SOUND DEBUG] Natural drill end: Stopping sound.');
                    currentAmbientSound.pause();
                    currentAmbientSound = null;
                }
                if (currentCaseData && teamsData) {
                    localStorage.setItem('drillResults', JSON.stringify(teamsData));
                    localStorage.setItem('currentCaseTitle', currentCaseData.title.replace(/\\/g, '').trim());
                    console.log('推演完成，团队分数已保存到localStorage:', teamsData);
                }
                if (forceEndBtn && forceEndBtn.href) {
                    window.location.href = forceEndBtn.href;
                } else {
                    window.location.href = `results.html?caseId=${currentDrillCaseId}`;
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
            if (socket && currentLobbyId && isTeacher) {
                socket.emit('teacherPausesDrill', { lobbyId: currentLobbyId, isPaused: isPaused });
            }
            if (pauseBtn) {
                if (isPaused) {
                    // console.log('[SOUND DEBUG] Pause button: Pausing sound.', currentAmbientSound ? currentAmbientSound.src : 'No current sound');
                    if (currentAmbientSound) currentAmbientSound.pause();
                    pauseBtn.innerHTML = '<i class="fas fa-play mr-1 md:mr-2"></i>继续';
                    pauseBtn.classList.replace('bg-yellow-600', 'bg-green-600');
                    pauseBtn.classList.replace('hover:bg-yellow-700', 'hover:bg-green-700');
                    if(timerElement) timerElement.classList.add('animate-pulse');
                } else {
                    // console.log('[SOUND DEBUG] Pause button: Attempting to resume sound.', currentAmbientSound ? currentAmbientSound.src : 'No current sound');
                    if (currentAmbientSound && currentDrillCaseId === '68332aee004ada38db5cfd38' && userInteracted) {
                        currentAmbientSound.play().catch(error => console.error('[SOUND ERROR] Error resuming sound via pause button:', error)); // Adjusted prefix
                    } else if (currentDrillCaseId === '68332aee004ada38db5cfd38' && userInteracted && !currentAmbientSound) {
                        // console.log('[SOUND DEBUG] Pause button: No current sound, attempting to initialize for current stage.');
                        playCaseBSound(currentStageIndex + 1);
                    }
                    pauseBtn.innerHTML = '<i class="fas fa-pause mr-1 md:mr-2"></i>暂停';
                    pauseBtn.classList.replace('bg-green-600', 'bg-yellow-600');
                    pauseBtn.classList.replace('hover:bg-green-700', 'hover:bg-yellow-700');
                    if(timerElement) timerElement.classList.remove('animate-pulse');
                }
            }
        });
    }
});

[end of emergency-drill-backend/js/drill.js]
