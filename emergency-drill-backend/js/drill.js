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
    // const leaderboardElement = document.getElementById('leaderboard'); // HTML中已移除或未明确使用
    const forceEndBtn = document.getElementById('force-end-btn');
    
    // --- 2. 状态变量初始化 ---
    let currentStageIndex = 0; 
    let currentCaseData = null;  
    let timerInterval;
    let isPaused = false;
    let socket = null; // WebSocket 实例
    window.drillMap = null; // 高德地图实例 (如果阶段二需要，则在此初始化)

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
        console.log('成功获取案例数据:', JSON.parse(JSON.stringify(currentCaseData))); // 使用深拷贝打印，避免后续修改影响日志
        
        initializeDrillUI(currentCaseData);
        // initializeWebSocket(); // WebSocket相关功能暂时注释，专注于基础显示
        
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
            if (stageData.stageNumber !== 2) { // 阶段二的问题容器是特定的
                console.warn(`[阶段${stageData.stageNumber}] 未找到 .stage-questions-container 元素。`);
            }
        }

        const imageUrl = stageData.stageBackgroundImageUrl || stageData.overlayImageUrl; 

        if (stageData.stageNumber === 1) {
            const eventTitle = panelElement.querySelector('.stage-event-title');
            if (eventTitle && currentCaseData) eventTitle.textContent = `事件：${currentCaseData.title.replace(/\[cite: \d+\]/g, '').trim()}`;
            const eventDesc = panelElement.querySelector('.stage-event-description');
            if (eventDesc && currentCaseData) eventDesc.textContent = currentCaseData.description.replace(/\[cite: \d+\]/g, '').trim();

            const backgroundHostStage1 = panelElement.querySelector('.stage-background-host');
            if (backgroundHostStage1) {
                backgroundHostStage1.style.backgroundImage = imageUrl ? `url('${imageUrl}')` : 'none';
            }
            if (questionsContainer && stageData.questions) {
                stageData.questions.forEach((question, qIndex) => {
                    const qDiv = document.createElement('div');
                    qDiv.className = 'question-item mb-4';
                    let optionsHTML = '<div class="space-y-2 mt-2">';
                    if (question.answerOptions) {
                        question.answerOptions.forEach(opt => {
                            optionsHTML += `<label class="block w-full text-left p-3 bg-gray-700 rounded-lg hover:bg-cyan-800 cursor-pointer"><input type="radio" name="stage${stageData.stageNumber}-q${qIndex}" class="mr-3 accent-cyan-500" value="${opt.text.replace(/"/g, '&quot;')}"> ${opt.text.replace(/\[cite: \d+\]/g, '').trim()}</label>`;
                        });
                    }
                    optionsHTML += '</div>';
                    qDiv.innerHTML = `<p class="font-semibold text-gray-300">${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}</p>${question.hint ? `<p class="text-sm text-gray-500 mt-1">提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}</p>` : ''}${optionsHTML}`;
                    questionsContainer.appendChild(qDiv);
                });
            }
        }
        else if (stageData.stageNumber === 2) {
            const imageElementStage2 = panelElement.querySelector('#stage2-image-display');
            if (imageElementStage2) {
                imageElementStage2.src = imageUrl || '';
                imageElementStage2.alt = imageUrl ? (stageData.description || stageData.title || "阶段示意图").replace(/\[cite: \d+\]/g, '').trim() : '（此阶段无指定图片）';
            }
            
            const q1TitleEl = panelElement.querySelector('#s2-q1-title');
            const q1OptionsEl = panelElement.querySelector('#s2-q1-options');
            const q2TitleEl = panelElement.querySelector('#s2-q2-title');
            const q2OptionsEl = panelElement.querySelector('#s2-q2-options');
            const stage2QuestionsContainer = panelElement.querySelector('.stage-questions-container');

            if(q1TitleEl) q1TitleEl.textContent = ''; if(q1OptionsEl) q1OptionsEl.innerHTML = '';
            if(q2TitleEl) q2TitleEl.textContent = ''; if(q2OptionsEl) q2OptionsEl.innerHTML = '';
            
            if (stageData.questions && Array.isArray(stageData.questions) && stage2QuestionsContainer) {
                let questionRenderedCount = 0;
                stageData.questions.forEach((question, index) => {
                    let currentTitleEl, currentOptionsEl, targetContainerForHint;
                    
                    if (questionRenderedCount === 0) {
                        currentTitleEl = q1TitleEl; currentOptionsEl = q1OptionsEl;
                        targetContainerForHint = q1OptionsEl; 
                    } else if (questionRenderedCount === 1) {
                        currentTitleEl = q2TitleEl; currentOptionsEl = q2OptionsEl;
                        targetContainerForHint = q2OptionsEl;
                    } else { 
                        const qDiv = document.createElement('div');
                        qDiv.className = 'mt-6 dynamic-question-block'; 
                        currentTitleEl = document.createElement('h3');
                        currentTitleEl.className = 'font-bold mb-2 text-gray-300 text-sm md:text-base';
                        currentOptionsEl = document.createElement('div');
                        currentOptionsEl.className = 'space-y-2 question-options';
                        qDiv.appendChild(currentTitleEl);
                        qDiv.appendChild(currentOptionsEl);
                        stage2QuestionsContainer.appendChild(qDiv); 
                        targetContainerForHint = currentOptionsEl;
                    }

                    if (currentTitleEl && currentOptionsEl) {
                        questionRenderedCount++;
                        currentTitleEl.textContent = `${questionRenderedCount}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}`;
                        currentOptionsEl.innerHTML = ''; 
                        if (question.answerOptions) {
                            question.answerOptions.forEach(opt => {
                                const inputType = question.questionType === 'MultipleChoice-Multi' ? 'checkbox' : 'radio';
                                const optionName = `stage2-q${questionRenderedCount}`;
                                currentOptionsEl.innerHTML += `<label class="block p-2 bg-gray-700 rounded-md hover:bg-cyan-800 cursor-pointer"><input type="${inputType}" name="${optionName}" value="${opt.text.replace(/"/g, '&quot;')}" class="mr-2 accent-cyan-500 align-middle"> ${opt.text.replace(/\[cite: \d+\]/g, '').trim()}</label>`;
                            });
                        }
                        if (question.hint && targetContainerForHint && targetContainerForHint.parentElement) {
                            const oldHint = targetContainerForHint.parentElement.querySelector(`.question-hint-s2-${questionRenderedCount}`);
                            if(oldHint) oldHint.remove();
                            
                            const hintP = document.createElement('p');
                            hintP.className = `text-sm text-gray-500 mt-1 question-hint-s2-${questionRenderedCount}`;
                            hintP.textContent = `提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}`;
                            targetContainerForHint.insertAdjacentElement('afterend', hintP);
                        }
                    }
                });
                if(questionRenderedCount < 1 && q1TitleEl) q1TitleEl.textContent = '1. (无问题数据)';
                if(questionRenderedCount < 2 && q2TitleEl) q2TitleEl.textContent = '2. (无问题数据)';
            } else {
                if (q1TitleEl) q1TitleEl.textContent = '1. (无问题数据)';
                if (q2TitleEl) q2TitleEl.textContent = '2. (无问题数据)';
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

            if (questionsContainer && stageData.questions && Array.isArray(stageData.questions)) {
                stageData.questions.forEach((question, qIndex) => {
                    const questionWrapper = document.createElement('div');
                    questionWrapper.className = 'mb-6';
                    questionWrapper.innerHTML = `<p class="text-lg text-gray-300 mb-2">${qIndex + 1}. ${question.questionText.replace(/\[cite: \d+\]/g, '').trim()}</p>`;
                    if (question.answerOptions) {
                        if (question.questionType === 'MultipleChoice-Single') {
                            const optionsDiv = document.createElement('div');
                            optionsDiv.className = 'text-sm text-gray-400 flex justify-center items-center space-x-2 md:space-x-4 flex-wrap question-options';
                            question.answerOptions.forEach((opt, index) => {
                                optionsDiv.innerHTML += `<label class="mx-1 md:mx-2 cursor-pointer hover:text-cyan-400 py-1"><input type="radio" name="stage${stageData.stageNumber}-q${qIndex}" value="${opt.text.replace(/"/g, '&quot;')}" class="mr-1 accent-cyan-500"> ${String.fromCharCode(65 + index)}. ${opt.text.replace(/\[cite: \d+\]/g, '').trim()}</label>`;
                            });
                            questionWrapper.appendChild(optionsDiv);
                        } else if (question.questionType === 'Binary-Decision') {
                            const buttonDiv = document.createElement('div');
                            buttonDiv.className = 'flex justify-center space-x-4 mt-4';
                            question.answerOptions.forEach((opt, index) => {
                                buttonDiv.innerHTML += `<button class="px-8 md:px-12 py-3 md:py-4 text-md md:text-lg font-bold text-white rounded-lg shadow-lg transform hover:scale-105 transition-all ${index === 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}"><i class="fas ${index === 0 ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>${opt.text.replace(/\[cite: \d+\]/g, '').trim()}</button>`;
                            });
                            questionWrapper.appendChild(buttonDiv);
                        }
                    }
                    if (question.hint) { 
                        const hintP = document.createElement('p');
                        hintP.className = 'text-xs text-gray-500 mt-2';
                        hintP.textContent = `提示: ${question.hint.replace(/\[cite: \d+\]/g, '').trim()}`;
                        questionWrapper.appendChild(hintP);
                    }
                    questionsContainer.appendChild(questionWrapper);
                });
            } else {
                console.log(`[阶段${stageData.stageNumber}] 无问题数据 (questions 数组不存在或为空)。`);
            }
        }
    }

    // --- 7. 事件监听器 ---
    if (nextStageBtn) {
        nextStageBtn.addEventListener('click', () => {
            if (!currentCaseData || !currentCaseData.stages) {
                console.error("案例数据未加载，无法进入下一阶段。");
                return; 
            }
            if (currentStageIndex >= currentCaseData.stages.length - 1) {
                if (confirm('确认完成本次推演吗？')) {
                    if (forceEndBtn && forceEndBtn.href) window.location.href = forceEndBtn.href;
                }
                return;
            }
            const nextStage = currentStageIndex + 1;
            setActiveStage(nextStage);
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
