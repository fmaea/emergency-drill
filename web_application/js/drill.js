document.addEventListener('DOMContentLoaded', function () {
    const stageTitles = [
        "阶段一：污染态势初步判别",
        "阶段二：制定应急监测方案",
        "阶段三：跟踪监测",
        "阶段四：应急监测终止"
    ];

    const stagePanels = [
        document.getElementById('stage-1'),
        document.getElementById('stage-2'),
        document.getElementById('stage-3'),
        document.getElementById('stage-4'),
    ];

    const titleElement = document.getElementById('stage-title');
    const nextStageBtn = document.getElementById('next-stage-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const timerElement = document.getElementById('stage-timer');
    const leaderboardElement = document.getElementById('leaderboard');
    
    let currentStage = 0;
    let timerInterval;
    let isPaused = false;
    
    const teams = [
        { name: "第二小组 - 环保卫士", score: 2450, rank: 1 },
        { name: "第四小组 - 决策者", score: 2380, rank: 2 },
        { name: "第一小组 - 监测先锋", score: 2350, rank: 3 },
        { name: "第三小组 - 绿水青山", score: 2210, rank: 4 },
        { name: "第六小组 - 希望之星", score: 2100, rank: 5 },
        { name: "第五小组 - 超越梦想", score: 2050, rank: 6 },
    ];

    function updateLeaderboard() {
        // Sort teams by score
        teams.sort((a, b) => b.score - a.score);
        
        leaderboardElement.innerHTML = '';
        teams.forEach((team, index) => {
            const rank = index + 1;
            let rankIcon = '';
            let rankColor = 'text-gray-400';
            if (rank === 1) {
                rankIcon = '<i class="fas fa-crown text-yellow-400 mr-3"></i>';
                rankColor = 'text-yellow-300';
            } else if (rank === 2) {
                rankIcon = '<i class="fas fa-medal text-gray-300 mr-3"></i>';
                 rankColor = 'text-gray-300';
            } else if (rank === 3) {
                rankIcon = '<i class="fas fa-medal text-orange-400 mr-3"></i>';
                 rankColor = 'text-orange-400';
            } else {
                rankIcon = `<span class="font-bold text-gray-500 mr-3 w-6 text-center">${rank}</span>`;
            }

            const li = document.createElement('li');
            li.className = 'leaderboard-item bg-gray-700/50 p-3 rounded-lg flex items-center justify-between shadow-md';
            li.style.order = rank; // Use order for visual sorting animation
            li.innerHTML = `
                <div class="flex items-center">
                    ${rankIcon}
                    <span class="font-semibold text-white">${team.name}</span>
                </div>
                <span class="font-bold text-lg ${rankColor}">${team.score}</span>
            `;
            leaderboardElement.appendChild(li);
        });
    }

    function startTimer(duration) {
        let timeLeft = duration;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (!isPaused) {
                timeLeft--;
                if (timeLeft < 0) {
                    clearInterval(timerInterval);
                    timerElement.textContent = '00:00';
                    return;
                }
                const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
                const seconds = (timeLeft % 60).toString().padStart(2, '0');
                timerElement.textContent = `${minutes}:${seconds}`;
            }
        }, 1000);
    }
    
    function setActiveStage(stageIndex) {
        stagePanels.forEach((panel, index) => {
            panel.classList.toggle('stage-active', index === stageIndex);
        });
        titleElement.textContent = stageTitles[stageIndex];
        currentStage = stageIndex;

        // Simulate score changes at each stage
        if (currentStage > 0) {
            teams.forEach(team => {
                team.score += Math.floor(Math.random() * 500 + 200);
            });
            updateLeaderboard();
        }
        
        if(currentStage === stagePanels.length - 1) {
            nextStageBtn.innerHTML = '<i class="fas fa-flag-checkered mr-2"></i>完成推演，查看复盘';
            nextStageBtn.classList.remove('bg-cyan-600', 'hover:bg-cyan-700');
            nextStageBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        } else {
            nextStageBtn.innerHTML = '提交本阶段决策';
            nextStageBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            nextStageBtn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
        }
    }

    nextStageBtn.addEventListener('click', () => {
        if (currentStage < stagePanels.length - 1) {
            setActiveStage(currentStage + 1);
        } else {
            window.location.href = 'results.html';
        }
    });
    
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if(isPaused) {
            pauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>继续';
            pauseBtn.classList.remove('bg-yellow-600', 'hover:bg-yellow-700');
            pauseBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            timerElement.classList.add('opacity-50');
        } else {
            pauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>暂停';
            pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');
            timerElement.classList.remove('opacity-50');
        }
    });

    // Initial setup
    updateLeaderboard();
    setActiveStage(0);
    startTimer(10 * 60); // 10 minutes timer
});