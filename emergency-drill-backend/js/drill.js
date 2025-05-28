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
    let socket = null; // WebSocket 实例 (当前版本未启用)
    window.drillMap = null; // 高德地图实例 (如果案例需要)

    let teamsData = []; // 存储队伍信息，将从localStorage加载
    // 【修改】假设教师端操作的是第一个实际队伍的视角进行答题和计分模拟
    let currentOperatingTeamId = null; 

    // --- 3. 页面启动逻辑 ---
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');

    if (!caseId) {
        handleFatalError("错误：URL中未找到caseId，请从案例库进入。");
        return;
    }

    try {
        // 从localStorage加载队伍信息
        const storedTeams = localStorage.getItem('drillTeams');
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


        const response = await fetch(`http://localhost:7890/api/cases/${caseId}`);
        if (!response.ok) throw new Error(`获取案例数据失败，状态: ${response.status}`);
        currentCaseData = await response.json();
        console.log('成功获取案例数据:', JSON.parse(JSON.stringify(currentCaseData)));
        
        initializeDrillUI(currentCaseData);
        // initializeWebSocket(); // WebSocket相关功能，待后续集成
        
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
        const team = teamsData.find(t => t.id === teamId);
        if (!team) {
            console.warn(`未找到团队ID: ${teamId}，无法记录答案。`);
            return;
        }

        const questionKey = `s${stageNum}-q${questionIndex}`;
        let selectedValue = targetElement.value;
        if (targetElement.tagName === 'BUTTON' && targetElement.dataset.value) {
            selectedValue = targetElement.dataset.value;
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
            // 首先调用计分和流程推进函数
            calculateScoresAndProceed(); 
            // calculateScoresAndProceed 函数内部的 proceedToNextStageOrEnd 会处理跳转        // 我们需要在 proceedToNextStageOrEnd 决定跳转到 results.html 前保存分数
        });
    }

    if (forceEndBtn) {
        forceEndBtn.addEventListener('click', (event) => {
            // event.preventDefault(); // 如果 forceEndBtn 是 <a> 标签，阻止其默认跳转
            if (confirm('确定要强制结束本次推演并查看结果吗？')) {
                // 【新增】在强制结束时保存团队分数
                if (currentCaseData && teamsData) {
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
