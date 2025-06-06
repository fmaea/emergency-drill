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
                        if (rank === 1) {
                            rankCardHTML = `
                            <div class="border-2 border-yellow-400 rounded-lg p-4 bg-yellow-400/10 transform sm:scale-110 shadow-lg">
                                <i class="fas fa-crown text-4xl text-yellow-300"></i>
                                <p class="text-lg font-bold mt-2">第一名</p>
                                <p class="text-white text-xl font-semibold">${team.name || 'N/A'}</p>
                                <p class="text-yellow-300 font-bold text-2xl">${team.score || 0}分</p>
                            </div>`;
                        } else if (rank === 2) {
                            rankCardHTML = `
                            <div class="border border-gray-500 rounded-lg p-4 bg-gray-700/50 transform sm:scale-105 shadow-md">
                                <i class="fas fa-medal text-3xl text-gray-300"></i>
                                <p class="text-lg font-bold mt-2">第二名</p>
                                <p class="text-white text-xl font-semibold">${team.name || 'N/A'}</p>
                                <p class="text-gray-300 font-bold text-2xl">${team.score || 0}分</p>
                            </div>`;
                        } else if (rank === 3) {
                             rankCardHTML = `
                             <div class="border border-orange-400 rounded-lg p-4 bg-orange-400/10 transform sm:scale-100 shadow">
                                <i class="fas fa-medal text-3xl text-orange-400"></i>
                                <p class="text-lg font-bold mt-2">第三名</p>
                                <p class="text-white text-xl font-semibold">${team.name || 'N/A'}</p>
                                <p class="text-orange-400 font-bold text-2xl">${team.score || 0}分</p>
                            </div>`;
                        } else {
                             rankCardHTML = `
                             <div class="border border-gray-700 rounded-lg p-4 bg-gray-800/80">
                                <p class="text-lg text-gray-400">${rank}名</p>
                                <p class="text-white text-xl">${team.name || 'N/A'}</p>
                                <p class="font-semibold text-xl text-gray-400">${team.score || 0}分</p>
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
});
