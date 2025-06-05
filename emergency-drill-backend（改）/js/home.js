// 文件路径: js/home.js

// 等待整个HTML文档加载完毕后执行
document.addEventListener('DOMContentLoaded', () => {
  // 调用函数来获取并显示案例
  fetchAndDisplayCases();
});

/**
 * 从后端API获取案例数据并调用显示函数
 */
async function fetchAndDisplayCases() {
  const caseGrid = document.getElementById('case-grid'); // 获取用于放置案例卡片的容器
  
  try {
    // 调用我们后端的接口，注意替换为您的正确端口号
    const response = await fetch('http://localhost:7890/api/cases');

    // 检查HTTP响应是否成功
    if (!response.ok) {
      throw new Error(`获取数据失败，状态码: ${response.status}`);
    }

    // 将响应体解析为JSON格式（即案例数组）
    const cases = await response.json();

    // 调用函数将获取到的案例数据显示在页面上
    displayCases(cases);

  } catch (error) {
    console.error('获取案例列表时发生错误:', error);
    // 可以在页面上显示一个错误提示
    caseGrid.innerHTML = '<p class="text-red-400">加载案例失败，请检查服务器是否运行或刷新页面重试。</p>';
  }
}
/**
 * 将案例数据显示在页面上
 * @param {Array} cases - 从API获取的案例对象数组
 */
function displayCases(cases) {
  const caseGrid = document.getElementById('case-grid');

  // 首先清空容器中任何写死的案例
  caseGrid.innerHTML = '';

  // 如果没有案例，显示提示信息
  if (cases.length === 0) {
    caseGrid.innerHTML = '<p class="text-gray-400">目前没有已发布的案例。</p>';
    return;
  }

  // 遍历案例数组，为每个案例创建一个HTML卡片
  cases.forEach(caseItem => {
    // 注意：这里的 a 标签链接现在可以带上案例的ID，为下一步做准备
    // e.g., href="lobby.html?caseId=${caseItem._id}"
    const caseCardHTML = `
      <div class="bg-gray-800 rounded-xl overflow-hidden shadow-lg border border-gray-700 transform hover:-translate-y-2 transition-transform duration-300 group">
        <div class="relative h-56 bg-cover bg-center" style="background-image: url('${caseItem.backgroundImageUrl || 'assets/case-water-pollution.jpg'}');">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
            <span class="absolute top-4 left-4 bg-cyan-500 text-white text-xs font-bold px-3 py-1 rounded-full">${caseItem.caseType}</span>
            <h3 class="absolute bottom-4 left-4 text-xl font-bold text-white">${caseItem.title}</h3>
        </div>
        <div class="p-6">
            <p class="text-gray-400 text-sm mb-4 h-20 overflow-hidden">${caseItem.description}</p>
            <div class="flex justify-between items-center mt-6">
                <a href="lobby.html?caseId=${caseItem._id}" class="w-full text-center text-white bg-cyan-600 hover:bg-cyan-700 font-medium rounded-lg text-sm px-8 py-3 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-cyan-500/30">
                    <i class="fas fa-play mr-2"></i>开始推演
                </a>
            </div>
        </div>
      </div>
    `;
    // 将新创建的卡片HTML插入到容器中
    caseGrid.insertAdjacentHTML('beforeend', caseCardHTML);
  });
}