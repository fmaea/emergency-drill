// 文件路径: server.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import caseRoutes from './routes/caseRoutes.js';
import lobbyRoutes from './routes/lobbyRoutes.js';
// 导入 Case 模型，用于后端计分时获取案例数据
import Case from './models/Case.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
connectDB();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

global.activeLobbies = {}; // { lobbyId: { caseId, caseTitle, teams, teacherSocketId, createdAt } }

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use(express.static(path.join(process.cwd())));
app.use('/js', express.static(path.join(process.cwd(), 'js')));
app.use('/assets', express.static(path.join(process.cwd(), 'assets')));
app.use('/js/lib', express.static(path.join(process.cwd(), 'js', 'lib'))); // 确保 qrcode.min.js 能被访问

app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/lobbies', lobbyRoutes);

app.use((err, req, res, next) => {
    console.error("全局错误处理器捕获到错误:", err.stack);
    res.status(err.status || 500).json({
        message: err.message || '服务器发生未知错误。',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

io.on('connection', (socket) => {
  console.log(`一个新客户端已连接: ${socket.id}`);

  // 客户端加入推演房间 (lobbyId 对应的房间)
  socket.on('joinDrillRoom', (lobbyId) => {
    if (global.activeLobbies[lobbyId]) {
      socket.join(lobbyId);
      console.log(`[SERVER] Socket ${socket.id} 已加入推演房间 ${lobbyId}`);
    } else {
      console.warn(`[SERVER] Socket ${socket.id} 尝试加入不存在的推演房间 ${lobbyId}`);
    }
  });

  socket.on('teacherJoinsLobby', (lobbyId) => {
    if (global.activeLobbies && global.activeLobbies[lobbyId]) {
      socket.join(lobbyId); // 教师加入以 lobbyId 命名的房间
      global.activeLobbies[lobbyId].teacherSocketId = socket.id;
      console.log(`教师 ${socket.id} 已加入大厅 ${lobbyId} (房间名)`);
      // 教师加入时，立即发送当前大厅的队伍数据
      socket.emit('teamsUpdated', global.activeLobbies[lobbyId].teams);
    } else {
      socket.emit('lobbyError', { message: `大厅 ${lobbyId} 未找到或未初始化。` });
      console.warn(`[SERVER] 教师 ${socket.id} 尝试加入不存在或未初始化的大厅: ${lobbyId}`);
    }
  });

  // 学生加入大厅的逻辑
  socket.on('joinLobby', (data) => {
    const { caseId, teamName, studentName } = data; 
    console.log(`[SERVER] 收到加入请求: 案例ID ${caseId}, 队伍 ${teamName}, 学生 ${studentName}`);

    if (!caseId || !teamName || !studentName) {
        socket.emit('joinFailed', { message: '加入信息不完整 (案例ID, 队伍名, 学生名都需要)。' });
        console.warn('[SERVER] joinLobby 请求信息不完整:', data);
        return;
    }

    // 查找与 caseId 匹配的、有教师在的、最新的大厅
    let targetLobby = null;
    let latestTime = 0;

    for (const id in global.activeLobbies) {
        const lobby = global.activeLobbies[id];
        // 确保大厅与caseId匹配，并且有教师在线 (teacherSocketId 不为 null)
        if (lobby.caseId === caseId && lobby.teacherSocketId) {
            if (lobby.createdAt.getTime() > latestTime) {
                latestTime = lobby.createdAt.getTime();
                targetLobby = lobby;
            }
        }
    }
    
    if (targetLobby) {
      const lobbyIdForStudent = targetLobby.lobbyId; 
      let team = targetLobby.teams.find(t => t.name === teamName);
      if (!team) {
        team = { 
          id: uuidv4(), // 为新队伍生成唯一ID
          name: teamName, 
          students: [studentName],
          score: 0,
          answers: {} // 初始化答案对象
        };
        targetLobby.teams.push(team);
      } else {
        // 如果队伍已存在，检查学生是否已在其中，如果不在则添加
        if (!team.students.includes(studentName)) {
          team.students.push(studentName);
        }
      }
      
      // 学生也需要加入这个 lobbyId 的房间，以便接收后续可能的全局消息
      socket.join(lobbyIdForStudent); 
      console.log(`[SERVER] 学生 ${studentName} (${socket.id}) 已加入大厅 ${lobbyIdForStudent} 的房间。`);

      // 向该大厅的教师广播队伍更新 (房间名为 lobbyIdForStudent)
      io.to(lobbyIdForStudent).emit('teamsUpdated', targetLobby.teams); 
      console.log(`[SERVER] 大厅 ${lobbyIdForStudent} 队伍已更新:`, JSON.stringify(targetLobby.teams, null, 2));
      socket.emit('joinSuccess', { message: '成功加入推演大厅!', teamId: team.id, lobbyId: lobbyIdForStudent });
    } else {
      const errorMessage = `加入失败：未找到与案例ID "${caseId}" 匹配的活动大厅，或教师尚未开启大厅。`;
      console.warn(`[SERVER] ${errorMessage} 当前活动大厅:`, global.activeLobbies);
      socket.emit('joinFailed', { message: errorMessage });
    }
  });

  // 教师开始推演的事件
  socket.on('teacherStartsDrill', (data) => {
    const { lobbyId, caseId, teamsData } = data;
    console.log(`[SERVER] 教师 ${socket.id} 从大厅 ${lobbyId} 开始案例 ${caseId} 的推演`);
    if (global.activeLobbies && global.activeLobbies[lobbyId] && global.activeLobbies[lobbyId].caseId === caseId) {
        let lobbyTeams = teamsData; // 从 lobby.js 接收到的队伍数据

        // 【关键修改】：确保 'teacher_ops_team' 始终存在于服务器的 lobbyTeams 中
        // 这样教师端在 drill_main.html 中提交答案时才能找到自己的队伍
        const teacherTeamExists = lobbyTeams.some(team => team.id === 'teacher_ops_team');
        if (!teacherTeamExists) {
            const teacherOpsTeam = {id: 'teacher_ops_team', name: "教师演示", students: [], score: 0, answers: {}};
            lobbyTeams.push(teacherOpsTeam);
            console.log("[SERVER] Added 'teacher_ops_team' to lobby teams for consistency.");
        }

        global.activeLobbies[lobbyId].teams = lobbyTeams; // 更新服务器端的大厅队伍信息

        // 向该大厅内的所有客户端（包括学生）广播 'drillHasStarted' 事件
        io.to(lobbyId).emit('drillHasStarted', { caseId, lobbyId, teamsData: global.activeLobbies[lobbyId].teams }); 
        console.log(`[SERVER] 已向大厅 ${lobbyId} 广播 "drillHasStarted" 事件，包含更新后的团队数据`);
    } else {
        console.warn(`[SERVER] "teacherStartsDrill" 请求中大厅ID ${lobbyId} 或案例ID ${caseId} 无效`);
        socket.emit('startDrillFailed', { message: '无法开始推演，大厅或案例信息不匹配。'});
    }
  });

  // 教师请求进入下一阶段的事件
  socket.on('requestNextStage', async (data) => { 
    const { lobbyId, caseId, currentStageIndex, teamsDataSnapshot } = data; 
    console.log(`[SERVER] 教师 ${socket.id} 在大厅 ${lobbyId} 请求案例 ${caseId} 从阶段 ${currentStageIndex} 进入下一阶段`);

    if (global.activeLobbies && global.activeLobbies[lobbyId] && global.activeLobbies[lobbyId].caseId === caseId) {
        if (teamsDataSnapshot) { // 更新服务器端该大厅的队伍最新分数等信息
            global.activeLobbies[lobbyId].teams = teamsDataSnapshot;
            console.log(`[SERVER] 大厅 ${lobbyId} 队伍数据已根据教师端快照更新。`);
        }
        const nextStageIndex = parseInt(currentStageIndex, 10) + 1;
        // 向该大厅内的所有客户端广播 'advanceToStage' 事件
        io.to(lobbyId).emit('advanceToStage', { 
          lobbyId: lobbyId,
          caseId: caseId, 
          nextStageIndex: nextStageIndex 
        });
        console.log(`[SERVER] 已向大厅 ${lobbyId} 广播 advanceToStage 事件，目标阶段: ${nextStageIndex}`);
    } else {
        console.warn(`[SERVER] "requestNextStage" 请求中大厅ID ${lobbyId} 或案例ID ${caseId} 无效`);
        socket.emit('nextStageFailed', { message: '进入下一阶段失败，大厅或案例信息不匹配。'});
    }
  });

  // 学生提交阶段答案，并在后端计分
  socket.on('submitStageAnswers', async (data) => { 
    const { lobbyId, teamId, stageNumber, answers } = data; 
    console.log(`[SERVER] 收到团队 ${teamId} 在大厅 ${lobbyId} 提交阶段 ${stageNumber} 答案`);
    
    const lobby = global.activeLobbies[lobbyId];

    if (!lobby) {
      console.warn(`[SERVER] 提交答案失败: 大厅 ${lobbyId} 不存在。`);
      socket.emit('answerSubmissionFailed', { message: '大厅不存在。' });
      return;
    }

    const team = lobby.teams.find(t => t.id === teamId);
    if (!team) {
      console.warn(`[SERVER] 提交答案失败: 大厅 ${lobbyId} 中未找到团队 ${teamId}。`);
      socket.emit('answerSubmissionFailed', { message: '团队不存在于当前大厅。' });
      return;
    }

    // 更新团队的答案（确保 answers 对象结构正确，例如 { "s1-q0": ["option1"], "s1-q1": ["optionA", "optionB"] }）
    // 注意：这里使用 Object.assign 或扩展运算符来合并答案，而不是直接覆盖
    team.answers = { ...team.answers, ...answers }; 

    let stageScoreIncrement = 0; // 本阶段的分数增量，由后端计算

    try {
        // 从数据库获取完整的案例数据，以便获取正确答案
        const fullCase = await Case.findById(lobby.caseId);
        if (!fullCase) {
            console.error(`[SERVER] 计分失败: 未找到案例ID ${lobby.caseId} 的详细信息。`);
            socket.emit('answerSubmissionFailed', { message: '案例数据获取失败，无法计分。' });
            return;
        }

        const stageData = fullCase.stages.find(s => s.stageNumber === stageNumber);
        if (!stageData) {
            console.error(`[SERVER] 计分失败: 案例 ${lobby.caseId} 中未找到阶段 ${stageNumber} 的数据。`);
            socket.emit('answerSubmissionFailed', { message: '案例阶段数据不完整，无法计分。' });
            return;
        }

        // 遍历该阶段的问题，计算得分
        stageData.questions.forEach((question, qIndex) => {
            const questionKey = `s${stageNumber}-q${qIndex}`;
            // 获取客户端提交的答案
            const clientAnswers = answers[questionKey] || []; 

            let isCorrectForThisQuestion = false;

            if (question.answerOptions && question.answerOptions.length > 0) {
                // 过滤出正确选项的文本值
                const correctOptions = question.answerOptions
                                        .filter(opt => opt.isCorrect === true)
                                        .map(opt => opt.text.replace(/"/g, '&quot;').trim()); // 确保与客户端发送的value格式一致，并trim

                if (question.questionType === 'MultipleChoice-Multi') {
                    // 多选题：客户端提交的答案数量和内容必须与所有正确答案完全匹配
                    isCorrectForThisQuestion = clientAnswers.length === correctOptions.length &&
                                               correctOptions.every(co => clientAnswers.includes(co)) &&
                                               clientAnswers.every(ca => correctOptions.includes(ca));
                } else { // SingleChoice 或 Binary-Decision (如果答案选项有 isCorrect)
                    // 单选题：客户端提交的答案必须是唯一的正确答案
                    isCorrectForThisQuestion = clientAnswers.length === 1 && correctOptions.includes(clientAnswers[0]);
                }
            } else if (question.questionType === 'Binary-Decision' && question.correctAnswerData !== undefined) {
                // 对于二元决策题，如果答案选项没有 isCorrect 字段，但有 correctAnswerData
                const expectedValue = (question.correctAnswerData.decision || question.correctAnswerData.text || '').trim(); // 确保trim
                if (clientAnswers.length === 1 && clientAnswers[0] === expectedValue) {
                    isCorrectForThisQuestion = true;
                }
            }
            // TODO: 对于 Map-Placement 等复杂题型，需要在这里添加更复杂的评分逻辑

            if (isCorrectForThisQuestion) {
                stageScoreIncrement += (question.points || 10); // 如果问题没有指定分数，默认给10分
            }
        });

        // 更新团队的总分数
        team.score += stageScoreIncrement;
        
        console.log(`[SERVER] 团队 ${team.name} (ID: ${team.id}) 阶段 ${stageNumber} 答案已更新，分数增加 ${stageScoreIncrement}，当前总分 ${team.score}`);

        // 【重要】：向所有连接到该大厅的客户端广播队伍数据更新
        io.to(lobbyId).emit('teamsUpdated', lobby.teams); 
        console.log(`[SERVER] 大厅 ${lobbyId} 队伍数据已更新并广播。`);

        socket.emit('answerSubmissionSuccess', { message: '答案已接收，等待进入下一阶段。', scoreIncrement: stageScoreIncrement });

    } catch (error) {
        console.error(`[SERVER] 计分过程中发生错误 (大厅ID: ${lobbyId}, 团队ID: ${teamId}, 阶段: ${stageNumber}):`, error);
        socket.emit('answerSubmissionFailed', { message: `服务器计分失败: ${error.message}` });
    }
  });

  socket.on('disconnect', () => {
    console.log(`客户端已断开: ${socket.id}`);
    for (const lobbyId in global.activeLobbies) {
      if (global.activeLobbies[lobbyId].teacherSocketId === socket.id) {
        console.log(`教师 ${socket.id} 从大厅 ${lobbyId} 断开连接。`);
        // 可选：如果教师断开，可以考虑清理或标记大厅
        // delete global.activeLobbies[lobbyId];
        // io.to(lobbyId).emit('lobbyClosed', { message: '教师已离开，大厅已关闭。'});
        break;
      } else {
        // 从队伍中移除断开连接的学生 (如果需要)
        const lobby = global.activeLobbies[lobbyId];
        lobby.teams.forEach(team => {
            // 需要一种方式将 socket.id 与学生关联起来才能准确移除
            // 目前的结构没有直接关联，可以在学生加入时存储其 socket.id
        });
      }
    }
  });
});

const PORT = process.env.PORT || 7890;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已在端口 ${PORT} 上成功启动 (HTTP 和 WebSocket)`);
  const networkInterfaces = os.networkInterfaces();
  let serverLanIp = null;
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        serverLanIp = net.address;
        break;
      }
    }
    if (serverLanIp) break;
  }
  if (serverLanIp) {
    console.log(`请确保学生手机与教师电脑在同一局域网。`);
    console.log(`学生加入链接的基础URL将会是: http://${serverLanIp}:${PORT}`);
    process.env.SERVER_IP = serverLanIp; // 将检测到的IP存储到环境变量，供其他模块使用
  } else {
    console.warn('未能自动检测到局域网IP地址。请在 routes/lobbyRoutes.js 中手动配置 `YOUR_SERVER_LAN_IP_ADDRESS` 或确保 process.env.SERVER_IP 被正确设置。');
  }
  console.log('服务已就绪，等待连接...');
  // 清理旧的、可能未正常关闭的大厅 (可选，例如启动时清理超过一定时间未活动的)
  setInterval(() => {
    const now = new Date().getTime();
    for (const lobbyId in global.activeLobbies) {
        // 如果大厅没有教师在线，或者创建时间超过2小时
        if (!global.activeLobbies[lobbyId].teacherSocketId || (now - global.activeLobbies[lobbyId].createdAt.getTime() > 2 * 60 * 60 * 1000)) { 
            console.log(`[SERVER CLEANUP] 正在移除不活动或过时的大厅: ${lobbyId}`);
            delete global.activeLobbies[lobbyId];
        }
    }
  }, 60 * 60 * 1000); // 每小时检查一次
});
