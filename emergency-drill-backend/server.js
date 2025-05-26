// 文件路径: server.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

// --- 新增引入 ---
import { createServer } from 'http';
import { Server } from 'socket.io';

// 引入路由
import authRoutes from './routes/authRoutes.js';
import caseRoutes from './routes/caseRoutes.js';

// ... (dotenv.config(), connectDB() 保持不变) ...
connectDB();

const app = express();

// --- 新增：创建 HTTP 服务器并集成 socket.io ---
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // 允许所有来源的 WebSocket 连接，开发时使用
    methods: ["GET", "POST"]
  }
});

// ... (中间件配置 app.use(...) 保持不变) ...
app.use(cors({ origin: '*' }));
app.use(express.json());
// ...

// API 路由挂载 (保持不变)
app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);

// --- 新增：socket.io 连接逻辑 ---
io.on('connection', (socket) => {
  console.log(`一个新客户端已连接: ${socket.id}`);

  // 监听学生加入演练的事件
  socket.on('joinLobby', (data) => {
    console.log(`学生 ${data.studentName} 加入了案例 ${data.caseId} 的大厅`);

    socket.on('startDrill', (data) => {
      const { caseId, teacherId } = data; // 假设 teacherId 也会传来
      console.log(`[SERVER] 收到教师 ${teacherId || socket.id} 的 "startDrill" 请求，案例ID: ${caseId}`);
      
      if (caseId) {
        io.to(caseId).emit('drillStarted', { caseId: caseId });
        console.log(`[SERVER] 已向案例 ${caseId} 的房间广播 "drillStarted" 事件`);
      } else {
        console.warn('[SERVER] "startDrill" 请求中缺少 caseId');
      }
    });

    // --- 新增：监听教师请求进入下一阶段的事件 ---
  socket.on('requestNextStage', (data) => {
    const { caseId, currentStageIndex, teacherId } = data; // teacherId 可用于权限验证
    console.log(`教师 ${teacherId} 请求案例 ${caseId} 从阶段 ${currentStageIndex} 进入下一阶段`);

    // 简单的逻辑：直接计算下一阶段索引
    // 在实际应用中，您可能需要先验证教师权限、保存当前阶段答案等
    const nextStageIndex = parseInt(currentStageIndex, 10) + 1;

    // 假设我们知道案例总共有多少阶段 (例如从数据库查询或固定值)
    // 这里我们先不做严格的阶段上限检查，但实际应用中需要
    // if (nextStageIndex < TOTAL_STAGES_FOR_CASE) {

    // 向该案例的房间内所有客户端广播“进入新阶段”事件
    io.to(caseId).emit('advanceToStage', { 
      caseId: caseId, 
      nextStageIndex: nextStageIndex 
  });
  console.log(`已向案例 ${caseId} 的房间广播 advanceToStage 事件，目标阶段: ${nextStageIndex}`);
  
  // } else {
  //   console.log(`案例 ${caseId} 已是最后阶段或请求的阶段无效`);
  //   // 可以选择发送一个“演练结束”的事件
  //   io.to(caseId).emit('drillEnded', { caseId: caseId });
  // }
});
// --- 新增结束 ---

    // 让这个 socket 加入一个以此案例ID命名的“房间”
    socket.join(data.caseId);

    // 向该房间内的所有客户端（包括刚加入的）广播“新成员加入”事件
    // 这样教师端就能收到通知了
    io.to(data.caseId).emit('studentJoined', { 
        studentName: data.studentName, 
        teamName: data.teamName, // 假设学生加入时会提供队伍信息
        timestamp: new Date()
    });
  });

  // 监听断开连接事件
  socket.on('disconnect', () => {
    console.log(`客户端已断开: ${socket.id}`);
  });
});


const PORT = process.env.PORT || 7890;

// --- 修改：使用 httpServer 来监听端口，而不是 app ---
httpServer.listen(PORT, () => {
  console.log(`服务器已在端口 ${PORT} 上启动成功 (HTTP 和 WebSocket)`);
});