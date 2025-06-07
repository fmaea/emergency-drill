// 文件路径: js/results.js

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DRILL.JS ALIVE] DOMContentLoaded. Version: StudentSoundCheck2'); // Note: File is results.js, log prefix might be misleading but following instruction.

    const rankingsContainer = document.getElementById('final-rankings-grid');
    const caseTitleElement = document.getElementById('results-case-title');
    const returnToMainMenuBtn = document.getElementById('return-to-main-menu-btn');
    
    // New student buttons
    const studentActionsContainer = document.getElementById('student-results-actions');
    const saveResultsBtn = document.getElementById('save-results-btn');
    const exitStudyBtn = document.getElementById('exit-study-btn'); 
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
            
            console.log('[DEBUG RESULTS.JS] About to call renderRadarChart. Current document.readyState:', document.readyState);
            const chartSection = document.querySelector('section > div.grid > div.lg\\:col-span-2.bg-gray-800'); 
            if (chartSection) {
                console.log('[DEBUG RESULTS.JS] Chart section HTML snippet (first 500 chars):', chartSection.innerHTML.substring(0, 500));
            } else {
                console.log('[DEBUG RESULTS.JS] Chart section outer container NOT found with selector for snippet.');
            }
            renderRadarChart(sortedTeams); 

        } catch (error) {
            console.error('解析队伍数据或渲染图表时出错:', error);
            if (rankingsContainer) {
                rankingsContainer.innerHTML = '<p class="col-span-full text-center text-red-400">加载结果失败，数据格式错误。</p>';
            }
            const canvasElement = document.getElementById('radarChartCanvas');
            if (canvasElement && canvasElement.getContext) {
                const ctx = canvasElement.getContext('2d');
                ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '16px Noto Sans SC';
                ctx.textAlign = 'center';
                ctx.fillText('无法加载雷达图数据', canvasElement.width / 2, canvasElement.height / 2);
            }
        }
    }

    // Role-based button visibility
    if (isStudent) {
        if (returnToMainMenuBtn) returnToMainMenuBtn.style.display = 'none';
        if (teacherLogoutBtn) teacherLogoutBtn.style.display = 'none'; 
        if (studentActionsContainer) studentActionsContainer.classList.remove('hidden'); 

        if (saveResultsBtn) {
            saveResultsBtn.addEventListener('click', () => {
                window.print();
            });
        }
    } else { 
        if (returnToMainMenuBtn) returnToMainMenuBtn.style.display = ''; 
        if (teacherLogoutBtn) teacherLogoutBtn.style.display = '';
        if (studentActionsContainer) studentActionsContainer.classList.add('hidden'); 
    }
});

function renderRadarChart(teamsData) {
    console.log('[DEBUG RESULTS.JS] renderRadarChart called. teamsData length:', teamsData ? teamsData.length : 'undefined/null');
    console.log('[DEBUG RESULTS.JS] renderRadarChart: Document readystate at this point:', document.readyState);

    console.log('[DEBUG RESULTS.JS] renderRadarChart: Attempting to getElementById("radarChartCanvas").');
    const canvasElement = document.getElementById('radarChartCanvas');
    console.log('[DEBUG RESULTS.JS] renderRadarChart: getElementById("radarChartCanvas") returned:', canvasElement);

    if (!canvasElement) {
        console.error('[Chart.js] Radar chart canvas element not found!');
        return;
    }
    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
        console.error('[Chart.js] Failed to get canvas context for radar chart.');
        return;
    }

    const radarLabels = ['阶段一', '阶段二', '阶段三', '阶段四']; 
    const defaultColors = [
        'rgba(54, 162, 235, 0.6)', // Blue
        'rgba(75, 192, 192, 0.6)', // Green
        'rgba(255, 159, 64, 0.6)', // Orange
        'rgba(255, 99, 132, 0.6)', // Red
        'rgba(153, 102, 255, 0.6)', // Purple
        'rgba(255, 206, 86, 0.6)'  // Yellow
    ];
    const borderColors = [
        'rgba(54, 162, 235, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(255, 159, 64, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(153, 102, 255, 1)',
        'rgba(255, 206, 86, 1)'
    ];

    const teamsToDisplay = teamsData.slice(0, 5); 

    const datasets = teamsToDisplay.map((team, index) => {
        if (!team.stageScores || !Array.isArray(team.stageScores) || team.stageScores.length !== radarLabels.length) {
            console.warn(`[Chart.js] Team "${team.name || `队伍 ${index + 1}`}" does not have valid 'stageScores' array (length ${radarLabels.length} expected). Skipping this team for radar chart.`);
            return null; // Skip this team
        }

        // Ensure all scores are numbers, default to 0 if not
        const sanitizedStageScores = team.stageScores.map(score => typeof score === 'number' ? score : 0);

        return {
            label: team.name || `队伍 ${index + 1}`,
            data: sanitizedStageScores, // USE team.stageScores HERE
            backgroundColor: team.color || defaultColors[index % defaultColors.length],
            borderColor: team.borderColor || borderColors[index % borderColors.length],
            borderWidth: 1, // Adjusted from 2 for a possibly cleaner look, can revert if too thin
            pointBackgroundColor: team.borderColor || borderColors[index % borderColors.length],
            pointBorderColor: '#fff', // Keep point borders white for contrast
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: team.borderColor || borderColors[index % borderColors.length],
            pointRadius: 3, 
            pointHoverRadius: 5
        };
    }).filter(ds => ds !== null); // Remove any null datasets

    if (datasets.length === 0) {
        console.warn("[Chart.js] No valid team data to display on radar chart.");
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '16px Noto Sans SC';
        ctx.textAlign = 'center';
        ctx.fillText('无有效数据用于雷达图', canvasElement.width / 2, canvasElement.height / 2);
        return;
    }

    const radarChartConfig = {
        type: 'radar',
        data: {
            labels: radarLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: { 
                    suggestedMin: 0,
                    suggestedMax: 30, // Changed to 30
                    grid: {
                        color: 'rgba(255, 255, 255, 0.15)' 
                    },
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.15)'
                    },
                    pointLabels: {
                        color: 'rgba(255, 255, 255, 0.85)',
                        font: {
                            size: 11, // Restored to 11
                            family: "'Noto Sans SC', sans-serif"
                        }
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        backdropColor: 'rgba(0,0,0,0.6)', 
                        stepSize: 5, // Changed to 5
                        font: {
                             size: 10 // Restored to 10
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom', 
                    labels: {
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 11, 
                            family: "'Noto Sans SC', sans-serif"
                        },
                        padding: 15, 
                        usePointStyle: true,
                        boxWidth: 8 
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { size: 14, family: "'Noto Sans SC', sans-serif" },
                    bodyFont: { size: 12, family: "'Noto Sans SC', sans-serif" },
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.r !== null) {
                                label += context.parsed.r.toFixed(0) + '分'; 
                            }
                            return label;
                        }
                    }
                }
            },
            elements: {
                line: {
                    tension: 0.1 
                }
            }
        }
    };

    let existingChart = Chart.getChart(canvasElement);
    if (existingChart) {
        existingChart.destroy();
    }
    new Chart(ctx, radarChartConfig);
    console.log('[Chart.js] Radar chart rendered/updated.');
}
