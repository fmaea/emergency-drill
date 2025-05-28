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
    const leaderboardElement = document.getElementById('leaderboard'); // 【新增】获取排行榜元素
    const forceEndBtn = document.getElementById('force-end-btn');
    
    // --- 2. 状态变量初始化 ---
    let currentStageIndex = 0; 
    let currentCaseData = null;  
    let timerInterval;
    let isPaused = false;
    let socket = null; 
    window.drillMap = null; 

    // 【新增】计分和团队数据
    let teamsData = [ // 模拟团队数据，实际应从lobby或服务器获取
        { id: 'team1', name: '第一小组', score: 0, answers: {} },
        { id: 'team2', name: '第二小组', score: 0, answers: {} },
        { id: 'team3', name: '第三小组', score: 0, answers: {} }
    ];
    // 模拟当前操作的团队 (在单机教师端演示时，我们假设教师代表一个团队，或所有团队都做一样的选择)
    // 在真实的多人场景中，这个teamId会来自学生端提交的身份信息
    const currentOperatingTeamId = 'team1'; 

    // --- 3. 页面启动逻辑 ---
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('caseId');

    if (!caseId) {
        handleFatalError("错误：URL中未找到caseId，请从案例库进入。");
        return;
    }

    try {
        const response = await fetch(`http://localhost:7890/api/cases/${caseId}`);
        if (!response.ok) throw new Error(`获取案例数据失败，状态: ${response.status}`);
        currentCaseData = await response.json();
        console.log('成功获取案例数据:', JSON.parse(JSON.stringify(currentCaseData)));
        
        initializeDrillUI(currentCaseData);
        // initializeWebSocket(); 
        
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
        
        startTimer(caseData.estimatedTime ? caseData.estimatedTime * 60 : 180 * 60);
        updateLeaderboard(); // 【新增】初始化排行榜显示
        
        if (caseData.stages && caseData.stages.length > 0) {
            setActiveStage(0);
        } else {
            handleFatalError("案例数据不完整，缺少阶段信息。");
        }
    }

    function startTimer(durationInSeconds) {
        // ... (计时器逻辑不变) ...
        clearInterval(timerInterval);
        let timer = durationInSeconds;
        timerInterval = setInterval(() => {
            if (!isPaused) {
                if (timer < 0) {
                    clearInterval(timerInterval);
                    if (timerElement) timerElement.textContent = "时间到";
                    // 时间到，自动提交当前阶段答案并进入下一阶段 (可选逻辑)
                    // handleSubmitAndNextStage(); 
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
        // ... (setActiveStage 逻辑不变，确保调用 renderStageContent) ...
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
    }

    // --- 6. 核心：渲染每个阶段的动态内容 (修改：为选项添加事件监听) ---
    function renderStageContent(panelElement, stageData) {
        // ... (大部分渲染逻辑不变，主要修改问题渲染部分) ...
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

        // 【修改】图片加载逻辑保持不变，确保路径正确
        if (stageData.stageNumber === 1) {
            // ... (阶段1图片和事件描述渲染不变)
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

        // --- 【通用问题渲染逻辑 - 重点修改处】 ---
        if (stageData.questions && Array.isArray(stageData.questions)) {
            const targetQuestionContainer = (stageData.stageNumber === 2) ? panelElement.querySelector('.stage-questions-container') : questionsContainer;
            
            if (targetQuestionContainer) {
                 if (stageData.stageNumber !== 2) targetQuestionContainer.innerHTML = ''; // 非阶段二清空通用容器

                stageData.questions.forEach((question, qIndex) => {
                    const questionId = `s${stageData.stageNumber}-q${qIndex}`;
                    const questionWrapper = document.createElement('div');
                    questionWrapper.className = 'question-item mb-6 p-3 bg-gray-800/50 rounded-lg';
                    questionWrapper.innerHTML = `<p class="font-semibold text-gray-200 mb-2">${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}</p>`;
                    
                    const optionsDiv = document.createElement('div');
                    optionsDiv.className = 'space-y-2 question-options';

                    if (question.answerOptions) {
                        question.answerOptions.forEach((opt, optIndex) => {
                            const optionId = `${questionId}-opt${optIndex}`;
                            const inputType = question.questionType === 'MultipleChoice-Multi' ? 'checkbox' : 'radio';
                            const optionLabel = document.createElement('label');
                            optionLabel.className = 'block w-full text-left p-3 bg-gray-700 rounded-lg hover:bg-cyan-800 cursor-pointer transition-all';
                            optionLabel.setAttribute('for', optionId);

                            const inputElement = document.createElement('input');
                            inputElement.type = inputType;
                            inputElement.name = questionId; // 同一问题的单选按钮需要相同的name
                            inputElement.id = optionId;
                            inputElement.value = opt.text.replace(/"/g, '&quot;');
                            inputElement.className = 'mr-3 accent-cyan-500';
                            // 【新增】为选项添加点击事件，记录答案
                            inputElement.addEventListener('change', (event) => {
                                handleAnswerSelection(currentOperatingTeamId, stageData.stageNumber, qIndex, question.questionType, event.target);
                            });

                            optionLabel.appendChild(inputElement);
                            optionLabel.appendChild(document.createTextNode(` ${opt.text.replace(/\[cite: \d+\]/g, '').trim()}`));
                            optionsDiv.appendChild(optionLabel);
                        });
                    }
                    questionWrapper.appendChild(optionsDiv);

                    if (question.hint) { 
                        const hintP = document.createElement('p');
                        hintP.className = 'text-xs text-gray-500 mt-2';
                        hintP.textContent = `提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}`;
                        questionWrapper.appendChild(hintP);
                    }
                    
                    // 特殊处理阶段二的HTML结构
                    if (stageData.stageNumber === 2) {
                        if (qIndex === 0 && panelElement.querySelector('#s2-q1-title')) {
                            panelElement.querySelector('#s2-q1-title').textContent = `${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}`;
                            const s2q1Opt = panelElement.querySelector('#s2-q1-options');
                            if(s2q1Opt) { s2q1Opt.innerHTML = ''; s2q1Opt.appendChild(optionsDiv); }
                            if(question.hint && s2q1Opt) { /* Add hint similarly */ }
                        } else if (qIndex === 1 && panelElement.querySelector('#s2-q2-title')) {
                             panelElement.querySelector('#s2-q2-title').textContent = `${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}`;
                            const s2q2Opt = panelElement.querySelector('#s2-q2-options');
                            if(s2q2Opt) { s2q2Opt.innerHTML = ''; s2q2Opt.appendChild(optionsDiv); }
                            if(question.hint && s2q2Opt) { /* Add hint similarly */ }
                        } else if (targetQuestionContainer) { // 第三个及之后的问题追加到总容器
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
    
    // 【新增】处理答案选择的函数
    function handleAnswerSelection(teamId, stageNum, questionIndex, questionType, targetElement) {
        const team = teamsData.find(t => t.id === teamId);
        if (!team) return;

        const questionKey = `s${stageNum}-q${questionIndex}`;
        if (!team.answers[questionKey]) {
            team.answers[questionKey] = [];
        }

        if (questionType === 'MultipleChoice-Multi') {
            if (targetElement.checked) {
                if (!team.answers[questionKey].includes(targetElement.value)) {
                    team.answers[questionKey].push(targetElement.value);
                }
            } else {
                team.answers[questionKey] = team.answers[questionKey].filter(ans => ans !== targetElement.value);
            }
        } else { // Single choice or Binary
            team.answers[questionKey] = [targetElement.value];
        }
        console.log(`团队 ${team.name} 在 ${questionKey} 的答案更新为:`, team.answers[questionKey]);
    }

    // 【新增】计算并更新分数的函数
    function calculateScoresAndProceed() {
        const stageData = currentCaseData.stages[currentStageIndex];
        if (!stageData || !stageData.questions) return;

        teamsData.forEach(team => {
            let stageScore = 0;
            stageData.questions.forEach((question, qIndex) => {
                const questionKey = `s${stageData.stageNumber}-q${qIndex}`;
                const correctOptions = question.answerOptions.filter(opt => opt.isCorrect).map(opt => opt.text.replace(/"/g, '&quot;'));
                const teamAnswers = team.answers[questionKey] || [];

                let isCorrectForQuestion = false;
                if (question.questionType === 'MultipleChoice-Multi') {
                    // 多选题：所有正确选项都被选中，且没有选中任何错误选项
                    isCorrectForQuestion = teamAnswers.length === correctOptions.length && 
                                           correctOptions.every(co => teamAnswers.includes(co));
                } else { // 单选题或二元决策
                    isCorrectForQuestion = teamAnswers.length === 1 && correctOptions.includes(teamAnswers[0]);
                }

                if (isCorrectForQuestion) {
                    stageScore += (question.points || 0); // 如果问题没有points字段，则不加分
                }
            });
            team.score += stageScore; // 累加到总分
            console.log(`团队 ${team.name} 在阶段 ${stageData.stageNumber} 获得 ${stageScore} 分，总分: ${team.score}`);
            team.answers = {}; // 清空当前阶段的答案，为下一阶段做准备
        });

        updateLeaderboard();

        // 进入下一阶段或结束推演
        if (currentStageIndex >= currentCaseData.stages.length - 1) {
            if (confirm('所有阶段已完成！确认结束本次推演吗？')) {
                if (forceEndBtn && forceEndBtn.href) window.location.href = forceEndBtn.href;
            }
        } else {
            const nextStage = currentStageIndex + 1;
            setActiveStage(nextStage);
        }
    }
    
    // 【新增】更新排行榜显示的函数
    function updateLeaderboard() {
        if (!leaderboardElement) return;
        leaderboardElement.innerHTML = ''; // 清空旧的排行榜

        // 对团队按分数降序排序
        const sortedTeams = [...teamsData].sort((a, b) => b.score - a.score);

        sortedTeams.forEach((team, index) => {
            const li = document.createElement('li');
            li.className = 'leaderboard-item flex justify-between items-center p-2 rounded-md transition-all duration-300 ease-in-out';
            // 根据排名添加不同背景色
            if (index === 0) li.classList.add('bg-yellow-500/30', 'border', 'border-yellow-500');
            else if (index === 1) li.classList.add('bg-gray-500/30');
            else if (index === 2) li.classList.add('bg-orange-700/30');
            else li.classList.add('bg-gray-700/50');

            const rankSpan = document.createElement('span');
            rankSpan.className = 'w-6 text-center font-semibold';
            if (index < 3) {
                const icons = ['fa-trophy text-yellow-400', 'fa-medal text-gray-400', 'fa-award text-orange-400'];
                rankSpan.innerHTML = `<i class="fas ${icons[index]}"></i>`;
            } else {
                rankSpan.textContent = `${index + 1}.`;
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'flex-grow px-2 font-semibold';
            nameSpan.textContent = team.name;
            if (index === 0) nameSpan.classList.add('text-yellow-300');

            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'text-yellow-400 font-bold';
            scoreSpan.textContent = `${team.score}分`;

            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(scoreSpan);
            leaderboardElement.appendChild(li);
        });
    }


    // --- 7. 事件监听器 ---
    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            // 【修改】点击按钮时，先计算分数，再进入下一阶段
            calculateScoresAndProceed();
        });
    }

    if(pauseBtn) {
        // ... (暂停按钮逻辑不变) ...
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
