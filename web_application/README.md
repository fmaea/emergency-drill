# EEM - 环境应急监测课程教学软件

本项目是根据提供的设计原型和需求文档开发的 "环应急战" 教学平台前端实现。

## 技术栈

* **HTML5**
* **CSS3** (使用 **Tailwind CSS v3** 框架)
* **JavaScript (ES6)**
* **FontAwesome 6** (用于图标)
* **Google Fonts** (字体 `Noto Sans SC`)

## 本地开发环境设置

### 1. 准备文件
将以下文件保存在同一个项目文件夹（例如 `web_application/`）内：
* `index.html` (原型展示入口)
* `login.html` (登录页)
* `home.html` (案例库主页)
* `lobby.html` (推演大厅页)
* `drill_main.html` (推演主界面)
* `results.html` (复盘页)
* `js/drill.js` (推演页面的交互逻辑)

### 2. 依赖说明
本项目使用了以下通过 CDN 加载的外部库，无需本地安装：
* **Tailwind CSS**: 用于快速构建符合设计规范的 UI。
* **FontAwesome**: 提供所有界面图标。
* **Google Fonts**: 提供 "Noto Sans SC" 字体。

### 3. 运行项目
直接使用现代浏览器 (如 Chrome, Firefox, Edge) 打开根目录下的 `index.html` 文件即可查看和使用。

**本地访问地址**: `file:///path/to/your/project/folder/web_application/index.html`

## 项目结构