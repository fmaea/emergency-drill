// 文件路径: routes/lobbyRoutes.js

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
// import Case from '../models/Case.js'; // 按需导入

const router = express.Router();

// activeLobbies 应该在 server.js 中初始化: global.activeLobbies = {};

router.post('/create', async (req, res) => {
    const { caseId } = req.body;
    if (!caseId) {
        console.error('[LOBBY ROUTES] /create - 错误: 请求体中缺少 caseId');
        return res.status(400).json({ message: 'caseId is required' });
    }

    const lobbyId = uuidv4(); // 为这个教师的会话生成唯一的 lobbyId
    const serverIp = process.env.SERVER_IP || '127.0.0.1'; // 默认为localhost，确保server.js中会设置局域网IP
    const serverPort = process.env.PORT || 7890;

    if (serverIp === 'YOUR_SERVER_LAN_IP_ADDRESS' || serverIp === '127.0.0.1') {
        console.warn(`[LOBBY ROUTES] /create - 警告: 服务器IP地址为 ${serverIp}。如果学生从其他设备加入，请确保这是正确的局域网IP。`);
    }

    if (typeof global.activeLobbies === 'undefined') {
        console.warn('[LOBBY ROUTES] /create - global.activeLobbies 未定义，正在初始化。');
        global.activeLobbies = {};
    }

    let caseTitle = "案例加载中...";
    // 尝试获取案例标题 (可选，也可以由前端lobby.js自行获取)
    // try {
    //     const caseDoc = await Case.findById(caseId).select('title');
    //     if (caseDoc && caseDoc.title) {
    //         caseTitle = caseDoc.title.replace(/\[cite: \d+\]/g, '').trim();
    //     }
    // } catch (error) {
    //     console.error(`[LOBBY ROUTES] /create - 获取案例 ${caseId} 标题时出错:`, error);
    // }

    global.activeLobbies[lobbyId] = {
        lobbyId: lobbyId, // 存储 lobbyId 自身，方便查找
        caseId: caseId,
        caseTitle: caseTitle,
        teams: [],
        teacherSocketId: null, // 教师连接 WebSocket 后会更新此字段
        createdAt: new Date()
    };

    // 【修改】生成的 joinUrl 只包含 caseId，供学生扫描
    const studentJoinUrl = `http://${serverIp}:${serverPort}/join.html?caseId=${caseId}`;
    
    console.log(`[LOBBY ROUTES] /create - 大厅已创建: Lobby ID: ${lobbyId}, 案例ID: ${caseId}, 学生加入URL (二维码用): ${studentJoinUrl}`);
    // 返回 lobbyId 供教师端 WebSocket 使用，返回 studentJoinUrl 供二维码生成
    res.status(200).json({ lobbyId, joinUrl: studentJoinUrl, caseId, caseTitle });
});

router.get('/:lobbyId/info', async (req, res) => {
    const { lobbyId } = req.params;
    console.log(`[LOBBY ROUTES] /:lobbyId/info - 请求大厅信息: ${lobbyId}`);
    const lobby = global.activeLobbies ? global.activeLobbies[lobbyId] : null;

    if (lobby) {
        let titleToReturn = lobby.caseTitle;
        // (如果需要，这里可以再次尝试从数据库获取最新标题)
        res.json({ caseId: lobby.caseId, caseTitle: titleToReturn, lobbyId: lobbyId });
    } else {
        console.warn(`[LOBBY ROUTES] /info - 未找到大厅: ${lobbyId}`);
        res.status(404).json({ message: 'Lobby not found' });
    }
});

export default router;
