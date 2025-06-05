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
import Case from './models/Case.js'; // Ensure Case model is imported

import authRoutes from './routes/authRoutes.js';
import caseRoutes from './routes/caseRoutes.js';
import lobbyRoutes from './routes/lobbyRoutes.js';

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

  socket.on('teacherJoinsLobby', (lobbyId) => {
    if (global.activeLobbies && global.activeLobbies[lobbyId]) {
      socket.join(lobbyId); // 教师加入以 lobbyId 命名的房间
      global.activeLobbies[lobbyId].teacherSocketId = socket.id;
      console.log(`教师 ${socket.id} 已加入大厅 ${lobbyId} (房间名)`);
      socket.emit('teamsUpdated', global.activeLobbies[lobbyId].teams);
    } else {
      socket.emit('lobbyError', { message: `大厅 ${lobbyId} 未找到或未初始化。` });
      console.warn(`[SERVER] 教师 ${socket.id} 尝试加入不存在或未初始化的大厅: ${lobbyId}`);
    }
  });

  // 【修改】学生加入大厅的逻辑
  socket.on('joinLobby', (data) => {
    const { caseId, teamName, studentName } = data; // 不再接收 lobbyId 从学生端
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
      const lobbyIdForStudent = targetLobby.lobbyId; // 这是服务器找到的 lobbyId
      let team = targetLobby.teams.find(t => t.name === teamName);
      if (!team) {
        team = { 
          id: uuidv4(),
          name: teamName, 
          students: [studentName],
          score: 0,
          answers: {}
        };
        targetLobby.teams.push(team);
      } else {
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

  socket.on('clientJoinsDrillRoom', (data) => {
      const { lobbyId } = data;
      if (global.activeLobbies && global.activeLobbies[lobbyId]) {
          socket.join(lobbyId);
          console.log(`[SERVER] Client ${socket.id} joined drill room for lobby ${lobbyId}`);
          // Optionally send current state if needed (e.g. current stage if student reconnects)
          // socket.emit('currentDrillState', { lobby: global.activeLobbies[lobbyId] });
      } else {
          console.warn(`[SERVER] Client ${socket.id} tried to join non-existent drill room for lobby ${lobbyId}`);
          // socket.emit('drillRoomError', { message: 'Drill room not found.' });
      }
  });

  socket.on('teacherStartsDrill', async (data) => { // Make it async
      const { lobbyId, caseId, teamsData } = data;
      console.log(`[SERVER] 教师 ${socket.id} 从大厅 ${lobbyId} 开始案例 ${caseId} 的推演`);
      
      const lobby = global.activeLobbies[lobbyId];
      if (lobby && lobby.caseId === caseId) {
          try {
              const caseDetails = await Case.findById(caseId).lean(); // Use .lean() for plain JS object
              if (!caseDetails) {
                  console.warn(`[SERVER] "teacherStartsDrill" - Case ${caseId} not found in DB.`);
                  socket.emit('startDrillFailed', { message: '无法开始推演，案例数据未找到。' });
                  return;
              }
              lobby.caseDetails = caseDetails; // Store full case details
              lobby.teams = teamsData; // Update teams data from teacher
              
              console.log(`[SERVER] Case ${caseId} details loaded into lobby ${lobbyId}.`);
              io.to(lobbyId).emit('drillHasStarted', { caseId, lobbyId, teamsData });
              console.log(`[SERVER] 已向大厅 ${lobbyId} 广播 "drillHasStarted" 事件`);
          } catch (error) {
              console.error(`[SERVER] "teacherStartsDrill" - Error fetching case ${caseId}:`, error);
              socket.emit('startDrillFailed', { message: '服务器获取案例数据失败。' });
          }
      } else {
          console.warn(`[SERVER] "teacherStartsDrill" 请求中大厅ID ${lobbyId} 或案例ID ${caseId} 无效`);
          socket.emit('startDrillFailed', { message: '无法开始推演，大厅或案例信息不匹配。' });
      }
  });
  
  socket.on('studentSubmitAnswer', (data) => {
      const { lobbyId, caseId, questionKey, answerData, teamId, stageNumber, questionIndex } = data;
      console.log(`[SERVER] Received studentSubmitAnswer from team ${teamId} for lobby ${lobbyId}, question ${questionKey}`);

      const lobby = global.activeLobbies[lobbyId];
      if (!lobby || !lobby.caseDetails || lobby.caseId !== caseId) {
          console.warn('[SERVER] studentSubmitAnswer: Invalid lobby or missing caseDetails.');
          // Optionally emit an error back to the student
          // socket.emit('answerSubmissionError', { questionKey, message: 'Lobby or case data not found on server.' });
          return;
      }

      const currentStageData = lobby.caseDetails.stages.find(s => s.stageNumber === stageNumber);
      if (!currentStageData || !currentStageData.questions || !currentStageData.questions[questionIndex]) {
          console.warn(`[SERVER] studentSubmitAnswer: Question not found for stage ${stageNumber}, questionIndex ${questionIndex}`);
          return;
      }
      
      const question = currentStageData.questions[questionIndex];
      let pointsAwarded = 0;
      let isCorrect = false;

      // Determine correct answers from question.answerOptions
      const correctOptions = (question.answerOptions || [])
          .filter(opt => opt.isCorrect === true)
          .map(opt => opt.text.replace(/"/g, '&quot;')); // Ensure consistent formatting with submitted values

      if (correctOptions.length > 0) {
          if (question.questionType === 'MultipleChoice-Multi') {
              isCorrect = answerData.length === correctOptions.length &&
                          correctOptions.every(co => answerData.includes(co)) &&
                          answerData.every(ta => correctOptions.includes(ta));
          } else if (answerData && answerData.length === 1) { // Single choice, Binary
              isCorrect = correctOptions.includes(answerData[0]);
          }
      }
      // Add more conditions for other question types like Map-Placement if needed, using question.correctAnswerData

      if (isCorrect) {
          pointsAwarded = question.points || 10; // Default to 10 points if not specified
      }

      const teamIndex = lobby.teams.findIndex(t => t.id === teamId);
      if (teamIndex !== -1) {
          // Update score - consider if answers can be re-submitted or if score is additive
          // For now, let's assume this is the first submission for this question by this team for simplicity
          // A more complex system would track submissions per question to prevent re-scoring.
          if (!lobby.teams[teamIndex].answers) {
              lobby.teams[teamIndex].answers = {};
          }
          // Store student's answer and if it was correct for this attempt
          lobby.teams[teamIndex].answers[questionKey] = {
              submitted: answerData,
              wasCorrect: isCorrect,
              awarded: pointsAwarded
          };

          // Only add points if this is a new correct answer or if rules allow re-scoring.
          // Simplistic: add points. A real system might check if already answered correctly.
          lobby.teams[teamIndex].score = (lobby.teams[teamIndex].score || 0) + pointsAwarded;
          
          console.log(`[SERVER] Team ${teamId} in lobby ${lobbyId} answered ${questionKey}. Correct: ${isCorrect}, Points: ${pointsAwarded}, New Score: ${lobby.teams[teamIndex].score}`);
          io.to(lobbyId).emit('scoresUpdated', lobby.teams);
      } else {
          console.warn(`[SERVER] studentSubmitAnswer: Team ID ${teamId} not found in lobby ${lobbyId}.`);
      }
  });

  // Rename this handler or make requestNextStage an alias
  socket.on('teacherRequestsNextStage', (data) => { // Renamed from requestNextStage
      const { lobbyId, caseId, currentStageIndex, teamsDataSnapshot } = data;
      console.log(`[SERVER] Teacher ${socket.id} in lobby ${lobbyId} requests next stage from ${currentStageIndex}`);

      const lobby = global.activeLobbies[lobbyId];
      if (lobby && lobby.caseId === caseId) {
          if (teamsDataSnapshot) { // Teacher might send their view of scores
              // Reconcile or simply update based on teacher's snapshot if that's the desired logic
              // For now, let's assume server scores are authoritative, but teacher snapshot can update student names if they changed.
              // lobby.teams = teamsDataSnapshot; // Or merge carefully
          }
          const nextStageIndex = parseInt(currentStageIndex, 10) + 1;
          
          // Check if nextStageIndex is valid based on lobby.caseDetails.stages
          if (lobby.caseDetails && nextStageIndex < lobby.caseDetails.stages.length) {
              io.to(lobbyId).emit('advanceToStage', {
                  lobbyId: lobbyId,
                  caseId: caseId,
                  nextStageIndex: nextStageIndex
              });
              console.log(`[SERVER] Broadcast advanceToStage to lobby ${lobbyId}, target stage: ${nextStageIndex}`);
          } else if (lobby.caseDetails && nextStageIndex >= lobby.caseDetails.stages.length) {
              // This means it was the last stage, teacher is effectively ending the drill by advancing past last stage
              console.log(`[SERVER] Teacher advanced past the last stage in lobby ${lobbyId}. Drill considered ended.`);
              io.to(lobbyId).emit('drillCompleted', { lobbyId, caseId, finalTeamsData: lobby.teams });
              // Optionally clean up the lobby here or wait for teacherEndsDrill event
          } else {
               console.warn(`[SERVER] teacherRequestsNextStage: Case details not available or invalid next stage index for lobby ${lobbyId}.`);
               socket.emit('nextStageFailed', { message: '无法进入下一阶段，案例阶段信息错误。' });
          }
      } else {
          console.warn(`[SERVER] "teacherRequestsNextStage" invalid lobby/case for lobby ${lobbyId}.`);
          socket.emit('nextStageFailed', { message: '进入下一阶段失败，大厅或案例信息不匹配。' });
      }
  });
  
  socket.on('teacherEndsDrill', (data) => {
      const { lobbyId } = data;
      console.log(`[SERVER] Teacher ${socket.id} explicitly ended drill for lobby ${lobbyId}`);
      const lobby = global.activeLobbies[lobbyId];
      if (lobby) {
          io.to(lobbyId).emit('drillCompleted', { lobbyId, caseId: lobby.caseId, finalTeamsData: lobby.teams });
          // Clean up the lobby
          delete global.activeLobbies[lobbyId];
          console.log(`[SERVER] Lobby ${lobbyId} removed after teacher ended drill.`);
      } else {
          console.warn(`[SERVER] teacherEndsDrill: Lobby ${lobbyId} not found.`);
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
    process.env.SERVER_IP = serverLanIp;
  } else {
    console.warn('未能自动检测到局域网IP地址。请在 routes/lobbyRoutes.js 中手动配置 `YOUR_SERVER_LAN_IP_ADDRESS` 或确保 process.env.SERVER_IP 被正确设置。');
  }
  console.log('服务已就绪，等待连接...');
  // 清理旧的、可能未正常关闭的大厅 (可选，例如启动时清理超过一定时间未活动的)
  setInterval(() => {
    const now = new Date().getTime();
    for (const lobbyId in global.activeLobbies) {
        if (!global.activeLobbies[lobbyId].teacherSocketId || (now - global.activeLobbies[lobbyId].createdAt.getTime() > 2 * 60 * 60 * 1000)) { // 例如超过2小时
            console.log(`[SERVER CLEANUP] 正在移除不活动或过时的大厅: ${lobbyId}`);
            delete global.activeLobbies[lobbyId];
        }
    }
  }, 60 * 60 * 1000); // 每小时检查一次
});
