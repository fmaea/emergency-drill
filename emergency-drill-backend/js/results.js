// 文件路径: js/results.js

document.addEventListener('DOMContentLoaded', () => {
    const rankingsContainer = document.getElementById('final-rankings-grid');
    const caseTitleElement = document.getElementById('results-case-title');
    const returnToMainMenuBtn = document.getElementById('return-to-main-menu-btn');
    
    // New student buttons
    const studentActionsContainer = document.getElementById('student-results-actions');
    const saveResultsBtn = document.getElementById('save-results-btn');
    const exitStudyBtn = document.getElementById('exit-study-btn'); // This is an <a> tag but we might add JS behavior too
    const teacherLogoutBtn = document.getElementById('logout-btn-teacher');


    if (!rankingsContainer) {
        console.error('错误：未找到ID为 "final-rankings-grid" 的排名容器。');
    }
    if (!caseTitleElement) {
        console.error('错误：未找到ID为 "results-case-title" 的案例标题元素。');
    }
    if (!returnToMainMenuBtn) {
        console.error('错误：未找到ID为 "return-to-main-menu-btn" 的返回主菜单按钮。');
    }
    if (!studentActionsContainer || !saveResultsBtn || !exitStudyBtn) {
        console.error('错误：未找到学生操作按钮的容器或按钮本身。');
    }
    if (!teacherLogoutBtn) {
        console.error('错误: 未找到教师的退出登录按钮 (logout-btn-teacher)');
    }


    const userRole = localStorage.getItem('userRoleForResults');
    if (userRole) {
        localStorage.removeItem('userRoleForResults'); 
    }
    const isStudent = userRole === 'student';
    console.log(`[RESULTS.JS] User role determined as: ${userRole || 'unknown'}`);

    const caseTitle = localStorage.getItem('currentCaseTitle');
    if (caseTitleElement) {
        if (caseTitle) {
            caseTitleElement.textContent = `案例: ${caseTitle}`;
        } else {
            caseTitleElement.textContent = '案例名称未提供';
        }
    }

    const storedResultsData = localStorage.getItem('drillResults'); 
    if (!storedResultsData) {
        if (rankingsContainer) {
            rankingsContainer.innerHTML = '<p class="col-span-full text-center text-red-400">未能加载到推演结果数据。</p>';
        }
    } else {
        try {
            const teams = JSON.parse(storedResultsData);
            const actualTeams = teams.filter(team => team.id !== 'placeholder' && team.id !== 'no-teams' && team.id !== 'teacher_ops_team');
            const sortedTeams = actualTeams.sort((a, b) => (b.score || 0) - (a.score || 0));

            if (rankingsContainer) {
                if (sortedTeams.length === 0) {
                    rankingsContainer.innerHTML = '<p class="col-span-full text-center text-gray-400">没有队伍参与本次推演或无有效成绩。</p>';
                } else {
                    rankingsContainer.innerHTML = ''; 
                    sortedTeams.forEach((team, index) => {
                        const rank = index + 1;
                        let rankCardHTML = '';
                        // Existing ranking card HTML generation logic...
                        // (Copied from previous inspection - assuming it's correct)
                        if (rank === 1) {
                            rankCardHTML = `
                            <div class="border-2 border-yellow-400 rounded-lg p-4 bg-yellow-400/10 transform sm:scale-110 shadow-lg flex flex-col space-y-2">
                                <div>
                                    <i class="fas fa-crown text-4xl text-yellow-300"></i>
                                    <p class="text-lg font-bold mt-2">第一名</p>
                                    <p class="text-white text-xl font-semibold">${team.name || 'N/A'}</p>
                                    <p class="text-yellow-300 font-bold text-2xl">${team.score || 0}分</p>
                                </div>
                                <button class="get-ai-feedback-btn mt-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900" data-team-id="${team.id}" data-team-name="${encodeURIComponent(team.name || 'N/A')}" data-team-score="${team.score || 0}" data-team-students-count="${team.students ? team.students.length : 0}">
                                    <i class="fas fa-robot mr-1"></i> 获取AI点评
                                </button>
                                <div class="ai-feedback-placeholder mt-1 text-xs text-gray-400 italic" id="ai-feedback-${team.id}" style="display: none;">
                                    正在生成点评...
                                </div>
                                <div class="ai-feedback-content mt-1 text-sm text-gray-300" id="ai-feedback-content-${team.id}"></div>
                            </div>`;
                        } else if (rank === 2) {
                            // ... similar modification for rank 2 ...
                            rankCardHTML = `
                            <div class="border border-gray-500 rounded-lg p-4 bg-gray-700/50 transform sm:scale-105 shadow-md flex flex-col space-y-2">
                                <div>
                                    <i class="fas fa-medal text-3xl text-gray-300"></i>
                                    <p class="text-lg font-bold mt-2">第二名</p>
                                    <p class="text-white text-xl font-semibold">${team.name || 'N/A'}</p>
                                    <p class="text-gray-300 font-bold text-2xl">${team.score || 0}分</p>
                                </div>
                                <button class="get-ai-feedback-btn mt-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800" data-team-id="${team.id}" data-team-name="${encodeURIComponent(team.name || 'N/A')}" data-team-score="${team.score || 0}" data-team-students-count="${team.students ? team.students.length : 0}">
                                    <i class="fas fa-robot mr-1"></i> 获取AI点评
                                </button>
                                <div class="ai-feedback-placeholder mt-1 text-xs text-gray-400 italic" id="ai-feedback-${team.id}" style="display: none;">
                                    正在生成点评...
                                </div>
                                <div class="ai-feedback-content mt-1 text-sm text-gray-300" id="ai-feedback-content-${team.id}"></div>
                            </div>`;
                        } else if (rank === 3) {
                            // ... similar modification for rank 3 ...
                            rankCardHTML = `
                            <div class="border border-orange-400 rounded-lg p-4 bg-orange-400/10 transform sm:scale-100 shadow flex flex-col space-y-2">
                                <div>
                                    <i class="fas fa-medal text-3xl text-orange-400"></i>
                                    <p class="text-lg font-bold mt-2">第三名</p>
                                    <p class="text-white text-xl font-semibold">${team.name || 'N/A'}</p>
                                    <p class="text-orange-400 font-bold text-2xl">${team.score || 0}分</p>
                                </div>
                                <button class="get-ai-feedback-btn mt-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800" data-team-id="${team.id}" data-team-name="${encodeURIComponent(team.name || 'N/A')}" data-team-score="${team.score || 0}" data-team-students-count="${team.students ? team.students.length : 0}">
                                    <i class="fas fa-robot mr-1"></i> 获取AI点评
                                </button>
                                <div class="ai-feedback-placeholder mt-1 text-xs text-gray-400 italic" id="ai-feedback-${team.id}" style="display: none;">
                                    正在生成点评...
                                </div>
                                <div class="ai-feedback-content mt-1 text-sm text-gray-300" id="ai-feedback-content-${team.id}"></div>
                            </div>`;
                        } else { // Ranks > 3
                            rankCardHTML = `
                            <div class="border border-gray-700 rounded-lg p-4 bg-gray-800/80 flex flex-col space-y-2">
                                <div>
                                    <p class="text-lg text-gray-400">${rank}名</p>
                                    <p class="text-white text-xl">${team.name || 'N/A'}</p>
                                    <p class="font-semibold text-xl text-gray-400">${team.score || 0}分</p>
                                </div>
                                <button class="get-ai-feedback-btn mt-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800" data-team-id="${team.id}" data-team-name="${encodeURIComponent(team.name || 'N/A')}" data-team-score="${team.score || 0}" data-team-students-count="${team.students ? team.students.length : 0}">
                                    <i class="fas fa-robot mr-1"></i> 获取AI点评
                                </button>
                                <div class="ai-feedback-placeholder mt-1 text-xs text-gray-400 italic" id="ai-feedback-${team.id}" style="display: none;">
                                    正在生成点评...
                                </div>
                                <div class="ai-feedback-content mt-1 text-sm text-gray-300" id="ai-feedback-content-${team.id}"></div>
                            </div>`;
                        }
                        rankingsContainer.insertAdjacentHTML('beforeend', rankCardHTML);
                    });
                }
            }
        } catch (error) {
            console.error('解析队伍数据时出错:', error);
            if (rankingsContainer) {
                rankingsContainer.innerHTML = '<p class="col-span-full text-center text-red-400">加载结果失败，数据格式错误。</p>';
            }
        }
    }

    // Role-based button visibility
    if (isStudent) {
        if (returnToMainMenuBtn) returnToMainMenuBtn.style.display = 'none';
        if (teacherLogoutBtn) teacherLogoutBtn.style.display = 'none'; // Hide original logout for student
        if (studentActionsContainer) studentActionsContainer.classList.remove('hidden'); // Show student buttons

        if (saveResultsBtn) {
            saveResultsBtn.addEventListener('click', () => {
                window.print();
            });
        }
        // exitStudyBtn is an <a> tag, so its href="login.html" already works.
        // No specific JS needed for exitStudyBtn unless more complex behavior is desired.

    } else { // Teacher or unknown role
        if (returnToMainMenuBtn) returnToMainMenuBtn.style.display = ''; 
        if (teacherLogoutBtn) teacherLogoutBtn.style.display = '';
        if (studentActionsContainer) studentActionsContainer.classList.add('hidden'); // Hide student buttons
    }

    const resultsRankingsGrid = document.getElementById('final-rankings-grid'); // Assuming this is the grid
    const storedCaseTitle = localStorage.getItem('currentCaseTitle') || '案例详情未知'; // Fallback title

    if (resultsRankingsGrid) {
        resultsRankingsGrid.addEventListener('click', async function(event) {
            if (event.target.classList.contains('get-ai-feedback-btn')) {
                const button = event.target;
                const teamId = button.dataset.teamId;
                const teamName = decodeURIComponent(button.dataset.teamName);
                const teamScore = parseInt(button.dataset.teamScore, 10);
                const teamStudentsCount = parseInt(button.dataset.teamStudentsCount, 10);

                const feedbackPlaceholder = document.getElementById(`ai-feedback-${teamId}`);
                const feedbackContentDiv = document.getElementById(`ai-feedback-content-${teamId}`);

                if (!feedbackPlaceholder || !feedbackContentDiv) {
                    console.error(`[RESULTS.JS] Feedback placeholder or content div not found for team ${teamId}`);
                    return;
                }

                // Show loading, disable button
                feedbackPlaceholder.style.display = 'block';
                feedbackPlaceholder.textContent = '正在生成AI点评，请稍候...';
                feedbackContentDiv.innerHTML = ''; // Clear previous feedback
                button.disabled = true;
                button.classList.add('opacity-50', 'cursor-not-allowed');

                const teamDataPayload = {
                    name: teamName,
                    score: teamScore,
                    students: { length: teamStudentsCount } // Match expected structure in aiFeedbackService if it uses students.length
                };
                
                const caseContextPayload = {
                    title: storedCaseTitle,
                    // Future: Add more context like learningObjectives if available from localStorage or a new fetch
                    learningObjectives: localStorage.getItem('currentCaseLearningObjectives') ? JSON.parse(localStorage.getItem('currentCaseLearningObjectives')) : ["general emergency response"]
                };

                try {
                    const response = await fetch('/api/feedback/generate-team-comment', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // Add Authorization header if 'protect' middleware is used for this endpoint
                            // Assuming token is stored in localStorage from login
                            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                        },
                        body: JSON.stringify({
                            teamData: teamDataPayload,
                            caseContext: caseContextPayload
                        })
                    });

                    feedbackPlaceholder.style.display = 'none'; // Hide loading message

                    if (!response.ok) {
                        const errorResult = await response.json().catch(() => ({ message: response.statusText }));
                        throw new Error(`AI点评生成失败: ${errorResult.message || response.status}`);
                    }

                    const result = await response.json();
                    if (result.feedback) {
                        // Sanitize HTML before inserting if the feedback could contain it,
                        // but Gemini text responses are usually plain text.
                        // For plain text, textContent is safer. If HTML is intended, ensure sanitization.
                        feedbackContentDiv.textContent = result.feedback; 
                    } else {
                        feedbackContentDiv.textContent = '未能获取AI点评内容。';
                    }
                    // Optionally change button text, e.g., button.textContent = '查看点评';
                    // For now, leave it disabled after one generation per page load.
                    // To re-enable: button.disabled = false; button.classList.remove('opacity-50', 'cursor-not-allowed');

                } catch (error) {
                    console.error('[RESULTS.JS] Error fetching AI feedback:', error);
                    feedbackPlaceholder.style.display = 'none';
                    feedbackContentDiv.innerHTML = `<p class="text-red-400">获取AI点评失败: ${error.message}</p>`;
                    button.disabled = false; // Re-enable button on error
                    button.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        });
    } else {
        console.warn("[RESULTS.JS] Rankings grid container 'final-rankings-grid' not found. AI Feedback buttons will not function.");
    }
});
