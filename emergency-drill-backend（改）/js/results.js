// 文件路径: js/results.js

document.addEventListener('DOMContentLoaded', () => {
    const rankingsContainer = document.getElementById('final-rankings-grid');
    if (!rankingsContainer) {
        console.error('错误：未找到ID为 "final-rankings-grid" 的排名容器。');
        return;
    }

    // 1. 从 localStorage 获取队伍数据
    const storedTeamsData = localStorage.getItem('drillTeams');

    if (!storedTeamsData) {
        rankingsContainer.innerHTML = '<p class="col-span-full text-center text-red-400">未能加载到推演结果数据。</p>';
        return;
    }

    try {
        const teams = JSON.parse(storedTeamsData);
        
        // 2. 过滤掉占位队伍并按分数降序排序
        const actualTeams = teams.filter(team => team.id !== 'placeholder' && team.id !== 'no-teams' && team.id !== 'teacher_ops_team');
        const sortedTeams = actualTeams.sort((a, b) => b.score - a.score);

        if (sortedTeams.length === 0) {
            rankingsContainer.innerHTML = '<p class="col-span-full text-center text-gray-400">没有队伍参与本次推演。</p>';
            return;
        }

        // 3. 清空静态的HTML内容
        rankingsContainer.innerHTML = '';

        // 4. 遍历排序后的队伍数据，生成HTML并插入页面
        sortedTeams.forEach((team, index) => {
            const rank = index + 1;
            let rankCardHTML = '';

            // 根据排名应用不同的样式
            if (rank === 1) {
                rankCardHTML = `
                <div class="border-2 border-yellow-400 rounded-lg p-4 bg-yellow-400/10 transform sm:scale-110 shadow-lg">
                    <i class="fas fa-crown text-4xl text-yellow-300"></i>
                    <p class="text-lg font-bold mt-2">第一名</p>
                    <p class="text-white text-xl font-semibold">${team.name}</p>
                    <p class="text-yellow-300 font-bold text-2xl">${team.score}分</p>
                </div>`;
            } else if (rank === 2) {
                rankCardHTML = `
                <div class="border border-gray-500 rounded-lg p-4 bg-gray-700/50 transform sm:scale-105 shadow-md">
                    <i class="fas fa-medal text-3xl text-gray-300"></i>
                    <p class="text-lg font-bold mt-2">第二名</p>
                    <p class="text-white text-xl font-semibold">${team.name}</p>
                    <p class="text-gray-300 font-bold text-2xl">${team.score}分</p>
                </div>`;
            } else if (rank === 3) {
                 rankCardHTML = `
                 <div class="border border-orange-400 rounded-lg p-4 bg-orange-400/10 transform sm:scale-100 shadow">
                    <i class="fas fa-medal text-3xl text-orange-400"></i>
                    <p class="text-lg font-bold mt-2">第三名</p>
                    <p class="text-white text-xl font-semibold">${team.name}</p>
                    <p class="text-orange-400 font-bold text-2xl">${team.score}分</p>
                </div>`;
            } else {
                 rankCardHTML = `
                 <div class="border border-gray-700 rounded-lg p-4 bg-gray-800/80">
                    <p class="text-lg text-gray-400">${rank}名</p>
                    <p class="text-white text-xl">${team.name}</p>
                    <p class="font-semibold text-xl text-gray-400">${team.score}分</p>
                </div>`;
            }
            
            rankingsContainer.insertAdjacentHTML('beforeend', rankCardHTML);
        });

    } catch (error) {
        console.error('解析队伍数据时出错:', error);
        rankingsContainer.innerHTML = '<p class="col-span-full text-center text-red-400">加载结果失败，数据格式错误。</p>';
    }
});